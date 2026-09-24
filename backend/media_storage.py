"""
media_storage.py — canonical bucket routing + object-key builders + input limits.

This is the single source of truth for WHERE media lives in S3. Four canonical
buckets (all private, SSE, us-east-2 in production):

    maja-portfolio-media-2026    photographer/{pid}/portfolio/{images|videos|thumbnails}/
    maja-event-media-2026        photographer/{pid}/event/{eid}/{photos|videos|audio|thumbnails}/
    maja-invitations-media-2026  photographer/{pid}/event/{eid}/invitation/{iid}/
                                     {images|videos|audio|background-music|thumbnails}/
    maja-face-private-2026       event/{eid}/sessions/{sid}/selfie

Bucket names are env-driven (never hardcoded in callers):

    AWS_S3_PORTFOLIO_BUCKET / AWS_S3_EVENT_BUCKET
    AWS_S3_INVITATIONS_BUCKET / AWS_S3_FACE_BUCKET

The older S3_BUCKET_<CAT> spellings still resolve (deprecated, warned once).
The first three fall back to AWS_S3_BUCKET so a single-bucket dev/test deploy
keeps working; `face` never does — private face data must not silently land in
a shared media bucket. S3 has no real directories — these are object-key prefixes;
the database is the source of truth, S3 is the storage layer. No marker
objects are created.

Object keys are ALWAYS generated server-side (uuid + allowlisted extension) —
user filenames are metadata, never key material. IDs come from the database
after server-side ownership verification, never from the browser.
"""
import logging
import os
import re
import uuid
from typing import Dict, Optional

# ---------------------------------------------------------------------------
# Bucket routing
# ---------------------------------------------------------------------------
# category -> (canonical env name, deprecated alias). This table and the
# resolver below are AUTHORITATIVE and deliberately live here rather than in
# aws_service: this is pure environment logic with no AWS dependency, and 46
# test modules install a permissive aws_service stub whose every attribute is
# a no-op — routing that delegated into that stub would silently resolve every
# bucket to None under test while looking correct in production.
BUCKET_ENV = {
    "portfolio":  ("AWS_S3_PORTFOLIO_BUCKET",   "S3_BUCKET_PORTFOLIO"),
    "event":      ("AWS_S3_EVENT_BUCKET",       "S3_BUCKET_EVENT"),
    "invitation": ("AWS_S3_INVITATIONS_BUCKET", "S3_BUCKET_INVITATIONS"),
    "face":       ("AWS_S3_FACE_BUCKET",        "S3_BUCKET_FACE"),
}

CATEGORIES = tuple(BUCKET_ENV)

_legacy_alias_warned: set = set()


def bucket_for(category: str) -> str:
    """Bucket for a media category. Canonical env name first
    (AWS_S3_<CAT>_BUCKET), then the deprecated S3_BUCKET_<CAT> alias, then —
    except for `face`, which never shares a bucket — the legacy AWS_S3_BUCKET.
    """
    names = BUCKET_ENV.get(category)
    if not names:
        raise ValueError(f"unknown media category: {category!r}")
    canonical, legacy = names
    val = os.environ.get(canonical)
    if val:
        return val
    val = os.environ.get(legacy)
    if val:
        if legacy not in _legacy_alias_warned:
            _legacy_alias_warned.add(legacy)
            logging.getLogger("media_storage").warning(
                "%s is deprecated — rename it to %s", legacy, canonical)
        return val
    # Private face data must never silently land in a shared media bucket.
    if category == "face":
        return ""
    return os.environ.get("AWS_S3_BUCKET", "")


# ---------------------------------------------------------------------------
# Media kinds → key folder + MIME allowlists
# ---------------------------------------------------------------------------
# kind → folder name per category (mandated canonical layout; note event uses
# "photos" while portfolio/invitation use "images").
_KIND_FOLDER = {
    "portfolio": {"image": "images", "video": "videos", "thumbnail": "thumbnails"},
    "event": {"image": "photos", "video": "videos", "audio": "audio", "thumbnail": "thumbnails"},
    "invitation": {"image": "images", "video": "videos", "audio": "audio",
                   "music": "background-music", "thumbnail": "thumbnails"},
}

