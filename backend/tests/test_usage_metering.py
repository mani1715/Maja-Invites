"""
test_usage_metering.py -- Lane A7: per-event usage counters -> COGS.

    cd backend && python -m tests.test_usage_metering

Uses the FakeDB harness (no live Postgres) plus a tiny in-memory fake Redis
client (hincrby + hgetall/delete pipeline) monkeypatched onto
cache_backend._get_redis, so both the buffered-Redis path and the
process-local no-Redis fallback get exercised.

find_one_and_update is not implemented on the shared FakeDB harness --
added here, scoped to this test PROCESS only, mirroring
tests/test_media_reconcile.py's approach (does not modify
tests/test_storage_orchestrator.py).
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import usage_metering as um                                   # noqa: E402
import cache_backend                                           # noqa: E402
from fastapi import HTTPException                              # noqa: E402

from tests.test_storage_orchestrator import FakeDB, _Collection  # noqa: E402


async def _find_one_and_update(self, flt, update, *, return_document=False,
                                upsert=False, projection=None):
    for d in self.docs:
        if self._match(d, flt):
            self._apply(d, update)
            return dict(d)
    if upsert:
        nd = {k: v for k, v in (flt or {}).items()
              if not k.startswith("$") and not isinstance(v, dict)}
        self._apply(nd, update, is_insert=True)
        self.docs.append(nd)
        return dict(nd)
    return None


_Collection.find_one_and_update = _find_one_and_update

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


# ---------------------------------------------------------------------------
# Tiny fake Redis: just enough of the hash + pipeline API record_usage/
# flush_usage actually call.
class _FakePipe:
    def __init__(self, client):
        self._client = client
        self._ops = []

    def hgetall(self, key):
        self._ops.append(("hgetall", key))
        return self

    def delete(self, key):
        self._ops.append(("delete", key))
        return self

    async def execute(self):
        out = []
        for op, key in self._ops:
            if op == "hgetall":
                out.append(dict(self._client.hashes.get(key, {})))
            else:
                out.append(1 if key in self._client.hashes else 0)
                self._client.hashes.pop(key, None)
        self._ops = []
        return out


class _FakeRedis:
    def __init__(self):
        self.hashes = {}

    async def hincrby(self, key, field, amount=1):
        h = self.hashes.setdefault(key, {})
        h[field] = str(int(h.get(field, 0)) + amount)
        return int(h[field])

    def pipeline(self, transaction=True):
        return _FakePipe(self)


def _patch_redis(client_or_none):
    async def _fake_get_redis():
        return client_or_none
    orig = cache_backend._get_redis
    cache_backend._get_redis = _fake_get_redis
    return orig


def _unpatch_redis(orig):
    cache_backend._get_redis = orig


# ---------------------------------------------------------------------------
async def test_record_and_flush_rolls_up_via_redis():
    db = FakeDB()
    fake = _FakeRedis()
    orig = _patch_redis(fake)
    try:
        await um.record_usage("face_index", "p2")
        await um.record_usage("face_index", "p2")
        await um.record_usage("face_search", "p2")
        drained1 = await um.flush_usage(db)
        drained2 = await um.flush_usage(db)   # double flush -- must not double-count
    finally:
        _unpatch_redis(orig)

    ok("first flush drained both fields", drained1 == {"p2|face_index": 2, "p2|face_search": 1})
    ok("second flush drains nothing (buffer already emptied)", drained2 == {})

    idx = await db.usage_records.find_one({"scope_id": "p2", "metric": "face_index"})
    srch = await db.usage_records.find_one({"scope_id": "p2", "metric": "face_search"})
    ok("face_index rollup amount == 2 (not doubled by the second flush)", idx and idx["amount"] == 2)
    ok("face_search rollup amount == 1", srch and srch["amount"] == 1)
    ok("Redis hash was actually drained", fake.hashes.get(um.PENDING_KEY, {}) == {})


async def test_no_redis_fallback_path():
    db = FakeDB()
    orig = _patch_redis(None)
    try:
        um._mem_pending.clear()
        await um.record_usage("photo_uploaded", "p1")
        await um.record_usage("photo_uploaded", "p1")
        await um.record_usage("photo_uploaded", "p1")
        await um.record_usage("photo_bytes", "p1", amount=500)
        ok("in-memory buffer holds the pending counts",
           um._mem_pending.get("p1|photo_uploaded") == 3 and um._mem_pending.get("p1|photo_bytes") == 500)
        drained = await um.flush_usage(db)
    finally:
        _unpatch_redis(orig)

    ok("no-Redis flush drained the mem-fallback counters",
       drained == {"p1|photo_uploaded": 3, "p1|photo_bytes": 500})
    ok("mem buffer cleared after flush", um._mem_pending == {})

    up = await db.usage_records.find_one({"scope_id": "p1", "metric": "photo_uploaded"})
    by = await db.usage_records.find_one({"scope_id": "p1", "metric": "photo_bytes"})
    ok("photo_uploaded rollup == 3", up and up["amount"] == 3)
    ok("photo_bytes rollup == 500", by and by["amount"] == 500)


# ---------------------------------------------------------------------------
async def test_endpoint_math_and_cogs():
    db = FakeDB()
    await db.profiles.insert_one({"id": "p3", "admin_id": "owner-1"})
    # 2 GiB of photo bytes + 3 face_index + 2 face_search + some cache hits
    # (cache hits must NOT enter the cost side).
    await db.usage_records.insert_one(
        {"scope_id": "p3", "date": "2026-08-01", "metric": "photo_bytes", "amount": 2 * 1024 ** 3})
    await db.usage_records.insert_one(
        {"scope_id": "p3", "date": "2026-08-01", "metric": "face_index", "amount": 3})
    await db.usage_records.insert_one(
        {"scope_id": "p3", "date": "2026-08-02", "metric": "face_search", "amount": 2})
    await db.usage_records.insert_one(
        {"scope_id": "p3", "date": "2026-08-02", "metric": "face_search_cached", "amount": 40})

    router = um.build_usage_router(db, lambda: None, lambda: None)
    route = next(r for r in router.routes if getattr(r, "path", "") == "/api/admin/usage/{profile_id}")

    result = await route.endpoint(profile_id="p3", admin={"admin_id": "owner-1", "role": "admin"})
    cogs = result["estimated_cogs"]
    # defaults: STORAGE_COST_INR_PER_GB=2.0, REKOGNITION_COST_INR=0.10 (env unset in test)
    ok("storage COGS = 2 GiB x 2.0 INR/GB = 4.0", cogs["storage_inr"] == 4.0)
    ok("face COGS = (3 index + 2 search) x 0.10 = 0.5 (cached excluded)", cogs["face_inr"] == 0.5)
    ok("total COGS = 4.5", cogs["total_inr"] == 4.5)
    ok("totals surfaces face_search_cached separately, uncosted",
       result["totals"]["face_search_cached"] == 40)

    # Ownership gate: a different admin, not super_admin, is refused.
    try:
        await route.endpoint(profile_id="p3", admin={"admin_id": "someone-else", "role": "admin"})
        ok("non-owner non-super admin should have been rejected", False)
    except HTTPException as e:
        ok("non-owner non-super admin gets 403", e.status_code == 403)

    # super_admin bypasses ownership.
    result2 = await route.endpoint(profile_id="p3", admin={"admin_id": "someone-else", "role": "super_admin"})
    ok("super_admin can read any profile's usage", result2["profile_id"] == "p3")

    # Missing profile -> 404.
    try:
        await route.endpoint(profile_id="nope", admin={"admin_id": "owner-1", "role": "admin"})
        ok("missing profile should 404", False)
    except HTTPException as e:
        ok("missing profile gets 404", e.status_code == 404)

    summary_route = next(r for r in router.routes if getattr(r, "path", "") == "/api/super-admin/usage/summary")
    summary = await summary_route.endpoint(_admin="super-1")
    ok("summary platform_totals include face_index",
       summary["platform_totals"].get("face_index") == 3)
    ok("summary top_scopes lists p3", any(s["scope_id"] == "p3" for s in summary["top_scopes"]))


async def main():
    await test_record_and_flush_rolls_up_via_redis()
    await test_no_redis_fallback_path()
    await test_endpoint_math_and_cogs()
    print(f"\nUsage Metering (A7): {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
