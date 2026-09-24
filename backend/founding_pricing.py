"""
founding_pricing.py — Founding-100 pricing: settings, live status, and the honest
portfolio catalogue (regular + founding prices per billing cycle).

NOTHING here changes a live price by itself:
  * seed_founding_settings()  writes the flag doc with founding DISABLED.
  * apply_founding_portfolio_catalogue()  sets the plan numbers, and is meant to be
    invoked EXPLICITLY by the owner when they adopt the new pricing — it is NOT part
    of the auto-migration, so a deploy never silently repricing anything.
  * founding_status()  is read-only.

The pure math lives in pricing_engine (founding_state / price_display / pct_off).
Honest anchoring only: `durations` is the REAL regular price (the strike-through);
`durations_founding` is the genuine launch rate for the first N paying studios.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from pricing_engine import founding_state, price_display, BILLING_CYCLES, FOUNDING_DEFAULTS
import pricing_catalog
from subscription_service import DURATION_KEY_TO_CATALOG_CYCLE

SETTINGS_ID = "pricing_founding_settings"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# The Free tier — no subscription, ₹0. Rendered as the first card.
FREE_PORTFOLIO = {
    "tier": "Free", "portfolio_tier": "free", "price": 0, "storage_gb": 0,
    "cta": "Get Started Free",
    "features": [
        "Create Profile", "Basic Portfolio", "Photographer Listing",
        "Pixora Community Access", "Follow Photographers", "Basic Analytics",
        "Limited Uploads",
    ],
}

# The founding apply-catalogue is DERIVED from pricing_catalog.PORTFOLIO_PLANS —
# never a second hardcoded price list. The previous static 3-tier list here
# (Basic/Premium/"Pro Studio", pre-redesign prices) was a live landmine: the
# admin's "apply founding catalogue" button matched rows by TIER NAME, so on a
# post-apply_pricing_2026 DB it would have rolled Basic/Premium back to stale
# prices and inserted id "plan_portfolio_pro" over the real Pro plan's id.
# founding == regular until the owner approves founding discounts for the
# 5-plan catalog (docs/PRICING_REDESIGN_2026.md §9 item 3) — deriving both maps
# from the same finals makes the apply button safe to click at any time.
def founding_portfolio_catalogue() -> list:
    """5 specs keyed by canonical plan id, prices = current catalog finals
    (renewal prices — the Custom setup fee stays per-purchase in _quote)."""
    specs = []
    for p in pricing_catalog.PORTFOLIO_PLANS:
        durations = {
            dur_key: pricing_catalog.compute_cycle_breakdown(
                p["base_monthly_inr"], cyc_key)["final_paise"] // 100
            for dur_key, cyc_key in
            {"1": "monthly", "3": "quarterly", "6": "half_yearly", "12": "yearly"}.items()
        }
        specs.append({
            "id": f"plan_portfolio_{p['key']}",
            "tier": p["name"], "portfolio_tier": p["portfolio_tier"],
            "base_monthly": p["base_monthly_inr"], "setup_fee_inr": p["setup_fee_inr"],
            "storage_mb": p["storage_mb"], "storage_label": p["storage_label"],
            "storage_gb": round(p["storage_mb"] / 1024, 4),
            "popular": bool(p.get("popular", False)), "sort_order": p["sort_order"],
            "durations": durations,
            "durations_founding": dict(durations),  # inert until owner sets real ones
        })
    return specs

# Cycle labels for the toggle (months -> human label + short savings copy source).
CYCLE_LABELS = {"1": "Monthly", "3": "Quarterly", "6": "Half-Yearly", "12": "Yearly"}

# Storage add-ons: the existing studio_storage catalogue is keyed by duration_days.
STORAGE_DURATION_LABELS = {30: "Monthly", 90: "Quarterly", 180: "Half-Yearly", 365: "Yearly"}
STORAGE_TIER_BADGES = {100: "MOST POPULAR", 1024: "PROFESSIONAL STUDIOS"}


def _i(v, default=0):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def _gb_label(gb: int) -> str:
    return "1 TB" if gb == 1024 else (f"{gb // 1024} TB" if gb >= 1024 and gb % 1024 == 0 else f"{gb} GB")


def storage_cards(plans: list, mode: str) -> list:
    """Pure: group active studio_storage_plans (which already carry price_inr +
    price_founding_inr) by capacity into founding-aware cards, one price per cycle."""
    by_gb: dict = {}
    for p in plans:
        if p.get("is_active") is False:
            continue
        gb = _i(p.get("gb_limit"))
        if gb <= 0:
            continue
        by_gb.setdefault(gb, []).append(p)
    out = []
    for gb in sorted(by_gb):
        cycles = {}
        for p in by_gb[gb]:
            days = _i(p.get("duration_days"))
            label = STORAGE_DURATION_LABELS.get(days)
            if not label:
                continue
            cycles[str(days)] = {"label": label, "duration_days": days,
                                 **price_display(p.get("price_inr"), p.get("price_founding_inr"), mode)}
        if not cycles:
            continue
        out.append({
            "gb_limit": gb, "label": _gb_label(gb),
            "popular": gb == 100, "badge": STORAGE_TIER_BADGES.get(gb),
            "cycles": cycles,
        })
    return out


def portfolio_cards(plans: list, mode: str) -> list:
    """Pure: turn subscription_plans rows into card-ready structs with every cycle
    priced for `mode` ('founding' | 'regular'). The Free card is prepended by the
    caller. Sorted Basic -> Premium -> Pro Studio (legacy order key; the 2026
    catalog's `sort_order` on each row already reflects Basic..Custom — this
    key just needs to not crash on plans it doesn't recognise, so unknown
    tiers fall to the end via the `99` default rather than being reordered).

    2026 redesign additions (docs/PRICING_REDESIGN_2026.md §3, §6): each cycle
    cell also gets list_inr/save_inr/pct_off/extra_saving/effective_monthly_inr
    from pricing_catalog (the one resolver) alongside `final_inr`, which is
    just the plan's own `durations` value under a second, clearer name — the
    existing regular_price/founding_price/effective_price/strikethrough keys
    from price_display() are kept as-is (other callers already read them).
    """
    order = {"basic": 1, "premium": 2, "pro": 3}
    rows = sorted(
        [p for p in plans if p.get("product") == "portfolio" and (p.get("tier") or "").lower() != "free"],
        key=lambda p: order.get((p.get("portfolio_tier") or "").lower(), 99))
    out = []
    for p in rows:
        reg = p.get("durations") or {}
        fnd = p.get("durations_founding") or {}
        base_monthly = _i(p.get("base_monthly"), 0)
        setup_fee_inr = _i(p.get("setup_fee_inr"), 0)
        # Is a REAL founding rate set for this plan, or is durations_founding
        # just a copy of durations (the state apply_pricing_2026 seeds for
        # the 5 new plans until the owner approves founding numbers, docs §9
        # item 3 — "founding = regular for the new rows")? price_display()
        # already refuses a fake strike-through when they're equal (fnd < reg
        # is False) — this is the explicit signal, so the ADMIN UI can show
        # "founding price not set" instead of silently reading "no discount"
        # as "nothing to configure here".
        founding_configured = any(
            fnd.get(c) is not None and _i(fnd[c]) < _i(reg.get(c), 0)
            for c in BILLING_CYCLES if reg.get(c) is not None
        )
        cycles = {}
        for c in BILLING_CYCLES:
            if reg.get(c) is None:
                continue
            cell = {"label": CYCLE_LABELS.get(c, c), **price_display(reg[c], fnd.get(c), mode)}
            catalog_cycle = DURATION_KEY_TO_CATALOG_CYCLE.get(c)
            if base_monthly and catalog_cycle:
                bd = pricing_catalog.compute_cycle_breakdown(base_monthly, catalog_cycle)
                cell.update({
                    "final_inr": reg[c],
                    "list_inr": bd["list_paise"] // 100,
                    "save_inr": bd["save_paise"] // 100,
                    "pct_off": bd["discount_pct"],
                    "extra_saving": bd["extra_saving"],
                    "effective_monthly_inr": bd["effective_monthly_paise"] // 100,
                })
            cycles[c] = cell
        card = {
            "plan_id": p.get("id"), "tier": p.get("tier"),
            "name": p.get("name") or p.get("tier"),
            "portfolio_tier": p.get("portfolio_tier"),
            "storage_gb": p.get("storage_gb"),
            "storage_label": p.get("storage_label"),
            "setup_fee_inr": setup_fee_inr,
            "popular": bool(p.get("popular")), "badge": p.get("badge"),
            "cta": p.get("cta") or f"Choose {p.get('tier')}",
            "features": list(p.get("features") or []),
            "founding_configured": founding_configured,
            "cycles": cycles,
        }
        if setup_fee_inr and base_monthly:
            # Advertised first-purchase price (setup fee included, §3) — the
            # durations/durations_founding cells above intentionally exclude
            # it (they are the renewal price).
            card["first_month_inr"] = pricing_catalog.compute_cycle_breakdown(
                base_monthly, "monthly", setup_fee_inr=setup_fee_inr)["final_paise"] // 100
        out.append(card)
    return out


async def seed_founding_settings(db) -> Dict[str, int]:
    """Create the founding settings doc (DISABLED by default). Idempotent."""
    if await db.pricing_settings.find_one({"id": SETTINGS_ID}):
        return {"created": 0, "skipped": 1}
    await db.pricing_settings.insert_one({
        "id": SETTINGS_ID, **FOUNDING_DEFAULTS, "updated_at": _now()})
    return {"created": 1, "skipped": 0}


async def get_founding_settings(db) -> Dict[str, Any]:
    """The founding settings, with defaults filled in for any missing key."""
    doc = await db.pricing_settings.find_one({"id": SETTINGS_ID})
    if doc:
        doc.pop("_id", None)
    return {**FOUNDING_DEFAULTS, **(doc or {})}


async def count_founding_studios(db) -> int:
    """Founding seats are per PAYING studio: distinct studios holding an active
    portfolio subscription (the 'first 100 studios' intent). Status is filtered in
    Python (booleans/enums), per the pg_adapter convention."""
    seen = set()
    rows = await db.subscriptions.find({"product": "portfolio"}).to_list(100000)
    for s in rows:
        if (s.get("status") or "").lower() in ("active", "paid", "trialing"):
            sid = s.get("studio_id")
            if sid:
                seen.add(sid)
    return len(seen)


async def founding_status(db) -> Dict[str, Any]:
    """Read-only: current founding-pricing state for the public UI + admin."""
    settings = await get_founding_settings(db)
    count = await count_founding_studios(db)
    return {**founding_state(settings, count), "settings_id": SETTINGS_ID}


async def update_founding_settings(db, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Admin write: toggle founding on/off, set the seat limit, set auto-switch.
    Validates and only touches known keys. Returns the merged settings."""
    await seed_founding_settings(db)   # ensure the doc exists
    updates: Dict[str, Any] = {}
    if "founding_users_enabled" in patch:
        updates["founding_users_enabled"] = bool(patch["founding_users_enabled"])
    if "auto_switch_to_regular_pricing" in patch:
        updates["auto_switch_to_regular_pricing"] = bool(patch["auto_switch_to_regular_pricing"])
    if "founding_user_limit" in patch:
        lim = _i(patch["founding_user_limit"], -1)
        if lim < 0 or lim > 1_000_000:
            raise ValueError("founding_user_limit must be between 0 and 1,000,000.")
        updates["founding_user_limit"] = lim
    if updates:
        updates["updated_at"] = _now()
        await db.pricing_settings.update_one({"id": SETTINGS_ID}, {"$set": updates})
    return await get_founding_settings(db)


