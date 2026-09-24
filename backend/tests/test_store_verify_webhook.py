"""
Store payment-verification self-test — order-id binding + the webhook fallback.

    cd backend && python -m tests.test_store_verify_webhook

Two money/security paths added to store_features.py, neither previously covered:

  1. POST /api/store/order/verify must check the Razorpay signature against the
     order_id WE stored at order/create, never a client-supplied one. Otherwise a
     genuinely valid (order_id, payment_id, signature) triple from a cheap order
     can be replayed against an expensive order's internal id to mark it paid.
  2. POST /api/payments/store-webhook is the tab-closed-after-paying fallback:
     HMAC-signed, idempotent (dedupe by event+payment id), and never acts on an
     unverified event (missing/placeholder RAZORPAY_WEBHOOK_SECRET).

In-memory FakeDB; no network; a stub Razorpay client + a hand-built Request.
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
import store_features as store


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


class _StubUtility:
    """Mimics razorpay_client.utility.verify_payment_signature: succeeds ONLY
    for the order_id a 'genuine' payment was actually made against — exactly
    like the real gateway would, so the test can prove which order_id the
    endpoint sent it."""
    def __init__(self, genuine_order_id: str):
        self.genuine_order_id = genuine_order_id

    def verify_payment_signature(self, params):
        if params.get("razorpay_order_id") != self.genuine_order_id:
            raise Exception("signature does not match order")


class _StubRazorpay:
    def __init__(self, genuine_order_id: str):
        self.utility = _StubUtility(genuine_order_id)


class _FakeRequest:
    def __init__(self, body: bytes, headers: dict):
        self._body = body
        self.headers = headers

    async def body(self):
        return self._body


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


async def test_verify_rejects_client_supplied_order_id():
    print("\n[1] /verify: a valid signature for a DIFFERENT (cheap) order cannot "
          "mark an expensive order paid")
    db = FakeDB()
    await db.invitation_orders.insert_one({
        "id": "invord_expensive", "user_id": "u1",
        "razorpay_order_id": "order_expensive", "status": "created"})

    # The stub only validates signatures made against "order_cheap" — a stand-in
    # for an attacker's genuinely-paid, cheap order.
    razorpay_client = _StubRazorpay(genuine_order_id="order_cheap")
    router = store.build_store_router(
        db, razorpay_client=razorpay_client,
        get_current_public_user=lambda: {"user_id": "u1", "kind": "user"})
    verify = _endpoint(router, "/api/store/order/verify", "POST")

    payload = store.VerifyOrderRequest(
        order_id="invord_expensive", razorpay_order_id="order_cheap",
        razorpay_payment_id="pay_attacker", razorpay_signature="sig_attacker")

    raised = None
    try:
        await verify(payload, current={"user_id": "u1", "kind": "user"})
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400,
           "a mismatched order_id is rejected with 400, not accepted")
    _check("mismatch" in (raised.detail or "").lower(), "the reason names the mismatch")

    order = await db.invitation_orders.find_one({"id": "invord_expensive"}, {"_id": 0})
    _check(order["status"] == "created",
           "the expensive order was NOT marked paid by a cheap order's signature")


async def test_verify_rejects_order_with_no_stored_order_id():
    print("\n[2] /verify: an order with no stored razorpay_order_id can never verify")
    db = FakeDB()
    await db.invitation_orders.insert_one({
        "id": "invord_free_ish", "user_id": "u1",
        "razorpay_order_id": None, "status": "created"})
    router = store.build_store_router(
        db, razorpay_client=_StubRazorpay(genuine_order_id="order_x"),
        get_current_public_user=lambda: {"user_id": "u1", "kind": "user"})
    verify = _endpoint(router, "/api/store/order/verify", "POST")

    payload = store.VerifyOrderRequest(
        order_id="invord_free_ish", razorpay_order_id="order_x",
        razorpay_payment_id="pay_1", razorpay_signature="sig_1")
    raised = None
    try:
        await verify(payload, current={"user_id": "u1", "kind": "user"})
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400,
           "no stored order_id -> 400, never a silent pass")


async def test_verify_succeeds_against_stored_order_id():
    print("\n[3] /verify: the real flow (matching order_id) still marks the order paid")
    db = FakeDB()
    await db.invitation_orders.insert_one({
        "id": "invord_1", "user_id": "u1",
        "razorpay_order_id": "order_real", "status": "created", "build_status": "awaiting_payment"})
    router = store.build_store_router(
        db, razorpay_client=_StubRazorpay(genuine_order_id="order_real"),
        get_current_public_user=lambda: {"user_id": "u1", "kind": "user"})
    verify = _endpoint(router, "/api/store/order/verify", "POST")

    payload = store.VerifyOrderRequest(
        order_id="invord_1", razorpay_order_id="order_real",
        razorpay_payment_id="pay_1", razorpay_signature="sig_1")
    out = await verify(payload, current={"user_id": "u1", "kind": "user"})
    _check(out["status"] == "paid", "a genuine, matching verification still pays the order")

    # Omitting razorpay_order_id in the payload (already-buggy clients) must not
    # break the legitimate flow either — the stored id is always used.
    db2 = FakeDB()
    await db2.invitation_orders.insert_one({
        "id": "invord_2", "user_id": "u1",
        "razorpay_order_id": "order_real2", "status": "created"})
    router2 = store.build_store_router(
        db2, razorpay_client=_StubRazorpay(genuine_order_id="order_real2"),
        get_current_public_user=lambda: {"user_id": "u1", "kind": "user"})
    verify2 = _endpoint(router2, "/api/store/order/verify", "POST")
    payload2 = store.VerifyOrderRequest(
        order_id="invord_2", razorpay_order_id="", razorpay_payment_id="pay_2",
        razorpay_signature="sig_2")
    out2 = await verify2(payload2, current={"user_id": "u1", "kind": "user"})
    _check(out2["status"] == "paid", "an empty payload order_id still verifies against the stored one")


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _webhook_body(event: str, order_id: str, payment_id: str) -> bytes:
    return json.dumps({
        "event": event,
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id,
                                            "status": "captured"}}},
    }).encode("utf-8")


async def test_webhook_unverified_never_acts():
    print("\n[4] webhook: no/placeholder secret -> stored for audit, order NOT paid")
    db = FakeDB()
    await db.invitation_orders.insert_one({
        "id": "invord_1", "razorpay_order_id": "order_1", "status": "created"})
    router = store.build_store_router(
        db, razorpay_client=None, get_current_public_user=lambda: {"user_id": "u1"})
    webhook = _endpoint(router, "/api/payments/store-webhook", "POST")

    os.environ.pop("RAZORPAY_WEBHOOK_SECRET", None)
    body = _webhook_body("payment.captured", "order_1", "pay_1")
    out = await webhook(_FakeRequest(body, {"X-Razorpay-Signature": "irrelevant"}))
    _check(out == {"received": True}, "webhook always 200s so Razorpay does not retry forever")

    events = await db.razorpay_events.find({}, {"_id": 0}).to_list(10)
    _check(len(events) == 1 and events[0]["verified"] is False,
           "the event is audited as unverified")
    order = await db.invitation_orders.find_one({"id": "invord_1"}, {"_id": 0})
    _check(order["status"] == "created", "an unverified event never marks an order paid")


async def test_webhook_verified_pays_and_is_idempotent():
    print("\n[5] webhook: verified payment.captured pays the order, once")
    db = FakeDB()
    await db.invitation_orders.insert_one({
        "id": "invord_2", "razorpay_order_id": "order_2", "status": "created",
        "build_status": "awaiting_payment"})
    router = store.build_store_router(
        db, razorpay_client=None, get_current_public_user=lambda: {"user_id": "u1"})
    webhook = _endpoint(router, "/api/payments/store-webhook", "POST")

    secret = "whsec_test_123"
    os.environ["RAZORPAY_WEBHOOK_SECRET"] = secret
    body = _webhook_body("payment.captured", "order_2", "pay_2")
    sig = _sign(secret, body)

    out = await webhook(_FakeRequest(body, {"X-Razorpay-Signature": sig}))
    _check(out == {"received": True}, "verified webhook 200s")
    order = await db.invitation_orders.find_one({"id": "invord_2"}, {"_id": 0})
    _check(order["status"] == "paid" and order["build_status"] == "pending_info",
           "a verified payment.captured flips the buyer-abandoned order to paid")

    # Replay the identical delivery (Razorpay retries on any non-2xx, and even
    # on 2xx in practice) -> must not double-process or double-audit.
    await webhook(_FakeRequest(body, {"X-Razorpay-Signature": sig}))
    events = await db.razorpay_events.find({}, {"_id": 0}).to_list(10)
    _check(len(events) == 1, "a replayed event is deduped, not re-audited")

    del os.environ["RAZORPAY_WEBHOOK_SECRET"]


async def test_webhook_rejects_bad_signature():
    print("\n[6] webhook: a configured secret rejects a forged signature")
    db = FakeDB()
    router = store.build_store_router(
        db, razorpay_client=None, get_current_public_user=lambda: {"user_id": "u1"})
    webhook = _endpoint(router, "/api/payments/store-webhook", "POST")

    os.environ["RAZORPAY_WEBHOOK_SECRET"] = "whsec_real"
    body = _webhook_body("payment.captured", "order_x", "pay_x")
    raised = None
    try:
        await webhook(_FakeRequest(body, {"X-Razorpay-Signature": "not-the-real-signature"}))
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400,
           "a forged signature is rejected, not silently accepted")
    del os.environ["RAZORPAY_WEBHOOK_SECRET"]


async def main():
    print("MAJA — store payment verification (order-id binding + webhook fallback)")
    await test_verify_rejects_client_supplied_order_id()
    await test_verify_rejects_order_with_no_stored_order_id()
    await test_verify_succeeds_against_stored_order_id()
    await test_webhook_unverified_never_acts()
    await test_webhook_verified_pays_and_is_idempotent()
    await test_webhook_rejects_bad_signature()
    print("\nALL STORE VERIFY/WEBHOOK CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
