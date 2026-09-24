"""
super_admin_v2.py — Bucket 2 extras for the Super Admin console.

Adds (all under /api/super-admin/v2):
  Analytics
    • GET  /revenue/summary?days=30           — revenue + credits sold totals
    • GET  /revenue/timeseries?days=30        — daily series for chart
    • GET  /leaderboard/photographers?by=     — top photographers leaderboard

  Coupons / Discounts
    • CRUD /coupons                           — create / list / update / delete

  Broadcast
    • POST /broadcast                         — send announcement to admins
    • GET  /broadcast                         — list past announcements
    • GET  /broadcast/active                  — what photographers currently see (used by /admin)

  Platform Settings
    • GET  /settings                          — current platform settings
    • PUT  /settings                          — update (super-admin only)

  Homepage CMS
    • GET  /cms/homepage                      — public can also fetch a public-safe version
    • PUT  /cms/homepage                      — super-admin only

  Theme Rollout
    • GET  /themes/rollout
    • PUT  /themes/rollout

  Impersonation
    • POST /impersonate/{admin_id}            — returns a short-lived JWT for that admin
    • POST /refund                            — refund N credits to an admin with reason

  Login history
    • GET  /login-history/{admin_id}
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
import uuid


def build_super_admin_v2_router(db, require_super_admin, require_admin,
                                 create_access_token, log_audit_action):
    router = APIRouter(prefix="/api/super-admin/v2", tags=["super-admin-v2"])
    public_router = APIRouter(prefix="/api/public", tags=["public-cms"])

    # require_super_admin in /app/backend/auth.py returns just the admin_id string.
    # Wrap it so the rest of this module can use a uniform dict shape.
    async def _su(admin_id: str = Depends(require_super_admin)):
        return {"admin_id": admin_id, "role": "super_admin"}

    # ============== ANALYTICS ==============
    @router.get("/revenue/summary")
    async def revenue_summary(
        days: int = Query(30, ge=1, le=365),
        admin_data: dict = Depends(_su),
    ):
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        cursor = db.credit_ledger.find(
            {"type": "CREDIT", "source": "PURCHASE", "created_at": {"$gte": cutoff}},
            {"_id": 0, "amount": 1, "amount_paise": 1, "created_at": 1, "pack_id": 1},
        )
        total_credits = 0
        total_paise = 0
        purchases = 0
        async for row in cursor:
            total_credits += int(row.get("amount", 0))
            total_paise += int(row.get("amount_paise", 0))
            purchases += 1
        return {
            "days": days,
            "purchases": purchases,
            "credits_sold": total_credits,
            "revenue_inr": round(total_paise / 100, 2),
        }

    @router.get("/revenue/timeseries")
    async def revenue_timeseries(
        days: int = Query(30, ge=7, le=180),
        admin_data: dict = Depends(_su),
    ):
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff = cutoff_dt.isoformat()
        rows: Dict[str, Dict[str, int]] = {}
        async for r in db.credit_ledger.find(
            {"type": "CREDIT", "source": "PURCHASE", "created_at": {"$gte": cutoff}},
            {"_id": 0, "amount": 1, "amount_paise": 1, "created_at": 1},
        ):
            ca = str(r.get("created_at", ""))[:10]
            if not ca:
                continue
            slot = rows.setdefault(ca, {"credits": 0, "paise": 0, "purchases": 0})
            slot["credits"] += int(r.get("amount", 0))
            slot["paise"] += int(r.get("amount_paise", 0))
            slot["purchases"] += 1
        # Fill missing days
        out = []
        for i in range(days, -1, -1):
            d = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
            s = rows.get(d, {"credits": 0, "paise": 0, "purchases": 0})
            out.append({
                "date": d,
                "credits": s["credits"],
                "revenue_inr": round(s["paise"] / 100, 2),
                "purchases": s["purchases"],
            })
        return {"series": out, "days": days}

    @router.get("/leaderboard/photographers")
    async def leaderboard(
        by: str = Query("revenue", description="revenue|weddings|rsvps"),
        limit: int = Query(10, ge=1, le=50),
        admin_data: dict = Depends(_su),
    ):
        # Map photographers
        photographers = []
        async for a in db.admins.find({"role": "admin"}, {"_id": 0}):
            photographers.append(a)
        out = []
        for a in photographers:
            aid = a.get("id")
            if by == "weddings":
                cnt = await db.profiles.count_documents({
                    "admin_id": aid, "is_template": {"$ne": True},
                    "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
                })
                metric = cnt
            elif by == "rsvps":
                pids = [p["id"] async for p in db.profiles.find({"admin_id": aid}, {"_id": 0, "id": 1})]
                metric = await db.rsvps.count_documents({"profile_id": {"$in": pids}}) if pids else 0
            else:  # revenue
                paise = 0
                async for r in db.credit_ledger.find(
                    {"admin_id": aid, "type": "CREDIT", "source": "PURCHASE"},
                    {"_id": 0, "amount_paise": 1},
                ):
                    paise += int(r.get("amount_paise", 0))
                metric = round(paise / 100, 2)
            out.append({
                "admin_id": aid,
                "name": a.get("name") or a.get("username") or a.get("email"),
                "email": a.get("email"),
                "metric": metric,
            })
        out.sort(key=lambda x: x["metric"], reverse=True)
        return {"items": out[:limit], "by": by}

    # ============== COUPONS ==============
    class CouponCreate(BaseModel):
        code: str = Field(..., min_length=3, max_length=32)
        discount_type: str = Field(..., description="percent|flat")
        discount_value: float = Field(..., gt=0)
        max_uses: int = Field(0, ge=0, description="0 = unlimited")
        expires_at: Optional[str] = None
        applies_to: List[str] = Field(default_factory=list,
            description="empty = all packs, else pack ids")
        active: bool = True

    class CouponUpdate(BaseModel):
        discount_value: Optional[float] = None
        max_uses: Optional[int] = None
        expires_at: Optional[str] = None
        applies_to: Optional[List[str]] = None
        active: Optional[bool] = None

    @router.post("/coupons")
    async def coupon_create(c: CouponCreate, admin_data: dict = Depends(_su)):
        code = c.code.strip().upper()
        if await db.coupons.find_one({"code": code}):
            raise HTTPException(400, "Coupon code already exists")
        # The two places that actually SPEND a coupon — subscription_service
        # `_coupon_discount` and marketplace_service — read `type`, `value` and
        # `is_active`. This writer only ever stored `discount_type`,
        # `discount_value` and `active`, so `doc.get("value", 0)` was always 0:
        # every coupon minted here applied a ₹0 discount, and deactivating one
        # did nothing because `is_active` was absent and defaults to True.
        # Write the canonical names the consumers read, and keep the legacy
        # aliases in sync so the admin list UI still renders.
        doc = {
            "id": str(uuid.uuid4()),
            "code": code,
            "type": c.discount_type,
            "value": c.discount_value,
            "is_active": c.active,
            "discount_type": c.discount_type,
            "discount_value": c.discount_value,
            "max_uses": c.max_uses,
            "uses": 0,
            "expires_at": c.expires_at,
            "applies_to": c.applies_to,
            "active": c.active,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": admin_data["admin_id"],
        }
        await db.coupons.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/coupons")
    async def coupon_list(admin_data: dict = Depends(_su)):
        items = []
        async for c in db.coupons.find({}, {"_id": 0}).sort("created_at", -1):
            items.append(c)
        return {"items": items}

    @router.patch("/coupons/{coupon_id}")
    async def coupon_update(coupon_id: str, body: CouponUpdate, admin_data: dict = Depends(_su)):
        upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if not upd:
            raise HTTPException(400, "No fields to update")
        # Keep the canonical names the spending code reads in sync with the
        # legacy aliases this endpoint's payload speaks (see coupon_create).
        if "discount_value" in upd:
            upd["value"] = upd["discount_value"]
        if "active" in upd:
            upd["is_active"] = upd["active"]
        res = await db.coupons.update_one({"id": coupon_id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Coupon not found")
        return {"updated_fields": list(upd.keys())}

    @router.delete("/coupons/{coupon_id}")
    async def coupon_delete(coupon_id: str, admin_data: dict = Depends(_su)):
        res = await db.coupons.delete_one({"id": coupon_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Coupon not found")
        return {"deleted": True}

    # ============== BROADCAST ==============
    class BroadcastCreate(BaseModel):
        title: str = Field(..., min_length=1, max_length=200)
        body: str = Field(..., min_length=1, max_length=2000)
        link_url: Optional[str] = None
        link_label: Optional[str] = None
        audience: str = Field("all", description="all|active|new7d")
        active: bool = True
        expires_at: Optional[str] = None

    @router.post("/broadcast")
    async def broadcast_create(b: BroadcastCreate, admin_data: dict = Depends(_su)):
        doc = {
            "id": str(uuid.uuid4()),
            **b.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": admin_data["admin_id"],
        }
        await db.broadcasts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/broadcast")
    async def broadcast_list(admin_data: dict = Depends(_su)):
        items = []
        async for b in db.broadcasts.find({}, {"_id": 0}).sort("created_at", -1):
            items.append(b)
        return {"items": items}

    @router.delete("/broadcast/{broadcast_id}")
    async def broadcast_delete(broadcast_id: str, admin_data: dict = Depends(_su)):
        res = await db.broadcasts.delete_one({"id": broadcast_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Broadcast not found")
        return {"deleted": True}

    @router.get("/broadcast/active", tags=["admin-broadcast"])
    async def broadcast_active_for_admin(admin_data: dict = Depends(require_admin)):
        """Photographers + super-admin see currently-active announcements."""
        now = datetime.now(timezone.utc).isoformat()
        q: Dict[str, Any] = {"active": True,
                             "$or": [{"expires_at": None}, {"expires_at": {"$gte": now}}]}
        items = []
        async for b in db.broadcasts.find(q, {"_id": 0}).sort("created_at", -1).limit(5):
            items.append(b)
        return {"items": items}

    # ============== PLATFORM SETTINGS ==============
    SETTINGS_DOC_ID = "platform_settings_v1"

    class PlatformSettings(BaseModel):
        site_name: str = "MAJA Invites"
        favicon_url: Optional[str] = None
        default_new_admin_credits: int = 100
        razorpay_mode: str = "test"     # test|live
        gst_percent: float = 18.0
        support_email: str = "support@majacreations.com"
        maintenance_mode: bool = False
        maintenance_message: str = "We'll be right back."

    async def _get_settings() -> Dict[str, Any]:
        doc = await db.platform_settings.find_one({"id": SETTINGS_DOC_ID}, {"_id": 0})
        return doc or {"id": SETTINGS_DOC_ID, **PlatformSettings().model_dump()}

    @router.get("/settings")
    async def settings_get(admin_data: dict = Depends(_su)):
        return await _get_settings()

    @router.put("/settings")
    async def settings_set(body: PlatformSettings, admin_data: dict = Depends(_su)):
        upd = body.model_dump()
        upd["id"] = SETTINGS_DOC_ID
        upd["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.platform_settings.update_one(
            {"id": SETTINGS_DOC_ID}, {"$set": upd}, upsert=True,
        )
        return upd

    @public_router.get("/settings")
    async def public_settings():
        s = await _get_settings()
        # Strip sensitive fields
        return {
            "site_name": s.get("site_name", "MAJA Invites"),
            "favicon_url": s.get("favicon_url"),
            "support_email": s.get("support_email"),
            "maintenance_mode": s.get("maintenance_mode", False),
            "maintenance_message": s.get("maintenance_message", ""),
        }

    # ============== HOMEPAGE CMS ==============
    CMS_DOC_ID = "homepage_cms_v1"

    class HomepageCMS(BaseModel):
        hero_eyebrow: str = "◆ Cinematic Wedding Studio"
        hero_headline: str = "Cinematic invitations worthy of your artistry"
        hero_subheadline: str = "Hand-crafted, motion-rich, royalty-grade — without the dev team."
        featured_themes: List[str] = Field(default_factory=list, max_length=6)
        testimonials: List[Dict[str, str]] = Field(default_factory=list)
        faqs: List[Dict[str, str]] = Field(default_factory=list)
        pricing_blurb: str = ""
        footer_text: str = "Made with intention in India."
        social_links: Dict[str, str] = Field(default_factory=dict)
        promo_banner_active: bool = False
        promo_banner_text: str = ""
        promo_banner_link: Optional[str] = None
        promo_banner_bg: str = "#D4AF37"

    async def _get_cms() -> Dict[str, Any]:
        doc = await db.homepage_cms.find_one({"id": CMS_DOC_ID}, {"_id": 0})
        return doc or {"id": CMS_DOC_ID, **HomepageCMS().model_dump()}

    @router.get("/cms/homepage")
    async def cms_get(admin_data: dict = Depends(_su)):
        return await _get_cms()

    @router.put("/cms/homepage")
    async def cms_set(body: HomepageCMS, admin_data: dict = Depends(_su)):
        upd = body.model_dump()
        upd["id"] = CMS_DOC_ID
        upd["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.homepage_cms.update_one({"id": CMS_DOC_ID}, {"$set": upd}, upsert=True)
        return upd

    @public_router.get("/cms/homepage")
    async def public_cms():
        return await _get_cms()

    # ============== THEME ROLLOUT ==============
    @router.get("/themes/rollout")
    async def theme_rollout_get(admin_data: dict = Depends(_su)):
        rows = []
        async for r in db.theme_rollout.find({}, {"_id": 0}):
            rows.append(r)
        return {"items": rows}

    class ThemeRolloutItem(BaseModel):
        theme_id: str
        visible_to: str = "all"  # all|silver|gold|platinum|none
        coming_soon: bool = False

    @router.put("/themes/rollout")
    async def theme_rollout_set(items: List[ThemeRolloutItem],
                                admin_data: dict = Depends(_su)):
        now = datetime.now(timezone.utc).isoformat()
        for it in items:
            await db.theme_rollout.update_one(
                {"theme_id": it.theme_id},
                {"$set": {**it.model_dump(), "updated_at": now}},
                upsert=True,
            )
        return {"updated": len(items)}

    @public_router.get("/themes/rollout")
    async def public_theme_rollout():
        rows = []
        async for r in db.theme_rollout.find({}, {"_id": 0}):
            rows.append(r)
        return {"items": rows}

    # ============== IMPERSONATION ==============
    @router.post("/impersonate/{target_admin_id}")
    async def impersonate(target_admin_id: str, request: Request,
                          admin_data: dict = Depends(_su)):
        target = await db.admins.find_one({"id": target_admin_id}, {"_id": 0})
        if not target:
            raise HTTPException(404, "Admin not found")
        # Short-lived (15 min) token impersonating the target admin
        token = create_access_token(
            data={
                "admin_id": target["id"],
                "username": target.get("username"),
                "role": target.get("role", "admin"),
                "impersonated_by": admin_data["admin_id"],
            },
            expires_delta=timedelta(minutes=15),
        )
        try:
            await log_audit_action(
                action="impersonate",
                admin_id=admin_data["admin_id"],
                profile_id=target_admin_id,
                profile_slug="impersonation",
                details={
                    "target": target.get("email"),
                    "ip": request.client.host if request.client else None,
                    "expires_in_min": 15,
                },
            )
        except Exception:
            pass
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in_min": 15,
            "target": {
                "id": target["id"], "email": target.get("email"),
                "name": target.get("name"), "role": target.get("role"),
            },
            "impersonated_by": admin_data["admin_id"],
        }

    # ============== REFUND CREDITS ==============
    class RefundRequest(BaseModel):
        admin_id: str
        credits: int = Field(..., gt=0)
        reason: str = Field(..., min_length=3, max_length=500)


    # ============== LOGIN HISTORY ==============
    @router.get("/login-history/{admin_id}")
    async def login_history(admin_id: str, admin_data: dict = Depends(_su)):
        items = []
        async for r in db.login_history.find({"admin_id": admin_id}, {"_id": 0}) \
                .sort("created_at", -1).limit(20):
            items.append(r)
        return {"items": items}

    return router, public_router
