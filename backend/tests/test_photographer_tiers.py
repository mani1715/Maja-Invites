"""The photographer loyalty tier ladder — what is still true about it.

Rewritten August 2026. The original file tested three things and could not run
at all, because it imported `pymongo` to seed an admin and this platform has
been Postgres-only for a long time.

What changed, and why the coverage here is smaller than it was:

  * The admin half — GET/PUT /api/super-admin/pricing/photographer-tiers — is
    RETIRED. That whole router answers 410 CREDITS_RETIRED at a router-level
    dependency, reads and writes alike, and `test_credits_retired.py` already
    asserts exactly that over HTTP. Re-testing it here would only duplicate it,
    so those cases are gone rather than "fixed" to expect a 410.

  * The photographer half — GET /api/photographer/me/tier — is LIVE, and is
    what this file now covers: the ladder resolves from `paid_links_count`, and
    the endpoint refuses anonymous callers.

  * `paid_links_count` HAS NO WRITER. The only thing that ever incremented it
    was the credit-priced publish path, which was deleted with credits. So in
    production every photographer sits on the first tier for ever. The
    resolution logic below is still correct and still worth a test — it is fed
    by admin-set config — but nothing should be built on top of this counter
    until something increments it again. See the note on `my_tier` in
    super_admin_pricing.py.
"""
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import requests

from tests.live import UA_HEADER, live_db, mint_admin_token, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)


# ---------- the public config the panel would read ----------
def test_public_pricing_photographer_includes_tiers():
    r = requests.get(
        f"{BASE_URL}/api/public/pricing/effective",
        params={"audience": "photographer"}, headers=UA, timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "photographer_tiers" in data
    pt = data["photographer_tiers"]
    assert isinstance(pt, dict) and isinstance(pt.get("tiers"), list)
    keys = {t["key"] for t in pt["tiers"]}
    for expected in ("starter", "pro", "elite", "partner"):
        assert expected in keys, f"missing tier {expected}: {keys}"
    # The ladder has to be monotonic or "next tier" is meaningless.
    thresholds = [t["min_paid_links"] for t in pt["tiers"]]
    assert thresholds == sorted(thresholds), f"tiers out of order: {thresholds}"


def test_me_tier_requires_auth():
    r = requests.get(f"{BASE_URL}/api/photographer/me/tier", headers=UA, timeout=20)
    assert r.status_code in (401, 403), f"anonymous caller got {r.status_code}"


# ---------- tier resolution ----------
@pytest.fixture(scope="module")
def seeded_admins():
    """Insert one throwaway admin per paid_links_count, through the app's own
    adapter, and delete them afterwards. Seeding by HTTP is not possible:
    nothing exposes a way to set `paid_links_count` (that is the finding in the
    module docstring), so the fixture has to write the row directly."""
    cases = [0, 1, 2, 4, 5, 9, 10, 50]
    created = {}

    # A pool binds to the event loop that created it, so seed and cleanup each
    # build and close their own — sharing one across two asyncio.run() calls
    # fails with "another operation is in progress" on the second.
    async def _seed():
        db = live_db()
        await db.ensure_connected()
        from auth import get_password_hash
        for paid in cases:
            admin_id = str(uuid.uuid4())
            await db.admins.insert_one({
                "id": admin_id,
                "email": f"tier-{admin_id}@maja.test",
                "password_hash": get_password_hash("dontcare"),
                "name": "Tier Test",
                "role": "admin",
                "status": "ACTIVE",
                "paid_links_count": paid,
                "phone_verified": True,
                "self_signup": False,
                # The real signup path sets this; a row without it used to
                # 500 GET /api/super-admin/admins for the whole platform
                # console (fixed there too, but a fixture should not write a
                # shape the product never writes).
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created[paid] = (admin_id, mint_admin_token(admin_id))
        await db.close()

    async def _cleanup():
        db = live_db()
        await db.ensure_connected()
        for admin_id, _ in created.values():
            await db.admins.delete_one({"id": admin_id})
        await db.close()

    asyncio.run(_seed())
    try:
        yield created
    finally:
        asyncio.run(_cleanup())


@pytest.mark.parametrize("paid,expected_key", [
    (0,  "starter"),
    (1,  "starter"),
    (2,  "pro"),
    (4,  "pro"),
    (5,  "elite"),
    (9,  "elite"),
    (10, "partner"),
    (50, "partner"),
])
def test_me_tier_resolves_correctly(seeded_admins, paid, expected_key):
    _, token = seeded_admins[paid]
    r = requests.get(f"{BASE_URL}/api/photographer/me/tier",
                     headers={**UA, "Authorization": f"Bearer {token}"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["paid_links_count"] == paid
    assert body["tier"]["key"] == expected_key, (
        f"{paid} paid links resolved to {body['tier']['key']}, expected {expected_key}")
    # "X links to the next tier" must agree with the ladder, or the panel would
    # promise a promotion that does not arrive.
    if body.get("next_tier"):
        assert body["links_to_next"] == body["next_tier"]["min_paid_links"] - paid
    else:
        assert body["links_to_next"] == 0
