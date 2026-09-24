"""url_utils.py — the ONE canonical public-origin source.

Every public-facing absolute URL (invitation links, QR payloads, share/OG
links) must be built here, NEVER from request.host / request.base_url / an HTTP
Origin / a Docker hostname / the VM IP. A request-controlled Host header must
never be able to change what a QR encodes.

Base resolution:
  1. PUBLIC_BASE_URL env — the deployment's canonical https origin.
  2. dev only (ENVIRONMENT in {'', dev, development, local, test}): '' (relative,
     same-origin — the SPA is served from the same host in dev).
Non-dev with PUBLIC_BASE_URL unset: we FAIL LOUD (log error; require_public_url
raises). Silently emitting a wrong host — localhost, the review IP, or the
hardcoded prod domain where a review slug 404s — is a harder bug to notice than
an explicit error. Fixing it is one line in deploy/.env, not a code change.
"""
from __future__ import annotations

import os
import re
import logging
import unicodedata

logger = logging.getLogger("url_utils")

_DEV_ENVS = {"", "dev", "development", "local", "test"}


def _is_dev() -> bool:
    return os.environ.get("ENVIRONMENT", "").strip().lower() in _DEV_ENVS


def public_base_url(*, strict: bool = False) -> str:
    """Canonical public origin, no trailing slash. Returns '' only in dev when
    PUBLIC_BASE_URL is unset (relative same-origin URLs are fine there)."""
    base = (os.environ.get("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if base:
        return base
    if _is_dev() and not strict:
        return ""
    logger.error(
        "PUBLIC_BASE_URL is not set in a non-dev environment; public URL/QR "
        "generation cannot produce a correct absolute URL. Set PUBLIC_BASE_URL "
        "in deploy/.env (e.g. https://majainvites.com).")
    return ""


class PublicBaseURLMissing(RuntimeError):
    """Absolute public URL required but PUBLIC_BASE_URL is unset in non-dev."""


def build_public_url(path: str) -> str:
    """Absolute public URL for `path`. In dev with no PUBLIC_BASE_URL, returns
    the relative path (same-origin). Never derives the host from a request."""
    if not path.startswith("/"):
        path = "/" + path
    return f"{public_base_url()}{path}"


def require_public_url(path: str) -> str:
    """Like build_public_url but RAISES PublicBaseURLMissing when no absolute
    base is available. Use for QR generation, where a relative or wrong-host
    payload is worse than a clear error."""
    base = public_base_url(strict=True)
    if not base:
        raise PublicBaseURLMissing(
            "PUBLIC_BASE_URL must be set to generate an absolute public URL")
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}"


def slugify_name(text: str, *, maxlen: int = 64, fallback: str = "invite") -> str:
    """URL-safe cosmetic slug: whitelist [a-z0-9-] only, cap length, never empty.

    Nothing ever RESOLVES on this value (the invite number is the key), so this
    is purely cosmetic — but because it lands in a URL path it still must not
    carry '../', a scheme, or anything an OG renderer could reflect. Unicode
    names (Telugu/Hindi) transliterate to ASCII where possible, else fall back
    to `fallback` rather than emitting an empty segment."""
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).lower()
    t = re.sub(r"-{2,}", "-", t).strip("-")[:maxlen].strip("-")
    return t or fallback
