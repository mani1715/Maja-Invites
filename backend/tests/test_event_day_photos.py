"""
Ganesh v2 — Phase 6: per-day photo rules self-test.

    cd backend && python -m tests.test_event_day_photos

Proves: a day's photos are locked until the day arrives; each day accepts ≤5 photos
+ 1 video (≤100 MB); an ungrouped upload (no festival_day) is never restricted.
In-memory FakeDB.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from datetime import datetime, timezone, timedelta

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_day_photos as dp


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


def _date(delta_days):
    return (datetime.now(timezone.utc).date() + timedelta(days=delta_days)).isoformat()


async def run():
    db = FakeDB()
    EID = "e1"
    # day 1 already passed (yesterday), day 2 in the future (tomorrow)
    await db.festival_schedule.insert_one({"id": "d1", "event_id": EID, "festival_day": 1, "date": _date(-1)})
    await db.festival_schedule.insert_one({"id": "d2", "event_id": EID, "festival_day": 2, "date": _date(1)})

    print("1. lock state follows the day's date")
    s1 = await dp.day_status(db, EID, 1)
    s2 = await dp.day_status(db, EID, 2)
    _check(s1["unlocked"] is True, "past day is unlocked")
    _check(s2["unlocked"] is False and s2["unlocks_on"] == _date(1), "future day locked until its date")

    print("2. enforce: future day rejected, past day allowed")
    await _expect(dp.enforce_day_upload(db, EID, 2, is_video=False, size_bytes=1000), 423, "future day photo blocked")
    await dp.enforce_day_upload(db, EID, 1, is_video=False, size_bytes=1000)   # no raise
    _check(True, "past day photo allowed")

    print("3. photo limit (5 per day)")
    for i in range(5):
        await db.gallery.insert_one({"id": f"p{i}", "event_id": EID, "festival_day": 1, "type": "image"})
    st = await dp.day_status(db, EID, 1)
    _check(st["photos_used"] == 5, "5 photos counted")
    await _expect(dp.enforce_day_upload(db, EID, 1, is_video=False, size_bytes=1000), 409, "6th photo blocked")

    print("4. video limit (1 per day) + size cap")
    await _expect(dp.enforce_day_upload(db, EID, 1, is_video=True, size_bytes=dp.DAY_VIDEO_MAX_BYTES + 1),
                  413, "oversized video blocked")
    await dp.enforce_day_upload(db, EID, 1, is_video=True, size_bytes=1000)   # first video ok
    await db.gallery.insert_one({"id": "v1", "event_id": EID, "festival_day": 1, "type": "video"})
    await _expect(dp.enforce_day_upload(db, EID, 1, is_video=True, size_bytes=1000), 409, "2nd video blocked")

    print("5. ungrouped upload (no festival_day) is never restricted")
    await dp.enforce_day_upload(db, EID, None, is_video=False, size_bytes=1000)
    await dp.enforce_day_upload(db, EID, 0, is_video=True, size_bytes=dp.DAY_VIDEO_MAX_BYTES + 1)
    _check(True, "no-op for ungrouped uploads")

    print("\nALL GANESH v2 DAY-PHOTO TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
