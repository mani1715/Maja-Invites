"""
Self-test for the Phase-1 pricing migration + the resolver's DB layer.

    cd backend && python -m tests.test_pricing_migration

No Postgres — reuses the in-memory FakeDB from test_storage_orchestrator.
Proves:
  1. Migration seeds every new collection (categories, packs, durations,
     community, storage, Pro Studio) and back-fills design prices.
  2. It is IDEMPOTENT — a second run creates nothing new.
  3. Existing invitations are grandfathered (no forced expiry).
  4. Rollout flag is seeded OFF and never flipped.
  5. quote_wedding runs end-to-end through the seeded data (sample prices).
  6. Rollback: flipping the flag / no data mutation on re-run.
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

from tests.test_storage_orchestrator import FakeDB
import pricing_migration as mig
from pricing_engine import quote_wedding, quote_plan, PricingError


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _count(db, name):
    n = 0
    async for _ in getattr(db, name).find({}):
        n += 1
    return n


SAMPLE_DESIGNS = [
    {"id": "traditional_teak", "name": "Traditional Teak", "category": "Traditional", "base_price": 499},
    {"id": "royal_gold", "name": "Royal Gold", "category": "Royal", "base_price": 1999},
    {"id": "luxe_signature", "name": "Luxe Signature", "category": "Luxury", "base_price": 4999},
]


async def run():
    db = FakeDB()

    # seed a couple of existing invitations + a legacy portfolio plan to migrate
    await db.profiles.insert_one({"id": "prof_old_1", "slug": "aarav-riya", "is_active": True})
    await db.profiles.insert_one({"id": "prof_old_2", "slug": "meera-vikram", "is_active": True})
    await db.subscription_plans.insert_one({
        "id": "plan_premium", "product": "portfolio", "tier": "Premium",
        "base_monthly": 599, "storage_gb": 20})

    print("1. first migration run")
    r1 = await mig.run_migration(db, designs=SAMPLE_DESIGNS)
    _check(r1["flag"]["value"] is False, "rollout flag seeded OFF")
    _check(await _count(db, "design_categories") == len(mig.DEFAULT_CATEGORIES),
           f"{len(mig.DEFAULT_CATEGORIES)} design categories seeded")
    _check(await _count(db, "feature_packs") == 3, "3 feature packs seeded (Celebration/Signature/Royal)")
    _check(await _count(db, "link_duration_tiers") == 5, "5 link-duration tiers seeded")
    _check((await db.link_duration_tiers.find_one({"key": "d90"}))["price"] == 0,
           "3-Month duration is free (₹0)")
    _check(await db.community_settings.find_one({"id": "community_settings"}) is not None,
           "community settings matrix seeded")
    _check((await db.community_settings.find_one({"id": "community_settings"}))["tiers"]["pro"]["leads"] is True,
           "Pro community tier has lead access")
    pro_studio = await db.subscription_plans.find_one({"tier": "Pro Studio"})
    _check(pro_studio is not None and pro_studio["durations"]["12"] == 12999,
           "Pro Studio plan created (legacy row, price preserved)")
    _check(pro_studio.get("is_active") is False,
           "…and deactivated by apply_pricing_2026 (superseded by the 5-plan catalog)")
    # unify_storage_plans is retired: storage sells only via studio_storage.py,
    # so no capacity_gb rows may appear in subscription_plans any more.
    _check((await db.subscription_plans.find_one({"capacity_gb": 10240})) is None,
           "no orphan storage tiers written (unify_storage_plans retired)")

    print("1b. apply_pricing_2026 — the 5-plan owner catalog")
    active_portfolio = [p async for p in db.subscription_plans.find({"product": "portfolio"})
                        if p.get("is_active", True)]
    _check(sorted(p["id"] for p in active_portfolio) ==
           ["plan_portfolio_advanced", "plan_portfolio_basic", "plan_portfolio_custom",
            "plan_portfolio_premium", "plan_portfolio_pro"],
           "exactly the 5 canonical portfolio plans are active")
    prem2026 = await db.subscription_plans.find_one({"id": "plan_portfolio_premium"})
    _check(prem2026["durations"] == {"1": 1999, "3": 5699, "6": 10799, "12": 20399},
           "Premium durations are the owner-approved finals (1999/5699/10799/20399)")
    cust2026 = await db.subscription_plans.find_one({"id": "plan_portfolio_custom"})
    _check(cust2026["setup_fee_inr"] == 5000 and cust2026["durations"]["1"] == 1999,
           "Custom stores the ₹5,000 setup fee separately from renewal durations")
    basic2026 = await db.subscription_plans.find_one({"id": "plan_portfolio_basic"})
    _check(basic2026["storage_label"] == "512 MB" and basic2026["storage_mb"] == 512,
           "Basic storage is 512 MB, stored as MB (display never says 0.5 GB)")

    print("2. design price backfill + computed sale price")
    dp = await db.pricing_design_prices.find_one({"design_id": "royal_gold"})
    _check(dp and dp["name"] == "Royal Gold" and dp["base_price"] == 1999,
           "Royal Gold design row created with metadata")
    _check(dp["sale_price"] == 1999 and dp["active"] is True, "sale_price defaults to base; active")

    print("3. existing plan got editable per-cycle durations")
    prem = await db.subscription_plans.find_one({"id": "plan_premium"})
    # 12mo now backfills at the 2026 yearly discount (15%, was 20%):
    # 599 x 12 x 0.85 = 6109.8 -> 6110.
    _check(prem.get("durations", {}).get("1") == 599 and prem["durations"]["12"] == 6110,
           "legacy Premium durations backfilled at 15% yearly (1mo=599, 12mo=6110)")
    _check(prem.get("is_active") is False,
           "legacy non-canonical plan id deactivated by apply_pricing_2026")

    print("4. grandfathering existing invitations")
    _check(r1["grandfather"]["stamped"] == 2, "2 existing invitations grandfathered")
    p = await db.profiles.find_one({"id": "prof_old_1"})
    _check(p.get("pricing_grandfathered") is True and "link_expiry_date" not in p,
           "existing link stamped, NO forced expiry")

    print("5. idempotency — second run creates nothing")
    cats1 = await _count(db, "design_categories")
    plans1 = await _count(db, "subscription_plans")
    r2 = await mig.run_migration(db, designs=SAMPLE_DESIGNS)
    _check(await _count(db, "design_categories") == cats1, "no duplicate categories")
    _check(await _count(db, "subscription_plans") == plans1, "no duplicate plans")
    _check(r2["feature_packs"]["created"] == 0 and r2["link_durations"]["created"] == 0
           and r2["pro_studio"]["skipped"] == 1, "second run: everything skipped")
    _check(r2["grandfather"]["stamped"] == 0, "no re-grandfathering on second run")

    print("6. resolver end-to-end (sample pricing) — the numbers to report")
    # give Royal Gold a real 25% sale (base 1999 → 1499)
    await db.pricing_design_prices.update_one(
        {"design_id": "royal_gold"},
        {"$set": {"discount_pct": 25, "sale_price": 1499}})
    # launch campaign: 20% off everything
    await db.pricing_campaigns.insert_one({
        "id": "launch", "name": "Launch Offer", "active": True,
        "discount_type": "percentage", "discount_value": 20,
        "banner_text": "Launch Offer – 20% off", "priority": 1,
        "scope": {"mode": "all", "ids": []},
        "start_at": "2026-01-01T00:00:00+00:00", "end_at": "2026-12-31T00:00:00+00:00"})

    dur_1yr = (await db.link_duration_tiers.find_one({"key": "d365"}))["id"]
    dur_free = (await db.link_duration_tiers.find_one({"key": "d90"}))["id"]

    s1 = await quote_wedding(db, design_id="royal_gold", feature_pack_key="signature",
                             duration_id=dur_1yr)
    print(f"     SAMPLE A: {s1['design']['name']} ₹{s1['design_price']} + "
          f"Signature ₹{s1['feature_pack_price']} + 1yr ₹{s1['link_duration_price']} "
          f"= ₹{s1['subtotal']} − 20% ₹{s1['discount']} → ₹{s1['total']}")
    _check(s1["subtotal"] == 1499 + 999 + 599 and s1["discount"] == 619 and s1["total"] == 2478,
           "SAMPLE A total = ₹2478 (1499+999+599=3097 − 20%)")

    s2 = await quote_wedding(db, design_id="traditional_teak", feature_pack_key="celebration",
                             duration_id=dur_free)
    print(f"     SAMPLE B: {s2['design']['name']} ₹{s2['design_price']} + "
          f"Celebration ₹{s2['feature_pack_price']} + 3mo ₹{s2['link_duration_price']} "
          f"= ₹{s2['subtotal']} − 20% ₹{s2['discount']} → ₹{s2['total']}")
    _check(s2["total"] == int(499 * 0.8), "SAMPLE B = ₹399 (499 − 20%, free pack + free duration)")

    s3 = await quote_plan(db, plan_id="plan_portfolio_premium", cycle="12", kind="portfolio")
    print(f"     SAMPLE C: Premium portfolio 12mo ₹{s3['price']} − ₹{s3['discount']} → ₹{s3['total']}")
    _check(s3["price"] == 20399 and s3["total"] == 20399 - s3["discount"]
           and s3["discount"] in (4079, 4080),
           "SAMPLE C = Premium 2026 12mo ₹20,399 − 20% platform campaign")

    print("7. resolver safety — bad inputs rejected")
    try:
        await quote_wedding(db, design_id="does_not_exist", feature_pack_key="signature",
                            duration_id=dur_1yr)
        _check(False, "missing design should raise")
    except PricingError:
        _check(True, "unknown design → PricingError (no silent ₹0)")

    print("8. rollback check")
    _check((await db.app_settings.find_one({"key": mig.FLAG_KEY}))["value"] is False,
           "flag still OFF after migration — checkout unchanged, instant rollback ready")

    print("\nALL PRICING MIGRATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