_IMAGE_MIME = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/heic": ".heic", "image/heif": ".heif", "image/tiff": ".tif",
    "image/avif": ".avif",
}
_VIDEO_MIME = {
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
    "video/x-matroska": ".mkv",
}
_AUDIO_MIME = {
    "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/aac": ".aac",
    "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/flac": ".flac",
    "audio/ogg": ".ogg",
}

ALLOWED_MIME: Dict[str, Dict[str, str]] = {
    "image": _IMAGE_MIME,
    "thumbnail": _IMAGE_MIME,
    "video": _VIDEO_MIME,
    "audio": _AUDIO_MIME,
    "music": _AUDIO_MIME,
}

# Selfies are always re-encoded to JPEG before storage; the *accepted* upload
# set is the image allowlist.
SELFIE_ALLOWED_MIME = _IMAGE_MIME


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


# Per-file byte ceilings (env-tunable; generous enough for professional
# photography — do not shrink these to "protect" the VM: large files go
# browser→S3 directly and never transit the app server).
MAX_BYTES_BY_KIND = {
    "image": _env_int("MEDIA_MAX_IMAGE_BYTES", 200 * 1024 * 1024),          # 200 MB
    "thumbnail": _env_int("MEDIA_MAX_IMAGE_BYTES", 200 * 1024 * 1024),
    "video": _env_int("MEDIA_MAX_VIDEO_BYTES", 64 * 1024 * 1024 * 1024),    # 64 GiB
    "audio": _env_int("MEDIA_MAX_AUDIO_BYTES", 1024 * 1024 * 1024),         # 1 GiB
    "music": _env_int("MEDIA_MAX_MUSIC_BYTES", 200 * 1024 * 1024),          # 200 MB
}

# Quotas (aggregate, enforced at upload-session creation from media_assets).
EVENT_QUOTA_BYTES = _env_int("MEDIA_EVENT_QUOTA_BYTES", 3 * 1024 ** 4)          # 3 TiB
PHOTOGRAPHER_QUOTA_BYTES = _env_int("MEDIA_PHOTOGRAPHER_QUOTA_BYTES", 5 * 1024 ** 4)  # 5 TiB

# Multipart tuning. S3 minimum part size is 5 MiB (except the last part) and
# the hard cap is 10 000 parts per upload.
MULTIPART_THRESHOLD_BYTES = _env_int("MEDIA_MULTIPART_THRESHOLD_BYTES", 32 * 1024 * 1024)
MIN_PART_BYTES = 5 * 1024 * 1024
MAX_PARTS = 10_000
PART_PRESIGN_BATCH_MAX = 100

# Upload-session lifetime: sliding idle window + absolute ceiling.
SESSION_IDLE_HOURS = _env_int("MEDIA_UPLOAD_IDLE_HOURS", 6)
SESSION_ABSOLUTE_HOURS = _env_int("MEDIA_UPLOAD_ABSOLUTE_HOURS", 48)

# Abuse guards on the control plane (never on the S3 transfer itself).
MAX_ACTIVE_SESSIONS_PER_ADMIN = _env_int("MEDIA_MAX_ACTIVE_SESSIONS", 200)
SESSION_CREATE_RATE_PER_HOUR = _env_int("MEDIA_SESSION_RATE_PER_HOUR", 2000)

MAX_FILENAME_LEN = 255
_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def sanitize_filename(name: Optional[str]) -> str:
    """Display-safe filename for metadata. NEVER used as key material."""
    name = (name or "").strip()[:MAX_FILENAME_LEN]
    name = _FILENAME_SAFE.sub("_", name)
    return name or "upload"


def extension_for(kind: str, mime: str) -> Optional[str]:
    """Allowlisted extension for a (kind, mime) pair; None = rejected."""
    return (ALLOWED_MIME.get(kind) or {}).get((mime or "").lower())


# ---------------------------------------------------------------------------
# Canonical key builders
# ---------------------------------------------------------------------------
def _fid(ext: str) -> str:
    return f"{uuid.uuid4().hex}{ext}"


def _folder(category: str, kind: str) -> str:
    folders = _KIND_FOLDER.get(category)
    if not folders or kind not in folders:
        raise ValueError(f"kind {kind!r} not valid for category {category!r}")
    return folders[kind]


def portfolio_key(photographer_id: str, kind: str, ext: str) -> str:
    return f"photographer/{photographer_id}/portfolio/{_folder('portfolio', kind)}/{_fid(ext)}"


