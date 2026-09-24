"""
test_storage_grandfathering_2026.py — studio storage renewal grandfathering
(docs/PRICING_REDESIGN_2026.md §9 item 6).

    cd backend && python -m pytest tests/test_storage_grandfathering_2026.py -q

Problem: catalog v3 deactivated the old 50GB/1TB v2 rows (₹149/₹1,599 regular,
₹99/₹1,199 founding monthly), so an existing subscriber on one of those plans
could previously only "renew" by buying a NEW plan at the v3 price (₹299/₹2,999)
— a silent contractual re-price, plus loss of their founding rate. Owner
directive: "Do not silently change an existing subscriber's contractual
renewal price."

Covers, all against an in-memory FakeDB (tests.test_storage_orchestrator.FakeDB;
no network, no Postgres — route functions called directly, mirroring
tests/test_settlement_webhooks_misc.py's pattern):

  1. An existing subscriber on a deactivated plan can still hit /subscribe for
     that exact plan_id and gets quoted their OLD contractual price — regular
     case (₹149) and founding case (₹99), never the v3 price (₹299).
  2. A DIFFERENT studio (no subscription referencing that plan) gets 404 for
     the same deactivated plan_id — grandfathering is per-studio, not a
     reopened public sale.
  3. Settling a grandfathered renewal extends the SAME subscription's
     expires_at and keeps plan_id on the OLD plan — it is never repointed to
     the new catalog's plan for that capacity.
  4. GET /admin/studio-storage/plans surfaces a `grandfathered` card only to
     the studio whose current subscription references the deactivated plan;
     everyone else gets `grandfathered: None`, and the active `items` list is
     unchanged (deactivated plan never appears there for anyone).
  5. A brand-new subscriber (no subscription at all) sees only the active v3
     catalog — no grandfathered card, no deactivated plan in `items`.
"""
from __future__ import annotations

import pytest

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from fastapi import HTTPException

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
import studio_storage                                # noqa: E402
import event_payments as pay                          # noqa: E402


# --------------------------------------------------------------------------- #
# Fixtures: a deactivated v2 50GB plan + the live v3 50GB anchor, matching the
# real catalog shapes (see studio_storage.py's _CARRIED_PAIRS / _ANCHOR_CYCLE_PRICES
# and the ₹99/₹149 -> ₹299 numbers cited in SESSION_CONTEXT §0.0.74).
# --------------------------------------------------------------------------- #
OLD_PLAN_ID = "plan_v2_50gb_monthly"
NEW_PLAN_ID = "plan_v3_50gb_monthly"


async def _seed_catalog(db):
    await db.studio_storage_plans.insert_one({
        "id": OLD_PLAN_ID, "name": "50 GB - Monthly (v2)", "gb_limit": 50,
        "duration_days": 30, "grace_days": 30,
        "price_inr": 149, "price_founding_inr": 99, "is_active": False,
    })
    await db.studio_storage_plans.insert_one({
        "id": NEW_PLAN_ID, "name": "50 GB - Monthly", "gb_limit": 50,
        "duration_days": 30, "grace_days": 30,
        "price_inr": 299, "price_founding_inr": None, "is_active": True,
    })
    # Pin the catalog marker at the current version so _ensure_default_plans
    # (called by both endpoints under test) sees its work as already done and
    # does not flood the FakeDB with the full 20-row DEFAULT_PLANS seed on top
    # of the two fixture rows above.
    await db.app_settings.insert_one({
        "id": "studio_storage_catalog", "version": studio_storage.CATALOG_VERSION,
    })


async def _seed_existing_subscriber(db, admin_id: str, plan_id: str, *, sub_id: str = "sub_1"):
    """One active subscription row for `admin_id` on `plan_id`."""
    now = studio_storage._now()
    await db.studio_storage_subscriptions.insert_one({
        "id": sub_id, "admin_id": admin_id, "plan_id": plan_id,
        "starts_at": now, "expires_at": now + studio_storage.timedelta(days=10),
        "purge_at": now + studio_storage.timedelta(days=40),
        "status": "active", "used_bytes": 0,
        "created_at": now, "updated_at": now,
    })


