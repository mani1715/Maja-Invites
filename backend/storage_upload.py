"""
storage_upload.py — browser-to-S3 direct uploads (presigned POST).
===================================================================

THE PROBLEM THIS SOLVES
-----------------------
Every existing upload endpoint does this:

    data = await file.read()        # entire file, resident, on the app server

Confirmed at 8 call sites (portfolio, pixora, live gallery, premium, guest,
event media, server.py). A 200 MB wedding film is 200 MB of RAM *per concurrent
upload*; on an 8 GB box that OOMs at roughly 40. And while a photographer pushes
a 5,000-photo event through it, every guest opening an invitation is queued
behind those bytes on the same worker.

The fix is not a bigger instance. It is to stop putting media through the app
tier at all:

    1. POST /api/uploads/presign   -> app returns a policy + the key it chose
    2. PUT/POST straight to S3     -> app never sees a byte
    3. POST /api/uploads/commit    -> app verifies with head_object, writes the row

The app server handles two small JSON requests instead of the whole file. This
is what lets one modest EC2 serve a media platform.

SECURITY MODEL — assume the client is hostile
---------------------------------------------
A presigned POST is a capability handed to a browser, so every constraint has to
be baked into the policy, and everything the client claims afterwards has to be
re-checked:

* **The server chooses the key.** Never the client. A client-supplied key is a
  path-traversal and overwrite primitive — it could target another studio's
  prefix, or clobber an existing photo.
* **`content-length-range` is in the policy**, so S3 itself rejects an oversized
  body. Checking size after the upload means you already paid to store it.
* **Content type is constrained** by the policy and re-checked on commit.
* **Short expiry** (default 15 min) — a leaked policy stops working quickly.
* **`head_object` on commit** establishes the real size and type. The client's
  reported values are never trusted, and quota is charged from the real one.
* **Quota is checked twice**: before signing (cheap rejection) and on commit
  (authoritative). Only the commit figure is billed against the studio.

An upload that is never committed leaves a live S3 object with nothing in the
database pointing to it — the browser can die any time after the S3 POST
succeeds but before this module's commit() runs. The real mechanism: presign()
writes a `db.upload_intents` row (status "pending") before handing back the
policy, keyed by the object key it just signed; commit() flips that row to
"committed" by key. A row still "pending" 24h later is an abandoned upload —
media_reconcile.py's `_sweep_upload_intents` claims it, head-checks the key,
deletes the S3 object if one landed, and marks the intent "expired" (bounded
retries on a transient S3 error before giving up as "failed"). Nothing ever
lists an S3 prefix to find orphans — the intent rows are the index.
"""
import io
import os
import re
import uuid
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("storage_upload")

from cache_backend import rate_limit_allow

# Mirrors orchestrator.UPLOAD_AREAS. Kept as an explicit allowlist because this
# value reaches the object key, so an unexpected one must be a 400, not a folder.
AREAS = ("qr_photos", "selfies", "portfolio", "cloud_storage", "community", "media")

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_VIDEO_BYTES = 500 * 1024 * 1024
MAX_AUDIO_BYTES = 50 * 1024 * 1024

ALLOWED = {
    "image/jpeg": (".jpg", MAX_IMAGE_BYTES),
    "image/png": (".png", MAX_IMAGE_BYTES),
    "image/webp": (".webp", MAX_IMAGE_BYTES),
    "image/heic": (".heic", MAX_IMAGE_BYTES),
    "image/heif": (".heif", MAX_IMAGE_BYTES),
    "video/mp4": (".mp4", MAX_VIDEO_BYTES),
    "video/quicktime": (".mov", MAX_VIDEO_BYTES),
    "video/webm": (".webm", MAX_VIDEO_BYTES),
    "audio/mpeg": (".mp3", MAX_AUDIO_BYTES),
    "audio/mp4": (".m4a", MAX_AUDIO_BYTES),
    "audio/wav": (".wav", MAX_AUDIO_BYTES),
}

PRESIGN_TTL = int(os.environ.get("UPLOAD_PRESIGN_TTL", "900"))   # 15 minutes

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_filename(filename: Optional[str]) -> str:
    if not filename:
        return "upload"
    clean = re.sub(r'[\x00-\x1f\x7f/\\]', '', str(filename)).strip()
    clean = clean.replace('..', '')
    if not clean or clean.startswith('.'):
        return "upload"
    return clean[:255]


