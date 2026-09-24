"""
MAJA Invites -- media_reconcile.py (Lane A5)
=============================================
Reconciliation for the DIRECT-S3 gallery path. storage_pool_jobs.py already
reconciles the drive-pool storage backend; the older direct-S3 gallery path
(gallery_photos / face_search_sessions -- S3 + Rekognition, no Drive pool
involved) had none. Left alone: a gallery_photos row whose S3 object vanished
stays invisible forever, a face_search_session can stick in 'queued' forever
if its queue push was lost, and gallery_photos can stick indexed=False forever
the same way.

One entry point, `run_media_reconcile(db)`. Leader-locked by the CALLER's
scheduler registration (server.py, same lock the gallery_daily/selfie_hourly
neighbors use) -- this module does NOT acquire its own lock.

  1. STALE FACE SEARCHES -- sessions stuck 'queued' > 15 min (lost queue push
     or a dead worker): claimed via find_one_and_update with the status guard
     in the filter (the only atomic primitive over pg_adapter -- no
     multi-statement transactions), requeued once, then failed if still stuck
     on a later pass.
  2. UNINDEXED PHOTOS -- gallery_photos never indexed and no index_error on
     file, > 1h old, batch-capped: re-enqueue FACE_INDEX with attempt reset.
  3. MISSING-OBJECT SAMPLING -- newest 20 photos per run, head-checked
     against S3 (best-effort, off the event loop); marks the row and writes
     ONE admin alert via storage_pool_jobs.alert (the same admin-alert feed
     the drive-pool reconciler uses).
  4. UPLOAD INTENTS -- storage_upload.py's presign() (and gallery_features.py's
     staging presign) write a `db.upload_intents` row before handing back a
     presigned policy, since a browser can die between the S3 upload and the
     commit call that would otherwise be the only DB trace. Anything still
     "pending" 24h later never got committed: claimed via find_one_and_update
     (status guard in the filter, same house rule as #1), head-checked against
     S3 off the event loop, deleted if it landed, marked "expired". No prefix
     listing -- the intent rows are the index. Terminal rows older than 30d are
     purged.
  5. Heartbeat via system_health.record_job_run so the System-Health
     dashboard shows this job's last run, same convention as the other
     scheduled jobs.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import aws_service
import face_queue
from storage_pool_jobs import alert as _alert
from system_health import record_job_run

logger = logging.getLogger("media_reconcile")

STALE_SEARCH_MINUTES = 15
STALE_SEARCH_BATCH_CAP = 500
UNINDEXED_HOURS = 1
UNINDEXED_BATCH_CAP = 200
MISSING_SAMPLE = 20

UPLOAD_INTENT_STALE_HOURS = 24
UPLOAD_INTENT_BATCH_CAP = int(os.environ.get("UPLOAD_INTENT_SWEEP_CAP", "500"))
UPLOAD_INTENT_MAX_ATTEMPTS = 5
UPLOAD_INTENT_PURGE_DAYS = 30
UPLOAD_INTENT_PURGE_CAP = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _reconcile_stale_searches(db, now: datetime) -> Dict[str, int]:
    """CAS via find_one_and_update, status guard in the filter (house rule --
    read-then-write update_one would race a second reconcile pass). First
    stale hit: claim 'queued' -> 'requeued_once', set requeue_count=1, and
    re-enqueue. Still stale on a later pass (requeue_count already set):
    claim 'requeued_once' -> 'failed'."""
    cutoff = _iso(now - timedelta(minutes=STALE_SEARCH_MINUTES))
    counts = {"requeued": 0, "failed": 0}
    cursor = db.face_search_sessions.find({
        "status": {"$in": ["queued", "requeued_once"]},
        "created_at": {"$lt": cutoff},
    }).limit(STALE_SEARCH_BATCH_CAP)
    async for s in cursor:
        if not s.get("requeue_count"):
            claimed = await db.face_search_sessions.find_one_and_update(
                {"id": s["id"], "status": "queued"},
                {"$set": {"status": "requeued_once", "requeue_count": 1,
                          "requeued_at": _iso(now)}},
                return_document=True)
            if not claimed:
                continue  # lost the claim race -- another pass already has it
            await face_queue.enqueue({"type": "FACE_SEARCH", "session_id": s["id"],
                                      "profile_id": s.get("profile_id"), "attempt": 0})
            counts["requeued"] += 1
        else:
            claimed = await db.face_search_sessions.find_one_and_update(
                {"id": s["id"], "status": "requeued_once"},
                {"$set": {"status": "failed", "error": "stale after requeue"}},
                return_document=True)
            if claimed:
                counts["failed"] += 1
    return counts


async def _reconcile_unindexed_photos(db, now: datetime) -> Dict[str, int]:
    """No claim guard needed -- re-enqueuing FACE_INDEX for an already-queued
    photo is harmless (index_photo_job overwrites the same fields), and the
    caller's leader lock already keeps this to one run at a time."""
    cutoff = _iso(now - timedelta(hours=UNINDEXED_HOURS))
    n = 0
    cursor = db.gallery_photos.find({
        "indexed": {"$ne": True},
        "index_error": {"$exists": False},
        "created_at": {"$lt": cutoff},
    }).limit(UNINDEXED_BATCH_CAP)
    async for p in cursor:
        await face_queue.enqueue({"type": "FACE_INDEX", "photo_id": p["id"],
                                  "profile_id": p.get("profile_id"), "attempt": 0})
        await db.gallery_photos.update_one(
            {"id": p["id"]}, {"$set": {"needs_reindex": True}})
        n += 1
    return {"reindexed": n}


