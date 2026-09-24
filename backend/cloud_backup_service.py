"""
cloud_backup_service.py — Photographer Cloud Backup module (Part 9).

Secure store for original client media. Folder hierarchy + files (metadata),
storage meter (quota from the active `storage` subscription), recycle bin
(soft-delete → restore / purge), backup history, recent uploads, and
duplicate detection (by content hash).

Actual bytes are uploaded via the existing upload pipeline / object store; this
module tracks the file records, folders, quota and lifecycle.

Collections (JSONB, auto-created):
  backup_folders  — folder tree (parent_id nullable)
  backup_files    — file records (folder_id, size, hash, deleted flag)
  backup_events   — backup/restore history log

Wired in server.py:
    from cloud_backup_service import build_cloud_backup_router
    app.include_router(build_cloud_backup_router(db, require_admin))
"""
# NOTE: `from __future__ import annotations` was REMOVED here on purpose.
# It turns every annotation into a string, and FastAPI resolves endpoint
# annotations against MODULE globals - so the request models this file
# defines INSIDE its router factory became unresolvable ForwardRefs,
# breaking /openapi.json AND request-body parsing for those endpoints.
# Without the future-import, function-scoped Pydantic models are fine.

import io
import os
import uuid
import hashlib
import zipfile
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger("cloud_backup")

# Storage default free allocation: 100 GB Starter plan for all studios.
DEFAULT_FREE_GB = int(os.environ.get("DEFAULT_FREE_GB", "100"))
# A cloud-backup plan (product "backup") grants backup capability but its catalog
# rows carry `features`, not necessarily a GB figure. If the admin hasn't set an
# explicit `storage_gb` on the backup plan, fall back to this configurable default
# so paying for cloud backup actually activates a usable quota.
BACKUP_DEFAULT_GB = int(os.environ.get("BACKUP_DEFAULT_GB", "100"))
# Recycle-bin retention: soft-deleted files are permanently purged after 1 day.
RECYCLE_RETENTION = timedelta(days=1)
# Per-file cap on a direct backup upload — matches studio_storage.py's own cap
# (MAX_SINGLE_UPLOAD) so the platform quotes one number for "how big a file".
MAX_UPLOAD_BYTES = 500 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


class FolderIn(BaseModel):
    name: str
    parent_id: Optional[str] = None


class FileIn(BaseModel):
    name: str
    folder_id: Optional[str] = None
    size_bytes: int = 0
    mime_type: Optional[str] = None
    url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    content_hash: Optional[str] = None   # for duplicate detection
    kind: Optional[str] = None           # image | video | raw | other


# ============================================================
#  Module-level storage helpers (shared by the router + other
#  modules that want to archive bytes into a studio's backup,
#  e.g. the live gallery "also keep a copy in storage" flow).
# ============================================================
async def _studio_quota_gb(db, studio_id: str) -> int:
    """GB quota from the studio's active `storage` OR `backup` subscription, else
    free default. Both products enable cloud backup: `storage` plans carry an
    explicit `storage_gb`; `backup` plans use their `storage_gb` if the admin set
    one, otherwise BACKUP_DEFAULT_GB — so paying for a cloud-backup plan actually
    activates a usable quota (previously only `storage` was counted, so a paid
    `backup` plan granted 0 GB and backup stayed unusable)."""
    subs = await db.subscriptions.find({"studio_id": studio_id}, {"_id": 0}).to_list(50)
    best = DEFAULT_FREE_GB
    for s in subs:
        if s.get("status") != "active":
            continue
        product = s.get("product")
        if product not in ("storage", "backup"):
            continue
        plan = await db.subscription_plans.find_one({"id": s.get("plan_id")}, {"_id": 0})
        gb = int((plan or {}).get("storage_gb") or 0)
        if gb <= 0 and product == "backup":
            gb = BACKUP_DEFAULT_GB   # backup plan with no explicit quota → default
        if gb > 0:
            best = max(best, gb)
    return best


async def _studio_used_bytes(db, studio_id: str) -> int:
    # Called once PER photo during a bulk archive, so push the sum into one SQL
    # aggregate instead of loading + re-summing the studio's whole backup set each
    # time. Falls back to the scan if the backend can't run the aggregate.
    try:
        rows = await db.backup_files.aggregate([
            {"$match": {"studio_id": studio_id, "deleted": {"$ne": True}}},
            {"$group": {"_id": None, "total": {"$sum": "$size_bytes"}}},
        ]).to_list(1)
        if rows:
            return int(rows[0].get("total") or 0)
        return 0
    except Exception:
        files = await db.backup_files.find({"studio_id": studio_id}, {"_id": 0}).to_list(100000)
        return sum(int(f.get("size_bytes", 0)) for f in files if not f.get("deleted"))


