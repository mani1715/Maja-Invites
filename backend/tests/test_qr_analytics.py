"""test_qr_analytics.py — QR analytics aggregation + scan counter on FakeDB.
    cd backend && python -m tests.test_qr_analytics
"""
from __future__ import annotations
import asyncio, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
from tests.test_storage_orchestrator import FakeDB          # noqa: E402
import qr_analytics as qa                                   # noqa: E402

PASS = 0; FAIL = []
def ok(l, c):
    global PASS
    if c: PASS += 1; print(f"  ok  {l}")
    else: FAIL.append(l); print(f"  FAIL  {l}")


async def main():
    db = FakeDB()
    await db.profiles.insert_one({"id": "w1", "slug": "aditi-rahul"})
    await db.profiles.insert_one({"id": "w2", "slug": "meera-sam"})
    # w1: 2 guest + 1 studio upload; w2: 1 guest
    await db.live_gallery_photos.insert_one({"id": "p1", "wedding_id": "w1", "source": "guest", "file_size": 1048576})
    await db.live_gallery_photos.insert_one({"id": "p2", "wedding_id": "w1", "source": "guest", "file_size": 1048576})
    await db.live_gallery_photos.insert_one({"id": "p3", "wedding_id": "w1", "source": "photographer", "file_size": 2097152})
    await db.live_gallery_photos.insert_one({"id": "p4", "wedding_id": "w2", "source": "guest", "file_size": 1048576})
    await db.upload_logs.insert_one({"id": "l1", "status": "failed"})
    await db.upload_logs.insert_one({"id": "l2", "status": "success"})

    # scan counter (real)
    ok("scan resolves slug", await qa.record_scan(db, "aditi-rahul") is True)
    await qa.record_scan(db, "aditi-rahul")
    await qa.record_scan(db, "meera-sam")
    ok("unknown slug returns False", await qa.record_scan(db, "nope") is False)
    cnt = await db.qr_scan_counts.find_one({"wedding_id": "w1"}, {"_id": 0})
    ok("scan count increments (upsert)", cnt["count"] == 2)

    m = await qa.compute_qr_analytics(db)
    ok("total uploads", m["total_uploads"] == 4)
    ok("guest vs studio split", m["guest_uploads"] == 3 and m["studio_uploads"] == 1)
    ok("total scans", m["total_scans"] == 3)
    ok("failed uploads", m["failed_uploads"] == 1)
    ok("galleries counted", m["galleries"] == 2)
    ok("storage bytes summed", m["storage_bytes"] == 1048576 * 3 + 2097152)
    ok("top event is w1 (3 uploads)", m["top_events"][0]["wedding_id"] == "w1" and m["top_events"][0]["uploads"] == 3)
    ok("top event carries scans", m["top_events"][0]["scans"] == 2)
    ok("scan_to_upload pct computed", 0 <= m["scan_to_upload_pct"] <= 100)

    m0 = await qa.compute_qr_analytics(FakeDB())
    ok("empty db yields zeros", m0["total_uploads"] == 0 and m0["total_scans"] == 0)

    print(f"\nQR Analytics: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
