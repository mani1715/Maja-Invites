"""
test_studio_insights.py — photographer-scoped QR/storage/face insights on FakeDB.

    cd backend && python -m tests.test_studio_insights
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import studio_insights as si                                 # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


async def main():
    db = FakeDB()
    now = datetime.now(timezone.utc).isoformat()

    # two studios; s1 owns p1+p2, s2 owns p9 (must never leak into s1's view)
    await db.profiles.insert_one({"id": "p1", "admin_id": "s1", "slug": "asha-rohan", "couple_names": "Asha & Rohan"})
    await db.profiles.insert_one({"id": "p2", "admin_id": "s1", "slug": "meera-vik", "couple_names": "Meera & Vik"})
    await db.profiles.insert_one({"id": "p9", "admin_id": "s2", "slug": "other", "couple_names": "Other Couple"})

    # QR gallery photos — guest + studio, with sizes
    await db.live_gallery_photos.insert_one({"id": "g1", "wedding_id": "p1", "source": "guest", "file_size": 2 * 1024 * 1024})
    await db.live_gallery_photos.insert_one({"id": "g2", "wedding_id": "p1", "source": "studio", "file_size": 3 * 1024 * 1024})
    await db.live_gallery_photos.insert_one({"id": "g3", "wedding_id": "p2", "source": "guest", "file_size": 1 * 1024 * 1024})
    await db.live_gallery_photos.insert_one({"id": "g9", "wedding_id": "p9", "source": "guest", "file_size": 9 * 1024 * 1024})
    # scans
    await db.qr_scan_counts.insert_one({"wedding_id": "p1", "count": 10})
    await db.qr_scan_counts.insert_one({"wedding_id": "p9", "count": 999})
    # studio storage
    await db.backup_files.insert_one({"id": "b1", "studio_id": "s1", "size_bytes": 1 * si.GB, "created_at": now})
    await db.backup_files.insert_one({"id": "b2", "studio_id": "s1", "size_bytes": 1 * si.GB, "created_at": now, "deleted": True})
    await db.backup_files.insert_one({"id": "b9", "studio_id": "s2", "size_bytes": 5 * si.GB, "created_at": now})
    await db.studio_storage_plans.insert_one({"id": "pl1", "studio_id": "s1", "gb_limit": 50, "status": "active"})
    # faces
    await db.gallery_photos.insert_one({"id": "f1", "profile_id": "p1", "face_count": 3})
    await db.gallery_photos.insert_one({"id": "f2", "profile_id": "p1", "face_count": 0})
    await db.gallery_photos.insert_one({"id": "f9", "profile_id": "p9", "face_count": 7})
    await db.face_search_sessions.insert_one({"id": "s1s", "profile_id": "p1", "created_at": now})
    await db.photo_requests.insert_one({"id": "pr1", "profile_id": "p1", "created_at": now})

    m = await si.compute_insights(db, "s1", days=3650)

    ok("owned events = 2 (p1,p2)", m["owned_events"] == 2)

    q = m["qr"]
    ok("uploads scoped to s1 (3, not 4)", q["total_uploads"] == 3)
    ok("guest uploads = 2", q["guest_uploads"] == 2)
    ok("studio uploads = 1", q["studio_uploads"] == 1)
    ok("scans scoped (10, not 999)", q["total_scans"] == 10)
    ok("gallery storage = 6 MB -> GB", abs(q["gallery_storage_gb"] - round(6 * 1024 * 1024 / si.GB, 3)) < 1e-6)
    ok("top event is p1 (2 uploads)", q["top_events"][0]["wedding_id"] == "p1" and q["top_events"][0]["uploads"] == 2)
    ok("top event carries name", q["top_events"][0]["name"] == "Asha & Rohan")

    s = m["storage"]
    ok("backup used = 1 GB (deleted + s2 excluded)", s["backup_used_gb"] == 1.0)
    ok("backup files = 1 (deleted excluded)", s["backup_files"] == 1)
    ok("quota = 50 GB", s["quota_gb"] == 50)
    ok("has_plan true", s["has_plan"] is True)
    ok("used_pct = 2.0", s["used_pct"] == 2.0)

    f = m["face"]
    ok("indexed photos = 1 (face_count>0, scoped)", f["indexed_photos"] == 1)
    ok("indexed faces = 3 (p9's 7 excluded)", f["indexed_faces"] == 3)
    ok("face collections = 1", f["collections"] == 1)
    ok("searches 30d = 1", f["searches_30d"] == 1)
    ok("photo requests 30d = 1", f["photo_requests_30d"] == 1)

    # empty studio -> all zeros, no crash
    m0 = await si.compute_insights(FakeDB(), "nobody", days=90)
    ok("empty studio -> zero uploads", m0["qr"]["total_uploads"] == 0)
    ok("empty studio -> no plan", m0["storage"]["has_plan"] is False)
    ok("empty studio -> zero faces", m0["face"]["indexed_faces"] == 0)

    print(f"\nStudio Insights: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
