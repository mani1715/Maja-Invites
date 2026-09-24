"""
refunds_service.py — real-money Razorpay refunds (super-admin only).

Before this module, no code path anywhere called `razorpay_client.payment.refund`
— every refund was done by hand in the Razorpay dashboard, with nothing recorded
in this app. `disputes.py` has a `refunded` status LABEL but never moves money.

Collection: `refunds` (audit trail, write-ahead)
Schema:
    id, payment_id, source_collection, source_id, captured_amount_paise,
    amount_paise, reason, notes, status ("initiated"|"processed"|"failed"),
    razorpay_refund_id, razorpay_status, error,
    created_by, created_at, processed_at, failed_at

Collection: `refund_locks` (in-flight guard, one row per payment_id while a
refund on that payment is being talked to Razorpay)
    id = f"lock_{payment_id}"   -- the row's own PK is the mutex: a second
    concurrent POST for the same payment_id collides on insert and gets 409
    before Razorpay is ever called.

Source of truth for "was this payment actually captured, and for how much":
resolved by searching the settled-payment collections (`invitation_orders`,
`event_orders`, `subscriptions`, `donations`, `studio_storage_subscriptions`,
`portfolio_build_unlocks`, `link_reactivations`) for a matching Razorpay
payment id, exactly as those modules already store it.

Endpoints (all super-admin only):
    POST /api/super-admin/refunds                 — issue a refund
    GET  /api/super-admin/refunds                  — list (newest first)
    POST /api/super-admin/refunds/{refund_id}/sync — reconcile a stuck
                                                      "initiated" row against
                                                      Razorpay (crash recovery)

Wired in server.py:
    from refunds_service import build_refunds_router
    app.include_router(build_refunds_router(db, require_super_admin, razorpay_client))
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("refunds")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if doc is not None:
        doc.pop("_id", None)
    return doc


# ─── settled-payment sources: (collection, payment-id fields, amount resolver) ──
async def _amt_invitation_orders(db, doc):
    return int(doc.get("amount_paise") or 0)


async def _amt_event_orders(db, doc):
    return int(doc.get("amount_paise") or 0)


async def _amt_subscriptions(db, doc):
    return int((doc.get("quote") or {}).get("total_paise") or 0)


async def _amt_donations(db, doc):
    return int(round(float(doc.get("amount") or 0) * 100))


async def _amt_studio_storage_subscriptions(db, doc):
    plan = await db.studio_storage_plans.find_one({"id": doc.get("plan_id")}, {"_id": 0}) or {}
    return int(plan.get("price_inr") or 0) * 100


async def _amt_portfolio_build_unlocks(db, doc):
    return int(doc.get("amount_inr") or 0) * 100


async def _amt_link_reactivations(db, doc):
    return int(doc.get("amount_paise") or 0)


_SOURCES: Tuple[Tuple[str, Tuple[str, ...], Any], ...] = (
    ("invitation_orders", ("razorpay_payment_id",), _amt_invitation_orders),
    ("event_orders", ("payment_id", "razorpay_payment_id"), _amt_event_orders),
    ("subscriptions", ("razorpay_payment_id",), _amt_subscriptions),
    ("donations", ("razorpay_payment_id",), _amt_donations),
    ("studio_storage_subscriptions",
     ("razorpay_payment_id", "last_razorpay_payment_id"), _amt_studio_storage_subscriptions),
    ("portfolio_build_unlocks", ("payment_id",), _amt_portfolio_build_unlocks),
    ("link_reactivations", ("razorpay_payment_id",), _amt_link_reactivations),
)


async def _find_source(db, payment_id: str) -> Tuple[Optional[str], Optional[Dict[str, Any]], int]:
    for coll, fields, amount_fn in _SOURCES:
        for field in fields:
            doc = await getattr(db, coll).find_one({field: payment_id}, {"_id": 0})
            if doc:
                return coll, doc, await amount_fn(db, doc)
    return None, None, 0


async def _release_lock(db, lock_id: str) -> None:
    try:
        await db.refund_locks.delete_one({"id": lock_id})
    except Exception:
        logger.warning("refunds: failed to release lock %s", lock_id, exc_info=True)


# ─── request models ──────────────────────────────────────────────────────
class _RefundReq(BaseModel):
    payment_id: str = Field(..., max_length=64)
    amount_paise: Optional[int] = Field(None, gt=0, description="Omit for a full refund")
    reason: str = Field(..., max_length=500)
    notes: Optional[Dict[str, Any]] = None


def build_refunds_router(db, require_super_admin, razorpay_client=None) -> APIRouter:
    router = APIRouter(tags=["refunds"])

    @router.post("/api/super-admin/refunds")
    async def create_refund(req: _RefundReq, admin_id: str = Depends(require_super_admin)):
        if razorpay_client is None:
            raise HTTPException(503, "Payment gateway not configured")

        source_coll, source_doc, captured = await _find_source(db, req.payment_id)
        if not source_coll:
            raise HTTPException(404, "No settled payment found for this payment_id")
        if captured <= 0:
            raise HTTPException(409, "Source payment has no captured amount on record")

        existing = await db.refunds.find(
            {"payment_id": req.payment_id, "status": {"$in": ["processed", "initiated"]}},
            {"_id": 0},
        ).to_list(500)
        already_refunded = sum(int(r.get("amount_paise") or 0) for r in existing)
        requested = int(req.amount_paise) if req.amount_paise else max(0, captured - already_refunded)
        if requested <= 0:
            raise HTTPException(409, "Nothing left to refund for this payment")
        if already_refunded + requested > captured:
            raise HTTPException(
                409,
                f"Refund of {requested} paise would exceed the captured amount "
                f"({captured} paise; {already_refunded} paise already refunded)",
            )

        # (c) write-ahead: claim the payment via a lock row BEFORE touching
        # Razorpay, so a concurrent duplicate POST 409s before a second
        # network call is ever made.
        refund_id = f"rfnd_{uuid.uuid4().hex[:16]}"
        lock_id = f"lock_{req.payment_id}"
        try:
            await db.refund_locks.insert_one(
                {"id": lock_id, "payment_id": req.payment_id, "refund_id": refund_id, "created_at": _now()}
            )
        except Exception as e:
            if type(e).__name__ != "UniqueViolationError":
                raise
            raise HTTPException(409, "A refund is already in progress for this payment")

        await db.refunds.insert_one({
            "id": refund_id,
            "payment_id": req.payment_id,
            "source_collection": source_coll,
            "source_id": source_doc.get("id"),
            "captured_amount_paise": captured,
            "amount_paise": requested,
            "reason": req.reason,
            "notes": req.notes or {},
            "status": "initiated",
            "created_by": admin_id,
            "created_at": _now(),
        })

        # (d) the real call — blocking SDK, run off the event loop.
        try:
            rzp = await asyncio.to_thread(
                razorpay_client.payment.refund,
                req.payment_id,
                {"amount": requested, "notes": {"maja_refund_id": refund_id, "reason": req.reason[:200]}},
            )
        except Exception as e:
            await db.refunds.find_one_and_update(
                {"id": refund_id, "status": "initiated"},
                {"$set": {"status": "failed", "error": str(e)[:500], "failed_at": _now()}},
            )
            await _release_lock(db, lock_id)
            raise HTTPException(502, f"Razorpay refund failed: {e}")

        updated = await db.refunds.find_one_and_update(
            {"id": refund_id, "status": "initiated"},
            {"$set": {
                "status": "processed",
                "razorpay_refund_id": rzp.get("id"),
                "razorpay_status": rzp.get("status"),
                "processed_at": _now(),
            }},
        )
        await _release_lock(db, lock_id)

        # (f) best-effort: never let this failure undo an already-processed refund.
        try:
            new_total = already_refunded + requested
            new_status = "refunded" if new_total >= captured else "partially_refunded"
            await getattr(db, source_coll).update_one(
                {"id": source_doc.get("id")},
                {"$set": {"refund_status": new_status, "last_refund_id": refund_id,
                          "refunded_amount_paise": new_total}},
            )
        except Exception:
            logger.warning("refunds: could not mark source row %s/%s as refunded",
                            source_coll, source_doc.get("id"), exc_info=True)

        return _strip(updated) or await db.refunds.find_one({"id": refund_id}, {"_id": 0})

    @router.get("/api/super-admin/refunds")
    async def list_refunds(
        limit: int = Query(50, ge=1, le=200),
        skip: int = Query(0, ge=0),
        payment_id: Optional[str] = None,
        _: str = Depends(require_super_admin),
    ):
        flt = {"payment_id": payment_id} if payment_id else {}
        cur = db.refunds.find(flt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        items = await cur.to_list(limit)
        return {"items": items, "total": len(items)}

    @router.post("/api/super-admin/refunds/{refund_id}/sync")
    async def sync_refund(refund_id: str, _: str = Depends(require_super_admin)):
        row = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Refund not found")
        if row.get("status") != "initiated":
            return {**row, "reconciled": False, "message": "Not in-flight"}
        if razorpay_client is None:
            raise HTTPException(503, "Payment gateway not configured")

        rzp = None
        try:
            if row.get("razorpay_refund_id"):
                rzp = await asyncio.to_thread(razorpay_client.refund.fetch, row["razorpay_refund_id"])
            else:
                # Crashed before the CAS write ever recorded the refund id —
                # find it by the notes we stamped it with at create time.
                listing = await asyncio.to_thread(
                    razorpay_client.payment.fetch_multiple_refund, row["payment_id"], {}
                )
                for item in (listing or {}).get("items", []):
                    if (item.get("notes") or {}).get("maja_refund_id") == refund_id:
                        rzp = item
                        break
        except Exception as e:
            raise HTTPException(502, f"Could not reach Razorpay: {e}")

        if not rzp:
            return {**row, "reconciled": False, "message": "No matching refund found upstream yet"}

        rzp_status = rzp.get("status")
        if rzp_status == "processed":
            new_status = "processed"
        elif rzp_status == "failed":
            new_status = "failed"
        else:
            return {**row, "reconciled": False, "message": f"Still {rzp_status!r} upstream"}

        patch = {"status": new_status, "razorpay_refund_id": rzp.get("id"), "razorpay_status": rzp_status}
        patch.update({"processed_at": _now()} if new_status == "processed"
                     else {"failed_at": _now(), "error": "reconciled from Razorpay"})
        updated = await db.refunds.find_one_and_update({"id": refund_id, "status": "initiated"}, {"$set": patch})
        await _release_lock(db, f"lock_{row['payment_id']}")
        return {**_strip(updated or row), "reconciled": True}

    return router
