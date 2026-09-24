"""
End-to-end pricing validation (Phases 4, 5, 6, 8).

    cd backend && python -m tests.test_pricing_e2e

Wedding flow: design → pack → duration → campaign → quote → activation (expiry +
features). Campaign engine: single best, no stacking, scope + window enforcement.
Community: matrix-first with safe fallback. Simulator == checkout (same resolver).
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from datetime import datetime, timedelta, timezone

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB
import pricing_engine as pe
import pricing_activation as act
import community_gating as cg


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _iso(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


async def _seed(db):
    await db.pricing_design_prices.insert_one({
        "id": "d1", "design_id": "royal_1", "audience": "normal_user", "name": "Royal 1",
        "base_price": 999, "sale_price": 799, "category_id": "royal",
        "featured": True, "trending": False, "best_seller": True, "new_arrival": False, "active": True})
    await db.feature_packs.insert_one({"key": "signature", "name": "Signature", "price": 999,
                                       "features": ["rsvp", "maps", "live_gallery"], "active": True})
    await db.link_duration_tiers.insert_one({"id": "dur_1yr", "key": "1yr", "name": "1 Year",
                                             "duration_days": 365, "lifetime": False, "price": 599, "active": True})
    await db.subscription_plans.insert_one({"id": "plan_prem", "product": "portfolio", "tier": "Premium",
                                            "durations": {"monthly": 599, "yearly": 5749}, "active": True})


async def run():
    db = FakeDB()
    await _seed(db)

    print("4. design catalog / pricing_design_prices is the source")
    d = await pe._find_design(db, "royal_1")
    _check(d and d["featured"] is True and d["best_seller"] is True, "design carries merchandising flags")
    _check(pe.effective_design_price(d) == 799, "sale_price is authoritative (799, not base 999)")

    print("5. campaign engine")
    # all-scope 10%
    await db.pricing_campaigns.insert_one({"id": "c_all", "name": "Launch", "active": True,
        "discount_type": "percentage", "discount_value": 10, "scope": {"mode": "all"}, "priority": 1})
    q = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    subtotal = 799 + 999 + 599  # 2397
    _check(q["subtotal"] == subtotal and q["discount"] == round(subtotal * 0.10), "all-scope 10% applied")
    _check(q["total"] == subtotal - q["discount"], "total = subtotal − campaign")

    # a bigger competing campaign wins; NO stacking
    await db.pricing_campaigns.insert_one({"id": "c_big", "name": "Mega", "active": True,
        "discount_type": "fixed", "discount_value": 500, "scope": {"mode": "all"}, "priority": 2})
    q2 = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    _check(q2["discount"] == 500 and q2.get("campaign", {}).get("id") == "c_big",
           "single best campaign wins (₹500), not stacked with 10%")

    # expired + inactive ignored → back to the 10%
    await db.pricing_campaigns.update_one({"id": "c_big"}, {"$set": {"end_at": _iso(-1)}})  # expired
    q3 = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    _check(q3.get("campaign", {}).get("id") == "c_all", "expired campaign ignored")
    await db.pricing_campaigns.update_one({"id": "c_all"}, {"$set": {"active": False}})
    q4 = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    _check(q4["discount"] == 0 and q4.get("campaign") is None, "inactive campaign ignored → no discount")

    # scoped: a design-only campaign only touches its design
    await db.pricing_campaigns.insert_one({"id": "c_scope", "name": "RoyalOnly", "active": True,
        "discount_type": "percentage", "discount_value": 20, "scope": {"mode": "designs", "ids": ["royal_1"]}})
    q5 = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    _check(q5.get("campaign", {}).get("id") == "c_scope", "design-scoped campaign applies to its design")

    print("6. simulator == checkout (same resolver)")
    a = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    b = await pe.quote_wedding(db, design_id="royal_1", feature_pack_key="signature", duration_id="dur_1yr")
    _check(a["total"] == b["total"], "deterministic — admin simulator matches buyer checkout")

    print("7. plan (portfolio) quote + plan-scoped campaign")
    pq = await pe.quote_plan(db, plan_id="plan_prem", cycle="yearly", kind="portfolio")
    _check(pq["available"] and pq["price"] == 5749, "portfolio yearly resolves from durations map")
    await pe.quote_plan(db, plan_id="plan_prem", cycle="monthly", kind="portfolio")
    unav = await pe.quote_plan(db, plan_id="plan_prem", cycle="half_yearly", kind="portfolio")
    _check(unav["available"] is False and unav["total"] is None, "unpriced cycle is 'unavailable', never ₹0")
    await db.pricing_campaigns.insert_one({"id": "c_plan", "name": "PortfolioSale", "active": True,
        "discount_type": "percentage", "discount_value": 10, "scope": {"mode": "portfolio", "ids": ["plan_prem"]}})
    pq2 = await pe.quote_plan(db, plan_id="plan_prem", cycle="yearly", kind="portfolio")
    _check(pq2["discount"] == round(5749 * 0.10) and pq2.get("campaign", {}).get("id") == "c_plan",
           "portfolio-scoped campaign applies to the plan")

    print("7b. storage flow — plan → duration(cycle) → campaign → checkout")
    await db.subscription_plans.insert_one({"id": "stor_100", "product": "storage", "tier": "100GB",
                                            "durations": {"monthly": 199, "yearly": 1999}, "active": True})
    sq = await pe.quote_plan(db, plan_id="stor_100", cycle="yearly", kind="storage")
    _check(sq["available"] and sq["price"] == 1999, "storage yearly resolves from durations map")
    await db.pricing_campaigns.insert_one({"id": "c_stor", "name": "StorageSale", "active": True,
        "discount_type": "percentage", "discount_value": 15, "scope": {"mode": "storage", "ids": ["stor_100"]}})
    sq2 = await pe.quote_plan(db, plan_id="stor_100", cycle="yearly", kind="storage")
    _check(sq2["discount"] == round(1999 * 0.15) and sq2.get("campaign", {}).get("id") == "c_stor",
           "storage-scoped campaign applies to the storage plan only")
    # scope isolation: the storage campaign must NOT touch the portfolio plan
    pq_iso = await pe.quote_plan(db, plan_id="plan_prem", cycle="yearly", kind="portfolio")
    _check(pq_iso.get("campaign", {}).get("id") != "c_stor", "storage campaign does not leak to portfolio")

    print("8. full wedding activation flow (flag ON)")
    await db.app_settings.update_one({"key": "new_pricing_enabled"},
                                     {"$set": {"key": "new_pricing_enabled", "value": True}}, upsert=True)
    await db.profiles.insert_one({"id": "wed1", "slug": "aarav-riya"})
    order = {"id": "o1", "profile_id": "wed1",
             "quote": {"pricing_model": "v2", "duration_id": "dur_1yr", "package": "signature"}}
    ent = await act.apply_order_entitlements(db, order, "wed1")
    p = await db.profiles.find_one({"id": "wed1"})
    _check(ent["applied"] and p["link_expiry_date"] and "live_gallery" in p["granted_features"],
           "purchase → expiry written + pack features granted")
    _check(await act.has_feature(db, p, "live_gallery") and not await act.has_feature(db, p, "ai_translation"),
           "runtime gate reflects the purchased pack")

    print("9. community matrix-first + safe fallback")
    await db.community_settings.insert_one({"id": "community_settings", "tiers": {
        "free": {"view_feed": True, "post": False, "reels": False, "leads": False},
        "basic": {"view_feed": True, "post": True, "reels": False, "leads": False},
        "premium": {"view_feed": True, "post": True, "reels": True, "leads": False},
        "pro": {"view_feed": True, "post": True, "reels": True, "leads": True}}})
    _check(await cg._matrix_allows(db, "basic", "post") is True, "matrix: basic can post")
    _check(await cg._matrix_allows(db, "free", "reels") is False, "matrix: free cannot reels")
    _check(await cg._matrix_allows(db, "pro", "leads") is True, "matrix: pro gets leads")
    _check(await cg._matrix_allows(db, "premium", "ai_assistant") is None,
           "capability absent from matrix → None (falls back to CAP_MIN_TIER, no lockout)")

    print("\nALL PRICING E2E TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
