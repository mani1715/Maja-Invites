"""
test_media_reconcile.py -- Lane A5: S3 reconciliation for the direct-S3
gallery path (face_search_sessions / gallery_photos) + the processing_status
listing surface.

    cd backend && python -m tests.test_media_reconcile

Uses the FakeDB harness (no live Postgres). face_queue.enqueue and the S3
head-check are monkeypatched so nothing touches real Redis/AWS.

find_one_and_update is not implemented on the shared FakeDB harness (nothing
needed it before this lane) -- added here, scoped to this test PROCESS only,
mirroring pg_adapter's real semantics (match-first, apply the update, return
the after-image; upsert builds a doc from the filter's equality keys). This
does not modify tests/test_storage_orchestrator.py.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

# Import the REAL modules (which import the real aws_service) BEFORE
# test_storage_orchestrator's `sys.modules.setdefault("aws_service", ...)`
# stub, or gallery_features's `from aws_service import s3, ...` breaks.
import media_reconcile as mr                                  # noqa: E402
import gallery_features as gf                                  # noqa: E402

from tests.test_storage_orchestrator import FakeDB, _Collection  # noqa: E402


async def _find_one_and_update(self, flt, update, *, return_document=False,
                                upsert=False, projection=None):
    for d in self.docs:
        if self._match(d, flt):
            self._apply(d, update)
            return dict(d)
    if upsert:
        nd = {k: v for k, v in (flt or {}).items()
              if not k.startswith("$") and not isinstance(v, dict)}
        self._apply(nd, update, is_insert=True)
        self.docs.append(nd)
        return dict(nd)
    return None


_Collection.find_one_and_update = _find_one_and_update

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


def _ago(**kw):
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat()


async def _fake_enqueue_factory():
    calls = []

    async def _enqueue(job):
        calls.append(job)
        return True
    return calls, _enqueue


# ---------------------------------------------------------------------------
async def test_stale_search_requeue_then_fail():
    """First stale pass requeues; a still-stuck session (never picked up by
    a worker) fails on the next pass. A fresh session and an already-done
    session are left untouched throughout."""
    db = FakeDB()
    await db.face_search_sessions.insert_one({
        "id": "s_stale", "profile_id": "w1", "status": "queued",
        "created_at": _ago(minutes=20),
    })
    await db.face_search_sessions.insert_one({
        "id": "s_fresh", "profile_id": "w1", "status": "queued",
        "created_at": _ago(minutes=1),
    })
    await db.face_search_sessions.insert_one({
        "id": "s_done", "profile_id": "w1", "status": "done",
        "created_at": _ago(minutes=30),
    })

    calls, fake_enqueue = await _fake_enqueue_factory()
    orig_enqueue = mr.face_queue.enqueue
    mr.face_queue.enqueue = fake_enqueue
    try:
        summary1 = await mr._reconcile_stale_searches(db, datetime.now(timezone.utc))
        summary2 = await mr._reconcile_stale_searches(db, datetime.now(timezone.utc))
    finally:
        mr.face_queue.enqueue = orig_enqueue

    ok("first pass requeues the one stale session", summary1["requeued"] == 1)
    ok("first pass fails nothing yet", summary1["failed"] == 0)
    ok("FACE_SEARCH re-enqueued for the stale session",
       calls and calls[0]["type"] == "FACE_SEARCH" and calls[0]["session_id"] == "s_stale")

    ok("second pass requeues nothing new", summary2["requeued"] == 0)
    ok("second pass fails the still-stuck session", summary2["failed"] == 1)
    ok("still only one FACE_SEARCH was ever enqueued (not re-requeued again)", len(calls) == 1)

    stale = await db.face_search_sessions.find_one({"id": "s_stale"})
    ok("stale session ends failed", stale["status"] == "failed")
    ok("stale session error message set", stale["error"] == "stale after requeue")

    fresh = await db.face_search_sessions.find_one({"id": "s_fresh"})
    ok("fresh session left alone", fresh["status"] == "queued" and "requeue_count" not in fresh)

    done = await db.face_search_sessions.find_one({"id": "s_done"})
    ok("done session left alone", done["status"] == "done")


# ---------------------------------------------------------------------------
async def test_unindexed_photo_reenqueued():
    db = FakeDB()
    await db.gallery_photos.insert_one({
        "id": "p_old", "profile_id": "w1", "indexed": False,
        "created_at": _ago(hours=2),
    })
    await db.gallery_photos.insert_one({
        "id": "p_recent", "profile_id": "w1", "indexed": False,
        "created_at": _ago(minutes=5),
    })
    await db.gallery_photos.insert_one({
        "id": "p_errored", "profile_id": "w1", "indexed": False,
        "index_error": "no_collection", "created_at": _ago(hours=3),
    })
    await db.gallery_photos.insert_one({
        "id": "p_done", "profile_id": "w1", "indexed": True,
        "created_at": _ago(hours=5),
    })

    calls, fake_enqueue = await _fake_enqueue_factory()
    orig_enqueue = mr.face_queue.enqueue
    mr.face_queue.enqueue = fake_enqueue
    try:
        summary = await mr._reconcile_unindexed_photos(db, datetime.now(timezone.utc))
    finally:
        mr.face_queue.enqueue = orig_enqueue

    ok("only the old, unindexed, error-free photo is reconciled", summary["reindexed"] == 1)
    ok("FACE_INDEX job enqueued with attempt reset to 0",
       calls == [{"type": "FACE_INDEX", "photo_id": "p_old", "profile_id": "w1", "attempt": 0}])

    old = await db.gallery_photos.find_one({"id": "p_old"})
    ok("needs_reindex flag set", old.get("needs_reindex") is True)
    recent = await db.gallery_photos.find_one({"id": "p_recent"})
    ok("recent unindexed photo untouched (not old enough yet)", not recent.get("needs_reindex"))
    errored = await db.gallery_photos.find_one({"id": "p_errored"})
    ok("errored photo untouched (index_error already present)", not errored.get("needs_reindex"))


# ---------------------------------------------------------------------------
async def test_missing_object_sampling_and_alert():
    db = FakeDB()
    await db.gallery_photos.insert_one({
        "id": "p_missing", "profile_id": "w1",
        "original_s3_key": "weddings/w1/photos/p_missing/original.jpg",
        "created_at": _ago(minutes=1),
    })
    await db.gallery_photos.insert_one({
        "id": "p_present", "profile_id": "w1",
        "original_s3_key": "weddings/w1/photos/p_present/original.jpg",
        "created_at": _ago(minutes=2),
    })

    class _FakeS3:
        def head_object(self, Bucket, Key):
            if "p_missing" in Key:
                raise Exception("404 Not Found")
            return {"ContentLength": 123}

    orig_s3 = mr.aws_service.s3
    mr.aws_service.s3 = lambda: _FakeS3()
    try:
        summary = await mr._reconcile_missing_objects(db)
    finally:
        mr.aws_service.s3 = orig_s3

    ok("one missing object detected", summary["missing"] == 1)
    missing_row = await db.gallery_photos.find_one({"id": "p_missing"})
    ok("missing row marked storage_status=missing", missing_row.get("storage_status") == "missing")
    present_row = await db.gallery_photos.find_one({"id": "p_present"})
    ok("present row untouched", "storage_status" not in present_row)

    alert_docs = db._cols.get("storage_alerts").docs if "storage_alerts" in db._cols else []
    ok("exactly one admin alert row written", len(alert_docs) == 1)
    ok("alert kind is gallery_photo_missing",
       alert_docs and alert_docs[0]["kind"] == "gallery_photo_missing")


# ---------------------------------------------------------------------------
async def test_heartbeat_written():
    db = FakeDB()
    await db.face_search_sessions.insert_one({
        "id": "s1", "profile_id": "w1", "status": "done", "created_at": _ago(minutes=1),
    })
    await db.gallery_photos.insert_one({
        "id": "p1", "profile_id": "w1", "indexed": True, "created_at": _ago(minutes=1),
    })

    async def _fake_enqueue(job):
        return True

    orig_enqueue = mr.face_queue.enqueue
    mr.face_queue.enqueue = _fake_enqueue
    try:
        await mr.run_media_reconcile(db)
    finally:
        mr.face_queue.enqueue = orig_enqueue

    hb = await db.job_heartbeats.find_one({"name": "media_reconcile"})
    ok("heartbeat row written for media_reconcile", hb is not None)
    ok("heartbeat carries a meta summary dict", isinstance((hb or {}).get("meta"), dict))


# ---------------------------------------------------------------------------
async def test_listing_exposes_processing_status():
    """The four processing_status branches, in the documented precedence
    order: indexed wins over index_error, which wins over storage_status."""
    db = FakeDB()
    await db.profiles.insert_one({"id": "w1", "slug": "w1-slug"})
    await db.gallery_photos.insert_one({
        "id": "p_ready", "profile_id": "w1", "indexed": True,
        "s3_key": "k", "thumb_s3_key": "t", "created_at": _ago(minutes=1),
    })
    await db.gallery_photos.insert_one({
        "id": "p_failed", "profile_id": "w1", "indexed": False, "index_error": "boom",
        "s3_key": "k", "thumb_s3_key": "t", "created_at": _ago(minutes=2),
    })
    await db.gallery_photos.insert_one({
        "id": "p_missing", "profile_id": "w1", "indexed": False, "storage_status": "missing",
        "s3_key": "k", "thumb_s3_key": "t", "created_at": _ago(minutes=3),
    })
    await db.gallery_photos.insert_one({
        "id": "p_indexing", "profile_id": "w1", "indexed": False,
        "s3_key": "k", "thumb_s3_key": "t", "created_at": _ago(minutes=4),
    })

    orig_sign = gf.generate_signed_url
    gf.generate_signed_url = lambda key, ttl=3600: f"https://signed/{key}"
    router = gf.build_gallery_router(db, lambda: None)
    route = next(r for r in router.routes
                if getattr(r, "path", "") == "/api/admin/profiles/{profile_id}/gallery/photos"
                and "GET" in (r.methods or []))
    try:
        result = await route.endpoint(profile_id="w1", admin_id="admin-1",
                                       event_invitation_id=None)
    finally:
        gf.generate_signed_url = orig_sign

    by_id = {p["id"]: p for p in result["photos"]}
    ok("ready photo -> processing_status ready", by_id["p_ready"]["processing_status"] == "ready")
    ok("failed photo -> processing_status failed", by_id["p_failed"]["processing_status"] == "failed")
    ok("missing photo -> processing_status missing", by_id["p_missing"]["processing_status"] == "missing")
    ok("plain unindexed photo -> processing_status indexing",
       by_id["p_indexing"]["processing_status"] == "indexing")


async def main():
    await test_stale_search_requeue_then_fail()
    await test_unindexed_photo_reenqueued()
    await test_missing_object_sampling_and_alert()
    await test_heartbeat_written()
    await test_listing_exposes_processing_status()
    print(f"\nMedia Reconcile (A5): {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
