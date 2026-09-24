"""
PROMPT 07 — Guest Wishes Wall (Anonymous + Moderation Queue + Featured Wishes)

Public guests can post a wish via /api/invite/{slug}/wishes — rate-limited per IP.
Photographer-admin moderates from /api/admin/profiles/{id}/wishes.
Approved wishes appear on the public invitation. Up to 3 featured wishes are
pinned at the top in burgundy spotlight cards (oldest auto-rotated out).

VISIBILITY DEFAULT (bug fix): a wish is AUTO-APPROVED the moment a guest posts
it, so it shows on the invitation immediately — the reported "I shared a wish and
it never appeared" bug. This matches the live gallery, which auto-approves guest
photos by default (premium_features.py). Post-moderation still applies: the studio
can reject or delete any wish from the moderation panel. A studio that wants to
vet wishes BEFORE they show can turn on pre-moderation by setting
`profile.wishes_settings.moderation_required = True`, in which case new wishes
land as "pending" exactly as before.
"""
from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_ip(ip: str) -> str:
    return hashlib.sha256((ip or "").encode("utf-8")).hexdigest()[:24]


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# --- Models ----------------------------------------------------------------
class WishCreate(BaseModel):
    guest_name: str = Field(min_length=1, max_length=80)
    relationship: Optional[str] = Field(default=None, max_length=80)
    message: str = Field(min_length=1, max_length=600)


class WishStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected"]


MAX_WISHES_PER_IP_PER_DAY = 3
MAX_FEATURED = 3


