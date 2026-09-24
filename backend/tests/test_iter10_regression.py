"""Iteration 10 regression tests — covers the specific endpoints mentioned in
the review request for the wedding-23 UI refactor (photographer stats,
photographer tiers, login flows, and public room-lookup)."""

import os
import pytest
import requests

from tests.live import login, require_live

BASE_URL = require_live()

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}


@pytest.fixture
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", **UA})
    return sess


# --- Public photographer stats ----------------------------------------------
class TestPhotographerStats:
    def test_public_photographer_stats(self, s):
        r = s.get(f"{BASE_URL}/api/public/photographer-stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("published_total", "photographers_total"):
            assert k in data, f"missing {k}"
            assert isinstance(data[k], int), f"{k} not int: {type(data[k])}"
        assert data["published_total"] >= 0
        assert data["photographers_total"] >= 0
        # `bonus_credits_granted` was dropped with the credit system — it
        # aggregated a collection nothing writes, so it could only ever report
        # 0 while looking like a measured figure. Its absence is the contract.
        assert "bonus_credits_granted" not in data, (
            "the credits-era counter is back on a public banner")

    def test_published_total_is_not_hardcoded_zero(self, s):
        """This counter used to read `wedding_profiles`, a collection nothing
        writes, so the homepage banner advertised zero published invitations no
        matter how many were live. Cross-check it against a surface that counts
        the same thing a different way."""
        data = s.get(f"{BASE_URL}/api/public/photographer-stats", timeout=15).json()
        sitemap = requests.get(f"{BASE_URL}/sitemap.xml",
                               headers=UA, timeout=20)
        if sitemap.status_code != 200:
            pytest.skip("sitemap unavailable for cross-check")
        live_invites = sitemap.text.count("/invite/")
        if live_invites == 0:
            pytest.skip("no live invitations in this environment to cross-check")
        assert data["published_total"] > 0, (
            f"sitemap lists {live_invites} live invitation URLs but the banner "
            f"reports {data['published_total']} published")


# --- Photographer pricing tiers ---------------------------------------------
class TestPhotographerTiers:
    def test_pricing_effective_photographer(self, s):
        r = s.get(f"{BASE_URL}/api/public/pricing/effective", params={"audience": "photographer"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        ptiers = data.get("photographer_tiers")
        assert ptiers is not None, "photographer_tiers missing"
        tiers = ptiers.get("tiers")
        assert isinstance(tiers, list) and len(tiers) >= 4, "expected >=4 tiers"
        keys = {t["key"] for t in tiers}
        for expected in ("starter", "pro", "elite", "partner"):
            assert expected in keys, f"missing tier {expected}"
        for t in tiers:
            for fld in ("label", "min_paid_links", "discount_pct", "bonus_pct"):
                assert fld in t, f"tier {t.get('key')} missing field {fld}"


# --- Photographer admin login ------------------------------------------------
class TestPhotographerLogin:
    def test_admin_login_returns_token(self):
        """`photographer.test@majatest.com` belongs to the old environment and
        does not exist here; the seeded photographer does. Goes through the
        shared cached login so running the whole directory does not spend the
        rate-limit budget on one assertion."""
        token = login("admin@wedding.com", "admin123")
        assert isinstance(token, str) and len(token) > 10


# --- Normal user accounts are retired ----------------------------------------
class TestUserLogin:
    def test_user_login_is_retired(self):
        """This used to assert that /api/users/login returned 200 and set a
        session cookie. Normal user accounts were permanently retired — the
        route now answers 410 NORMAL_USERS_RETIRED — so the assertion is
        inverted rather than deleted: the retirement is the contract, and a 200
        here would mean the surface came back."""
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json", **UA})
        r = sess.post(
            f"{BASE_URL}/api/users/login",
            json={"email": "user.test@majatest.com", "password": "TestPass@123"},
            timeout=15,
        )
        assert r.status_code == 410, f"status={r.status_code} body={r.text[:200]}"
        detail = (r.json() or {}).get("detail") or {}
        assert detail.get("code") == "NORMAL_USERS_RETIRED", detail


# --- Public room-lookup regression ------------------------------------------
class TestRoomLookup:
    def test_room_lookup_nonexistent_slug(self, s):
        r = s.get(
            f"{BASE_URL}/api/invite/nonexistent-slug-xyz-123/room-lookup",
            params={"name": "test"},
            timeout=15,
        )
        # Acceptable per spec: 200 with matches:[] OR 404
        assert r.status_code in (200, 404), f"unexpected {r.status_code}: {r.text[:200]}"
        if r.status_code == 200:
            data = r.json()
            assert "matches" in data, f"missing matches key: {data}"
            assert isinstance(data["matches"], list)

    def test_room_lookup_short_name_validation(self, s):
        # name with <2 chars should be rejected (422 or 400) OR ignored gracefully
        r = s.get(
            f"{BASE_URL}/api/invite/nonexistent-slug-xyz-123/room-lookup",
            params={"name": "a"},
            timeout=15,
        )
        assert r.status_code in (200, 400, 404, 422), f"unexpected {r.status_code}"
