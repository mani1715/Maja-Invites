"""Meal-time round-trips, publish title derivation, and the dashboard indexes.

Ported August 2026 from a Mongo-era file that could not be collected at all: it
imported `motor` and asserted `index_information()` on a MongoDB that has not
existed here for a long time.

What each part became:

  * The two index tests are the reason this file was worth porting rather than
    deleting. They guarded the seven composite `profiles` indexes behind the
    studio dashboard, and while they were dead those indexes silently stopped
    existing — `pg_adapter.create_index` was a no-op that returned None and
    logged "ready". They now assert against `pg_indexes`, so the same claim is
    checked against the store the platform actually uses.

  * The paginated-list and quick-stats shape checks moved out; they duplicate
    test_admin_dashboard_v2.py, which covers them in more depth.

  * The end-to-end pricing probe is gone. It asserted a credits-denominated
    price through /api/super-admin/pricing/*, a surface that is retired and
    answers 410 (see test_credits_retired.py).

  * Seeding no longer reaches into the database to set `selected_design_key`;
    the assertion is about title derivation, which does not need it.
"""
import asyncio
import datetime as _dt
import uuid

import pytest
import requests

from tests.live import UA_HEADER, create_wedding, delete_wedding, live_db, login, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)

SUPER_ADMIN_EMAIL = "mani_8328@majacreations.com"
SUPER_ADMIN_PASSWORD = "Maneesh@1234"


@pytest.fixture(scope="module")
def super_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", **UA,
                      "Authorization": f"Bearer {login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)}"})
    return s


def _created_ids(session):
    """Track what a test creates so it can clean up after itself."""
    return {"Authorization": session.headers["Authorization"],
            "Content-Type": "application/json"}


# ---------------- indexes ----------------
def _indexes(table: str) -> dict:
    async def _run():
        db = live_db()
        await db.ensure_connected()
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT indexname, indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = $1", table)
        await db.close()
        return {r["indexname"]: r["indexdef"] for r in rows}
    return asyncio.run(_run())


def test_dashboard_indexes_on_profiles():
    """The studio dashboard pages `profiles` by admin_id and sorts by
    created_at. Without these the query degrades to a sequential scan plus a
    sort on every page, which is the slowdown the bootstrap in server.py was
    written to fix."""
    idxs = _indexes("profiles")
    expected = {
        "profiles_admin_created_desc",
        "profiles_admin_status_created",
        "profiles_admin_deleted",
        "profiles_admin_archived",
        "profiles_admin_event_date",
        "profiles_slug",
        "profiles_uuid",
    }
    missing = expected - set(idxs)
    assert not missing, (
        f"missing profiles indexes: {sorted(missing)}; have: {sorted(idxs)}. "
        f"They are created at startup by _ensure_dashboard_indexes — if they "
        f"are absent, create_index went back to being a no-op.")
    # The two sparse ones must be PARTIAL, or they cover the whole table and
    # cost write throughput for nothing.
    for name in ("profiles_admin_deleted", "profiles_admin_archived"):
        assert "WHERE" in idxs[name], f"{name} is not a partial index: {idxs[name]}"


def test_supplementary_indexes():
    assert "rsvps_profile_id" in _indexes("rsvps")
    # Guest wishes live in `guest_wishes`. The bootstrap used to index a
    # `wishes` collection that nothing reads or writes.
    gw = _indexes("guest_wishes")
    assert "guest_wishes_profile_status" in gw, sorted(gw)


# ---------------- meal_time ----------------
# The two meal_time round-trip tests are GONE rather than ported, because the
# contract they asserted no longer exists:
#
#   * `theme_settings.maja.meal_time` — `theme_settings` is now a typed
#     `ThemeSettings` model (theme_id / animation_level / glassmorphism /
#     color_overrides / hero_type). There is no `maja` sub-object to hang a
#     meal time on, and `ProfileUpdate` does not carry `theme_settings` at all,
#     so the PUT accepts the key and ignores it.
#   * `celebrant_info.meal_time` — same story on the celebration side.
#
# Across the whole backend `meal_time` survives in exactly one place:
# order_to_invitation.py copies an order's "meal" note into a celebration
# payload. Nothing reads it back, no model declares it, and frontend-v2 never
# mentions it. Writing a test that made it round-trip would mean building the
# feature, not testing it.

# ---------------- publish readiness ----------------
def test_publish_auto_derives_title(super_client):
    """A wedding created without a title must not be blocked from publishing on
    that basis — the title is derived from the two names."""
    headers = _created_ids(super_client)
    groom, bride = f"TESTG{uuid.uuid4().hex[:6]}", f"TESTB{uuid.uuid4().hex[:6]}"
    slug, pid = create_wedding(headers, groom_name=groom, bride_name=bride)
    try:
        pub = super_client.post(f"{BASE_URL}/api/weddings/{pid}/publish", timeout=30)
        assert pub.status_code in (200, 400), pub.text[:400]
        if pub.status_code == 400:
            detail = str((pub.json() or {}).get("detail", ""))
            assert "title" not in detail.lower(), (
                f"publish-readiness still blocking on a missing title: {detail}")

        # Read the title back from the paginated listing, not from
        # GET /admin/profiles/{id}: `ProfileResponse` declares 63 fields and
        # `title` is not one of them, so the single-profile endpoint always
        # answers null for it. The listing is where the dashboard reads it, and
        # is what the derivation in wedding_lifecycle_service exists to fill.
        lst = super_client.get(
            f"{BASE_URL}/api/admin/profiles/paginated?page=1&page_size=50&status=all",
            timeout=30)
        assert lst.status_code == 200, lst.text[:300]
        row = next((i for i in lst.json().get("items", []) if i.get("id") == pid), None)
        assert row is not None, "the wedding just created is not in the listing"
        assert row.get("title") == f"{groom} & {bride}", (
            f"title not auto-derived: got {row.get('title')!r}")
    finally:
        delete_wedding(headers, pid)
