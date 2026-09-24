"""Live-server suite for upload_sessions_service.py (direct-browser -> S3
upload SESSIONS: single presigned PUT for small files, S3 multipart for large
ones). Hits the running backend on :8001 over real HTTP with `requests` --
complements tests/test_upload_sessions_service.py, which covers the same
module against a FakeDB/FakeAWS in-process and cannot see auth-dependency
wiring, rate limiting, or the real Postgres adapter.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_media_sessions_live.py -q

ENVIRONMENT NOTE -- read before "fixing" a failure here: this dev stack has NO
AWS credentials configured at all in backend/.env (not even placeholders).
That is stronger than "no network": boto3's SigV4 presigner needs a key+secret
to compute the signature even for the local, no-network single-mode case, so
`aws_service.generate_presigned_put` raises NoCredentialsError with nothing
configured -- confirmed by calling it directly against this env. So *every*
successful create_session call, single-mode or multipart, reaches an S3 call
that throws here. Only the rejection paths that return before that call
(auth, mime/size caps, ownership resolution, quota, rate limit) are testable
live on this box. The isolation tests below seed a session row directly
through live_db() (bypassing the S3 call) rather than via a real create,
exactly the way tests/test_photographer_tiers.py seeds admins directly when
there is no HTTP path to the state a test needs.

HISTORICAL NOTE: this file used to document create_session's missing
try/except around the aws_service call as an open bug (it returned a bare 500
instead of a translated 502). That guard now exists -- upload_sessions_service
turns an S3-layer failure into `502 storage backend unavailable` -- so with no
credentials the happy-path test below fails with 502 rather than 500. It is
still an xfail here for the same underlying reason (no credentials on this
box), and still `strict=False`, so the day real credentials are configured it
XPASSes instead of erroring: that flip is the intended signal that the AWS
connection is live. See docs/AWS_CONNECTION.md and
`python scripts/aws_smoke_test.py --write` for the full live verification.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from tests.live import (
    UA_HEADER, create_wedding, delete_wedding, live_db, mint_admin_token, require_live,
)

import media_storage
import upload_sessions_service as svc

BASE_URL = require_live()
UA = dict(UA_HEADER)


def _auth(token: str) -> dict:
    return {**UA, "Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# fixture: two throwaway photographers, a profile A owns, one session row
# seeded directly for A (see module docstring for why it is not created live)
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def seeded():
    created: dict = {}

    async def _seed_admins():
        db = live_db()
        await db.ensure_connected()
        from auth import get_password_hash
        for label in ("a", "b"):
            admin_id = str(uuid.uuid4())
            await db.admins.insert_one({
                "id": admin_id,
                "email": f"media-sess-{label}-{admin_id[:8]}@maja.test",
                "password_hash": get_password_hash("dontcare"),
                "name": f"Media Session Test {label.upper()}",
                "role": "admin",
                "status": "ACTIVE",
                "phone_verified": True,
                "self_signup": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created[f"admin_{label}"] = admin_id
        await db.close()

    asyncio.run(_seed_admins())
    created["token_a"] = mint_admin_token(created["admin_a"])
    created["token_b"] = mint_admin_token(created["admin_b"])

    slug, profile_id = create_wedding(_auth(created["token_a"]))
    created["profile_a"] = profile_id
    created["slug_a"] = slug

    key = media_storage.build_key(
        "event", "image", "image/jpeg",
        photographer_id=created["admin_a"], event_id=profile_id)
    now = svc._now()
    sid = f"ms_{uuid.uuid4().hex[:20]}"
    session_row = {
        "id": sid,
        "photographer_id": created["admin_a"],
        "category": "event",
        "kind": "image",
        "event_id": profile_id,
        "invitation_id": None,
        "bucket": media_storage.bucket_for("event"),
        "object_key": key,
        "mime": "image/jpeg",
        "filename": "seed.jpg",
        "declared_bytes": 1024,
        "mode": "single",
        "multipart_upload_id": None,
        "status": "created",
        "error": None,
        "created_at": svc._iso(now),
        "last_activity_at": svc._iso(now),
        "expires_at": svc._iso(now + timedelta(hours=48)),
        "completed_at": None,
    }

    async def _insert_session():
        db = live_db()
        await db.ensure_connected()
        await db.media_upload_sessions.insert_one(session_row)
        await db.close()

    asyncio.run(_insert_session())
    created["session_a"] = sid
    created["session_a_key"] = key

    try:
        yield created
    finally:
        delete_wedding(_auth(created["token_a"]), created["profile_a"])

        async def _cleanup():
            db = live_db()
            await db.ensure_connected()
            ids = [created["admin_a"], created["admin_b"]]
            await db.media_upload_sessions.delete_many({"photographer_id": {"$in": ids}})
            await db.media_assets.delete_many({"photographer_id": {"$in": ids}})
            await db.admins.delete_one({"id": created["admin_a"]})
            await db.admins.delete_one({"id": created["admin_b"]})
            await db.close()

        asyncio.run(_cleanup())


# --------------------------------------------------------------------------- #
# 1. anonymous -> 401/403
# --------------------------------------------------------------------------- #
def test_anonymous_create_session_rejected():
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions", headers=UA, json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg", "size_bytes": 1024,
    }, timeout=20)
    assert r.status_code in (401, 403), r.text


# --------------------------------------------------------------------------- #
# 2. happy-path create -- xfail while this box has no AWS credentials: both
#    single-mode (SigV4 presign) and multipart create reach a real S3 call,
#    which fails and is translated to 502. strict=False, so this XPASSes the
#    moment credentials are configured -- that flip is the cheapest signal
#    that the AWS connection actually works end to end.
# --------------------------------------------------------------------------- #
@pytest.mark.xfail(reason="no AWS credentials on this box -> NoCredentialsError -> "
                          "502 from create_session; XPASSes once AWS is connected",
                   strict=False)
def test_owner_creates_single_mode_session_for_owned_profile(seeded):
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions",
                      headers=_auth(seeded["token_a"]), json={
        "category": "event", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1024, "event_id": seeded["profile_a"],
    }, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "single"
    assert body["session_id"]
    assert body["upload_url"] and body["key"] in body["upload_url"]
    assert body["key"].startswith(
        f"photographer/{seeded['admin_a']}/event/{seeded['profile_a']}/photos/")


# --------------------------------------------------------------------------- #
# 3. isolation -- B must never see or touch A's profile or A's session
# --------------------------------------------------------------------------- #
def test_isolation_cross_tenant_access_rejected(seeded):
    headers_b = _auth(seeded["token_b"])

    # B creates a session against A's profile -> 404 (ownership never leaks
    # via a 403 vs 404 distinction -- see _resolve_owned_event's docstring).
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions", headers=headers_b, json={
        "category": "event", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1024, "event_id": seeded["profile_a"],
    }, timeout=20)
    assert r.status_code == 404, f"create against a foreign profile: {r.status_code} {r.text}"

    sid = seeded["session_a"]

    # B reads A's session -> 404, not A's data.
    r = requests.get(f"{BASE_URL}/api/media/upload-sessions/{sid}", headers=headers_b, timeout=20)
    assert r.status_code == 404, f"GET on a foreign session: {r.status_code} {r.text}"

    # B completes A's session -> 404, not "409 already X" (i.e. B never learns
    # the session's real state).
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions/{sid}/complete",
                      headers=headers_b, json={}, timeout=20)
    assert r.status_code == 404, f"complete on a foreign session: {r.status_code} {r.text}"

    # B aborts A's session -> 404.
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions/{sid}/abort",
                      headers=headers_b, timeout=20)
    assert r.status_code == 404, f"abort on a foreign session: {r.status_code} {r.text}"

    # Sanity: A's session is untouched by B's attempts (still owned, still
    # "created" -- not flipped to "aborted" by the rejected call above).
    r = requests.get(f"{BASE_URL}/api/media/upload-sessions/{sid}",
                     headers=_auth(seeded["token_a"]), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "created"


# --------------------------------------------------------------------------- #
# 4. validation rejections -- all short-circuit before any S3 call, so all
#    fully live-testable regardless of the missing-credentials environment
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("overrides,expected_status", [
    ({"category": "portfolio", "kind": "image", "mime": "image/jpeg",
      "size_bytes": media_storage.MAX_BYTES_BY_KIND["image"] + 1}, 413),
    ({"category": "portfolio", "kind": "image", "mime": "application/x-msdownload",
      "size_bytes": 100}, 415),
    ({"category": "bogus", "kind": "image", "mime": "image/jpeg", "size_bytes": 100}, 415),
    ({"category": "event", "kind": "image", "mime": "image/jpeg", "size_bytes": 100}, 400),
], ids=["oversize_413", "unknown_mime_415", "bad_category_415", "missing_event_id_400"])
def test_create_session_validation_rejections(seeded, overrides, expected_status):
    r = requests.post(f"{BASE_URL}/api/media/upload-sessions",
                      headers=_auth(seeded["token_a"]), json=overrides, timeout=20)
    assert r.status_code == expected_status, r.text


# --------------------------------------------------------------------------- #
# 5. upload-locations: prefix-only, no S3 call -- fully live-testable
# --------------------------------------------------------------------------- #
def test_upload_locations_owner_ok(seeded):
    r = requests.get(f"{BASE_URL}/api/media/events/{seeded['profile_a']}/upload-locations",
                     headers=_auth(seeded["token_a"]), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prefix"] == f"photographer/{seeded['admin_a']}/event/{seeded['profile_a']}/"
    assert body["photos"] == body["prefix"] + "photos/"


def test_upload_locations_non_owner_404(seeded):
    r = requests.get(f"{BASE_URL}/api/media/events/{seeded['profile_a']}/upload-locations",
                     headers=_auth(seeded["token_b"]), timeout=20)
    assert r.status_code == 404, r.text


def test_upload_locations_anonymous_rejected(seeded):
    r = requests.get(f"{BASE_URL}/api/media/events/{seeded['profile_a']}/upload-locations",
                     headers=UA, timeout=20)
    assert r.status_code in (401, 403), r.text


# --------------------------------------------------------------------------- #
# 6. GET /api/media/assets -- 0 rows means no per-row generate_signed_url call,
#    so this is safe to hit live even without AWS credentials
# --------------------------------------------------------------------------- #
def test_list_assets_empty_for_fresh_admin(seeded):
    r = requests.get(f"{BASE_URL}/api/media/assets", headers=_auth(seeded["token_b"]), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == []


def test_list_assets_limit_too_high_422(seeded):
    r = requests.get(f"{BASE_URL}/api/media/assets", params={"limit": 500},
                     headers=_auth(seeded["token_a"]), timeout=20)
    assert r.status_code == 422, r.text


def test_list_assets_limit_negative_422(seeded):
    r = requests.get(f"{BASE_URL}/api/media/assets", params={"limit": -1},
                     headers=_auth(seeded["token_a"]), timeout=20)
    assert r.status_code == 422, r.text


# Item 7 (face-search session expiry) needs a real S3 selfie upload to reach
# an expired-session state -- out of scope on this AWS-credential-less stack;
# intentionally not stubbed here (see module docstring).
