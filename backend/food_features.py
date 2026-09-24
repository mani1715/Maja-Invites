"""
Food-donation feature — at the end of a published invitation, guests with
leftover food can reach nearby orphanages / child-care centers.

Data model: `food_donation_centers` documents
  { id, name, phone, address, city (lowercase; "" = applies everywhere/national),
    state, verified, created_at }

SAFETY: charity phone numbers must be correct — a wrong number causes real harm.
We seed only the official, verifiable national child helpline (1098). City-level
centers are added by the super-admin (verified) via the admin endpoints; until
then the public endpoint returns the national helpline as a safe fallback.
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("food_features")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CenterIn(BaseModel):
    name: str = Field(min_length=1)
    phone: str = Field(min_length=3)
    address: str = ""
    city: str = ""           # "" = national / everywhere
    state: str = ""
    verified: bool = True


async def seed_food_centers(db):
    """Idempotent — ensure the national helpline exists."""
    try:
        existing = await db.food_donation_centers.find_one({"id": "childline_national"})
        if not existing:
            await db.food_donation_centers.insert_one({
                "id": "childline_national",
                "name": "CHILDLINE India (national child helpline)",
                "phone": "1098",
                "address": "Toll-free, 24x7, all India",
                "city": "",
                "state": "",
                "verified": True,
                "national": True,
                "created_at": _now_iso(),
            })
            logger.info("[food] seeded national Childline 1098")
    except Exception as e:
        logger.warning("[food] seed failed: %s", e)


def build_food_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["food-donation"])

    # ---- public: centers for a city (+ national fallback) -----------------
    @router.get("/api/public/food-donation")
    async def list_for_city(city: str = ""):
        c = (city or "").strip().lower()
        out = []
        if c:
            cur = db.food_donation_centers.find({"city": c}, {"_id": 0})
            out = await cur.to_list(50)
        national = await db.food_donation_centers.find({"city": ""}, {"_id": 0}).to_list(10)
        return {
            "city": c,
            "centers": out,
            "national": national,
            "has_local": len(out) > 0,
        }

    # ---- super-admin: manage centers --------------------------------------
    @router.get("/api/admin/food-donation")
    async def admin_list(_: str = Depends(require_super_admin)):
        cur = db.food_donation_centers.find({}, {"_id": 0})
        centers = await cur.sort("city", 1).to_list(2000)
        return {"centers": centers, "count": len(centers)}

    @router.post("/api/admin/food-donation")
    async def admin_add(payload: CenterIn, _: str = Depends(require_super_admin)):
        doc = {
            "id": f"fdc_{uuid.uuid4().hex[:14]}",
            "name": payload.name.strip(),
            "phone": payload.phone.strip(),
            "address": payload.address.strip(),
            "city": payload.city.strip().lower(),
            "state": payload.state.strip(),
            "verified": payload.verified,
            "created_at": _now_iso(),
        }
        await db.food_donation_centers.insert_one(doc)
        return {"center": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/admin/food-donation/{center_id}")
    async def admin_delete(center_id: str, _: str = Depends(require_super_admin)):
        if center_id == "childline_national":
            raise HTTPException(400, "The national helpline cannot be removed.")
        res = await db.food_donation_centers.delete_one({"id": center_id})
        return {"deleted": res.deleted_count}

    return router
