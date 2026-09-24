"""
admin_security.py — Admin MFA (TOTP) + granular RBAC (Phase 1).

MFA: RFC-6238 TOTP implemented in pure Python (no new dependency), with QR
enrollment (otpauth:// provisioning URI), one-time backup codes (stored hashed),
verify, and disable. Stored on the admin doc under `mfa`.

RBAC: a role→permissions catalog + `has_permission()` + a `require_permission()`
FastAPI dependency factory, plus super-admin endpoints to assign roles. This is
an ADDITIVE authorization layer — existing `require_super_admin`/`require_admin`
guards keep working; new sensitive endpoints can opt into fine-grained perms.

    from admin_security import build_admin_security_router
    app.include_router(build_admin_security_router(db, require_admin, require_super_admin, hash_pw, verify_pw))
"""
from __future__ import annotations

import os
import hmac
import time
import base64
import hashlib
import secrets
import struct
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Set

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("admin_security")

# ---------------------------------------------------------------------------
# RBAC catalogue
# ---------------------------------------------------------------------------
PERMISSIONS = [
    "billing.view", "billing.refund", "disputes.manage",
    "support.manage", "moderation.manage", "users.view", "users.suspend",
    "storage.view", "analytics.view", "settings.manage", "flags.manage",
    "impersonate", "roles.manage",
]
ROLES: Dict[str, Set[str]] = {
    "super_admin":        set(PERMISSIONS),                                    # everything
    "operations_manager": {"support.manage", "disputes.manage", "users.view", "users.suspend",
                           "moderation.manage", "analytics.view", "storage.view"},
    "moderator":          {"moderation.manage", "users.view", "support.manage"},
    "support_agent":      {"support.manage", "users.view", "disputes.manage"},
    "finance_manager":    {"billing.view", "billing.refund", "disputes.manage", "analytics.view"},
    "marketing_manager":  {"analytics.view", "flags.manage"},
    "storage_manager":    {"storage.view", "analytics.view"},
    "read_only_auditor":  {"billing.view", "users.view", "analytics.view", "storage.view", "moderation.manage"},
    "admin":              set(),   # legacy photographer role — no platform-admin perms
}


def has_permission(role: Optional[str], perm: str) -> bool:
    return perm in ROLES.get(role or "admin", set())


