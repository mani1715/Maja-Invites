"""
event_finance_service.py — MAJA Dynamic Event Engine: finance & donations (Spec 08).
====================================================================================

Purpose
    The finance layer on top of the donation / sponsor / expense child collections
    (Spec 05): configurable categories + suggested amounts, an auto-computed budget,
    receipt numbering, the expense approval state machine (pending → approved → paid
    → closed, reject terminal), a financial dashboard, CSV reports, financial search,
    and a PUBLIC visitor donation path. Every write is audited (Spec 08 §Audit).

Design (Spec 08 §Design Principles)
    * No financial record is ever hard-deleted here (status transitions only).
    * Amounts are validated server-side; the public path never trusts client totals.
    * Budget is DERIVED (donations received + sponsors − expenses paid) so it can
      never drift from the transactions — "budget updates automatically".

Dependencies  event_lifecycle_service (ownership/audit), event_children_service
            (the collections + field specs), app_settings (config override)
Side effects  event_budget (1:1 estimates + receipt counter), donation/expense rows,
            audit rows. Additive & reversible (Spec 04 §24).

Roles (Spec 08 §User Roles): management here is owner-or-super-admin; the granular
    Treasurer / Finance-Member matrix is Doc 10 (Security) + the member-accounts
    system — deferred, not guessed. The visitor donation path is the one public route.
DEFERRED: payment-gateway verification, tax certificates, PDF/Excel export, GST,
    recurring donations, multi-currency (Spec 08 §Future Enhancements).
"""
from __future__ import annotations

import io
import csv
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Request

import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _audit, _uid, _now, _slugify


FINANCE_DEFAULTS: Dict[str, Any] = {
    "currency": "INR",
    "donation_categories": ["General Donation", "Decoration", "Food", "Prasadam",
                            "Cultural Programs", "Charity", "Temple Maintenance"],
    "suggested_amounts": [101, 251, 501, 1001, 5001],
    "sponsor_tiers": ["Title Sponsor", "Gold", "Silver", "Bronze", "Supporter",
                      "Community Partner"],
    "expense_categories": ["Decoration", "Food", "Sound", "Lighting", "Flowers",
                           "Pooja Items", "Printing", "Transportation", "Photography",
                           "Marketing", "Utilities", "Miscellaneous"],
    "receipt_prefix": "MAJA",
}

# expense approval workflow (Spec 08 §Approval Workflow)
EXPENSE_STATES = {"pending", "approved", "paid", "closed", "rejected"}
EXPENSE_TRANSITIONS: Dict[str, set] = {
    "pending": {"approved", "rejected"},
    "approved": {"paid", "rejected"},
    "paid": {"closed"},
    "closed": set(),
    "rejected": set(),
}


