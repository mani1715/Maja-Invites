"""
Self-test for the upload-intents write-ahead sweep.

    cd backend && PYTHONIOENCODING=utf-8 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m pytest tests/test_upload_intents_sweep.py -q

storage_upload.py's presign() writes a `db.upload_intents` row (status
"pending") before handing back a presigned POST -- the only DB trace of a key
that was ever promised to a browser, since commit() is what would otherwise be
the sole writer. media_reconcile._sweep_upload_intents reaps whatever never
gets committed. Covers BOTH halves:

  PRESIGN/COMMIT (storage_upload.py, via FastAPI TestClient + FakeS3)
   1. presign() inserts the pending intent, keyed by the signed key.
   2. commit() CASes that intent pending -> committed.

  SWEEP (media_reconcile._sweep_upload_intents, via FakeDB + fake
  aws_service.head_object/delete_object -- both plain sync functions, called
  through asyncio.to_thread exactly like the real ones)
   3. pending + stale + object exists on S3 -> deleted, marked expired.
   4. pending + stale + object missing -> expired, no delete call.
   5. pending + fresh -> left alone (cursor cutoff excludes it).
   6. committed -> left alone (already closed, not selected).
   7. CAS race (find_one_and_update loses the claim) -> skipped, S3 untouched.
   8. S3 error -> bounced back to "pending", sweep_attempts incremented.
   9. attempts exhausted -> marked "failed".
  10. terminal-row purge -- only committed/expired/failed rows older than the
      purge window are removed; fresh terminal rows and pending rows survive.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

# Import the REAL media_reconcile (and the aws_service it pulls in at module
# scope) BEFORE anything stubs aws_service, same ordering rule documented in
# test_media_reconcile.py -- mr.aws_service then always refers to a real,
# mutable module object we can monkeypatch two functions on and restore.
import media_reconcile as mr                                   # noqa: E402

from tests.test_storage_orchestrator import FakeDB              # noqa: E402

from fastapi import FastAPI                                     # noqa: E402
from fastapi.testclient import TestClient                       # noqa: E402


def _ago(**kw):
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat()


# --------------------------------------------------------------------------- #
# PRESIGN / COMMIT -- storage_upload.py through its real router
# --------------------------------------------------------------------------- #
ADMIN = "ph_studio_one"


class FakeS3Client:
    """boto3-shaped -- only what storage_upload.py's aws_service.s3() calls."""

    def __init__(self):
        self.objects = {}
        self.deleted = []

    def generate_presigned_post(self, Bucket, Key, Fields, Conditions, ExpiresIn):
        return {"url": f"https://{Bucket}.s3.amazonaws.com/",
                "fields": {**Fields, "key": Key, "policy": "x", "signature": "y"}}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise RuntimeError("404")
        return self.objects[Key]

    def copy_object(self, Bucket, CopySource, Key):
        src_key = CopySource.get("Key") if isinstance(CopySource, dict) else CopySource
        if src_key in self.objects:
            self.objects[Key] = dict(self.objects[src_key])

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        self.objects.pop(Key, None)


def _upload_app(db, s3_client):
    """storage_upload.py does `import aws_service` LAZILY inside presign()/
    commit(), so installing the fake into sys.modules before the request is
    enough -- no reload needed (mirrors test_storage_upload.py's _app())."""
    fake_aws = types.ModuleType("aws_service")
    fake_aws.bucket = lambda: "maja-media"
    fake_aws.s3 = lambda: s3_client
    sys.modules["aws_service"] = fake_aws

    import storage_upload
    app = FastAPI()
    app.include_router(storage_upload.build_storage_upload_router(db, lambda: ADMIN))
    return app


def test_presign_writes_pending_intent():
    db, s3c = FakeDB(), FakeS3Client()
    client = TestClient(_upload_app(db, s3c))

    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg", "size_bytes": 1024})
    assert r.status_code == 200, r.text
    key = r.json()["key"]

    intent = asyncio.run(db.upload_intents.find_one({"key": key}))
    assert intent is not None, "presign() must write a write-ahead intent row"
    assert intent["status"] == "pending"
    assert intent["area"] == "portfolio"
    assert intent["admin_id"] == ADMIN
    assert intent["bucket"] == "maja-media"
    assert intent["key"] == key
    assert intent.get("created_at")


