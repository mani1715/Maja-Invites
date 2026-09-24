"""
test_face_search_limits.py -- Lane A4: face-search rate limiting, consent
withdrawal deletion, and the expiry-sweep leader lock.

    cd backend && python -m tests.test_face_search_limits

Uses the FakeDB harness (no live Postgres). Redis-backed helpers
(rate_limit_allow / acquire_lock) and S3 are monkeypatched so nothing touches
real Redis/AWS; kv_get_json/kv_set_json/kv_del run for real against
cache_backend's in-memory fallback (REDIS_URL is unset here) so the cache
purge is verified end-to-end rather than just "was it called".
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
# server.py (imported lazily, only for the sweep-leader-lock test) requires
# this to be set at import time -- it never actually connects (pool connects
# in the FastAPI startup hook), so a placeholder DSN is enough.
os.environ.setdefault("SUPABASE_DB_URL", "postgresql://user:pass@localhost:5432/testdb")
os.environ.pop("REDIS_URL", None)  # force cache_backend's in-memory fallback

from fastapi import UploadFile, HTTPException              # noqa: E402

import gallery_features as gf                               # noqa: E402
import face_consent as fc                                   # noqa: E402
import cache_backend                                         # noqa: E402
from tests.test_storage_orchestrator import FakeDB          # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


class FakeRequest:
    def __init__(self, ip="203.0.113.5"):
        self.client = types.SimpleNamespace(host=ip)
        self.headers = {}
        self.query_params = {}


def _upload(filename="a.jpg", data=b"not-a-real-image") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(data))


def _route(router, path, method):
    return next(r for r in router.routes
                if getattr(r, "path", "") == path and method in (r.methods or []))


async def _fake_admin():
    return "admin-1"


# ---------------------------------------------------------------------------
async def test_rate_limit():
    """Per-guest and per-event limiter denials both raise 429/RATE_LIMITED
    with Retry-After; an allowed request sails past the limiter check."""
    db = FakeDB()
    await db.profiles.insert_one({
        "id": "w1", "slug": "w1-slug",
        "gallery_config": {"enabled": True, "face_search_enabled": True},
    })

    async def _consent_ok(*a, **k):
        return True

    orig_consent = gf.has_valid_consent
    gf.has_valid_consent = _consent_ok
    router = gf.build_gallery_router(db, _fake_admin)
    route = _route(router, "/api/public/gallery/{slug}/face-search", "POST")

    async def _call():
        return await route.endpoint(slug="w1-slug", request=FakeRequest(), selfie=_upload())

    try:
        # --- per-IP limiter denies
        async def _deny_ip(key, limit, window_seconds):
            return not key.startswith("face_search:ip:")
        gf.rate_limit_allow = _deny_ip
        try:
            await _call()
            ok("per-IP limiter denial raises", False)
        except HTTPException as e:
            ok("per-IP limiter denial -> 429", e.status_code == 429)
            ok("per-IP limiter denial -> code RATE_LIMITED", e.detail.get("code") == "RATE_LIMITED")
            ok("per-IP limiter denial -> Retry-After 3600", (e.headers or {}).get("Retry-After") == "3600")

        # --- per-event limiter denies (IP limiter allows)
        async def _deny_event(key, limit, window_seconds):
            return not key.startswith("face_search:profile:")
        gf.rate_limit_allow = _deny_event
        try:
            await _call()
            ok("per-event limiter denial raises", False)
        except HTTPException as e:
            ok("per-event limiter denial -> 429", e.status_code == 429)
            ok("per-event limiter denial -> code RATE_LIMITED", e.detail.get("code") == "RATE_LIMITED")
            ok("per-event limiter denial -> Retry-After 3600", (e.headers or {}).get("Retry-After") == "3600")

        # --- both limiters allow -> request proceeds past the limiter (fails
        # later, on image validation, not on a 429)
        async def _allow_all(key, limit, window_seconds):
            return True
        gf.rate_limit_allow = _allow_all
        try:
            await _call()
            ok("allowed request does not raise", False)
        except HTTPException as e:
            ok("allowed request is not blocked by the limiter (fails later, at image validation)",
               e.status_code != 429)
    finally:
        gf.has_valid_consent = orig_consent
        gf.rate_limit_allow = cache_backend.rate_limit_allow


# ---------------------------------------------------------------------------
async def test_withdrawal_purge():
    """Withdrawing consent purges the withdrawing guest's own selfie S3
    objects, session rows, and match-cache entries -- and leaves another
    guest's rows/cache alone."""
    db = FakeDB()
    await db.profiles.insert_one({"id": "w1", "slug": "w1-slug"})

    guest_ip = "203.0.113.5"
    other_ip = "203.0.113.9"
    ip_hash = fc.compute_ip_hash(guest_ip)

    await db.face_consent.insert_one({
        "id": "c1", "profile_id": "w1", "ip_hash": ip_hash, "agreed": True,
        "created_at": "2026-08-01T00:00:00+00:00",
    })
    await db.face_search_sessions.insert_one({
        "id": "s1", "profile_id": "w1", "guest_ip": guest_ip,
        "selfie_s3_key": "weddings/w1/selfies/s1.jpg", "selfie_hash": "hash1",
    })
    await db.face_search_sessions.insert_one({
        "id": "s2", "profile_id": "w1", "guest_ip": guest_ip,
        "selfie_s3_key": "weddings/w1/selfies/s2.jpg", "selfie_hash": "hash2",
    })
    await db.face_search_sessions.insert_one({
        "id": "s3", "profile_id": "w1", "guest_ip": other_ip,
        "selfie_s3_key": "weddings/w1/selfies/s3.jpg", "selfie_hash": "hash3",
    })
    for h in ("hash1", "hash2", "hash3"):
        await cache_backend.kv_set_json(f"fm:w1:{h}", {"matched_photo_ids": []}, ttl_seconds=86400)

    deleted_keys = []

    class _FakeS3:
        def delete_object(self, Bucket, Key):
            deleted_keys.append(Key)

    orig_s3, orig_bucket = fc.s3, fc.bucket
    fc.s3 = lambda: _FakeS3()
    fc.bucket = lambda: "test-bucket"

    router = fc.build_face_consent_router(db)
    route = _route(router, "/api/public/gallery/{slug}/face-consent/withdraw", "POST")
    try:
        result = await route.endpoint(slug="w1-slug", request=FakeRequest(ip=guest_ip))
    finally:
        fc.s3, fc.bucket = orig_s3, orig_bucket

    ok("withdraw returns ok", result.get("ok") is True)
    ok("withdraw reports 2 purged sessions", result.get("purged_sessions") == 2)
    ok("both of the guest's selfie S3 keys deleted",
       set(deleted_keys) == {"weddings/w1/selfies/s1.jpg", "weddings/w1/selfies/s2.jpg"})

    remaining = await db.face_search_sessions.find({"profile_id": "w1"}).to_list(10)
    remaining_ids = {r["id"] for r in remaining}
    ok("withdrawing guest's session rows deleted", {"s1", "s2"}.isdisjoint(remaining_ids))
    ok("other guest's session row untouched", "s3" in remaining_ids)

    ok("withdrawing guest's cache entry (hash1) purged",
       await cache_backend.kv_get_json("fm:w1:hash1") is None)
    ok("withdrawing guest's cache entry (hash2) purged",
       await cache_backend.kv_get_json("fm:w1:hash2") is None)
    ok("other guest's cache entry (hash3) left alone",
       await cache_backend.kv_get_json("fm:w1:hash3") is not None)

    consent = await db.face_consent.find_one({"id": "c1"})
    ok("consent record marked withdrawn", bool(consent.get("withdrawn_at")))


