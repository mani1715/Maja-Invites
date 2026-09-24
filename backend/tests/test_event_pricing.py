"""
Ganesh v2 — owner-set event pricing self-test (event_pricing.py).

    cd backend && python -m tests.test_event_pricing

Proves: defaults seed once and are idempotent; the super-admin can price every design,
plan and feature; the most specific setting wins (discount > base > default); the public
design-offer + quote reflect admin edits immediately; unknown designs/features rejected.
In-memory FakeDB.
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


ET = "ganesh_chaturthi"


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)

    print("1. seeding is idempotent")
    await pricing.ensure_seeded(db, ET)
    await pricing.ensure_seeded(db, ET)
    plans = await pricing.list_plans(db, ET)
    feats = await pricing.list_feature_prices(db, ET)
    _check(len(plans) == 3, "3 plans seeded exactly once")
    _check(len(feats) == len(registry.GANESH_FEATURE_KEYS), "one price row per feature, once")

    print("2. design price resolution: default → base → discount")
    d = await pricing.design_price(db, ET, "royal_autumn")
    _check(d["price_inr"] == pricing.DEFAULT_DESIGN_PRICE_INR and d["price_source"] == "default",
           "no row → default price")
    await db.event_design_prices.insert_one({"event_type": ET, "template_id": "royal_autumn",
                                             "base_price": 900})
    d = await pricing.design_price(db, ET, "royal_autumn")
    _check(d["price_inr"] == 900 and d["price_source"] == "design", "admin base price wins over default")
    await db.event_design_prices.update_one({"event_type": ET, "template_id": "royal_autumn"},
                                            {"$set": {"discount_enabled": True, "discount_price": 499}})
    d = await pricing.design_price(db, ET, "royal_autumn")
    _check(d["price_inr"] == 499, "enabled discount wins over base")

    print("3. public design-offer carries everything the buy panel needs")
    offer = await pricing.design_offer(db, ET, "royal_autumn")
    cheapest = min(p["price"] for p in offer["plans"])
    _check(offer["design_price_inr"] == 499, "offer uses the effective design price")
    _check(offer["from_price_inr"] == 499 + cheapest, "'from' price = design + cheapest plan")
    _check(offer["template_name"] == "Royal Autumn", "design name resolved from the template catalogue")
    _check(all(p["feature_labels"] for p in offer["plans"]), "plans carry human-readable feature labels")

    print("4. quote line items")
    q = await pricing.quote(db, ET, "royal_autumn", "ganesh_premium", ["money_portal", "countdown"])
    _check(q["design_inr"] == 499, "design line")
    # countdown is already in Premium → must NOT be charged twice
    _check([a["key"] for a in q["addons"]] == ["money_portal"], "an add-on already in the plan is not re-charged")
    _check(q["total_inr"] == q["design_inr"] + q["plan_inr"] + q["addon_total_inr"], "total adds up")
    _check("money_portal" in q["granted_features"] and "journey" in q["granted_features"],
           "granted = plan features + add-ons")

    print("5. admin edits take effect immediately")
    await db.event_plan_prices.update_one({"event_type": ET, "key": "ganesh_premium"},
                                          {"$set": {"price": 3499}})
    q2 = await pricing.quote(db, ET, "royal_autumn", "ganesh_premium", [])
    _check(q2["plan_inr"] == 3499, "re-priced plan reflected in the next quote")
    await db.event_feature_prices.update_one({"event_type": ET, "feature_key": "money_portal"},
                                             {"$set": {"price": 1200}})
    q3 = await pricing.quote(db, ET, "royal_autumn", "ganesh_basic", ["money_portal"])
    _check(q3["addon_total_inr"] == 1200, "re-priced feature reflected in the next quote")

    print("6. bad input")
    await _expect(pricing.quote(db, ET, "royal_autumn", "no_such_plan", []), 422, "unknown plan")
    await _expect(pricing.design_offer(db, "no_such_event", ""), 404, "unknown event type")
    q4 = await pricing.quote(db, ET, "royal_autumn", "ganesh_basic", ["not_a_feature"])
    _check(q4["addons"] == [], "unknown add-on ignored, never charged")

    print("\nALL GANESH v2 PRICING TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
