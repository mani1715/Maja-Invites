"""
auth_sessions.py — Refresh-token rotation, HttpOnly cookies, device sessions.

Production auth hardening (Phase 1c). Sits ON TOP of the existing short-lived
JWT access token (auth.create_access_token) without changing it:

  * Access token  — short-lived JWT (Authorization: Bearer ...), unchanged.
  * Refresh token — opaque random string, delivered ONLY as an HttpOnly cookie.
    Never exposed to JS. Server stores just its SHA-256 hash (never the raw
    value) in `refresh_tokens`, tagged with a rotation `family_id`.

Rotation + reuse detection:
  * Every /api/auth/refresh consumes the current refresh token (marks it revoked)
    and issues a NEW one in the same family. The access token is re-minted.
  * If a token that was ALREADY rotated (revoked) is presented again, that means
    it leaked/was replayed → the ENTIRE family is revoked (defense in depth).

Two independent TTLs on a rotation family:
  * IDLE  — REFRESH_TTL_DAYS (alias: SESSION_IDLE_DAYS), default 30. This is
    the sliding window: every successful refresh mints a new token with a
    fresh `expires_at`, so a family that keeps getting used never expires on
    its own. This is "dead after N days of no activity", nothing more.
  * ABSOLUTE — REFRESH_ABSOLUTE_DAYS, default 90. `family_created_at` is
    stamped once at login (issue_session) and carried forward verbatim on
    every rotation. Once `now - family_created_at` exceeds this, refresh is
    refused and the family is revoked regardless of how recently it was used
    — this is the ceiling the idle window alone can't provide, since an
    active attacker (or a legitimately long-lived tab) could otherwise keep a
    family alive forever.

Cookies are HttpOnly + SameSite=Lax, and Secure in production (ENVIRONMENT=
production). On localhost http, Secure is off so the cookie flows in dev.

Wired in server.py:
    from auth_sessions import (build_auth_sessions_router, issue_session,
                               REFRESH_COOKIE, DEVICE_COOKIE)
    app.include_router(build_auth_sessions_router(db, get_current_admin_with_role))
    # inside login(), after auth succeeds:
    await issue_session(db, subject_id=admin['id'], subject_kind='admin',
                        request=request, response=response)
"""
from __future__ import annotations

import os
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Depends, Request, Response, Cookie

logger = logging.getLogger("auth.sessions")