class _CapturedOrder:
    def __init__(self):
        self.calls = []


def _patch_gateway(monkeypatch, captured: _CapturedOrder):
    """subscribe() only needs to reach amount-computation; the actual Razorpay
    round-trip is irrelevant to grandfathering, so fake it out and record what
    price it was asked to charge."""
    monkeypatch.setattr(pay, "configured", lambda: True)

    async def _fake_create_order(db, *, amount_inr, receipt, notes, kind, event_id=""):
        captured.calls.append({"amount_inr": amount_inr, "notes": notes})
        return {"order_id": f"rord_{len(captured.calls)}", "amount": amount_inr * 100,
                "currency": "INR", "key_id": "rzp_test", "amount_inr": amount_inr}

    monkeypatch.setattr(pay, "create_order", _fake_create_order)


# =========================================================================== #
# 1 + 2. /subscribe: renewal at the old price, per-studio only
# =========================================================================== #
async def test_subscribe_renews_old_plan_at_regular_price(monkeypatch):
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    await _seed_existing_subscriber(db, "studioA", OLD_PLAN_ID)
    # No founding slots left -> this studio is definitely on the regular price,
    # not accidentally eligible for a founding claim on this purchase.
    monkeypatch.setattr(studio_storage, "FOUNDING_SLOTS", 0)
    captured = _CapturedOrder()
    _patch_gateway(monkeypatch, captured)

    out = await studio_storage.subscribe(
        studio_storage.SubscribeRequest(plan_id=OLD_PLAN_ID), admin={"admin_id": "studioA"})

    assert out["plan"]["id"] == OLD_PLAN_ID
    assert captured.calls[-1]["amount_inr"] == 149, "regular renewal must quote the OLD v2 price, not v3's 299"
    assert captured.calls[-1]["notes"]["plan_id"] == OLD_PLAN_ID


async def test_subscribe_renews_old_plan_at_founding_price(monkeypatch):
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    await _seed_existing_subscriber(db, "studioA", OLD_PLAN_ID)
    await db.studio_storage_founders.insert_one({"id": "fnd_1", "admin_id": "studioA"})
    captured = _CapturedOrder()
    _patch_gateway(monkeypatch, captured)

    out = await studio_storage.subscribe(
        studio_storage.SubscribeRequest(plan_id=OLD_PLAN_ID), admin={"admin_id": "studioA"})

    assert out["plan"]["id"] == OLD_PLAN_ID
    assert captured.calls[-1]["amount_inr"] == 99, \
        "a founder renewing keeps their OLD plan's founding price (99), not the regular 149 or v3's 299"


async def test_subscribe_deactivated_plan_rejected_for_a_different_studio(monkeypatch):
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    await _seed_existing_subscriber(db, "studioA", OLD_PLAN_ID)
    captured = _CapturedOrder()
    _patch_gateway(monkeypatch, captured)

    with pytest.raises(HTTPException) as exc:
        await studio_storage.subscribe(
            studio_storage.SubscribeRequest(plan_id=OLD_PLAN_ID), admin={"admin_id": "studioB"})
    assert exc.value.status_code == 404
    assert captured.calls == [], "no order should have been created for the blocked studio"


async def test_subscribe_deactivated_plan_rejected_with_no_subscription_at_all(monkeypatch):
    """A studio that never subscribed to anything cannot buy the deactivated
    plan either — grandfathering only ever renews a studio's OWN row."""
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    captured = _CapturedOrder()
    _patch_gateway(monkeypatch, captured)

    with pytest.raises(HTTPException) as exc:
        await studio_storage.subscribe(
            studio_storage.SubscribeRequest(plan_id=OLD_PLAN_ID), admin={"admin_id": "studioNew"})
    assert exc.value.status_code == 404


