"""
Wedding Gallery Privacy — Phase A
==================================
Per-invitation access-code protection for the wedding gallery + AI face match.

Adds these capabilities on top of the existing gallery_features.py:
  • Access code (4–20 chars, must contain at least 1 letter & 1 digit). Hashed via bcrypt.
  • Trusted-device session JWT (7 / 30 / 90 day expiry, configurable per invitation).
  • Brute-force lockout: 5 wrong unlock attempts → 5-minute block per (IP, slug).
  • AI face-search & private gallery endpoints honour a `X-Gallery-Device-Token` header.
  • Per-invitation privacy flags: public_highlights / private_full_gallery /
    ai_face_match / allow_downloads / allow_share.
  • Admin can reset password, force-logout all trusted devices, view scan analytics.

Storage:
  profiles.gallery_privacy = {
      enabled: bool,
      password_hash: str | None,
      remember_days: 7 | 30 | 90,
      public_highlights_enabled: bool,
      private_full_gallery_enabled: bool,
      ai_face_match_enabled: bool,
      allow_downloads: bool,
      allow_share: bool,
      expires_at: ISO str | None,
      device_token_salt: str,         # bumping this invalidates all devices
      updated_at: ISO str,
      stats: { unlocks: int, failed_attempts: int, ai_uploads: int, qr_scans: int }
  }

Public routes (under /api):
  GET   /public/gallery/{slug}/privacy       → is_protected, flags, has_highlights
  POST  /public/gallery/{slug}/unlock        → {code, remember} → {device_token, expires_at}

Admin routes (JWT, under /api):
  GET   /admin/profiles/{id}/gallery/privacy
  PUT   /admin/profiles/{id}/gallery/privacy
  POST  /admin/profiles/{id}/gallery/privacy/reset-code     → {new_code}
  POST  /admin/profiles/{id}/gallery/privacy/logout-all     → bumps device_token_salt
  GET   /admin/profiles/{id}/gallery/privacy/analytics

Helper exported for other modules to gate endpoints:
  enforce_gallery_access(profile, request, *, kind="view") → raises 401/403/410
"""
import os
import re
import time
import secrets
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

import jwt as _jwt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("gallery_privacy")

# Single source of truth for the signing secret: auth.py fail-hards at import if
# JWT_SECRET_KEY is unset (unless ALLOW_INSECURE_JWT=1). Importing it here removes
# this module's old independent "change-me" fallback, which could silently sign
# device tokens with a guessable literal.
from auth import SECRET_KEY as JWT_SECRET
JWT_ALG = "HS256"

# Brute-force window (in-memory; resets on restart — fine for a single replica wedding app)
LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_SEC = 5 * 60        # window in which attempts accumulate
LOCKOUT_DURATION_SEC = 5 * 60      # block duration after exceeding

_attempts: Dict[Tuple[str, str], list] = defaultdict(list)
_blocked_until: Dict[Tuple[str, str], float] = {}

# PIN rule: 4–6 digits, numeric only (event Live Gallery PIN — easy for guests
# to type; length is the photographer's choice within 4–6). Stored only as a
# one-way bcrypt hash; never revealed — an owner or admin RESETS it instead.
PASSWORD_RE = re.compile(r"^\d{4,6}$")
_PIN_ERROR = "PIN must be 4 to 6 digits"


# ============================================================
# Models
# ============================================================
class PrivacyFlags(BaseModel):
    enabled: bool = False
    public_highlights_enabled: bool = True
    private_full_gallery_enabled: bool = True
    ai_face_match_enabled: bool = True
    allow_downloads: bool = True
    allow_share: bool = True
    remember_days: int = 30
    expires_at: Optional[str] = None

    @field_validator("remember_days")
    @classmethod
    def _check_remember_days(cls, v: int) -> int:
        if v not in (7, 30, 90):
            raise ValueError("remember_days must be 7, 30, or 90")
        return v


class PrivacyUpdatePayload(PrivacyFlags):
    """When code is provided, server hashes it. When None, code is left unchanged."""
    code: Optional[str] = None
    confirm_code: Optional[str] = None

    @field_validator("code")
    @classmethod
    def _check_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not PASSWORD_RE.match(v):
            raise ValueError(_PIN_ERROR)
        return v


