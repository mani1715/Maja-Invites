"""The platform console's account list survives a malformed row.

`GET /api/super-admin/admins` built its response with `created_at=admin['created_at']`,
a bare subscript. Any row without that key — a seed, an older account, a test
fixture — raised KeyError and 500'd the WHOLE request, so the super-admin's main
screen showed "Couldn't load the console. Internal server error" and listed
nothing. Found by loading /admin/dashboard as a super-admin, not by reading.

This is the same failure shape as the RSVP list (one unparseable row killing a
whole collection), so it is tested the same way: plant the bad row deliberately
and require the endpoint to keep serving everyone else.
"""
import asyncio
import uuid

import pytest
import requests

from tests.live import UA_HEADER, live_db, login, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)

SUPER = ("mani_8328@majacreations.com", "Maneesh@1234")
PHOTO = ("admin@wedding.com", "admin123")


@pytest.fixture(scope="module")
def super_headers():
    return {**UA, "Authorization": f"Bearer {login(*SUPER)}"}


def _admins(headers):
    return requests.get(f"{BASE_URL}/api/super-admin/admins", headers=headers, timeout=30)


def test_console_lists_admins(super_headers):
    r = _admins(super_headers)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert isinstance(body, list) and body, "the console lists no accounts at all"
    for a in body:
        assert a.get("id") and a.get("email"), f"account row missing identity: {a}"


def test_requires_super_admin():
    photog = {**UA, "Authorization": f"Bearer {login(*PHOTO)}"}
    assert _admins(photog).status_code in (401, 403)
    assert _admins(UA).status_code in (401, 403)


def test_a_row_without_created_at_does_not_take_the_list_down(super_headers):
    before = _admins(super_headers)
    assert before.status_code == 200
    baseline = len(before.json())

    bad_id = str(uuid.uuid4())

    async def _seed():
        db = live_db()
        await db.ensure_connected()
        # Deliberately no `created_at` — exactly the shape that used to 500.
        await db.admins.insert_one({
            "id": bad_id,
            "email": f"norow-{bad_id}@maja.test",
            "name": "No Created At",
            "role": "admin",
            "status": "ACTIVE",
        })
        await db.close()

    async def _cleanup():
        db = live_db()
        await db.ensure_connected()
        await db.admins.delete_one({"id": bad_id})
        await db.close()

    asyncio.run(_seed())
    try:
        after = _admins(super_headers)
        assert after.status_code == 200, (
            f"one row without created_at 500'd the whole console: "
            f"{after.status_code} {after.text[:200]}")
        rows = after.json()
        assert len(rows) >= baseline, (
            f"accounts disappeared from the console: {baseline} -> {len(rows)}")
    finally:
        asyncio.run(_cleanup())
