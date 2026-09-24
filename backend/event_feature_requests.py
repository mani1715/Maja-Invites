"""
event_feature_requests.py — "I need something extra on my link" (owner brief, 2026-07).
=======================================================================================

Why
    A host has paid, built their invitation, and then realises they want something the
    plan does not include — a feature from a higher plan, or something we do not sell
    yet at all. Previously their only route was to find a phone number. Now they raise
    a request from inside the builder, the owner sees it in the super-admin queue,
    talks to them, and either grants the feature onto that one link or builds it.

Design (deliberately small, reusing what exists)
    * One collection, `event_feature_requests`, with a tiny status machine:
        new → in_review → { approved (feature granted) | declined } , or `closed`.
    * "Approve" does the real work: it appends the requested feature keys to the
      event's `granted_features`, so the invitation gains the feature immediately —
      the same field `event_plan_gating` reads. No second gating path.
    * Requests are per-event and ownership-checked; a host can only see their own.
    * Free-text is allowed (for things we do not sell yet) — those approve with a
      note and no feature key, and the owner delivers manually.

Dependencies: event_rbac (ownership), event_plan_gating (the grant), event_registry.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

import event_registry as registry
import event_pricing
from event_plan_gating import packable_keys

STATUSES = ("new", "in_review", "approved", "declined", "closed")
OPEN_STATUSES = ("new", "in_review")
MAX_OPEN_PER_EVENT = 10          # stops a runaway client/script filling the queue


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    import uuid
    return f"freq_{uuid.uuid4().hex[:12]}"


def _clean(d: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(d or {})
    d.pop("_id", None)
    return d


def _owner_id(current: Dict[str, Any]) -> Optional[str]:
    return (current or {}).get("user_id") or (current or {}).get("admin_id")


async def _owned_event(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    ev = await db.events.find_one({"event_id": event_id})
    if not ev or ev.get("deleted_at"):
        raise HTTPException(404, "Event not found")
    if ev.get("owner_id") != _owner_id(current) and (current or {}).get("kind") != "super_admin":
        raise HTTPException(403, "Not your event")
    return _clean(ev)


async def create_request(db, event_id: str, current: Dict[str, Any],
                         *, feature_keys: List[str], message: str,
                         contact: str = "") -> Dict[str, Any]:
    ev = await _owned_event(db, event_id, current)
    message = (message or "").strip()
    vocab = packable_keys()
    keys = [k for k in (feature_keys or []) if k in vocab]
    if not keys and len(message) < 10:
        raise HTTPException(422, "Pick a feature or describe what you need (at least 10 characters).")

    open_now = [r async for r in db.event_feature_requests.find({"event_id": event_id})]
    open_now = [r for r in open_now if r.get("status") in OPEN_STATUSES]
    if len(open_now) >= MAX_OPEN_PER_EVENT:
        raise HTTPException(409, "You already have several open requests — we'll get to them shortly.")

    doc = {
        "id": _uid(), "request_id": None, "event_id": event_id,
        "event_title": ev.get("title") or ev.get("event_type"),
        "event_type": ev.get("event_type"), "owner_id": ev.get("owner_id"),
        "feature_keys": keys, "message": message[:2000], "contact": (contact or "")[:120],
        "status": "new", "owner_note": "", "created_at": _now(), "updated_at": _now(),
    }
    doc["request_id"] = doc["id"]
    await db.event_feature_requests.insert_one(doc)
    return _clean(doc)


async def list_for_event(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    await _owned_event(db, event_id, current)
    rows = [_clean(r) async for r in db.event_feature_requests.find({"event_id": event_id})]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"requests": rows}


async def catalog(db, event_type: str = "ganesh_chaturthi") -> Dict[str, Any]:
    """What a host can ask for: every sellable feature with its price, flagged with
    whether this event already has it."""
    feats = await event_pricing.list_feature_prices(db, event_type)
    return {"features": feats}


# --------------------------------------------------------------------------- #
# super-admin side
# --------------------------------------------------------------------------- #
async def admin_list(db, status: str = "") -> Dict[str, Any]:
    rows = [_clean(r) async for r in db.event_feature_requests.find({})]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    counts: Dict[str, int] = {}
    for r in rows:
        counts[r.get("status", "new")] = counts.get(r.get("status", "new"), 0) + 1
    return {"requests": rows, "counts": counts}


async def admin_update(db, request_id: str, *, status: str = "", note: str = "",
                       grant: bool = False, actor: str = "super_admin") -> Dict[str, Any]:
    req = await db.event_feature_requests.find_one({"id": request_id})
    if not req:
        raise HTTPException(404, "Request not found")
    req = _clean(req)
    if status and status not in STATUSES:
        raise HTTPException(422, f"status must be one of {STATUSES}")

    granted: List[str] = []
    if grant and req.get("feature_keys"):
        ev = await db.events.find_one({"event_id": req["event_id"]})
        if not ev:
            raise HTTPException(404, "Event not found")
        current = ev.get("granted_features")
        # None = "ungated, everything visible" — adding a key there would ACCIDENTALLY
        # start gating the whole invitation, so leave it alone.
        if isinstance(current, list):
            merged = list(dict.fromkeys([*current, *req["feature_keys"]]))
            await db.events.update_one({"event_id": req["event_id"]},
                                       {"$set": {"granted_features": merged, "updated_at": _now()}})
            granted = req["feature_keys"]

    patch = {"updated_at": _now(), "handled_by": actor}
    if status:
        patch["status"] = status
    elif grant:
        patch["status"] = "approved"
    if note:
        patch["owner_note"] = note[:2000]
    if granted:
        patch["granted_at"] = _now()
    await db.event_feature_requests.update_one({"id": request_id}, {"$set": patch})
    out = await db.event_feature_requests.find_one({"id": request_id})
    return {"saved": True, "granted": granted, "request": _clean(out)}


def build_event_feature_request_router(db, get_current_buyer, require_super_admin=None) -> APIRouter:
    router = APIRouter(tags=["event-feature-requests"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/event-requests/catalog/{event_type}")
    async def _catalog(event_type: str):
        await _gate()
        return await catalog(db, event_type)

    @router.get("/api/event-requests/{event_id}")
    async def _list(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await list_for_event(db, event_id, current)

    @router.post("/api/event-requests/{event_id}")
    async def _create(event_id: str, body: Dict[str, Any] = Body(...),
                      current=Depends(get_current_buyer)):
        await _gate()
        return await create_request(db, event_id, current,
                                    feature_keys=body.get("feature_keys") or [],
                                    message=body.get("message") or "",
                                    contact=body.get("contact") or "")

    if require_super_admin is not None:
        @router.get("/api/admin/event-requests")
        async def _admin_list(status: str = "", _s=Depends(require_super_admin)):
            return await admin_list(db, status)

        @router.post("/api/admin/event-requests/{request_id}")
        async def _admin_update(request_id: str, body: Dict[str, Any] = Body(...),
                                _s=Depends(require_super_admin)):
            return await admin_update(db, request_id,
                                      status=body.get("status") or "",
                                      note=body.get("note") or "",
                                      grant=bool(body.get("grant")),
                                      actor=str(_s))

    return router