REFRESH_COOKIE = "maja_rt"
DEVICE_COOKIE = "maja_did"
# SESSION_IDLE_DAYS is the preferred name (see module docstring); kept as an
# override rather than a rename so REFRESH_TOKEN_EXPIRE_DAYS deployments keep
# working unchanged.
REFRESH_TTL_DAYS = int(os.environ.get("SESSION_IDLE_DAYS") or os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
REFRESH_ABSOLUTE_DAYS = int(os.environ.get("REFRESH_ABSOLUTE_DAYS", "90"))
_IS_PROD = os.environ.get("ENVIRONMENT", "development").lower() == "production"
_COOKIE_PATH = "/api"   # sent to /api/auth/* (refresh, logout) and re-auth


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    """Best-effort ISO parse. Never raises — a malformed/legacy timestamp
    should not crash the refresh path or mass-log-out every session."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE, value=raw,
        max_age=REFRESH_TTL_DAYS * 86400,
        httponly=True, secure=_IS_PROD, samesite="lax", path=_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path=_COOKIE_PATH)


def _set_device_cookie(response: Response, device_id: str) -> None:
    # Not HttpOnly-critical (it's just an opaque device id), but keep it HttpOnly
    # anyway; it only needs to travel with refresh requests.
    response.set_cookie(
        key=DEVICE_COOKIE, value=device_id,
        max_age=365 * 86400,
        httponly=True, secure=_IS_PROD, samesite="lax", path=_COOKIE_PATH,
    )


async def _mint_refresh(db, subject_id: str, subject_kind: str, family_id: str,
                        device_id: str, family_created_at: Optional[str] = None) -> str:
    """Create a refresh-token row and return the RAW token (only returned here).

    `family_created_at` is carried forward verbatim on every rotation so the
    absolute ceiling (REFRESH_ABSOLUTE_DAYS) can be enforced without a second
    table. Omitted only at login, where a brand-new family starts its clock now.
    """
    raw = secrets.token_urlsafe(48)
    await db.refresh_tokens.insert_one({
        "id": uuid.uuid4().hex,
        "token_hash": _hash(raw),
        "family_id": family_id,
        "family_created_at": family_created_at or _now_iso(),
        "subject_id": subject_id,
        "subject_kind": subject_kind,
        "device_id": device_id,
        "revoked": False,
        "expires_at": (_now() + timedelta(days=REFRESH_TTL_DAYS)).isoformat(),
        "created_at": _now_iso(),
    })
    return raw


async def _revoke_family(db, family_id: str, reason: str) -> None:
    # Filter on family_id only (text col). Boolean equality on the generated
    # `revoked` column mis-binds in the id+data adapter; re-revoking an already-
    # revoked row is idempotent/harmless.
    await db.refresh_tokens.update_many(
        {"family_id": family_id},
        {"$set": {"revoked": True, "revoked_at": _now_iso(), "revoke_reason": reason}},
    )


async def issue_session(db, subject_id: str, subject_kind: str,
                        request: Request, response: Response) -> str:
    """Called at LOGIN. Starts a fresh rotation family + device session, sets the
    refresh + device cookies. Returns the device_id."""
    family_id = uuid.uuid4().hex
    device_id = (request.cookies.get(DEVICE_COOKIE) or uuid.uuid4().hex)
    raw = await _mint_refresh(db, subject_id, subject_kind, family_id, device_id)
    _set_refresh_cookie(response, raw)
    _set_device_cookie(response, device_id)

    ua = request.headers.get("user-agent", "")[:300]
    ip = (request.client.host if request and request.client else "unknown")
    # upsert one device_sessions row per (subject, device)
    existing = await db.device_sessions.find_one(
        {"subject_id": subject_id, "device_id": device_id}, {"_id": 0}
    )
    if existing:
        await db.device_sessions.update_one(
            {"id": existing["id"]},
            {"$set": {"revoked": False, "last_active": _now_iso(), "ua": ua, "ip": ip}},
        )
    else:
        await db.device_sessions.insert_one({
            "id": uuid.uuid4().hex,
            "subject_id": subject_id, "subject_kind": subject_kind,
            "device_id": device_id, "ua": ua, "ip": ip,
            "revoked": False, "last_active": _now_iso(), "created_at": _now_iso(),
        })
    await db.audit_logs.insert_one({
        "id": uuid.uuid4().hex, "actor_id": subject_id,
        "action": "auth.login", "device_id": device_id, "ip": ip, "created_at": _now_iso(),
    })
    return device_id


async def rotate_session(db, raw: Optional[str], response: Response
                         ) -> Tuple[str, str]:
    """Consume the presented refresh token, rotate it, return (subject_id,
    subject_kind). Raises 401 on any invalid/expired/reused token."""
    if not raw:
        raise HTTPException(401, "No refresh token")
    row = await db.refresh_tokens.find_one({"token_hash": _hash(raw)}, {"_id": 0})
    if not row:
        raise HTTPException(401, "Invalid refresh token")

    # REUSE DETECTION: a revoked (already-rotated) token presented again => leak.
    if row.get("revoked"):
        await _revoke_family(db, row["family_id"], "reuse_detected")
        await db.audit_logs.insert_one({
            "id": uuid.uuid4().hex, "actor_id": row["subject_id"],
            "action": "auth.refresh_reuse_detected", "family_id": row["family_id"],
            "created_at": _now_iso(),
        })
        raise HTTPException(401, "Refresh token reuse detected — session revoked")

    if row.get("expires_at") and row["expires_at"] < _now_iso():
        raise HTTPException(401, "Refresh token expired")

    # ABSOLUTE CEILING: the idle TTL alone slides forever as long as the family
    # keeps getting refreshed. family_created_at is stamped once at login and
    # carried forward on every rotation; legacy rows minted before this field
    # existed fall back to the row's own created_at (never crash, never mass-
    # log-out at deploy — just start honoring the ceiling from here on).
    family_created_at = row.get("family_created_at") or row.get("created_at")
    created_dt = _parse_iso(family_created_at)
    if created_dt and created_dt < _now() - timedelta(days=REFRESH_ABSOLUTE_DAYS):
        await _revoke_family(db, row["family_id"], "absolute_ttl")
        await db.audit_logs.insert_one({
            "id": uuid.uuid4().hex, "actor_id": row["subject_id"],
            "action": "auth.refresh_absolute_ttl", "family_id": row["family_id"],
            "created_at": _now_iso(),
        })
        raise HTTPException(401, detail={"error": "session_expired_absolute"})

    # rotate: revoke the used token, mint a successor in the same family.
    new_raw = await _mint_refresh(
        db, row["subject_id"], row["subject_kind"], row["family_id"], row["device_id"],
        family_created_at=family_created_at,
    )
    await db.refresh_tokens.update_one(
        {"id": row["id"]},
        {"$set": {"revoked": True, "revoked_at": _now_iso(), "revoke_reason": "rotated"}},
    )
    _set_refresh_cookie(response, new_raw)
    # touch device session activity
    await db.device_sessions.update_one(
        {"subject_id": row["subject_id"], "device_id": row["device_id"]},
        {"$set": {"last_active": _now_iso()}},
    )
    return row["subject_id"], row["subject_kind"]


async def revoke_all_for_subject(db, subject_id: str) -> None:
    await db.refresh_tokens.update_many(
        {"subject_id": subject_id},
        {"$set": {"revoked": True, "revoked_at": _now_iso(), "revoke_reason": "logout_all"}},
    )
    await db.device_sessions.update_many(
        {"subject_id": subject_id},
        {"$set": {"revoked": True, "revoked_at": _now_iso()}},
    )


async def cleanup_auth_sessions(db, limit: int = 1000) -> dict:
    """Bounded, idempotent sweep of session rows nothing else ever revisits.
    refresh_tokens/device_sessions/jwt_blacklist otherwise grow forever (only
    jwt_blacklist got an opportunistic sweep, inside admin logout). Mirrors
    gallery_features.cleanup_expired_selfies: find the (capped) candidate ids,
    delete_many by id — deletes are naturally idempotent, so this is safe to
    run concurrently or overlap with another tick. Reaped per collection is
    capped at `limit`; anything left over rolls to the next scheduler tick.
    The coordinator wires this in; this module just exports it."""
    now = _now()
    grace_cutoff = (now - timedelta(days=7)).isoformat()
    revoked_cutoff = (now - timedelta(days=30)).isoformat()
    stale_cutoff = (now - timedelta(days=180)).isoformat()

    # refresh_tokens: past its own expiry + grace, or long since revoked
    # (rotated-away / logged-out rows have no further use once old enough).
    cur = db.refresh_tokens.find(
        {"$or": [
            {"expires_at": {"$lt": grace_cutoff}},
            {"$and": [{"revoked": True}, {"created_at": {"$lt": revoked_cutoff}}]},
        ]}, {"_id": 0, "id": 1}).limit(limit)
    ids = [r["id"] async for r in cur]
    if ids:
        await db.refresh_tokens.delete_many({"id": {"$in": ids}})

    # device_sessions: no activity in 180d, or long since revoked.
    cur = db.device_sessions.find(
        {"$or": [
            {"last_active": {"$lt": stale_cutoff}},
            {"$and": [{"revoked": True}, {"last_active": {"$lt": revoked_cutoff}}]},
        ]}, {"_id": 0, "id": 1}).limit(limit)
    ids2 = [r["id"] async for r in cur]
    if ids2:
        await db.device_sessions.delete_many({"id": {"$in": ids2}})

    # jwt_blacklist: field is `exp` (see server.py admin_logout), not
    # expires_at. Already swept opportunistically on every logout; this makes
    # it bounded and reachable even on a server that never sees a logout call.
    cur = db.jwt_blacklist.find({"exp": {"$lt": _now_iso()}}, {"_id": 0, "jti": 1}).limit(limit)
    jtis = [r["jti"] async for r in cur]
    if jtis:
        await db.jwt_blacklist.delete_many({"jti": {"$in": jtis}})

    return {"refresh_tokens": len(ids), "device_sessions": len(ids2), "jwt_blacklist": len(jtis)}


def build_auth_sessions_router(db, get_current_admin_with_role) -> APIRouter:
    router = APIRouter(tags=["auth-sessions"])

    # local import to avoid a cycle at module load
    from auth import create_access_token

    @router.post("/api/auth/refresh")
    async def refresh(request: Request, response: Response,
                      maja_rt: Optional[str] = Cookie(default=None)):
        subject_id, subject_kind = await rotate_session(db, maja_rt, response)
        # re-mint a short-lived access token with the CURRENT role
        role = "admin"
        if subject_kind == "admin":
            admin = await db.admins.find_one({"id": subject_id}, {"_id": 0})
            if not admin:
                raise HTTPException(401, "Account no longer exists")
            role = admin.get("role", "admin")
        access_token = create_access_token(data={"sub": subject_id, "role": role})
        return {"access_token": access_token, "token_type": "bearer"}

    @router.post("/api/auth/logout")
    async def logout(response: Response, maja_rt: Optional[str] = Cookie(default=None)):
        """Revoke the current device's refresh family + clear the cookie."""
        if maja_rt:
            row = await db.refresh_tokens.find_one({"token_hash": _hash(maja_rt)}, {"_id": 0})
            if row:
                await _revoke_family(db, row["family_id"], "logout")
                await db.device_sessions.update_one(
                    {"subject_id": row["subject_id"], "device_id": row["device_id"]},
                    {"$set": {"revoked": True, "revoked_at": _now_iso()}},
                )
        _clear_refresh_cookie(response)
        return {"success": True}

    @router.get("/api/auth/sessions")
    async def list_sessions(admin=Depends(get_current_admin_with_role)):
        subject_id = admin["admin_id"]
        cur = db.device_sessions.find({"subject_id": subject_id}, {"_id": 0})
        rows = await cur.sort("last_active", -1).to_list(100)
        active = [r for r in rows if not r.get("revoked")]
        return {"sessions": rows, "active_count": len(active)}

    @router.post("/api/auth/logout-all")
    async def logout_all(response: Response, admin=Depends(get_current_admin_with_role)):
        await revoke_all_for_subject(db, admin["admin_id"])
        _clear_refresh_cookie(response)
        await db.audit_logs.insert_one({
            "id": uuid.uuid4().hex, "actor_id": admin["admin_id"],
            "action": "auth.logout_all", "created_at": _now_iso(),
        })
        return {"success": True}

    return router
