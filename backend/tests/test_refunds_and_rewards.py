"""
test_refunds_and_rewards.py — real-money refunds + gift-code/referral rewards.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_refunds_and_rewards.py -q

In-memory FakeDB (this file's own — it needs insert_one to raise on a
duplicate `id`, which the shared FakeDB in test_storage_orchestrator.py does
not do); a stub Razorpay client; no network, no live Postgres.

Covers:
  refunds_service.py
    * happy path: initiated -> processed, source row marked refunded
    * over-refund -> 409
    * duplicate in-flight for the same payment -> 409, only ONE Razorpay call
    * Razorpay error -> failed + 502
    * /sync reconciles a row stuck at "initiated" (crash-recovery path)
  gift_code_routes.py
    * redeem grants exactly once under double-submit
    * expired / inactive / max-redemption-reached codes are rejected
    * a discount_inr code mints a real single-use discount_codes row
  photographer_referrals.py
    * self-redeem rejected
    * redeeming grants BOTH sides
    * an already-redeemed code is rejected on the second attempt
"""
from __future__ import annotations

import asyncio
import copy
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import pytest
from fastapi import HTTPException

import refunds_service
import gift_code_routes
import photographer_referrals


# --------------------------------------------------------------------------- #
# In-memory Mongo-ish FakeDB that DOES enforce id-uniqueness on insert_one --
# the atomic-reservation guards in all three production files depend on that.
# --------------------------------------------------------------------------- #
class UniqueViolationError(Exception):
    """Named to match asyncpg's real exception -- production code duck-types
    on `type(e).__name__`, exactly as subscription_service.py already does."""


def _match(doc: Dict[str, Any], flt: Optional[Dict[str, Any]]) -> bool:
    for k, v in (flt or {}).items():
        if isinstance(v, dict) and any(str(op).startswith("$") for op in v):
            dv = doc.get(k)
            for op, val in v.items():
                if op == "$in":
                    if dv not in (val or []):
                        return False
                elif op == "$ne":
                    if dv == val:
                        return False
                else:
                    raise NotImplementedError(f"FakeDB._match: unsupported operator {op}")
        elif doc.get(k) != v:
            return False
    return True


class _UpdateResult:
    def __init__(self, matched=0, modified=0, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id


class _Cursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, key, direction=1):
        self._docs = sorted(self._docs, key=lambda d: (d.get(key) is None, d.get(key)),
                            reverse=(direction == -1))
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n] if n else self._docs
        return self

    async def to_list(self, length=None):
        docs = [copy.deepcopy(d) for d in self._docs]
        return docs if length is None else docs[:length]

    def __aiter__(self):
        self._it = iter([copy.deepcopy(d) for d in self._docs])
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class _Collection:
    def __init__(self):
        self.docs: List[Dict[str, Any]] = []

    async def insert_one(self, doc: Dict[str, Any]):
        doc = copy.deepcopy(doc)
        _id = doc.get("id") or uuid.uuid4().hex
        doc["id"] = _id
        if any(d.get("id") == _id for d in self.docs):
            raise UniqueViolationError(f"duplicate id {_id}")
        self.docs.append(doc)
        return _id

    async def find_one(self, flt=None, projection=None):
        for d in self.docs:
            if _match(d, flt):
                return copy.deepcopy(d)
        return None

    def find(self, flt=None, projection=None):
        return _Cursor([d for d in self.docs if _match(d, flt)])

    async def count_documents(self, flt=None):
        return sum(1 for d in self.docs if _match(d, flt))

    @staticmethod
    def _apply(doc, update):
        for k, v in update.get("$set", {}).items():
            doc[k] = v
        for k, v in update.get("$inc", {}).items():
            doc[k] = doc.get(k, 0) + v

    async def update_one(self, flt, update, upsert=False):
        for d in self.docs:
            if _match(d, flt):
                self._apply(d, update)
                return _UpdateResult(matched=1, modified=1)
        if upsert:
            nd = {k: v for k, v in (flt or {}).items() if not isinstance(v, dict)}
            self._apply(nd, update)
            nd.setdefault("id", uuid.uuid4().hex)
            self.docs.append(nd)
            return _UpdateResult(matched=0, modified=0, upserted_id=nd["id"])
        return _UpdateResult(matched=0, modified=0)

    async def find_one_and_update(self, flt, update, **kwargs):
        for d in self.docs:
            if _match(d, flt):
                self._apply(d, update)
                return copy.deepcopy(d)
        return None

    async def delete_one(self, flt):
        for i, d in enumerate(self.docs):
            if _match(d, flt):
                del self.docs[i]
                return _UpdateResult(matched=1, modified=1)
        return _UpdateResult(matched=0, modified=0)


