"""
event_media_service.py — MAJA Dynamic Event Engine: media pipeline (Spec 07).
=============================================================================

Purpose
    The upload → validate → optimize → store → record pipeline for event galleries,
    built to REUSE the existing MAJA media infrastructure (Spec 07 acceptance:
    "Existing MAJA media infrastructure remains compatible"):
      * quota gate + byte accounting  → storage_accounting (ensure_can_store, cap)
      * WebP + responsive variants     → PIL, same approach as convert_to_webp_responsive
      * metadata store                 → the `gallery` child collection (Spec 04/05)
      * ownership + audit + soft-delete → event_lifecycle_service helpers
    Originals are always preserved; optimized/WebP copies serve public pages
    (Spec 07 §Design Principles). Media references live in the DB, never in the
    event document.

Inputs      db, the event doc (already ownership-checked), raw file bytes + name
Outputs     a full gallery metadata row (Spec 07 §Metadata) + on-disk variants
Dependencies  Pillow, storage_accounting, event_lifecycle_service
Side effects  writes WebP variants to the uploads root, a `gallery` row (carrying
            studio_id + size_bytes so it counts toward the studio quota), audit rows
Security (Spec 07) magic-byte sniff (never trust client MIME), extension allow-list,
            executable block, path-traversal-safe names, size caps, pluggable virus scan.

DEFERRED with reasons (needs infra/creds — flagged, not guessed):
  * async video transcode (ffmpeg) — videos store original + poster only for now
  * real virus scanner — `scan_clean()` is a pluggable hook, clean-by-default
  * S3/CloudFront + Google-Drive mirror for events — reuse the existing hooks later
  * signed URLs for private downloads (Spec 07 §CDN)
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from PIL import Image as PILImage

import storage_accounting as acct
import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _audit, _uid, _now
from media_derivatives import normalize, encode

logger = logging.getLogger("event_media")


def _pool_event_name(event: Dict[str, Any]) -> str:
    """Folder-safe name for the event's storage-pool tree (mirrors the wedding
    convention: a readable title, never an opaque id)."""
    raw = (event.get("title") or event.get("event_name")
           or event.get("publish_slug") or event.get("event_id") or "Event")
    safe = re.sub(r"[\\/:*?\"<>|]+", "-", str(raw)).strip(" .-")
    return safe[:80] or str(event.get("event_id") or "Event")

# --------------------------------------------------------------------------- #
# config (Spec 07 — sizes/quality configurable)
# --------------------------------------------------------------------------- #
DEFAULTS = {
    "max_image_bytes": 15 * 1024 * 1024,
    "max_video_bytes": 200 * 1024 * 1024,
    "image_quality": 82,
    "thumb_width": 320,
    "variants": [("small", 320), ("medium", 768), ("large", 1280)],
    "original_max": 1920,
}

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm"}
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm"}
# executables / scripts are refused outright (Spec 07 §Security)
BLOCKED_EXT = {".exe", ".dll", ".sh", ".bat", ".cmd", ".com", ".js", ".mjs",
               ".php", ".py", ".rb", ".pl", ".html", ".htm", ".svg", ".jar"}

# magic-byte signatures — the authoritative type; client MIME is never trusted.
_MAGIC: List[tuple] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"), (b"GIF89a", "image/gif"),
]


def _sniff(data: bytes) -> Optional[str]:
    for sig, mime in _MAGIC:
        if data.startswith(sig):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp":                          # ISO-BMFF: mp4 / mov
        brand = data[8:12]
        if brand[:3] == b"qt ":
            return "video/quicktime"
        return "video/mp4"
    if data[:4] == b"\x1aE\xdf\xa3":                  # EBML → webm/mkv
        return "video/webm"
    return None


def _checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_name(name: str) -> str:
    """Strip any path and keep a safe basename (Spec 07 — no path traversal)."""
    base = os.path.basename(str(name or "")).replace("\\", "_")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base).lstrip(".")
    return base[:180] or "upload"


async def media_config(db) -> Dict[str, Any]:
    try:
        doc = await db.app_settings.find_one({"key": "event_media_config"})
        if doc and isinstance(doc.get("value"), dict):
            return {**DEFAULTS, **doc["value"]}
    except Exception:
        pass
    return dict(DEFAULTS)


def scan_clean(data: bytes) -> bool:
    """Pluggable virus-scan hook (Spec 07 §Virus Scan). No scanner is wired in this
    environment, so this is clean-by-default — swap in ClamAV/S3 malware scan in prod."""
    return True


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
def validate_upload(filename: str, data: bytes, config: Dict[str, Any]) -> Dict[str, Any]:
    ext = os.path.splitext(str(filename or ""))[1].lower()
    if ext in BLOCKED_EXT:
        raise HTTPException(400, "That file type is not allowed.")
    if ext and ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type '{ext}'.")
    if not data:
        raise HTTPException(400, "Empty file.")
    mime = _sniff(data)                                # never trust the client
    if mime not in (ALLOWED_IMAGE_MIME | ALLOWED_VIDEO_MIME):
        raise HTTPException(400, "Could not verify this file — it may be corrupt or unsupported.")
    is_video = mime in ALLOWED_VIDEO_MIME
    cap = config["max_video_bytes"] if is_video else config["max_image_bytes"]
    if len(data) > cap:
        raise HTTPException(413, f"File is too large (max {cap // (1024 * 1024)} MB).")
    if not scan_clean(data):
        raise HTTPException(400, "This file failed the security scan.")
    return {"mime": mime, "is_video": is_video, "ext": ext or (".mp4" if is_video else ".jpg")}


# --------------------------------------------------------------------------- #
# image optimization (real, locally verifiable — PIL)
# --------------------------------------------------------------------------- #
def optimize_image(data: bytes, *, out_dir: Path, base_name: str, url_prefix: str,
                   config: Dict[str, Any]) -> Dict[str, Any]:
    """Write the preserved original + WebP original/large/medium/small(thumbnail).
    Returns URLs + intrinsic dimensions + stored byte size. Mirrors the wedding
    pipeline (convert_to_webp_responsive) so behaviour stays consistent.

    Decode/EXIF-transpose/RGB-flatten delegates to media_derivatives.normalize;
    each per-variant encode delegates to media_derivatives.encode. The
    original_max/variants resize itself stays inline because it needs to keep
    a live PIL Image around for every subsequent variant to resize *from*
    (config-driven widths/qualities unchanged)."""
    try:
        img = normalize(data)
    except ValueError as e:
        raise HTTPException(400, f"Invalid image file: {e}")

    out_dir.mkdir(parents=True, exist_ok=True)
    orig = img
    if orig.width > config["original_max"]:
        r = config["original_max"] / orig.width
        orig = orig.resize((config["original_max"], max(1, int(orig.height * r))), PILImage.Resampling.LANCZOS)

    def _save_webp(im, name) -> str:
        p = out_dir / name
        p.write_bytes(encode(im, width=None, fmt="WEBP", quality=config["image_quality"]))
        return f"{url_prefix}/{name}"

    urls: Dict[str, str] = {"original_webp": _save_webp(orig, f"{base_name}.webp")}
    for label, target_w in config["variants"]:
        im = orig if target_w >= orig.width else orig.resize(
            (target_w, max(1, int(orig.height * target_w / orig.width))), PILImage.Resampling.LANCZOS)
        urls[label] = _save_webp(im, f"{base_name}_{label}.webp")

    return {
        "width": orig.width, "height": orig.height,
        "webp_url": urls["original_webp"],
        "optimized_url": urls.get("large", urls["original_webp"]),
        "thumbnail_url": urls.get("small", urls["original_webp"]),
        "stored_bytes": (out_dir / f"{base_name}.webp").stat().st_size,
    }


# --------------------------------------------------------------------------- #
# duplicate detection (Spec 07 §Duplicate Detection)
# --------------------------------------------------------------------------- #
# Ops can wire an ffmpeg-based transcoder here: fn(path, out_dir, base, url_prefix)
# -> {"poster_url","streaming_url","duration"}. Until then, videos keep their
# preserved original and are marked "pending" (Spec 07 §Video Processing — async).
VIDEO_TRANSCODER = None


def transcode_video(path: Path, out_dir: Path, base: str, url_prefix: str) -> Dict[str, Any]:
    if VIDEO_TRANSCODER is None:
        return {"transcode_status": "pending", "poster_url": None, "streaming_url": None, "duration": None}
    try:
        out = VIDEO_TRANSCODER(path, out_dir, base, url_prefix) or {}
        return {"transcode_status": "done", "poster_url": out.get("poster_url"),
                "streaming_url": out.get("streaming_url"), "duration": out.get("duration")}
    except Exception:   # pragma: no cover - never fail an upload on a transcode error
        return {"transcode_status": "failed", "poster_url": None, "streaming_url": None, "duration": None}


def _push_to_cdn(out_dir: Path, base: str, event_id: str, url_prefix: str) -> Dict[str, str]:
    """Upload the optimized copies to S3/CloudFront when AWS is configured (Spec 07
    §CDN), returning a {local_url: cdn_url} remap. Reuses the existing aws_service.
    No-op (local disk serves) when AWS isn't set — the dev/default path."""
    try:
        import aws_service
        if not (aws_service.is_configured() and aws_service.cloudfront_domain()):
            return {}
    except Exception:
        return {}
    dom = aws_service.cloudfront_domain()
    remap: Dict[str, str] = {}
    for p in out_dir.glob(f"{base}*"):
        key = f"events/{event_id}/gallery/{p.name}"
        ct = ("image/webp" if p.suffix == ".webp"
              else "video/mp4" if p.suffix in (".mp4", ".mov", ".webm")
              else "image/jpeg" if p.suffix in (".jpg", ".jpeg")
              else "application/octet-stream")
        try:
            aws_service.upload_bytes(key, p.read_bytes(), ct)
            remap[f"{url_prefix}/{p.name}"] = f"https://{dom}/{key}"
        except Exception:   # pragma: no cover - never fail an upload on a CDN hiccup
            pass
    return remap


