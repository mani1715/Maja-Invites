"""Object-level authorization on gallery_privacy admin routes (FakeDB, no server).

Regression for the IDOR found in the 2026-08-16 audit: admin_get / admin_update /
admin_reset_code / admin_logout_all / admin_analytics authenticated ANY
photographer but never compared the target profile's admin_id to the caller —
any studio could read or reset another studio's gallery access code.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
from gallery_privacy import build_privacy_router     # noqa: E402
from auth import get_password_hash, verify_password  # noqa: E402


CALLER = {"admin_id": "owner_a"}  # mutated per-test


def _make_app(db) -> TestClient:
    async def fake_admin():
        return CALLER["admin_id"]

    app = FastAPI()
    app.include_router(build_privacy_router(
        db=db,
        get_current_admin=fake_admin,
        get_password_hash=get_password_hash,
        verify_password=verify_password,
    ))
    return TestClient(app)


@pytest.fixture()
def client():
    import asyncio

    db = FakeDB()

    async def seed():
        await db.admins.insert_one({"id": "owner_a", "role": "admin"})
        await db.admins.insert_one({"id": "owner_b", "role": "admin"})
        await db.admins.insert_one({"id": "root", "role": "super_admin"})
        await db.profiles.insert_one({"id": "prof_a", "slug": "wed-a", "admin_id": "owner_a"})
        await db.profiles.insert_one({"id": "prof_b", "slug": "wed-b", "admin_id": "owner_b"})

    asyncio.run(seed())
    return _make_app(db)


def test_owner_can_read_own_privacy(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/prof_a/gallery/privacy")
    assert r.status_code == 200, r.text


def test_cross_tenant_read_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/prof_b/gallery/privacy")
    assert r.status_code == 403, r.text


def test_cross_tenant_reset_code_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.post("/api/admin/profiles/prof_b/gallery/privacy/reset-code",
                    json={"code": "Abcd1234"})
    assert r.status_code == 403, r.text


def test_cross_tenant_update_forbidden(client):
    CALLER["admin_id"] = "owner_b"
    r = client.put("/api/admin/profiles/prof_a/gallery/privacy",
                   json={"enabled": True})
    assert r.status_code == 403, r.text


def test_cross_tenant_logout_all_forbidden(client):
    CALLER["admin_id"] = "owner_b"
    r = client.post("/api/admin/profiles/prof_a/gallery/privacy/logout-all")
    assert r.status_code == 403, r.text


def test_cross_tenant_analytics_forbidden(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/prof_b/gallery/privacy/analytics")
    assert r.status_code == 403, r.text


def test_super_admin_bypasses_ownership(client):
    CALLER["admin_id"] = "root"
    r = client.get("/api/admin/profiles/prof_a/gallery/privacy")
    assert r.status_code == 200, r.text
    r = client.get("/api/admin/profiles/prof_b/gallery/privacy/analytics")
    assert r.status_code == 200, r.text


def test_missing_profile_is_404(client):
    CALLER["admin_id"] = "owner_a"
    r = client.get("/api/admin/profiles/nope/gallery/privacy")
    assert r.status_code == 404, r.text