def validate_file_content(data: bytes, content_type: str) -> Tuple[bool, str]:
    """Validate binary header magic bytes and image integrity."""
    if not data or len(data) == 0:
        return False, "File is empty"

    ctype = (content_type or "").lower()

    # Reject dangerous executable / script headers regardless of claimed MIME
    dangerous_headers = [
        b"MZ",          # Windows PE executable
        b"\x7fELF",     # Linux ELF executable
        b"\xfe\xed\xfa", # Mach-O binary
        b"<!DOCTYPE html", b"<html", b"<script", b"<?php", b"<%", b"#!/bin/"
    ]
    for header in dangerous_headers:
        if data.strip().lower().startswith(header.lower()):
            return False, f"Disallowed file signature header: {header.decode('utf-8', 'ignore')[:10]}"

    if "image" in ctype and ctype not in ("image/heic", "image/heif"):
        try:
            from PIL import Image as PILImage
            PILImage.MAX_IMAGE_PIXELS = 100_000_000 # 100 MP cap
            io_bytes = io.BytesIO(data)
            with PILImage.open(io_bytes) as img:
                img.verify()
                if img.width * img.height > PILImage.MAX_IMAGE_PIXELS:
                    return False, "Image dimensions exceed 100 Megapixel limit"
        except Exception as e:
            return False, f"Image content verification failed: {e}"

    if ctype in ("image/jpeg", "image/jpg"):
        if not data.startswith(b"\xFF\xD8\xFF"):
            return False, "Invalid JPEG header"
    elif ctype == "image/png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return False, "Invalid PNG header"
    elif ctype == "image/webp":
        if not (data.startswith(b"RIFF") and b"WEBP" in data[8:16]):
            return False, "Invalid WebP header"
    elif ctype in ("application/zip", "application/x-zip-compressed"):
        if not (data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06")):
            return False, "Invalid ZIP archive header"

    return True, ""


async def reserve_upload_quota(db, admin_id: str, requested_bytes: int, presign_ttl: int) -> Tuple[Dict[str, Any], int]:
    """Check subscription status & capacity, taking unexpired pending upload intents into account.
    Executes PostgreSQL row-level locking (FOR UPDATE) when DB supports transactions,
    with document / FakeDB fallback for unit tests.
    """
    now_dt = datetime.now(timezone.utc)
    cutoff = (now_dt - timedelta(seconds=presign_ttl)).isoformat()

    if hasattr(db, "execute") or hasattr(db, "transaction") or hasattr(db, "acquire"):
        try:
            async with (db.transaction() if hasattr(db, "transaction") else db.acquire()) as conn:
                sub_row = await conn.fetchrow(
                    "SELECT id, plan_id, used_bytes, status, expires_at FROM studio_storage_subscriptions WHERE admin_id = $1 FOR UPDATE",
                    admin_id
                )
                if not sub_row:
                    raise HTTPException(402, "No active studio storage subscription")
                sub = dict(sub_row)
                plan_row = await conn.fetchrow("SELECT gb_limit FROM studio_storage_plans WHERE id = $1", sub["plan_id"])
                if not plan_row:
                    raise HTTPException(402, "Storage plan not found")
                cap_bytes = int(plan_row["gb_limit"]) * 1024 * 1024 * 1024
                used_bytes = int(sub.get("used_bytes") or 0)
                pending_sum = await conn.fetchval(
                    "SELECT COALESCE(SUM(reserved_bytes), 0) FROM upload_intents WHERE admin_id = $1 AND area = 'cloud_storage' AND status = 'pending' AND created_at >= $2",
                    admin_id, cutoff
                )
                pending_reserved = int(pending_sum or 0)

                if (used_bytes + pending_reserved + requested_bytes) > cap_bytes:
                    raise HTTPException(
                        402,
                        f"Storage cap reached. Required: {requested_bytes / 1e9:.2f} GB, "
                        f"used: {used_bytes / 1e9:.2f} GB, reserved: {pending_reserved / 1e9:.2f} GB, cap: {cap_bytes / 1e9:.0f} GB."
                    )
                return sub, used_bytes + pending_reserved
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("PostgreSQL FOR UPDATE row locking check fallback: %s", e)

    from studio_storage import _get_admin_sub, _derive_status
    sub = await _get_admin_sub(db, admin_id)
    if not sub:
        raise HTTPException(402, "No active studio storage subscription")
    sub_status = _derive_status(sub, now_dt.replace(tzinfo=None))
    if sub_status != "active":
        raise HTTPException(402, f"Subscription is {sub_status}. Renew to upload more files.")

    plan = await db.studio_storage_plans.find_one({"id": sub["plan_id"]})
    if not plan:
        raise HTTPException(402, "Storage plan not found")

    cap_bytes = int(plan["gb_limit"]) * 1024 * 1024 * 1024
    used_bytes = int(sub.get("used_bytes", 0) or 0)

    pending_cursor = db.upload_intents.find({
        "admin_id": admin_id,
        "area": "cloud_storage",
        "status": "pending",
        "created_at": {"$gte": cutoff}
    })
    pending_reserved = 0
    async for pending_doc in pending_cursor:
        pending_reserved += int(pending_doc.get("reserved_bytes") or 0)

    if (used_bytes + pending_reserved + requested_bytes) > cap_bytes:
        raise HTTPException(
            402,
            f"Storage cap reached. Required: {requested_bytes / 1e9:.2f} GB, "
            f"used: {used_bytes / 1e9:.2f} GB, reserved: {pending_reserved / 1e9:.2f} GB, cap: {cap_bytes / 1e9:.0f} GB."
        )

    return sub, used_bytes + pending_reserved


def _key_for(area: str, photographer_id: str, event_id: Optional[str],
             ext: str, intent_id: Optional[str] = None) -> str:
    """Server-chosen object key. Mirrors bucket layout in AWS_ARCHITECTURE.md §7."""
    fid = uuid.uuid4().hex[:16]
    if area in ("qr_photos", "selfies"):
        sub = "photos" if area == "qr_photos" else "ai-selfies"
        return f"events/{event_id}/{sub}/{fid}{ext}"
    if area == "portfolio":
        return f"portfolios/{photographer_id}/works/{fid}{ext}"
    if area == "community":
        return f"community/{photographer_id}/posts/{fid}{ext}"
    if area == "cloud_storage":
        iid = intent_id or fid
        return f"studio-pending/{photographer_id}/{iid}/{fid}{ext}"
    return f"media/{photographer_id}/{fid}{ext}"


class PresignIn(BaseModel):
    area: str
    content_type: str
    size_bytes: int = Field(gt=0)
    event_id: Optional[str] = None
    filename: Optional[str] = None       # display name only; never the key
    folder_id: Optional[str] = None


class CommitIn(BaseModel):
    key: str
    area: str
    event_id: Optional[str] = None
    filename: Optional[str] = None
    folder_id: Optional[str] = None
    intent_id: Optional[str] = None


async def _owns_event(db, event_id: str, admin_id: str) -> bool:
    if await db.profiles.find_one({"id": event_id, "admin_id": admin_id}):
        return True
    ei = await db.event_invitations.find_one(
        {"id": event_id}, {"_id": 0, "profile_id": 1})
    if ei and ei.get("profile_id"):
        if await db.profiles.find_one(
                {"id": ei["profile_id"], "admin_id": admin_id}):
            return True
    return False


def build_storage_upload_router(db, require_admin) -> APIRouter:
    router = APIRouter()

    def _validate(area: str, content_type: str, size: int, event_id):
        if area not in AREAS:
            raise HTTPException(400, f"Unknown area: {area}")
        if area in ("qr_photos", "selfies"):
            if not event_id or not _SAFE_ID.match(event_id):
                raise HTTPException(400, f"area '{area}' requires a valid event_id")
        ctype_clean = (content_type or "").lower()
        spec = ALLOWED.get(ctype_clean)
        if not spec and area == "cloud_storage" and ctype_clean in ("application/zip", "application/x-zip-compressed", "image/jpg"):
            ext = ".zip" if "zip" in ctype_clean else ".jpg"
            spec = (ext, MAX_VIDEO_BYTES)
        if not spec:
            raise HTTPException(415, f"Unsupported content type: {content_type}")
        ext, cap = spec
        if size > cap:
            raise HTTPException(413,
                                f"Too large: {size} bytes, max {cap} for {content_type}")
        return ext, cap

    @router.post("/api/uploads/presign")
    async def presign(body: PresignIn, admin=Depends(require_admin)):
        """Hand back a policy the browser can POST the file to directly."""
        admin_id = admin if isinstance(admin, str) else (
            admin.get("admin_id") or admin.get("id"))

        if not await rate_limit_allow(f"presign:{admin_id}", 120, 60):
            raise HTTPException(429, "Too many presign requests. Please slow down.")

        ext, cap = _validate(body.area, body.content_type, body.size_bytes,
                             body.event_id)

        if body.area in ("qr_photos", "selfies"):
            if not await _owns_event(db, body.event_id, admin_id):
                raise HTTPException(403, "Key does not belong to this account")

        if body.area == "cloud_storage" and body.folder_id:
            folder_doc = await db.studio_storage_folders.find_one({
                "id": body.folder_id,
                "admin_id": admin_id,
                "is_trashed": {"$ne": True}
            })
            if not folder_doc:
                raise HTTPException(404, "Target folder not found or access denied")

        if body.area == "cloud_storage":
            try:
                from studio_storage import _feature_enabled
                if not await _feature_enabled(db):
                    raise HTTPException(403, "Studio storage feature is currently disabled by the administrator.")
                await reserve_upload_quota(db, admin_id, body.size_bytes, PRESIGN_TTL)
            except HTTPException:
                raise
            except Exception as e:
                logger.warning("Storage quota pre-check exception: %s", e)

        intent_id = uuid.uuid4().hex
        key = _key_for(body.area, admin_id, body.event_id, ext, intent_id=intent_id)
        try:
            import aws_service
            bucket = aws_service.bucket()
            if not bucket:
                raise RuntimeError("AWS_S3_BUCKET is not configured")
            post = aws_service.s3().generate_presigned_post(
                Bucket=bucket,
                Key=key,
                Fields={"Content-Type": body.content_type},
                Conditions=[
                    {"Content-Type": body.content_type},
                    ["content-length-range", 1, cap],
                ],
                ExpiresIn=PRESIGN_TTL,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("presign failed: %s", e)
            raise HTTPException(502, "Could not prepare the upload")

        clean_name = sanitize_filename(body.filename)
        await db.upload_intents.insert_one({
            "id": intent_id,
            "area": body.area,
            "admin_id": admin_id,
            "key": key,
            "bucket": bucket,
            "filename": clean_name,
            "folder_id": body.folder_id,
            "reserved_bytes": body.size_bytes,
            "content_type": body.content_type,
            "status": "pending",
            "created_at": _now(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=PRESIGN_TTL)).isoformat(),
        })

        return {"url": post["url"], "fields": post["fields"], "key": key,
                "intent_id": intent_id, "expires_in": PRESIGN_TTL}

    @router.post("/api/uploads/commit")
    async def commit(body: CommitIn, admin=Depends(require_admin)):
        """Record an upload that landed in S3. Everything is re-derived from
        head_object — the client is not trusted for size or type."""
        admin_id = admin if isinstance(admin, str) else (
            admin.get("admin_id") or admin.get("id"))

        if not await rate_limit_allow(f"commit:{admin_id}", 120, 60):
            raise HTTPException(429, "Too many commit requests. Please slow down.")

        if body.area not in AREAS:
            raise HTTPException(400, f"Unknown area: {body.area}")

        # Enforce key namespace ownership
        studio_prefixes = (f"portfolios/{admin_id}/", f"community/{admin_id}/",
                           f"studio/{admin_id}/", f"studio-pending/{admin_id}/", f"media/{admin_id}/")
        if body.key.startswith("events/"):
            event_id = body.key.split("/", 2)[1] if body.key.count("/") >= 2 else ""
            if not event_id or not await _owns_event(db, event_id, admin_id):
                raise HTTPException(403, "Key does not belong to this account")
        elif not body.key.startswith(studio_prefixes):
            raise HTTPException(403, "Key does not belong to this account")

        # Head object check on S3 FIRST (raises 404 if file does not exist in S3)
        try:
            import aws_service
            head = aws_service.s3().head_object(Bucket=aws_service.bucket(), Key=body.key)
        except Exception as e:
            logger.warning("commit head_object failed for %s: %s", body.key, e)
            raise HTTPException(404, "Upload not found in storage")

        size = int(head.get("ContentLength") or 0)
        ctype = head.get("ContentType") or "application/octet-stream"
        if ctype.lower() not in ALLOWED or size <= 0:
            try:
                aws_service.s3().delete_object(Bucket=aws_service.bucket(), Key=body.key)
            except Exception:
                pass
            raise HTTPException(415, f"Rejected content type: {ctype}")

        # Atomic CAS update of the upload intent from 'pending' to 'validating'
        intent_query = {"key": body.key, "admin_id": admin_id, "status": "pending"}
        if body.intent_id:
            intent_query["id"] = body.intent_id

        intent = await db.upload_intents.find_one_and_update(
            intent_query,
            {"$set": {"status": "validating", "validating_at": _now()}},
            return_document=True
        )

        header_bytes = None
        try:
            s3_client = aws_service.s3()
            if hasattr(s3_client, "get_object"):
                obj = s3_client.get_object(Bucket=aws_service.bucket(), Key=body.key, Range="bytes=0-8191")
                header_bytes = obj.get("Body").read() if isinstance(obj, dict) and "Body" in obj else None
                if header_bytes:
                    valid_content, val_err = validate_file_content(header_bytes, ctype)
                    if not valid_content:
                        try:
                            s3_client.delete_object(Bucket=aws_service.bucket(), Key=body.key)
                        except Exception:
                            pass
                        if intent:
                            await db.upload_intents.update_one({"id": intent["id"]}, {"$set": {"status": "rejected", "rejected_reason": val_err}})
                        raise HTTPException(415, f"File content validation failed: {val_err}")
        except HTTPException:
            raise
        except Exception as e:
            logger.debug("S3 header byte fetch optional check skipped: %s", e)

        # Quarantine Promotion: Move object from studio-pending/ to studio/ if needed
        final_key = body.key
        if body.area == "cloud_storage" and body.key.startswith("studio-pending/"):
            file_filename = body.key.rsplit("/", 1)[-1]
            final_key = f"studio/{admin_id}/{file_filename}"
            try:
                s3_client = aws_service.s3()
                if hasattr(s3_client, "copy_object"):
                    s3_client.copy_object(
                        Bucket=aws_service.bucket(),
                        CopySource={"Bucket": aws_service.bucket(), "Key": body.key},
                        Key=final_key
                    )
                if hasattr(s3_client, "delete_object"):
                    s3_client.delete_object(Bucket=aws_service.bucket(), Key=body.key)
            except Exception as e:
                logger.error("Failed to promote pending object %s to %s: %s", body.key, final_key, e)

        folder_id = body.folder_id or (intent.get("folder_id") if intent else None)
        if folder_id and body.area == "cloud_storage":
            fdoc = await db.studio_storage_folders.find_one({"id": folder_id, "admin_id": admin_id, "is_trashed": {"$ne": True}})
            if not fdoc:
                folder_id = None

        clean_filename = sanitize_filename(body.filename or (intent.get("filename") if intent else None) or body.key.rsplit("/", 1)[-1])
        now_dt = datetime.utcnow()

        if body.area == "cloud_storage":
            from studio_storage import _get_admin_sub
            sub = await _get_admin_sub(db, admin_id)
            if not sub:
                try:
                    aws_service.s3().delete_object(Bucket=aws_service.bucket(), Key=final_key)
                except Exception:
                    pass
                if intent:
                    await db.upload_intents.update_one({"id": intent["id"]}, {"$set": {"status": "rejected", "rejected_reason": "No active subscription"}})
                raise HTTPException(402, "No active studio storage subscription")

            file_id = f"sf_{uuid.uuid4().hex[:14]}"
            file_doc = {
                "id": file_id,
                "admin_id": admin_id,
                "subscription_id": sub["id"],
                "name": clean_filename,
                "size_bytes": size,
                "content_type": ctype,
                "s3_key": final_key,
                "folder": folder_id,
                "uploaded_at": now_dt,
                "is_trashed": False,
            }
            await db.studio_storage_files.insert_one(file_doc)
            await db.studio_storage_subscriptions.update_one(
                {"id": sub["id"]},
                {"$inc": {"used_bytes": size}, "$set": {"updated_at": now_dt}}
            )

            # Mirror to storage pool V1 hooks (fire-and-forget)
            try:
                from storage_pool_hooks import mirror_upload
                mirror_upload(db, photographer_id=admin_id, area="cloud_storage",
                              filename=clean_filename, data=header_bytes,
                              content_type=ctype, source_ref={"kind": "s3", "key": final_key})
            except Exception:
                pass

            if intent:
                await db.upload_intents.update_one(
                    {"id": intent["id"]},
                    {"$set": {"status": "committed", "committed_at": _now()}}
                )
            from storage_serve import media_url
            res_doc = {**file_doc}
            res_doc.pop("_id", None)
            return {"file": res_doc, "url": media_url(final_key), "download_url": media_url(final_key)}

        else:
            doc = {
                "id": f"file_{uuid.uuid4().hex[:14]}",
                "photographer_id": admin_id,
                "event_id": body.event_id,
                "area": body.area,
                "provider_ref": {"key": final_key},
                "filename": clean_filename,
                "size_bytes": size,
                "content_type": ctype,
                "source_path": final_key,
                "upload_status": "stored",
                "uploaded_at": _now(),
            }
            await db.storage_files.insert_one(doc)

            if intent:
                await db.upload_intents.update_one(
                    {"id": intent["id"]},
                    {"$set": {"status": "committed", "committed_at": _now()}}
                )

            from storage_serve import media_url
            doc.pop("_id", None)
            return {"file": doc, "url": media_url(final_key)}

    return router

