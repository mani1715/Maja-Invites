"""
Super Admin Pricing Hub — unified pricing/discounts module.

Audience-aware (photographer | normal_user) configuration of:
  1. Credit packs (audience.credit_packs)
  2. Monthly subscription plans (photographer only)
  3. Post-subscription credit options (photographer only — two modes: packs OR per-credit rate)
  4. Theme prices (whole-theme rate)
  5. Design prices (per-design rate inside theme)
  6. Invitation option prices (per-feature rate, with "free" toggle)

Every priced row supports:
  - base_price          : integer rupees (for money rows) or integer credits (for credit-spend rows)
  - discount_enabled    : bool
  - discount_price      : optional integer (shown in UI as struck-through old + new)
  - is_free             : bool (only for option_prices) — when true the option is free for that audience

Collections:
  - pricing_credit_packs           (audience-aware)
  - pricing_subscription_plans     (photographer only)
  - pricing_post_sub_config        (photographer only, single doc)
  - pricing_theme_prices           (audience-aware, one per theme_id)
  - pricing_design_prices          (audience-aware, one per theme_id+design_key)
  - pricing_option_prices          (audience-aware, one per option_key)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pg_adapter import Database as AsyncIOMotorDatabase

from auth import require_super_admin
from design_catalog import (
    DESIGN_CATALOG,
    DESIGN_ID_TO_THEME,
    get_design_ids_for_theme,
)


# ---------------------------------------------------------------------------
# Canonical lists (locked — referenced by /catalog endpoint)
# ---------------------------------------------------------------------------
THEMES: List[Dict[str, str]] = [
    {"id": "royal_mughal", "name": "Royal Mughal"},
    {"id": "south_indian_temple", "name": "South Indian Temple"},
    {"id": "modern_minimal", "name": "Modern Minimal"},
    {"id": "beach_destination", "name": "Beach Destination"},
    {"id": "punjabi_sangeet", "name": "Punjabi Sangeet"},
    {"id": "bengali_traditional", "name": "Bengali Traditional"},
    {"id": "christian_elegant", "name": "Christian Elegant"},
    {"id": "muslim_nikah", "name": "Muslim Nikah"},
    {"id": "nature_eco_wedding", "name": "Nature / Eco Wedding"},
    {"id": "kerala_backwaters", "name": "Kerala Backwaters"},
]

INVITATION_OPTIONS: List[Dict[str, str]] = [
    {"key": "qr_code",            "label": "QR Code"},
    {"key": "rsvp_form",          "label": "RSVP Form"},
    {"key": "live_photo_wall",    "label": "Live Photo Wall"},
    {"key": "find_my_photos",     "label": "Find-My-Photos (AI Selfie Search)"},
    {"key": "music_player",       "label": "Background Music Player"},
    {"key": "countdown",          "label": "Save-the-Date Countdown"},
    {"key": "maps_directions",    "label": "Google Maps / Directions"},
    {"key": "gift_registry",      "label": "Gift Registry / Cash Gift"},
    {"key": "whatsapp_share",     "label": "WhatsApp Share Button"},
    {"key": "photo_gallery",      "label": "Post-Event Photo Gallery"},
    {"key": "calendar_add",       "label": "Calendar Add (.ics)"},
    {"key": "prewedding_story",   "label": "Pre-Wedding Story Slideshow"},
    {"key": "ai_photo_curation",  "label": "AI Photo Curation (Gemini Nano Banana auto-picks the best gallery shots)"},
    {"key": "guest_photo_upload", "label": "Guest Pre-event Photo Upload"},
]

# Default per-theme designs — superseded by design_catalog.DESIGN_CATALOG.
# Kept here for backward-compatibility with the legacy /catalog response.
DEFAULT_DESIGNS_PER_THEME: int = 18
DESIGN_KEYS = ["design_1", "design_2", "design_3", "design_4", "design_5", "design_6"]

Audience = Literal["photographer", "normal_user"]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class _Priced(BaseModel):
    """Common discount/free fields."""
    base_price: int = Field(..., ge=0)
    discount_enabled: bool = False
    discount_price: Optional[int] = Field(None, ge=0)


class CreditPack(_Priced):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    audience: Audience
    credits: int = Field(..., gt=0)
    label: Optional[str] = None  # e.g. "Starter", "Pro", "Studio"
    is_active: bool = True


class SubscriptionPlan(_Priced):
    """Photographer monthly subscription only."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Monthly Pro"
    credits_per_month: int = Field(..., gt=0)
    duration_days: int = 30
    is_active: bool = True


