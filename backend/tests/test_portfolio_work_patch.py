"""Updating a portfolio work must not blank the fields you didn't send.

`PUT /api/portfolio/works/{id}` used to do `payload.model_dump()` — a FULL
replace. `WorkIn.title` is required, so the natural "toggle featured" request
(`{title, featured}`) validated fine and then silently wiped `image_url`,
`gallery`, `tags`, `album_id` and the rest back to their defaults. A 200 with
data loss behind it.

The subtlety is that the handler also reconciles storage quota by DELTA between
the work's old media URLs and the new ones. Naively switching to
`exclude_unset` would make an omitted `image_url` read as "all media removed",
releasing the files and zeroing `size_bytes`. So an omitted field has to fall
back to the STORED value, not to the model default — that is what these tests
pin, from both directions.

FakeDB; no network, no Postgres.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.aws_stub import ensure_aws_service
ensure_aws_service()

from tests.test_storage_orchestrator import FakeDB

import portfolio_service as ps


def _existing_work():
    return {
        "id": "w1", "studio_id": "stu1", "title": "Beach Wedding",
        "album_id": "alb1", "image_url": "/uploads/a.jpg",
        "video_url": None, "gallery": ["/uploads/b.jpg"],
        "tags": ["candid", "beach"], "featured": False,
        "description": "A lovely day", "size_bytes": 4096,
    }


def _update_endpoint(db):
    async def _require_admin():
        return {"admin_id": "stu1"}

    async def _require_super_admin():
        return "su1"

    router = ps.build_portfolio_router(db, _require_admin, _require_super_admin)
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", "") == "/api/portfolio/works/{work_id}"
                and "PUT" in getattr(r, "methods", set()))


async def _run_patch(db, body_kwargs):
    ep = _update_endpoint(db)
    # Only the keys passed here count as "set" — exactly how FastAPI would
    # construct the model from a partial JSON body.
    payload = ps.WorkIn(**body_kwargs)
    return await ep("w1", payload, admin={"admin_id": "stu1"})


def test_partial_update_preserves_unsent_fields():
    async def go():
        db = FakeDB()
        await db.portfolio_works.insert_one(_existing_work())
        await _run_patch(db, {"title": "Beach Wedding", "featured": True})

        w = await db.portfolio_works.find_one({"id": "w1"}, {"_id": 0})
        assert w["featured"] is True, "the field we sent must change"
        assert w["image_url"] == "/uploads/a.jpg", f"image blanked: {w}"
        assert w["gallery"] == ["/uploads/b.jpg"], f"gallery blanked: {w}"
        assert w["tags"] == ["candid", "beach"], f"tags blanked: {w}"
        assert w["album_id"] == "alb1", f"album detached: {w}"
        assert w["description"] == "A lovely day", f"description blanked: {w}"
    asyncio.run(go())


def test_partial_update_does_not_release_media_or_zero_size():
    """The delta trap: omitting image_url must not read as 'media removed'."""
    async def go():
        db = FakeDB()
        await db.portfolio_works.insert_one(_existing_work())
        await _run_patch(db, {"title": "Beach Wedding", "featured": True})

        w = await db.portfolio_works.find_one({"id": "w1"}, {"_id": 0})
        assert w["size_bytes"] == 4096, f"size zeroed on an unrelated edit: {w}"
    asyncio.run(go())


def test_explicit_media_removal_still_works():
    """Clearing media ON PURPOSE must still clear it — the fix must not make
    fields un-clearable."""
    async def go():
        db = FakeDB()
        await db.portfolio_works.insert_one(_existing_work())
        await _run_patch(db, {"title": "Beach Wedding",
                              "image_url": None, "gallery": []})

        w = await db.portfolio_works.find_one({"id": "w1"}, {"_id": 0})
        assert w["image_url"] is None, f"explicit clear ignored: {w}"
        assert w["gallery"] == [], f"explicit clear ignored: {w}"
        assert w["size_bytes"] == 0, f"size not reclaimed: {w}"
    asyncio.run(go())


def test_full_update_still_replaces_everything_sent():
    async def go():
        db = FakeDB()
        await db.portfolio_works.insert_one(_existing_work())
        await _run_patch(db, {"title": "Hill Wedding", "album_id": "alb2",
                              "image_url": "/uploads/c.jpg", "gallery": [],
                              "tags": ["hills"], "featured": True})

        w = await db.portfolio_works.find_one({"id": "w1"}, {"_id": 0})
        assert w["title"] == "Hill Wedding" and w["album_id"] == "alb2"
        assert w["image_url"] == "/uploads/c.jpg" and w["tags"] == ["hills"]
    asyncio.run(go())


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print("portfolio work PATCH semantics OK")
