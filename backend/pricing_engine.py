"""
pricing_engine.py — MAJA Invites: the ONE pricing resolver (P2).
=================================================================

Single source of truth for every money calculation on the platform. No page,
router, or checkout may compute a price itself — they all call in here.

    WEDDING   total = design_price + feature_pack_price + link_duration_price
                      − best applicable campaign discount
    PORTFOLIO total = plan.durations[cycle] − best applicable campaign discount
    STORAGE   total = plan.durations[cycle] − best applicable campaign discount

Design decisions
----------------
* **Pure core, thin DB layer.** `compute_*` take plain dicts and are fully
  unit-testable with no DB / network (see tests/test_pricing_resolver.py). The
  `quote_*` async functions only load rows and delegate to the pure core.
* **One discount, never stacked.** `best_campaign` picks the single active,
  in-window, in-scope campaign that saves the most. Discounts are clamped to the
  subtotal, so a total can never go negative and a fixed ₹ discount larger than
  the price just makes it free — never ₹-x.
* **Safety first (charter §SAFETY).** Every price is coerced to an int ≥ 0;
  `validate_price` / `validate_unique_name` guard admin writes; `is_free` must be
  explicit for a legitimate ₹0.
* Flag-gated rollout lives at the call sites; this module is pure computation.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

CURRENCY = "INR"

# Portfolio/storage billing cycles (keys admin edits prices against). Absolute
# per-cycle prices are stored on each plan's `durations` map — NEVER computed.
BILLING_CYCLES = ("1", "3", "6", "12")

# Community capability keys (the editable matrix; seeded by pricing_migration).
COMMUNITY_CAPS = (
    "view_feed", "like", "comment", "follow", "post", "marketplace",
    "reels", "stories", "analytics", "ai_review", "ai_assistant",
    "featured_placement", "leads",
)


# --------------------------------------------------------------------------- #
# coercion / time helpers
# --------------------------------------------------------------------------- #
def _int(v: Any, default: int = 0) -> int:
    """Coerce to a non-negative integer rupee amount; junk → default."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return default
    return n


def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Any) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# validation (used by the admin write paths — P3)
# --------------------------------------------------------------------------- #
class PricingError(ValueError):
    """Raised for invalid pricing input (negative, duplicate, missing tier…)."""


def validate_price(value: Any, *, allow_zero: bool = True, label: str = "price") -> int:
    """Return a safe int price or raise. Blocks negatives and (optionally) ₹0."""
    n = _int(value, default=-1)
    if n < 0:
        raise PricingError(f"{label} must be a number ≥ 0 (got {value!r}).")
    if n == 0 and not allow_zero:
        raise PricingError(f"{label} cannot be ₹0 unless explicitly marked free.")
    return n


def validate_unique_name(existing: List[str], name: str, *, label: str = "name") -> str:
    n = (name or "").strip()
    if not n:
        raise PricingError(f"{label} is required.")
    if n.lower() in {e.strip().lower() for e in existing}:
        raise PricingError(f"A record with {label} '{n}' already exists.")
    return n


# --------------------------------------------------------------------------- #
# design price
# --------------------------------------------------------------------------- #
def effective_design_price(design: Dict[str, Any]) -> int:
    """The design's sellable price. `sale_price` (admin's final) is authoritative
    when present; otherwise it's derived base − %disc − ₹disc, floored at 0."""
    if design.get("sale_price") is not None:
        return max(0, _int(design.get("sale_price")))
    base = _int(design.get("base_price"))
    pct = _num(design.get("discount_pct"))
    amt = _int(design.get("discount_amount"))
    price = base - (base * pct / 100.0) - amt
    return max(0, int(round(price)))


# --------------------------------------------------------------------------- #
# campaigns (single best, never stacked)
# --------------------------------------------------------------------------- #
def _campaign_active(campaign: Dict[str, Any], now: datetime) -> bool:
    if not campaign.get("active"):
        return False
    start = _parse_iso(campaign.get("start_at"))
    end = _parse_iso(campaign.get("end_at"))
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