def test_commit_flips_intent_to_committed():
    db, s3c = FakeDB(), FakeS3Client()
    client = TestClient(_upload_app(db, s3c))

    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg", "size_bytes": 1024})
    key = r.json()["key"]
    s3c.objects[key] = {"ContentLength": 1024, "ContentType": "image/jpeg"}

    r2 = client.post("/api/uploads/commit", json={"key": key, "area": "portfolio"})
    assert r2.status_code == 200, r2.text

    intent = asyncio.run(db.upload_intents.find_one({"key": key}))
    assert intent["status"] == "committed"
    assert intent.get("committed_at")


# --------------------------------------------------------------------------- #
# SWEEP -- media_reconcile._sweep_upload_intents
# --------------------------------------------------------------------------- #
def _patch_aws(head=None, delete=None):
    """Swap mr.aws_service.head_object/delete_object for plain sync fakes
    (asyncio.to_thread expects a blocking callable, not a coroutine function --
    same shape as the real aws_service.head_object/delete_object). Returns the
    originals so the caller can restore them."""
    orig = (mr.aws_service.head_object, mr.aws_service.delete_object)
    if head is not None:
        mr.aws_service.head_object = head
    if delete is not None:
        mr.aws_service.delete_object = delete
    return orig


def _unpatch_aws(orig):
    mr.aws_service.head_object, mr.aws_service.delete_object = orig


async def test_sweep_deletes_orphan_when_object_exists():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_exists", "area": "portfolio", "admin_id": "ph1",
        "key": "portfolios/ph1/works/exists.jpg", "bucket": "maja-media",
        "status": "pending", "created_at": _ago(hours=25),
    })
    deletes = []
    orig = _patch_aws(
        head=lambda key, bucket_name=None: {"size": 10, "etag": "x", "content_type": "image/jpeg"},
        delete=lambda key, bucket_name=None: deletes.append((key, bucket_name)) or True)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["reaped"] == 1
    assert deletes == [("portfolios/ph1/works/exists.jpg", "maja-media")]
    row = await db.upload_intents.find_one({"id": "i_exists"})
    assert row["status"] == "expired"
    assert row["existed"] is True
    assert row.get("reaped_at")


async def test_sweep_marks_expired_without_delete_when_object_missing():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_missing", "key": "portfolios/ph1/works/missing.jpg",
        "bucket": "maja-media", "status": "pending", "created_at": _ago(hours=25),
    })
    deletes = []
    orig = _patch_aws(
        head=lambda key, bucket_name=None: None,
        delete=lambda key, bucket_name=None: deletes.append(key) or True)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["reaped"] == 1
    assert deletes == [], "nothing to delete -- the object never existed"
    row = await db.upload_intents.find_one({"id": "i_missing"})
    assert row["status"] == "expired"
    assert row["existed"] is False


async def test_sweep_leaves_fresh_pending_alone():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_fresh", "key": "portfolios/ph1/works/fresh.jpg",
        "bucket": "maja-media", "status": "pending", "created_at": _ago(hours=1),
    })
    calls = []
    orig = _patch_aws(head=lambda key, bucket_name=None: calls.append(key) or None)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["reaped"] == 0
    assert calls == [], "fresh row must not even be selected by the cutoff"
    row = await db.upload_intents.find_one({"id": "i_fresh"})
    assert row["status"] == "pending"


async def test_sweep_leaves_committed_alone():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_committed", "key": "portfolios/ph1/works/done.jpg",
        "bucket": "maja-media", "status": "committed", "created_at": _ago(hours=48),
    })
    # No aws_service patch -- a "committed" row is filtered out by the cursor's
    # status=="pending" query and must never reach head_object at all.
    counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))

    assert counts["reaped"] == 0
    row = await db.upload_intents.find_one({"id": "i_committed"})
    assert row["status"] == "committed"


async def test_sweep_cas_race_skips_row():
    """Simulates a concurrent claim winner: the row is selected by the cursor
    as pending, but by the time this pass's find_one_and_update runs, someone
    else (another sweep pass, or a late commit()) already moved it off
    'pending' -- the CAS returns None and the row must be left untouched."""
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_race", "key": "portfolios/ph1/works/race.jpg",
        "bucket": "maja-media", "status": "pending", "created_at": _ago(hours=25),
    })
    real_faou = db.upload_intents.find_one_and_update

    async def _lose_race(flt, update, **kw):
        if flt.get("id") == "i_race" and flt.get("status") == "pending":
            return None
        return await real_faou(flt, update, **kw)

    db.upload_intents.find_one_and_update = _lose_race
    calls = []
    orig = _patch_aws(head=lambda key, bucket_name=None: calls.append(key) or None)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["kept"] == 1
    assert counts["reaped"] == 0
    assert calls == [], "lost the claim -- S3 must never be touched"
    row = await db.upload_intents.find_one({"id": "i_race"})
    assert row["status"] == "pending"


