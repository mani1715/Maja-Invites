"""
test_face_provider_wiring.py -- Lane A2: the live face system rewired onto
face_providers (gallery_features.py / worker.py / face_ops.py).

    cd backend && python -m tests.test_face_provider_wiring

Proves index_photo_job / run_search_job / the delete-photo route call
face_providers.get_face_provider() -- never aws_service's face wrappers
directly -- and that ExternalImageId passed to indexing == photo_id (the
base.py contract). aws_service's face wrappers are poisoned so any
accidental direct call blows up loudly instead of silently "working".
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

# import the real aws_service (and gallery_features, which needs its names)
# BEFORE test_storage_orchestrator, which stubs sys.modules["aws_service"]
# with an empty module via setdefault -- real-first means that stub never wins.
import aws_service                                    # noqa: E402
import face_providers as fp                           # noqa: E402
import gallery_features as gf                         # noqa: E402
from tests.test_storage_orchestrator import FakeDB   # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


class FakeProvider:
    """Records every call; never touches real AWS."""

    def __init__(self):
        self.calls = []

    def create_collection(self, collection_id):
        self.calls.append(("create_collection", collection_id))
        return {"created": True}

    def delete_collection(self, collection_id):
        self.calls.append(("delete_collection", collection_id))
        return True

    def index_photo_faces(self, collection_id, s3_key, external_image_id, max_faces=15):
        self.calls.append(("index_photo_faces", collection_id, s3_key, external_image_id, max_faces))
        return {"ok": True, "face_count": 2, "face_ids": ["f1", "f2"]}

    def search_by_selfie(self, collection_id, selfie_bytes, threshold=None, max_faces=100):
        self.calls.append(("search_by_selfie", collection_id, threshold, max_faces))
        return {"ok": True, "match_count": 1,
                "matches": [{"photo_id": "photo-1", "similarity": 97.5}]}

    def delete_faces(self, collection_id, face_ids):
        self.calls.append(("delete_faces", collection_id, list(face_ids)))
        return {"ok": True, "deleted_count": len(face_ids)}

    def health_check(self):
        self.calls.append(("health_check",))
        return {"ok": True}


def _install_fake_provider() -> FakeProvider:
    """Monkeypatch the face_providers singleton so get_face_provider() (as
    called fresh, inside each gallery_features function) hands back this
    instance instead of constructing a real RekognitionProvider."""
    os.environ.pop("FACE_MATCH_PROVIDER", None)
    fake = FakeProvider()
    fp._instances.clear()
    fp._instances["rekognition"] = fake
    return fake


def _poison_aws_service():
    """If gallery_features/worker ever call aws_service's face wrappers
    directly again (bypassing the provider), this fails loudly."""
    def _boom(*a, **k):
        raise AssertionError("aws_service face wrapper called directly -- bypassed the provider")
    aws_service.create_face_collection = _boom
    aws_service.delete_face_collection = _boom
    aws_service.index_photo_faces = _boom
    aws_service.search_faces_by_selfie = _boom
    aws_service.rekognition = _boom


async def main():
    _poison_aws_service()

    # --- index_photo_job: routes through provider, ExternalImageId == photo_id
    fake = _install_fake_provider()
    db = FakeDB()
    await db.profiles.insert_one(
        {"id": "w1", "gallery_config": {"aws_collection_id": "maja_wedding_w1"}})
    await db.gallery_photos.insert_one(
        {"id": "photo-1", "profile_id": "w1", "s3_key": "weddings/w1/photos/photo-1/orig.jpg"})

    res = await gf.index_photo_job(db, "photo-1")
    ok("index_photo_job ok=True face_count=2", res.get("ok") is True and res.get("face_count") == 2)
    call = next((c for c in fake.calls if c[0] == "index_photo_faces"), None)
    ok("index_photo_faces routed through provider", call is not None and call[1] == "maja_wedding_w1")
    ok("ExternalImageId == photo_id contract", call is not None and call[3] == "photo-1")
    photo = await db.gallery_photos.find_one({"id": "photo-1"})
    ok("photo row updated from provider result",
       photo["face_count"] == 2 and photo["aws_face_ids"] == ["f1", "f2"] and photo["indexed"] is True)

    # --- run_search_job: routes through provider.search_by_selfie
    fake = _install_fake_provider()
    db2 = FakeDB()
    await db2.profiles.insert_one(
        {"id": "w1", "gallery_config": {"aws_collection_id": "maja_wedding_w1",
                                         "confidence_threshold": 88.0}})
    await db2.face_search_sessions.insert_one(
        {"id": "sess-1", "profile_id": "w1", "selfie_s3_key": "weddings/w1/selfies/sess-1.jpg"})

    orig_s3, orig_bucket = gf.s3, gf.bucket
    gf.s3 = lambda: types.SimpleNamespace(
        get_object=lambda Bucket, Key: {"Body": types.SimpleNamespace(read=lambda: b"selfie-bytes")})
    gf.bucket = lambda: "test-bucket"
    try:
        res = await gf.run_search_job(db2, "sess-1")
    finally:
        gf.s3, gf.bucket = orig_s3, orig_bucket
    ok("run_search_job status=done", res.get("status") == "done")
    ok("matched photo id came back through provider", res.get("matched_photo_ids") == ["photo-1"])
    call = next((c for c in fake.calls if c[0] == "search_by_selfie"), None)
    ok("search_by_selfie routed through provider with threshold",
       call is not None and call[1] == "maja_wedding_w1" and call[2] == 88.0)

    # --- delete_photo route: routes through provider.delete_faces
    fake = _install_fake_provider()
    db3 = FakeDB()
    await db3.profiles.insert_one(
        {"id": "w1", "admin_id": "admin-1",
         "gallery_config": {"aws_collection_id": "maja_wedding_w1"}})
    await db3.gallery_photos.insert_one(
        {"id": "photo-1", "profile_id": "w1", "s3_key": "k/orig.jpg", "thumb_s3_key": "k/thumb.jpg",
         "aws_face_ids": ["f1", "f2"]})

    orig_s3, orig_bucket = gf.s3, gf.bucket
    gf.s3 = lambda: types.SimpleNamespace(delete_objects=lambda **k: None)
    gf.bucket = lambda: "test-bucket"

    async def _get_current_admin():
        return "admin-1"

    router = gf.build_gallery_router(db3, _get_current_admin)
    delete_route = next(
        r for r in router.routes
        if getattr(r, "path", "") == "/api/admin/profiles/{profile_id}/gallery/photos/{photo_id}"
        and "DELETE" in (r.methods or []))
    try:
        result = await delete_route.endpoint(profile_id="w1", photo_id="photo-1", admin_id="admin-1")
    finally:
        gf.s3, gf.bucket = orig_s3, orig_bucket
    ok("delete_photo route returns success", result == {"success": True})
    call = next((c for c in fake.calls if c[0] == "delete_faces"), None)
    ok("delete_faces routed through provider with face ids",
       call is not None and call[1] == "maja_wedding_w1" and call[2] == ["f1", "f2"])
    remaining = await db3.gallery_photos.find_one({"id": "photo-1"})
    ok("photo row deleted", remaining is None)

    print(f"\nFace Provider Wiring: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