def _head_key(p: Dict[str, Any]) -> str:
    """Same fallback order used everywhere else in gallery_features.py
    (download manifests, delete): the true original if we have one, else the
    preview derivative that legacy rows point s3_key at."""
    return p.get("original_s3_key") or p.get("s3_key") or p.get("preview_s3_key") or ""


async def _reconcile_missing_objects(db) -> Dict[str, int]:
    photos = await db.gallery_photos.find({}) \
        .sort("created_at", -1).limit(MISSING_SAMPLE).to_list(MISSING_SAMPLE)
    missing = 0
    for p in photos:
        key = _head_key(p)
        if not key:
            continue

        def _head(k=key):
            aws_service.s3().head_object(Bucket=aws_service.bucket(), Key=k)

        try:
            await asyncio.to_thread(_head)
        except Exception:
            # best-effort: any head failure (404 or otherwise) -> treat as
            # missing, same convention as storage_upload.py's commit check.
            missing += 1
            await db.gallery_photos.update_one(
                {"id": p["id"]}, {"$set": {"storage_status": "missing"}})
    if missing:
        await _alert(db, "gallery_photo_missing",
                     f"{missing} gallery photo(s) missing on S3 -- investigate "
                     "before trusting the gallery.", severity="error")
    return {"missing": missing}


async def _sweep_upload_intents(db, now: datetime) -> Dict[str, int]:
    """Reaps write-ahead rows from BOTH areas that write into the shared
    `db.upload_intents` collection: storage_upload.py's presign() (area is
    whatever AREAS value was signed for) and gallery_features.py's staging
    presign (area="gallery_staging"). A row still "pending" past the grace
    period means commit() never ran -- the browser died, or it landed and
    nobody told us.

    CAS claim (pending -> reaping) before touching S3 -- same house rule as
    _reconcile_stale_searches: a second sweep pass or a late-arriving commit()
    racing this one loses the claim and moves on rather than double-handling
    the key. No S3 prefix scan anywhere; the intent rows ARE the index.
    """
    cutoff = _iso(now - timedelta(hours=UPLOAD_INTENT_STALE_HOURS))
    counts = {"reaped": 0, "kept": 0, "purged": 0}
    cursor = db.upload_intents.find({
        "status": "pending",
        "created_at": {"$lt": cutoff},
    }).limit(UPLOAD_INTENT_BATCH_CAP)
    async for row in cursor:
        claimed = await db.upload_intents.find_one_and_update(
            {"id": row["id"], "status": "pending"},
            {"$set": {"status": "reaping"}},
            return_document=True)
        if not claimed:
            counts["kept"] += 1
            continue  # lost the claim race -- another pass (or commit()) got there first

        key = row.get("key") or ""
        try:
            head = await asyncio.to_thread(aws_service.head_object, key,
                                           bucket_name=row.get("bucket"))
            if head:
                await asyncio.to_thread(aws_service.delete_object, key,
                                        bucket_name=row.get("bucket"))
            await db.upload_intents.update_one(
                {"id": row["id"], "status": "reaping"},
                {"$set": {"status": "expired", "reaped_at": _iso(now),
                          "existed": bool(head)}})
            counts["reaped"] += 1
        except Exception as e:
            # Transient S3 error (not a 404 -- head_object already turns that
            # into `head is None`, not an exception). Bounded retries: bounce
            # back to "pending" for the next nightly pass, and only give up
            # once UPLOAD_INTENT_MAX_ATTEMPTS is exhausted, so a real S3 outage
            # can't retry forever.
            attempts = int(row.get("sweep_attempts") or 0) + 1
            status = "failed" if attempts >= UPLOAD_INTENT_MAX_ATTEMPTS else "pending"
            await db.upload_intents.update_one(
                {"id": row["id"], "status": "reaping"},
                {"$set": {"status": status, "sweep_attempts": attempts,
                          "sweep_error": str(e)[:200]}})
            if status == "pending":
                counts["kept"] += 1
            logger.warning("upload-intent sweep: S3 error on %s (attempt %d): %s",
                           key, attempts, e)

    # Purge terminal rows older than UPLOAD_INTENT_PURGE_DAYS. delete_many has
    # no LIMIT in pg_adapter, so select the (capped) ids first and $in-delete --
    # same shape as gallery_features.cleanup_expired_selfies.
    purge_cutoff = _iso(now - timedelta(days=UPLOAD_INTENT_PURGE_DAYS))
    purge_ids = []
    async for row in db.upload_intents.find(
            {"status": {"$in": ["committed", "expired", "failed"]},
             "created_at": {"$lt": purge_cutoff}},
            {"_id": 0, "id": 1}).limit(UPLOAD_INTENT_PURGE_CAP):
        purge_ids.append(row["id"])
    if purge_ids:
        await db.upload_intents.delete_many({"id": {"$in": purge_ids}})
        counts["purged"] = len(purge_ids)
    return counts


async def run_media_reconcile(db) -> Dict[str, Any]:
    """Single entry point. Leader-locked by the CALLER (server.py's
    APScheduler registration), not internally. Each section is best-effort --
    one failing never blocks the others or the heartbeat."""
    now = _now()
    summary: Dict[str, Any] = {}
    for name, coro in (
        ("stale_searches", _reconcile_stale_searches(db, now)),
        ("unindexed", _reconcile_unindexed_photos(db, now)),
        ("missing_objects", _reconcile_missing_objects(db)),
        ("upload_intents", _sweep_upload_intents(db, now)),
    ):
        try:
            summary.update(await coro)
        except Exception as e:
            logger.warning("media-reconcile: %s failed: %s", name, e)
            summary[f"{name}_error"] = str(e)[:200]
    try:
        await record_job_run(db, "media_reconcile", summary)
    except Exception as e:
        logger.warning("media-reconcile: heartbeat failed: %s", e)
    return summary
