"""
usage_metering.py -- Lane A7: per-event usage counters -> COGS.

Every metered event (photo uploaded, face indexed, face search hitting the
provider, ...) is buffered in Redis (HINCRBY on one hash, 'usage:pending',
field '{scope_id}|{metric}') exactly like cache_backend.view_track_redis
buffers view counts -- so a viral gallery never contends on a DB row. A
leader-locked background loop (usage_flush_loop, wired in server.py) drains
that hash every 300s into db.usage_records as daily rollup docs:
    {scope_id, date: 'YYYY-MM-DD', metric, amount}

With no REDIS_URL configured, record_usage falls back to a process-local
dict -- correct for the single-worker deploy the app ships with (mirrors
cache_backend's own in-memory fallback).

COGS estimates reuse profitability.py's env-configurable INR rates (imports
its `_rate` helper rather than duplicating the env var names/defaults).

    from usage_metering import build_usage_router, usage_flush_loop, record_usage
    app.include_router(build_usage_router(db, require_admin, require_super_admin))
    asyncio.create_task(usage_flush_loop(db))
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException

import cache_backend
from profitability import _rate
from system_health import record_job_run

logger = logging.getLogger("usage_metering")

# Reference only (not enforced -- ponytail: a stray metric name just shows up
# in the rollup under its own key, no schema to keep in sync).
METRICS = (
    "photo_uploaded", "photo_bytes", "duplicate_skipped",
    "face_index", "faces_indexed", "face_search", "face_search_cached",
    "download_manifest", "live_photo_uploaded",
)

PENDING_KEY = "usage:pending"

# ponytail: process-local fallback when Redis is unavailable (single-worker
# deploys only -- matches cache_backend._mem_counters/_mem_kv).
_mem_pending: Dict[str, int] = {}


async def record_usage(metric: str, scope_id: str, amount: int = 1) -> None:
    """Buffer one usage event. Never raises -- metering must not break the
    request it's instrumenting."""
    field = f"{scope_id}|{metric}"
    try:
        r = await cache_backend._get_redis()
        if r is not None:
            await r.hincrby(PENDING_KEY, field, amount)
            return
    except Exception as e:
        logger.warning("[usage] record_usage redis failed (%s); memory fallback", e)
    _mem_pending[field] = _mem_pending.get(field, 0) + amount


async def flush_usage(db) -> Dict[str, int]:
    """Atomically drain the buffered counters (HGETALL+DEL in one pipeline --
    the GETDEL-equivalent for a hash) and roll them up into db.usage_records.
    Single flusher (leader-locked in server.py), so find_one_and_update's
    non-atomic upsert branch never races. Returns the drained {field: amount}
    map (empty dict when nothing was pending)."""
    drained: Dict[str, int] = {}

    r = await cache_backend._get_redis()
    if r is not None:
        try:
            pipe = r.pipeline()
            pipe.hgetall(PENDING_KEY)
            pipe.delete(PENDING_KEY)
            raw, _ = await pipe.execute()
            for field, amount in (raw or {}).items():
                drained[field] = drained.get(field, 0) + int(amount)
        except Exception as e:
            logger.warning("[usage] flush_usage redis drain failed (%s)", e)

    if _mem_pending:
        for field, amount in list(_mem_pending.items()):
            drained[field] = drained.get(field, 0) + amount
        _mem_pending.clear()

    if not drained:
        return drained

    date = datetime.now(timezone.utc).date().isoformat()
    for field, amount in drained.items():
        scope_id, metric = field.split("|", 1)
        await db.usage_records.find_one_and_update(
            {"scope_id": scope_id, "date": date, "metric": metric},
            {"$inc": {"amount": amount}},
            upsert=True,
        )
    return drained


async def usage_flush_loop(db) -> None:
    """Background loop -- wakes every 300s, and if this worker wins the
    leader lock, drains the pending counters and records a heartbeat.
    Mirrors server.py's _expiry_sweep_loop (Redis lock re-acquired every
    iteration; with no Redis, acquire_lock always returns True so a
    single-worker deploy just flushes every interval)."""
    while True:
        try:
            if await cache_backend.acquire_lock("usage_flush_leader", 290):
                await flush_usage(db)
                await record_job_run(db, "usage_flush")
        except Exception as e:
            logger.warning("[usage] flush loop error: %s", e)
        await asyncio.sleep(300)


def _cogs(totals: Dict[str, int]) -> dict:
    """Estimated COGS from raw usage totals, using profitability.py's rates.
    face_search_cached is excluded on purpose: a cache hit never calls the
    provider, so it costs nothing."""
    storage_rate = _rate("STORAGE_COST_INR_PER_GB", 2.0)
    face_rate = _rate("REKOGNITION_COST_INR", 0.10)
    storage_inr = round((totals.get("photo_bytes", 0) / (1024 ** 3)) * storage_rate, 2)
    face_ops = totals.get("face_index", 0) + totals.get("face_search", 0)
    face_inr = round(face_ops * face_rate, 2)
    return {
        "storage_inr": storage_inr,
        "face_inr": face_inr,
        "total_inr": round(storage_inr + face_inr, 2),
        "assumptions": {
            "storage_inr_per_gb": storage_rate,
            "rekognition_inr_per_op": face_rate,
            "note": "photo_bytes x storage rate + (face_index + face_search) x "
                    "rekognition rate; face_search_cached excluded (no provider call). "
                    "Estimate, not accounting.",
        },
    }


def build_usage_router(db, require_admin, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["usage-metering"])

    @router.get("/api/admin/usage/{profile_id}")
    async def profile_usage(profile_id: str, admin: dict = Depends(require_admin)):
        profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        if (admin.get("role") != "super_admin"
                and profile.get("admin_id") != admin.get("admin_id")):
            raise HTTPException(status_code=403, detail="Not authorized for this profile")

        rows = await db.usage_records.find({"scope_id": profile_id}, {"_id": 0}).to_list(20000)
        totals: Dict[str, int] = {}
        for row in rows:
            totals[row["metric"]] = totals.get(row["metric"], 0) + int(row.get("amount") or 0)

        return {
            "profile_id": profile_id,
            "rows": sorted(rows, key=lambda r: (r.get("date") or "", r.get("metric") or "")),
            "totals": totals,
            "estimated_cogs": _cogs(totals),
        }

    # require_super_admin returns the admin_id string (not a dict) -- see
    # auth.py -- used purely as an auth gate here, same as elsewhere in the app.
    @router.get("/api/super-admin/usage/summary")
    async def super_usage_summary(_admin=Depends(require_super_admin)):
        rows = await db.usage_records.find({}, {"_id": 0}).to_list(200000)
        platform_totals: Dict[str, int] = {}
        by_scope: Dict[str, int] = {}
        for row in rows:
            amt = int(row.get("amount") or 0)
            metric = row.get("metric") or "unknown"
            scope_id = row.get("scope_id") or "unknown"
            platform_totals[metric] = platform_totals.get(metric, 0) + amt
            by_scope[scope_id] = by_scope.get(scope_id, 0) + amt

        top_events = sorted(platform_totals.items(), key=lambda kv: -kv[1])[:20]
        top_scopes = sorted(by_scope.items(), key=lambda kv: -kv[1])[:20]
        return {
            "platform_totals": platform_totals,
            "estimated_cogs": _cogs(platform_totals),
            "top_events": [{"metric": m, "amount": n} for m, n in top_events],
            "top_scopes": [{"scope_id": s, "amount": n} for s, n in top_scopes],
        }

    return router