def _amount(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise HTTPException(422, "Amount must be a number.")
    if n < 0:
        raise HTTPException(422, "Amount cannot be negative.")
    return round(n, 2)


async def finance_config(db) -> Dict[str, Any]:
    try:
        doc = await db.app_settings.find_one({"key": "event_finance_config"})
        if doc and isinstance(doc.get("value"), dict):
            return {**FINANCE_DEFAULTS, **doc["value"]}
    except Exception:
        pass
    return dict(FINANCE_DEFAULTS)


# --------------------------------------------------------------------------- #
# collection helpers
# --------------------------------------------------------------------------- #
async def _rows(db, coll: str, event_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for r in getattr(db, coll).find({"event_id": event_id}):
        if r.get("deleted_at"):
            continue
        r.pop("_id", None)
        out.append(r)
    return out


async def _one(db, coll: str, flt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    doc = await getattr(db, coll).find_one(flt)
    if doc:
        doc.pop("_id", None)
    return doc


# --------------------------------------------------------------------------- #
# budget (1:1, estimates stored, actuals derived)
# --------------------------------------------------------------------------- #
async def _budget_doc(db, event_id: str) -> Dict[str, Any]:
    doc = await _one(db, "event_budget", {"event_id": event_id})
    if not doc:
        doc = {"id": _uid("bud"), "event_id": event_id,
               "estimated_income": 0, "estimated_expense": 0, "reserve": 0,
               "target_collection": 0, "receipt_seq": 0,
               "created_at": _now(), "updated_at": _now()}
        await db.event_budget.insert_one(doc)
    return doc


async def get_budget(db, event: Dict[str, Any]) -> Dict[str, Any]:
    eid = event["event_id"]
    b = await _budget_doc(db, eid)
    donations = await _rows(db, "donations", eid)
    sponsors = await _rows(db, "sponsors", eid)
    expenses = await _rows(db, "expenses", eid)
    received = sum(_amount(d.get("amount") or 0) for d in donations if d.get("status") == "received")
    sponsor_sum = sum(_amount(s.get("amount") or 0) for s in sponsors if s.get("is_active", True))
    paid = sum(_amount(e.get("amount") or 0) for e in expenses if e.get("approval_status") in ("paid", "closed"))
    approved = sum(_amount(e.get("amount") or 0) for e in expenses if e.get("approval_status") == "approved")
    income = received + sponsor_sum
    return {
        "estimated_income": _amount(b.get("estimated_income") or 0),
        "estimated_expense": _amount(b.get("estimated_expense") or 0),
        "reserve": _amount(b.get("reserve") or 0),
        "target_collection": _amount(b.get("target_collection") or 0),
        "actual_income": income, "donations_received": received, "sponsor_income": sponsor_sum,
        "actual_expense_paid": paid, "committed_expense": approved,
        "current_balance": round(income - paid, 2),
        "remaining_budget": round(income - paid - approved, 2),
        "collection_progress": round(100 * received / b["target_collection"], 1)
        if b.get("target_collection") else 0,
    }


async def set_budget(db, event: Dict[str, Any], current: Dict[str, Any],
                     patch: Dict[str, Any]) -> Dict[str, Any]:
    eid = event["event_id"]
    b = await _budget_doc(db, eid)
    upd = {}
    for k in ("estimated_income", "estimated_expense", "reserve", "target_collection"):
        if k in (patch or {}):
            upd[k] = _amount(patch[k])
    upd["updated_at"] = _now()
    await db.event_budget.update_one({"event_id": eid}, {"$set": upd})
    await _audit(db, eid, current, "budget_update", "finance", before=b, after=upd)
    return await get_budget(db, event)


# --------------------------------------------------------------------------- #
# receipts + donation verification
# --------------------------------------------------------------------------- #
async def _next_receipt_no(db, event: Dict[str, Any], cfg: Dict[str, Any]) -> str:
    eid = event["event_id"]
    await _budget_doc(db, eid)
    await db.event_budget.update_one({"event_id": eid}, {"$inc": {"receipt_seq": 1}})
    b = await _one(db, "event_budget", {"event_id": eid})
    seq = int(b.get("receipt_seq") or 1)
    short = _slugify(event.get("title") or eid)[:12] or "event"
    return f"{cfg.get('receipt_prefix', 'MAJA')}-{short}-{seq:05d}".upper()


async def verify_donation(db, event: Dict[str, Any], current: Dict[str, Any],
                          donation_id: str) -> Dict[str, Any]:
    """Mark an offline/cash donation received and issue a receipt number."""
    eid = event["event_id"]
    don = await _one(db, "donations", {"id": donation_id, "event_id": eid})
    if not don or don.get("deleted_at"):
        raise HTTPException(404, "Donation not found")
    if don.get("status") == "received" and don.get("receipt_number"):
        return {"already_verified": True, "receipt_number": don["receipt_number"]}
    cfg = await finance_config(db)
    receipt_no = await _next_receipt_no(db, event, cfg)
    patch = {"status": "received", "receipt_number": receipt_no,
             "receipt_date": _now(), "verified_by": current.get("user_id") or current.get("admin_id"),
             "updated_at": _now()}
    await db.donations.update_one({"id": donation_id, "event_id": eid}, {"$set": patch})
    await _audit(db, eid, current, "donation_verified", "finance",
                 after={"donation_id": donation_id, "receipt": receipt_no})
    return {"verified": True, "donation_id": donation_id, "receipt_number": receipt_no}


async def get_receipt(db, event: Dict[str, Any], donation_id: str) -> Dict[str, Any]:
    eid = event["event_id"]
    don = await _one(db, "donations", {"id": donation_id, "event_id": eid})
    if not don or not don.get("receipt_number"):
        raise HTTPException(404, "No receipt for this donation yet")
    cfg = await finance_config(db)
    return {
        "receipt_number": don["receipt_number"], "receipt_date": don.get("receipt_date"),
        "donor_name": "Anonymous" if don.get("is_anonymous") else don.get("donor_name"),
        "amount": _amount(don.get("amount") or 0), "currency": don.get("currency") or cfg["currency"],
        "payment_method": don.get("payment_method"), "category": don.get("category"),
        "transaction_reference": don.get("transaction_reference"),
        "event_title": event.get("title"), "event_id": eid,
    }


# --------------------------------------------------------------------------- #
# public donation (Spec 08 §Donation Workflow — the visitor path)
# --------------------------------------------------------------------------- #
async def submit_public_donation(db, slug: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    event = await _one(db, "events", {"publish_slug": slug})
    if not event or not event.get("is_public") or event.get("deleted_at"):
        raise HTTPException(404, "Invitation not found")
    cfg = await finance_config(db)
    amount = _amount((payload or {}).get("amount"))
    if amount <= 0:
        raise HTTPException(422, "Enter a donation amount.")
    name = str((payload or {}).get("donor_name") or "").strip()
    if not name and not (payload or {}).get("is_anonymous"):
        raise HTTPException(422, "Your name is required (or donate anonymously).")
    category = (payload or {}).get("category") or "General Donation"
    method = (payload or {}).get("payment_method") or "upi"
    did = _uid("don")
    row = {"id": did, "child_id": did, "event_id": event["event_id"],
           "donor_name": name or "Anonymous", "amount": amount, "currency": cfg["currency"],
           "phone": str((payload or {}).get("phone") or "")[:20],
           "email": str((payload or {}).get("email") or "")[:120],
           "message": str((payload or {}).get("message") or "")[:500],
           "category": category, "payment_method": method,
           "transaction_reference": str((payload or {}).get("transaction_reference") or "")[:120],
           "is_anonymous": bool((payload or {}).get("is_anonymous")),
           "hide_amount": bool((payload or {}).get("hide_amount")),
           "hide_message": bool((payload or {}).get("hide_message")),
           "status": "pending",              # verified by a treasurer (no gateway yet)
           "source": "public", "deleted_at": None,
           "created_at": _now(), "updated_at": _now()}
    await db.donations.insert_one(row)
    await _audit(db, event["event_id"], {"user_id": "public"}, "donation_pledged", "finance",
                 after={"donation_id": did, "amount": amount})
    return {"pledged": True, "donation_id": did, "status": "pending",
            "message": "Thank you! Your donation is recorded and will be confirmed by the organizers."}


# --------------------------------------------------------------------------- #
# online donation payment (Razorpay) — reuses the platform's existing client
# --------------------------------------------------------------------------- #
# Razorpay lives in ONE place for events (event_payments). These thin wrappers keep
# the historical names working for existing callers/tests.
def _rzp_keys():
    import event_payments as _pay
    return _pay.keys()


def payments_configured() -> bool:
    import event_payments as _pay
    return _pay.configured()


def _rzp_client():
    import event_payments as _pay
    return _pay.client()


async def create_donation_order(db, slug: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Start an online donation. Records a pending donation and (when Razorpay is
    configured) returns an order the client checkout completes; otherwise falls back
    to an offline pledge the organizers confirm (graceful — Spec 08 §Future)."""
    base = await submit_public_donation(db, slug, payload)   # validates + records pending
    did = base["donation_id"]
    if not payments_configured():
        return {"configured": False, "donation_id": did, "status": "pending",
                "message": "Online payment isn't enabled yet — your pledge is recorded "
                           "and the organizers will confirm it."}
    don = await _one(db, "donations", {"id": did})
    amount_paise = int(round(_amount(don["amount"]) * 100))
    try:
        order = _rzp_client().order.create({
            "amount": amount_paise, "currency": don.get("currency") or "INR",
            "receipt": did, "notes": {"donation_id": did, "event_slug": slug}})
    except Exception as e:   # network / key error → keep the pledge, report clearly
        raise HTTPException(502, f"Could not start the payment: {e}")
    await db.donations.update_one({"id": did}, {"$set": {
        "razorpay_order_id": order["id"], "payment_method": "razorpay",
        "transaction_reference": order["id"], "updated_at": _now()}})
    kid, _ = _rzp_keys()
    return {"configured": True, "donation_id": did, "order_id": order["id"],
            "amount": order["amount"], "currency": order.get("currency", "INR"), "key_id": kid}


async def _settle_donation_payment(db, order_id: str, payment_id: str,
                                   *, via: str) -> Optional[Dict[str, Any]]:
    """Mark a donation received + issue a receipt for a captured payment.

    Shared by the browser /verify path and the webhook so a donor whose browser
    dies right after paying still gets their donation recorded and a receipt —
    Razorpay already took the money either way. Idempotent: the CAS below means
    whichever of {verify, webhook} arrives first wins and mints the receipt; the
    other is a no-op that returns the same receipt (`already: True`).
    Returns None when `order_id` doesn't belong to any donation (webhook event
    for a different payment kind sharing the same gateway)."""
    don = await _one(db, "donations", {"razorpay_order_id": order_id})
    if not don:
        return None
    if don.get("status") == "received" and don.get("receipt_number"):
        return {"verified": True, "donation_id": don["id"],
                "receipt_number": don["receipt_number"], "amount": _amount(don["amount"]),
                "already": True}
    event = await _one(db, "events", {"event_id": don["event_id"]})
    cfg = await finance_config(db)
    receipt_no = await _next_receipt_no(db, event, cfg)
    # CAS: only the first writer flips pending -> received and keeps its receipt.
    res = await db.donations.update_one(
        {"id": don["id"], "status": {"$ne": "received"}},
        {"$set": {"status": "received", "receipt_number": receipt_no, "receipt_date": _now(),
                  "razorpay_payment_id": payment_id, "updated_at": _now()}})
    if getattr(res, "matched_count", 1) == 0:
        # Lost a concurrent race — return the receipt the winner assigned.
        fresh = await _one(db, "donations", {"id": don["id"]}) or {}
        return {"verified": True, "donation_id": don["id"],
                "receipt_number": fresh.get("receipt_number") or receipt_no,
                "amount": _amount(don["amount"]), "already": True}
    await _audit(db, don["event_id"], {"user_id": "public"}, "donation_paid", "finance",
                 after={"donation_id": don["id"], "receipt": receipt_no, "via": via})
    return {"verified": True, "donation_id": don["id"], "receipt_number": receipt_no,
            "amount": _amount(don["amount"])}


async def verify_donation_payment(db, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Verify a completed Razorpay payment SERVER-SIDE (never trust the client —
    Spec 08 §Security) and, on success, mark the donation received + issue a receipt."""
    if not payments_configured():
        raise HTTPException(409, "Online payments are not enabled.")
    order_id = (payload or {}).get("razorpay_order_id")
    pay_id = (payload or {}).get("razorpay_payment_id")
    sig = (payload or {}).get("razorpay_signature")
    if not (order_id and pay_id and sig):
        raise HTTPException(422, "Missing payment confirmation fields.")
    don = await _one(db, "donations", {"razorpay_order_id": order_id})
    if not don:
        raise HTTPException(404, "Donation not found for this order.")
    # Verify the signature FIRST — even for an already-received donation — so a
    # forged signature is always rejected and receipt state never leaks to a
    # caller who can't produce a valid one.
    # Local HMAC check — a missing library or an outage must never be reported to a
    # donor as "your payment failed" (409 = retryable, 400 = genuinely bad signature).
    import event_payments as _pay
    try:
        ok = _pay.verify_signature(order_id, pay_id, sig)
    except _pay.PaymentUnavailable as e:
        raise HTTPException(409, str(e))
    if not ok:
        await _audit(db, don["event_id"], {"user_id": "public"}, "donation_payment_failed",
                     "finance", after={"donation_id": don["id"]})
        raise HTTPException(400, "Payment verification failed.")
    result = await _settle_donation_payment(db, order_id, pay_id, via="checkout")
    return result


async def webhook_donation_payment(db, raw_body: bytes, signature: str) -> Dict[str, Any]:
    """Razorpay server-to-server callback for public donations.

    Without this, a donor who pays and then closes the tab before the browser
    /verify call fires has had money captured for a donation that stays
    "pending" forever. Razorpay retries this endpoint until it gets a 2xx, so
    the donation settles regardless of what the browser did."""
    import event_payments as _pay
    try:
        ok = _pay.verify_webhook(raw_body, signature)
    except _pay.PaymentUnavailable as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(400, "Invalid webhook signature.")
    import json
    try:
        payload = json.loads(raw_body or b"{}")
    except Exception:
        raise HTTPException(400, "Malformed webhook body.")
    info = _pay.webhook_payment(payload)
    if info["event"] not in ("payment.captured", "order.paid") or not info["order_id"]:
        return {"received": True}
    result = await _settle_donation_payment(db, info["order_id"], info["payment_id"], via="webhook")
    return {"received": True, "settled": result is not None}


# --------------------------------------------------------------------------- #
# expense approval state machine (Spec 08 §Approval Workflow)
# --------------------------------------------------------------------------- #
async def transition_expense(db, event: Dict[str, Any], current: Dict[str, Any],
                             expense_id: str, target: str) -> Dict[str, Any]:
    eid = event["event_id"]
    if target not in EXPENSE_STATES:
        raise HTTPException(422, f"Unknown status '{target}'")
    exp = await _one(db, "expenses", {"id": expense_id, "event_id": eid})
    if not exp or exp.get("deleted_at"):
        raise HTTPException(404, "Expense not found")
    cur = exp.get("approval_status") or "pending"
    if target == cur:
        return {"status": cur, "unchanged": True}
    if target not in EXPENSE_TRANSITIONS.get(cur, set()):
        raise HTTPException(409, f"Cannot move an expense from '{cur}' to '{target}'.")
    patch = {"approval_status": target, "updated_at": _now()}
    if target == "approved":
        patch["approved_by"] = current.get("user_id") or current.get("admin_id")
        patch["approved_at"] = _now()
    if target == "paid":
        patch["paid_at"] = _now()
    if target == "closed":
        patch["closed_at"] = _now()
    await db.expenses.update_one({"id": expense_id, "event_id": eid}, {"$set": patch})
    await _audit(db, eid, current, f"expense_{target}", "finance",
                 before={"status": cur}, after={"status": target})
    return {"status": target, "expense_id": expense_id}


# --------------------------------------------------------------------------- #
# dashboard (Spec 08 §Financial Dashboard)
# --------------------------------------------------------------------------- #
async def dashboard(db, event: Dict[str, Any]) -> Dict[str, Any]:
    eid = event["event_id"]
    donations = await _rows(db, "donations", eid)
    sponsors = await _rows(db, "sponsors", eid)
    expenses = await _rows(db, "expenses", eid)
    budget = await get_budget(db, event)

    received = [d for d in donations if d.get("status") == "received"]
    by_cat: Dict[str, float] = {}
    for d in received:
        by_cat[d.get("category") or "General Donation"] = by_cat.get(d.get("category") or "General Donation", 0) + _amount(d.get("amount") or 0)
    timeline: Dict[str, float] = {}
    for d in received:
        day = (d.get("receipt_date") or d.get("created_at") or "")[:10]
        if day:
            timeline[day] = timeline.get(day, 0) + _amount(d.get("amount") or 0)
    exp_by_status: Dict[str, float] = {}
    for e in expenses:
        st = e.get("approval_status") or "pending"
        exp_by_status[st] = exp_by_status.get(st, 0) + _amount(e.get("amount") or 0)

    return {
        "cards": {
            "total_donations": budget["donations_received"],
            "donation_count": len(received),
            "total_sponsors": budget["sponsor_income"],
            "sponsor_count": len([s for s in sponsors if s.get("is_active", True)]),
            "total_expenses": sum(_amount(e.get("amount") or 0) for e in expenses),
            "remaining_budget": budget["remaining_budget"],
            "collection_progress": budget["collection_progress"],
            "pending_approvals": len([e for e in expenses if (e.get("approval_status") or "pending") == "pending"]),
        },
        "charts": {
            "income_vs_expense": {"income": budget["actual_income"], "expense": budget["actual_expense_paid"]},
            "donation_by_category": by_cat,
            "donation_timeline": dict(sorted(timeline.items())),
            "expense_by_status": exp_by_status,
        },
        "budget": budget,
    }


# --------------------------------------------------------------------------- #
# CSV reports (Spec 08 §Reports — PDF/Excel deferred)
# --------------------------------------------------------------------------- #
_REPORT_COLUMNS = {
    "donations": ["receipt_number", "donor_name", "amount", "currency", "category",
                  "payment_method", "status", "created_at"],
    "expenses": ["title", "category", "vendor", "invoice_number", "amount", "tax",
                 "approval_status", "created_at"],
    "sponsors": ["name", "tier", "contact_person", "amount", "website_url", "is_active"],
}


async def report_csv(db, event: Dict[str, Any], kind: str) -> str:
    if kind not in _REPORT_COLUMNS:
        raise HTTPException(404, f"Unknown report '{kind}'")
    cols = _REPORT_COLUMNS[kind]
    rows = await _rows(db, kind, event["event_id"])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c.replace("_", " ").title() for c in cols])
    for r in rows:
        if kind == "donations" and r.get("is_anonymous"):
            r = {**r, "donor_name": "Anonymous"}
        w.writerow([r.get(c, "") for c in cols])
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_event_finance_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-finance"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/{event_id}/finance/config")
    async def cfg(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        await rbac.authorize_event(db, event_id, current, rbac.P_FIN_VIEW)
        return await finance_config(db)

    @router.get("/api/events/{event_id}/finance/dashboard")
    async def dash(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_VIEW)
        return await dashboard(db, event)

    @router.get("/api/events/{event_id}/finance/budget")
    async def budget_get(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_VIEW)
        return await get_budget(db, event)

    @router.put("/api/events/{event_id}/finance/budget")
    async def budget_put(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_BUDGET)
        return await set_budget(db, event, current, body)

    @router.post("/api/events/{event_id}/finance/donations/{donation_id}/verify")
    async def don_verify(event_id: str, donation_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_DONATION)
        return await verify_donation(db, event, current, donation_id)

    @router.get("/api/events/{event_id}/finance/donations/{donation_id}/receipt")
    async def don_receipt(event_id: str, donation_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_VIEW)
        return await get_receipt(db, event, donation_id)

    @router.post("/api/events/{event_id}/finance/expenses/{expense_id}/transition")
    async def exp_transition(event_id: str, expense_id: str, body: Dict[str, Any] = Body(...),
                             current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_EXPENSE_APPROVE)
        return await transition_expense(db, event, current, expense_id, (body or {}).get("target", ""))

    @router.get("/api/events/{event_id}/finance/report/{kind}")
    async def report(event_id: str, kind: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_FIN_REPORT)
        return {"kind": kind, "format": "csv", "csv": await report_csv(db, event, kind)}

    @router.post("/api/public/events/{slug}/donate")
    async def public_donate(slug: str, body: Dict[str, Any] = Body(...)):
        await _gate()
        return await submit_public_donation(db, slug, body)

    @router.post("/api/public/events/{slug}/donate/order")
    async def donate_order(slug: str, body: Dict[str, Any] = Body(...)):
        await _gate()
        return await create_donation_order(db, slug, body)

    @router.post("/api/public/events/donate/verify")
    async def donate_verify(body: Dict[str, Any] = Body(...)):
        await _gate()
        return await verify_donation_payment(db, body)

    # Razorpay server-to-server callback. NOT auth'd by a session — authenticated
    # by the webhook HMAC over the raw body, so the raw bytes must be read untouched.
    @router.post("/api/public/events/donate/webhook")
    async def donate_webhook(request: Request):
        await _gate()
        raw = await request.body()
        sig = request.headers.get("x-razorpay-signature", "")
        return await webhook_donation_payment(db, raw, sig)

    return router
