"""
Google Drive Auto-Archive
=========================

Per-studio Google Drive integration.  Studios connect their own Google account
once via OAuth; when a wedding is published, every photo for that wedding is
asynchronously uploaded to their Drive under

    /MAJA Invites/<Bride>-<Groom>-<YYYY-MM-DD>/photos/<photo_NNN>.jpg

How it fits together
--------------------
* OAuth lives in this module and exposes 4 endpoints under
  `/api/oauth/drive/*` (connect, callback, status, disconnect).
* Per-studio credentials live in `db.drive_credentials`
  ({admin_id, access_token, refresh_token, ...}).
* An asyncio.Queue acts as a lightweight job queue.  `enqueue_archive(profile)`
  is called from the existing wedding-publish endpoint (`server.py`) and a
  long-running `_archive_worker` task drains it.  No Celery/Redis.
* Per-archive bookkeeping is stored in `db.drive_archive_jobs` so the UI can
  show "last synced 2 h ago" and retry failed jobs.

This module is intentionally self-contained — the only outside dependency is
`s3()` + `bucket()` from `gallery_features` to fetch the actual photo bytes.
"""
from __future__ import annotations

import asyncio
import logging
import os
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError

from storage.crypto import encrypt_secret, decrypt_secret

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# OAuth configuration (loaded once at module import).
# ---------------------------------------------------------------------------
def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET")
GOOGLE_DRIVE_REDIRECT_URI = _env("GOOGLE_DRIVE_REDIRECT_URI")
GOOGLE_DRIVE_SCOPE = _env(
    "GOOGLE_DRIVE_SCOPE", "https://www.googleapis.com/auth/drive.file"
)
FRONTEND_URL = _env("FRONTEND_URL", "")

# Owner decision 2026-08-06: Drive retired, S3+CloudFront primary. This worker
# still exists for studios that already connected Drive, but stays off unless
# explicitly re-enabled.
DRIVE_ARCHIVE_ENABLED = _env("DRIVE_ARCHIVE_ENABLED", "0") == "1"

OAUTH_SCOPES: List[str] = [GOOGLE_DRIVE_SCOPE]

OAUTH_CONFIGURED = bool(
    GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI
)


# ---------------------------------------------------------------------------
# Module-level queue + worker — set up once at FastAPI startup.
# ---------------------------------------------------------------------------
_archive_queue: "asyncio.Queue[str]" = asyncio.Queue()
_worker_task: Optional[asyncio.Task] = None