def event_media_key(photographer_id: str, event_id: str, kind: str, ext: str) -> str:
    return (f"photographer/{photographer_id}/event/{event_id}/"
            f"{_folder('event', kind)}/{_fid(ext)}")


def invitation_media_key(photographer_id: str, event_id: str, invitation_id: str,
                         kind: str, ext: str) -> str:
    return (f"photographer/{photographer_id}/event/{event_id}/invitation/{invitation_id}/"
            f"{_folder('invitation', kind)}/{_fid(ext)}")


def face_selfie_key(event_id: str, session_id: str) -> str:
    """Temporary guest selfie for a face-search session. Private bucket only."""
    return f"event/{event_id}/sessions/{session_id}/selfie"


def build_key(category: str, kind: str, mime: str, *, photographer_id: str,
              event_id: Optional[str] = None,
              invitation_id: Optional[str] = None) -> str:
    """Route to the right canonical builder; raises ValueError on bad combos."""
    ext = extension_for(kind, mime)
    if ext is None:
        raise ValueError(f"mime {mime!r} not allowed for kind {kind!r}")
    if category == "portfolio":
        return portfolio_key(photographer_id, kind, ext)
    if category == "event":
        if not event_id:
            raise ValueError("event_id required for event media")
        return event_media_key(photographer_id, event_id, kind, ext)
    if category == "invitation":
        if not (event_id and invitation_id):
            raise ValueError("event_id and invitation_id required for invitation media")
        return invitation_media_key(photographer_id, event_id, invitation_id, kind, ext)
    raise ValueError(f"unknown category: {category!r}")


def event_namespace(photographer_id: str, event_id: str) -> Dict[str, str]:
    """The 'upload media for this event here' description returned to the UI.
    Prefix-only — nothing is created in S3 (prefixes are logical)."""
    base = f"photographer/{photographer_id}/event/{event_id}/"
    return {
        "bucket": bucket_for("event"),
        "prefix": base,
        "photos": base + "photos/",
        "videos": base + "videos/",
        "audio": base + "audio/",
        "thumbnails": base + "thumbnails/",
        "invitations_bucket": bucket_for("invitation"),
        "invitations_prefix": base + "invitation/",
    }


if __name__ == "__main__":  # self-check
    os.environ.setdefault("AWS_S3_BUCKET", "test-bucket")
    # canonical name wins; legacy alias still resolves; face never falls back
    os.environ["AWS_S3_EVENT_BUCKET"] = "canon-event"
    os.environ["S3_BUCKET_EVENT"] = "legacy-event"
    assert bucket_for("event") == "canon-event", bucket_for("event")
    del os.environ["AWS_S3_EVENT_BUCKET"]
    assert bucket_for("event") == "legacy-event", bucket_for("event")
    del os.environ["S3_BUCKET_EVENT"]
    assert bucket_for("event") == "test-bucket", bucket_for("event")
    assert bucket_for("face") == "", "face must NOT fall back to the shared bucket"
    os.environ["AWS_S3_FACE_BUCKET"] = "canon-face"
    assert bucket_for("face") == "canon-face"
    k = build_key("event", "image", "image/jpeg", photographer_id="P1", event_id="E1")
    assert k.startswith("photographer/P1/event/E1/photos/") and k.endswith(".jpg"), k
    k2 = build_key("invitation", "music", "audio/mpeg",
                   photographer_id="P1", event_id="E1", invitation_id="I1")
    assert "/invitation/I1/background-music/" in k2 and k2.endswith(".mp3"), k2
    assert face_selfie_key("E1", "S1") == "event/E1/sessions/S1/selfie"
    for bad in (("event", "image", "application/x-msdownload"),
                ("event", "music", "audio/mpeg"),          # music not valid for event
                ("portfolio", "audio", "audio/mpeg")):     # audio not valid for portfolio
        try:
            build_key(bad[0], bad[1], bad[2], photographer_id="P", event_id="E",
                      invitation_id="I")
            raise SystemExit(f"should have rejected {bad}")
        except ValueError:
            pass
    assert sanitize_filename("../../etc/passwd\x00.jpg") == ".._.._etc_passwd_.jpg"
    assert extension_for("image", "image/svg+xml") is None  # no scriptable formats
    print("media_storage self-check OK")
