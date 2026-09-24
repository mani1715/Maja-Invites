"""
link_reactivation.py — pay-per-day reactivation of an EXPIRED invitation link.

Context (verified): a published invitation carries `expires_at`; the serve path
already returns HTTP 410 once it passes, and a sweep flips expired links
(`expired=True, enabled=False`). What was missing is the way BACK: letting the
photographer bring an expired link live again by paying per day.

This adds exactly that — reactivation billed at a configurable per-day rate
(default ₹50/day, `LINK_REACTIVATION_INR_PER_DAY`, admin-overridable via env):

  quote(days)                → cost = days × per-day
  POST …/reactivate/checkout → creates a Razorpay order (or mock in dev),
                               stores a pending `link_reactivations` row
  POST …/reactivate/verify   → verifies the signature (REUSES the subscription
                               gateway's security-critical verifier), then
                               `apply_reactivation` extends expires_at and flips
                               the link live again.

Money-safety: verification reuses `subscription_service.verify_gateway_payment`
so a client can't reactivate for free by forging a mock token against a
real-keyed order. Applying is idempotent per reactivation row.

    from link_reactivation import build_link_reactivation_router
    app.include_router(build_link_reactivation_router(db, require_admin, razorpay_client))
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("link_reactivation")

PER_DAY_INR = int(os.environ.get("LINK_REACTIVATION_INR_PER_DAY", "50"))
MIN_DAYS = 1
MAX_DAYS = 365


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def reactivation_quote(days: int, per_day_inr: int = PER_DAY_INR) -> Dict[str, Any]:
    """Cost of reactivating for `days` days. Pure + unit-testable."""
    days = int(days)
    if days < MIN_DAYS or days > MAX_DAYS:
        raise ValueError(f"Days must be between {MIN_DAYS} and {MAX_DAYS}.")
    total_inr = days * int(per_day_inr)
    return {
        "days": days,
        "per_day_inr": int(per_day_inr),
        "total_inr": total_inr,
        "total_paise": total_inr * 100,
        "currency": "INR",
    }


async def apply_reactivation(db, profile_id: str, days: int) -> Dict[str, Any]:
    """Extend the link's life by `days` and bring it live again. The new window
    starts from whichever is later — now, or the current (possibly future)
    expiry — so paying while still active *adds* days rather than losing them."""
    prof = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not prof:
        raise LookupError("Invitation not found.")
    now = _now()
    current = _parse_iso(prof.get("expires_at"))
    base = current if (current and current > now) else now
    new_expiry = base + timedelta(days=int(days))
    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"expires_at": new_expiry.isoformat(), "expired": False,
                  "enabled": True, "is_published": True,
                  "reactivated_at": now.isoformat(), "updated_at": now.isoformat()}})
    logger.info("[reactivate] profile %s extended %d days -> %s", profile_id, days, new_expiry.date())
    return {"profile_id": profile_id, "days": int(days), "expires_at": new_expiry.isoformat()}


async def _settle_reactivation(db, row: Dict[str, Any], *, payment_id: Optional[str]) -> Dict[str, Any]:
    """Claim + apply a paid reactivation exactly once. Shared by
    `/reactivate/verify` (browser) and `/reactivate/webhook` (Razorpay
    server-to-server) so a payment settles the same way regardless of which
    one wins the race.

    Claims the row (CAS on status != paid) BEFORE calling apply_reactivation,
    not after — so a loser of the race never extends `expires_at` at all,
    instead of extending it and then discovering it lost. Caller must have
    ALREADY verified the payment signature.
    """
    now = _now().isoformat()
    res = await db.link_reactivations.update_one(
        {"id": row["id"], "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "paid_at": now, "razorpay_payment_id": payment_id}})
    if getattr(res, "matched_count", 1) == 0:
        prof = await db.profiles.find_one({"id": row["profile_id"]}, {"_id": 0}) or {}
        return {"status": "paid", "already": True, "expires_at": prof.get("expires_at")}

    result = await apply_reactivation(db, row["profile_id"], int(row["days"]))
    await db.payments.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:16]}", "studio_id": row["studio_id"],
        "profile_id": row["profile_id"], "reactivation_id": row["id"], "status": "captured",
        "amount_paise": row["amount_paise"], "razorpay_payment_id": payment_id,
        "kind": "link_reactivation", "created_at": now})
    return {"status": "paid", **result}


# ------------------------------- HTTP ----------------------------------------
class CheckoutIn(BaseModel):
    days: int = Field(ge=MIN_DAYS, le=MAX_DAYS)


class VerifyIn(BaseModel):
    reactivation_id: str
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    mock_token: Optional[str] = None


def build_link_reactivation_router(db, require_admin, razorpay_client=None) -> APIRouter:
    router = APIRouter(tags=["link-reactivation"])

    # reuse the subscription gateway's create + verify so money handling never
    # diverges between the two paths.
    from subscription_service import (
        verify_gateway_payment, _razorpay_keys_ready,
    )

    def _ctx(admin: Any) -> Dict[str, Any]:
        if isinstance(admin, str):
            return {"admin_id": admin, "role": None}
        return {"admin_id": (admin or {}).get("admin_id") or (admin or {}).get("id"),
                "role": (admin or {}).get("role")}

    async def _owned(profile_id: str, admin: Any) -> Dict[str, Any]:
        ctx = _ctx(admin)
        p = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Invitation not found")
        if p.get("admin_id") and p["admin_id"] != ctx["admin_id"] and ctx["role"] != "super_admin":
            raise HTTPException(403, "You do not have access to this invitation")
        return p

    def _per_day() -> int:
        return PER_DAY_INR

    @router.get("/api/admin/profiles/{profile_id}/reactivate/quote")
    async def quote(profile_id: str, days: int = Query(30, ge=MIN_DAYS, le=MAX_DAYS),
                    admin=Depends(require_admin)):
        p = await _owned(profile_id, admin)
        q = reactivation_quote(days, _per_day())
        exp = _parse_iso(p.get("expires_at"))
        q["currently_expired"] = bool(p.get("expired")) or bool(exp and exp <= _now())
        q["expires_at"] = p.get("expires_at")
        return q

    @router.post("/api/admin/profiles/{profile_id}/reactivate/checkout")
    async def checkout(profile_id: str, payload: CheckoutIn, admin=Depends(require_admin)):
        await _owned(profile_id, admin)
        studio_id = _ctx(admin)["admin_id"]
        q = reactivation_quote(payload.days, _per_day())

        # gateway create — real order when keyed, else deterministic mock (dev)
        if _razorpay_keys_ready(razorpay_client):
            try:
                order = razorpay_client.order.create({
                    "amount": int(q["total_paise"]), "currency": "INR", "payment_capture": 1,
                    "notes": {"studio_id": studio_id, "profile_id": profile_id,
                              "type": "link_reactivation", "days": str(payload.days)},
                })
            except Exception:
                logger.exception("[reactivate] razorpay order.create failed")
                raise HTTPException(502, "Could not reach the payment gateway. You have "
                                         "not been charged — please try again.")
            provider, gid, mock_token = "razorpay_order", order["id"], None
        else:
            logger.warning("[reactivate] no live Razorpay keys — MOCK gateway (studio=%s)", studio_id)
            provider, gid, mock_token = "mock", f"rzp_mock_{uuid.uuid4().hex[:18]}", uuid.uuid4().hex

        rid = f"react_{uuid.uuid4().hex[:16]}"
        await db.link_reactivations.insert_one({
            "id": rid, "profile_id": profile_id, "studio_id": studio_id,
            "days": payload.days, "amount_paise": q["total_paise"],
            "provider": provider, "razorpay_subscription_id": gid,
            "mock_token": mock_token, "status": "pending", "created_at": _now().isoformat(),
        })
        return {"reactivation_id": rid, "amount_paise": q["total_paise"], "amount_inr": q["total_inr"],
                "days": payload.days, "provider": provider, "razorpay_order_id": gid,
                "razorpay_key_id": os.environ.get("RAZORPAY_KEY_ID") if provider == "razorpay_order" else None,
                "currency": "INR", "mock_token": mock_token}

    @router.post("/api/admin/profiles/{profile_id}/reactivate/verify")
    async def verify(profile_id: str, payload: VerifyIn, admin=Depends(require_admin)):
        await _owned(profile_id, admin)
        row = await db.link_reactivations.find_one(
            {"id": payload.reactivation_id, "profile_id": profile_id}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Reactivation not found")
        if row["status"] == "paid":
            prof = await db.profiles.find_one({"id": profile_id}, {"_id": 0}) or {}
            return {"status": "paid", "already": True, "expires_at": prof.get("expires_at")}
        if not verify_gateway_payment(row, payload, razorpay_client):
            raise HTTPException(400, "Payment verification failed")

        return await _settle_reactivation(db, row, payment_id=payload.razorpay_payment_id)

    # ---- Razorpay server-to-server callback (buyer's browser died mid-checkout) --
    # NOT auth'd by a session — authenticated by the webhook HMAC over the raw
    # body, so the raw bytes must be read untouched (same shape as
    # subscription_service.subscription_webhook / event_purchase_service.webhook_purchase).
    @router.post("/api/reactivate/webhook")
    async def reactivate_webhook(request: Request):
        from event_payments import verify_webhook, webhook_payment, PaymentUnavailable

        raw = await request.body()
        signature = request.headers.get("x-razorpay-signature", "")
        # Signature verified FIRST, before any DB read or state change.
        try:
            ok = verify_webhook(raw, signature)
        except PaymentUnavailable as e:
            raise HTTPException(409, str(e))
        if not ok:
            raise HTTPException(400, "Invalid webhook signature.")

        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            raise HTTPException(400, "Malformed webhook body.")
        info = webhook_payment(payload)
        if info["event"] not in ("payment.captured", "order.paid") or not info["order_id"]:
            return {"received": True}

        row = await db.link_reactivations.find_one(
            {"razorpay_subscription_id": info["order_id"], "provider": "razorpay_order"},
            {"_id": 0})
        if not row or row.get("status") == "paid":
            return {"received": True}  # unknown order, or already settled by /verify

        await _settle_reactivation(db, row, payment_id=info["payment_id"])
        return {"received": True}

    return router
