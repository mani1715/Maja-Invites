"""
white_label_service — Phase 10 enterprise white-labeling.

A studio can brand its public portfolio (and delivered invites) with its own
name / logo / accent colour and, when entitled, remove the "MAJA Invites"
credit. `hide_maja_branding` is only honoured for studios the super-admin has
granted the enterprise entitlement — it is not self-serve.

Storage: db.white_label, one doc per studio_id { id, brand_name, logo_url,
accent_color, tagline, custom_domain, hide_maja_branding, entitled, updated_at }.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WhiteLabelIn(BaseModel):
    brand_name: Optional[str] = None
    logo_url: Optional[str] = None
    accent_color: Optional[str] = None
    tagline: Optional[str] = None
    custom_domain: Optional[str] = None
    hide_maja_branding: Optional[bool] = None


async def get_white_label(db, studio_id: str) -> dict:
    """Public-safe applied branding for a studio. Always returns a usable doc."""
    doc = await db.white_label.find_one({"id": studio_id}, {"_id": 0}) or {}
    entitled = bool(doc.get("entitled"))
    return {
        "studio_id": studio_id,
        "brand_name": doc.get("brand_name") or None,
        "logo_url": doc.get("logo_url") or None,
        "accent_color": doc.get("accent_color") or None,
        "tagline": doc.get("tagline") or None,
        "custom_domain": doc.get("custom_domain") or None,
        # only entitled studios can actually strip the MAJA credit
        "hide_maja_branding": bool(doc.get("hide_maja_branding")) and entitled,
        "entitled": entitled,
    }


def build_white_label_router(db, require_admin, require_super_admin) -> APIRouter:
    router = APIRouter()

    @router.get("/api/studio/white-label")
    async def my_white_label(admin_id: str = Depends(require_admin)):
        # require_admin actually returns a DICT {'admin_id','role'} — normalize
        # so this keys the SAME studio the public read path keys by plain string
        # id (was the root cause of "studio saves branding, public page never
        # shows it"; see recon-portfolio-studio.md §15.1).
        sid = admin_id["admin_id"] if isinstance(admin_id, dict) else admin_id
        return await get_white_label(db, sid)

    @router.put("/api/studio/white-label")
    async def set_white_label(payload: WhiteLabelIn, admin_id: str = Depends(require_admin)):
        sid = admin_id["admin_id"] if isinstance(admin_id, dict) else admin_id
        existing = await db.white_label.find_one({"id": sid}, {"_id": 0}) or {}
        entitled = bool(existing.get("entitled"))
        patch = {k: v for k, v in payload.dict().items() if v is not None}
        # hide_maja_branding is entitlement-gated — silently ignored if not entitled
        if "hide_maja_branding" in patch and not entitled:
            patch["hide_maja_branding"] = False
        doc = {**existing, **patch, "id": sid, "entitled": entitled, "updated_at": _now()}
        await db.white_label.update_one({"id": sid}, {"$set": doc}, upsert=True)
        return await get_white_label(db, sid)

    @router.get("/api/public/studio/{studio_id}/white-label")
    async def public_white_label(studio_id: str):
        return await get_white_label(db, studio_id)

    # ---- super-admin: grant / revoke the enterprise white-label entitlement ----
    @router.post("/api/admin/white-label/{studio_id}/entitlement")
    async def set_entitlement(studio_id: str, enabled: bool, _sa: str = Depends(require_super_admin)):
        existing = await db.white_label.find_one({"id": studio_id}, {"_id": 0}) or {}
        doc = {**existing, "id": studio_id, "entitled": bool(enabled), "updated_at": _now()}
        if not enabled:
            doc["hide_maja_branding"] = False  # revoking pulls the credit back
        await db.white_label.update_one({"id": studio_id}, {"$set": doc}, upsert=True)
        return await get_white_label(db, studio_id)

    @router.get("/api/admin/white-label")
    async def list_white_label(_sa: str = Depends(require_super_admin)):
        rows = await db.white_label.find({}, {"_id": 0}).to_list(1000)
        return {"studios": rows, "entitled_count": len([r for r in rows if r.get("entitled")])}

    return router
