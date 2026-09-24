"""
disputes.py — Refund disputes & payment chargebacks (Phase 4).

A single `disputes` collection covers both (a `kind` field distinguishes
`refund_dispute` vs `chargeback`) plus an evidence trail. Admin can create a
dispute, attach evidence, assign it, move it through its lifecycle, and resolve
(won/lost/refunded). Every mutation is audit-logged. Core logic is module-level
for FakeDB unit-testing; the endpoints are thin `require_admin` wrappers.

    from disputes import build_disputes_router
    app.include_router(build_disputes_router(db, require_admin))
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("disputes")

KINDS = {"refund_dispute", "chargeback"}
STATUSES = ["open", "under_review", "evidence_submitted", "won", "lost", "refunded", "closed"]
OPEN_STATES = {"open", "under_review", "evidence_submitted"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(d):
    if isinstance(d, dict):
        d.pop("_id", None)
    return d


async def _audit(db, actor, action, target, meta):
    try:
        await db.audit_logs.insert_one({"id": uuid.uuid4().hex, "actor_id": actor,
                                        "action": action, "target": target, "meta": meta,
                                        "created_at": _now()})
    except Exception:
        pass


async def create_dispute(db, *, kind: str, payment_id: str, amount_paise: int = 0,
                         reason: str = "", order_id: Optional[str] = None,
                         customer_id: Optional[str] = None, customer_kind: Optional[str] = None,
                         actor: Optional[str] = None) -> Dict[str, Any]:
    if kind not in KINDS:
        raise ValueError("Invalid dispute kind")
    if not payment_id:
        raise ValueError("payment_id is required")
    did = "dsp_" + uuid.uuid4().hex[:12]
    doc = {
        "id": did, "kind": kind, "payment_id": payment_id, "order_id": order_id,
        "amount_paise": int(amount_paise or 0),
        "reason": (reason or "")[:1000],
        "customer_id": customer_id, "customer_kind": customer_kind,
        "status": "open", "assignee_admin_id": None,
        "evidence": [], "created_at": _now(), "updated_at": _now(), "resolved_at": None,
    }
    await db.disputes.insert_one(dict(doc))
    await _audit(db, actor, "dispute.create", did, {"kind": kind, "payment_id": payment_id})
    return _clean(doc)


async def add_evidence(db, dispute_id: str, note: str, url: Optional[str] = None,
                       actor: Optional[str] = None) -> Dict[str, Any]:
    d = _clean(await db.disputes.find_one({"id": dispute_id}, {"_id": 0}))
    if not d:
        raise LookupError("Dispute not found")
    if not (note or url):
        raise ValueError("Evidence note or url required")
    ev = {"id": uuid.uuid4().hex[:8], "note": (note or "")[:2000], "url": url,
          "added_by": actor, "at": _now()}
    evidence = list(d.get("evidence") or []) + [ev]
    new_status = "evidence_submitted" if d.get("status") in OPEN_STATES else d.get("status")
    await db.disputes.update_one({"id": dispute_id},
                                 {"$set": {"evidence": evidence, "status": new_status, "updated_at": _now()}})
    await _audit(db, actor, "dispute.evidence", dispute_id, {"count": len(evidence)})
    return _clean(await db.disputes.find_one({"id": dispute_id}, {"_id": 0}))


async def update_dispute(db, dispute_id: str, changes: Dict[str, Any],
                         actor: Optional[str] = None) -> Dict[str, Any]:
    d = await db.disputes.find_one({"id": dispute_id}, {"_id": 0})
    if not d:
        raise LookupError("Dispute not found")
    updates: Dict[str, Any] = {"updated_at": _now()}
    if changes.get("status"):
        if changes["status"] not in STATUSES:
            raise ValueError("Invalid status")
        updates["status"] = changes["status"]
        updates["resolved_at"] = _now() if changes["status"] in ("won", "lost", "refunded", "closed") else None
    if "assignee_admin_id" in changes:
        updates["assignee_admin_id"] = changes["assignee_admin_id"] or None
    await db.disputes.update_one({"id": dispute_id}, {"$set": updates})
    await _audit(db, actor, "dispute.update", dispute_id, updates)
    return _clean(await db.disputes.find_one({"id": dispute_id}, {"_id": 0}))


async def list_disputes(db, *, kind: Optional[str] = None, status: Optional[str] = None,
                        q: Optional[str] = None, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    rows = [_clean(r) for r in await db.disputes.find({}, {"_id": 0}).to_list(100000)]
    if kind:
        rows = [r for r in rows if r.get("kind") == kind]
    if status:
        rows = ([r for r in rows if r.get("status") in OPEN_STATES] if status == "open_all"
                else [r for r in rows if r.get("status") == status])
    if q:
        ql = q.strip().lower()
        rows = [r for r in rows if ql in (r.get("payment_id", "").lower())
                or ql in (r.get("id", "").lower()) or ql in (r.get("reason", "").lower())]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    total = len(rows)
    page = max(1, int(page or 1)); page_size = min(100, max(1, int(page_size or 20)))
    start = (page - 1) * page_size
    return {"items": rows[start:start + page_size], "total": total, "page": page,
            "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size)}


async def dispute_stats(db) -> Dict[str, Any]:
    rows = await db.disputes.find({}, {"_id": 0}).to_list(100000)
    by_status = {s: 0 for s in STATUSES}
    at_risk = 0
    for r in rows:
        by_status[r.get("status", "open")] = by_status.get(r.get("status", "open"), 0) + 1
        if r.get("status") in OPEN_STATES:
            at_risk += int(r.get("amount_paise") or 0)
    return {"total": len(rows), "open": sum(by_status.get(s, 0) for s in OPEN_STATES),
            "by_status": by_status, "amount_at_risk_paise": at_risk,
            "amount_at_risk_inr": round(at_risk / 100, 2)}


class DisputeIn(BaseModel):
    kind: str
    payment_id: str = Field(min_length=1)
    amount_paise: int = 0
    reason: str = ""
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_kind: Optional[str] = None


class EvidenceIn(BaseModel):
    note: str = ""
    url: Optional[str] = None


class DisputePatch(BaseModel):
    status: Optional[str] = None
    assignee_admin_id: Optional[str] = None


def build_disputes_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["disputes"])

    def _aid(admin):
        return admin.get("admin_id") if isinstance(admin, dict) else admin

    @router.get("/api/admin/disputes")
    async def _list(kind: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None,
                    page: int = 1, page_size: int = 20, admin=Depends(require_admin)):
        return await list_disputes(db, kind=kind, status=status, q=q, page=page, page_size=page_size)

    @router.get("/api/admin/disputes/stats")
    async def _stats(admin=Depends(require_admin)):
        return await dispute_stats(db)

    @router.post("/api/admin/disputes")
    async def _create(payload: DisputeIn, admin=Depends(require_admin)):
        try:
            return await create_dispute(db, kind=payload.kind, payment_id=payload.payment_id,
                                        amount_paise=payload.amount_paise, reason=payload.reason,
                                        order_id=payload.order_id, customer_id=payload.customer_id,
                                        customer_kind=payload.customer_kind, actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/api/admin/disputes/{dispute_id}")
    async def _get(dispute_id: str, admin=Depends(require_admin)):
        d = _clean(await db.disputes.find_one({"id": dispute_id}, {"_id": 0}))
        if not d:
            raise HTTPException(404, "Dispute not found")
        return d

    @router.post("/api/admin/disputes/{dispute_id}/evidence")
    async def _evidence(dispute_id: str, payload: EvidenceIn, admin=Depends(require_admin)):
        try:
            return await add_evidence(db, dispute_id, payload.note, payload.url, actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))
        except LookupError as e:
            raise HTTPException(404, str(e))

    @router.patch("/api/admin/disputes/{dispute_id}")
    async def _patch(dispute_id: str, payload: DisputePatch, admin=Depends(require_admin)):
        try:
            return await update_dispute(db, dispute_id, payload.dict(exclude_unset=True), actor=_aid(admin))
        except ValueError as e:
            raise HTTPException(400, str(e))
        except LookupError as e:
            raise HTTPException(404, str(e))

    return router
