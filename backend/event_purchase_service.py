"""
event_purchase_service.py — MAJA Dynamic Event Engine: self-serve buy → auto-create (v2 §5).
============================================================================================

Ganesh links are self-serve (NOT manual fulfilment): the buyer picks a design + a plan,
pays, and an event draft is auto-created with that design + the plan's features applied;
they fill the details and PUBLISH auto-generates the public link (/e/:slug).

Flow (graceful — admin-set prices from event_pricing + the event Razorpay helpers):
  1. GET  /api/events/plans/{event_type}   → the plans + prices + features + add-ons
     (+ this design's price when ?template_id= is passed).
  2. POST /api/events/purchase             → create the draft + set the design; if the
     total is 0 or payments aren't configured → grant immediately and return
     {status:"ready", event_id}. Otherwise return a Razorpay order for the total.
  3. POST /api/events/purchase/verify      → verify the payment server-side, grant the
     plan's features, mark paid → {status:"ready", event_id}.
Publishing then enforces the 15-edit limit and mints the link (existing lifecycle).

Every price here is owner-controlled in the Pricing Hub (see event_pricing.py) —
per design, per plan, and per feature add-on, exactly like the wedding side.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request

import event_registry as registry
import event_templates
import event_pricing
import event_payments as pay
import event_lifecycle_service as life
from event_lifecycle_service import _audit, _now
from event_plan_gating import apply_event_entitlements


def _owner_id(current: Dict[str, Any]) -> Optional[str]:
    return (current or {}).get("user_id") or (current or {}).get("admin_id")


async def list_plans(db, event_type: str, template_id: str = "") -> Dict[str, Any]:
    """The public price sheet for a design: plans, feature add-ons and the design's
    own price — all admin-set, so the buy panel is never empty."""
    offer = await event_pricing.design_offer(db, event_type, template_id)
    return {
        "event_type": event_type,
        "template_id": template_id,
        "design_price_inr": offer["design_price_inr"],
        "from_price_inr": offer["from_price_inr"],
        "plans": offer["plans"],
        "feature_addons": offer["feature_addons"],
        "currency": "INR",
        "payments_live": pay.configured(),
    }


async def _set_design(db, event_id: str, template_id: str) -> None:
    tpl = event_templates.get_template("ganesh_chaturthi", template_id)
    if not tpl:
        return
    ev = await db.events.find_one({"event_id": event_id}) or {}
    theme = dict(ev.get("theme") or {})
    theme["template"] = template_id
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"template_id": template_id, "theme": theme, "updated_at": _now()}})


async def _grant(db, event_id: str, q: Dict[str, Any], current: Dict[str, Any],
                 *, paid: int) -> None:
    await apply_event_entitlements(db, event_id, q["plan_key"], q["granted_features"],
                                   actor=str(_owner_id(current) or "system"),
                                   active_days=q.get("active_days"))
    await db.events.update_one({"event_id": event_id}, {"$set": {
        "plan_status": "ready", "plan_price_paid": paid,
        "plan_quote": q, "updated_at": _now()}})


async def start_purchase(db, current: Dict[str, Any], *, event_type: str,
                         template_id: str, plan_key: str,
                         addons: Optional[List[str]] = None) -> Dict[str, Any]:
    cfg = registry.get_config(event_type)
    if not cfg:
        raise HTTPException(404, "Unknown event type")
    q = await event_pricing.quote(db, event_type, template_id, plan_key, addons)

    draft = await life.create_draft(db, current, event_type)
    event_id = draft["event_id"]
    if template_id:
        await _set_design(db, event_id, template_id)
    await db.events.update_one({"event_id": event_id}, {"$set": {
        "pending_plan_key": plan_key, "pending_addons": q["addons"], "plan_status": "pending"}})

    total = int(q["total_inr"])

    # Free (the owner priced it at 0) or the gateway has no keys yet → grant now so a
    # buyer is never stuck behind unconfigured billing. `payments_live` tells the UI
    # which of the two happened; the grant is audited either way.
    if total <= 0 or not pay.configured():
        await _grant(db, event_id, q, current, paid=0)
        await _audit(db, event_id, current, "purchase_ready_free", "event",
                     after={"quote": q, "payments_live": pay.configured()})
        return {"status": "ready", "event_id": event_id, "needs_payment": False,
                "quote": q, "payments_live": pay.configured()}

    # Paid → a real Razorpay order for the full total (design + plan + add-ons),
    # recorded in event_orders so the payment is reconcilable later.
    try:
        order = await pay.create_order(
            db, amount_inr=total, receipt=event_id, kind="event_purchase", event_id=event_id,
            notes={"event_id": event_id, "plan": plan_key, "event_type": event_type})
    except pay.PaymentUnavailable as e:
        raise HTTPException(502, f"Could not start the payment: {e}")
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"pending_order_id": order["order_id"],
                                         "plan_status": "awaiting_payment"}})
    await _audit(db, event_id, current, "purchase_order_created", "event",
                 after={"plan": plan_key, "order_id": order["order_id"], "total": total})
    return {"status": "payment", "event_id": event_id, "needs_payment": True,
            "order_id": order["order_id"], "amount": order["amount"],
            "currency": order["currency"], "key_id": order["key_id"],
            "plan_key": plan_key, "quote": q, "payments_live": True}


async def verify_purchase(db, current: Dict[str, Any], *, event_id: str,
                          razorpay_order_id: str, razorpay_payment_id: str,
                          razorpay_signature: str) -> Dict[str, Any]:
    ev = await db.events.find_one({"event_id": event_id})
    if not ev or ev.get("deleted_at"):
        raise HTTPException(404, "Event not found")
    if ev.get("owner_id") != _owner_id(current) and (current or {}).get("kind") != "super_admin":
        raise HTTPException(403, "Not your event")
    if ev.get("plan_status") == "ready":
        return {"status": "ready", "event_id": event_id}   # idempotent
    if ev.get("pending_order_id") != razorpay_order_id:
        raise HTTPException(422, "Order does not match this event.")

    # Signature is checked locally (HMAC) so a library/network problem can never be
    # mistaken for a forgery: unavailable → 409 (retryable), mismatch → 400.
    try:
        ok = pay.verify_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    except pay.PaymentUnavailable as e:
        raise HTTPException(409, str(e))
    if not ok:
        await pay.mark_failed(db, razorpay_order_id, "signature mismatch")
        await _audit(db, event_id, current, "purchase_payment_failed", "event",
                     after={"order": razorpay_order_id})
        raise HTTPException(400, "Payment verification failed.")

    await pay.mark_paid(db, razorpay_order_id, razorpay_payment_id)
    return await _complete(db, ev, current, razorpay_payment_id, via="checkout")


async def _complete(db, ev: Dict[str, Any], current: Dict[str, Any],
                    payment_id: str, *, via: str) -> Dict[str, Any]:
    """Grant the purchased plan. Shared by the browser callback and the webhook, and
    idempotent — whichever arrives first wins and the other is a no-op."""
    event_id = ev["event_id"]
    plan_key = ev.get("pending_plan_key")
    q = await event_pricing.quote(db, ev.get("event_type") or "ganesh_chaturthi",
                                  ev.get("template_id") or "", plan_key,
                                  [a.get("key") for a in (ev.get("pending_addons") or [])])
    # CAS gate: the first of {browser verify, webhook} to flip plan_status -> ready
    # wins and grants; a concurrent/duplicate caller is a no-op. Replaces the
    # earlier TOCTOU read-check so there is no double entitlement grant and no
    # duplicate purchase_paid audit row under the verify/webhook race.
    res = await db.events.update_one(
        {"event_id": event_id, "plan_status": {"$ne": "ready"}},
        {"$set": {"plan_status": "ready", "plan_price_paid": int(q["total_inr"]),
                  "plan_quote": q, "razorpay_payment_id": payment_id, "updated_at": _now()}})
    if getattr(res, "matched_count", 1) == 0:
        fresh = await db.events.find_one({"event_id": event_id}) or {}
        return {"status": "ready", "event_id": event_id,
                "quote": fresh.get("plan_quote", q), "already": True}
    await apply_event_entitlements(db, event_id, q["plan_key"], q["granted_features"],
                                   actor=str(_owner_id(current) or "system"),
                                   active_days=q.get("active_days"))
    await _audit(db, event_id, current, "purchase_paid", "event",
                 after={"plan": plan_key, "payment_id": payment_id,
                        "total": q["total_inr"], "via": via})
    return {"status": "ready", "event_id": event_id, "quote": q}


async def webhook_purchase(db, raw_body: bytes, signature: str) -> Dict[str, Any]:
    """Razorpay server-to-server callback.

    Without this, a buyer who pays and then closes the tab before the browser
    callback fires has taken money out of their account for an event that is still
    "awaiting_payment". Razorpay retries this endpoint, so the purchase completes
    regardless of what the browser did."""
    try:
        ok = pay.verify_webhook(raw_body, signature)
    except pay.PaymentUnavailable as e:
        raise HTTPException(409, str(e))
    if not ok:
        raise HTTPException(400, "Invalid webhook signature.")

    import json
    try:
        payload = json.loads(raw_body or b"{}")
    except Exception:
        raise HTTPException(400, "Malformed webhook body.")
    info = pay.webhook_payment(payload)
    if not info["order_id"] or info["event"] not in ("payment.captured", "order.paid"):
        return {"ignored": True, "event": info["event"]}

    order = await pay.get_order(db, info["order_id"])
    if not order or order.get("kind") != "event_purchase":
        return {"ignored": True, "reason": "not an event purchase"}
    ev = await db.events.find_one({"event_id": order.get("event_id")})
    if not ev:
        return {"ignored": True, "reason": "event missing"}
    await pay.mark_paid(db, info["order_id"], info["payment_id"], via="webhook")
    if ev.get("plan_status") == "ready":
        return {"status": "ready", "event_id": ev["event_id"], "already": True}
    owner = {"user_id": ev.get("owner_id"), "kind": "system"}
    return await _complete(db, ev, owner, info["payment_id"], via="webhook")


def build_event_purchase_router(db, get_current_buyer) -> APIRouter:
    # `Request` MUST be imported at module scope (see the top-level fastapi
    # import). This module uses `from __future__ import annotations`, so
    # FastAPI resolves the `request: Request` annotation against the function's
    # __globals__ — a function-local import is invisible there. It doesn't
    # error; FastAPI quietly demotes `request` to a required QUERY parameter,
    # and the webhook then 422s on every real Razorpay delivery.
    router = APIRouter(tags=["event-purchase"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/plans/{event_type}")
    async def _plans(event_type: str, template_id: str = ""):
        await _gate()
        return await list_plans(db, event_type, template_id)

    @router.post("/api/events/purchase")
    async def _buy(body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await start_purchase(db, current,
                                    event_type=body.get("event_type") or "ganesh_chaturthi",
                                    template_id=body.get("template_id") or "",
                                    plan_key=body.get("plan_key") or "",
                                    addons=body.get("addons") or [])

    @router.post("/api/events/purchase/verify")
    async def _verify(body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await verify_purchase(db, current,
                                     event_id=body.get("event_id") or "",
                                     razorpay_order_id=body.get("razorpay_order_id") or "",
                                     razorpay_payment_id=body.get("razorpay_payment_id") or "",
                                     razorpay_signature=body.get("razorpay_signature") or "")

    # Razorpay server-to-server callback. NOT auth'd by a session — authenticated by
    # the webhook HMAC over the raw body, so the raw bytes must be read untouched.
    @router.post("/api/events/purchase/webhook")
    async def _webhook(request: Request):
        await _gate()
        raw = await request.body()
        sig = request.headers.get("x-razorpay-signature", "")
        return await webhook_purchase(db, raw, sig)

    return router
