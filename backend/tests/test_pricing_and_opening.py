"""
Tests for:
  - Public pricing endpoint /api/public/pricing/effective (audience-aware)
  - Profile opening_* fields (opening_photo_url, opening_bg_source,
    use_couple_photo_as_opening_bg) round-trip via admin PUT
  - InvitationPublicView /api/invite/{slug} includes the new opening_* fields
"""

import os
import pytest
import requests

from tests.live import create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()

ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_client(api, admin_token):
    api.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api


@pytest.fixture(scope="module")
def wedding(admin_token):
    """A throwaway invitation this module owns. The hardcoded DEMO_PROFILE_ID
    came from the old environment and 404s here, so the opening_* round-trip
    tests failed on "Profile not found" rather than on anything they test."""
    headers = {"Authorization": f"Bearer {admin_token}",
               "Content-Type": "application/json"}
    slug, pid = create_wedding(headers)
    try:
        yield slug, pid
    finally:
        delete_wedding(headers, pid)


@pytest.fixture(scope="module")
def demo_profile_id(wedding):
    return wedding[1]


@pytest.fixture(scope="module")
def demo_slug(wedding):
    return wedding[0]


# ---------- /api/public/pricing/effective ----------
class TestPublicPricing:
    """Audience-aware effective-pricing endpoint"""

    def test_pricing_photographer_shape(self, api):
        r = requests.get(
            f"{BASE_URL}/api/public/pricing/effective",
            params={"audience": "photographer"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Mandatory keys
        for k in ("themes", "designs", "options", "packs", "plans", "post_sub"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["themes"], dict)
        assert isinstance(data["designs"], dict)
        assert isinstance(data["options"], dict)
        assert isinstance(data["packs"], list)
        assert isinstance(data["plans"], list)
        # post_sub can be null or dict
        assert data["post_sub"] is None or isinstance(data["post_sub"], dict)
        # Plans must be the monthly subscription plans w/ price + credits_per_month
        for p in data["plans"]:
            assert "price" in p
            assert "credits_per_month" in p
        # Options have credits + is_free
        for k, v in data["options"].items():
            assert "credits" in v, f"option {k} missing credits"
            assert "is_free" in v, f"option {k} missing is_free"

    def test_pricing_normal_user_has_no_plans(self, api):
        r = requests.get(
            f"{BASE_URL}/api/public/pricing/effective",
            params={"audience": "normal_user"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plans"] == [], "normal_user should have empty plans"
        assert data["post_sub"] is None, "normal_user should have no post_sub"
        assert isinstance(data["themes"], dict)
        assert isinstance(data["options"], dict)
        assert isinstance(data["packs"], list)


# ---------- Profile opening_* fields ----------
class TestProfileOpeningFields:
    """Round-trip opening_photo_url / opening_bg_source / use_couple_photo_as_opening_bg"""

    def test_admin_get_profile_returns_opening_fields(self, admin_client, demo_profile_id):
        r = admin_client.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in (
            "opening_photo_url",
            "opening_bg_source",
            "use_couple_photo_as_opening_bg",
        ):
            assert k in data, f"profile missing {k} (got keys: {list(data.keys())[:30]})"

    def test_admin_put_profile_updates_opening_fields(self, admin_client, demo_profile_id):
        # Snapshot original
        orig = admin_client.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}"
        ).json()
        original_payload = {
            "opening_photo_url": orig.get("opening_photo_url"),
            "opening_bg_source": orig.get("opening_bg_source") or "couple",
            "use_couple_photo_as_opening_bg": orig.get(
                "use_couple_photo_as_opening_bg", True
            ),
        }

        try:
            new_url = "https://example.com/test-opening.jpg"
            put_body = {
                "opening_photo_url": new_url,
                "opening_bg_source": "custom",
                "use_couple_photo_as_opening_bg": False,
            }
            r = admin_client.put(
                f"{BASE_URL}/api/admin/profiles/{demo_profile_id}",
                json=put_body,
            )
            assert r.status_code == 200, r.text

            # GET to verify persistence
            r2 = admin_client.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}")
            assert r2.status_code == 200
            d = r2.json()
            assert d["opening_photo_url"] == new_url
            assert d["opening_bg_source"] == "custom"
            assert d["use_couple_photo_as_opening_bg"] is False
        finally:
            # Restore
            admin_client.put(
                f"{BASE_URL}/api/admin/profiles/{demo_profile_id}",
                json=original_payload,
            )


# ---------- Public invite payload exposes opening_* ----------
class TestInvitePublicViewOpening:
    def test_public_invite_contains_opening_fields(self, demo_slug):
        r = requests.get(f"{BASE_URL}/api/invite/{demo_slug}")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in (
            "opening_photo_url",
            "opening_bg_source",
            "use_couple_photo_as_opening_bg",
        ):
            assert k in data, f"public invite missing {k}"
        # types
        assert isinstance(data["use_couple_photo_as_opening_bg"], bool)
        assert data["opening_bg_source"] in (
            "couple",
            "bride",
            "groom",
            "custom",
            None,
        )
