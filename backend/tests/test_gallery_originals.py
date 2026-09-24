"""
test_gallery_originals.py -- Lane A3: preserve originals + unified
derivatives + dedup in the AI gallery.

    cd backend && python -m tests.test_gallery_originals

Uses the FakeDB harness (no live Postgres/S3/Rekognition) and monkeypatches
aws_service.upload_bytes / gallery_features.generate_signed_url /
aws_service.generate_signed_url so nothing touches real AWS. Profiles carry
no `aws_collection_id`, so indexing short-circuits through index_photo_job's
existing "no_collection" branch instead of needing a fake face provider.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from PIL import Image                                    # noqa: E402
from fastapi import UploadFile                            # noqa: E402

import aws_service                                        # noqa: E402
import gallery_features as gf                              # noqa: E402
from tests.test_storage_orchestrator import FakeDB         # noqa: E402

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


def _png_bytes(w=300, h=200, color=(10, 20, 30)) -> bytes:
    im = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _upload(filename: str, data: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(data))


def _install_fakes():
    """Route S3 writes/URLs through in-memory fakes; nothing touches AWS."""
    store = {}

    def fake_upload_bytes(key, data, content_type, tags=None):
        store[key] = (data, content_type)
        return {"bucket": "test", "key": key, "size": len(data)}

    def fake_signed_url(key, expiry_seconds=3600):
        return f"https://signed.example/{key}"

    orig_upload, orig_gf_url, orig_aws_url = gf.upload_bytes, gf.generate_signed_url, aws_service.generate_signed_url
    gf.upload_bytes = fake_upload_bytes
    gf.generate_signed_url = fake_signed_url
    aws_service.generate_signed_url = fake_signed_url

    def _restore():
        gf.upload_bytes = orig_upload
        gf.generate_signed_url = orig_gf_url
        aws_service.generate_signed_url = orig_aws_url

    return store, _restore


async def main():
    store, restore = _install_fakes()
    try:
        db = FakeDB()
        profile = {"id": "w1", "admin_id": "admin-1", "gallery_config": {"enabled": True}}
        await db.profiles.insert_one(profile)
        gc = profile["gallery_config"]
        png = _png_bytes()

        # --- ingest stores 3 keys + checksum, preserves original bytes exactly
        res1 = await gf._ingest_photo(db, profile, gc, _upload("wedding.png", png),
                                       method="bulk", uploader="photographer")
        ok("ingest ok, not flagged duplicate", res1.get("ok") is True and not res1.get("duplicate"))
        photo = await db.gallery_photos.find_one({"id": res1["id"]})
        ok("checksum stored", photo.get("checksum") == hashlib.sha256(png).hexdigest())
        ok("original_s3_key distinct from preview/thumb keys",
           photo.get("original_s3_key") and photo["original_s3_key"] != photo["s3_key"]
           and photo["original_s3_key"] != photo["thumb_s3_key"])
        ok("preview_s3_key alias == legacy s3_key", photo.get("preview_s3_key") == photo["s3_key"])
        ok("original extension preserved (.png, not forced .jpg)",
           photo["original_s3_key"].endswith(".png"))
        orig_bytes_stored, orig_ct = store[photo["original_s3_key"]]
        ok("original bytes stored byte-identical to the upload", orig_bytes_stored == png)
        ok("original content-type is image/png (not re-encoded)", orig_ct == "image/png")
        preview_bytes, preview_ct = store[photo["s3_key"]]
        ok("preview re-encoded as JPEG", preview_ct == "image/jpeg" and preview_bytes != png)
        _thumb_bytes, thumb_ct = store[photo["thumb_s3_key"]]
        ok("thumb re-encoded as WEBP", thumb_ct == "image/webp")

        # --- duplicate upload: same profile + same bytes -> existing row, no insert
        before = await db.gallery_photos.count_documents({"profile_id": "w1"})
        res2 = await gf._ingest_photo(db, profile, gc, _upload("wedding-copy.png", png),
                                       method="bulk", uploader="photographer")
        after = await db.gallery_photos.count_documents({"profile_id": "w1"})
        ok("duplicate marked in the result", res2.get("duplicate") is True and res2.get("ok") is True)
        ok("duplicate result points at the original photo id", res2.get("id") == res1["id"])
        ok("duplicate upload does not insert a second row", after == before)

        # --- legacy row (predates original_s3_key/preview_s3_key/checksum)
        legacy_id = "legacy-1"
        await db.gallery_photos.insert_one({
            "id": legacy_id, "profile_id": "w1", "upload_method": "bulk",
            "s3_key": "weddings/w1/photos/legacy-1/orig.jpg",
            "thumb_s3_key": "weddings/w1/photos/legacy-1/thumb.jpg",
            "face_count": 0, "created_at": gf._now().isoformat(),
        })

        async def _fake_admin():
            return "admin-1"

        router = gf.build_gallery_router(db, _fake_admin)

        def _route(path, method):
            return next(r for r in router.routes
                       if getattr(r, "path", "") == path and method in (r.methods or []))

        # --- listing: original_url signs the true original; legacy row falls back
        listing = await _route("/api/admin/profiles/{profile_id}/gallery/photos", "GET").endpoint(
            profile_id="w1", limit=200, offset=0, event_invitation_id=None, admin_id="admin-1")
        by_id = {p["id"]: p for p in listing["photos"]}
        ok("new-row original_url signs the TRUE original key",
           photo["original_s3_key"] in by_id[res1["id"]]["original_url"])
        ok("legacy-row original_url falls back to legacy s3_key",
           "legacy-1/orig.jpg" in by_id[legacy_id]["original_url"])

        # --- download-all: prefers the original key, falls back for legacy rows
        manifest = await _route("/api/admin/profiles/{profile_id}/gallery/download-all", "GET").endpoint(
            profile_id="w1", admin_id="admin-1")
        urls = [f["url"] for f in manifest["files"]]
        ok("download-all signs the true original for the new row",
           any(photo["original_s3_key"] in u for u in urls))
        ok("download-all falls back to s3_key for the legacy row",
           any("legacy-1/orig.jpg" in u for u in urls))

        # --- bulk-upload: duplicates reported, batch not failed
        bulk_result = await _route(
            "/api/admin/profiles/{profile_id}/gallery/bulk-upload", "POST").endpoint(
            profile_id="w1", files=[_upload("dupe-a.png", png), _upload("dupe-b.png", png)],
            event_invitation_id=None, archive_to_storage=False, admin_id="admin-1")
        ok("bulk-upload does not fail on duplicates", bulk_result["success"] is True and bulk_result["failed"] == 0)
        ok("bulk-upload reports skipped_duplicates", bulk_result["skipped_duplicates"] == 2)

        print(f"\nGallery Originals: {PASS} checks, {len(FAIL)} failed")
    finally:
        restore()


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
