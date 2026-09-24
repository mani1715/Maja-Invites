"""
photo_guard.py — ONE place that answers "is this actually a photo?".

The owner's requirement: where a user uploads photos, ONLY photos may get
through — not documents, not videos, not archives.

Why a dedicated module rather than another inline check:

  * `accept="image/*"` on an <input> is a FILE-PICKER HINT, not a rule. Anything
    can be dropped, scripted, or curl'd past it.
  * An extension check is not a content check: `wedding.mp4` renamed to
    `wedding.jpg` sails through `Path(name).suffix` validation.
  * `content_type` comes from the CLIENT. It is a claim, never evidence.
  * `POST /api/invite/{slug}/gallery/guest-upload` is PUBLIC and
    UNAUTHENTICATED, and validated only emptiness and size — so any guest could
    push arbitrary files onto the server disk. That is the real hole behind
    "only photos will be allowed".

So the decision is made from the BYTES: magic-number sniff, then a real Pillow
decode. Everything else (name, declared type) is treated as untrusted.

SVG is deliberately rejected even though browsers render it: an .svg is XML that
can carry <script>, so serving guest-supplied SVG from our own origin would be
a stored-XSS vector. "Photos" means raster photos.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("photo_guard")

# Raster photo formats we accept end to end (upload → thumbnail → Rekognition).
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"}
ALLOWED_MIME = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/heic", "image/heif", "image/gif",
}
# Pillow's own format names for the same set (what a real decode reports).
ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "HEIF", "HEIC", "MPO"}

DEFAULT_MAX_BYTES = 25 * 1024 * 1024   # 25 MB per photo

# Signatures of things people actually try to upload to a photo gallery. Matched
# only to give an HONEST error message ("that looks like a video") — rejection
# never depends on this list being complete; anything Pillow cannot decode as an
# allowed format is refused regardless.
_KNOWN_NON_PHOTO = [
    (b"%PDF-",                       "a PDF document"),
    (b"PK\x03\x04",                  "a zip / office document"),
    (b"Rar!\x1a\x07",                "a RAR archive"),
    (b"\x1f\x8b",                    "a gzip archive"),
    (b"MZ",                          "a Windows program"),
    (b"\x7fELF",                     "a Linux program"),
    (b"\x1aE\xdf\xa3",               "a video (Matroska / WebM)"),
    (b"OggS",                        "an Ogg audio/video file"),
    (b"ID3",                         "an MP3 audio file"),
    (b"fLaC",                        "a FLAC audio file"),
    (b"<?xml",                       "an SVG or XML file"),
    (b"<svg",                        "an SVG file"),
    (b"\x00\x00\x01\xba",            "an MPEG video"),
    (b"\x00\x00\x01\xb3",            "an MPEG video"),
]


class NotAPhoto(ValueError):
    """Raised with a message meant to be shown to the person uploading."""


def _describe_non_photo(data: bytes) -> Optional[str]:
    head = data[:64]
    for sig, label in _KNOWN_NON_PHOTO:
        if head.startswith(sig):
            return label
    # ISO-BMFF (mp4 / mov / 3gp / HEIF all share this container). HEIF is a photo;
    # the rest are video. The brand at bytes 8..12 tells them apart.
    if len(data) > 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand[:3] in (b"hei", b"mif", b"msf"):   # heic/heix/mif1/msf1 → photo
            return None
        return "a video (MP4 / MOV)"
    if head[:4] == b"RIFF" and len(data) > 12 and data[8:12] == b"AVI ":
        return "an AVI video"
    return None


def sniff_photo(data: bytes, filename: str = "", content_type: str = "",
                max_bytes: int = DEFAULT_MAX_BYTES) -> Tuple[bool, str, str]:
    """Decide from the bytes whether `data` is an acceptable photo.

    Returns (ok, error_message, pil_format). `error_message` is written for the
    uploader, not for a log: it names what they actually sent where we can tell.
    """
    name = Path(filename or "").name
    label = name or "That file"

    if not data:
        return False, f"{label} is empty.", ""
    if len(data) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        return False, f"{label} is larger than {mb} MB. Please upload a smaller photo.", ""

    # 1) Name it early where we recognise it, so the message is useful.
    what = _describe_non_photo(data)
    if what:
        return False, f"{label} looks like {what}. Only photos can be uploaded here.", ""

    # 2) The only evidence that counts: can Pillow decode it as an allowed image?
    try:
        from PIL import Image
    except Exception:                                    # pragma: no cover
        # Refusing is the safe default: passing unverified bytes through would
        # defeat the entire point of this module.
        logger.error("[photo_guard] Pillow unavailable — refusing upload")
        return False, "Photo uploads are temporarily unavailable. Please try again shortly.", ""

    fmt = ""
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = (im.format or "").upper()
            im.verify()                                   # detects truncation/corruption
    except Exception:
        return False, (f"{label} is not a photo we can read. Please upload a JPG, PNG, "
                       f"WebP or HEIC image."), ""

    if fmt not in ALLOWED_PIL_FORMATS:
        return False, (f"{label} is a {fmt or 'unsupported'} file, which we cannot use as a "
                       f"photo. Please upload a JPG, PNG, WebP or HEIC image."), fmt

    # 3) Extension and declared type are only ever a cross-check, never the
    #    decision — a real photo with an odd name is still a real photo.
    ext = Path(name).suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        logger.info("[photo_guard] %s decoded as %s despite extension %s — allowing",
                    name, fmt, ext)
    ct = (content_type or "").lower().split(";")[0].strip()
    if ct and ct not in ALLOWED_MIME and ct != "application/octet-stream":
        logger.info("[photo_guard] %s decoded as %s despite content-type %s — allowing",
                    name, fmt, ct)

    return True, "", fmt


def assert_photo(data: bytes, filename: str = "", content_type: str = "",
                 max_bytes: int = DEFAULT_MAX_BYTES) -> str:
    """sniff_photo, but raise NotAPhoto with the uploader-facing message."""
    ok, err, fmt = sniff_photo(data, filename, content_type, max_bytes)
    if not ok:
        raise NotAPhoto(err)
    return fmt


def photo_accept_spec() -> dict:
    """What the frontend should put in `accept` / show as the allowed list.
    Served to the UI so the picker hint and the server rule cannot drift apart."""
    return {
        "extensions": sorted(ALLOWED_EXTENSIONS),
        "mime_types": sorted(ALLOWED_MIME),
        "accept": ",".join(sorted(ALLOWED_MIME) + sorted(ALLOWED_EXTENSIONS)),
        "max_bytes": DEFAULT_MAX_BYTES,
        "help": "Photos only — JPG, PNG, WebP, HEIC or GIF. Videos, PDFs and documents are not accepted.",
    }