async def find_duplicate(db, event_id: str, checksum: str) -> Optional[Dict[str, Any]]:
    async for row in db.gallery.find({"event_id": event_id}):
        if not row.get("deleted_at") and row.get("checksum") == checksum:
            row.pop("_id", None)
            return row
    return None


# --------------------------------------------------------------------------- #
# the pipeline (upload + attach, atomic)
# --------------------------------------------------------------------------- #
async def store_media(db, event: Dict[str, Any], current: Dict[str, Any], *,
                      filename: str, data: bytes, content_type: str = "",
                      album_id: Optional[str] = None, caption: str = "",
                      festival_day=None,
                      on_duplicate: str = "cancel",
                      uploads_root: Optional[Path] = None,
                      public_prefix: str = "/uploads",
                      optimize: Callable = optimize_image) -> Dict[str, Any]:
    """Full pipeline. `event` must already be ownership-checked by the caller.
    Bytes are charged to the studio (owner) quota; the gallery row carries
    studio_id + size_bytes so it counts (Spec 07 §Storage Quotas)."""
    config = await media_config(db)
    info = validate_upload(filename, data, config)
    event_id = event["event_id"]
    sid = event.get("owner_id")
    checksum = _checksum(data)

    # v2 — per-day rule: a day's photos unlock only after the day arrives, and each
    # day accepts at most 5 photos + 1 video (≤100 MB). No-op for ungrouped uploads.
    if festival_day not in (None, "", 0, "0"):
        from event_day_photos import enforce_day_upload
        await enforce_day_upload(db, event_id, festival_day,
                                 is_video=info["is_video"], size_bytes=len(data))

    dup = await find_duplicate(db, event_id, checksum)
    if dup:
        if on_duplicate == "cancel":
            raise HTTPException(409, {"message": "This file was already uploaded.",
                                      "code": "DUPLICATE", "media_id": dup["id"]})
        if on_duplicate == "replace":
            await soft_delete_media(db, event, current, dup["id"])
        # "keep" → fall through and store a second copy

    await acct.ensure_can_store(db, sid, len(data))     # quota gate (raises 403)

    media_id = _uid("med")
    safe = _safe_name(filename)
    base = f"{media_id}"
    rel_dir = f"events/{event_id}/gallery"
    root = Path(uploads_root) if uploads_root else Path(os.environ.get("UPLOADS_ROOT", "/app/uploads"))
    out_dir = root / rel_dir
    url_prefix = f"{public_prefix}/{rel_dir}"

    variants: Dict[str, Any] = {}
    if info["is_video"]:
        # preserve original; transcode/poster deferred (documented). Bytes still charged.
        out_dir.mkdir(parents=True, exist_ok=True)
        orig_path = out_dir / f"{base}{info['ext']}"
        orig_path.write_bytes(data)
        variants = {"width": None, "height": None, "webp_url": None,
                    "optimized_url": f"{url_prefix}/{orig_path.name}",
                    "thumbnail_url": None, "stored_bytes": len(data),
                    "storage_path": str(orig_path)}
        variants.update(transcode_video(orig_path, out_dir, base, url_prefix))
    else:
        # always preserve the untouched original too (Spec 07 §Design Principles)
        out_dir.mkdir(parents=True, exist_ok=True)
        orig_path = out_dir / f"{base}_original{info['ext']}"
        orig_path.write_bytes(data)
        variants = optimize(data, out_dir=out_dir, base_name=base, url_prefix=url_prefix, config=config)
        variants["storage_path"] = str(orig_path)

    # serve optimized copies from CloudFront when configured (else local disk)
    remap = _push_to_cdn(out_dir, base, event_id, url_prefix)
    if remap:
        for kf in ("webp_url", "optimized_url", "thumbnail_url"):
            if variants.get(kf) in remap:
                variants[kf] = remap[variants[kf]]
        variants["cdn"] = True

    row = {
        "id": media_id, "child_id": media_id, "event_id": event_id,
        "album_id": album_id, "type": "video" if info["is_video"] else "image",
        "filename": safe, "original_filename": filename,
        "size": len(data), "size_bytes": len(data),          # size_bytes → quota sum
        "studio_id": sid,                                     # studio scope for quota
        "width": variants.get("width"), "height": variants.get("height"),
        "duration": variants.get("duration"), "mime": info["mime"],
        "poster_url": variants.get("poster_url"),
        "transcode_status": variants.get("transcode_status"),
        "url": variants.get("optimized_url") or variants.get("webp_url"),
        "storage_path": variants.get("storage_path"),
        "thumbnail_url": variants.get("thumbnail_url"),
        "optimized_url": variants.get("optimized_url"),
        "webp_url": variants.get("webp_url"),
        "checksum": checksum, "caption": caption, "display_order": 0,
        "festival_day": festival_day,                         # v2 — per-day grouping
        "created_by": current.get("user_id") or current.get("admin_id"),
        "deleted_at": None, "created_at": _now(), "updated_at": _now(),
        "area": "event_gallery",
    }
    await db.gallery.insert_one(row)
    await _audit(db, event_id, current, "media_upload", "gallery",
                 after={"media_id": media_id, "bytes": len(data)})

    # V1 multi-drive storage pool — archive a copy into
    # Photographers/<Studio>/Events/<Event>/QR_Photos, exactly like wedding uploads.
    # Fire-and-forget + flag-gated (`storage_pool_enabled`, default OFF): the pool is
    # a MIRROR, so serving never depends on it and an upload never fails because Drive
    # was slow. `source_ref` lets mirror_delete find this copy again later.
    try:
        from storage_pool_hooks import mirror_upload
        mirror_upload(
            db, photographer_id=sid or "", area="qr_photos",
            filename=f"{media_id}{info['ext']}", data=data,
            content_type=info["mime"] or content_type or "application/octet-stream",
            event_id=event_id, event_name=_pool_event_name(event),
            source_ref={"kind": "disk", "path": variants.get("storage_path")},
        )
    except Exception as e:      # never let the mirror break an upload
        logger.debug("event media: storage-pool mirror skipped (%s)", e)

    row.pop("_id", None)
    return row


