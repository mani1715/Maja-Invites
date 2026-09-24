"""
worker.py — standalone face-job worker (T8).

Runs OUTSIDE the FastAPI app: `python worker.py`. Pops jobs off
face_queue.QUEUE (Redis BRPOP) and dispatches them to the same job bodies
gallery_features.py runs inline when no queue is configured — one code path,
whether a photo gets indexed by the request thread or by this process.

No Redis (no REDIS_URL) -> queue_pop_blocking always returns None -> this
process just idles; nothing breaks, it's simply not needed on a dev machine.

    python worker.py
"""
import os
import signal
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(
    level=os.environ.get("WORKER_LOG_LEVEL", "INFO"),
    format="%(asctime)s worker %(levelname)s %(message)s",
)
logger = logging.getLogger("worker")

# Same pg pool construction as server.py (Postgres-only; see server.py:167-176)
# — copied, not imported, per the house rule that server.py is orchestrator-owned.
from pg_adapter import Database as _PGDatabase
_pg_dsn = os.environ.get("SUPABASE_DB_URL")
if not _pg_dsn:
    raise RuntimeError("SUPABASE_DB_URL must be set in the environment (Postgres-only).")
db = _PGDatabase.lazy(
    _pg_dsn,
    min_size=int(os.environ.get("DB_POOL_MIN", "1")),
    max_size=int(os.environ.get("DB_POOL_MAX", "20")),
)

import face_queue
from cache_backend import queue_pop_blocking
from gallery_features import index_photo_job, run_search_job

MAX_ATTEMPTS = 5
POP_TIMEOUT_SECONDS = 5

_stop = asyncio.Event()


def _request_stop(signum, _frame):
    logger.info("signal=%s stop=requested (finishing current job then exiting)", signum)
    _stop.set()


for _sig_name in ("SIGINT", "SIGTERM"):
    _sig = getattr(signal, _sig_name, None)
    if _sig is not None:
        try:
            signal.signal(_sig, _request_stop)
        except Exception:  # pragma: no cover - some platforms restrict this
            logger.warning("could not register handler for %s", _sig_name)


async def _run_reindex(profile_id: str) -> int:
    """REINDEX job body: (re)enqueue a FACE_INDEX job for every photo in this
    gallery that's flagged needs_reindex or never finished indexing."""
    n = 0
    cursor = db.gallery_photos.find(
        {"profile_id": profile_id,
         "$or": [{"needs_reindex": True}, {"indexed": False}]},
        {"_id": 0, "id": 1})
    async for p in cursor:
        await face_queue.enqueue({"type": "FACE_INDEX", "photo_id": p["id"],
                                   "profile_id": profile_id, "attempt": 0})
        n += 1
    logger.info("job=REINDEX profile_id=%s enqueued=%d", profile_id, n)
    return n


async def _give_up(job: dict, attempt: int, err: str) -> None:
    """MAX_ATTEMPTS exhausted — log and leave a durable trace where face_ops /
    face-results can surface it (index_photo_job / run_search_job already do
    this on their own last attempt; this covers dispatch-level failures too,
    e.g. an unknown job type or a DB error before the job body ran)."""
    jtype = job.get("type")
    logger.error("job=%s attempt=%d giving_up err=%s job=%s", jtype, attempt, err, job)
    try:
        if jtype == "FACE_INDEX" and job.get("photo_id"):
            await db.gallery_photos.update_one(
                {"id": job["photo_id"]},
                {"$set": {"index_error": f"giving_up after {attempt} attempts: {err}"[:300]}})
        elif jtype == "FACE_SEARCH" and job.get("session_id"):
            await db.face_search_sessions.update_one(
                {"id": job["session_id"]},
                {"$set": {"status": "failed",
                          "error": f"giving_up after {attempt} attempts: {err}"[:300]}})
    except Exception:
        logger.exception("job=%s give_up bookkeeping failed", jtype)

    # Dead-letter record (doc sec 30) — best-effort, in its own try/except so
    # a DLQ write failure never masks the bookkeeping above. face_ops.py reads
    # this collection to list/retry dead jobs.
    try:
        await db.face_dead_letters.insert_one({
            "id": str(uuid.uuid4()),
            "job_type": jtype,
            "payload": job,
            "profile_id": job.get("profile_id"),
            "photo_id": job.get("photo_id"),
            "session_id": job.get("session_id"),
            "error": err[:500],
            "attempts": attempt,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "dead",
        })
    except Exception:
        logger.exception("job=%s dead-letter insert failed", jtype)


async def _dispatch(job: dict) -> None:
    jtype = job.get("type")
    try:
        if jtype == "FACE_INDEX":
            res = await index_photo_job(db, job["photo_id"])
            if not res.get("ok"):
                raise RuntimeError(res.get("error") or "index_failed")
            logger.info("job=FACE_INDEX photo_id=%s face_count=%s ok",
                        job.get("photo_id"), res.get("face_count"))
        elif jtype == "FACE_SEARCH":
            res = await run_search_job(db, job["session_id"])
            if res.get("status") == "failed":
                raise RuntimeError(res.get("error") or "search_failed")
            logger.info("job=FACE_SEARCH session_id=%s matches=%d ok",
                        job.get("session_id"), len(res.get("matched_photo_ids") or []))
        elif jtype == "REINDEX":
            await _run_reindex(job["profile_id"])
        else:
            logger.warning("unknown job type=%r job=%s", jtype, job)
    except Exception as e:
        attempt = int(job.get("attempt") or 0) + 1
        if attempt < MAX_ATTEMPTS:
            delay = min(2 ** attempt, 60)
            logger.warning("job=%s attempt=%d/%d failed err=%s — retrying in %ds",
                           jtype, attempt, MAX_ATTEMPTS, e, delay)
            await asyncio.sleep(delay)
            job["attempt"] = attempt
            await face_queue.enqueue(job)
        else:
            await _give_up(job, attempt, str(e)[:200])


async def main() -> None:
    await db.ensure_connected()
    logger.info("worker started queue=%s", face_queue.QUEUE)
    while not _stop.is_set():
        try:
            job = await queue_pop_blocking(face_queue.QUEUE, timeout=POP_TIMEOUT_SECONDS)
        except Exception:
            # queue_pop_blocking already never raises, but the loop must not
            # die no matter what — this is the last line of defence.
            logger.exception("queue_pop_blocking crashed unexpectedly")
            await asyncio.sleep(1)
            continue
        if job is None:
            continue
        try:
            await _dispatch(job)
        except Exception:
            logger.exception("job dispatch crashed unexpectedly job=%s", job)
    await db.close()
    logger.info("worker stopped cleanly")


if __name__ == "__main__":
    asyncio.run(main())