class PostSubConfig(BaseModel):
    """Photographer post-subscription pricing (single doc, _id='singleton')."""
    mode: Literal["packs", "per_credit"] = "per_credit"
    per_credit_rate: int = 4                 # rupees per 1 credit
    packs: List[CreditPack] = Field(default_factory=list)


class ThemePrice(_Priced):
    """Per-audience whole-theme credit cost."""
    audience: Audience
    theme_id: str
    # base_price here = CREDITS (not rupees)


class DesignPrice(_Priced):
    audience: Audience
    design_id: str
    # base_price = CREDITS


class OptionPrice(_Priced):
    audience: Audience
    option_key: str
    is_free: bool = False
    # base_price = CREDITS (ignored if is_free)


# Request payloads
class CreditPackUpsert(_Priced):
    id: Optional[str] = None
    audience: Audience
    credits: int = Field(..., gt=0)
    label: Optional[str] = None
    is_active: bool = True


class SubscriptionUpsert(_Priced):
    id: Optional[str] = None
    name: str
    credits_per_month: int = Field(..., gt=0)
    duration_days: int = 30
    is_active: bool = True


class ThemePriceUpsert(_Priced):
    audience: Audience
    theme_id: str


class DesignPriceUpsert(_Priced):
    audience: Audience
    design_id: str


class DesignBulkThemeUpsert(_Priced):
    """Apply the same price to every design within a single theme."""
    audience: Audience
    theme_id: str


class OptionPriceUpsert(_Priced):
    audience: Audience
    option_key: str
    is_free: bool = False


# ---------------------------------------------------------------------------
# Photographer Loyalty Tier configuration (single doc, _id='singleton')
# ---------------------------------------------------------------------------
class PhotographerTier(BaseModel):
    """A single loyalty tier.

    `discount_pct` applies to BOTH credit packs AND per-link publish costs.
    `bonus_pct` adds extra credits on every credit-pack purchase (e.g. 30%
    bonus credits on a 100-credit pack → photographer gets 130 credits).
    """
    key: Literal["starter", "pro", "elite", "partner"]
    label: str
    min_paid_links: int = Field(..., ge=0)
    discount_pct: int = Field(0, ge=0, le=100)
    bonus_pct: int = Field(0, ge=0, le=100)


DEFAULT_PHOTOGRAPHER_TIERS: List[PhotographerTier] = [
    PhotographerTier(key="starter", label="Starter",  min_paid_links=0,  discount_pct=0,  bonus_pct=0),
    PhotographerTier(key="pro",     label="Pro",      min_paid_links=2,  discount_pct=10, bonus_pct=10),
    PhotographerTier(key="elite",   label="Elite",    min_paid_links=5,  discount_pct=20, bonus_pct=20),
    PhotographerTier(key="partner", label="Partner",  min_paid_links=10, discount_pct=25, bonus_pct=30),
]


class PhotographerTierConfig(BaseModel):
    enabled: bool = True
    tiers: List[PhotographerTier] = Field(default_factory=lambda: list(DEFAULT_PHOTOGRAPHER_TIERS))


