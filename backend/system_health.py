"""
system_health.py — the Super-Admin System-Health dashboard (Phase 2).

Aggregates REAL health signals (never faked): API liveness, DB reachability +
latency, AWS S3 / Rekognition / CloudFront (via aws_service.healthcheck), email
+ SMS provider status, connected Google-Drive storage accounts, background-job
heartbeats, and the queue model. Every probe is fully guarded — a missing key or
an unreachable provider degrades gracefully to `not_configured` / `down` and can
never take the endpoint down.

Job heartbeats: `record_job_run(db, name)` writes a `job_heartbeats` row when a
scheduled job runs; the dashboard reads it and flags a job "stale" if it hasn't
reported within `JOB_STALE_HOURS`. (Wired into storage_pool_jobs.run_daily.)

    from system_health import build_system_health_router, record_job_run
    app.include_router(build_system_health_router(db, require_admin))
"""
from __future__ import annotations

import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends

logger = logging.getLogger("system_health")

JOB_STALE_HOURS = 26          # a daily job that hasn't run in > 26h is stale
OK, DEGRADED, DOWN, NC, UNKNOWN = "ok", "degraded", "down", "not_configured", "unknown"


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def record_job_run(db, name: str, meta: Optional[dict] = None) -> None:
    """Called by a scheduled job when it runs, so the dashboard can show last-run."""
    try:
        row = await db.job_heartbeats.find_one({"name": name}, {"_id": 0})
        doc = {"name": name, "last_run": _now().isoformat(), "meta": meta or {}}
        if row:
            await db.job_heartbeats.update_one({"name": name}, {"$set": doc})
        else:
            await db.job_heartbeats.insert_one(doc)
    except Exception as e:
        logger.warning("[health] record_job_run(%s) failed: %s", name, e)


def _age_hours(iso: Optional[str]) -> Optional[float]:
    if not iso:
        return None
    try:
        return round((_now() - datetime.fromisoformat(iso)).total_seconds() / 3600.0, 2)
    except Exception:
        return None


def _comp(key, label, status, detail="", **extra) -> Dict[str, Any]:
    return {"key": key, "label": label, "status": status, "detail": detail, **extra}


async def _check_database(db) -> Dict[str, Any]:
    t0 = time.time()
    try:
        await db.profiles.count_documents({})
        return _comp("database", "Database", OK, "reachable",
                     latency_ms=round((time.time() - t0) * 1000, 1))
    except Exception as e:
        return _comp("database", "Database", DOWN, str(e)[:200])


LONG_QUERY_SECONDS = 30


async def _check_postgres(db) -> Dict[str, Any]:
    """Connection count, DB size, long-running query count — via the pool's
    raw SQL path (same sanctioned pool access as storage/orchestrator._reserve)."""
    pool = getattr(db, "pool", None)
    if pool is None:
        return _comp("postgres", "PostgreSQL", UNKNOWN, "pool unavailable")
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(f"""
                SELECT
                  (SELECT count(*) FROM pg_stat_activity
                     WHERE datname = current_database()) AS active_connections,
                  (SELECT count(*) FROM pg_stat_activity
                     WHERE datname = current_database() AND state <> 'idle'
                       AND now() - query_start > interval '{LONG_QUERY_SECONDS} seconds')
                     AS long_running,
                  pg_size_pretty(pg_database_size(current_database())) AS db_size
            """)
        return _comp("postgres", "PostgreSQL", OK,
                     f"{row['db_size']}, {row['active_connections']} connections",
                     active_connections=row["active_connections"],
                     database_size=row["db_size"],
                     long_running_queries=row["long_running"])
    except Exception as e:
        return _comp("postgres", "PostgreSQL", UNKNOWN, str(e)[:200])


REDIS_HIT_RATE_WARN = 0.5
REDIS_LOOKUPS_WARN = 10000


async def _check_redis() -> Dict[str, Any]:
    try:
        import cache_backend
        info = await cache_backend.redis_info()
        if not info.get("available"):
            return _comp("redis", "Redis", NC, "not configured")
        hits, misses = info.get("keyspace_hits", 0), info.get("keyspace_misses", 0)
        total = hits + misses
        hit_rate, evicted = info.get("hit_rate", 0.0), info.get("evicted_keys") or 0
        warn = (total > REDIS_LOOKUPS_WARN and hit_rate < REDIS_HIT_RATE_WARN) or evicted > 0
        return _comp("redis", "Redis", DEGRADED if warn else OK,
                     f"{info.get('used_memory_human')}, hit_rate {hit_rate:.0%}",
                     used_memory=info.get("used_memory"), hit_rate=hit_rate,
                     evicted_keys=evicted, connected_clients=info.get("connected_clients"))
    except Exception as e:
        return _comp("redis", "Redis", UNKNOWN, str(e)[:120])


