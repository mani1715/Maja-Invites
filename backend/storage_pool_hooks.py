"""
MAJA Invites — Storage Pool hooks (V1 multi-drive storage, Phases 5+7).
=======================================================================

The bridge between existing production endpoints and the drive pool. Called
from: photographer registration, event (profile) creation, QR/guest gallery
uploads, portfolio uploads, and studio cloud-storage uploads.

DESIGN RULES (why production can't break):
* **Fire-and-forget**: the originating request never waits on Google and never
  fails because of the pool.
* **Flag-gated**: `app_settings.storage_pool_enabled` defaults to **False**.
  Flag off = the hooks are inert = today's behavior, bit-for-bit.
* **Error-proof**: every path swallows + logs its own errors. Recovery belongs
  to the write-ahead upload_logs + the reconcile/retry jobs, never the request.
* **Bounded (Phase 7)**: mirror work runs through a bounded queue drained by a
  small worker pool, so a viral event (thousands of simultaneous guest
  uploads) cannot stampede the Drive API or hold unbounded bytes in memory.
  Overflow and oversized payloads are NOT lost: they are written to
  `upload_logs` as `deferred` with a `source_ref`, and the hourly retry job
  re-mirrors them from the source (disk/S3) later.
* V1 semantics: the pool is a **mirror/archive** — existing serving paths are
  untouched; serving cutover is a later, separate decision.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, Optional, Set

logger = logging.getLogger("storage_pool_hooks")

FLAG_KEY = "storage_pool_enabled"

# Bounded mirror pipeline (Phase 7 hardening)
QUEUE_MAX = 200                      # queued mirror jobs (bytes held in memory)
WORKER_COUNT = 4                     # concurrent pool uploads
MAX_INLINE_BYTES = 64 * 1024 * 1024  # bigger payloads defer to the retry job

_tasks: Set[asyncio.Task] = set()    # strong refs for small fire-and-forget jobs
_queue: Optional[asyncio.Queue] = None
_workers: list = []

_orchestrators: Dict[int, Any] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _orch(db):
    """One orchestrator per db handle (module-level cache)."""
    key = id(db)
    if key not in _orchestrators:
        from storage.orchestrator import StorageOrchestrator
        _orchestrators[key] = StorageOrchestrator(db)
    return _orchestrators[key]


async def pool_enabled(db) -> bool:
    """Feature flag — defaults to False (rollout is opt-in, rollback = flip off)."""
    try:
        doc = await db.app_settings.find_one({"key": FLAG_KEY})
        return bool(doc and doc.get("value") is True)
    except Exception as e:
        logger.warning("storage-pool flag read failed (treating as off): %s", e)
        return False


# --------------------------------------------------------------------------- #
# execution plumbing
# --------------------------------------------------------------------------- #
def _spawn(coro: Coroutine, what: str) -> None:
    """Schedule a small background task that can never propagate an exception.
    Used for provisioning (rare, tiny); uploads go through the bounded queue."""
    async def _safe():
        try:
            await coro
        except Exception as e:
            logger.warning("storage-pool hook '%s' failed (ignored): %s", what, e)

    wrapped = _safe()
    try:
        task = asyncio.create_task(wrapped)
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    except RuntimeError:
        wrapped.close()
        coro.close()
        logger.debug("storage-pool hook '%s' skipped: no event loop", what)


def _ensure_workers() -> bool:
    """Create the queue + worker tasks on the running loop (lazy, idempotent)."""
    global _queue
    if _queue is not None and _workers and not all(w.done() for w in _workers):
        return True
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return False
    if _queue is None:
        _queue = asyncio.Queue(maxsize=QUEUE_MAX)

    async def _worker():
        while True:
            fn, what = await _queue.get()
            try:
                await fn()
            except Exception as e:
                logger.warning("storage-pool worker '%s' failed (ignored): %s", what, e)
            finally:
                _queue.task_done()

    _workers[:] = [t for t in _workers if not t.done()]
    while len(_workers) < WORKER_COUNT:
        _workers.append(asyncio.create_task(_worker(),
                                            name=f"storage_pool_worker_{len(_workers)}"))
    return True


async def flush() -> None:
    """Wait for all in-flight hook work (tests / graceful checks)."""
    while _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)
    if _queue is not None:
        await _queue.join()


async def _photographer_name(db, photographer_id: str) -> str:
    try:
        doc = await db.admins.find_one({"id": photographer_id})
        if doc:
            return (doc.get("name") or doc.get("username")
                    or doc.get("email") or photographer_id)
    except Exception:
        pass
    return photographer_id


async def _defer_to_retry(db, *, photographer_id: str, area: str, filename: str,
                          size: int, content_type: str, event_id: Optional[str],
                          event_name: Optional[str], source_ref: Optional[Dict],
                          reason: str) -> None:
    """Record a mirror we chose not to run inline. The hourly retry job
    re-reads the bytes from source_ref and re-mirrors. Without a source_ref
    the entry is still recorded (visible on the dashboard) but unrecoverable."""
    try:
        await db.upload_logs.insert_one({
            "id": f"ulog_{uuid.uuid4().hex[:12]}",
            "status": "deferred" if source_ref else "failed",
            "photographer_id": photographer_id, "event_id": event_id,
            "event_name": event_name, "area": area, "filename": filename,
            "size_bytes": size, "content_type": content_type,
            "source_ref": source_ref, "retry_count": 0,
            "error": reason, "attempts": 0, "drive_account_id": None,
            "started_at": _now(), "finished_at": None,
        })
    except Exception as e:
        logger.warning("storage-pool defer record failed: %s", e)


# --------------------------------------------------------------------------- #
# public hooks (all fire-and-forget)
# --------------------------------------------------------------------------- #
def provision_photographer(db, photographer_id: str, name: Optional[str] = None) -> None:
    """Registration hook: create Photographers/<Name>/{Events,Portfolio,
    Cloud_Storage} on the ACTIVE drive. Best-effort — if it fails, the first
    upload provisions on demand (the registry self-heals)."""
    async def _run():
        if not await pool_enabled(db):
            return
        orch = _orch(db)
        account = await orch.current_account()
        if not account:
            return
        display = name or await _photographer_name(db, photographer_id)
        await orch.ensure_photographer_tree(account, photographer_id, display)
        logger.info("storage-pool: provisioned photographer tree for %s", photographer_id)

    _spawn(_run(), f"provision_photographer:{photographer_id}")


def provision_event(db, photographer_id: str, event_id: str,
                    event_name: str) -> None:
    """Event-creation hook: Events/<EventName>/{QR_Photos,Selfies}."""
    async def _run():
        if not await pool_enabled(db):
            return
        orch = _orch(db)
        account = await orch.current_account()
        if not account:
            return
        display = await _photographer_name(db, photographer_id)
        await orch.ensure_event_tree(account, photographer_id, display,
                                     event_id, event_name)
        logger.info("storage-pool: provisioned event tree %s/%s",
                    photographer_id, event_id)

    _spawn(_run(), f"provision_event:{event_id}")


def on_event_deleted(db, event_id: str, photographer_id: Optional[str] = None) -> None:
    """Event-delete hook: mark the event's pooled storage for a 5-day soft-delete.
    The daily job purges files+folders and releases bytes after the window.
    Fire-and-forget + flag-gated; never blocks or fails the delete request."""
    async def _run():
        if not await pool_enabled(db):
            return
        await _orch(db).soft_delete_event(event_id, photographer_id)
        logger.info("storage-pool: event %s marked for 5-day soft-delete", event_id)

    _spawn(_run(), f"on_event_deleted:{event_id}")


def on_event_restored(db, event_id: str) -> None:
    """Event-restore hook: cancel a pending pool soft-delete."""
    async def _run():
        if not await pool_enabled(db):
            return
        n = await _orch(db).restore_event(event_id)
        if n:
            logger.info("storage-pool: event %s restored (soft-delete cancelled)", event_id)

    _spawn(_run(), f"on_event_restored:{event_id}")


def on_event_purged(db, event_id: str) -> None:
    """Hard-delete hook (admin purges from trash before the 5 days): purge the
    event's pooled files+folders NOW and release the bytes. Fire-and-forget."""
    async def _run():
        if not await pool_enabled(db):
            return
        orch = _orch(db)
        res = await orch.purge_event_storage(event_id)
        if res.get("complete"):
            await db.storage_event_deletions.update_many(
                {"event_id": event_id, "status": "recycle"},
                {"$set": {"status": "purged", "purged_at": _now()}})
        logger.info("storage-pool: event %s hard-purged (%s)", event_id, res)

    _spawn(_run(), f"on_event_purged:{event_id}")


