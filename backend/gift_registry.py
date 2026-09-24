"""
MAJA Invites — GIFT REGISTRY MODULE
=====================================
Couple can toggle gifts on/off. When enabled, guests see:
  - A short personalised message ("Your presence is the only gift...")
  - Curated gift suggestions (custom items + smart presets)
  - Optional payment handles (UPI / bank / online registry links)

Endpoints:
  GET  /api/admin/profiles/{profile_id}/gifts        — fetch
  PUT  /api/admin/profiles/{profile_id}/gifts        — upsert
  GET  /api/invite/{slug}/gifts                      — public view (only if enabled)
  GET  /api/gifts/presets                            — built-in idea library

Storage: `gift_registry` collection, one doc per profile_id.
"""
from typing import Optional, List
from datetime import datetime, timezone
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)


# ============================================================
#  Built-in gift idea library (smart presets)
# ============================================================
DEFAULT_PRESETS: List[dict] = [
    {"id": "preset-blessing",  "title": "Your blessings",
     "description": "Your presence and warm wishes mean the world to us.",
     "category": "blessing",   "icon": "🙏", "price_hint": "Priceless"},
    {"id": "preset-shagun",    "title": "Digital Shagun",
     "description": "A traditional shagun via UPI — any amount, any time.",
     "category": "money",      "icon": "💝", "price_hint": "Any amount"},
    {"id": "preset-cash",      "title": "Cash envelope",
     "description": "Old-school cash envelope handed in person at the venue.",
     "category": "money",      "icon": "💌", "price_hint": "Any amount"},
    {"id": "preset-home",      "title": "Home essentials",
     "description": "Kitchenware, linens, decor, small appliances for the new home.",
     "category": "home",       "icon": "🏠", "price_hint": "₹500 – ₹5,000"},
    {"id": "preset-experience","title": "Experience gift",
     "description": "Dinner voucher, spa, weekend getaway — a memory to share.",
     "category": "experience", "icon": "🎁", "price_hint": "₹2,000 – ₹15,000"},
    {"id": "preset-jewellery", "title": "Gold / silver coin",
     "description": "A symbolic gold or silver coin — auspicious & lasting.",
     "category": "jewellery",  "icon": "🪙", "price_hint": "₹1,000 – ₹25,000"},
    {"id": "preset-charity",   "title": "Donate in our name",
     "description": "Donate to a cause we care about instead of a physical gift.",
     "category": "charity",    "icon": "💞", "price_hint": "Any amount"},
    {"id": "preset-pooja",     "title": "Pooja samagri / silver diya",
     "description": "Traditional pooja items, silver diya, idol for the new home.",
     "category": "traditional","icon": "🪔", "price_hint": "₹500 – ₹10,000"},
]


# ============================================================
#  Pydantic models
# ============================================================
class GiftSuggestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=400)
    category: Optional[str] = "custom"   # blessing|money|home|experience|jewellery|charity|traditional|registry|custom
    icon: Optional[str] = "🎁"
    price_hint: Optional[str] = None
    link: Optional[str] = None           # external link (registry, Amazon wishlist, etc.)
    image_url: Optional[str] = None
    order: int = 0


