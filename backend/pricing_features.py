"""
PRICING & DISCOUNTS — Phase Feb 2026
=====================================

Three new capabilities, packaged in one module so super-admin pricing
controls live in one place:

  • theme_bundle_pricing  — "buy ALL temple-theme designs for X credits"
  • design_pricing.inr_price — add an INR price to per-design pricing
    so normal users see ₹999 instead of just "3 credits"
  • discount_codes — coupon system applied at Razorpay create-order time

Mongo collections
------------------
  theme_bundle_pricing  { id, theme_id, credits, inr_price, label,
                          is_active, updated_by, updated_at }
  discount_codes        { id, code, kind ("percent"|"flat"), value,
                          applies_to ("design"|"theme"|"all"),
                          target_id?, max_uses, used_count, expires_at,
                          is_active, created_by, created_at }
  discount_redemptions  { id, code_id, code, user_id, kind,
                          original_inr, discount_inr, final_inr,
                          target?, created_at }

Endpoints mounted under /api:
  Super-admin:
    GET/POST   /api/super-admin/theme-bundle-pricing
    PUT/DEL    /api/super-admin/theme-bundle-pricing/{theme_id}

    GET/POST   /api/super-admin/discount-codes
    PUT/DEL    /api/super-admin/discount-codes/{code_id}

  Public:
    GET        /api/public/theme-bundle-pricing
    POST       /api/public/discount/validate     {code, kind, target_id?, amount_inr}
"""
from __future__ import annotations
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("pricing")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: Optional[dict]) -> Optional[dict]:
    if d is not None:
        d.pop("_id", None)
    return d


# ─────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────
class ThemeBundlePricingUpsert(BaseModel):
    """`credits` used to be REQUIRED here. Credits are deleted, so the only way
    to write a bundle price was to supply a number in a currency nobody can pay
    in — and the public reader already refuses to return it. Dropped: existing
    rows keep the stored column, new writes simply do not set it."""
    theme_id: str = Field(min_length=1, max_length=64)
    inr_price: int = Field(ge=0)
    label: Optional[str] = None
    is_active: bool = True


class DiscountCodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=24)
    kind: str  # "percent" | "flat"
    value: int = Field(ge=0)
    applies_to: str = "all"  # "design" | "theme" | "all"
    target_id: Optional[str] = None
    max_uses: int = Field(default=0, ge=0)  # 0 = unlimited
    expires_at: Optional[str] = None
    is_active: bool = True

    @field_validator("kind")
    def _k(cls, v):
        if v not in ("percent", "flat"):
            raise ValueError("kind must be 'percent' or 'flat'")
        return v

    @field_validator("applies_to")
    def _a(cls, v):
        if v not in ("design", "theme", "all"):
            raise ValueError("applies_to must be 'design', 'theme', or 'all'")
        return v

    @field_validator("value")
    def _v(cls, v, info):
        if info.data.get("kind") == "percent" and v > 100:
            raise ValueError("percent value cannot exceed 100")
        return v


class DiscountCodeUpdate(BaseModel):
    kind: Optional[str] = None
    value: Optional[int] = None
    applies_to: Optional[str] = None
    target_id: Optional[str] = None
    max_uses: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None


class DiscountValidateRequest(BaseModel):
    code: str
    amount_inr: int = Field(ge=1)
    applies_to: Optional[str] = None  # "design" | "theme" | "all"
    target_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────
