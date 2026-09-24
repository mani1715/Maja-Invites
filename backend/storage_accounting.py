"""
storage_accounting.py — Phase 3: ONE storage pool for all of a studio's media.

Owner rule: every piece of media a studio stores — portfolio photos/videos AND
community photos/videos/reels/stories/challenge/marketplace media — counts against
the SAME portfolio-storage allowance. Text posts, likes, comments, followers,
analytics, CRM records, AI reports and verification records do NOT count.

This module is the single source of truth for "how much has this studio used" and
"what's their cap". It REUSES the existing portfolio quota logic
(`portfolio_service._storage_cap_bytes`) rather than inventing a second system, so
the cap always matches the studio's plan (Free 500 MB / Basic 5 GB / Premium 20 GB,
or the admin-set `storage_gb` on the plan).

Every media collection below is keyed by `studio_id` and stores a `size_bytes` on
each doc (absent → 0, so counting a collection that predates this is harmless).
"""
import time
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException

logger = logging.getLogger("storage_accounting")

# Physical uploads live under here; every reclamation is confined to this root.
UPLOADS_ROOT = Path("/app/uploads")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

# All collections whose documents occupy storage. Each doc: {studio_id, size_bytes}.
# Non-existent collections are auto-created empty by the adapter (→ contribute 0).
MEDIA_COLLECTIONS = [
    "portfolio_works",       # portfolio photos & videos
    "pixora_media",          # generic community media uploads (reels/stories source files)
    "pixora_reels",          # community reels
    "pixora_stories",        # community stories
    "pixora_posts",          # community photo/video posts (text posts have size_bytes 0)
    "pixora_submissions",    # monthly-challenge media
    "pixora_listings",       # marketplace files (presets/templates/overlays)
    "pixora_collab_media",   # collaboration media
    "pixora_mentor_media",   # mentor showcase media
    "gallery",               # Dynamic Event Engine media (Ganesh+); rows carry
                             # {studio_id, size_bytes}. Empty until the module flag
                             # is ON, so this contributes 0 for every studio today.
]

_MAX_DOCS = 20000   # per-collection safety cap for the per-studio sum


def _sum_size(rows) -> int:
    total = 0
    for r in rows:
        try:
            total += int(r.get("size_bytes") or 0)
        except (TypeError, ValueError):
            pass
    return total


async def used_bytes_by_collection(db, sid: str) -> Dict[str, int]:
    """Per-collection bytes used by a studio (0 for empty/missing collections).

    - Expired stories are treated as already RELEASED (excluded), so quota frees the
      moment a story lapses even before the purge job deletes the row.
    - `uploaded_pending` = files uploaded but not yet attached to a post/reel/work.
      Counting them stops upload-spam from exceeding the cap between upload and create.
    """
    out: Dict[str, int] = {}
    now_iso = _now()
    for coll in MEDIA_COLLECTIONS:
        try:
            rows = await getattr(db, coll).find({"studio_id": sid}, {"_id": 0}).to_list(_MAX_DOCS)
            if coll == "pixora_stories":
                rows = [r for r in rows if (r.get("expires_at") or "") > now_iso]
            out[coll] = _sum_size(rows)
        except Exception:
            out[coll] = 0
    try:
        out["uploaded_pending"] = await pending_upload_bytes(db, sid)
    except Exception:
        out["uploaded_pending"] = 0
    return out


async def used_bytes(db, sid: str) -> int:
    """Total bytes a studio has stored across the whole media pool."""
    per = await used_bytes_by_collection(db, sid)
    return sum(per.values())


async def cap_bytes(db, sid: str) -> int:
    """The studio's total allowance, from the existing portfolio plan logic."""
    try:
        from portfolio_service import _storage_cap_bytes
        return await _storage_cap_bytes(db, sid)
    except Exception:
        logger.warning("storage_accounting: cap lookup failed for %s", sid, exc_info=True)
        # Safe fallback: the free floor, so we never hand out unlimited space by accident.
        return 500 * 1024 * 1024


def cap_label(cap: int) -> str:
    return f"{cap // (1024 * 1024)} MB" if cap < 1024 ** 3 else f"{cap / 1024 ** 3:.0f} GB"