class GiftRegistry(BaseModel):
    profile_id: str
    enabled: bool = False
    show_disabled_note: bool = True
    headline: str = "With love, not gifts"
    message: str = ("Your presence at our wedding is the most precious gift we could ask for. "
                    "If you still wish to bless us, here are a few thoughtful ideas.")
    accept_upi: bool = False
    upi_id: Optional[str] = Field(default=None, max_length=100)
    upi_name: Optional[str] = Field(default=None, max_length=100)
    accept_bank: bool = False
    bank_account_name: Optional[str] = Field(default=None, max_length=100)
    bank_account_number: Optional[str] = Field(default=None, max_length=100)
    bank_ifsc: Optional[str] = Field(default=None, max_length=100)
    bank_name: Optional[str] = Field(default=None, max_length=100)
    accept_external_registry: bool = False
    external_registry_url: Optional[str] = Field(default=None, max_length=500)
    external_registry_label: Optional[str] = Field(default="View our wishlist", max_length=100)
    suggestions: List[GiftSuggestion] = Field(default_factory=list)
    updated_at: Optional[str] = None

    @field_validator("headline")
    def _validate_headline(cls, v):
        if v and len(v) > 80:
            raise ValueError("headline must be 80 characters or less")
        return v

    @field_validator("message")
    def _validate_message(cls, v):
        if v and len(v) > 500:
            raise ValueError("message must be 500 characters or less")
        return v

    @field_validator("suggestions")
    def _validate_suggestions(cls, v):
        if v and len(v) > 20:
            raise ValueError("Maximum 20 gift suggestions allowed")
        return v


class GiftRegistryUpdate(BaseModel):
    enabled: Optional[bool] = None
    show_disabled_note: Optional[bool] = None
    headline: Optional[str] = None
    message: Optional[str] = None
    accept_upi: Optional[bool] = None
    upi_id: Optional[str] = Field(default=None, max_length=100)
    upi_name: Optional[str] = Field(default=None, max_length=100)
    accept_bank: Optional[bool] = None
    bank_account_name: Optional[str] = Field(default=None, max_length=100)
    bank_account_number: Optional[str] = Field(default=None, max_length=100)
    bank_ifsc: Optional[str] = Field(default=None, max_length=100)
    bank_name: Optional[str] = Field(default=None, max_length=100)
    accept_external_registry: Optional[bool] = None
    external_registry_url: Optional[str] = Field(default=None, max_length=500)
    external_registry_label: Optional[str] = Field(default=None, max_length=100)
    suggestions: Optional[List[GiftSuggestion]] = None


