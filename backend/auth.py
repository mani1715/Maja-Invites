from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import os
import logging
from typing import Optional, Tuple, Dict, Any

# Supabase JWT verification (asymmetric ES256/RS256 via JWKS, or legacy HS256).
try:
    from auth_supabase import verify_supabase_jwt, SupabaseAuthError
    _SUPABASE_AVAILABLE = True
except Exception as _exc:  # pragma: no cover - import failure shouldn't break legacy
    _SUPABASE_AVAILABLE = False
    _SUPABASE_IMPORT_ERROR = _exc

logger = logging.getLogger("auth")


# Ensure backend/.env is loaded BEFORE we read any secret. server.py imports
# this module (~line 108) before it calls load_dotenv (~line 170), so without
# this the secrets would be read from an empty environment (the latent bug that
# made JWT default-signing possible). Loading our own sibling .env fixes it and
# makes the fail-hard check below correct regardless of import order.
try:
    from pathlib import Path as _Path
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(_Path(__file__).resolve().parent / '.env')
except Exception:
    pass

# Security configurations
_DEFAULT_INSECURE_SECRET = 'your-secret-key-change-in-production'
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', _DEFAULT_INSECURE_SECRET)
if SECRET_KEY == _DEFAULT_INSECURE_SECRET:
    # FAIL HARD: a forgeable signing key is never acceptable. The insecure
    # built-in default is allowed ONLY when ALLOW_INSECURE_JWT=1 is explicitly
    # set (local dev / tests).
    if os.environ.get('ALLOW_INSECURE_JWT') != '1':
        raise RuntimeError(
            "JWT_SECRET_KEY is not set. Refusing to start with the built-in "
            "insecure default (legacy admin tokens would be forgeable). Set "
            "JWT_SECRET_KEY in backend/.env, or ALLOW_INSECURE_JWT=1 for local dev only."
        )
    logging.getLogger("auth").warning(
        "JWT_SECRET_KEY unset; running with INSECURE default because "
        "ALLOW_INSECURE_JWT=1. DO NOT use this in production."
    )
ALGORITHM = 'HS256'
# SHORT-LIVED access tokens — a small XSS blast radius (a stolen token is useful
# for ~1h, not a month). Longevity comes from the HttpOnly refresh cookie
# (auth_sessions.issue_session, now set on EVERY admin-login path) plus the
# frontend's silent-refresh interceptor, which swaps an expired token for a new
# one transparently via /api/auth/refresh. Env-tunable. (Was 30 days.)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 60))  # 1 hour

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
security = HTTPBearer()


# ---------------------------------------------------------------------------
# MongoDB admins lookup (lazy-imported to avoid circular imports at module
# load-time — server.py wires `db` into globals after FastAPI app boot).
# ---------------------------------------------------------------------------
def _get_db():
    """Best-effort retrieval of the Motor db handle bound by server.py."""
    import sys
    server_mod = sys.modules.get("server")
    if server_mod is not None:
        return getattr(server_mod, "db", None)
    return None