async def _get_or_create_root_folder(db, studio_id: str, name: Optional[str]) -> Optional[str]:
    """Return the id of a top-level (parent_id=None) folder named `name`, creating
    it if absent. Filters in Python to avoid null-equality quirks in the adapter."""
    if not name:
        return None
    rows = await db.backup_folders.find({"studio_id": studio_id}, {"_id": 0}).to_list(2000)
    for r in rows:
        if r.get("name") == name and not r.get("parent_id"):
            return r["id"]
    doc = {"id": f"fld_{uuid.uuid4().hex[:16]}", "studio_id": studio_id,
           "name": name, "parent_id": None, "created_at": _now()}
    await db.backup_folders.insert_one(doc)
    return doc["id"]


async def store_studio_backup_bytes(
    db, uploads_root, studio_id: str, *, data: bytes, filename: str,
    mime: str = "image/jpeg", kind: str = "image",
    folder_name: Optional[str] = None, content_hash: Optional[str] = None,
    source: str = "backup",
) -> dict:
    """Durably store `data` in a studio's Cloud Backup, disk-backed exactly like a
    manual cloud-backup upload (so it survives the live-gallery auto-delete and
    shows up in the studio's backup manager). Enforces the paid storage plan +
    quota. NEVER raises — returns a status dict so callers can degrade gracefully:
        {"ok": True,  "file_id": ...}                         # stored
        {"ok": True,  "file_id": ..., "duplicate": True}      # already had it
        {"ok": False, "reason": "no_storage_plan"|"quota_exceeded"|"error"}
    """
    try:
        if not studio_id:
            return {"ok": False, "reason": "no_studio"}
        quota_gb = await _studio_quota_gb(db, studio_id)
        if quota_gb <= 0:
            return {"ok": False, "reason": "no_storage_plan"}
        size = len(data or b"")
        if size <= 0:
            return {"ok": False, "reason": "empty"}
        used = await _studio_used_bytes(db, studio_id)
        if used + size > quota_gb * 1024 ** 3:
            return {"ok": False, "reason": "quota_exceeded"}

        content_hash = content_hash or hashlib.sha256(data).hexdigest()
        # Skip re-writing identical content we already keep for this studio.
        existing = await db.backup_files.find(
            {"studio_id": studio_id, "content_hash": content_hash}, {"_id": 0}
        ).to_list(5)
        existing = [e for e in existing if not e.get("deleted")]
        if existing:
            return {"ok": True, "file_id": existing[0]["id"], "duplicate": True}

        root = Path(uploads_root) if uploads_root else Path("/app/uploads")
        sub = root / "studio-backup" / studio_id
        sub.mkdir(parents=True, exist_ok=True)
        fid = f"bkf_{uuid.uuid4().hex[:16]}"
        disk_name = f"{fid}.jpg"
        (sub / disk_name).write_bytes(data)
        url = f"/uploads/studio-backup/{studio_id}/{disk_name}"

        folder_id = await _get_or_create_root_folder(db, studio_id, folder_name)
        doc = {
            "id": fid, "studio_id": studio_id, "name": filename or disk_name,
            "folder_id": folder_id, "size_bytes": size, "mime_type": mime,
            "url": url, "thumbnail_url": url, "content_hash": content_hash,
            "kind": kind, "deleted": False, "is_duplicate": False,
            "duplicate_of": None, "source": source, "created_at": _now(),
        }
        await db.backup_files.insert_one(doc)
        await db.backup_events.insert_one({
            "id": uuid.uuid4().hex, "studio_id": studio_id, "action": "upload",
            "file_id": fid, "name": doc["name"], "size_bytes": size, "at": _now(),
        })
        return {"ok": True, "file_id": fid}
    except Exception as e:
        logger.warning("store_studio_backup_bytes failed: %s", e)
        return {"ok": False, "reason": "error"}