# Router builder
# ─────────────────────────────────────────────────────────────────────
def build_pricing_router(db, require_super_admin, get_current_public_user):
    router = APIRouter(tags=["pricing-discounts"])

    # ============================================================
    #   THEME BUNDLE PRICING — super-admin CRUD
    # ============================================================
    @router.get("/api/super-admin/theme-bundle-pricing")
    async def list_theme_bundles(super_admin_id: str = Depends(require_super_admin)):
        cursor = db.theme_bundle_pricing.find({}, {"_id": 0}).sort("theme_id", 1)
        return {"bundles": [doc async for doc in cursor]}

    @router.post("/api/super-admin/theme-bundle-pricing")
    async def upsert_theme_bundle(
        payload: ThemeBundlePricingUpsert,
        super_admin_id: str = Depends(require_super_admin),
    ):
        update = payload.model_dump()
        update["updated_by"] = super_admin_id
        update["updated_at"] = _now_iso()
        await db.theme_bundle_pricing.update_one(
            {"theme_id": payload.theme_id},
            {"$set": update,
             "$setOnInsert": {"id": uuid.uuid4().hex, "created_at": _now_iso()}},
            upsert=True,
        )
        row = await db.theme_bundle_pricing.find_one({"theme_id": payload.theme_id}, {"_id": 0})
        return _strip(row)

    @router.delete("/api/super-admin/theme-bundle-pricing/{theme_id}")
    async def delete_theme_bundle(theme_id: str, super_admin_id: str = Depends(require_super_admin)):
        await db.theme_bundle_pricing.delete_one({"theme_id": theme_id})
        return {"success": True}

    @router.get("/api/public/theme-bundle-pricing")
    async def public_theme_bundles():
        cursor = db.theme_bundle_pricing.find({"is_active": {"$ne": False}}, {"_id": 0})
        out: Dict[str, dict] = {}
        async for doc in cursor:
            # `credits` is not returned: credits are deleted, and a bundle
            # priced in them would be a number a buyer cannot pay in. The
            # stored column is left alone — this is the read model.
            out[doc["theme_id"]] = {
                "theme_id": doc["theme_id"],
                "inr_price": int(doc.get("inr_price") or 0),
                "label": doc.get("label") or "",
            }
        return {"bundles": out}

    # ============================================================
    #   DISCOUNT CODES — super-admin CRUD
    # ============================================================
    @router.get("/api/super-admin/discount-codes")
    async def list_discount_codes(super_admin_id: str = Depends(require_super_admin)):
        cursor = db.discount_codes.find({}, {"_id": 0}).sort("created_at", -1)
        return {"codes": [doc async for doc in cursor]}

    @router.post("/api/super-admin/discount-codes")
    async def create_discount_code(
        payload: DiscountCodeCreate,
        super_admin_id: str = Depends(require_super_admin),
    ):
        code_upper = payload.code.upper().strip()
        existing = await db.discount_codes.find_one({"code": code_upper})
        if existing:
            raise HTTPException(409, f"Code '{code_upper}' already exists")
        doc = {
            "id": uuid.uuid4().hex,
            "code": code_upper,
            "kind": payload.kind,
            "value": int(payload.value),
            "applies_to": payload.applies_to,
            "target_id": payload.target_id,
            "max_uses": int(payload.max_uses),
            "used_count": 0,
            "expires_at": payload.expires_at,
            "is_active": bool(payload.is_active),
            "created_by": super_admin_id,
            "created_at": _now_iso(),
        }
        await db.discount_codes.insert_one(doc)
        return _strip(doc)

    @router.put("/api/super-admin/discount-codes/{code_id}")
    async def update_discount_code(
        code_id: str,
        payload: DiscountCodeUpdate,
        super_admin_id: str = Depends(require_super_admin),
    ):
        update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
        if not update:
            raise HTTPException(400, "Nothing to update")
        update["updated_at"] = _now_iso()
        res = await db.discount_codes.update_one({"id": code_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Discount code not found")
        row = await db.discount_codes.find_one({"id": code_id}, {"_id": 0})
        return _strip(row)

    @router.delete("/api/super-admin/discount-codes/{code_id}")
    async def delete_discount_code(code_id: str, super_admin_id: str = Depends(require_super_admin)):
        await db.discount_codes.delete_one({"id": code_id})
        return {"success": True}

    # ============================================================
    #   PUBLIC — validate a discount code (before checkout)
    # ============================================================
    @router.post("/api/public/discount/validate")
    async def validate_discount(payload: DiscountValidateRequest):
        code = payload.code.upper().strip()
        doc = await db.discount_codes.find_one({"code": code, "is_active": True}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Invalid or inactive code")
        # Expiry check
        if doc.get("expires_at"):
            try:
                exp = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
            except (ValueError, TypeError) as e:
                logger.warning("discount_codes id=%s has malformed expires_at=%r: %s",
                               doc.get("id"), doc.get("expires_at"), e)
                # Treat malformed expiry as expired — safer than silently allowing
                raise HTTPException(410, "This code has a malformed expiry; please contact support")
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(410, "This code has expired")
        # Max-uses check
        if doc.get("max_uses") and int(doc.get("used_count", 0)) >= int(doc["max_uses"]):
            raise HTTPException(429, "This code has reached its usage limit")
        # Applies-to check
        applies = doc.get("applies_to") or "all"
        if applies != "all":
            if payload.applies_to and payload.applies_to != applies:
                raise HTTPException(400, f"Code only applies to {applies} purchases")
            if doc.get("target_id") and payload.target_id and doc["target_id"] != payload.target_id:
                raise HTTPException(400, "Code does not apply to the selected item")
        # Compute discount
        original = int(payload.amount_inr)
        if doc["kind"] == "percent":
            discount = int(round(original * (int(doc["value"]) / 100.0)))
        else:
            discount = min(int(doc["value"]), original)
        final = max(0, original - discount)
        return {
            "code": code,
            "code_id": doc["id"],
            "kind": doc["kind"],
            "value": int(doc["value"]),
            "original_inr": original,
            "discount_inr": discount,
            "final_inr": final,
        }

    return router