# ============================================================
#  Router builder
# ============================================================
def build_gift_router(db, get_current_admin):
    router = APIRouter(prefix="/api", tags=["gifts"])

    async def _find_profile(profile_id_or_slug: str):
        return await db.profiles.find_one(
            {"$or": [{"id": profile_id_or_slug}, {"slug": profile_id_or_slug}]},
            {"_id": 0},
        )

    async def _require_owned_profile(profile_id_or_slug: str, admin_id: str) -> dict:
        """Object-level authorization (same pattern as gallery_privacy /
        gallery_features._require_owned_profile). Without this, any
        authenticated photographer could read/overwrite another studio's
        bank/UPI gift details."""
        profile = await _find_profile(profile_id_or_slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        owner = profile.get("admin_id")
        if owner:
            if owner == admin_id:
                return profile
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
            if admin and admin.get("role") == "super_admin":
                return profile
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
        logger.warning("profile %s has no admin_id; ownership not enforced", profile.get("id"))
        return profile

    async def _load_or_default(profile_id: str) -> dict:
        doc = await db.gift_registry.find_one({"profile_id": profile_id}, {"_id": 0})
        if doc:
            return doc
        default = GiftRegistry(profile_id=profile_id).model_dump()
        default["updated_at"] = datetime.now(timezone.utc).isoformat()
        return default

    # ----------------------------------------------------------------
    # Built-in idea library
    # ----------------------------------------------------------------
    @router.get("/gifts/presets")
    async def get_gift_presets():
        return {"presets": DEFAULT_PRESETS, "total": len(DEFAULT_PRESETS)}

    # ----------------------------------------------------------------
    # Admin — fetch
    # ----------------------------------------------------------------
    @router.get("/admin/profiles/{profile_id}/gifts")
    async def admin_get_gifts(profile_id: str,
                              admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        data = await _load_or_default(profile["id"])
        return data

    # ----------------------------------------------------------------
    # Admin — upsert
    # ----------------------------------------------------------------
    @router.put("/admin/profiles/{profile_id}/gifts")
    async def admin_upsert_gifts(profile_id: str,
                                  payload: GiftRegistryUpdate,
                                  admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)

        existing = await db.gift_registry.find_one(
            {"profile_id": profile["id"]}, {"_id": 0})
        if existing:
            merged = {**existing}
        else:
            merged = GiftRegistry(profile_id=profile["id"]).model_dump()

        patch = payload.model_dump(exclude_none=True)
        # Re-validate suggestions to ensure ids
        if "suggestions" in patch:
            import re as _re
            _UUID_RE = _re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", _re.I)
            cleaned = []
            for s in patch["suggestions"]:
                # Strip non-UUID ids (e.g. UI temp ids like tmp-1731580000) so we regenerate
                if isinstance(s, dict) and s.get("id") and not _UUID_RE.match(str(s["id"])):
                    s = {k: v for k, v in s.items() if k != "id"}
                gs = GiftSuggestion(**s) if not isinstance(s, GiftSuggestion) else s
                if not isinstance(gs, GiftSuggestion):
                    gs = GiftSuggestion(**gs)
                cleaned.append(gs.model_dump() if hasattr(gs, "model_dump") else gs)
            patch["suggestions"] = cleaned

        merged.update(patch)
        merged["profile_id"] = profile["id"]
        merged["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Validate end-state
        try:
            validated = GiftRegistry(**merged).model_dump()
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        validated["updated_at"] = merged["updated_at"]

        await db.gift_registry.update_one(
            {"profile_id": profile["id"]},
            {"$set": validated},
            upsert=True,
        )
        return validated

    # ----------------------------------------------------------------
    # Public — guest view (only if enabled)
    # ----------------------------------------------------------------
    @router.get("/invite/{slug}/gifts")
    async def public_gifts(slug: str):
        profile = await _find_profile(slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        doc = await db.gift_registry.find_one(
            {"profile_id": profile["id"]}, {"_id": 0})

        if not doc or not doc.get("enabled"):
            # Return disabled state — frontend can choose to render a polite note
            return {
                "enabled": False,
                "show_disabled_note": (doc or {}).get("show_disabled_note", True),
                "headline": "No gifts, please",
                "message": ("The couple kindly requests no gifts — "
                            "your presence and blessings mean everything."),
            }

        # Sanitise — never leak full bank account numbers (mask middle digits)
        bank_acc = doc.get("bank_account_number") or ""
        if bank_acc and len(bank_acc) > 4:
            bank_acc_masked = "•" * (len(bank_acc) - 4) + bank_acc[-4:]
        else:
            bank_acc_masked = bank_acc

        return {
            "enabled": True,
            "headline": doc.get("headline") or "With love, not gifts",
            "message": doc.get("message") or "",
            "accept_upi": bool(doc.get("accept_upi") and doc.get("upi_id")),
            "upi_id": doc.get("upi_id") if doc.get("accept_upi") else None,
            "upi_name": doc.get("upi_name") if doc.get("accept_upi") else None,
            "accept_bank": bool(doc.get("accept_bank") and doc.get("bank_account_number")),
            "bank_account_name": doc.get("bank_account_name") if doc.get("accept_bank") else None,
            "bank_account_number_masked": bank_acc_masked if doc.get("accept_bank") else None,
            "bank_ifsc": doc.get("bank_ifsc") if doc.get("accept_bank") else None,
            "bank_name": doc.get("bank_name") if doc.get("accept_bank") else None,
            "accept_external_registry": bool(doc.get("accept_external_registry")
                                              and doc.get("external_registry_url")),
            "external_registry_url": doc.get("external_registry_url") if doc.get("accept_external_registry") else None,
            "external_registry_label": doc.get("external_registry_label") or "View our wishlist",
            "suggestions": sorted(doc.get("suggestions") or [],
                                  key=lambda s: s.get("order", 0)),
        }

    return router