def _check_aws() -> List[Dict[str, Any]]:
    """S3 + Rekognition + CloudFront from aws_service.healthcheck() — guarded."""
    try:
        import aws_service
        hc = aws_service.healthcheck() or {}
    except Exception as e:
        return [_comp("storage_s3", "S3 storage", UNKNOWN, f"probe failed: {str(e)[:120]}"),
                _comp("rekognition", "Rekognition", UNKNOWN, "probe failed"),
                _comp("cloudfront", "CloudFront", UNKNOWN, "probe failed")]
    if not hc.get("configured"):
        nc = "AWS not configured (set AWS keys + bucket)"
        return [_comp("storage_s3", "S3 storage", NC, nc),
                _comp("rekognition", "Rekognition", NC, nc),
                _comp("cloudfront", "CloudFront", NC, nc)]
    s3 = OK if hc.get("s3_reachable") else DOWN
    rek = (OK if hc.get("rekognition_reachable") else
           (DOWN if "rekognition_error" in hc else NC))
    cf = OK if hc.get("cf_domain") else NC
    return [
        _comp("storage_s3", "S3 storage", s3, hc.get("s3_error") or f"bucket {hc.get('bucket')}"),
        _comp("rekognition", "Rekognition", rek, hc.get("rekognition_error") or "face index/search"),
        _comp("cloudfront", "CloudFront", cf, hc.get("cf_domain") or "no CDN domain set"),
    ]


def _check_email() -> Dict[str, Any]:
    try:
        import email_service
        st = email_service.email_provider_status() or {}
        prov = st.get("provider", "dev")
        ok = bool(st.get("configured") or st.get("ok"))
        return _comp("email", "Email", OK if ok and prov != "dev" else (NC if prov == "dev" else DEGRADED),
                     f"provider: {prov}")
    except Exception as e:
        return _comp("email", "Email", UNKNOWN, str(e)[:120])


def _check_sms() -> Dict[str, Any]:
    try:
        import sms_service
        st = sms_service.sms_provider_status() or {}
        prov = st.get("provider", "none")
        ok = bool(st.get("configured") or st.get("ok"))
        return _comp("sms", "SMS", OK if ok and prov not in ("none", "dev") else (NC if prov in ("none", "dev") else DEGRADED),
                     f"provider: {prov}")
    except Exception as e:
        return _comp("sms", "SMS", UNKNOWN, str(e)[:120])


async def _check_drive(db) -> Dict[str, Any]:
    """Connected Google-Drive storage-pool accounts (platform storage backend)."""
    try:
        rows = await db.storage_accounts.find({}, {"_id": 0}).to_list(1000)
        connected = [r for r in rows if not r.get("disabled") and (r.get("access_token") or r.get("refresh_token") or r.get("connected"))]
        if not rows:
            return _comp("google_drive", "Google Drive pool", NC, "no drive accounts connected")
        status = OK if connected else DEGRADED
        return _comp("google_drive", "Google Drive pool", status,
                     f"{len(connected)}/{len(rows)} accounts active", accounts=len(rows), active=len(connected))
    except Exception as e:
        return _comp("google_drive", "Google Drive pool", UNKNOWN, str(e)[:120])


QUEUE_WARN_DEPTH = 500  # face-recognition queue depth above this => degraded


async def _check_queue() -> Dict[str, Any]:
    """Face-recognition job queue depth (Redis LLEN via cache_backend)."""
    try:
        import cache_backend
        import face_queue
        depth = await cache_backend.queue_length(face_queue.QUEUE)
        status = DEGRADED if depth > QUEUE_WARN_DEPTH else OK
        return _comp("queue", "Job queue", status, f"face queue depth: {depth}", depth=depth)
    except Exception as e:
        return _comp("queue", "Job queue", UNKNOWN, str(e)[:120])


async def _jobs(db) -> List[Dict[str, Any]]:
    try:
        rows = await db.job_heartbeats.find({}, {"_id": 0}).to_list(200)
    except Exception:
        rows = []
    out = []
    for r in rows:
        age = _age_hours(r.get("last_run"))
        out.append({"name": r.get("name"), "last_run": r.get("last_run"),
                    "age_hours": age, "stale": (age is None or age > JOB_STALE_HOURS)})
    out.sort(key=lambda j: j.get("name") or "")
    return out


async def gather_health(db) -> Dict[str, Any]:
    components: List[Dict[str, Any]] = [_comp("api", "API", OK, "responding")]
    components.append(await _check_database(db))
    components.append(await _check_postgres(db))
    components.extend(_check_aws())
    components.append(_check_email())
    components.append(_check_sms())
    components.append(await _check_drive(db))
    components.append(await _check_queue())
    components.append(await _check_redis())

    jobs = await _jobs(db)

    # Overall: DOWN if a critical component is down; DEGRADED on any degraded/down
    # non-critical or a stale job; NC alone does not degrade (expected pre-config).
    critical = {"database"}
    overall = OK
    if any(c["status"] == DOWN and c["key"] in critical for c in components):
        overall = DOWN
    elif any(c["status"] in (DOWN, DEGRADED) for c in components) or any(j["stale"] for j in jobs):
        overall = DEGRADED
    return {"overall": overall, "generated_at": _now().isoformat(),
            "components": components, "jobs": jobs}


def build_system_health_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["system-health"])

    @router.get("/api/admin/system/health")
    async def system_health(admin=Depends(require_admin)):
        return await gather_health(db)

    return router
