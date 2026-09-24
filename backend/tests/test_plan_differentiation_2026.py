"""
test_plan_differentiation_2026.py — pricing-completion wave, 3 tasks from
docs/PRICING_REDESIGN_2026.md §9 (owner-flagged items 2, 3, 4):

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_plan_differentiation_2026.py -q

1. Truthful Pro/Advanced/Premium/Custom differentiation — proves the mapping
   in pricing_catalog.PORTFOLIO_PLANS by calling the REAL consumer functions
   (portfolio_service._plan_tier_of / _base_storage_cap_bytes /
   _portfolio_sections, photographer_directory.query_directory,
   community_gating.studio_tier), and proves WHY portfolio_tier cannot safely
   become a third value ("pro") for Advanced/Custom.
2. Founding made explicit — durations_founding == durations (inert) never
   shows a fake strike-through, and carries an explicit `founding_configured`
   signal; founding mode is never reachable from client input.
3. Legacy invitation-subscription retirement — pricing_migration's new,
   separate v2 marker deactivates product=invitation plans without touching
   v1's marker/state; subscription_service._quote still renews an existing
   holder but 404s a new buyer.

In-memory FakeDB (tests.test_storage_orchestrator.FakeDB); no Postgres, no
network, no server restart required.
"""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi import HTTPException

import pricing_catalog
import subscription_service as subs
import pricing_migration as mig
import founding_pricing as fp
from tests.test_storage_orchestrator import FakeDB


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


async def _require_admin():   # never actually called — endpoints invoked directly
    raise NotImplementedError


async def _require_super_admin():
    raise NotImplementedError


def _sub_router(db):
    return subs.build_subscription_router(db, None, _require_admin, _require_super_admin)


PLAN_ID_BY_KEY = {p["key"]: f"plan_portfolio_{p['key']}" for p in pricing_catalog.PORTFOLIO_PLANS}
NAME_BY_KEY = {p["key"]: p["name"] for p in pricing_catalog.PORTFOLIO_PLANS}


# --------------------------------------------------------------------------- #
# TASK 1 — truthful Pro/Advanced/Premium/Custom differentiation
# --------------------------------------------------------------------------- #
def test_catalog_portfolio_tier_is_only_basic_or_premium():
    print("\n[1] pricing_catalog.PORTFOLIO_PLANS: portfolio_tier is 'basic' only for Basic")
    for p in pricing_catalog.PORTFOLIO_PLANS:
        expect = "basic" if p["key"] == "basic" else "premium"
        assert p["portfolio_tier"] == expect, (p["key"], p["portfolio_tier"])


def test_plan_tier_of_resolves_all_5_catalog_plans_correctly():
    print("[2] portfolio_service._plan_tier_of resolves each of the 5 real plan docs")
    from portfolio_service import _plan_tier_of
    for p in pricing_catalog.PORTFOLIO_PLANS:
        plan_doc = {"tier": p["name"], "portfolio_tier": p["portfolio_tier"]}
        expect = "basic" if p["key"] == "basic" else "premium"
        assert _plan_tier_of({}, plan_doc) == expect, (p["name"], _plan_tier_of({}, plan_doc))


def test_portfolio_tier_pro_would_silently_downgrade_advanced_and_custom():
    print("[3] LOAD-BEARING: remapping portfolio_tier to 'pro' downgrades Advanced/Custom")
    # This is the finding that drove keeping portfolio_tier="premium" for all
    # four non-Basic plans instead of inventing a third "pro" gate level.
    # portfolio_service._plan_tier_of and photographer_directory's own copy of
    # the same rule both special-case ONLY the literal strings "premium" and
    # "basic"; anything else falls back to inferring the tier from the PLAN
    # NAME against {"professional","studio","premium","elite","pro",
    # "enterprise"} — a list that does NOT contain "advanced" or "custom".
    from portfolio_service import _plan_tier_of
    assert _plan_tier_of({}, {"tier": "Advanced", "portfolio_tier": "pro"}) == "basic", (
        "a 'pro' portfolio_tier on the Advanced plan would silently drop it to basic")
    assert _plan_tier_of({}, {"tier": "Custom", "portfolio_tier": "pro"}) == "basic", (
        "a 'pro' portfolio_tier on the Custom plan would silently drop it to basic")
    # The plan literally named "Pro" survives only by coincidence (its own
    # name happens to be in the fallback allow-list) — fragile, not a real gate.
    assert _plan_tier_of({}, {"tier": "Pro", "portfolio_tier": "pro"}) == "premium"