class FakeDB:
    def __init__(self):
        self._cols: Dict[str, _Collection] = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._cols.setdefault(name, _Collection())

    async def ensure_table(self, name):
        self._cols.setdefault(name, _Collection())


def _endpoint(router, path, method="POST"):
    for r in router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return r.endpoint
    raise AssertionError(f"route {method} {path} not registered")


# --------------------------------------------------------------------------- #
# Stub Razorpay client
# --------------------------------------------------------------------------- #
class _FakePayment:
    def __init__(self, parent):
        self._p = parent

    def refund(self, payment_id, data=None):
        self._p.calls += 1
        if self._p.fail:
            raise RuntimeError("razorpay unreachable")
        time.sleep(0.05)  # gives a concurrent second call room to run its own guard first
        rid = f"rfd_{self._p.calls}"
        obj = {"id": rid, "entity": "refund", "amount": (data or {}).get("amount"),
               "status": "processed", "payment_id": payment_id,
               "notes": (data or {}).get("notes") or {}}
        self._p.by_id[rid] = obj
        self._p.by_payment.setdefault(payment_id, []).append(obj)
        return obj

    def fetch_multiple_refund(self, payment_id, data=None):
        items = self._p.by_payment.get(payment_id, [])
        return {"entity": "collection", "count": len(items), "items": items}


class _FakeRefundAPI:
    def __init__(self, parent):
        self._p = parent

    def fetch(self, refund_id):
        return self._p.by_id[refund_id]


class FakeRazorpay:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = 0
        self.by_id: Dict[str, Any] = {}
        self.by_payment: Dict[str, list] = {}
        self.payment = _FakePayment(self)
        self.refund = _FakeRefundAPI(self)


def _require_super_admin():
    return "su_1"


def _get_current_admin():
    return "adm_1"


# ============================================================================
# refunds_service.py
# ============================================================================
async def _seed_order(db, *, payment_id="pay_ABC", amount_paise=100_000):
    await db.invitation_orders.insert_one({
        "id": "invord_1", "razorpay_payment_id": payment_id,
        "amount_paise": amount_paise, "status": "paid",
    })


@pytest.mark.asyncio
async def test_refund_happy_path_full():
    db = FakeDB()
    await _seed_order(db)
    client = FakeRazorpay()
    router = refunds_service.build_refunds_router(db, _require_super_admin, client)
    create = _endpoint(router, "/api/super-admin/refunds", "POST")

    req = refunds_service._RefundReq(payment_id="pay_ABC", reason="customer requested")
    out = await create(req, admin_id="su_1")

    assert out["status"] == "processed"
    assert out["amount_paise"] == 100_000
    assert out["razorpay_refund_id"] == "rfd_1"
    assert client.calls == 1
    assert db.refund_locks.docs == [], "lock must be released after resolution"

    order = await db.invitation_orders.find_one({"id": "invord_1"})
    assert order["refund_status"] == "refunded"
    assert order["refunded_amount_paise"] == 100_000


@pytest.mark.asyncio
async def test_over_refund_rejected():
    db = FakeDB()
    await _seed_order(db, amount_paise=100_000)
    client = FakeRazorpay()
    router = refunds_service.build_refunds_router(db, _require_super_admin, client)
    create = _endpoint(router, "/api/super-admin/refunds", "POST")

    first = await create(refunds_service._RefundReq(
        payment_id="pay_ABC", amount_paise=60_000, reason="partial"), admin_id="su_1")
    assert first["status"] == "processed"

    with pytest.raises(HTTPException) as exc:
        await create(refunds_service._RefundReq(
            payment_id="pay_ABC", amount_paise=50_000, reason="too much"), admin_id="su_1")
    assert exc.value.status_code == 409
    assert client.calls == 1, "the over-refund attempt must never reach Razorpay"


@pytest.mark.asyncio
async def test_duplicate_in_flight_returns_409_and_one_razorpay_call():
    db = FakeDB()
    await _seed_order(db)
    client = FakeRazorpay()
    router = refunds_service.build_refunds_router(db, _require_super_admin, client)
    create = _endpoint(router, "/api/super-admin/refunds", "POST")

    async def _go():
        return await create(
            refunds_service._RefundReq(payment_id="pay_ABC", reason="dup test"), admin_id="su_1")

    results = await asyncio.gather(_go(), _go(), return_exceptions=True)
    successes = [r for r in results if isinstance(r, dict)]
    failures = [r for r in results if isinstance(r, HTTPException)]

    assert client.calls == 1, "the second racer must be rejected before Razorpay is ever called"
    assert len(successes) == 1 and successes[0]["status"] == "processed"
    assert len(failures) == 1 and failures[0].status_code == 409


