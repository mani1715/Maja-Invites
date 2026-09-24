"""
camera_transfer_service.py — lifecycle + authentication for per-event camera
SFTP transfer credentials.

One `db.camera_transfers` row per event (profile). It binds, SERVER-SIDE:
    username  ->  profile_id (event)  ->  admin_id (owning photographer)
so the camera never supplies (and can never influence) which event it writes to.
The SFTP identity is the ONLY source of the event association — exactly the
"do not trust the client event id / path" rule the brief mandates.

Credential storage: we terminate the SFTP server ourselves, so we only ever need
to VERIFY the password, never recover it — it is stored as a bcrypt hash (same
as admin passwords), shown in plaintext EXACTLY ONCE at create/rotate, and
replaced (not revealed) on rotate. No recoverable secret, nothing to leak.

Lifecycle: CREATE -> ACTIVE -> (ROTATE keeps id, new password) -> DISABLE/REVOKE
-> EXPIRE (TTL). authenticate() enforces active + not-expired on every connect.

Audit: every transfer attempt writes a `db.camera_events` row (stored / duplicate
/ rejected + reason), so admin can answer who / which event / when / how many /
what failed. Credentials are NEVER logged.
"""
from __future__ import annotations

import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import camera_profiles
from auth import get_password_hash, verify_password

# Connection config the camera is handed (host/port are display-only here; the
# SFTP server binds the port). Host defaults to the public SFTP hostname.
SFTP_HOST = os.environ.get("CAMERA_SFTP_HOST", "ftp.majainvites.com")
# Default 2222 = the port the overlay publishes on the host (2222->22 in the
# container). The camera connects to the published port, never 22 (that's the
# VM's own sshd). Override with CAMERA_SFTP_PORT only if you republish elsewhere.
SFTP_PORT = int(os.environ.get("CAMERA_SFTP_PORT", "2222"))

# FTPES (FTP-over-TLS) — the protocol the Sony a7 IV actually speaks (it has no
# SFTP). Same host; standard FTP control port 21 by default.
FTPS_HOST = os.environ.get("CAMERA_FTPS_HOST", SFTP_HOST)
FTPS_PORT = int(os.environ.get("CAMERA_FTPS_PORT", "21"))


def endpoint_for(protocol: str):
    """(host, port, label) the panel/camera use for a given camera protocol."""
    p = (protocol or "").lower()
    if p == "ftps":
        return FTPS_HOST, FTPS_PORT, "FTPES (FTP over TLS)"
    return SFTP_HOST, SFTP_PORT, "SFTP (SSH)"
# Credentials expire on a TTL so a lost/forgotten camera can't upload forever.
CRED_TTL_DAYS = int(os.environ.get("CAMERA_CRED_TTL_DAYS", "120"))
# "Connected" is activity-based (cameras don't hold a socket): last_seen within
# this window reads as connected in the panel.
ONLINE_WINDOW_MINUTES = int(os.environ.get("CAMERA_ONLINE_WINDOW_MINUTES", "15"))

STATUS_ACTIVE = "active"
STATUS_DISABLED = "disabled"
STATUS_REVOKED = "revoked"

# upload_method stamped on gallery_photos rows that arrived via a camera, so
# stats can distinguish the camera lane from bulk/live uploads.
UPLOAD_METHOD = "sftp_camera"


def _now() -> datetime:
    return datetime.now(timezone.utc)


_USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$")   # 3-32 chars
PW_MIN, PW_MAX = 6, 64


class CredentialError(ValueError):
    """Raised for a bad/duplicate custom username or a bad password. `.code` is a
    stable machine string; `.taken` marks a username-uniqueness conflict (409)."""
    def __init__(self, code: str, taken: bool = False):
        super().__init__(code)
        self.code = code
        self.taken = taken


def _validate_password(pw: str) -> None:
    if not isinstance(pw, str) or not (PW_MIN <= len(pw) <= PW_MAX):
        raise CredentialError(f"password must be {PW_MIN}-{PW_MAX} characters")


async def _validate_username(db, username: str, profile_id: str) -> str:
    username = (username or "").strip()
    if not _USERNAME_RE.match(username):
        raise CredentialError("username must be 3-32 chars: letters, digits, . _ -")
    clash = await db.camera_transfers.find_one({"username": username}, {"_id": 0})
    if clash and clash.get("profile_id") != profile_id:
        raise CredentialError("that username is already used by another event", taken=True)
    return username


