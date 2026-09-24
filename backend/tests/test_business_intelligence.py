"""
test_business_intelligence.py — BI metric math on the FakeDB.

    cd backend && python -m tests.test_business_intelligence

Proves MRR cycle-normalisation (yearly → /12), ARR, active-sub counts, churn
rate, signup growth, conversion/activation, revenue rollups, and referral/coupon
counts — all from real-shaped data, no network.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import business_intelligence as bi                           # noqa: E402

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


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


async def seed(db):
    now = datetime.now(timezone.utc)
    # 2 active subs: one monthly ₹999, one yearly ₹9600 (=> ₹800/mo)
    await db.subscriptions.insert_one({"id": "s1", "studio_id": "a1", "product": "portfolio",
                                       "cycle": "monthly", "status": "active",
                                       "quote": {"total_paise": 99900}, "created_at": iso(now - timedelta(days=5))})
    await db.subscriptions.insert_one({"id": "s2", "studio_id": "a2", "product": "backup",
                                       "cycle": "yearly", "status": "active",
                                       "quote": {"total_paise": 960000}, "created_at": iso(now - timedelta(days=200))})
    # 1 churned this window
    await db.subscriptions.insert_one({"id": "s3", "studio_id": "a3", "product": "portfolio",
                                       "cycle": "monthly", "status": "cancelled",
                                       "quote": {"total_paise": 99900},
                                       "cancelled_at": iso(now - timedelta(days=3)),
                                       "created_at": iso(now - timedelta(days=40))})
    # photographers + couples
    for i in (1, 2, 3, 4):
        await db.admins.insert_one({"id": f"a{i}", "email": f"a{i}@x.com",
                                    "created_at": iso(now - timedelta(days=10 * i))})
    for i in (1, 2):
        await db.users.insert_one({"user_id": f"u{i}", "email": f"u{i}@x.com",
                                   "created_at": iso(now - timedelta(days=2))})
    # a published portfolio (activation) + one-time invitation revenue
    await db.portfolio_profiles.insert_one({"id": "pp1", "admin_id": "a4", "is_published": True})
    await db.invitation_orders.insert_one({"id": "o1", "status": "paid", "amount": 149900,
                                           "created_at": iso(now - timedelta(days=1))})
    # referrals + coupon redemption
    await db.referrals.insert_one({"id": "r1", "referrer": "u1"})
    await db.photographer_referrals.insert_one({"id": "pr1", "admin_id": "a1"})
    await db.gift_code_redemptions.insert_one({"id": "gr1", "code": "WELCOME"})


async def main():
    db = FakeDB()
    await seed(db)
    m = await bi.compute_bi(db, days=30)

    r = m["recurring"]
    # MRR = 99900 (monthly) + 960000/12 (80000) = 179900 paise = ₹1799
    ok("MRR normalises yearly to monthly", r["mrr_paise"] == 99900 + 80000)
    ok("MRR in INR", r["mrr_inr"] == 1799.0)
    ok("ARR = MRR × 12", r["arr_paise"] == (99900 + 80000) * 12)
    ok("active subscriptions counted", r["active_subscriptions"] == 2)
    ok("by_product breakdown", r["by_product"].get("portfolio") == 1 and r["by_product"].get("backup") == 1)
    ok("churn counted in window", r["churned_window"] == 1)
    ok("churn rate = 1/(2+1)=33.33%", abs(r["churn_rate_pct"] - 33.33) < 0.1)

    g = m["growth"]
    ok("total photographers", g["total_photographers"] == 4)
    ok("total couples", g["total_couples"] == 2)
    ok("new couples in window", g["new_couples_window"] == 2)
    ok("growth monthly series present", isinstance(g["monthly"], list) and len(g["monthly"]) >= 1)

    f = m["funnel"]
    # paid photographers a1,a2 = 2/4 = 50%; activated adds a4 (published) => 3/4 = 75%
    ok("conversion 2/4 = 50%", f["photographer_conversion_pct"] == 50.0)
    ok("activation 3/4 = 75%", f["photographer_activation_pct"] == 75.0)
    ok("paid photographers count", f["paid_photographers"] == 2)

    rev = m["revenue"]
    # subs active (99900 + 960000) + invitation order 149900 = 1209800 paise
    ok("revenue sums subs + one-time orders", rev["total_paise"] == 99900 + 960000 + 149900)
    ok("revenue INR", rev["total_inr"] == 12098.0)
    ok("revenue monthly series", isinstance(rev["monthly"], list))

    ok("referral total (couple + photographer)", m["referrals"]["total"] == 2)
    ok("coupon redemptions", m["coupons"]["redemptions"] == 1)

    # empty db → all zeros, no throw
    m0 = await bi.compute_bi(FakeDB(), days=30)
    ok("empty db yields zeros", m0["recurring"]["mrr_paise"] == 0 and m0["revenue"]["total_paise"] == 0)

    print(f"\nBusiness Intelligence: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
