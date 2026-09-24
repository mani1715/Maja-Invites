"""
test_leader_lock_failclosed.py -- cache_backend.acquire_lock must fail
CLOSED (deny leadership) once REDIS_URL is configured and the Redis call
raises, and must keep failing OPEN (grant leadership) only when there is no
REDIS_URL at all -- single-process dev mode, nothing else to race with.

    cd backend && pytest tests/test_leader_lock_failclosed.py -q

Why this matters: 4 uvicorn workers in prod each race to become leader for
the scheduled jobs (gallery cleanup, usage flush, storage pool jobs, expiry
sweep) via acquire_lock(). Before this fix, ANY Redis exception -- even with
REDIS_URL configured -- returned True, so a Redis blip mid-run made every
worker "the" leader and every job ran 4x concurrently. Skipping one cleanup
cycle is cheaper than that.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache_backend  # noqa: E402


def _patch_redis(monkeypatch, client_or_none):
    """Same monkeypatch idiom as tests/test_usage_metering.py -- stub
    cache_backend._get_redis so no real Redis/network is ever touched."""
    async def _fake_get_redis():
        return client_or_none
    monkeypatch.setattr(cache_backend, "_get_redis", _fake_get_redis)


class _RaisingRedis:
    """Stands in for a Redis client whose connection just dropped mid-run."""
    async def set(self, *a, **k):
        raise ConnectionError("redis dropped mid-run")


async def test_no_redis_url_still_grants_lock(monkeypatch):
    """Dev / single-worker mode: no REDIS_URL configured at all -> unchanged
    behaviour, always wins the lock (there's only one process to race)."""
    monkeypatch.delenv("REDIS_URL", raising=False)
    _patch_redis(monkeypatch, None)  # what _get_redis naturally returns w/o a URL
    assert await cache_backend.acquire_lock("test:lock:a", 30) is True


async def test_redis_url_configured_and_raising_denies_lock(monkeypatch):
    """REDIS_URL IS configured, but the SET NX call raises (Redis dropped
    mid-run) -> fail CLOSED, not True. Better to skip a cleanup cycle than
    have every worker believe it's the leader."""
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")
    _patch_redis(monkeypatch, _RaisingRedis())
    assert await cache_backend.acquire_lock("test:lock:b", 30) is False


async def test_redis_url_configured_but_client_unavailable_denies_lock(monkeypatch):
    """r is None (client never initialised, e.g. init raised) is the OTHER way
    _get_redis can fail once REDIS_URL is set -- must land on the same
    fail-closed answer as the mid-run-raise case above."""
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")
    _patch_redis(monkeypatch, None)
    assert await cache_backend.acquire_lock("test:lock:c", 30) is False
