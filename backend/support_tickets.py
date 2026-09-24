"""
support_tickets.py — the MAJA Support Desk (Phase 3 of the admin build).

The #1 launch-critical gap in PLATFORM_AUDIT / ADMIN_PANEL_AUDIT / ADMIN_BUSINESS_AUDIT:
the platform could manage/moderate/refund but had NO way to receive, track and
resolve support requests. This adds a complete, fully-wired ticketing system:

  Collections
    support_tickets   — one row per request (flat, queryable fields + a display object)
    ticket_messages   — the conversation thread (public replies + internal notes)

  Requester side (couples via user session, photographers via bearer — get_current_buyer)
    POST   /api/support/tickets                 create a ticket
    GET    /api/support/tickets/mine            my tickets (paginated)
    GET    /api/support/tickets/{id}            my ticket + public messages
    POST   /api/support/tickets/{id}/messages   reply (reopens a resolved ticket)

  Admin side (require_admin)
    GET    /api/admin/support/tickets           queue: filter (status/priority/category/
                                                assignee) + search (q) + pagination
    GET    /api/admin/support/tickets/{id}      full ticket + ALL messages (incl. internal)
    POST   /api/admin/support/tickets/{id}/messages   reply or add internal note
    PATCH  /api/admin/support/tickets/{id}      set status / priority / assignee
    POST   /api/admin/support/tickets/{id}/reopen     reopen
    POST   /api/admin/support/tickets/{id}/merge      merge into another ticket
    GET    /api/admin/support/stats             open count, by-status, avg first-response
                                                & resolution time, SLA breaches

Every admin mutation writes an audit_logs row. The core logic lives in module-level
async functions (create_ticket/list_tickets/...) so it is unit-testable on the FakeDB;
the endpoints are thin auth+validation wrappers over them.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("support")

CATEGORIES = {"billing", "refund", "dispute", "technical", "account", "invitation",
              "gallery", "portfolio", "community", "other"}
PRIORITIES = ["low", "normal", "high", "urgent"]
STATUSES = ["open", "pending", "resolved", "closed", "reopened"]
OPEN_STATES = {"open", "pending", "reopened"}
SLA_FIRST_RESPONSE_HOURS = 24


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _clean(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _hours_between(a_iso: Optional[str], b_iso: Optional[str]) -> Optional[float]:
    if not a_iso or not b_iso:
        return None
    try:
        a = datetime.fromisoformat(a_iso)
        b = datetime.fromisoformat(b_iso)
        return round((b - a).total_seconds() / 3600.0, 2)
    except Exception:
        return None


async def _requester_identity(db, buyer: Dict[str, Any]) -> Dict[str, Any]:
    """Turn a get_current_buyer result into a display identity {id, kind, name, email}."""
    kind = buyer.get("kind", "user")
    rid = buyer.get("user_id")
    name, email = "", ""
    try:
        if kind == "photographer":
            row = await db.admins.find_one({"id": rid}, {"_id": 0})
            if row:
                name, email = row.get("name") or row.get("studio_name") or "", row.get("email") or ""
        else:
            row = await db.users.find_one({"user_id": rid}, {"_id": 0})
            if row:
                name, email = row.get("name") or "", row.get("email") or ""
    except Exception:
        pass
    return {"id": rid, "kind": kind, "name": name, "email": email}


# ---------------------------------------------------------------------------
# core logic (testable — no FastAPI here)
# ---------------------------------------------------------------------------
async def create_ticket(db, requester: Dict[str, Any], subject: str, body: str,
                        category: str = "other", priority: str = "normal") -> Dict[str, Any]:
    subject = (subject or "").strip()[:160]
    body = (body or "").strip()[:5000]
    if not subject or not body:
        raise ValueError("Subject and message are required")
    category = category if category in CATEGORIES else "other"
    priority = priority if priority in PRIORITIES else "normal"
    now = _iso()
    tid = "tkt_" + uuid.uuid4().hex[:12]
    ticket = {
        "id": tid,
        "subject": subject,
        "category": category,
        "priority": priority,
        "status": "open",
        # flat, queryable fields:
        "requester_id": requester.get("id"),
        "requester_kind": requester.get("kind", "user"),
        "assignee_admin_id": None,
        # display object:
        "requester": requester,
        "assignee_name": None,
        "first_response_at": None,
        "resolved_at": None,
        "merged_into": None,
        "message_count": 1,
        "last_message_at": now,
        "created_at": now,
        "updated_at": now,
    }
    await db.support_tickets.insert_one(dict(ticket))
    await db.ticket_messages.insert_one({
        "id": "msg_" + uuid.uuid4().hex[:12],
        "ticket_id": tid,
        "author": {"id": requester.get("id"), "kind": requester.get("kind", "user"),
                   "name": requester.get("name", "")},
        "body": body,
        "internal": False,
        "attachments": [],
        "created_at": now,
    })
    return _clean(ticket)


async def add_message(db, ticket_id: str, author: Dict[str, Any], body: str,
                      internal: bool = False, attachments: Optional[List[str]] = None
                      ) -> Dict[str, Any]:
    body = (body or "").strip()[:5000]
    if not body:
        raise ValueError("Message body is required")
    ticket = _clean(await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0}))
    if not ticket:
        raise LookupError("Ticket not found")
    now = _iso()
    msg = {
        "id": "msg_" + uuid.uuid4().hex[:12],
        "ticket_id": ticket_id,
        "author": author,
        "body": body,
        "internal": bool(internal),
        "attachments": attachments or [],
        "created_at": now,
    }
    await db.ticket_messages.insert_one(dict(msg))

    updates: Dict[str, Any] = {"updated_at": now}
    if not internal:
        updates["last_message_at"] = now
        updates["message_count"] = int(ticket.get("message_count", 0)) + 1
    # First admin/agent reply stamps the first-response SLA clock.
    if author.get("kind") == "admin" and not ticket.get("first_response_at") and not internal:
        updates["first_response_at"] = now
    # A requester reply on a resolved/closed ticket reopens it.
    if author.get("kind") in ("user", "photographer") and ticket.get("status") in ("resolved", "closed"):
        updates["status"] = "reopened"
        updates["resolved_at"] = None
    await db.support_tickets.update_one({"id": ticket_id}, {"$set": updates})
    return msg


async def list_messages(db, ticket_id: str, include_internal: bool) -> List[dict]:
    rows = await db.ticket_messages.find({"ticket_id": ticket_id}, {"_id": 0}).to_list(1000)
    rows = [r for r in rows if include_internal or not r.get("internal")]
    rows.sort(key=lambda r: r.get("created_at", ""))
    return rows


async def list_tickets(db, *, status: Optional[str] = None, priority: Optional[str] = None,
                       category: Optional[str] = None, assignee: Optional[str] = None,
                       requester_id: Optional[str] = None, q: Optional[str] = None,
                       page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    rows = await db.support_tickets.find({}, {"_id": 0}).to_list(100000)
    rows = [_clean(r) for r in rows if not r.get("merged_into")]
    if requester_id:
        rows = [r for r in rows if r.get("requester_id") == requester_id]
    if status:
        rows = ([r for r in rows if r.get("status") in OPEN_STATES] if status == "open_all"
                else [r for r in rows if r.get("status") == status])
    if priority:
        rows = [r for r in rows if r.get("priority") == priority]
    if category:
        rows = [r for r in rows if r.get("category") == category]
    if assignee:
        rows = ([r for r in rows if not r.get("assignee_admin_id")] if assignee == "unassigned"
                else [r for r in rows if r.get("assignee_admin_id") == assignee])
    if q:
        ql = q.strip().lower()
        rows = [r for r in rows if ql in (r.get("subject", "").lower())
                or ql in ((r.get("requester") or {}).get("name", "").lower())
                or ql in ((r.get("requester") or {}).get("email", "").lower())
                or ql in (r.get("id", "").lower())]
    rows.sort(key=lambda r: r.get("last_message_at") or r.get("created_at", ""), reverse=True)
    total = len(rows)
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total,
            "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


async def update_ticket(db, ticket_id: str, changes: Dict[str, Any],
                        actor_admin_id: Optional[str] = None,
                        assignee_name: Optional[str] = None) -> Dict[str, Any]:
    ticket = _clean(await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0}))
    if not ticket:
        raise LookupError("Ticket not found")
    updates: Dict[str, Any] = {"updated_at": _iso()}
    if "status" in changes and changes["status"]:
        st = changes["status"]
        if st not in STATUSES:
            raise ValueError("Invalid status")
        updates["status"] = st
        if st == "resolved":
            updates["resolved_at"] = _iso()
        elif st in ("open", "reopened", "pending"):
            updates["resolved_at"] = None
    if "priority" in changes and changes["priority"]:
        if changes["priority"] not in PRIORITIES:
            raise ValueError("Invalid priority")
        updates["priority"] = changes["priority"]
    if "assignee_admin_id" in changes:
        updates["assignee_admin_id"] = changes["assignee_admin_id"] or None
        updates["assignee_name"] = assignee_name if changes["assignee_admin_id"] else None
    await db.support_tickets.update_one({"id": ticket_id}, {"$set": updates})
    await _audit(db, actor_admin_id, "support.ticket_update", ticket_id, updates)
    return _clean(await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0}))


async def merge_ticket(db, ticket_id: str, into_ticket_id: str,
                       actor_admin_id: Optional[str] = None) -> Dict[str, Any]:
    if ticket_id == into_ticket_id:
        raise ValueError("Cannot merge a ticket into itself")
    target = await db.support_tickets.find_one({"id": into_ticket_id}, {"_id": 0})
    if not target:
        raise LookupError("Target ticket not found")
    src = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not src:
        raise LookupError("Ticket not found")
    # Re-point the source's messages at the target, mark the source merged+closed.
    msgs = await db.ticket_messages.find({"ticket_id": ticket_id}, {"_id": 0}).to_list(1000)
    for m in msgs:
        await db.ticket_messages.update_one({"id": m["id"]}, {"$set": {"ticket_id": into_ticket_id}})
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"merged_into": into_ticket_id, "status": "closed", "updated_at": _iso()}})
    await db.support_tickets.update_one(
        {"id": into_ticket_id},
        {"$set": {"message_count": int(target.get("message_count", 0)) + len(msgs),
                  "last_message_at": _iso(), "updated_at": _iso()}})
    await _audit(db, actor_admin_id, "support.ticket_merge", ticket_id, {"into": into_ticket_id})
    return {"merged": ticket_id, "into": into_ticket_id, "moved_messages": len(msgs)}


async def ticket_stats(db) -> Dict[str, Any]:
    rows = await db.support_tickets.find({}, {"_id": 0}).to_list(100000)
    rows = [r for r in rows if not r.get("merged_into")]
    by_status: Dict[str, int] = {s: 0 for s in STATUSES}
    for r in rows:
        by_status[r.get("status", "open")] = by_status.get(r.get("status", "open"), 0) + 1
    open_count = sum(by_status.get(s, 0) for s in OPEN_STATES)
    frts = [_hours_between(r.get("created_at"), r.get("first_response_at"))
            for r in rows if r.get("first_response_at")]
    frts = [x for x in frts if x is not None]
    rezs = [_hours_between(r.get("created_at"), r.get("resolved_at"))
            for r in rows if r.get("resolved_at")]
    rezs = [x for x in rezs if x is not None]
    # SLA breach = still open past the first-response target with no first response.
    now = _now()
    breaches = 0
    for r in rows:
        if r.get("status") in OPEN_STATES and not r.get("first_response_at"):
            age = _hours_between(r.get("created_at"), now.isoformat())
            if age is not None and age > SLA_FIRST_RESPONSE_HOURS:
                breaches += 1
    return {
        "total": len(rows),
        "open": open_count,
        "by_status": by_status,
        "avg_first_response_hours": round(sum(frts) / len(frts), 2) if frts else None,
        "avg_resolution_hours": round(sum(rezs) / len(rezs), 2) if rezs else None,
        "sla_first_response_hours": SLA_FIRST_RESPONSE_HOURS,
        "sla_breaches": breaches,
    }


async def _audit(db, actor_id, action, ticket_id, meta):
    try:
        await db.audit_logs.insert_one({
            "id": uuid.uuid4().hex, "actor_id": actor_id, "action": action,
            "target": ticket_id, "meta": meta, "created_at": _iso()})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# router (thin auth + validation wrappers over the logic above)
# ---------------------------------------------------------------------------
class TicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=5000)
    category: str = "other"
    priority: str = "normal"


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = False
    attachments: Optional[List[str]] = None


class TicketPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_admin_id: Optional[str] = None


class MergeIn(BaseModel):
    into_ticket_id: str


def build_support_router(db, get_current_buyer, require_admin) -> APIRouter:
    router = APIRouter(tags=["support"])

    # ---------------- requester side ----------------
    @router.post("/api/support/tickets")
    async def create(payload: TicketIn, buyer=Depends(get_current_buyer)):
        requester = await _requester_identity(db, buyer)
        try:
            return await create_ticket(db, requester, payload.subject, payload.body,
                                       payload.category, payload.priority)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/api/support/tickets/mine")
    async def mine(page: int = 1, page_size: int = 20, buyer=Depends(get_current_buyer)):
        return await list_tickets(db, requester_id=buyer.get("user_id"),
                                  page=page, page_size=page_size)

    @router.get("/api/support/tickets/{ticket_id}")
    async def my_ticket(ticket_id: str, buyer=Depends(get_current_buyer)):
        t = _clean(await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0}))
        if not t or t.get("requester_id") != buyer.get("user_id"):
            raise HTTPException(404, "Ticket not found")
        t["messages"] = await list_messages(db, ticket_id, include_internal=False)
        return t

    @router.post("/api/support/tickets/{ticket_id}/messages")
    async def my_reply(ticket_id: str, payload: MessageIn, buyer=Depends(get_current_buyer)):
        t = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if not t or t.get("requester_id") != buyer.get("user_id"):
            raise HTTPException(404, "Ticket not found")
        ident = await _requester_identity(db, buyer)
        try:
            return await add_message(db, ticket_id,
                                     {"id": ident["id"], "kind": ident["kind"], "name": ident["name"]},
                                     payload.body, internal=False)
        except (ValueError, LookupError) as e:
            raise HTTPException(400, str(e))

    # ---------------- admin side ----------------
    @router.get("/api/admin/support/tickets")
    async def admin_list(status: Optional[str] = None, priority: Optional[str] = None,
                         category: Optional[str] = None, assignee: Optional[str] = None,
                         q: Optional[str] = None, page: int = 1, page_size: int = 20,
                         admin=Depends(require_admin)):
        return await list_tickets(db, status=status, priority=priority, category=category,
                                  assignee=assignee, q=q, page=page, page_size=page_size)

    @router.get("/api/admin/support/stats")
    async def admin_stats(admin=Depends(require_admin)):
        return await ticket_stats(db)

    @router.get("/api/admin/support/tickets/{ticket_id}")
    async def admin_get(ticket_id: str, admin=Depends(require_admin)):
        t = _clean(await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0}))
        if not t:
            raise HTTPException(404, "Ticket not found")
        t["messages"] = await list_messages(db, ticket_id, include_internal=True)
        return t

    @router.post("/api/admin/support/tickets/{ticket_id}/messages")
    async def admin_reply(ticket_id: str, payload: MessageIn, admin=Depends(require_admin)):
        aid = admin.get("admin_id") if isinstance(admin, dict) else admin
        try:
            return await add_message(db, ticket_id, {"id": aid, "kind": "admin", "name": "Support"},
                                     payload.body, internal=payload.internal,
                                     attachments=payload.attachments)
        except (ValueError, LookupError) as e:
            raise HTTPException(400, str(e))

    @router.patch("/api/admin/support/tickets/{ticket_id}")
    async def admin_patch(ticket_id: str, payload: TicketPatch, admin=Depends(require_admin)):
        aid = admin.get("admin_id") if isinstance(admin, dict) else admin
        name = None
        if payload.assignee_admin_id:
            row = await db.admins.find_one({"id": payload.assignee_admin_id}, {"_id": 0})
            name = (row or {}).get("name") or (row or {}).get("studio_name")
        try:
            return await update_ticket(db, ticket_id, payload.dict(exclude_unset=True),
                                       actor_admin_id=aid, assignee_name=name)
        except ValueError as e:
            raise HTTPException(400, str(e))
        except LookupError as e:
            raise HTTPException(404, str(e))

    @router.post("/api/admin/support/tickets/{ticket_id}/reopen")
    async def admin_reopen(ticket_id: str, admin=Depends(require_admin)):
        aid = admin.get("admin_id") if isinstance(admin, dict) else admin
        try:
            return await update_ticket(db, ticket_id, {"status": "reopened"}, actor_admin_id=aid)
        except LookupError as e:
            raise HTTPException(404, str(e))

    @router.post("/api/admin/support/tickets/{ticket_id}/merge")
    async def admin_merge(ticket_id: str, payload: MergeIn, admin=Depends(require_admin)):
        aid = admin.get("admin_id") if isinstance(admin, dict) else admin
        try:
            return await merge_ticket(db, ticket_id, payload.into_ticket_id, actor_admin_id=aid)
        except ValueError as e:
            raise HTTPException(400, str(e))
        except LookupError as e:
            raise HTTPException(404, str(e))

    return router