# ---------------------------------------------------------------------------
# TOTP (RFC 6238) — pure python
# ---------------------------------------------------------------------------
def generate_secret() -> str:
    """Base32 secret (no padding) — what an authenticator app stores."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int, digits: int = 6) -> str:
    # pad base32 back to a multiple of 8 for the decoder
    pad = "=" * ((8 - len(secret_b32) % 8) % 8)
    key = base64.b32decode(secret_b32.upper() + pad)
    msg = struct.pack(">Q", counter)
    dig = hmac.new(key, msg, hashlib.sha1).digest()
    offset = dig[-1] & 0x0F
    code = (struct.unpack(">I", dig[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def totp(secret_b32: str, for_time: Optional[int] = None, step: int = 30, digits: int = 6) -> str:
    t = int(for_time if for_time is not None else time.time())
    return _hotp(secret_b32, t // step, digits)


def verify_totp(secret_b32: str, code: str, window: int = 1) -> bool:
    """Accept the code for the current step ± `window` steps (clock skew)."""
    if not code or not secret_b32:
        return False
    code = code.strip()
    now = int(time.time())
    for w in range(-window, window + 1):
        if hmac.compare_digest(totp(secret_b32, now + w * 30), code):
            return True
    return False


def provisioning_uri(secret_b32: str, account: str, issuer: str = "MAJA Invites") -> str:
    from urllib.parse import quote
    label = quote(f"{issuer}:{account}")
    return (f"otpauth://totp/{label}?secret={secret_b32}"
            f"&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_code(code: str) -> str:
    return hashlib.sha256(f"maja-backup::{code}".encode()).hexdigest()


def generate_backup_codes(n: int = 8) -> List[str]:
    return ["-".join(secrets.token_hex(2) for _ in range(2)) for _ in range(n)]


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
class MfaVerifyIn(BaseModel):
    code: str


class RoleAssignIn(BaseModel):
    admin_id: str
    role: str


class ImpersonateIn(BaseModel):
    target_admin_id: str
    reason: str


def build_admin_security_router(db, require_admin, require_super_admin,
                                get_password_hash=None, verify_password=None,
                                create_access_token=None) -> APIRouter:
    router = APIRouter(tags=["admin-security"])

    def _aid(admin):
        return admin.get("admin_id") if isinstance(admin, dict) else admin

    async def _audit(actor, action, target, meta=None):
        try:
            await db.audit_logs.insert_one({"id": secrets.token_hex(8), "actor_id": actor,
                                            "action": action, "target": target, "meta": meta or {},
                                            "created_at": _now_iso()})
        except Exception:
            pass

    # ---- RBAC catalogue + assignment ----
    @router.get("/api/admin/rbac/catalogue")
    async def catalogue(admin=Depends(require_admin)):
        return {"permissions": PERMISSIONS, "roles": {r: sorted(p) for r, p in ROLES.items()}}

    @router.get("/api/admin/rbac/me")
    async def my_perms(admin=Depends(require_admin)):
        aid = _aid(admin)
        row = await db.admins.find_one({"id": aid}, {"_id": 0})
        role = (row or {}).get("role", "admin")
        return {"role": role, "permissions": sorted(ROLES.get(role, set()))}

    @router.post("/api/admin/rbac/assign")
    async def assign(payload: RoleAssignIn, super_admin=Depends(require_super_admin)):
        if payload.role not in ROLES:
            raise HTTPException(400, "Unknown role")
        row = await db.admins.find_one({"id": payload.admin_id}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Admin not found")
        await db.admins.update_one({"id": payload.admin_id},
                                   {"$set": {"role": payload.role, "role_changed_at": _now_iso()}})
        await _audit(super_admin if isinstance(super_admin, str) else _aid(super_admin),
                     "rbac.assign", payload.admin_id, {"role": payload.role})
        return {"admin_id": payload.admin_id, "role": payload.role}

    # ---- MFA ----
    @router.get("/api/admin/mfa/status")
    async def mfa_status(admin=Depends(require_admin)):
        row = await db.admins.find_one({"id": _aid(admin)}, {"_id": 0})
        mfa = (row or {}).get("mfa") or {}
        return {"enabled": bool(mfa.get("enabled")),
                "backup_codes_remaining": len(mfa.get("backup_codes") or [])}

    @router.post("/api/admin/mfa/enroll/start")
    async def enroll_start(admin=Depends(require_admin)):
        aid = _aid(admin)
        row = await db.admins.find_one({"id": aid}, {"_id": 0})
        if (row or {}).get("mfa", {}).get("enabled"):
            raise HTTPException(400, "MFA already enabled")
        secret = generate_secret()
        await db.admins.update_one({"id": aid}, {"$set": {"mfa_pending_secret": secret}})
        account = (row or {}).get("email") or aid
        return {"secret": secret, "otpauth_uri": provisioning_uri(secret, account)}

    @router.post("/api/admin/mfa/enroll/verify")
    async def enroll_verify(payload: MfaVerifyIn, admin=Depends(require_admin)):
        aid = _aid(admin)
        row = await db.admins.find_one({"id": aid}, {"_id": 0})
        pending = (row or {}).get("mfa_pending_secret")
        if not pending:
            raise HTTPException(400, "Start enrollment first")
        if not verify_totp(pending, payload.code):
            raise HTTPException(400, "Incorrect code — check your authenticator app")
        codes = generate_backup_codes()
        await db.admins.update_one({"id": aid}, {"$set": {
            "mfa": {"enabled": True, "secret": pending,
                    "backup_codes": [_hash_code(c) for c in codes], "enrolled_at": _now_iso()},
            "mfa_pending_secret": None}})
        await _audit(aid, "mfa.enabled", aid)
        return {"enabled": True, "backup_codes": codes}   # shown ONCE

    @router.post("/api/admin/mfa/disable")
    async def mfa_disable(payload: MfaVerifyIn, admin=Depends(require_admin)):
        aid = _aid(admin)
        row = await db.admins.find_one({"id": aid}, {"_id": 0})
        mfa = (row or {}).get("mfa") or {}
        if not mfa.get("enabled"):
            raise HTTPException(400, "MFA is not enabled")
        if not (verify_totp(mfa.get("secret", ""), payload.code)
                or _hash_code(payload.code.strip()) in (mfa.get("backup_codes") or [])):
            raise HTTPException(400, "Incorrect code")
        await db.admins.update_one({"id": aid}, {"$set": {"mfa": {"enabled": False}}})
        await _audit(aid, "mfa.disabled", aid)
        return {"enabled": False}

    # ---- Audited impersonation (Phase 13) ----
    @router.post("/api/admin/impersonate")
    async def impersonate(payload: ImpersonateIn, super_admin=Depends(require_super_admin)):
        if create_access_token is None:
            raise HTTPException(500, "Impersonation not configured")
        if not payload.reason or len(payload.reason.strip()) < 5:
            raise HTTPException(400, "A reason (min 5 characters) is required")
        target = await db.admins.find_one({"id": payload.target_admin_id}, {"_id": 0})
        if not target:
            raise HTTPException(404, "Target admin not found")
        actor = super_admin if isinstance(super_admin, str) else _aid(super_admin)
        from datetime import timedelta
        # Short-lived, scoped token carrying an `imp` claim so the session is
        # attributable to the impersonator. Every impersonation is audit-logged
        # with the required reason.
        token = create_access_token(
            data={"sub": target["id"], "role": target.get("role", "admin"), "imp": actor},
            expires_delta=timedelta(minutes=30))
        await _audit(actor, "admin.impersonate", payload.target_admin_id,
                     {"reason": payload.reason.strip()[:500]})
        return {"access_token": token, "token_type": "bearer", "expires_in": 1800,
                "impersonating": {"id": target["id"],
                                  "name": target.get("name") or target.get("studio_name")}}

    return router
