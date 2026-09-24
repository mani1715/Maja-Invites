"""
drafts_service.py — Phase 4: universal autosave / draft persistence.

Every form in the platform (onboarding, design configuration, portfolio editor,
studio profile, ...) autosaves here so a user never loses entered data across
refresh, tab close, network/power failure, or a different device.

Model (tables from schema.sql):
  * drafts          — one row per (owner, form_key). Latest snapshot in data.payload.
  * draft_versions  — append-only history (undo / restore points).

Save is an UPSERT keyed on (owner_id, form_key): the frontend PUTs the whole
form state on a debounce; we bump `version`, stamp `updated_at`, and append the
prior snapshot to draft_versions so history is preserved. Resume returns the
latest payload + version + last-saved timestamp so the UI can show a "draft
restored / last saved 10s ago" indicator.

Wired in server.py:
    from drafts_service import build_drafts_router
    app.include_router(build_drafts_router(db, require_admin))
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("drafts")

MAX_VERSIONS = 20  # keep the last N snapshots per draft


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SaveDraftRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)
    # optional client hint for conflict awareness (last version the client had)
    base_version: Optional[int] = None


def build_drafts_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["drafts"])

    def _draft_id(owner_id: str, form_key: str) -> str:
        # deterministic id so upsert is a single stable row per (owner, form)
        return f"draft_{owner_id}_{form_key}".replace("/", "_")[:200]

    @router.put("/api/drafts/{form_key}")
    async def save_draft(form_key: str, req: SaveDraftRequest,
                         admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        did = _draft_id(owner_id, form_key)
        existing = await db.drafts.find_one({"id": did}, {"_id": 0})
        version = (existing.get("version", 0) if existing else 0) + 1

        # append prior snapshot to history before overwriting
        if existing:
            await db.draft_versions.insert_one({
                "id": uuid.uuid4().hex,
                "draft_id": did,
                "version": existing.get("version", 0),
                "payload": existing.get("payload", {}),
                "created_at": _now_iso(),
            })
            # prune old versions
            cur = db.draft_versions.find({"draft_id": did}, {"_id": 0})
            versions = await cur.sort("version", -1).to_list(MAX_VERSIONS + 10)
            for old in versions[MAX_VERSIONS:]:
                await db.draft_versions.delete_one({"id": old["id"]})

        doc = {
            "id": did,
            "owner_id": owner_id,
            "owner_kind": "admin",
            "form_key": form_key,
            "version": version,
            "payload": req.payload,
            "updated_at": _now_iso(),
        }
        if existing:
            await db.drafts.update_one({"id": did}, {"$set": doc})
        else:
            doc["created_at"] = _now_iso()
            await db.drafts.insert_one(doc)

        return {"form_key": form_key, "version": version, "saved_at": doc["updated_at"]}

    @router.get("/api/drafts/{form_key}")
    async def get_draft(form_key: str, admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        d = await db.drafts.find_one({"id": _draft_id(owner_id, form_key)}, {"_id": 0})
        if not d:
            return {"form_key": form_key, "exists": False, "payload": None, "version": 0}
        return {"form_key": form_key, "exists": True,
                "payload": d.get("payload", {}), "version": d.get("version", 0),
                "saved_at": d.get("updated_at")}

    @router.get("/api/drafts")
    async def list_drafts(admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        cur = db.drafts.find({"owner_id": owner_id}, {"_id": 0})
        rows = await cur.sort("updated_at", -1).to_list(100)
        return {"drafts": [{"form_key": r["form_key"], "version": r.get("version", 0),
                            "saved_at": r.get("updated_at")} for r in rows]}

    @router.delete("/api/drafts/{form_key}")
    async def delete_draft(form_key: str, admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        did = _draft_id(owner_id, form_key)
        await db.drafts.delete_one({"id": did})
        await db.draft_versions.delete_many({"draft_id": did})
        return {"form_key": form_key, "deleted": True}

    @router.get("/api/drafts/{form_key}/versions")
    async def list_versions(form_key: str, admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        did = _draft_id(owner_id, form_key)
        cur = db.draft_versions.find({"draft_id": did}, {"_id": 0})
        rows = await cur.sort("version", -1).to_list(MAX_VERSIONS)
        return {"form_key": form_key,
                "versions": [{"version": r["version"], "created_at": r.get("created_at")} for r in rows]}

    @router.post("/api/drafts/{form_key}/restore/{version}")
    async def restore_version(form_key: str, version: int,
                              admin: dict = Depends(require_admin)):
        owner_id = admin["admin_id"]
        did = _draft_id(owner_id, form_key)
        # Query by draft_id (text) only; match the int `version` in Python — the
        # id+data adapter mis-binds equality on generated non-text columns.
        cur = db.draft_versions.find({"draft_id": did}, {"_id": 0})
        rows = await cur.to_list(MAX_VERSIONS + 10)
        snap = next((r for r in rows if r.get("version") == version), None)
        if not snap:
            raise HTTPException(404, "Version not found")
        current = await db.drafts.find_one({"id": did}, {"_id": 0})
        new_version = (current.get("version", 0) if current else 0) + 1
        # snapshot current before restoring
        if current:
            await db.draft_versions.insert_one({
                "id": uuid.uuid4().hex, "draft_id": did,
                "version": current.get("version", 0), "payload": current.get("payload", {}),
                "created_at": _now_iso(),
            })
        await db.drafts.update_one(
            {"id": did},
            {"$set": {"payload": snap.get("payload", {}), "version": new_version,
                      "updated_at": _now_iso()}},
        )
        return {"form_key": form_key, "restored_from": version, "version": new_version}

    return router
