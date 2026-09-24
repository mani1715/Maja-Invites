"""
test_face_and_suite_2026.py — pricing-completion wave (docs/PRICING_REDESIGN_2026.md
§9 items 5 and 7) + Phase 14 input bounds on the surfaces this wave touches.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_face_and_suite_2026.py -q

Three independent things, in-process (FakeDB / pure function — no live server):

  * TestSuiteVideoSection — order_to_invitation.py: an invitation_suite order
    that bought the "video" component must flip sections_enabled.video on
    (§9 item 7). Pure function, no DB.

  * TestFacePhotoLimit — gallery_features.index_photo_job, the ONE choke
    point every indexing path (fresh upload, worker.py, face_ops retry/
    reindex) routes through. Enforces docs §9 item 5 / Phase 8: once a
    wedding's indexed-photo count reaches the resolved face_photo_limit,
    further indexing is refused. Uses the same FakeDB + FakeProvider pattern
    as test_face_provider_wiring.py so Rekognition is never actually called.

  * TestCreateOrderBounds — store_features.create_order, called directly
    (its router function, not over HTTP): the new >50-features 400 guard,
    and proof that a client-sent photo count/limit is silently dropped by
    pydantic (no field for it exists on CreateOrderRequest) and never
    reaches the order — face_photo_limit only ever comes from the server's
    own catalog (_FACE_MATCH_PHOTOS_BY_KEY).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import pytest
from fastapi import HTTPException

# Importing FakeDB pulls in tests.test_storage_orchestrator, which stubs
# aws_service at module scope BEFORE gallery_features (below) ever imports it
# — same ordering test_face_ops_providers.py relies on.
from tests.test_storage_orchestrator import FakeDB          # noqa: E402
from tests.test_order_to_invitation import ORDER as SAMPLE_ORDER  # noqa: E402
from order_to_invitation import (                            # noqa: E402
    build_invitation_payload, _PLAN_BY_INVITATION_SUITE_TIER,
)
import gallery_features as gf                                 # noqa: E402
import store_features as sf                                   # noqa: E402


# --------------------------------------------------------------------------- #
# §9 item 7 — invitation_suite "video" component -> sections_enabled.video
# --------------------------------------------------------------------------- #
class TestSuiteVideoSection:
    @staticmethod
    def _suite_order(components, tier="premium"):
        # addons=[] strips the fixture's legacy custom_video add-on so the
        # suite-components path is isolated from the pre-existing feature-key
        # mapping it sits beside.
        return dict(SAMPLE_ORDER, addons=[], order_type="invitation_suite",
                    invitation_tier=tier, components=components)

    def test_video_component_flips_sections_video_on(self):
        out = build_invitation_payload(self._suite_order(["digital", "video"]), "admin_test")
        assert out["profile"]["sections_enabled"]["video"] is True
        assert out["deliverables"] == ["digital", "video"]

    def test_no_video_component_leaves_sections_video_off(self):
        out = build_invitation_payload(self._suite_order(["digital"]), "admin_test")
        assert out["profile"]["sections_enabled"]["video"] is False

    def test_physical_component_has_no_section_but_is_surfaced_as_a_warning(self):
        out = build_invitation_payload(self._suite_order(["digital", "physical"]), "admin_test")
        assert "physical" in out["deliverables"]
        assert any("Physical Design" in w for w in out["warnings"])

    def test_all_three_components_still_prices_and_maps_correctly(self):
        out = build_invitation_payload(
            self._suite_order(["digital", "video", "physical"], tier="custom"), "admin_test")
        assert out["profile"]["sections_enabled"]["video"] is True
        assert out["deliverables"] == ["digital", "video", "physical"]
        assert out["profile"]["plan_type"] == "PLATINUM"     # mapping table intact

    def test_basic_mapping_table_intact(self):
        assert _PLAN_BY_INVITATION_SUITE_TIER == {
            "basic": "SILVER", "premium": "GOLD", "custom": "PLATINUM"}

    def test_non_suite_order_gets_no_deliverables_and_legacy_video_unaffected(self):
        # SAMPLE_ORDER's own custom_video addon still flips sections.video via
        # the pre-existing _FEATURE_SECTIONS path — unrelated to this change.
        out = build_invitation_payload(SAMPLE_ORDER, "admin_test")
        assert out["deliverables"] == []
        assert out["profile"]["sections_enabled"]["video"] is True


# --------------------------------------------------------------------------- #
# §9 item 5 / Phase 8 — face-photo-limit enforcement at index time
# --------------------------------------------------------------------------- #
class _FakeProvider:
    """Records every call; never touches real AWS (same shape as
    test_face_provider_wiring.py's FakeProvider)."""

    def __init__(self):
        self.calls = []

    def index_photo_faces(self, collection_id, s3_key, external_image_id, max_faces=15):
        self.calls.append(("index_photo_faces", external_image_id))
        return {"ok": True, "face_count": 1, "face_ids": [f"f_{external_image_id}"]}

    def delete_faces(self, collection_id, face_ids):
        self.calls.append(("delete_faces", list(face_ids)))
        return {"ok": True, "deleted_count": len(face_ids)}


def _install_fake_provider():
    import face_providers as fp
    os.environ.pop("FACE_MATCH_PROVIDER", None)
    fake = _FakeProvider()
    fp._instances.clear()
    fp._instances["rekognition"] = fake
    return fake


async def _wedding(db, profile_id, indexed_count, face_photo_limit, order_extra=None):
    await db.profiles.insert_one(
        {"id": profile_id, "gallery_config": {"aws_collection_id": f"maja_wedding_{profile_id}"}})
    await db.invitation_orders.insert_one(
        {"id": f"o_{profile_id}", "profile_id": profile_id, "status": "paid",
         "face_photo_limit": face_photo_limit, **(order_extra or {})})
    for i in range(indexed_count):
        await db.gallery_photos.insert_one(
            {"id": f"{profile_id}_p{i}", "profile_id": profile_id, "indexed": True,
             "s3_key": "k.jpg", "face_count": 1})


class TestFacePhotoLimit:
    async def test_indexing_refused_once_limit_reached(self):
        fake = _install_fake_provider()
        db = FakeDB()
        await _wedding(db, "w1", indexed_count=2, face_photo_limit=2)
        await db.gallery_photos.insert_one(
            {"id": "new1", "profile_id": "w1", "s3_key": "k.jpg", "indexed": False})

        res = await gf.index_photo_job(db, "new1")
        assert res == {"ok": False, "error": "face_photo_limit_reached",
                       "limit": 2, "indexed_count": 2}
        assert fake.calls == []                       # Rekognition never called
        photo = await db.gallery_photos.find_one({"id": "new1"})
        assert photo["index_error"] == "face_photo_limit_reached"
        assert photo["indexed"] is False               # never flipped to indexed

    async def test_indexing_proceeds_under_the_limit(self):
        fake = _install_fake_provider()
        db = FakeDB()
        await _wedding(db, "w2", indexed_count=1, face_photo_limit=2)
        await db.gallery_photos.insert_one(
            {"id": "new2", "profile_id": "w2", "s3_key": "k.jpg", "indexed": False})

        res = await gf.index_photo_job(db, "new2")
        assert res["ok"] is True
        assert fake.calls == [("index_photo_faces", "new2")]
        photo = await db.gallery_photos.find_one({"id": "new2"})
        assert photo["indexed"] is True

    async def test_reindex_of_an_already_indexed_photo_is_not_self_blocked(self):
        # Limit=1 and the ONE indexed photo is the one being reindexed —
        # excluding it from the count must not block its own retry.
        fake = _install_fake_provider()
        db = FakeDB()
        await _wedding(db, "w3", indexed_count=0, face_photo_limit=1)
        await db.gallery_photos.insert_one(
            {"id": "p0", "profile_id": "w3", "s3_key": "k.jpg",
             "indexed": True, "aws_face_ids": ["f_old"]})

        res = await gf.index_photo_job(db, "p0")
        assert res["ok"] is True

    async def test_legacy_flat_ai_face_match_order_is_unlimited(self):
        # Pre-2026 flat ai_face_match order: face_photo_limit stamped as None
        # (store_features.py only stamps a number for the face_match_2000/
        # 3000/5000 SKUs — _FACE_MATCH_PHOTOS_BY_KEY has no "ai_face_match"
        # entry) — must never gate indexing, exactly like before enforcement
        # existed at all.
        fake = _install_fake_provider()
        db = FakeDB()
        await _wedding(db, "w4", indexed_count=500, face_photo_limit=None,
                       order_extra={"addons": [{"key": "ai_face_match"}]})
        await db.gallery_photos.insert_one(
            {"id": "w4_new", "profile_id": "w4", "s3_key": "k.jpg", "indexed": False})

        res = await gf.index_photo_job(db, "w4_new")
        assert res["ok"] is True

    async def test_no_paid_orders_at_all_is_unlimited(self):
        # A photographer's own gallery with no purchase behind it (most
        # galleries) — no order links here, so no limit resolves.
        fake = _install_fake_provider()
        db = FakeDB()
        await db.profiles.insert_one(
            {"id": "w5", "gallery_config": {"aws_collection_id": "maja_wedding_w5"}})
        await db.gallery_photos.insert_one(
            {"id": "w5_new", "profile_id": "w5", "s3_key": "k.jpg", "indexed": False})

        res = await gf.index_photo_job(db, "w5_new")
        assert res["ok"] is True

    async def test_unpaid_order_face_photo_limit_is_not_counted(self):
        # status != "paid" -> excluded from resolution, same "PAID orders
        # only" rule the pricing doc states.
        fake = _install_fake_provider()
        db = FakeDB()
        await db.profiles.insert_one(
            {"id": "w6", "gallery_config": {"aws_collection_id": "maja_wedding_w6"}})
        await db.invitation_orders.insert_one(
            {"id": "o6", "profile_id": "w6", "status": "created", "face_photo_limit": 1})
        await db.gallery_photos.insert_one(
            {"id": "w6_p0", "profile_id": "w6", "indexed": True, "s3_key": "k.jpg"})
        await db.gallery_photos.insert_one(
            {"id": "w6_new", "profile_id": "w6", "s3_key": "k.jpg", "indexed": False})

        res = await gf.index_photo_job(db, "w6_new")
        assert res["ok"] is True

    async def test_resolve_face_photo_limit_and_indexed_count_feed_the_stats_surface(self):
        # /gallery/stats (gallery_features.py) stamps face_photo_limit,
        # indexed_count and face_photo_limit_reached straight from these two
        # reads — exercised directly rather than through the full route,
        # which also computes an unrelated by_method aggregate the shared
        # FakeDB fixture (test_storage_orchestrator.py, not owned by this
        # wave) doesn't implement.
        db = FakeDB()
        await _wedding(db, "w7", indexed_count=2, face_photo_limit=2)

        limit = await gf.resolve_face_photo_limit(db, "w7")
        indexed_count = await db.gallery_photos.count_documents(
            {"profile_id": "w7", "indexed": True})
        assert limit == 2
        assert indexed_count == 2
        assert bool(limit is not None and indexed_count >= limit) is True


# --------------------------------------------------------------------------- #
# Phase 14 input bounds — store_features.create_order, called directly.
# --------------------------------------------------------------------------- #
class TestCreateOrderBounds:
    @staticmethod
    def _router(db):
        return sf.build_store_router(db, razorpay_client=None,
                                     get_current_public_user=lambda: None,
                                     require_super_admin=None)

    @staticmethod
    def _create_order_endpoint(router):
        return next(r.endpoint for r in router.routes
                   if getattr(r, "path", "") == "/api/store/order/create")

    async def test_oversized_features_list_rejected_before_any_catalog_work(self):
        db = FakeDB()
        endpoint = self._create_order_endpoint(self._router(db))
        payload = sf.CreateOrderRequest(
            design_id="d1", esign_agreed=True, features=[f"f{i}" for i in range(51)])

        with pytest.raises(HTTPException) as exc:
            await endpoint(payload=payload, current={"user_id": "u1", "kind": "photographer"})
        assert exc.value.status_code == 400
        assert await db.invitation_orders.count_documents({}) == 0    # never touched the DB

    async def test_fifty_features_is_the_allowed_ceiling(self):
        # Exactly 50 must NOT trip the new guard (only >50 does) — it fails
        # later, for an unrelated reason (no razorpay client configured),
        # proving the guard's own boundary is where the task specified.
        db = FakeDB()
        endpoint = self._create_order_endpoint(self._router(db))
        payload = sf.CreateOrderRequest(
            design_id="d1", esign_agreed=True, main_language="english",
            features=[f"f{i}" for i in range(50)])

        with pytest.raises(HTTPException) as exc:
            await endpoint(payload=payload, current={"user_id": "u1", "kind": "photographer"})
        assert exc.value.status_code == 503

    async def test_client_sent_photo_count_is_ignored(self):
        db = FakeDB()
        await db.admins.insert_one({"id": "u1", "is_test": True})    # test-buyer free-claim
        endpoint = self._create_order_endpoint(self._router(db))

        raw = {"design_id": "d1", "esign_agreed": True, "main_language": "english",
               "features": ["face_match_2000"],
               # a hostile/buggy client trying to buy an unlimited cap for free —
               # none of these are fields on CreateOrderRequest.
               "photos": 999999, "count": 999999, "face_photo_limit": 999999}
        payload = sf.CreateOrderRequest(**raw)
        assert not hasattr(payload, "photos")
        assert not hasattr(payload, "count")
        assert not hasattr(payload, "face_photo_limit")

        res = await endpoint(payload=payload, current={"user_id": "u1", "kind": "photographer"})
        order = await db.invitation_orders.find_one({"id": res["order_id"]})
        assert order["face_photo_limit"] == 2000       # the catalog value, never the client's
