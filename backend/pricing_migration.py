"""
pricing_migration.py — MAJA Invites unified pricing engine, Phase 1.
====================================================================

Idempotent, additive, FLAG-OFF migration. Running it changes NOTHING a customer
sees — it only seeds the new collections and back-fills fields so the resolver
(pricing_engine.py) and the admin hub have data to work with. Safe to run on
every boot: each step checks existence before writing, so re-runs are no-ops.

Creates / seeds:
  design_categories       — CRUD taxonomy (Traditional, Telugu Wedding, …)
  feature_packs           — Celebration / Signature / Royal (dynamic features)
  link_duration_tiers     — 3mo(free) / 6mo / 1yr / 2yr / Lifetime (priced)
  pricing_campaigns       — (collection ensured; created by admin later)
  community_settings      — editable Free/Basic/Premium/Pro capability matrix
  pricing_audit_log       — (collection ensured; written by admin writes)

Extends:
  pricing_design_prices   — +name/category/thumbnail/flags/discount/sale_price
  subscription_plans      — +durations{1,3,6,12}, +Pro Studio, +storage tiers(10TB)
  profiles                — grandfather stamp (existing links never expire)
  app_settings            — new_pricing_enabled = False (rollout flag OFF)

Run standalone on the server:
    python -m pricing_migration        # against DATABASE_URL / MAJA_PG_DSN
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("pricing_migration")

FLAG_KEY = "new_pricing_enabled"          # feature flag — default False
MIGRATION_MARKER = "pricing_engine_v1_migrated"

NEW_COLLECTIONS = (
    "design_categories", "feature_packs", "link_duration_tiers",
    "pricing_campaigns", "community_settings", "pricing_audit_log",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _int(v: Any, default: int = 0) -> int:
    """Coerce to a non-negative int rupee amount; junk → default (shared
    semantics with pricing_engine._int)."""
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def _uid(p: str) -> str:
    return f"{p}_{uuid.uuid4().hex[:12]}"


def _slug(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in (s or "").lower()).strip("_")


# --------------------------------------------------------------------------- #
# DEFAULT seed data — every value is an admin-editable default, not a hardcoded
# runtime price. The admin can change all of these from the Pricing Hub.
# --------------------------------------------------------------------------- #
DEFAULT_CATEGORIES = [
    "Traditional", "Telugu Wedding", "Hindu Wedding", "Muslim Wedding",
    "Christian Wedding", "Luxury", "Modern", "Minimal", "Floral", "Royal",
]

DEFAULT_FEATURE_PACKS = [
    {"key": "celebration", "name": "Celebration", "price": 0, "sort": 1,
     "features": ["rsvp", "timeline", "family_details", "countdown", "maps", "music"]},
    {"key": "signature", "name": "Signature", "price": 999, "sort": 2,
     "features": ["rsvp", "timeline", "family_details", "countdown", "maps", "music",
                  "qr_live_gallery", "guest_uploads", "enhanced_gallery"]},
    {"key": "royal", "name": "Royal", "price": 1999, "sort": 3,
     "features": ["rsvp", "timeline", "family_details", "countdown", "maps", "music",
                  "qr_live_gallery", "guest_uploads", "enhanced_gallery",
                  "ai_face_match", "selfie_search", "premium_support", "premium_delivery"]},
]

DEFAULT_LINK_DURATIONS = [
    {"key": "d90",   "name": "3 Months",  "duration_days": 90,  "lifetime": False, "price": 0,    "sort": 1,
     "description": "Included free with every invitation."},
    {"key": "d180",  "name": "6 Months",  "duration_days": 180, "lifetime": False, "price": 299,  "sort": 2, "description": ""},
    {"key": "d365",  "name": "1 Year",    "duration_days": 365, "lifetime": False, "price": 599,  "sort": 3, "description": ""},
    {"key": "d730",  "name": "2 Years",   "duration_days": 730, "lifetime": False, "price": 999,  "sort": 4, "description": ""},
    {"key": "life",  "name": "Lifetime",  "duration_days": None, "lifetime": True,  "price": 2999, "sort": 5,
     "description": "Never expires."},
]

# Community capability matrix seed (mirrors the retiring community_gating.CAP_MIN_TIER,
# plus a new Pro tier). Admin edits this in Community Settings.
_C = ["view_feed", "like", "comment", "follow", "post", "marketplace", "reels",
      "stories", "analytics", "ai_review", "ai_assistant", "featured_placement", "leads"]
def _caps(enabled: List[str]) -> Dict[str, bool]:
    return {c: (c in enabled) for c in _C}

DEFAULT_COMMUNITY = {
    "free":    _caps(["view_feed", "like", "comment", "follow"]),
    "basic":   _caps(["view_feed", "like", "comment", "follow", "post", "marketplace", "analytics"]),
    "premium": _caps(["view_feed", "like", "comment", "follow", "post", "marketplace", "analytics",
                      "reels", "stories", "ai_review", "ai_assistant", "featured_placement"]),
    "pro":     _caps(_C),   # everything, incl. leads
}

# Pro Studio portfolio plan (durations + config, all admin-editable).
PRO_STUDIO_PLAN = {
    "product": "portfolio", "tier": "Pro Studio", "portfolio_tier": "pro",
    "name": "Pro Studio", "description": "For studios & agencies — white-label, team, and Elite community.",
    "active": True, "sort_order": 3, "storage_gb": 100,
    "durations": {"1": 1299, "3": 3699, "6": 6999, "12": 12999},
    "community_tier": "pro", "ai_features": True, "white_label": True,
    "custom_domain": True, "team_members": 5, "priority_support": True,
    "featured_placement": True, "advanced_analytics": True,
    "features": ["about", "services", "packages", "pricing", "albums", "gallery",
                 "videos", "testimonials", "contact", "booking_form", "seo",
                 "analytics", "themes", "3d_animations", "premium_designs",
                 "white_label", "custom_domain", "team_members", "priority_support"],
}

# Unified storage tiers (100 GB … 10 TB). Monthly seeded; other cycles left for
# the admin (resolver treats an unset cycle as 'unavailable', never ₹0).
DEFAULT_STORAGE_TIERS = [
    {"tier": "100 GB", "capacity_gb": 100,   "monthly": 199},
    {"tier": "250 GB", "capacity_gb": 250,   "monthly": 299},
    {"tier": "500 GB", "capacity_gb": 500,   "monthly": 350},
    {"tier": "1 TB",   "capacity_gb": 1024,  "monthly": 599},
    {"tier": "2 TB",   "capacity_gb": 2048,  "monthly": 999},
    {"tier": "5 TB",   "capacity_gb": 5120,  "monthly": 1999},
    {"tier": "10 TB",  "capacity_gb": 10240, "monthly": 3499},
]


# --------------------------------------------------------------------------- #
# helpers compatible with BOTH pg_adapter and the in-memory test FakeDB
# --------------------------------------------------------------------------- #
async def _ensure_tables(db) -> None:
    ensure = getattr(db, "ensure_table", None)
    if ensure:
        for name in NEW_COLLECTIONS:
            await ensure(name)


async def _exists(coll, flt: Dict[str, Any]) -> bool:
    return (await coll.find_one(flt)) is not None


async def _iter(coll, flt: Optional[Dict[str, Any]] = None):
    async for d in coll.find(flt or {}):
        d.pop("_id", None)
        yield d


# --------------------------------------------------------------------------- #
# individual steps (each idempotent, returns {created, skipped})
# --------------------------------------------------------------------------- #
async def seed_design_categories(db) -> Dict[str, int]:
    created = skipped = 0
    for i, name in enumerate(DEFAULT_CATEGORIES):
        slug = _slug(name)
        if await _exists(db.design_categories, {"slug": slug}):
            skipped += 1
            continue
        await db.design_categories.insert_one({
            "id": _uid("cat"), "name": name, "slug": slug,
            "active": True, "sort": i + 1, "created_at": _now(), "updated_at": _now()})
        created += 1
    return {"created": created, "skipped": skipped}


async def seed_feature_packs(db) -> Dict[str, int]:
    created = skipped = 0
    for pack in DEFAULT_FEATURE_PACKS:
        if await _exists(db.feature_packs, {"key": pack["key"]}):
            skipped += 1
            continue
        await db.feature_packs.insert_one({
            "id": _uid("fp"), "key": pack["key"], "name": pack["name"],
            "price": pack["price"], "active": True, "sort": pack["sort"],
            "features": list(pack["features"]), "created_at": _now(), "updated_at": _now()})
        created += 1
    return {"created": created, "skipped": skipped}


async def seed_link_durations(db) -> Dict[str, int]:
    created = skipped = 0
    for d in DEFAULT_LINK_DURATIONS:
        if await _exists(db.link_duration_tiers, {"key": d["key"]}):
            skipped += 1
            continue
        await db.link_duration_tiers.insert_one({
            "id": _uid("dur"), "key": d["key"], "name": d["name"],
            "duration_days": d["duration_days"], "lifetime": d["lifetime"],
            "price": d["price"], "description": d.get("description", ""),
            "active": True, "sort": d["sort"], "created_at": _now(), "updated_at": _now()})
        created += 1
    return {"created": created, "skipped": skipped}


async def seed_community_settings(db) -> Dict[str, int]:
    if await _exists(db.community_settings, {"id": "community_settings"}):
        return {"created": 0, "skipped": 1}
    await db.community_settings.insert_one({
        "id": "community_settings", "tiers": DEFAULT_COMMUNITY,
        "capabilities": list(_C), "updated_at": _now()})
    return {"created": 1, "skipped": 0}


async def backfill_design_prices(db, designs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, int]:
    """Ensure every design has a normal_user price row with the new metadata +
    a computed sale_price. Existing rows are enriched, never overwritten."""
    if designs is None:
        try:
            from design_catalog import DESIGN_CATALOG
            designs = [{"id": d.get("id") or d.get("design_id"),
                        "name": d.get("name") or d.get("id"),
                        "category": d.get("theme") or d.get("category"),
                        "thumbnail_url": d.get("preview_image_url") or d.get("thumbnail")}
                       for d in (DESIGN_CATALOG or [])]
        except Exception:
            designs = []
    created = enriched = 0
    for d in designs or []:
        did = d.get("id") or d.get("design_id")
        if not did:
            continue
        existing = await db.pricing_design_prices.find_one(
            {"audience": "normal_user", "design_id": did})
        base = _int((existing or {}).get("base_price"), default=_int(d.get("base_price"), 999))
        disc_price = (existing or {}).get("discount_price")
        sale = disc_price if disc_price is not None else base
        meta = {
            "name": (existing or {}).get("name") or d.get("name") or did,
            "category_id": (existing or {}).get("category_id") or _slug(str(d.get("category") or "")),
            "thumbnail_url": (existing or {}).get("thumbnail_url") or d.get("thumbnail_url"),
            "active": (existing or {}).get("active", True),
            "featured": (existing or {}).get("featured", False),
            "trending": (existing or {}).get("trending", False),
            "best_seller": (existing or {}).get("best_seller", False),
            "new_arrival": (existing or {}).get("new_arrival", False),
            "discount_pct": (existing or {}).get("discount_pct", 0),
            "discount_amount": (existing or {}).get("discount_amount", 0),
            "sale_price": (existing or {}).get("sale_price", sale),
            "base_price": base,
            "updated_at": _now(),
        }
        if existing:
            await db.pricing_design_prices.update_one(
                {"audience": "normal_user", "design_id": did}, {"$set": meta})
            enriched += 1
        else:
            await db.pricing_design_prices.insert_one({
                "id": _uid("dp"), "audience": "normal_user", "design_id": did,
                **meta, "created_at": _now()})
            created += 1
    return {"created": created, "enriched": enriched}


async def add_pro_studio_plan(db) -> Dict[str, int]:
    if await _exists(db.subscription_plans, {"product": "portfolio", "tier": "Pro Studio"}):
        return {"created": 0, "skipped": 1}
    await db.subscription_plans.insert_one({
        "id": _uid("plan"), **PRO_STUDIO_PLAN, "created_at": _now(), "updated_at": _now()})
    return {"created": 1, "skipped": 0}


async def backfill_plan_durations(db) -> Dict[str, int]:
    """Give every existing portfolio/backup plan a `durations` map seeded from
    its base_monthly so admins have absolute, editable per-cycle prices. Uses the
    same cycle discounts the app shipped with (data, not a runtime formula).

    This is a DISPLAY-only fallback for a plan that happens to lack `durations`
    (e.g. invitation/backup rows never touched by sync_plan_durations, which is
    portfolio-only) — invitation/backup checkout prices from `_cycle_price_meta`
    against subscription_service.CYCLES directly, never from this field. The
    table below is still kept in step with CYCLES' yearly 20% -> 15% change
    (docs/PRICING_REDESIGN_2026.md §2, applies to invitation/backup too) so a
    freshly-backfilled `durations` never shows a discount steeper than what
    checkout will actually charge.
    """
    cycles = {"1": (1, 0.0), "3": (3, 0.05), "6": (6, 0.10), "12": (12, 0.15)}
    filled = skipped = 0
    async for p in _iter(db.subscription_plans):
        if p.get("product") == "storage":
            continue                        # storage now sells only via studio_storage.py
                                             # (§4); every subscription_plans(product=storage)
                                             # row is deactivated by apply_pricing_2026 below.
        if p.get("durations"):
            skipped += 1
            continue
        base = _int(p.get("base_monthly"))
        if base <= 0:
            skipped += 1
            continue
        durations = {k: int(round(base * months * (1 - disc)))
                     for k, (months, disc) in cycles.items()}
        await db.subscription_plans.update_one(
            {"id": p["id"]}, {"$set": {"durations": durations, "updated_at": _now()}})
        filled += 1
    return {"filled": filled, "skipped": skipped}


async def unify_storage_plans(db) -> Dict[str, int]:
    """RETIRED — no longer called from run_migration (docs/PRICING_REDESIGN_2026.md
    §4: studio_storage.py is the one canonical storage-selling flow; every
    subscription_plans(product=storage) row is deactivated by apply_pricing_2026
    instead of grown). Left in place, unused, rather than deleted: it wrote dead
    data that nothing downstream ever read even before this — deleting it is a
    separate, unrelated cleanup.

    One storage-pricing source: ensure the 100 GB…10 TB tiers exist as
    subscription_plans(product=storage) with a durations map. Legacy
    studio_storage_plans rows are pulled in (not deleted)."""
    created = skipped = migrated = 0
    # migrate legacy rows first (best-effort)
    try:
        async for s in _iter(db.studio_storage_plans):
            cap = _int(s.get("capacity_gb") or s.get("storage_gb"))
            if cap and not await _exists(db.subscription_plans,
                                         {"product": "storage", "capacity_gb": cap}):
                await db.subscription_plans.insert_one({
                    "id": _uid("plan"), "product": "storage",
                    "tier": s.get("name") or f"{cap} GB", "name": s.get("name") or f"{cap} GB",
                    "capacity_gb": cap, "active": s.get("active", True),
                    "durations": {"1": _int(s.get("price") or s.get("monthly"))},
                    "migrated_from": "studio_storage_plans",
                    "created_at": _now(), "updated_at": _now()})
                migrated += 1
    except Exception as e:
        logger.warning("pricing_migration: legacy storage migrate skipped: %s", e)
    # ensure the canonical tiers
    for t in DEFAULT_STORAGE_TIERS:
        if await _exists(db.subscription_plans,
                         {"product": "storage", "capacity_gb": t["capacity_gb"]}):
            skipped += 1
            continue
        await db.subscription_plans.insert_one({
            "id": _uid("plan"), "product": "storage", "tier": t["tier"], "name": t["tier"],
            "capacity_gb": t["capacity_gb"], "active": True,
            "durations": {"1": t["monthly"]},   # 3/6/12 left for admin
            "created_at": _now(), "updated_at": _now()})
        created += 1
    return {"created": created, "skipped": skipped, "migrated": migrated}


async def grandfather_existing_links(db) -> Dict[str, int]:
    """Stamp every existing invitation so link-duration pricing NEVER applies to
    it — existing links keep their current behaviour forever. Idempotent via the
    marker field; new orders (created after cutover) are not stamped here."""
    stamped = skipped = 0
    async for p in _iter(db.profiles):
        if p.get("pricing_grandfathered"):
            skipped += 1
            continue
        await db.profiles.update_one(
            {"id": p["id"]},
            {"$set": {"pricing_grandfathered": True,
                      "link_duration_policy": "grandfathered_no_expiry",
                      "pricing_grandfathered_at": _now()}})
        stamped += 1
    return {"stamped": stamped, "skipped": skipped}


# --------------------------------------------------------------------------- #
# 2026 pricing redesign — Portfolio (5 plans) + cycle-discount / storage-plan
# cleanup. docs/PRICING_REDESIGN_2026.md is the plan; pricing_catalog.py is the
# ONE source of every number written here.
# --------------------------------------------------------------------------- #
PRICING_2026_MARKER = "pricing_2026_v1_applied"


async def apply_pricing_2026(db) -> Dict[str, Any]:
    """One-time, marker-gated migration for the 2026 pricing redesign.

    Unlike the rest of this module, this step must NOT re-run on every boot:
    once applied, a super-admin can freely edit these plan rows from the
    Pricing Hub (subscription_service.upsert_plan / pricing_hub_service.
    update_plan — both now route through subscription_service.sync_plan_
    durations), and a bare re-run on the next restart would silently stomp
    that edit back to the catalog defaults. The marker doc makes this run
    exactly once; every write below is still individually idempotent (a
    second, forced call converges rather than duplicating) in case the marker
    write itself is ever lost mid-deploy.

    Steps:
      (a) upsert the 5 portfolio plans (plan_portfolio_{basic,pro,advanced,
          premium,custom}) from pricing_catalog.PORTFOLIO_PLANS — base_monthly,
          storage_mb/storage_label/storage_gb, setup_fee_inr, portfolio_tier,
          features, and durations{1,3,6,12}/durations_founding computed via
          pricing_catalog.compute_cycle_breakdown (renewal price — the Custom
          setup fee is charged once at purchase by subscription_service._quote,
          never folded into the stored per-cycle price);
      (b) deactivate every OTHER product=portfolio row (legacy two-tier Basic/
          Premium already got new numbers via (a) reusing their ids; anything
          else — e.g. the "Pro Studio" row from add_pro_studio_plan — is
          hidden). plan_portfolio_test (seed_test_accounts.py's comped plan)
          is left alone; it is already is_active=False;
      (c) deactivate every product=storage row in subscription_plans — storage
          purchase is studio_storage.py's flow only (§4);
      (d) fix a stale db.pricing_settings{id:"billing_cycles"} yearly discount
          of 0.20 left over from before this redesign (§2) — a stale override
          would otherwise keep quoting the OLD 20% forever.
    """
    if await db.app_settings.find_one({"key": PRICING_2026_MARKER}):
        return {"skipped": "already applied"}

    import pricing_catalog
    from subscription_service import (
        PORTFOLIO_BASIC_FEATURES, PORTFOLIO_PREMIUM_FEATURES,
        DURATION_KEY_TO_CATALOG_CYCLE,
    )

    keep_ids = {f"plan_portfolio_{p['key']}" for p in pricing_catalog.PORTFOLIO_PLANS}

    # (a) upsert the 5 canonical portfolio plans.
    upserted_ids: List[str] = []
    for p in pricing_catalog.PORTFOLIO_PLANS:
        plan_id = f"plan_portfolio_{p['key']}"
        # Renewal-price durations: setup_fee_inr is intentionally NOT passed —
        # see the docstring above.
        durations = {
            dur_key: pricing_catalog.compute_cycle_breakdown(
                p["base_monthly_inr"], cyc_key)["final_paise"] // 100
            for dur_key, cyc_key in DURATION_KEY_TO_CATALOG_CYCLE.items()
        }
        fields = {
            "id": plan_id, "product": "portfolio", "tier": p["name"], "name": p["name"],
            "portfolio_tier": p["portfolio_tier"], "base_monthly": p["base_monthly_inr"],
            "setup_fee_inr": p["setup_fee_inr"],
            "storage_mb": p["storage_mb"], "storage_label": p["storage_label"],
            "storage_gb": round(p["storage_mb"] / 1024, 4),
            "popular": bool(p.get("popular", False)), "sort_order": p["sort_order"],
            "features": list(PORTFOLIO_BASIC_FEATURES if p["key"] == "basic"
                              else PORTFOLIO_PREMIUM_FEATURES),
            "durations": durations, "durations_founding": dict(durations),
            "is_active": True, "updated_at": _now(),
        }
        if await db.subscription_plans.find_one({"id": plan_id}):
            await db.subscription_plans.update_one({"id": plan_id}, {"$set": fields})
        else:
            fields["created_at"] = _now()
            await db.subscription_plans.insert_one(fields)
        upserted_ids.append(plan_id)

    # (b) deactivate every other product=portfolio row.
    deactivated_portfolio = 0
    async for row in _iter(db.subscription_plans, {"product": "portfolio"}):
        if row["id"] in keep_ids or row["id"] == "plan_portfolio_test":
            continue
        if row.get("is_active", True):
            await db.subscription_plans.update_one(
                {"id": row["id"]}, {"$set": {"is_active": False, "updated_at": _now()}})
            deactivated_portfolio += 1

    # (c) deactivate every product=storage row (studio_storage.py is canonical).
    deactivated_storage = 0
    async for row in _iter(db.subscription_plans, {"product": "storage"}):
        if row.get("is_active", True):
            await db.subscription_plans.update_one(
                {"id": row["id"]}, {"$set": {"is_active": False, "updated_at": _now()}})
            deactivated_storage += 1

    # (d) fix a stale 20% yearly override.
    yearly_fixed = False
    cycles_doc = await db.pricing_settings.find_one({"id": "billing_cycles"})
    if cycles_doc:
        cycles = cycles_doc.get("cycles") or []
        for c in cycles:
            if c.get("key") == "yearly" and abs(float(c.get("discount", 0) or 0) - 0.20) < 1e-9:
                c["discount"] = 0.15
                yearly_fixed = True
        if yearly_fixed:
            await db.pricing_settings.update_one(
                {"id": "billing_cycles"}, {"$set": {"cycles": cycles, "updated_at": _now()}})

    await db.app_settings.update_one(
        {"key": PRICING_2026_MARKER},
        {"$set": {"key": PRICING_2026_MARKER, "value": True, "applied_at": _now()}},
        upsert=True)

    result = {
        "portfolio_plans_upserted": upserted_ids,
        "legacy_portfolio_deactivated": deactivated_portfolio,
        "storage_plans_deactivated": deactivated_storage,
        "stale_yearly_discount_fixed": yearly_fixed,
    }
    logger.info("pricing_migration.apply_pricing_2026: %s", result)
    return result


# --------------------------------------------------------------------------- #
# 2026 pricing redesign v2 — retire the legacy `invitation` subscription
# product (docs/PRICING_REDESIGN_2026.md §9 item 4). Starter/Professional/
# Studio/Enterprise base_monthly rows predate the invitation_suite one-time
# order model (§6) and are now a second, conflicting invitation price surface.
# --------------------------------------------------------------------------- #
PRICING_2026_V2_MARKER = "pricing_2026_v2_applied"


async def apply_pricing_2026_v2(db) -> Dict[str, Any]:
    """One-time, marker-gated. Deliberately its OWN marker — separate from
    PRICING_2026_MARKER (v1), which must never be re-touched by this step;
    this is additive, not a rerun of v1.

    Only DEACTIVATES (is_active=False), never deletes: subscription_service.
    _quote still quotes/renews an inactive plan for a studio that already
    holds a subscription at that exact (product, tier) — renewal at
    contractual terms, mirroring the storage grandfathering in
    studio_storage.py. list_plans() only ever served is_active rows, so
    brand-new buyers stop seeing these tiers the moment this runs; existing
    subscribers are unaffected.

    Ordering note (matches apply_pricing_2026's own caveat): this only
    deactivates rows that exist AT THE TIME IT RUNS. server.py's startup
    sequence seeds product=invitation plans (subscription_service.
    seed_subscription_plans) before calling run_migration, so in the real
    boot order this is never a problem — but a caller that invokes this
    before ever seeding the invitation plans will mark the migration done
    with nothing to deactivate, and (being marker-gated) will not retry.
    """
    if await db.app_settings.find_one({"key": PRICING_2026_V2_MARKER}):
        return {"skipped": "already applied"}

    deactivated: List[str] = []
    async for row in _iter(db.subscription_plans, {"product": "invitation"}):
        if row.get("is_active", True):
            await db.subscription_plans.update_one(
                {"id": row["id"]}, {"$set": {"is_active": False, "updated_at": _now()}})
            deactivated.append(row["id"])

    await db.app_settings.update_one(
        {"key": PRICING_2026_V2_MARKER},
        {"$set": {"key": PRICING_2026_V2_MARKER, "value": True, "applied_at": _now()}},
        upsert=True)

    result = {"invitation_plans_deactivated": deactivated}
    logger.info("pricing_migration.apply_pricing_2026_v2: %s", result)
    return result


async def ensure_flag_off(db) -> Dict[str, Any]:
    """Rollout flag OFF unless already set. Never flips an admin's choice."""
    existing = await db.app_settings.find_one({"key": FLAG_KEY})
    if existing is None:
        await db.app_settings.update_one(
            {"key": FLAG_KEY},
            {"$set": {"key": FLAG_KEY, "value": False, "updated_at": _now()}},
            upsert=True)
        return {"flag": FLAG_KEY, "value": False, "action": "seeded_off"}
    return {"flag": FLAG_KEY, "value": bool(existing.get("value")), "action": "left_as_is"}


# --------------------------------------------------------------------------- #
# orchestrator
# --------------------------------------------------------------------------- #
async def run_migration(db, *, designs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Run all steps. Idempotent — safe on every boot. Returns a per-step summary."""
    await _ensure_tables(db)
    results: Dict[str, Any] = {
        "flag": await ensure_flag_off(db),
        "design_categories": await seed_design_categories(db),
        "feature_packs": await seed_feature_packs(db),
        "link_durations": await seed_link_durations(db),
        "community_settings": await seed_community_settings(db),
        "design_prices": await backfill_design_prices(db, designs),
        "pro_studio": await add_pro_studio_plan(db),
        "plan_durations": await backfill_plan_durations(db),
        "grandfather": await grandfather_existing_links(db),
        # Runs LAST and on its own marker (not part of the idempotency story
        # above): it must have the final say over the 5 portfolio plan rows,
        # overwriting anything add_pro_studio_plan/backfill_plan_durations
        # wrote moments earlier on a fresh DB's first-ever migration run.
        "pricing_2026": await apply_pricing_2026(db),
        # Separate marker, separate concern (§9 item 4) — never touches v1's
        # portfolio/storage work above, only retires the legacy invitation
        # subscription product.
        "pricing_2026_v2": await apply_pricing_2026_v2(db),
    }
    await db.app_settings.update_one(
        {"key": MIGRATION_MARKER},
        {"$set": {"key": MIGRATION_MARKER, "value": True,
                  "last_run_at": _now(), "summary": results}},
        upsert=True)
    logger.info("pricing_migration complete: %s", results)
    return results


async def _main() -> int:
    import os
    import asyncpg
    from pg_adapter import Database
    dsn = os.environ.get("DATABASE_URL") or os.environ.get(
        "MAJA_PG_DSN", "postgresql://postgres@localhost:5432/maja")
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=4)
    db = Database(pool)
    res = await run_migration(db)
    print(res)
    return 0


if __name__ == "__main__":
    import asyncio
    raise SystemExit(asyncio.run(_main()))
