"""Subscription commerce race guards (FakeDB, no server).

Regressions for the 2026-08-17 forensic findings:
1. verify_subscription ran three UNGUARDED follow-on writes (orders update,
   payments insert, audit insert) after its status CAS without checking the
   CAS result — two racing verifies each inserted a payments-ledger row for
   one activation.
2. create_subscription minted a fresh pending subscription + gateway order on
   every click; two pending rows could later both be verified into two active
   subscriptions for one studio+product.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
import subscription_service as subs                  # noqa: E402


STUDIO = "studio_x"


def _client(db) -> TestClient:
    async def fake_admin():
        return {"admin_id": STUDIO, "role": "admin"}

    app = FastAPI()
    app.include_router(subs.build_subscription_router(
        db=db, razorpay_client=None,
        require_admin=fake_admin, require_super_admin=fake_admin,
    ))
    return TestClient(app)


def _seed(db):
    async def go():
        await db.admins.insert_one({"id": STUDIO, "role": "admin"})
        await db.subscription_plans.insert_one({
            "id": "plan_portfolio_basic", "product": "portfolio", "tier": "Basic",
            "is_active": True, "base_monthly": 499,
        })
    asyncio.run(go())


def _mk_pending(db, sub_id="sub_p1", token="tok_1"):
    async def go():
        await db.subscriptions.insert_one({
            "id": sub_id, "studio_id": STUDIO, "product": "portfolio",
            "plan_id": "plan_p_basic", "tier": "Basic", "cycle": "monthly",
            "status": "pending", "provider": "mock", "mock_token": token,
            "quote": {"total_paise": 49900, "currency": "INR"},
            "created_at": subs._now_iso(),
            "current_period_start": None, "current_period_end": None,
        })
        await db.orders.insert_one({
            "id": "ord_p1", "studio_id": STUDIO, "kind": "subscription",
            "subscription_id": sub_id, "status": "created",
            "amount_paise": 49900, "created_at": subs._now_iso(),
        })
    asyncio.run(go())


def _count(db, coll):
    async def go():
        return len(await getattr(db, coll).find({}, {"_id": 0}).to_list(100))
    return asyncio.run(go())


def test_verify_is_idempotent_on_replay():
    db = FakeDB()
    _seed(db)
    _mk_pending(db)
    c = _client(db)

    r1 = c.post("/api/subscriptions/verify",
                json={"subscription_id": "sub_p1", "mock_token": "tok_1"})
    assert r1.status_code == 200, r1.text
    assert r1.json()["status"] == "active"
    assert _count(db, "payments") == 1

    # replay — early already-active return, no second ledger row
    r2 = c.post("/api/subscriptions/verify",
                json={"subscription_id": "sub_p1", "mock_token": "tok_1"})
    assert r2.status_code == 200, r2.text
    assert r2.json().get("already") is True
    assert _count(db, "payments") == 1
    assert _count(db, "audit_logs") == 1


def test_verify_cas_loser_writes_no_ledger_row():
    """Simulate the race: handler reads a STALE pending copy while the row is
    already active (the concurrent verify won). The CAS must match nothing and
    the loser must return early without inserting a second payments row."""
    db = FakeDB()
    _seed(db)
    _mk_pending(db)
    c = _client(db)

    # first verify activates for real
    assert c.post("/api/subscriptions/verify",
                  json={"subscription_id": "sub_p1", "mock_token": "tok_1"}).status_code == 200
    assert _count(db, "payments") == 1

    # force the handler to see a stale "pending" snapshot on its next read
    real_find_one = db.subscriptions.find_one
    calls = {"n": 0}

    async def stale_find_one(flt, proj=None):
        doc = await real_find_one(flt, proj)
        if doc and calls["n"] == 0 and doc.get("id") == "sub_p1":
            calls["n"] += 1
            doc = {**doc, "status": "pending"}
        return doc

    db.subscriptions.find_one = stale_find_one
    r = c.post("/api/subscriptions/verify",
               json={"subscription_id": "sub_p1", "mock_token": "tok_1"})
    assert r.status_code == 200, r.text
    assert r.json().get("already") is True
    assert _count(db, "payments") == 1, "CAS loser inserted a duplicate ledger row"
    assert _count(db, "audit_logs") == 1


def test_create_reuses_recent_pending_row():
    db = FakeDB()
    _seed(db)
    c = _client(db)

    r1 = c.post("/api/subscriptions/create",
                json={"product": "portfolio", "tier": "Basic", "cycle": "monthly"})
    assert r1.status_code == 200, r1.text
    sid1 = r1.json()["subscription_id"]

    r2 = c.post("/api/subscriptions/create",
                json={"product": "portfolio", "tier": "Basic", "cycle": "monthly"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["subscription_id"] == sid1, "double-click minted a second pending sub"
    assert r2.json().get("reused_pending") is True
    assert _count(db, "subscriptions") == 1
