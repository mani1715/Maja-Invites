"""
MAJA Invites — LIVE AI PHOTO GALLERY (Sprint 10)
==================================================
* Photographer enables gallery on a profile → creates Rekognition collection
* Photographer uploads photos via bulk OR phone-live mode (short token, no login)
* Each upload: validated → thumb → S3 (with expire-at tag) → Rekognition index
* Guests on /invite/{slug} click "Find My Photos", upload selfie → matches
* Selfies auto-deleted in 24h; entire wedding gallery deleted 1 day after link_expiry_date

Endpoints (mounted under /api):
  Admin (JWT):
    POST   /api/admin/profiles/{id}/gallery/enable
    PATCH  /api/admin/profiles/{id}/gallery/upload-methods
    POST   /api/admin/profiles/{id}/gallery/regenerate-token
    GET    /api/admin/profiles/{id}/gallery/credentials
    GET    /api/admin/profiles/{id}/gallery/photos
    POST   /api/admin/profiles/{id}/gallery/bulk-upload      (multipart)
    POST   /api/admin/profiles/{id}/gallery/presign-upload   (direct-to-S3 PUT)
    POST   /api/admin/profiles/{id}/gallery/commit-upload    (finalize a presigned PUT)
    DELETE /api/admin/profiles/{id}/gallery/photos/{photo_id}
    GET    /api/admin/profiles/{id}/gallery/stats
    GET    /api/admin/gallery/aws/health

  Live photographer upload (token, no login):
    POST   /api/live-upload/{profile_id}                     (multipart, ?token=)
    GET    /api/live-upload/{profile_id}/status              (?token=)

  Public (no auth):
    POST   /api/public/gallery/{slug}/face-search             (multipart selfie; queued, see T4)
    POST   /api/public/gallery/{slug}/face-search/{session_id}/retry  (multipart selfie; retry within session)
    GET    /api/public/gallery/{slug}/face-results            (?session_id=) — was /photos, unshadowed (T5)
    GET    /api/public/gallery/{slug}/download-zip            (?session_id=) — returns a URL manifest (T7)
    GET    /api/public/gallery/{slug}/info                   (gallery enabled? count?)
"""
import os
import re
import uuid
import hashlib
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple, Callable
from urllib.parse import quote

import jwt as _jwt
from fastapi import (APIRouter, HTTPException, Depends, UploadFile, File,
                      Query, Form, Request)
from pydantic import BaseModel, Field

import aws_service
import cache_backend
import face_quota
from aws_service import (s3, bucket, upload_bytes, delete_prefix,
                         make_thumbnail, is_valid_image,
                         is_configured, healthcheck, generate_presigned_put)
import media_storage
import media_derivatives
from face_providers import get_face_provider
# Media URLs now resolve through storage_serve.media_url: same signed,
# expiring contract as the old S3/CloudFront URL, but the bytes come from
# the Drive pool once a file is mirrored. Swapping here rather than at each
# call site keeps the guest-privacy model identical.
from storage_serve import media_url as generate_signed_url  # noqa: E402

import face_queue
from cache_backend import kv_get_json, kv_set_json, client_ip, rate_limit_allow
from face_consent import has_valid_consent, compute_ip_hash
from usage_metering import record_usage

logger = logging.getLogger("gallery")

# Single source of truth for the signing secret (auth.py fail-hards at import
# if JWT_SECRET_KEY is unset, unless ALLOW_INSECURE_JWT=1). Removes this module's
# old independent "change-me" fallback so live-upload tokens can't silently be
# signed with a guessable literal under ALLOW_INSECURE_JWT.
from auth import SECRET_KEY as JWT_SECRET
LIVE_TOKEN_EXPIRY_HOURS = int(os.environ.get("LIVE_UPLOAD_TOKEN_EXPIRY_HOURS", "24"))
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB per file (multipart, through the app server)
ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif", "image/webp"}

# L1 -- direct-to-S3 presign flow (doc sec 6/7: large media must not transit
# FastAPI). Bigger cap than MAX_UPLOAD_BYTES because these bytes never sit in
# a request body on this server -- commit-upload downloads them once, itself,
# after they're already resident in S3.
MAX_PRESIGN_BYTES = 100 * 1024 * 1024  # 100MB per file
GALLERY_PRESIGN_TTL = int(os.environ.get("GALLERY_PRESIGN_TTL", "900"))  # 15 min
# Files at/above the threshold upload as multipart with parallel parts: a large
# original (30MB+ TIFF/RAW) over a high-latency link (distant studio -> us-east-2)
# is throughput-capped on a single stream, and N parallel part-PUTs fill the
# pipe. Smaller files stay single-PUT (one request is cheaper). S3 requires
# parts >= 5MB (except the last), so the part size floors there.
GALLERY_MULTIPART_THRESHOLD = int(os.environ.get(
    "GALLERY_MULTIPART_THRESHOLD", str(8 * 1024 * 1024)))
GALLERY_MULTIPART_PART_SIZE = max(5 * 1024 * 1024, int(os.environ.get(
    "GALLERY_MULTIPART_PART_SIZE", str(8 * 1024 * 1024))))
# Reserving quota is cheap but it is the gate in front of every upload, so it
# gets its own budget rather than sharing the generic admin limit.
QUOTA_RESERVE_PER_HOUR = int(os.environ.get("GALLERY_QUOTA_RESERVE_PER_HOUR", "120"))
# Presign is the one upload call with no natural ceiling on a wedding whose
# face-match quota is unlimited (legacy flat `ai_face_match` orders). Generous
# enough for a real 5,000-photo shoot, low enough that a loop cannot mint
# presigned URLs indefinitely.
PRESIGN_PER_HOUR = int(os.environ.get("GALLERY_PRESIGN_PER_HOUR", "6000"))

# A4 — face-search abuse caps. Per-guest stops one device from hammering
# Rekognition; per-event stops a single gallery under load (e.g. a shared
# link going viral) from burning the whole account's face-match budget.
FACE_SEARCH_LIMIT_PER_IP = int(os.environ.get("FACE_SEARCH_LIMIT_PER_IP", "15"))
FACE_SEARCH_LIMIT_PER_EVENT = int(os.environ.get("FACE_SEARCH_LIMIT_PER_EVENT", "600"))

# Retry-within-session cap (a guest re-uploading a better selfie into the same
# session, not a new search) -- bounds how many times one session can be
# reprocessed before we make them start over.
FACE_SESSION_MAX_RETRIES = int(os.environ.get("FACE_SESSION_MAX_RETRIES", "5"))

# Guest download caps — DISTINCT photos per identity, enforced server-side in
# public_download_grant below. The client never receives a full-res URL except
# through that capped endpoint (guest photo responses carry thumb URLs only), so
# the count is real, not a client-side courtesy. "all photos" (whole-album QR
# view) is keyed by a per-browser device id; face-match is keyed by the guest's
# mobile number. ponytail: gentle friction, not a hard security boundary — a
# determined guest can clear the browser id or use a new number; that is an
# accepted product trade-off (no OTP/SMS infra), stated rather than hidden.
ALL_PHOTOS_DOWNLOAD_CAP = int(os.environ.get("ALL_PHOTOS_DOWNLOAD_CAP", "5"))
FACE_DOWNLOAD_CAP = int(os.environ.get("FACE_DOWNLOAD_CAP", "10"))


# ============================================================
#  Pydantic models
# ============================================================
class UploadMethods(BaseModel):
    dslr_ftp_enabled: bool = False           # skipped this build (k8s port limit)
    phone_tether_enabled: bool = True
    wifi_sd_card_enabled: bool = False
    phone_live_enabled: bool = True
    bulk_upload_enabled: bool = True
    guest_contributions_enabled: bool = False


class GalleryConfigPublic(BaseModel):
    enabled: bool
    total_photos: int = 0
    face_search_enabled: bool = True
    expires_at: Optional[str] = None
    auto_delete_at: Optional[str] = None


class EnableGalleryPayload(BaseModel):
    enabled: bool = True
    upload_methods: Optional[UploadMethods] = None
    confidence_threshold: float = 90.0


class UpdateMethodsPayload(BaseModel):
    upload_methods: UploadMethods


