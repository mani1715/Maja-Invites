"""Seed default pricing data for the new Super Admin Pricing Hub."""
import asyncio
from datetime import datetime, timezone
from pg_adapter import Database
from dotenv import dotenv_values
import sys

sys.path.insert(0, "/app/backend")
from super_admin_pricing import THEMES, INVITATION_OPTIONS, DESIGN_KEYS  # noqa: E402

env = dotenv_values("/app/backend/.env")
now = datetime.now(timezone.utc)


async def main():
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])

    # Photographer credit packs (large credits, low price)
    photog_packs = [
        {"credits": 100, "base_price": 600,  "label": "Starter"},
        {"credits": 300, "base_price": 1500, "label": "Pro"},
        {"credits": 800, "base_price": 3600, "label": "Studio"},
    ]
    # Normal user credit packs (small credits, higher price)
    normal_packs = [
        {"credits": 10,  "base_price": 100, "label": "Trial"},
        {"credits": 30,  "base_price": 280, "label": "Personal"},
        {"credits": 60,  "base_price": 540, "label": "Family"},
    ]
    for p in photog_packs:
        await db.pricing_credit_packs.update_one(
            {"audience": "photographer", "credits": p["credits"]},
            {"$set": {**p, "audience": "photographer", "is_active": True,
                      "discount_enabled": False, "discount_price": None,
                      "updated_at": now},
             "$setOnInsert": {"id": f"photog_{p['credits']}", "created_at": now}},
            upsert=True,
        )
    for p in normal_packs:
        await db.pricing_credit_packs.update_one(
            {"audience": "normal_user", "credits": p["credits"]},
            {"$set": {**p, "audience": "normal_user", "is_active": True,
                      "discount_enabled": False, "discount_price": None,
                      "updated_at": now},
             "$setOnInsert": {"id": f"normal_{p['credits']}", "created_at": now}},
            upsert=True,
        )

    # Monthly subscription
    await db.pricing_subscription_plans.update_one(
        {"name": "Monthly Pro"},
        {"$set": {"id": "monthly_pro", "name": "Monthly Pro", "credits_per_month": 400,
                  "duration_days": 30, "base_price": 600,
                  "discount_enabled": False, "discount_price": None,
                  "is_active": True, "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # Post-sub config (singleton)
    await db.pricing_post_sub.update_one(
        {"_id": "singleton"},
        {"$set": {"mode": "per_credit", "per_credit_rate": 4, "packs": [],
                  "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # Theme prices — photographer 8 cr, normal 12 cr by default
    for t in THEMES:
        for audience, base in [("photographer", 8), ("normal_user", 12)]:
            await db.pricing_theme_prices.update_one(
                {"audience": audience, "theme_id": t["id"]},
                {"$set": {"audience": audience, "theme_id": t["id"],
                          "base_price": base, "discount_enabled": False,
                          "discount_price": None, "updated_at": now},
                 "$setOnInsert": {"created_at": now}},
                upsert=True,
            )

    # Design prices — photographer 2 cr, normal 4 cr by default
    for t in THEMES:
        for k in DESIGN_KEYS:
            for audience, base in [("photographer", 2), ("normal_user", 4)]:
                await db.pricing_design_prices.update_one(
                    {"audience": audience, "theme_id": t["id"], "design_key": k},
                    {"$set": {"audience": audience, "theme_id": t["id"],
                              "design_key": k, "base_price": base,
                              "discount_enabled": False, "discount_price": None,
                              "updated_at": now},
                     "$setOnInsert": {"created_at": now}},
                    upsert=True,
                )

    # Option prices — photographer 3 cr, normal 5 cr by default
    for o in INVITATION_OPTIONS:
        for audience, base in [("photographer", 3), ("normal_user", 5)]:
            await db.pricing_option_prices.update_one(
                {"audience": audience, "option_key": o["key"]},
                {"$set": {"audience": audience, "option_key": o["key"],
                          "base_price": base, "is_free": False,
                          "discount_enabled": False, "discount_price": None,
                          "updated_at": now},
                 "$setOnInsert": {"created_at": now}},
                upsert=True,
            )

    # Counts summary
    for c in ["pricing_credit_packs", "pricing_subscription_plans",
              "pricing_post_sub", "pricing_theme_prices",
              "pricing_design_prices", "pricing_option_prices"]:
        n = await db[c].count_documents({})
        print(f"  {c}: {n} docs")

    print("✓ Seeding complete.")


asyncio.run(main())