def mirror_delete(
    db,
    *,
    photographer_id: str,
    source_path: Optional[str] = None,   # disk path (portfolio/community) or S3 key (cloud)
    filename: Optional[str] = None,
    area: Optional[str] = None,
    event_id: Optional[str] = None,
    url: Optional[str] = None,           # accepted for call-site convenience / logging
) -> None:
    """Media-delete hook: when a source file is deleted from the app, remove its
    pooled mirror and release the committed bytes. Fire-and-forget + flag-gated;
    idempotent (no-op if the mirror is already gone or the pool is off)."""
    if not photographer_id or not (source_path or filename):
        return

    async def _run():
        if not await pool_enabled(db):
            return
        res = await _orch(db).delete_mirror(
            photographer_id, source_path=source_path,
            filename=filename, area=area, event_id=event_id)
        if res.get("deleted") or res.get("failed"):
            logger.info("storage-pool: mirror_delete removed %d, failed %d, "
                        "released %d bytes (ph=%s, key=%s)",
                        res.get("deleted", 0), res.get("failed", 0),
                        res.get("bytes_released", 0), photographer_id,
                        source_path or filename)

    _spawn(_run(), f"mirror_delete:{source_path or filename or url or photographer_id}")


def mirror_upload(
    db,
    *,
    photographer_id: str,
    area: str,                      # see orchestrator.UPLOAD_AREAS — qr_photos |
                                    # selfies | portfolio | cloud_storage |
                                    # community | media
    filename: str,
    data: bytes,
    content_type: str,
    event_id: Optional[str] = None,
    event_name: Optional[str] = None,
    photographer_name: Optional[str] = None,
    source_ref: Optional[Dict[str, Any]] = None,   # {"kind":"disk","path":...} |
                                                   # {"kind":"s3","key":...}
) -> None:
    """Upload hook: archive a copy of an accepted upload into the pool.
    Deduped by sha256 inside the orchestrator. Runs through the bounded worker
    queue; overflow / oversized payloads are deferred to the retry job."""
    if not photographer_id or not data:
        return
    size = len(data)
    what = f"mirror:{area}:{filename}"

    async def _job():
        if not await pool_enabled(db):
            return
        orch = _orch(db)
        # Mirror to whatever the CURRENT pool account is (post-cutover that is
        # the S3 account registered by scripts/use_s3_storage.py; pre-cutover
        # pools fall back to gdrive inside current_account itself). The
        # explicit kind pass-through keeps upload_file's own default on the
        # legacy "gdrive" contract that the pool tests pin down.
        account = await orch.current_account()
        if not account:
            return
        display = photographer_name or await _photographer_name(db, photographer_id)
        await orch.upload_file(
            photographer_id=photographer_id,
            photographer_name=display,
            area=area,
            filename=filename,
            data=data,
            content_type=content_type or "application/octet-stream",
            event_id=event_id,
            event_name=event_name,
            kind=account.get("kind") or "gdrive",
            source_ref=source_ref,   # persisted as source_path for mirror_delete
        )

    def _defer(reason: str) -> None:
        async def _record():
            if not await pool_enabled(db):
                return
            await _defer_to_retry(
                db, photographer_id=photographer_id, area=area,
                filename=filename, size=size,
                content_type=content_type or "application/octet-stream",
                event_id=event_id, event_name=event_name,
                source_ref=source_ref, reason=reason)
        _spawn(_record(), f"defer:{what}")

    # Oversized payloads never sit in the queue holding memory — the retry job
    # streams them from source_ref instead.
    if size > MAX_INLINE_BYTES:
        _defer(f"deferred: {size} bytes exceeds inline limit "
               f"({MAX_INLINE_BYTES}); retry job will mirror from source")
        return

    if not _ensure_workers():
        logger.debug("storage-pool hook '%s' skipped: no event loop", what)
        return
    try:
        _queue.put_nowait((_job, what))
    except asyncio.QueueFull:
        # burst protection (charter failure case 7 / performance): don't grow
        # memory or hammer the API — hand the job to the retry pipeline
        _defer("deferred: mirror queue full (burst)")