def _campaign_in_scope(campaign: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    scope = campaign.get("scope") or {}
    mode = scope.get("mode") or "all"
    ids = scope.get("ids") or []
    if mode == "all":
        return True
    if mode == "designs":
        return ctx.get("design_id") in ids
    if mode == "categories":
        return ctx.get("category_id") in ids
    if mode == "feature_packs":
        return ctx.get("feature_pack_key") in ids
    if mode == "portfolio":
        return ctx.get("kind") == "portfolio" and (not ids or ctx.get("plan_id") in ids)
    if mode == "storage":
        return ctx.get("kind") == "storage" and (not ids or ctx.get("plan_id") in ids)
    return False


def _campaign_saving(subtotal: int, campaign: Dict[str, Any]) -> int:
    """Rupees saved, clamped to the subtotal (never over-discounts)."""
    if subtotal <= 0:
        return 0
    dtype = (campaign.get("discount_type") or "").lower()
    val = _num(campaign.get("discount_value"))
    if dtype == "percentage":
        val = max(0.0, min(val, 100.0))
        return min(subtotal, int(round(subtotal * val / 100.0)))
    if dtype in ("fixed", "fixed_amount", "amount"):
        return min(subtotal, max(0, int(round(val))))
    return 0


def best_campaign(
    subtotal: int, ctx: Dict[str, Any], campaigns: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> Tuple[Optional[Dict[str, Any]], int]:
    """Pick the single active, in-window, in-scope campaign with the largest
    saving. Returns (campaign|None, saving_rupees). Ties broken by higher
    `priority` then most-recent start."""
    now = now or datetime.now(timezone.utc)
    best: Optional[Dict[str, Any]] = None
    best_saving = 0
    best_key = (-1, "")
    for c in campaigns or []:
        if not _campaign_active(c, now) or not _campaign_in_scope(c, ctx):
            continue
        saving = _campaign_saving(subtotal, c)
        if saving <= 0:
            continue
        key = (int(c.get("priority") or 0), str(c.get("start_at") or ""))
        if saving > best_saving or (saving == best_saving and key > best_key):
            best, best_saving, best_key = c, saving, key
    return best, best_saving


def _campaign_stub(c: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not c:
        return None
    return {"id": c.get("id"), "name": c.get("name"),
            "banner_text": c.get("banner_text"),
            "discount_type": c.get("discount_type"),
            "discount_value": c.get("discount_value")}


# --------------------------------------------------------------------------- #
# pure resolvers
# --------------------------------------------------------------------------- #
def compute_wedding_total(
    design: Dict[str, Any], feature_pack: Dict[str, Any],
    duration: Dict[str, Any], campaigns: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """WEDDING = design + feature pack + link duration − best campaign."""
    dp = effective_design_price(design)
    pp = max(0, _int(feature_pack.get("price")))
    lp = max(0, _int(duration.get("price")))
    subtotal = dp + pp + lp
    ctx = {
        "kind": "wedding",
        "design_id": design.get("design_id") or design.get("id"),
        "category_id": design.get("category_id"),
        "feature_pack_key": feature_pack.get("key"),
    }
    camp, saving = best_campaign(subtotal, ctx, campaigns, now)
    total = max(0, subtotal - saving)
    return {
        "kind": "wedding",
        "currency": CURRENCY,
        "design_price": dp,
        "feature_pack_price": pp,
        "link_duration_price": lp,
        "subtotal": subtotal,
        "discount": saving,
        "campaign": _campaign_stub(camp),
        "total": total,
    }


def compute_plan_total(
    plan: Dict[str, Any], cycle: str, campaigns: List[Dict[str, Any]],
    kind: str = "portfolio", now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """PORTFOLIO/STORAGE = plan.durations[cycle] − best campaign. A cycle with no
    admin-set price is 'unavailable' (never silently ₹0).

    KNOWN DIVERGENCE (owner decision, deliberately not papered over):
    subscription plans carry TWO price representations. This resolver reads
    `durations[cycle]`; `subscription_service._quote` instead reads
    `base_monthly` and derives the period price through its own CYCLES table
    (unit/count/discount). So a plan priced only via `base_monthly` reads as
    "unavailable" here, and a plan priced only via `durations` does not change
    what subscription checkout charges.

    Nothing is MIS-charged today — checkout is internally consistent and this
    function refuses rather than inventing ₹0 — but the two editors disagree
    about which field is authoritative. Bridging them means picking one, and
    deriving `durations` from `base_monthly` requires reusing the exact CYCLES
    multipliers; a second copy of those multipliers would be a real mispricing
    risk, which is why this is flagged rather than guessed.
    """
    cycle = str(cycle)
    durations = plan.get("durations") or {}
    raw = durations.get(cycle)
    if raw is None:
        return {"kind": kind, "currency": CURRENCY, "cycle": cycle,
                "available": False, "reason": "no price set for this billing cycle",
                "price": None, "discount": 0, "total": None}
    price = max(0, _int(raw))
    ctx = {"kind": kind, "plan_id": plan.get("id"),
           "category_id": plan.get("category_id")}
    camp, saving = best_campaign(price, ctx, campaigns, now)
    total = max(0, price - saving)
    return {
        "kind": kind, "currency": CURRENCY, "cycle": cycle, "available": True,
        "plan_id": plan.get("id"), "plan_name": plan.get("name") or plan.get("tier"),
        "price": price, "discount": saving, "campaign": _campaign_stub(camp),
        "total": total,
    }


# --------------------------------------------------------------------------- #
# Founding vs regular pricing (HONEST anchoring — P-founding)
# --------------------------------------------------------------------------- #
# The first N studios get a genuine launch rate (`durations_founding`); everyone
# else pays the `durations` (regular) rate. The strike-through a card shows is the
# REAL regular price — never a reverse-computed fake anchor — so the displayed
# "% off" is the true saving. Once the founding seats are gone (and auto-switch is
# on) the platform serves regular pricing automatically.
PRICING_MODES = ("founding", "regular")

# Sensible defaults if the settings doc is missing a key.
FOUNDING_DEFAULTS = {
    "founding_users_enabled": False,   # flag OFF until the owner turns it on
    "founding_user_limit": 100,
    "auto_switch_to_regular_pricing": True,
}


def founding_state(settings: Optional[Dict[str, Any]], count: Any) -> Dict[str, Any]:
    """Decide whether founding pricing is LIVE right now and how many seats remain.

    settings: {founding_users_enabled, founding_user_limit, auto_switch_to_regular_pricing}
    count:    how many founding seats are already taken.
    """
    s = {**FOUNDING_DEFAULTS, **(settings or {})}
    enabled = bool(s.get("founding_users_enabled"))
    limit = max(0, _int(s.get("founding_user_limit"), 100))
    taken = max(0, _int(count))
    slots_left = max(0, limit - taken)
    auto = bool(s.get("auto_switch_to_regular_pricing", True))
    # Founding is live only while enabled AND (seats remain, or auto-switch is off).
    live = enabled and (slots_left > 0 or not auto)
    return {
        "mode": "founding" if live else "regular",
        "enabled": enabled,
        "limit": limit,
        "count": taken,
        "slots_left": slots_left,
        "auto_switch": auto,
        "sold_out": enabled and auto and slots_left == 0,
    }


def pct_off(regular: Any, effective: Any) -> int:
    """Honest percentage off: how much cheaper `effective` is than the REAL
    `regular` price. 0 when there is no genuine saving."""
    reg = max(0, _int(regular))
    eff = max(0, _int(effective))
    if reg <= 0 or eff >= reg:
        return 0
    return int(round((reg - eff) * 100.0 / reg))


def price_display(regular: Any, founding: Any, mode: str) -> Dict[str, Any]:
    """The numbers one pricing card shows. `regular` is the honest strike-through;
    `effective_price` is what the buyer pays now. Founding mode uses the founding
    price when one is set and is genuinely lower; otherwise the buyer pays regular
    and NO fake strike-through is shown (strikethrough stays None)."""
    reg = max(0, _int(regular))
    fnd = None if founding is None else max(0, _int(founding))
    is_founding = (mode == "founding") and (fnd is not None) and (fnd < reg)
    effective = fnd if is_founding else reg
    return {
        "regular_price": reg,
        "founding_price": fnd,
        "effective_price": effective,
        "is_founding": is_founding,
        # A strike-through appears ONLY when the buyer genuinely pays less than regular.
        "strikethrough": reg if effective < reg else None,
        "pct_off": pct_off(reg, effective),
        "savings": max(0, reg - effective),
    }


def compute_plan_offer(
    plan: Dict[str, Any], cycle: str, mode: str = "regular",
    kind: str = "portfolio",
) -> Dict[str, Any]:
    """Founding-aware price for ONE billing cycle — the shape a PricingCard renders.
    Reads `durations[cycle]` (regular) and `durations_founding[cycle]` (founding).
    A cycle with no regular price is 'unavailable' (never silently ₹0)."""
    cycle = str(cycle)
    reg_map = plan.get("durations") or {}
    fnd_map = plan.get("durations_founding") or {}
    raw = reg_map.get(cycle)
    if raw is None:
        return {"kind": kind, "currency": CURRENCY, "cycle": cycle,
                "available": False, "reason": "no price set for this billing cycle"}
    disp = price_display(raw, fnd_map.get(cycle), mode)
    return {
        "kind": kind, "currency": CURRENCY, "cycle": cycle, "available": True,
        "plan_id": plan.get("id"), "plan_name": plan.get("name") or plan.get("tier"),
        "popular": bool(plan.get("popular")),
        "badge": plan.get("badge"),
        **disp,
    }


# --------------------------------------------------------------------------- #
# DB layer (thin) — loads rows, delegates to the pure core
# --------------------------------------------------------------------------- #
async def _load_campaigns(db) -> List[Dict[str, Any]]:
    """All campaigns; activeness/scope filtering happens in the pure core (so
    boolean/date logic isn't pushed through the JSONB adapter)."""
    out: List[Dict[str, Any]] = []
    async for c in db.pricing_campaigns.find({}):
        c.pop("_id", None)
        out.append(c)
    return out


async def _find_design(db, design_id: str) -> Optional[Dict[str, Any]]:
    doc = (await db.pricing_design_prices.find_one(
                {"audience": "normal_user", "design_id": design_id})
           or await db.pricing_design_prices.find_one({"design_id": design_id})
           or await db.pricing_design_prices.find_one({"id": design_id}))
    if doc:
        doc.pop("_id", None)
    return doc


async def quote_wedding(
    db, *, design_id: str, feature_pack_key: str, duration_id: str,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Resolve a wedding order price. Raises PricingError with a clear message on
    a missing/inactive design, pack, or duration."""
    design = await _find_design(db, design_id)
    if not design:
        raise PricingError(f"Design '{design_id}' not found.")
    if design.get("active") is False:
        raise PricingError(f"Design '{design_id}' is inactive.")

    pack = await db.feature_packs.find_one({"key": feature_pack_key})
    if not pack:
        raise PricingError(f"Feature pack '{feature_pack_key}' not found.")
    pack.pop("_id", None)
    if pack.get("active") is False:
        raise PricingError(f"Feature pack '{feature_pack_key}' is inactive.")

    duration = (await db.link_duration_tiers.find_one({"id": duration_id})
                or await db.link_duration_tiers.find_one({"key": duration_id}))
    if not duration:
        raise PricingError(f"Link duration '{duration_id}' not found.")
    duration.pop("_id", None)
    if duration.get("active") is False:
        raise PricingError(f"Link duration '{duration_id}' is inactive.")

    campaigns = await _load_campaigns(db)
    out = compute_wedding_total(design, pack, duration, campaigns, now)
    out["design"] = {"id": design.get("design_id") or design.get("id"),
                     "name": design.get("name"), "category_id": design.get("category_id")}
    out["feature_pack"] = {"key": pack.get("key"), "name": pack.get("name")}
    out["link_duration"] = {"id": duration.get("id"), "name": duration.get("name"),
                            "duration_days": duration.get("duration_days"),
                            "lifetime": bool(duration.get("lifetime"))}
    return out


async def quote_plan(
    db, *, plan_id: str, cycle: str, kind: str = "portfolio",
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Resolve a portfolio or storage plan price for one billing cycle."""
    plan = await db.subscription_plans.find_one({"id": plan_id})
    if not plan:
        raise PricingError(f"Plan '{plan_id}' not found.")
    plan.pop("_id", None)
    if plan.get("active") is False:
        raise PricingError(f"Plan '{plan_id}' is inactive.")
    campaigns = await _load_campaigns(db)
    return compute_plan_total(plan, cycle, campaigns, kind=kind, now=now)


# --------------------------------------------------------------------------- #
# coupons
# --------------------------------------------------------------------------- #
def coupon_discount_paise(doc: Optional[Dict[str, Any]], subtotal_paise: int,
                          *, now_iso: Optional[str] = None,
                          scope: Optional[Any] = None) -> int:
    """Discount a coupon row is worth against `subtotal_paise`. 0 if unusable.

    Lives here because two checkouts (subscription_service, marketplace_service)
    each had their own copy of this arithmetic, and both copies read a DIFFERENT
    set of field names than the super-admin console wrote:

        console wrote : discount_type / discount_value / active
        checkouts read: type          / value           / is_active

    so every coupon created in the console silently discounted 0, and switching
    one off did nothing (`is_active` was absent, and absent defaulted to True).
    One reader, both vocabularies, no second copy to drift.
    """
    if not doc:
        return 0
    active = doc.get("is_active")
    if active is None:
        active = doc.get("active", True)
    if not active:
        return 0

    exp = doc.get("expires_at")
    if exp:
        ref = now_iso or datetime.now(timezone.utc).isoformat()
        if str(exp) < ref:
            return 0

    max_uses = doc.get("max_uses") or 0
    if max_uses and int(doc.get("uses") or 0) >= int(max_uses):
        return 0

    # `applies_to` scoping: the console has always stored it and NOTHING read
    # it, so a coupon created as "20% off portfolio plans" silently discounted
    # everything. Empty list = applies to all (unchanged). `scope` is whatever
    # identifies the thing being bought — product, plan id, tier, pack id — and
    # any one match is enough.
    applies_to = doc.get("applies_to") or []
    if applies_to:
        keys = {str(k).lower() for k in (
            scope if isinstance(scope, (list, tuple, set, frozenset)) else [scope]
        ) if k}
        if not keys or not ({str(a).lower() for a in applies_to} & keys):
            return 0

    ctype = doc.get("type") or doc.get("discount_type")
    value = doc.get("value")
    if value is None:
        value = doc.get("discount_value", 0)
    try:
        value = float(value or 0)
    except (TypeError, ValueError):
        return 0

    disc = int(round(subtotal_paise * value / 100)) if ctype == "percent" \
        else int(value) * 100          # flat is denominated in rupees
    return max(0, min(disc, max(0, int(subtotal_paise))))
