"""
subscription_service.py — Photographer Studio subscription engine.

Replaces the (removed) credits model with recurring subscription plans across
four products: invitation, portfolio, storage, backup.

Billing cycles: monthly | quarterly | half_yearly | yearly. Longer cycles get a
built-in discount. Prices are DEFAULTS seeded into `subscription_plans`; the
super-admin can edit them (POST /api/admin/subscription-plans) — the catalog is
data-driven from the table, not hardcoded at request time.

Gateway: designed for Razorpay *recurring* Subscriptions (auto-charge via
eMandate/UPI-Autopay). Until a recurring-enabled Razorpay account + keys are
wired, a MOCK gateway issues `sub_mock_*` ids and auto-verifies, so the entire
create -> activate -> renew lifecycle is exercisable end-to-end. Swap
`_gateway_create_subscription` / `_gateway_verify` for the real Razorpay calls
when keys land — the surrounding lifecycle, DB, and API stay identical.

Wired in server.py:
    from subscription_service import build_subscription_router, seed_subscription_plans
    app.include_router(build_subscription_router(db, razorpay_client, require_admin, require_super_admin))
    # on startup:  await seed_subscription_plans(db)
"""
from __future__ import annotations

import os
import hmac
import hashlib
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

import pricing_catalog

logger = logging.getLogger("subscriptions")

GST_RATE = 0.18  # 18% GST (India) — invitation/backup only; portfolio's GST is
                 # INCLUDED in the catalog final price (see _quote below, §7).

# Cycle -> billing period + discount off the monthly base for committing longer.
# `unit` is days | months | years and `count` how many; `months` is the
# month-equivalent kept for pricing. Super-admin can add/override periods
# (including day- and year-based ones) from the Pricing Hub.
# Yearly discount 20% -> 15% (docs/PRICING_REDESIGN_2026.md §2). This table is
# shared by EVERY product priced through _cycle_price_meta, so the change also
# applies to the legacy invitation/backup subscription products — intentional,
# not a portfolio-only tweak; those products were never split out.
CYCLES: Dict[str, Dict[str, Any]] = {
    "monthly":     {"unit": "months", "count": 1,  "months": 1,  "discount": 0.00, "label": "Monthly"},
    "quarterly":   {"unit": "months", "count": 3,  "months": 3,  "discount": 0.05, "label": "Quarterly"},
    "half_yearly": {"unit": "months", "count": 6,  "months": 6,  "discount": 0.10, "label": "Half-Yearly"},
    "yearly":      {"unit": "years",  "count": 1,  "months": 12, "discount": 0.15, "label": "Yearly"},
}

# Duration-map key (as stored on a plan's `durations{1,3,6,12}`) -> the matching
# pricing_catalog cycle name. Shared with pricing_migration.py (initial seed)
# and founding_pricing.py (card math) so the mapping cannot drift between them.
DURATION_KEY_TO_CATALOG_CYCLE = {"1": "monthly", "3": "quarterly", "6": "half_yearly", "12": "yearly"}

# Feature bullets for the 5 portfolio plans (Basic keeps its own pre-redesign
# list; the other four share the pre-redesign Premium list). This is not a
# placeholder — see pricing_catalog.py's note above PORTFOLIO_PLANS: every
# consumer (portfolio_service._plan_tier_of, photographer_directory,
# community_gating, PORTFOLIO_DESIGN_TIERS) gates Pro/Advanced/Premium/Custom
# identically (portfolio_tier="premium"); storage is their one real
# difference. Sharing this list is the truthful representation of that,
# resolving docs/PRICING_REDESIGN_2026.md §9 item 2. Module constants so
# pricing_migration.py's seed writes the SAME lists rather than a second copy
# that could drift.
PORTFOLIO_BASIC_FEATURES = ["about", "services", "gallery", "contact", "whatsapp", "instagram"]
PORTFOLIO_PREMIUM_FEATURES = [
    "about", "services", "packages", "pricing", "albums", "gallery", "videos",
    "testimonials", "contact", "booking_form", "whatsapp", "instagram",
    "facebook", "youtube", "google_maps", "seo", "analytics",
    "themes", "3d_animations", "premium_designs",
]


def _portfolio_plan_catalog_entries() -> List[Dict[str, Any]]:
    """Portfolio rows of PLAN_CATALOG, derived FROM pricing_catalog.PORTFOLIO_PLANS
    (docs/PRICING_REDESIGN_2026.md §3) — never restate its numbers here.

    `storage_mb` (int) / `storage_label` are authoritative. `storage_gb` is kept
    ALSO, as an exact float (`storage_mb / 1024`), purely so the one existing
    consumer — portfolio_service._base_storage_cap_bytes, which reads
    `storage_gb` first and only falls back to `storage_mb` when storage_gb is
    unset — keeps resolving the correct byte cap without that (out-of-scope-
    for-this-leg) function needing to change. All 5 plans' MB figures are exact
    multiples of 1024 (512/2048/10240/20480), so the float carries no rounding
    error: 512 MB -> 0.5, 2048 -> 2.0, 10240 -> 10.0, 20480 -> 20.0.
    """
    return [
        {"product": "portfolio", "tier": p["name"], "base_monthly": p["base_monthly_inr"],
         "sort_order": p["sort_order"], "popular": p.get("popular", False),
         "portfolio_tier": p["portfolio_tier"], "setup_fee_inr": p["setup_fee_inr"],
         "storage_mb": p["storage_mb"], "storage_label": p["storage_label"],
         "storage_gb": round(p["storage_mb"] / 1024, 4),
         "features": PORTFOLIO_BASIC_FEATURES if p["key"] == "basic" else PORTFOLIO_PREMIUM_FEATURES}
        for p in pricing_catalog.PORTFOLIO_PLANS
    ]


# DEFAULT plan catalog. base_monthly = INR/month. Super-admin can override any of
# these later; the seeder only fills rows that don't already exist.
# `features` are the modules unlocked; used by the marketplace/config engine.
PLAN_CATALOG: List[Dict[str, Any]] = [
    # ---- Invitation product ----
    {"product": "invitation", "tier": "Starter",      "base_monthly": 499,  "sort_order": 1,
     "features": ["invitation_website", "rsvp", "gallery", "countdown", "maps"]},
    {"product": "invitation", "tier": "Professional", "base_monthly": 999,  "sort_order": 2, "popular": True,
     "features": ["invitation_website", "rsvp", "gallery", "countdown", "maps", "music",
                  "guest_management", "whatsapp_integration", "email_notifications", "analytics"]},
    {"product": "invitation", "tier": "Studio",       "base_monthly": 1999, "sort_order": 3,
     "features": ["invitation_website", "rsvp", "gallery", "live_streaming", "music", "countdown",
                  "maps", "gift_registry", "accommodation", "travel", "guest_management", "ai_story",
                  "qr_checkin", "whatsapp_integration", "email_notifications", "analytics",
                  "premium_fonts", "extra_languages", "premium_animations", "seo"]},
    {"product": "invitation", "tier": "Enterprise",   "base_monthly": 3999, "sort_order": 4,
     "features": ["invitation_website", "rsvp", "gallery", "live_streaming", "music", "countdown",
                  "maps", "gift_registry", "accommodation", "travel", "guest_management", "ai_story",
                  "qr_checkin", "whatsapp_integration", "email_notifications", "analytics",
                  "premium_fonts", "extra_languages", "premium_animations", "custom_domain", "seo",
                  "portfolio_integration", "cloud_backup", "additional_team_members", "priority_support"]},
    # ---- Portfolio product ----
    # Five plans (was two): Basic/Pro/Advanced/Premium/Custom — see
    # docs/PRICING_REDESIGN_2026.md §3. `portfolio_tier` drives the experience
    # (storage caps / directory ranking / which designs unlock): Basic stays
    # "basic", the other four are "premium" (full sections).
    *_portfolio_plan_catalog_entries(),
    # ---- Storage product (canonical catalog; storage limits in GB) ----
    {"product": "storage", "tier": "Starter",      "base_monthly": 350,  "sort_order": 1, "storage_gb": 500},
    {"product": "storage", "tier": "Professional", "base_monthly": 599,  "sort_order": 2, "storage_gb": 1024, "popular": True},
    {"product": "storage", "tier": "Studio",       "base_monthly": 999,  "sort_order": 3, "storage_gb": 2048},
    {"product": "storage", "tier": "Enterprise",   "base_monthly": 1999, "sort_order": 4, "storage_gb": 5120},
    # ---- Cloud backup product (storage_gb makes the paid plan grant a usable
    #      quota so cloud backup activates on payment; admin-overridable) ----
    {"product": "backup", "tier": "Basic", "base_monthly": 199, "sort_order": 1, "storage_gb": 100,
     "features": ["automatic_backup", "manual_backup", "restore", "encryption"]},
    {"product": "backup", "tier": "Plus",  "base_monthly": 499, "sort_order": 2, "popular": True, "storage_gb": 500,
     "features": ["automatic_backup", "manual_backup", "restore", "restore_points", "version_history",
                  "encryption", "scheduled_backup"]},
]