@pytest.mark.asyncio
async def test_razorpay_error_marks_failed_and_502s():
    db = FakeDB()
    await _seed_order(db)
    client = FakeRazorpay(fail=True)
    router = refunds_service.build_refunds_router(db, _require_super_admin, client)
    create = _endpoint(router, "/api/super-admin/refunds", "POST")

    with pytest.raises(HTTPException) as exc:
        await create(refunds_service._RefundReq(payment_id="pay_ABC", reason="gateway down"),
                     admin_id="su_1")
    assert exc.value.status_code == 502

    row = await db.refunds.find_one({"payment_id": "pay_ABC"})
    assert row["status"] == "failed"
    assert db.refund_locks.docs == [], "a failed attempt must release the lock so a retry can proceed"


@pytest.mark.asyncio
async def test_sync_reconciles_a_row_stuck_at_initiated():
    db = FakeDB()
    await _seed_order(db)
    client = FakeRazorpay()
    router = refunds_service.build_refunds_router(db, _require_super_admin, client)
    create = _endpoint(router, "/api/super-admin/refunds", "POST")
    sync = _endpoint(router, "/api/super-admin/refunds/{refund_id}/sync", "POST")

    out = await create(refunds_service._RefundReq(payment_id="pay_ABC", reason="crash sim"),
                       admin_id="su_1")
    rid = out["id"]

    # Simulate the process dying AFTER Razorpay accepted the refund but
    # BEFORE the local CAS write landed: row reverts to "initiated" and the
    # lock is re-armed, exactly the state a crash mid-request would leave.
    await db.refunds.update_one({"id": rid}, {"$set": {"status": "initiated"}})
    await db.refund_locks.insert_one({"id": f"lock_pay_ABC", "payment_id": "pay_ABC",
                                      "refund_id": rid, "created_at": "x"})

    result = await sync(refund_id=rid, _="su_1")
    assert result["status"] == "processed"
    assert result["reconciled"] is True
    assert db.refund_locks.docs == []


# ============================================================================
# gift_code_routes.py
# ============================================================================
def _build_gift_router(db):
    return gift_code_routes.build_gift_code_router(db, _require_super_admin, _get_current_admin)


@pytest.mark.asyncio
async def test_gift_code_redeem_grants_exactly_once_under_double_submit():
    db = FakeDB()
    await db.gift_codes.insert_one({
        "code": "WELCOME", "reward_kind": "storage_gb", "reward_value": 10,
        "is_active": True, "redeemed_count": 0, "per_account_limit": 1,
        "max_redemptions": None, "expires_at": None,
    })
    router = _build_gift_router(db)
    redeem = _endpoint(router, "/api/account/redeem-code", "POST")
    req = gift_code_routes._RedeemReq(code="welcome")

    out = await redeem(req, actor="adm_1")
    assert out["success"] is True
    assert out["reward"]["kind"] == "storage_gb" and out["reward"]["value"] == 10

    with pytest.raises(HTTPException) as exc:
        await redeem(req, actor="adm_1")
    assert exc.value.status_code == 400

    assert len(db.storage_addons.docs) == 1, "the reward must be granted exactly once"
    assert (await db.gift_codes.find_one({"code": "WELCOME"}))["redeemed_count"] == 1


