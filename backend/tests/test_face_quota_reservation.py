"""
Batch face-match quota reservation — the mandated matrix, against real Postgres.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_face_quota_reservation.py -q

These are pytest-collected on purpose. Two older concurrency proofs in this
tree are `__main__` self-tests that the suite never runs, so a regression in
them is invisible; this one fails the suite.

The concurrency case is the reason the module exists. `available` is derived
from two COUNTs plus a SUM, so a plain read-then-write is a classic
check-then-act race: two photographers (or two browser tabs) reserving the last
100 slots would both read `remaining=100` and both win, overselling the
allocation the studio actually paid for. face_quota serialises the critical
section with a Postgres advisory lock keyed on the wedding; the test fires the
two reservations truly concurrently and asserts exactly one wins.

Skips — never silently passes — when no Postgres is reachable.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import pytest_asyncio

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
except Exception:                                   # pragma: no cover
    pass

DSN = os.environ.get("MAJA_PG_DSN") or os.environ.get("SUPABASE_DB_URL") or ""

pytestmark = pytest.mark.skipif(not DSN, reason="no Postgres DSN (SUPABASE_DB_URL / MAJA_PG_DSN)")

QUOTA = 2000


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest_asyncio.fixture()
async def wedding():
    """A throwaway wedding that bought a 2000-photo face-match SKU.

    Yields (db, profile_id, seed_used) where `seed_used(n)` fabricates n
    accepted photos. Everything it writes is removed afterwards.
    """
    import asyncpg
    from pg_adapter import Database

    try:
        pool = await asyncio.wait_for(
            asyncpg.create_pool(dsn=DSN, min_size=2, max_size=8), timeout=5)
    except Exception as e:                          # pragma: no cover
        pytest.skip(f"Postgres not reachable ({type(e).__name__})")

    db = Database(pool)
    profile_id = f"test_fq_{uuid.uuid4().hex[:12]}"

    await db.profiles.insert_one({
        "id": profile_id, "admin_id": "test_admin_fq",
        "gallery_config": {"enabled": True, "aws_collection_id": f"maja_wedding_{profile_id}"},
        "created_at": _iso(),
    })
    await db.invitation_orders.insert_one({
        "id": f"invord_{uuid.uuid4().hex[:12]}", "profile_id": profile_id,
        "status": "paid", "face_photo_limit": QUOTA, "created_at": _iso(),
    })

    async def seed_used(n: int) -> None:
        for _ in range(n):
            await db.gallery_photos.insert_one({
                "id": str(uuid.uuid4()), "profile_id": profile_id,
                "indexed": False, "created_at": _iso(),
            })

    try:
        yield db, profile_id, seed_used
    finally:
        for coll, flt in (("gallery_photos", {"profile_id": profile_id}),
                          ("face_quota_reservations", {"profile_id": profile_id}),
                          ("invitation_orders", {"profile_id": profile_id}),
                          ("profiles", {"id": profile_id})):
            try:
                await getattr(db, coll).delete_many(flt)
            except Exception:
                pass
        await pool.close()


# --------------------------------------------------------------------------- #
# The mandated matrix
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_case1_full_allocation_fits(wedding):
    """2000 quota / 0 used / 2000 requested -> PASS."""
    import face_quota
    db, pid, _ = wedding
    res = await face_quota.reserve(db, pid, 2000)
    assert res["reservation_id"]
    assert res["allocated"] == 2000
    assert res["used"] == 0
    assert res["reserved"] == 2000
    assert res["remaining"] == 0


@pytest.mark.asyncio
async def test_case2_exactly_the_remainder_fits(wedding):
    """2000 / 1900 used / 100 requested -> PASS, and nothing is left over."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)
    res = await face_quota.reserve(db, pid, 100)
    assert res["reservation_id"]
    assert res["used"] == 1900
    assert res["remaining"] == 0


@pytest.mark.asyncio
async def test_case3_one_over_is_refused(wedding):
    """2000 / 1900 / 101 -> FAIL. Off-by-one is the case a naive `>=` gets wrong."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)
    with pytest.raises(face_quota.QuotaExceeded) as ei:
        await face_quota.reserve(db, pid, 101)
    p = ei.value.payload
    assert p["code"] == "QUOTA_EXCEEDED"
    assert (p["allocated"], p["used"], p["remaining"], p["requested"], p["excess"]) == \
           (2000, 1900, 100, 101, 1)


@pytest.mark.asyncio
async def test_case4_oversized_batch_is_refused_whole(wedding):
    """2000 / 1900 / 301 -> FAIL, and NO partial hold is created.

    The all-or-nothing rule is the point: uploading 100 of the 301 and
    rejecting 201 would leave the studio with a half-delivered event.
    """
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)
    with pytest.raises(face_quota.QuotaExceeded) as ei:
        await face_quota.reserve(db, pid, 301)
    p = ei.value.payload
    assert (p["remaining"], p["requested"], p["excess"]) == (100, 301, 201)
    assert "301 photos" in p["message"] and "100 photos remain" in p["message"]

    # no hold was written, so the next honest 100-photo batch still fits
    snap = await face_quota.snapshot(db, pid)
    assert snap["reserved"] == 0
    assert snap["remaining"] == 100


@pytest.mark.asyncio
async def test_case5_concurrent_reservations_cannot_oversell(wedding):
    """Two simultaneous 100-photo requests with 100 left -> exactly one wins."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)

    async def attempt():
        try:
            await face_quota.reserve(db, pid, 100)
            return "ok"
        except face_quota.QuotaExceeded:
            return "refused"

    results = await asyncio.gather(attempt(), attempt())
    assert sorted(results) == ["ok", "refused"], results

    snap = await face_quota.snapshot(db, pid)
    assert snap["reserved"] == 100
    assert snap["remaining"] == 0