def build_drive_router(db, s3_client_fn, bucket_fn, require_admin):
    """Build the /api/oauth/drive/* router + return it.

    Args:
        db: motor DB instance.
        s3_client_fn: zero-arg callable returning a boto3 S3 client.
        bucket_fn: zero-arg callable returning the bucket name.
        require_admin: FastAPI dependency yielding {"admin_id": str, ...}.
    """
    router = APIRouter(prefix="/api/oauth/drive", tags=["google-drive"])

    # ---- 1. status ---------------------------------------------------------
    @router.get("/status")
    async def status(admin_data: dict = Depends(require_admin)):
        admin_id = admin_data["admin_id"]
        doc = await db.drive_credentials.find_one({"admin_id": admin_id})
        if not doc:
            return {
                "connected": False,
                "configured": OAUTH_CONFIGURED,
                "scope": GOOGLE_DRIVE_SCOPE,
            }
        # Latest archive job stats for this admin
        last_job = await db.drive_archive_jobs.find_one(
            {"admin_id": admin_id},
            sort=[("created_at", -1)],
            projection={"_id": 0},
        )
        return {
            "connected": True,
            "configured": OAUTH_CONFIGURED,
            "scope": GOOGLE_DRIVE_SCOPE,
            "google_email": doc.get("google_email"),
            "connected_at": doc.get("created_at"),
            "last_job": last_job,
        }

    # ---- 2. connect (initiate OAuth) --------------------------------------
    @router.get("/connect")
    async def connect(admin_data: dict = Depends(require_admin)):
        if not OAUTH_CONFIGURED:
            # 503, not 500: an unset optional integration is "this feature is off",
            # not "the server broke". As a 500 it looked like a crash in monitoring
            # and in the smoke suite. Matches how the storage-pool connect route
            # already reports the same condition.
            raise HTTPException(
                status_code=503,
                detail="Google OAuth is not configured on the server. "
                "Ask the platform owner to set GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI.",
            )
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [GOOGLE_DRIVE_REDIRECT_URI],
                }
            },
            scopes=OAUTH_SCOPES,
            redirect_uri=GOOGLE_DRIVE_REDIRECT_URI,
        )
        # `state` carries our admin_id so the callback knows whose tokens
        # to persist.  In a stricter setup we'd HMAC-sign it; for now the
        # require_admin dependency already gates this endpoint.
        authorization_url, _state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",   # forces refresh-token issuance on re-connect
            state=admin_data["admin_id"],
        )
        return {"authorization_url": authorization_url}

    # ---- 3. callback ------------------------------------------------------
    @router.get("/callback")
    async def callback(
        code: str = Query(...),
        state: str = Query(...),
        error: Optional[str] = Query(None),
    ):
        # If user denied consent on Google's page they'll come back with
        # ?error=access_denied — bounce them back to the dashboard with a flag.
        if error:
            return RedirectResponse(
                url=f"{FRONTEND_URL}/admin/dashboard?drive_connected=denied",
                status_code=302,
            )
        if not OAUTH_CONFIGURED:
            raise HTTPException(status_code=500, detail="OAuth not configured")
        try:
            flow = Flow.from_client_config(
                {
                    "web": {
                        "client_id": GOOGLE_CLIENT_ID,
                        "client_secret": GOOGLE_CLIENT_SECRET,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [GOOGLE_DRIVE_REDIRECT_URI],
                    }
                },
                scopes=None,  # accept whatever Google granted
                redirect_uri=GOOGLE_DRIVE_REDIRECT_URI,
            )
            flow.fetch_token(code=code)
            creds = flow.credentials

            # Confirm at least our minimum scope was granted
            granted = set(creds.scopes or [])
            if GOOGLE_DRIVE_SCOPE not in granted and \
               "https://www.googleapis.com/auth/drive" not in granted:
                logger.warning(
                    "drive-oauth: required scope not granted (got=%s)", granted
                )
                return RedirectResponse(
                    url=f"{FRONTEND_URL}/admin/dashboard?drive_connected=missing_scope",
                    status_code=302,
                )

            # Get the connected Google email (nice-to-have for the UI)
            google_email = None
            try:
                oauth2 = build("oauth2", "v2", credentials=creds, cache_discovery=False)
                info = oauth2.userinfo().get().execute()
                google_email = info.get("email")
            except Exception:
                pass

            await db.drive_credentials.update_one(
                {"admin_id": state},
                {
                    "$set": {
                        "admin_id": state,
                        # Tokens are encrypted at rest; a leaked row must not hand
                        # over live Drive access. client_id/secret/token_uri are the
                        # platform's own static OAuth config (GOOGLE_CLIENT_ID/SECRET)
                        # — no longer copied per-row.
                        "access_token": encrypt_secret(creds.token),
                        "refresh_token": encrypt_secret(creds.refresh_token),
                        "scopes": list(creds.scopes or []),
                        "expiry": creds.expiry.isoformat() if creds.expiry else None,
                        "google_email": google_email,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                    "$setOnInsert": {
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
                upsert=True,
            )
            logger.info("drive-oauth: stored credentials for admin=%s email=%s",
                        state, google_email)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("drive-oauth callback failed: %s", e)
            return RedirectResponse(
                url=f"{FRONTEND_URL}/admin/dashboard?drive_connected=error",
                status_code=302,
            )
        return RedirectResponse(
            url=f"{FRONTEND_URL}/admin/dashboard?drive_connected=success",
            status_code=302,
        )

    # ---- 4. disconnect ----------------------------------------------------
    @router.post("/disconnect")
    async def disconnect(admin_data: dict = Depends(require_admin)):
        admin_id = admin_data["admin_id"]
        doc = await db.drive_credentials.find_one({"admin_id": admin_id})
        if doc and doc.get("refresh_token"):
            # Best-effort revoke (don't fail if Google rejects an already-expired token).
            try:
                import requests
                requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": doc["refresh_token"]},
                    headers={"content-type": "application/x-www-form-urlencoded"},
                    timeout=8,
                )
            except Exception:
                pass
        await db.drive_credentials.delete_one({"admin_id": admin_id})
        return {"ok": True}

    # ---- 5. trigger sync for one wedding (manual) -------------------------
    @router.post("/sync/{profile_id}")
    async def sync_now(profile_id: str, admin_data: dict = Depends(require_admin)):
        """Manually queue a single wedding for archive.  Useful when a studio
        connects Drive AFTER they've already published weddings."""
        admin_id = admin_data["admin_id"]
        profile = await db.profiles.find_one({"id": profile_id, "admin_id": admin_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Wedding not found")
        await enqueue_archive(db, profile_id)
        return {"ok": True, "queued": True}

    # ---- 6. job history ---------------------------------------------------
    @router.get("/jobs")
    async def list_jobs(
        admin_data: dict = Depends(require_admin),
        limit: int = Query(20, ge=1, le=200),
    ):
        admin_id = admin_data["admin_id"]
        cursor = db.drive_archive_jobs.find(
            {"admin_id": admin_id},
            projection={"_id": 0},
        ).sort("created_at", -1).limit(limit)
        return {"jobs": [j async for j in cursor]}

    # Expose the actual upload logic on the router for the worker to use.
    router._db = db
    router._s3_client_fn = s3_client_fn
    router._bucket_fn = bucket_fn
    return router


# ---------------------------------------------------------------------------
# Queue & worker — wired into the FastAPI startup event from server.py
# ---------------------------------------------------------------------------
async def enqueue_archive(db, profile_id: str) -> None:
    """Add a wedding to the archive queue.  No-op if the studio that owns
    this wedding hasn't connected Drive, or if the archive worker is off."""
    if not DRIVE_ARCHIVE_ENABLED:
        return
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0, "admin_id": 1})
    if not profile:
        return
    creds = await db.drive_credentials.find_one(
        {"admin_id": profile["admin_id"]},
        {"_id": 0, "admin_id": 1},
    )
    if not creds:
        logger.info("drive-archive: skipping %s — studio not connected", profile_id)
        return
    await _archive_queue.put(profile_id)
    logger.info("drive-archive: enqueued %s (qsize=%d)", profile_id, _archive_queue.qsize())


def start_worker(db, s3_client_fn, bucket_fn) -> Optional[asyncio.Task]:
    """Start the background worker.  Call once from server.py startup.
    No-op (returns None) unless DRIVE_ARCHIVE_ENABLED=1."""
    global _worker_task
    if not DRIVE_ARCHIVE_ENABLED:
        logger.info("drive-archive: worker disabled (set DRIVE_ARCHIVE_ENABLED=1 to enable)")
        return None
    if _worker_task and not _worker_task.done():
        return _worker_task
    _worker_task = asyncio.create_task(
        _archive_worker(db, s3_client_fn, bucket_fn),
        name="drive_archive_worker",
    )
    logger.info("drive-archive: background worker started")
    return _worker_task


async def _requeue_stuck_jobs(db) -> None:
    """Recover jobs that were mid-flight when the process last died (crash,
    deploy, OOM-kill).  `_archive_queue` is a plain in-process asyncio.Queue —
    it does not survive a restart, so without this a profile that was still
    "running" (or already claimed but not yet started) at the moment of death
    would be lost from the queue forever while its `drive_archive_jobs` row
    sits stuck on "running" indefinitely, never retried and never surfaced as
    failed.  Called once, before the worker starts draining the (freshly
    empty) queue.

    Leader-gated: in a multi-worker deploy every process boots this, so without
    the lock each stuck job would be re-dispatched N times concurrently (one
    Drive upload per worker). Only the leader requeues; the others start empty
    and pick up new work normally. No REDIS_URL (single process) → lock returns
    True → dev unchanged."""
    try:
        from cache_backend import acquire_lock
        if not await acquire_lock("drive_archive_requeue_leader", 300):
            return
    except Exception:
        pass  # lock backend unavailable → best-effort, proceed as before
    try:
        requeued = 0
        async for job in db.drive_archive_jobs.find(
            {"status": {"$in": ["queued", "running"]}}, {"_id": 0}
        ):
            profile_id = job.get("profile_id")
            if not profile_id:
                continue
            if job.get("status") == "running":
                await db.drive_archive_jobs.update_one(
                    {"id": job["id"]},
                    {"$set": {
                        "status": "queued",
                        "restarted_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
            await _archive_queue.put(profile_id)
            requeued += 1
        if requeued:
            logger.info("drive-archive: re-queued %d stuck job(s) after restart", requeued)
    except Exception as e:
        logger.warning("drive-archive: requeue-on-boot failed (%s); starting with an empty queue", e)


async def _archive_worker(db, s3_client_fn, bucket_fn) -> None:
    """Single long-running task that drains the queue.  We deliberately keep
    concurrency to one upload at a time so we don't blow past Drive's per-user
    quota (≈10 QPS)."""
    await _requeue_stuck_jobs(db)
    while True:
        try:
            profile_id = await _archive_queue.get()
        except asyncio.CancelledError:
            return
        try:
            await _do_archive(db, s3_client_fn, bucket_fn, profile_id)
        except Exception as e:
            logger.exception("drive-archive: %s failed: %s", profile_id, e)
        finally:
            _archive_queue.task_done()


async def _refresh_if_needed(creds: Credentials, db, admin_id: str) -> Credentials:
    if creds.expired and creds.refresh_token:
        try:
            await asyncio.to_thread(creds.refresh, GoogleAuthRequest())
            await db.drive_credentials.update_one(
                {"admin_id": admin_id},
                {"$set": {
                    "access_token": encrypt_secret(creds.token),
                    "expiry": creds.expiry.isoformat() if creds.expiry else None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
        except Exception as e:
            logger.warning("drive-archive: token refresh failed for %s: %s", admin_id, e)
            raise
    return creds


def _build_service(doc: Dict[str, Any]):
    # token_uri/client_id/client_secret come from the platform's own static OAuth
    # config, not the stored row (they're identical, and no longer persisted).
    # Tokens are decrypted here; legacy plaintext rows pass through unchanged.
    creds = Credentials(
        token=decrypt_secret(doc["access_token"]),
        refresh_token=decrypt_secret(doc.get("refresh_token")),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=doc.get("scopes") or OAUTH_SCOPES,
    )
    return creds


def _ensure_folder(service, name: str, parent_id: Optional[str] = None) -> str:
    """Find-or-create a Drive folder under `parent_id` (or My Drive root).
    Returns its file_id."""
    safe = name.replace("'", "\\'")
    q = f"name = '{safe}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    resp = service.files().list(
        q=q, spaces="drive", fields="files(id, name)", pageSize=1,
    ).execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]
    body: Dict[str, Any] = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    created = service.files().create(body=body, fields="id").execute()
    return created["id"]


async def _do_archive(db, s3_client_fn, bucket_fn, profile_id: str) -> None:
    """The actual upload logic.  Logs a row in db.drive_archive_jobs with the
    end-of-run summary."""
    profile = await db.profiles.find_one({"id": profile_id})
    if not profile:
        return
    admin_id = profile.get("admin_id")
    if not admin_id:
        return

    doc = await db.drive_credentials.find_one({"admin_id": admin_id})
    if not doc:
        logger.info("drive-archive: %s — studio not connected, skipping", profile_id)
        return

    job_id = f"job-{profile_id}-{int(datetime.now(timezone.utc).timestamp())}"
    job_doc: Dict[str, Any] = {
        "id": job_id,
        "admin_id": admin_id,
        "profile_id": profile_id,
        "status": "running",
        "uploaded_count": 0,
        "total_count": 0,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.drive_archive_jobs.insert_one(job_doc)

    try:
        creds = _build_service(doc)
        await _refresh_if_needed(creds, db, admin_id)

        service = await asyncio.to_thread(
            build, "drive", "v3", credentials=creds, cache_discovery=False,
        )

        # ---- 1. Folder structure -------------------------------------------------
        bride = (profile.get("bride_name") or "").strip() or "Bride"
        groom = (profile.get("groom_name") or "").strip() or "Groom"
        ev_date = (profile.get("event_date") or "")[:10] or "no-date"
        couple = f"{bride}-{groom}-{ev_date}".replace("/", "-")

        root_id = await asyncio.to_thread(_ensure_folder, service, "MAJA Invites")
        wedding_id = await asyncio.to_thread(_ensure_folder, service, couple, root_id)
        photos_id = await asyncio.to_thread(_ensure_folder, service, "photos", wedding_id)

        # ---- 2. List photos already uploaded so re-runs are idempotent ----------
        existing_names = set()
        page_token = None
        while True:
            resp = await asyncio.to_thread(
                lambda: service.files().list(
                    q=f"'{photos_id}' in parents and trashed = false",
                    fields="nextPageToken, files(id, name)",
                    pageSize=1000,
                    pageToken=page_token,
                ).execute()
            )
            existing_names.update(f["name"] for f in resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        # ---- 3. Iterate over all photos for this wedding ------------------------
        cursor = db.gallery_photos.find(
            {"profile_id": profile_id}, {"_id": 0}
        ).sort("created_at", 1)
        photos = [p async for p in cursor]
        job_doc["total_count"] = len(photos)

        if not photos:
            await db.drive_archive_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "status": "completed",
                    "total_count": 0,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "note": "No photos to archive.",
                }},
            )
            return

        s3 = s3_client_fn()
        bucket = bucket_fn()

        uploaded = 0
        for i, p in enumerate(photos, start=1):
            arcname = f"photo_{i:04d}.jpg"
            if arcname in existing_names:
                continue  # already uploaded in a previous run
            try:
                body = await asyncio.to_thread(
                    lambda: s3.get_object(Bucket=bucket, Key=p["s3_key"])["Body"].read()
                )
                media = MediaIoBaseUpload(
                    io.BytesIO(body),
                    mimetype=p.get("mime_type") or "image/jpeg",
                    resumable=True,
                )
                await asyncio.to_thread(
                    lambda: service.files().create(
                        body={"name": arcname, "parents": [photos_id]},
                        media_body=media,
                        fields="id",
                    ).execute()
                )
                uploaded += 1
                if uploaded % 5 == 0:
                    await db.drive_archive_jobs.update_one(
                        {"id": job_id},
                        {"$set": {"uploaded_count": uploaded}},
                    )
            except HttpError as he:
                logger.warning("drive-archive: %s photo %s skipped: %s",
                               profile_id, p.get("id"), he)
            except Exception as e:
                logger.warning("drive-archive: %s photo %s error: %s",
                               profile_id, p.get("id"), e)

        await db.drive_archive_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "completed",
                "uploaded_count": uploaded,
                "total_count": len(photos),
                "drive_folder_id": photos_id,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        logger.info("drive-archive: %s done — uploaded %d / %d",
                    profile_id, uploaded, len(photos))
    except Exception as e:
        await db.drive_archive_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error": str(e),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise
