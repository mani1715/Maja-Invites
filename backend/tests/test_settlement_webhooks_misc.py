"""
Webhook settlement self-test for the three payment flows in this owner's scope:
donations (event_finance_service), studio cloud storage (studio_storage), and
the portfolio ₹100 build-help unlock (portfolio_service).

    cd backend && python -m pytest tests/test_settlement_webhooks_misc.py -q

Problem covered: Razorpay captures money server-side the moment checkout
completes. If the browser dies before calling /verify, the app row stays
"pending" forever even though the money is gone. Each flow now has a signed
webhook fallback that settles the SAME state the browser /verify path would,
idempotently (CAS on the old status), so:

  * a valid signature on a pending order settles it with the correct side
    effects (donation receipt, storage subscription, build-help unlock);
  * a forged signature is rejected and changes nothing;
  * a replayed webhook delivery settles exactly once;
  * calling the webhook after the browser already verified (or vice versa)
    is a 200 no-op, never a double-grant;
  * an unrelated/non-payment webhook event is a 200 no-op.

In-memory FakeDB (tests.test_storage_orchestrator.FakeDB); no network, no
Postgres, no real Razorpay — signatures are computed locally with the same
HMAC-SHA256 algorithm event_payments.py uses, against a fixed test secret.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys

import pytest

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException

from tests.test_storage_orchestrator import FakeDB
import event_finance_service as finance
import studio_storage
import portfolio_service
import event_payments as pay

RZP_SECRET = "test_secret_settlement_misc"

# These were applied at import time as well as via the fixture below, so the
# file would work standalone. But pytest imports EVERY test module during
# collection, so the import-time writes — especially the pop() — leaked into
# unrelated suites regardless of run order and broke
# test_shagun_settlement's "photographer has unusable keys" case. The fixture
# already covers the pytest path; standalone now calls the applier explicitly.
def _apply_env_for_standalone():
    """`python -m tests.test_settlement_webhooks_misc` has no pytest fixtures."""
    os.environ["RAZORPAY_KEY_ID"] = "rzp_t3st_settlement"
    os.environ["RAZORPAY_KEY_SECRET"] = RZP_SECRET
    os.environ.pop("RAZORPAY_WEBHOOK_SECRET", None)


@pytest.fixture(autouse=True)
def _rzp_env(monkeypatch):
    """Deterministic Razorpay config for every test in this module.
    RAZORPAY_WEBHOOK_SECRET is left unset so event_payments.webhook_secret()
    falls back to the same key secret used for order/payment signatures —
    one secret to sign both kinds of message with in these tests."""
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_t3st_settlement")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", RZP_SECRET)
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _order_sig(order_id: str, payment_id: str, secret: str = RZP_SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), f"{order_id}|{payment_id}".encode("utf-8"),
                    hashlib.sha256).hexdigest()


def _webhook_body(event: str, order_id: str, payment_id: str) -> bytes:
    return json.dumps({
        "event": event,
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id,
                                            "status": "captured"}}},
    }).encode("utf-8")


def _webhook_sig(body: bytes, secret: str = RZP_SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class _FakeRequest:
    def __init__(self, body: bytes, headers: dict):
        self._body = body
        self.headers = headers

    async def body(self):
        return self._body


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


# =========================================================================== #
# 1. DONATIONS (event_finance_service) — plain module functions, no router
#    needed: verify_donation_payment(db, payload) / webhook_donation_payment
#    (db, raw_body, signature).
# =========================================================================== #
async def _seed_donation(db, order_id="rord_1", amount=501, event_id="evt1"):
    await db.events.insert_one({"event_id": event_id, "title": "Sharma Wedding"})
    await db.donations.insert_one({
        "id": "don1", "child_id": "don1", "event_id": event_id,
        "donor_name": "Ravi", "amount": amount, "currency": "INR",
        "razorpay_order_id": order_id, "status": "pending", "is_anonymous": False,
        "deleted_at": None, "created_at": "2026-08-01T00:00:00Z",
        "updated_at": "2026-08-01T00:00:00Z",
    })


async def test_donation_valid_signature_settles():
    print("\n[donation 1] valid signature on a pending order -> settled with a receipt")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_a")
    pay_id = "payd_a"
    sig = _order_sig("rord_a", pay_id)
    out = await finance.verify_donation_payment(
        db, {"razorpay_order_id": "rord_a", "razorpay_payment_id": pay_id, "razorpay_signature": sig})
    _check(out["verified"] and not out.get("already"), "verify reports a fresh settlement")
    _check(bool(out.get("receipt_number")), "a receipt number was minted")
    don = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    _check(don["status"] == "received" and don["receipt_number"] == out["receipt_number"],
           "the donation row flips to received with the same receipt")


async def test_donation_forged_signature_rejected():
    print("\n[donation 2] forged signature -> 400, zero state change")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_b")
    raised = None
    try:
        await finance.verify_donation_payment(
            db, {"razorpay_order_id": "rord_b", "razorpay_payment_id": "payd_b",
                 "razorpay_signature": "not-the-real-signature"})
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400, "forged signature rejected with 400")
    don = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    _check(don["status"] == "pending" and not don.get("receipt_number"),
           "no receipt minted, donation still pending")


async def test_donation_webhook_replay_settles_once():
    print("\n[donation 3] webhook replay (same delivery twice) settles exactly once")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_c")
    pay_id = "payd_c"
    body = _webhook_body("payment.captured", "rord_c", pay_id)
    sig = _webhook_sig(body)

    out1 = await finance.webhook_donation_payment(db, body, sig)
    _check(out1 == {"received": True, "settled": True}, "first delivery settles")
    don_after_first = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    receipt = don_after_first["receipt_number"]
    _check(bool(receipt), "receipt minted on first delivery")

    out2 = await finance.webhook_donation_payment(db, body, sig)
    _check(out2 == {"received": True, "settled": True}, "replay still 200s")
    don_after_replay = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    _check(don_after_replay["receipt_number"] == receipt,
           "replay did not mint a second receipt")


async def test_donation_webhook_after_verify_is_noop():
    print("\n[donation 4] webhook arriving after the browser already verified -> 200 no-op")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_d")
    pay_id = "payd_d"
    sig = _order_sig("rord_d", pay_id)
    verified = await finance.verify_donation_payment(
        db, {"razorpay_order_id": "rord_d", "razorpay_payment_id": pay_id, "razorpay_signature": sig})
    receipt = verified["receipt_number"]

    body = _webhook_body("payment.captured", "rord_d", pay_id)
    wsig = _webhook_sig(body)
    out = await finance.webhook_donation_payment(db, body, wsig)
    _check(out == {"received": True, "settled": True}, "webhook after verify 200s")
    don = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    _check(don["receipt_number"] == receipt, "the receipt from /verify is unchanged")


async def test_donation_verify_after_webhook_is_noop():
    print("\n[donation 5] browser /verify arriving after the webhook already settled -> no-op, same receipt")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_e")
    pay_id = "payd_e"
    body = _webhook_body("payment.captured", "rord_e", pay_id)
    wsig = _webhook_sig(body)
    await finance.webhook_donation_payment(db, body, wsig)
    don = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    receipt = don["receipt_number"]

    sig = _order_sig("rord_e", pay_id)
    out = await finance.verify_donation_payment(
        db, {"razorpay_order_id": "rord_e", "razorpay_payment_id": pay_id, "razorpay_signature": sig})
    _check(out.get("already") is True, "verify recognizes the webhook already settled it")
    _check(out["receipt_number"] == receipt, "same receipt returned both ways (idempotent both directions)")


async def test_donation_webhook_unknown_event_type_noop():
    print("\n[donation 6] unrelated webhook event type -> 200 no-op")
    db = FakeDB()
    await _seed_donation(db, order_id="rord_f")
    body = _webhook_body("refund.processed", "rord_f", "payd_f")
    sig = _webhook_sig(body)
    out = await finance.webhook_donation_payment(db, body, sig)
    _check(out == {"received": True}, "non-payment event types are a no-op")
    don = await db.donations.find_one({"id": "don1"}, {"_id": 0})
    _check(don["status"] == "pending", "donation untouched by the unrelated event")


# =========================================================================== #
# 2. STUDIO STORAGE (studio_storage) — module-level route functions reference
#    the shared `_db` global, so studio_storage.init() binds it per test.
# =========================================================================== #
async def _seed_storage_order(db, order_id="sord_1", admin_id="adminA", plan_id="plan1",
                              amount_inr=99):
    await db.studio_storage_plans.insert_one({
        "id": plan_id, "name": "50 GB - Monthly", "gb_limit": 50, "duration_days": 30,
        "grace_days": 30, "price_inr": 149, "price_founding_inr": 99, "is_active": True,
    })
    await db.event_orders.insert_one({
        "order_id": order_id, "kind": "studio_storage", "event_id": admin_id,
        "receipt": f"ss_{admin_id}", "amount_inr": amount_inr, "amount_paise": amount_inr * 100,
        "currency": "INR", "status": "created",
        "notes": {"plan_id": plan_id, "admin_id": admin_id, "type": "studio_storage"},
        "created_at": "2026-08-01T00:00:00Z", "updated_at": "2026-08-01T00:00:00Z",
    })


async def test_storage_valid_signature_settles():
    print("\n[storage 1] valid signature on a pending order -> subscription created")
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_storage_order(db, order_id="sord_a")
    pay_id = "pays_a"
    sig = _order_sig("sord_a", pay_id)
    req = studio_storage.VerifyPaymentRequest(
        razorpay_order_id="sord_a", razorpay_payment_id=pay_id, razorpay_signature=sig, plan_id="plan1")
    out = await studio_storage.verify_payment(req, admin={"admin_id": "adminA"})
    _check(out["renewed"] is False and not out.get("already"), "fresh subscription, not a replay")
    sub = out["subscription"]
    _check(sub["admin_id"] == "adminA" and sub["status"] == "active" and sub["plan_id"] == "plan1",
           "subscription granted to the paying studio for the paid plan")
    order = await db.event_orders.find_one({"order_id": "sord_a"}, {"_id": 0})
    _check(order["status"] == "paid", "the event_orders ledger row is marked paid too")


async def test_storage_forged_signature_rejected():
    print("\n[storage 2] forged signature -> 400, zero state change")
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_storage_order(db, order_id="sord_b")
    req = studio_storage.VerifyPaymentRequest(
        razorpay_order_id="sord_b", razorpay_payment_id="pays_b",
        razorpay_signature="not-the-real-signature", plan_id="plan1")
    raised = None
    try:
        await studio_storage.verify_payment(req, admin={"admin_id": "adminA"})
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400, "forged signature rejected with 400")
    subs = await db.studio_storage_subscriptions.find({}, {"_id": 0}).to_list(10)
    _check(subs == [], "no subscription was created")
    order = await db.event_orders.find_one({"order_id": "sord_b"}, {"_id": 0})
    _check(order["status"] == "created", "the order was never marked paid")


async def test_storage_webhook_replay_settles_once():
    print("\n[storage 3] webhook replay settles exactly once (no double-extension)")
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_storage_order(db, order_id="sord_c")
    pay_id = "pays_c"
    body = _webhook_body("payment.captured", "sord_c", pay_id)
    sig = _webhook_sig(body)

    out1 = await studio_storage.storage_webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out1 == {"received": True, "settled": True}, "first delivery settles")
    sub1 = await db.studio_storage_subscriptions.find_one({"admin_id": "adminA"}, {"_id": 0})
    expires_after_first = sub1["expires_at"]

    out2 = await studio_storage.storage_webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out2 == {"received": True, "settled": True}, "replay still 200s")
    sub2 = await db.studio_storage_subscriptions.find_one({"admin_id": "adminA"}, {"_id": 0})
    _check(sub2["expires_at"] == expires_after_first,
           "replay did not extend expires_at a second time")
    subs = await db.studio_storage_subscriptions.find({}, {"_id": 0}).to_list(10)
    _check(len(subs) == 1, "still exactly one subscription row")


async def test_storage_webhook_after_verify_is_noop():
    print("\n[storage 4] webhook arriving after the browser already verified -> 200 no-op")
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_storage_order(db, order_id="sord_d")
    pay_id = "pays_d"
    sig = _order_sig("sord_d", pay_id)
    req = studio_storage.VerifyPaymentRequest(
        razorpay_order_id="sord_d", razorpay_payment_id=pay_id, razorpay_signature=sig, plan_id="plan1")
    verified = await studio_storage.verify_payment(req, admin={"admin_id": "adminA"})
    expires_after_verify = verified["subscription"]["expires_at"]

    body = _webhook_body("payment.captured", "sord_d", pay_id)
    wsig = _webhook_sig(body)
    out = await studio_storage.storage_webhook(_FakeRequest(body, {"x-razorpay-signature": wsig}))
    _check(out == {"received": True, "settled": True}, "webhook after verify 200s")
    sub = await db.studio_storage_subscriptions.find_one({"admin_id": "adminA"}, {"_id": 0})
    _check(sub["expires_at"] == expires_after_verify, "expires_at unchanged by the webhook")
    subs = await db.studio_storage_subscriptions.find({}, {"_id": 0}).to_list(10)
    _check(len(subs) == 1, "still exactly one subscription row")


async def test_storage_webhook_unknown_event_type_noop():
    print("\n[storage 5] unrelated webhook event type -> 200 no-op")
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_storage_order(db, order_id="sord_e")
    body = _webhook_body("refund.processed", "sord_e", "pays_e")
    sig = _webhook_sig(body)
    out = await studio_storage.storage_webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out == {"received": True}, "non-payment event types are a no-op")
    subs = await db.studio_storage_subscriptions.find({}, {"_id": 0}).to_list(10)
    _check(subs == [], "no subscription created")


# =========================================================================== #
# 3. PORTFOLIO BUILD-HELP (portfolio_service) — routes are nested inside
#    build_portfolio_router(), so fetch the underlying functions via the
#    router like tests/test_store_verify_webhook.py does.
# =========================================================================== #
async def _seed_build_help_order(db, order_id="pord_1", studio_id="studioA"):
    await db.portfolio_build_unlocks.insert_one({
        "id": "pbu1", "studio_id": studio_id, "order_id": order_id, "amount_inr": 100,
        "status": "created", "created_at": "2026-08-01T00:00:00Z",
    })
    await db.event_orders.insert_one({
        "order_id": order_id, "kind": "portfolio_build_help", "event_id": "",
        "receipt": f"pbh_{studio_id}", "amount_inr": 100, "amount_paise": 10000,
        "currency": "INR", "status": "created", "notes": {"studio_id": studio_id},
        "created_at": "2026-08-01T00:00:00Z", "updated_at": "2026-08-01T00:00:00Z",
    })


def _portfolio_router(db):
    return portfolio_service.build_portfolio_router(db, require_admin=lambda: None)


async def test_build_help_valid_signature_settles():
    print("\n[build-help 1] valid signature on a pending order -> unlocked")
    db = FakeDB()
    await _seed_build_help_order(db, order_id="pord_a")
    router = _portfolio_router(db)
    verify = _endpoint(router, "/api/portfolio/build-help/verify", "POST")
    pay_id = "payp_a"
    sig = _order_sig("pord_a", pay_id)
    body = {"razorpay_order_id": "pord_a", "razorpay_payment_id": pay_id, "razorpay_signature": sig}
    # Build the pydantic model the same way FastAPI would from the JSON body.
    verify_in = _find_model(router, "/api/portfolio/build-help/verify")(**body)
    out = await verify(verify_in, admin={"admin_id": "studioA"})
    _check(out == {"unlocked": True}, "verify reports unlocked")
    row = await db.portfolio_build_unlocks.find_one({"order_id": "pord_a"}, {"_id": 0})
    _check(row["status"] == "paid", "the unlock row flips to paid")
    order = await db.event_orders.find_one({"order_id": "pord_a"}, {"_id": 0})
    _check(order["status"] == "paid", "the event_orders ledger row settles too")


def _find_model(router, path):
    """The endpoint's first parameter is the pydantic request-body model —
    pull its annotation instead of re-declaring the model name here."""
    import inspect
    fn = _endpoint(router, path, "POST")
    params = list(inspect.signature(fn).parameters.values())
    return params[0].annotation


async def test_build_help_forged_signature_rejected():
    print("\n[build-help 2] forged signature -> 400, zero state change")
    db = FakeDB()
    await _seed_build_help_order(db, order_id="pord_b")
    router = _portfolio_router(db)
    verify = _endpoint(router, "/api/portfolio/build-help/verify", "POST")
    verify_in = _find_model(router, "/api/portfolio/build-help/verify")(
        razorpay_order_id="pord_b", razorpay_payment_id="payp_b",
        razorpay_signature="not-the-real-signature")
    raised = None
    try:
        await verify(verify_in, admin={"admin_id": "studioA"})
    except HTTPException as e:
        raised = e
    _check(raised is not None and raised.status_code == 400, "forged signature rejected with 400")
    row = await db.portfolio_build_unlocks.find_one({"order_id": "pord_b"}, {"_id": 0})
    _check(row["status"] == "created", "unlock row unchanged")


async def test_build_help_webhook_replay_settles_once():
    print("\n[build-help 3] webhook replay settles exactly once")
    db = FakeDB()
    await _seed_build_help_order(db, order_id="pord_c")
    router = _portfolio_router(db)
    webhook = _endpoint(router, "/api/portfolio/build-help/webhook", "POST")
    pay_id = "payp_c"
    body = _webhook_body("payment.captured", "pord_c", pay_id)
    sig = _webhook_sig(body)

    out1 = await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out1 == {"received": True, "settled": True}, "first delivery settles")
    out2 = await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out2 == {"received": True, "settled": True}, "replay still 200s")
    row = await db.portfolio_build_unlocks.find_one({"order_id": "pord_c"}, {"_id": 0})
    _check(row["status"] == "paid", "unlocked, once")


async def test_build_help_webhook_after_verify_is_noop():
    print("\n[build-help 4] webhook arriving after the browser already verified -> 200 no-op")
    db = FakeDB()
    await _seed_build_help_order(db, order_id="pord_d")
    router = _portfolio_router(db)
    verify = _endpoint(router, "/api/portfolio/build-help/verify", "POST")
    webhook = _endpoint(router, "/api/portfolio/build-help/webhook", "POST")
    pay_id = "payp_d"
    sig = _order_sig("pord_d", pay_id)
    verify_in = _find_model(router, "/api/portfolio/build-help/verify")(
        razorpay_order_id="pord_d", razorpay_payment_id=pay_id, razorpay_signature=sig)
    await verify(verify_in, admin={"admin_id": "studioA"})

    body = _webhook_body("payment.captured", "pord_d", pay_id)
    wsig = _webhook_sig(body)
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": wsig}))
    _check(out == {"received": True, "settled": True}, "webhook after verify 200s")
    row = await db.portfolio_build_unlocks.find_one({"order_id": "pord_d"}, {"_id": 0})
    _check(row["status"] == "paid", "still unlocked, unchanged")


async def test_build_help_webhook_unknown_event_type_noop():
    print("\n[build-help 5] unrelated webhook event type -> 200 no-op")
    db = FakeDB()
    await _seed_build_help_order(db, order_id="pord_e")
    router = _portfolio_router(db)
    webhook = _endpoint(router, "/api/portfolio/build-help/webhook", "POST")
    body = _webhook_body("refund.processed", "pord_e", "payp_e")
    sig = _webhook_sig(body)
    out = await webhook(_FakeRequest(body, {"x-razorpay-signature": sig}))
    _check(out == {"received": True}, "non-payment event types are a no-op")
    row = await db.portfolio_build_unlocks.find_one({"order_id": "pord_e"}, {"_id": 0})
    _check(row["status"] == "created", "unlock row untouched")


async def main():
    print("MAJA — settlement webhook self-test (donations / storage / build-help)")
    await test_donation_valid_signature_settles()
    await test_donation_forged_signature_rejected()
    await test_donation_webhook_replay_settles_once()
    await test_donation_webhook_after_verify_is_noop()
    await test_donation_verify_after_webhook_is_noop()
    await test_donation_webhook_unknown_event_type_noop()

    await test_storage_valid_signature_settles()
    await test_storage_forged_signature_rejected()
    await test_storage_webhook_replay_settles_once()
    await test_storage_webhook_after_verify_is_noop()
    await test_storage_webhook_unknown_event_type_noop()

    await test_build_help_valid_signature_settles()
    await test_build_help_forged_signature_rejected()
    await test_build_help_webhook_replay_settles_once()
    await test_build_help_webhook_after_verify_is_noop()
    await test_build_help_webhook_unknown_event_type_noop()
    print("\nALL SETTLEMENT WEBHOOK CHECKS PASSED")


if __name__ == "__main__":
    _apply_env_for_standalone()
    asyncio.run(main())
