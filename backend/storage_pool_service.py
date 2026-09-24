"""
MAJA Invites — Storage Pool admin (V1 multi-drive storage, Phase 4).
====================================================================

Super-admin endpoints for managing the platform-owned drive pool
(8 × 15 TB Google accounts today; see MULTI_DRIVE_STORAGE_DESIGN.md).

Endpoints (all super-admin gated except the OAuth callback, which is
validated by a single-use state token):

    GET  /api/super-admin/storage/accounts                 list pool + usage
    GET  /api/super-admin/storage/accounts/connect         start OAuth for a NEW account
    GET  /api/storage-pool/oauth/callback                  Google redirect target
    POST /api/super-admin/storage/accounts/{id}/disable    remove from rotation
    POST /api/super-admin/storage/accounts/{id}/enable     restore to rotation
    POST /api/super-admin/storage/accounts/{id}/make-current   manual pointer override
    POST /api/super-admin/storage/accounts/{id}/check      live health + quota probe
    GET  /api/super-admin/storage/overview                 pool totals (quick view)

Connecting an account (charter: add accounts without downtime):
    1. Super-admin hits /connect → gets a Google authorization URL, opens it
       while logged into THAT pool Google account, grants access.
    2. Google redirects to the callback with a code + our single-use state.
    3. We exchange the code, read the account email + REAL storage quota via
       about.get, encrypt the refresh token (storage.crypto), and register the
       account via StorageOrchestrator.add_account — it joins the pool live.

ENV (backend/.env — never committed):
    STORAGE_POOL_CLIENT_ID / STORAGE_POOL_CLIENT_SECRET
                                              optional DEDICATED OAuth client for the
                                              drive pool. Falls back to
                                              GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
                                              (the login client) when unset — either
                                              a shared client or two separate clients
                                              works.
    PUBLIC_BASE_URL                           e.g. https://majainvites.com
    STORAGE_POOL_REDIRECT_URI                 optional override of
                                              {PUBLIC_BASE_URL}/api/storage-pool/oauth/callback
    STORAGE_POOL_SCOPE                        default drive.file (least privilege —
                                              the app only ever touches files it created)
    STORAGE_CRED_KEY                          Fernet key for credential encryption
    FRONTEND_BASE_URL                         where the callback redirects the admin back to
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

logger = logging.getLogger("storage_pool")

_STATE_TTL_MIN = 15
_DEFAULT_CAPACITY_BYTES = 15 * 1024 ** 4      # 15 TB per pool account today


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _redirect_uri() -> str:
    override = _env("STORAGE_POOL_REDIRECT_URI").strip()
    if override:
        return override
    base = _env("PUBLIC_BASE_URL").rstrip("/")
    return f"{base}/api/storage-pool/oauth/callback" if base else ""


def _frontend_base() -> str:
    return (_env("FRONTEND_BASE_URL") or _env("PUBLIC_BASE_URL")).rstrip("/")


def _scopes() -> list:
    return [_env("STORAGE_POOL_SCOPE",
                 "https://www.googleapis.com/auth/drive.file")]


def _client_id() -> str:
    """Dedicated pool client if configured, else the shared login client."""
    return _env("STORAGE_POOL_CLIENT_ID") or _env("GOOGLE_CLIENT_ID")


def _client_secret() -> str:
    return _env("STORAGE_POOL_CLIENT_SECRET") or _env("GOOGLE_CLIENT_SECRET")


def _oauth_configured() -> bool:
    return bool(_client_id() and _client_secret() and _redirect_uri())


def _flow():
    """google_auth_oauthlib Flow — same proven pattern as drive_archive.py."""
    from google_auth_oauthlib.flow import Flow
    return Flow.from_client_config(
        {
            "web": {
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [_redirect_uri()],
            }
        },
        scopes=None,  # accept what Google grants; we verify below
        redirect_uri=_redirect_uri(),
    )


def _public_account(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip credentials before anything leaves the API."""
    out = {k: v for k, v in doc.items() if k not in ("credentials_enc", "_id")}
    cap = int(doc.get("capacity_bytes") or 0)
    used = int(doc.get("committed_bytes") or 0)
    out["used_pct"] = round(used / cap * 100, 2) if cap else 0.0
    return out


