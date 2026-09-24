"""
feature_flags_service — Phase 11 future-proofing.

A tiny, real primitive for shipping experimental / future features safely:
super-admin toggles named flags; the frontend reads them and gates UI. This is
the honest "Phase 11 (future)" deliverable — the switchboard future features
turn on through, rather than a fabricated feature.

Storage: db.feature_flags, one doc per key { id=key, key, label, description,
enabled, updated_at }.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Known experimental flags — seeded disabled unless noted. Frontend gates on these keys.
DEFAULT_FLAGS = [
    {"key": "experience_3d", "label": "3D invitation experience", "description": "WebGL cinematic hero backdrop (Phase 9).", "enabled": True},
    {"key": "ar_invites", "label": "AR invitation preview", "description": "View the invitation in augmented reality. Coming soon.", "enabled": False},
    {"key": "white_label", "label": "Enterprise white-label", "description": "Studio-branded portfolios (Phase 10).", "enabled": True},
    {"key": "ai_face_match", "label": "AI face-match selfies", "description": "Guests find their photos via a selfie. Owner-gated future feature.", "enabled": False},
]


class FlagIn(BaseModel):
    key: str
    label: Optional[str] = None
    description: Optional[str] = None
    enabled: bool = False


async def seed_feature_flags(db):
    """Idempotently ensure the known flags exist. Never overwrites an admin's toggle."""
    for f in DEFAULT_FLAGS:
        existing = await db.feature_flags.find_one({"id": f["key"]}, {"_id": 0})
        if not existing:
            await db.feature_flags.update_one(
                {"id": f["key"]},
                {"$set": {**f, "id": f["key"], "updated_at": _now()}},
                upsert=True,
            )


async def get_flags_map(db) -> dict:
    rows = await db.feature_flags.find({}, {"_id": 0}).to_list(500)
    return {r["key"]: bool(r.get("enabled")) for r in rows if r.get("key")}


def build_feature_flags_router(db, require_super_admin) -> APIRouter:
    router = APIRouter()

    @router.get("/api/feature-flags")
    async def public_flags():
        """Public — a { key: enabled } map the frontend gates on."""
        return {"flags": await get_flags_map(db)}

    @router.get("/api/admin/feature-flags")
    async def list_flags(_sa: str = Depends(require_super_admin)):
        rows = await db.feature_flags.find({}, {"_id": 0}).to_list(500)
        rows.sort(key=lambda r: r.get("key", ""))
        return {"flags": rows}

    @router.post("/api/admin/feature-flags")
    async def upsert_flag(payload: FlagIn, _sa: str = Depends(require_super_admin)):
        existing = await db.feature_flags.find_one({"id": payload.key}, {"_id": 0}) or {}
        doc = {
            **existing,
            "id": payload.key, "key": payload.key,
            "label": payload.label if payload.label is not None else existing.get("label", payload.key),
            "description": payload.description if payload.description is not None else existing.get("description", ""),
            "enabled": bool(payload.enabled),
            "updated_at": _now(),
        }
        await db.feature_flags.update_one({"id": payload.key}, {"$set": doc}, upsert=True)
        return doc

    @router.delete("/api/admin/feature-flags/{key}")
    async def delete_flag(key: str, _sa: str = Depends(require_super_admin)):
        await db.feature_flags.delete_one({"id": key})
        return {"deleted": True, "key": key}

    return router
