"""
custom_design_service.py — Custom Design Requests & Profile Revision History.

Enables photographers to request design assistance or bespoke stage-matching design work.
Super-admin receives and fulfills the requests in an authorized queue, saving revisions
while preserving the same public URL.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("custom_design")


class CustomDesignRequestCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    requirements: Optional[str] = Field(default=None, max_length=5000)
    description: Optional[str] = Field(default=None, max_length=5000)
    kind: Optional[str] = Field(default=None)  # "assistance" | "bespoke_paid" | "bespoke"
    request_type: Optional[str] = Field(default=None)
    profile_id: Optional[str] = None
    stage_theme: Optional[str] = None
    attachments: List[str] = Field(default_factory=list)


class CustomDesignRequestUpdate(BaseModel):
    status: Optional[str] = None  # "pending" | "in_progress" | "quote_provided" | "completed" | "rejected"
    quoted_amount_paise: Optional[int] = None
    quoted_price: Optional[float] = None
    admin_notes: Optional[str] = None
    requirements: Optional[str] = None
    description: Optional[str] = None
    attachments: Optional[List[str]] = None


def build_custom_design_router(db, require_admin, require_super_admin) -> APIRouter:
    router = APIRouter(prefix="/api/admin", tags=["custom-design-requests"])

    @router.post("/custom-design-requests")
    async def create_request(
        payload: CustomDesignRequestCreate,
        admin: dict = Depends(require_admin),
    ):
        studio_id = admin.get("admin_id") or admin.get("id")
        # Validate profile ownership if linked
        if payload.profile_id:
            query = {"id": payload.profile_id}
            if admin.get("role") != "super_admin":
                query["admin_id"] = studio_id
            profile = await db.profiles.find_one(query, {"_id": 0, "id": 1, "title": 1, "slug": 1})
            if not profile:
                raise HTTPException(status_code=404, detail="Linked invitation profile not found or access denied")

        req_text = (payload.requirements or payload.description or "").strip()
        if len(req_text) < 5:
            req_text = payload.title.strip()

        k = payload.kind or payload.request_type or "assistance"
        kind_norm = "bespoke_paid" if k in ("bespoke", "bespoke_paid") else "assistance"

        req_id = f"cdr_{uuid.uuid4().hex[:16]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": req_id,
            "studio_id": studio_id,
            "admin_id": studio_id,
            "creator_email": admin.get("email"),
            "profile_id": payload.profile_id,
            "title": payload.title.strip(),
            "requirements": req_text,
            "description": req_text,
            "kind": kind_norm,
            "request_type": kind_norm,
            "stage_theme": payload.stage_theme,
            "attachments": payload.attachments or [],
            "status": "pending",
            "quoted_amount_paise": None,
            "quoted_price": None,
            "payment_id": None,
            "admin_notes": None,
            "assigned_admin_id": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.custom_design_requests.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/custom-design-requests")
    async def list_requests(
        status: Optional[str] = None,
        profile_id: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        is_super = admin.get("role") == "super_admin"
        studio_id = admin.get("admin_id") or admin.get("id")

        q: Dict[str, Any] = {}
        if not is_super:
            q["studio_id"] = studio_id
        if status and status != "all":
            q["status"] = status
        if profile_id:
            q["profile_id"] = profile_id

        cur = db.custom_design_requests.find(q, {"_id": 0})
        requests = await cur.sort("created_at", -1).to_list(200)
        for r in requests:
            if not r.get("description"):
                r["description"] = r.get("requirements", "")
            if not r.get("request_type"):
                r["request_type"] = r.get("kind", "assistance")
            if r.get("quoted_price") is None and r.get("quoted_amount_paise"):
                r["quoted_price"] = r["quoted_amount_paise"] / 100
        return {"items": requests, "requests": requests, "total": len(requests)}

    @router.get("/custom-design-requests/{request_id}")
    async def get_request(
        request_id: str,
        admin: dict = Depends(require_admin),
    ):
        is_super = admin.get("role") == "super_admin"
        studio_id = admin.get("admin_id") or admin.get("id")

        q: Dict[str, Any] = {"id": request_id}
        if not is_super:
            q["studio_id"] = studio_id

        req_doc = await db.custom_design_requests.find_one(q, {"_id": 0})
        if not req_doc:
            raise HTTPException(status_code=404, detail="Custom design request not found")
        if not req_doc.get("description"):
            req_doc["description"] = req_doc.get("requirements", "")
        if not req_doc.get("request_type"):
            req_doc["request_type"] = req_doc.get("kind", "assistance")
        if req_doc.get("quoted_price") is None and req_doc.get("quoted_amount_paise"):
            req_doc["quoted_price"] = req_doc["quoted_amount_paise"] / 100
        return req_doc

    @router.patch("/custom-design-requests/{request_id}")
    async def update_request(
        request_id: str,
        payload: CustomDesignRequestUpdate,
        admin: dict = Depends(require_admin),
    ):
        is_super = admin.get("role") == "super_admin"
        studio_id = admin.get("admin_id") or admin.get("id")

        q: Dict[str, Any] = {"id": request_id}
        if not is_super:
            q["studio_id"] = studio_id

        existing = await db.custom_design_requests.find_one(q, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Custom design request not found")

        updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

        if is_super:
            if payload.status:
                updates["status"] = payload.status
            if payload.quoted_price is not None:
                updates["quoted_price"] = payload.quoted_price
                updates["quoted_amount_paise"] = int(payload.quoted_price * 100)
            elif payload.quoted_amount_paise is not None:
                updates["quoted_amount_paise"] = payload.quoted_amount_paise
                updates["quoted_price"] = payload.quoted_amount_paise / 100
            if payload.admin_notes is not None:
                updates["admin_notes"] = payload.admin_notes
        else:
            # Photographer can only modify pending requests
            if existing.get("status") != "pending":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot edit request after work or review has started."
                )
            req_text = payload.requirements or payload.description
            if req_text:
                updates["requirements"] = req_text.strip()
                updates["description"] = req_text.strip()
            if payload.attachments is not None:
                updates["attachments"] = payload.attachments

        await db.custom_design_requests.update_one({"id": request_id}, {"$set": updates})
        updated = await db.custom_design_requests.find_one({"id": request_id}, {"_id": 0})
        if updated:
            if not updated.get("description"):
                updated["description"] = updated.get("requirements", "")
            if not updated.get("request_type"):
                updated["request_type"] = updated.get("kind", "assistance")
            if updated.get("quoted_price") is None and updated.get("quoted_amount_paise"):
                updated["quoted_price"] = updated["quoted_amount_paise"] / 100
        return updated

    # ---------------- Revisions API ----------------
    @router.get("/profiles/{profile_id}/revisions")
    async def get_profile_revisions(
        profile_id: str,
        admin: dict = Depends(require_admin),
    ):
        is_super = admin.get("role") == "super_admin"
        studio_id = admin.get("admin_id") or admin.get("id")

        # Verify profile ownership
        pq: Dict[str, Any] = {"id": profile_id}
        if not is_super:
            pq["admin_id"] = studio_id
        prof = await db.profiles.find_one(pq, {"_id": 0, "id": 1, "title": 1, "slug": 1, "version": 1})
        if not prof:
            raise HTTPException(status_code=404, detail="Profile not found or access denied")

        cur = db.profile_revisions.find({"profile_id": profile_id}, {"_id": 0})
        revs = await cur.sort("created_at", -1).to_list(50)
        return {"revisions": revs, "current_version": prof.get("version", 1)}

    @router.post("/profiles/{profile_id}/revisions/{revision_id}/restore")
    async def restore_profile_revision(
        profile_id: str,
        revision_id: str,
        admin: dict = Depends(require_admin),
    ):
        is_super = admin.get("role") == "super_admin"
        studio_id = admin.get("admin_id") or admin.get("id")

        # Verify profile ownership
        pq: Dict[str, Any] = {"id": profile_id}
        if not is_super:
            pq["admin_id"] = studio_id
        current_prof = await db.profiles.find_one(pq, {"_id": 0})
        if not current_prof:
            raise HTTPException(status_code=404, detail="Profile not found or access denied")

        rev = await db.profile_revisions.find_one({"id": revision_id, "profile_id": profile_id}, {"_id": 0})
        if not rev:
            raise HTTPException(status_code=404, detail="Revision snapshot not found")

        snapshot = rev.get("snapshot") or {}
        if not snapshot:
            raise HTTPException(status_code=400, detail="Revision snapshot is empty")

        # Protect core identity: id, slug, admin_id must remain current
        restore_data = dict(snapshot)
        restore_data["id"] = current_prof["id"]
        restore_data["slug"] = current_prof["slug"]
        restore_data["admin_id"] = current_prof["admin_id"]
        restore_data["version"] = (current_prof.get("version", 1)) + 1
        restore_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Save current state as another revision before rolling back
        pre_restore_rev = {
            "id": f"rev_{uuid.uuid4().hex[:16]}",
            "profile_id": profile_id,
            "admin_id": studio_id,
            "role": admin.get("role"),
            "version": current_prof.get("version", 1),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "snapshot": current_prof,
            "note": f"Auto-saved prior to restoring revision {revision_id}",
        }
        await db.profile_revisions.insert_one(pre_restore_rev)

        await db.profiles.update_one({"id": profile_id}, {"$set": restore_data})
        restored = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        return {"success": True, "restored_version": restore_data["version"], "profile": restored}

    return router