# ---------------------------------------------------------------------------
# Feature Packs — admin-controlled bundles (e.g. "All-Features Pack")
# ---------------------------------------------------------------------------
class FeaturePack(BaseModel):
    """A pre-priced bundle of invitation options.

    Photographers + normal users see these on the Publish step as an upsell:
    "You picked QR + RSVP + Gallery (12 credits). The All-Features Pack
    includes those + 5 more for 9 credits. Switch?".
    """
    id: Optional[str] = None
    audience: Audience
    name: str
    label: str
    feature_keys: List[str] = Field(default_factory=list)
    base_price: int = Field(0, ge=0)       # credits
    discount_enabled: bool = False
    discount_price: Optional[int] = Field(default=None, ge=0)
    is_active: bool = True


class FeaturePackUpsert(FeaturePack):
    id: Optional[str] = None


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
def _pricing_retired():
    # ponytail: credits retired (owner pivot). This entire legacy console
    # wrote CREDITS-denominated prices (a live mis-pricing hazard once other
    # surfaces read those rows as INR) - 410 the whole router, reads and
    # writes alike, rather than picking through 20+ routes one by one. Real
    # pricing now lives under /admin/pricing (INR). Runs before any route
    # handler / DB write since it's a router-level dependency.
    # Inlined rather than imported from the deleted credit_service: this
    # router is retired BECAUSE it priced in credits, so it should not
    # depend on a credit module to say so.
    raise HTTPException(
        status_code=410,
        detail={"code": "CREDITS_RETIRED",
                "message": "Legacy credits pricing surface retired - use /admin/pricing (INR)"},
    )


router = APIRouter(
    prefix="/api/super-admin/pricing",
    tags=["Super Admin · Pricing"],
    dependencies=[Depends(_pricing_retired)],
)


def _db_dep():
    """Lazy DB accessor — set by main server during include_router wiring."""
    raise RuntimeError("DB not wired. Call attach(router, db_instance) at startup.")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _strip_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    if doc and "_id" in doc:
        doc = {**doc, "_id": str(doc["_id"])}
        del doc["_id"]
    return doc


# Module-level DB holder — set via attach()
_DB: Optional[AsyncIOMotorDatabase] = None


def attach(db: AsyncIOMotorDatabase) -> APIRouter:
    """Wire the DB instance and return the router (to be included in main app)."""
    global _DB
    _DB = db
    return router


def db() -> AsyncIOMotorDatabase:
    if _DB is None:
        raise RuntimeError("Pricing module DB not attached")
    return _DB


# ---------------------------------------------------------------------------
# 0. CATALOG — themes + options (read-only)
# ---------------------------------------------------------------------------
@router.get("/catalog")
async def get_catalog(_: str = Depends(require_super_admin)):
    return {
        "themes": THEMES,
        "options": INVITATION_OPTIONS,
        "design_keys": DESIGN_KEYS,
    }


# ---------------------------------------------------------------------------
# 1. CREDIT PACKS (audience-aware)
# ---------------------------------------------------------------------------
@router.get("/subscriptions")
async def list_subscriptions(_: str = Depends(require_super_admin)):
    cursor = db().pricing_subscription_plans.find({}).sort("credits_per_month", 1)
    return [_strip_id(d) async for d in cursor]