def _gen_username() -> str:
    # Camera-enterable: lowercase alnum + single dash. Short, unique-checked.
    return f"maja-{secrets.token_hex(4)}"


def _gen_password() -> str:
    # token_urlsafe -> [A-Za-z0-9_-]; ~22 chars. Safe for Sony's password field.
    return secrets.token_urlsafe(16)


def _parse_dt(v) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def is_expired(row: dict) -> bool:
    exp = _parse_dt(row.get("expires_at"))
    return exp is not None and _now() >= exp


def is_usable(row: Optional[dict]) -> bool:
    return bool(row) and row.get("status") == STATUS_ACTIVE and not is_expired(row)


def public_view(row: dict) -> Dict[str, Any]:
    """Row minus the secret — safe to return to the owner/admin/UI."""
    if not row:
        return {}
    return {
        "id": row.get("id"),
        "profile_id": row.get("profile_id"),
        "admin_id": row.get("admin_id"),
        "camera_key": row.get("camera_key"),
        "username": row.get("username"),
        "status": row.get("status"),
        "remote_dir": row.get("remote_dir"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "expires_at": row.get("expires_at"),
        "last_seen_at": row.get("last_seen_at"),
        "expired": is_expired(row),
    }


async def get_transfer(db, profile_id: str) -> Optional[dict]:
    return await db.camera_transfers.find_one({"profile_id": profile_id}, {"_id": 0})


async def _unique_username(db) -> str:
    for _ in range(8):
        u = _gen_username()
        if not await db.camera_transfers.find_one({"username": u}, {"_id": 0}):
            return u
    # Astronomically unlikely; widen entropy rather than loop forever.
    return f"maja-{secrets.token_hex(6)}"


async def enable_transfer(db, profile: dict, admin_id: str, camera_key: str,
                          username: Optional[str] = None,
                          password: Optional[str] = None) -> Dict[str, Any]:
    """Create the transfer for an event (or re-activate + rotate an existing
    one). Optionally with a photographer-chosen `username`/`password` (else both
    are auto-generated). Returns the public view PLUS the one-time plaintext
    password. Raises CredentialError on a bad/duplicate username or weak password.

    Caller must have already verified ownership of `profile` and that the
    gallery/face collection is enabled (camera photos need a collection to index
    into). This function does not re-check ownership. The username is the per-event
    key, so a custom one must be UNIQUE across events (enforced here).
    """
    prof_id = profile["id"]
    camera_key = camera_profiles.get_profile(camera_key).key   # normalise/validate

    if password is not None:
        _validate_password(password)
    if username is not None:
        username = await _validate_username(db, username, prof_id)

    password = password or _gen_password()
    pw_hash = get_password_hash(password)
    now = _now().isoformat()
    expires = (_now() + timedelta(days=CRED_TTL_DAYS)).isoformat()

    existing = await get_transfer(db, prof_id)
    if existing:
        upd = {
            "status": STATUS_ACTIVE,
            "camera_key": camera_key,
            "password_hash": pw_hash,     # rotate the secret on every enable
            "updated_at": now,
            "expires_at": expires,
        }
        if username is not None:
            upd["username"] = username
        await db.camera_transfers.update_one({"id": existing["id"]}, {"$set": upd})
        row = {**existing, **upd}
    else:
        row = {
            "id": str(uuid.uuid4()),
            "profile_id": prof_id,
            "admin_id": profile.get("admin_id") or admin_id,   # OWNER, not caller
            "camera_key": camera_key,
            "username": username or await _unique_username(db),
            "password_hash": pw_hash,
            "status": STATUS_ACTIVE,
            "remote_dir": "/",           # chroot root; event comes from identity
            "created_at": now,
            "updated_at": now,
            "expires_at": expires,
            "last_seen_at": None,
            "created_by": admin_id,
        }
        await db.camera_transfers.insert_one(row)

    view = public_view(row)
    view["password"] = password          # shown ONCE, never stored in the clear
    return view


async def rotate_password(db, profile_id: str) -> Optional[Dict[str, Any]]:
    row = await get_transfer(db, profile_id)
    if not row:
        return None
    password = _gen_password()
    await db.camera_transfers.update_one(
        {"id": row["id"]},
        {"$set": {"password_hash": get_password_hash(password),
                  "status": STATUS_ACTIVE,
                  "updated_at": _now().isoformat(),
                  "expires_at": (_now() + timedelta(days=CRED_TTL_DAYS)).isoformat()}})
    view = public_view({**row, "status": STATUS_ACTIVE})
    view["password"] = password
    return view


async def set_status(db, profile_id: str, status: str) -> Optional[dict]:
    if status not in (STATUS_ACTIVE, STATUS_DISABLED, STATUS_REVOKED):
        raise ValueError(f"bad status {status!r}")
    row = await get_transfer(db, profile_id)
    if not row:
        return None
    await db.camera_transfers.update_one(
        {"id": row["id"]},
        {"$set": {"status": status, "updated_at": _now().isoformat()}})
    return public_view({**row, "status": status})


async def authenticate(db, username: str, password: str) -> Optional[Dict[str, Any]]:
    """SFTP-server hook. Returns a binding {transfer_id, profile_id, admin_id,
    remote_dir} on success, else None. Enforces active + not-expired. Constant-
    time-ish: always runs a bcrypt verify against a real-or-dummy hash so a
    missing username and a wrong password take the same path.
    """
    username = (username or "").strip()
    row = await db.camera_transfers.find_one({"username": username}, {"_id": 0}) if username else None
    stored_hash = (row or {}).get("password_hash") or get_password_hash("x")  # dummy work
    ok = False
    try:
        ok = verify_password(password or "", stored_hash)
    except Exception:
        ok = False
    if not ok or not is_usable(row):
        return None
    return {
        "transfer_id": row["id"],
        "profile_id": row["profile_id"],
        "admin_id": row["admin_id"],
        "remote_dir": row.get("remote_dir") or "/",
    }


async def touch_last_seen(db, transfer_id: str) -> None:
    try:
        await db.camera_transfers.update_one(
            {"id": transfer_id}, {"$set": {"last_seen_at": _now().isoformat()}})
    except Exception:
        pass   # last_seen is cosmetic; never fail a transfer over it


async def record_event(db, *, transfer_id: str, profile_id: str, filename: str,
                       size: int, result: str, reason: str = "",
                       photo_id: Optional[str] = None,
                       client_ip: str = "") -> None:
    """Audit trail for one received file. result ∈ stored|duplicate|rejected."""
    try:
        await db.camera_events.insert_one({
            "id": str(uuid.uuid4()),
            "transfer_id": transfer_id,
            "profile_id": profile_id,
            "filename": (filename or "")[:256],
            "bytes": int(size or 0),
            "result": result,
            "reason": (reason or "")[:256],
            "photo_id": photo_id,
            "client_ip": client_ip or "",
            "created_at": _now().isoformat(),
        })
    except Exception:
        pass


async def status(db, profile: dict) -> Dict[str, Any]:
    """Panel status for one event — connection + counts, all from real state."""
    prof_id = profile["id"]
    row = await get_transfer(db, prof_id)
    q = {"profile_id": prof_id, "upload_method": UPLOAD_METHOD}
    stored = await db.gallery_photos.count_documents(q)
    indexed = await db.gallery_photos.count_documents({**q, "indexed": True})
    failed = await db.gallery_photos.count_documents({**q, "index_error": {"$exists": True}})
    processing = max(0, stored - indexed - failed)
    rejected = await db.camera_events.count_documents(
        {"profile_id": prof_id, "result": "rejected"})

    last_photo = await db.gallery_photos.find(q, {"_id": 0, "created_at": 1}) \
        .sort("created_at", -1).limit(1).to_list(1)
    last_photo_at = last_photo[0]["created_at"] if last_photo else None

    last_seen = _parse_dt(row.get("last_seen_at")) if row else None
    connected = bool(last_seen and (_now() - last_seen) <= timedelta(minutes=ONLINE_WINDOW_MINUTES))

    return {
        "enabled": bool(row and row.get("status") == STATUS_ACTIVE and not is_expired(row)),
        "transfer": public_view(row) if row else None,
        "connected": connected,
        "received": stored + rejected,
        "stored": stored,
        "processing": processing,
        "indexed": indexed,
        "failed": failed + rejected,
        "last_photo_at": last_photo_at,
        "last_seen_at": row.get("last_seen_at") if row else None,
    }


async def list_active(db, limit: int = 500) -> List[Dict[str, Any]]:
    """Fleet view for admin — every non-revoked transfer, redacted."""
    rows = await db.camera_transfers.find(
        {"status": {"$ne": STATUS_REVOKED}}, {"_id": 0}).to_list(limit)
    return [public_view(r) for r in rows]
