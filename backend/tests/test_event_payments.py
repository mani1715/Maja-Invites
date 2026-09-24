"""
Ganesh v2 — event payments self-test (event_payments.py + purchase/webhook wiring).

    cd backend && python -m tests.test_event_payments

Proves the money path is unambiguous and recoverable:
  * a valid Razorpay signature verifies WITHOUT importing the SDK or touching the
    network (local HMAC), so an outage can never look like a forgery;
  * a forged signature is rejected;
  * NO keys raises PaymentUnavailable (→ 409 retryable) instead of returning False
    (→ 400 "your payment failed"), which is the difference between "try again" and
    losing a real customer's money;
  * orders are recorded in `event_orders` and marked paid/failed;
  * the webhook completes a purchase when the buyer's browser never came back, is
    signature-checked, and is idempotent.
In-memory FakeDB; no network.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_payments as pay
import event_purchase_service as buy


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


KEY, SECRET = "rzp_test_evt", "evtsecret456"
BUYER = {"user_id": "buyer1", "kind": "user"}


def _sign(order_id, payment_id, secret=SECRET):
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _keys_on():
    os.environ["RAZORPAY_KEY_ID"] = KEY
    os.environ["RAZORPAY_KEY_SECRET"] = SECRET


def _keys_off():
    os.environ["RAZORPAY_KEY_ID"] = "rzp_test_PLACEHOLDER"
    os.environ["RAZORPAY_KEY_SECRET"] = "PLACEHOLDER"


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)

    print("1. signature verification is local, exact and constant-time")
    _keys_on()
    _check(pay.configured() and pay.key_id() == KEY, "keys detected")
    good = _sign("order_A", "pay_A")
    _check(pay.verify_signature("order_A", "pay_A", good) is True, "valid signature accepted")
    _check(pay.verify_signature("order_A", "pay_A", "deadbeef") is False, "forged signature rejected")
    _check(pay.verify_signature("order_B", "pay_A", good) is False, "signature is bound to the order")
    _check(pay.verify_signature("order_A", "pay_B", good) is False, "signature is bound to the payment")
    _check(pay.verify_signature("order_A", "pay_A", "") is False, "empty signature rejected")

    print("2. NO keys → 'cannot verify', never 'invalid' (the money-losing bug)")
    _keys_off()
    try:
        pay.verify_signature("order_A", "pay_A", good)
        _check(False, "unconfigured verification must raise, not return False")
    except pay.PaymentUnavailable:
        _check(True, "unconfigured → PaymentUnavailable (retryable), not a false forgery verdict")

    print("3. placeholder keys count as unset")
    os.environ["RAZORPAY_KEY_ID"] = "rzp_live_PLACEHOLDER"
    os.environ["RAZORPAY_KEY_SECRET"] = SECRET
    _check(pay.configured() is False, "PLACEHOLDER key id is not 'configured'")

    print("4. webhook signature")
    _keys_on()
    body = json.dumps({"event": "payment.captured"}).encode()
    sig = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    _check(pay.verify_webhook(body, sig) is True, "valid webhook signature accepted")
    _check(pay.verify_webhook(body, "nope") is False, "forged webhook signature rejected")
    _check(pay.verify_webhook(body + b" ", sig) is False, "tampered body rejected")

    print("5. orders are recorded and settle to paid / failed")
    await db.event_orders.insert_one({"order_id": "order_R", "kind": "event_purchase",
                                      "event_id": "e1", "amount_inr": 2999, "status": "created"})
    await pay.mark_paid(db, "order_R", "pay_R")
    row = await pay.get_order(db, "order_R")
    _check(row["status"] == "paid" and row["payment_id"] == "pay_R", "order marked paid with its payment id")
    await pay.mark_failed(db, "order_R", "signature mismatch")
    row = await pay.get_order(db, "order_R")
    _check(row["status"] == "failed" and row["failure_reason"], "failures are recorded with a reason")

    print("6. purchase → pay → verify (end to end, no network)")
    _keys_off()                     # start_purchase must not need a live gateway to seed
    r = await buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                 template_id="royal_autumn", plan_key="ganesh_premium")
    eid = r["event_id"]
    _check(r["needs_payment"] is False and r["payments_live"] is False,
           "no keys → event still created, and the response says payments are off")

    # now simulate a configured gateway by injecting the order the way create_order would
    _keys_on()
    await db.events.update_one({"event_id": eid}, {"$set": {
        "plan_status": "awaiting_payment", "pending_order_id": "order_P",
        "granted_features": None}})
    await db.event_orders.insert_one({"order_id": "order_P", "kind": "event_purchase",
                                      "event_id": eid, "amount_inr": 2999, "status": "created"})
    await _expect(buy.verify_purchase(db, BUYER, event_id=eid, razorpay_order_id="order_P",
                                      razorpay_payment_id="pay_P", razorpay_signature="forged"),
                  400, "forged payment rejected")
    ev = await db.events.find_one({"event_id": eid})
    _check(ev.get("plan_status") != "ready", "a rejected payment does NOT grant the plan")

    ok = await buy.verify_purchase(db, BUYER, event_id=eid, razorpay_order_id="order_P",
                                   razorpay_payment_id="pay_P",
                                   razorpay_signature=_sign("order_P", "pay_P"))
    _check(ok["status"] == "ready", "valid payment completes the purchase")
    ev = await db.events.find_one({"event_id": eid})
    _check("journey" in (ev.get("granted_features") or []), "paid plan's features granted")
    order = await pay.get_order(db, "order_P")
    _check(order["status"] == "paid", "order row settled to paid")

    print("7. gateway unavailable mid-verify → 409 (retry), not 400 (lost payment)")
    await db.events.update_one({"event_id": eid}, {"$set": {"plan_status": "awaiting_payment"}})
    _keys_off()
    await _expect(buy.verify_purchase(db, BUYER, event_id=eid, razorpay_order_id="order_P",
                                      razorpay_payment_id="pay_P", razorpay_signature="x"),
                  409, "unconfigured gateway is retryable")

    print("8. webhook completes a purchase the browser never confirmed")
    r2 = await buy.start_purchase(db, BUYER, event_type="ganesh_chaturthi",
                                  template_id="azure_lagoon", plan_key="ganesh_basic")
    eid2 = r2["event_id"]
    _keys_on()
    await db.events.update_one({"event_id": eid2}, {"$set": {
        "plan_status": "awaiting_payment", "pending_order_id": "order_W",
        "granted_features": None}})
    await db.event_orders.insert_one({"order_id": "order_W", "kind": "event_purchase",
                                      "event_id": eid2, "amount_inr": 1499, "status": "created"})
    hook = json.dumps({"event": "payment.captured",
                       "payload": {"payment": {"entity": {"id": "pay_W", "order_id": "order_W",
                                                          "status": "captured"}}}}).encode()
    hsig = hmac.new(SECRET.encode(), hook, hashlib.sha256).hexdigest()
    await _expect(buy.webhook_purchase(db, hook, "bad"), 400, "forged webhook rejected")
    res = await buy.webhook_purchase(db, hook, hsig)
    _check(res["status"] == "ready", "webhook completes the purchase")
    ev2 = await db.events.find_one({"event_id": eid2})
    _check("countdown" in (ev2.get("granted_features") or []), "webhook granted the plan's features")
    again = await buy.webhook_purchase(db, hook, hsig)
    _check(again.get("already") is True, "replayed webhook is idempotent (no double grant)")

    print("9. unrelated webhook events are ignored safely")
    other = json.dumps({"event": "payment.failed",
                        "payload": {"payment": {"entity": {"id": "p", "order_id": "order_W"}}}}).encode()
    osig = hmac.new(SECRET.encode(), other, hashlib.sha256).hexdigest()
    _check((await buy.webhook_purchase(db, other, osig)).get("ignored") is True,
           "non-capture event ignored")

    _keys_off()
    print("\nALL EVENT PAYMENT TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
