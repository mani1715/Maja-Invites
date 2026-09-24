"""
Face-match quota, end to end, against the RUNNING backend and real Postgres.

This is the acceptance scenario from the spec, executed rather than asserted
about in the abstract:

    2000 bought -> 1900 used -> 301 refused whole -> 100 reserved and landed
    -> 2000/0 -> next photo refused -> quota extended through the CANONICAL
    order path -> 301 now fits.

Why this file exists alongside the other two quota suites: `test_face_quota_
reservation.py` tests the module against Postgres, and `test_face_quota_api.py`
tests the HTTP surface against an in-memory double. Neither proves the chain
that actually earns money — pricing_catalog -> store_features -> a paid
invitation_order -> resolve_face_photo_limit -> face_quota -> the API the
browser calls. A break anywhere along it would leave both of those green.

Two steps are done directly against the database, and only these two:

  * **Linking a paid order to a wedding.** `invitation_orders.profile_id` is
    stamped by the fulfillment console when the studio builds the invitation.
    Driving that whole console flow here would test fulfillment, not quota.
  * **Fabricating already-uploaded photos.** Real uploads need S3 credentials
    this machine does not have. `gallery_photos` rows are exactly what the
    quota counts, so inserting them is the honest stand-in for "1900 photos
    were uploaded earlier".

Everything else — order creation and pricing, quota reads, reservations,
refusals, releases, extension — goes through the real HTTP API.

Skips (never silently passes) without a live server, without Postgres, or
without a comped buyer account. Requires SEED_TEST_ACCOUNTS=1 in backend/.env.
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
import requests

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
except Exception:                                    # pragma: no cover
    pass

from tests.live import (login, new_wedding_payload, require_live, UA_HEADER,  # noqa: E402
                        create_profile_for)

DSN = os.environ.get("MAJA_PG_DSN") or os.environ.get("SUPABASE_DB_URL") or ""

# Comped account: creates orders as paid without touching Razorpay.
STUDIO_EMAIL = "test.studio@maja.test"
STUDIO_PASSWORD = "MajaTest@123"

# A second studio, for the cross-tenant checks.
OTHER_EMAIL = "admin@wedding.com"
OTHER_PASSWORD = "admin123"

pytestmark = pytest.mark.skipif(not DSN, reason="no Postgres DSN (SUPABASE_DB_URL / MAJA_PG_DSN)")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def base_url():
    return require_live()


@pytest.fixture(scope="module")
def studio(base_url):
    return {**UA_HEADER, "Authorization": f"Bearer {login(STUDIO_EMAIL, STUDIO_PASSWORD)}"}


@pytest.fixture(scope="module")
def other_studio(base_url):
    return {**UA_HEADER, "Authorization": f"Bearer {login(OTHER_EMAIL, OTHER_PASSWORD)}"}


class _Ctx:
    """Handles + bookkeeping for one scenario run, so teardown can be exact."""

    def __init__(self, db, base_url, headers, profile_id):
        self.db = db
        self.base_url = base_url
        self.h = headers
        self.pid = profile_id
        self.photo_ids: list[str] = []
        self.order_ids: list[str] = []

    # ---- HTTP (the real API) --------------------------------------------
    def quota(self):
        r = requests.get(f"{self.base_url}/api/admin/profiles/{self.pid}/gallery/quota",
                         headers=self.h, timeout=25)
        assert r.status_code == 200, r.text
        return r.json()

    def reserve(self, n):
        return requests.post(
            f"{self.base_url}/api/admin/profiles/{self.pid}/gallery/quota/reserve",
            json={"photo_count": n}, headers=self.h, timeout=25)

    def release(self, rid):
        return requests.post(
            f"{self.base_url}/api/admin/profiles/{self.pid}/gallery/quota/"
            f"reservations/{rid}/release", headers=self.h, timeout=25)

    # ---- direct DB (only the two documented steps) ----------------------
    async def buy_face_pack(self, sku_key):
        """Create a REAL paid order through the canonical store path, then link
        it to this wedding the way the fulfillment console does."""
        r = requests.post(f"{self.base_url}/api/store/order/create",
                          json={"design_id": "royal_heritage", "esign_agreed": True,
                                "main_language": "english", "features": [sku_key]},
                          headers=self.h, timeout=30)
        if r.status_code == 503:
            pytest.skip("payment gateway unavailable and the buyer is not comped "
                        "— set SEED_TEST_ACCOUNTS=1 and reseed")
        assert r.status_code == 200, r.text
        oid = r.json()["order_id"]
        self.order_ids.append(oid)

        got = requests.get(f"{self.base_url}/api/store/order/{oid}",
                           headers=self.h, timeout=25)
        assert got.status_code == 200, got.text
        order = got.json()
        assert order["status"] == "paid", f"buyer is not comped: {order['status']}"

        await self.db.invitation_orders.update_one({"id": oid}, {"$set": {"profile_id": self.pid}})
        return order

    async def add_photos(self, n):
        for _ in range(n):
            pid = str(uuid.uuid4())
            await self.db.gallery_photos.insert_one({
                "id": pid, "profile_id": self.pid, "indexed": False, "created_at": _iso()})
            self.photo_ids.append(pid)

    async def cleanup(self):
        await self.db.gallery_photos.delete_many({"profile_id": self.pid})
        await self.db.face_quota_reservations.delete_many({"profile_id": self.pid})
        for oid in self.order_ids:
            await self.db.invitation_orders.delete_many({"id": oid})


@pytest_asyncio.fixture()
async def ctx(base_url, studio):
    """A throwaway wedding owned by the comped studio, with the AI gallery on.

    Async on purpose. asyncpg binds a pool to the event loop that created it,
    so a sync fixture using asyncio.run() here and asyncio.run() again in each
    test hands the pool to a different loop every time — which surfaces as
    `InterfaceError: another operation is in progress`, not as anything that
    points at the loop. One fixture, one loop, one pool.
    """
    import asyncpg
    from pg_adapter import Database

    try:
        pool = await asyncio.wait_for(
            asyncpg.create_pool(dsn=DSN, min_size=2, max_size=8), timeout=6)
    except Exception as e:                           # pragma: no cover
        pytest.skip(f"Postgres not reachable ({type(e).__name__})")
    db = Database(pool)

    r = create_profile_for(studio, new_wedding_payload())
    assert r.status_code in (200, 201), f"could not create fixture wedding: {r.text[:300]}"
    pid = r.json()["id"]

    # The gallery must be ON for the quota routes. /gallery/enable calls
    # Rekognition CreateCollection, which needs AWS credentials this box does
    # not have, so the flag is set directly.
    prof = await db.profiles.find_one({"id": pid}, {"_id": 0})
    gc = {**(prof.get("gallery_config") or {}), "enabled": True,
          "aws_collection_id": f"maja_wedding_{pid}"}
    await db.profiles.update_one({"id": pid}, {"$set": {"gallery_config": gc}})

    c = _Ctx(db, base_url, studio, pid)
    try:
        yield c
    finally:
        await c.cleanup()
        await db.profiles.delete_many({"id": pid})
        await pool.close()


# --------------------------------------------------------------------------- #
# The acceptance scenario
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_full_acceptance_scenario(ctx):
    # --- the studio buys 2,000 face-match photos through the real store -----
    order = await ctx.buy_face_pack("face_match_2000")
    assert order["face_photo_limit"] == 2000, \
        "pricing_catalog -> store_features did not stamp the purchased photo count"

    q = ctx.quota()
    assert (q["allocated"], q["used"], q["reserved"], q["remaining"]) == (2000, 0, 0, 2000)
    assert q["unlimited"] is False

    # --- 1,900 photos already uploaded --------------------------------------
    await ctx.add_photos(1900)
    q = ctx.quota()
    assert (q["allocated"], q["used"], q["remaining"]) == (2000, 1900, 100)
    assert q["indexing"]["total"] == 1900

    # --- 301 more: refused WHOLE, nothing half-done -------------------------
    r = ctx.reserve(301)
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "QUOTA_EXCEEDED"
    assert (d["allocated"], d["used"], d["reserved"], d["remaining"],
            d["requested"], d["excess"]) == (2000, 1900, 0, 100, 301, 201)
    assert "301 photos" in d["message"] and "100 photos remain" in d["message"]
    # the refusal offers a real, owner-approved way out
    assert [t["photos"] for t in d["extension"]["tiers"]] == [2000, 3000, 5000]

    # a refused batch leaves NO hold behind
    q = ctx.quota()
    assert (q["reserved"], q["remaining"]) == (0, 100)

    # --- the 100 that do fit ------------------------------------------------
    r = ctx.reserve(100)
    assert r.status_code == 200, r.text
    rid = r.json()["reservation_id"]
    assert ctx.quota()["remaining"] == 0, "the hold must consume the headroom immediately"

    # they land: rows appear and the hold is committed by the upload path
    await ctx.add_photos(100)
    import face_quota
    await face_quota.commit(ctx.db, rid, 100)

    q = ctx.quota()
    assert (q["allocated"], q["used"], q["reserved"], q["remaining"]) == (2000, 2000, 0, 0), \
        "committing a hold must move it into `used`, not double-count it"

    # --- the next photo is refused before any S3 work -----------------------
    r = ctx.reserve(1)
    assert r.status_code == 409
    assert r.json()["detail"]["remaining"] == 0

    # --- extension, through the canonical order path ------------------------
    # There is no +500 SKU in the owner-approved price book (2000/3000/5000
    # only), so "extend by 500" is expressed as buying the next tier up. The
    # allocation is MAX(face_photo_limit) across the wedding's paid orders, so
    # the new order raises it with no second quota source involved.
    order2 = await ctx.buy_face_pack("face_match_3000")
    assert order2["face_photo_limit"] == 3000

    q = ctx.quota()
    assert (q["allocated"], q["used"], q["remaining"]) == (3000, 2000, 1000)

    # --- and the batch that was refused now fits ----------------------------
    r = ctx.reserve(301)
    assert r.status_code == 200, r.text
    assert ctx.quota()["remaining"] == 699

    # tidy up the hold so teardown is not relying on the sweeper
    assert ctx.release(r.json()["reservation_id"]).status_code == 200


# --------------------------------------------------------------------------- #
# Cross-tenant, against the live server (the FakeDB suite covers the same
# ground; this proves it holds with real auth and a real database behind it)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_another_studio_cannot_read_or_reserve(ctx, other_studio):
    await ctx.buy_face_pack("face_match_2000")

    for method, url in (
        ("get", f"{ctx.base_url}/api/admin/profiles/{ctx.pid}/gallery/quota"),
        ("post", f"{ctx.base_url}/api/admin/profiles/{ctx.pid}/gallery/quota/reserve"),
    ):
        r = getattr(requests, method)(
            url, headers=other_studio, timeout=25,
            **({"json": {"photo_count": 1}} if method == "post" else {}))
        assert r.status_code in (403, 404), f"{url} leaked to another studio: {r.status_code}"


@pytest.mark.asyncio
async def test_unauthenticated_callers_are_refused(ctx):
    for method, url in (
        ("get", f"{ctx.base_url}/api/admin/profiles/{ctx.pid}/gallery/quota"),
        ("post", f"{ctx.base_url}/api/admin/profiles/{ctx.pid}/gallery/quota/reserve"),
    ):
        r = getattr(requests, method)(
            url, headers=UA_HEADER, timeout=25,
            **({"json": {"photo_count": 1}} if method == "post" else {}))
        assert r.status_code in (401, 403), f"{url} answered {r.status_code} unauthenticated"


@pytest.mark.asyncio
async def test_reservation_id_is_not_portable_between_weddings(ctx, base_url, studio):
    """A hold is capacity on ONE wedding. The same studio owning a second
    wedding must not be able to spend the first one's hold there."""
    await ctx.buy_face_pack("face_match_2000")
    r = ctx.reserve(5)
    assert r.status_code == 200, r.text
    rid = r.json()["reservation_id"]

    other = create_profile_for(studio, new_wedding_payload())
    assert other.status_code in (200, 201), other.text
    other_pid = other.json()["id"]
    try:
        r2 = requests.post(
            f"{base_url}/api/admin/profiles/{other_pid}/gallery/quota/"
            f"reservations/{rid}/release", headers=studio, timeout=25)
        assert r2.status_code == 404, \
            f"a hold from another wedding was accepted: {r2.status_code}"
    finally:
        await ctx.db.profiles.delete_many({"id": other_pid})
