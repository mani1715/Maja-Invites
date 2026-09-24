"""
test_subscription_pricing_2026.py — 2026 pricing redesign, subscription/portfolio leg.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_subscription_pricing_2026.py -q
    (or, no pytest needed for the in-process half)
    cd backend && python -m tests.test_subscription_pricing_2026

Covers docs/PRICING_REDESIGN_2026.md §2/§3/§5/§7 as implemented in
subscription_service.py, pricing_migration.py (apply_pricing_2026) and
pricing_hub_service.py (update_plan):
  - portfolio quote math now routes through pricing_catalog.compute_cycle_breakdown
    (psychological rounding, GST-INCLUDED total, Custom's one-time setup fee
    gated to first purchase, 15% not 20% yearly discount).
  - subscription_plans(product=portfolio).durations is derived from base_monthly
    by ONE helper (subscription_service.sync_plan_durations), called from BOTH
    admin editors, so the two can no longer disagree.
  - enhanced_admin_service.py's GET /api/admin/pricing/designs no longer shadows
    pricing_hub_service.py's canonical GET at the same path.

Two kinds of test here:
  1. In-process (FakeDB, no network) — call router endpoint functions directly,
     as tests/test_settlement_webhooks_subs.py and tests/test_pricing_migration.py
     already do. These exercise THIS session's source edits directly and run
     today regardless of whether any server process is up.
  2. Real HTTP routing (tests/live.py's require_live/login pattern), at the
     bottom, prefixed `test_live_*`. These need the actual backend process
     RESTARTED to pick up this session's edits (no --reload — SESSION_CONTEXT/
     CLAUDE.md) and are written to skip cleanly, not fail, when nothing answers
     at REACT_APP_BACKEND_URL / http://localhost:8001 — which is the case as
     this file is written (backend not running in this session). Per the task
     brief: do not restart the backend mid-suite; these are left for the
     master's restart+run. `require_live()` is called INSIDE each live test
     function (never at module scope) precisely so a down server skips only
     those two tests, not this whole file's in-process half.
"""
from __future__ import annotations

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

import requests

from tests.test_storage_orchestrator import FakeDB
from tests.live import UA_HEADER, login, require_live

import pricing_catalog
import subscription_service as subs
import pricing_migration as mig
import pricing_hub_service as phs


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


async def _require_admin():   # never actually called — endpoints invoked directly
    raise NotImplementedError


async def _require_super_admin():
    raise NotImplementedError


def _sub_router(db):
    return subs.build_subscription_router(db, None, _require_admin, _require_super_admin)


async def _seeded_db() -> FakeDB:
    """A FakeDB carrying the 5 canonical 2026 portfolio plans, produced by the
    REAL apply_pricing_2026 (not hand-rolled plan docs) — these tests fail if
    the migration's shape ever drifts from what _quote expects."""
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    return db


# --------------------------------------------------------------------------- #
# PLAN_CATALOG <-> pricing_catalog parity (§2 — no duplicated numbers)
# --------------------------------------------------------------------------- #
async def test_plan_catalog_portfolio_derived_from_pricing_catalog():
    print("\n[1] subscription_service.PLAN_CATALOG's portfolio rows == pricing_catalog.PORTFOLIO_PLANS")
    by_tier = {p["tier"]: p for p in subs.PLAN_CATALOG if p["product"] == "portfolio"}
    _check(set(by_tier) == {"Basic", "Pro", "Advanced", "Premium", "Custom"},
           "exactly the 5 new tiers, no leftover Basic/Premium-only pair")
    for cat in pricing_catalog.PORTFOLIO_PLANS:
        row = by_tier[cat["name"]]
        _check(row["base_monthly"] == cat["base_monthly_inr"], f"{cat['name']} base_monthly matches catalog")
        _check(row["setup_fee_inr"] == cat["setup_fee_inr"], f"{cat['name']} setup_fee_inr matches catalog")
        _check(row["storage_mb"] == cat["storage_mb"], f"{cat['name']} storage_mb matches catalog")
        _check(row["storage_label"] == cat["storage_label"], f"{cat['name']} storage_label matches catalog")
        _check(row["portfolio_tier"] == cat["portfolio_tier"], f"{cat['name']} portfolio_tier matches catalog")
    _check(by_tier["Basic"]["storage_gb"] == 0.5, "Basic storage_gb == 0.5 (512 MB, exact)")
    _check(by_tier["Basic"]["features"] == subs.PORTFOLIO_BASIC_FEATURES, "Basic keeps the Basic feature list")
    for tier in ("Pro", "Advanced", "Premium", "Custom"):
        _check(by_tier[tier]["features"] == subs.PORTFOLIO_PREMIUM_FEATURES,
               f"{tier} gets the (pre-redesign) Premium feature list")


