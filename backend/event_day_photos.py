"""
event_day_photos.py — MAJA Dynamic Event Engine: per-day photo rules (Ganesh v2 §2).
=====================================================================================

Each festival day accepts a small, bounded set of memories that can be posted only
AFTER that day has arrived (you cannot upload a future day's photos early):
  * up to 5 photos + 1 video per day,
  * video ≤ 100 MB,
  * locked while `today < day.date` (a day with no date is never locked).

Pure, reusable logic used by both the status endpoint (so the UI can show
"3/5 photos · unlocks 16 Sep") and the upload path (server-side enforcement).
Photos are tagged with `festival_day` on the existing `gallery` collection — no new store.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

DAY_PHOTO_LIMIT = 5
DAY_VIDEO_LIMIT = 1
DAY_VIDEO_MAX_BYTES = 100 * 1024 * 1024


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _day_row(db, event_id: str, festival_day) -> Optional[Dict[str, Any]]:
    async for d in db.festival_schedule.find({"event_id": event_id}):
        if d.get("deleted_at"):
            continue
        if str(d.get("festival_day")) == str(festival_day):
            d.pop("_id", None)
            return d
    return None


async def _counts(db, event_id: str, festival_day) -> Dict[str, int]:
    photos = videos = 0
    async for m in db.gallery.find({"event_id": event_id}):
        if m.get("deleted_at"):
            continue
        if str(m.get("festival_day")) != str(festival_day):
            continue
        if m.get("type") == "video":
            videos += 1
        else:
            photos += 1
    return {"photos": photos, "videos": videos}


async def day_status(db, event_id: str, festival_day) -> Dict[str, Any]:
    """Upload availability + usage for one festival day (drives the UI)."""
    day = await _day_row(db, event_id, festival_day)
    date = (day or {}).get("date")
    locked = bool(date) and _today() < str(date)     # day is still in the future
    counts = await _counts(db, event_id, festival_day)
    return {
        "festival_day": festival_day,
        "date": date,
        "unlocked": not locked,
        "unlocks_on": date if locked else None,
        "photos_used": counts["photos"], "photos_limit": DAY_PHOTO_LIMIT,
        "videos_used": counts["videos"], "videos_limit": DAY_VIDEO_LIMIT,
        "video_max_mb": DAY_VIDEO_MAX_BYTES // (1024 * 1024),
    }


async def enforce_day_upload(db, event_id: str, festival_day, *, is_video: bool, size_bytes: int) -> None:
    """Raise if this day's photos are still locked, the per-day limit is reached, or
    a video exceeds 100 MB. No-op semantics when festival_day is falsy (ungrouped upload)."""
    if festival_day in (None, "", 0, "0"):
        return
    st = await day_status(db, event_id, festival_day)
    if not st["unlocked"]:
        raise HTTPException(423, {"message": f"Day {festival_day} photos unlock on {st['unlocks_on']}.",
                                  "code": "DAY_LOCKED", "unlocks_on": st["unlocks_on"]})
    if is_video:
        if size_bytes > DAY_VIDEO_MAX_BYTES:
            raise HTTPException(413, {"message": "Video is too large (max 100 MB per day).",
                                      "code": "VIDEO_TOO_LARGE"})
        if st["videos_used"] >= DAY_VIDEO_LIMIT:
            raise HTTPException(409, {"message": f"Only {DAY_VIDEO_LIMIT} video allowed for day {festival_day}.",
                                      "code": "VIDEO_LIMIT"})
    else:
        if st["photos_used"] >= DAY_PHOTO_LIMIT:
            raise HTTPException(409, {"message": f"Only {DAY_PHOTO_LIMIT} photos allowed for day {festival_day}.",
                                      "code": "PHOTO_LIMIT"})
