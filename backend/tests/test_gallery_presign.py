"""
test_gallery_presign.py -- Lane L1: direct-to-S3 presign upload for the
studio gallery (presign-upload / commit-upload).

    cd backend && python -m tests.test_gallery_presign

Uses the FakeDB harness (no live Postgres/S3) and monkeypatches every AWS
touchpoint gallery_features.py calls (is_configured, generate_presigned_put,
s3, bucket, upload_bytes, generate_signed_url, face_queue.enqueue) so nothing
touches real AWS or Redis.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from PIL import Image                                    # noqa: E402
from fastapi import HTTPException                        # noqa: E402

import face_queue                                         # noqa: E402
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


def _png_bytes(color=(10, 20, 30)) -> bytes:
    im = Image.new("RGB", (300, 200), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


class FakeS3:
    """Records every call; head/get serve whatever was staged."""

    def __init__(self):
        self.objects = {}   # key -> (bytes, content_type)
        self.calls = []

    def stage(self, key, data, content_type="image/png"):
        self.objects[key] = (data, content_type)

    def head_object(self, Bucket, Key):
        self.calls.append(("head_object", Key))
        if Key not in self.objects:
            raise Exception("NoSuchKey")
        data, ct = self.objects[Key]
        return {"ContentLength": len(data), "ContentType": ct}

    def get_object(self, Bucket, Key):
        self.calls.append(("get_object", Key))
        data, _ct = self.objects[Key]
        return {"Body": types.SimpleNamespace(read=lambda: data)}

    def copy_object(self, **kwargs):
        self.calls.append(("copy_object", kwargs.get("CopySource"), kwargs.get("Key")))

    def delete_object(self, Bucket, Key):
        self.calls.append(("delete_object", Key))
        self.objects.pop(Key, None)


def _install_fakes():
    fake_s3 = FakeS3()
    store = {}  # upload_bytes writes (preview/thumb, and original on the non-presign path)

    def fake_upload_bytes(key, data, content_type, tags=None):
        store[key] = (data, content_type)
        return {"bucket": "test", "key": key, "size": len(data)}

    def fake_signed_url(key, expiry_seconds=3600):
        return f"https://signed.example/{key}"

    def fake_presigned_put(key, content_type, expiry_seconds=900):
        return f"https://s3.example/{key}?presigned=put"

    orig = {
        "is_configured": gf.is_configured,
        "generate_presigned_put": gf.generate_presigned_put,
        "s3": gf.s3,
        "bucket": gf.bucket,
        "upload_bytes": gf.upload_bytes,
        "generate_signed_url": gf.generate_signed_url,
        "enqueue": face_queue.enqueue,
    }
    gf.is_configured = lambda: True
    gf.generate_presigned_put = fake_presigned_put
    gf.s3 = lambda: fake_s3
    gf.bucket = lambda: "test-bucket"
    gf.upload_bytes = fake_upload_bytes
    gf.generate_signed_url = fake_signed_url

    enqueue_calls = []

    async def fake_enqueue(job):
        enqueue_calls.append(job)
        return True   # pretend Redis is present -> job stays queued, never runs inline

    face_queue.enqueue = fake_enqueue

    def _restore():
        gf.is_configured = orig["is_configured"]
        gf.generate_presigned_put = orig["generate_presigned_put"]
        gf.s3 = orig["s3"]
        gf.bucket = orig["bucket"]
        gf.upload_bytes = orig["upload_bytes"]
        gf.generate_signed_url = orig["generate_signed_url"]
        face_queue.enqueue = orig["enqueue"]

    return fake_s3, store, enqueue_calls, _restore


def _route(router, path, method):
    return next(r for r in router.routes
               if getattr(r, "path", "") == path and method in (r.methods or []))


async def main():
    fake_s3, store, enqueue_calls, restore = _install_fakes()
    try:
        db = FakeDB()
        profile = {"id": "w1", "admin_id": "admin-1",
                   "gallery_config": {"enabled": True}}
        await db.profiles.insert_one(profile)

        async def _admin_1():
            return "admin-1"

        router = gf.build_gallery_router(db, _admin_1)
        presign_ep = _route(router, "/api/admin/profiles/{profile_id}/gallery/presign-upload", "POST").endpoint
        commit_ep = _route(router, "/api/admin/profiles/{profile_id}/gallery/commit-upload", "POST").endpoint

        # --- presign: wrong owner -> 403
        try:
            await presign_ep(profile_id="w1",
                             body=gf.PresignUploadIn(filename="a.jpg", content_type="image/jpeg", size_bytes=1000),
                             admin_id="admin-2")
            ok("presign wrong owner raises", False)
        except HTTPException as e:
            ok("presign wrong owner -> 403", e.status_code == 403)

        # --- presign: non-image content type -> 415
        try:
            await presign_ep(profile_id="w1",
                             body=gf.PresignUploadIn(filename="a.mp4", content_type="video/mp4", size_bytes=1000),
                             admin_id="admin-1")
            ok("presign non-image raises", False)
        except HTTPException as e:
            ok("presign non-image -> 415", e.status_code == 415)

        # --- presign: oversize -> 413
        try:
            await presign_ep(profile_id="w1",
                             body=gf.PresignUploadIn(filename="a.jpg", content_type="image/jpeg",
                                                     size_bytes=gf.MAX_PRESIGN_BYTES + 1),
                             admin_id="admin-1")
            ok("presign oversize raises", False)
        except HTTPException as e:
            ok("presign oversize -> 413", e.status_code == 413)

        # --- presign: S3 unconfigured -> 503 {code: S3_UNCONFIGURED}
        gf.is_configured = lambda: False
        try:
            await presign_ep(profile_id="w1",
                             body=gf.PresignUploadIn(filename="a.jpg", content_type="image/jpeg", size_bytes=1000),
                             admin_id="admin-1")
            ok("presign S3-unconfigured raises", False)
        except HTTPException as e:
            ok("presign S3-unconfigured -> 503", e.status_code == 503)
            ok("presign S3-unconfigured detail code", e.detail == {"code": "S3_UNCONFIGURED"})
        gf.is_configured = lambda: True

        # --- presign: happy path -> upload_url/s3_key/expires_in, key scoped to profile staging/
        res = await presign_ep(profile_id="w1",
                               body=gf.PresignUploadIn(filename="wedding.png", content_type="image/png",
                                                       size_bytes=5000),
                               admin_id="admin-1")
        ok("presign returns upload_url", res["upload_url"].startswith("https://"))
        ok("presign s3_key scoped to this profile's staging/", res["s3_key"].startswith("weddings/w1/staging/"))
        ok("presign s3_key keeps the extension", res["s3_key"].endswith(".png"))
        ok("presign returns expires_in", res["expires_in"] == gf.GALLERY_PRESIGN_TTL)

        # --- commit: foreign staging key (path traversal / wrong profile) -> 403
        try:
            await commit_ep(profile_id="w1",
                            body=gf.CommitUploadIn(s3_key="weddings/OTHER/staging/x.png"),
                            admin_id="admin-1")
            ok("commit foreign key raises", False)
        except HTTPException as e:
            ok("commit foreign staging key -> 403", e.status_code == 403)

        # --- commit: dedup -> returns existing, deletes staging, no copy_object
        png = _png_bytes()
        checksum = hashlib.sha256(png).hexdigest()
        await db.gallery_photos.insert_one({
            "id": "existing-1", "profile_id": "w1", "checksum": checksum,
            "s3_key": "weddings/w1/photos/existing-1/preview.jpg",
            "thumb_s3_key": "weddings/w1/photos/existing-1/thumb.webp",
            "original_s3_key": "weddings/w1/photos/existing-1/original.png",
        })
        dup_key = "weddings/w1/staging/dup-upload.png"
        fake_s3.stage(dup_key, png, "image/png")
        calls_before = len(fake_s3.calls)
        res = await commit_ep(profile_id="w1",
                              body=gf.CommitUploadIn(s3_key=dup_key, original_name="dup.png"),
                              admin_id="admin-1")
        ok("commit dedup: ok + duplicate", res.get("ok") is True and res.get("duplicate") is True)
        ok("commit dedup: returns the existing photo id", res.get("id") == "existing-1")
        ok("commit dedup: staging object deleted", dup_key not in fake_s3.objects)
        new_calls = fake_s3.calls[calls_before:]
        ok("commit dedup: no copy_object (never touches the original pipeline)",
           not any(c[0] == "copy_object" for c in new_calls))
        ok("commit dedup: delete_object was called for the staging key",
           any(c == ("delete_object", dup_key) for c in new_calls))

        # --- commit: success -> copy_object (not a full re-upload), staging deleted, index enqueued
        png2 = _png_bytes(color=(99, 88, 77))
        real_key = "weddings/w1/staging/real-upload.png"
        fake_s3.stage(real_key, png2, "image/png")
        calls_before = len(fake_s3.calls)
        enqueue_before = len(enqueue_calls)
        res = await commit_ep(profile_id="w1",
                              body=gf.CommitUploadIn(s3_key=real_key, original_name="photo.png"),
                              admin_id="admin-1")
        ok("commit success: ok, not duplicate", res.get("ok") is True and not res.get("duplicate"))
        photo = await db.gallery_photos.find_one({"id": res["id"]})
        ok("commit success: row inserted with matching checksum",
           photo is not None and photo["checksum"] == hashlib.sha256(png2).hexdigest())
        new_calls = fake_s3.calls[calls_before:]
        copy_calls = [c for c in new_calls if c[0] == "copy_object"]
        ok("commit success: copy_object called for the original",
           len(copy_calls) == 1 and copy_calls[0][1] == {"Bucket": "test-bucket", "Key": real_key}
           and copy_calls[0][2] == photo["original_s3_key"])
        ok("commit success: original bytes NOT re-uploaded through upload_bytes",
           photo["original_s3_key"] not in store)
        ok("commit success: preview/thumb WERE uploaded via upload_bytes",
           photo["s3_key"] in store and photo["thumb_s3_key"] in store)
        ok("commit success: staging object deleted after copy",
           any(c == ("delete_object", real_key) for c in new_calls))
        ok("commit success: FACE_INDEX job enqueued",
           len(enqueue_calls) == enqueue_before + 1
           and enqueue_calls[-1]["type"] == "FACE_INDEX"
           and enqueue_calls[-1]["photo_id"] == res["id"])

        print(f"\nGallery Presign: {PASS} checks, {len(FAIL)} failed")
    finally:
        restore()


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
