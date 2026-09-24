"""
Supabase JWT verification helpers.

Verifies Supabase-issued JWT access tokens locally against the project's JWKS
endpoint (asymmetric — ES256/RS256) with PyJWT. Falls back to HS256 + the
project's JWT secret if `SUPABASE_JWT_SECRET` is set.

The verified claims include the Supabase `sub` (user UUID) and `email`. The
caller is expected to map those to a row in MongoDB `admins`.

ENV (read lazily on first verification so dotenv-loaded values are picked up):
  SUPABASE_URL                   — https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY      — secret, server-only (used for admin API)
  SUPABASE_JWT_SECRET (optional) — only for legacy HS256 projects
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, Optional

import jwt
from jwt import PyJWKClient

logger = logging.getLogger("auth_supabase")

# Thread-safe lazy singleton for the JWKS client (caches keys internally).
_jwk_client: Optional[PyJWKClient] = None
_jwk_lock = threading.Lock()
_jwk_url: Optional[str] = None  # tracks which URL the cached client targets

# All algorithms we are willing to accept for asymmetric Supabase signatures.
_ASYM_ALGS = ("ES256", "RS256", "EdDSA", "ES384", "RS384")


def _supabase_url() -> Optional[str]:
    """Read SUPABASE_URL at call time (env may load after this module imports)."""
    return os.environ.get("SUPABASE_URL")


def _supabase_jwt_secret() -> Optional[str]:
    return os.environ.get("SUPABASE_JWT_SECRET")


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client, _jwk_url
    url = _supabase_url()
    if not url:
        raise RuntimeError("SUPABASE_URL is not configured")
    target = f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    if _jwk_client is None or _jwk_url != target:
        with _jwk_lock:
            if _jwk_client is None or _jwk_url != target:
                _jwk_client = PyJWKClient(target, cache_keys=True, lifespan=3600)
                _jwk_url = target
    return _jwk_client


class SupabaseAuthError(Exception):
    """Raised when Supabase JWT verification fails."""


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """Decode and verify a Supabase access token.

    Returns the decoded claims dict on success. Raises SupabaseAuthError on
    any failure (expired, invalid signature, wrong audience, missing keys, …).
    """
    if not token:
        raise SupabaseAuthError("Empty token")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise SupabaseAuthError(f"Malformed JWT header: {exc}") from exc

    alg = (header.get("alg") or "").upper()

    try:
        if alg == "HS256":
            secret = _supabase_jwt_secret()
            if not secret:
                raise SupabaseAuthError(
                    "Token is HS256 but SUPABASE_JWT_SECRET is not configured"
                )
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        elif alg in _ASYM_ALGS:
            signing_key = _get_jwk_client().get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=list(_ASYM_ALGS),
                audience="authenticated",
            )
        else:
            raise SupabaseAuthError(f"Unsupported JWT alg: {alg!r}")
    except SupabaseAuthError:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise SupabaseAuthError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise SupabaseAuthError(f"Invalid token: {exc}") from exc
    except Exception as exc:  # JWKS fetch / network / parse
        logger.warning("Supabase JWT verification failed: %s", exc)
        raise SupabaseAuthError(str(exc)) from exc

    return payload
