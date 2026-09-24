"""Phase 1 regression — event/wedding SINGLE SOURCE OF TRUTH.

Root cause (2026-08-21 audit): the admin "Events" page read the Dynamic Event
Engine collection (db.events, via event_admin_service.py) while BOTH the
create-&-assign panel and the photographer dashboard read wedding profiles
(db.profiles). Two collections, one word — so an admin-created wedding appeared
on the assigned photographer's dashboard but NEVER in the admin Events list
(the "Total = 0 / no current event" symptom in the screenshot).

The canonical source for an "event" is the wedding profile. The admin surface
must read /api/admin/profiles/paginated (which returns ALL profiles for a
super-admin) — the same db.profiles the owner's /api/studio/my-weddings reads.

These tests pin the invariant at the API level so a future re-point to the
wrong collection fails HERE, not in production:

    a wedding W owned by photographer Y  =>
      * W in Y's /api/studio/my-weddings                (owner sees it)
      * W in super-admin /api/admin/profiles/paginated  (admin sees it)
      * SAME canonical id in both
      * W NOT in another photographer's /api/studio/my-weddings
      * survives a re-fetch (no dependence on frontend state)

    plus the exact admin flow: admin creates W' via ?on_behalf_of=Y and Y sees
    it immediately, same id, both surfaces.

Live suite — hits the running backend. Owner Y = the seeded dev photographer;
the "other" photographer = a minted token for an unrelated admin id that owns
nothing. Tests needing the super-admin skip cleanly when its login is
unavailable on this environment (they never fake a pass).
"""
from __future__ import annotations

import uuid

import pytest
import requests

from tests.live import (require_live, login, create_wedding, delete_wedding,
                        mint_admin_token, new_wedding_payload, UA_HEADER)

BASE_URL = require_live()

OWNER_EMAIL = "admin@wedding.com"        # seeded dev photographer (role: admin)
OWNER_PASS = "admin123"
SUPER_EMAIL = "mani_8328@majacreations.com"
SUPER_PASS = "Maneesh@1234"


