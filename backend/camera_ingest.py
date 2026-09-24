"""
camera_ingest.py — turn one camera-transferred file into a gallery photo, by
feeding it into the EXISTING ingestion pipeline. No second gallery, queue, or
face system.

Given the bytes of a file that landed via SFTP and the server-side binding
(which event/photographer the SFTP identity maps to), this:
  1. re-resolves the profile from the binding's profile_id (never the camera),
  2. requires the gallery/face collection to be enabled for that event,
  3. calls gallery_features._ingest_photo_bytes(..., method="sftp_camera"),
     which validates by magic bytes (photo_guard), de-dups by sha256, derives
     preview/thumb, stores the ORIGINAL untouched in S3, inserts the
     gallery_photos row and enqueues FACE_INDEX (inline if no Redis),
  4. writes a camera_events audit row.

Face recognition is NOT run synchronously here — it rides the same FACE_INDEX
queue every other upload uses.
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

import camera_transfer_service as cts

# Camera-lane byte ceiling (large JPEGs are fine; keep RAW/video out — they
# aren't Rekognition-indexable anyway and photo_guard would reject them).
MAX_BYTES = int(os.environ.get("CAMERA_MAX_UPLOAD_BYTES", str(80 * 1024 * 1024)))


def sanitize_filename(name: str) -> str:
    """basename only, printable, capped. The stored key uses a server UUID, so
    this is only a cosmetic/log label — but it must never carry a path."""
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("._") or "photo.jpg"
    return name[:128]


async def ingest_bytes(db, binding: Dict[str, Any], data: bytes,
                       filename: str, *, client_ip: str = "") -> Dict[str, Any]:
    """Ingest one received file. `binding` is what camera_transfer_service
    .authenticate() returned — the trusted (transfer_id, profile_id, admin_id).
    Returns {ok, result, ...}; result ∈ stored|duplicate|rejected.
    """
    import gallery_features as gf   # lazy: heavy import, and avoids load cycles

    fname = sanitize_filename(filename)
    transfer_id = binding["transfer_id"]
    profile_id = binding["profile_id"]

    async def _reject(reason: str) -> Dict[str, Any]:
        await cts.record_event(db, transfer_id=transfer_id, profile_id=profile_id,
                               filename=fname, size=len(data or b""),
                               result="rejected", reason=reason, client_ip=client_ip)
        return {"ok": False, "result": "rejected", "reason": reason}

    if not data:
        return await _reject("empty_file")
    if len(data) > MAX_BYTES:
        return await _reject(f"too_large:{len(data)}>{MAX_BYTES}")

    # Re-resolve the event from the TRUSTED binding, never from the camera. If
    # the profile vanished or the gallery isn't enabled, reject (no collection
    # to index into).
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        return await _reject("event_not_found")
    gc = profile.get("gallery_config") or {}
    if not gc.get("enabled"):
        return await _reject("gallery_not_enabled")

    try:
        res = await gf._ingest_photo_bytes(
            db, profile, gc, data, fname, "",
            method=cts.UPLOAD_METHOD, uploader=f"camera:{transfer_id}",
            max_bytes=MAX_BYTES)
    except Exception as e:      # pragma: no cover - defensive
        return await _reject(f"ingest_error:{str(e)[:120]}")

    if not res.get("ok"):
        # photo_guard rejected it (not a photo / oversize / decode fail).
        return await _reject(res.get("error") or res.get("message") or "not_a_photo")

    result = "duplicate" if res.get("duplicate") else "stored"
    photo_id = res.get("id")
    await cts.record_event(db, transfer_id=transfer_id, profile_id=profile_id,
                           filename=fname, size=len(data), result=result,
                           photo_id=photo_id, client_ip=client_ip)
    await cts.touch_last_seen(db, transfer_id)
    return {"ok": True, "result": result, "photo_id": photo_id,
            "duplicate": bool(res.get("duplicate"))}
