"""Cross-tenant IDOR regression for the profile/event routes the 2026-08-20
ownership audit found un-gated: create_event, enable/expire/unexpire/
duplicate_profile, update_profile_plan. Each now routes its profile fetch
through check_profile_ownership (owner-or-super_admin), matching the established
sibling-route convention (update_event/delete_event already did).

Business rule enforced here: a photographer may operate their OWN weddings but
must never touch another photographer's — while photographer self-service on
their own profiles stays intact ("close the IDOR holes, keep self-service").

Live suite — hits the running backend. Owner A = the seeded dev photographer;
attacker B = a minted token for a different, unrelated admin id.
"""
from __future__ import annotations

import uuid

import pytest
import requests

from tests.live import (require_live, login, create_wedding, delete_wedding,
                        mint_admin_token, UA_HEADER)

BASE_URL = require_live()

OWNER_EMAIL = "admin@wedding.com"
OWNER_PASS = "admin123"


def _h(tok: str) -> dict:
    return {**UA_HEADER, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _event_body() -> dict:
    return {
        "event_type": "haldi", "name": "IDOR Haldi",
        "date": "2026-12-12", "start_time": "10:00",
        "venue_name": "V", "venue_address": "A",
        "map_link": "https://maps.example/x",
    }


@pytest.fixture(scope="module")
def victim():
    """Owner A's wedding — the target the attacker must NOT be able to touch."""
    tok_a = login(OWNER_EMAIL, OWNER_PASS)
    slug, pid = create_wedding(_h(tok_a))
    yield tok_a, pid
    delete_wedding(_h(tok_a), pid)


@pytest.fixture(scope="module")
def attacker() -> str:
    # A token the live server accepts, for an admin id that owns nothing.
    return mint_admin_token(f"idor_attacker_{uuid.uuid4().hex[:8]}", role="admin")


# ---- cross-tenant DENIED --------------------------------------------------
def test_attacker_cannot_enable_victim_profile(victim, attacker):
    _, pid = victim
    r = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}/enable",
                     headers=_h(attacker), timeout=15)
    assert r.status_code in (403, 404), r.text


def test_attacker_cannot_expire_victim_profile(victim, attacker):
    _, pid = victim
    r = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}/expire",
                     headers=_h(attacker), timeout=15)
    assert r.status_code in (403, 404), r.text


def test_attacker_cannot_unexpire_victim_profile(victim, attacker):
    _, pid = victim
    r = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}/unexpire",
                     headers=_h(attacker), timeout=15)
    assert r.status_code in (403, 404), r.text


def test_attacker_cannot_duplicate_victim_profile(victim, attacker):
    """The data-leak IDOR: duplicate returned the FULL victim profile body."""
    _, pid = victim
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/duplicate",
                      headers=_h(attacker), timeout=15)
    assert r.status_code in (403, 404), r.text
    # and it must not leak the victim's content in the denial response
    assert "TESTGroom" not in r.text and "TESTBride" not in r.text


def test_attacker_cannot_create_event_on_victim_profile(victim, attacker):
    _, pid = victim
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/events",
                      headers=_h(attacker), json=_event_body(), timeout=15)
    assert r.status_code in (403, 404), r.text


def test_attacker_cannot_change_victim_plan(victim, attacker):
    _, pid = victim
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/plan",
                      headers=_h(attacker), json={"plan_type": "GOLD"}, timeout=15)
    assert r.status_code in (403, 404), r.text


# ---- owner CONTROL: the fix must NOT break legitimate self-service --------
def test_owner_can_still_create_event_on_own_profile(victim):
    tok_a, pid = victim
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/events",
                      headers=_h(tok_a), json=_event_body(), timeout=15)
    assert r.status_code in (200, 201), r.text