async def test_base_storage_cap_bytes_differentiates_each_of_the_5_plans():
    print("[4] portfolio_service._base_storage_cap_bytes: real byte caps per plan (the ONE real differentiator)")
    from portfolio_service import _base_storage_cap_bytes
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    for p in pricing_catalog.PORTFOLIO_PLANS:
        sid = f"studio_{p['key']}"
        await db.subscriptions.insert_one({
            "studio_id": sid, "product": "portfolio", "plan_id": PLAN_ID_BY_KEY[p["key"]],
            "tier": p["name"], "status": "active",
        })
        got = await _base_storage_cap_bytes(db, sid)
        expected = int(p["storage_mb"] * 1024 * 1024)
        assert got == expected, (p["name"], got, expected)
    # Storage strictly differentiates Basic < Pro < Advanced < Premium == Custom.
    caps = {p["name"]: await _base_storage_cap_bytes(db, f"studio_{p['key']}")
            for p in pricing_catalog.PORTFOLIO_PLANS}
    assert caps["Basic"] < caps["Pro"] < caps["Advanced"] < caps["Premium"]
    assert caps["Premium"] == caps["Custom"], "Custom's extra is the setup fee, not more storage"


async def test_portfolio_sections_are_identical_across_pro_advanced_premium_custom():
    print("[5] portfolio_service._portfolio_sections: no per-plan restriction —"
          " matches the owner's own '(full sections)' note in docs §3")
    from portfolio_service import _portfolio_sections, PREMIUM_SECTIONS
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    for p in pricing_catalog.PORTFOLIO_PLANS:
        sid = f"studio_sect_{p['key']}"
        await db.subscriptions.insert_one({
            "studio_id": sid, "product": "portfolio", "plan_id": PLAN_ID_BY_KEY[p["key"]],
            "tier": p["name"], "status": "active",
        })
        got = await _portfolio_sections(db, sid)
        assert got == PREMIUM_SECTIONS, (p["name"], got)


async def test_community_tier_field_is_write_only_never_gates_anything():
    print("[6] community_gating.studio_tier ignores an explicit community_tier='pro' on the plan doc")
    import community_gating
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    # Simulate an admin setting community_tier via pricing_hub_service.update_plan
    # (the only writer) on the Advanced plan — portfolio_tier stays "premium".
    await db.subscription_plans.update_one(
        {"id": "plan_portfolio_advanced"}, {"$set": {"community_tier": "pro"}})
    sid = "studio_community_probe"
    await db.admins.insert_one({"id": sid})
    await db.subscriptions.insert_one({
        "studio_id": sid, "product": "portfolio", "plan_id": "plan_portfolio_advanced",
        "tier": "Advanced", "status": "active",
    })
    tier = await community_gating.studio_tier(db, sid)
    assert tier == "premium", (
        f"community_tier='pro' must be inert (no reader) — studio_tier resolved to {tier!r}")
    # And "pro" can never even be returned by studio_tier for a real plan (it
    # only derives from portfolio_service._portfolio_tier, which is
    # 'normal'|'basic'|'premium' by construction).
    assert tier != "pro"