@pytest.mark.asyncio
async def test_expired_inactive_and_maxed_out_codes_are_rejected():
    db = FakeDB()
    router = _build_gift_router(db)
    redeem = _endpoint(router, "/api/account/redeem-code", "POST")

    await db.gift_codes.insert_one({
        "code": "OLD1", "reward_kind": "storage_gb", "reward_value": 5, "is_active": True,
        "redeemed_count": 0, "per_account_limit": 1, "max_redemptions": None,
        "expires_at": "2020-01-01T00:00:00+00:00",
    })
    with pytest.raises(HTTPException) as exc:
        await redeem(gift_code_routes._RedeemReq(code="old1"), actor="adm_1")
    assert exc.value.status_code == 400

    await db.gift_codes.insert_one({
        "code": "OFF1", "reward_kind": "storage_gb", "reward_value": 5, "is_active": False,
        "redeemed_count": 0, "per_account_limit": 1, "max_redemptions": None, "expires_at": None,
    })
    with pytest.raises(HTTPException) as exc:
        await redeem(gift_code_routes._RedeemReq(code="off1"), actor="adm_1")
    assert exc.value.status_code == 400

    await db.gift_codes.insert_one({
        "code": "MAX1", "reward_kind": "storage_gb", "reward_value": 5, "is_active": True,
        "redeemed_count": 3, "per_account_limit": 1, "max_redemptions": 3, "expires_at": None,
    })
    with pytest.raises(HTTPException) as exc:
        await redeem(gift_code_routes._RedeemReq(code="max1"), actor="adm_1")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_discount_reward_mints_a_real_single_use_discount_code():
    db = FakeDB()
    await db.gift_codes.insert_one({
        "code": "SAVE200", "reward_kind": "discount_inr", "reward_value": 200,
        "is_active": True, "redeemed_count": 0, "per_account_limit": 1,
        "max_redemptions": None, "expires_at": None,
    })
    router = _build_gift_router(db)
    redeem = _endpoint(router, "/api/account/redeem-code", "POST")

    out = await redeem(gift_code_routes._RedeemReq(code="save200"), actor="adm_1")
    code = out["reward"]["grant_ref"]
    assert code

    minted = await db.discount_codes.find_one({"code": code})
    assert minted["kind"] == "flat" and minted["value"] == 200 and minted["max_uses"] == 1

    rewards_router = _build_gift_router(db)
    my_rewards = _endpoint(rewards_router, "/api/account/rewards", "GET")
    listing = await my_rewards(actor="adm_1")
    assert listing["total"] == 1 and listing["items"][0]["status"] == "active"


# ============================================================================
# photographer_referrals.py
# ============================================================================
async def _seed_referral(db, owner="owner_1", **overrides):
    doc = {
        "code": "MAJA-ABC123", "owner_admin_id": owner,
        "redeemer_reward_kind": "storage_gb", "redeemer_reward_value": 5,
        "owner_reward_kind": "storage_gb", "owner_reward_value": 5,
        "per_account_limit": 1, "redeemed_count": 0, "is_active": True,
        "created_at": "x", "last_redeemed_at": None,
    }
    doc.update(overrides)
    await db.photographer_referrals.insert_one(doc)
    return doc


def _referral_router(db):
    return photographer_referrals.build_photographer_referral_router(
        db, _require_super_admin, lambda: "photog_2")


@pytest.mark.asyncio
async def test_referral_self_redeem_rejected():
    db = FakeDB()
    await _seed_referral(db, owner="photog_2")
    router = photographer_referrals.build_photographer_referral_router(
        db, _require_super_admin, lambda: "photog_2")
    redeem = _endpoint(router, "/api/account/redeem-referral", "POST")

    with pytest.raises(HTTPException) as exc:
        await redeem(photographer_referrals._RedeemReferral(code="MAJA-ABC123"), actor="photog_2")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_referral_redeem_grants_both_sides_and_blocks_repeat():
    db = FakeDB()
    await _seed_referral(db, owner="owner_1")
    router = _referral_router(db)
    redeem = _endpoint(router, "/api/account/redeem-referral", "POST")
    req = photographer_referrals._RedeemReferral(code="MAJA-ABC123")

    out = await redeem(req, actor="photog_2")
    assert out["success"] is True
    assert out["reward"]["kind"] == "storage_gb" and out["reward"]["value"] == 5
    assert out["owner_rewarded"] is True

    redeemer_addons = [a for a in db.storage_addons.docs if a["studio_id"] == "photog_2"]
    owner_addons = [a for a in db.storage_addons.docs if a["studio_id"] == "owner_1"]
    assert len(redeemer_addons) == 1 and redeemer_addons[0]["gb"] == 5
    assert len(owner_addons) == 1 and owner_addons[0]["gb"] == 5

    ref = await db.photographer_referrals.find_one({"code": "MAJA-ABC123"})
    assert ref["redeemed_count"] == 1

    audit = await db.referral_redemptions.find_one({"code": "MAJA-ABC123", "redeemer_id": "photog_2"})
    assert audit["redeemer_reward_id"] and audit["owner_reward_id"]

    with pytest.raises(HTTPException) as exc:
        await redeem(req, actor="photog_2")
    assert exc.value.status_code == 400
    assert len(db.storage_addons.docs) == 2, "no extra reward on the repeat attempt"
