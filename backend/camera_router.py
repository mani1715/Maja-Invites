"""
camera_router.py — HTTP surface for the camera SFTP transfer lane.

The website only ever handles auth, config, status, and revocation here — NEVER
image bytes (those go camera -> SFTP -> S3). Studio routes are owner-scoped
(reusing gallery_features._require_owned_profile); lifecycle/monitoring routes
that span studios require super-admin.

The one-time plaintext password is returned ONLY by enable/rotate and never
again — the config route re-shows everything except the secret.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import camera_profiles
import camera_transfer_service as cts
from gallery_features import _require_owned_profile

logger = logging.getLogger("camera_router")


class EnableCameraPayload(BaseModel):
    camera_key: Optional[str] = camera_profiles.DEFAULT_PROFILE_KEY
    # Optional photographer-chosen login. Blank -> auto-generated. The username is
    # the per-event key, so a custom one must be unique across events.
    username: Optional[str] = None
    password: Optional[str] = None


def _connection_block(camera_key: str, username: Optional[str] = None,
                      profile_id: Optional[str] = None) -> dict:
    """Everything the photographer types into the camera EXCEPT the password.

    Protocol-aware: the Sony a7 IV (and other FTP cameras) use FTPES; generic
    SFTP cameras use SFTP. Carries a single copy-paste `connection_uri` and the
    `s3_prefix` this event's photos land in (proof a camera writes only into its
    own event's folder).
    """
    prof = camera_profiles.get_profile(camera_key)
    host, port, label = cts.endpoint_for(prof.protocol)
    is_ftps = prof.protocol == "ftps"
    scheme = "ftpes" if is_ftps else "sftp"
    uri = f"{scheme}://{username}@{host}:{port}/" if username else None

    # SFTP verifies an SSH host-key fingerprint; FTPES uses a TLS cert the camera
    # accepts via its root-certificate prompt (no SSH fingerprint to show).
    fingerprint = None
    if not is_ftps:
        try:
            import camera_sftp_server as css
            fingerprint = css.read_fingerprint()
        except Exception:
            fingerprint = None
        fingerprint = fingerprint or "pending (SFTP service not started)"

    return {
        "protocol": prof.protocol,
        "secure": True,
        "secure_protocol_label": label,
        "host": host,
        "port": port,
        "username": username,
        "remote_directory": "/",
        "host_key_fingerprint": fingerprint,
        "tls_note": ("Self-signed TLS — if the camera reports a root-certificate "
                     "error, choose to connect anyway; the link is still encrypted."
                     if is_ftps else None),
        "connection_uri": uri,
        "s3_prefix": (f"weddings/{profile_id}/" if profile_id else None),
        "camera_profile": prof.as_dict(),
    }


def _connection_code(username: str, password: str, camera_key: str) -> str:
    """One-time full connection code (carries the password). Shown once."""
    prof = camera_profiles.get_profile(camera_key)
    host, port, _ = cts.endpoint_for(prof.protocol)
    scheme = "ftpes" if prof.protocol == "ftps" else "sftp"
    return f"{scheme}://{username}:{password}@{host}:{port}/"


def build_camera_router(db, get_current_admin, require_super_admin):
    router = APIRouter(prefix="/api", tags=["camera-transfer"])

    # ---- static: known camera models (for the UI picker) ----------------
    @router.get("/admin/camera/profiles")
    async def camera_profiles_list(admin_id: str = Depends(get_current_admin)):
        return {"profiles": camera_profiles.list_profiles(),
                "default": camera_profiles.DEFAULT_PROFILE_KEY}

    # ================= STUDIO (owner-scoped) =============================
    @router.get("/admin/profiles/{profile_id}/camera/status")
    async def camera_status(profile_id: str,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        st = await cts.status(db, profile)
        camera_key = (st.get("transfer") or {}).get("camera_key") or camera_profiles.DEFAULT_PROFILE_KEY
        username = (st.get("transfer") or {}).get("username")
        st["connection"] = _connection_block(camera_key, username, profile["id"])
        st["gallery_enabled"] = bool((profile.get("gallery_config") or {}).get("enabled"))
        return st

    @router.post("/admin/profiles/{profile_id}/camera/enable")
    async def camera_enable(profile_id: str, payload: EnableCameraPayload,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        gc = profile.get("gallery_config") or {}
        if not gc.get("enabled"):
            # The face collection is created by gallery-enable; camera photos need
            # somewhere to index. Don't silently duplicate that flow.
            raise HTTPException(
                status_code=400,
                detail="Enable the photo gallery (AI Face Match) for this event first, "
                       "then enable camera transfer.")
        try:
            view = await cts.enable_transfer(
                db, profile, admin_id, payload.camera_key,
                username=(payload.username or None), password=(payload.password or None))
        except cts.CredentialError as e:
            raise HTTPException(status_code=409 if e.taken else 400, detail=str(e))
        password = view.pop("password", None)
        return {
            "success": True,
            "transfer": view,
            "credentials": {                 # shown ONCE — not retrievable again
                **_connection_block(view.get("camera_key"), view.get("username"), profile["id"]),
                "password": password,
                "connection_code": _connection_code(view.get("username"), password, view.get("camera_key")),
            },
        }

    @router.post("/admin/profiles/{profile_id}/camera/rotate")
    async def camera_rotate(profile_id: str,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        view = await cts.rotate_password(db, profile["id"])
        if not view:
            raise HTTPException(status_code=404, detail="Camera transfer not set up for this event")
        password = view.pop("password", None)
        return {"success": True, "transfer": view,
                "credentials": {**_connection_block(view.get("camera_key"), view.get("username"), profile["id"]),
                                "password": password,
                                "connection_code": _connection_code(view.get("username"), password, view.get("camera_key"))}}

    @router.post("/admin/profiles/{profile_id}/camera/disable")
    async def camera_disable(profile_id: str,
                             admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        view = await cts.set_status(db, profile["id"], cts.STATUS_DISABLED)
        if not view:
            raise HTTPException(status_code=404, detail="Camera transfer not set up for this event")
        return {"success": True, "transfer": view}

    @router.get("/admin/profiles/{profile_id}/camera/config")
    async def camera_config(profile_id: str,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        row = await cts.get_transfer(db, profile["id"])
        if not row:
            raise HTTPException(status_code=404, detail="Camera transfer not set up for this event")
        view = cts.public_view(row)
        return {"transfer": view,
                "connection": _connection_block(view.get("camera_key"), view.get("username"), profile["id"])}

    @router.get("/admin/profiles/{profile_id}/camera/events")
    async def camera_events(profile_id: str, limit: int = 50,
                            admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(db, profile_id, admin_id)
        limit = max(1, min(int(limit or 50), 200))
        rows = await db.camera_events.find(
            {"profile_id": profile["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return {"events": rows}

    # ================= ADMIN (super-admin only) ==========================
    @router.get("/admin/camera/transfers")
    async def admin_list_transfers(admin=Depends(require_super_admin)):
        return {"transfers": await cts.list_active(db)}

    @router.post("/admin/camera/{profile_id}/revoke")
    async def admin_revoke(profile_id: str, admin=Depends(require_super_admin)):
        view = await cts.set_status(db, profile_id, cts.STATUS_REVOKED)
        if not view:
            raise HTTPException(status_code=404, detail="Camera transfer not found")
        return {"success": True, "transfer": view}

    @router.get("/admin/camera/events")
    async def admin_events(limit: int = 100, admin=Depends(require_super_admin)):
        limit = max(1, min(int(limit or 100), 500))
        rows = await db.camera_events.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
        return {"events": rows}

    return router
