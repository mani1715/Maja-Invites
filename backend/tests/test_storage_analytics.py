"""
test_storage_analytics.py — Storage Command Center math on the FakeDB.

    cd backend && python -m tests.test_storage_analytics

Proves real byte→GB aggregation, top consumers, pool capacity/used %, growth,
failed-upload count, and the labelled cost estimate (used GB × configurable rate).
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ["STORAGE_COST_INR_PER_GB"] = "2.0"

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import storage_analytics as sa                               # noqa: E402

PASS = 0
FAIL = []
GB = 1024 ** 3


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
    now = datetime.now(timezone.utc)
    # studio a1: 3 GB across 2 files; a2: 1 GB; one deleted file ignored
    await db.backup_files.insert_one({"id": "f1", "studio_id": "a1", "size_bytes": 2 * GB, "created_at": now.isoformat()})
    await db.backup_files.insert_one({"id": "f2", "studio_id": "a1", "size_bytes": 1 * GB, "created_at": now.isoformat()})
    await db.backup_files.insert_one({"id": "f3", "studio_id": "a2", "size_bytes": 1 * GB, "created_at": now.isoformat()})
    await db.backup_files.insert_one({"id": "f4", "studio_id": "a2", "size_bytes": 5 * GB, "deleted": True, "created_at": now.isoformat()})
    # drive pool: 2 accounts, 100 GB cap, 10 GB committed
    await db.storage_accounts.insert_one({"id": "d1", "capacity_bytes": 50 * GB, "committed_bytes": 6 * GB})
    await db.storage_accounts.insert_one({"id": "d2", "capacity_bytes": 50 * GB, "committed_bytes": 4 * GB})
    # a failed upload in the window
    await db.upload_logs.insert_one({"id": "u1", "status": "failed", "started_at": now.isoformat()})
    await db.upload_logs.insert_one({"id": "u2", "status": "done", "started_at": now.isoformat()})
    # a storage plan sold
    await db.studio_storage_plans.insert_one({"id": "sp1", "gb_limit": 20, "status": "active"})

    m = await sa.compute_storage(db)
    u = m["usage"]
    ok("backup used = 4 GB (deleted ignored)", u["backup_used_gb"] == 4.0)
    ok("pool used = 10 GB", u["pool_used_gb"] == 10.0)
    ok("pool capacity = 100 GB", u["pool_capacity_gb"] == 100.0)
    ok("pool used pct = 10%", u["pool_used_pct"] == 10.0)
    ok("total used = 14 GB (backup + pool)", u["total_used_gb"] == 14.0)
    ok("sold quota = 20 GB", u["sold_quota_gb"] == 20)
    ok("file count excludes deleted", u["files"] == 3)

    c = m["cost_estimate"]
    ok("cost = 14 GB × ₹2 = ₹28", c["monthly_inr"] == 28.0 and c["inr_per_gb"] == 2.0)
    ok("cost is labelled an estimate", "estimate" in c["note"].lower())

    tc = m["top_consumers"]
    ok("top consumer is a1 with 3 GB", tc[0]["studio_id"] == "a1" and tc[0]["used_gb"] == 3.0)

    ok("growth series present", isinstance(m["growth_monthly"], list) and len(m["growth_monthly"]) >= 1)
    ok("drive accounts counted", m["providers"]["drive_accounts"] == 2)
    ok("failed uploads counted", m["health"]["failed_uploads_30d"] == 1)
    ok("active plans counted", m["health"]["active_storage_plans"] == 1)

    m0 = await sa.compute_storage(FakeDB())
    ok("empty db → zeros, no throw", m0["usage"]["total_used_gb"] == 0.0 and m0["cost_estimate"]["monthly_inr"] == 0.0)

    print(f"\nStorage Analytics: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
