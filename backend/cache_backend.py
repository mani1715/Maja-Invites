"""
cache_backend.py — Redis-or-memory backend for lightweight rate limiting.

If REDIS_URL is set, counters live in Redis and are therefore shared across
uvicorn workers / replicas (multi-worker safe). If not, it falls back to a
process-local in-memory store — correct for the single-worker deployment the
app ships with, just not shared across workers.

This is the foundation for moving the rest of the in-memory state (OTP store,
the legacy abuse limiter) to Redis when scaling to multiple workers.
"""
from __future__ import annotations
import os
import time
import json
import logging

logger = logging.getLogger("cache")

_redis_client = None
_redis_tried = False
# key -> [count, window_start_epoch]
_mem_counters: dict = {}
# key -> (json-able value, expiry_epoch)  — fallback store for kv_* helpers
_mem_kv: dict = {}


async def _get_redis():
    """Lazily build (and cache) an async Redis client, or None if unavailable."""
    global _redis_client, _redis_tried
    if _redis_tried:
        return _redis_client
    _redis_tried = True
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(
            url, decode_responses=True,
            socket_connect_timeout=2,
            # socket_timeout bounds each individual command (GET/SET/INCR/...);
            # without it a hung TCP connection (as opposed to a refused one,
            # which socket_connect_timeout already covers) can block a request
            # indefinitely. Env-tunable per deploy.
            socket_timeout=float(os.environ.get("REDIS_SOCKET_TIMEOUT", "5")),
        )
        logger.info("[cache] Redis backend enabled for rate limiting")
    except Exception as e:
        logger.warning("[cache] Redis init failed (%s); using in-memory fallback", e)
        _redis_client = None
    return _redis_client