# ---------------------------------------------------------------------------
async def test_sweep_leader_lock():
    """server._expiry_sweep_loop skips the sweep body when it doesn't win the
    leader lock, and runs it when it does."""
    try:
        import server
    except Exception as e:
        FAIL.append(f"sweep leader lock: could not import server.py ({type(e).__name__}: {e})")
        print(f"  FAIL  sweep leader lock: server.py import failed -- {e}")
        return

    orig_once, orig_lock = server._expiry_sweep_once, server._acquire_lock
    orig_interval = os.environ.get("EXPIRY_SWEEP_INTERVAL_SECONDS")
    os.environ["EXPIRY_SWEEP_INTERVAL_SECONDS"] = "0"

    async def _run_one_pass():
        task = asyncio.create_task(server._expiry_sweep_loop())
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    try:
        # --- lock denied -> body skipped, but the lock is checked with the
        # documented key
        seen_keys = []
        calls = {"once": 0}

        async def _fake_once_a():
            calls["once"] += 1
            return {}

        async def _deny_lock(key, ttl_seconds):
            seen_keys.append(key)
            return False

        server._expiry_sweep_once = _fake_once_a
        server._acquire_lock = _deny_lock
        await _run_one_pass()
        ok("lock checked under key 'expiry_sweep_leader'",
           seen_keys and seen_keys[0] == "expiry_sweep_leader")
        ok("sweep body skipped when lock not acquired", calls["once"] == 0)

        # --- lock granted -> body runs
        calls2 = {"once": 0}

        async def _fake_once_b():
            calls2["once"] += 1
            return {}

        async def _grant_lock(key, ttl_seconds):
            return True

        server._expiry_sweep_once = _fake_once_b
        server._acquire_lock = _grant_lock
        await _run_one_pass()
        ok("sweep body runs when lock acquired", calls2["once"] >= 1)
    finally:
        server._expiry_sweep_once = orig_once
        server._acquire_lock = orig_lock
        if orig_interval is None:
            os.environ.pop("EXPIRY_SWEEP_INTERVAL_SECONDS", None)
        else:
            os.environ["EXPIRY_SWEEP_INTERVAL_SECONDS"] = orig_interval


async def main():
    await test_rate_limit()
    await test_withdrawal_purge()
    await test_sweep_leader_lock()
    print(f"\nFace Search Limits (A4): {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
