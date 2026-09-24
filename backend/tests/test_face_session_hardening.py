"""
test_face_session_hardening.py -- private face bucket, selfie MIME allowlist,
expires_at enforced at read time, and the same-session retry route.

    cd backend && python -m pytest tests/test_face_session_hardening.py -q

No live stack, no real AWS: FakeDB harness (tests.test_storage_orchestrator)
+ direct route-function calls, same style as tests/test_face_search_limits.py
and tests/test_face_dead_letters.py. aws_service-touching calls (s3/bucket/
upload_bytes/make_thumbnail/is_valid_image) are monkeypatched per-test on the
`gallery_features` module object; face_queue.enqueue is monkeypatched where a
test needs to force (or skip) the inline run_search_job fallback.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
import types
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault("SUPABASE_DB_URL", "postgresql://user:pass@localhost:5432/testdb")
os.environ.setdefault("S3_BUCKET_FACE", "maja-face-private-2026")
os.environ.pop("REDIS_URL", None)  # force cache_backend's in-memory fallback

import pytest                                                # noqa: E402
from fastapi import HTTPException, UploadFile                # noqa: E402
from starlette.datastructures import Headers                 # noqa: E402

import gallery_features as gf                                 # noqa: E402
import face_queue                                              # noqa: E402
import media_storage                                           # noqa: E402
from tests.test_storage_orchestrator import FakeDB            # noqa: E402

FACE_BUCKET = media_storage.bucket_for("face")


# ---------------------------------------------------------------------------
# Shared test scaffolding (mirrors test_face_search_limits.py / test_face_dead_letters.py)
# ---------------------------------------------------------------------------
class FakeRequest:
    def __init__(self, ip="203.0.113.5"):
        self.client = types.SimpleNamespace(host=ip)
        self.headers = {}
        self.query_params = {}


class FakeS3:
    """Captures delete_object calls (Bucket, Key) for cleanup assertions."""
    def __init__(self):
        self.deleted = []

    def delete_object(self, Bucket, Key):
        self.deleted.append((Bucket, Key))


def _upload(filename="a.jpg", data=b"fake-selfie-bytes", content_type="image/jpeg") -> UploadFile:
    headers = Headers({"content-type": content_type}) if content_type else None
    return UploadFile(filename=filename, file=io.BytesIO(data), headers=headers)


def _route(router, path, method):
    return next(r for r in router.routes
                if getattr(r, "path", "") == path and method in (r.methods or []))


async def _fake_admin():
    return "admin-1"


async def _allow_all(key, limit, window_seconds):
    return True


async def _consent_ok(*a, **k):
    return True


async def _true_enqueue(job):
    return True


async def _make_profile(db, profile_id="w1", slug="w1-slug"):
    await db.profiles.insert_one({
        "id": profile_id, "slug": slug,
        "gallery_config": {"enabled": True, "face_search_enabled": True,
                           "aws_collection_id": f"maja_wedding_{profile_id}"},
    })


@contextlib.contextmanager
def _patched_gallery_env():
    """Stubs the rate limiter, consent check, and every selfie-processing call
    (thumbnail/decode/upload) so route logic runs without touching Redis,
    real Rekognition, or real S3. Yields the list of captured upload_bytes
    calls: [{"key", "bucket_name", "content_type", "tags"}, ...]."""
    orig = dict(rate_limit_allow=gf.rate_limit_allow, has_valid_consent=gf.has_valid_consent,
               make_thumbnail=gf.make_thumbnail, is_valid_image=gf.is_valid_image,
               upload_bytes=gf.upload_bytes)
    captured = []

    def _capture_upload(key, data, content_type, tags=None, bucket_name=None):
        captured.append({"key": key, "bucket_name": bucket_name,
                         "content_type": content_type, "tags": tags})
        return {"bucket": bucket_name, "key": key, "size": len(data)}

    gf.rate_limit_allow = _allow_all
    gf.has_valid_consent = _consent_ok
    gf.make_thumbnail = lambda data, **kw: data
    gf.is_valid_image = lambda data: True
    gf.upload_bytes = _capture_upload
    try:
        yield captured
    finally:
        for k, v in orig.items():
            setattr(gf, k, v)


async def _run_retry(db, slug, session_id, selfie=None, ip="203.0.113.5"):
    router = gf.build_gallery_router(db, _fake_admin)
    route = _route(router, "/api/public/gallery/{slug}/face-search/{session_id}/retry", "POST")
    return await route.endpoint(slug=slug, session_id=session_id,
                                request=FakeRequest(ip=ip), selfie=selfie or _upload())


# ---------------------------------------------------------------------------
# Pure helpers: _session_is_expired defensive parsing, _check_selfie_mime
# ---------------------------------------------------------------------------
def test_session_is_expired_defensive_parsing():
    now = gf._now()
    assert gf._session_is_expired({"expires_at": (now - timedelta(hours=1)).isoformat()}) is True
    assert gf._session_is_expired({"expires_at": (now + timedelta(hours=1)).isoformat()}) is False
    # garbled expires_at + recent created_at -> NOT expired (permissive, per spec)
    assert gf._session_is_expired({"expires_at": "not-a-date",
                                   "created_at": now.isoformat()}) is False
    # garbled expires_at + created_at > 24h old -> expired
    assert gf._session_is_expired({"expires_at": "not-a-date",
                                   "created_at": (now - timedelta(hours=25)).isoformat()}) is True
    # nothing parseable at all -> not expired
    assert gf._session_is_expired({}) is False


def test_check_selfie_mime_allowlist():
    gf._check_selfie_mime(_upload(content_type="image/jpeg"))  # does not raise
    gf._check_selfie_mime(_upload(content_type="image/png"))   # does not raise
    with pytest.raises(HTTPException) as exc:
        gf._check_selfie_mime(_upload(content_type="application/pdf"))
    assert exc.value.status_code == 415


def test_selfie_bucket_for_session_fallback():
    assert gf._selfie_bucket_for_session({"selfie_bucket": "explicit-bucket"}) == "explicit-bucket"
    orig_bucket = gf.bucket
    gf.bucket = lambda: "legacy-default-bucket"
    try:
        assert gf._selfie_bucket_for_session({}) == "legacy-default-bucket"
    finally:
        gf.bucket = orig_bucket


# ---------------------------------------------------------------------------
# expires_at enforced at read time (face-results + download-zip)
# ---------------------------------------------------------------------------
async def test_expired_session_blocks_face_results():
    db = FakeDB()
    await _make_profile(db)
    sid = "s-expired"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "done",
        "matched_photo_ids": [], "similarity_map": {},
        "created_at": (gf._now() - timedelta(hours=30)).isoformat(),
        "expires_at": (gf._now() - timedelta(hours=6)).isoformat(),
    })
    router = gf.build_gallery_router(db, _fake_admin)
    route = _route(router, "/api/public/gallery/{slug}/face-results", "GET")
    with pytest.raises(HTTPException) as exc:
        await route.endpoint(slug="w1-slug", session_id=sid, request=FakeRequest())
    assert exc.value.status_code == 410
    assert exc.value.detail == {"error": "session_expired"}


async def test_unexpired_session_still_returns_results():
    db = FakeDB()
    await _make_profile(db)
    sid = "s-fresh"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "done",
        "matched_photo_ids": [], "similarity_map": {},
        "created_at": gf._now().isoformat(),
        "expires_at": (gf._now() + timedelta(hours=20)).isoformat(),
    })
    router = gf.build_gallery_router(db, _fake_admin)
    route = _route(router, "/api/public/gallery/{slug}/face-results", "GET")
    result = await route.endpoint(slug="w1-slug", session_id=sid, request=FakeRequest())
    assert result["status"] == "done"


async def test_expired_session_blocks_download_zip():
    db = FakeDB()
    await _make_profile(db)
    sid = "s-expired-zip"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "done",
        "matched_photo_ids": ["p1"], "similarity_map": {"p1": 99.0},
        "created_at": (gf._now() - timedelta(hours=30)).isoformat(),
        "expires_at": (gf._now() - timedelta(hours=6)).isoformat(),
    })
    router = gf.build_gallery_router(db, _fake_admin)
    route = _route(router, "/api/public/gallery/{slug}/download-zip", "GET")
    with pytest.raises(HTTPException) as exc:
        await route.endpoint(slug="w1-slug", session_id=sid, request=FakeRequest())
    assert exc.value.status_code == 410
    assert exc.value.detail == {"error": "session_expired"}


# ---------------------------------------------------------------------------
# Retry route
# ---------------------------------------------------------------------------
async def test_retry_happy_path_resets_status_and_overwrites_selfie():
    db = FakeDB()
    await _make_profile(db)
    sid = "sess-retry-1"
    canonical_key = media_storage.face_selfie_key("w1", sid)
    original_expires_at = (gf._now() + timedelta(hours=20)).isoformat()
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "guest_ip": "203.0.113.5",
        "status": "failed", "error": "no_matches",
        "selfie_s3_key": canonical_key, "selfie_bucket": FACE_BUCKET,
        "selfie_hash": "old-hash", "matched_photo_ids": ["stale"],
        "similarity_map": {"stale": 1.0}, "retry_count": 0,
        "created_at": gf._now().isoformat(),
        "expires_at": original_expires_at,
    })

    orig_enqueue = face_queue.enqueue
    face_queue.enqueue = _true_enqueue
    try:
        with _patched_gallery_env() as uploads:
            result = await _run_retry(db, "w1-slug", sid)
    finally:
        face_queue.enqueue = orig_enqueue

    assert result == {"session_id": sid, "status": "queued"}
    # overwritten at the session's EXISTING key/bucket -- the private face
    # bucket + the canonical media_storage key, not a freshly minted one.
    assert len(uploads) == 1
    assert uploads[0]["key"] == canonical_key
    assert uploads[0]["bucket_name"] == FACE_BUCKET

    sess = await db.face_search_sessions.find_one({"id": sid})
    assert sess["status"] == "queued"
    assert sess["retry_count"] == 1
    assert sess["matched_photo_ids"] == []
    assert sess["similarity_map"] == {}
    assert sess["error"] is None
    assert sess["selfie_hash"] != "old-hash"
    assert sess.get("last_activity_at")
    # absolute 24h ceiling: retry must NOT push expires_at out
    assert sess["expires_at"] == original_expires_at


async def test_retry_on_queued_session_returns_409():
    db = FakeDB()
    await _make_profile(db)
    sid = "sess-queued"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "queued",
        "selfie_s3_key": media_storage.face_selfie_key("w1", sid), "selfie_bucket": FACE_BUCKET,
        "retry_count": 0, "created_at": gf._now().isoformat(),
        "expires_at": (gf._now() + timedelta(hours=20)).isoformat(),
    })
    with _patched_gallery_env():
        with pytest.raises(HTTPException) as exc:
            await _run_retry(db, "w1-slug", sid)
    assert exc.value.status_code == 409
    assert exc.value.detail == {"error": "search_in_progress"}


async def test_retry_cap_reached_returns_429():
    db = FakeDB()
    await _make_profile(db)
    sid = "sess-capped"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "done",
        "selfie_s3_key": media_storage.face_selfie_key("w1", sid), "selfie_bucket": FACE_BUCKET,
        "retry_count": gf.FACE_SESSION_MAX_RETRIES, "created_at": gf._now().isoformat(),
        "expires_at": (gf._now() + timedelta(hours=20)).isoformat(),
    })
    with _patched_gallery_env():
        with pytest.raises(HTTPException) as exc:
            await _run_retry(db, "w1-slug", sid)
    assert exc.value.status_code == 429
    assert exc.value.detail == {"error": "retry_limit_reached"}


async def test_retry_wrong_profile_session_is_404():
    """A session that belongs to a DIFFERENT profile than the slug resolves to
    must never be replayed -- 404, same as an unknown session id."""
    db = FakeDB()
    await _make_profile(db, profile_id="w1", slug="w1-slug")
    await _make_profile(db, profile_id="w2", slug="w2-slug")
    sid = "sess-belongs-to-w2"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w2", "status": "done",
        "selfie_s3_key": media_storage.face_selfie_key("w2", sid), "selfie_bucket": FACE_BUCKET,
        "retry_count": 0, "created_at": gf._now().isoformat(),
        "expires_at": (gf._now() + timedelta(hours=20)).isoformat(),
    })
    with _patched_gallery_env():
        with pytest.raises(HTTPException) as exc:
            await _run_retry(db, "w1-slug", sid)
    assert exc.value.status_code == 404


async def test_retry_expired_session_is_410():
    db = FakeDB()
    await _make_profile(db)
    sid = "sess-expired-retry"
    await db.face_search_sessions.insert_one({
        "id": sid, "profile_id": "w1", "status": "done",
        "selfie_s3_key": media_storage.face_selfie_key("w1", sid), "selfie_bucket": FACE_BUCKET,
        "retry_count": 0,
        "created_at": (gf._now() - timedelta(hours=30)).isoformat(),
        "expires_at": (gf._now() - timedelta(hours=6)).isoformat(),
    })
    with _patched_gallery_env():
        with pytest.raises(HTTPException) as exc:
            await _run_retry(db, "w1-slug", sid)
    assert exc.value.status_code == 410
    assert exc.value.detail == {"error": "session_expired"}


# ---------------------------------------------------------------------------
# cleanup_expired_selfies: legacy rows (no selfie_bucket) still clean up
# ---------------------------------------------------------------------------
async def test_cleanup_legacy_row_without_selfie_bucket_uses_default_bucket():
    db = FakeDB()
    fake_s3 = FakeS3()
    orig_s3, orig_bucket = gf.s3, gf.bucket
    gf.s3 = lambda: fake_s3
    gf.bucket = lambda: "legacy-default-bucket"
    await db.face_search_sessions.insert_one({
        "id": "legacy-1", "profile_id": "w1",
        "selfie_s3_key": "weddings/w1/selfies/legacy-1.jpg",  # no selfie_bucket -- pre-migration row
        "created_at": (gf._now() - timedelta(hours=30)).isoformat(),
    })
    # A new-style row (has selfie_bucket) in the same batch must use ITS OWN
    # bucket, not the legacy default -- proves the fallback is per-row, not global.
    await db.face_search_sessions.insert_one({
        "id": "new-1", "profile_id": "w1", "selfie_bucket": FACE_BUCKET,
        "selfie_s3_key": media_storage.face_selfie_key("w1", "new-1"),
        "created_at": (gf._now() - timedelta(hours=30)).isoformat(),
    })
    try:
        purged = await gf.cleanup_expired_selfies(db)
    finally:
        gf.s3, gf.bucket = orig_s3, orig_bucket

    assert purged == 2
    assert ("legacy-default-bucket", "weddings/w1/selfies/legacy-1.jpg") in fake_s3.deleted
    assert (FACE_BUCKET, media_storage.face_selfie_key("w1", "new-1")) in fake_s3.deleted
    assert await db.face_search_sessions.find_one({"id": "legacy-1"}) is None
    assert await db.face_search_sessions.find_one({"id": "new-1"}) is None