@pytest.mark.asyncio
async def test_case5b_two_halves_both_fit(wedding):
    """Two concurrent 50s against 100 remaining -> both succeed, remainder 0.

    The lock must serialise, not reject: a mutex that failed closed would make
    every concurrent upload spuriously fail.
    """
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)

    async def attempt():
        try:
            await face_quota.reserve(db, pid, 50)
            return "ok"
        except face_quota.QuotaExceeded:
            return "refused"

    assert await asyncio.gather(attempt(), attempt()) == ["ok", "ok"]
    snap = await face_quota.snapshot(db, pid)
    assert snap["reserved"] == 100 and snap["remaining"] == 0


# --------------------------------------------------------------------------- #
# Lifecycle
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_commit_moves_hold_into_used_without_double_counting(wedding):
    """A committed photo appears in `used` and disappears from `reserved` — the
    two must not both count it, or the studio loses slots it paid for."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1000)
    res = await face_quota.reserve(db, pid, 10)
    rid = res["reservation_id"]
    assert res["reserved"] == 10 and res["remaining"] == 990

    # three photos land
    await seed_used(3)
    await face_quota.commit(db, rid, 3)

    snap = await face_quota.snapshot(db, pid)
    assert snap["used"] == 1003
    assert snap["reserved"] == 7
    assert snap["remaining"] == 990          # unchanged: hold shrank as used grew


@pytest.mark.asyncio
async def test_release_returns_the_unused_hold(wedding):
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)
    res = await face_quota.reserve(db, pid, 100)
    assert (await face_quota.snapshot(db, pid))["remaining"] == 0

    assert await face_quota.release(db, res["reservation_id"]) is True
    assert (await face_quota.snapshot(db, pid))["remaining"] == 100

    # releasing twice is a no-op, not an error
    assert await face_quota.release(db, res["reservation_id"]) is False


@pytest.mark.asyncio
async def test_commit_is_clamped_at_the_reserved_amount(wedding):
    """Over-committing must not drive `reserved` negative and hand out free
    slots — a duplicate worker delivery is the realistic way this happens."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1000)
    res = await face_quota.reserve(db, pid, 5)
    rid = res["reservation_id"]

    await face_quota.commit(db, rid, 5)
    assert await face_quota.commit(db, rid, 5) is False       # already full

    row = await face_quota.get(db, rid)
    assert row["committed_count"] == 5 and row["status"] == "committed"
    assert (await face_quota.snapshot(db, pid))["reserved"] == 0


@pytest.mark.asyncio
async def test_expired_hold_stops_blocking_immediately(wedding):
    """A dead browser tab must not park the quota until the sweeper runs."""
    import face_quota
    db, pid, seed_used = wedding
    await seed_used(1900)
    res = await face_quota.reserve(db, pid, 100)
    assert (await face_quota.snapshot(db, pid))["remaining"] == 0

    await db.face_quota_reservations.update_one(
        {"id": res["reservation_id"]},
        {"$set": {"expires_at": "2000-01-01T00:00:00+00:00"}})

    assert (await face_quota.snapshot(db, pid))["remaining"] == 100
    assert await face_quota.sweep_expired(db) >= 1
    row = await face_quota.get(db, res["reservation_id"])
    assert row["status"] == "expired"


@pytest.mark.asyncio
async def test_unlimited_wedding_is_never_blocked(wedding):
    """Legacy flat `ai_face_match` orders carry no face_photo_limit and must
    stay uncapped — the cap is a purchased SKU, not a default."""
    import face_quota
    db, pid, _ = wedding
    await db.invitation_orders.delete_many({"profile_id": pid})

    snap = await face_quota.snapshot(db, pid)
    assert snap["allocated"] is None and snap["unlimited"] is True

    res = await face_quota.reserve(db, pid, 4000)
    assert res["reservation_id"] is None          # nothing to hold
    assert await face_quota.commit(db, None, 1) is False


@pytest.mark.asyncio
async def test_extension_options_come_from_the_canonical_catalogue(wedding):
    """Top-up prices must be the owner-approved ones, never invented here."""
    import face_quota
    import pricing_catalog
    opts = face_quota.extension_options()
    assert opts["tiers"] == [
        {"key": t["key"], "photos": t["photos"], "price_inr": t["price_inr"]}
        for t in pricing_catalog.FACE_MATCH_TIERS]
    assert opts["custom_whatsapp"] is True