async def test_sweep_s3_error_bounces_back_to_pending_with_attempt_count():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_err", "key": "portfolios/ph1/works/err.jpg",
        "bucket": "maja-media", "status": "pending", "created_at": _ago(hours=25),
    })

    def _boom(key, bucket_name=None):
        raise RuntimeError("simulated S3 outage")

    orig = _patch_aws(head=_boom)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["reaped"] == 0
    assert counts["kept"] == 1
    row = await db.upload_intents.find_one({"id": "i_err"})
    assert row["status"] == "pending"
    assert row["sweep_attempts"] == 1
    assert row.get("sweep_error")


async def test_sweep_attempts_exhausted_marks_failed():
    db = FakeDB()
    await db.upload_intents.insert_one({
        "id": "i_exhausted", "key": "portfolios/ph1/works/exhausted.jpg",
        "bucket": "maja-media", "status": "pending", "created_at": _ago(hours=25),
        "sweep_attempts": mr.UPLOAD_INTENT_MAX_ATTEMPTS - 1,
    })

    def _boom(key, bucket_name=None):
        raise RuntimeError("still down")

    orig = _patch_aws(head=_boom)
    try:
        counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))
    finally:
        _unpatch_aws(orig)

    assert counts["kept"] == 0
    row = await db.upload_intents.find_one({"id": "i_exhausted"})
    assert row["status"] == "failed"
    assert row["sweep_attempts"] == mr.UPLOAD_INTENT_MAX_ATTEMPTS


async def test_terminal_purge_removes_only_old_terminal_rows():
    db = FakeDB()
    # `fresh` (5d) is well under the 30d purge window but past the 24h pending
    # cutoff -- fine for a terminal row (purge is the only thing that looks at
    # a terminal row's age), but a pending row that age WOULD be picked up by
    # the main reap loop too, so it gets its own recent timestamp to keep this
    # test isolated to the purge step alone.
    old, fresh = _ago(days=35), _ago(days=5)
    await db.upload_intents.insert_one(
        {"id": "i_committed_old", "status": "committed", "created_at": old,
         "key": "k1", "bucket": "b"})
    await db.upload_intents.insert_one(
        {"id": "i_expired_old", "status": "expired", "created_at": old,
         "key": "k2", "bucket": "b"})
    await db.upload_intents.insert_one(
        {"id": "i_failed_old", "status": "failed", "created_at": old,
         "key": "k3", "bucket": "b"})
    await db.upload_intents.insert_one(
        {"id": "i_committed_fresh", "status": "committed", "created_at": fresh,
         "key": "k4", "bucket": "b"})
    await db.upload_intents.insert_one(
        {"id": "i_pending_fresh", "status": "pending", "created_at": _ago(hours=1),
         "key": "k5", "bucket": "b"})

    counts = await mr._sweep_upload_intents(db, datetime.now(timezone.utc))

    assert counts["purged"] == 3
    remaining = {d["id"] async for d in db.upload_intents.find({})}
    assert remaining == {"i_committed_fresh", "i_pending_fresh"}


if __name__ == "__main__":
    # The two presign/commit checks call asyncio.run() themselves (they're
    # plain sync tests, matching how pytest calls them) -- run those OUTSIDE
    # any event loop, then run the async sweep checks under one asyncio.run.
    test_presign_writes_pending_intent()
    test_commit_flips_intent_to_committed()

    async def _run_all():
        await test_sweep_deletes_orphan_when_object_exists()
        await test_sweep_marks_expired_without_delete_when_object_missing()
        await test_sweep_leaves_fresh_pending_alone()
        await test_sweep_leaves_committed_alone()
        await test_sweep_cas_race_skips_row()
        await test_sweep_s3_error_bounces_back_to_pending_with_attempt_count()
        await test_sweep_attempts_exhausted_marks_failed()
        await test_terminal_purge_removes_only_old_terminal_rows()
        print("ALL UPLOAD INTENT SWEEP CHECKS PASSED")

    asyncio.run(_run_all())
