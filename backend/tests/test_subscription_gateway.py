"""
Subscription gateway self-test — the Portfolio / Cloud Backup buy flow.

    cd backend && python -m tests.test_subscription_gateway

The bug this locks down: with ordinary (non-recurring) Razorpay keys, the gateway
fell straight through to the MOCK path. A studio clicking "Get this plan" on
/studio/plans was auto-activated WITHOUT PAYING and the Razorpay checkout never
opened — reported by the owner as "portfolio and storage are not redirecting to
Razorpay", and a revenue leak underneath it.

Proves:
  * live keys  -> a REAL razorpay order is created; response carries the order id
    + key id the checkout modal needs; nothing is active yet;
  * placeholder / missing / malformed keys -> mock, so local dev still works;
  * a gateway outage surfaces as 502 instead of silently comping the plan;
  * a one-time order sets auto_renew=False (no mandate exists to renew it);
  * signature verification: valid passes, forged fails, tampered order id fails;
  * a `mock_token` can NEVER activate a subscription created against real keys.

In-memory FakeDB; no network.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import subscription_service as subs

LIVE_KEY = "rzp_test_LiveLooking123"
LIVE_SECRET = "live_secret_value_abc"


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


# --------------------------------------------------------------------------
# fakes
# --------------------------------------------------------------------------
class _FakeOrders:
    def __init__(self, fail=False):
        self.fail = fail
        self.created = []

    def create(self, spec):
        if self.fail:
            raise RuntimeError("razorpay unreachable")
        self.created.append(spec)
        return {"id": f"order_fake_{len(self.created)}", "amount": spec["amount"]}


class FakeRazorpay:
    def __init__(self, fail=False):
        self.order = _FakeOrders(fail=fail)


def _set_keys(kid, secret, recurring=None):
    for k, v in (("RAZORPAY_KEY_ID", kid), ("RAZORPAY_KEY_SECRET", secret),
                 ("RAZORPAY_RECURRING_ENABLED", recurring)):
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


async def _seed(db):
    await db.subscription_plans.insert_one({
        "id": "plan_portfolio_premium", "product": "portfolio", "tier": "Premium",
        "base_monthly": 1000, "is_active": True, "sort_order": 2,
    })


def _endpoint(router, path, method="POST"):
    for r in router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return r.endpoint
    raise AssertionError(f"route {method} {path} not registered")


def _build(db, client):
    return subs.build_subscription_router(
        db, client,
        require_admin=lambda: {"admin_id": "studio_1"},
        require_super_admin=lambda: {"admin_id": "owner", "role": "super_admin"},
    )


# --------------------------------------------------------------------------
# 1. key readiness
# --------------------------------------------------------------------------
async def test_key_readiness():
    print("\n[1] which gateway do we use?")
    c = FakeRazorpay()

    _set_keys(LIVE_KEY, LIVE_SECRET)
    _check(subs._razorpay_keys_ready(c) is True, "real rzp_ keys + client -> live orders")

    _set_keys("rzp_test_PLACEHOLDER_KEY_ID", "PLACEHOLDER_SECRET_KEY")
    _check(subs._razorpay_keys_ready(c) is False,
           "committed PLACEHOLDER keys are NOT treated as live")

    _set_keys(LIVE_KEY, LIVE_SECRET)
    _check(subs._razorpay_keys_ready(None) is False, "no client -> not live")

    _set_keys(LIVE_KEY, "")
    _check(subs._razorpay_keys_ready(c) is False, "key id without secret -> not live")

    _set_keys("some_other_key", LIVE_SECRET)
    _check(subs._razorpay_keys_ready(c) is False, "non rzp_ prefixed id -> not live")

    _set_keys(None, None)
    _check(subs._razorpay_keys_ready(c) is False, "unset keys -> not live (dev mock)")


# --------------------------------------------------------------------------
# 2. create: real order vs mock
# --------------------------------------------------------------------------
async def test_create_opens_real_order():
    print("\n[2] buying a plan with live keys creates a REAL order")
    _set_keys(LIVE_KEY, LIVE_SECRET)
    db = FakeDB()
    await _seed(db)
    client = FakeRazorpay()
    create = _endpoint(_build(db, client), "/api/subscriptions/create")

    req = subs.CreateSubscriptionRequest(product="portfolio", tier="Premium", cycle="monthly")
    out = await create(req, admin={"admin_id": "studio_1"})

    _check(out["provider"] == "razorpay_order", "provider is razorpay_order, not mock")
    _check(out["mock"] is False, "mock flag is False")
    _check(out["razorpay_order_id"] == "order_fake_1", "response carries the razorpay order id")
    _check(out["razorpay_key_id"] == LIVE_KEY, "response carries the checkout key id")
    _check(out["mock_token"] is None, "no mock token is handed out on the live path")
    _check(out["amount_paise"] == out["quote"]["total_paise"] > 0,
           "checkout amount equals the quoted total (incl. GST)")
    _check(client.order.created[0]["amount"] == out["amount_paise"],
           "the order was created at the same amount")
    _check(client.order.created[0]["notes"]["studio_id"] == "studio_1",
           "order notes attribute the purchase to the studio")

    sub = await db.subscriptions.find_one({"id": out["subscription_id"]}, {"_id": 0})
    _check(sub["status"] == "pending", "subscription stays PENDING until payment verifies")
    _check(sub["auto_renew"] is False,
           "auto_renew False — a one-time order creates no renewal mandate")
    _check(sub["razorpay_subscription_id"] == "order_fake_1",
           "the order id is stored server-side for signature verification")


async def test_create_falls_back_to_mock_without_keys():
    print("\n[3] no live keys (local dev) still walks end to end")
    _set_keys(None, None)
    db = FakeDB()
    await _seed(db)
    create = _endpoint(_build(db, FakeRazorpay()), "/api/subscriptions/create")

    out = await create(
        subs.CreateSubscriptionRequest(product="portfolio", tier="Premium", cycle="monthly"),
        admin={"admin_id": "studio_1"})
    _check(out["provider"] == "mock" and out["mock"] is True, "mock gateway used")
    _check(bool(out["mock_token"]), "mock token issued so /verify can auto-confirm")
    _check(out["razorpay_order_id"] is None,
           "no order id -> the frontend knows not to open a checkout modal")


async def test_gateway_outage_is_not_a_free_plan():
    print("\n[4] a gateway outage must NOT comp the plan")
    _set_keys(LIVE_KEY, LIVE_SECRET)
    db = FakeDB()
    await _seed(db)
    create = _endpoint(_build(db, FakeRazorpay(fail=True)), "/api/subscriptions/create")

    try:
        await create(
            subs.CreateSubscriptionRequest(product="portfolio", tier="Premium", cycle="monthly"),
            admin={"admin_id": "studio_1"})
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        _check(e.status_code == 502, "order.create failure surfaces as 502, not a mock activation")
    _check(await db.subscriptions.find_one({}, {"_id": 0}) is None,
           "no subscription row is left behind by the failed attempt")


# --------------------------------------------------------------------------
# 5. signature verification
# --------------------------------------------------------------------------
async def test_signature_verification():
    print("\n[5] only a genuine Razorpay signature activates a paid plan")
    _set_keys(LIVE_KEY, LIVE_SECRET)
    order_id, payment_id = "order_fake_1", "pay_XYZ"
    good = hmac.new(LIVE_SECRET.encode(), f"{order_id}|{payment_id}".encode(),
                    hashlib.sha256).hexdigest()

    sub = {"provider": "razorpay_order", "razorpay_subscription_id": order_id}
    P = subs.VerifySubscriptionRequest

    _check(subs.verify_gateway_payment(
        sub, P(subscription_id="s", razorpay_payment_id=payment_id,
               razorpay_signature=good), None) is True, "valid signature verifies")

    _check(subs.verify_gateway_payment(
        sub, P(subscription_id="s", razorpay_payment_id=payment_id,
               razorpay_signature="deadbeef"), None) is False, "forged signature rejected")

    _check(subs.verify_gateway_payment(
        {"provider": "razorpay_order", "razorpay_subscription_id": "order_OTHER"},
        P(subscription_id="s", razorpay_payment_id=payment_id,
          razorpay_signature=good), None) is False,
        "signature is bound to OUR stored order id, not any order the caller names")

    _check(subs.verify_gateway_payment(
        sub, P(subscription_id="s", razorpay_payment_id=payment_id,
               razorpay_signature=None), None) is False, "missing signature rejected")

    # THE important one: a mock token must not unlock a real-keys subscription.
    _check(subs.verify_gateway_payment(
        {"provider": "razorpay_order", "razorpay_subscription_id": order_id,
         "mock_token": "t0ken"},
        P(subscription_id="s", mock_token="t0ken"), None) is False,
        "a mock_token can NEVER activate a subscription created with real keys")

    _check(subs.verify_gateway_payment(
        {"provider": "mock", "mock_token": "t0ken"},
        P(subscription_id="s", mock_token="t0ken"), None) is True,
        "mock provider still verifies its own token (dev flow intact)")

    _check(subs.verify_gateway_payment(
        {"provider": "mock", "mock_token": "t0ken"},
        P(subscription_id="s", mock_token="wrong"), None) is False,
        "wrong mock token rejected")


async def test_resubscribe_stacks_onto_current_period():
    print("\n[6] subscribing again ADDS a cycle instead of overlapping")
    _set_keys(None, None)   # mock gateway, so create -> verify walks locally
    db = FakeDB()
    await _seed(db)
    router = _build(db, FakeRazorpay())
    create = _endpoint(router, "/api/subscriptions/create")
    verify = _endpoint(router, "/api/subscriptions/verify")
    admin = {"admin_id": "studio_1"}

    async def buy():
        c = await create(subs.CreateSubscriptionRequest(product="portfolio", tier="Premium", cycle="monthly"),
                         admin=admin)
        await verify(subs.VerifySubscriptionRequest(subscription_id=c["subscription_id"],
                                                    mock_token=c["mock_token"]), admin=admin)
        return await db.subscriptions.find_one({"id": c["subscription_id"]}, {"_id": 0})

    first = await buy()
    _check(first["status"] == "active", "first purchase activates")
    _check(first["current_period_start"] < first["current_period_end"], "first has a real window")

    second = await buy()
    _check(second["status"] == "active", "second purchase also activates")
    _check(second["current_period_start"] == first["current_period_end"],
           "the second period STARTS where the first ENDS (stacked, no days lost)")
    _check(second["current_period_end"] > first["current_period_end"],
           "total coverage is extended, not reset")
    # Money/activation stamps are NOW, even though coverage begins in the future.
    _check(second["activated_at"] < second["current_period_start"],
           "activated_at is now, not the future period start")

    # A third stacks on the second — chains cleanly.
    third = await buy()
    _check(third["current_period_start"] == second["current_period_end"],
           "a third purchase stacks onto the second")

    # Entitlement still sees the studio as covered the whole time (any active sub).
    actives = [s for s in (await db.subscriptions.find(
        {"studio_id": "studio_1", "product": "portfolio", "status": "active"}, {}).to_list(50))]
    _check(len(actives) == 3, "all three remain active and chained, none clobbered")


async def main():
    print("MAJA — subscription gateway (portfolio + cloud backup checkout)")
    saved = {k: os.environ.get(k) for k in
             ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_RECURRING_ENABLED")}
    try:
        await test_key_readiness()
        await test_create_opens_real_order()
        await test_create_falls_back_to_mock_without_keys()
        await test_gateway_outage_is_not_a_free_plan()
        await test_signature_verification()
        await test_resubscribe_stacks_onto_current_period()
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    print("\nALL SUBSCRIPTION GATEWAY CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