async def soft_delete_media(db, event: Dict[str, Any], current: Dict[str, Any],
                            media_id: str) -> Dict[str, Any]:
    """Move media to Trash (Spec 07 §Recovery). Trashed items still occupy quota
    until permanent purge — matching the spec's lifecycle."""
    row = await db.gallery.find_one({"id": media_id, "event_id": event["event_id"]})
    if not row or row.get("deleted_at"):
        raise HTTPException(404, "Media not found")
    await db.gallery.update_one({"id": media_id, "event_id": event["event_id"]},
                                {"$set": {"deleted_at": _now(), "updated_at": _now()}})
    await _audit(db, event["event_id"], current, "media_trash", "gallery", before={"media_id": media_id})

    # Keep the pooled mirror in step with the app (charter: app trash ⇔ pool recycle).
    try:
        from storage_pool_hooks import mirror_delete
        mirror_delete(
            db, photographer_id=event.get("owner_id") or "",
            source_path=row.get("storage_path"), filename=row.get("filename"),
            area="qr_photos", event_id=event["event_id"], url=row.get("url"))
    except Exception as e:
        logger.debug("event media: storage-pool mirror_delete skipped (%s)", e)

    return {"trashed": True, "id": media_id}


async def gallery_usage(db, event: Dict[str, Any]) -> Dict[str, Any]:
    """Per-event media tally + the owner studio's overall storage meter."""
    count = live = bytes_used = 0
    async for row in db.gallery.find({"event_id": event["event_id"]}):
        count += 1
        if not row.get("deleted_at"):
            live += 1
            bytes_used += int(row.get("size_bytes") or 0)
    summary = {}
    try:
        summary = await acct.usage_summary(db, event.get("owner_id"))
    except Exception:
        pass
    return {"event_media": live, "event_media_incl_trash": count,
            "event_bytes": bytes_used, "studio_storage": summary}


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_event_media_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-media"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.post("/api/events/{event_id}/gallery/upload")
    async def upload(event_id: str, file: UploadFile = File(...),
                     album_id: str = Form(None), caption: str = Form(""),
                     festival_day: str = Form(None),
                     on_duplicate: str = Form("cancel"), current=Depends(get_current_buyer)):
        await _gate()
        if not acct.allow_upload(str(current.get("user_id") or current.get("admin_id") or "")):
            raise HTTPException(429, "Too many uploads — slow down a moment.")
        event = await rbac.authorize_event(db, event_id, current, rbac.P_GALLERY_UPLOAD)
        data = await file.read()
        return await store_media(db, event, current, filename=file.filename or "upload",
                                 data=data, content_type=file.content_type or "",
                                 album_id=album_id or None, caption=caption or "",
                                 festival_day=festival_day or None,
                                 on_duplicate=on_duplicate)

    @router.get("/api/events/{event_id}/days/{festival_day}/photo-status")
    async def day_photo_status(event_id: str, festival_day: str, current=Depends(get_current_buyer)):
        await _gate()
        await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_VIEW)
        from event_day_photos import day_status
        return await day_status(db, event_id, festival_day)

    @router.delete("/api/events/{event_id}/gallery/{media_id}")
    async def trash(event_id: str, media_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_GALLERY_DELETE)
        return await soft_delete_media(db, event, current, media_id)

    @router.get("/api/events/{event_id}/gallery-usage")
    async def usage(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_VIEW)
        return await gallery_usage(db, event)

    return router