# --------------------------------------------------------------------------- #
# _quote — portfolio math (§3, §7)
# --------------------------------------------------------------------------- #
async def test_quote_basic_quarterly_total():
    print("\n[2] quote: Basic/quarterly total_paise == 139900")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Basic", cycle="quarterly"))
    _check(q["total_paise"] == 139900, f"got {q['total_paise']}")


async def test_quote_premium_yearly_total():
    print("\n[3] quote: Premium/yearly total_paise == 2039900")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Premium", cycle="yearly"))
    _check(q["total_paise"] == 2039900, f"got {q['total_paise']}")


async def test_quote_basic_monthly_passthrough_no_psych_rounding():
    print("\n[4] quote: Basic/monthly == 49900, NOT 39900 (monthly never psych-rounds)")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Basic", cycle="monthly"))
    _check(q["total_paise"] == 49900, f"got {q['total_paise']}")
    _check(q["total_paise"] != 39900, "must not have been psych-rounded")


async def test_quote_custom_first_purchase_monthly_includes_setup_fee():
    print("\n[5] quote: Custom/monthly, first purchase (anonymous) == 699900, setup fee included")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Custom", cycle="monthly"))
    _check(q["total_paise"] == 699900, f"got {q['total_paise']}")
    _check(q["is_first_purchase"] is True, "no studio context -> assumed first purchase (never under-quote)")
    _check(q["setup_fee_paise"] == 500_000, "5000 INR setup fee = 500000 paise")


async def test_quote_gst_paise_formula():
    print("\n[6] quote: gst_paise == total_paise - round(total_paise / 1.18)")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Advanced", cycle="half_yearly"))
    expected_gst = q["total_paise"] - round(q["total_paise"] / 1.18)
    _check(q["gst_paise"] == expected_gst, f"got {q['gst_paise']}, expected {expected_gst}")


async def test_custom_renewal_skips_setup_fee():
    print("\n[7] Custom renewal (studio already has a non-pending Custom sub) -> 199900, no setup fee")
    db = await _seeded_db()
    # A prior, already-settled Custom subscription for this studio.
    await db.subscriptions.insert_one({
        "id": "sub_prior_custom", "studio_id": "studio_1", "product": "portfolio",
        "tier": "Custom", "cycle": "monthly", "status": "active",
        "current_period_start": subs._now_iso(), "current_period_end": subs._now_iso(),
        "created_at": subs._now_iso(),
    })
    await db.admins.insert_one({"id": "studio_1", "is_test": True})  # free instant-activation path
    router = _sub_router(db)
    create_ep = _endpoint(router, "/api/subscriptions/create", "POST")
    await create_ep(subs.CreateSubscriptionRequest(product="portfolio", tier="Custom", cycle="monthly"),
                    admin={"admin_id": "studio_1"})
    new_sub = await db.subscriptions.find_one(
        {"studio_id": "studio_1", "tier": "Custom", "status": "active", "id": {"$ne": "sub_prior_custom"}},
        {"_id": 0})
    _check(new_sub is not None, "second Custom subscription row created")
    _check(new_sub["quote"]["total_paise"] == 199900, f"got {new_sub['quote']['total_paise']}")
    _check(new_sub["quote"]["is_first_purchase"] is False, "gate correctly saw the prior active row")
    _check(new_sub["quote"]["setup_fee_paise"] == 0, "no setup fee on renewal")


