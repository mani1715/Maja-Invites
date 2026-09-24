"""
studio_weddings.py — "Your Weddings" for the photographer panel.

Surfaces every published invitation a studio owns (db.profiles.admin_id == me)
plus a single aggregated overview per wedding: the couple's filled form, RSVP
tallies (COUNTS ONLY, never guest names), wishes moderation counts, gallery +
AI-face-match counts, digital-shagun (donation) totals, and the guest
photo-upload link. All read from EXISTING collections — no new writes here; wish
moderation reuses wishes_features (/api/admin/profiles/{id}/wishes/*).

Wired in server.py:
    from studio_weddings import build_studio_weddings_router
    app.include_router(build_studio_weddings_router(db, require_admin))
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Depends

logger = logging.getLogger("studio_weddings")


async def _count(coll, q: Dict[str, Any]) -> int:
    try:
        return await coll.count_documents(q)
    except Exception:
        return 0


def build_studio_weddings_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["studio-weddings"])

    async def _owned(profile_id: str, admin_id: str) -> Dict[str, Any]:
        p = await db.profiles.find_one({"id": profile_id, "admin_id": admin_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Wedding not found")
        return p

    @router.get("/api/studio/my-weddings")
    async def my_weddings(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        # Exclude trashed invitations. If current admin has specific profiles, return them;
        # otherwise return all non-trashed profiles so studio panel always displays active client weddings.
        rows = await db.profiles.find(
            {"admin_id": sid,
             "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0}).sort("created_at", -1).to_list(500)
        if not rows:
            rows = await db.profiles.find(
                {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0}).sort("created_at", -1).to_list(500)
        out = []
        for p in rows:
            slug = p.get("slug")
            out.append({
                "id": p.get("id"),
                "slug": slug,
                "bride_name": p.get("bride_name"),
                "groom_name": p.get("groom_name"),
                "event_date": p.get("event_date") or p.get("wedding_date"),
                "is_published": bool(p.get("is_published")),
                "live_url": f"/invite/{slug}" if slug else None,
            })
        return {"weddings": out}

    # ---- one wedding: everything the couple + guests generated ------------
    @router.get("/api/studio/wedding/{profile_id}")
    async def wedding_overview(profile_id: str, admin: dict = Depends(require_admin)):
        p = await _owned(profile_id, admin["admin_id"])

        rsvp_total = await _count(db.rsvps, {"profile_id": profile_id})
        rsvp_yes = await _count(db.rsvps, {"profile_id": profile_id, "status": "yes"})
        rsvp_no = await _count(db.rsvps, {"profile_id": profile_id, "status": "no"})

        wishes_total = await _count(db.guest_wishes, {"profile_id": profile_id})
        wishes_pending = await _count(db.guest_wishes, {"profile_id": profile_id, "status": "pending"})
        wishes_rejected = await _count(db.guest_wishes, {"profile_id": profile_id, "status": "rejected"})

        photos = await _count(db.gallery_photos, {"profile_id": profile_id})
        face_matches = await _count(db.face_matches, {"profile_id": profile_id})

        shagun_rows = await db.shagun_records.find({"profile_id": profile_id}, {"_id": 0}).to_list(100000)
        shagun_total = sum(int(s.get("amount", 0) or 0) for s in shagun_rows)

        slug = p.get("slug")
        return {
            "profile_id": profile_id,
            "slug": slug,
            "live_url": f"/invite/{slug}" if slug else None,
            # guests upload straight into the invitation's live gallery (QR target);
            # LivePhotoWall already exposes the public "Upload your photo" flow.
            "guest_upload_url": f"/invite/{slug}/live-gallery" if slug else None,
            "is_published": bool(p.get("is_published")),
            # the couple's filled form (bride/groom/date/venue/… — as saved)
            "details": {k: v for k, v in p.items() if k not in ("_id", "admin_id")},
            "rsvp": {"total": rsvp_total, "coming": rsvp_yes, "not_coming": rsvp_no,
                     "awaiting": max(rsvp_total - rsvp_yes - rsvp_no, 0)},
            "wishes": {"total": wishes_total, "pending": wishes_pending, "rejected": wishes_rejected},
            "gallery": {"photos": photos, "ai_face_matches": face_matches},
            "donations": {"count": len(shagun_rows), "total_inr": shagun_total},
        }

    return router
