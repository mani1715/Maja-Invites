"""
storage_serve.py — resolve media URLs to CloudFront.
=====================================================

**Owner decision 2026-08-06: S3 + CloudFront is the media store. Drive is out.**

The previous revision of this file proxied bytes from Google Drive through the
app server, because a Drive link only resolves for a principal that can read the
file. That made EC2 the delivery path for every image and video — the exact
thing a media platform must not do. S3 removes the constraint: CloudFront can
serve the bytes directly under a signed URL, so this module no longer moves
media at all. It answers with a redirect.

WHAT THIS MODULE IS NOW
-----------------------
An **authorization + indirection layer**, not a data path.

    GET /api/uploads/<path>      ->  302  https://<cdn>/...?<signature>
    GET /api/media?k=&e=&s=      ->  302  https://<cdn>/...?<signature>

Keeping the redirect rather than handing out CloudFront URLs directly is
deliberate and worth the extra round trip:

* **Stable URLs.** Thousands of DB rows hold `/api/uploads/...`. Those keep
  working through the migration, and through any future move to R2.
* **Authorization stays server-side.** The backend can check gallery privacy,
  plan state or an expiry *before* minting a CDN signature. A raw CloudFront URL
  pasted into the DB could not be revoked.
* **The storage layout stays private.** Bucket names and key structure are never
  exposed to the browser.

The redirect is cacheable and cheap; the bytes — which are the expensive part —
never touch EC2 in either direction.

FALLBACK
--------
Files not yet migrated still live on the VM disk, so there is a local branch
that serves them directly. It exists only for the migration window and can be
deleted once `backfill_media.py --verify` is clean and the sources are gone.
It implements Range by hand because Starlette 0.37.2's FileResponse ignores it,
so video seeking has never worked on these paths.

UPLOADS
-------
This module only handles reads. Writes should go **browser -> S3 directly** via
`POST /api/uploads/presign` (see `storage_upload.py`): every current upload
endpoint does `data = await file.read()`, which puts the whole file in app-server
RAM and makes one photographer's 5,000-photo event compete with every guest
viewing an invitation.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import mimetypes
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import (FileResponse, RedirectResponse, Response,
                               StreamingResponse)

logger = logging.getLogger("storage_serve")

# How long a minted CDN signature stays valid. Short enough that a leaked URL
# stops working quickly, long enough that a guest browsing a big gallery does
# not have links expire mid-scroll.
SIGNED_URL_TTL = int(os.environ.get("MEDIA_SIGNED_URL_TTL", "3600"))

# Browser cache lifetime on the REDIRECT itself. Media keys are content
# addressed (every path carries a uuid/timestamp/hash), but the signature is
# not — so the redirect must expire before the signature does.
_REDIRECT_MAX_AGE = max(60, SIGNED_URL_TTL // 2)

_STREAM_CHUNK = 256 * 1024
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


# --------------------------------------------------------------------------- #
# paths
# --------------------------------------------------------------------------- #
def _norm(p) -> str:
    """Forward-slash form, so a path written on Windows dev still matches the
    Linux value stored by the container."""
    return str(p).replace("\\", "/")


def _safe_subpath(subpath: str) -> str:
    """Reject traversal before the value is ever joined to a root."""
    s = (subpath or "").strip().lstrip("/")
    if not s or s.startswith("..") or "\x00" in s:
        raise HTTPException(status_code=404, detail="Not found")
    parts = [seg for seg in s.split("/") if seg not in ("", ".")]
    if any(seg == ".." for seg in parts):
        raise HTTPException(status_code=404, detail="Not found")
    return "/".join(parts)


def _content_type(name: str, stored: str = "") -> str:
    if stored and stored != "application/octet-stream":
        return stored
    guess, _ = mimetypes.guess_type(name)
    return guess or stored or "application/octet-stream"


# --------------------------------------------------------------------------- #
# signed media URLs (objects addressed by storage key, not by upload path)
# --------------------------------------------------------------------------- #
# Wedding galleries and guest selfies are protected by an unguessable, expiring
# URL rather than a session, because they are handed to guests. This preserves
# that contract exactly: an HMAC over (key, expiry) that only this server can
# mint. Signed WITHOUT a database read, so it stays a drop-in for the sync
# `generate_signed_url` it replaced at 12 call sites.
def _sign_secret() -> bytes:
    # Reuse auth.SECRET_KEY (fail-hard at import if unset) rather than an
    # independent "insecure-dev-only" fallback that could sign CDN redirect
    # HMACs with a guessable literal.
    from auth import SECRET_KEY
    return SECRET_KEY.encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sig(key: str, exp: int, bucket: str = "") -> str:
    # The bucket is folded into the signature ONLY when present, so a link with
    # no bucket signs byte-for-byte as before — every pre-existing /api/media URL
    # (galleries, selfies, backups) keeps verifying unchanged.
    msg = f"{key}:{exp}:{bucket}" if bucket else f"{key}:{exp}"
    return _b64(hmac.new(_sign_secret(), msg.encode(),
                         hashlib.sha256).digest())[:32]


def media_url(key: str, expiry_seconds: int = 3600, bucket: Optional[str] = None) -> str:
    """Signed, expiring URL for an object addressed by its storage key.

    `bucket` names a NON-default bucket the key lives in (e.g. the invitation
    media bucket). Omit it for the default bucket — the URL is then identical to
    the historical form, so nothing downstream changes for existing media.
    """
    exp = int(time.time()) + int(expiry_seconds)
    b = bucket or ""
    url = f"/api/media?k={_b64(key.encode())}&e={exp}&s={_sig(key, exp, b)}"
    if b:
        url += f"&b={_b64(b.encode())}"
    return url


def _verify_media(k: str, e: str, s: str, b: str = "") -> Tuple[str, str]:
    """Returns (key, bucket). bucket is "" for the default bucket."""
    try:
        key = _unb64(k).decode()
        exp = int(e)
        bucket = _unb64(b).decode() if b else ""
    except Exception:
        raise HTTPException(status_code=403, detail="Bad media token")
    if exp < int(time.time()):
        raise HTTPException(status_code=403, detail="Link expired")
    if not hmac.compare_digest(_sig(key, exp, bucket), s):
        raise HTTPException(status_code=403, detail="Bad signature")
    return key, bucket


# --------------------------------------------------------------------------- #
# responses
# --------------------------------------------------------------------------- #
def _cdn_redirect(url: str) -> RedirectResponse:
    """302, not 301. A permanent redirect would be cached by browsers and
    intermediaries past the signature's lifetime, pinning users to a URL that
    has already expired."""
    return RedirectResponse(
        url, status_code=302,
        headers={"Cache-Control": f"private, max-age={_REDIRECT_MAX_AGE}"})


def _parse_range(header: str, size: int) -> Optional[Tuple[int, int]]:
    """RFC 7233 single range -> (start, end_inclusive). None = serve 200."""
    m = _RANGE_RE.match((header or "").strip())
    if not m:
        return None
    first, last = m.group(1), m.group(2)
    if first == "" and last == "":
        return None
    if first == "":                          # suffix range: last N bytes
        n = int(last)
        if n <= 0:
            return None
        start, end = max(0, size - n), size - 1
    else:
        start = int(first)
        end = int(last) if last else size - 1
    if start >= size:
        raise HTTPException(status_code=416, detail="Range not satisfiable",
                            headers={"Content-Range": f"bytes */{size}"})
    return start, min(end, size - 1)


def _file_response(path: Path, name: str, content_type: str,
                   request: Request) -> Response:
    """Serve a local file, honouring Range so video can seek.

    Only used for files not yet migrated to S3. Starlette 0.37.2's FileResponse
    ignores Range, which is why this is written out rather than inherited.
    """
    size = path.stat().st_size
    ctype = _content_type(name, content_type)
    common = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": f'"{hashlib.sha1(f"{name}:{size}".encode()).hexdigest()}"',
    }
    rng = _parse_range(request.headers.get("range", ""), size)
    if rng is None:
        return FileResponse(path, media_type=ctype, headers=common)

    start, end = rng
    length = end - start + 1

    def _iter():
        with open(path, "rb") as fh:
            fh.seek(start)
            left = length
            while left > 0:
                chunk = fh.read(min(_STREAM_CHUNK, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk

    headers = dict(common)
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(length)
    return StreamingResponse(_iter(), status_code=206, media_type=ctype,
                             headers=headers)


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_storage_serve_router(db, uploads_root: Path) -> APIRouter:
    """Replaces the StaticFiles mounts on /api/uploads and /uploads.

    `uploads_root` is the directory those mounts served (`/app/uploads`), which
    is also the prefix of every `storage_files.source_path` written by a disk
    upload hook — which is why the lookup needs no new bookkeeping.
    """
    router = APIRouter()
    uploads_root = Path(uploads_root)

    async def _mirror_for(source_path: str) -> Optional[Dict[str, Any]]:
        try:
            doc = await db.storage_files.find_one({"source_path": source_path})
        except Exception as e:
            logger.warning("mirror lookup failed for %s: %s", source_path, e)
            return None
        if doc:
            doc.pop("_id", None)
        return doc

    async def _cdn_url(doc: Dict[str, Any]) -> Optional[str]:
        """Mint a signed CDN URL for a stored file. None if unavailable, so the
        caller can fall through rather than 502."""
        try:
            from storage_pool_hooks import _orch
            return await _orch(db).get_download_url(doc["id"], SIGNED_URL_TTL)
        except Exception as e:
            logger.warning("cdn url failed for file %s: %s", doc.get("id"), e)
            return None

    async def _serve(subpath: str, request: Request) -> Response:
        sub = _safe_subpath(subpath)
        source_path = _norm(uploads_root / sub)

        doc = await _mirror_for(source_path)
        if doc:
            url = await _cdn_url(doc)
            if url:
                return _cdn_redirect(url)
            # Signing failed — fall through to disk if the original survives.

        # Not migrated yet (or the CDN is unreachable and the source is intact).
        local = (uploads_root / sub).resolve()
        try:
            local.relative_to(uploads_root.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found")
        if local.is_file():
            return _file_response(local, sub, "", request)

        raise HTTPException(status_code=404, detail="Not found")

    @router.get("/api/media")
    async def serve_signed(request: Request, k: str = "", e: str = "", s: str = "", b: str = ""):
        """Objects addressed by storage key: wedding galleries, guest selfies,
        paid studio backups, invitation media. Signature is checked HERE, before
        any CDN URL is minted — that is the point of the extra hop. `b` names a
        non-default bucket (e.g. invitation media); it is part of the signature,
        so a client cannot point the presign at an arbitrary bucket."""
        key, bucket = _verify_media(k, e, s, b)

        doc = await _mirror_for(key)
        if doc:
            url = await _cdn_url(doc)
            if url:
                return _cdn_redirect(url)

        # Pre-migration object, or one written straight to S3 by the legacy
        # path: sign it directly off the key (in its bucket when named).
        try:
            from aws_service import generate_signed_url
            return _cdn_redirect(generate_signed_url(key, SIGNED_URL_TTL,
                                                     bucket_name=bucket or None))
        except Exception as ex:
            logger.warning("no source for media key %s: %s", key, ex)
            raise HTTPException(status_code=404, detail="Not found")

    @router.get("/api/uploads/{subpath:path}")
    async def serve_api(subpath: str, request: Request):
        return await _serve(subpath, request)

    # Legacy: only /api/* reaches the backend through Caddy in production, so
    # this exists for direct-to-backend callers and old rows holding bare
    # /uploads/... URLs.
    @router.get("/uploads/{subpath:path}")
    async def serve_legacy(subpath: str, request: Request):
        return await _serve(subpath, request)

    return router