async def test_directory_ranks_all_four_upper_tiers_as_premium():
    print("[7] photographer_directory.query_directory: Pro/Advanced/Premium/Custom all rank 'premium'")
    from photographer_directory import query_directory
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    for p in pricing_catalog.PORTFOLIO_PLANS:
        sid = f"studio_dir_{p['key']}"
        await db.admins.insert_one({"id": sid, "name": p["name"], "directory_listed": True})
        await db.subscriptions.insert_one({
            "studio_id": sid, "product": "portfolio", "plan_id": PLAN_ID_BY_KEY[p["key"]],
            "tier": p["name"], "status": "active",
        })
    result = await query_directory(db)
    tier_by_name = {row["name"]: row["tier"] for row in result["photographers"]}
    assert tier_by_name["Basic"] == "basic"
    for name in ("Pro", "Advanced", "Premium", "Custom"):
        assert tier_by_name[name] == "premium", f"{name} directory tier: {tier_by_name[name]!r}"


def test_subscription_service_feature_lists_match_truthful_ladder():
    print("[8] subscription_service PLAN_CATALOG: Pro/Advanced/Premium/Custom share ONE feature list")
    by_tier = {p["tier"]: p for p in subs.PLAN_CATALOG if p["product"] == "portfolio"}
    assert by_tier["Basic"]["features"] == subs.PORTFOLIO_BASIC_FEATURES
    for tier in ("Pro", "Advanced", "Premium", "Custom"):
        assert by_tier[tier]["features"] == subs.PORTFOLIO_PREMIUM_FEATURES, tier
    # Storage is what actually differs (already proven against the real
    # consumer above) — the shared list is the truthful choice, not a gap.
    storages = {tier: by_tier[tier]["storage_mb"] for tier in ("Pro", "Advanced", "Premium", "Custom")}
    assert len(set(storages.values())) == 3, "Pro/Advanced/Premium distinct, Custom == Premium"


# --------------------------------------------------------------------------- #
# TASK 2 — founding made explicit (no fake discount, explicit signal, server-only mode)
# --------------------------------------------------------------------------- #
async def test_founding_configured_false_and_no_strikethrough_for_inert_2026_plans():
    print("[9] founding_pricing.portfolio_cards: founding_configured=False, no fake strike, for the 5 new plans")
    db = FakeDB()
    await mig.apply_pricing_2026(db)   # seeds durations_founding == durations (inert, docs §9 item 3)
    plans = await db.subscription_plans.find({"product": "portfolio"}).to_list(100)
    plans = [p for p in plans if p.get("is_active", True)]
    assert len(plans) == 5
    for mode in ("founding", "regular"):
        cards = fp.portfolio_cards(plans, mode)
        assert len(cards) == 5
        for c in cards:
            assert c["founding_configured"] is False, (mode, c["tier"])
            for cyc, cell in c["cycles"].items():
                assert cell["strikethrough"] is None, (mode, c["tier"], cyc)
                assert cell["effective_price"] == cell["regular_price"], (mode, c["tier"], cyc)
                assert cell["is_founding"] is False, (mode, c["tier"], cyc)


async def test_founding_configured_true_only_for_the_plan_with_a_real_discount():
    print("[10] founding_configured flips True (mode-independent) once a genuine founding rate is set")
    db = FakeDB()
    await mig.apply_pricing_2026(db)
    pro = await db.subscription_plans.find_one({"id": "plan_portfolio_pro"}, {"_id": 0})
    real_founding = {**pro["durations"], "1": pro["durations"]["1"] - 100}  # genuinely lower
    await db.subscription_plans.update_one(
        {"id": "plan_portfolio_pro"}, {"$set": {"durations_founding": real_founding}})
    plans = await db.subscription_plans.find({"product": "portfolio"}).to_list(100)
    plans = [p for p in plans if p.get("is_active", True)]

    cards_founding = {c["tier"]: c for c in fp.portfolio_cards(plans, "founding")}
    cards_regular = {c["tier"]: c for c in fp.portfolio_cards(plans, "regular")}

    assert cards_founding["Pro"]["founding_configured"] is True
    assert cards_regular["Pro"]["founding_configured"] is True, "signal is mode-independent"
    assert cards_founding["Pro"]["cycles"]["1"]["strikethrough"] is not None, "founding mode shows the real cut"
    assert cards_regular["Pro"]["cycles"]["1"]["strikethrough"] is None, "regular mode never fakes one"

    for tier in ("Basic", "Advanced", "Premium", "Custom"):
        assert cards_founding[tier]["founding_configured"] is False, tier