class UnlockPayload(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    remember: bool = True


# ============================================================
# Helpers
# ============================================================
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _device_jwt(profile_id: str, salt: str, ttl_days: int) -> str:
    payload = {
        "sub": "gallery",
        "pid": profile_id,
        "salt": salt,
        "iat": int(_now().timestamp()),
        "exp": int((_now() + timedelta(days=ttl_days)).timestamp()),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _verify_device_jwt(token: str, profile_id: str, salt: str) -> bool:
    try:
        data = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        return False
    return (
        data.get("sub") == "gallery"
        and data.get("pid") == profile_id
        and data.get("salt") == salt
    )


def verify_device_token(profile: Dict[str, Any], token: str) -> bool:
    """Validate a gallery device JWT against a profile's current privacy salt.
    Shared helper — used by enforce_gallery_access and by any other module
    (e.g. the live-gallery websocket) that needs the same trusted-device check.
    """
    if not token:
        return False
    privacy = profile.get("gallery_privacy") or {}
    return _verify_device_jwt(token, profile.get("id", ""), privacy.get("device_token_salt", ""))


def _get_default_privacy() -> Dict[str, Any]:
    return {
        "enabled": False,
        "password_hash": None,
        "remember_days": 30,
        "public_highlights_enabled": True,
        "private_full_gallery_enabled": True,
        "ai_face_match_enabled": True,
        "allow_downloads": True,
        "allow_share": True,
        "expires_at": None,
        "device_token_salt": secrets.token_hex(8),
        "updated_at": _iso(_now()),
        "stats": {"unlocks": 0, "failed_attempts": 0, "ai_uploads": 0, "qr_scans": 0},
    }


def _public_privacy(privacy: Dict[str, Any]) -> Dict[str, Any]:
    """Strip server-only fields before returning to public clients."""
    return {
        "enabled": bool(privacy.get("enabled")),
        "is_protected": bool(privacy.get("enabled") and privacy.get("password_hash")),
        "public_highlights_enabled": bool(privacy.get("public_highlights_enabled", True)),
        "private_full_gallery_enabled": bool(privacy.get("private_full_gallery_enabled", True)),
        "ai_face_match_enabled": bool(privacy.get("ai_face_match_enabled", True)),
        "allow_downloads": bool(privacy.get("allow_downloads", True)),
        "allow_share": bool(privacy.get("allow_share", True)),
        "remember_days": int(privacy.get("remember_days") or 30),
        "expires_at": privacy.get("expires_at"),
    }


def _expired(privacy: Dict[str, Any]) -> bool:
    exp = privacy.get("expires_at")
    if not exp:
        return False
    try:
        return _now() > datetime.fromisoformat(exp.replace("Z", "+00:00"))
    except Exception:
        return False


def _rl_key(request: Request, slug: str) -> Tuple[str, str]:
    # Spoof-safe client IP (see cache_backend.client_ip): the gallery-unlock
    # lockout is the most sensitive per-IP guard in the app — trusting a forged
    # XFF here gave unlimited access-code guesses.
    if not request:
        return ("unknown", slug)
    try:
        from cache_backend import client_ip
        return (client_ip(request), slug)
    except Exception:
        return (request.client.host if request.client else "unknown", slug)


def _check_rate_limit(key: Tuple[str, str]) -> Optional[int]:
    """Returns seconds-remaining if blocked, else None."""
    now = time.time()
    until = _blocked_until.get(key)
    if until and now < until:
        return int(until - now)
    # GC old attempts
    window_start = now - LOCKOUT_WINDOW_SEC
    _attempts[key] = [t for t in _attempts.get(key, []) if t >= window_start]
    return None


def _record_failure(key: Tuple[str, str]):
    now = time.time()
    _attempts[key].append(now)
    if len(_attempts[key]) >= LOCKOUT_MAX_ATTEMPTS:
        _blocked_until[key] = now + LOCKOUT_DURATION_SEC
        logger.warning("Gallery unlock locked for %s for %d seconds", key, LOCKOUT_DURATION_SEC)


def _reset_failures(key: Tuple[str, str]):
    _attempts.pop(key, None)
    _blocked_until.pop(key, None)


# ============================================================
# Public access enforcement (used by gallery_features endpoints)
# ============================================================
async def enforce_gallery_access(profile: Dict[str, Any], request: Optional[Request]) -> None:
    """Raise HTTPException if the request lacks a valid device token for a
    protected gallery. Pass silently when privacy is disabled or no password set.
    """
    privacy = profile.get("gallery_privacy") or {}
    if not (privacy.get("enabled") and privacy.get("password_hash")):
        return  # not protected → allow
    if _expired(privacy):
        raise HTTPException(status_code=410, detail="This gallery has expired")
    token = ""
    if request is not None:
        token = (request.headers.get("x-gallery-device-token")
                 or request.query_params.get("device_token") or "")
    if not verify_device_token(profile, token):
        raise HTTPException(status_code=401, detail="Gallery is locked — enter access code")


# ============================================================
# Router builder
# ============================================================
def build_privacy_router(db, get_current_admin, get_password_hash, verify_password):
    """Caller passes db handle + auth deps + bcrypt helpers from the main app
    so we share the same secret + collection.
    """
    router = APIRouter(prefix="/api", tags=["gallery-privacy"])

    async def _get_profile(slug_or_id: str) -> Optional[dict]:
        return await db.profiles.find_one(
            {"$or": [{"slug": slug_or_id}, {"id": slug_or_id}]}, {"_id": 0}
        )

    async def _require_owned_profile(profile_id: str, admin_id: str) -> dict:
        """Object-level authorization for the admin routes below (same pattern as
        gallery_features._require_owned_profile). Without this, any authenticated
        photographer could read/reset another studio's gallery access code."""
        profile = await _get_profile(profile_id)
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

    # -------------------------------------------------------
    # Public
    # -------------------------------------------------------
    @router.get("/public/gallery/{slug}/privacy")
    async def public_privacy_info(slug: str):
        profile = await _get_profile(slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Invitation not found")
        gc = profile.get("gallery_config") or {}
        privacy = profile.get("gallery_privacy") or _get_default_privacy()
        # Track QR scan (lightweight — we'll bump qr_scans here since this endpoint
        # is the landing call for the gallery experience)
        try:
            await db.profiles.update_one(
                {"id": profile["id"]},
                {"$inc": {"gallery_privacy.stats.qr_scans": 1}},
            )
        except Exception:
            pass
        return {
            **_public_privacy(privacy),
            "gallery_enabled": bool(gc.get("enabled")),
            "total_photos": int(gc.get("total_photos") or 0),
        }

    @router.post("/public/gallery/{slug}/unlock")
    async def public_unlock(slug: str, payload: UnlockPayload, request: Request):
        profile = await _get_profile(slug)
        if not profile:
            raise HTTPException(status_code=404, detail="Invitation not found")
        privacy = profile.get("gallery_privacy") or {}
        if not (privacy.get("enabled") and privacy.get("password_hash")):
            raise HTTPException(status_code=400, detail="Gallery is not protected")
        if _expired(privacy):
            raise HTTPException(status_code=410, detail="This gallery has expired")

        key = _rl_key(request, slug)
        blocked_for = _check_rate_limit(key)
        if blocked_for:
            raise HTTPException(
                status_code=429,
                detail=f"Too many wrong attempts. Try again in {blocked_for // 60 + 1} minute(s).",
            )

        if not verify_password(payload.code, privacy["password_hash"]):
            _record_failure(key)
            await db.profiles.update_one(
                {"id": profile["id"]},
                {"$inc": {"gallery_privacy.stats.failed_attempts": 1}},
            )
            raise HTTPException(status_code=401, detail="Incorrect access code")

        _reset_failures(key)
        ttl = int(privacy.get("remember_days") or 30) if payload.remember else 1
        salt = privacy.get("device_token_salt") or secrets.token_hex(8)
        token = _device_jwt(profile["id"], salt, ttl)
        await db.profiles.update_one(
            {"id": profile["id"]},
            {"$inc": {"gallery_privacy.stats.unlocks": 1}},
        )
        return {
            "device_token": token,
            "expires_at": _iso(_now() + timedelta(days=ttl)),
            "remember_days": ttl,
            "allow_downloads": bool(privacy.get("allow_downloads", True)),
            "allow_share": bool(privacy.get("allow_share", True)),
            "ai_face_match_enabled": bool(privacy.get("ai_face_match_enabled", True)),
        }

    # -------------------------------------------------------
    # Admin
    # -------------------------------------------------------
    @router.get("/admin/profiles/{profile_id}/gallery/privacy")
    async def admin_get(profile_id: str, _admin=Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, _admin)
        privacy = profile.get("gallery_privacy") or _get_default_privacy()
        # Don't return the hash
        out = {**privacy}
        out.pop("password_hash", None)
        out["has_password"] = bool(privacy.get("password_hash"))
        return out

    @router.put("/admin/profiles/{profile_id}/gallery/privacy")
    async def admin_update(profile_id: str, payload: PrivacyUpdatePayload,
                            _admin=Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, _admin)
        current = profile.get("gallery_privacy") or _get_default_privacy()

        # If a new code is being set, confirm it matches
        if payload.code:
            if (payload.confirm_code or "") != payload.code:
                raise HTTPException(status_code=400, detail="Access code and confirmation must match")
            current["password_hash"] = get_password_hash(payload.code)

        current["enabled"] = bool(payload.enabled)
        current["public_highlights_enabled"] = bool(payload.public_highlights_enabled)
        current["private_full_gallery_enabled"] = bool(payload.private_full_gallery_enabled)
        current["ai_face_match_enabled"] = bool(payload.ai_face_match_enabled)
        current["allow_downloads"] = bool(payload.allow_downloads)
        current["allow_share"] = bool(payload.allow_share)
        current["remember_days"] = int(payload.remember_days)
        current["expires_at"] = payload.expires_at
        current["updated_at"] = _iso(_now())
        if "device_token_salt" not in current or not current["device_token_salt"]:
            current["device_token_salt"] = secrets.token_hex(8)
        if "stats" not in current:
            current["stats"] = {"unlocks": 0, "failed_attempts": 0, "ai_uploads": 0, "qr_scans": 0}

        await db.profiles.update_one(
            {"id": profile["id"]}, {"$set": {"gallery_privacy": current}}
        )
        out = {**current}
        out.pop("password_hash", None)
        out["has_password"] = bool(current.get("password_hash"))
        return out

    @router.post("/admin/profiles/{profile_id}/gallery/privacy/reset-code")
    async def admin_reset_code(profile_id: str, payload: Dict[str, str],
                                _admin=Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, _admin)  # authorize before validating input
        new_code = (payload or {}).get("code", "")
        if not PASSWORD_RE.match(new_code or ""):
            raise HTTPException(status_code=400, detail=_PIN_ERROR)
        current = profile.get("gallery_privacy") or _get_default_privacy()
        current["password_hash"] = get_password_hash(new_code)
        current["device_token_salt"] = secrets.token_hex(8)  # also kicks existing devices
        current["updated_at"] = _iso(_now())
        await db.profiles.update_one(
            {"id": profile["id"]}, {"$set": {"gallery_privacy": current}}
        )
        return {"success": True, "message": "Access code reset. All trusted devices logged out."}

    @router.post("/admin/profiles/{profile_id}/gallery/privacy/logout-all")
    async def admin_logout_all(profile_id: str, _admin=Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, _admin)
        await db.profiles.update_one(
            {"id": profile["id"]},
            {"$set": {
                "gallery_privacy.device_token_salt": secrets.token_hex(8),
                "gallery_privacy.updated_at": _iso(_now()),
            }},
        )
        return {"success": True, "message": "All trusted devices logged out."}

    @router.get("/admin/profiles/{profile_id}/gallery/privacy/analytics")
    async def admin_analytics(profile_id: str, _admin=Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, _admin)
        privacy = profile.get("gallery_privacy") or {}
        stats = privacy.get("stats") or {}
        return {
            "qr_scans": int(stats.get("qr_scans") or 0),
            "unlocks": int(stats.get("unlocks") or 0),
            "failed_attempts": int(stats.get("failed_attempts") or 0),
            "ai_uploads": int(stats.get("ai_uploads") or 0),
            "matched_results": int(stats.get("matched_results") or 0),
            "is_protected": bool(privacy.get("enabled") and privacy.get("password_hash")),
            "is_expired": _expired(privacy),
        }

    return router


# ============================================================
# Convenience for user_features.py to validate code at create
# ============================================================
def hash_user_code(code: str, hasher) -> Optional[str]:
    """Validate + hash a user-supplied access code. Returns None if blank.
    Raises HTTPException on invalid format."""
    if not code:
        return None
    if not PASSWORD_RE.match(code):
        raise HTTPException(
            status_code=400,
            detail="Access code must be 4–20 chars with at least 1 letter and 1 digit",
        )
    return hasher(code)
