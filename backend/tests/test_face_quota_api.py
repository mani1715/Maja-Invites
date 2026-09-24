"""
HTTP surface of the AI face-match quota: authorization and the refusal body.

Same FakeDB + dependency-override pattern as test_idor_ownership_batch.py, so
this needs neither Postgres nor a running server.

Two things are under test here that the module-level suite cannot see:

  * **Cross-tenant isolation.** Every quota route resolves the wedding through
    `_require_owned_profile`, and a reservation is re-checked against the
    wedding it was issued for. A reservation id is otherwise a bearer token for
    someone else's purchased capacity.
  * **The refusal contract.** The UI has to explain a rejected batch and offer
    a way to fix it, so the 409 body must carry the full breakdown AND the
    real top-up SKUs — never a price the frontend made up.
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

from tests.test_storage_orchestrator import FakeDB          # noqa: E402

import gallery_features as gf                                # noqa: E402
import pricing_catalog                                       # noqa: E402

CALLER = {"admin_id": "owner_a"}
QUOTA = 2000


def _make_app(db) -> TestClient:
    async def fake_get_current_admin():
        return CALLER["admin_id"]

    app = FastAPI()
    app.include_router(gf.build_gallery_router(db, fake_get_current_admin))
    c = TestClient(app)
    c.db = db
    return c


@pytest.fixture()
def client(monkeypatch):
    # cache_backend's limiter is a no-op without Redis, but pin it open so a
    # machine that DOES have Redis cannot turn these into flaky 429s.
    import cache_backend
    async def _allow(*_a, **_k):
        return True
    monkeypatch.setattr(cache_backend, "rate_limit_allow", _allow)

    db = FakeDB()

    async def seed():
        for pid, owner in (("prof_a", "owner_a"), ("prof_b", "owner_b")):
            await db.profiles.insert_one({
                "id": pid, "slug": f"wed-{pid}", "admin_id": owner,
                "gallery_config": {"enabled": True, "aws_collection_id": f"maja_wedding_{pid}"},
            })
            await db.invitation_orders.insert_one({
                "id": f"ord_{pid}", "profile_id": pid,
                "status": "paid", "face_photo_limit": QUOTA,
            })

    asyncio.run(seed())
    CALLER["admin_id"] = "owner_a"
    return _make_app(db)


def _seed_used(client, profile_id, n):
    async def go():
        for i in range(n):
            await client.db.gallery_photos.insert_one(
                {"id": f"{profile_id}_p{i}", "profile_id": profile_id, "indexed": False})
    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Reading the allocation
# --------------------------------------------------------------------------- #
def test_owner_sees_the_full_breakdown(client):
    _seed_used(client, "prof_a", 1900)
    r = client.get("/api/admin/profiles/prof_a/gallery/quota")
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["allocated"], b["used"], b["reserved"], b["remaining"]) == (2000, 1900, 0, 100)
    assert b["indexing"] == {"total": 1900, "indexed": 0, "failed": 0, "no_face": 0, "processing": 1900}
    assert b["extension"]["tiers"][0]["key"] == pricing_catalog.FACE_MATCH_TIERS[0]["key"]


def test_other_studio_cannot_read_the_allocation(client):
    CALLER["admin_id"] = "owner_b"
    r = client.get("/api/admin/profiles/prof_a/gallery/quota")
    assert r.status_code in (403, 404), r.text


def test_storage_bytes_are_not_reported_as_photo_quota(client):
    """Bytes and photo counts are different entitlements; the payload must not
    blur them or a studio will buy the wrong thing."""
    r = client.get("/api/admin/profiles/prof_a/gallery/quota")
    assert r.status_code == 200
    assert not any("byte" in k.lower() for k in r.json())


# --------------------------------------------------------------------------- #
# Reserving
# --------------------------------------------------------------------------- #
def test_batch_that_fits_is_reserved(client):
    _seed_used(client, "prof_a", 1900)
    r = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve", json={"photo_count": 100})
    assert r.status_code == 200, r.text
    assert r.json()["reservation_id"]
    assert r.json()["remaining"] == 0


def test_oversized_batch_is_refused_with_the_full_breakdown(client):
    _seed_used(client, "prof_a", 1900)
    r = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve", json={"photo_count": 301})
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "QUOTA_EXCEEDED"
    assert (d["allocated"], d["used"], d["remaining"], d["requested"], d["excess"]) == \
           (2000, 1900, 100, 301, 201)
    assert "301 photos" in d["message"] and "100 photos remain" in d["message"]
    # the UI must be able to offer a fix, priced by the canonical catalogue
    assert [t["photos"] for t in d["extension"]["tiers"]] == \
           [t["photos"] for t in pricing_catalog.FACE_MATCH_TIERS]
    assert d["extension"]["custom_whatsapp"] is True


def test_refused_batch_leaves_no_hold_behind(client):
    _seed_used(client, "prof_a", 1900)
    client.post("/api/admin/profiles/prof_a/gallery/quota/reserve", json={"photo_count": 301})
    b = client.get("/api/admin/profiles/prof_a/gallery/quota").json()
    assert b["reserved"] == 0 and b["remaining"] == 100


def test_other_studio_cannot_reserve_against_this_wedding(client):
    CALLER["admin_id"] = "owner_b"
    r = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve", json={"photo_count": 1})
    assert r.status_code in (403, 404), r.text


def test_zero_and_negative_counts_are_rejected(client):
    for n in (0, -5):
        r = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve", json={"photo_count": n})
        assert r.status_code == 422, (n, r.text)


def test_absurd_batch_size_is_rejected_before_any_db_work(client):
    r = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve",
                    json={"photo_count": 10_000_000})
    assert r.status_code == 422, r.text


# --------------------------------------------------------------------------- #
# A reservation is not a bearer token for someone else's capacity
# --------------------------------------------------------------------------- #
def test_reservation_from_another_wedding_cannot_be_spent_here(client):
    """owner_b reserves on their own event, then tries to presign against
    owner_a's — the id must be worthless outside the wedding it was issued
    for, even though the caller does own SOMETHING."""
    CALLER["admin_id"] = "owner_b"
    rid = client.post("/api/admin/profiles/prof_b/gallery/quota/reserve",
                      json={"photo_count": 5}).json()["reservation_id"]

    r = client.post("/api/admin/profiles/prof_a/gallery/presign-upload",
                    json={"filename": "x.jpg", "content_type": "image/jpeg",
                          "size_bytes": 1024, "reservation_id": rid})
    assert r.status_code in (403, 404), r.text


def test_other_studio_cannot_release_this_weddings_hold(client):
    rid = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve",
                      json={"photo_count": 10}).json()["reservation_id"]
    CALLER["admin_id"] = "owner_b"
    r = client.post(f"/api/admin/profiles/prof_a/gallery/quota/reservations/{rid}/release")
    assert r.status_code in (403, 404), r.text

    CALLER["admin_id"] = "owner_a"
    assert client.get("/api/admin/profiles/prof_a/gallery/quota").json()["reserved"] == 10


def test_release_returns_capacity_and_is_idempotent(client):
    _seed_used(client, "prof_a", 1900)
    rid = client.post("/api/admin/profiles/prof_a/gallery/quota/reserve",
                      json={"photo_count": 100}).json()["reservation_id"]
    assert client.get("/api/admin/profiles/prof_a/gallery/quota").json()["remaining"] == 0

    r = client.post(f"/api/admin/profiles/prof_a/gallery/quota/reservations/{rid}/release")
    assert r.status_code == 200 and r.json()["remaining"] == 100
    r2 = client.post(f"/api/admin/profiles/prof_a/gallery/quota/reservations/{rid}/release")
    assert r2.status_code == 200 and r2.json()["remaining"] == 100


def test_unknown_reservation_is_not_found(client):
    r = client.post("/api/admin/profiles/prof_a/gallery/quota/reservations/fqr_nope/release")
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# The presign lane cannot be used to walk past the quota
# --------------------------------------------------------------------------- #
def test_presign_without_a_reservation_still_consumes_quota(client, monkeypatch):
    """The gap this closes: a client that simply never calls /quota/reserve.
    The server takes a one-slot hold inline, so the allocation still binds."""
    monkeypatch.setattr(gf, "is_configured", lambda: True)
    monkeypatch.setattr(gf, "generate_presigned_put",
                        lambda *a, **k: "https://s3.example/put")
    _seed_used(client, "prof_a", 1999)

    r = client.post("/api/admin/profiles/prof_a/gallery/presign-upload",
                    json={"filename": "a.jpg", "content_type": "image/jpeg", "size_bytes": 1024})
    assert r.status_code == 200, r.text
    assert r.json()["reservation_id"]
    assert client.get("/api/admin/profiles/prof_a/gallery/quota").json()["remaining"] == 0

    # the 2001st photo has nowhere to go
    r2 = client.post("/api/admin/profiles/prof_a/gallery/presign-upload",
                     json={"filename": "b.jpg", "content_type": "image/jpeg", "size_bytes": 1024})
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"]["code"] == "QUOTA_EXCEEDED"


def test_presign_is_refused_before_any_upload_intent_is_written(client, monkeypatch):
    """A refused presign must not leave a staging row behind — otherwise the
    orphan sweep has to clean up work that was never authorised."""
    monkeypatch.setattr(gf, "is_configured", lambda: True)
    monkeypatch.setattr(gf, "generate_presigned_put", lambda *a, **k: "https://s3.example/put")
    _seed_used(client, "prof_a", 2000)

    r = client.post("/api/admin/profiles/prof_a/gallery/presign-upload",
                    json={"filename": "a.jpg", "content_type": "image/jpeg", "size_bytes": 1024})
    assert r.status_code == 409
    assert asyncio.run(client.db.upload_intents.count_documents({})) == 0
