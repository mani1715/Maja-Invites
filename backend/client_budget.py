"""
client_budget.py — what the client owes, what they've paid, what's left.

The photographer's own money ledger for one invitation, alongside the client's
login: the agreed amount, every payment received with its date, and the date the
client promised the rest by. The remaining amount is COMPUTED, never stored —
a stored total is a number that goes stale the moment a payment is edited.

    db.client_budgets: one doc per profile
      { id, profile_id, admin_id, total_inr, due_date, currency,
        payments: [{id, amount_inr, date, note, created_at}], updated_at }

Money rules, deliberately strict:
  * amounts are whole rupees (int), never floats — no 0.30000000000000004 in a ledger;
  * negative amounts are refused; a refund is the owner's own line with a note;
  * `paid_inr` is the sum of payments, `remaining_inr` is total - paid, and
    `overpaid_inr` is surfaced separately rather than showing a negative balance;
  * nothing here is charged, collected or shown to guests. It is private
    bookkeeping visible only to the studio that owns the invitation (and the owner).
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

logger = logging.getLogger("client_budget")

MAX_PAYMENTS = 200                  # a wedding is not a subscription ledger
MAX_AMOUNT_INR = 100_000_000        # ₹10 crore — a typo guard, not a limit on business
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ctx(admin: Any) -> Dict[str, Any]:
    """Normalise the auth dep result to {admin_id, role}. Tolerates either a bare
    id string (get_current_admin) or a dict (require_admin) so a wiring choice can
    never turn into a 500 from str.get(...)."""
    if isinstance(admin, str):
        return {"admin_id": admin, "role": None}
    if isinstance(admin, dict):
        return {"admin_id": admin.get("admin_id") or admin.get("id"), "role": admin.get("role")}
    return {"admin_id": None, "role": None}


def parse_amount(v: Any, field: str = "amount_inr") -> int:
    """Whole rupees or a 400. Accepts "12,000" and 12000.0; refuses junk."""
    if isinstance(v, bool) or v is None or v == "":
        raise HTTPException(400, f"{field} is required")
    if isinstance(v, str):
        v = v.replace(",", "").replace("₹", "").strip()
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{field} must be a number")
    if f != f or f in (float("inf"), float("-inf")):
        raise HTTPException(400, f"{field} must be a number")
    if f < 0:
        raise HTTPException(400, f"{field} cannot be negative")
    if f > MAX_AMOUNT_INR:
        raise HTTPException(400, f"{field} looks wrong — check the digits")
    return int(round(f))


def parse_date(v: Any, field: str = "date") -> Optional[str]:
    """YYYY-MM-DD or None. A half-typed date is refused rather than stored."""
    s = str(v or "").strip()[:10]
    if not s:
        return None
    if not _DATE_RE.match(s):
        raise HTTPException(400, f"{field} must look like 2026-07-30")
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"{field} is not a real date")
    return s


def summarise(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The ledger as the panel shows it. Remaining is always computed here."""
    doc = doc or {}
    payments: List[Dict[str, Any]] = [p for p in (doc.get("payments") or []) if isinstance(p, dict)]
    payments.sort(key=lambda p: (str(p.get("date") or ""), str(p.get("created_at") or "")))
    total = int(doc.get("total_inr") or 0)
    paid = sum(int(p.get("amount_inr") or 0) for p in payments)
    return {
        "profile_id": doc.get("profile_id"),
        "currency": doc.get("currency") or "INR",
        "total_inr": total,
        "paid_inr": paid,
        # Never negative: an overpayment is its own number, so "remaining" stays
        # a thing you can hand to a client without explaining a minus sign.
        "remaining_inr": max(0, total - paid),
        "overpaid_inr": max(0, paid - total) if total else 0,
        "percent_paid": round((paid / total) * 100, 1) if total > 0 else 0,
        "settled": total > 0 and paid >= total,
        "due_date": doc.get("due_date"),
        "payments": payments,
        "payment_count": len(payments),
        "notes": doc.get("notes") or "",
        "updated_at": doc.get("updated_at"),
    }


