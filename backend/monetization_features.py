"""
MONETIZATION FEATURES

Super-admin photographer drilldown: profiles, revenue, subscription, storage.

The credit system this module was originally built around is GONE — packs,
Razorpay credit purchases, the credit ledger and the purchase-refund route were
all deleted, along with the credit fields on the drilldown. Money is INR via
subscriptions and store orders, and `revenue_inr` here is the whole picture
rather than the subscription half of it.

A historical credit purchase, if any exists in an old deployment, is refunded
from the Razorpay dashboard — there is no longer an endpoint for it.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: dict) -> dict:
    if d is None:
        return d
    d.pop("_id", None)
    return d


# ----------------------------------------------------------------------------
# Router builder
# ----------------------------------------------------------------------------
def build_monetization_router(db, require_admin, require_super_admin,
                              credit_service=None, razorpay_client=None) -> APIRouter:
    """`credit_service` and `razorpay_client` are accepted and ignored: the
    routes that used them are deleted, and server.py still passes them
    positionally. Defaulting them lets that call site be cleaned up next
    without breaking this one in the meantime."""
    router = APIRouter(tags=["monetization"])

    # =========================================================================
    # SUPER ADMIN — PHOTOGRAPHER DETAIL DRILLDOWN
    # =========================================================================
    @router.get("/api/super-admin/photographers/{admin_id}/detail")
    async def photographer_detail(admin_id: str, super_admin_id: str = Depends(require_super_admin)):
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
        if not admin:
            raise HTTPException(404, "Photographer not found")

        # All their profiles (invitations)
        profiles_cursor = db.profiles.find({"admin_id": admin_id}, {"_id": 0}).sort("created_at", -1)
        profiles = await profiles_cursor.to_list(500)

        # Aggregate metrics per profile
        profile_summaries = []
        for p in profiles:
            pid = p.get("id")
            slug = p.get("slug") or pid
            rsvp_total = await db.rsvps.count_documents({"profile_id": pid})
            rsvp_yes = await db.rsvps.count_documents({"profile_id": pid, "status": "yes"})
            wishes_total = await db.guest_wishes.count_documents({"profile_id": pid})
            photos_total = await db.live_gallery_photos.count_documents({"wedding_id": pid})
            analytics_doc = await db.analytics.find_one({"profile_id": pid}, {"_id": 0, "total_views": 1, "unique_views": 1}) or {}
            profile_summaries.append({
                "id": pid,
                "slug": slug,
                "groom_name": p.get("groom_name"),
                "bride_name": p.get("bride_name"),
                "event_date": p.get("event_date"),
                "event_type": p.get("event_type"),
                "venue": p.get("venue"),
                "city": p.get("city"),
                "design_id": p.get("design_id"),
                "plan_type": p.get("plan_type"),
                "is_published": p.get("is_published", False),
                "status": p.get("status"),
                "expires_at": p.get("expires_at"),
                "created_at": p.get("created_at"),
                "public_link": f"/invite/{slug}",
                "metrics": {
                    "views": int(analytics_doc.get("total_views", 0)),
                    "unique_views": int(analytics_doc.get("unique_views", 0)),
                    "rsvps": rsvp_total,
                    "rsvps_yes": rsvp_yes,
                    "wishes": wishes_total,
                    "photos": photos_total,
                },
            })

        # Revenue from this photographer: captured subscription payments (the
        # `payments` ledger) + any paid non-subscription store orders
        # (design/link buys). Credits are gone, so this is the whole picture.
        try:
            pays = await db.payments.find({"studio_id": admin_id, "status": "captured"}, {"_id": 0}).to_list(2000)
            sub_revenue_paise = sum(int(p.get("amount_paise") or 0) for p in pays)
            orders_paid = await db.orders.find({"studio_id": admin_id, "status": "paid"}, {"_id": 0}).to_list(2000)
            order_revenue_paise = sum(int(o.get("amount_paise") or 0) for o in orders_paid if o.get("kind") != "subscription")
            revenue_inr = round((sub_revenue_paise + order_revenue_paise) / 100)
            revenue_breakdown = {
                "subscription_inr": round(sub_revenue_paise / 100),
                "store_inr": round(order_revenue_paise / 100),
                "payments_count": len(pays),
            }
        except Exception:
            logger.warning("photographer revenue calc failed for %s", admin_id, exc_info=True)
            revenue_inr = 0
            revenue_breakdown = {"subscription_inr": 0, "store_inr": 0}

        # Aggregate totals
        total_rsvps = sum(s["metrics"]["rsvps"] for s in profile_summaries)
        total_views = sum(s["metrics"]["views"] for s in profile_summaries)
        published_count = sum(1 for s in profile_summaries if s["is_published"])

        # Last login (best-effort from audit_logs or admins.last_login_at)
        last_login = admin.get("last_login_at") or admin.get("updated_at")

        # ---- Portfolio + subscription (so the owner sees the studio's actual
        # public presence, not just their invitations). --------------------
        portfolio = await db.portfolio_profiles.find_one({"id": admin_id}, {"_id": 0}) or {}
        works = await db.portfolio_works.find({"studio_id": admin_id}, {"_id": 0}).to_list(2000)
        albums = await db.portfolio_albums.find({"studio_id": admin_id}, {"_id": 0}).to_list(500)
        used_bytes = sum(int(w.get("size_bytes") or 0) for w in works)
        try:
            from portfolio_service import _portfolio_tier, _storage_cap_bytes
            p_tier = await _portfolio_tier(db, admin_id)
            p_cap = await _storage_cap_bytes(db, admin_id)
        except Exception:
            p_tier, p_cap = "normal", 0

        sub = await db.subscriptions.find_one(
            {"studio_id": admin_id, "product": "portfolio", "status": "active"}, {"_id": 0})
        plan = None
        if sub:
            plan = await db.subscription_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0})

        portfolio_block = {
            "exists": bool(portfolio),
            "studio_name": portfolio.get("studio_name"),
            "tagline": portfolio.get("tagline"),
            "slug": portfolio.get("slug"),
            "is_published": bool(portfolio.get("is_published")),
            "avatar": portfolio.get("avatar"),
            "hero_image": portfolio.get("hero_image"),
            "about": portfolio.get("about"),
            "services": portfolio.get("services") or [],
            "styles": portfolio.get("styles") or [],
            "location": portfolio.get("location") or {},
            "experience_years": portfolio.get("experience_years"),
            "public_link": f"/photographer/{portfolio.get('slug') or admin_id}/portfolio",
            "tier": p_tier,
            "albums": len(albums),
            "works": len(works),
            "photos": sum(1 for w in works if w.get("image_url")),
            "videos": sum(1 for w in works if w.get("video_url")),
            "storage_used_bytes": used_bytes,
            "storage_cap_bytes": p_cap,
            "recent_works": sorted(works, key=lambda w: w.get("created_at") or "", reverse=True)[:12],
        }
        subscription_block = {
            "active": bool(sub),
            "plan_id": (sub or {}).get("plan_id"),
            "plan_tier": (plan or {}).get("tier"),
            "portfolio_tier": (plan or {}).get("portfolio_tier"),
            "cycle": (sub or {}).get("cycle"),
            "status": (sub or {}).get("status"),
            "current_period_end": (sub or {}).get("current_period_end"),
        }

        # ---- Cloud Storage product (studio_storage) + the two studio folders --
        # Everything the owner asked to see when opening a photographer: the
        # cloud-storage plan with GB used / GB total, and — for BOTH portfolio
        # and cloud storage — the folder name and which Google mail it lives on.
        cs_sub = await db.studio_storage_subscriptions.find_one(
            {"admin_id": admin_id}, {"_id": 0})
        cs_plan = None
        if cs_sub:
            cs_plan = await db.studio_storage_plans.find_one(
                {"id": cs_sub.get("plan_id")}, {"_id": 0})
        cs_used = int((cs_sub or {}).get("used_bytes", 0) or 0)
        cs_cap = int((cs_plan or {}).get("gb_limit", 0) or 0) * 1024 * 1024 * 1024
        # Re-resolve "which mail" on any folder still only reserved, so opening
        # this panel shows the current answer rather than the one frozen at
        # purchase time (before any Google account existed).
        try:
            from studio_folders import refresh_accounts
            studio_folders = await refresh_accounts(db, admin_id, admin) or {}
        except Exception:
            studio_folders = admin.get("studio_folders") or {}
        cloud_storage_block = {
            "active": bool(cs_sub),
            "plan_name": (cs_plan or {}).get("name"),
            "gb_limit": (cs_plan or {}).get("gb_limit"),
            "status": (cs_sub or {}).get("status"),
            "expires_at": (cs_sub or {}).get("expires_at"),
            "used_bytes": cs_used,
            "cap_bytes": cs_cap,
            "used_percent": round((cs_used / cs_cap) * 100, 1) if cs_cap else 0,
            # folder name + which mail it lives on (reserved on purchase)
            "folder": studio_folders.get("cloud_storage"),
        }
        # Portfolio folder record sits alongside the portfolio block.
        portfolio_block["folder"] = studio_folders.get("portfolio")

        return {
            "admin": admin,
            "portfolio": portfolio_block,
            "subscription": subscription_block,
            "cloud_storage": cloud_storage_block,
            "directory_listed": admin.get("directory_listed") is not False,
            "summary": {
                "profiles_total": len(profile_summaries),
                "profiles_published": published_count,
                "rsvps_total": total_rsvps,
                "views_total": total_views,
                "revenue_inr": revenue_inr,
                "revenue_breakdown": revenue_breakdown,
                "last_login": last_login,
            },
            "profiles": profile_summaries,
        }

    return router
