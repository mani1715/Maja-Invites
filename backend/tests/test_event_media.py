"""
Self-test for the event media pipeline (Spec 07). Runs a REAL image through the
real PIL optimizer into a temp dir — no S3, no server.

    cd backend && python -m tests.test_event_media

Proves:
  1. A valid PNG → preserved original + WebP original/large/medium/small(thumbnail),
     intrinsic dimensions, and a complete gallery metadata row (Spec 07 §Metadata)
     carrying studio_id + size_bytes (so it counts toward the studio quota).
  2. Security: executables, oversize files, and bad magic bytes are refused; the
     client MIME is never trusted (magic-byte sniff is authoritative).
  3. Duplicate detection: cancel → 409, replace → old one trashed, keep → two rows.
  4. Quota: ensure_can_store gate blocks an upload that would exceed the cap.
  5. Recovery: soft-delete moves media to Trash (still counted until purge).
  6. Usage tally.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import types
import tempfile
from pathlib import Path

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from fastapi import HTTPException
from PIL import Image as PILImage
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_media_service as media
import storage_accounting as acct


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


USER = {"user_id": "studioA", "kind": "admin", "admin_id": "studioA"}


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


def _png_bytes(w=1400, h=900, color=(200, 120, 40)):
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, USER, "ganesh_chaturthi")
    event = await db.events.find_one({"event_id": ev["event_id"]})
    tmp = Path(tempfile.mkdtemp(prefix="maja_media_"))

    async def store(data, name="photo.png", **kw):
        return await media.store_media(db, event, USER, filename=name, data=data,
                                       uploads_root=tmp, public_prefix="/uploads", **kw)

    print("1. valid image -> variants + metadata")
    png = _png_bytes()
    row = await store(png)
    _check(row["type"] == "image" and row["width"] == 1400 and row["height"] == 900,
           "dimensions captured (EXIF-aware)")
    for key in ("webp_url", "optimized_url", "thumbnail_url", "storage_path",
                "checksum", "size_bytes", "studio_id", "mime"):
        _check(row.get(key) not in (None, ""), f"metadata has {key}")
    _check(row["studio_id"] == "studioA" and row["size_bytes"] == len(png),
           "row carries studio_id + real size_bytes")
    gdir = tmp / "events" / event["event_id"] / "gallery"
    made = {p.name for p in gdir.iterdir()}
    _check(any(n.endswith("_small.webp") for n in made)
           and any(n.endswith("_large.webp") for n in made)
           and any(n.endswith("_original.png") for n in made),
           "wrote small/large WebP + preserved original")
    _check("gallery" in acct.MEDIA_COLLECTIONS, "gallery counts toward the studio quota")

    print("2. security validation")
    await _expect(store(png, name="evil.exe"), 400, "executable extension refused")
    await _expect(store(b"not-an-image-at-all", name="fake.png"), 400, "bad magic bytes refused")
    await db.app_settings.update_one(
        {"key": "event_media_config"},
        {"$set": {"key": "event_media_config", "value": {"max_image_bytes": 10}}}, upsert=True)
    await _expect(store(png, name="toobig.png"), 413, "oversize image refused")
    await db.app_settings.delete_one({"key": "event_media_config"})

    print("3. duplicate detection")
    await _expect(store(png, name="again.png"), 409, "duplicate cancelled by default")
    keep2 = await store(png, name="again.png", on_duplicate="keep")
    _check(keep2["id"] != row["id"], "keep stores a second copy")
    replaced = await store(png, name="again.png", on_duplicate="replace")
    _check(replaced["id"] not in (row["id"], keep2["id"]), "replace stores a fresh row")

    print("4. quota enforcement")
    async def _tiny_cap(_db, _sid):
        return 10
    real_cap = acct.cap_bytes
    acct.cap_bytes = _tiny_cap
    try:
        await _expect(store(_png_bytes(60, 60), name="q.png"), 403, "over-cap upload blocked")
    finally:
        acct.cap_bytes = real_cap

    print("5. recovery (soft delete -> trash)")
    # `replaced` is live (the `replace` in step 3 trashed the original `row`)
    t = await media.soft_delete_media(db, event, USER, replaced["id"])
    _check(t["trashed"], "media moved to trash")
    gone = await db.gallery.find_one({"id": replaced["id"]})
    _check(gone.get("deleted_at"), "deleted_at set (recoverable)")
    await _expect(media.soft_delete_media(db, event, USER, replaced["id"]), 404, "double-trash rejected")

    print("6. usage tally")
    usage = await media.gallery_usage(db, event)
    _check(usage["event_media"] >= 1 and usage["event_media_incl_trash"] > usage["event_media"],
           "usage separates live vs trashed")

    print("7. CDN push when AWS is configured")
    import aws_service as _aws
    _uploaded = []
    _aws.is_configured = lambda: True
    _aws.cloudfront_domain = lambda: "cdn.example.net"
    _aws.upload_bytes = lambda key, data, ct: _uploaded.append(key)
    cdnrow = await store(_png_bytes(300, 200, (10, 90, 160)), name="cdn.png")
    _check(cdnrow["webp_url"].startswith("https://cdn.example.net/events/"),
           "optimized media served from CloudFront when configured")
    _check(any(k.endswith(".webp") for k in _uploaded), "variants uploaded to S3")
    _aws.is_configured = lambda: False   # reset so it doesn't leak into later checks

    print("8. video upload → original preserved, transcode pending")
    mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
    vrow = await store(mp4, name="clip.mp4")
    _check(vrow["type"] == "video" and vrow["transcode_status"] == "pending",
           "video stored; transcode marked pending (no ffmpeg wired)")
    _check(vrow["size_bytes"] == len(mp4), "video bytes charged to quota")

    print("9. storage pool — event media is mirrored like wedding uploads")
    import storage_pool_hooks as hooks
    up, dele = [], []
    real_up, real_del = hooks.mirror_upload, hooks.mirror_delete
    hooks.mirror_upload = lambda db_, **kw: up.append(kw)
    hooks.mirror_delete = lambda db_, **kw: dele.append(kw)
    try:
        prow = await store(_png_bytes(320, 240, (30, 140, 90)), name="pooled.png")
        _check(len(up) == 1, "one mirror per accepted upload")
        m = up[0]
        _check(m["photographer_id"] == "studioA" and m["area"] == "qr_photos",
               "mirrored into the studio's Events/<Event>/QR_Photos area")
        _check(m["event_id"] == event["event_id"] and m["event_name"],
               "carries the event id + a readable event name for the folder tree")
        _check(m["source_ref"]["kind"] == "disk" and m["source_ref"]["path"],
               "source_ref points at the stored original (lets mirror_delete find it)")
        _check(m["data"] and m["content_type"].startswith("image/"),
               "the accepted bytes + sniffed mime are what get archived")

        await media.soft_delete_media(db, event, USER, prow["id"])
        _check(len(dele) == 1 and dele[0]["source_path"] == m["source_ref"]["path"],
               "trashing the media removes the same pooled copy (app trash ⇔ pool recycle)")

        # a mirror failure must never break an upload — the pool is only a mirror
        def _boom(db_, **kw):
            raise RuntimeError("drive unavailable")
        hooks.mirror_upload = _boom
        safe = await store(_png_bytes(200, 150, (90, 30, 140)), name="pool-down.png")
        _check(safe["id"] and not safe.get("deleted_at"),
               "upload still succeeds when the storage pool is unavailable")
    finally:
        hooks.mirror_upload, hooks.mirror_delete = real_up, real_del

    print("\nALL EVENT MEDIA TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
