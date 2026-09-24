"""
Ganesh v2 — self-serve buy → auto-create self-test.

    cd backend && python -m tests.test_event_purchase

Proves: the plan sheet comes from the OWNER-SET price catalogue (event_pricing) and is
never empty; a purchase auto-creates a draft owned by the buyer, sets the chosen design,
and — when the total is 0 or the gateway is unconfigured — grants immediately (ready)
with the plan's features written onto the event. Ownership enforced.
In-memory FakeDB (no Razorpay).
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

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_pricing as pricing
import event_purchase_service as buy


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


BUYER = {"user_id": "buyer1", "kind": "user"}
OTHER = {"user_id": "other", "kind": "user"}


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)

    print("1. plan sheet is admin-priced and never empty (defaults seed themselves)")
    sheet = await buy.list_plans(db, "ganesh_chaturthi", "royal_autumn")
    keys = [p["key"] for p in sheet["plans"]]
    _check(keys == ["ganesh_basic", "ganesh_premium", "ganesh_royal"], "three default plans, price-sorted")
    royal = [p for p in sheet["plans"] if p["key"] == "ganesh_royal"][0]
    _check("money_portal" in royal["features"] and royal["price"] > 0, "Royal grants money_portal and is paid")
    _check(len(sheet["feature_addons"]) == len(registry.GANESH_FEATURE_KEYS),
           "every feature has an a-la-carte price")

    print("2. owner sets a design price → the quote adds it on top of the plan")
    await db.event_design_prices.insert_one({"event_type": "ganesh_chaturthi",
                                             "template_id": "royal_autumn", "base_price": 500})
    q = await pricing.quote(db, "ganesh_chaturthi", "royal_autumn", "ganesh_basic", ["donations"])
    _check(q["design_inr"] == 500, "design price picked up")
    _check(q["total_inr"] == 500 + q["plan_inr"] + q["addon_total_inr"], "total = design + plan + add-ons")
    _check("donations" in q["granted_features"], "the paid add-on is granted")

    print("3. buying grants exactly the plan's features (gateway unconfigured → graceful ready)")
    r = await buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                 template_id="royal_autumn", plan_key="ganesh_basic")
    _check(r["status"] == "ready" and r["needs_payment"] is False, "ready without a live gateway")
    ev = await db.events.find_one({"event_id": r["event_id"]})
    _check(ev["owner_id"] == "buyer1", "draft owned by the buyer")
    _check(ev.get("template_id") == "royal_autumn" and (ev.get("theme") or {}).get("template") == "royal_autumn",
           "chosen design set on the draft")
    granted = ev.get("granted_features") or []
    _check("countdown" in granted and "money_portal" not in granted,
           "Basic grants countdown but NOT money_portal")

    print("4. add-ons extend the grant; Royal grants everything")
    r2 = await buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                  template_id="azure_lagoon", plan_key="ganesh_basic",
                                  addons=["money_portal"])
    ev2 = await db.events.find_one({"event_id": r2["event_id"]})
    _check("money_portal" in (ev2.get("granted_features") or []), "purchased add-on granted")
    r3 = await buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                  template_id="rose_temple", plan_key="ganesh_royal")
    ev3 = await db.events.find_one({"event_id": r3["event_id"]})
    _check(len(ev3.get("granted_features") or []) == len(registry.GANESH_FEATURE_KEYS),
           "Royal grants every feature")
    _check(ev3.get("link_active_days") == 90, "plan's active-days recorded on the event")

    print("5. unknown plan / ownership")
    await _expect(buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                     template_id="x", plan_key="nope"), 422, "unknown plan rejected")
    await _expect(buy.verify_purchase(db, OTHER, event_id=r["event_id"],
                                      razorpay_order_id="o", razorpay_payment_id="p", razorpay_signature="s"),
                  403, "a stranger cannot verify someone else's purchase")

    print("\nALL GANESH v2 PURCHASE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
