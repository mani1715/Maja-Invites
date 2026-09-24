"""paid_links_count gets a writer again (FakeDB, no server).

Since credits were deleted, nothing incremented admins.paid_links_count, so the
photographer loyalty tier ladder froze on tier 1 forever (SESSION_CONTEXT
§0.0.70 item 5). Delivery of a paid order is the new writer — once per order,
even if the admin re-delivers to correct the linked profile.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
from store_features import build_store_admin_router  # noqa: E402


def _mk():
    db = FakeDB()

    async def super_admin():
        return "root"

    async def seed():
        await db.admins.insert_one({"id": "studio1", "paid_links_count": 0})
        await db.invitation_orders.insert_one({
            "id": "ord1", "user_id": "studio1", "status": "paid",
            "build_status": "building", "fulfillment_code": "FUL1",
        })
    asyncio.run(seed())

    app = FastAPI()
    app.include_router(build_store_admin_router(db=db, require_admin=super_admin))
    return db, TestClient(app)


def _count(db):
    async def go():
        return (await db.admins.find_one({"id": "studio1"}, {"_id": 0})).get("paid_links_count", 0)
    return asyncio.run(go())


def test_deliver_increments_once():
    db, c = _mk()
    r = c.post("/api/admin/build-queue/ord1/deliver", json={"profile_id": "prof1"})
    assert r.status_code == 200, r.text
    assert r.json()["build_status"] == "delivered"
    assert _count(db) == 1

    # re-deliver (e.g. correcting the linked profile) must NOT double-count
    r2 = c.post("/api/admin/build-queue/ord1/deliver", json={"profile_id": "prof2"})
    assert r2.status_code == 200, r2.text
    assert _count(db) == 1


def test_deliver_unknown_order_404s():
    _, c = _mk()
    assert c.post("/api/admin/build-queue/nope/deliver", json={}).status_code == 404
