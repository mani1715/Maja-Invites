"""Phase 6 + 13 — AI face-match EVENT ISOLATION and upload authorization.

A guest who reaches Event A's face-match must only ever touch Event A. The
server derives the Rekognition collection from the slug (never a client-supplied
id — see gallery_features._profile_collection_id), so there is nothing for a
guest to point at another event. These tests pin the authorization boundary at
the API:

  * face-search against an unknown / gallery-disabled event is refused, never
    silently searching some other event;
  * commit-upload refuses an S3 key outside THIS event's staging prefix
    (path-traversal / S3-key authorization — never trust a client key);
  * presign/commit across tenants is refused (a photographer cannot upload into
    another studio's event);
  * a spoofed-MIME or oversized selfie is refused before any search runs.

Live suite. Owner A = seeded dev photographer; attacker B = a minted token that
owns nothing. Gallery is enabled directly in the DB where needed (enabling it
live calls Rekognition CreateCollection, which needs AWS creds this box may not
have — the isolation logic under test does not).
"""
from __future__ import annotations

import asyncio
import base64
import uuid

import pytest
import requests

from tests.live import (require_live, login, create_wedding, delete_wedding,
                        mint_admin_token, live_db, UA_HEADER)

BASE_URL = require_live()

OWNER_EMAIL = "admin@wedding.com"
OWNER_PASS = "admin123"


def _h(tok):
    return {**UA_HEADER, "Authorization": f"Bearer {tok}"}


def _jh(tok):
    return {**_h(tok), "Content-Type": "application/json"}


def _tiny_png() -> bytes:
    # 1x1 PNG — structurally valid so we exercise authorization, not decoding.
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==")


async def _enable_gallery(pid: str) -> None:
    db = live_db()
    await db.ensure_connected()
    prof = await db.profiles.find_one({"id": pid}, {"_id": 0})
    gc = {**(prof.get("gallery_config") or {}), "enabled": True,
          "aws_collection_id": f"maja_wedding_{pid}"}
    await db.profiles.update_one({"id": pid}, {"$set": {"gallery_config": gc}})
    await db.close()


def _consent(slug: str, xff: str) -> None:
    requests.post(f"{BASE_URL}/api/public/gallery/{slug}/face-consent",
                  json={"agreed": True},
                  headers={**UA_HEADER, "Content-Type": "application/json",
                           "X-Forwarded-For": xff, "X-Real-IP": xff}, timeout=15)


@pytest.fixture(scope="module")
def owner():
    tok = login(OWNER_EMAIL, OWNER_PASS)
    slug, pid = create_wedding(_h(tok))
    yield tok, slug, pid
    delete_wedding(_h(tok), pid)


@pytest.fixture(scope="module")
def attacker() -> str:
    return mint_admin_token(f"iso_attacker_{uuid.uuid4().hex[:8]}", role="admin")


# ---- face-search isolation ------------------------------------------------
def test_face_search_unknown_event_404():
    files = {"selfie": ("s.png", _tiny_png(), "image/png")}
    r = requests.post(
        f"{BASE_URL}/api/public/gallery/no-such-event-{uuid.uuid4().hex[:8]}/face-search",
        files=files, headers=UA_HEADER, timeout=20)
    assert r.status_code == 404, r.text


def test_face_search_disabled_gallery_refused(owner):
    """Gallery OFF → 400 before any search. Each event is gated by its OWN
    config; you cannot search an event that has not enabled face-match."""
    _, slug, _ = owner
    files = {"selfie": ("s.png", _tiny_png(), "image/png")}
    r = requests.post(f"{BASE_URL}/api/public/gallery/{slug}/face-search",
                      files=files, headers=UA_HEADER, timeout=20)
    assert r.status_code == 400, r.text


# ---- upload authorization (Phase 13) --------------------------------------
def test_commit_upload_rejects_foreign_key(owner):
    """Path-traversal / S3-key authorization: commit-upload only accepts a key
    inside THIS event's staging prefix — never a client-supplied key that points
    at another event's storage."""
    tok, _, pid = owner
    asyncio.run(_enable_gallery(pid))
    foreign_key = f"weddings/{uuid.uuid4()}/staging/{uuid.uuid4()}.jpg"
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/commit-upload",
                      json={"s3_key": foreign_key}, headers=_jh(tok), timeout=20)
    # The guard rejects a key outside this profile's staging prefix with 403
    # ("Key does not belong to this profile").
    assert r.status_code in (400, 403), f"foreign key accepted: {r.status_code} {r.text[:200]}"


def test_commit_upload_cross_tenant_forbidden(owner, attacker):
    _, _, pid = owner
    key = f"weddings/{pid}/staging/{uuid.uuid4()}.jpg"
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/commit-upload",
                      json={"s3_key": key}, headers=_jh(attacker), timeout=20)
    assert r.status_code in (403, 404), r.text


def test_presign_cross_tenant_forbidden(owner, attacker):
    _, _, pid = owner
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/presign-upload",
                      json={"filename": "x.jpg", "content_type": "image/jpeg", "size_bytes": 1000},
                      headers=_jh(attacker), timeout=20)
    assert r.status_code in (403, 404), r.text


# ---- selfie input hardening (Phase 13) ------------------------------------
def test_face_search_rejects_non_image(owner):
    """MIME spoof: a non-image selfie is refused before any search."""
    _, slug, pid = owner
    asyncio.run(_enable_gallery(pid))
    xff = f"198.51.100.{uuid.uuid4().int % 250 + 1}"
    _consent(slug, xff)
    files = {"selfie": ("evil.txt", b"not an image at all", "text/plain")}
    r = requests.post(f"{BASE_URL}/api/public/gallery/{slug}/face-search",
                      files=files,
                      headers={**UA_HEADER, "X-Forwarded-For": xff, "X-Real-IP": xff}, timeout=20)
    if r.status_code == 428:
        pytest.skip("consent gate did not accept XFF-keyed consent on this env")
    assert r.status_code in (400, 415), f"non-image accepted: {r.status_code} {r.text[:200]}"


def test_face_search_rejects_oversized(owner):
    """Oversized selfie → 413, before any search."""
    _, slug, pid = owner
    asyncio.run(_enable_gallery(pid))
    xff = f"198.51.100.{uuid.uuid4().int % 250 + 1}"
    _consent(slug, xff)
    big = b"\xff\xd8\xff" + b"0" * (21 * 1024 * 1024)  # ~21 MB
    files = {"selfie": ("big.jpg", big, "image/jpeg")}
    r = requests.post(f"{BASE_URL}/api/public/gallery/{slug}/face-search",
                      files=files,
                      headers={**UA_HEADER, "X-Forwarded-For": xff, "X-Real-IP": xff}, timeout=60)
    if r.status_code == 428:
        pytest.skip("consent gate did not accept XFF-keyed consent on this env")
    assert r.status_code == 413, f"oversized accepted: {r.status_code} {r.text[:200]}"