def build_cloud_backup_router(db, require_admin, uploads_root=None) -> APIRouter:
    router = APIRouter(tags=["cloud-backup"])
    UPLOADS_ROOT = Path(uploads_root) if uploads_root else Path("/app/uploads")

    def _fs_path(url: Optional[str]) -> Optional[Path]:
        """Map a stored /uploads/... URL to a file on disk (None for external URLs)."""
        if not url or url.startswith("http"):
            return None
        rel = url.split("/uploads/", 1)[-1] if "/uploads/" in url else url.lstrip("/")
        p = (UPLOADS_ROOT / rel).resolve()
        try:
            p.relative_to(UPLOADS_ROOT.resolve())  # prevent path traversal
        except ValueError:
            return None
        return p if p.exists() else None

    async def _quota_gb(studio_id: str) -> int:
        """GB quota from the active storage subscription, else the free default."""
        return await _studio_quota_gb(db, studio_id)

    async def _used_bytes(studio_id: str) -> int:
        return await _studio_used_bytes(db, studio_id)

    async def _purge_expired(studio_id: str) -> int:
        """Permanently remove soft-deleted files older than the retention window."""
        cutoff = datetime.now(timezone.utc) - RECYCLE_RETENTION
        rows = await db.backup_files.find({"studio_id": studio_id}, {"_id": 0}).to_list(100000)
        purged = 0
        for r in rows:
            if not r.get("deleted"):
                continue
            deleted_at = _parse_iso(r.get("deleted_at"))
            if deleted_at and deleted_at <= cutoff:
                await db.backup_files.delete_one({"id": r["id"], "studio_id": studio_id})
                purged += 1
        return purged

    async def _require_storage_plan(studio_id: str) -> int:
        """Raise 402 if the studio has no paid storage; else return its quota GB."""
        quota_gb = await _quota_gb(studio_id)
        if quota_gb <= 0:
            raise HTTPException(402, "Buy a storage plan to unlock cloud backup.")
        return quota_gb

    # ---- storage meter -----------------------------------------------------
    @router.get("/api/cloud-backup/storage")
    async def storage(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await _purge_expired(sid)
        quota_gb = await _quota_gb(sid)
        used = await _used_bytes(sid)
        quota_bytes = quota_gb * 1024 ** 3
        return {
            "locked": quota_gb <= 0,          # no paid storage plan yet
            "has_plan": quota_gb > 0,
            "quota_gb": quota_gb,
            "quota_bytes": quota_bytes,
            "used_bytes": used,
            "used_gb": round(used / (1024 ** 3), 3),
            "remaining_bytes": max(quota_bytes - used, 0),
            "used_percent": round(min(used / quota_bytes * 100, 100), 1) if quota_bytes else 0,
            "recycle_retention_days": RECYCLE_RETENTION.days,
        }

    # ---- folders -----------------------------------------------------------
    @router.post("/api/cloud-backup/folders")
    async def create_folder(payload: FolderIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await _require_storage_plan(sid)
        doc = {"id": f"fld_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               "name": payload.name, "parent_id": payload.parent_id, "created_at": _now()}
        await db.backup_folders.insert_one(doc)
        return {"folder": doc}

    @router.get("/api/cloud-backup/folders")
    async def list_folders(admin: dict = Depends(require_admin), parent_id: Optional[str] = None):
        sid = admin["admin_id"]
        rows = await db.backup_folders.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        if parent_id is not None:
            rows = [r for r in rows if r.get("parent_id") == parent_id]
        return {"folders": rows}

    @router.delete("/api/cloud-backup/folders/{fid}")
    async def delete_folder(fid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.backup_folders.delete_one({"id": fid, "studio_id": sid})
        # soft-delete files inside
        await db.backup_files.update_many({"folder_id": fid, "studio_id": sid},
                                          {"$set": {"deleted": True, "deleted_at": _now()}})
        return {"deleted": True}

    # ---- files -------------------------------------------------------------
    @router.post("/api/cloud-backup/files")
    async def add_file(payload: FileIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        # storage is paid — must have an active plan, then enforce the quota
        quota_gb = await _require_storage_plan(sid)
        used = await _used_bytes(sid)
        if used + int(payload.size_bytes) > quota_gb * 1024 ** 3:
            raise HTTPException(413, "Storage quota exceeded. Upgrade your storage plan.")
        # duplicate detection by content hash
        duplicate = None
        if payload.content_hash:
            existing = await db.backup_files.find(
                {"studio_id": sid, "content_hash": payload.content_hash}, {"_id": 0}
            ).to_list(5)
            existing = [e for e in existing if not e.get("deleted")]
            if existing:
                duplicate = existing[0]["id"]
        doc = {"id": f"bkf_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **payload.model_dump(), "deleted": False,
               "is_duplicate": bool(duplicate), "duplicate_of": duplicate, "created_at": _now()}
        await db.backup_files.insert_one(doc)
        await db.backup_events.insert_one({
            "id": uuid.uuid4().hex, "studio_id": sid, "action": "upload",
            "file_id": doc["id"], "name": payload.name, "size_bytes": payload.size_bytes, "at": _now(),
        })
        return {"file": doc, "duplicate_of": duplicate}

    # `add_file` above is metadata-only (it records a FileIn payload whose `url`
    # must already point at stored bytes) — there was no route a browser could
    # POST raw file bytes to. This is that route: multipart, writes to disk
    # under UPLOADS_ROOT exactly like `store_studio_backup_bytes` does for the
    # internal auto-archive path, but keyed to an explicit `folder_id` (the
    # currently-open folder in the UI) rather than a folder *name*.
    @router.post("/api/cloud-backup/upload")
    async def upload_file(file: UploadFile = File(...), folder_id: Optional[str] = Form(None),
                          admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        quota_gb = await _require_storage_plan(sid)
        data = await file.read()
        size = len(data)
        if size <= 0:
            raise HTTPException(400, "That file is empty.")
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB per upload).")
        used = await _used_bytes(sid)
        if used + size > quota_gb * 1024 ** 3:
            raise HTTPException(413, "Storage quota exceeded. Upgrade your storage plan.")

        content_hash = hashlib.sha256(data).hexdigest()
        existing = await db.backup_files.find(
            {"studio_id": sid, "content_hash": content_hash}, {"_id": 0}
        ).to_list(5)
        existing = [e for e in existing if not e.get("deleted")]
        if existing:
            return {"file": existing[0], "duplicate_of": existing[0]["id"]}

        name = (file.filename or "upload").strip() or "upload"
        ext = os.path.splitext(name)[1]
        mime = file.content_type or "application/octet-stream"
        kind = "image" if mime.startswith("image/") else "video" if mime.startswith("video/") else "other"

        sub = UPLOADS_ROOT / "studio-backup" / sid
        sub.mkdir(parents=True, exist_ok=True)
        fid = f"bkf_{uuid.uuid4().hex[:16]}"
        disk_name = f"{fid}{ext}"
        (sub / disk_name).write_bytes(data)
        url = f"/uploads/studio-backup/{sid}/{disk_name}"

        doc = {"id": fid, "studio_id": sid, "name": name, "folder_id": folder_id,
               "size_bytes": size, "mime_type": mime, "url": url, "thumbnail_url": url,
               "content_hash": content_hash, "kind": kind, "deleted": False,
               "is_duplicate": False, "duplicate_of": None, "source": "upload", "created_at": _now()}
        await db.backup_files.insert_one(doc)
        await db.backup_events.insert_one({
            "id": uuid.uuid4().hex, "studio_id": sid, "action": "upload",
            "file_id": fid, "name": name, "size_bytes": size, "at": _now(),
        })
        return {"file": doc, "duplicate_of": None}

    @router.get("/api/cloud-backup/files")
    async def list_files(admin: dict = Depends(require_admin),
                         folder_id: Optional[str] = None, q: Optional[str] = None):
        sid = admin["admin_id"]
        rows = await db.backup_files.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(100000)
        rows = [r for r in rows if not r.get("deleted")]
        if folder_id is not None:
            rows = [r for r in rows if r.get("folder_id") == folder_id]
        if q:
            s = q.lower()
            rows = [r for r in rows if s in str(r.get("name", "")).lower()]
        return {"files": rows}

    # ---- downloads ---------------------------------------------------------
    @router.get("/api/cloud-backup/files/{fid}/download")
    async def download_file(fid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        f = await db.backup_files.find_one({"id": fid, "studio_id": sid}, {"_id": 0})
        if not f or f.get("deleted"):
            raise HTTPException(404, "File not found")
        p = _fs_path(f.get("url") or f.get("thumbnail_url"))
        if not p:
            raise HTTPException(404, "File bytes unavailable for download")
        return FileResponse(str(p), filename=f.get("name") or p.name,
                            media_type=f.get("mime_type") or "application/octet-stream")

    class ZipRequest(BaseModel):
        file_ids: Optional[List[str]] = None
        folder_id: Optional[str] = None

    @router.post("/api/cloud-backup/download-zip")
    async def download_zip(payload: ZipRequest, admin: dict = Depends(require_admin)):
        """Zip up selected files (file_ids) or a whole folder (folder_id)."""
        sid = admin["admin_id"]
        rows = await db.backup_files.find({"studio_id": sid}, {"_id": 0}).to_list(100000)
        rows = [r for r in rows if not r.get("deleted")]
        if payload.file_ids:
            wanted = set(payload.file_ids)
            rows = [r for r in rows if r["id"] in wanted]
        elif payload.folder_id is not None:
            rows = [r for r in rows if r.get("folder_id") == payload.folder_id]
        else:
            raise HTTPException(400, "Provide file_ids or folder_id")
        if not rows:
            raise HTTPException(404, "Nothing to download")

        buf = io.BytesIO()
        seen: dict = {}
        added = 0
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for r in rows:
                p = _fs_path(r.get("url") or r.get("thumbnail_url"))
                if not p:
                    continue
                name = r.get("name") or p.name
                if name in seen:            # de-dupe identical filenames
                    seen[name] += 1
                    stem, dot, ext = name.rpartition(".")
                    name = f"{stem}_{seen[name]}{dot}{ext}" if dot else f"{name}_{seen[name]}"
                else:
                    seen[name] = 0
                zf.write(str(p), arcname=name)
                added += 1
        if added == 0:
            raise HTTPException(404, "Selected files have no downloadable bytes")
        buf.seek(0)

        zip_name = "photos"
        if payload.folder_id:
            fld = await db.backup_folders.find_one({"id": payload.folder_id, "studio_id": sid}, {"_id": 0})
            if fld:
                zip_name = "".join(c for c in fld.get("name", "photos") if c.isalnum() or c in "-_ ").strip() or "photos"
        headers = {"Content-Disposition": f'attachment; filename="{zip_name}.zip"'}
        return StreamingResponse(buf, media_type="application/zip", headers=headers)

    @router.delete("/api/cloud-backup/files/{fid}")
    async def soft_delete_file(fid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.backup_files.update_one({"id": fid, "studio_id": sid},
                                         {"$set": {"deleted": True, "deleted_at": _now()}})
        await db.backup_events.insert_one({"id": uuid.uuid4().hex, "studio_id": sid,
                                           "action": "delete", "file_id": fid, "at": _now()})
        return {"deleted": True}

    # ---- recycle bin (1-day retention, then auto-purged) -------------------
    @router.get("/api/cloud-backup/recycle-bin")
    async def recycle_bin(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await _purge_expired(sid)  # drop anything past the 1-day window
        rows = await db.backup_files.find({"studio_id": sid}, {"_id": 0}).to_list(100000)
        out = []
        for r in rows:
            if not r.get("deleted"):
                continue
            deleted_at = _parse_iso(r.get("deleted_at"))
            if deleted_at:
                r["purge_at"] = (deleted_at + RECYCLE_RETENTION).isoformat()
            out.append(r)
        return {"files": out, "retention_days": RECYCLE_RETENTION.days}

    @router.post("/api/cloud-backup/files/{fid}/restore")
    async def restore_file(fid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.backup_files.update_one({"id": fid, "studio_id": sid},
                                         {"$set": {"deleted": False, "restored_at": _now()}})
        await db.backup_events.insert_one({"id": uuid.uuid4().hex, "studio_id": sid,
                                           "action": "restore", "file_id": fid, "at": _now()})
        return {"restored": True}

    @router.delete("/api/cloud-backup/files/{fid}/purge")
    async def purge_file(fid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.backup_files.delete_one({"id": fid, "studio_id": sid})
        return {"purged": True}

    # ---- history + recent --------------------------------------------------
    @router.get("/api/cloud-backup/history")
    async def history(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.backup_events.find({"studio_id": sid}, {"_id": 0}).sort("at", -1).to_list(200)
        recent_uploads = [r for r in rows if r.get("action") == "upload"][:10]
        last_backup = recent_uploads[0]["at"] if recent_uploads else None
        return {"events": rows[:100], "recent_uploads": recent_uploads, "last_backup": last_backup}

    return router
