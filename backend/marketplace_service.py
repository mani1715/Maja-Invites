"""
marketplace_service.py — Phase 2: Design Marketplace + configuration engine.

Backend for the premium Design Marketplace. Two concerns:

  1. Config MODULE catalog — the 27 toggleable options (invitation website, RSVP,
     gallery, live streaming, ...). Each module is either INCLUDED in the chosen
     subscription tier (free) or billed as an add-on (addon_monthly INR) when the
     tier doesn't include it. This is what makes "every option dynamically updates
     pricing" work against the subscription plans built in Phase 1b.

  2. Config quote — given a base plan (product/tier/cycle) + enabled modules +
     coupon, returns the sticky order-summary numbers: base, modules, discount,
     GST, final, cycle, next renewal. Reuses the Phase-1b cycle pricing + GST.

The card metadata (cover/preview/demo) is served by the existing design catalog
+ theme configs on the frontend; this module supplies the pricing/config brain.

Wired in server.py:
    from marketplace_service import build_marketplace_router
    app.include_router(build_marketplace_router(db, require_admin))
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from subscription_service import CYCLES, GST_RATE, _cycle_price_paise, _add_months

logger = logging.getLogger("marketplace")

# The 27 configurable modules. `addon_monthly` = INR/month if NOT included in the
# selected tier. `group` drives the UI sections.
MODULE_CATALOG: List[Dict[str, Any]] = [
    {"key": "invitation_website",     "label": "Invitation Website",     "group": "Core",        "addon_monthly": 0},
    {"key": "rsvp",                   "label": "RSVP",                   "group": "Core",        "addon_monthly": 99},
    {"key": "gallery",                "label": "Gallery",                "group": "Core",        "addon_monthly": 99},
    {"key": "countdown",              "label": "Countdown",              "group": "Core",        "addon_monthly": 49},
    {"key": "maps",                   "label": "Maps",                   "group": "Core",        "addon_monthly": 49},
    {"key": "music",                  "label": "Music",                  "group": "Experience",  "addon_monthly": 99},
    {"key": "live_streaming",         "label": "Live Streaming",         "group": "Experience",  "addon_monthly": 299},
    {"key": "premium_animations",     "label": "Premium Animations",     "group": "Experience",  "addon_monthly": 199},
    {"key": "premium_fonts",          "label": "Premium Fonts",          "group": "Experience",  "addon_monthly": 99},
    {"key": "extra_languages",        "label": "Extra Languages",        "group": "Experience",  "addon_monthly": 149},
    {"key": "gift_registry",          "label": "Gift Registry",          "group": "Guests",      "addon_monthly": 149},
    {"key": "accommodation",          "label": "Accommodation",          "group": "Guests",      "addon_monthly": 99},
    {"key": "travel",                 "label": "Travel",                 "group": "Guests",      "addon_monthly": 99},
    {"key": "guest_management",       "label": "Guest Management",       "group": "Guests",      "addon_monthly": 199},
    {"key": "qr_checkin",             "label": "QR Check-in",            "group": "Guests",      "addon_monthly": 149},
    {"key": "ai_story",               "label": "AI Story",               "group": "Smart",       "addon_monthly": 199},
    {"key": "whatsapp_integration",   "label": "WhatsApp Integration",   "group": "Smart",       "addon_monthly": 199},
    {"key": "email_notifications",    "label": "Email Notifications",    "group": "Smart",       "addon_monthly": 99},
    {"key": "analytics",             "label": "Analytics",              "group": "Smart",       "addon_monthly": 149},
    {"key": "seo",                    "label": "SEO",                    "group": "Growth",      "addon_monthly": 149},
    {"key": "custom_domain",          "label": "Custom Domain",          "group": "Growth",      "addon_monthly": 249},
    {"key": "portfolio_integration",  "label": "Portfolio Integration",  "group": "Growth",      "addon_monthly": 199},
    {"key": "cloud_backup",           "label": "Cloud Backup",           "group": "Storage",     "addon_monthly": 199},
    {"key": "photo_storage",          "label": "Photo Storage",          "group": "Storage",     "addon_monthly": 349},
    {"key": "video_storage",          "label": "Video Storage",          "group": "Storage",     "addon_monthly": 499},
    {"key": "additional_team_members","label": "Additional Team Members","group": "Team",        "addon_monthly": 299},
    {"key": "priority_support",       "label": "Priority Support",       "group": "Team",        "addon_monthly": 199},
]
_MODULE_BY_KEY = {m["key"]: m for m in MODULE_CATALOG}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConfigQuoteRequest(BaseModel):
    product: str = "invitation"
    tier: str
    cycle: str = "monthly"
    modules: List[str] = Field(default_factory=list)   # enabled module keys
    coupon: Optional[str] = None
    design_id: Optional[str] = None


def build_marketplace_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["marketplace"])

    async def _plan(product: str, tier: str) -> Optional[Dict[str, Any]]:
        return await db.subscription_plans.find_one(
            {"id": f"plan_{product}_{tier.lower()}"}, {"_id": 0}
        )

    async def _apply_coupon(code: Optional[str], subtotal_paise: int,
                            scope: Optional[list] = None) -> Dict[str, Any]:
        if not code:
            return {"discount_paise": 0, "coupon": None}
        doc = await db.coupons.find_one({"code": code.upper()}, {"_id": 0})
        # Shared with subscription_service via pricing_engine — this used to be
        # a second copy of the same arithmetic, and both copies read field names
        # the super-admin console never wrote (see coupon_discount_paise).
        from pricing_engine import coupon_discount_paise
        disc = coupon_discount_paise(doc, subtotal_paise, now_iso=_now().isoformat(), scope=scope)
        if not disc:
            return {"discount_paise": 0, "coupon": None}
        return {"discount_paise": disc, "coupon": doc.get("code")}

    # ---- config module catalog (grouped) ----------------------------------
    @router.get("/api/marketplace/config-options")
    async def config_options(product: str = "invitation", tier: Optional[str] = None):
        included: List[str] = []
        if tier:
            plan = await _plan(product, tier)
            included = (plan or {}).get("features", []) or []
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for m in MODULE_CATALOG:
            groups.setdefault(m["group"], []).append({
                **m, "included_in_tier": m["key"] in included,
            })
        return {"groups": [{"group": g, "modules": mods} for g, mods in groups.items()],
                "included": included}

    # ---- live config quote (sticky order summary) -------------------------
    @router.post("/api/marketplace/quote")
    async def config_quote(req: ConfigQuoteRequest):
        if req.cycle not in CYCLES:
            raise HTTPException(400, f"Unknown cycle '{req.cycle}'")
        plan = await _plan(req.product, req.tier)
        if not plan or not plan.get("is_active", True):
            raise HTTPException(404, f"Plan {req.product}/{req.tier} not available")

        months = CYCLES[req.cycle]["months"]
        base_paise = _cycle_price_paise(int(plan["base_monthly"]), req.cycle)
        included = set(plan.get("features", []) or [])

        module_lines = []
        modules_paise = 0
        for key in req.modules:
            m = _MODULE_BY_KEY.get(key)
            if not m:
                continue
            if key in included or m["addon_monthly"] == 0:
                module_lines.append({"key": key, "label": m["label"], "amount_paise": 0, "included": True})
            else:
                amt = m["addon_monthly"] * 100 * months
                modules_paise += amt
                module_lines.append({"key": key, "label": m["label"], "amount_paise": amt, "included": False})

        subtotal = base_paise + modules_paise
        cpn = await _apply_coupon(req.coupon, subtotal,
                                  scope=[req.product, plan.get("id"), req.tier])
        after = subtotal - cpn["discount_paise"]
        gst = int(round(after * GST_RATE))
        total = after + gst
        next_renewal = _add_months(_now(), months).date().isoformat()

        return {
            "product": req.product, "tier": req.tier, "cycle": req.cycle,
            "cycle_label": CYCLES[req.cycle]["label"], "months": months,
            "base_paise": base_paise, "base_inr": round(base_paise / 100, 2),
            "modules": module_lines,
            "modules_paise": modules_paise, "modules_inr": round(modules_paise / 100, 2),
            "subtotal_paise": subtotal,
            "discount_paise": cpn["discount_paise"], "coupon": cpn["coupon"],
            "gst_rate": GST_RATE, "gst_paise": gst, "gst_inr": round(gst / 100, 2),
            "total_paise": total, "total_inr": round(total / 100, 2),
            "subscription_type": f"{CYCLES[req.cycle]['label']} · auto-renew",
            "next_renewal": next_renewal,
            "currency": "INR",
        }

    return router