# =========================================================================== #
# 3. Settling a grandfathered renewal: same row extends, plan_id unchanged
# =========================================================================== #
async def test_settle_grandfathered_renewal_extends_and_keeps_old_plan_id():
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    await _seed_existing_subscriber(db, "studioA", OLD_PLAN_ID, sub_id="sub_a")
    before = await db.studio_storage_subscriptions.find_one({"id": "sub_a"})
    expires_before = before["expires_at"]

    # An order for the SAME grandfathered plan, exactly as /subscribe above
    # would have created it (notes carry the OLD plan_id).
    await db.event_orders.insert_one({
        "order_id": "rord_renew", "kind": "studio_storage", "event_id": "studioA",
        "receipt": "ss_studioA", "amount_inr": 149, "amount_paise": 14900,
        "currency": "INR", "status": "created",
        "notes": {"plan_id": OLD_PLAN_ID, "admin_id": "studioA", "type": "studio_storage"},
        "created_at": "2026-08-01T00:00:00Z", "updated_at": "2026-08-01T00:00:00Z",
    })

    result = await studio_storage._settle_storage_order(db, "rord_renew", "pay_renew", via="checkout")

    assert result["renewed"] is True
    sub = result["subscription"]
    assert sub["id"] == "sub_a", "renewal must extend the SAME row, not create a second one"
    assert sub["plan_id"] == OLD_PLAN_ID, "must stay on the OLD plan_id, never repointed to the v3 plan"
    assert sub["expires_at"] > expires_before, "expires_at must be extended"
    all_subs = await db.studio_storage_subscriptions.find({"admin_id": "studioA"}).to_list(10)
    assert len(all_subs) == 1, "still exactly one subscription row for this studio"


# =========================================================================== #
# 4 + 5. GET /admin/studio-storage/plans: the grandfathered card
# =========================================================================== #
async def test_plans_endpoint_surfaces_grandfathered_card_only_to_its_owner(monkeypatch):
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    await _seed_existing_subscriber(db, "studioA", OLD_PLAN_ID)
    # No founding slots left -> deterministic regular price on the card.
    monkeypatch.setattr(studio_storage, "FOUNDING_SLOTS", 0)

    out = await studio_storage.list_plans_photographer(_admin={"admin_id": "studioA"})
    assert out["grandfathered"] is not None
    assert out["grandfathered"]["id"] == OLD_PLAN_ID
    assert out["grandfathered"]["grandfathered"] is True
    assert out["grandfathered"]["effective_price_inr"] == 149
    ids_in_items = {p["id"] for p in out["items"]}
    assert OLD_PLAN_ID not in ids_in_items, "the deactivated plan must never appear in the active items list"
    assert NEW_PLAN_ID in ids_in_items


async def test_plans_endpoint_no_grandfathered_card_for_active_v3_subscriber():
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    # studioB is already a subscriber, but on the ACTIVE v3 plan — nothing to
    # grandfather.
    await _seed_existing_subscriber(db, "studioB", NEW_PLAN_ID)

    out = await studio_storage.list_plans_photographer(_admin={"admin_id": "studioB"})
    assert out["grandfathered"] is None
    ids_in_items = {p["id"] for p in out["items"]}
    assert ids_in_items == {NEW_PLAN_ID}


async def test_plans_endpoint_new_subscriber_sees_only_v3_active_catalog():
    db = FakeDB()
    studio_storage.init(database=db, razorpay_client=None)
    await _seed_catalog(db)
    # studioC has never subscribed to anything.

    out = await studio_storage.list_plans_photographer(_admin={"admin_id": "studioC"})
    assert out["grandfathered"] is None
    ids_in_items = {p["id"] for p in out["items"]}
    assert ids_in_items == {NEW_PLAN_ID}, "a new subscriber must only ever see the active v3 catalog"
