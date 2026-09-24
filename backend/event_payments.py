"""
event_payments.py — MAJA Dynamic Event Engine: the ONE Razorpay surface for events.
===================================================================================

Why this module exists
    Both event money paths (plan purchases and public donations) previously did:

        try:
            razorpay.Client(...).utility.verify_payment_signature(...)
        except Exception:
            raise HTTPException(400, "Payment verification failed.")

    That bare `except` cannot tell a FORGED signature from "the razorpay library
    isn't installed" or "the gateway is unreachable" — so an infrastructure hiccup
    told a customer who really paid that their payment failed, and the order was
    dropped. Money paths must never be ambiguous.

What it guarantees
    * verify_signature() is computed LOCALLY (HMAC-SHA256 of "order_id|payment_id",
      constant-time compared) — exactly Razorpay's documented algorithm. No network,
      no third-party import, so it cannot fail for environmental reasons. A wrong
      signature returns False; a MISSING SECRET raises PaymentUnavailable (never False).
    * create_order() is the only call that needs the SDK + network. If either is
      missing it raises PaymentUnavailable (→ 502) instead of silently "succeeding".
    * verify_webhook() authenticates Razorpay's server-to-server callback, so a
      purchase still completes when the buyer's browser dies after paying.
    * Orders are recorded in `event_orders` (create → paid/failed) so every rupee is
      reconcilable, and replays are idempotent.

Config: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, optional RAZORPAY_WEBHOOK_SECRET.
Keys containing "PLACEHOLDER" count as unset (matches the rest of the platform).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("event_payments")


class PaymentUnavailable(RuntimeError):
    """The gateway could not be used (not configured / SDK missing / network).
    Explicitly NOT the same as an invalid signature."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# configuration
# --------------------------------------------------------------------------- #
def _clean(v: str) -> str:
    v = (v or "").strip()
    return "" if (not v or "PLACEHOLDER" in v) else v


def keys() -> Optional[Tuple[str, str]]:
    kid = _clean(os.environ.get("RAZORPAY_KEY_ID", ""))
    ksec = _clean(os.environ.get("RAZORPAY_KEY_SECRET", ""))
    return (kid, ksec) if (kid and ksec) else None


def configured() -> bool:
    return keys() is not None


def key_id() -> str:
    k = keys()
    return k[0] if k else ""


def webhook_secret() -> str:
    """Falls back to the API secret — Razorpay allows either, and many merchants
    configure the webhook with the same value."""
    return _clean(os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")) or (keys()[1] if keys() else "")


def client():
    k = keys()
    if not k:
        raise PaymentUnavailable("Online payments are not enabled.")
    try:
        import razorpay                                   # noqa: PLC0415 - optional dep
    except Exception as e:                                # pragma: no cover
        raise PaymentUnavailable(f"Payment gateway library unavailable: {e}")
    client = razorpay.Client(auth=k)
    # Hard socket timeout: the SDK's requests.Session has none, so a stalled
    # Razorpay endpoint would block the calling coroutine indefinitely.
    try:
        import os as _os
        import requests as _rq
        _t = float(_os.environ.get("RAZORPAY_TIMEOUT", "15"))

        class _TimeoutSession(_rq.Session):
            def request(self, *a, **kw):
                kw.setdefault("timeout", _t)
                return super().request(*a, **kw)

        _s = _TimeoutSession()
        _s.auth = client.auth
        client.session = _s
    except Exception:
        pass
    return client


# --------------------------------------------------------------------------- #
# signatures (local, deterministic, no third-party dependency)
# --------------------------------------------------------------------------- #
def _hmac(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """True only when `signature` really is Razorpay's HMAC for this order+payment.

    Raises PaymentUnavailable when there is no secret to check against — callers
    must NOT treat that as a forgery."""
    k = keys()
    if not k:
        raise PaymentUnavailable("Online payments are not enabled.")
    if not (order_id and payment_id and signature):
        return False
    expected = _hmac(k[1], f"{order_id}|{payment_id}")
    return hmac.compare_digest(expected, str(signature).strip())


def verify_webhook(raw_body: bytes, signature: str) -> bool:
    """Authenticate a Razorpay webhook POST (X-Razorpay-Signature)."""
    secret = webhook_secret()
    if not secret:
        raise PaymentUnavailable("No webhook secret configured.")
    if not signature:
        return False
    body = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)
    return hmac.compare_digest(_hmac(secret, body), str(signature).strip())


# --------------------------------------------------------------------------- #
# orders (recorded so every payment is reconcilable)
# --------------------------------------------------------------------------- #
async def create_order(db, *, amount_inr: int, receipt: str, notes: Dict[str, Any],
                       kind: str, event_id: str = "") -> Dict[str, Any]:
    """Create a Razorpay order and persist an `event_orders` row for it."""
    amount_inr = int(amount_inr)
    if amount_inr <= 0:
        raise PaymentUnavailable("Nothing to charge.")
    try:
        order = client().order.create({
            "amount": amount_inr * 100, "currency": "INR",
            # Explicit auto-capture, matching every hand-rolled order.create in
            # this codebase (store, subscriptions, reactivation, shagun). Without
            # it the order inherits the Razorpay account's capture setting: if
            # that is ever "manual", the payment authorises but never captures —
            # the buyer sees a charge, we settle nothing, and the webhook has no
            # captured event to act on.
            "payment_capture": 1,
            "receipt": receipt[:40], "notes": notes or {}})
    except PaymentUnavailable:
        raise
    except Exception as e:
        raise PaymentUnavailable(f"Could not reach the payment gateway: {e}")

    await db.event_orders.insert_one({
        "order_id": order["id"], "kind": kind, "event_id": event_id,
        "receipt": receipt, "amount_inr": amount_inr,
        "amount_paise": order.get("amount", amount_inr * 100),
        "currency": order.get("currency", "INR"), "status": "created",
        "notes": notes or {}, "created_at": _now(), "updated_at": _now()})
    return {"order_id": order["id"], "amount": order.get("amount", amount_inr * 100),
            "currency": order.get("currency", "INR"), "key_id": key_id(),
            "amount_inr": amount_inr}


async def get_order(db, order_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.event_orders.find_one({"order_id": order_id})
    if doc:
        doc.pop("_id", None)
    return doc


async def mark_paid(db, order_id: str, payment_id: str, *, via: str = "checkout") -> bool:
    """Flip an order to paid exactly once. Returns True on the first transition,
    False if it was already paid — idempotent under browser-verify vs webhook races."""
    res = await db.event_orders.update_one(
        {"order_id": order_id, "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_via": via,
                  "paid_at": _now(), "updated_at": _now()}})
    return getattr(res, "matched_count", 1) != 0


async def mark_failed(db, order_id: str, reason: str) -> None:
    await db.event_orders.update_one({"order_id": order_id}, {"$set": {
        "status": "failed", "failure_reason": reason[:300], "updated_at": _now()}})


def webhook_payment(payload: Dict[str, Any]) -> Dict[str, str]:
    """Pull (order_id, payment_id, event) out of a Razorpay webhook body.
    Returns empty strings for anything the payload doesn't carry."""
    entity = (((payload or {}).get("payload") or {}).get("payment") or {}).get("entity") or {}
    return {
        "event": str((payload or {}).get("event") or ""),
        "order_id": str(entity.get("order_id") or ""),
        "payment_id": str(entity.get("id") or ""),
        "status": str(entity.get("status") or ""),
    }
