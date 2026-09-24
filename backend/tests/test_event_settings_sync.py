"""Phase 11 — event settings stay consistent across the admin and the assigned
photographer (ONE canonical record, no per-surface copy, no frontend state).

  * admin changes a setting on an assigned event -> photographer sees it on a
    plain refetch;
  * photographer changes an allowed setting -> admin sees it;

Both surfaces read the same db.profiles record, so the value is identical.

Live suite. Owner A = seeded dev photographer; the wedding is created via the
admin "assign" flow (create_wedding -> super + on_behalf_of=A), so A owns it.
Super-admin login is required (skips cleanly if unavailable here)."""
from __future__ import annotations

import uuid

import pytest
import requests

from tests.live import require_live, login, create_wedding, delete_wedding, UA_HEADER

BASE_URL = require_live()
OWNER_EMAIL, OWNER_PASS = "admin@wedding.com", "admin123"
SUPER_EMAIL, SUPER_PASS = "mani_8328@majacreations.com", "Maneesh@1234"


def _jh(tok):
    return {**UA_HEADER, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner():
    tok = login(OWNER_EMAIL, OWNER_PASS)
    slug, pid = create_wedding(_jh(tok))
    yield tok, pid
    delete_wedding(_jh(tok), pid)


@pytest.fixture(scope="module")
def super_token():
    try:
        return login(SUPER_EMAIL, SUPER_PASS)
    except AssertionError as exc:
        pytest.skip(f"super-admin login unavailable here: {str(exc)[:120]}")


def _photographer_sees_venue(tok, pid):
    r = requests.get(f"{BASE_URL}/api/studio/wedding/{pid}", headers=_jh(tok), timeout=15)
    assert r.status_code == 200, r.text
    return (r.json().get("details") or {}).get("venue")


def _admin_sees_city(super_tok, pid):
    r = requests.get(f"{BASE_URL}/api/admin/profiles/{pid}", headers=_jh(super_tok), timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("city")


def test_admin_change_reaches_photographer(owner, super_token):
    tok, pid = owner
    new_venue = f"Admin Set Venue {uuid.uuid4().hex[:6]}"
    r = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}", json={"venue": new_venue},
                     headers=_jh(super_token), timeout=20)
    assert r.status_code == 200, f"admin update failed: {r.status_code} {r.text[:200]}"
    # plain refetch on the photographer surface — no frontend state involved
    assert _photographer_sees_venue(tok, pid) == new_venue


def test_photographer_change_reaches_admin(owner, super_token):
    tok, pid = owner
    new_city = f"PGCity{uuid.uuid4().hex[:6]}"
    r = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}", json={"city": new_city},
                     headers=_jh(tok), timeout=20)
    assert r.status_code == 200, f"photographer update failed: {r.status_code} {r.text[:200]}"
    assert _admin_sees_city(super_token, pid) == new_city
