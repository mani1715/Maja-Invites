"""
Settlement webhook self-test — subscriptions + link reactivation.

    cd backend && python -m tests.test_settlement_webhooks_subs
    (or) PYTHONIOENCODING=utf-8 python -m pytest tests/test_settlement_webhooks_subs.py -q

Razorpay captures money server-side the instant checkout completes. If the
buyer's browser dies before calling /verify, the payment is captured but the
app row stayed `pending` forever — these two flows had no webhook safety net:

  subscription_service.py : POST /api/subscriptions/webhook
  link_reactivation.py    : POST /api/reactivate/webhook

Both webhooks reuse event_payments.verify_webhook / webhook_payment (the
canonical signed-webhook helpers already proven by store_features.py /
event_purchase_service.py) and settle through the SAME private helper the
browser /verify path calls — _settle_subscription / _settle_reactivation — so
activation side effects (period dates, ledger rows, audit rows, portfolio
folder, expiry extension) never diverge between the two paths.

In-memory FakeDB; no network; hand-built Request (mirrors
tests/test_store_verify_webhook.py's structure).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os

import pytest

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException

from tests.test_storage_orchestrator import FakeDB
import subscription_service as subs
import link_reactivation as react

WEBHOOK_SECRET = "whsec_test_settlement"
KEY_SECRET = "keysecret_test_settlement"

# These used to be written straight into os.environ at module scope. pytest
# imports EVERY test module during collection, so that leaked platform Razorpay
# keys into unrelated suites no matter the run order — it broke
# test_shagun_settlement's "photographer has unusable keys" case, which needs
# the ambient gateway config to stay absent. event_payments reads the env
# lazily (keys()/webhook_secret() are called per request), so scoping the writes
# to this module's tests is safe and keeps them isolated.
_ENV = {
    "RAZORPAY_WEBHOOK_SECRET": WEBHOOK_SECRET,
    "RAZORPAY_KEY_ID": "rzp_test_dummy",
    "RAZORPAY_KEY_SECRET": KEY_SECRET,
}


@pytest.fixture(autouse=True)
def _razorpay_env(monkeypatch):
    for k, v in _ENV.items():
        monkeypatch.setenv(k, v)
    yield


def _apply_env_for_standalone():
    """`python -m tests.test_settlement_webhooks_subs` has no pytest fixtures."""
    os.environ.update(_ENV)


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


class _FakeRequest:
    def __init__(self, body: bytes, headers: dict):
        self._body = body
        self.headers = headers

    async def body(self):
        return self._body


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _webhook_body(event: str, order_id: str, payment_id: str) -> bytes:
    return json.dumps({
        "event": event,
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id,
                                            "status": "captured"}}},
    }).encode("utf-8")


def _checkout_sig(order_id: str, payment_id: str) -> str:
    return hmac.new(KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(),
                    hashlib.sha256).hexdigest()


async def _require_admin():  # never actually called — endpoints invoked directly
    raise NotImplementedError


async def _require_super_admin():
    raise NotImplementedError


def _sub_router(db):
    return subs.build_subscription_router(db, None, _require_admin, _require_super_admin)


def _react_router(db):
    return react.build_link_reactivation_router(db, _require_admin, razorpay_client=None)


def _pending_sub(sub_id, order_id, studio_id="studio_1", product="portfolio",
                 tier="Premium", cycle="monthly", total_paise=70738):
    return {
        "id": sub_id, "studio_id": studio_id, "product": product, "tier": tier,
        "cycle": cycle, "status": "pending", "auto_renew": False,
        "quote": {"total_paise": total_paise, "currency": "INR"},
        "provider": "razorpay_order", "razorpay_subscription_id": order_id,
        "mock_token": None, "current_period_start": None, "current_period_end": None,
        "created_at": subs._now_iso(), "activated_at": None,
    }


# --------------------------------------------------------------------------- #
# subscription_service.py : POST /api/subscriptions/webhook
# --------------------------------------------------------------------------- #
async def test_sub_webhook_settles_pending_subscription():
    print("\n[1] subscription webhook: valid signature settles a pending subscription")
    db = FakeDB()
    await db.subscriptions.insert_one(_pending_sub("sub_1", "order_sub_1"))
    await db.orders.insert_one({"id": "ord_1", "subscription_id": "sub_1", "status": "created"})
    webhook = _endpoint(_sub_router(db), "/api/subscriptions/webhook", "POST")

    body = _webhook_body("payment.captured", "order_sub_1", "pay_1")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "webhook 200s")

    sub = await db.subscriptions.find_one({"id": "sub_1"}, {"_id": 0})
    _check(sub["status"] == "active", "subscription flipped to active by the webhook")
    _check(sub.get("current_period_end"), "billing period computed")
    order = await db.orders.find_one({"id": "ord_1"}, {"_id": 0})
    _check(order["status"] == "paid", "matching order row marked paid too (shared settlement)")
    pay = await db.payments.find_one({"subscription_id": "sub_1"}, {"_id": 0})
    _check(pay is not None and pay["amount_paise"] == 70738, "payment ledger row written")
    aud = await db.audit_logs.find_one({"target": "sub_1"}, {"_id": 0})
    _check(aud is not None and aud["action"] == "subscription.activated" and aud["via"] == "webhook",
           "audit row written, tagged via=webhook")


async def test_sub_webhook_rejects_bad_signature():
    print("\n[2] subscription webhook: forged signature rejected, no state change")
    db = FakeDB()
    await db.subscriptions.insert_one(_pending_sub("sub_2", "order_sub_2"))
    webhook = _endpoint(_sub_router(db), "/api/subscriptions/webhook", "POST")
    body = _webhook_body("payment.captured", "order_sub_2", "pay_2")

    raised = None
    try:
        await webhook(_FakeRequest(body, {"x-razorpay-signature": "not-the-real-signature"}))
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400, "forged signature -> 400")
    sub = await db.subscriptions.find_one({"id": "sub_2"}, {"_id": 0})
    _check(sub["status"] == "pending", "no state change on a forged signature")
    _check(await db.payments.count_documents({}) == 0, "no payment ledger row on a forged signature")


async def test_sub_webhook_replay_is_idempotent():
    print("\n[3] subscription webhook: replay settles exactly once")
    db = FakeDB()
    await db.subscriptions.insert_one(_pending_sub("sub_3", "order_sub_3"))
    webhook = _endpoint(_sub_router(db), "/api/subscriptions/webhook", "POST")
    body = _webhook_body("payment.captured", "order_sub_3", "pay_3")
    sig = _sign(WEBHOOK_SECRET, body)

    await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))

    pays = await db.payments.find({"subscription_id": "sub_3"}, {"_id": 0}).to_list(10)
    _check(len(pays) == 1, "replay does not double-write the payment ledger")
    auds = await db.audit_logs.find({"target": "sub_3"}, {"_id": 0}).to_list(10)
    _check(len(auds) == 1, "replay does not double-write the audit log")


async def test_sub_webhook_noop_after_verify_already_settled():
    print("\n[4] subscription webhook: arriving after /verify already settled -> no-op")
    db = FakeDB()
    await db.subscriptions.insert_one(_pending_sub("sub_4", "order_sub_4"))
    await db.orders.insert_one({"id": "ord_4", "subscription_id": "sub_4", "status": "created"})
    router = _sub_router(db)
    verify_ep = _endpoint(router, "/api/subscriptions/verify", "POST")
    webhook = _endpoint(router, "/api/subscriptions/webhook", "POST")

    payload = subs.VerifySubscriptionRequest(
        subscription_id="sub_4", razorpay_payment_id="pay_4",
        razorpay_signature=_checkout_sig("order_sub_4", "pay_4"))
    out = await verify_ep(payload, admin={"admin_id": "studio_1"})
    _check(out["status"] == "active", "/verify settles first")

    body = _webhook_body("payment.captured", "order_sub_4", "pay_4")
    out2 = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out2 == {"received": True}, "webhook still 200s")
    pays = await db.payments.find({"subscription_id": "sub_4"}, {"_id": 0}).to_list(10)
    _check(len(pays) == 1, "webhook arriving after /verify does not double-settle")


async def test_sub_webhook_unknown_event_is_noop():
    print("\n[5] subscription webhook: unknown event type -> 200, no-op")
    db = FakeDB()
    await db.subscriptions.insert_one(_pending_sub("sub_5", "order_sub_5"))
    webhook = _endpoint(_sub_router(db), "/api/subscriptions/webhook", "POST")
    body = _webhook_body("payment.failed", "order_sub_5", "pay_5")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "unrelated event type 200s")
    sub = await db.subscriptions.find_one({"id": "sub_5"}, {"_id": 0})
    _check(sub["status"] == "pending", "unrelated event type does not touch state")


async def test_sub_webhook_unknown_order_id_is_noop():
    print("\n[6] subscription webhook: unknown order id -> 200, no state leaked")
    db = FakeDB()
    webhook = _endpoint(_sub_router(db), "/api/subscriptions/webhook", "POST")
    body = _webhook_body("payment.captured", "order_does_not_exist", "pay_6")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "unknown order id still 200s (does not leak existence)")


# --------------------------------------------------------------------------- #
# link_reactivation.py : POST /api/reactivate/webhook
# --------------------------------------------------------------------------- #
def _pending_react(rid, order_id, profile_id, studio_id="studio_1", days=10, amount_paise=500_00):
    return {
        "id": rid, "profile_id": profile_id, "studio_id": studio_id, "days": days,
        "amount_paise": amount_paise, "provider": "razorpay_order",
        "razorpay_subscription_id": order_id, "mock_token": None,
        "status": "pending", "created_at": react._now().isoformat(),
    }


async def test_react_webhook_settles_pending_reactivation():
    print("\n[7] reactivation webhook: valid signature reactivates the expired link")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof_1", "expires_at": None,
                                  "expired": True, "enabled": False})
    await db.link_reactivations.insert_one(_pending_react("react_1", "order_react_1", "prof_1"))
    webhook = _endpoint(_react_router(db), "/api/reactivate/webhook", "POST")

    body = _webhook_body("payment.captured", "order_react_1", "pay_r1")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "webhook 200s")

    row = await db.link_reactivations.find_one({"id": "react_1"}, {"_id": 0})
    _check(row["status"] == "paid", "reactivation row flipped to paid")
    prof = await db.profiles.find_one({"id": "prof_1"}, {"_id": 0})
    _check(prof["enabled"] is True and prof["expired"] is False, "link brought back live")
    _check(prof.get("expires_at"), "expiry extended")
    pay = await db.payments.find_one({"reactivation_id": "react_1"}, {"_id": 0})
    _check(pay is not None and pay["amount_paise"] == 500_00, "payment ledger row written")


async def test_react_webhook_rejects_bad_signature():
    print("\n[8] reactivation webhook: forged signature rejected, no state change")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof_2", "expires_at": None,
                                  "expired": True, "enabled": False})
    await db.link_reactivations.insert_one(_pending_react("react_2", "order_react_2", "prof_2"))
    webhook = _endpoint(_react_router(db), "/api/reactivate/webhook", "POST")
    body = _webhook_body("payment.captured", "order_react_2", "pay_r2")

    raised = None
    try:
        await webhook(_FakeRequest(body, {"x-razorpay-signature": "not-the-real-signature"}))
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400, "forged signature -> 400")
    row = await db.link_reactivations.find_one({"id": "react_2"}, {"_id": 0})
    _check(row["status"] == "pending", "no state change on a forged signature")
    prof = await db.profiles.find_one({"id": "prof_2"}, {"_id": 0})
    _check(prof["enabled"] is False, "link NOT reactivated on a forged signature")


async def test_react_webhook_replay_is_idempotent():
    print("\n[9] reactivation webhook: replay does not extend expiry twice")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof_3", "expires_at": None,
                                  "expired": True, "enabled": False})
    await db.link_reactivations.insert_one(_pending_react("react_3", "order_react_3", "prof_3"))
    webhook = _endpoint(_react_router(db), "/api/reactivate/webhook", "POST")
    body = _webhook_body("payment.captured", "order_react_3", "pay_r3")
    sig = _sign(WEBHOOK_SECRET, body)

    await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    prof_1 = await db.profiles.find_one({"id": "prof_3"}, {"_id": 0})
    await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    prof_2 = await db.profiles.find_one({"id": "prof_3"}, {"_id": 0})

    _check(prof_1["expires_at"] == prof_2["expires_at"], "replay does not extend expiry twice")
    pays = await db.payments.find({"reactivation_id": "react_3"}, {"_id": 0}).to_list(10)
    _check(len(pays) == 1, "replay does not double-write the payment ledger")


async def test_react_webhook_noop_after_verify_already_settled():
    print("\n[10] reactivation webhook: arriving after /verify already settled -> no-op")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof_4", "expires_at": None,
                                  "expired": True, "enabled": False})
    await db.link_reactivations.insert_one(_pending_react("react_4", "order_react_4", "prof_4"))
    router = _react_router(db)
    verify_ep = _endpoint(router, "/api/admin/profiles/{profile_id}/reactivate/verify", "POST")
    webhook = _endpoint(router, "/api/reactivate/webhook", "POST")

    payload = react.VerifyIn(reactivation_id="react_4", razorpay_payment_id="pay_r4",
                             razorpay_signature=_checkout_sig("order_react_4", "pay_r4"))
    out = await verify_ep("prof_4", payload, admin={"admin_id": "studio_1"})
    _check(out["status"] == "paid", "/verify settles first")
    expires_after_verify = (await db.profiles.find_one({"id": "prof_4"}, {"_id": 0}))["expires_at"]

    body = _webhook_body("payment.captured", "order_react_4", "pay_r4")
    out2 = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out2 == {"received": True}, "webhook still 200s")
    expires_after_webhook = (await db.profiles.find_one({"id": "prof_4"}, {"_id": 0}))["expires_at"]
    _check(expires_after_verify == expires_after_webhook,
           "webhook arriving after /verify does not extend expiry again")
    pays = await db.payments.find({"reactivation_id": "react_4"}, {"_id": 0}).to_list(10)
    _check(len(pays) == 1, "webhook arriving after /verify does not double-settle")


async def test_react_webhook_unknown_event_is_noop():
    print("\n[11] reactivation webhook: unknown event type -> 200, no-op")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof_5", "expires_at": None,
                                  "expired": True, "enabled": False})
    await db.link_reactivations.insert_one(_pending_react("react_5", "order_react_5", "prof_5"))
    webhook = _endpoint(_react_router(db), "/api/reactivate/webhook", "POST")
    body = _webhook_body("payment.failed", "order_react_5", "pay_r5")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "unrelated event type 200s")
    row = await db.link_reactivations.find_one({"id": "react_5"}, {"_id": 0})
    _check(row["status"] == "pending", "unrelated event type does not touch state")


async def test_react_webhook_unknown_order_id_is_noop():
    print("\n[12] reactivation webhook: unknown order id -> 200, no state leaked")
    db = FakeDB()
    webhook = _endpoint(_react_router(db), "/api/reactivate/webhook", "POST")
    body = _webhook_body("payment.captured", "order_does_not_exist", "pay_r6")
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": _sign(WEBHOOK_SECRET, body)}))
    _check(out == {"received": True}, "unknown order id still 200s (does not leak existence)")


async def main():
    print("MAJA — subscription + link-reactivation settlement webhooks")
    await test_sub_webhook_settles_pending_subscription()
    await test_sub_webhook_rejects_bad_signature()
    await test_sub_webhook_replay_is_idempotent()
    await test_sub_webhook_noop_after_verify_already_settled()
    await test_sub_webhook_unknown_event_is_noop()
    await test_sub_webhook_unknown_order_id_is_noop()
    await test_react_webhook_settles_pending_reactivation()
    await test_react_webhook_rejects_bad_signature()
    await test_react_webhook_replay_is_idempotent()
    await test_react_webhook_noop_after_verify_already_settled()
    await test_react_webhook_unknown_event_is_noop()
    await test_react_webhook_unknown_order_id_is_noop()
    print("\nALL SETTLEMENT WEBHOOK CHECKS PASSED")


if __name__ == "__main__":
    _apply_env_for_standalone()
    asyncio.run(main())
