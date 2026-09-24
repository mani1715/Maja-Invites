"""
test_backup_quota.py — cloud-backup quota is granted by an active `backup` OR
`storage` subscription (regression: a paid `backup` plan used to grant 0 GB).

    cd backend && python -m tests.test_backup_quota
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import cloud_backup_service as cb                            # noqa: E402

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


async def main():
    db = FakeDB()
    # plans
    await db.subscription_plans.insert_one({"id": "pl_storage", "product": "storage", "storage_gb": 1024})
    await db.subscription_plans.insert_one({"id": "pl_backup", "product": "backup", "storage_gb": 100})
    await db.subscription_plans.insert_one({"id": "pl_backup_nogb", "product": "backup"})  # no storage_gb

    # s0: nothing → 0 GB
    ok("no plan -> 0 GB (backup inactive)", await cb._studio_quota_gb(db, "s0") == 0)

    # s1: active BACKUP plan with storage_gb -> 100 (THE fix; was 0 before)
    await db.subscriptions.insert_one({"id": "sub1", "studio_id": "s1", "product": "backup", "status": "active", "plan_id": "pl_backup"})
    ok("active backup plan grants its GB (100)", await cb._studio_quota_gb(db, "s1") == 100)

    # s2: active BACKUP plan WITHOUT storage_gb -> BACKUP_DEFAULT_GB
    await db.subscriptions.insert_one({"id": "sub2", "studio_id": "s2", "product": "backup", "status": "active", "plan_id": "pl_backup_nogb"})
    ok("backup plan without GB -> default", await cb._studio_quota_gb(db, "s2") == cb.BACKUP_DEFAULT_GB)

    # s3: active STORAGE plan still works
    await db.subscriptions.insert_one({"id": "sub3", "studio_id": "s3", "product": "storage", "status": "active", "plan_id": "pl_storage"})
    ok("active storage plan still grants GB (1024)", await cb._studio_quota_gb(db, "s3") == 1024)

    # s4: a PENDING (unpaid) backup sub grants nothing
    await db.subscriptions.insert_one({"id": "sub4", "studio_id": "s4", "product": "backup", "status": "pending", "plan_id": "pl_backup"})
    ok("pending (unpaid) backup -> 0 GB", await cb._studio_quota_gb(db, "s4") == 0)

    # s5: has both -> takes the max
    await db.subscriptions.insert_one({"id": "sub5a", "studio_id": "s5", "product": "backup", "status": "active", "plan_id": "pl_backup"})
    await db.subscriptions.insert_one({"id": "sub5b", "studio_id": "s5", "product": "storage", "status": "active", "plan_id": "pl_storage"})
    ok("both plans -> max (1024)", await cb._studio_quota_gb(db, "s5") == 1024)

    print(f"\nBackup Quota: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
