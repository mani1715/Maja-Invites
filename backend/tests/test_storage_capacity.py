"""
Self-test for the capacity changes (no cloud, no Postgres).

    cd backend && python -m tests.test_storage_capacity

Covers:
  1. Default drive soft-limit is now 95% (was 80), still per-drive configurable.
  2. Emergency capacity monitoring: run_hourly raises a `capacity_emergency`
     alert when the pool drops below 10% remaining.
  3. No false alarm when there is plenty of space.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB, MemProvider, TestOrchestrator
import storage_pool_hooks as hooks
import storage_pool_jobs as jobs


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _alerts(db, kind):
    out = []
    async for a in db.storage_alerts.find({"kind": kind}):
        out.append(a)
    return out


async def _pool(db, provider, *, committed, capacity=100):
    orch = TestOrchestrator(db, provider)
    hooks._orchestrators[id(db)] = orch          # jobs._orch resolves via hooks
    acc = await orch.add_account(kind="gdrive", label="d1", capacity_bytes=capacity)
    await db.storage_accounts.update_one({"id": acc["id"]},
                                         {"$set": {"committed_bytes": committed}})
    return orch, acc


async def _run():
    # 1. default soft-limit is 95 (was 80), still tunable per drive
    db = FakeDB()
    orch = TestOrchestrator(db, MemProvider())
    acc = await orch.add_account(kind="gdrive", label="d1", capacity_bytes=100)
    _check(acc["soft_limit_pct"] == 95, "default soft_limit_pct is 95 (was 80)")
    tuned = await orch.add_account(kind="gdrive", label="d2", capacity_bytes=100,
                                   soft_limit_pct=98)
    _check(tuned["soft_limit_pct"] == 98, "per-drive soft_limit_pct still configurable")

    # 2. emergency alert when the pool is below 10% remaining (95/100 used)
    db2 = FakeDB()
    await _pool(db2, MemProvider(), committed=95)
    s = await jobs.run_hourly(db2)
    _check(round(s.get("remaining_pct", 100), 1) == 5.0, "hourly computes 5% remaining")
    _check(len(await _alerts(db2, "capacity_emergency")) >= 1,
           "emergency alert raised when <10% remaining")

    # 3. no false alarm with plenty of headroom (40/100 used → 60% free)
    db3 = FakeDB()
    await _pool(db3, MemProvider(), committed=40)
    s3 = await jobs.run_hourly(db3)
    _check(round(s3.get("remaining_pct", 0), 1) == 60.0, "hourly computes 60% remaining")
    _check(len(await _alerts(db3, "capacity_emergency")) == 0,
           "no emergency alert when 60% remains")

    print("\nALL CAPACITY TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
