"""Cross-tenant IDOR regression for gift_registry.py, map_features.py and
face_ops.py (2026-08-17 audit).

  - gift_registry.py: admin_get_gifts (GET) / admin_upsert_gifts (PUT) resolved
    the profile via `_find_profile` with no ownership check — any photographer
    could read, and worse OVERWRITE, another studio's bank/UPI gift details.
  - map_features.py: the per-event venue PUT and the main-venue PUT had
    `get_current_admin` only, no ownership check — any photographer could
    relocate another studio's venue.
  - face_ops.py: the reindex route skipped the `_require_owned_profile_by_id`
    check every sibling route in the same file already uses — any photographer
    could force an expensive Rekognition reindex job onto a competitor's
    gallery.

Same FakeDB + fake-auth-dependency-override pattern as
tests/test_gallery_privacy_ownership.py.
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

# Also stubs aws_service in sys.modules before face_ops does its dynamic
# `import aws_service` inside _rekognition_status().
from tests.test_storage_orchestrator import FakeDB  # noqa: E402

from gift_registry import build_gift_router          # noqa: E402
from map_features import build_map_router            # noqa: E402
import face_ops                                       # noqa: E402
from face_ops import build_face_ops_router            # noqa: E402


CALLER = {"admin_id": "owner_a", "role": "admin"}  # mutated per-test


def _make_app(db) -> TestClient:
    async def fake_get_current_admin():
        return CALLER["admin_id"]

    async def fake_require_admin():
        return {"admin_id": CALLER["admin_id"], "role": CALLER["role"]}

    app = FastAPI()
    app.include_router(build_gift_router(db, fake_get_current_admin))
    app.include_router(build_map_router(db, fake_get_current_admin))
    app.include_router(build_face_ops_router(db, fake_require_admin))
    c = TestClient(app)
    c.db = db  # stashed for post-request assertions (e.g. "was it overwritten")
    return c


@pytest.fixture()
def client():
    db = FakeDB()

    async def seed():
        await db.admins.insert_one({"id": "owner_a", "role": "admin"})
        await db.admins.insert_one({"id": "owner_b", "role": "admin"})
        await db.profiles.insert_one({
            "id": "prof_a", "slug": "wed-a", "admin_id": "owner_a",
            "events": [{"event_id": "ev_a", "name": "Sangeet"}],
        })
        await db.profiles.insert_one({
            "id": "prof_b", "slug": "wed-b", "admin_id": "owner_b",
            "events": [{"event_id": "ev_b", "name": "Sangeet"}],
        })

    asyncio.run(seed())
    return _make_app(db)


# ---------------------------------------------------------------------------
# gift_registry.py
# ---------------------------------------------------------------------------
def test_owner_can_read_own_gifts(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/prof_a/gifts")
    assert r.status_code == 200, r.text


def test_owner_can_upsert_own_gifts(client):
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_a/gifts",
                    json={"accept_bank": True, "bank_account_number": "1111222233334444"})
    assert r.status_code == 200, r.text


def test_cross_tenant_gift_get_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/prof_b/gifts")
    assert r.status_code == 403, r.text


def test_cross_tenant_gift_put_forbidden(client):
    """The bank-overwrite IDOR — most important assertion in this file."""
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_b/gifts",
                    json={"accept_bank": True, "bank_account_number": "9999888877776666",
                          "bank_ifsc": "HIJACK0001"})
    assert r.status_code == 403, r.text
    # and studio B's registry must be untouched by studio A's attempt
    doc = asyncio.run(client.db.gift_registry.find_one({"profile_id": "prof_b"}))
    assert doc is None or doc.get("bank_ifsc") != "HIJACK0001"


# ---------------------------------------------------------------------------
# map_features.py
# ---------------------------------------------------------------------------
def test_owner_can_update_own_main_venue(client):
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_a/main-venue",
                    json={"latitude": 12.9, "longitude": 77.6, "venue_name": "Owner A Hall"})
    assert r.status_code == 200, r.text


def test_cross_tenant_main_venue_put_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_b/main-venue",
                    json={"latitude": 1.0, "longitude": 1.0, "venue_name": "Hijacked Hall"})
    assert r.status_code == 403, r.text
    profile = asyncio.run(client.db.profiles.find_one({"id": "prof_b"}))
    assert profile.get("venue") != "Hijacked Hall"


def test_owner_can_update_own_event_venue(client):
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_a/events/ev_a/venue",
                    json={"venue_name": "Owner A Sangeet Hall"})
    assert r.status_code == 200, r.text


def test_cross_tenant_event_venue_put_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.put("/api/admin/profiles/prof_b/events/ev_b/venue",
                    json={"venue_name": "Hijacked Sangeet Hall"})
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# face_ops.py
# ---------------------------------------------------------------------------
def test_owner_can_reindex_own_profile(client, monkeypatch):
    # Rekognition isn't configured in this test env — stub it "available" so
    # the ownership check (not the AWS-config check) is what this asserts.
    monkeypatch.setattr(face_ops, "_rekognition_status",
                         lambda: {"available": True, "status": "ok"})
    CALLER["admin_id"] = "owner_a"
    r = client.post("/api/admin/face-ops/reindex/prof_a")
    assert r.status_code == 200, r.text


def test_cross_tenant_reindex_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.post("/api/admin/face-ops/reindex/prof_b")
    assert r.status_code == 403, r.text