async def _admin_id_from_supabase_claims(claims: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    """Map a Supabase JWT to (admin_id, role) using MongoDB `admins`.

    Lookup order:
      1. admins.supabase_user_id == claims.sub
      2. admins.email == claims.email (and stamp supabase_user_id for next time)
    """
    db = _get_db()
    if db is None:
        return None

    sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()

    admin_doc = None
    if sub:
        admin_doc = await db.admins.find_one({"supabase_user_id": sub})

    if admin_doc is None and email:
        admin_doc = await db.admins.find_one({"email": email})
        if admin_doc and sub and not admin_doc.get("supabase_user_id"):
            # First time this Supabase user has hit the backend — link them.
            try:
                await db.admins.update_one(
                    {"id": admin_doc["id"]},
                    {"$set": {"supabase_user_id": sub}},
                )
            except Exception as exc:
                logger.warning("Failed to link supabase_user_id for %s: %s", email, exc)

    if not admin_doc:
        return None

    return admin_doc.get("id"), admin_doc.get("role", "admin")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({'exp': expire})
    # S3 fix (Phase-2 audit): every legacy JWT gets a unique `jti` claim so
    # /api/admin/logout can blacklist it deterministically.
    if 'jti' not in to_encode:
        import uuid as _uuid
        to_encode['jti'] = _uuid.uuid4().hex
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Photographer's-client scoped tokens ("event_client")
# ---------------------------------------------------------------------------
# A photographer can hand a client (the couple/family) a login scoped to ONE
# invitation. That login mints an "event_client" token whose `sub` is the
# profile_id it is bound to. These tokens must NEVER be usable on admin /
# photographer endpoints — the admin deps below explicitly reject `typ ==
# 'event_client'`, and client endpoints derive the profile_id from the token
# (never from the URL), so a client can only ever reach its own event.
CLIENT_TOKEN_EXPIRE_HOURS = int(os.environ.get('CLIENT_TOKEN_EXPIRE_HOURS', 24 * 7))  # 7 days


def create_client_token(profile_id: str, expires_delta: Optional[timedelta] = None) -> str:
    import uuid as _uuid
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=CLIENT_TOKEN_EXPIRE_HOURS))
    payload = {
        'sub': profile_id,
        'typ': 'event_client',
        'role': 'event_client',
        'exp': expire,
        'jti': _uuid.uuid4().hex,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_event_client(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Return the profile_id a valid 'event_client' token is bound to, else 401."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate client credentials',
        headers={'WWW-Authenticate': 'Bearer'},
    )
    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get('typ') != 'event_client':
        raise exc
    if await _is_jwt_blacklisted(payload.get('jti')):
        raise exc
    profile_id = payload.get('sub')
    if not profile_id:
        raise exc
    # A disabled/deleted client account (photographer_clients.toggle_client_access
    # / delete_client_access) must lock the client out immediately — without this
    # the token is validated purely statelessly and keeps working until its own
    # 7-day exp. Same DB-access pattern as _is_jwt_blacklisted: fail OPEN on a
    # lookup error (availability over strictness, matching this module's
    # documented posture on non-super-admin paths); a reachable DB that returns
    # "no row" or "disabled" is a hard 401.
    db = _get_db()
    if db is not None:
        try:
            acc = await db.event_client_accounts.find_one(
                {"profile_id": profile_id}, {"_id": 0, "enabled": 1})
        except Exception:
            logger.warning(
                "get_current_event_client: account lookup failed for %s; failing open",
                profile_id)
        else:
            if not acc or not acc.get('enabled'):
                raise exc
    return profile_id


async def _is_jwt_blacklisted(jti: Optional[str], fail_closed: bool = False) -> bool:
    """S3 fix: check whether a legacy JWT has been revoked via the
    `jwt_blacklist` collection.

    `fail_closed=False` (default): on no jti / no db / lookup error, return
    False (fail-open) — worst case a logged-out token is accepted, which is
    what the system did before this safeguard existed. Used on normal admin
    auth paths where availability during a DB hiccup matters more.

    `fail_closed=True`: on a lookup *error* specifically, return True instead
    (treat the token as blacklisted / reject it). Missing jti / missing db
    still return False either way — there is no lookup to fail closed
    against. Used only on admin-critical paths (require_super_admin, T4)."""
    if not jti:
        return False
    db = _get_db()
    if db is None:
        return False
    try:
        return (await db.jwt_blacklist.find_one({"jti": jti})) is not None
    except Exception:
        return fail_closed


async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Hybrid: validate Supabase JWT first, fall back to legacy JWT.

    Returns the MongoDB `admins.id` (str). Existing routes that depend on this
    keep working unchanged.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'},
    )

    token = credentials.credentials

    # 1) Supabase JWT (asymmetric via JWKS).
    if _SUPABASE_AVAILABLE:
        try:
            claims = verify_supabase_jwt(token)
            mapped = await _admin_id_from_supabase_claims(claims)
            if mapped:
                return mapped[0]
            # Token is valid but the user isn't in our admins collection.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Authenticated but no admin profile found',
            )
        except SupabaseAuthError:
            # Not a Supabase token — fall through to legacy verification.
            pass

    # 2) Legacy custom JWT (HS256 with our SECRET_KEY).
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    # S3 fix: respect /api/admin/logout revocations.
    if await _is_jwt_blacklisted(payload.get('jti')):
        raise credentials_exception

    # A photographer's-client token must never authenticate an admin/photographer
    # endpoint, even though its `sub` decodes fine — reject it explicitly.
    if payload.get('typ') == 'event_client':
        raise credentials_exception

    admin_id: str = payload.get('sub')
    if admin_id is None:
        raise credentials_exception

    return admin_id


async def _resolve_admin_with_role(credentials: HTTPAuthorizationCredentials, fail_closed: bool = False) -> dict:
    """Shared impl behind get_current_admin_with_role. `fail_closed` is threaded
    into the JWT-blacklist lookup (T4) — see `_is_jwt_blacklisted`. Kept as a
    plain helper (not the FastAPI dependency itself) so `fail_closed` never
    shows up as an accidental query param on routes that depend on
    get_current_admin_with_role directly."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'},
    )

    token = credentials.credentials

    # 1) Supabase JWT first.
    if _SUPABASE_AVAILABLE:
        try:
            claims = verify_supabase_jwt(token)
            mapped = await _admin_id_from_supabase_claims(claims)
            if mapped:
                return {'admin_id': mapped[0], 'role': mapped[1]}
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Authenticated but no admin profile found',
            )
        except SupabaseAuthError:
            pass

    # 2) Legacy JWT.
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    # S3 fix: respect /api/admin/logout revocations.
    if await _is_jwt_blacklisted(payload.get('jti'), fail_closed=fail_closed):
        raise credentials_exception

    # Client-scoped tokens are not admins (see get_current_admin).
    if payload.get('typ') == 'event_client':
        raise credentials_exception

    admin_id: str = payload.get('sub')
    role: str = payload.get('role')

    if admin_id is None or role is None:
        raise credentials_exception

    return {'admin_id': admin_id, 'role': role}


async def get_current_admin_with_role(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Hybrid: returns {'admin_id', 'role'} for legacy callers."""
    return await _resolve_admin_with_role(credentials, fail_closed=False)


async def require_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """PHASE 35: Middleware to ensure only Super Admin can access.
    Admin-critical: JWT-blacklist lookup failures fail CLOSED here (T4) —
    unlike other admin deps, which stay fail-open for availability."""
    admin_data = await _resolve_admin_with_role(credentials, fail_closed=True)

    if admin_data['role'] != 'super_admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Super Admin access required'
        )

    return admin_data['admin_id']


async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """PHASE 35: Middleware to ensure authenticated admin (Super Admin or Admin)"""
    admin_data = await get_current_admin_with_role(credentials)
    return admin_data
