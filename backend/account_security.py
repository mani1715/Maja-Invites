"""
account_security.py — photographer self-service account security (panel).

Fills the audit's #1 gap: a studio could not change its password / email / phone
from inside the panel, nor see/revoke its own sessions. This adds those, reusing
the existing password hashing (auth.py), refresh-session store (auth_sessions.py)
and MFA engine (admin_security.py — its /api/admin/mfa/* endpoints already work
for photographers). Every change is audit-logged and, for a password change, all
OTHER sessions are revoked.

    from account_security import build_account_security_router
    app.include_router(build_account_security_router(db, get_current_admin))
"""
from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import verify_password, get_password_hash

logger = logging.getLogger("account_security")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _audit(db, actor_id: str, action: str, meta: Optional[dict] = None):
    try:
        await db.audit_logs.insert_one({
            "id": uuid.uuid4().hex, "actor_id": actor_id, "action": action,
            "meta": meta or {}, "created_at": _now_iso()})
    except Exception:
        pass


def _is_supabase(admin: dict) -> bool:
    ph = admin.get("password_hash") or ""
    return admin.get("supabase_user_id") is not None or (isinstance(ph, str) and ph.startswith("$supabase"))


# ---------------------------------------------------------------------------
# core logic (testable — no FastAPI). Raise ValueError → 400, LookupError → 404.
# ---------------------------------------------------------------------------
async def _load(db, admin_id: str) -> dict:
    a = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not a:
        raise LookupError("Account not found")
    return a


async def do_change_password(db, admin_id: str, current: str, new: str) -> dict:
    a = await _load(db, admin_id)
    if _is_supabase(a):
        raise ValueError("This account signs in with Google — manage your password in your Google account.")
    if not verify_password(current, a.get("password_hash") or ""):
        raise ValueError("Current password is incorrect")
    if len(new or "") < 8:
        raise ValueError("New password must be at least 8 characters")
    if new == current:
        raise ValueError("New password must be different")
    await db.admins.update_one({"id": admin_id}, {"$set": {"password_hash": get_password_hash(new)}})
    try:
        from auth_sessions import revoke_all_for_subject
        await revoke_all_for_subject(db, admin_id)
    except Exception:
        pass
    await _audit(db, admin_id, "account.password_change")
    return {"ok": True, "message": "Password updated. Other devices have been signed out."}


async def do_change_email(db, admin_id: str, new_email: str, password: str) -> dict:
    a = await _load(db, admin_id)
    if _is_supabase(a):
        raise ValueError("Email is managed by your Google account.")
    if not verify_password(password, a.get("password_hash") or ""):
        raise ValueError("Password is incorrect")
    new_email = (new_email or "").strip().lower()
    if not _EMAIL_RE.match(new_email):
        raise ValueError("Enter a valid email address")
    if new_email == (a.get("email") or "").lower():
        raise ValueError("That is already your email")
    taken = await db.admins.find_one({"email": new_email}, {"_id": 0})
    if taken and taken.get("id") != admin_id:
        raise ValueError("That email is already in use")
    await db.admins.update_one({"id": admin_id}, {"$set": {"email": new_email}})
    await _audit(db, admin_id, "account.email_change", {"to": new_email})
    return {"ok": True, "email": new_email}


async def do_change_phone(db, admin_id: str, new_phone: str, password: str) -> dict:
    a = await _load(db, admin_id)
    if not verify_password(password, a.get("password_hash") or ""):
        raise ValueError("Password is incorrect")
    phone = (new_phone or "").strip()
    await db.admins.update_one({"id": admin_id}, {"$set": {"phone": phone}})
    await _audit(db, admin_id, "account.phone_change")
    return {"ok": True, "phone": phone}


async def do_revoke_device(db, admin_id: str, device_id: str) -> dict:
    await db.refresh_tokens.update_many(
        {"subject_id": admin_id, "device_id": device_id},
        {"$set": {"revoked": True, "revoked_at": _now_iso(), "revoke_reason": "user_revoke"}})
    await db.device_sessions.update_many(
        {"subject_id": admin_id, "device_id": device_id},
        {"$set": {"revoked": True, "revoked_at": _now_iso()}})
    await _audit(db, admin_id, "account.revoke_device", {"device_id": device_id})
    return {"ok": True}


async def account_summary(db, admin_id: str) -> dict:
    a = await _load(db, admin_id)
    return {
        "email": a.get("email"), "phone": a.get("phone"),
        "name": a.get("name") or a.get("studio_name"),
        "has_password": bool(a.get("password_hash")) and not _is_supabase(a),
        "auth_provider": "google" if _is_supabase(a) else "password",
    }


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=120)


class EmailChange(BaseModel):
    new_email: str
    password: str = Field(min_length=1)


class PhoneChange(BaseModel):
    new_phone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=1)


class RevokeDevice(BaseModel):
    device_id: str


def _wrap(exc: Exception):
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    return HTTPException(500, "Something went wrong")


def build_account_security_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["account-security"])

    @router.get("/api/admin/account/summary")
    async def summary(admin_id: str = Depends(get_current_admin)):
        try:
            return await account_summary(db, admin_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/admin/account/change-password")
    async def change_password(payload: PasswordChange, admin_id: str = Depends(get_current_admin)):
        try:
            return await do_change_password(db, admin_id, payload.current_password, payload.new_password)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/admin/account/change-email")
    async def change_email(payload: EmailChange, admin_id: str = Depends(get_current_admin)):
        try:
            return await do_change_email(db, admin_id, payload.new_email, payload.password)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/admin/account/change-phone")
    async def change_phone(payload: PhoneChange, admin_id: str = Depends(get_current_admin)):
        try:
            return await do_change_phone(db, admin_id, payload.new_phone, payload.password)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/admin/account/revoke-device")
    async def revoke_device(payload: RevokeDevice, admin_id: str = Depends(get_current_admin)):
        try:
            return await do_revoke_device(db, admin_id, payload.device_id)
        except Exception as e:
            raise _wrap(e)

    return router