async def test_yearly_discount_is_15_not_20():
    print("\n[8] yearly discount is 15%, not the old 20%")
    _check(subs.CYCLES["yearly"]["discount"] == 0.15, f"got {subs.CYCLES['yearly']['discount']}")
    db = await _seeded_db()
    quote_ep = _endpoint(_sub_router(db), "/api/subscriptions/quote", "POST")
    q = await quote_ep(subs.QuoteRequest(product="portfolio", tier="Basic", cycle="yearly"))
    list_inr = 499 * 12
    _check(q["list_paise"] // 100 == list_inr, "list_paise == base_monthly x 12, undiscounted")
    _check(q["pct_off"] == 15, f"pct_off reported as 15, got {q['pct_off']}")
    # A stale 20% override would UNDER-charge relative to the approved 15%
    # figure (a bigger discount -> a lower price) — make the comparison
    # concrete rather than trusting pct_off alone.
    naive_20pct_paise = round(list_inr * 100 * 0.80)
    _check(q["total_paise"] > naive_20pct_paise,
           "final is MORE than a naive 20%-off total would be — a stale 20% "
           "override would have under-charged")


# --------------------------------------------------------------------------- #
# Migration output: durations on the served plan rows == pricing_catalog finals
# --------------------------------------------------------------------------- #
async def test_migrated_plan_durations_match_catalog_finals():
    print("\n[9] every migrated portfolio plan's durations{1,3,6,12} == pricing_catalog finals")
    db = await _seeded_db()
    router = _sub_router(db)
    plans_ep = _endpoint(router, "/api/subscriptions/plans", "GET")
    listed = await plans_ep(product="portfolio")
    _check(len(listed["plans"]) == 5, f"5 active portfolio plans served, got {len(listed['plans'])}")
    by_key = {p["key"]: p for p in pricing_catalog.PORTFOLIO_PLANS}
    tier_to_key = {"Basic": "basic", "Pro": "pro", "Advanced": "advanced",
                  "Premium": "premium", "Custom": "custom"}
    for p in listed["plans"]:
        cat = by_key[tier_to_key[p["tier"]]]
        for dur_key, cyc in subs.DURATION_KEY_TO_CATALOG_CYCLE.items():
            expected = pricing_catalog.compute_cycle_breakdown(
                cat["base_monthly_inr"], cyc)["final_paise"] // 100
            got = p["durations"][dur_key]
            _check(got == expected, f"{p['tier']} durations[{dur_key}]: got {got}, expected {expected}")


async def test_legacy_and_storage_plans_deactivated():
    print("\n[10] apply_pricing_2026 deactivates legacy portfolio rows + every storage plan")
    db = await _seeded_db()
    await db.subscription_plans.insert_one({
        "id": "plan_legacy_pro_studio", "product": "portfolio", "tier": "Pro Studio", "is_active": True})
    await db.subscription_plans.insert_one({
        "id": "plan_storage_starter", "product": "storage", "tier": "Starter", "is_active": True})
    # re-run: marker already set, so this proves nothing NEW gets deactivated by
    # a second call (idempotent) — insert the legacy rows AFTER first apply,
    # then call the un-gated bodies directly is out of scope; instead verify
    # via a fresh db that a single application catches rows present up front.
    db2 = FakeDB()
    await db2.subscription_plans.insert_one({
        "id": "plan_legacy_pro_studio", "product": "portfolio", "tier": "Pro Studio", "is_active": True})
    await db2.subscription_plans.insert_one({
        "id": "plan_storage_starter", "product": "storage", "tier": "Starter", "is_active": True})
    await db2.subscription_plans.insert_one({
        "id": "plan_portfolio_test", "product": "portfolio", "tier": "Premium", "is_active": False})
    await mig.apply_pricing_2026(db2)
    legacy = await db2.subscription_plans.find_one({"id": "plan_legacy_pro_studio"}, {"_id": 0})
    storage = await db2.subscription_plans.find_one({"id": "plan_storage_starter"}, {"_id": 0})
    test_plan = await db2.subscription_plans.find_one({"id": "plan_portfolio_test"}, {"_id": 0})
    _check(legacy["is_active"] is False, "legacy 'Pro Studio' portfolio row deactivated")
    _check(storage["is_active"] is False, "product=storage row deactivated")
    _check(test_plan["is_active"] is False, "plan_portfolio_test left alone (was already inactive)")


async def test_apply_pricing_2026_is_marker_gated():
    print("\n[11] apply_pricing_2026 is a no-op on a second call (marker-gated, protects admin edits)")
    db = await _seeded_db()
    await db.subscription_plans.update_one(
        {"id": "plan_portfolio_basic"}, {"$set": {"base_monthly": 12345}})
    res = await mig.apply_pricing_2026(db)
    _check(res == {"skipped": "already applied"}, f"got {res}")
    row = await db.subscription_plans.find_one({"id": "plan_portfolio_basic"}, {"_id": 0})
    _check(row["base_monthly"] == 12345, "a post-migration admin edit survives a second apply_pricing_2026 call")


# --------------------------------------------------------------------------- #
# Single-writer durations sync (§5) — the hub PUT path
# --------------------------------------------------------------------------- #
async def test_hub_put_plan_recomputes_durations_from_base_monthly():
    print("\n[12] pricing_hub PUT /api/admin/pricing/plans/{id}: base_monthly recomputes durations,"
          " client-sent durations ignored")
    db = await _seeded_db()
    put_ep = _endpoint(phs.build_pricing_hub_router(db, _require_super_admin),
                       "/api/admin/pricing/plans/{plan_id}", "PUT")
    await put_ep("plan_portfolio_basic",
                 {"base_monthly": 599, "durations": {"1": 1, "3": 1, "6": 1, "12": 1}},
                 admin={"admin_id": "super_1"})
    row = await db.subscription_plans.find_one({"id": "plan_portfolio_basic"}, {"_id": 0})
    _check(row["base_monthly"] == 599, "base_monthly saved")
    expected_1mo = pricing_catalog.compute_cycle_breakdown(599, "monthly")["final_paise"] // 100
    _check(row["durations"]["1"] == expected_1mo, f"durations recomputed: got {row['durations']['1']}")
    _check(row["durations"]["1"] != 1, "client-sent durations value was NOT honored")


async def test_upsert_plan_also_syncs_durations():
    print("\n[13] subscription_service upsert_plan (POST /api/admin/subscription-plans) syncs durations too")
    db = await _seeded_db()
    router = _sub_router(db)
    upsert_ep = _endpoint(router, "/api/admin/subscription-plans", "POST")
    await upsert_ep(subs.UpsertPlanRequest(product="portfolio", tier="Basic", base_monthly=799),
                    _super={"admin_id": "super_1"})
    row = await db.subscription_plans.find_one({"id": "plan_portfolio_basic"}, {"_id": 0})
    expected_1mo = pricing_catalog.compute_cycle_breakdown(799, "monthly")["final_paise"] // 100
    _check(row["base_monthly"] == 799, "base_monthly saved")
    _check(row["durations"]["1"] == expected_1mo, f"durations kept in sync: got {row['durations']['1']}")


# --------------------------------------------------------------------------- #
# Unshadow: GET /api/admin/pricing/designs (§ task 7)
# --------------------------------------------------------------------------- #
async def test_enhanced_designs_route_renamed():
    print("\n[14] enhanced_admin_service no longer registers GET /api/admin/pricing/designs")
    import enhanced_admin_service as eas
    router = eas.build_enhanced_admin_router(None, _require_super_admin)
    paths = {getattr(r, "path", None) for r in router.routes}
    _check("/api/admin/pricing/designs" not in paths, "old shadowing path is gone")
    _check("/api/admin/pricing/designs-enhanced" in paths, "renamed to /designs-enhanced")


async def test_pricing_hub_designs_route_unshadowed_when_both_mounted():
    print("\n[15] with BOTH routers mounted (server.py order), GET /designs resolves to pricing_hub_service")
    from fastapi import FastAPI
    import enhanced_admin_service as eas
    app = FastAPI()
    # Same order as server.py: enhanced_admin_router included BEFORE the hub.
    app.include_router(eas.build_enhanced_admin_router(None, _require_super_admin))
    app.include_router(phs.build_pricing_hub_router(None, _require_super_admin))
    matches = [r for r in app.routes
              if getattr(r, "path", None) == "/api/admin/pricing/designs" and "GET" in getattr(r, "methods", set())]
    _check(len(matches) == 1, f"exactly one GET /api/admin/pricing/designs route now, got {len(matches)}")
    _check(matches[0].endpoint.__module__ == "pricing_hub_service",
           f"the surviving route is pricing_hub_service's, got {matches[0].endpoint.__module__}")


# --------------------------------------------------------------------------- #
# Real HTTP routing (tests/live.py) — needs the backend RESTARTED to pick up
# this session's edits. Skip cleanly (not fail) if nothing is listening; the
# master runs these after restarting. `require_live()` is called INSIDE each
# function, not at module scope, so a down server skips only these two tests.
# --------------------------------------------------------------------------- #
SUPER = ("mani_8328@majacreations.com", "Maneesh@1234")  # CLAUDE.md's documented local super-admin login


def test_live_quote_basic_quarterly_matches_catalog():
    base = require_live()
    r = requests.post(f"{base}/api/subscriptions/quote",
                      json={"product": "portfolio", "tier": "Basic", "cycle": "quarterly"},
                      headers=UA_HEADER, timeout=15)
    assert r.status_code == 200, r.text[:300]
    assert r.json()["total_paise"] == 139900


def test_live_admin_pricing_designs_returns_hub_shape_not_enhanced():
    base = require_live()
    headers = {**UA_HEADER, "Authorization": f"Bearer {login(*SUPER)}"}
    r = requests.get(f"{base}/api/admin/pricing/designs", headers=headers, timeout=15)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "designs" in body, body
    assert "success" not in body and "count" not in body, (
        "still answering enhanced_admin_service's shape "
        f"({{'success','designs','count'}}) instead of pricing_hub_service's ({{'designs'}}): {body}")


# --------------------------------------------------------------------------- #
# standalone runner — the in-process half only (no server required)
# --------------------------------------------------------------------------- #
async def main():
    print("MAJA — 2026 pricing redesign: subscription/portfolio leg")
    await test_plan_catalog_portfolio_derived_from_pricing_catalog()
    await test_quote_basic_quarterly_total()
    await test_quote_premium_yearly_total()
    await test_quote_basic_monthly_passthrough_no_psych_rounding()
    await test_quote_custom_first_purchase_monthly_includes_setup_fee()
    await test_quote_gst_paise_formula()
    await test_custom_renewal_skips_setup_fee()
    await test_yearly_discount_is_15_not_20()
    await test_migrated_plan_durations_match_catalog_finals()
    await test_legacy_and_storage_plans_deactivated()
    await test_apply_pricing_2026_is_marker_gated()
    await test_hub_put_plan_recomputes_durations_from_base_monthly()
    await test_upsert_plan_also_syncs_durations()
    await test_enhanced_designs_route_renamed()
    await test_pricing_hub_designs_route_unshadowed_when_both_mounted()
    print("\nALL IN-PROCESS CHECKS PASSED (2 live-HTTP tests not run here — see module docstring)")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