def test_founding_mode_is_not_reachable_from_client_input():
    print("[11] the public portfolio-pricing endpoint takes NO parameters — mode can only come from founding_status(db)")
    import pricing_public
    router = pricing_public.build_public_pricing_router(FakeDB())
    ep = _endpoint(router, "/api/public/pricing/portfolio", "GET")
    sig = inspect.signature(ep)
    assert len(sig.parameters) == 0, f"endpoint accepts client params: {list(sig.parameters)}"
    status_ep = _endpoint(router, "/api/public/pricing/founding-status", "GET")
    assert len(inspect.signature(status_ep).parameters) == 0


# --------------------------------------------------------------------------- #
# TASK 3 — legacy invitation-subscription retirement (docs §9 item 4)
# --------------------------------------------------------------------------- #
async def test_v2_migration_deactivates_invitation_plans_and_leaves_v1_untouched():
    print("[12] apply_pricing_2026_v2: deactivates invitation plans once, own marker, v1 marker never written by it")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    inv_before = await db.subscription_plans.find({"product": "invitation"}).to_list(50)
    assert len(inv_before) == 4
    assert all(p.get("is_active", True) for p in inv_before)

    res = await mig.apply_pricing_2026_v2(db)
    assert sorted(res["invitation_plans_deactivated"]) == sorted(p["id"] for p in inv_before)

    inv_after = await db.subscription_plans.find({"product": "invitation"}).to_list(50)
    assert all(p["is_active"] is False for p in inv_after)

    v2_marker = await db.app_settings.find_one({"key": mig.PRICING_2026_V2_MARKER})
    assert v2_marker is not None and v2_marker["value"] is True
    v1_marker = await db.app_settings.find_one({"key": mig.PRICING_2026_MARKER})
    assert v1_marker is None, "v2 must never write/touch the v1 marker"

    # idempotent: second call is a no-op
    res2 = await mig.apply_pricing_2026_v2(db)
    assert res2 == {"skipped": "already applied"}


async def test_v2_does_not_disturb_v1_state_when_both_have_run():
    print("[13] running v1 then v2: v1's marker/applied_at is untouched by v2")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    await mig.apply_pricing_2026(db)
    v1_before = await db.app_settings.find_one({"key": mig.PRICING_2026_MARKER}, {"_id": 0})
    await mig.apply_pricing_2026_v2(db)
    v1_after = await db.app_settings.find_one({"key": mig.PRICING_2026_MARKER}, {"_id": 0})
    assert v1_before == v1_after


async def test_run_migration_wires_v2_step():
    print("[14] run_migration includes pricing_2026_v2 in its results")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    results = await mig.run_migration(db)
    assert "pricing_2026_v2" in results
    assert len(results["pricing_2026_v2"]["invitation_plans_deactivated"]) == 4
    assert results["pricing_2026"]["portfolio_plans_upserted"]  # v1 still ran


async def test_list_plans_excludes_retired_invitation_tiers_for_new_buyers():
    print("[15] GET /api/subscriptions/plans?product=invitation is empty after retirement")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    await mig.apply_pricing_2026_v2(db)
    plans_ep = _endpoint(_sub_router(db), "/api/subscriptions/plans", "GET")
    listed = await plans_ep(product="invitation")
    assert listed["plans"] == []


