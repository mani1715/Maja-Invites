"""
event_admin_service.py — MAJA Dynamic Event Engine: platform administration (Spec 09).
======================================================================================

Purpose
    Cross-event operational control for the platform owner: a platform dashboard,
    global event search, moderation (approve/reject/suspend/restore/feature/hide/
    flag/verify), ownership transfer, clone, admin soft-delete + trash restore,
    audit-log viewing, feature-flag control (incl. turning the module ON), and the
    category list. Reuses the existing MAJA admin guard (`require_super_admin`) — the
    control plane is NOT behind the module flag, so the owner can flip it on here.

Scope (Spec 09 honoured per Master Guide §Never Guess)
    * Enforcement is super-admin-only today. The 4-tier admin split (Platform Admin /
      Moderator / Support Executive) + granular permissions is Doc 10 (RBAC) — not
      invented here.
    * Revenue / subscription / active-user aggregates reuse the EXISTING super-admin
      dashboards; this dashboard reports what is groundable from event data
      (event counts, donations, media bytes, invitation views).
    * Async report generation, disaster-recovery jobs (rebuild thumbnails/indexes)
      are deferred to their own passes.

Dependencies  event_registry, event_lifecycle_service (_uid/_now/_audit/_slugify),
            event_children_service (child collections for clone), app_settings
Side effects  moderation/flag fields on events, cloned rows, flag rows, audit rows.
            Never hard-deletes an event (Spec 09 §Audit — records are permanent).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry
from event_lifecycle_service import _uid, _now, _slugify, PUBLISHED
from event_children_service import CHILD_SPECS


# moderation actions → the field patch they apply (Spec 09 §Moderation)
_MODERATION: Dict[str, Dict[str, Any]] = {
    "approve":  {"moderation_status": "approved"},
    "reject":   {"moderation_status": "rejected"},
    "suspend":  {"is_suspended": True, "is_public": False},
    "restore":  {"is_suspended": False},          # visibility recomputed below
    "feature":  {"is_featured": True},
    "unfeature": {"is_featured": False},
    "hide":     {"is_hidden": True},
    "unhide":   {"is_hidden": False},
    "flag":     {"is_flagged": True},
    "unflag":   {"is_flagged": False},
    "verify":   {"is_verified": True},
}

# feature flags the owner may toggle from the admin panel (Spec 09 §Configuration)
_MANAGED_FLAGS = ("ganesh_module_enabled", "storage_pool_enabled", "new_pricing_enabled")


async def _audit_admin(db, admin_id: str, event_id: Optional[str], action: str,
                       *, before: Any = None, after: Any = None, reason: str = "") -> None:
    try:
        await db.event_audit_logs.insert_one({
            "log_id": _uid("log"), "event_id": event_id, "user_id": admin_id,
            "actor": "super_admin", "action": action, "module": "admin",
            "old_value": before, "new_value": after, "reason": reason,
            "created_at": _now()})
    except Exception:
        pass


async def _all_events(db, *, include_deleted: bool = False) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for e in db.events.find({}):
        if not include_deleted and e.get("deleted_at"):
            continue
        e.pop("_id", None)
        out.append(e)
    return out


async def _load_any(db, event_id: str, *, include_deleted: bool = False) -> Dict[str, Any]:
    doc = await db.events.find_one({"event_id": event_id})
    if not doc or (doc.get("deleted_at") and not include_deleted):
        raise HTTPException(404, "Event not found")
    doc.pop("_id", None)
    return doc


# --------------------------------------------------------------------------- #
# dashboard (Spec 09 §Dashboard)
# --------------------------------------------------------------------------- #
async def platform_dashboard(db) -> Dict[str, Any]:
    events = await _all_events(db)
    by_status: Dict[str, int] = {}
    featured = flagged = suspended = 0
    for e in events:
        by_status[e.get("status", "draft")] = by_status.get(e.get("status", "draft"), 0) + 1
        featured += 1 if e.get("is_featured") else 0
        flagged += 1 if e.get("is_flagged") else 0
        suspended += 1 if e.get("is_suspended") else 0

    donations_received = media_bytes = views = 0
    async for d in db.donations.find({}):
        if not d.get("deleted_at") and d.get("status") == "received":
            try:
                donations_received += float(d.get("amount") or 0)
            except (TypeError, ValueError):
                pass
    async for m in db.gallery.find({}):
        if not m.get("deleted_at"):
            media_bytes += int(m.get("size_bytes") or 0)
    async for inv in db.invitations.find({}):
        views += int(inv.get("view_count") or 0)

    return {
        "events": {
            "total": len(events),
            "published": by_status.get("published", 0) + by_status.get("live", 0),
            "draft": by_status.get("draft", 0) + by_status.get("incomplete", 0),
            "ready_for_review": by_status.get("ready_for_review", 0),
            "completed": by_status.get("completed", 0),
            "archived": by_status.get("archived", 0),
            "by_status": by_status,
        },
        "featured": featured, "flagged": flagged, "suspended": suspended,
        "pending_reviews": by_status.get("ready_for_review", 0) + flagged,
        "total_donations": round(donations_received, 2),
        "event_media_bytes": media_bytes,
        "invitation_views": views,
        # revenue / subscriptions / active users reuse the existing super-admin dashboards
        "note": "revenue & subscription metrics live in the existing super-admin dashboards",
    }


# --------------------------------------------------------------------------- #
# search (Spec 09 §Search — cross-event, paginated)
# --------------------------------------------------------------------------- #
async def search_events(db, *, q: str = "", status: str = "", event_type: str = "",
                        owner_id: str = "", page: int = 1, limit: int = 25) -> Dict[str, Any]:
    rows = await _all_events(db, include_deleted=True)
    ql = (q or "").lower()
    def match(e):
        if status and e.get("status") != status:
            return False
        if event_type and e.get("event_type") != event_type:
            return False
        if owner_id and e.get("owner_id") != owner_id:
            return False
        if ql and ql not in str(e.get("title", "")).lower() and ql not in str(e.get("publish_slug", "")).lower():
            return False
        return True
    rows = [e for e in rows if match(e)]
    rows.sort(key=lambda e: e.get("updated_at") or "", reverse=True)
    total = len(rows)
    page = max(1, int(page)); limit = max(1, min(int(limit), 100))
    start = (page - 1) * limit
    slim = [{"event_id": e["event_id"], "title": e.get("title"), "status": e.get("status"),
             "event_type": e.get("event_type"), "owner_id": e.get("owner_id"),
             "publish_slug": e.get("publish_slug"), "is_featured": e.get("is_featured", False),
             "is_suspended": e.get("is_suspended", False), "is_flagged": e.get("is_flagged", False),
             "deleted": bool(e.get("deleted_at")), "updated_at": e.get("updated_at")}
            for e in rows[start:start + limit]]
    return {"items": slim, "total": total, "page": page, "pages": (total + limit - 1) // limit}


# --------------------------------------------------------------------------- #
# moderation + admin actions
# --------------------------------------------------------------------------- #
async def moderate_event(db, admin_id: str, event_id: str, action: str,
                         reason: str = "") -> Dict[str, Any]:
    patch = _MODERATION.get(action)
    if patch is None:
        raise HTTPException(404, f"Unknown moderation action '{action}'")
    event = await _load_any(db, event_id)
    upd = dict(patch)
    if action == "restore":                       # re-expose only if it was published
        upd["is_public"] = event.get("status") == PUBLISHED
    upd["updated_at"] = _now()
    await db.events.update_one({"event_id": event_id}, {"$set": upd})
    await _audit_admin(db, admin_id, event_id, f"moderate_{action}",
                       before={k: event.get(k) for k in patch}, after=upd, reason=reason)
    return {"event_id": event_id, "action": action, **{k: upd[k] for k in patch}}


async def transfer_ownership(db, admin_id: str, event_id: str, new_owner_id: str) -> Dict[str, Any]:
    if not new_owner_id:
        raise HTTPException(422, "A new owner id is required.")
    event = await _load_any(db, event_id)
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"owner_id": new_owner_id, "updated_at": _now()}})
    await _audit_admin(db, admin_id, event_id, "transfer_ownership",
                       before={"owner_id": event.get("owner_id")}, after={"owner_id": new_owner_id})
    return {"event_id": event_id, "owner_id": new_owner_id}


async def clone_event(db, admin_id: str, event_id: str,
                      new_owner_id: Optional[str] = None) -> Dict[str, Any]:
    """Duplicate an event as a fresh DRAFT (root + all child collections).
    Media metadata is cloned by reference; the binary files are NOT copied."""
    src = await _load_any(db, event_id, include_deleted=True)
    new_id = _uid("evt")
    clone = {k: v for k, v in src.items() if k not in ("_id",)}
    clone.update({
        "event_id": new_id, "id": new_id,
        "title": f"{src.get('title') or 'Event'} (Copy)",
        "status": "draft", "is_public": False, "publish_slug": None,
        "published_at": None, "current_version": 0, "edit_count": 0,
        "is_featured": False, "is_suspended": False, "is_flagged": False,
        "is_verified": False, "is_hidden": False, "deleted_at": None,
        "owner_id": new_owner_id or src.get("owner_id"),
        "created_at": _now(), "updated_at": _now(),
    })
    await db.events.insert_one(clone)

    cloned_children = 0
    for coll in list(CHILD_SPECS.keys()) + ["venues", "organizers"]:
        async for row in getattr(db, coll).find({"event_id": event_id}):
            if row.get("deleted_at"):
                continue
            r = {k: v for k, v in row.items() if k != "_id"}
            cid = _uid(coll[:3])
            r.update({"id": cid, "child_id": cid, "event_id": new_id,
                      "created_at": _now(), "updated_at": _now()})
            await getattr(db, coll).insert_one(r)
            cloned_children += 1

    await _audit_admin(db, admin_id, new_id, "clone_event",
                       before={"source": event_id}, after={"clone": new_id})
    return {"event_id": new_id, "cloned_children": cloned_children, "status": "draft"}


async def admin_soft_delete(db, admin_id: str, event_id: str, reason: str = "") -> Dict[str, Any]:
    doc = await _load_any(db, event_id)
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"deleted_at": _now(), "is_public": False, "updated_at": _now()}})
    await _audit_admin(db, admin_id, event_id, "admin_soft_delete", reason=reason)
    # pool mirror follows the app trash (5-day recycle, then the daily job purges)
    try:
        from storage_pool_hooks import on_event_deleted
        on_event_deleted(db, event_id, doc.get("owner_id"))
    except Exception:
        pass
    return {"event_id": event_id, "deleted": True}


async def admin_restore_deleted(db, admin_id: str, event_id: str) -> Dict[str, Any]:
    doc = await _load_any(db, event_id, include_deleted=True)
    if not doc.get("deleted_at"):
        raise HTTPException(409, "This event is not in trash.")
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"updated_at": _now()}, "$unset": {"deleted_at": ""}})
    await _audit_admin(db, admin_id, event_id, "admin_restore_deleted")
    # cancel the pending pool soft-delete so the mirror is not purged
    try:
        from storage_pool_hooks import on_event_restored
        on_event_restored(db, event_id)
    except Exception:
        pass
    return {"event_id": event_id, "restored": True}


# --------------------------------------------------------------------------- #
# audit log viewing (Spec 09 §Audit Logs)
# --------------------------------------------------------------------------- #
async def list_audit_logs(db, *, event_id: str = "", action: str = "",
                          page: int = 1, limit: int = 50) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    async for r in db.event_audit_logs.find({}):
        r.pop("_id", None)
        if event_id and r.get("event_id") != event_id:
            continue
        if action and r.get("action") != action:
            continue
        rows.append(r)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    total = len(rows)
    page = max(1, int(page)); limit = max(1, min(int(limit), 200))
    start = (page - 1) * limit
    return {"items": rows[start:start + limit], "total": total, "page": page,
            "pages": (total + limit - 1) // limit}


# --------------------------------------------------------------------------- #
# platform configuration (Spec 09 §Configuration)
# --------------------------------------------------------------------------- #
async def list_flags(db) -> Dict[str, Any]:
    out = {}
    for key in _MANAGED_FLAGS:
        doc = await db.app_settings.find_one({"key": key})
        out[key] = bool(doc and doc.get("value") is True)
    return {"flags": out}


async def set_flag(db, admin_id: str, key: str, value: bool) -> Dict[str, Any]:
    if key not in _MANAGED_FLAGS:
        raise HTTPException(404, f"Unknown or unmanaged flag '{key}'")
    before = await db.app_settings.find_one({"key": key})
    await db.app_settings.update_one(
        {"key": key}, {"$set": {"key": key, "value": bool(value), "updated_at": _now()}}, upsert=True)
    await _audit_admin(db, admin_id, None, "flag_set",
                       before={key: bool(before and before.get("value"))}, after={key: bool(value)})
    return {"key": key, "value": bool(value)}


async def list_categories(db) -> Dict[str, Any]:
    return {"categories": [{"event_type": et, "name": c["name"], "slug": c.get("slug"),
                            "category": c.get("category"), "status": c.get("status", "active")}
                           for et, c in registry.EVENT_TYPES.items()]}


# --------------------------------------------------------------------------- #
# router (super-admin only; NOT behind the module flag — this is the control plane)
# --------------------------------------------------------------------------- #
def build_event_admin_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(prefix="/api/admin/events", tags=["event-admin"])

    @router.get("/dashboard")
    async def dashboard(admin_id: str = Depends(require_super_admin)):
        return await platform_dashboard(db)

    @router.get("/search")
    async def search(q: str = "", status: str = "", event_type: str = "", owner_id: str = "",
                     page: int = 1, limit: int = 25, admin_id: str = Depends(require_super_admin)):
        return await search_events(db, q=q, status=status, event_type=event_type,
                                   owner_id=owner_id, page=page, limit=limit)

    @router.get("/audit-logs")
    async def audit(event_id: str = "", action: str = "", page: int = 1, limit: int = 50,
                    admin_id: str = Depends(require_super_admin)):
        return await list_audit_logs(db, event_id=event_id, action=action, page=page, limit=limit)

    @router.get("/config/flags")
    async def flags(admin_id: str = Depends(require_super_admin)):
        return await list_flags(db)

    @router.put("/config/flags/{key}")
    async def flag_set(key: str, body: Dict[str, Any] = Body(...), admin_id: str = Depends(require_super_admin)):
        return await set_flag(db, admin_id, key, bool((body or {}).get("value")))

    @router.get("/config/categories")
    async def categories(admin_id: str = Depends(require_super_admin)):
        return await list_categories(db)

    @router.post("/{event_id}/moderate")
    async def moderate(event_id: str, body: Dict[str, Any] = Body(...),
                       admin_id: str = Depends(require_super_admin)):
        return await moderate_event(db, admin_id, event_id, (body or {}).get("action", ""),
                                    (body or {}).get("reason", ""))

    @router.post("/{event_id}/transfer")
    async def transfer(event_id: str, body: Dict[str, Any] = Body(...),
                       admin_id: str = Depends(require_super_admin)):
        return await transfer_ownership(db, admin_id, event_id, (body or {}).get("new_owner_id", ""))

    @router.post("/{event_id}/clone")
    async def clone(event_id: str, body: Dict[str, Any] = Body(default={}),
                    admin_id: str = Depends(require_super_admin)):
        return await clone_event(db, admin_id, event_id, (body or {}).get("new_owner_id"))

    @router.delete("/{event_id}")
    async def delete(event_id: str, reason: str = "", admin_id: str = Depends(require_super_admin)):
        return await admin_soft_delete(db, admin_id, event_id, reason)

    @router.post("/{event_id}/restore-deleted")
    async def restore_deleted(event_id: str, admin_id: str = Depends(require_super_admin)):
        return await admin_restore_deleted(db, admin_id, event_id)

    return router
