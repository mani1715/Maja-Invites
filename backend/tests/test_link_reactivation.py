"""
test_link_reactivation.py — pay-per-day link reactivation core, on FakeDB.

    cd backend && python -m tests.test_link_reactivation
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
import link_reactivation as lr                               # noqa: E402
from subscription_service import verify_gateway_payment      # noqa: E402

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


async def err(coro, exc):
    try:
        await coro
        return False
    except exc:
        return True
    except Exception:
        return False


class _Payload:
    def __init__(self, mock_token=None, razorpay_payment_id=None, razorpay_signature=None):
        self.mock_token = mock_token
        self.razorpay_payment_id = razorpay_payment_id
        self.razorpay_signature = razorpay_signature


async def main():
    # ---- quote (pure) ----
    q = lr.reactivation_quote(30)
    ok("30 days @ ₹50 = ₹1500", q["total_inr"] == 1500 and q["total_paise"] == 150000)
    ok("1 day = ₹50", lr.reactivation_quote(1)["total_inr"] == 50)
    ok("custom per-day honored", lr.reactivation_quote(10, per_day_inr=100)["total_inr"] == 1000)
    try:
        lr.reactivation_quote(0); ok("0 days rejected", False)
    except ValueError:
        ok("0 days rejected", True)
    try:
        lr.reactivation_quote(400); ok(">365 days rejected", False)
    except ValueError:
        ok(">365 days rejected", True)

    # ---- apply (db) ----
    db = FakeDB()
    now = datetime.now(timezone.utc)
    past = (now - timedelta(days=5)).isoformat()
    await db.profiles.insert_one({"id": "p1", "admin_id": "s1", "expires_at": past, "expired": True, "enabled": False})

    r = await lr.apply_reactivation(db, "p1", 30)
    p = await db.profiles.find_one({"id": "p1"}, {"_id": 0})
    new_exp = datetime.fromisoformat(p["expires_at"])
    ok("expired link reactivated (expired False, enabled True)", p["expired"] is False and p["enabled"] is True)
    ok("published flag set", p["is_published"] is True)
    ok("expiry ~ now + 30d (from now since it was past)", timedelta(days=29) < (new_exp - now) < timedelta(days=31))

    # future expiry → days ADD, not reset
    future = (now + timedelta(days=10)).isoformat()
    await db.profiles.insert_one({"id": "p2", "admin_id": "s1", "expires_at": future, "expired": False})
    await lr.apply_reactivation(db, "p2", 30)
    p2 = await db.profiles.find_one({"id": "p2"}, {"_id": 0})
    exp2 = datetime.fromisoformat(p2["expires_at"])
    ok("future expiry EXTENDED (~now+40d, not now+30d)", timedelta(days=39) < (exp2 - now) < timedelta(days=41))

    ok("missing profile -> LookupError", await err(lr.apply_reactivation(db, "ghost", 30), LookupError))

    # ---- money-safety: mock verify reuse ----
    row = {"provider": "mock", "mock_token": "secret-abc", "razorpay_subscription_id": "rzp_mock_x"}
    ok("correct mock token verifies", verify_gateway_payment(row, _Payload(mock_token="secret-abc"), None) is True)
    ok("wrong mock token rejected", verify_gateway_payment(row, _Payload(mock_token="nope"), None) is False)
    ok("no token rejected", verify_gateway_payment(row, _Payload(), None) is False)

    print(f"\nLink Reactivation: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
