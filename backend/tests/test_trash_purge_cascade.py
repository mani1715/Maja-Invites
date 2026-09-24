"""_daily_trash_purge cascades to child tables (FakeDB, no Postgres).

Regression for 2026-08-17 forensic finding #23.2: the 5-day trash sweep
hard-deleted `profiles` rows but left every child row (gallery_photos, rsvps,
guests, face sessions, consent, client accounts, media, wishes...) as a
permanent orphan — there are no FK constraints anywhere to catch it.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault("SUPABASE_DB_URL", "postgresql://stub:stub@localhost:9/stub")
os.environ.setdefault("ALLOW_INSECURE_PROD", "1")

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from tests.test_storage_orchestrator import FakeDB  # noqa: E402

import server  # noqa: E402  (heavy import; env stubs above satisfy its guards)


OLD = (datetime.now(timezone.utc) - timedelta(days=9)).isoformat()
FRESH = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def _seed(db):
    async def go():
        # profile past the 5-day window + one still inside it
        await db.profiles.insert_one({"id": "dead", "deleted_at": OLD,
                                      "gallery_config": {"aws_collection_id": "maja_wedding_dead"}})
        await db.profiles.insert_one({"id": "fresh", "deleted_at": FRESH})
        await db.profiles.insert_one({"id": "alive", "deleted_at": None})
        for coll in ("gallery_photos", "rsvps", "guests", "face_search_sessions",
                     "face_consent", "photo_requests", "event_client_accounts",
                     "profile_media", "wedding_album_media", "guest_wishes",
                     "greetings", "gift_registry", "shagun_records", "live_photos"):
            await getattr(db, coll).insert_one({"id": f"{coll}_dead", "profile_id": "dead"})
            await getattr(db, coll).insert_one({"id": f"{coll}_alive", "profile_id": "alive"})
        await db.live_gallery_photos.insert_one({"id": "lgp_dead", "wedding_id": "dead"})
        await db.live_gallery_photos.insert_one({"id": "lgp_alive", "wedding_id": "alive"})
    asyncio.run(go())


def _ids(db, coll, key="profile_id"):
    async def go():
        return sorted(d[key] for d in await getattr(db, coll).find({}, {"_id": 0}).to_list(100))
    return asyncio.run(go())


def test_purge_cascades_children_and_spares_live_rows():
    assert hasattr(server, "_daily_trash_purge"), \
        "scheduler block failed to import — apscheduler missing?"
    db = FakeDB()
    _seed(db)
    real_db = server.db
    server.db = db
    try:
        asyncio.run(server._daily_trash_purge())
    finally:
        server.db = real_db

    # profile past the window is gone; the fresh-trash and live ones remain
    assert _ids(db, "profiles", key="id") == ["alive", "fresh"]

    # every child table lost ONLY the dead profile's rows
    for coll in ("gallery_photos", "rsvps", "guests", "face_search_sessions",
                 "face_consent", "photo_requests", "event_client_accounts",
                 "profile_media", "wedding_album_media", "guest_wishes",
                 "greetings", "gift_registry", "shagun_records", "live_photos"):
        assert _ids(db, coll) == ["alive"], f"{coll} not cascaded"
    assert _ids(db, "live_gallery_photos", key="wedding_id") == ["alive"]