def build_client_budget_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["client-budget"])

    async def _owned(profile_id: str, admin: Any) -> Dict[str, Any]:
        """The invitation, or 403/404. A studio sees only its own; owner sees all."""
        ctx = _ctx(admin)
        admin_id = ctx["admin_id"]
        p = await db.profiles.find_one({"id": profile_id}, {"_id": 0, "id": 1, "admin_id": 1,
                                                           "bride_name": 1, "groom_name": 1})
        if not p:
            raise HTTPException(404, "Invitation not found")
        owner = p.get("admin_id")
        if owner and owner != admin_id and (ctx["role"] != "super_admin"):
            raise HTTPException(403, "You do not have access to this invitation")
        return p

    async def _doc(profile_id: str) -> Optional[Dict[str, Any]]:
        return await db.client_budgets.find_one({"profile_id": profile_id}, {"_id": 0})

    async def _save(profile_id: str, admin_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        existing = await _doc(profile_id)
        if existing:
            await db.client_budgets.update_one({"profile_id": profile_id},
                                               {"$set": {**patch, "updated_at": _now()}})
            return {**existing, **patch}
        doc = {"id": uuid.uuid4().hex, "profile_id": profile_id, "admin_id": admin_id,
               "currency": "INR", "total_inr": 0, "due_date": None, "payments": [],
               "notes": "", "created_at": _now(), "updated_at": _now(), **patch}
        await db.client_budgets.insert_one(doc)
        return doc

    @router.get("/api/admin/profiles/{profile_id}/budget")
    async def get_budget(profile_id: str, admin=Depends(get_current_admin)):
        await _owned(profile_id, admin)
        return summarise({**(await _doc(profile_id) or {}), "profile_id": profile_id})

    @router.put("/api/admin/profiles/{profile_id}/budget")
    async def set_budget(profile_id: str, payload: Dict[str, Any] = Body(...),
                         admin=Depends(get_current_admin)):
        """Set the agreed total and the date the client promised to pay by."""
        await _owned(profile_id, admin)
        patch: Dict[str, Any] = {}
        if "total_inr" in payload:
            patch["total_inr"] = parse_amount(payload.get("total_inr"), "total_inr")
        if "due_date" in payload:
            patch["due_date"] = parse_date(payload.get("due_date"), "due_date")
        if "notes" in payload:
            patch["notes"] = str(payload.get("notes") or "")[:1000]
        if not patch:
            raise HTTPException(400, "Nothing to update")
        doc = await _save(profile_id, _ctx(admin)["admin_id"], patch)
        return summarise(doc)

    @router.post("/api/admin/profiles/{profile_id}/budget/payments")
    async def add_payment(profile_id: str, payload: Dict[str, Any] = Body(...),
                          admin=Depends(get_current_admin)):
        """Record money received. Date defaults to today; note is free text."""
        await _owned(profile_id, admin)
        amount = parse_amount(payload.get("amount_inr"))
        if amount == 0:
            raise HTTPException(400, "A payment of zero is not a payment")
        existing = await _doc(profile_id) or {}
        payments = list(existing.get("payments") or [])
        if len(payments) >= MAX_PAYMENTS:
            raise HTTPException(400, f"That's more than {MAX_PAYMENTS} payments on one invitation")
        payments.append({
            "id": uuid.uuid4().hex[:12],
            "amount_inr": amount,
            "date": parse_date(payload.get("date")) or datetime.now(timezone.utc).date().isoformat(),
            "note": str(payload.get("note") or "")[:200],
            "created_at": _now(),
        })
        doc = await _save(profile_id, _ctx(admin)["admin_id"],
                          {"payments": payments})
        return summarise(doc)

    @router.delete("/api/admin/profiles/{profile_id}/budget/payments/{payment_id}")
    async def delete_payment(profile_id: str, payment_id: str, admin=Depends(get_current_admin)):
        await _owned(profile_id, admin)
        existing = await _doc(profile_id) or {}
        payments = [p for p in (existing.get("payments") or []) if p.get("id") != payment_id]
        if len(payments) == len(existing.get("payments") or []):
            raise HTTPException(404, "That payment is not on this invitation")
        doc = await _save(profile_id, _ctx(admin)["admin_id"],
                          {"payments": payments})
        return summarise(doc)

    return router