# One-off storage add-ons (extra capacity without changing the plan). GB -> INR/mo.
STORAGE_ADDONS: List[Dict[str, Any]] = [
    {"key": "addon_100gb", "gb": 100,  "price_monthly": 79},
    {"key": "addon_250gb", "gb": 250,  "price_monthly": 149},
    {"key": "addon_500gb", "gb": 500,  "price_monthly": 249},
    {"key": "addon_1tb",   "gb": 1024, "price_monthly": 399},
    {"key": "addon_2tb",   "gb": 2048, "price_monthly": 699},
    {"key": "addon_5tb",   "gb": 5120, "price_monthly": 1499},
]

VALID_PRODUCTS = {"invitation", "portfolio", "storage", "backup"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _add_months(dt: datetime, months: int) -> datetime:
    """Add whole months, clamping the day to the target month's length."""
    m0 = dt.month - 1 + months
    year = dt.year + m0 // 12
    month = m0 % 12 + 1
    # clamp day (e.g. Jan 31 + 1mo -> Feb 28/29)
    import calendar
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _cycle_months_equiv(meta: Dict[str, Any]) -> float:
    """Month-equivalent of a billing period (for pricing off base_monthly)."""
    unit = (meta.get("unit") or "months").rstrip("s") + "s"  # normalise
    count = meta.get("count", meta.get("months", 1)) or 1
    if unit == "days":
        return count / 30.0
    if unit == "years":
        return count * 12
    return count  # months


def _cycle_price_meta(base_monthly_inr: int, meta: Dict[str, Any]) -> int:
    """Full-period price in paise after the period discount."""
    gross = base_monthly_inr * 100 * _cycle_months_equiv(meta)
    return int(round(gross * (1 - float(meta.get("discount", 0)))))


def _advance_period(start: datetime, meta: Dict[str, Any]) -> datetime:
    """End of a billing period given its unit/count (days/months/years)."""
    unit = (meta.get("unit") or "months").rstrip("s") + "s"
    count = int(meta.get("count", meta.get("months", 1)) or 1)
    if unit == "days":
        return start + timedelta(days=count)
    if unit == "years":
        return _add_months(start, count * 12)
    return _add_months(start, count)


async def _stacked_period_start(db, studio_id: str, product: str, now: datetime) -> datetime:
    """When a studio subscribes AGAIN for a product it already holds, the new
    period must begin where the current one ENDS — not today — so re-buying (even
    by mistake) ADDS a cycle instead of throwing away the days already paid for.
    "Subscribe twice → it goes onto next month," in the owner's words.

    Returns the latest future `current_period_end` across the studio's active
    subscriptions for this product, or `now` if there is nothing live to stack on.
    Entitlement already treats ANY active sub with a future end as covering the
    studio (portfolio_service._active_portfolio_plan / the storage lifecycle skip),
    so the existing sub covers now→end1 and the stacked one covers end1→end2 with
    no gap and no overlap-loss.
    """
    try:
        subs = await db.subscriptions.find(
            {"studio_id": studio_id, "product": product, "status": "active"},
            {"_id": 0}).to_list(50)
    except Exception:
        subs = []
    latest: Optional[datetime] = None
    for s in subs:
        end = s.get("current_period_end")
        if not end:
            continue
        try:
            dt = datetime.fromisoformat(end)
        except Exception:
            continue
        if dt > now and (latest is None or dt > latest):
            latest = dt
    return latest or now


async def _resolve_cycles(db) -> Dict[str, Dict[str, Any]]:
    """Default periods merged with any super-admin custom/overridden periods."""
    cycles = {k: dict(v) for k, v in CYCLES.items()}
    try:
        doc = await db.pricing_settings.find_one({"id": "billing_cycles"}, {"_id": 0})
    except Exception:
        doc = None
    if doc and isinstance(doc.get("cycles"), list):
        for c in doc["cycles"]:
            key = c.get("key")
            if not key:
                continue
            unit = (c.get("unit") or "months").rstrip("s") + "s"
            count = int(c.get("count", 1) or 1)
            months = count if unit == "months" else (count * 12 if unit == "years" else round(count / 30.0, 4))
            cycles[key] = {
                "unit": unit, "count": count, "months": months,
                "discount": float(c.get("discount", 0) or 0),
                "label": c.get("label") or key.replace("_", " ").title(),
                "custom": True,
            }
    return cycles


def _cycle_price_paise(base_monthly_inr: int, cycle: str) -> int:
    """Back-compat: price a *default* cycle key. Prefer _cycle_price_meta."""
    return _cycle_price_meta(base_monthly_inr, CYCLES[cycle])


def _razorpay_recurring_ready(razorpay_client) -> bool:
    """Real recurring subscriptions need a client AND a plan/subscription-enabled
    Razorpay account. Until keys + recurring are provisioned, we run the mock."""
    return bool(
        razorpay_client is not None
        and os.environ.get("RAZORPAY_KEY_ID")
        and os.environ.get("RAZORPAY_RECURRING_ENABLED") == "1"
    )


def _razorpay_keys_ready(razorpay_client) -> bool:
    """True when we can charge a REAL one-time order (no recurring mandate needed).

    This is the common production case: the account has ordinary API keys, but
    razorpay Plan/Subscription objects for recurring billing were never
    provisioned. Before this existed the code fell straight through to the MOCK
    gateway, so a studio buying Portfolio or Cloud Backup was auto-activated
    WITHOUT PAYING and the Razorpay checkout never opened — the reported
    "not redirecting to Razorpay" bug, and a revenue leak.

    A one-time order needs nothing but the keys, which `studio_storage.py`
    already proves works on this account.
    """
    kid = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
    sec = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    if razorpay_client is None or not kid or not sec:
        return False
    # Never treat the committed placeholders as live keys.
    if "PLACEHOLDER" in kid.upper() or "PLACEHOLDER" in sec.upper():
        return False
    return kid.startswith("rzp_")


def _order_signature_ok(order_id: str, payment_id: str, signature: str) -> bool:
    """Local HMAC-SHA256 of "order_id|payment_id" — the documented Razorpay
    checkout signature. Done locally (not via the SDK utility) so a missing or
    misbehaving SDK helper can never be mistaken for a forged signature."""
    sec = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    if not (sec and order_id and payment_id and signature):
        return False
    expected = hmac.new(sec.encode(), f"{order_id}|{payment_id}".encode(),
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(signature).strip())


def verify_gateway_payment(sub: Dict[str, Any], payload: "VerifySubscriptionRequest",
                           razorpay_client) -> bool:
    """Did this subscription really get paid? Dispatches on the provider recorded
    at create time — module level so it is directly unit-testable.

    The provider check is a security boundary, not tidiness: without it a client
    could send a `mock_token` against a subscription created through REAL keys and
    activate a paid plan for free.
    """
    provider = sub.get("provider")

    if provider == "razorpay_order":
        # Verify against the order id WE stored at create time, never one the
        # client sends, so a caller cannot substitute an order they control.
        return _order_signature_ok(
            sub.get("razorpay_subscription_id") or "",
            payload.razorpay_payment_id or "",
            payload.razorpay_signature or "",
        )

    if provider == "razorpay" and razorpay_client is not None:
        try:
            razorpay_client.utility.verify_payment_signature({
                "razorpay_subscription_id": sub["razorpay_subscription_id"],
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
            return True
        except Exception:
            return False

    if provider != "mock":
        return False
    return bool(payload.mock_token and payload.mock_token == sub.get("mock_token"))


async def _has_paid_custom_portfolio(db, studio_id: str) -> bool:
    """True if `studio_id` has EVER actually been charged for a portfolio/Custom
    subscription — gates the one-time Custom setup fee to first purchase only
    (docs/PRICING_REDESIGN_2026.md §3).

    Reachable statuses for a subscription row, per this router: pending (just
    created, checkout not finished) -> active (settled by _settle_subscription,
    via /verify or /webhook) -> cancelled (via /cancel; auto_renew off, access
    continues to period end). There is no separate "paid" status here — a row
    that ever left "pending" was, by construction, actually settled at least
    once. Checking "not pending" rather than an allowlist of the other values
    means this does not silently stop working if a new terminal status is
    added later.
    """
    rows = await db.subscriptions.find(
        {"studio_id": studio_id, "product": "portfolio", "tier": "Custom"},
        {"_id": 0, "status": 1}).to_list(50)
    return any(r.get("status") not in ("pending", None) for r in rows)


def sync_plan_durations(plan_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Recompute a portfolio plan's `durations{1,3,6,12}` from `base_monthly`
    via pricing_catalog — the ONE place that derives durations, so base_monthly
    (what checkout/_quote charges) and durations (what the public cards show)
    can never diverge again (docs/PRICING_REDESIGN_2026.md §3). No-op for every
    other product. Callers merge the returned dict into their write.

    Durations are always the RENEWAL price (setup_fee_inr excluded) — Custom's
    one-time setup fee is charged at purchase time by _quote, never folded into
    the displayed/stored per-cycle price.
    """
    if plan_doc.get("product") != "portfolio":
        return {}
    base = plan_doc.get("base_monthly")
    if base in (None, "", 0):
        return {}
    durations = {
        dur_key: pricing_catalog.compute_cycle_breakdown(int(base), cyc_key)["final_paise"] // 100
        for dur_key, cyc_key in DURATION_KEY_TO_CATALOG_CYCLE.items()
    }
    return {"durations": durations}


# ---------------------------------------------------------------------------
# request models
# ---------------------------------------------------------------------------
class QuoteRequest(BaseModel):
    product: str
    tier: str
    cycle: str = "monthly"
    coupon: Optional[str] = None
    storage_addons: List[str] = Field(default_factory=list)


class CreateSubscriptionRequest(QuoteRequest):
    pass


class VerifySubscriptionRequest(BaseModel):
    subscription_id: str
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    # mock-mode marker returned by create when the gateway is mocked
    mock_token: Optional[str] = None


class UpsertPlanRequest(BaseModel):
    product: str
    tier: str
    base_monthly: int
    sort_order: int = 0
    is_active: bool = True
    storage_gb: Optional[int] = None
    popular: bool = False
    features: List[str] = Field(default_factory=list)
    # portfolio product only: which of the 15 portfolio sections this plan unlocks
    portfolio_sections: Optional[List[str]] = None


# NOTE: these two MUST live at module level. This file uses
# `from __future__ import annotations`, which turns every annotation into a
# string; FastAPI resolves endpoint annotations against MODULE globals, so a
# request model defined inside build_subscription_router() is an unresolvable
# ForwardRef — it breaks /openapi.json (PydanticUserError: not fully defined)
# AND the endpoint's own request parsing.
class BillingCycleIn(BaseModel):
    key: str
    label: Optional[str] = None
    unit: str = "months"                       # days | months | years
    count: int = Field(1, ge=1)
    discount: float = Field(0.0, ge=0, le=0.95)  # fraction off base_monthly


class BillingCyclesUpsert(BaseModel):
    cycles: List[BillingCycleIn] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# seeding
# ---------------------------------------------------------------------------
async def seed_subscription_plans(db) -> int:
    """Idempotent — insert any catalog plan not already present. Returns count added."""
    added = 0
    # RETIRE old portfolio plans: the portfolio product now has exactly Basic +
    # Premium. Any other portfolio plan seeded earlier (Starter/Professional/
    # Studio) is deactivated so it disappears from the plans page and Pricing Hub.
    # We only hide them (is_active=False) — existing subscriptions keep working.
    try:
        # Only the real catalog plans stay purchasable. Everything else — old
        # Starter/Professional/Studio AND the comped test plan — is hidden from
        # the plans page. (Deactivating a plan does NOT break subscriptions that
        # reference it; tier is still read from the plan doc by id.)
        keep = {f"plan_portfolio_{p['tier'].lower()}"
                for p in PLAN_CATALOG if p["product"] == "portfolio"}
        for row in await db.subscription_plans.find({"product": "portfolio"}, {"_id": 0, "id": 1}).to_list(100):
            if row.get("id") not in keep:
                await db.subscription_plans.update_one(
                    {"id": row["id"]}, {"$set": {"is_active": False}})
                logger.info("[subscriptions] retired legacy portfolio plan %s", row.get("id"))
    except Exception:
        logger.warning("[subscriptions] portfolio plan retirement failed", exc_info=True)
    for p in PLAN_CATALOG:
        plan_id = f"plan_{p['product']}_{p['tier'].lower()}"
        existing = await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0})
        if existing:
            # BACKFILL: portfolio plans seeded before `portfolio_tier` existed
            # resolved to "basic" forever, so PREMIUM could never be reached.
            if p["product"] == "portfolio" and not existing.get("portfolio_tier"):
                await db.subscription_plans.update_one(
                    {"id": plan_id},
                    {"$set": {"portfolio_tier": p.get("portfolio_tier", "basic"),
                              "storage_gb": p.get("storage_gb")}},
                )
                logger.info("[subscriptions] backfilled portfolio_tier on %s", plan_id)
            continue
        doc = {
            "id": plan_id,
            "product": p["product"],
            "tier": p["tier"],
            "base_monthly": p["base_monthly"],
            "sort_order": p.get("sort_order", 0),
            "is_active": True,
            "popular": p.get("popular", False),
            "storage_gb": p.get("storage_gb"),
            "portfolio_tier": p.get("portfolio_tier"),
            "features": p.get("features", []),
            "created_at": _now_iso(),
        }
        await db.subscription_plans.insert_one(doc)
        added += 1
    if added:
        logger.info("[subscriptions] seeded %d default plans", added)
    return added


# ---------------------------------------------------------------------------
# what buying the PORTFOLIO product must make true, immediately
# ---------------------------------------------------------------------------
async def _activate_portfolio_presence(db, studio_id: str) -> None:
    """Make the studio findable the moment it pays, not the first time someone
    happens to open its page.

    The directory's plan gate lists a studio as soon as it holds an active
    portfolio subscription — but its public URL slug lived in
    `portfolio_profiles`, and that row was only ever created lazily by a READ
    (portfolio_service._ensure_slug, reached from the public portfolio
    endpoint). So a studio that had just paid got a directory card linking to
    its raw UUID and **no sitemap entry at all**, and stayed invisible to
    Google until a human visited it. For a product sold as "buy the portfolio
    and be found", that is the wrong way round.

    Never raises: a slug is not worth failing a paid activation over. The lazy
    path still exists as the backstop.
    """
    try:
        from portfolio_service import ensure_portfolio_slug
        slug = await ensure_portfolio_slug(db, studio_id)
        logger.info("[subscriptions] portfolio slug ready for %s: %s", studio_id, slug)
    except Exception:
        logger.warning("[subscriptions] portfolio slug mint failed for %s",
                       studio_id, exc_info=True)


# ---------------------------------------------------------------------------
# settlement — what a PAID subscription must become, exactly once
# ---------------------------------------------------------------------------
async def _settle_subscription(db, sub: Dict[str, Any], *, payment_id: Optional[str],
                               via: str) -> Dict[str, Any]:
    """Activate a paid subscription: extend/create the billing period, write the
    ledger + audit rows, and run product-specific side effects (portfolio slug
    + folder). Called by BOTH `/api/subscriptions/verify` (browser callback) and
    `/api/subscriptions/webhook` (Razorpay server-to-server) — a payment must
    settle the SAME way regardless of which one wins the race, and the CAS below
    guarantees only the first of the two actually applies the side effects.

    Caller must have ALREADY verified the payment signature — this function does
    not check it, so it must never be reachable from an unauthenticated caller.
    """
    studio_id = sub["studio_id"]

    # `start` may be in the FUTURE when stacking onto a live plan, so it drives
    # only the coverage window. Money/activation timestamps are always `now`.
    now = _now()
    start = await _stacked_period_start(db, studio_id, sub["product"], now)
    cycles = await _resolve_cycles(db)
    meta = cycles.get(sub["cycle"]) or CYCLES.get(sub["cycle"]) or CYCLES["monthly"]
    end = _advance_period(start, meta)

    def _activation_set(s, e):
        return {"$set": {
            "status": "active",
            "current_period_start": s.isoformat(),
            "current_period_end": e.isoformat(),
            "activated_at": now.isoformat(),
            "razorpay_payment_id": payment_id,
        }}

    try:
        res = await db.subscriptions.update_one(
            {"id": sub["id"], "status": {"$ne": "active"}}, _activation_set(start, end))
    except Exception as e:
        # The active-sub unique index rejects a concurrent activation for the
        # same (studio, product) that computed this exact coverage start.
        # Recompute against the now-committed state (stack onto the winner) and
        # retry once. Duck-typed on the class name so we don't hard-depend on
        # asyncpg's exception module here. Applies equally to the webhook — a
        # webhook racing /verify for the same subscription must not 500.
        if type(e).__name__ != "UniqueViolationError":
            raise
        start = await _stacked_period_start(db, studio_id, sub["product"], now)
        end = _advance_period(start, meta)
        res = await db.subscriptions.update_one(
            {"id": sub["id"], "status": {"$ne": "active"}}, _activation_set(start, end))
    if getattr(res, "matched_count", 1) == 0:
        # A concurrent verify/webhook won the CAS between our status read and
        # this write. Without this guard BOTH racers fell through and each
        # inserted a payments-ledger row + audit row for one activation.
        fresh = await db.subscriptions.find_one({"id": sub["id"]}, {"_id": 0}) or {}
        return {"subscription_id": sub["id"],
                "status": fresh.get("status", "active"), "already": True,
                "current_period_end": fresh.get("current_period_end")}
    await db.orders.update_one(
        {"subscription_id": sub["id"]},
        {"$set": {"status": "paid", "paid_at": now.isoformat()}},
    )
    # payment ledger row
    await db.payments.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:16]}", "studio_id": studio_id,
        "order_id": (await db.orders.find_one({"subscription_id": sub["id"]}, {"_id": 0}) or {}).get("id"),
        "subscription_id": sub["id"], "status": "captured",
        "amount_paise": sub["quote"]["total_paise"],
        "razorpay_payment_id": payment_id,
        "created_at": now.isoformat(),
    })
    # audit
    await db.audit_logs.insert_one({
        "id": f"aud_{uuid.uuid4().hex[:16]}", "actor_id": studio_id,
        "action": "subscription.activated",
        "target": sub["id"], "product": sub["product"], "tier": sub["tier"],
        "via": via,
        "created_at": now.isoformat(),
    })

    # Buying Portfolio reserves the studio's portfolio folder, so the owner
    # sees its name + the mail it lives on in the photographer's admin panel.
    # Idempotent; never fails the activation.
    if sub.get("product") == "portfolio":
        try:
            from studio_folders import ensure_studio_folder
            await ensure_studio_folder(db, studio_id, "portfolio")
        except Exception:
            logger.warning("[subscriptions] portfolio folder reserve failed for %s",
                           studio_id, exc_info=True)
        await _activate_portfolio_presence(db, studio_id)

    return {"subscription_id": sub["id"], "status": "active",
            "current_period_end": end.isoformat()}


# ---------------------------------------------------------------------------
# storage subscription lifecycle (run daily by the scheduler)
# ---------------------------------------------------------------------------
async def run_storage_lifecycle(db, send_email: Optional[Callable] = None) -> Dict[str, int]:
    """Daily lifecycle for the `storage` product:
      1. warn a studio ~1 week before its storage plan expires,
      2. mark active storage subs `expired` once the period ends,
      3. one day after expiry (and only if the studio has NO other active
         storage sub) purge that studio's backup files — the paid storage is
         gone. All steps are idempotent (guarded by flags) and best-effort.
    Returns action counts. `send_email(to, subject, html, text)` optional."""
    now = _now()
    now_iso = now.isoformat()
    week_ahead = (now + timedelta(days=7)).isoformat()
    one_day_ago = (now - timedelta(days=1)).isoformat()
    counts = {"notified": 0, "expired": 0, "purged": 0}

    async def _email(sid: str, subject: str, body: str):
        if not send_email:
            return
        adm = (await db.admins.find_one({"id": sid}, {"_id": 0})
               or await db.admins.find_one({"admin_id": sid}, {"_id": 0}))
        to = (adm or {}).get("email")
        if not to:
            return
        try:
            await send_email(to, subject, f"<p>{body}</p>", body)
        except Exception as e:  # email is best-effort; never block the sweep
            logger.warning("[storage-lifecycle] email to %s failed: %s", to, e)

    subs = await db.subscriptions.find({"product": "storage"}, {"_id": 0}).to_list(100000)
    active_studios = {s["studio_id"] for s in subs if s.get("status") == "active"}

    for s in subs:
        sid = s.get("studio_id")
        end = s.get("current_period_end")

        # 1. expiry warning — active, ends within 7 days, not yet warned
        if s.get("status") == "active" and end and now_iso < end <= week_ahead and not s.get("expiry_notified"):
            await db.subscriptions.update_one({"id": s["id"]}, {"$set": {"expiry_notified": True}})
            await _email(sid, "Your storage plan expires soon",
                         f"Your {s.get('tier')} storage plan expires on {end[:10]}. "
                         "Renew to keep your backed-up photos — files are removed one day after expiry.")
            counts["notified"] += 1

        # 2. mark expired once the period ends
        if s.get("status") == "active" and end and end <= now_iso:
            await db.subscriptions.update_one(
                {"id": s["id"], "status": "active"},
                {"$set": {"status": "expired", "expired_at": now_iso}},
            )
            counts["expired"] += 1
            s["status"], s["expired_at"] = "expired", now_iso
            active_studios.discard(sid)

        # 3. purge one day after expiry (skip if another storage sub is still active)
        if s.get("status") == "expired" and not s.get("storage_purged"):
            exp = s.get("expired_at")
            if exp and exp <= one_day_ago:
                if sid in active_studios:
                    await db.subscriptions.update_one({"id": s["id"]}, {"$set": {"storage_purged": True}})
                    continue
                res = await db.backup_files.delete_many({"studio_id": sid})
                await db.backup_folders.delete_many({"studio_id": sid})
                await db.subscriptions.update_one(
                    {"id": s["id"]}, {"$set": {"storage_purged": True, "purged_at": now_iso}})
                await _email(sid, "Your backed-up photos were removed",
                             "Your storage plan expired over a day ago, so your backed-up photos "
                             "have been removed. Subscribe again to start backing up.")
                counts["purged"] += (res.deleted_count or 0)

    if any(counts.values()):
        logger.info("[storage-lifecycle] notified=%(notified)d expired=%(expired)d purged=%(purged)d", counts)
    return counts


# ---------------------------------------------------------------------------
# router
# ---------------------------------------------------------------------------
def build_subscription_router(db, razorpay_client, require_admin, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["subscriptions"])

    async def _plan(product: str, tier: str) -> Optional[Dict[str, Any]]:
        return await db.subscription_plans.find_one(
            {"id": f"plan_{product}_{tier.lower()}"}, {"_id": 0}
        )

    async def _apply_coupon(code: Optional[str], subtotal_paise: int,
                            scope: Optional[list] = None) -> Dict[str, Any]:
        """Return {discount_paise, coupon} — 0 if code missing/invalid/expired
        or scoped (`applies_to`) to something other than what is being bought."""
        if not code:
            return {"discount_paise": 0, "coupon": None}
        doc = await db.coupons.find_one({"code": code.upper()}, {"_id": 0})
        # Arithmetic lives in pricing_engine (the one pricing resolver) because
        # marketplace_service had a second, identical copy — and both copies read
        # field names the super-admin console never wrote, so every console
        # coupon discounted 0. One implementation cannot drift from itself.
        from pricing_engine import coupon_discount_paise
        disc = coupon_discount_paise(doc, subtotal_paise, now_iso=_now_iso(), scope=scope)
        if not disc:
            return {"discount_paise": 0, "coupon": None}
        return {"discount_paise": disc, "coupon": doc.get("code")}

    async def _quote(req: QuoteRequest, *, studio_id: Optional[str] = None) -> Dict[str, Any]:
        if req.product not in VALID_PRODUCTS:
            raise HTTPException(400, f"Unknown product '{req.product}'")
        cycles = await _resolve_cycles(db)
        if req.cycle not in cycles:
            raise HTTPException(400, f"Unknown cycle '{req.cycle}'")
        meta = cycles[req.cycle]
        plan = await _plan(req.product, req.tier)
        if not plan:
            raise HTTPException(404, f"Plan {req.product}/{req.tier} not available")
        if not plan.get("is_active", True):
            # A retired plan (e.g. the legacy invitation-subscription tiers
            # deactivated by pricing_migration.apply_pricing_2026_v2, docs §9
            # item 4) still quotes for a studio that ALREADY holds a
            # subscription at this exact (product, tier) — renewal at
            # contractual terms, mirroring the storage grandfathering in
            # studio_storage.py. "Held" means actually settled at least once,
            # same idiom as _has_paid_custom_portfolio above (a lone
            # never-paid "pending" row must not be enough to unlock a retired
            # tier forever). A brand-new buyer (or an anonymous quote,
            # studio_id=None) gets the same 404 any unavailable plan gives.
            renewing = False
            if studio_id:
                rows = await db.subscriptions.find(
                    {"studio_id": studio_id, "product": req.product, "tier": req.tier},
                    {"_id": 0, "status": 1}).to_list(50)
                renewing = any(r.get("status") not in ("pending", None) for r in rows)
            if not renewing:
                raise HTTPException(404, f"Plan {req.product}/{req.tier} not available")

        # storage add-ons (charged for the same period span) — mechanically
        # unchanged for every product, portfolio included.
        addon_paise = 0
        addon_detail = []
        if req.storage_addons:
            months = _cycle_months_equiv(meta)
            by_key = {a["key"]: a for a in STORAGE_ADDONS}
            for k in req.storage_addons:
                a = by_key.get(k)
                if a:
                    line = int(round(a["price_monthly"] * 100 * months))
                    addon_paise += line
                    addon_detail.append({"key": k, "gb": a["gb"], "amount_paise": line})

        extra_fields: Dict[str, Any] = {}
        if req.product == "portfolio":
            # 2026 redesign (docs/PRICING_REDESIGN_2026.md §3, §7): pricing_catalog
            # is the ONE resolver for psychological rounding, the Custom setup
            # fee, and the GST-INCLUDED total — none of that is re-derived here.
            base_monthly = int(plan["base_monthly"])
            plan_setup_fee_inr = int(plan.get("setup_fee_inr") or 0)
            is_first_purchase = True
            if plan_setup_fee_inr > 0 and studio_id:
                is_first_purchase = not await _has_paid_custom_portfolio(db, studio_id)
            # No studio_id (anonymous /api/subscriptions/quote preview): cannot
            # prove a prior purchase, so the fee applies — never under-quote.
            effective_setup_fee_inr = plan_setup_fee_inr if is_first_purchase else 0
            try:
                bd = pricing_catalog.compute_cycle_breakdown(
                    base_monthly, req.cycle, setup_fee_inr=effective_setup_fee_inr)
            except ValueError as e:
                raise HTTPException(400, str(e))

            # Founding-100: when founding mode is LIVE (server-derived, seat-
            # counted — never client input) and the plan carries a GENUINE
            # founding rate for this cycle (durations_founding strictly below
            # durations; equal maps mean "not configured"), the founding rate
            # IS the recurring charge. Audit P1: the public cards displayed
            # this rate but checkout never read it, so a "₹299/month founding"
            # buyer would have been charged the regular ₹499. The Custom setup
            # fee is never founding-discounted, same as the cycle discount.
            is_founding_price = False
            dur_key = {v: k for k, v in DURATION_KEY_TO_CATALOG_CYCLE.items()}.get(bd["cycle"])
            fnd_inr = (plan.get("durations_founding") or {}).get(dur_key)
            reg_inr = (plan.get("durations") or {}).get(dur_key)
            if (dur_key and fnd_inr is not None and reg_inr is not None
                    and int(fnd_inr) < int(reg_inr)):
                from founding_pricing import founding_status  # lazy: avoid import cycle
                st = await founding_status(db)
                if st.get("mode") == "founding":
                    is_founding_price = True
                    final_paise = int(fnd_inr) * 100 + bd["setup_fee_paise"]
                    bd = dict(bd)
                    bd["save_paise"] = bd["list_paise"] + bd["setup_fee_paise"] - final_paise
                    bd["final_paise"] = final_paise
                    bd["psych_adjustment_paise"] = 0
                    bd["extra_saving"] = False
                    bd["effective_monthly_paise"] = round(final_paise / bd["months"])

            subtotal = bd["final_paise"] + addon_paise
            cpn = await _apply_coupon(req.coupon, subtotal,
                                      scope=[req.product, plan.get("id"), req.tier])
            # Coupon subtracted AFTER psychological rounding, never re-rounded (§1).
            total = subtotal - cpn["discount_paise"]
            gst = total - round(total / 1.18)   # GST INCLUDED in `total`, not added (§7)

            extra_fields = {
                "list_paise": bd["list_paise"], "save_paise": bd["save_paise"],
                "pct_off": bd["discount_pct"], "extra_saving": bd["extra_saving"],
                "psych_adjustment_paise": bd["psych_adjustment_paise"],
                "setup_fee_paise": bd["setup_fee_paise"],
                "is_first_purchase": is_first_purchase,
                "effective_monthly_paise": bd["effective_monthly_paise"],
                "is_founding_price": is_founding_price,
            }
        else:
            # invitation / backup / storage: unchanged GST-on-top math. Only the
            # cycle-discount table itself changed (yearly 20% -> 15%, above).
            subtotal = _cycle_price_meta(int(plan["base_monthly"]), meta) + addon_paise
            cpn = await _apply_coupon(req.coupon, subtotal,
                                      scope=[req.product, plan.get("id"), req.tier])
            after_discount = subtotal - cpn["discount_paise"]
            gst = int(round(after_discount * GST_RATE))
            total = after_discount + gst

        return {
            "product": req.product, "tier": req.tier, "cycle": req.cycle,
            "cycle_label": meta["label"], "months": meta.get("months"),
            "period_unit": meta.get("unit", "months"), "period_count": meta.get("count"),
            "features": plan.get("features", []),
            "storage_gb": plan.get("storage_gb"),
            "subtotal_paise": subtotal,
            "storage_addons": addon_detail,
            "discount_paise": cpn["discount_paise"], "coupon": cpn["coupon"],
            "gst_rate": GST_RATE, "gst_paise": gst,
            "total_paise": total, "total_inr": round(total / 100, 2),
            "currency": "INR",
            **extra_fields,
        }

    # ---- gateway (mock unless real recurring wired) -----------------------
    def _gateway_create_subscription(quote: Dict[str, Any], studio_id: str) -> Dict[str, Any]:
        if _razorpay_recurring_ready(razorpay_client):
            # Real Razorpay recurring Subscription. Requires a razorpay Plan id per
            # (product,tier,cycle); created/looked-up out of band and stored on the
            # plan row as `razorpay_plan_id`. Kept behind the readiness flag so this
            # path only runs once an account is provisioned.
            rzp = razorpay_client.subscription.create({
                "plan_id": quote.get("razorpay_plan_id"),
                "total_count": 120,  # cap; auto-renew handled by our lifecycle
                "customer_notify": 1,
                "notes": {"studio_id": studio_id, "product": quote["product"], "tier": quote["tier"]},
            })
            return {"provider": "razorpay", "gateway_id": rzp["id"],
                    "short_url": rzp.get("short_url"), "mock": False, "mock_token": None}

        if _razorpay_keys_ready(razorpay_client):
            # REAL one-time order for this billing period. No mandate is created,
            # so `auto_renew` is False and the studio re-buys at period end — the
            # honest description of what the gateway actually did.
            try:
                order = razorpay_client.order.create({
                    "amount": int(quote["total_paise"]),
                    "currency": quote.get("currency", "INR"),
                    "payment_capture": 1,
                    "notes": {"studio_id": studio_id, "product": quote["product"],
                              "tier": quote["tier"], "cycle": quote.get("cycle", ""),
                              "type": "subscription_period"},
                })
            except Exception:
                # Surface it: silently mock-activating here is what gave paid
                # plans away for free.
                logger.exception("[subscriptions] razorpay order.create failed")
                raise HTTPException(
                    502, "Could not reach the payment gateway. You have not been "
                         "charged — please try again in a moment.")
            return {"provider": "razorpay_order", "gateway_id": order["id"],
                    "short_url": None, "mock": False, "mock_token": None}

        # MOCK — deterministic, auto-verifiable. ONLY when no real keys are
        # configured (local dev). Never reachable on a keyed production account.
        logger.warning("[subscriptions] no live Razorpay keys — using MOCK gateway "
                       "(studio=%s product=%s)", studio_id, quote.get("product"))
        gid = f"sub_mock_{uuid.uuid4().hex[:20]}"
        return {"provider": "mock", "gateway_id": gid, "short_url": None,
                "mock": True, "mock_token": uuid.uuid4().hex}

    def _gateway_verify(sub: Dict[str, Any], payload: VerifySubscriptionRequest) -> bool:
        return verify_gateway_payment(sub, payload, razorpay_client)

    # ---- public: plan catalog ---------------------------------------------
    @router.get("/api/subscriptions/plans")
    async def list_plans(product: Optional[str] = None):
        # Query only on the text `product` column; filter is_active in Python
        # (the id+data adapter mis-binds boolean equality on generated columns).
        q: Dict[str, Any] = {}
        if product:
            q["product"] = product
        cur = db.subscription_plans.find(q, {"_id": 0})
        plans = await cur.sort("sort_order", 1).to_list(100)
        plans = [p for p in plans if p.get("is_active", True)]
        cycles = await _resolve_cycles(db)
        # attach per-cycle pricing so the UI can render every billing period
        for p in plans:
            base = int(p.get("base_monthly", 0))
            if p.get("product") == "portfolio":
                # The card preview must show the SAME final /quote charges
                # (psych-rounded, GST-included renewal price; the Custom setup
                # fee stays per-buyer in /quote). The old linear preview here
                # showed ₹1,422 where checkout said ₹1,399. Admin-added custom
                # cycles are unknown to pricing_catalog and keep the linear
                # fallback rather than guessing a rounding for them.
                cp: Dict[str, Any] = {}
                for cyc, meta in cycles.items():
                    common = {"label": meta["label"], "months": meta.get("months"),
                              "unit": meta.get("unit", "months"), "count": meta.get("count")}
                    if cyc in pricing_catalog.CYCLES:
                        bd = pricing_catalog.compute_cycle_breakdown(base, cyc)
                        cp[cyc] = {"paise": bd["final_paise"],
                                   "inr": round(bd["final_paise"] / 100, 2),
                                   "list_paise": bd["list_paise"],
                                   "save_paise": bd["save_paise"],
                                   "pct_off": bd["discount_pct"],
                                   "extra_saving": bd["extra_saving"], **common}
                    else:
                        cp[cyc] = {"paise": _cycle_price_meta(base, meta),
                                   "inr": round(_cycle_price_meta(base, meta) / 100, 2),
                                   **common}
                p["cycle_prices"] = cp
                continue
            p["cycle_prices"] = {
                cyc: {"paise": _cycle_price_meta(base, meta),
                      "inr": round(_cycle_price_meta(base, meta) / 100, 2),
                      "label": meta["label"], "months": meta.get("months"),
                      "unit": meta.get("unit", "months"), "count": meta.get("count")}
                for cyc, meta in cycles.items()
            }
        return {"plans": plans, "cycles": [{"key": k, **v} for k, v in cycles.items()],
                "storage_addons": STORAGE_ADDONS}

    # ---- public: live quote -----------------------------------------------
    @router.post("/api/subscriptions/quote")
    async def quote(req: QuoteRequest):
        return await _quote(req)

    # ---- studio: create a subscription (checkout) -------------------------
    @router.post("/api/subscriptions/create")
    async def create_subscription(req: CreateSubscriptionRequest, admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        q = await _quote(req, studio_id=studio_id)
        plan = await _plan(req.product, req.tier)

        # TEST accounts (test.studio@maja.test etc., flagged is_test by the
        # seed) get FREE instant activation — no payment gateway — for portfolio,
        # storage and every other subscription product, so the owner can dogfood
        # the whole flow at no cost. EVERY other account falls through to the
        # gateway below. When real Razorpay keys land, only these test accounts
        # stay free; real studios pay. (Mirrors the invitation-link bypass in
        # store_features.create_order.)
        adm = await db.admins.find_one({"id": studio_id}, {"_id": 0, "is_test": 1})
        if (adm or {}).get("is_test"):
            # Stack onto any still-active plan for this product (re-buy = add a cycle).
            # `start` may be in the future; activation timestamps stay `now`.
            now = _now()
            start = await _stacked_period_start(db, studio_id, req.product, now)
            cycles = await _resolve_cycles(db)
            meta = cycles.get(req.cycle) or CYCLES.get(req.cycle) or CYCLES["monthly"]
            end = _advance_period(start, meta)
            sub_id = f"sub_test_{uuid.uuid4().hex[:12]}"
            doc = {
                "id": sub_id, "studio_id": studio_id, "product": req.product,
                "plan_id": plan["id"], "tier": req.tier, "cycle": req.cycle,
                "status": "active", "auto_renew": False, "quote": q,
                "provider": "test-free", "is_test": True,
                "current_period_start": start.isoformat(),
                "current_period_end": end.isoformat(),
                "activated_at": now.isoformat(), "created_at": _now_iso(),
            }
            await db.subscriptions.insert_one(doc)
            await db.orders.insert_one({
                "id": f"ord_{uuid.uuid4().hex[:16]}", "studio_id": studio_id,
                "kind": "subscription", "subscription_id": sub_id, "status": "paid",
                "amount_paise": 0, "is_test": True,
                "created_at": _now_iso(), "paid_at": now.isoformat(),
            })
            if req.product == "portfolio":
                await _activate_portfolio_presence(db, studio_id)
            return {"subscription_id": sub_id, "free": True, "status": "active",
                    "current_period_end": end.isoformat()}

        # Reuse a recent pending row for the same purchase intent instead of
        # minting a new subscription + Razorpay order on every click. A slow
        # gateway response + retry used to create two pending rows, and nothing
        # stopped BOTH from later being verified into two active subscriptions
        # for one studio+product.
        #
        # The read-then-insert check below is only the FAST PATH (skips a
        # wasted gateway call for the common sequential re-click). It is not
        # what makes this race-safe: two requests can both pass it before
        # either has inserted. The actual guarantee is the partial unique
        # index `uniq_pending_sub_per_studio_product_tier_cycle` on
        # subscriptions(studio_id, product, tier, cycle) WHERE status='pending'
        # (built at startup in server.py, mirroring the active-sub CAS index).
        # A loser's insert_one below raises a UniqueViolationError, which is
        # caught and turned into the SAME reused-pending response a sequential
        # double-click gets — a double-clicking (or racing) caller always sees
        # one checkout, never an error and never a second subscription.
        def _reuse_response(prev: Dict[str, Any], prev_order: Dict[str, Any]) -> Dict[str, Any]:
            return {
                "subscription_id": prev["id"],
                "order_id": prev_order.get("id"),
                "provider": prev.get("provider"),
                "mock": prev.get("provider") != "razorpay_order",
                "mock_token": prev.get("mock_token"),
                "razorpay_order_id": prev.get("razorpay_subscription_id")
                    if prev.get("provider") == "razorpay_order" else None,
                "amount_paise": (prev.get("quote") or {}).get("total_paise"),
                "currency": (prev.get("quote") or {}).get("currency", "INR"),
                "quote": prev.get("quote"),
                "reused_pending": True,
            }

        async def _pending_matches():
            """Pending rows for this exact (studio, product, tier, cycle),
            split fresh/stale by the same 24h window the old check used. The
            unique index has no notion of age, so an abandoned (>24h) pending
            row still occupies the index slot -- callers that find nothing
            fresh but something stale must retire the stale row(s) before a
            new pending row for this key can be inserted."""
            cur = db.subscriptions.find(
                {"studio_id": studio_id, "product": req.product, "status": "pending"}, {"_id": 0})
            fresh, stale = [], []
            for prev in await cur.to_list(10):
                if prev.get("tier") != req.tier or prev.get("cycle") != req.cycle:
                    continue
                try:
                    age_ok = (_now() - datetime.fromisoformat(prev["created_at"])) < timedelta(hours=24)
                except Exception:
                    age_ok = False
                (fresh if age_ok else stale).append(prev)
            return fresh, stale

        fresh, _stale = await _pending_matches()
        if fresh:
            prev = fresh[0]
            prev_order = await db.orders.find_one({"subscription_id": prev["id"]}, {"_id": 0}) or {}
            return _reuse_response(prev, prev_order)

        gw = _gateway_create_subscription({**q, "razorpay_plan_id": plan.get("razorpay_plan_id")}, studio_id)

        sub_id = f"sub_{uuid.uuid4().hex[:16]}"
        doc = {
            "id": sub_id,
            "studio_id": studio_id,
            "product": req.product,
            "plan_id": plan["id"],
            "tier": req.tier,
            "cycle": req.cycle,
            "status": "pending",  # pending -> active -> (past_due|cancelled|expired)
            # A one-time order creates no mandate, so nothing can auto-renew it.
            # Claiming otherwise would promise a charge we cannot make.
            "auto_renew": gw["provider"] != "razorpay_order",
            "quote": q,
            "provider": gw["provider"],
            "razorpay_subscription_id": gw["gateway_id"],
            "mock_token": gw.get("mock_token"),
            "current_period_start": None,
            "current_period_end": None,
            "created_at": _now_iso(),
            "activated_at": None,
        }
        try:
            await db.subscriptions.insert_one(doc)
        except Exception as e:
            # Duck-typed on the class name -- same convention as the
            # active-subscription CAS in _settle_subscription -- so this
            # doesn't hard-depend on asyncpg's exception module here.
            if type(e).__name__ != "UniqueViolationError":
                raise
            fresh, stale = await _pending_matches()
            if fresh:
                prev = fresh[0]
                prev_order = await db.orders.find_one(
                    {"subscription_id": prev["id"]}, {"_id": 0}) or {}
                return _reuse_response(prev, prev_order)
            # Every row occupying the index slot is stale (an abandoned
            # checkout from >24h ago) -- nothing to reuse, but it still blocks
            # our insert while it says status=pending. Retire it and retry
            # once; this is not a hot path, so a single retry is enough.
            for old in stale:
                await db.subscriptions.update_one(
                    {"id": old["id"], "status": "pending"}, {"$set": {"status": "expired"}})
            await db.subscriptions.insert_one(doc)

        # matching order row for the billing ledger
        order_id = f"ord_{uuid.uuid4().hex[:16]}"
        await db.orders.insert_one({
            "id": order_id, "studio_id": studio_id, "kind": "subscription",
            "subscription_id": sub_id, "status": "created",
            "amount_paise": q["total_paise"], "razorpay_order_id": gw["gateway_id"],
            "created_at": _now_iso(),
        })

        return {
            "subscription_id": sub_id,
            "order_id": order_id,
            "provider": gw["provider"],
            "mock": gw["mock"],
            "mock_token": gw.get("mock_token"),   # frontend echoes this to /verify in mock mode
            "short_url": gw.get("short_url"),
            "razorpay_key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
            # Everything the Razorpay checkout modal needs. Present only on the
            # real one-time-order path; the frontend opens checkout when it sees
            # `razorpay_order_id` and falls back to mock-verify when it does not.
            "razorpay_order_id": gw["gateway_id"] if gw["provider"] == "razorpay_order" else None,
            "amount_paise": q["total_paise"],
            "currency": q.get("currency", "INR"),
            "quote": q,
        }

    # ---- studio: verify + activate ----------------------------------------
    @router.post("/api/subscriptions/verify")
    async def verify_subscription(payload: VerifySubscriptionRequest, admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        sub = await db.subscriptions.find_one(
            {"id": payload.subscription_id, "studio_id": studio_id}, {"_id": 0}
        )
        if not sub:
            raise HTTPException(404, "Subscription not found")
        if sub["status"] == "active":
            return {"subscription_id": sub["id"], "status": "active", "already": True,
                    "current_period_end": sub.get("current_period_end")}
        if not _gateway_verify(sub, payload):
            raise HTTPException(400, "Payment verification failed")

        return await _settle_subscription(
            db, sub, payment_id=payload.razorpay_payment_id, via="checkout")

    # ---- Razorpay server-to-server callback (buyer's browser died mid-checkout) --
    # NOT auth'd by a session — authenticated by the webhook HMAC over the raw
    # body, so the raw bytes must be read untouched (same shape as
    # event_purchase_service.webhook_purchase / store_features.store_webhook).
    # This is the highest-value gap of the two: recurring studio revenue
    # (subscription plans, portfolio tier, storage tier) previously had NO
    # settlement path once Razorpay captured the money if the tab closed
    # before /verify ran.
    @router.post("/api/subscriptions/webhook")
    async def subscription_webhook(request: Request):
        from event_payments import verify_webhook, webhook_payment, PaymentUnavailable

        raw = await request.body()
        signature = request.headers.get("x-razorpay-signature", "")
        # Signature verified FIRST, before any DB read or state change — a
        # forged payload must never be able to probe subscription state.
        try:
            ok = verify_webhook(raw, signature)
        except PaymentUnavailable as e:
            raise HTTPException(409, str(e))
        if not ok:
            raise HTTPException(400, "Invalid webhook signature.")

        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            raise HTTPException(400, "Malformed webhook body.")
        info = webhook_payment(payload)
        if info["event"] not in ("payment.captured", "order.paid") or not info["order_id"]:
            return {"received": True}

        # The order id is the same value stored as `razorpay_subscription_id`
        # on the pending row for the one-time-order path (see
        # _gateway_create_subscription's "razorpay_order" branch).
        sub = await db.subscriptions.find_one(
            {"razorpay_subscription_id": info["order_id"], "provider": "razorpay_order"},
            {"_id": 0})
        if not sub or sub.get("status") == "active":
            return {"received": True}  # unknown order, or already settled by /verify

        await _settle_subscription(db, sub, payment_id=info["payment_id"], via="webhook")
        return {"received": True}

    # ---- studio: my subscriptions -----------------------------------------
    @router.get("/api/subscriptions/mine")
    async def my_subscriptions(admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        cur = db.subscriptions.find({"studio_id": studio_id}, {"_id": 0})
        subs = await cur.sort("created_at", -1).to_list(100)
        active = [s for s in subs if s.get("status") == "active"]
        return {"subscriptions": subs, "active": active,
                "active_by_product": {s["product"]: s for s in active}}

    # ---- studio: cancel (stops auto-renew; access until period end) -------
    @router.post("/api/subscriptions/{subscription_id}/cancel")
    async def cancel_subscription(subscription_id: str, admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        sub = await db.subscriptions.find_one(
            {"id": subscription_id, "studio_id": studio_id}, {"_id": 0}
        )
        if not sub:
            raise HTTPException(404, "Subscription not found")
        await db.subscriptions.update_one(
            {"id": subscription_id},
            {"$set": {"auto_renew": False, "status": "cancelled", "cancelled_at": _now_iso()}},
        )
        await db.audit_logs.insert_one({
            "id": f"aud_{uuid.uuid4().hex[:16]}", "actor_id": studio_id,
            "action": "subscription.cancelled", "target": subscription_id, "created_at": _now_iso(),
        })
        return {"subscription_id": subscription_id, "status": "cancelled",
                "access_until": sub.get("current_period_end")}

    # ---- studio: change plan (upgrade/downgrade) --------------------------
    @router.post("/api/subscriptions/{subscription_id}/change")
    async def change_plan(subscription_id: str, req: QuoteRequest, admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        sub = await db.subscriptions.find_one(
            {"id": subscription_id, "studio_id": studio_id}, {"_id": 0}
        )
        if not sub:
            raise HTTPException(404, "Subscription not found")
        if req.product != sub["product"]:
            raise HTTPException(400, "Cannot change product on an existing subscription")
        plan = await _plan(req.product, req.tier)
        if not plan:
            raise HTTPException(404, "Target plan not found")
        q = await _quote(req, studio_id=studio_id)
        # takes effect next renewal (no proration in mock; real gateway prorates)
        await db.subscriptions.update_one(
            {"id": subscription_id},
            {"$set": {"pending_plan_id": plan["id"], "pending_tier": req.tier,
                      "pending_cycle": req.cycle, "pending_quote": q,
                      "plan_change_at": _now_iso()}},
        )
        return {"subscription_id": subscription_id, "pending_tier": req.tier,
                "effective": "next_renewal", "quote": q}

    # ---- super-admin: upsert a plan (price control) -----------------------
    @router.post("/api/admin/subscription-plans")
    async def upsert_plan(req: UpsertPlanRequest, _super=Depends(require_super_admin)):
        if req.product not in VALID_PRODUCTS:
            raise HTTPException(400, f"Unknown product '{req.product}'")
        plan_id = f"plan_{req.product}_{req.tier.lower()}"
        existing = await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0})
        doc = {
            "id": plan_id, "product": req.product, "tier": req.tier,
            "base_monthly": req.base_monthly, "sort_order": req.sort_order,
            "is_active": req.is_active, "popular": req.popular,
            "storage_gb": req.storage_gb, "features": req.features,
            "portfolio_sections": req.portfolio_sections,
            "updated_at": _now_iso(),
        }
        # portfolio: keep `durations` (what the public cards show) in lockstep
        # with `base_monthly` (what checkout charges) — this and
        # pricing_hub_service.update_plan are the only two writers (§3/§5).
        doc.update(sync_plan_durations(doc))
        if existing:
            await db.subscription_plans.update_one({"id": plan_id}, {"$set": doc})
        else:
            doc["created_at"] = _now_iso()
            await db.subscription_plans.insert_one(doc)
        return {"plan_id": plan_id, "saved": True}

    # ---- super-admin: list all plans (incl inactive) ----------------------
    @router.get("/api/admin/subscription-plans")
    async def admin_list_plans(_super=Depends(require_super_admin)):
        cur = db.subscription_plans.find({}, {"_id": 0})
        plans = await cur.sort("sort_order", 1).to_list(200)
        return {"plans": plans}

    # ---- super-admin: billing periods (days / months / years) -------------
    # (BillingCycleIn / BillingCyclesUpsert are module-level — see note above.)
    @router.get("/api/admin/billing-cycles")
    async def admin_get_billing_cycles(_super=Depends(require_super_admin)):
        """Effective periods (defaults + custom) plus the editable custom list."""
        cycles = await _resolve_cycles(db)
        doc = await db.pricing_settings.find_one({"id": "billing_cycles"}, {"_id": 0})
        return {
            "effective": [{"key": k, **v} for k, v in cycles.items()],
            "custom": (doc or {}).get("cycles", []),
            "defaults": [{"key": k, **v} for k, v in CYCLES.items()],
            "units": ["days", "months", "years"],
        }

    @router.put("/api/admin/billing-cycles")
    async def admin_put_billing_cycles(payload: BillingCyclesUpsert, _super=Depends(require_super_admin)):
        clean = []
        seen = set()
        for c in payload.cycles:
            unit = (c.unit or "months").rstrip("s") + "s"
            if unit not in ("days", "months", "years"):
                raise HTTPException(400, f"unit must be days/months/years (got '{c.unit}')")
            key = "".join(ch for ch in c.key.lower().strip().replace(" ", "_") if ch.isalnum() or ch == "_")
            if not key or key in seen:
                raise HTTPException(400, f"Invalid or duplicate period key '{c.key}'")
            seen.add(key)
            clean.append({"key": key, "label": c.label or key.replace("_", " ").title(),
                          "unit": unit, "count": int(c.count), "discount": float(c.discount)})
        await db.pricing_settings.update_one(
            {"id": "billing_cycles"},
            {"$set": {"id": "billing_cycles", "cycles": clean, "updated_at": _now_iso()}},
            upsert=True,
        )
        return {"saved": True, "count": len(clean), "cycles": clean}

    # ---- studio: Subscription Center (Phase 8) ----------------------------
    # Central dashboard: current plan per product, billing cycle, renewal dates,
    # auto-renew, invoices + payment history — one call.
    @router.get("/api/subscription-center")
    async def subscription_center(admin: dict = Depends(require_admin)):
        studio_id = admin["admin_id"]
        subs = await db.subscriptions.find({"studio_id": studio_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        active = [s for s in subs if s.get("status") == "active"]
        by_product = {}
        for s in active:
            # keep the most recent active per product
            if s["product"] not in by_product:
                by_product[s["product"]] = {
                    "subscription_id": s["id"], "tier": s.get("tier"),
                    "cycle": s.get("cycle"), "status": s.get("status"),
                    "auto_renew": s.get("auto_renew", True),
                    "current_period_end": s.get("current_period_end"),
                    "amount_inr": (s.get("quote") or {}).get("total_inr"),
                }
        pays = await db.payments.find({"studio_id": studio_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        invs = await db.invoices.find({"studio_id": studio_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return {
            "products": {p: by_product.get(p) for p in ["invitation", "portfolio", "storage", "backup"]},
            "active_count": len(active),
            "payment_history": [
                {"amount_inr": round((p.get("amount_paise") or 0) / 100, 2),
                 "status": p.get("status"), "at": p.get("created_at"),
                 "razorpay_payment_id": p.get("razorpay_payment_id")}
                for p in pays
            ],
            "invoices": [
                {"number": i.get("number"), "amount_inr": round((i.get("amount_paise") or 0) / 100, 2),
                 "at": i.get("created_at")}
                for i in invs
            ],
        }

    return router