def build_wishes_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["wishes"])

    async def _get_profile_owned(profile_id: str, admin_data: dict) -> dict:
        p = await db.profiles.find_one({"$or": [{"id": profile_id}, {"slug": profile_id}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Profile not found")
        admin_id = admin_data.get("admin_id") or admin_data.get("id")
        if admin_data.get("role") not in ("super_admin", "superadmin") and p.get("admin_id") and p.get("admin_id") != admin_id:
            raise HTTPException(403, "Not your wedding")
        return p

    async def _get_profile_by_slug(slug: str) -> dict:
        p = await db.profiles.find_one({"$or": [{"id": slug}, {"slug": slug}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Wedding not found")
        return p

    def _strip(d: dict) -> dict:
        if d is None:
            return d
        d.pop("_id", None)
        return d

    # -------- PUBLIC: submit a wish ----------------------------------------
    @router.post("/api/invite/{slug}/wishes")
    async def submit_wish(slug: str, payload: WishCreate, request: Request):
        profile = await _get_profile_by_slug(slug)
        client_ip = (request.client.host if request.client else "") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        ip_hash = _hash_ip(client_ip)
        day = _today_key()

        # Rate limit: max 3 wishes per IP per wedding per day
        rl = await db.wish_rate_limits.find_one({"ip_hash": ip_hash, "profile_id": profile["id"], "day": day})
        if rl and rl.get("count", 0) >= MAX_WISHES_PER_IP_PER_DAY:
            raise HTTPException(429, "You've shared 3 wishes already today — thank you!")

        # Auto-approve by default so the wish shows on the invitation right away;
        # a studio can opt into pre-moderation via wishes_settings.moderation_required.
        pre_moderate = bool((profile.get("wishes_settings") or {}).get("moderation_required"))
        now = _now_iso()
        doc = {
            "id": uuid.uuid4().hex,
            "profile_id": profile["id"],
            "guest_name": payload.guest_name.strip(),
            "relationship": (payload.relationship or "").strip() or None,
            "message": payload.message.strip(),
            "status": "pending" if pre_moderate else "approved",
            "is_featured": False,
            "created_at": now,
            "approved_at": None if pre_moderate else now,
            "ip_hash": ip_hash,
        }
        await db.guest_wishes.insert_one(doc)

        # Update rate limit
        await db.wish_rate_limits.update_one(
            {"ip_hash": ip_hash, "profile_id": profile["id"], "day": day},
            {"$inc": {"count": 1}, "$set": {"updated_at": _now_iso()}},
            upsert=True,
        )
        return {"success": True, "status": doc["status"]}

    # -------- PUBLIC: list approved wishes ---------------------------------
    @router.get("/api/public/invite/{slug}/wishes")
    async def public_wishes(slug: str, limit: int = 50):
        profile = await _get_profile_by_slug(slug)
        cursor = db.guest_wishes.find(
            {"profile_id": profile["id"], "status": "approved"},
            {"_id": 0, "ip_hash": 0},
        )
        # Sort featured first by approved_at desc, then chronological desc
        wishes = await cursor.to_list(min(limit, 200))
        wishes.sort(key=lambda w: (not w.get("is_featured"), -1 * (datetime.fromisoformat(w.get("approved_at") or w.get("created_at")).timestamp() if (w.get("approved_at") or w.get("created_at")) else 0)))
        return {"wishes": wishes[:limit]}

    # -------- ADMIN: filtered list -----------------------------------------
    @router.get("/api/admin/profiles/{profile_id}/wishes")
    async def admin_list_wishes(profile_id: str, status: Optional[str] = None,
                                 admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        query: dict = {"profile_id": profile["id"]}
        if status and status in ("pending", "approved", "rejected"):
            query["status"] = status
        cursor = db.guest_wishes.find(query, {"_id": 0, "ip_hash": 0}).sort("created_at", -1)
        wishes = await cursor.to_list(2000)

        # Status counts
        all_cursor = db.guest_wishes.find({"profile_id": profile["id"]}, {"_id": 0, "status": 1, "is_featured": 1})
        all_wishes = await all_cursor.to_list(5000)
        counts = {
            "pending": sum(1 for w in all_wishes if w.get("status") == "pending"),
            "approved": sum(1 for w in all_wishes if w.get("status") == "approved"),
            "rejected": sum(1 for w in all_wishes if w.get("status") == "rejected"),
            "featured": sum(1 for w in all_wishes if w.get("is_featured")),
        }
        return {"wishes": wishes, "counts": counts}

    # -------- ADMIN: approve / reject / feature ----------------------------
    @router.post("/api/admin/profiles/{profile_id}/wishes/{wish_id}/approve")
    async def approve_wish(profile_id: str, wish_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        res = await db.guest_wishes.update_one(
            {"id": wish_id, "profile_id": profile["id"]},
            {"$set": {"status": "approved", "approved_at": _now_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    @router.post("/api/admin/profiles/{profile_id}/wishes/{wish_id}/reject")
    async def reject_wish(profile_id: str, wish_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        res = await db.guest_wishes.update_one(
            {"id": wish_id, "profile_id": profile["id"]},
            {"$set": {"status": "rejected", "is_featured": False}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    @router.post("/api/admin/profiles/{profile_id}/wishes/{wish_id}/feature")
    async def toggle_feature(profile_id: str, wish_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        wish = await db.guest_wishes.find_one({"id": wish_id, "profile_id": profile["id"]}, {"_id": 0})
        if not wish:
            raise HTTPException(404, "Wish not found")

        if wish.get("is_featured"):
            # Unfeature
            await db.guest_wishes.update_one({"id": wish_id}, {"$set": {"is_featured": False}})
            return {"success": True, "is_featured": False}

        # Auto-rotate oldest if already 3 featured
        featured_cursor = db.guest_wishes.find(
            {"profile_id": profile["id"], "is_featured": True}, {"_id": 0}
        ).sort("approved_at", 1)
        currently_featured = await featured_cursor.to_list(MAX_FEATURED + 5)
        if len(currently_featured) >= MAX_FEATURED:
            oldest_id = currently_featured[0]["id"]
            await db.guest_wishes.update_one({"id": oldest_id}, {"$set": {"is_featured": False}})

        # Also auto-approve if not already
        update = {"is_featured": True, "status": "approved"}
        if not wish.get("approved_at"):
            update["approved_at"] = _now_iso()
        await db.guest_wishes.update_one({"id": wish_id}, {"$set": update})
        return {"success": True, "is_featured": True}

    @router.post("/api/admin/profiles/{profile_id}/wishes/bulk-approve")
    async def bulk_approve(profile_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        res = await db.guest_wishes.update_many(
            {"profile_id": profile["id"], "status": "pending"},
            {"$set": {"status": "approved", "approved_at": _now_iso()}},
        )
        return {"approved": res.modified_count}

    @router.delete("/api/admin/profiles/{profile_id}/wishes/{wish_id}")
    async def delete_wish(profile_id: str, wish_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        res = await db.guest_wishes.delete_one({"id": wish_id, "profile_id": profile["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    return router