async def ensure_can_store(db, sid: str, incoming_bytes: int) -> Dict[str, int]:
    """Raise 403 if storing `incoming_bytes` more would exceed the studio's cap.
    Returns the {used, cap, incoming} snapshot on success."""
    incoming = max(0, int(incoming_bytes or 0))
    used = await used_bytes(db, sid)
    cap = await cap_bytes(db, sid)
    if used + incoming > cap:
        raise HTTPException(
            status_code=403,
            detail=(f"Storage limit ({cap_label(cap)}) reached. "
                    f"Upgrade your plan for more space."),
        )
    return {"used": used, "cap": cap, "incoming": incoming}


async def usage_summary(db, sid: str) -> Dict[str, Any]:
    """A full snapshot for the storage meter UI."""
    per = await used_bytes_by_collection(db, sid)
    used = sum(per.values())
    cap = await cap_bytes(db, sid)
    remaining = max(0, cap - used)
    return {
        "used_bytes": used,
        "cap_bytes": cap,
        "remaining_bytes": remaining,
        "used_mb": round(used / (1024 * 1024), 1),
        "remaining_mb": round(remaining / (1024 * 1024), 1),
        "cap_mb": cap // (1024 * 1024),
        "cap_gb": round(cap / (1024 * 1024 * 1024), 2),
        "percent": round(100 * used / cap, 1) if cap else 0,
        "full": used >= cap,
        "by_collection": {k: v for k, v in per.items() if v > 0},
    }


# ---------------------------------------------------------------------------
# Server-authoritative upload registry.
#
# The upload endpoints record the REAL measured byte size of each stored file in
# `uploaded_media`. Content creates (post/reel/story/work) then read the size from
# this registry — never from the client — closing the `size_bytes: 0` bypass.
# A file is "pending" (counts against quota) until a content doc attaches it via
# consume_upload; once attached, the content doc carries the size and the pending
# entry is marked consumed (no double count).
# ---------------------------------------------------------------------------
async def register_upload(db, sid: str, url: str, size_bytes: int, *,
                          kind: str = "", filename: str = "",
                          disk_path: str = "", area: str = "") -> None:
    await db.uploaded_media.insert_one({
        "id": f"um_{uuid.uuid4().hex[:16]}", "url": url, "studio_id": sid,
        "size_bytes": max(0, int(size_bytes or 0)), "kind": kind, "filename": filename,
        "disk_path": disk_path, "area": area, "consumed": False, "created_at": _now()})


async def registered_size(db, sid: str, url: str) -> int:
    """Server-recorded size for a url (whether or not it's been consumed). 0 for
    external/unknown urls (e.g. a YouTube link), which legitimately cost no storage."""
    if not url:
        return 0
    rec = await db.uploaded_media.find_one({"studio_id": sid, "url": url}, {"_id": 0})
    return int((rec or {}).get("size_bytes") or 0)


async def consume_upload(db, sid: str, url: str) -> int:
    """Attach a pending upload to a content doc: mark it consumed and return its
    SERVER-measured size. Idempotent (returns 0 if already consumed/unknown)."""
    if not url:
        return 0
    rec = await db.uploaded_media.find_one({"studio_id": sid, "url": url, "consumed": False}, {"_id": 0})
    if not rec:
        return 0
    await db.uploaded_media.update_one({"id": rec["id"]}, {"$set": {"consumed": True, "consumed_at": _now()}})
    return int(rec.get("size_bytes") or 0)


async def pending_upload_bytes(db, sid: str) -> int:
    rows = await db.uploaded_media.find({"studio_id": sid, "consumed": False}, {"_id": 0}).to_list(_MAX_DOCS)
    return _sum_size(rows)


def _safe_disk_path(disk_path: Optional[str]) -> Optional[Path]:
    """Only allow unlinking paths INSIDE the uploads root (no traversal / stray deletes)."""
    if not disk_path:
        return None
    try:
        p = Path(disk_path).resolve()
        root = UPLOADS_ROOT.resolve()
        return p if str(p).startswith(str(root)) else None
    except Exception:
        return None


