"""
test_profitability.py — P&L math on the FakeDB.

    cd backend && python -m tests.test_profitability

Proves real revenue is pulled through, cost estimates use real volumes ×
configurable rates, and profit/margin are computed correctly and auditable.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ["SMS_COST_INR"] = "0.20"
os.environ["EMAIL_COST_INR"] = "0.10"
os.environ["PAYMENT_FEE_PCT"] = "2.0"
os.environ["STORAGE_COST_INR_PER_GB"] = "2.0"

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import profitability as pf                                   # noqa: E402

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
    now = datetime.now(timezone.utc).isoformat()
    # revenue: a paid invitation order of ₹10,000 (1,000,000 paise)
    await db.invitation_orders.insert_one({"id": "o1", "status": "paid", "amount": 1000000, "created_at": now})
    # storage: 2 GB → ₹4 at ₹2/GB
    await db.backup_files.insert_one({"id": "f1", "studio_id": "a1", "size_bytes": 2 * GB, "created_at": now})
    # sends: 10 sms (₹2.00) + 5 email (₹0.50)
    for i in range(10):
        await db.delivery_log.insert_one({"id": f"s{i}", "channel": "sms", "created_at": now})
    for i in range(5):
        await db.delivery_log.insert_one({"id": f"e{i}", "channel": "email", "created_at": now})

    m = await pf.compute_profitability(db, days=30)

    ok("revenue is real (₹10,000)", m["revenue_inr"] == 10000.0)
    c = m["costs"]
    ok("storage cost = 2 GB × ₹2 = ₹4", c["storage_inr"] == 4.0)
    ok("sms cost = 10 × ₹0.20 = ₹2", c["sms_inr"] == 2.0)
    ok("email cost = 5 × ₹0.10 = ₹0.50", c["email_inr"] == 0.5)
    ok("payment fee = 2% of ₹10,000 = ₹200", c["payment_fees_inr"] == 200.0)
    ok("total cost = 4+2+0.5+200 = ₹206.5", m["total_cost_inr"] == 206.5)
    ok("profit = 10000 − 206.5 = ₹9793.5", m["profit_inr"] == 9793.5)
    ok("margin = 97.9%", m["margin_pct"] == 97.9)
    v = m["volumes"]
    ok("volumes captured", v["sms_sends"] == 10 and v["email_sends"] == 5)
    ok("assumptions surface every rate", m["assumptions"]["sms_inr"] == 0.20 and m["assumptions"]["payment_fee_pct"] == 2.0)
    ok("assumptions labelled as estimate", "estimate" in m["assumptions"]["note"].lower())

    m0 = await pf.compute_profitability(FakeDB(), days=30)
    ok("empty db → zero revenue, no throw", m0["revenue_inr"] == 0.0 and m0["profit_inr"] == 0.0)

    print(f"\nProfitability: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
