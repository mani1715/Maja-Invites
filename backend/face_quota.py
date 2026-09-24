"""
face_quota.py — ATOMIC batch reservation for AI face-match photo quota.

Why this exists
---------------
`gallery_features.resolve_face_photo_limit()` already answers "how many
face-match photos did this wedding buy?" (MAX face_photo_limit across the
wedding's PAID invitation_orders), and `index_photo_job()` already refuses to
index past it. That is a *per-photo, at-index-time* guard: it is correct, but
it is the wrong place to tell a photographer that their 301-photo drop will not
fit in the 100 photos they have left. By then 301 objects are already in S3.

This module adds the missing piece — a **batch reservation** taken BEFORE any
S3 object is created — without introducing a second entitlement source. The
allocation still comes from `resolve_face_photo_limit`; this only tracks holds
against it.

  allocated  = resolve_face_photo_limit(profile_id)   (None => unlimited)
  used       = accepted gallery_photos rows for the profile
  reserved   = SUM(requested - committed) over live reservations
  remaining  = allocated - used - reserved

`used` counts ACCEPTED photos, not successfully indexed ones. A photo whose
Rekognition indexing failed still occupies a purchased slot — the studio bought
capacity for a photo, not for a successful AWS call. Releasing quota on an
indexing failure would let a flaky Rekognition day silently inflate the
allocation.

Atomicity
---------
A Postgres SESSION advisory lock keyed on the profile id, held on its own
pooled connection for the duration of one reserve. Two concurrent reservations
for the same wedding serialise; different weddings never contend. If the
process dies mid-reserve the connection drops and Postgres releases the lock —
no stuck holds.

  ponytail: a session advisory lock, not SERIALIZABLE. It holds one pool
  connection for the few queries inside the critical section. If a single
  wedding ever sees enough concurrent reservers to starve the pool, move the
  whole reserve into one raw SQL transaction with pg_advisory_xact_lock.

Lifecycle: reserved -> committed (every photo landed)
                    -> released  (batch abandoned / aborted)
                    -> expired   (TTL passed, swept)

Collection: `face_quota_reservations` (long-tail JSONB, ensure_table on use).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("face_quota")

COLLECTION = "face_quota_reservations"

# Namespace for the advisory lock so the (int, int) key space cannot collide
# with another feature that starts using advisory locks later.
_LOCK_NAMESPACE = "maja.face_quota"

# A reservation is a hold on capacity while a browser uploads. Long enough for
# a big batch on a slow line, short enough that an abandoned tab frees the
# quota the same day.
DEFAULT_TTL_MINUTES = 12 * 60

# Refuse absurd batch sizes outright — a reservation is a promise to upload,
# not a way to park the entire allocation.
MAX_BATCH_PHOTOS = 5000


class QuotaExceeded(Exception):
    """Raised by reserve() when the batch does not fit. `payload` is the
    structured body the API returns verbatim."""

    def __init__(self, payload: Dict[str, Any]):
        self.payload = payload
        super().__init__(payload.get("message") or "QUOTA_EXCEEDED")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# Fallback mutexes for a db handle that is not a real Postgres pool (the
# in-memory FakeDB the gallery unit tests use). Process-local, so it is NOT a
# substitute for the advisory lock across workers — see _profile_lock.
_local_locks: Dict[str, "asyncio.Lock"] = {}


def _has_pg_pool(db) -> bool:
    """True only for a real pg_adapter.Database. Written as a capability probe
    rather than an isinstance check because the adapter's `__getattr__` hands
    back a Collection for ANY unknown attribute — so `hasattr` is always true
    and `db.ensure_connected` on a test double is a Collection, not a
    coroutine function."""
    return callable(getattr(db, "ensure_connected", None)) and hasattr(type(db), "pool")


@asynccontextmanager
async def _profile_lock(db, profile_id: str):
    """Serialise reservations for one wedding. Never held across an S3 or
    Rekognition call — only the local counting queries below.

    Real Postgres gets a session advisory lock, which serialises across every
    uvicorn worker and every container. A db handle with no pool (the unit
    tests' in-memory double) falls back to a process-local asyncio lock and
    says so loudly — a fallback that stayed silent would look like the same
    guarantee while providing none.
    """
    if not _has_pg_pool(db):
        logger.warning("[face_quota] no Postgres pool on this db handle — "
                       "falling back to a PROCESS-LOCAL lock for %s. This is "
                       "only safe in single-process tests.", profile_id)
        lock = _local_locks.setdefault(profile_id, asyncio.Lock())
        async with lock:
            yield
        return

    await db.ensure_connected()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "SELECT pg_advisory_lock(hashtext($1), hashtext($2))",
            _LOCK_NAMESPACE, profile_id)
        try:
            yield
        finally:
            try:
                await conn.execute(
                    "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
                    _LOCK_NAMESPACE, profile_id)
            except Exception:          # connection already gone -> lock is too
                logger.warning("[face_quota] advisory unlock failed for %s", profile_id)


async def _allocated(db, profile_id: str) -> Optional[int]:
    """Canonical entitlement. Imported lazily: gallery_features imports this
    module, so a top-level import would be circular."""
    from gallery_features import resolve_face_photo_limit
    return await resolve_face_photo_limit(db, profile_id)


async def _used(db, profile_id: str) -> int:
    """Accepted photos. Deduped uploads never insert a row, so they never
    consume quota — which matches what the studio is billed for."""
    return await db.gallery_photos.count_documents({"profile_id": profile_id})


async def _live_reservations(db, profile_id: str) -> list:
    """Reservations still holding capacity: status 'reserved' and not past
    their TTL. Time-expired rows are treated as releasing their hold
    immediately, so a dead browser tab never blocks the next upload until the
    sweep happens to run."""
    await db.ensure_table(COLLECTION)
    now_iso = _iso(_now())
    rows = await db.face_quota_reservations.find(
        {"profile_id": profile_id, "status": "reserved"}, {"_id": 0}).to_list(500)
    return [r for r in rows if (r.get("expires_at") or "") > now_iso]


def _outstanding(rows: list) -> int:
    return sum(max(0, int(r.get("requested_count") or 0) - int(r.get("committed_count") or 0))
               for r in rows)


async def snapshot(db, profile_id: str) -> Dict[str, Any]:
    """What the dashboard and the upload panel display. `allocated: None`
    means this wedding bought no numbered face-match SKU — legacy flat
    `ai_face_match` orders are uncapped and must stay that way."""
    allocated = await _allocated(db, profile_id)
    used = await _used(db, profile_id)
    reserved = _outstanding(await _live_reservations(db, profile_id))
    remaining = None if allocated is None else max(0, allocated - used - reserved)
    return {
        "profile_id": profile_id,
        "allocated": allocated,
        "used": used,
        "reserved": reserved,
        "remaining": remaining,
        "unlimited": allocated is None,
    }


def _exceeded_payload(snap: Dict[str, Any], requested: int) -> Dict[str, Any]:
    remaining = int(snap.get("remaining") or 0)
    excess = requested - remaining
    return {
        "code": "QUOTA_EXCEEDED",
        "allocated": snap.get("allocated"),
        "used": snap.get("used"),
        "reserved": snap.get("reserved"),
        "remaining": remaining,
        "requested": requested,
        "excess": excess,
        "message": (
            f"Your upload contains {requested} photos, but only {remaining} "
            f"photos remain in this event's AI face-match quota. Extend the "
            f"quota before uploading more photos."
        ),
    }


async def reserve(db, profile_id: str, requested_count: int, *,
                  admin_id: Optional[str] = None,
                  ttl_minutes: int = DEFAULT_TTL_MINUTES) -> Dict[str, Any]:
    """Hold `requested_count` photo slots, or raise QuotaExceeded.

    All-or-nothing by construction: there is no partial reservation, so a
    caller can never be handed "you may upload 100 of your 301".

    Returns {"reservation_id": str|None, **snapshot}. `reservation_id` is None
    for an unlimited wedding — nothing to hold, nothing to commit.
    """
    if requested_count < 1:
        raise ValueError("requested_count must be >= 1")
    if requested_count > MAX_BATCH_PHOTOS:
        raise ValueError(f"requested_count exceeds the {MAX_BATCH_PHOTOS}-photo batch ceiling")

    async with _profile_lock(db, profile_id):
        snap = await snapshot(db, profile_id)
        if snap["allocated"] is None:
            return {"reservation_id": None, **snap}
        if requested_count > int(snap["remaining"] or 0):
            raise QuotaExceeded(_exceeded_payload(snap, requested_count))

        now = _now()
        row = {
            "id": f"fqr_{uuid.uuid4().hex[:20]}",
            "profile_id": profile_id,
            "admin_id": admin_id,
            "requested_count": int(requested_count),
            "committed_count": 0,
            "status": "reserved",
            "created_at": _iso(now),
            "expires_at": _iso(now + timedelta(minutes=ttl_minutes)),
            "committed_at": None,
            "released_at": None,
        }
        await db.ensure_table(COLLECTION)
        await db.face_quota_reservations.insert_one(row)

    logger.info("[face_quota] reserved profile=%s count=%d id=%s",
                profile_id, requested_count, row["id"])
    out = await snapshot(db, profile_id)
    return {"reservation_id": row["id"], **out}


async def get(db, reservation_id: str) -> Optional[Dict[str, Any]]:
    await db.ensure_table(COLLECTION)
    return await db.face_quota_reservations.find_one({"id": reservation_id}, {"_id": 0})


async def commit(db, reservation_id: str, count: int = 1) -> bool:
    """One (or `count`) photo(s) from this reservation landed. The hold shrinks
    by the same amount the `used` count grew, so the two never double-count.

    Idempotent at the ceiling: committing more than was reserved is clamped and
    logged rather than allowed to make `reserved` go negative.
    """
    if not reservation_id:
        return False
    await db.ensure_table(COLLECTION)
    row = await db.face_quota_reservations.find_one({"id": reservation_id}, {"_id": 0})
    if not row:
        logger.warning("[face_quota] commit for unknown reservation %s", reservation_id)
        return False

    requested = int(row.get("requested_count") or 0)
    committed = int(row.get("committed_count") or 0)
    new_committed = min(requested, committed + max(1, int(count)))
    if new_committed == committed:
        return False

    patch: Dict[str, Any] = {"committed_count": new_committed}
    if new_committed >= requested:
        patch["status"] = "committed"
        patch["committed_at"] = _iso(_now())
    await db.face_quota_reservations.update_one({"id": reservation_id}, {"$set": patch})
    return True


async def release(db, reservation_id: str) -> bool:
    """Batch abandoned. CAS off 'reserved' so a concurrent commit/expire that
    already moved it cannot be overwritten."""
    if not reservation_id:
        return False
    await db.ensure_table(COLLECTION)
    claimed = await db.face_quota_reservations.find_one_and_update(
        {"id": reservation_id, "status": "reserved"},
        {"$set": {"status": "released", "released_at": _iso(_now())}})
    return bool(claimed)


async def sweep_expired(db, limit: int = 500) -> int:
    """Mark timed-out holds expired. Cosmetic rather than load-bearing —
    `_live_reservations` already ignores anything past its TTL — but it keeps
    the collection honest for the dashboard and stops it growing unbounded in
    'reserved'."""
    await db.ensure_table(COLLECTION)
    now_iso = _iso(_now())
    rows = await db.face_quota_reservations.find(
        {"status": "reserved", "expires_at": {"$lt": now_iso}}, {"_id": 0, "id": 1}
    ).limit(limit).to_list(limit)
    n = 0
    for r in rows:
        claimed = await db.face_quota_reservations.find_one_and_update(
            {"id": r["id"], "status": "reserved"},
            {"$set": {"status": "expired", "released_at": now_iso}})
        if claimed:
            n += 1
    if n:
        logger.info("[face_quota] swept %d expired reservations", n)
    return n


async def ensure_indexes(db) -> None:
    await db.ensure_table(COLLECTION)
    for keys, name in (([("profile_id", 1), ("status", 1)], "face_quota_res_profile_status"),
                       ([("expires_at", 1)], "face_quota_res_expires")):
        try:
            await db.face_quota_reservations.create_index(keys, name=name)
        except Exception as e:
            logger.warning("[face_quota] index %s failed: %s", name, e)


def extension_options() -> Dict[str, Any]:
    """Quota top-up choices, priced by the CANONICAL catalogue only.

    The owner-approved price book has three numbered face-match SKUs
    (2000/3000/5000) and a WhatsApp custom quote — there is no +500/+1000 SKU.
    Inventing one here would put an unapproved price in front of a buyer, so
    this returns what actually exists and lets the UI offer the custom quote
    for anything else.
    """
    import pricing_catalog
    return {
        "tiers": [{"key": t["key"], "photos": t["photos"], "price_inr": t["price_inr"]}
                  for t in pricing_catalog.FACE_MATCH_TIERS],
        "custom_whatsapp": True,
    }
