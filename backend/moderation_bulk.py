"""
moderation_bulk.py — mass community moderation tools (Phase 10).

Bulk wrappers over the moderation actions that previously only existed one-item-
at-a-time: bulk delete Pixora content, bulk resolve reports, and bulk suspend /
restore accounts. A consolidated open-reports queue is exposed for triage. Every
bulk action is audit-logged with the affected ids. Logic is module-level for
FakeDB testing.

    from moderation_bulk import build_moderation_bulk_router
    app.include_router(build_moderation_bulk_router(db, require_admin))
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("moderation")

CONTENT_COLLECTIONS = {
    "post": "pixora_posts", "reel": "pixora_reels",
    "story": "pixora_stories", "comment": "pixora_comments",
}
ACCOUNT_STATUSES = {"active", "suspended", "blocked"}
MAX_BULK = 200


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _audit(db, actor, action, meta):
    try:
        await db.audit_logs.insert_one({"id": uuid.uuid4().hex, "actor_id": actor,
                                        "action": action, "meta": meta, "created_at": _now()})
    except Exception:
        pass


async def bulk_delete_content(db, target_type: str, ids: List[str], actor: Optional[str] = None) -> Dict[str, Any]:
    coll = CONTENT_COLLECTIONS.get(target_type)
    if not coll:
        raise ValueError("Unknown target_type")
    ids = [i for i in (ids or []) if i][:MAX_BULK]
    if not ids:
        raise ValueError("No ids provided")
    deleted, not_found = 0, []
    for cid in ids:
        try:
            existing = await getattr(db, coll).find_one({"id": cid}, {"_id": 0})
            if not existing:
                not_found.append(cid)
                continue
            await getattr(db, coll).delete_one({"id": cid})
            deleted += 1
        except Exception as e:
            logger.warning("[moderation] delete %s/%s failed: %s", coll, cid, e)
            not_found.append(cid)
    await _audit(db, actor, "moderation.bulk_delete", {"target_type": target_type, "deleted": deleted, "ids": ids})
    return {"deleted": deleted, "not_found": not_found, "requested": len(ids)}


async def bulk_resolve_reports(db, report_ids: List[str], actor: Optional[str] = None) -> Dict[str, Any]:
    ids = [i for i in (report_ids or []) if i][:MAX_BULK]
    if not ids:
        raise ValueError("No report ids provided")
    resolved = 0
    for rid in ids:
        try:
            r = await db.pixora_reports.find_one({"id": rid}, {"_id": 0})
            if not r:
                continue
            await db.pixora_reports.update_one({"id": rid},
                                               {"$set": {"status": "resolved", "resolved_by": actor,
                                                         "resolved_at": _now()}})
            resolved += 1
        except Exception:
            pass
    await _audit(db, actor, "moderation.bulk_resolve_reports", {"resolved": resolved, "ids": ids})
    return {"resolved": resolved, "requested": len(ids)}


async def bulk_set_account_status(db, kind: str, ids: List[str], status: str,
                                  actor: Optional[str] = None) -> Dict[str, Any]:
    if status not in ACCOUNT_STATUSES:
        raise ValueError("Invalid status")
    ids = [i for i in (ids or []) if i][:MAX_BULK]
    if not ids:
        raise ValueError("No ids provided")
    coll, keyfield = ("admins", "id") if kind in ("photographer", "admin") else ("users", "user_id")
    updated, missing = 0, []
    for sid in ids:
        try:
            row = await getattr(db, coll).find_one({keyfield: sid}, {"_id": 0})
            if not row:
                missing.append(sid)
                continue
            await getattr(db, coll).update_one({keyfield: sid},
                                               {"$set": {"status": status, "status_changed_at": _now()}})
            updated += 1
        except Exception:
            missing.append(sid)
    action = "moderation.bulk_restore" if status == "active" else "moderation.bulk_suspend"
    await _audit(db, actor, action, {"kind": kind, "status": status, "updated": updated, "ids": ids})
    return {"updated": updated, "missing": missing, "status": status, "requested": len(ids)}


async def list_reports(db, status: str = "open", page: int = 1, page_size: int = 30) -> Dict[str, Any]:
    rows = [r for r in await db.pixora_reports.find({}, {"_id": 0}).to_list(100000)]
    for r in rows:
        r.pop("_id", None)
    if status and status != "all":
        rows = [r for r in rows if (r.get("status") or "open") == status]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    total = len(rows)
    page = max(1, int(page or 1)); page_size = min(100, max(1, int(page_size or 30)))
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total, "page": page,
            "pages": max(1, (total + page_size - 1) // page_size)}


class BulkDeleteIn(BaseModel):
    target_type: str
    ids: List[str]


class BulkReportsIn(BaseModel):
    report_ids: List[str]


class BulkStatusIn(BaseModel):
    kind: str
    ids: List[str]
    status: str


def build_moderation_bulk_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["moderation-bulk"])

    def _aid(admin):
        return admin.get("admin_id") if isinstance(admin, dict) else admin

    @router.get("/api/admin/moderation/reports")
    async def _reports(status: str = "open", page: int = 1, page_size: int = 30, admin=Depends(require_admin)):
        return await list_reports(db, status=status, page=page, page_size=page_size)

    @router.post("/api/admin/moderation/bulk-delete")
    async def _bulk_delete(payload: BulkDeleteIn, admin=Depends(require_admin)):
        try:
            return await bulk_delete_content(db, payload.target_type, payload.ids, actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.post("/api/admin/moderation/bulk-resolve-reports")
    async def _bulk_resolve(payload: BulkReportsIn, admin=Depends(require_admin)):
        try:
            return await bulk_resolve_reports(db, payload.report_ids, actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.post("/api/admin/moderation/bulk-account-status")
    async def _bulk_status(payload: BulkStatusIn, admin=Depends(require_admin)):
        try:
            return await bulk_set_account_status(db, payload.kind, payload.ids, payload.status, actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))

    return router
