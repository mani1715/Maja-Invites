"""
PROMPT 05 + 13 — Live Photo Gallery (WebSocket-powered) + Guest Photo Upload

Real-time photo gallery for the public invitation page:
- Photographer uploads from /admin/profile/{id}/live-gallery
- Guests upload from the floating "Share your photo" button on the invitation page
- All clients connected to /ws/gallery/{wedding_id} get instant push updates
- Photos stored on disk under /app/uploads/weddings/{wedding_id}/{folder}/
- Pillow generates 800px WebP "thumb" + 200px WebP "micro" preview
"""
from __future__ import annotations

import hashlib
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Set, List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket,
    WebSocketDisconnect, Request,
)
from fastapi.responses import FileResponse

from PIL import Image as PILImage  # already in requirements

from media_derivatives import normalize, encode
from usage_metering import record_usage


logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path("/app/uploads/weddings")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB safety cap per photo
MAX_FILES_PER_REQUEST = 40        # cap files in one multipart request


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ----------------------------------------------------------------------------
# WebSocket connection manager
# ----------------------------------------------------------------------------
class GalleryConnectionManager:
    """Keeps track of active websocket subscribers per wedding_id."""

    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, wedding_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.setdefault(wedding_id, set()).add(ws)
        logger.info("[gallery-ws] connect wedding=%s total=%d", wedding_id, len(self._connections.get(wedding_id, [])))

    async def disconnect(self, wedding_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(wedding_id)
            if conns and ws in conns:
                conns.discard(ws)
                if not conns:
                    self._connections.pop(wedding_id, None)
        logger.info("[gallery-ws] disconnect wedding=%s", wedding_id)

    async def broadcast(self, wedding_id: str, payload: dict) -> None:
        async with self._lock:
            conns = list(self._connections.get(wedding_id, []))
        if not conns:
            return
        dead: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                live = self._connections.get(wedding_id, set())
                for d in dead:
                    live.discard(d)


manager = GalleryConnectionManager()


# ----------------------------------------------------------------------------
# Image processing
# ----------------------------------------------------------------------------
def _save_image_with_thumbs(raw: bytes, dest_dir: Path, base_name: str) -> dict:
    """Saves original + 800px thumb + 200px micro thumb. Returns metadata.

    Built on media_derivatives.normalize/encode (shared decode + EXIF-transpose +
    RGB-flatten + re-encode). The 800/200 thumbs use PIL's own bounding-box
    .thumbnail() (both dims capped, not just width) before handing off to
    encode() for the quality/format write - that's what the original inline
    implementation did, and portrait photos would come out a different size
    if we resized by width alone (encode()'s own resize rule).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = ".jpg"  # we always save originals as jpg-compatible for browser support

    rgb_img = normalize(raw)
    width, height = rgb_img.size

    # Save original (re-encode as high-quality JPEG, no resize)
    orig_path = dest_dir / f"{base_name}{ext}"
    orig_path.write_bytes(encode(rgb_img, width=None, fmt="JPEG", quality=88))

    # 800px WebP thumb (preserve aspect ratio, bounding box on both dims)
    thumb_img = rgb_img.copy()
    thumb_img.thumbnail((800, 800), PILImage.LANCZOS)
    thumb_path = dest_dir / f"thumb_{base_name}.webp"
    thumb_path.write_bytes(encode(thumb_img, width=None, fmt="WEBP", quality=82))

    # 200px micro thumb
    micro_img = rgb_img.copy()
    micro_img.thumbnail((200, 200), PILImage.LANCZOS)
    micro_path = dest_dir / f"micro_{base_name}.webp"
    micro_path.write_bytes(encode(micro_img, width=None, fmt="WEBP", quality=70))

    return {
        "width": width,
        "height": height,
        "file_size": len(raw),
        "orig_filename": orig_path.name,
        "thumb_filename": thumb_path.name,
        "micro_filename": micro_path.name,
    }


async def _find_duplicate(db, wedding_id: str, checksum: str) -> Optional[dict]:
    """Sha256-based idempotent re-upload guard, scoped per wedding profile."""
    return await db.live_gallery_photos.find_one(
        {"profile_id": wedding_id, "checksum": checksum}, {"_id": 0})


def _build_urls(wedding_id: str, folder: str, meta: dict) -> dict:
    base = f"/api/uploads/weddings/{wedding_id}/{folder}"
    return {
        "url": f"{base}/{meta['orig_filename']}",
        "thumb_url": f"{base}/{meta['thumb_filename']}",
        "micro_url": f"{base}/{meta['micro_filename']}",
    }


# ----------------------------------------------------------------------------
# Router builder
# ----------------------------------------------------------------------------
def build_live_gallery_router(db, require_admin, get_current_user=None) -> APIRouter:
    router = APIRouter(tags=["live-gallery"])

    # ---- Helpers -----------------------------------------------------------
    async def _get_profile_owned(profile_id: str, admin_data: dict) -> dict:
        p = await db.profiles.find_one({"$or": [{"id": profile_id}, {"slug": profile_id}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Profile not found")
        admin_id = admin_data.get("admin_id") or admin_data.get("id")
        if admin_data.get("role") not in ("super_admin", "superadmin") and p.get("admin_id") and p.get("admin_id") != admin_id:
            raise HTTPException(403, "Not your wedding")
        return p

    async def _get_profile_owned_by_user(profile_id: str, user_data: dict) -> dict:
        """User-facing variant: profile must belong to the calling end user.
        Used by host-side live photo management for non-admin users."""
        p = await db.profiles.find_one({"$or": [{"id": profile_id}, {"slug": profile_id}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Profile not found")
        uid = user_data.get("user_id") or user_data.get("id")
        if not uid or p.get("user_id") != uid:
            raise HTTPException(403, "Not your invitation")
        return p

    async def _get_profile_by_slug(slug: str) -> dict:
        p = await db.profiles.find_one({"$or": [{"id": slug}, {"slug": slug}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Wedding not found")
        return p

    def _strip(d: dict) -> dict:
        d.pop("_id", None)
        return d

    # ---- WebSocket endpoint ------------------------------------------------
    @router.websocket("/api/ws/gallery/{wedding_id}")
    async def gallery_ws(websocket: WebSocket, wedding_id: str, token: Optional[str] = None):
        # Resolve slug → real profile_id
        profile = await db.profiles.find_one({"$or": [{"id": wedding_id}, {"slug": wedding_id}]}, {"_id": 0})
        resolved_id = profile["id"] if profile else wedding_id

        # Password-protected galleries (gallery_privacy) require the same
        # trusted-device JWT the REST endpoints check — otherwise anyone can
        # subscribe to a private wedding's live push without ever unlocking it.
        if profile:
            privacy = profile.get("gallery_privacy") or {}
            if privacy.get("enabled") and privacy.get("password_hash"):
                from gallery_privacy import verify_device_token
                if not verify_device_token(profile, token or ""):
                    await websocket.close(code=4401)
                    return

        await manager.connect(resolved_id, websocket)
        try:
            # Send initial "connected" ping
            await websocket.send_json({"type": "connected", "wedding_id": resolved_id})
            while True:
                # We don't expect inbound messages, but keep the socket alive
                try:
                    await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                except asyncio.TimeoutError:
                    # Send heartbeat
                    try:
                        await websocket.send_json({"type": "ping", "ts": _now_iso()})
                    except Exception:
                        break
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning("[gallery-ws] error: %s", e)
        finally:
            await manager.disconnect(resolved_id, websocket)

    # ---- ADMIN: photographer upload ---------------------------------------
    @router.post("/api/admin/profiles/{profile_id}/live-gallery/upload")
    async def photographer_upload(
        profile_id: str,
        files: List[UploadFile] = File(...),
        store_to_storage: bool = Form(False),
        storage_folder: Optional[str] = Form(None),
        admin_data: dict = Depends(require_admin),
    ):
        profile = await _get_profile_owned(profile_id, admin_data)
        wedding_id = profile["id"]
        admin_id = admin_data.get("admin_id") or admin_data.get("id")
        folder = "gallery"
        dest_dir = UPLOAD_ROOT / wedding_id / folder

        # Storage opt-in (owner spec): photographer chooses whether QR-gallery
        # photos are also saved into their paid studio storage. Check capacity
        # up front so we can give a clear message instead of silently skipping.
        from studio_storage import auto_archive_to_studio_storage, storage_capacity_status
        stor = await storage_capacity_status(db, admin_id) if store_to_storage else None
        storage_stored = 0
        storage_running_used = (stor or {}).get("used_bytes", 0)
        storage_cap = (stor or {}).get("cap_bytes", 0)

        if len(files) > MAX_FILES_PER_REQUEST:
            raise HTTPException(400, f"Too many files in one request (max {MAX_FILES_PER_REQUEST}).")
        results = []
        for upload in files:
            try:
                raw = await upload.read()
                if not raw:
                    continue
                if len(raw) > MAX_FILE_SIZE:
                    continue
                checksum = hashlib.sha256(raw).hexdigest()
                existing = await _find_duplicate(db, wedding_id, checksum)
                if existing:
                    results.append(existing)
                    continue
                base = uuid.uuid4().hex
                meta = _save_image_with_thumbs(raw, dest_dir, base)
                urls = _build_urls(wedding_id, folder, meta)
                # Copy into the studio's PAID storage only when the photographer
                # opted in AND has an active plan with room left. Enforces the
                # plan quota: once the cap is reached, stop storing (QR upload
                # still succeeds).
                if store_to_storage and stor and stor.get("active"):
                    if storage_running_used + len(raw) <= storage_cap:
                        try:
                            archived = await auto_archive_to_studio_storage(
                                db, admin_id, upload.filename or f"{base}.jpg",
                                upload.content_type or "image/jpeg", raw,
                                folder=storage_folder,
                            )
                            if archived:
                                storage_stored += 1
                                storage_running_used += len(raw)
                        except Exception as _e:
                            logger.warning("[gallery] studio-storage archive failed: %s", _e)
                doc = {
                    "id": uuid.uuid4().hex,
                    "profile_id": wedding_id,
                    "wedding_id": wedding_id,
                    "source": "photographer",
                    "guest_name": None,
                    "caption": None,
                    "width": meta["width"],
                    "height": meta["height"],
                    "file_size": meta["file_size"],
                    "checksum": checksum,
                    "created_at": _now_iso(),
                    **urls,
                }
                # usage-metering: photo_uploaded hook point
                await db.live_gallery_photos.insert_one(doc)
                await record_usage("live_photo_uploaded", wedding_id)
                _strip(doc)
                results.append(doc)
                await manager.broadcast(wedding_id, {"type": "photo_added", "photo": doc})
            except Exception as e:
                logger.exception("[gallery] upload failed: %s", e)
                continue

        # #10 — Auto-archive newly uploaded photos to the studio's connected
        # storage (Google Drive) so photographers never have to re-upload the
        # same shots later. No-op if the studio hasn't connected; best-effort
        # and non-blocking so the upload response returns immediately.
        if results:
            try:
                from drive_archive import enqueue_archive as _drive_enqueue
                await _drive_enqueue(db, wedding_id)
            except Exception as _e:
                logger.warning("[gallery] drive-archive enqueue failed for %s: %s", wedding_id, _e)

        # Storage outcome message for the photographer.
        storage = None
        if store_to_storage:
            if not stor or not stor.get("has_plan"):
                storage = {"requested": True, "plan_active": False, "stored": 0,
                           "message": "No storage plan yet — buy a storage plan to save these photos to your studio storage."}
            elif not stor.get("active"):
                storage = {"requested": True, "plan_active": False, "stored": 0,
                           "message": "Your storage plan is not active. Renew it to save photos to storage."}
            elif storage_stored < len(results):
                storage = {"requested": True, "plan_active": True, "stored": storage_stored,
                           "message": f"Saved {storage_stored} of {len(results)} to storage — plan is full. Upgrade for more space."}
            else:
                storage = {"requested": True, "plan_active": True, "stored": storage_stored,
                           "message": f"Saved {storage_stored} photo(s) to your studio storage."}

        return {"uploaded": len(results), "photos": results, "storage": storage}

    # ---- PUBLIC: guest upload (auto-publish) ------------------------------
    @router.post("/api/invite/{slug}/gallery/guest-upload")
    async def guest_upload(
        slug: str,
        request: Request,
        file: UploadFile = File(...),
        guest_name: str = Form(...),
        caption: Optional[str] = Form(None),
    ):
        # PUBLIC + UNAUTHENTICATED write = prime abuse surface. Throttle per
        # source IP (stops one script flooding our disk) and per gallery (stops a
        # single couple's gallery being spammed) before doing any work. Generous
        # enough that a table of wedding guests uploading at once is unaffected.
        from cache_backend import rate_limit_allow
        _ip = (request.client.host if request and request.client else "unknown")
        if not await rate_limit_allow(f"guestup:ip:{_ip}", limit=40, window_seconds=600):
            raise HTTPException(429, "Too many uploads from this device. Please wait a few minutes and try again.")
        if not await rate_limit_allow(f"guestup:slug:{slug}", limit=400, window_seconds=600):
            raise HTTPException(429, "This gallery is receiving a lot of uploads right now — please try again shortly.")
        profile = await _get_profile_by_slug(slug)
        wedding_id = profile["id"]

        guest_name = (guest_name or "Guest").strip()[:60]
        caption_clean = (caption or "").strip()[:200] if caption else None

        raw = await file.read()
        # PHOTOS ONLY. This endpoint is public and unauthenticated, and used to
        # validate nothing but emptiness and size — so any guest could push a
        # video, a PDF or an executable onto our disk. Decide from the bytes;
        # `accept="image/*"` and `content_type` are both client-side claims.
        from photo_guard import assert_photo, NotAPhoto
        try:
            assert_photo(raw, file.filename or "", file.content_type or "",
                         max_bytes=MAX_FILE_SIZE)
        except NotAPhoto as e:
            raise HTTPException(415, str(e))

        checksum = hashlib.sha256(raw).hexdigest()
        existing = await _find_duplicate(db, wedding_id, checksum)
        if existing:
            return {"success": True, "photo": existing}

        folder = "guest_uploads"
        dest_dir = UPLOAD_ROOT / wedding_id / folder
        base = uuid.uuid4().hex
        try:
            meta = _save_image_with_thumbs(raw, dest_dir, base)
        except Exception as e:
            logger.exception("[gallery] guest upload failed: %s", e)
            raise HTTPException(400, "Could not process image")

        urls = _build_urls(wedding_id, folder, meta)
        doc = {
            "id": uuid.uuid4().hex,
            "profile_id": wedding_id,
            "wedding_id": wedding_id,
            "source": "guest",
            "guest_name": guest_name,
            "caption": caption_clean,
            "width": meta["width"],
            "height": meta["height"],
            "file_size": meta["file_size"],
            "checksum": checksum,
            "created_at": _now_iso(),
            **urls,
        }
        # usage-metering: photo_uploaded hook point
        await db.live_gallery_photos.insert_one(doc)
        await record_usage("live_photo_uploaded", wedding_id)
        _strip(doc)
        await manager.broadcast(wedding_id, {"type": "photo_added", "photo": doc})

        # Storage pool (V1 multi-drive): archive the ORIGINAL bytes into
        # .../Events/<Event>/QR_Photos. Fire-and-forget + flag-gated — the
        # guest's upload response never waits on (or fails because of) Drive.
        try:
            from storage_pool_hooks import mirror_upload
            _ev = f"{profile.get('bride_name') or ''}-{profile.get('groom_name') or ''}-" \
                  f"{str(profile.get('event_date') or '')[:10]}".strip("-").replace("/", "-")
            mirror_upload(
                db,
                photographer_id=profile.get("admin_id") or "",
                area="qr_photos",
                filename=file.filename or f"{doc['id']}.jpg",
                data=raw,
                content_type=file.content_type or "image/jpeg",
                event_id=wedding_id,
                event_name=_ev or wedding_id,
                source_ref={"kind": "disk", "path": str(dest_dir / f"{base}.jpg")},
            )
        except Exception:
            pass
        return {"success": True, "photo": doc}

    # ---- PUBLIC: list photos ----------------------------------------------
    @router.get("/api/public/gallery/{slug}/photos")
    async def list_photos(slug: str, request: Request, limit: int = 200, since: Optional[str] = None):
        profile = await _get_profile_by_slug(slug)
        # PIN gate: this endpoint lists the full event wall, so it must honour the
        # same gallery-privacy device-token check the primary wall feed uses
        # (premium_features.get_live_gallery). enforce_gallery_access no-ops for
        # unprotected galleries, so nothing changes for those.
        from gallery_privacy import enforce_gallery_access
        await enforce_gallery_access(profile, request)
        wedding_id = profile["id"]
        query: dict = {"wedding_id": wedding_id}
        if since:
            query["created_at"] = {"$gt": since}
        cursor = db.live_gallery_photos.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 500))
        photos = await cursor.to_list(limit)
        # Total count + storage
        total = await db.live_gallery_photos.count_documents({"wedding_id": wedding_id})
        return {"photos": photos, "total": total}

    # ---- ADMIN: list photos for management page ---------------------------
    @router.get("/api/admin/profiles/{profile_id}/live-gallery/photos")
    async def admin_list_photos(profile_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        wedding_id = profile["id"]
        cursor = db.live_gallery_photos.find({"wedding_id": wedding_id}, {"_id": 0}).sort("created_at", -1).limit(1000)
        photos = await cursor.to_list(1000)
        total_bytes = sum((p.get("file_size") or 0) for p in photos)
        return {
            "photos": photos,
            "total": len(photos),
            "storage_bytes": total_bytes,
            "photographer_count": sum(1 for p in photos if p.get("source") == "photographer"),
            "guest_count": sum(1 for p in photos if p.get("source") == "guest"),
        }

    # ---- ADMIN: delete a photo --------------------------------------------
    @router.delete("/api/admin/profiles/{profile_id}/live-gallery/{photo_id}")
    async def delete_photo(profile_id: str, photo_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        wedding_id = profile["id"]
        photo = await db.live_gallery_photos.find_one({"id": photo_id, "wedding_id": wedding_id}, {"_id": 0})
        if not photo:
            raise HTTPException(404, "Photo not found")
        # Remove files
        for url_key in ("url", "thumb_url", "micro_url"):
            try:
                rel = (photo.get(url_key) or "").split("/api/uploads/", 1)[-1]
                full = Path("/app/uploads") / rel
                if full.exists():
                    full.unlink()
            except Exception:
                pass
        await db.live_gallery_photos.delete_one({"id": photo_id})
        await manager.broadcast(wedding_id, {"type": "photo_deleted", "photo_id": photo_id})
        return {"success": True}

    # ---- PUBLIC: file serving (StaticFiles equivalent) --------------------
    @router.get("/api/uploads/weddings/{wedding_id}/{folder}/{filename}")
    async def serve_upload(wedding_id: str, folder: str, filename: str):
        if folder not in ("gallery", "guest_uploads"):
            raise HTTPException(404, "Not found")
        # Prevent path traversal
        if "/" in filename or ".." in filename:
            raise HTTPException(400, "Invalid filename")
        path = UPLOAD_ROOT / wedding_id / folder / filename
        if not path.exists():
            raise HTTPException(404, "File not found")
        media_type = "image/webp" if filename.endswith(".webp") else "image/jpeg"
        return FileResponse(path, media_type=media_type)

    # ---- USER (host): same-as-admin endpoints, but auth'd by user JWT and
    #      scoped to invitations owned by the calling user. This lets a
    #      regular logged-in host upload / list / delete live photos for
    #      their own invitations from the user dashboard.
    if get_current_user is not None:
        from fastapi import Depends as _Dep

        @router.post("/api/users/profiles/{profile_id}/live-gallery/upload")
        async def user_upload_live(
            profile_id: str,
            files: List[UploadFile] = File(...),
            user_data: dict = _Dep(get_current_user),
        ):
            profile = await _get_profile_owned_by_user(profile_id, user_data)
            wedding_id = profile["id"]
            folder = "gallery"
            dest_dir = UPLOAD_ROOT / wedding_id / folder

            if len(files) > MAX_FILES_PER_REQUEST:
                raise HTTPException(400, f"Too many files in one request (max {MAX_FILES_PER_REQUEST}).")
            results = []
            for upload in files:
                try:
                    raw = await upload.read()
                    if not raw:
                        continue
                    if len(raw) > MAX_FILE_SIZE:
                        continue
                    checksum = hashlib.sha256(raw).hexdigest()
                    existing = await _find_duplicate(db, wedding_id, checksum)
                    if existing:
                        results.append(existing)
                        continue
                    base = uuid.uuid4().hex
                    meta = _save_image_with_thumbs(raw, dest_dir, base)
                    urls = _build_urls(wedding_id, folder, meta)
                    doc = {
                        "id": uuid.uuid4().hex,
                        "profile_id": wedding_id,
                        "wedding_id": wedding_id,
                        "source": "host",
                        "guest_name": None,
                        "caption": None,
                        "width": meta["width"],
                        "height": meta["height"],
                        "file_size": meta["file_size"],
                        "checksum": checksum,
                        "created_at": _now_iso(),
                        **urls,
                    }
                    # usage-metering: photo_uploaded hook point
                    await db.live_gallery_photos.insert_one(doc)
                    await record_usage("live_photo_uploaded", wedding_id)
                    _strip(doc)
                    results.append(doc)
                    await manager.broadcast(wedding_id, {"type": "photo_added", "photo": doc})
                except Exception as e:
                    logger.exception("[user-live-gallery] upload failed: %s", e)
                    continue

            return {"uploaded": len(results), "photos": results}

        @router.get("/api/users/profiles/{profile_id}/live-gallery/photos")
        async def user_list_live(profile_id: str, user_data: dict = _Dep(get_current_user)):
            profile = await _get_profile_owned_by_user(profile_id, user_data)
            wedding_id = profile["id"]
            cursor = db.live_gallery_photos.find({"wedding_id": wedding_id}, {"_id": 0}).sort("created_at", -1).limit(1000)
            photos = await cursor.to_list(1000)
            total_bytes = sum((p.get("file_size") or 0) for p in photos)
            return {
                "photos": photos,
                "total": len(photos),
                "storage_bytes": total_bytes,
                "host_count":     sum(1 for p in photos if p.get("source") in ("host", "photographer")),
                "guest_count":    sum(1 for p in photos if p.get("source") == "guest"),
            }

        @router.delete("/api/users/profiles/{profile_id}/live-gallery/{photo_id}")
        async def user_delete_live(profile_id: str, photo_id: str, user_data: dict = _Dep(get_current_user)):
            profile = await _get_profile_owned_by_user(profile_id, user_data)
            wedding_id = profile["id"]
            photo = await db.live_gallery_photos.find_one({"id": photo_id, "wedding_id": wedding_id}, {"_id": 0})
            if not photo:
                raise HTTPException(404, "Photo not found")
            for url_key in ("url", "thumb_url", "micro_url"):
                try:
                    rel = (photo.get(url_key) or "").split("/api/uploads/", 1)[-1]
                    full = Path("/app/uploads") / rel
                    if full.exists():
                        full.unlink()
                except Exception:
                    pass
            await db.live_gallery_photos.delete_one({"id": photo_id})
            await manager.broadcast(wedding_id, {"type": "photo_deleted", "photo_id": photo_id})
            return {"success": True}

    return router
