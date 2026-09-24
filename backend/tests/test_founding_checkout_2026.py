"""Founding prices must reach CHECKOUT, not just the marketing page.

Audit P1 (2026-08-18): founding_pricing's cards displayed the founding rate,
but subscription_service._quote never read durations_founding — a studio
signing up on an advertised "₹299/month founding" would have been charged the
regular ₹499. These tests cross-check the public card against the live /quote
total after driving the REAL super-admin founding flow, which no other test
did (founding_pricing's own tests exercise its math in isolation).

Also covers audit P2/P3 on the same admin endpoint: regular `durations` edits
must route through the base_monthly ladder (free-form per-cycle regular
prices are refused), and partial founding PATCHes merge instead of deleting
the unmentioned cycles.

Live suite: needs the local stack. Mutates founding settings + the Basic
plan's founding prices and RESTORES both (apply-catalogue + settings PATCH)
even on failure.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.live import require_live, login  # noqa: E402

BASE_URL = require_live()
UA = {"User-Agent": "Mozilla/5.0 (pytest live suite)"}


@pytest.fixture(scope="module")
def su_headers():
    tok = login("mani_8328@majacreations.com", "Maneesh@1234")
    return {**UA, "Authorization": f"Bearer {tok}"}


def _quote(product="portfolio", tier="Basic", cycle="monthly"):
    r = requests.post(f"{BASE_URL}/api/subscriptions/quote", headers=UA,
                      json={"product": product, "tier": tier, "cycle": cycle}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _public_basic():
    r = requests.get(f"{BASE_URL}/api/public/pricing/portfolio", headers=UA, timeout=15)
    assert r.status_code == 200, r.text
    return next(p for p in r.json()["plans"] if p["tier"] == "Basic")


def _patch_founding_settings(su, body):
    r = requests.patch(f"{BASE_URL}/api/super-admin/founding/settings",
                       headers=su, json=body, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _patch_basic(su, body):
    r = requests.patch(f"{BASE_URL}/api/super-admin/founding/portfolio/Basic",
                       headers=su, json=body, timeout=15)
    return r


@pytest.fixture()
def founding_reset(su_headers):
    """Whatever a test does, leave founding OFF and prices at catalog state."""
    yield
    requests.post(f"{BASE_URL}/api/super-admin/founding/apply-catalogue",
                  headers=su_headers, timeout=20)
    _patch_founding_settings(su_headers, {"founding_users_enabled": False})


class TestFoundingReachesCheckout:
    def test_card_price_equals_charged_price_in_founding_mode(self, su_headers, founding_reset):
        # Baseline: founding off, Basic monthly charges the regular 499.
        _patch_founding_settings(su_headers, {"founding_users_enabled": False})
        assert _quote()["total_paise"] == 49900

        # Owner flow: enable founding, set Basic founding monthly to 299.
        _patch_founding_settings(su_headers,
                                 {"founding_users_enabled": True,
                                  "founding_user_limit": 100})
        r = _patch_basic(su_headers, {"durations_founding": {"1": 299}})
        assert r.status_code == 200, r.text

        card = _public_basic()
        cell = card["cycles"]["1"]
        assert cell["effective_price"] == 299 and cell["strikethrough"] == 499

        q = _quote()
        # THE cross-check the audit found missing: display == charge.
        assert q["total_paise"] == 29900, q
        assert q["is_founding_price"] is True
        assert q["save_paise"] == 49900 - 29900
        # GST stays included, never added on top of the founding rate.
        assert q["gst_paise"] == q["total_paise"] - round(q["total_paise"] / 1.18)

    def test_unconfigured_founding_stays_regular_even_in_founding_mode(self, su_headers, founding_reset):
        _patch_founding_settings(su_headers,
                                 {"founding_users_enabled": True,
                                  "founding_user_limit": 100})
        # Premium was never given a founding rate (founding == regular).
        q = _quote(tier="Premium")
        assert q["total_paise"] == 199900
        assert q["is_founding_price"] is False

    def test_disabling_founding_restores_regular_charge(self, su_headers, founding_reset):
        _patch_founding_settings(su_headers,
                                 {"founding_users_enabled": True,
                                  "founding_user_limit": 100})
        _patch_basic(su_headers, {"durations_founding": {"1": 299}})
        assert _quote()["total_paise"] == 29900
        _patch_founding_settings(su_headers, {"founding_users_enabled": False})
        assert _quote()["total_paise"] == 49900


class TestFoundingAdminEndpointGuards:
    def test_regular_edit_routes_through_the_ladder(self, su_headers, founding_reset):
        # Free-form per-cycle regular prices are refused/overridden: an edit
        # anchors on cycle "1" and the 3/6/12 ladder derives from it.
        r = _patch_basic(su_headers, {"durations": {"1": 999, "3": 1}})
        assert r.status_code == 200, r.text
        card = _public_basic()
        # 999 x 3 x 0.95 = 2847.15 -> psych 2799; the client-sent "3": 1 must lose.
        assert card["cycles"]["3"]["final_inr"] == 2799
        assert _quote()["total_paise"] == 99900

    def test_regular_edit_without_monthly_anchor_is_rejected(self, su_headers, founding_reset):
        r = _patch_basic(su_headers, {"durations": {"3": 1299}})
        assert r.status_code == 404 or r.status_code == 400, r.text

    def test_partial_founding_patch_merges(self, su_headers, founding_reset):
        _patch_basic(su_headers, {"durations_founding": {"1": 299}})
        _patch_basic(su_headers, {"durations_founding": {"3": 799}})
        r = requests.get(f"{BASE_URL}/api/super-admin/founding/status",
                         headers=su_headers, timeout=15)
        assert r.status_code == 200, r.text
        basic = next(p for p in r.json()["plans"] if p["tier"] == "Basic")
        # Both survive — the second PATCH must not delete cycle "1".
        assert basic["cycles"]["1"]["founding_price"] == 299
        assert basic["cycles"]["3"]["founding_price"] == 799
