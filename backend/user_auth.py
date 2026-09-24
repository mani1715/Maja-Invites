"""
Public-user authentication module — RETIRED (product pivot, owner-decided,
final): normal-user (couple/buyer) accounts no longer exist. Photographers /
studios are the only account holders (see `admins` + `photographer_clients.py`
Bearer/JWT auth). Couples get invitation access via the Couple Access portal
(`photographer_clients.py`, event_client JWT issued BY the studio) — that
system is untouched and stays.

Every public account endpoint below now answers 410 Gone with a friendly
redirect-to-photographer message instead of doing anything. Kept as routes
(rather than deleted outright) so old clients get a clear, stable response
instead of a 404.

`get_current_user` (session dependency) is kept and exported unchanged — it
is still wired into other routers (user_features, account_data,
live_gallery_features, celebration_translation) as `get_current_public_user`.
Since no new session can ever be created (register/login are retired below),
it will 401 in practice; those callers are out of this module's scope.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, Header

logger = logging.getLogger("user_auth")

NORMAL_USERS_RETIRED = {
    "code": "NORMAL_USERS_RETIRED",
    "message": ("MAJA accounts are for photographers. Couples: ask your "
                "photographer for your invitation link and access code."),
}


def _retired() -> None:
    raise HTTPException(status_code=410, detail=NORMAL_USERS_RETIRED)


# ----------------------------------------------------------------------------
# Router builder — wires into the main FastAPI app
# ----------------------------------------------------------------------------
def build_user_auth_router(db, password_hasher=None, password_verifier=None,
                           is_contact_verified=None, clear_otp=None) -> APIRouter:
    """Build the (retired) public-user auth router.

    `password_hasher`/`password_verifier`/`is_contact_verified`/`clear_otp`
    are no longer used — kept as accepted kwargs only so server.py's existing
    call site doesn't need to change.
    """
    router = APIRouter(tags=["public-user-auth"])

    async def _resolve_session_token(
        request: Request, authorization: Optional[str] = Header(default=None)
    ) -> Optional[str]:
        token = request.cookies.get("user_session_token")
        if token:
            return token
        if authorization and authorization.lower().startswith("bearer "):
            return authorization.split(" ", 1)[1].strip()
        return None

    async def get_current_user(
        request: Request,
        authorization: Optional[str] = Header(default=None),
    ) -> dict:
        token = await _resolve_session_token(request, authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=401, detail="Invalid session")
        exp = session.get("expires_at")
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp)
            except Exception:
                exp = None
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # July 2025 — account-status enforcement. Suspended users see a
        # friendly 403; blocked users have their sessions deleted by the
        # super-admin endpoint so we should never even reach here, but we
        # defend in depth.
        u_status = (user.get("status") or "active").lower()
        if u_status == "blocked":
            try:
                await db.user_sessions.delete_one({"session_token": token})
            except Exception:
                pass
            raise HTTPException(status_code=403, detail="This account has been blocked. Please contact support.")
        if u_status == "suspended":
            raise HTTPException(status_code=403, detail="This account is temporarily suspended. Please contact support.")
        return user

    # ============================================================
    # RETIRED — every public account endpoint answers 410 Gone.
    # ============================================================
    @router.post("/api/users/register")
    async def register():
        _retired()

    @router.post("/api/users/login")
    async def login():
        _retired()

    @router.get("/api/users/auth/google/login")
    async def google_login():
        _retired()

    @router.get("/api/users/auth/google/callback")
    async def google_callback():
        _retired()

    @router.get("/api/users/me")
    async def me():
        _retired()

    @router.post("/api/users/logout")
    async def logout():
        _retired()

    return router, get_current_user
