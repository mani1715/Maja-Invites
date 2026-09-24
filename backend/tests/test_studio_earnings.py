"""
test_studio_earnings.py — photographer earnings aggregation on FakeDB.

    cd backend && python -m tests.test_studio_earnings
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import studio_earnings as se                                  # noqa: E402

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
    # studio s1 income ₹50,000 (wedding) + ₹10,000 (prewedding); expense ₹8,000
    await db.pixora_finance_entries.insert_one({"id": "f1", "studio_id": "s1", "kind": "income", "amount_inr": 50000, "category": "Wedding", "date": "2026-07-10"})
    await db.pixora_finance_entries.insert_one({"id": "f2", "studio_id": "s1", "kind": "income", "amount_inr": 10000, "category": "Pre-wedding", "date": "2026-08-01"})
    await db.pixora_finance_entries.insert_one({"id": "f3", "studio_id": "s1", "kind": "expense", "amount_inr": 8000, "category": "Travel", "date": "2026-08-02"})
    # another studio's entry must not leak
    await db.pixora_finance_entries.insert_one({"id": "f4", "studio_id": "s2", "kind": "income", "amount_inr": 99999, "date": "2026-08-02"})
    # bookings
    await db.pixora_bookings.insert_one({"id": "b1", "vendor_owner_id": "s1", "status": "confirmed"})
    await db.pixora_bookings.insert_one({"id": "b2", "vendor_owner_id": "s1", "status": "inquiry"})

    m = await se.compute_earnings(db, "s1", days=3650)
    t = m["totals"]
    ok("income = ₹60,000 (own only)", t["income_inr"] == 60000)
    ok("expense = ₹8,000", t["expense_inr"] == 8000)
    ok("net = ₹52,000", t["net_inr"] == 52000)
    ok("other studio excluded", t["income_inr"] != 60000 + 99999)
    ok("entries counted (3, not s2)", t["entries"] == 3)
    ok("monthly series has Jul + Aug", {x["month"] for x in m["monthly"]} >= {"2026-07", "2026-08"})
    jul = next(x for x in m["monthly"] if x["month"] == "2026-07")
    ok("July net = ₹50,000", jul["net"] == 50000)
    cats = {c["category"]: c["inr"] for c in m["income_by_category"]}
    ok("top income category is Wedding ₹50,000", cats.get("Wedding") == 50000)
    ok("bookings counted", m["bookings"]["total"] == 2 and m["bookings"]["by_status"].get("confirmed") == 1)

    # window filter
    mw = await se.compute_earnings(db, "s1", days=1)  # only very recent
    ok("window filter reduces income", mw["window"]["income_inr"] <= m["totals"]["income_inr"])

    m0 = await se.compute_earnings(FakeDB(), "nope", days=90)
    ok("empty studio → zeros", m0["totals"]["income_inr"] == 0 and m0["bookings"]["total"] == 0)

    print(f"\nStudio Earnings: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
