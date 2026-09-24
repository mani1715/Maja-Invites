"""
test_founding_pricing.py — founding settings, seat counting, live status, and the
owner-invoked portfolio catalogue.

    cd backend && python -m tests.test_founding_pricing

Confirms: settings seed DISABLED by default; seats counted per paying studio;
status flips founding->regular when the flag is off or the seats are gone; and the
apply step writes the exact approved regular+founding numbers (verified through the
pricing engine). No live price changes without the explicit apply call.

In-memory FakeDB; no Postgres / network.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from founding_pricing import (                                  # noqa: E402
    seed_founding_settings, get_founding_settings, count_founding_studios,
    founding_status, apply_founding_portfolio_catalogue, SETTINGS_ID,
    portfolio_cards, storage_cards,
)
from pricing_engine import compute_plan_offer                   # noqa: E402
from pricing_public import build_public_pricing_router          # noqa: E402
from tests.test_storage_orchestrator import FakeDB              # noqa: E402


def _endpoints(router):
    out = {}
    for r in getattr(router, "routes", []):
        for m in (getattr(r, "methods", None) or []):
            out[(r.path, m)] = r.endpoint
    return out

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


async def _run():
    db = FakeDB()

    print("=== settings seed: founding DISABLED by default ===")
    r1 = await seed_founding_settings(db)
    ok("first seed creates the settings doc", r1["created"] == 1)
    r2 = await seed_founding_settings(db)
    ok("second seed is idempotent (skipped)", r2["skipped"] == 1)
    s = await get_founding_settings(db)
    ok("founding is OFF by default (nothing goes live)", s["founding_users_enabled"] is False)
    ok("default limit is 100", s["founding_user_limit"] == 100)

    print("\n=== seat counting: per PAYING portfolio studio ===")
    await db.subscriptions.insert_one({"studio_id": "s1", "product": "portfolio", "status": "active"})
    await db.subscriptions.insert_one({"studio_id": "s2", "product": "portfolio", "status": "active"})
    await db.subscriptions.insert_one({"studio_id": "s2", "product": "portfolio", "status": "active"})  # dup studio
    await db.subscriptions.insert_one({"studio_id": "s3", "product": "portfolio", "status": "cancelled"})  # not paying
    await db.subscriptions.insert_one({"studio_id": "s4", "product": "storage", "status": "active"})  # other product
    ok("distinct paying portfolio studios counted (s1, s2)", await count_founding_studios(db) == 2)

    print("\n=== status: OFF -> regular; ON -> founding with seats ===")
    st = await founding_status(db)
    ok("disabled settings -> regular mode", st["mode"] == "regular")
    await db.pricing_settings.update_one({"id": SETTINGS_ID}, {"$set": {"founding_users_enabled": True}})
    st = await founding_status(db)
    ok("enabled with seats -> founding mode", st["mode"] == "founding")
    ok("slots_left = 100 - 2", st["slots_left"] == 98)
    # simulate the limit being reached
    await db.pricing_settings.update_one({"id": SETTINGS_ID}, {"$set": {"founding_user_limit": 2}})
    st = await founding_status(db)
    ok("seats gone + auto-switch -> regular (sold out)", st["mode"] == "regular" and st["sold_out"] is True)

    print("\n=== apply catalogue: safe on a post-2026 DB (the realistic precondition) ===")
    # The old version of this section seeded an EMPTY FakeDB against the legacy
    # 3-tier catalog, so it never exercised the real-world state and missed
    # that the apply button would roll live prices back and collide on
    # plan_portfolio_pro's id. Run the real startup migration FIRST.
    import pricing_migration
    await pricing_migration.apply_pricing_2026(db)

    res = await apply_founding_portfolio_catalogue(db)
    ok("apply touches exactly the 5 canonical plans", res["updated"] == 5 and res["created"] == 0)
    all_portfolio = [p async for p in db.subscription_plans.find({"product": "portfolio"})
                     if p.get("is_active", True)]
    ok("still exactly the 5 canonical ids (no plan_portfolio_pro collision)",
       sorted(p["id"] for p in all_portfolio) ==
       ["plan_portfolio_advanced", "plan_portfolio_basic", "plan_portfolio_custom",
        "plan_portfolio_premium", "plan_portfolio_pro"])
    basic = await db.subscription_plans.find_one({"id": "plan_portfolio_basic"})
    ok("Basic durations stay at the approved finals (499/1399/2699/4999)",
       basic["durations"] == {"1": 499, "3": 1399, "6": 2699, "12": 4999})
    ok("Basic storage stays 512 MB (not stomped to 2 GB)",
       basic["storage_label"] == "512 MB" and basic["storage_mb"] == 512)
    prem = await db.subscription_plans.find_one({"id": "plan_portfolio_premium"})
    ok("Premium durations stay at the approved finals (1999/5699/10799/20399)",
       prem["durations"] == {"1": 1999, "3": 5699, "6": 10799, "12": 20399})
    ok("founding is inert until the owner sets it (founding == regular, no rollback)",
       all(p["durations_founding"] == p["durations"] for p in all_portfolio))

    # through the engine: with founding == regular there must be NO fake strike
    offer = compute_plan_offer(prem, "1", "founding")
    ok("Premium founding monthly pays the regular 1999", offer["effective_price"] == 1999)
    ok("no fake founding strike-through when founding == regular",
       not offer.get("strikethrough"))

    # re-apply is idempotent (updates in place, still 5 active plans)
    res2 = await apply_founding_portfolio_catalogue(db)
    ok("re-apply updates in place (no duplicates)", res2["updated"] == 5 and res2["created"] == 0)
    all_portfolio = [p async for p in db.subscription_plans.find({"product": "portfolio"})
                     if p.get("is_active", True)]
    ok("still exactly 5 active portfolio plans", len(all_portfolio) == 5)

    print("\n=== public builders: portfolio + storage cards (legacy 3-tier fixtures) ===")
    # portfolio_cards is a pure builder — exercise it with hand-made fixtures
    # (independent of the DB state above) to keep covering the founding-strike
    # math that only shows when founding prices genuinely differ.
    await db.pricing_settings.update_one({"id": SETTINGS_ID}, {"$set": {"founding_user_limit": 100}})
    st_now = await founding_status(db)
    fixture_plans = [
        {"product": "portfolio", "tier": "Basic", "portfolio_tier": "basic",
         "sort_order": 1, "features": ["Everything in Free"],
         "durations": {"1": 499, "3": 1299, "6": 2399, "12": 3999},
         "durations_founding": {"1": 299, "3": 799, "6": 1499, "12": 2499}},
        {"product": "portfolio", "tier": "Premium", "portfolio_tier": "premium",
         "sort_order": 2, "popular": True, "badge": "MOST POPULAR",
         "durations": {"1": 999, "3": 2499, "6": 4499, "12": 7999},
         "durations_founding": {"1": 599, "3": 1599, "6": 2999, "12": 4999}},
        {"product": "portfolio", "tier": "Pro Studio", "portfolio_tier": "pro",
         "sort_order": 3,
         "durations": {"1": 1999, "3": 4999, "6": 8999, "12": 15999},
         "durations_founding": {"1": 1199, "3": 3199, "6": 5999, "12": 9999}},
    ]
    cards = portfolio_cards(fixture_plans, st_now["mode"])
    ok("fixture cards actually rendered (guard against vacuous pass)", len(cards) == 3)
    ok("three portfolio cards, ordered Basic->Premium->Pro", [c["tier"] for c in cards] == ["Basic", "Premium", "Pro Studio"])
    ok("each card carries all 4 cycles", all(set(c["cycles"].keys()) == {"1", "3", "6", "12"} for c in cards))
    ok("founding mode monthly Basic shows strike + 40% off",
       cards[0]["cycles"]["1"]["strikethrough"] == 499 and cards[0]["cycles"]["1"]["pct_off"] == 40)
    ok("cards carry marketing features", "Everything in Free" in cards[0]["features"])
    ok("Premium card is popular with a MOST POPULAR badge",
       cards[1]["popular"] and cards[1]["badge"] == "MOST POPULAR")

    # storage plans (a couple, mirroring studio_storage shape)
    await db.studio_storage_plans.insert_one({"id": "s100m", "gb_limit": 100, "duration_days": 30,
                                              "price_inr": 299, "price_founding_inr": 199, "is_active": True})
    await db.studio_storage_plans.insert_one({"id": "s100y", "gb_limit": 100, "duration_days": 365,
                                              "price_inr": 2999, "price_founding_inr": 1999, "is_active": True})
    await db.studio_storage_plans.insert_one({"id": "s1tb", "gb_limit": 1024, "duration_days": 30,
                                              "price_inr": 1599, "price_founding_inr": 1199, "is_active": True})
    stor = storage_cards(await db.studio_storage_plans.find({}).to_list(100), "founding")
    ok("storage grouped by capacity (100 GB, 1 TB)", [t["label"] for t in stor] == ["100 GB", "1 TB"])
    ok("100 GB is Most Popular", stor[0]["popular"] and stor[0]["badge"] == "MOST POPULAR")
    ok("1 TB carries the Professional Studios badge", stor[1]["badge"] == "PROFESSIONAL STUDIOS")
    ok("100 GB monthly founding strike 299 -> 199", stor[0]["cycles"]["30"]["strikethrough"] == 299
       and stor[0]["cycles"]["30"]["effective_price"] == 199)

    print("\n=== public endpoints ===")
    ep = _endpoints(build_public_pricing_router(db))
    port = await ep[("/api/public/pricing/portfolio", "GET")]()
    ok("portfolio endpoint returns the free card + the 5 canonical plans",
       port["free"]["tier"] == "Free" and len(port["plans"]) == 5)
    ok("portfolio endpoint reports the founding mode + seats",
       "mode" in port and "slots_left" in port["founding"])
    # The endpoint now seeds + reads the LIVE studio_storage_plans rows (v3
    # catalog: 50/100/250/500 GB + 1 TB; the 3 rows inserted above join their
    # gb groups). 750 GB must never appear — no owner price exists (docs §4).
    se = await ep[("/api/public/pricing/storage", "GET")]()
    labels = [t["label"] for t in se["tiers"]]
    ok("storage endpoint returns the 5 v3 capacity tiers", len(se["tiers"]) == 5)
    ok("50 GB and 1 TB anchors present, no 750 GB tier",
       "50 GB" in labels and "1 TB" in labels and not any("750" in l for l in labels))
    by_gb = {t["gb_limit"]: t for t in se["tiers"]}
    ok("anchors are approved; carried 100 GB awaits owner re-price",
       by_gb[50]["approved"] is True and by_gb[100]["approved"] is False)
    ok("50 GB monthly ₹299 / 1 TB yearly ₹30,599 (owner anchors, founding-proof)",
       by_gb[50]["cycles"]["30"]["final_inr"] == 299
       and by_gb[1024]["cycles"]["365"]["final_inr"] == 30599)
    fs = await ep[("/api/public/pricing/founding-status", "GET")]()
    ok("founding-status endpoint returns a mode", fs["mode"] in ("founding", "regular"))

    print("\n=== invitations + individually-priced designs ===")
    # 2026 shape: 3 tiers x 3 additive components (docs §6) — the old static
    # Classic/Premium/Royal/Bespoke card list is gone.
    inv = await ep[("/api/public/pricing/invitations", "GET")]()
    inv_by_key = {t["key"]: t for t in inv["tiers"]}
    ok("3 invitation tiers (basic/premium/custom)",
       sorted(inv_by_key) == ["basic", "custom", "premium"])
    ok("basic components are ₹5,000/2,000/2,000, all three ₹9,000",
       inv_by_key["basic"]["components"] == {"digital": 5000, "video": 2000, "physical": 2000}
       and inv_by_key["basic"]["all_three_inr"] == 9000)
    ok("premium all three ₹16,000; custom all three ₹20,000",
       inv_by_key["premium"]["all_three_inr"] == 16000
       and inv_by_key["custom"]["all_three_inr"] == 20000)

    # designs: one on sale (real discount), one full price (no fake strike)
    await db.pricing_design_prices.insert_one({"id": "d1", "audience": "normal_user", "design_id": "rose",
        "name": "Rose Gold", "base_price": 1000, "sale_price": 700, "active": True, "thumbnail_url": "/t/rose.jpg"})
    await db.pricing_design_prices.insert_one({"id": "d2", "audience": "normal_user", "design_id": "plain",
        "name": "Plain", "base_price": 999, "sale_price": 999, "active": True})
    await db.pricing_design_prices.insert_one({"id": "d3", "audience": "normal_user", "design_id": "hidden",
        "name": "Hidden", "base_price": 500, "active": False})
    dz = await ep[("/api/public/pricing/designs", "GET")]()
    by_id = {d["design_id"]: d for d in dz["designs"]}
    ok("inactive designs are excluded", "hidden" not in by_id)
    ok("a discounted design shows a real strike + %",
       by_id["rose"]["strikethrough"] == 1000 and by_id["rose"]["price"] == 700 and by_id["rose"]["discount_pct"] == 30)
    ok("a full-price design shows NO fake strike",
       by_id["plain"]["strikethrough"] is None and by_id["plain"]["discount_pct"] == 0)

    print("\n=== super-admin controls (Phase 5) ===")
    from founding_admin import build_founding_admin_router
    aep = _endpoints(build_founding_admin_router(db, lambda: {"role": "super_admin"}))
    SU = {"role": "super_admin"}

    snap = await aep[("/api/super-admin/founding/status", "GET")](_su=SU)
    ok("admin status returns settings + plans + live status",
       "settings" in snap and "plans" in snap and "status" in snap)

    # turn founding ON with a limit of 5
    class _P:  # minimal stand-in for a pydantic body: attribute access + .dict()
        def __init__(self, **kw): self._kw = kw
        def __getattr__(self, name): return self._kw.get(name)   # missing field -> None
        def dict(self, exclude_none=False): return {k: v for k, v in self._kw.items() if not (exclude_none and v is None)}
    snap = await aep[("/api/super-admin/founding/settings", "PATCH")](_P(founding_users_enabled=True, founding_user_limit=5), _su=SU)
    ok("enabling founding flips the live mode to founding", snap["status"]["mode"] == "founding")
    ok("limit is applied (5)", snap["settings"]["founding_user_limit"] == 5)

    # bad limit is rejected
    threw = False
    try:
        await aep[("/api/super-admin/founding/settings", "PATCH")](_P(founding_user_limit=-3), _su=SU)
    except Exception as e:
        threw = getattr(e, "status_code", None) == 400
    ok("a negative seat limit is rejected (400)", threw)

    # edit one plan's founding monthly price
    # Path param renamed {tier} -> {plan_key}: the endpoint takes a plan ID, or
    # a tier name while that name is unambiguous (test_founding_plan_key.py).
    # The URL a client calls is unchanged; only this by-path lookup moved.
    snap = await aep[("/api/super-admin/founding/portfolio/{plan_key}", "PATCH")](
        "Basic", _P(durations_founding={"1": 249}), _su=SU)
    edited = await db.subscription_plans.find_one({"product": "portfolio", "tier": "Basic"})
    ok("admin edited Basic founding monthly to 249", edited["durations_founding"]["1"] == 249)

    # apply-catalogue resets founding to the catalog (== regular, since the
    # owner has approved no founding discounts for the 5-plan catalog yet)
    snap = await aep[("/api/super-admin/founding/apply-catalogue", "POST")](_su=SU)
    reset = await db.subscription_plans.find_one({"product": "portfolio", "tier": "Basic"})
    ok("apply-catalogue resets Basic founding monthly to regular 499",
       reset["durations_founding"]["1"] == 499 and reset["durations"]["1"] == 499)
    ok("apply-catalogue reports what it wrote (5 plans)",
       snap["applied"]["updated"] + snap["applied"]["created"] == 5)

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(_run())
