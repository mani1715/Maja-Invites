"""Shared profile-purge cascade covers the full child-table set, and both the
5-day sweep and the admin bulk-purge use it (546f775 follow-up audit P1).

The prior test (test_trash_purge_cascade.py) covered the original 14-table list;
this one asserts the EXPANDED set (song_requests, check_ins, view_analytics,
qr_scan_counts[wedding_id], etc.) and exercises the helper directly.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
from profile_purge import (purge_profile_children,   # noqa: E402
                           CHILD_BY_PROFILE_ID, CHILD_BY_WEDDING_ID)


def _seed(db):
    async def go():
        for coll in CHILD_BY_PROFILE_ID:
            await getattr(db, coll).insert_one({"id": f"{coll}_dead", "profile_id": "dead"})
            await getattr(db, coll).insert_one({"id": f"{coll}_live", "profile_id": "keep"})
        for coll in CHILD_BY_WEDDING_ID:
            await getattr(db, coll).insert_one({"id": f"{coll}_dead", "wedding_id": "dead"})
            await getattr(db, coll).insert_one({"id": f"{coll}_live", "wedding_id": "keep"})
    asyncio.run(go())


def _remaining(db, coll, key):
    async def go():
        return sorted(d[key] for d in await getattr(db, coll).find({}, {"_id": 0}).to_list(100))
    return asyncio.run(go())


def test_helper_cascades_every_listed_table():
    db = FakeDB()
    _seed(db)
    asyncio.run(purge_profile_children(db, "dead", {"aws_collection_id": "maja_wedding_dead"}))

    for coll in CHILD_BY_PROFILE_ID:
        assert _remaining(db, coll, "profile_id") == ["keep"], f"{coll} not cascaded by profile_id"
    for coll in CHILD_BY_WEDDING_ID:
        assert _remaining(db, coll, "wedding_id") == ["keep"], f"{coll} not cascaded by wedding_id"


def test_expanded_set_includes_the_newly_added_tables():
    # regression: these were the tables the 546f775 follow-up audit found missing
    for t in ("song_requests", "check_ins", "guest_reactions", "thank_you_messages",
              "view_sessions", "analytics", "view_analytics", "engagement_analytics",
              "invitation_visitors", "profile_versions", "link_reactivations",
              "client_budgets", "studio_print_orders", "proofing_photos"):
        assert t in CHILD_BY_PROFILE_ID, f"{t} missing from cascade list"
    assert "qr_scan_counts" in CHILD_BY_WEDDING_ID


def test_empty_pid_is_noop():
    db = FakeDB()
    _seed(db)
    asyncio.run(purge_profile_children(db, "", None))
    # nothing deleted
    assert _remaining(db, "guests", "profile_id") == ["dead", "keep"]