def build_storage_pool_router(db, require_super_admin) -> APIRouter:
    from storage.orchestrator import StorageOrchestrator
    orch = StorageOrchestrator(db)
    router = APIRouter(tags=["storage-pool"])

    # ------------------------------------------------------------------ #
    # pool listing / overview
    # ------------------------------------------------------------------ #
    @router.get("/api/super-admin/storage/accounts")
    async def list_accounts(_admin=Depends(require_super_admin)):
        await orch.ensure_ready()
        accounts = [_public_account(a) for a in await orch._all_accounts()]
        accounts.sort(key=lambda a: int(a.get("pool_order") or 0))
        return {
            "configured": _oauth_configured(),
            "redirect_uri": _redirect_uri(),
            "accounts": accounts,
        }

    @router.get("/api/super-admin/storage/overview")
    async def overview(_admin=Depends(require_super_admin)):
        await orch.ensure_ready()
        accounts = await orch._all_accounts()
        total = sum(int(a.get("capacity_bytes") or 0) for a in accounts)
        used = sum(int(a.get("committed_bytes") or 0) for a in accounts)
        by_status: Dict[str, int] = {}
        for a in accounts:
            by_status[a.get("status") or "?"] = by_status.get(a.get("status") or "?", 0) + 1
        current = next((a["id"] for a in accounts if a.get("slot") == "current"), None)
        return {
            "accounts": len(accounts),
            "by_status": by_status,
            "current_account_id": current,
            "total_bytes": total,
            "used_bytes": used,
            "remaining_bytes": max(0, total - used),
            "used_pct": round(used / total * 100, 2) if total else 0.0,
        }

    # ------------------------------------------------------------------ #
    # connect a NEW pool account (one-time OAuth per account)
    # ------------------------------------------------------------------ #
    @router.get("/api/super-admin/storage/accounts/connect")
    async def connect(
        label: str = Query("", max_length=120),
        capacity_gb: int = Query(0, ge=0, le=1024 * 1024),
        _admin=Depends(require_super_admin),
    ):
        if not _oauth_configured():
            raise HTTPException(
                status_code=503,
                detail="Storage pool OAuth is not configured. Set STORAGE_POOL_CLIENT_ID / "
                       "STORAGE_POOL_CLIENT_SECRET (or the shared GOOGLE_CLIENT_ID / "
                       "GOOGLE_CLIENT_SECRET) plus PUBLIC_BASE_URL, and register the "
                       f"redirect URI ({_redirect_uri() or 'PUBLIC_BASE_URL missing'}) "
                       "in Google Cloud Console.",
            )
        # Fail early with a clear message if the encryption key is missing —
        # better now than after the admin has gone through Google's consent.
        from storage.crypto import _fernet
        _fernet()

        state = secrets.token_urlsafe(32)
        await db.storage_oauth_states.insert_one({
            "id": state,
            "label": label.strip(),
            "capacity_gb": capacity_gb,
            "created_at": _now().isoformat(),
            "expires_at": (_now() + timedelta(minutes=_STATE_TTL_MIN)).isoformat(),
        })
        flow = _flow()
        flow.oauth2session.scope = _scopes()
        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",          # force refresh-token issuance
            state=state,
        )
        return {"authorization_url": authorization_url, "state_expires_min": _STATE_TTL_MIN}

    @router.get("/api/storage-pool/oauth/callback")
    async def oauth_callback(
        code: Optional[str] = Query(None),
        state: str = Query(...),
        error: Optional[str] = Query(None),
    ):
        dest = f"{_frontend_base()}/super-admin/storage"

        # single-use state — the ONLY thing that authorizes this public endpoint
        st = await db.storage_oauth_states.find_one({"id": state})
        if st:
            await db.storage_oauth_states.delete_one({"id": state})
        if not st or (st.get("expires_at") or "") < _now().isoformat():
            return RedirectResponse(url=f"{dest}?pool_connected=invalid_state", status_code=302)
        if error or not code:
            return RedirectResponse(url=f"{dest}?pool_connected=denied", status_code=302)

        try:
            flow = _flow()
            flow.fetch_token(code=code)
            creds = flow.credentials
            if not creds.refresh_token:
                return RedirectResponse(url=f"{dest}?pool_connected=no_refresh_token",
                                        status_code=302)

            # identify the account + read its REAL storage quota
            import asyncio
            from googleapiclient.discovery import build as _gbuild

            def _probe() -> Dict[str, Any]:
                svc = _gbuild("drive", "v3", credentials=creds, cache_discovery=False)
                return svc.about().get(fields="user(emailAddress),storageQuota").execute()

            about = await asyncio.to_thread(_probe)
            email = (about.get("user") or {}).get("emailAddress") or "unknown"
            quota = about.get("storageQuota") or {}
            capacity = int(quota.get("limit") or 0) \
                or int(st.get("capacity_gb") or 0) * 1024 ** 3 \
                or _DEFAULT_CAPACITY_BYTES
            already_used = int(quota.get("usage") or 0)

            # refuse duplicates — connecting the same Google account twice
            # would double-count its capacity
            for a in await orch._all_accounts():
                if a.get("google_email") == email and a.get("status") != "disabled":
                    return RedirectResponse(
                        url=f"{dest}?pool_connected=already_connected", status_code=302)

            doc = await orch.add_account(
                kind="gdrive",
                label=st.get("label") or email,
                capacity_bytes=capacity,
                credential_mode="oauth",
                credentials={
                    "access_token": creds.token,
                    "refresh_token": creds.refresh_token,
                    "token_uri": creds.token_uri,
                    "client_id": creds.client_id,
                    "client_secret": creds.client_secret,
                    "scopes": list(creds.scopes or _scopes()),
                },
                extra={
                    "google_email": email,
                    # seed the counter with what the account already holds so the
                    # 80% math is honest from day one
                    "committed_bytes": already_used,
                    "provider_used_bytes": already_used,
                    "last_quota_sync_at": _now().isoformat(),
                },
            )
            logger.info("storage-pool: connected %s as %s (%.1f TB, %.1f%% pre-used)",
                        email, doc["id"], capacity / 1024 ** 4,
                        (already_used / capacity * 100) if capacity else 0)
            return RedirectResponse(url=f"{dest}?pool_connected=success&email={email}",
                                    status_code=302)
        except Exception as e:
            logger.exception("storage-pool oauth callback failed: %s", e)
            return RedirectResponse(url=f"{dest}?pool_connected=error", status_code=302)

    # ------------------------------------------------------------------ #
    # dashboard (Phase 7)
    # ------------------------------------------------------------------ #
    @router.get("/api/super-admin/storage/dashboard")
    async def dashboard(_admin=Depends(require_super_admin)):
        """Everything the Storage Overview panel needs in one call."""
        await orch.ensure_ready()
        accounts = [_public_account(a) for a in await orch._all_accounts()]
        accounts.sort(key=lambda a: int(a.get("pool_order") or 0))
        total = sum(int(a.get("capacity_bytes") or 0) for a in accounts
                    if a.get("status") != "disabled")
        used = sum(int(a.get("committed_bytes") or 0) for a in accounts
                   if a.get("status") != "disabled")
        active = next((a for a in accounts if a.get("slot") == "current"), None)

        failed = deferred = retried = 0
        async for l in db.upload_logs.find({"status": "failed"}):
            failed += 1
        async for l in db.upload_logs.find({"status": "deferred"}):
            deferred += 1
        async for l in db.upload_logs.find({"status": "unrecoverable"}):
            failed += 1
        async for l in db.upload_logs.find({"status": "completed"}):
            if l.get("retried"):
                retried += 1

        forecast = None
        async for s in db.storage_usage_analytics.find({"type": "forecast"}):
            if forecast is None or (s.get("date") or "") > (forecast.get("date") or ""):
                s.pop("_id", None)
                forecast = s

        alerts = []
        async for a in db.storage_alerts.find({"acked": False}):
            a.pop("_id", None)
            alerts.append(a)
        alerts.sort(key=lambda a: a.get("last_seen_at") or "", reverse=True)

        # Emergency capacity monitoring: <10% remaining across the pool + a live
        # days-remaining estimate from the daily usage snapshots (growth rate).
        remaining = max(0, total - used)
        remaining_pct = round(remaining / total * 100, 2) if total else 100.0
        emergency = bool(total) and remaining_pct < 10
        days_remaining = None
        snaps = []
        async for s in db.storage_usage_analytics.find({"type": "daily"}):
            s.pop("_id", None)
            snaps.append(s)
        snaps.sort(key=lambda s: s.get("date") or "")
        if len(snaps) >= 2:
            try:
                from datetime import date as _date
                d0 = _date.fromisoformat(snaps[0]["date"])
                d1 = _date.fromisoformat(snaps[-1]["date"])
                span = max((d1 - d0).days, 1)
                grew = int(snaps[-1].get("total_bytes") or 0) - int(snaps[0].get("total_bytes") or 0)
                rate = grew / span                      # bytes/day
                if rate > 0:
                    days_remaining = int(remaining / rate)
            except Exception:
                days_remaining = None

        from storage_pool_hooks import pool_enabled
        return {
            "enabled": await pool_enabled(db),
            "configured": _oauth_configured(),
            "total_bytes": total,
            "used_bytes": used,
            "remaining_bytes": remaining,
            "used_pct": round(used / total * 100, 2) if total else 0.0,
            "remaining_pct": remaining_pct,
            "emergency": emergency,                     # <10% remaining → red banner
            "emergency_threshold_pct": 10,
            "days_remaining": days_remaining,           # None until 2+ daily snapshots
            "active_drive": active,
            "accounts": accounts,
            "uploads": {"failed": failed, "deferred": deferred,
                        "retried_ok": retried},
            "forecast": forecast,
            "alerts": alerts[:20],
        }

    @router.get("/api/super-admin/storage/by-photographer")
    async def by_photographer(limit: int = Query(50, ge=1, le=500),
                              offset: int = Query(0, ge=0),
                              _admin=Depends(require_super_admin)):
        rows = []
        async for r in db.photographer_storage.find({}):
            r.pop("_id", None)
            rows.append(r)
        rows.sort(key=lambda r: int(r.get("total_bytes") or 0), reverse=True)
        return {"total": len(rows), "items": rows[offset:offset + limit]}

    @router.get("/api/super-admin/storage/by-event")
    async def by_event(limit: int = Query(50, ge=1, le=500),
                       offset: int = Query(0, ge=0),
                       _admin=Depends(require_super_admin)):
        rows = []
        async for r in db.event_storage.find({}):
            r.pop("_id", None)
            rows.append(r)
        rows.sort(key=lambda r: int(r.get("total_bytes") or 0), reverse=True)
        return {"total": len(rows), "items": rows[offset:offset + limit]}

    # ------------------------------------------------------------------ #
    # 5-day event soft-delete recycle bin
    # ------------------------------------------------------------------ #
    @router.get("/api/super-admin/storage/deleted-events")
    async def deleted_events(_admin=Depends(require_super_admin)):
        """Events pending permanent deletion (recoverable until purge_after)."""
        return {"items": await orch.list_deleted_events(),
                "retention_days": 5}

    @router.post("/api/super-admin/storage/events/{event_id}/soft-delete")
    async def soft_delete_event(event_id: str,
                                _admin=Depends(require_super_admin)):
        """Manually schedule an event's pooled storage for the 5-day soft-delete."""
        row = await orch.soft_delete_event(event_id)
        return {"event_id": event_id, "deletion": row}

    @router.post("/api/super-admin/storage/deleted-events/{event_id}/restore")
    async def restore_deleted_event(event_id: str,
                                    _admin=Depends(require_super_admin)):
        """Restore a soft-deleted event during its recycle window."""
        n = await orch.restore_event(event_id)
        if not n:
            raise HTTPException(404, "No pending deletion for this event")
        return {"event_id": event_id, "restored": True}

    @router.post("/api/super-admin/storage/deleted-events/{event_id}/purge-now")
    async def purge_now(event_id: str, _admin=Depends(require_super_admin)):
        """Force an immediate permanent purge (skip the remaining recycle days)."""
        res = await orch.purge_event_storage(event_id)
        if res.get("complete"):
            await db.storage_event_deletions.update_many(
                {"event_id": event_id, "status": "recycle"},
                {"$set": {"status": "purged", "purged_at": _now().isoformat()}})
        return {"event_id": event_id, **res}

    @router.get("/api/super-admin/storage/failures")
    async def failures(limit: int = Query(100, ge=1, le=500),
                       _admin=Depends(require_super_admin)):
        rows = []
        for status in ("failed", "deferred", "unrecoverable"):
            async for l in db.upload_logs.find({"status": status}):
                l.pop("_id", None)
                rows.append(l)
        rows.sort(key=lambda l: l.get("started_at") or "", reverse=True)
        return {"total": len(rows), "items": rows[:limit]}

    @router.post("/api/super-admin/storage/failures/retry")
    async def retry_failures(_admin=Depends(require_super_admin)):
        """Run the retry pipeline NOW (it also runs hourly)."""
        from storage_pool_jobs import run_retries
        return await run_retries(db)

    @router.get("/api/super-admin/storage/alerts")
    async def list_alerts(include_acked: bool = Query(False),
                          _admin=Depends(require_super_admin)):
        rows = []
        async for a in db.storage_alerts.find(
                {} if include_acked else {"acked": False}):
            a.pop("_id", None)
            rows.append(a)
        rows.sort(key=lambda a: a.get("last_seen_at") or "", reverse=True)
        return {"alerts": rows[:100]}

    @router.post("/api/super-admin/storage/alerts/{alert_id}/ack")
    async def ack_alert(alert_id: str, _admin=Depends(require_super_admin)):
        doc = await db.storage_alerts.find_one({"id": alert_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Alert not found")
        await db.storage_alerts.update_one(
            {"id": alert_id},
            {"$set": {"acked": True, "acked_at": _now().isoformat()}})
        return {"acked": True}

    # ------------------------------------------------------------------ #
    # feature flag (Phase-5 hooks are inert until this is switched on)
    # ------------------------------------------------------------------ #
    @router.get("/api/super-admin/storage/settings")
    async def get_settings(_admin=Depends(require_super_admin)):
        from storage_pool_hooks import pool_enabled
        return {"enabled": await pool_enabled(db)}

    @router.put("/api/super-admin/storage/settings")
    async def put_settings(body: Dict[str, Any], _admin=Depends(require_super_admin)):
        from storage_pool_hooks import FLAG_KEY
        enabled = bool(body.get("enabled"))
        if enabled:
            # refuse to enable an empty pool — uploads would just log failures
            await orch.ensure_ready()
            eligible = [a for a in await orch._all_accounts()
                        if a.get("status") == "active"]
            if not eligible:
                raise HTTPException(
                    status_code=409,
                    detail="Connect at least one active storage account before "
                           "enabling the pool.")
        await db.app_settings.update_one(
            {"key": FLAG_KEY},
            {"$set": {"key": FLAG_KEY, "value": enabled,
                      "updated_at": _now().isoformat()}},
            upsert=True,
        )
        return {"enabled": enabled}

    # ------------------------------------------------------------------ #
    # account lifecycle
    # ------------------------------------------------------------------ #
    async def _get_account_or_404(account_id: str) -> Dict[str, Any]:
        doc = await db.storage_accounts.find_one({"id": account_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Storage account not found")
        doc.pop("_id", None)
        return doc

    @router.post("/api/super-admin/storage/accounts/{account_id}/disable")
    async def disable_account(account_id: str, _admin=Depends(require_super_admin)):
        acc = await _get_account_or_404(account_id)
        await db.storage_accounts.update_one(
            {"id": account_id},
            {"$set": {"status": "disabled", "slot": "standby",
                      "updated_at": _now().isoformat()}},
        )
        if acc.get("slot") == "current":
            # hand the pointer to the next healthy drive immediately
            await orch._promote_next(account_id, "disabled", acc.get("kind") or "gdrive")
        return {"disabled": True}

    @router.post("/api/super-admin/storage/accounts/{account_id}/enable")
    async def enable_account(account_id: str, _admin=Depends(require_super_admin)):
        await _get_account_or_404(account_id)
        await db.storage_accounts.update_one(
            {"id": account_id},
            {"$set": {"status": "active", "consecutive_failures": 0,
                      "updated_at": _now().isoformat()}},
        )
        return {"enabled": True}

    @router.post("/api/super-admin/storage/accounts/{account_id}/make-current")
    async def make_current(account_id: str, _admin=Depends(require_super_admin)):
        acc = await _get_account_or_404(account_id)
        prev = await db.storage_accounts.find_one(
            {"slot": "current", "kind": acc.get("kind") or "gdrive"})
        if prev and prev.get("id") != account_id:
            await db.storage_accounts.update_one(
                {"id": prev["id"]},
                {"$set": {"slot": "standby", "updated_at": _now().isoformat()}},
            )
        await db.storage_accounts.update_one(
            {"id": account_id},
            {"$set": {"slot": "current", "status": "active",
                      "consecutive_failures": 0,
                      "updated_at": _now().isoformat()}},
        )
        return {"current": account_id}

    @router.post("/api/super-admin/storage/accounts/{account_id}/config")
    async def configure_account(account_id: str, body: Dict[str, Any],
                                _admin=Depends(require_super_admin)):
        """Tune a drive: soft_limit_pct / label / pool_order. NOTE: the charter
        default of 80% leaves ~3 TB unused per 15 TB drive — for large drives
        95–98% is usually right (headroom only needs to absorb in-flight
        uploads, not 20% of a drive)."""
        await _get_account_or_404(account_id)
        update: Dict[str, Any] = {"updated_at": _now().isoformat()}
        if "soft_limit_pct" in body:
            pct = int(body["soft_limit_pct"])
            if not (50 <= pct <= 99):
                raise HTTPException(status_code=422,
                                    detail="soft_limit_pct must be 50–99")
            update["soft_limit_pct"] = pct
        if "label" in body:
            update["label"] = str(body["label"])[:120]
        if "pool_order" in body:
            update["pool_order"] = int(body["pool_order"])
        await db.storage_accounts.update_one({"id": account_id}, {"$set": update})
        return {"updated": {k: v for k, v in update.items() if k != "updated_at"}}

    @router.post("/api/super-admin/storage/accounts/{account_id}/check")
    async def check_account(account_id: str, _admin=Depends(require_super_admin)):
        """Live health + quota probe against Google — persists the snapshot so
        the pool listing shows fresh numbers. Also how you VERIFY a freshly
        connected account actually works."""
        acc = await _get_account_or_404(account_id)
        provider = orch._provider(acc)
        acc_creds = orch._with_credentials(acc)
        health = await provider.health(acc_creds)
        result: Dict[str, Any] = {
            "health_ok": health.ok,
            "health_detail": health.detail,
            "latency_ms": health.latency_ms,
        }
        update: Dict[str, Any] = {"updated_at": _now().isoformat()}
        if health.ok:
            update["last_health_ok_at"] = health.checked_at
            update["consecutive_failures"] = 0
            try:
                q = await provider.quota(acc_creds)
                result["quota"] = {
                    "used_bytes": q.used_bytes,
                    "capacity_bytes": q.capacity_bytes,
                    "used_pct": q.used_pct,
                }
                update["provider_used_bytes"] = q.used_bytes
                update["last_quota_sync_at"] = q.reported_at
                # drift between our counter and Google's truth — surfaced, not
                # silently rewritten (the daily reconciler owns corrections)
                result["committed_bytes"] = int(acc.get("committed_bytes") or 0)
                result["drift_bytes"] = int(acc.get("committed_bytes") or 0) - q.used_bytes
            except Exception as e:
                result["quota_error"] = str(e)
        else:
            update["consecutive_failures"] = int(acc.get("consecutive_failures") or 0) + 1
        await db.storage_accounts.update_one({"id": account_id}, {"$set": update})
        return result

    return router