def _disk_from_url(sid: str, url: str) -> Optional[Path]:
    """Fallback path resolution from a served url: /api/uploads/<area>/<sid>/<fname>."""
    try:
        tail = url.split("/api/uploads/", 1)[1]
        parts = tail.split("/")
        area, usid, fname = parts[0], parts[1], parts[-1]
        if usid != sid:
            return None
        return _safe_disk_path(str(UPLOADS_ROOT / area / usid / fname))
    except Exception:
        return None


async def release_media(db, sid: str, url: str) -> None:
    """Reclaim a url on content delete/replace: unlink the physical file and drop the
    registry row (DB-quota release is automatic once the content doc is gone). Best-effort
    multi-drive-pool cleanup is attempted if a delete hook exists (none yet → skipped)."""
    if not url:
        return
    rec = await db.uploaded_media.find_one({"studio_id": sid, "url": url}, {"_id": 0})
    disk = _safe_disk_path((rec or {}).get("disk_path")) or _disk_from_url(sid, url)
    if disk is not None:
        try:
            if disk.exists():
                disk.unlink()
        except Exception:
            logger.warning("release_media: unlink failed for %s", disk, exc_info=True)
    if rec:
        await db.uploaded_media.delete_one({"id": rec["id"]})
    try:  # best-effort multi-drive-pool cleanup: delete the mirror + release bytes
        from storage_pool_hooks import mirror_delete
        mirror_delete(db, photographer_id=sid, url=url,
                      source_path=(rec or {}).get("disk_path"),
                      area=(rec or {}).get("area"),
                      filename=(rec or {}).get("filename"))
    except Exception:
        pass


async def release_urls(db, sid: str, urls) -> None:
    for u in urls or []:
        await release_media(db, sid, u)


async def purge_expired_stories(db) -> int:
    """Delete lapsed stories platform-wide and reclaim their files. Idempotent; safe to
    run on startup and opportunistically. Returns how many were purged."""
    now_iso = _now()
    purged = 0
    try:
        rows = await db.pixora_stories.find({}, {"_id": 0}).to_list(100000)
    except Exception:
        return 0
    for s in rows:
        if (s.get("expires_at") or "") <= now_iso:
            try:
                await release_media(db, s.get("studio_id"), s.get("url"))
                await db.pixora_stories.delete_one({"id": s.get("id")})
                purged += 1
            except Exception:
                logger.warning("purge_expired_stories: failed on %s", s.get("id"), exc_info=True)
    if purged:
        logger.info("[storage] purged %s expired stories", purged)
    return purged


async def purge_orphan_uploads(db, older_than_hours: int = 24) -> int:
    """Reclaim abandoned uploads — files sent to /media/upload that were never attached
    to a post/reel/story/work (e.g. the user closed the composer). Unattached uploads
    count against quota (uploaded_pending), so leaving them forever silently eats a
    studio's storage. Deletes unconsumed uploaded_media older than the cutoff + their
    files. Runtime-created uploads are safe: they're consumed within seconds of creation."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=older_than_hours)).isoformat()
    purged = 0
    try:
        rows = await db.uploaded_media.find({"consumed": False}, {"_id": 0}).to_list(100000)
    except Exception:
        return 0
    for r in rows:
        if (r.get("created_at") or "") > cutoff:
            continue
        disk = _safe_disk_path(r.get("disk_path"))
        if disk is not None:
            try:
                if disk.exists():
                    disk.unlink()
            except Exception:
                logger.warning("purge_orphan_uploads: unlink failed for %s", disk, exc_info=True)
        try:
            await db.uploaded_media.delete_one({"id": r.get("id")})
            purged += 1
        except Exception:
            pass
    if purged:
        logger.info("[storage] purged %s orphaned uploads", purged)
    return purged


# ---- simple in-process upload rate limiter (per studio, sliding 60s window) ----
_UPLOAD_HITS: Dict[str, list] = {}


def allow_upload(sid: str, max_per_min: int = 30) -> bool:
    now = time.time()
    win = _UPLOAD_HITS.setdefault(sid, [])
    cutoff = now - 60
    win[:] = [t for t in win if t > cutoff]
    if len(win) >= max_per_min:
        return False
    win.append(now)
    return True
