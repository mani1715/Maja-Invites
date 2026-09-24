"""
test_system_health.py — System-Health aggregation on the in-memory FakeDB.

    cd backend && python -m tests.test_system_health

Proves gather_health() never throws, reports every component, computes DB
latency, reads job heartbeats, flags stale jobs, and rolls the overall status up
correctly — all without Postgres, AWS, or a network.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.pop("REDIS_URL", None)

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import cache_backend                                          # noqa: E402
import system_health as sh                                   # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


def keys(h):
    return {c["key"] for c in h["components"]}


async def main():
    db = FakeDB()
    await db.profiles.insert_one({"id": "p1", "studio_name": "X"})

    # --- baseline health ------------------------------------------------------
    h = await sh.gather_health(db)
    ok("returns overall status", h["overall"] in (sh.OK, sh.DEGRADED, sh.DOWN))
    ok("all components present", keys(h) >= {"api", "database", "postgres", "storage_s3", "rekognition",
                                             "cloudfront", "email", "sms", "google_drive", "queue", "redis"})
    api = next(c for c in h["components"] if c["key"] == "api")
    dbc = next(c for c in h["components"] if c["key"] == "database")
    ok("api reports ok", api["status"] == sh.OK)
    ok("database reachable + latency measured", dbc["status"] == sh.OK and "latency_ms" in dbc)
    aws = next(c for c in h["components"] if c["key"] == "storage_s3")
    ok("aws probe never throws (nc/unknown/ok/down)", aws["status"] in (sh.NC, sh.UNKNOWN, sh.OK, sh.DOWN))
    ok("no jobs yet", h["jobs"] == [])
    # With no external providers configured, nothing critical is down.
    ok("overall not down when db is up", h["overall"] != sh.DOWN)

    # --- job heartbeat: fresh = not stale ------------------------------------
    await sh.record_job_run(db, "storage_pool_daily", {"orphans": 0})
    h = await sh.gather_health(db)
    job = next(j for j in h["jobs"] if j["name"] == "storage_pool_daily")
    ok("heartbeat recorded", job["last_run"] is not None)
    ok("fresh job not stale", job["stale"] is False)

    # record_job_run upserts (no duplicate)
    await sh.record_job_run(db, "storage_pool_daily", {"orphans": 1})
    hb = await db.job_heartbeats.find({"name": "storage_pool_daily"}, {"_id": 0}).to_list(10)
    ok("heartbeat upserts (single row)", len(hb) == 1)

    # --- stale job => overall degraded ---------------------------------------
    old = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    await db.job_heartbeats.insert_one({"name": "old_job", "last_run": old, "meta": {}})
    h = await sh.gather_health(db)
    oldj = next(j for j in h["jobs"] if j["name"] == "old_job")
    ok("old job flagged stale", oldj["stale"] is True and oldj["age_hours"] > 26)
    ok("stale job degrades overall", h["overall"] == sh.DEGRADED)

    # --- drive states ---------------------------------------------------------
    h = await sh.gather_health(db)
    drive = next(c for c in h["components"] if c["key"] == "google_drive")
    ok("no drive accounts => not_configured", drive["status"] == sh.NC)

    db2 = FakeDB()
    await db2.profiles.insert_one({"id": "p1"})
    await db2.storage_accounts.insert_one({"id": "d1", "connected": True})
    h2 = await sh.gather_health(db2)
    drive2 = next(c for c in h2["components"] if c["key"] == "google_drive")
    ok("connected drive account => ok", drive2["status"] == sh.OK)

    # --- postgres: FakeDB has no real asyncpg pool -> graceful unknown --------
    pg = await sh._check_postgres(db)
    ok("no pool => postgres unknown, no throw", pg["status"] == sh.UNKNOWN)

    # --- redis: no REDIS_URL -> not_configured, no throw -----------------------
    rd = await sh._check_redis()
    ok("no redis => not_configured, no throw", rd["status"] == sh.NC)

    # --- both new components monkeypatched to fail: aggregator never throws ---
    class _BoomPool:
        def acquire(self):
            raise RuntimeError("pool boom")

    db3 = FakeDB()
    await db3.profiles.insert_one({"id": "p1"})
    db3.pool = _BoomPool()

    async def _boom_redis_info():
        raise RuntimeError("redis boom")

    orig_redis_info = cache_backend.redis_info
    cache_backend.redis_info = _boom_redis_info
    try:
        pg_fail = await sh._check_postgres(db3)
        ok("broken pool => postgres unknown, no throw", pg_fail["status"] == sh.UNKNOWN)
        rd_fail = await sh._check_redis()
        ok("broken redis probe => unknown, no throw", rd_fail["status"] == sh.UNKNOWN)
        h3 = await sh.gather_health(db3)
        ok("gather_health still returns with both new components failing",
           h3["overall"] in (sh.OK, sh.DEGRADED, sh.DOWN))
    finally:
        cache_backend.redis_info = orig_redis_info

    print(f"\nSystem Health: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