async def test_quote_blocks_new_studio_but_renews_existing_invitation_subscriber():
    print("[16] a new/anonymous buyer 404s a retired invitation tier; an existing holder renews at contractual terms")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    await mig.apply_pricing_2026_v2(db)
    router = _sub_router(db)
    quote_ep = _endpoint(router, "/api/subscriptions/quote", "POST")
    create_ep = _endpoint(router, "/api/subscriptions/create", "POST")

    # (a) anonymous quote (no studio context) — never under-quote a retired tier.
    with pytest.raises(HTTPException) as exc:
        await quote_ep(subs.QuoteRequest(product="invitation", tier="Starter", cycle="monthly"))
    assert exc.value.status_code == 404

    # (b) a studio with NO prior invitation history — also blocked.
    await db.admins.insert_one({"id": "studio_new", "is_test": True})
    with pytest.raises(HTTPException) as exc2:
        await create_ep(subs.CreateSubscriptionRequest(product="invitation", tier="Starter", cycle="monthly"),
                        admin={"admin_id": "studio_new"})
    assert exc2.value.status_code == 404

    # (c) a studio that already held this exact (product, tier) renews fine —
    # mirrors the storage grandfathering in studio_storage.py.
    await db.admins.insert_one({"id": "studio_old", "is_test": True})
    await db.subscriptions.insert_one({
        "id": "sub_prior_inv", "studio_id": "studio_old", "product": "invitation",
        "tier": "Starter", "cycle": "monthly", "status": "active",
        "current_period_start": subs._now_iso(), "current_period_end": subs._now_iso(),
        "created_at": subs._now_iso(),
    })
    result = await create_ep(subs.CreateSubscriptionRequest(product="invitation", tier="Starter", cycle="monthly"),
                             admin={"admin_id": "studio_old"})
    assert result["status"] == "active"
    new_row = await db.subscriptions.find_one(
        {"studio_id": "studio_old", "tier": "Starter", "id": {"$ne": "sub_prior_inv"}}, {"_id": 0})
    assert new_row is not None and new_row["status"] == "active"


async def test_a_lone_pending_row_does_not_unlock_a_retired_tier_forever():
    print("[17] a never-paid 'pending' invitation subscription does not count as 'held' for renewal")
    db = FakeDB()
    await subs.seed_subscription_plans(db)
    await mig.apply_pricing_2026_v2(db)
    router = _sub_router(db)
    # A subscription row exists, but it never got past "pending" (checkout
    # abandoned / payment never verified) — must NOT count as "held".
    await db.subscriptions.insert_one({
        "id": "sub_abandoned", "studio_id": "studio_abandoned", "product": "invitation",
        "tier": "Starter", "cycle": "monthly", "status": "pending",
        "created_at": subs._now_iso(),
    })
    await db.admins.insert_one({"id": "studio_abandoned", "is_test": True})
    create_ep = _endpoint(router, "/api/subscriptions/create", "POST")
    with pytest.raises(HTTPException) as exc:
        await create_ep(subs.CreateSubscriptionRequest(product="invitation", tier="Starter", cycle="monthly"),
                        admin={"admin_id": "studio_abandoned"})
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------- #
# standalone runner — mirrors tests/test_subscription_pricing_2026.py's shape
# --------------------------------------------------------------------------- #
async def main():
    print("MAJA — pricing completion wave: plan differentiation / founding / invitation retirement")
    test_catalog_portfolio_tier_is_only_basic_or_premium()
    test_plan_tier_of_resolves_all_5_catalog_plans_correctly()
    test_portfolio_tier_pro_would_silently_downgrade_advanced_and_custom()
    await test_base_storage_cap_bytes_differentiates_each_of_the_5_plans()
    await test_portfolio_sections_are_identical_across_pro_advanced_premium_custom()
    await test_community_tier_field_is_write_only_never_gates_anything()
    await test_directory_ranks_all_four_upper_tiers_as_premium()
    test_subscription_service_feature_lists_match_truthful_ladder()
    await test_founding_configured_false_and_no_strikethrough_for_inert_2026_plans()
    await test_founding_configured_true_only_for_the_plan_with_a_real_discount()
    test_founding_mode_is_not_reachable_from_client_input()
    await test_v2_migration_deactivates_invitation_plans_and_leaves_v1_untouched()
    await test_v2_does_not_disturb_v1_state_when_both_have_run()
    await test_run_migration_wires_v2_step()
    await test_list_plans_excludes_retired_invitation_tiers_for_new_buyers()
    await test_quote_blocks_new_studio_but_renews_existing_invitation_subscriber()
    await test_a_lone_pending_row_does_not_unlock_a_retired_tier_forever()
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