@router.post("/subscriptions")
async def upsert_subscription(payload: SubscriptionUpsert, _: str = Depends(require_super_admin)):
    doc = payload.model_dump()
    if not doc.get("id"):
        doc["id"] = str(uuid.uuid4())
    doc["updated_at"] = _now()
    await db().pricing_subscription_plans.update_one(
        {"id": doc["id"]}, {"$set": doc, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    saved = await db().pricing_subscription_plans.find_one({"id": doc["id"]})
    return _strip_id(saved)


@router.delete("/subscriptions/{plan_id}")
async def delete_subscription(plan_id: str, _: str = Depends(require_super_admin)):
    result = await db().pricing_subscription_plans.delete_one({"id": plan_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# 3. POST-SUBSCRIPTION CONFIG (photographer only, singleton)
# ---------------------------------------------------------------------------
@router.get("/post-sub")
async def get_post_sub(_: str = Depends(require_super_admin)):
    doc = await db().pricing_post_sub_config.find_one({"_id": "singleton"})
    if not doc:
        return PostSubConfig().model_dump()
    doc.pop("_id", None)
    return doc


@router.put("/post-sub")
async def put_post_sub(payload: PostSubConfig, _: str = Depends(require_super_admin)):
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    await db().pricing_post_sub_config.update_one(
        {"_id": "singleton"}, {"$set": doc, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return doc


# ---------------------------------------------------------------------------
# 4. THEME PRICES (audience-aware)
# ---------------------------------------------------------------------------
@router.get("/themes")
async def list_theme_prices(audience: Audience, _: str = Depends(require_super_admin)):
    cursor = db().pricing_theme_prices.find({"audience": audience})
    existing = {d["theme_id"]: _strip_id(d) async for d in cursor}
    # Always return one row per theme, filling defaults for missing ones
    out = []
    for t in THEMES:
        row = existing.get(t["id"]) or {
            "audience": audience,
            "theme_id": t["id"],
            "base_price": 8 if audience == "photographer" else 12,
            "discount_enabled": False,
            "discount_price": None,
        }
        row["theme_name"] = t["name"]
        out.append(row)
    return out


@router.post("/themes")
async def upsert_theme_price(payload: ThemePriceUpsert, _: str = Depends(require_super_admin)):
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    await db().pricing_theme_prices.update_one(
        {"audience": doc["audience"], "theme_id": doc["theme_id"]},
        {"$set": doc, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    saved = await db().pricing_theme_prices.find_one(
        {"audience": doc["audience"], "theme_id": doc["theme_id"]}
    )
    return _strip_id(saved)


# ---------------------------------------------------------------------------
# 5. DESIGN PRICES (audience + exact design_id)
#
# Each frontend design (e.g. "mughal_engagement_1") gets its own row in
# `pricing_design_prices`.  If the super-admin has never set a price for a
# specific design the user is charged 0 credits (Free).
# ---------------------------------------------------------------------------
@router.get("/designs/catalog")
async def design_catalog(_: str = Depends(require_super_admin)):
    """Read-only mirror of the frontend design catalog. Used by the Pricing Hub
    to know what designs exist per theme."""
    return {
        "themes": [
            {
                "theme_id": t["id"],
                "theme_name": t["name"],
                "designs": DESIGN_CATALOG.get(t["id"], []),
            }
            for t in THEMES
        ],
    }


@router.get("/designs")
async def list_design_prices(
    audience: Audience,
    theme_id: Optional[str] = None,
    _: str = Depends(require_super_admin),
):
    """Return one row per design.  When `theme_id` is omitted every design in
    every theme is returned.  Designs without a stored price default to 0
    credits (Free)."""
    q: Dict[str, Any] = {"audience": audience}
    if theme_id:
        q["design_id"] = {"$in": get_design_ids_for_theme(theme_id)}
    cursor = db().pricing_design_prices.find(q)
    existing: Dict[str, Dict[str, Any]] = {}
    async for d in cursor:
        existing[d["design_id"]] = _strip_id(d)

    theme_ids = [theme_id] if theme_id else [t["id"] for t in THEMES]
    out: List[Dict[str, Any]] = []
    for tid in theme_ids:
        for entry in DESIGN_CATALOG.get(tid, []):
            did = entry["design_id"]
            row = existing.get(did) or {
                "audience": audience,
                "design_id": did,
                "base_price": 0,  # Free by default
                "discount_enabled": False,
                "discount_price": None,
            }
            # Decorate for UI rendering
            row["theme_id"] = tid
            row["label"] = entry.get("label")
            row["event"] = entry.get("event")
            row["event_label"] = entry.get("event_label")
            row["variant"] = entry.get("variant")
            out.append(row)
    return out


@router.post("/designs")
async def upsert_design_price(payload: DesignPriceUpsert, _: str = Depends(require_super_admin)):
    if payload.design_id not in DESIGN_ID_TO_THEME:
        raise HTTPException(status_code=400, detail=f"Unknown design_id: {payload.design_id}")
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    await db().pricing_design_prices.update_one(
        {"audience": doc["audience"], "design_id": doc["design_id"]},
        {"$set": doc, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    saved = await db().pricing_design_prices.find_one({
        "audience": doc["audience"], "design_id": doc["design_id"],
    })
    return _strip_id(saved)


@router.post("/designs/bulk-theme")
async def bulk_apply_theme_design_price(
    payload: DesignBulkThemeUpsert,
    _: str = Depends(require_super_admin),
):
    """Apply the same base/discount price to every design within a theme.
    Returns the count of designs updated."""
    design_ids = get_design_ids_for_theme(payload.theme_id)
    if not design_ids:
        raise HTTPException(status_code=400, detail=f"No designs found for theme_id={payload.theme_id}")
    ts = _now()
    ops: List[Dict[str, Any]] = []
    for did in design_ids:
        ops.append({
            "audience": payload.audience,
            "design_id": did,
            "base_price": payload.base_price,
            "discount_enabled": payload.discount_enabled,
            "discount_price": payload.discount_price,
            "updated_at": ts,
        })
    # Use individual upserts (no bulk transactions in motor without session handling)
    for d in ops:
        await db().pricing_design_prices.update_one(
            {"audience": d["audience"], "design_id": d["design_id"]},
            {"$set": d, "$setOnInsert": {"created_at": ts}},
            upsert=True,
        )
    return {"ok": True, "updated": len(ops), "theme_id": payload.theme_id}


# ---------------------------------------------------------------------------
# 6. OPTION PRICES (audience + option_key)
# ---------------------------------------------------------------------------
@router.get("/options")
async def list_option_prices(audience: Audience, _: str = Depends(require_super_admin)):
    cursor = db().pricing_option_prices.find({"audience": audience})
    existing = {d["option_key"]: _strip_id(d) async for d in cursor}
    out = []
    for o in INVITATION_OPTIONS:
        row = existing.get(o["key"]) or {
            "audience": audience, "option_key": o["key"],
            "base_price": 3 if audience == "photographer" else 5,
            "is_free": False,
            "discount_enabled": False, "discount_price": None,
        }
        row["label"] = o["label"]
        out.append(row)
    return out


@router.post("/options")
async def upsert_option_price(payload: OptionPriceUpsert, _: str = Depends(require_super_admin)):
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    await db().pricing_option_prices.update_one(
        {"audience": doc["audience"], "option_key": doc["option_key"]},
        {"$set": doc, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    saved = await db().pricing_option_prices.find_one({
        "audience": doc["audience"], "option_key": doc["option_key"]
    })
    return _strip_id(saved)


# ---------------------------------------------------------------------------
# 7. PHOTOGRAPHER LOYALTY TIERS (super-admin only; single doc)
# ---------------------------------------------------------------------------
async def _load_tier_config() -> PhotographerTierConfig:
    """Read the singleton doc; seed defaults on first access."""
    doc = await db().pricing_photographer_tiers.find_one({"_id": "singleton"})
    if not doc:
        cfg = PhotographerTierConfig()
        await db().pricing_photographer_tiers.update_one(
            {"_id": "singleton"},
            {"$set": {**cfg.model_dump(), "updated_at": _now(), "created_at": _now()}},
            upsert=True,
        )
        return cfg
    # Drop mongo _id before validation
    safe = {k: v for k, v in doc.items() if k != "_id" and k not in ("updated_at", "created_at")}
    try:
        return PhotographerTierConfig(**safe)
    except Exception:
        return PhotographerTierConfig()


@router.get("/photographer-tiers")
async def get_photographer_tiers(_: str = Depends(require_super_admin)):
    cfg = await _load_tier_config()
    return cfg.model_dump()


# ---------------------------------------------------------------------------
# 8. FEATURE PACKS (admin CRUD; surfaces via /api/public/pricing/effective)
# ---------------------------------------------------------------------------
def _strip_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Helper — drops Mongo's `_id` (returns a copy)."""
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/feature-packs")
async def list_feature_packs(
    audience: Optional[Audience] = None,
    _: str = Depends(require_super_admin),
):
    """List every feature pack, optionally filtered by audience."""
    q: Dict[str, Any] = {}
    if audience:
        q["audience"] = audience
    cur = db().pricing_feature_packs.find(q).sort("base_price", 1)
    items = []
    async for d in cur:
        items.append(_strip_id(d))
    return {"items": items}


@router.post("/feature-packs")
async def create_feature_pack(payload: FeaturePackUpsert, _: str = Depends(require_super_admin)):
    """Create a new feature pack."""
    doc = payload.model_dump()
    doc["id"] = doc.get("id") or f"fpk_{uuid.uuid4().hex[:14]}"
    doc["created_at"] = _now()
    doc["updated_at"] = _now()
    await db().pricing_feature_packs.insert_one(doc)
    return _strip_id(doc)


@router.put("/feature-packs/{pack_id}")
async def update_feature_pack(
    pack_id: str,
    payload: FeaturePackUpsert,
    _: str = Depends(require_super_admin),
):
    doc = payload.model_dump()
    doc["updated_at"] = _now()
    # Don't let the caller change the id
    doc.pop("id", None)
    result = await db().pricing_feature_packs.find_one_and_update(
        {"id": pack_id},
        {"$set": doc},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Feature pack not found")
    return _strip_id(result)


@router.delete("/feature-packs/{pack_id}")
async def delete_feature_pack(pack_id: str, _: str = Depends(require_super_admin)):
    res = await db().pricing_feature_packs.delete_one({"id": pack_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Feature pack not found")
    return {"deleted": pack_id}


@router.put("/photographer-tiers")
async def update_photographer_tiers(
    payload: PhotographerTierConfig,
    _: str = Depends(require_super_admin),
):
    """Replace the full tier configuration. Must include all 4 tier keys."""
    keys = {t.key for t in payload.tiers}
    required = {"starter", "pro", "elite", "partner"}
    if keys != required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Must contain exactly these tier keys: {sorted(required)}",
        )
    # Sort by min_paid_links so resolve_tier() can iterate ascending.
    tiers_sorted = sorted(payload.tiers, key=lambda t: t.min_paid_links)
    cfg = PhotographerTierConfig(enabled=payload.enabled, tiers=tiers_sorted)
    await db().pricing_photographer_tiers.update_one(
        {"_id": "singleton"},
        {"$set": {**cfg.model_dump(), "updated_at": _now()}, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return cfg.model_dump()


# Helpers exported to the rest of the backend ------------------------------
def resolve_tier(paid_links_count: int, tiers: List[PhotographerTier]) -> PhotographerTier:
    """Given the photographer's paid-links count, return the highest tier
    they qualify for. Tiers are expected to be sorted ascending by
    `min_paid_links` (PUT endpoint enforces this).
    """
    eligible = [t for t in tiers if paid_links_count >= t.min_paid_links]
    return eligible[-1] if eligible else tiers[0]


async def get_photographer_tier_for(paid_links_count: int) -> Dict[str, Any]:
    """Async convenience used by other modules / endpoints."""
    cfg = await _load_tier_config()
    if not cfg.enabled:
        # Falls back to "no discounts" tier
        zero = PhotographerTier(key="starter", label="Starter", min_paid_links=0, discount_pct=0, bonus_pct=0)
        return {"tier": zero.model_dump(), "all_tiers": [t.model_dump() for t in cfg.tiers], "enabled": False, "paid_links_count": paid_links_count}
    current = resolve_tier(paid_links_count, cfg.tiers)
    return {
        "tier": current.model_dump(),
        "all_tiers": [t.model_dump() for t in cfg.tiers],
        "enabled": True,
        "paid_links_count": paid_links_count,
    }


# ---------------------------------------------------------------------------
# Public read endpoint — for the photographer / user UI to display final prices
# (no auth needed; only returns the effective rate after discount/free logic)
# ---------------------------------------------------------------------------
def _effective(row: Dict[str, Any]) -> int:
    if row.get("is_free"):
        return 0
    if row.get("discount_enabled") and isinstance(row.get("discount_price"), int):
        return row["discount_price"]
    return int(row.get("base_price", 0))


public_router = APIRouter(prefix="/api/public/pricing", tags=["Public · Pricing"])


# Photographer-authenticated route — returns the photographer's own tier
# along with the full ladder so the panel can show progress to next tier.
from auth import get_current_admin  # local import to avoid circular  # noqa: E402

photographer_tier_router = APIRouter(prefix="/api/photographer", tags=["Photographer · Tier"])


@photographer_tier_router.get("/me/tier")
async def my_tier(admin_id: str = Depends(get_current_admin)):
    """Resolve this photographer's loyalty tier from `paid_links_count`.

    Writer (since 2026-08-17): store_features.deliver — each order's first
    transition to build_status="delivered" increments the buyer's
    paid_links_count once (tier_counted CAS on the order row). The old writer
    was the credit-priced publish path, deleted along with credits, which left
    the counter frozen at the first tier for every studio in between.
    """
    admin = await db().admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    paid_links = int(admin.get("paid_links_count", 0) or 0)
    result = await get_photographer_tier_for(paid_links)
    # Decorate with "next tier" preview
    current_idx = next((i for i, t in enumerate(result["all_tiers"]) if t["key"] == result["tier"]["key"]), 0)
    next_tier = result["all_tiers"][current_idx + 1] if current_idx + 1 < len(result["all_tiers"]) else None
    result["next_tier"] = next_tier
    result["links_to_next"] = max(0, (next_tier["min_paid_links"] - paid_links)) if next_tier else 0
    return result


@photographer_tier_router.get("/me/tier-history")
async def my_tier_history(admin_id: str = Depends(get_current_admin)):
    """Return every credit_ledger entry that mentions a tier — i.e. paid
    publishes that incremented `paid_links_count` AND credit-pack purchases
    that granted bonus credits. Used by the dashboard's "Tier history" widget."""
    admin = await db().admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

    cfg = await _load_tier_config()
    tiers_sorted = sorted(cfg.tiers, key=lambda t: t.min_paid_links)

    cursor = db().credit_ledger.find({"admin_id": admin_id}).sort("created_at", -1).limit(200)
    entries = []
    async for d in cursor:
        meta = d.get("metadata") or {}
        # Include the entry if it's either a paid publish (DEBIT for wedding)
        # or a Razorpay purchase that granted bonus credits.
        is_publish = bool(d.get("wedding_id")) or (meta.get("action") == "publish")
        is_purchase_bonus = bool(meta.get("bonus_credits"))
        if not (is_publish or is_purchase_bonus):
            continue
        entries.append({
            "id": d.get("id") or str(d.get("_id")),
            "kind": "publish" if is_publish else "purchase",
            "amount": int(d.get("amount", 0)),
            "reason": d.get("reason", ""),
            "created_at": d.get("created_at"),
            "tier_key": meta.get("tier_key"),
            "bonus_credits": int(meta.get("bonus_credits", 0) or 0),
        })

    # Build the climb timeline — at every publish-count threshold, when did
    # the photographer first cross it?
    publish_events = [e for e in entries if e["kind"] == "publish"]
    publish_events.reverse()  # oldest first
    climb = []
    counter = 0
    for ev in publish_events:
        counter += 1
        # Did this publish unlock a new tier?
        for t in tiers_sorted:
            if t.min_paid_links == counter:
                climb.append({
                    "tier": t.model_dump(),
                    "unlocked_at": ev["created_at"],
                    "ledger_id": ev["id"],
                })
                break

    return {
        "paid_links_count": int(admin.get("paid_links_count", 0) or 0),
        "current_tier": (await get_photographer_tier_for(int(admin.get("paid_links_count", 0) or 0)))["tier"],
        "climb": climb,
        "entries": entries[:60],   # cap UI list
    }



@public_router.get("/effective")
async def effective_prices(audience: Audience):
    """Effective prices for the current audience. No auth.

    Returns a single payload that every consumer surface (LandingPage,
    photographer LuxuryProfileForm, PurchaseOptionsWizard, ThemeShowroom,
    EventDesignPicker, etc.) can read from. Whenever a super-admin updates
    a row in the Pricing Hub, this endpoint reflects it immediately.
    """
    themes_cur = db().pricing_theme_prices.find({"audience": audience})
    themes = {d["theme_id"]: _effective(d) async for d in themes_cur}

    designs_cur = db().pricing_design_prices.find({"audience": audience})
    designs: Dict[str, int] = {}
    async for d in designs_cur:
        did = d.get("design_id")
        if did:
            designs[did] = _effective(d)

    options_cur = db().pricing_option_prices.find({"audience": audience})
    options = {d["option_key"]: {
        "credits": _effective(d), "is_free": bool(d.get("is_free")),
    } async for d in options_cur}

    packs_cur = db().pricing_credit_packs.find({"audience": audience, "is_active": True}).sort("credits", 1)
    packs = []
    async for d in packs_cur:
        packs.append({
            "id": d.get("id"),
            "credits": d["credits"],
            "price": _effective(d),
            "base_price": d["base_price"],
            "discount_enabled": bool(d.get("discount_enabled")),
            "discount_price": d.get("discount_price"),
            "label": d.get("label"),
        })

    plans: List[Dict[str, Any]] = []
    post_sub: Optional[Dict[str, Any]] = None
    photographer_tiers: Optional[Dict[str, Any]] = None
    if audience == "photographer":
        plans_cur = db().pricing_subscription_plans.find({"is_active": True})
        async for d in plans_cur:
            plans.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "credits_per_month": d.get("credits_per_month"),
                "duration_days": d.get("duration_days", 30),
                "price": _effective(d),
                "base_price": d.get("base_price"),
                "discount_enabled": bool(d.get("discount_enabled")),
                "discount_price": d.get("discount_price"),
            })
        post_sub_doc = await db().pricing_post_sub_config.find_one({"_id": "singleton"})
        if post_sub_doc:
            post_sub = {
                "mode": post_sub_doc.get("mode", "per_credit"),
                "per_credit_rate": post_sub_doc.get("per_credit_rate", 4),
                "packs": post_sub_doc.get("packs", []),
            }
        # Photographer loyalty tier config — exposed publicly so the
        # photographer panel can show "next tier in X links" UI.
        cfg = await _load_tier_config()
        photographer_tiers = {
            "enabled": cfg.enabled,
            "tiers": [t.model_dump() for t in cfg.tiers],
        }

    return {
        "audience": audience,
        "themes": themes,
        "designs": designs,
        "options": options,
        "packs": packs,
        "plans": plans,
        "post_sub": post_sub,
        "photographer_tiers": photographer_tiers,
        "feature_packs": await _public_feature_packs(audience),
    }


async def _public_feature_packs(audience: Audience) -> List[Dict[str, Any]]:
    """Public-shaped feature packs for the given audience."""
    out: List[Dict[str, Any]] = []
    cur = db().pricing_feature_packs.find({"audience": audience, "is_active": True}).sort("base_price", 1)
    async for d in cur:
        effective = int(d.get("discount_price")) if d.get("discount_enabled") and d.get("discount_price") is not None else int(d.get("base_price", 0))
        out.append({
            "id": d.get("id"),
            "name": d.get("name"),
            "label": d.get("label"),
            "feature_keys": list(d.get("feature_keys") or []),
            "price": effective,
            "base_price": int(d.get("base_price", 0)),
            "discount_enabled": bool(d.get("discount_enabled")),
            "discount_price": d.get("discount_price"),
        })
    return out