def _h(tok: str) -> dict:
    return {**UA_HEADER, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _my_weddings(tok: str) -> list:
    r = requests.get(f"{BASE_URL}/api/studio/my-weddings", headers=_h(tok), timeout=15)
    assert r.status_code == 200, f"my-weddings: {r.status_code} {r.text[:200]}"
    return r.json().get("weddings", [])


def _admin_search(super_tok: str, q: str) -> list:
    """The admin canonical list — a super-admin sees every profile."""
    r = requests.get(f"{BASE_URL}/api/admin/profiles/paginated",
                     params={"q": q, "status": "all", "page_size": 100},
                     headers=_h(super_tok), timeout=15)
    assert r.status_code == 200, f"paginated: {r.status_code} {r.text[:200]}"
    return r.json().get("items", [])


# ---- fixtures -------------------------------------------------------------
@pytest.fixture(scope="module")
def owner():
    """Photographer Y and one wedding W they own. Returns (token, pid, groom)."""
    tok = login(OWNER_EMAIL, OWNER_PASS)
    groom = f"TESTGroom{uuid.uuid4().hex[:6]}"
    slug, pid = create_wedding(_h(tok), groom_name=groom)
    yield tok, pid, groom
    delete_wedding(_h(tok), pid)


@pytest.fixture(scope="module")
def other() -> str:
    """A valid admin token for a different photographer who owns nothing."""
    return mint_admin_token(f"other_pg_{uuid.uuid4().hex[:8]}", role="admin")


@pytest.fixture(scope="module")
def super_token() -> str:
    try:
        return login(SUPER_EMAIL, SUPER_PASS)
    except AssertionError as exc:                       # bad creds on this env
        pytest.skip(f"super-admin login unavailable here: {str(exc)[:120]}")


@pytest.fixture(scope="module")
def owner_admin_id(super_token) -> str:
    """Photographer Y's real admin id, needed for the ?on_behalf_of= flow."""
    r = requests.get(f"{BASE_URL}/api/super-admin/admins",
                     headers=_h(super_token), timeout=15)
    if r.status_code != 200:
        pytest.skip(f"cannot list admins ({r.status_code}); no id for on_behalf_of")
    admins = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for a in admins:
        if (a.get("email") or "").lower() == OWNER_EMAIL:
            return a["id"]
    pytest.skip(f"{OWNER_EMAIL} not in admin list; cannot resolve owner id")


# ---- the invariant --------------------------------------------------------
def test_owner_created_wedding_appears_in_owner_dashboard(owner):
    tok, pid, _ = owner
    ids = [w.get("id") for w in _my_weddings(tok)]
    assert pid in ids, "wedding the owner just created is missing from their own dashboard"


def test_owner_created_wedding_visible_to_admin(owner, super_token):
    """The bug: this list came back empty because the admin read db.events."""
    _, pid, groom = owner
    ids = [it.get("id") for it in _admin_search(super_token, groom)]
    assert pid in ids, (
        "admin canonical list does NOT contain the owner's wedding — the admin "
        "surface is reading a different collection than the photographer does"
    )


def test_admin_and_owner_agree_on_canonical_id(owner, super_token):
    _, pid, groom = owner
    owner_ids = {w.get("id") for w in _my_weddings(owner[0])}
    admin_ids = {it.get("id") for it in _admin_search(super_token, groom)}
    assert pid in owner_ids and pid in admin_ids, "id missing on one surface"
    # the intersection on this wedding proves both point at the same record
    assert pid in (owner_ids & admin_ids), "admin and owner disagree on the canonical id"


def test_other_photographer_cannot_see_it(owner, other):
    _, pid, _ = owner
    ids = [w.get("id") for w in _my_weddings(other)]
    assert pid not in ids, "another photographer can see a wedding they do not own"


def test_survives_refetch(owner):
    """Consistency must not depend on frontend state — refetch is identical."""
    tok, pid, _ = owner
    first = {w.get("id") for w in _my_weddings(tok)}
    second = {w.get("id") for w in _my_weddings(tok)}
    assert pid in first and pid in second, "wedding vanished across a plain refetch"


# ---- Phase 2 authz: only the MAJA team may create -------------------------
def test_photographer_cannot_create_event_directly(owner):
    """A photographer's DIRECT POST /api/admin/profiles is refused (403) — the
    guard is at the API, not just a hidden studio button — even though the same
    photographer legitimately OWNS events assigned to them."""
    tok, _, _ = owner
    r = requests.post(f"{BASE_URL}/api/admin/profiles",
                      json=new_wedding_payload(),
                      headers=_h(tok), timeout=15)
    assert r.status_code == 403, \
        f"photographer direct-create must be 403, got {r.status_code} {r.text[:200]}"


def test_photographer_cannot_assign_to_another_photographer(owner, other):
    """?on_behalf_of is a super-admin lever; a photographer cannot use it to
    plant an event on anyone (self or another studio)."""
    tok, _, _ = owner
    # decode nothing — just prove the endpoint refuses a non-super caller with
    # on_behalf_of set, regardless of the target
    r = requests.post(f"{BASE_URL}/api/admin/profiles",
                      params={"on_behalf_of": f"someone_else_{uuid.uuid4().hex[:6]}"},
                      json=new_wedding_payload(),
                      headers=_h(tok), timeout=15)
    assert r.status_code == 403, \
        f"photographer using on_behalf_of must be 403, got {r.status_code} {r.text[:200]}"


# ---- the exact admin-creates-and-assigns flow -----------------------------
def test_admin_created_assigned_wedding_reaches_photographer(super_token, owner_admin_id):
    """Admin creates W' via ?on_behalf_of=Y; Y sees it immediately, same id,
    on both the owner surface and the admin surface."""
    groom = f"TESTAssigned{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/admin/profiles",
                      params={"on_behalf_of": owner_admin_id},
                      json=new_wedding_payload(groom_name=groom),
                      headers=_h(super_token), timeout=30)
    assert r.status_code in (200, 201), f"admin create+assign failed: {r.status_code} {r.text[:200]}"
    pid = r.json()["id"]
    try:
        owner_tok = login(OWNER_EMAIL, OWNER_PASS)
        owner_ids = [w.get("id") for w in _my_weddings(owner_tok)]
        admin_ids = [it.get("id") for it in _admin_search(super_token, groom)]
        assert pid in owner_ids, "assigned photographer does not see the admin-created wedding"
        assert pid in admin_ids, "admin does not see the wedding it just created"
    finally:
        delete_wedding(_h(super_token), pid)
