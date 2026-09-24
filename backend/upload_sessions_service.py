"""
upload_sessions_service.py — direct-browser->S3 upload SESSIONS (Phase: multi-
drive media, multipart edition).

storage_upload.py solved the single-shot case (presigned POST, <=25 MB) for the
legacy `storage_files` areas. This module is the multipart-capable sibling for
the newer `media_storage` bucket layout (portfolio/event/invitation), built for
files up to tens of GB (wedding films): a control-plane session that hands the
browser either one presigned PUT (small files) or a set of presigned per-part
PUT URLs (large files, S3 multipart), while the app server never sees a byte.

SECURITY MODEL — same rule as storage_upload.py: the client is never trusted.
  * The server chooses the object key (media_storage.build_key), never the
    browser — a client-supplied key is a path-traversal / cross-tenant write.
  * Every event_id/invitation_id the browser sends is re-resolved to an owned
    record server-side (_resolve_owned_event / _resolve_owned_invitation)
    before it can influence a key or a quota check.
  * Completion is verified with head_object — the browser's "I'm done, it's
    N bytes" is never trusted; a mismatch is deleted, not recorded.
  * Every "claim a session and change its status" step is a CAS
    (find_one_and_update with the OLD status in the filter — see
    pg_adapter.find_one_and_update / media_reconcile.py for the house rule),
    so two concurrent completions/aborts of the same session can't both win.

Session lifecycle: created -> uploading -> completing -> available
                                    (or failed / aborted / expired at any step)
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import aws_service
import cache_backend
import media_storage

logger = logging.getLogger("upload_sessions")

_ACTIVE_STATUSES = ("created", "uploading", "completing")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _part_size(size_bytes: int) -> int:
    """Suggested per-part size: big enough to stay under MAX_PARTS, never
    smaller than S3's MIN_PART_BYTES, rounded up to a whole MiB."""
    raw = max(media_storage.MIN_PART_BYTES,
              -(-size_bytes // media_storage.MAX_PARTS))   # ceil(size/MAX_PARTS)
    mib = 1024 * 1024
    return -(-raw // mib) * mib                             # round up to MiB


def _is_expired(sess: Dict[str, Any], now: datetime) -> bool:
    """Sliding idle window OR absolute ceiling — either one is enough."""
    exp = sess.get("expires_at")
    if exp and exp < _iso(now):
        return True
    last = sess.get("last_activity_at")
    if last and last < _iso(now - timedelta(hours=media_storage.SESSION_IDLE_HOURS)):
        return True
    return False


async def _best_effort_discard(sess: Dict[str, Any]) -> None:
    """Clean up whatever S3 already has for a session that will never
    complete. Never raises — this runs after the DB row already changed
    status, so a leftover S3 object is an orphan for the lifecycle sweep,
    not a correctness bug."""
    try:
        if sess.get("mode") == "multipart" and sess.get("multipart_upload_id"):
            await asyncio.to_thread(
                aws_service.abort_multipart_upload, sess["object_key"],
                sess["multipart_upload_id"], bucket_name=sess.get("bucket"))
        elif sess.get("mode") == "single":
            await asyncio.to_thread(
                aws_service.delete_object, sess["object_key"],
                bucket_name=sess.get("bucket"))
    except Exception as e:
        logger.warning("[media] best-effort discard failed for %s: %s",
                       sess.get("id"), e)


async def _mark_expired(db, sess: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """CAS the session to 'expired' (no-op if someone else already moved it
    out of an active status) and best-effort discard whatever S3 has."""
    claimed = await db.media_upload_sessions.find_one_and_update(
        {"id": sess["id"], "status": {"$in": list(_ACTIVE_STATUSES)}},
        {"$set": {"status": "expired"}})
    if claimed:
        await _best_effort_discard(claimed)
    return claimed


async def _used_bytes(db, match: Dict[str, Any]) -> int:
    """SUM(size_bytes) over available media_assets matching `match`. SQL-pushed
    aggregate fast path with a Python-scan fallback (mirrors
    cloud_backup_service._studio_used_bytes — same shape, same reason: don't
    reload every asset row just to sum one column)."""
    flt = {**match, "status": "available"}
    try:
        rows = await db.media_assets.aggregate([
            {"$match": flt},
            {"$group": {"_id": None, "total": {"$sum": "$size_bytes"}}},
        ]).to_list(1)
        return int(rows[0].get("total") or 0) if rows else 0
    except Exception:
        total = 0
        async for a in db.media_assets.find(match, {"_id": 0}):
            if a.get("status") == "available":
                total += int(a.get("size_bytes") or 0)
        return total


async def _resolve_owned_event(db, event_id: str, admin: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Server-side ownership resolution for an event_id the browser sent —
    never trust it unverified. `event_id` is either a wedding profile id
    (profiles.admin_id is direct) or a row in the newer `events` engine
    (owner_id). Returns {"id", "owner_admin_id"} or None (not found / not
    owned — same response either way so ownership never leaks via 404 vs
    403)."""
    admin_id = admin.get("admin_id")
    is_super = admin.get("role") == "super_admin"

    profile = await db.profiles.find_one({"id": event_id}, {"_id": 0})
    if profile:
        owner = profile.get("admin_id")
        if owner == admin_id or is_super:
            return {"id": event_id, "owner_admin_id": owner}
        return None

    ev = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if ev:
        owner = ev.get("owner_id")
        if owner == admin_id or is_super:
            return {"id": event_id, "owner_admin_id": owner}
        return None
    return None


async def _resolve_owned_invitation(db, resolved_event: Dict[str, Any], invitation_id: str) -> bool:
    """`invitation_id` either names an event_invitations row that belongs to
    the already-owned event, or IS the event/profile id itself (the "default"
    invite that a profile page doubles as, with no separate row)."""
    if invitation_id == resolved_event["id"]:
        return True
    ei = await db.event_invitations.find_one(
        {"id": invitation_id}, {"_id": 0, "profile_id": 1})
    return bool(ei and ei.get("profile_id") == resolved_event["id"])


# --------------------------------------------------------------------------- #
# request bodies
# --------------------------------------------------------------------------- #
class CreateSessionIn(BaseModel):
    category: str
    kind: str
    mime: str = Field(max_length=128)
    size_bytes: int = Field(gt=0)
    event_id: Optional[str] = Field(default=None, max_length=64)
    invitation_id: Optional[str] = Field(default=None, max_length=64)
    filename: Optional[str] = Field(default=None, max_length=255)


class PartsIn(BaseModel):
    part_numbers: List[int] = Field(min_length=1, max_length=media_storage.PART_PRESIGN_BATCH_MAX)


class PartIn(BaseModel):
    part_number: int
    etag: str = Field(max_length=80)


class CompleteIn(BaseModel):
    parts: Optional[List[PartIn]] = Field(default=None, max_length=media_storage.MAX_PARTS)


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_upload_sessions_router(db, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/media", tags=["media-upload"])

    @router.post("/upload-sessions")
    async def create_session(body: CreateSessionIn, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]

        if not await cache_backend.rate_limit_allow(
                f"media_sess:{admin_id}", media_storage.SESSION_CREATE_RATE_PER_HOUR, 3600):
            raise HTTPException(429, "Too many upload sessions requested — try again shortly")

        cap = media_storage.MAX_BYTES_BY_KIND.get(body.kind)
        if cap is None:
            raise HTTPException(415, f"Unsupported kind: {body.kind}")
        if body.size_bytes > cap:
            raise HTTPException(413, "File exceeds the per-file size limit for this kind")

        # Server-side ownership — the id the S3 key is namespaced under is
        # always the OWNING photographer, never the caller (a super_admin
        # acting on someone else's studio must still land the file in that
        # studio's prefix). The session/asset `photographer_id` field, used
        # for rate limiting, session caps and quota below, stays the CALLER's
        # id — that is what every other route in this module scopes its
        # ownership queries by.
        owner_admin_id = admin_id
        resolved_event: Optional[Dict[str, Any]] = None
        if body.category in ("event", "invitation"):
            if not body.event_id:
                raise HTTPException(400, "event_id is required for this category")
            resolved_event = await _resolve_owned_event(db, body.event_id, admin)
            if not resolved_event:
                raise HTTPException(404, "Event not found")
            owner_admin_id = resolved_event["owner_admin_id"]
            if body.category == "invitation":
                if not body.invitation_id:
                    raise HTTPException(400, "invitation_id is required for this category")
                if not await _resolve_owned_invitation(db, resolved_event, body.invitation_id):
                    raise HTTPException(404, "Invitation not found")

        active = await db.media_upload_sessions.count_documents(
            {"photographer_id": admin_id, "status": {"$in": list(_ACTIVE_STATUSES)}})
        if active >= media_storage.MAX_ACTIVE_SESSIONS_PER_ADMIN:
            raise HTTPException(429, "Too many active upload sessions — finish or abort one first")

        used = await _used_bytes(db, {"photographer_id": admin_id})
        if used + body.size_bytes > media_storage.PHOTOGRAPHER_QUOTA_BYTES:
            raise HTTPException(413, {"error": "quota_exceeded"})
        if body.event_id:
            used_event = await _used_bytes(db, {"event_id": body.event_id})
            if used_event + body.size_bytes > media_storage.EVENT_QUOTA_BYTES:
                raise HTTPException(413, {"error": "quota_exceeded"})

        try:
            key = media_storage.build_key(
                body.category, body.kind, body.mime, photographer_id=owner_admin_id,
                event_id=body.event_id, invitation_id=body.invitation_id)
        except ValueError as e:
            raise HTTPException(415, str(e))
        bucket = media_storage.bucket_for(body.category)

        mode = "single" if body.size_bytes <= media_storage.MULTIPART_THRESHOLD_BYTES else "multipart"
        upload_id = None
        upload_url = None
        try:
            if mode == "multipart":
                upload_id = await asyncio.to_thread(
                    aws_service.create_multipart_upload, key, body.mime, bucket_name=bucket)
            else:
                upload_url = await asyncio.to_thread(
                    aws_service.generate_presigned_put, key, body.mime, bucket_name=bucket)
        except Exception as e:
            # Same posture as complete_session: an S3-layer failure (missing
            # credentials, transient AWS error) is a clean upstream 502, not a
            # bare 500 from the global handler.
            logger.warning("create_session S3 init failed: %s", e)
            raise HTTPException(502, "storage backend unavailable")

        now = _now()
        sid = f"ms_{uuid.uuid4().hex[:20]}"
        sess = {
            "id": sid,
            "photographer_id": admin_id,
            "category": body.category,
            "kind": body.kind,
            "event_id": body.event_id,
            "invitation_id": body.invitation_id,
            "bucket": bucket,
            "object_key": key,
            "mime": body.mime,
            "filename": media_storage.sanitize_filename(body.filename),
            "declared_bytes": body.size_bytes,
            "mode": mode,
            "multipart_upload_id": upload_id,
            "status": "created",
            "error": None,
            "created_at": _iso(now),
            "last_activity_at": _iso(now),
            "expires_at": _iso(now + timedelta(hours=media_storage.SESSION_ABSOLUTE_HOURS)),
            "completed_at": None,
        }
        await db.media_upload_sessions.insert_one(sess)

        return {
            "session_id": sid,
            "mode": mode,
            "bucket": bucket,
            "key": key,
            "expires_at": sess["expires_at"],
            "upload_url": upload_url,
            "part_size": _part_size(body.size_bytes),
            "max_parts": media_storage.MAX_PARTS,
        }

    @router.post("/upload-sessions/{sid}/parts")
    async def presign_parts(sid: str, body: PartsIn, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        sess = await db.media_upload_sessions.find_one({"id": sid, "photographer_id": admin_id})
        if not sess:
            raise HTTPException(404, "Upload session not found")

        now = _now()
        if _is_expired(sess, now):
            await _mark_expired(db, sess)
            raise HTTPException(410, "Upload session expired")
        if sess.get("mode") != "multipart":
            raise HTTPException(400, "Session is not a multipart upload")
        if sess.get("status") not in ("created", "uploading"):
            raise HTTPException(409, f"Session status is {sess.get('status')}")
        if any(pn < 1 or pn > media_storage.MAX_PARTS for pn in body.part_numbers):
            raise HTTPException(422, f"part_numbers must be within 1..{media_storage.MAX_PARTS}")

        await db.media_upload_sessions.update_one(
            {"id": sid}, {"$set": {"status": "uploading", "last_activity_at": _iso(now)}})

        async def _presign(pn: int):
            url = await asyncio.to_thread(
                aws_service.presign_upload_part, sess["object_key"],
                sess["multipart_upload_id"], pn, bucket_name=sess["bucket"])
            return pn, url

        pairs = await asyncio.gather(*[_presign(pn) for pn in body.part_numbers])
        return {"urls": {pn: url for pn, url in pairs}}

    @router.get("/upload-sessions/{sid}")
    async def get_session(sid: str, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        sess = await db.media_upload_sessions.find_one({"id": sid, "photographer_id": admin_id})
        if not sess:
            raise HTTPException(404, "Upload session not found")
        out = {k: v for k, v in sess.items() if k != "_id"}
        out["uploaded_parts"] = []
        if sess.get("mode") == "multipart" and sess.get("status") in ("created", "uploading", "completing"):
            try:
                out["uploaded_parts"] = await asyncio.to_thread(
                    aws_service.list_uploaded_parts, sess["object_key"],
                    sess["multipart_upload_id"], bucket_name=sess.get("bucket"))
            except Exception:
                out["uploaded_parts"] = []       # NoSuchUpload etc. -> nothing to resume
        return out

    @router.post("/upload-sessions/{sid}/complete")
    async def complete_session(sid: str, body: CompleteIn, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        now = _now()

        sess = await db.media_upload_sessions.find_one({"id": sid, "photographer_id": admin_id})
        if not sess:
            raise HTTPException(404, "Upload session not found")
        if _is_expired(sess, now):
            await _mark_expired(db, sess)
            raise HTTPException(410, "Upload session expired")

        claimed = await db.media_upload_sessions.find_one_and_update(
            {"id": sid, "photographer_id": admin_id, "status": {"$in": ["created", "uploading"]}},
            {"$set": {"status": "completing", "last_activity_at": _iso(now)}})
        if not claimed:
            cur = await db.media_upload_sessions.find_one({"id": sid})
            raise HTTPException(409, f"Session already {cur['status'] if cur else 'gone'}")

        try:
            if claimed["mode"] == "multipart":
                if not body.parts:
                    raise HTTPException(422, "parts are required to complete a multipart upload")
                parts = [{"part_number": p.part_number, "etag": p.etag} for p in body.parts]
                await asyncio.to_thread(
                    aws_service.complete_multipart_upload, claimed["object_key"],
                    claimed["multipart_upload_id"], parts, bucket_name=claimed["bucket"])

            head = await asyncio.to_thread(
                aws_service.head_object, claimed["object_key"], bucket_name=claimed["bucket"])
            if not head:
                await db.media_upload_sessions.update_one(
                    {"id": sid}, {"$set": {"status": "failed", "error": "object missing after completion"}})
                raise HTTPException(502, "Upload did not land in storage")

            cap = media_storage.MAX_BYTES_BY_KIND.get(claimed["kind"], 0)
            size = int(head.get("size") or 0)
            if size > cap or size > claimed["declared_bytes"] * 1.05 + 1024 * 1024:
                await asyncio.to_thread(
                    aws_service.delete_object, claimed["object_key"], bucket_name=claimed["bucket"])
                await db.media_upload_sessions.update_one(
                    {"id": sid}, {"$set": {"status": "failed", "error": "uploaded size mismatch"}})
                raise HTTPException(413, "Uploaded object size does not match the declared size")
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("[media] complete failed for %s: %s", sid, e)
            await db.media_upload_sessions.update_one(
                {"id": sid}, {"$set": {"status": "failed", "error": str(e)[:300]}})
            if claimed.get("mode") == "multipart":
                try:
                    await asyncio.to_thread(
                        aws_service.abort_multipart_upload, claimed["object_key"],
                        claimed["multipart_upload_id"], bucket_name=claimed.get("bucket"))
                except Exception:
                    pass
            raise HTTPException(502, "Could not finalize the upload")

        asset = {
            "id": f"asset_{uuid.uuid4().hex[:16]}",
            "photographer_id": claimed["photographer_id"],
            "event_id": claimed.get("event_id"),
            "invitation_id": claimed.get("invitation_id"),
            "category": claimed["category"],
            "kind": claimed["kind"],
            "bucket": claimed["bucket"],
            "object_key": claimed["object_key"],
            "mime": claimed["mime"],
            "size_bytes": size,
            "etag": head.get("etag"),
            "status": "available",
            "upload_session_id": sid,
            "filename": claimed.get("filename"),
            "created_at": _iso(now),
            "deleted_at": None,
        }
        await db.media_assets.insert_one(asset)
        await db.media_upload_sessions.find_one_and_update(
            {"id": sid, "status": "completing"},
            {"$set": {"status": "available", "completed_at": _iso(now)}})
        return asset

    @router.post("/upload-sessions/{sid}/abort")
    async def abort_session(sid: str, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        claimed = await db.media_upload_sessions.find_one_and_update(
            {"id": sid, "photographer_id": admin_id, "status": {"$in": list(_ACTIVE_STATUSES)}},
            {"$set": {"status": "aborted"}})
        if claimed:
            await _best_effort_discard(claimed)
            return {"status": "aborted"}
        cur = await db.media_upload_sessions.find_one({"id": sid, "photographer_id": admin_id})
        if not cur:
            raise HTTPException(404, "Upload session not found")
        return {"status": cur["status"]}     # already aborted/expired/available/failed -> idempotent

    @router.get("/events/{event_id}/upload-locations")
    async def upload_locations(event_id: str, admin: dict = Depends(require_admin)):
        resolved = await _resolve_owned_event(db, event_id, admin)
        if not resolved:
            raise HTTPException(404, "Event not found")
        ns = media_storage.event_namespace(resolved["owner_admin_id"], event_id)
        ns["limits"] = media_storage.MAX_BYTES_BY_KIND
        ns["allowed_mime"] = {k: sorted(v.keys()) for k, v in media_storage.ALLOWED_MIME.items()}
        ns["multipart_threshold"] = media_storage.MULTIPART_THRESHOLD_BYTES
        return ns

    @router.get("/assets")
    async def list_assets(event_id: Optional[str] = None, invitation_id: Optional[str] = None,
                          category: Optional[str] = None, photographer_id: Optional[str] = None,
                          limit: int = Query(50, ge=1, le=200),
                          skip: int = Query(0, ge=0, le=100000),
                          admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        flt: Dict[str, Any] = {"status": "available"}
        if admin.get("role") == "super_admin" and photographer_id:
            flt["photographer_id"] = photographer_id
        else:
            flt["photographer_id"] = admin_id
        if event_id:
            flt["event_id"] = event_id
        if invitation_id:
            flt["invitation_id"] = invitation_id
        if category:
            flt["category"] = category

        rows = await db.media_assets.find(flt, {"_id": 0}) \
            .sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

        async def _sign(r: Dict[str, Any]) -> Dict[str, Any]:
            r["url"] = await asyncio.to_thread(
                aws_service.generate_signed_url, r["object_key"], bucket_name=r.get("bucket"))
            return r

        rows = await asyncio.gather(*[_sign(r) for r in rows])
        return {"items": list(rows), "limit": limit, "skip": skip}

    @router.delete("/assets/{asset_id}")
    async def delete_asset(asset_id: str, admin: dict = Depends(require_admin)):
        admin_id = admin["admin_id"]
        claimed = await db.media_assets.find_one_and_update(
            {"id": asset_id, "photographer_id": admin_id, "status": "available"},
            {"$set": {"status": "deleted", "deleted_at": _iso(_now())}})
        if not claimed:
            raise HTTPException(404, "Asset not found")
        try:
            await asyncio.to_thread(
                aws_service.delete_object, claimed["object_key"], bucket_name=claimed.get("bucket"))
        except Exception as e:
            logger.warning("[media] delete_object failed for asset %s: %s", asset_id, e)
        return {"ok": True}

    return router


# --------------------------------------------------------------------------- #
# cleanup + indexes — module-level, called by the coordinator's scheduler
# --------------------------------------------------------------------------- #
async def cleanup_expired_upload_sessions(db, limit: int = 500) -> int:
    """Sweep sessions past their idle window or absolute ceiling. Idempotent
    and safe under concurrent execution — the actual state change is a CAS,
    this just finds candidates and tries the claim."""
    now = _now()
    idle_cutoff = _iso(now - timedelta(hours=media_storage.SESSION_IDLE_HOURS))
    now_iso = _iso(now)
    candidates = await db.media_upload_sessions.find({
        "status": {"$in": list(_ACTIVE_STATUSES)},
        "$or": [{"expires_at": {"$lt": now_iso}},
                {"last_activity_at": {"$lt": idle_cutoff}}],
    }).limit(limit).to_list(limit)

    count = 0
    for sess in candidates:
        claimed = await _mark_expired(db, sess)
        if claimed:
            count += 1
    return count


async def ensure_media_indexes(db) -> None:
    """Idempotent; safe on every boot — create_index() checks the catalog and
    returns fast once the index already exists (see pg_adapter.create_index)."""
    specs = [
        ("media_upload_sessions", [("photographer_id", 1), ("status", 1)],
         "media_sessions_photographer_status", {}),
        ("media_upload_sessions", [("expires_at", 1)], "media_sessions_expires", {}),
        ("media_assets", [("photographer_id", 1), ("status", 1)],
         "media_assets_photographer_status", {}),
        ("media_assets", [("event_id", 1)], "media_assets_event", {"sparse": True}),
        ("media_assets", [("invitation_id", 1)], "media_assets_invitation", {"sparse": True}),
    ]
    for coll, keys, name, opts in specs:
        try:
            await getattr(db, coll).create_index(keys, name=name, **opts)
        except Exception as e:
            logger.warning("[media] index %s.%s failed: %s", coll, name, e)