async def rate_limit_allow(key: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window rate limit. Returns True if the call is allowed, False if the
    caller has exceeded `limit` within `window_seconds`. Never raises — on any
    backend error it falls back to the in-memory window (fail-open is acceptable
    here; this guards abuse, not authorization)."""
    r = await _get_redis()
    if r is not None:
        try:
            n = await r.incr(key)
            if n == 1:
                await r.expire(key, window_seconds)
            return int(n) <= limit
        except Exception as e:
            logger.warning("[cache] redis rate-limit failed (%s); memory fallback", e)

    now = time.time()
    entry = _mem_counters.get(key)
    if not entry or (now - entry[1]) >= window_seconds:
        _mem_counters[key] = [1, now]
        count = 1
    else:
        entry[0] += 1
        count = entry[0]
    # Opportunistic cleanup so the dict can't grow unbounded under a flood.
    if len(_mem_counters) > 10000:
        cutoff = now - window_seconds
        for k in [k for k, v in _mem_counters.items() if v[1] < cutoff]:
            _mem_counters.pop(k, None)
    return count <= limit


async def redis_info() -> dict:
    """Small subset of Redis INFO for the health/metrics dashboards. Never
    raises; {'available': False} when Redis isn't configured or the probe
    fails."""
    r = await _get_redis()
    if r is None:
        return {"available": False}
    try:
        info = await r.info()
        hits = int(info.get("keyspace_hits", 0))
        misses = int(info.get("keyspace_misses", 0))
        total = hits + misses
        return {
            "available": True,
            "used_memory": info.get("used_memory"),
            "used_memory_human": info.get("used_memory_human"),
            "keyspace_hits": hits,
            "keyspace_misses": misses,
            "connected_clients": info.get("connected_clients"),
            "evicted_keys": info.get("evicted_keys", 0),
            "hit_rate": round(hits / total, 4) if total else 0.0,
        }
    except Exception as e:
        logger.warning("[cache] redis_info failed (%s)", e)
        return {"available": False}


# ---------------------------------------------------------------------------
# Shared key/value with TTL — Redis when available, else process-local memory.
# This is what lets state that MUST be shared across uvicorn workers (the OTP
# store) survive when the app runs with --workers > 1. With no REDIS_URL the
# app is single-worker, so the in-memory fallback is correct there too.
# ---------------------------------------------------------------------------
async def kv_set_json(key: str, value, ttl_seconds: int) -> None:
    # default=str so a stray datetime/Decimal never makes a payload uncacheable
    # (pg_adapter already returns JSON-safe values, but be defensive).
    r = await _get_redis()
    if r is not None:
        try:
            await r.set(key, json.dumps(value, default=str), ex=ttl_seconds)
            return
        except Exception as e:
            logger.warning("[cache] redis kv_set failed (%s); memory fallback", e)
    _mem_kv[key] = (value, time.time() + ttl_seconds)


async def kv_get_json(key: str):
    r = await _get_redis()
    if r is not None:
        try:
            raw = await r.get(key)
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.warning("[cache] redis kv_get failed (%s); memory fallback", e)
    ent = _mem_kv.get(key)
    if not ent:
        return None
    value, exp = ent
    if time.time() > exp:
        _mem_kv.pop(key, None)
        return None
    return value


async def kv_del(key: str) -> None:
    r = await _get_redis()
    if r is not None:
        try:
            await r.delete(key)
            return
        except Exception as e:
            logger.warning("[cache] redis kv_del failed (%s); memory fallback", e)
    _mem_kv.pop(key, None)


async def queue_push(queue: str, payload: dict) -> bool:
    """LPUSH a JSON job onto `queue`. Returns False when Redis is unavailable —
    callers must fall back to running the job inline (never raises)."""
    r = await _get_redis()
    if r is None:
        return False
    try:
        await r.lpush(queue, json.dumps(payload, default=str))
        return True
    except Exception as e:
        logger.warning("[cache] queue_push failed (%s)", e)
        return False


async def queue_pop_blocking(queue: str, timeout: int = 5) -> dict | None:
    """BRPOP one job off `queue`, blocking up to `timeout` seconds. Returns None
    on timeout, no Redis, or any error — the worker loop just tries again."""
    r = await _get_redis()
    if r is None:
        return None
    try:
        res = await r.brpop(queue, timeout=timeout)
        if not res:
            return None
        _, raw = res
        return json.loads(raw)
    except Exception as e:
        logger.warning("[cache] queue_pop_blocking failed (%s)", e)
        return None


async def queue_length(queue: str) -> int:
    """Current depth of a Redis list queue (LLEN). No Redis => nothing is
    ever queued (callers fall back to running the job inline), so the
    in-memory depth is always 0."""
    r = await _get_redis()
    if r is None:
        return 0
    try:
        return int(await r.llen(queue))
    except Exception as e:
        logger.warning("[cache] queue_length failed (%s)", e)
        return 0


def _redis_configured() -> bool:
    """True when REDIS_URL is set, independent of whether the client actually
    connected. acquire_lock uses this (not `_get_redis() is not None`) to tell
    "no Redis was ever meant to run here" apart from "Redis was supposed to be
    here and isn't answering" — only the first case is safe to treat as a
    single-process deploy."""
    return bool(os.environ.get("REDIS_URL"))


async def acquire_lock(key: str, ttl_seconds: int) -> bool:
    """Best-effort distributed lock (SET key val NX EX). Returns True to the ONE
    caller that wins it. Used so a singleton job (the cleanup scheduler) runs in
    exactly one worker. With no Redis there is only one process, so it always
    wins — which is the correct answer for a single-worker deploy.

    Asymmetric on purpose, unlike every other fallback in this module: rate
    limits and kv fail OPEN on a Redis error (fall back to in-memory — low
    stakes, and the feature keeps working). The lock cannot fail open once
    REDIS_URL is configured for a multi-worker deploy (4 uvicorn workers in
    prod): if Redis drops mid-run and every worker "assumed leader", all 4
    would run every scheduled job (gallery cleanup, usage flush, storage pool
    jobs, expiry sweep) concurrently. Skipping one cleanup cycle is cheaper
    than that, so a configured-but-unreachable Redis DENIES the lock. Only the
    genuinely no-REDIS_URL case (nothing else to race with) still returns
    True.
    """
    r = await _get_redis()
    if r is not None:
        try:
            return bool(await r.set(key, "1", nx=True, ex=ttl_seconds))
        except Exception as e:
            logger.warning("[cache] redis acquire_lock failed (%s); denying lock (fail-closed)", e)
            return False
    if _redis_configured():
        # Client never came up (e.g. init raised in _get_redis) even though
        # REDIS_URL is set — same fail-closed answer as a mid-run raise above.
        logger.warning("[cache] REDIS_URL configured but Redis client unavailable; denying lock (fail-closed)")
        return False
    return True


async def renew_lock(key: str, ttl_seconds: int) -> bool:
    """Extend a lock the current worker already holds (leader heartbeat).

    Returns True while leadership is still held, False when it can no longer be
    confirmed — Redis unreachable, or the key has vanished (expired / taken) —
    so the caller can self-demote instead of running a duplicate singleton. With
    no REDIS_URL there is only one process, so it always returns True.

    ponytail: renews by key name, not a per-holder token — good enough for a
    120s-TTL singleton scheduler; a token + Lua compare-and-expire is the upgrade
    if a contended, short-TTL lock ever needs strict ownership."""
    r = await _get_redis()
    if r is not None:
        try:
            # expire() is truthy only if the key still exists (we still hold it).
            return bool(await r.expire(key, ttl_seconds))
        except Exception as e:
            logger.warning("[cache] redis renew_lock failed (%s); treating leadership as lost", e)
            return False
    if _redis_configured():
        return False   # configured but client unavailable — can't confirm leadership
    return True        # no Redis: single process, always leader


# ---------------------------------------------------------------------------
# Invitation view counters — buffered in Redis to kill hot-row write contention.
# Every view used to UPDATE the same profiles row ($inc view_count); a single
# hot invitation (or a single-slug load test) serialised all of them on one row
# lock. Buffering the counts in Redis and flushing periodically means even a
# viral link never contends: one batched UPDATE per profile per flush interval.
# ---------------------------------------------------------------------------
_VIEW_IPS_TTL = 60 * 60 * 24 * 45  # keep the per-invite unique-IP set ~45 days


async def view_track_redis(profile_id: str, client_ip: str):
    """Buffer one view. Returns (handled, is_new_visitor).
    handled=False means Redis is unavailable — the caller must fall back to the
    direct-DB path so single-worker/no-Redis deploys still count views."""
    r = await _get_redis()
    if r is None:
        return (False, False)
    try:
        pipe = r.pipeline()
        pipe.incr(f"view:cnt:{profile_id}")           # total views (delta)
        pipe.sadd("view:dirty", profile_id)           # mark for the flush job
        pipe.sadd(f"view:ips:{profile_id}", client_ip)  # -> 1 if a new visitor
        pipe.expire(f"view:ips:{profile_id}", _VIEW_IPS_TTL)
        res = await pipe.execute()
        is_new = bool(res[2])
        if is_new:
            await r.incr(f"view:uniq:{profile_id}")   # unique visitors (delta)
        return (True, is_new)
    except Exception as e:
        logger.warning("[cache] view_track failed (%s); DB fallback", e)
        return (False, False)


async def view_flush_redis() -> dict:
    """Atomically drain the buffered counters. Returns {profile_id: (views, uniq)}.
    Called by the single-leader flush job; GETDEL makes read-and-reset atomic so
    concurrent increments from other workers are never double-counted or lost."""
    r = await _get_redis()
    if r is None:
        return {}
    out: dict = {}
    try:
        pids = await r.smembers("view:dirty")
        for pid in pids:
            await r.srem("view:dirty", pid)
            v = await r.getdel(f"view:cnt:{pid}")
            u = await r.getdel(f"view:uniq:{pid}")
            vi, ui = int(v or 0), int(u or 0)
            if vi or ui:
                out[pid] = (vi, ui)
    except Exception as e:
        logger.warning("[cache] view_flush failed (%s)", e)
    return out


def client_ip(request) -> str:
    """Real client IP, safe against X-Forwarded-For spoofing.

    X-Forwarded-For is client-supplied and forgeable. Trusting the FIRST entry
    unconditionally (the old behavior) let an attacker mint a fresh rate-limit
    bucket per request by rotating a fake XFF — defeating every per-IP brute
    force / enumeration lock in the app.

    Policy (env TRUSTED_PROXY_COUNT, default 0):
      * 0  → ignore XFF entirely, use the direct TCP peer (request.client.host).
             Correct default: unspoofable, right for a direct-exposed server.
      * N>0 → trust exactly N proxy hops in front of us and take the
             (N+1)-th-from-the-right XFF entry — the IP the outermost trusted
             proxy saw. Set this to the number of real proxies (e.g. 1 behind a
             single Caddy/LB) so the genuine client IP is used, not a forged one.
    """
    try:
        n = int(os.environ.get("TRUSTED_PROXY_COUNT", "0"))
    except (TypeError, ValueError):
        n = 0
    peer = request.client.host if request.client else "unknown"
    if n <= 0:
        return peer
    fwd = request.headers.get("x-forwarded-for")
    if not fwd:
        return peer
    parts = [p.strip() for p in fwd.split(",") if p.strip()]
    if not parts:
        return peer
    # take the entry the outermost trusted proxy appended (n-from-right)
    idx = len(parts) - n
    return parts[idx] if 0 <= idx < len(parts) else parts[0]
