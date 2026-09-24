# Iteration 7 - new per-photo enable/disable toggles round-trip tests
import os
import pytest
import requests

from tests.live import create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()

ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def wedding(auth_headers):
    """A throwaway invitation this module owns.

    The hardcoded DEMO_PROFILE_ID below came from the old environment and 404s
    here, so every test that used it failed on "Profile not found" — a missing
    fixture reported as a broken endpoint. Owning the row also means these
    round-trip tests can write freely without mutating the demo invitation.
    """
    slug, pid = create_wedding(auth_headers)
    try:
        yield slug, pid
    finally:
        delete_wedding(auth_headers, pid)


@pytest.fixture(scope="module")
def demo_profile_id(wedding):
    return wedding[1]


@pytest.fixture(scope="module")
def demo_slug(wedding):
    return wedding[0]



class TestShowPhotoToggles:
    """Round-trip the 3 new boolean flags through admin PUT + admin GET + public GET."""

    def test_initial_profile_has_show_flags(self, auth_headers, demo_profile_id):
        r = requests.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # all three flags must be present and boolean
        for k in ("show_couple_photo", "show_bride_photo", "show_groom_photo"):
            assert k in body, f"missing field {k} in admin profile response"
            assert isinstance(body[k], bool), f"{k} should be bool, got {type(body[k])}"

    def test_put_show_groom_photo_false_then_revert(self, auth_headers, demo_slug, demo_profile_id):
        # 1) PUT show_groom_photo=false
        put_r = requests.put(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}",
            headers=auth_headers,
            json={"show_groom_photo": False},
            timeout=15,
        )
        assert put_r.status_code == 200, put_r.text
        assert put_r.json().get("show_groom_photo") is False

        # 2) GET admin returns false
        get_r = requests.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}", headers=auth_headers, timeout=15)
        assert get_r.status_code == 200
        assert get_r.json().get("show_groom_photo") is False

        # 3) Public invite returns false
        pub_r = requests.get(f"{BASE_URL}/api/invite/{demo_slug}", timeout=15)
        assert pub_r.status_code == 200, pub_r.text
        pub = pub_r.json()
        assert "show_groom_photo" in pub, f"public view missing show_groom_photo. keys={list(pub.keys())}"
        assert pub["show_groom_photo"] is False

        # 4) Revert
        revert_r = requests.put(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}",
            headers=auth_headers,
            json={"show_groom_photo": True},
            timeout=15,
        )
        assert revert_r.status_code == 200
        assert revert_r.json().get("show_groom_photo") is True

        # 5) Verify revert
        pub_r2 = requests.get(f"{BASE_URL}/api/invite/{demo_slug}", timeout=15)
        assert pub_r2.json().get("show_groom_photo") is True

    def test_public_invite_emits_all_three_flags(self, demo_slug):
        r = requests.get(f"{BASE_URL}/api/invite/{demo_slug}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ("show_couple_photo", "show_bride_photo", "show_groom_photo"):
            assert k in body, f"public InvitationPublicView missing {k}"
            assert isinstance(body[k], bool)
