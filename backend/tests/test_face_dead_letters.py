"""
test_face_dead_letters.py -- Lane L2: dead-letter handling + per-photo retry
(doc sec 30).

    cd backend && python -m tests.test_face_dead_letters

Uses the FakeDB harness (no live Postgres/Redis). face_queue.enqueue is
monkeypatched so nothing touches real Redis.

find_one_and_update is not implemented on the shared FakeDB harness -- added
here, scoped to this test PROCESS only, mirroring pg_adapter's real semantics
(match-first, apply the update, return the after-image). Same pattern as
tests/test_media_reconcile.py; does not modify tests/test_storage_orchestrator.py.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
# worker.py refuses to import without this (Postgres-only house rule); the
# Database it builds is `.lazy()` -- no real connection happens at import.
os.environ.setdefault("SUPABASE_DB_URL", "postgresql://fake-user:fake@localhost/fake")

from fastapi import HTTPException                              # noqa: E402

import worker                                                   # noqa: E402
import face_ops as fo                                           # noqa: E402
import face_queue                                                # noqa: E402

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


def _route(router, path, method):
    return next(r for r in router.routes
                if getattr(r, "path", "") == path and method in (r.methods or []))


ADMIN1 = {"admin_id": "admin-1", "role": "admin"}
ADMIN2 = {"admin_id": "admin-2", "role": "admin"}
SUPER = {"admin_id": "admin-9", "role": "super_admin"}


# ---------------------------------------------------------------------------
async def test_give_up_writes_dead_letter():
    db = FakeDB()
    orig_db = worker.db
    worker.db = db
    try:
        await db.gallery_photos.insert_one({"id": "p1", "profile_id": "w1", "indexed": False})
        job = {"type": "FACE_INDEX", "photo_id": "p1", "profile_id": "w1", "attempt": 4}
        await worker._give_up(job, 5, "rekognition timeout")
    finally:
        worker.db = orig_db

    photo = await db.gallery_photos.find_one({"id": "p1"})
    ok("existing give_up bookkeeping still runs (index_error set)",
       "giving_up after 5 attempts" in (photo.get("index_error") or ""))

    dl = await db.face_dead_letters.find_one({"photo_id": "p1"})
    ok("dead-letter row was written", dl is not None)
    ok("job_type recorded", dl["job_type"] == "FACE_INDEX")
    ok("full job payload recorded", dl["payload"] == job)
    ok("profile_id recorded", dl["profile_id"] == "w1")
    ok("attempts recorded", dl["attempts"] == 5)
    ok("error truncated/captured", "rekognition timeout" in dl["error"])
    ok("status starts dead", dl["status"] == "dead")
    ok("created_at set", bool(dl.get("created_at")))


async def test_give_up_dlq_failure_does_not_mask_original_path():
    """A DLQ insert_one failure must never break the existing give_up path."""
    db = FakeDB()
    orig_db = worker.db
    worker.db = db
    try:
        await db.gallery_photos.insert_one({"id": "p2", "profile_id": "w1", "indexed": False})

        async def _boom(doc):
            raise RuntimeError("db down")
        db.face_dead_letters.insert_one = _boom

        job = {"type": "FACE_INDEX", "photo_id": "p2", "profile_id": "w1", "attempt": 4}
        await worker._give_up(job, 5, "boom")  # must not raise
    finally:
        worker.db = orig_db

    photo = await db.gallery_photos.find_one({"id": "p2"})
    ok("original give_up bookkeeping survives a DLQ write failure",
       "giving_up after 5 attempts" in (photo.get("index_error") or ""))


# ---------------------------------------------------------------------------
async def test_retry_photo_enqueues_clears_error_marks_dlq_retried():
    db = FakeDB()
    router = fo.build_face_ops_router(db, lambda: None)
    await db.profiles.insert_one({"id": "w1", "admin_id": "admin-1"})
    await db.gallery_photos.insert_one({
        "id": "p1", "profile_id": "w1", "index_error": "boom", "indexed": False,
    })
    await db.face_dead_letters.insert_one({
        "id": "dl1", "photo_id": "p1", "profile_id": "w1", "status": "dead",
        "payload": {"type": "FACE_INDEX", "photo_id": "p1", "profile_id": "w1", "attempt": 5},
    })
    await db.face_dead_letters.insert_one({
        "id": "dl_other", "photo_id": "p_other", "profile_id": "w1", "status": "dead",
        "payload": {"type": "FACE_INDEX", "photo_id": "p_other", "profile_id": "w1", "attempt": 5},
    })

    calls = []

    async def _fake_enqueue(job):
        calls.append(job)
        return True

    orig_enqueue = face_queue.enqueue
    face_queue.enqueue = _fake_enqueue
    try:
        route = _route(router, "/api/admin/face-ops/retry-photo/{photo_id}", "POST")
        result = await route.endpoint(photo_id="p1", admin=ADMIN1)
    finally:
        face_queue.enqueue = orig_enqueue

    ok("retry-photo returns queued+photo_id", result == {"queued": True, "photo_id": "p1"})
    ok("FACE_INDEX re-enqueued with attempt reset to 0",
       calls == [{"type": "FACE_INDEX", "photo_id": "p1", "profile_id": "w1", "attempt": 0}])

    photo = await db.gallery_photos.find_one({"id": "p1"})
    ok("index_error cleared", not photo.get("index_error"))
    ok("needs_reindex flag set", photo.get("needs_reindex") is True)

    dl1 = await db.face_dead_letters.find_one({"id": "dl1"})
    ok("matching dead-letter row marked retried", dl1["status"] == "retried")
    dl_other = await db.face_dead_letters.find_one({"id": "dl_other"})
    ok("dead-letter row for a different photo left alone", dl_other["status"] == "dead")


# ---------------------------------------------------------------------------
async def test_requeue_cas_second_call_is_noop():
    db = FakeDB()
    router = fo.build_face_ops_router(db, lambda: None)
    await db.profiles.insert_one({"id": "w1", "admin_id": "admin-1"})
    await db.face_dead_letters.insert_one({
        "id": "dl2", "photo_id": "p9", "profile_id": "w1", "status": "dead",
        "payload": {"type": "FACE_INDEX", "photo_id": "p9", "profile_id": "w1", "attempt": 5},
    })

    calls = []

    async def _fake_enqueue(job):
        calls.append(job)
        return True

    orig_enqueue = face_queue.enqueue
    face_queue.enqueue = _fake_enqueue
    try:
        route = _route(router, "/api/admin/face-ops/dead-letters/{dl_id}/requeue", "POST")
        result = await route.endpoint(dl_id="dl2", admin=ADMIN1)
        ok("first requeue succeeds", result == {"queued": True, "dead_letter_id": "dl2"})
        ok("stored payload re-enqueued with attempt reset to 0",
           calls == [{"type": "FACE_INDEX", "photo_id": "p9", "profile_id": "w1", "attempt": 0}])

        dl = await db.face_dead_letters.find_one({"id": "dl2"})
        ok("row claimed to status=requeued", dl["status"] == "requeued")

        raised = None
        try:
            await route.endpoint(dl_id="dl2", admin=ADMIN1)
        except HTTPException as e:
            raised = e
        ok("second requeue on same row raises", raised is not None)
        ok("second requeue is 409", raised is not None and raised.status_code == 409)
        ok("second requeue body is {'already': 'requeued'}",
           raised is not None and raised.detail == {"already": "requeued"})
        ok("second requeue did not enqueue again", len(calls) == 1)
    finally:
        face_queue.enqueue = orig_enqueue


# ---------------------------------------------------------------------------
async def test_foreign_admin_gets_403_404():
    db = FakeDB()
    router = fo.build_face_ops_router(db, lambda: None)
    await db.profiles.insert_one({"id": "w1", "admin_id": "admin-1"})
    await db.gallery_photos.insert_one({"id": "p1", "profile_id": "w1"})
    await db.face_dead_letters.insert_one({
        "id": "dl1", "photo_id": "p1", "profile_id": "w1", "status": "dead",
        "payload": {"type": "FACE_INDEX", "photo_id": "p1", "profile_id": "w1", "attempt": 5},
    })

    retry_route = _route(router, "/api/admin/face-ops/retry-photo/{photo_id}", "POST")
    requeue_route = _route(router, "/api/admin/face-ops/dead-letters/{dl_id}/requeue", "POST")
    list_route = _route(router, "/api/admin/face-ops/dead-letters", "GET")

    async def _status(coro):
        try:
            await coro
            return None
        except HTTPException as e:
            return e.status_code

    ok("retry-photo: non-owner admin -> 403",
       await _status(retry_route.endpoint(photo_id="p1", admin=ADMIN2)) == 403)
    ok("retry-photo: unknown photo -> 404",
       await _status(retry_route.endpoint(photo_id="nope", admin=ADMIN1)) == 404)
    ok("requeue: non-owner admin -> 403",
       await _status(requeue_route.endpoint(dl_id="dl1", admin=ADMIN2)) == 403)
    ok("requeue: unknown dead-letter -> 404",
       await _status(requeue_route.endpoint(dl_id="nope", admin=ADMIN1)) == 404)
    ok("dead-letters list: non-owner admin -> 403",
       await _status(list_route.endpoint(profile_id="w1", admin=ADMIN2)) == 403)
    ok("dead-letters list: unknown profile -> 404",
       await _status(list_route.endpoint(profile_id="nope", admin=ADMIN1)) == 404)

    # owner and super_admin both succeed
    ok("owner can retry", await _status(retry_route.endpoint(photo_id="p1", admin=ADMIN1)) is None)
    await db.face_dead_letters.insert_one({
        "id": "dl2", "photo_id": "p1", "profile_id": "w1", "status": "dead",
        "payload": {"type": "FACE_INDEX", "photo_id": "p1", "profile_id": "w1", "attempt": 5},
    })
    ok("super_admin can requeue any profile's dead-letter",
       await _status(requeue_route.endpoint(dl_id="dl2", admin=SUPER)) is None)


# ---------------------------------------------------------------------------
async def test_dead_letters_list_scoped_and_newest_first():
    db = FakeDB()
    router = fo.build_face_ops_router(db, lambda: None)
    await db.profiles.insert_one({"id": "w1", "admin_id": "admin-1"})
    await db.profiles.insert_one({"id": "w2", "admin_id": "admin-2"})
    await db.face_dead_letters.insert_one({
        "id": "dl_old", "profile_id": "w1", "status": "dead", "created_at": "2026-01-01T00:00:00+00:00"})
    await db.face_dead_letters.insert_one({
        "id": "dl_new", "profile_id": "w1", "status": "dead", "created_at": "2026-06-01T00:00:00+00:00"})
    await db.face_dead_letters.insert_one({
        "id": "dl_other_profile", "profile_id": "w2", "status": "dead", "created_at": "2026-06-01T00:00:00+00:00"})

    list_route = _route(router, "/api/admin/face-ops/dead-letters", "GET")
    result = await list_route.endpoint(profile_id="w1", admin=ADMIN1)
    ids = [r["id"] for r in result["dead_letters"]]
    ok("only this profile's dead letters returned", ids == ["dl_new", "dl_old"])


async def main():
    await test_give_up_writes_dead_letter()
    await test_give_up_dlq_failure_does_not_mask_original_path()
    await test_retry_photo_enqueues_clears_error_marks_dlq_retried()
    await test_requeue_cas_second_call_is_noop()
    await test_foreign_admin_gets_403_404()
    await test_dead_letters_list_scoped_and_newest_first()
    print(f"\nFace Dead Letters (L2): {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
