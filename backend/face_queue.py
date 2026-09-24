"""
face_queue.py — Redis job queue contract for async face-recognition work.

Thin wrapper over cache_backend's queue primitives (LPUSH/BRPOP). Job shapes:
    {"type": "FACE_INDEX",  "photo_id": ..., "profile_id": ..., "attempt": 0}
    {"type": "FACE_SEARCH", "session_id": ..., "profile_id": ..., "attempt": 0}
    {"type": "REINDEX",     "profile_id": ...}

Consumed by worker.py. With no REDIS_URL configured, `enqueue` returns False
and the caller (gallery_features.py) runs the work inline instead — dev
machines with no Redis keep working unchanged.
"""
from cache_backend import queue_push, queue_pop_blocking  # noqa: F401  (re-exported)

QUEUE = "maja:jobs:face"


async def enqueue(job: dict) -> bool:
    """Push one face job onto the queue. Never raises; False means no
    Redis — the caller must run the job inline."""
    return await queue_push(QUEUE, job)