class AmbiguousPlanKey(ValueError):
    """More than one portfolio plan answers to the given key.

    Raised instead of writing to whichever row the database happened to return
    first. See the note in `set_portfolio_plan_prices`."""


async def set_portfolio_plan_prices(db, plan_key: str,
                                    durations: Optional[Dict[str, Any]] = None,
                                    durations_founding: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Admin write via the founding console.

    `plan_key` is a plan **id** (`plan_portfolio_premium`) or, for
    compatibility, a tier name. It used to be the tier name only, resolved with
    `find_one({"product": "portfolio", "tier": tier})` — and `tier` is not
    unique. On any database carrying two portfolio plans with the same tier
    name (a legacy row, a re-created plan, or the comped `plan_portfolio_test`
    the dogfooding seed inserts as "Premium"), that `find_one` returned
    whichever row came back first, so the owner pressing "Save Premium" on the
    founding console could write the price onto the wrong plan, silently, with
    a success toast. Same failure the 2026 wave already fixed twice elsewhere —
    `apply_founding_portfolio_catalogue` matching by tier name, and
    StudioPlanPicker deduping by `portfolio_tier` — this was the third place.

    An id match wins. A tier match is honoured only while it is unambiguous;
    two plans answering to one tier name raises `AmbiguousPlanKey` rather than
    guessing, because guessing here is a price write.

    REGULAR prices have exactly one source: base_monthly, expanded through
    subscription_service.sync_plan_durations (5/10/15 ladder + psychological
    rounding, docs §3). A `durations` edit here therefore anchors on its
    monthly value ("1") and recomputes the whole ladder — free-form per-cycle
    regular prices are refused, because writing them raw is how this endpoint
    used to diverge the marketing page from what checkout charges (audit P2:
    a `durations.1 = 1` PATCH showed ₹1/month publicly while checkout kept
    charging ₹499).

    FOUNDING prices are free-form absolute owner numbers, and MERGE per cycle
    instead of replacing the whole map — a partial PATCH used to silently
    delete the unmentioned cycles (audit P3)."""
    plan = await db.subscription_plans.find_one({"product": "portfolio", "id": plan_key})
    if not plan:
        matches = await db.subscription_plans.find(
            {"product": "portfolio", "tier": plan_key}).to_list(100)
        if len(matches) > 1:
            raise AmbiguousPlanKey(
                f"{len(matches)} portfolio plans are named '{plan_key}' "
                f"({', '.join(sorted(str(m.get('id')) for m in matches))}). "
                "Save by plan id so the write lands on the intended plan.")
        plan = matches[0] if matches else None
    if not plan:
        raise ValueError(f"No portfolio plan '{plan_key}'.")

    def _clean(m: Dict[str, Any]) -> Dict[str, int]:
        out = {}
        for k, v in (m or {}).items():
            if str(k) in ("1", "3", "6", "12"):
                out[str(k)] = max(0, _i(v))
        return out

    fields: Dict[str, Any] = {"updated_at": _now()}
    if durations is not None:
        cleaned = _clean(durations)
        if "1" not in cleaned or cleaned["1"] <= 0:
            raise ValueError(
                "Regular prices anchor on the monthly value — include a "
                "positive cycle '1'; the 3/6/12 ladder derives from it.")
        from subscription_service import sync_plan_durations  # lazy: avoid import cycle
        fields["base_monthly"] = cleaned["1"]
        fields.update(sync_plan_durations({**plan, "base_monthly": cleaned["1"]}))
    if durations_founding is not None:
        merged = dict(plan.get("durations_founding") or {})
        merged.update(_clean(durations_founding))
        fields["durations_founding"] = merged
    # Write by the RESOLVED row's id, never by the key the caller passed — a
    # tier-name filter here would re-open the ambiguity the lookup just closed.
    by_id = {"id": plan["id"]}
    await db.subscription_plans.update_one(by_id, {"$set": fields})
    doc = await db.subscription_plans.find_one(by_id)
    if doc:
        doc.pop("_id", None)
    return doc


async def apply_founding_portfolio_catalogue(db) -> Dict[str, int]:
    """OWNER-INVOKED (never auto-run): reset the 5 portfolio plans' regular +
    founding per-cycle prices to the current pricing_catalog finals.

    Upserts by CANONICAL ID (plan_portfolio_{key}) — never by tier name, which
    is how the old version could stomp a renamed plan or collide with an
    existing id. Preserves each existing row's features/marketing fields;
    price/storage/identity fields are reset to the catalog. Since
    durations_founding == durations until the owner approves founding
    discounts, clicking this button on a healthy DB is a safe price reset,
    not a rollback."""
    updated = created = 0
    for spec in founding_portfolio_catalogue():
        fields = {
            "product": "portfolio", "tier": spec["tier"], "name": spec["tier"],
            "base_monthly": spec["base_monthly"], "setup_fee_inr": spec["setup_fee_inr"],
            "durations": dict(spec["durations"]),
            "durations_founding": dict(spec["durations_founding"]),
            "portfolio_tier": spec["portfolio_tier"],
            "storage_mb": spec["storage_mb"], "storage_label": spec["storage_label"],
            "storage_gb": spec["storage_gb"],
            "popular": spec["popular"], "sort_order": spec["sort_order"],
            "is_active": True,
            "updated_at": _now(),
        }
        existing = await db.subscription_plans.find_one({"id": spec["id"]})
        if existing:
            await db.subscription_plans.update_one({"id": spec["id"]}, {"$set": fields})
            updated += 1
        else:
            # Fresh row (plan was deleted?): seed features lazily from the same
            # lists the migration uses, so a re-created plan is not featureless.
            from subscription_service import (
                PORTFOLIO_BASIC_FEATURES, PORTFOLIO_PREMIUM_FEATURES)
            fields["features"] = list(
                PORTFOLIO_BASIC_FEATURES if spec["id"].endswith("_basic")
                else PORTFOLIO_PREMIUM_FEATURES)
            await db.subscription_plans.insert_one({
                "id": spec["id"], **fields, "created_at": _now()})
            created += 1
    return {"updated": updated, "created": created}