class PresignUploadIn(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    # Batch reservation taken before the first presign (see face_quota). Absent
    # means "single ad-hoc photo" and a one-slot reservation is taken inline, so
    # an older client can never presign its way past the quota.
    reservation_id: Optional[str] = None


class CommitUploadIn(BaseModel):
    s3_key: str
    original_name: Optional[str] = None
    reservation_id: Optional[str] = None


# Multipart lane — same direct-to-S3 staging + commit as the single-PUT flow,
# but the browser uploads the file as parallel parts so one high-latency stream
# (a distant studio -> us-east-2) can't cap throughput on a big original.
class MultipartCreateIn(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    reservation_id: Optional[str] = None


class MultipartPresignIn(BaseModel):
    s3_key: str
    upload_id: str
    part_numbers: List[int] = Field(default_factory=list)


class MultipartPartIn(BaseModel):
    part_number: int
    etag: str


class MultipartCompleteIn(BaseModel):
    s3_key: str
    upload_id: str
    parts: List[MultipartPartIn] = Field(default_factory=list)
    original_name: Optional[str] = None
    reservation_id: Optional[str] = None


class MultipartAbortIn(BaseModel):
    s3_key: str
    upload_id: str


class ReserveQuotaIn(BaseModel):
    photo_count: int = Field(ge=1, le=face_quota.MAX_BATCH_PHOTOS)


class BulkDeleteIn(BaseModel):
    ids: List[str] = Field(default_factory=list)


class DownloadGrantIn(BaseModel):
    """One capped download. scope 'all' = whole-album QR view (keyed by
    device_id); scope 'face' = a guest's own face matches (keyed by mobile,
    the photo must belong to the guest's session)."""
    photo_id: str
    scope: str = "all"
    device_id: Optional[str] = None
    mobile: Optional[str] = None
    session_id: Optional[str] = None


# ============================================================
#  Helpers
# ============================================================
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _profile_collection_id(profile_id: str) -> str:
    # AWS Rekognition collection IDs: a-z A-Z 0-9 _ . - (no UUID dashes? dashes are ok)
    safe = re.sub(r"[^a-zA-Z0-9_.\-]", "_", profile_id)
    return f"maja_wedding_{safe}"


def _s3_prefix(profile_id: str) -> str:
    return f"weddings/{profile_id}/"


def _photo_keys(profile_id: str, photo_id: str) -> Dict[str, str]:
    """Derivative keys (NOT the true original — see `_original_key`)."""
    pref = _s3_prefix(profile_id)
    return {
        "preview": f"{pref}photos/{photo_id}/preview.jpg",
        "thumb":   f"{pref}photos/{photo_id}/thumb.webp",
    }


# Pillow's decoded-format name -> (file extension, S3 content-type) for the
# UNTOUCHED original object. Keyed off the real decode (photo_guard already
# ran it), not the client-supplied filename/content-type - those are claims,
# the decode is evidence.
_FMT_EXT_MIME = {
    "JPEG": (".jpg", "image/jpeg"),
    "MPO":  (".jpg", "image/jpeg"),   # motion photo container, JPEG-compatible
    "PNG":  (".png", "image/png"),
    "WEBP": (".webp", "image/webp"),
    "GIF":  (".gif", "image/gif"),
    "HEIF": (".heic", "image/heic"),
    "HEIC": (".heic", "image/heic"),
}


def _original_ext_mime(pil_format: str) -> Tuple[str, str]:
    return _FMT_EXT_MIME.get((pil_format or "").upper(), (".jpg", "image/jpeg"))


def _original_key(profile_id: str, photo_id: str, ext: str) -> str:
    """Key for the TRUE, byte-for-byte original upload (see media_derivatives
    .make_standard_set) - never re-encoded, unlike preview/thumb above."""
    return f"{_s3_prefix(profile_id)}photos/{photo_id}/original{ext}"


def _staging_prefix(profile_id: str) -> str:
    return f"{_s3_prefix(profile_id)}staging/"


def _copy_staged_original(staging_key: str, original_key: str, content_type: str,
                          tags: Dict[str, str]) -> None:
    """commit_upload's original-storage strategy: the browser already PUT the
    original bytes straight to `staging_key` (L1 presign flow), so finalizing
    it is an S3-side copy_object to the real key -- the original bytes never
    re-transit through this app server."""
    tag_str = "&".join(f"{k}={quote(str(v))}" for k, v in (tags or {}).items())
    kwargs = dict(Bucket=bucket(), CopySource={"Bucket": bucket(), "Key": staging_key},
                  Key=original_key, ContentType=content_type, MetadataDirective="REPLACE")
    if tag_str:
        kwargs["Tagging"] = tag_str
        kwargs["TaggingDirective"] = "REPLACE"
    s3().copy_object(**kwargs)


def _selfie_bucket_for_session(session: dict) -> str:
    """Bucket a session's selfie lives in. New rows always set `selfie_bucket`
    (the private face bucket, media_storage.bucket_for("face")) at creation.
    Rows written before that migration have no such field -- for those, the
    selfie was put in the legacy default bucket, so that's the fallback here,
    NOT the new face bucket (compat requirement: old rows must keep cleaning
    up correctly)."""
    return session.get("selfie_bucket") or bucket()


def _check_selfie_mime(upload_file: UploadFile) -> None:
    """Cheap defense-in-depth BEFORE reading bytes. Content-type is
    browser-supplied and not the real gate -- is_valid_image()'s decode check
    (run after this, on the actual bytes) is what actually protects; this just
    rejects the obviously-wrong case early."""
    ct = (upload_file.content_type or "").split(";")[0].strip().lower()
    if ct not in media_storage.SELFIE_ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Unsupported selfie file type")


def _session_is_expired(session: dict) -> bool:
    """True once a face-search session's 24h selfie-retention window has
    passed. Parsed defensively: a missing/garbled `expires_at` (legacy rows)
    only counts as expired when `created_at` is ALSO more than 24h old, so a
    parse hiccup never locks a fresh session out."""
    now = _now()

    def _parse(v):
        if not v:
            return None
        try:
            dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    exp = _parse(session.get("expires_at"))
    if exp is not None:
        return now >= exp
    created = _parse(session.get("created_at"))
    if created is not None:
        return now - created > timedelta(hours=24)
    return False


async def _get_profile(db, profile_id_or_slug: str) -> Optional[dict]:
    return await db.profiles.find_one(
        {"$or": [{"id": profile_id_or_slug}, {"slug": profile_id_or_slug}]},
        {"_id": 0},
    )


async def _require_owned_profile(db, profile_id_or_slug: str, admin_id: str) -> dict:
    """H1 (Broken Access Control) fix — object-level authorization.

    Returns the profile only if the caller owns it (profile.admin_id == admin_id)
    or is a super_admin. 404 if it doesn't exist, 403 if it isn't theirs. Legacy
    profiles with no `admin_id` are allowed through (can't attribute ownership)
    but logged, so old galleries keep working while the IDOR is closed for all
    owned profiles.
    """
    profile = await _get_profile(db, profile_id_or_slug)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    owner = profile.get("admin_id")
    if owner:
        if owner == admin_id:
            return profile
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if admin and admin.get("role") == "super_admin":
            return profile
        raise HTTPException(status_code=403, detail="You do not have access to this profile")
    logger.warning("profile %s has no admin_id; ownership not enforced", profile.get("id"))
    return profile


def _compute_auto_delete_at(profile: dict) -> datetime:
    """1 DAY after profile.link_expiry_date (or event_date + 7 days)."""
    expiry = profile.get("link_expiry_date") or profile.get("expires_at")
    if expiry:
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            except Exception:
                expiry = None
    if not expiry:
        ev = profile.get("event_date")
        if isinstance(ev, str):
            try:
                ev = datetime.fromisoformat(ev.replace("Z", "+00:00"))
            except Exception:
                ev = None
        expiry = (ev or _now()) + timedelta(days=7)
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry + timedelta(days=1)


def _issue_live_token(profile_id: str) -> str:
    payload = {
        "sub": profile_id,
        "type": "live_upload",
        "iat": int(_now().timestamp()),
        "exp": int((_now() + timedelta(hours=LIVE_TOKEN_EXPIRY_HOURS)).timestamp()),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _verify_live_token(token: str, profile_id: str) -> bool:
    try:
        payload = _jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return (payload.get("sub") == profile_id
                and payload.get("type") == "live_upload")
    except Exception:
        return False


# ============================================================
#  Router builder
# ============================================================
def _quota_http(exc) -> HTTPException:
    """QUOTA_EXCEEDED is a conflict with server-held state, not a bad request:
    the same body succeeds once the studio extends the quota."""
    return HTTPException(status_code=409, detail=exc.payload)


async def _claim_quota_slot(db, profile: dict, reservation_id: Optional[str],
                            admin_id: Optional[str]) -> Optional[str]:
    """Resolve the reservation a single photo will be committed against.

    With a `reservation_id`: verify it belongs to THIS wedding, is still open
    and has an unused slot — a reservation id from another studio's event is a
    404, never a usable hold.

    Without one: take a one-slot reservation inline. That is what stops an
    older client (or a hand-rolled request) from presigning past the quota by
    simply never calling /quota/reserve.
    """
    if reservation_id:
        row = await face_quota.get(db, reservation_id)
        if not row or row.get("profile_id") != profile["id"]:
            raise HTTPException(status_code=404, detail="Reservation not found")
        if row.get("status") != "reserved":
            raise HTTPException(status_code=409,
                                detail=f"Reservation is {row.get('status')}")
        if (row.get("expires_at") or "") <= _now().isoformat():
            raise HTTPException(status_code=409, detail="Reservation expired")
        if int(row.get("committed_count") or 0) >= int(row.get("requested_count") or 0):
            raise HTTPException(status_code=409, detail="Reservation is fully used")
        return reservation_id

    res = await face_quota.reserve(db, profile["id"], 1, admin_id=admin_id)
    return res["reservation_id"]


# Face-match similarity is a server-side value; a guest never supplies it and an
# owner must not be able to floor it to near-zero (every face would "match").
# Clamp to [70, 100]: below ~70 Rekognition returns junk matches. Applied both
# where the owner sets it and where search reads it, so a legacy row that stored
# an out-of-range value is still corrected at use.
FACE_THRESHOLD_FLOOR = 70.0

def _clamp_threshold(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        v = 90.0
    return max(FACE_THRESHOLD_FLOOR, min(100.0, v))


async def _indexing_progress(db, profile_id: str) -> Dict[str, Any]:
    """Aggregate face-indexing state for the studio dashboard. `processing` is
    derived (total - indexed - failed) rather than stored, so it cannot
    disagree with the other two. `no_face` is a subset of `indexed`: a photo
    that indexed cleanly but contained no detectable face (INDEXED_NO_FACE) —
    not a failure, but distinct from an indexed-with-faces photo."""
    total = await db.gallery_photos.count_documents({"profile_id": profile_id})
    indexed = await db.gallery_photos.count_documents(
        {"profile_id": profile_id, "indexed": True})
    failed = await db.gallery_photos.count_documents(
        {"profile_id": profile_id, "indexed": False, "index_error": {"$exists": True}})
    no_face = await db.gallery_photos.count_documents(
        {"profile_id": profile_id, "indexed": True, "face_count": 0})
    return {"total": total, "indexed": indexed, "failed": failed,
            "no_face": no_face, "processing": max(0, total - indexed - failed)}


def build_gallery_router(db, get_current_admin, archive_fn=None):
    """`archive_fn` (optional): async callable used by bulk-upload's
    "also keep a copy in storage" consent to durably mirror each photo into the
    studio's Cloud Backup. Signature:
        await archive_fn(studio_id=..., data=bytes, filename=str,
                         mime=str, kind=str, folder_name=str) -> {"ok": bool, ...}
    It must never raise (returns a status dict); if None, archiving is a no-op.
    """
    router = APIRouter(prefix="/api", tags=["gallery"])

    # --------------------------------------------------------
    #  Admin — health + enable + methods
    # --------------------------------------------------------
    @router.get("/admin/gallery/aws/health")
    async def aws_health(admin_id: str = Depends(get_current_admin)):
        return healthcheck()

    @router.post("/admin/profiles/{profile_id}/gallery/enable")
    async def enable_gallery(profile_id: str, payload: EnableGalleryPayload,
                              admin_id: str = Depends(get_current_admin)):
        if not is_configured():
            raise HTTPException(status_code=503,
                detail="AWS not configured. Set AWS_* env vars and restart backend.")
        profile = await _require_owned_profile(db, profile_id, admin_id)

        collection_id = _profile_collection_id(profile["id"])
        if payload.enabled:
            get_face_provider().create_collection(collection_id)

        gc = profile.get("gallery_config") or {}
        gc.update({
            "enabled": payload.enabled,
            "face_search_enabled": True,
            "confidence_threshold": _clamp_threshold(payload.confidence_threshold),
            "aws_collection_id": collection_id,
            "upload_methods": (payload.upload_methods.model_dump()
                                if payload.upload_methods else UploadMethods().model_dump()),
            "live_upload_token": _issue_live_token(profile["id"]),
            "live_upload_expires_at": (_now() + timedelta(hours=LIVE_TOKEN_EXPIRY_HOURS)).isoformat(),
            "auto_delete_at": _compute_auto_delete_at(profile).isoformat(),
            "total_photos": int(gc.get("total_photos") or 0),
            "updated_at": _now().isoformat(),
        })
        await db.profiles.update_one({"id": profile["id"]}, {"$set": {"gallery_config": gc}})
        return {"success": True, "gallery_config": _redact(gc)}

    @router.patch("/admin/profiles/{profile_id}/gallery/upload-methods")
    async def update_methods(profile_id: str, payload: UpdateMethodsPayload,
                              admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        gc["upload_methods"] = payload.upload_methods.model_dump()
        gc["updated_at"] = _now().isoformat()
        await db.profiles.update_one({"id": profile["id"]}, {"$set": {"gallery_config": gc}})
        return {"success": True, "upload_methods": gc["upload_methods"]}

    @router.post("/admin/profiles/{profile_id}/gallery/regenerate-token")
    async def regen_token(profile_id: str,
                           admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        token = _issue_live_token(profile["id"])
        gc["live_upload_token"] = token
        gc["live_upload_expires_at"] = (_now() + timedelta(hours=LIVE_TOKEN_EXPIRY_HOURS)).isoformat()
        await db.profiles.update_one({"id": profile["id"]}, {"$set": {"gallery_config": gc}})
        return {"success": True, "token": token,
                "expires_at": gc["live_upload_expires_at"]}

    @router.get("/admin/profiles/{profile_id}/gallery/credentials")
    async def get_credentials(profile_id: str, request: Request,
                               admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")
        # Build public live URL based on the frontend origin
        frontend = os.environ.get("FRONTEND_URL", "")
        token = gc.get("live_upload_token") or _issue_live_token(profile["id"])
        live_url = f"{frontend}/live/{profile['id']}?token={token}"
        # SD-card mode endpoint
        backend = os.environ.get("REACT_APP_BACKEND_URL", "")
        sd_url = f"{backend}/api/live-upload/{profile['id']}?token={token}"
        return {
            "live_upload_url": live_url,
            "sd_card_post_url": sd_url,
            "live_token": token,
            "live_token_expires_at": gc.get("live_upload_expires_at"),
            "upload_methods": gc.get("upload_methods") or UploadMethods().model_dump(),
            "auto_delete_at": gc.get("auto_delete_at"),
            "aws_collection_id": gc.get("aws_collection_id"),
        }

    @router.get("/admin/profiles/{profile_id}/gallery/stats")
    async def stats(profile_id: str,
                     admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        total = await db.gallery_photos.count_documents({"profile_id": profile["id"]})
        with_faces = await db.gallery_photos.count_documents({"profile_id": profile["id"], "face_count": {"$gt": 0}})
        by_method = {}
        async for d in db.gallery_photos.aggregate([
            {"$match": {"profile_id": profile["id"]}},
            {"$group": {"_id": "$upload_method", "n": {"$sum": 1}}},
        ]):
            by_method[d["_id"] or "unknown"] = d["n"]
        last = await db.gallery_photos.find_one(
            {"profile_id": profile["id"]}, sort=[("created_at", -1)], projection={"_id": 0})
        # Face-photo-limit enforcement (docs §9 item 5): surface the resolved
        # cap and how many photos have been indexed against it, so the studio
        # sees "at limit" instead of guessing why later uploads stop matching.
        face_photo_limit = await resolve_face_photo_limit(db, profile["id"])
        indexed_count = await db.gallery_photos.count_documents(
            {"profile_id": profile["id"], "indexed": True})
        return {
            "enabled": bool(gc.get("enabled")),
            "total_photos": total,
            "photos_with_faces": with_faces,
            "by_method": by_method,
            "last_upload_at": last.get("created_at") if last else None,
            "auto_delete_at": gc.get("auto_delete_at"),
            "face_photo_limit": face_photo_limit,
            "indexed_count": indexed_count,
            "face_photo_limit_reached": bool(
                face_photo_limit is not None and indexed_count >= face_photo_limit),
        }

    @router.get("/admin/profiles/{profile_id}/gallery/photos")
    async def list_photos(profile_id: str, limit: int = 200, offset: int = 0,
                           event_invitation_id: Optional[str] = Query(None),
                           admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        query: Dict[str, Any] = {"profile_id": profile["id"]}
        if event_invitation_id:
            query["event_invitation_id"] = event_invitation_id
        cursor = db.gallery_photos.find(
            query, {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(min(limit, 500))
        out: List[dict] = []
        async for p in cursor:
            # A5 -- derived, no migration: surfaces the media_reconcile.py
            # state (indexed / index_error / storage_status) so the admin UI
            # can show a photo is still processing, failed, or missing.
            processing_status = ("indexed_no_face" if p.get("indexed") and not p.get("face_count") else
                                 "ready" if p.get("indexed") else
                                 "failed" if p.get("index_error") else
                                 "missing" if p.get("storage_status") == "missing" else
                                 "indexing")
            out.append({
                "id": p["id"],
                "upload_method": p.get("upload_method"),
                "event_invitation_id": p.get("event_invitation_id"),
                "face_count": p.get("face_count", 0),
                "width": p.get("width"),
                "height": p.get("height"),
                "file_size": p.get("file_size"),
                "created_at": p.get("created_at"),
                "processing_status": processing_status,
                "thumb_url": generate_signed_url(p["thumb_s3_key"], 3600),
                "original_url": generate_signed_url(p.get("original_s3_key") or p["s3_key"], 3600),
            })
        return {"photos": out, "total": len(out)}

    @router.get("/admin/profiles/{profile_id}/gallery/download-all")
    async def download_all_photos_manifest(profile_id: str,
                                            admin_id: str = Depends(get_current_admin)):
        """Manifest of signed download URLs for every photo in this profile's
        gallery. The old version streamed every original through this app
        server via `s3().get_object().read()` per photo — full bytes through
        EC2, whole body in RAM, for a thousand-photo wedding (recon §3/§13#13).
        The client now downloads each file directly from S3/CloudFront."""
        profile = await _require_owned_profile(db, profile_id, admin_id)

        photos: List[dict] = []
        async for p in db.gallery_photos.find(
            {"profile_id": profile["id"]}, {"_id": 0}
        ).sort("created_at", 1):
            photos.append(p)
        if not photos:
            raise HTTPException(status_code=404, detail="No photos in this gallery yet")

        files = [{"name": f"photo_{i+1:04d}.jpg",
                  "url": aws_service.generate_signed_url(
                      p.get("original_s3_key") or p["s3_key"], 3600)}
                 for i, p in enumerate(photos)]
        await record_usage("download_manifest", profile["id"])
        return {"files": files}

    @router.delete("/admin/profiles/{profile_id}/gallery/photos/{photo_id}")
    async def delete_photo(profile_id: str, photo_id: str,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        p = await db.gallery_photos.find_one(
            {"profile_id": profile["id"], "id": photo_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Photo not found")
        # Delete S3 objects (preview/thumb, plus the true original when this
        # row has one — pre-migration rows only ever had the two).
        objs = [{"Key": p["s3_key"]}, {"Key": p["thumb_s3_key"]}]
        if p.get("original_s3_key") and p["original_s3_key"] != p["s3_key"]:
            objs.append({"Key": p["original_s3_key"]})
        try:
            s3().delete_objects(Bucket=bucket(), Delete={"Objects": objs})
        except Exception as e:
            logger.warning("S3 delete failed: %s", e)
        # Delete faces from the face-match collection
        face_ids = p.get("aws_face_ids") or []
        if face_ids:
            try:
                gc = profile.get("gallery_config") or {}
                if gc.get("aws_collection_id"):
                    get_face_provider().delete_faces(gc["aws_collection_id"], face_ids)
            except Exception as e:
                logger.warning("delete_faces failed: %s", e)
        await db.gallery_photos.delete_one({"id": photo_id})
        return {"success": True}

    @router.post("/admin/profiles/{profile_id}/gallery/photos/bulk-delete")
    async def bulk_delete_photos(profile_id: str, body: BulkDeleteIn,
                                  admin_id: str = Depends(get_current_admin)):
        """Delete many selected photos in one call (studio multi-select).
        Same teardown as delete_photo — S3 objects + Rekognition faces + the
        row — but batched: one S3 delete_objects per 1000 keys and one
        delete_faces per 4096 face ids, instead of a round trip per photo."""
        profile = await _require_owned_profile(db, profile_id, admin_id)
        ids = [str(i) for i in (body.ids or []) if i][:1000]
        if not ids:
            raise HTTPException(status_code=400, detail="No photo ids provided")
        photos: List[dict] = []
        async for p in db.gallery_photos.find(
                {"profile_id": profile["id"], "id": {"$in": ids}}, {"_id": 0}):
            photos.append(p)
        if not photos:
            raise HTTPException(status_code=404, detail="No matching photos found")

        objs: List[dict] = []
        face_ids: List[str] = []
        for p in photos:
            objs.append({"Key": p["s3_key"]})
            objs.append({"Key": p["thumb_s3_key"]})
            if p.get("original_s3_key") and p["original_s3_key"] != p["s3_key"]:
                objs.append({"Key": p["original_s3_key"]})
            face_ids.extend(p.get("aws_face_ids") or [])
        try:
            for i in range(0, len(objs), 1000):
                s3().delete_objects(Bucket=bucket(), Delete={"Objects": objs[i:i + 1000]})
        except Exception as e:
            logger.warning("bulk S3 delete failed: %s", e)
        if face_ids:
            gc = profile.get("gallery_config") or {}
            cid = gc.get("aws_collection_id")
            if cid:
                try:
                    for i in range(0, len(face_ids), 4096):
                        get_face_provider().delete_faces(cid, face_ids[i:i + 4096])
                except Exception as e:
                    logger.warning("bulk delete_faces failed: %s", e)
        found = [p["id"] for p in photos]
        await db.gallery_photos.delete_many(
            {"profile_id": profile["id"], "id": {"$in": found}})
        return {"success": True, "deleted": len(found), "requested": len(ids)}

    # --------------------------------------------------------
    #  AI face-match photo quota — allocation, holds, extension
    # --------------------------------------------------------
    @router.get("/admin/profiles/{profile_id}/gallery/quota")
    async def gallery_quota(profile_id: str,
                             admin_id: str = Depends(get_current_admin)):
        """What the upload panel shows before a single byte moves: allocated /
        used / reserved / remaining, plus indexing progress and the real
        top-up SKUs. Prices come from the canonical catalogue — the browser
        never computes one."""
        profile = await _require_owned_profile(db, profile_id, admin_id)
        snap = await face_quota.snapshot(db, profile["id"])
        snap["indexing"] = await _indexing_progress(db, profile["id"])
        snap["extension"] = face_quota.extension_options()
        return snap

    @router.post("/admin/profiles/{profile_id}/gallery/quota/reserve")
    async def reserve_gallery_quota(profile_id: str, body: ReserveQuotaIn,
                                     admin_id: str = Depends(get_current_admin)):
        """Hold N photo slots for a batch. All-or-nothing: a batch that does
        not fit is refused whole, with the numbers needed to explain why and
        the SKUs needed to fix it. Nothing is uploaded to S3 until this
        succeeds."""
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")
        if not await cache_backend.rate_limit_allow(
                f"gallery_reserve:{admin_id}", QUOTA_RESERVE_PER_HOUR, 3600):
            raise HTTPException(status_code=429,
                                detail="Too many reservation attempts — try again shortly")
        try:
            return await face_quota.reserve(db, profile["id"], body.photo_count,
                                             admin_id=admin_id)
        except face_quota.QuotaExceeded as e:
            payload = dict(e.payload)
            payload["extension"] = face_quota.extension_options()
            raise HTTPException(status_code=409, detail=payload)

    @router.post("/admin/profiles/{profile_id}/gallery/quota/reservations/{rid}/release")
    async def release_gallery_quota(profile_id: str, rid: str,
                                     admin_id: str = Depends(get_current_admin)):
        """Batch cancelled in the browser. Idempotent — releasing an already
        committed/expired hold is a no-op, not an error."""
        profile = await _require_owned_profile(db, profile_id, admin_id)
        row = await face_quota.get(db, rid)
        if not row or row.get("profile_id") != profile["id"]:
            raise HTTPException(status_code=404, detail="Reservation not found")
        await face_quota.release(db, rid)
        return await face_quota.snapshot(db, profile["id"])

    @router.post("/admin/profiles/{profile_id}/gallery/bulk-upload")
    async def bulk_upload(profile_id: str, files: List[UploadFile] = File(...),
                           event_invitation_id: Optional[str] = Form(None),
                           archive_to_storage: bool = Form(False),
                           admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")
        # If tagging by event, validate the event belongs to this profile
        if event_invitation_id:
            ei = await db.event_invitations.find_one(
                {"id": event_invitation_id, "profile_id": profile["id"]}, {"_id": 0, "id": 1})
            if not ei:
                raise HTTPException(status_code=404,
                    detail="Event invitation not found for this profile")

        # "Also keep a copy in storage" consent → archive each photo into the
        # studio's Cloud Backup. Only attempted when the caller opts in AND an
        # archive_fn is wired; the studio owns the profile so admin_id is the
        # studio id. Failures degrade gracefully (never fail the upload).
        want_archive = bool(archive_to_storage) and archive_fn is not None
        studio_id = profile.get("admin_id") or admin_id
        folder_name = _backup_folder_name(profile)

        # Face-match quota, taken for the WHOLE batch before any byte is read.
        # Partial acceptance is not an option: the studio either has room for
        # all of them or is told exactly how short it is.
        try:
            reservation = await face_quota.reserve(
                db, profile["id"], len(files), admin_id=admin_id)
        except face_quota.QuotaExceeded as e:
            payload = dict(e.payload)
            payload["extension"] = face_quota.extension_options()
            raise HTTPException(status_code=409, detail=payload)
        reservation_id = reservation.get("reservation_id")

        # Several photos at a time (was one-by-one, which is why a batch crawled).
        results = await _ingest_many(files, lambda f: _ingest_photo(
            db, profile, gc, f, method="bulk", uploader="photographer",
            event_invitation_id=event_invitation_id,
            archive_fn=archive_fn if want_archive else None,
            studio_id=studio_id, folder_name=folder_name))

        # Commit exactly the photos that became NEW rows. A duplicate matched an
        # existing photo and inserted nothing, so it consumed no quota; the
        # unused part of the hold is released rather than left to time out.
        accepted = sum(1 for r in results if r.get("ok") and not r.get("duplicate"))
        if reservation_id:
            if accepted:
                await face_quota.commit(db, reservation_id, accepted)
            if accepted < len(files):
                await face_quota.release(db, reservation_id)

        archived = sum(1 for r in results if r.get("archived"))
        # Surface a single reason when archiving was requested but nothing stored
        # (e.g. the studio has no paid storage plan) so the UI can be honest.
        archive_reason = None
        if want_archive and archived == 0:
            for r in results:
                if r.get("ok") and r.get("archive_reason"):
                    archive_reason = r["archive_reason"]
                    break
        return {"success": True, "uploaded": sum(1 for r in results if r.get("ok")),
                "failed": sum(1 for r in results if not r.get("ok")),
                "skipped_duplicates": sum(1 for r in results if r.get("duplicate")),
                "archive_requested": want_archive,
                "archived": archived,
                "archive_reason": archive_reason,
                "results": results}

    # --------------------------------------------------------
    #  L1 -- direct-to-S3 presign upload (large media never transits FastAPI)
    # --------------------------------------------------------
    @router.post("/admin/profiles/{profile_id}/gallery/presign-upload")
    async def presign_upload(profile_id: str, body: PresignUploadIn,
                              admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        if not await cache_backend.rate_limit_allow(
                f"gallery_presign:{admin_id}", PRESIGN_PER_HOUR, 3600):
            raise HTTPException(status_code=429,
                                detail="Too many upload URLs requested — try again shortly")
        ct = (body.content_type or "").lower().split(";")[0].strip()
        if not ct.startswith("image/"):
            raise HTTPException(status_code=415, detail="Only image uploads are allowed")
        if body.size_bytes <= 0 or body.size_bytes > MAX_PRESIGN_BYTES:
            raise HTTPException(status_code=413,
                detail=f"Photo too large (max {MAX_PRESIGN_BYTES // (1024 * 1024)} MB)")
        if not is_configured():
            raise HTTPException(status_code=503, detail={"code": "S3_UNCONFIGURED"})

        # Quota is checked BEFORE the presigned URL exists, so a photo that
        # will not fit never reaches S3 at all.
        try:
            reservation_id = await _claim_quota_slot(
                db, profile, body.reservation_id, admin_id)
        except face_quota.QuotaExceeded as e:
            payload = dict(e.payload)
            payload["extension"] = face_quota.extension_options()
            raise HTTPException(status_code=409, detail=payload)

        ext = os.path.splitext(body.filename or "")[1].lower()[:10] or ".jpg"
        s3_key = f"{_staging_prefix(profile['id'])}{uuid.uuid4()}{ext}"
        # Write-ahead row: if commit-upload never happens (browser crash, drop,
        # or the guest just abandons the flow), this pending row is what lets
        # the upload_intents sweep find and reap the orphaned staging object.
        try:
            await db.upload_intents.insert_one({
                "id": str(uuid.uuid4()), "area": "gallery_staging",
                "profile_id": profile["id"], "admin_id": profile.get("admin_id") or admin_id,
                "key": s3_key, "status": "pending", "created_at": _now().isoformat(),
            })
        except Exception as e:
            logger.warning("upload_intents write-ahead insert failed for %s: %s", s3_key, e)
        # accelerate=True: gallery photos live in the event bucket, the one bucket
        # we enable Transfer Acceleration on. Distant uploaders (India -> us-east-2)
        # then PUT through the nearest AWS edge. No-op unless AWS_S3_ACCELERATE is on.
        upload_url = generate_presigned_put(s3_key, ct, expiry_seconds=GALLERY_PRESIGN_TTL,
                                            accelerate=True)
        return {"upload_url": upload_url, "s3_key": s3_key,
                "expires_in": GALLERY_PRESIGN_TTL, "reservation_id": reservation_id}

    @router.post("/admin/profiles/{profile_id}/gallery/commit-upload")
    async def commit_upload(profile_id: str, body: CommitUploadIn,
                             admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")

        # Path-traversal guard: the key must be one WE would have handed out
        # for THIS profile's staging area -- never trust a client-supplied key.
        if not body.s3_key.startswith(_staging_prefix(profile["id"])):
            raise HTTPException(status_code=403, detail="Key does not belong to this profile")

        # Re-verify the hold at commit time as well as at presign time: the
        # reservation may have been released or expired while the browser was
        # uploading, and a reservation belonging to another wedding is a 404.
        reservation_id = body.reservation_id
        if reservation_id:
            row = await face_quota.get(db, reservation_id)
            if not row or row.get("profile_id") != profile["id"]:
                raise HTTPException(status_code=404, detail="Reservation not found")

        try:
            head = await asyncio.to_thread(s3().head_object, Bucket=bucket(), Key=body.s3_key)
        except Exception as e:
            logger.warning("commit-upload head_object failed for %s: %s", body.s3_key, e)
            raise HTTPException(status_code=404, detail="Upload not found in storage")

        size = int(head.get("ContentLength") or 0)
        if size <= 0 or size > MAX_PRESIGN_BYTES:
            raise HTTPException(status_code=413, detail="Photo too large")
        content_type = head.get("ContentType") or "application/octet-stream"

        data = await asyncio.to_thread(
            lambda: s3().get_object(Bucket=bucket(), Key=body.s3_key)["Body"].read())

        def _store_original(original_key, original_mime, tags):
            _copy_staged_original(body.s3_key, original_key, original_mime, tags)

        result = await _ingest_photo_bytes(
            db, profile, gc, data,
            filename=body.original_name or body.s3_key.rsplit("/", 1)[-1],
            content_type=content_type, method="presign", uploader="photographer",
            max_bytes=MAX_PRESIGN_BYTES, store_original_fn=_store_original)

        # A new row means one purchased slot is now spent. A dedup hit inserted
        # nothing, so it must NOT consume quota.
        if result.get("ok") and not result.get("duplicate"):
            await face_quota.commit(db, reservation_id, 1)

        if result.get("ok"):
            # Staging object is spent once its bytes are either copied to the
            # final original key or matched an existing photo (dedup) -- either
            # way nothing still needs it.
            try:
                await asyncio.to_thread(s3().delete_object, Bucket=bucket(), Key=body.s3_key)
            except Exception as e:
                logger.warning("commit-upload staging cleanup failed for %s: %s", body.s3_key, e)
            try:
                await db.upload_intents.update_one(
                    {"key": body.s3_key, "status": "pending"}, {"$set": {"status": "committed"}})
            except Exception as e:
                logger.warning("upload_intents commit CAS failed for %s: %s", body.s3_key, e)
        # ponytail: a failed commit leaves the staging object in place -- its
        # upload_intents row stays "pending" and is reaped by the upload_intents
        # sweep (>24h pending), not retried here.
        return result

    # --------------------------------------------------------
    #  L1b -- multipart direct-to-S3 (parallel parts for big originals)
    # --------------------------------------------------------
    @router.post("/admin/profiles/{profile_id}/gallery/multipart/create")
    async def multipart_create(profile_id: str, body: MultipartCreateIn,
                                admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        if not await cache_backend.rate_limit_allow(
                f"gallery_presign:{admin_id}", PRESIGN_PER_HOUR, 3600):
            raise HTTPException(status_code=429,
                                detail="Too many upload URLs requested — try again shortly")
        ct = (body.content_type or "").lower().split(";")[0].strip()
        if not ct.startswith("image/"):
            raise HTTPException(status_code=415, detail="Only image uploads are allowed")
        if body.size_bytes <= 0 or body.size_bytes > MAX_PRESIGN_BYTES:
            raise HTTPException(status_code=413,
                detail=f"Photo too large (max {MAX_PRESIGN_BYTES // (1024 * 1024)} MB)")
        if not is_configured():
            raise HTTPException(status_code=503, detail={"code": "S3_UNCONFIGURED"})
        # Same quota gate as the single-PUT presign: nothing that will not fit
        # ever starts an upload.
        try:
            reservation_id = await _claim_quota_slot(
                db, profile, body.reservation_id, admin_id)
        except face_quota.QuotaExceeded as e:
            payload = dict(e.payload)
            payload["extension"] = face_quota.extension_options()
            raise HTTPException(status_code=409, detail=payload)

        ext = os.path.splitext(body.filename or "")[1].lower()[:10] or ".jpg"
        s3_key = f"{_staging_prefix(profile['id'])}{uuid.uuid4()}{ext}"
        try:
            await db.upload_intents.insert_one({
                "id": str(uuid.uuid4()), "area": "gallery_staging",
                "profile_id": profile["id"], "admin_id": profile.get("admin_id") or admin_id,
                "key": s3_key, "status": "pending", "created_at": _now().isoformat(),
            })
        except Exception as e:
            logger.warning("upload_intents write-ahead insert failed for %s: %s", s3_key, e)
        upload_id = await asyncio.to_thread(
            aws_service.create_multipart_upload, s3_key, ct)
        part_size = GALLERY_MULTIPART_PART_SIZE
        total_parts = max(1, (body.size_bytes + part_size - 1) // part_size)
        return {"s3_key": s3_key, "upload_id": upload_id, "part_size": part_size,
                "total_parts": total_parts, "reservation_id": reservation_id,
                "expires_in": GALLERY_PRESIGN_TTL}

    @router.post("/admin/profiles/{profile_id}/gallery/multipart/presign")
    async def multipart_presign(profile_id: str, body: MultipartPresignIn,
                                 admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        # The key must be one WE would have handed out for THIS profile's staging
        # area — never trust a client-supplied key (same guard as commit-upload).
        if not body.s3_key.startswith(_staging_prefix(profile["id"])):
            raise HTTPException(status_code=403, detail="Key does not belong to this profile")
        nums = [int(n) for n in body.part_numbers if 1 <= int(n) <= 10000][:1000]
        if not nums:
            raise HTTPException(status_code=400, detail="No valid part numbers")
        # generate_presigned_url is a local signing op (no network), so a plain
        # loop is fine — no thread offload needed.
        urls = {str(n): aws_service.presign_upload_part(
                    body.s3_key, body.upload_id, n, GALLERY_PRESIGN_TTL) for n in nums}
        return {"urls": urls}

    @router.post("/admin/profiles/{profile_id}/gallery/multipart/complete")
    async def multipart_complete(profile_id: str, body: MultipartCompleteIn,
                                  admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")
        if not body.s3_key.startswith(_staging_prefix(profile["id"])):
            raise HTTPException(status_code=403, detail="Key does not belong to this profile")

        reservation_id = body.reservation_id
        if reservation_id:
            row = await face_quota.get(db, reservation_id)
            if not row or row.get("profile_id") != profile["id"]:
                raise HTTPException(status_code=404, detail="Reservation not found")

        parts = [{"part_number": p.part_number, "etag": p.etag} for p in body.parts]
        if not parts:
            raise HTTPException(status_code=400, detail="No parts to complete")
        try:
            await asyncio.to_thread(aws_service.complete_multipart_upload,
                                    body.s3_key, body.upload_id, parts)
        except Exception as e:
            logger.warning("gallery multipart complete failed for %s: %s", body.s3_key, e)
            raise HTTPException(status_code=400, detail="Could not finalize the upload")

        # From here it is byte-for-byte commit_upload: the finalized object now
        # sits at s3_key exactly as a single-PUT staging object would.
        try:
            head = await asyncio.to_thread(s3().head_object, Bucket=bucket(), Key=body.s3_key)
        except Exception as e:
            logger.warning("multipart complete head_object failed for %s: %s", body.s3_key, e)
            raise HTTPException(status_code=404, detail="Upload not found in storage")

        size = int(head.get("ContentLength") or 0)
        if size <= 0 or size > MAX_PRESIGN_BYTES:
            raise HTTPException(status_code=413, detail="Photo too large")
        content_type = head.get("ContentType") or "application/octet-stream"

        data = await asyncio.to_thread(
            lambda: s3().get_object(Bucket=bucket(), Key=body.s3_key)["Body"].read())

        def _store_original(original_key, original_mime, tags):
            _copy_staged_original(body.s3_key, original_key, original_mime, tags)

        result = await _ingest_photo_bytes(
            db, profile, gc, data,
            filename=body.original_name or body.s3_key.rsplit("/", 1)[-1],
            content_type=content_type, method="presign-multipart", uploader="photographer",
            max_bytes=MAX_PRESIGN_BYTES, store_original_fn=_store_original)

        if result.get("ok") and not result.get("duplicate"):
            await face_quota.commit(db, reservation_id, 1)

        if result.get("ok"):
            try:
                await asyncio.to_thread(s3().delete_object, Bucket=bucket(), Key=body.s3_key)
            except Exception as e:
                logger.warning("multipart complete staging cleanup failed for %s: %s", body.s3_key, e)
            try:
                await db.upload_intents.update_one(
                    {"key": body.s3_key, "status": "pending"}, {"$set": {"status": "committed"}})
            except Exception as e:
                logger.warning("upload_intents commit CAS failed for %s: %s", body.s3_key, e)
        return result

    @router.post("/admin/profiles/{profile_id}/gallery/multipart/abort")
    async def multipart_abort(profile_id: str, body: MultipartAbortIn,
                               admin_id: str = Depends(get_current_admin)):
        # Client calls this when a multipart upload fails so S3 does not keep
        # (and bill for) orphaned parts. Idempotent on the S3 side.
        profile = await _require_owned_profile(db, profile_id, admin_id)
        if not body.s3_key.startswith(_staging_prefix(profile["id"])):
            raise HTTPException(status_code=403, detail="Key does not belong to this profile")
        await asyncio.to_thread(aws_service.abort_multipart_upload, body.s3_key, body.upload_id)
        try:
            await db.upload_intents.update_one(
                {"key": body.s3_key, "status": "pending"}, {"$set": {"status": "aborted"}})
        except Exception as e:
            logger.warning("upload_intents abort CAS failed for %s: %s", body.s3_key, e)
        return {"ok": True}

    # --------------------------------------------------------
    #  Live upload (token-gated, no login)
    # --------------------------------------------------------
    @router.post("/live-upload/{profile_id}")
    async def live_upload(profile_id: str, token: str = Query(...),
                           files: List[UploadFile] = File(...)):
        if not _verify_live_token(token, profile_id):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        profile = await _get_profile(db, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not enabled")
        # Same quota gate as the logged-in bulk lane. The phone-live token
        # authorises WHO may upload, never HOW MANY — otherwise the token
        # would be a way around the purchased limit.
        try:
            reservation = await face_quota.reserve(
                db, profile["id"], len(files),
                admin_id=profile.get("admin_id"))
        except face_quota.QuotaExceeded as e:
            raise HTTPException(status_code=409, detail=e.payload)
        reservation_id = reservation.get("reservation_id")

        results = await _ingest_many(files, lambda f: _ingest_photo(
            db, profile, gc, f, method="phone_live", uploader="photographer"))

        accepted = sum(1 for r in results if r.get("ok") and not r.get("duplicate"))
        if reservation_id:
            if accepted:
                await face_quota.commit(db, reservation_id, accepted)
            if accepted < len(files):
                await face_quota.release(db, reservation_id)

        return {"success": True,
                "uploaded": sum(1 for r in results if r.get("ok")),
                "failed": sum(1 for r in results if not r.get("ok")),
                "results": results}

    @router.get("/live-upload/{profile_id}/status")
    async def live_upload_status(profile_id: str, token: str = Query(...)):
        if not _verify_live_token(token, profile_id):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        profile = await _get_profile(db, profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        total = await db.gallery_photos.count_documents({"profile_id": profile["id"]})
        last = await db.gallery_photos.find_one(
            {"profile_id": profile["id"]}, sort=[("created_at", -1)], projection={"_id": 0})
        recent = []
        cursor = db.gallery_photos.find(
            {"profile_id": profile["id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(10)
        async for p in cursor:
            recent.append({
                "id": p["id"], "created_at": p.get("created_at"),
                "thumb_url": generate_signed_url(p["thumb_s3_key"], 3600),
            })
        return {
            "total_photos": total,
            "last_upload_at": last.get("created_at") if last else None,
            "recent": recent,
            "couple": f'{profile.get("bride_name", "")} & {profile.get("groom_name", "")}',
        }

    # --------------------------------------------------------
    #  Public — face search / photo grid / ZIP
    # --------------------------------------------------------
    @router.get("/public/gallery/{slug}/info")
    async def public_info(slug: str):
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        gc = profile.get("gallery_config") or {}
        return GalleryConfigPublic(
            enabled=bool(gc.get("enabled")),
            total_photos=int(gc.get("total_photos") or 0),
            face_search_enabled=bool(gc.get("face_search_enabled", True)),
            expires_at=(profile.get("link_expiry_date") or profile.get("expires_at")
                        and str(profile.get("link_expiry_date") or profile.get("expires_at"))),
            auto_delete_at=gc.get("auto_delete_at"),
        )

    @router.post("/public/gallery/{slug}/face-search")
    async def public_face_search(slug: str, request: Request,
                                   selfie: UploadFile = File(...)):
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        # Find-my-photos is NOT gated by the whole-album PIN. A guest scanning
        # the face-match QR takes one selfie and sees ONLY their own matches,
        # never the album — so the album passcode (enforce_gallery_access) does
        # not apply here; it stays on the all-photos routes. The single gallery
        # control on this path is the face-match on/off flag.
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("ai_face_match_enabled", True):
            raise HTTPException(status_code=403, detail="AI face match is disabled for this gallery")
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled") or not gc.get("face_search_enabled", True):
            raise HTTPException(status_code=400, detail="Face search not available")

        # T6 — DPDP: face matching needs an explicit, non-withdrawn consent for
        # this (gallery, guest IP) on file before any selfie is processed.
        guest_ip = client_ip(request)
        if privacy.get("ai_face_match_enabled", True):
            ip_hash = compute_ip_hash(guest_ip)
            if not await has_valid_consent(db, profile["id"], ip_hash):
                raise HTTPException(status_code=428, detail={
                    "code": "CONSENT_REQUIRED",
                    "message": "Consent needed for face matching"})

        # A4 — rate limit (per-guest + per-event). Same 429 + Retry-After shape
        # as the login lockout in server.py; a limiter for this route did not
        # exist before (/api/public/* bypasses the abuse/bot middlewares).
        if not await rate_limit_allow(f"face_search:ip:{guest_ip}",
                                       limit=FACE_SEARCH_LIMIT_PER_IP, window_seconds=3600):
            raise HTTPException(status_code=429, headers={"Retry-After": "3600"}, detail={
                "code": "RATE_LIMITED",
                "message": "Too many face searches from this device. Please try again in a bit."})
        if not await rate_limit_allow(f"face_search:profile:{profile['id']}",
                                       limit=FACE_SEARCH_LIMIT_PER_EVENT, window_seconds=3600):
            raise HTTPException(status_code=429, headers={"Retry-After": "3600"}, detail={
                "code": "RATE_LIMITED",
                "message": "This gallery is getting a lot of searches right now. Please try again in a bit."})

        _check_selfie_mime(selfie)
        data = await selfie.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Selfie too large (max 20 MB)")
        if not is_valid_image(data):
            raise HTTPException(status_code=400, detail="Invalid image")

        session_id = str(uuid.uuid4())
        # H — selfies live in the private face bucket (not the shared media
        # bucket): S3_BUCKET_FACE, falling back to the legacy default bucket
        # when unset so a single-bucket dev/test deploy keeps working.
        selfie_bucket = media_storage.bucket_for("face")
        selfie_key = media_storage.face_selfie_key(profile["id"], session_id)
        expire_at = (_now() + timedelta(hours=24)).strftime("%Y-%m-%d")

        # Selfie resize + S3 PUT stays synchronous/blocking here (small file,
        # needed either way — inline search reads it back in-memory below, a
        # queued search's worker re-downloads it from S3). Off the event loop
        # for the same reason as the old inline version: public endpoint, many
        # guests at once.
        def _upload_blocking():
            try:
                small = make_thumbnail(data, target_w=800, jpeg_quality=88)
            except Exception:
                small = data
            try:
                upload_bytes(selfie_key, small, "image/jpeg", bucket_name=selfie_bucket,
                             tags={"expire-at": expire_at, "kind": "selfie",
                                   "wedding": profile["id"]})
            except Exception as e:
                logger.warning("selfie upload failed: %s", e)
            return small

        small = await asyncio.to_thread(_upload_blocking)

        # T4 — selfie-hash cache: same face + same gallery within 24h skips
        # Rekognition entirely. Also stored on the session row (selfie_hash)
        # so face_consent.py's withdraw handler can find and purge the
        # matching cache entry when a guest withdraws consent.
        selfie_hash = hashlib.sha256(small).hexdigest()
        cache_key = f"fm:{profile['id']}:{selfie_hash}"
        cached = await kv_get_json(cache_key)
        now_iso = _now().isoformat()
        if cached is not None:
            await record_usage("face_search_cached", profile["id"])
            photo_ids = cached.get("matched_photo_ids") or []
            similarity_map = cached.get("similarity_map") or {}
            await db.face_search_sessions.insert_one({
                "id": session_id, "profile_id": profile["id"], "guest_ip": guest_ip,
                "selfie_s3_key": selfie_key, "selfie_bucket": selfie_bucket,
                "selfie_hash": selfie_hash,
                "matched_photo_ids": photo_ids,
                "similarity_map": similarity_map, "status": "done",
                "retry_count": 0,
                "created_at": now_iso, "last_activity_at": now_iso,
                "expires_at": (_now() + timedelta(hours=24)).isoformat(),
            })
            await _bump_privacy_stats(db, profile["id"], len(photo_ids))
            photos = await _photos_for_ids(db, profile["id"], photo_ids, similarity_map)
            return {"session_id": session_id, "status": "done",
                    "match_count": len(photos), "photos": photos}

        await db.face_search_sessions.insert_one({
            "id": session_id, "profile_id": profile["id"], "guest_ip": guest_ip,
            "selfie_s3_key": selfie_key, "selfie_bucket": selfie_bucket,
            "selfie_hash": selfie_hash,
            "matched_photo_ids": [], "similarity_map": {},
            "status": "queued", "retry_count": 0,
            "created_at": now_iso, "last_activity_at": now_iso,
            "expires_at": (_now() + timedelta(hours=24)).isoformat(),
        })

        queued = await face_queue.enqueue({"type": "FACE_SEARCH", "session_id": session_id,
                                            "profile_id": profile["id"], "attempt": 0})
        if not queued:
            # No Redis — run the same job body inline, right now (dev-machine
            # fallback; unchanged end-to-end behaviour without a worker).
            result = await run_search_job(db, session_id)
            if result.get("status") == "failed":
                raise HTTPException(status_code=422, detail=result.get("error") or "Face search failed")
            photos = await _photos_for_ids(db, profile["id"],
                                            result.get("matched_photo_ids") or [],
                                            result.get("similarity_map") or {})
            return {"session_id": session_id, "status": "done",
                    "match_count": len(photos), "photos": photos}

        return {"session_id": session_id, "status": "queued"}

    @router.post("/public/gallery/{slug}/face-search/{session_id}/retry")
    async def public_face_search_retry(slug: str, session_id: str, request: Request,
                                        selfie: UploadFile = File(...)):
        """Guest re-uploads a selfie into an EXISTING session — e.g. the first
        photo was blurry, or the search came back with nothing useful. Same
        gates as the main route (privacy/consent/both rate limits — a retry
        counts against them), plus retry-specific guards: session must belong
        to THIS profile (never let a session from event A be replayed against
        event B), not expired, not already mid-search, and under the
        per-session retry cap. Resets status to queued and re-runs search;
        never extends expires_at (24h selfie-retention ceiling is absolute)."""
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        # Same gate as the main face-search route: no album PIN, only the
        # face-match on/off flag. A retry is still find-my-photos, not album access.
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("ai_face_match_enabled", True):
            raise HTTPException(status_code=403, detail="AI face match is disabled for this gallery")
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled") or not gc.get("face_search_enabled", True):
            raise HTTPException(status_code=400, detail="Face search not available")

        guest_ip = client_ip(request)
        if privacy.get("ai_face_match_enabled", True):
            ip_hash = compute_ip_hash(guest_ip)
            if not await has_valid_consent(db, profile["id"], ip_hash):
                raise HTTPException(status_code=428, detail={
                    "code": "CONSENT_REQUIRED",
                    "message": "Consent needed for face matching"})

        # A retry counts against the same abuse caps as a fresh search.
        if not await rate_limit_allow(f"face_search:ip:{guest_ip}",
                                       limit=FACE_SEARCH_LIMIT_PER_IP, window_seconds=3600):
            raise HTTPException(status_code=429, headers={"Retry-After": "3600"}, detail={
                "code": "RATE_LIMITED",
                "message": "Too many face searches from this device. Please try again in a bit."})
        if not await rate_limit_allow(f"face_search:profile:{profile['id']}",
                                       limit=FACE_SEARCH_LIMIT_PER_EVENT, window_seconds=3600):
            raise HTTPException(status_code=429, headers={"Retry-After": "3600"}, detail={
                "code": "RATE_LIMITED",
                "message": "This gallery is getting a lot of searches right now. Please try again in a bit."})

        session = await db.face_search_sessions.find_one(
            {"id": session_id, "profile_id": profile["id"]}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if _session_is_expired(session):
            raise HTTPException(status_code=410, detail={"error": "session_expired"})
        status = session.get("status") or "done"  # legacy rows predate `status`
        if status not in ("failed", "done"):
            raise HTTPException(status_code=409, detail={"error": "search_in_progress"})
        if int(session.get("retry_count") or 0) >= FACE_SESSION_MAX_RETRIES:
            raise HTTPException(status_code=429, detail={"error": "retry_limit_reached"})

        _check_selfie_mime(selfie)
        data = await selfie.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Selfie too large (max 20 MB)")
        if not is_valid_image(data):
            raise HTTPException(status_code=400, detail="Invalid image")

        # Overwrite the selfie at the session's EXISTING key/bucket -- a retry
        # replaces the guest's selfie, it does not create a new object.
        selfie_key = session.get("selfie_s3_key") or media_storage.face_selfie_key(
            profile["id"], session_id)
        selfie_bucket = _selfie_bucket_for_session(session)
        expire_at = (_now() + timedelta(hours=24)).strftime("%Y-%m-%d")

        def _upload_blocking():
            try:
                small = make_thumbnail(data, target_w=800, jpeg_quality=88)
            except Exception:
                small = data
            try:
                upload_bytes(selfie_key, small, "image/jpeg", bucket_name=selfie_bucket,
                             tags={"expire-at": expire_at, "kind": "selfie",
                                   "wedding": profile["id"]})
            except Exception as e:
                logger.warning("selfie retry upload failed: %s", e)
            return small

        small = await asyncio.to_thread(_upload_blocking)
        selfie_hash = hashlib.sha256(small).hexdigest()

        # CAS: only a session still in a terminal state can be reclaimed for
        # retry -- guards a second retry racing this one (media_reconcile's
        # stale-search sweep could also have moved it to requeued_once in the
        # meantime, which is correctly NOT in this set).
        claimed = await db.face_search_sessions.find_one_and_update(
            {"id": session_id, "status": {"$in": ["failed", "done"]}},
            {"$set": {"status": "queued", "selfie_hash": selfie_hash,
                      "matched_photo_ids": [], "similarity_map": {}, "error": None,
                      "last_activity_at": _now().isoformat()},
             "$inc": {"retry_count": 1}})
        if not claimed:
            raise HTTPException(status_code=409, detail={"error": "search_in_progress"})

        # Selfie-hash cache short-circuit, same as the main route.
        cache_key = f"fm:{profile['id']}:{selfie_hash}"
        cached = await kv_get_json(cache_key)
        if cached is not None:
            await record_usage("face_search_cached", profile["id"])
            photo_ids = cached.get("matched_photo_ids") or []
            similarity_map = cached.get("similarity_map") or {}
            await db.face_search_sessions.update_one(
                {"id": session_id},
                {"$set": {"matched_photo_ids": photo_ids, "similarity_map": similarity_map,
                          "status": "done"}})
            await _bump_privacy_stats(db, profile["id"], len(photo_ids))
            photos = await _photos_for_ids(db, profile["id"], photo_ids, similarity_map)
            return {"session_id": session_id, "status": "done",
                    "match_count": len(photos), "photos": photos}

        queued = await face_queue.enqueue({"type": "FACE_SEARCH", "session_id": session_id,
                                            "profile_id": profile["id"], "attempt": 0})
        if not queued:
            result = await run_search_job(db, session_id)
            if result.get("status") == "failed":
                raise HTTPException(status_code=422, detail=result.get("error") or "Face search failed")
            photos = await _photos_for_ids(db, profile["id"],
                                            result.get("matched_photo_ids") or [],
                                            result.get("similarity_map") or {})
            return {"session_id": session_id, "status": "done",
                    "match_count": len(photos), "photos": photos}

        return {"session_id": session_id, "status": "queued"}

    # ---- guest photo request (selfie + contact → owner sorts & shares) -----
    # Guest-facing "Get your photos": collects a selfie + email + WhatsApp and
    # stores the request for the studio to fulfil. (Automated matching lands in
    # a later release; this captures the request in the meantime.)
    @router.post("/public/gallery/{slug}/photo-request")
    async def public_photo_request(slug: str, request: Request,
                                   selfie: UploadFile = File(...),
                                   email: str = Form(...),
                                   whatsapp: str = Form(...),
                                   name: str = Form("")):
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        # Manual fallback for find-my-photos — same access rule as face-search:
        # no album PIN, only the face-match on/off flag.
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("ai_face_match_enabled", True):
            raise HTTPException(status_code=403, detail="Photo requests are turned off for this gallery")

        email = (email or "").strip()
        whatsapp = (whatsapp or "").strip()
        if "@" not in email or "." not in email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Please enter a valid email address")
        digits = re.sub(r"\D", "", whatsapp)
        if len(digits) < 8:
            raise HTTPException(status_code=400, detail="Please enter a valid WhatsApp number")

        _check_selfie_mime(selfie)
        data = await selfie.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Selfie too large (max 20 MB)")
        if not is_valid_image(data):
            raise HTTPException(status_code=400, detail="Invalid image")
        req_id = str(uuid.uuid4())
        # Keep the selfie for the studio (no 24h auto-delete tag — the owner
        # needs it to identify the guest and share their photos).
        selfie_key = f"photo-requests/{profile['id']}/{req_id}.jpg"

        # Public endpoint, blocking resize + S3 PUT: off the event loop for the
        # same reason as the face search above.
        def _store_blocking():
            try:
                stored = make_thumbnail(data, target_w=1000, jpeg_quality=88)
            except Exception:
                stored = data
            try:
                upload_bytes(selfie_key, stored, "image/jpeg",
                             tags={"kind": "photo-request", "wedding": profile["id"]})
                return selfie_key
            except Exception as e:
                logger.warning("photo-request selfie upload failed: %s", e)
                return ""

        selfie_key = await asyncio.to_thread(_store_blocking)

        doc = {
            "id": req_id,
            "profile_id": profile["id"],
            "slug": slug,
            "name": (name or "").strip()[:120],
            "email": email[:200],
            "whatsapp": whatsapp[:40],
            "selfie_s3_key": selfie_key,
            "status": "pending",   # pending | shared | closed
            "created_at": _now().isoformat(),
        }
        await db.photo_requests.insert_one(doc)
        return {"ok": True, "request_id": req_id,
                "message": "Thanks! Your photos will be sent to your email and WhatsApp shortly."}

    # ---- studio: view + manage guest photo requests -----------------------
    @router.get("/admin/photo-requests")
    async def list_photo_requests(admin_id: str = Depends(get_current_admin)):
        my_profiles = await db.profiles.find({"admin_id": admin_id}, {"_id": 0, "id": 1}).to_list(500)
        pids = {p["id"] for p in my_profiles}
        rows = await db.photo_requests.find({}, {"_id": 0}).to_list(10000)
        out = []
        for r in rows:
            if r.get("profile_id") not in pids:
                continue
            if r.get("selfie_s3_key"):
                try:
                    r["selfie_url"] = generate_signed_url(r["selfie_s3_key"], 3600)
                except Exception:
                    r["selfie_url"] = ""
            out.append(r)
        out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"requests": out, "count": len(out),
                "pending": sum(1 for r in out if r.get("status") == "pending")}

    @router.post("/admin/photo-requests/{req_id}/status")
    async def set_photo_request_status(req_id: str, status: str = Query(...),
                                       admin_id: str = Depends(get_current_admin)):
        if status not in ("pending", "shared", "closed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        r = await db.photo_requests.find_one({"id": req_id}, {"_id": 0})
        if not r:
            raise HTTPException(status_code=404, detail="Request not found")
        prof = await db.profiles.find_one({"id": r.get("profile_id")}, {"_id": 0, "admin_id": 1})
        owner = (prof or {}).get("admin_id")
        if owner and owner != admin_id:
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
            if not admin or admin.get("role") != "super_admin":
                raise HTTPException(status_code=403, detail="Not your request")
        await db.photo_requests.update_one({"id": req_id}, {"$set": {"status": status}})
        return {"ok": True, "status": status}

    # ---- super-admin: all guest photo requests across every gallery -------
    @router.get("/admin/photo-requests/all")
    async def all_photo_requests(admin_id: str = Depends(get_current_admin)):
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not admin or admin.get("role") != "super_admin":
            raise HTTPException(status_code=403, detail="Super admin required")
        rows = await db.photo_requests.find({}, {"_id": 0}).to_list(20000)
        for r in rows:
            if r.get("selfie_s3_key"):
                try:
                    r["selfie_url"] = generate_signed_url(r["selfie_s3_key"], 3600)
                except Exception:
                    r["selfie_url"] = ""
        rows.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"requests": rows, "count": len(rows),
                "pending": sum(1 for r in rows if r.get("status") == "pending")}

    # T5 — was `/public/gallery/{slug}/photos`, but that path is registered a
    # second time (ungated) by live_gallery_features.py and Starlette matches
    # first-registered-wins, so this handler was unreachable dead code (recon
    # §13 #1). Renamed so it's actually reachable, and extended with a
    # status field now that search runs as an async job (T4).
    #
    # face_search_sessions state machine:
    #   queued  -> done | failed          (worker-owned; run_search_job writes it;
    #                                       media_reconcile's stale sweep can also
    #                                       move a stuck queued row to
    #                                       requeued_once -> failed)
    #   failed | done -> queued            (guest retry — POST .../retry above —
    #                                       resets matched_photo_ids/similarity_map
    #                                       /error, increments retry_count; never
    #                                       extends expires_at)
    #   "expired" is not a stored status — it is derived at READ time from
    #   expires_at (this endpoint and download-zip both 410 once past it via
    #   _session_is_expired) and swept hourly by cleanup_expired_selfies, which
    #   deletes the row and its selfie outright.
    #   A consent withdrawal (face_consent.py) hard-deletes the withdrawing
    #   guest's own session rows immediately, independent of this state machine.
    @router.get("/public/gallery/{slug}/face-results")
    async def public_face_results(slug: str, session_id: str = Query(...),
                                   request: Request = None):
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        # No album PIN — this returns only THIS session's own face matches.
        session = await db.face_search_sessions.find_one(
            {"id": session_id, "profile_id": profile["id"]}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if _session_is_expired(session):
            raise HTTPException(status_code=410, detail={"error": "session_expired"})
        status = session.get("status") or "done"  # legacy rows predate `status`
        if status == "failed":
            return {"status": "failed", "session_id": session_id,
                    "error": session.get("error"), "match_count": 0, "photos": []}
        if status != "done":
            return {"status": "queued", "session_id": session_id, "match_count": 0, "photos": []}
        photos = await _photos_for_ids(db, profile["id"],
                                        session.get("matched_photo_ids") or [],
                                        session.get("similarity_map") or {})
        return {"status": "done", "session_id": session_id,
                "match_count": len(photos), "photos": photos}

    @router.get("/public/gallery/{slug}/download-zip")
    async def public_zip_manifest(slug: str, session_id: str = Query(...), request: Request = None):
        """Manifest of signed download URLs for a face-search session's
        matches — see download_all_photos_manifest for why this stopped
        proxying bytes through the app server."""
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        # No album PIN — a face-match session's own matches only. Keep the
        # downloads-allowed switch; the per-guest cap is enforced below.
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("allow_downloads", True):
            raise HTTPException(status_code=403, detail="Downloads are disabled for this gallery")
        session = await db.face_search_sessions.find_one(
            {"id": session_id, "profile_id": profile["id"]}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if _session_is_expired(session):
            raise HTTPException(status_code=410, detail={"error": "session_expired"})
        ids = session.get("matched_photo_ids") or []
        if not ids:
            raise HTTPException(status_code=404, detail="No photos in session")
        photos = []
        async for p in db.gallery_photos.find(
            {"profile_id": profile["id"], "id": {"$in": ids}}, {"_id": 0}):
            photos.append(p)
        # Cap the legacy bulk manifest to the same per-guest ceiling as the
        # per-photo grant path, so this route can't be used to exceed it. The
        # current guest UI no longer calls this (per-photo capped download
        # instead); kept only for old links / defence in depth.
        photos = photos[:FACE_DOWNLOAD_CAP]

        files = [{"name": f"photo_{i+1:03d}.jpg",
                  "url": aws_service.generate_signed_url(
                      p.get("original_s3_key") or p["s3_key"], 3600)}
                 for i, p in enumerate(photos)]
        await record_usage("download_manifest", profile["id"])
        return {"files": files}

    # --------------------------------------------------------
    #  Public — whole-album browse (QR "all photos") + capped downloads
    # --------------------------------------------------------
    @router.get("/public/gallery/{slug}/all-photos")
    async def public_all_photos(slug: str, request: Request = None,
                                 limit: int = 200, offset: int = 0):
        """Every event photo, thumbnails only (PIN-gated). Full-res is never
        handed out here — a guest downloads through public_download_grant, which
        enforces the per-device cap. That is what makes the cap real."""
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        from gallery_privacy import enforce_gallery_access
        await enforce_gallery_access(profile, request)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            raise HTTPException(status_code=400, detail="Gallery not available")
        # Respect the photographer's "whole album" toggle: when the full gallery
        # is switched off, the QR all-photos view is closed and guests use face
        # match instead (same rule the live wall applies).
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("private_full_gallery_enabled", True):
            raise HTTPException(status_code=403, detail={
                "code": "ALBUM_DISABLED",
                "message": "The full album isn't shared for this event — try Find my photos."})
        limit = max(1, min(int(limit or 200), 500))
        offset = max(0, int(offset or 0))
        total = await db.gallery_photos.count_documents({"profile_id": profile["id"]})
        out: List[dict] = []
        cursor = db.gallery_photos.find(
            {"profile_id": profile["id"]}, {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)
        async for p in cursor:
            out.append({"id": p["id"],
                        "thumb_url": generate_signed_url(p["thumb_s3_key"], 3600),
                        "created_at": p.get("created_at")})
        return {"photos": out, "total": total,
                "download_cap": ALL_PHOTOS_DOWNLOAD_CAP}

    @router.post("/public/gallery/{slug}/download")
    async def public_download_grant(slug: str, body: DownloadGrantIn,
                                     request: Request = None):
        """Grant ONE full-res download, counting it against the guest's cap.
        Re-downloading a photo the guest already got does not spend the cap
        again (the count is over distinct photos). Returns the remaining count
        so the UI can show and stop at the limit."""
        profile = await _get_profile(db, slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        privacy = profile.get("gallery_privacy") or {}
        if privacy.get("enabled") and not privacy.get("allow_downloads", True):
            raise HTTPException(status_code=403, detail="Downloads are disabled for this gallery")

        scope = "face" if body.scope == "face" else "all"
        if scope == "face":
            # Face-match download: NO album PIN. Ownership is proven by the guest's
            # own session + mobile, and capped per guest below.
            cap = FACE_DOWNLOAD_CAP
            key = _normalize_mobile(body.mobile)
            if not key:
                raise HTTPException(status_code=400, detail={
                    "code": "MOBILE_REQUIRED",
                    "message": "Enter your mobile number to download your photos."})
            # The photo must be one of THIS guest's matches, proven by session.
            session = await db.face_search_sessions.find_one(
                {"id": body.session_id or "", "profile_id": profile["id"]}, {"_id": 0})
            if not session or body.photo_id not in (session.get("matched_photo_ids") or []):
                raise HTTPException(status_code=403, detail="Photo is not in your matches")
        else:
            # Whole-album download: album PIN required (same gate as all-photos).
            from gallery_privacy import enforce_gallery_access
            await enforce_gallery_access(profile, request)
            cap = ALL_PHOTOS_DOWNLOAD_CAP
            key = (body.device_id or "").strip()[:64]
            if not key:
                raise HTTPException(status_code=400, detail="Device id required")

        photo = await db.gallery_photos.find_one(
            {"profile_id": profile["id"], "id": body.photo_id}, {"_id": 0})
        if not photo:
            raise HTTPException(status_code=404, detail="Photo not found")

        counter_id = f"{profile['id']}:{scope}:{key}"
        ctr = await db.gallery_download_counters.find_one({"id": counter_id}, {"_id": 0})
        got = list((ctr or {}).get("photo_ids") or [])
        if body.photo_id not in got:
            if len(got) >= cap:
                raise HTTPException(status_code=429, detail={
                    "code": "DOWNLOAD_LIMIT",
                    "message": f"You can download up to {cap} photos.",
                    "cap": cap, "remaining": 0})
            got.append(body.photo_id)
            now = _now().isoformat()
            if ctr:
                await db.gallery_download_counters.update_one(
                    {"id": counter_id},
                    {"$set": {"photo_ids": got, "count": len(got), "updated_at": now}})
            else:
                await db.gallery_download_counters.insert_one({
                    "id": counter_id, "profile_id": profile["id"], "scope": scope,
                    "key": key, "photo_ids": got, "count": len(got),
                    "created_at": now, "updated_at": now})
        url = aws_service.generate_signed_url(
            photo.get("original_s3_key") or photo["s3_key"], 3600)
        await record_usage("download_grant", profile["id"])
        return {"url": url, "remaining": max(0, cap - len(got)), "cap": cap}

    return router


# ============================================================
#  Job bodies — T3/T4. Each is the SAME function whether it runs inline
#  (no Redis) or as a worker.py job popped off face_queue.QUEUE. Never raise:
#  failures are reported in the return dict and written to the DB row/session
#  so face_ops / face-results can surface them.
# ============================================================
async def resolve_face_photo_limit(db, profile_id: str) -> Optional[int]:
    """Docs §9 item 5 / Phase 8: the photo-indexing cap for one wedding.

    Resolution rule: MAX `face_photo_limit` across this wedding's PAID orders
    (`invitation_orders.profile_id` is the order->wedding link, stamped when the
    studio delivers/builds the invitation). Returns None (unlimited) when no
    order links here, or none of them purchased a numbered face-match SKU —
    that includes every legacy flat `ai_face_match` order, which never had a
    `face_photo_limit` stamped (store_features.py only stamps it for the
    face_match_2000/3000/5000 SKUs) and so must keep working exactly as before,
    with no cap."""
    if not profile_id:
        return None
    orders = await db.invitation_orders.find(
        {"profile_id": profile_id, "status": "paid"},
        {"_id": 0, "face_photo_limit": 1}).to_list(1000)
    limits = [o["face_photo_limit"] for o in orders if isinstance(o.get("face_photo_limit"), int)]
    return max(limits) if limits else None


async def index_photo_job(db, photo_id: str) -> Dict[str, Any]:
    """FACE_INDEX job body. Loads the photo, runs Rekognition index_faces,
    and updates the row. On any failure writes `index_error` (face_ops reads
    this field; nothing used to set it — recon §10/§13 #5)."""
    photo = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        return {"ok": False, "error": "photo_not_found"}
    profile = await _get_profile(db, photo["profile_id"])
    if not profile:
        await db.gallery_photos.update_one(
            {"id": photo_id}, {"$set": {"index_error": "no_profile"}})
        return {"ok": False, "error": "no_profile"}
    gc = profile.get("gallery_config") or {}
    collection_id = gc.get("aws_collection_id")
    if not collection_id:
        # Lazy create: an index job can be queued (upload committed) before the
        # admin flips gallery-enable, which is what actually minted the
        # collection id. Derive the deterministic per-event id and create it
        # (idempotent) so the job completes rather than dying as "no_collection".
        # This does NOT enable the gallery — it only ensures the collection the
        # index needs exists, then persists the id so later reads find it.
        collection_id = _profile_collection_id(photo["profile_id"])
        try:
            await asyncio.to_thread(get_face_provider().create_collection, collection_id)
        except Exception as e:
            logger.warning("[face_index] lazy create_collection(%s) failed: %s", collection_id, e)
        await db.profiles.update_one(
            {"id": photo["profile_id"]},
            {"$set": {"gallery_config.aws_collection_id": collection_id}})

    # Server-side face-photo-limit enforcement (docs §9 item 5). Excludes THIS
    # photo from the count so a reindex/retry of an already-indexed photo is
    # never blocked by its own prior indexing.
    limit = await resolve_face_photo_limit(db, photo["profile_id"])
    if limit is not None:
        indexed_count = await db.gallery_photos.count_documents(
            {"profile_id": photo["profile_id"], "indexed": True, "id": {"$ne": photo_id}})
        if indexed_count >= limit:
            logger.info("[face_index] profile=%s photo=%s refused: at limit (%d/%d)",
                        photo["profile_id"], photo_id, indexed_count, limit)
            await db.gallery_photos.update_one(
                {"id": photo_id}, {"$set": {"index_error": "face_photo_limit_reached"}})
            return {"ok": False, "error": "face_photo_limit_reached",
                    "limit": limit, "indexed_count": indexed_count}
    try:
        provider = get_face_provider()
        # Idempotency: a prior (partial or full) index of this photo may have left
        # FaceRecords in the collection. Rekognition's IndexFaces APPENDS, so a
        # retry/reindex without deleting first accumulates duplicate, orphaned
        # vectors (permanent AWS cost + skewed match results). Delete the known
        # old face ids before re-indexing.
        old_face_ids = photo.get("aws_face_ids") or []
        is_retry = bool(photo.get("index_error") or photo.get("needs_reindex"))
        if old_face_ids:
            # Fast path: delete the vectors we recorded on the prior index.
            try:
                await asyncio.to_thread(provider.delete_faces, collection_id, old_face_ids)
            except Exception as e:
                logger.warning("pre-reindex delete_faces failed for %s: %s", photo_id, e)
        elif is_retry:
            # Crash-orphan path: a prior IndexFaces may have SUCCEEDED without
            # persisting its face ids (worker died between the AWS call and the
            # DB write), leaving orphaned vectors this row has no record of.
            # Enumerate this photo's faces by external id and purge them so the
            # re-index below can't append duplicates. Best-effort — returns []
            # without rekognition:ListFaces, degrading to the old behaviour.
            try:
                orphan_ids = await asyncio.to_thread(
                    provider.list_face_ids_for_image, collection_id, photo_id)
                if orphan_ids:
                    await asyncio.to_thread(provider.delete_faces, collection_id, orphan_ids)
                    logger.info("[face_index] purged %d orphaned vector(s) for %s",
                                len(orphan_ids), photo_id)
            except Exception as e:
                logger.warning("orphan purge failed for %s: %s", photo_id, e)
        # 2048w preview is ample for Rekognition and caps S3-object cost; fall
        # back to s3_key for rows indexed before the preview/original split.
        index_key = photo.get("preview_s3_key") or photo["s3_key"]
        index_res = await asyncio.to_thread(
            provider.index_photo_faces, collection_id, index_key,
            external_image_id=photo_id, max_faces=15)
        if not index_res.get("ok"):
            err = index_res.get("error") or "index_failed"
            await db.gallery_photos.update_one(
                {"id": photo_id}, {"$set": {"index_error": err}})
            return {"ok": False, "error": err}
        await db.gallery_photos.update_one(
            {"id": photo_id},
            {"$set": {"face_count": int(index_res.get("face_count") or 0),
                      "aws_face_ids": index_res.get("face_ids") or [],
                      "indexed": True},
             "$unset": {"needs_reindex": "", "index_error": ""}})
        face_count = int(index_res.get("face_count") or 0)
        await record_usage("face_index", photo["profile_id"])
        if face_count:
            await record_usage("faces_indexed", photo["profile_id"], amount=face_count)
        return {"ok": True, "face_count": index_res.get("face_count") or 0}
    except Exception as e:
        logger.exception("index_photo_job failed for %s", photo_id)
        await db.gallery_photos.update_one(
            {"id": photo_id}, {"$set": {"index_error": str(e)[:300]}})
        return {"ok": False, "error": str(e)[:300]}


async def run_search_job(db, session_id: str) -> Dict[str, Any]:
    """FACE_SEARCH job body. Downloads the selfie back from S3 (small file —
    selfies are thumbnailed to 800px before upload), runs
    search_faces_by_selfie, and stores the result on the session. Also writes
    the 24h selfie-hash cache so a repeat search of the same face + gallery
    skips Rekognition (recon §10/§13 #8)."""
    session = await db.face_search_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        return {"status": "failed", "error": "session_not_found"}
    profile = await _get_profile(db, session["profile_id"])
    if not profile:
        await db.face_search_sessions.update_one(
            {"id": session_id}, {"$set": {"status": "failed", "error": "profile_not_found"}})
        return {"status": "failed", "error": "profile_not_found"}
    gc = profile.get("gallery_config") or {}
    collection_id = gc.get("aws_collection_id")
    threshold = _clamp_threshold(gc.get("confidence_threshold"))
    provider = get_face_provider()

    def _search_blocking():
        resp = s3().get_object(Bucket=_selfie_bucket_for_session(session), Key=session["selfie_s3_key"])
        selfie_bytes = resp["Body"].read()
        selfie_hash = hashlib.sha256(selfie_bytes).hexdigest()
        result = provider.search_by_selfie(collection_id, selfie_bytes,
                                           threshold=threshold, max_faces=200)
        return selfie_hash, result

    try:
        selfie_hash, result = await asyncio.to_thread(_search_blocking)
    except Exception as e:
        # The real exception (which can carry AWS/Rekognition/S3 detail) goes to
        # the server log ONLY. The guest gets a generic message — never a raw
        # provider error, an S3 key, or an internal id (Phase 8).
        logger.exception("run_search_job failed for %s: %s", session_id, str(e)[:300])
        guest_err = "The search ran into a problem. Please try again."
        await db.face_search_sessions.update_one(
            {"id": session_id}, {"$set": {"status": "failed", "error": guest_err}})
        return {"status": "failed", "error": guest_err}

    await record_usage("face_search", profile["id"])
    if not result.get("ok"):
        raw = result.get("message") or result.get("error") or "search_failed"
        logger.warning("face search provider error for %s: %s", session_id, raw)
        guest_err = "The search ran into a problem. Please try again."
        await db.face_search_sessions.update_one(
            {"id": session_id}, {"$set": {"status": "failed", "error": guest_err}})
        return {"status": "failed", "error": guest_err}

    photo_ids = [m["photo_id"] for m in result["matches"]]
    similarity_map = {m["photo_id"]: m["similarity"] for m in result["matches"]}
    await db.face_search_sessions.update_one(
        {"id": session_id},
        {"$set": {"matched_photo_ids": photo_ids, "similarity_map": similarity_map,
                  "status": "done"}})
    await _bump_privacy_stats(db, profile["id"], len(photo_ids))
    try:
        await kv_set_json(f"fm:{profile['id']}:{selfie_hash}",
                          {"matched_photo_ids": photo_ids, "similarity_map": similarity_map},
                          ttl_seconds=86400)
    except Exception as e:
        logger.warning("selfie-hash cache write failed: %s", e)

    return {"status": "done", "matched_photo_ids": photo_ids, "similarity_map": similarity_map}


async def _bump_privacy_stats(db, profile_id: str, matched_count: int) -> None:
    """Best-effort analytics increment — a no-op if the gallery isn't
    privacy-protected (the sub-doc doesn't exist, $inc creates it as 0s)."""
    try:
        await db.profiles.update_one(
            {"id": profile_id},
            {"$inc": {"gallery_privacy.stats.ai_uploads": 1,
                      "gallery_privacy.stats.matched_results": matched_count}})
    except Exception:
        pass


def _normalize_mobile(raw: Optional[str]) -> Optional[str]:
    """Digits-only mobile key for download-cap counting. None if fewer than 8
    digits — same floor as the photo-request WhatsApp check."""
    digits = re.sub(r"\D", "", raw or "")
    return digits[-15:] if len(digits) >= 8 else None


async def _photos_for_ids(db, profile_id: str, ids: List[str],
                          similarity_map: Dict[str, float]) -> List[dict]:
    """Shared photo-response builder for face-search results (used by the
    inline path, the selfie-hash cache-hit path, and the face-results
    endpoint) — signed THUMB URL only, sorted by similarity.

    Deliberately no original_url: a guest downloads the full-res through
    public_download_grant, which counts it against the 10-photo cap. Handing
    the original URL out here would let the client keep every match and make
    the cap meaningless."""
    photos: List[dict] = []
    if not ids:
        return photos
    cursor = db.gallery_photos.find(
        {"profile_id": profile_id, "id": {"$in": ids}}, {"_id": 0})
    async for p in cursor:
        photos.append({
            "id": p["id"],
            "thumb_url": generate_signed_url(p["thumb_s3_key"], 3600),
            "similarity": round(similarity_map.get(p["id"], 0.0), 1),
            "created_at": p.get("created_at"),
        })
    photos.sort(key=lambda x: -x["similarity"])
    return photos


# ============================================================
#  Internal — ingest a single uploaded photo
# ============================================================
def _backup_folder_name(profile: dict) -> str:
    """Human-friendly Cloud Backup folder for a wedding's archived photos."""
    bride = (profile.get("bride_name") or "").strip()
    groom = (profile.get("groom_name") or "").strip()
    couple = " & ".join([n for n in (bride, groom) if n])
    base = couple or (profile.get("slug") or "Wedding")
    return f"{base} — Live Gallery"[:120]


# How many photos are processed at once by a bulk upload. Each in-flight photo
# holds its bytes plus two JPEG renditions in memory, so this is deliberately
# small and bounded: 4 gives most of the speed-up of unlimited parallelism
# without letting a 40-photo batch balloon the container's memory. Override with
# GALLERY_BULK_CONCURRENCY if a bigger box wants more.
_BULK_CONCURRENCY = max(1, int(os.environ.get("GALLERY_BULK_CONCURRENCY", "4")))


_MAX_FILES_PER_REQUEST = 40  # cap files in one multipart request (per-file byte cap is separate)


async def _ingest_many(files, ingest_one):
    """Run `ingest_one(file)` over `files`, `_BULK_CONCURRENCY` at a time.

    Results come back in the SAME order as the files, so the per-file report the
    UI shows still lines up with what the photographer selected. One photo
    failing never cancels the rest — a bad file among twenty must not lose the
    other nineteen.
    """
    if len(files) > _MAX_FILES_PER_REQUEST:
        raise HTTPException(400, f"Too many files in one request (max {_MAX_FILES_PER_REQUEST}).")
    sem = asyncio.Semaphore(_BULK_CONCURRENCY)

    async def _one(f):
        async with sem:
            try:
                return await ingest_one(f)
            except Exception as e:                      # pragma: no cover - defensive
                logger.exception("bulk ingest task failed")
                return {"ok": False, "filename": getattr(f, "filename", None),
                        "error": str(e)[:200]}

    return list(await asyncio.gather(*[_one(f) for f in files]))


async def _ingest_photo(db, profile: dict, gc: dict, upload_file: UploadFile,
                         method: str, uploader: str,
                         event_invitation_id: Optional[str] = None,
                         archive_fn=None, studio_id: Optional[str] = None,
                         folder_name: Optional[str] = None) -> Dict[str, Any]:
    """Multipart entry point (bulk-upload, live-upload): read the UploadFile,
    then hand off to the shared core pipeline. commit_upload (L1 presign flow)
    calls that core directly -- its bytes already came from S3, not a request
    body -- so both paths run the exact same validate/dedup/derive/index logic
    with only the original-storage step differing (see store_original_fn)."""
    try:
        data = await upload_file.read()
    except Exception as e:
        logger.exception("ingest_photo failed reading upload")
        return {"ok": False, "filename": upload_file.filename, "error": str(e)[:200]}
    return await _ingest_photo_bytes(
        db, profile, gc, data, upload_file.filename or "", upload_file.content_type or "",
        method, uploader, max_bytes=MAX_UPLOAD_BYTES,
        event_invitation_id=event_invitation_id, archive_fn=archive_fn,
        studio_id=studio_id, folder_name=folder_name)


async def _ingest_photo_bytes(db, profile: dict, gc: dict, data: bytes,
                               filename: str, content_type: str,
                               method: str, uploader: str,
                               max_bytes: int = MAX_UPLOAD_BYTES,
                               event_invitation_id: Optional[str] = None,
                               archive_fn=None, studio_id: Optional[str] = None,
                               folder_name: Optional[str] = None,
                               store_original_fn: Optional[Callable[[str, str, Dict[str, str]], None]] = None
                               ) -> Dict[str, Any]:
    """Core ingest pipeline -- validate, dedup, derive preview/thumb, store the
    original, insert the row, queue face indexing, best-effort archive mirror.

    `store_original_fn(original_key, original_mime, tags)`, when given, is
    called instead of `upload_bytes` for the original -- commit_upload passes
    one that S3-copies an already-uploaded staging object rather than
    re-uploading bytes this server just downloaded.
    """
    try:
        # PHOTOS ONLY, decided from the bytes. The old check trusted
        # `content_type.startswith("image/")`, which the client controls — and it
        # accepted image/svg+xml, i.e. scriptable XML served from our own origin.
        from photo_guard import sniff_photo, NotAPhoto  # noqa: F401
        ok, err, _fmt = sniff_photo(data, filename or "", content_type or "",
                                    max_bytes=max_bytes)
        if not ok:
            # Per-file result (this runs inside a bulk loop): the caller reports
            # which files were skipped and why, and keeps the good ones.
            return {"ok": False, "filename": filename,
                    "error": "not_a_photo", "message": err,
                    "max_bytes": max_bytes}

        # DEDUP: same profile + same bytes -> skip S3 write and Rekognition
        # entirely, hand back the photo that's already there. sha256 of the
        # RAW uploaded bytes, computed before any S3 write.
        # ponytail: plain find-then-insert, not atomic against a concurrent
        # identical upload landing in the same instant — worst case is one
        # duplicate photo stored, not data loss. Upgrade to a unique index /
        # find_one_and_update guard if that race starts mattering.
        checksum = hashlib.sha256(data).hexdigest()
        existing = await db.gallery_photos.find_one(
            {"profile_id": profile["id"], "checksum": checksum}, {"_id": 0})
        if existing:
            await record_usage("duplicate_skipped", profile["id"])
            return {**existing, "ok": True, "duplicate": True,
                    "filename": filename}

        photo_id = str(uuid.uuid4())
        keys = _photo_keys(profile["id"], photo_id)
        original_ext, original_mime = _original_ext_mime(_fmt)
        original_key = _original_key(profile["id"], photo_id, original_ext)
        auto_del = gc.get("auto_delete_at") or _compute_auto_delete_at(profile).isoformat()
        expire_tag = auto_del[:10]  # YYYY-MM-DD
        tags = {"expire-at": expire_tag, "wedding": profile["id"], "method": method}

        # ------------------------------------------------------------------
        # PERF: everything below is BLOCKING — Pillow decode/resize/encode and
        # three S3 PUTs. It used to run directly on the event loop, so a
        # 20-photo upload froze the whole server for a minute: the studio's
        # upload crawled AND every guest opening an invitation waited behind
        # it. Moved onto a worker thread so the loop stays free, and the
        # callers now run several photos at once (see _BULK_CONCURRENCY).
        #
        # T3: Rekognition indexing is NO LONGER done here. It used to run
        # inline in this same thread (~1-3s per photo, no retry, and any
        # failure was silently swallowed — nothing ever recorded it). It's
        # now `index_photo_job`, queued via face_queue and picked up by
        # worker.py; with no Redis configured it still runs inline right
        # below, just as its own step with its own error handling.
        #
        # A3: the photographer's true original used to be discarded — this
        # re-encoded EVERY upload to a 2000w JPEG and stored that as the
        # "original". media_derivatives.make_standard_set instead passes the
        # uploaded bytes through UNTOUCHED for `original`, and derives the
        # preview/thumb from one shared decode.
        # ------------------------------------------------------------------
        def _process_blocking():
            derivatives = media_derivatives.make_standard_set(data)
            _preview, pw, ph = derivatives["preview"]
            _thumb, _tw, _th = derivatives["thumb"]
            if store_original_fn:
                store_original_fn(original_key, original_mime, tags)
            else:
                upload_bytes(original_key, derivatives["original"], original_mime, tags=tags)
            upload_bytes(keys["preview"], _preview, "image/jpeg", tags=tags)
            upload_bytes(keys["thumb"], _thumb, "image/webp", tags=tags)
            return _preview, _thumb, pw, ph

        preview_jpeg, thumb_webp, width, height = await asyncio.to_thread(_process_blocking)

        doc = {
            "id": photo_id,
            "profile_id": profile["id"],
            "event_invitation_id": event_invitation_id,
            # Legacy aliases — every existing reader (listing, downloads,
            # delete, indexing) keeps working unmodified: s3_key/thumb_s3_key
            # now point at the preview/thumb derivatives, not a re-encoded
            # "original".
            "s3_key": keys["preview"],
            "thumb_s3_key": keys["thumb"],
            "original_s3_key": original_key,
            "preview_s3_key": keys["preview"],
            "checksum": checksum,
            "upload_method": method,
            "uploaded_by": uploader,
            "file_size": len(preview_jpeg),
            "original_bytes": len(data),
            "preview_bytes": len(preview_jpeg),
            "thumb_bytes": len(thumb_webp),
            "width": width,
            "height": height,
            "face_count": 0,
            "aws_face_ids": [],
            "indexed": False,
            "created_at": _now().isoformat(),
            "expires_at": auto_del,
        }
        await db.gallery_photos.insert_one(doc)
        await record_usage("photo_uploaded", profile["id"])
        await record_usage("photo_bytes", profile["id"], amount=len(data))
        # Bump counter
        await db.profiles.update_one(
            {"id": profile["id"]},
            {"$inc": {"gallery_config.total_photos": 1},
             "$set": {"gallery_config.last_upload_at": _now().isoformat()}}
        )

        # T3: queue the Rekognition indexing job; no Redis -> run it inline now
        # (unchanged behaviour for dev machines with no queue).
        face_count = 0
        indexed_now = False
        queued = await face_queue.enqueue({"type": "FACE_INDEX", "photo_id": photo_id,
                                            "profile_id": profile["id"], "attempt": 0})
        if not queued:
            idx = await index_photo_job(db, photo_id)
            if idx.get("ok"):
                face_count = int(idx.get("face_count") or 0)
                indexed_now = True

        # "Also keep a copy in storage" — best-effort mirror into the studio's
        # Cloud Backup. Never fails the upload; reports status for the UI.
        # Archives the TRUE original bytes now (used to be the re-encoded
        # 2000w JPEG) — same "we keep your original" guarantee as S3.
        archived = False
        archive_reason = None
        if archive_fn and studio_id:
            try:
                ar = await archive_fn(studio_id=studio_id, data=data,
                                      filename=(filename or f"{photo_id}{original_ext}"),
                                      mime=original_mime, kind="image",
                                      folder_name=folder_name)
                archived = bool(ar and ar.get("ok"))
                archive_reason = (ar or {}).get("reason")
            except Exception as e:
                logger.warning("gallery archive mirror failed: %s", e)
                archive_reason = "error"

        return {"ok": True, "id": photo_id, "filename": filename,
                "face_count": face_count, "indexed": indexed_now,
                "archived": archived, "archive_reason": archive_reason,
                "thumb_url": generate_signed_url(keys["thumb"], 3600)}
    except Exception as e:
        logger.exception("ingest_photo failed")
        return {"ok": False, "filename": filename, "error": str(e)[:200]}


def _redact(gc: dict) -> dict:
    """Hide raw token from API response (we keep it in DB)."""
    out = {**gc}
    if "live_upload_token" in out:
        tok = out["live_upload_token"] or ""
        out["live_upload_token_preview"] = (tok[:8] + "..." + tok[-4:]) if tok else None
        out.pop("live_upload_token", None)
    return out


# ============================================================
#  Cleanup scheduler (called from server.py startup)
# ============================================================
async def cleanup_expired_galleries(db):
    """Daily 3am job — deletes everything for weddings past auto_delete_at."""
    now_iso = _now().isoformat()
    # Bounded batch: cap the tick so a big backlog (missed cron / shared
    # auto_delete_at) can't run unbounded — the rest still qualify next run.
    cursor = db.profiles.find({
        "gallery_config.enabled": True,
        "gallery_config.auto_delete_at": {"$lt": now_iso},
    }, {"_id": 0, "id": 1, "gallery_config": 1, "slug": 1}).limit(500)
    deleted_weddings = 0
    async for p in cursor:
        try:
            gc = p.get("gallery_config") or {}
            # S3 prefix — boto3 is sync; to_thread so it can't stall the event loop.
            try:
                await asyncio.to_thread(delete_prefix, _s3_prefix(p["id"]))
            except Exception as e:
                logger.warning("cleanup S3 delete failed %s: %s", p["id"], e)
            # Rekognition collection
            if gc.get("aws_collection_id"):
                try:
                    await asyncio.to_thread(get_face_provider().delete_collection, gc["aws_collection_id"])
                except Exception as e:
                    logger.warning("cleanup rek collection failed %s: %s", p["id"], e)
            # Mongo records
            await db.gallery_photos.delete_many({"profile_id": p["id"]})
            await db.face_search_sessions.delete_many({"profile_id": p["id"]})
            await db.profiles.update_one({"id": p["id"]},
                {"$set": {"gallery_config.enabled": False,
                          "gallery_config.cleaned_at": _now().isoformat(),
                          "gallery_config.total_photos": 0}})
            deleted_weddings += 1
        except Exception as e:
            logger.exception("gallery cleanup loop failed for %s: %s", p.get("id"), e)
    if deleted_weddings:
        logger.info("[cleanup] purged %d expired wedding galleries", deleted_weddings)
    return deleted_weddings


async def cleanup_expired_selfies(db):
    """Hourly job — purge selfies > 24h old."""
    cutoff = _now() - timedelta(hours=24)
    cutoff_iso = cutoff.isoformat()
    # Bounded batch; delete only the rows we actually S3-cleaned so a capped tick
    # never orphans a selfie object (the rest roll to the next hourly run).
    cursor = db.face_search_sessions.find(
        {"created_at": {"$lt": cutoff_iso}},
        {"_id": 0, "selfie_s3_key": 1, "selfie_bucket": 1, "id": 1}).limit(1000)
    purged_ids = []
    async for s in cursor:
        if s.get("selfie_s3_key"):
            try:
                await asyncio.to_thread(
                    s3().delete_object, Bucket=_selfie_bucket_for_session(s), Key=s["selfie_s3_key"])
            except Exception:
                pass
        purged_ids.append(s["id"])
    if purged_ids:
        await db.face_search_sessions.delete_many({"id": {"$in": purged_ids}})
        logger.info("[cleanup] purged %d expired selfies", len(purged_ids))
    return len(purged_ids)
