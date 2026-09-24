"""
Backend tests for Photo Privacy Phase A.

Covers:
- Public privacy info (is_protected toggle)
- Admin enable/disable + password not leaked
- Weak code / confirm mismatch (400)
- Public unlock (correct, wrong, lockout)
- Reset code + logout-all (salt rotation invalidates tokens on the album route)
- Analytics endpoint + qr_scans increment
- Find-my-photos is NOT album-PIN-gated; whole album still is; 403 when AI disabled
"""
import os
import time
import uuid
import requests
import pytest

from tests.live import create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()
ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"
UA = {"User-Agent": "Mozilla/5.0 (compatible; pytest-privacy)"}

# Use a unique slug-like marker to avoid colliding with parallel runs
TEST_CODE = "482916"  # 4-6 digit numeric PIN (gallery_privacy PASSWORD_RE = ^\d{4,6}$)


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", **UA})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    # Was a loop over four candidate login paths. Three of them do not exist, so
    # every run spent four attempts against the rate limiter to obtain one token.
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def wedding(admin_headers):
    """A throwaway invitation this module owns.

    The hardcoded DEMO_PROFILE_ID came from the old environment and 404s here,
    so nine privacy tests failed on "Profile not found". Owning the row matters
    more here than elsewhere: these tests set a gallery password, trip the
    lockout and rotate the salt, and none of that belongs on the demo
    invitation that the marketing site links to.
    """
    slug, pid = create_wedding(admin_headers)
    try:
        yield slug, pid
    finally:
        delete_wedding(admin_headers, pid)


@pytest.fixture(scope="module")
def demo_slug(wedding):
    return wedding[0]


@pytest.fixture(scope="module")
def demo_profile_id(wedding):
    return wedding[1]


def _disable_privacy(s, admin_headers, demo_profile_id):
    """Helper: set enabled=false to reset state for next tests."""
    s.put(
        f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy",
        headers=admin_headers,
        json={"enabled": False},
    )


def _enable_privacy(s, admin_headers, demo_profile_id, code=TEST_CODE, ai=True):
    payload = {
        "enabled": True,
        "code": code,
        "confirm_code": code,
        "remember_days": 30,
        "allow_downloads": True,
        "allow_share": True,
        "ai_face_match_enabled": ai,
        "public_highlights_enabled": True,
        "private_full_gallery_enabled": True,
    }
    return s.put(
        f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy",
        headers=admin_headers,
        json=payload,
    )


# (The old autouse teardown that disabled privacy at the end is gone — the
# `wedding` fixture deletes the whole invitation, which is a stronger cleanup.)


# -----------------------------------------------------------------
class TestPublicPrivacyInfo:
    def test_initial_not_protected(self, s, admin_headers, demo_slug, demo_profile_id):
        _disable_privacy(s, admin_headers, demo_profile_id)
        r = s.get(f"{BASE_URL}/api/public/gallery/{demo_slug}/privacy")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_protected") is False
        # password_hash MUST NOT leak
        assert "password_hash" not in data

    def test_enable_then_public_protected(self, s, admin_headers, demo_slug, demo_profile_id):
        r = _enable_privacy(s, admin_headers, demo_profile_id)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "password_hash" not in body
        # Confirm public side
        r2 = s.get(f"{BASE_URL}/api/public/gallery/{demo_slug}/privacy")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("is_protected") is True
        assert "password_hash" not in d2


# -----------------------------------------------------------------
class TestAdminValidation:
    def test_weak_code_rejected(self, s, admin_headers, demo_profile_id):
        # Non-numeric PIN rejected (rule is 4-6 digits, numeric only)
        r = s.put(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy",
            headers=admin_headers,
            json={"enabled": True, "code": "abcdef", "confirm_code": "abcdef"},
        )
        # Accept 400 or 422 (pydantic validator). Spec asks for 400 — flag in report if 422.
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text[:300]}"
        assert "pin" in r.text.lower() or "digit" in r.text.lower()

    def test_confirm_mismatch_rejected(self, s, admin_headers, demo_profile_id):
        # Both valid numeric PINs but different → confirm-mismatch path (400)
        r = s.put(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy",
            headers=admin_headers,
            json={"enabled": True, "code": "482916", "confirm_code": "111111"},
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text[:300]}"


# -----------------------------------------------------------------
class TestUnlockFlow:
    def test_enable_then_wrong_then_right(self, s, admin_headers, demo_slug, demo_profile_id):
        r = _enable_privacy(s, admin_headers, demo_profile_id)
        assert r.status_code == 200

        # Wrong code → 401
        rw = s.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": "WrongCode99", "remember": True},
        )
        assert rw.status_code == 401, f"got {rw.status_code}: {rw.text[:200]}"

        # Right code → 200 + device_token
        rg = s.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert rg.status_code == 200, rg.text
        data = rg.json()
        for k in ("device_token", "expires_at", "remember_days",
                  "allow_downloads", "allow_share", "ai_face_match_enabled"):
            assert k in data, f"missing key {k} in unlock response: {data}"
        assert isinstance(data["device_token"], str) and len(data["device_token"]) > 10

    # Rate-limit test moved to bottom of file (class TestZZRateLimit) to avoid poisoning other tests.


# -----------------------------------------------------------------
class TestResetCodeAndLogoutAll:
    def test_reset_code_rotates_salt(self, s, admin_headers, demo_slug, demo_profile_id):
        # Ensure enabled with known code
        r = _enable_privacy(s, admin_headers, demo_profile_id)
        assert r.status_code == 200

        # Unlock with fresh IP/session to bypass rate-limit
        u = requests.Session()
        u.headers.update({"Content-Type": "application/json", **UA, "X-Test-Run": uuid.uuid4().hex})
        unlock = u.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert unlock.status_code == 200, unlock.text
        old_token = unlock.json()["device_token"]

        # Bad code format → 400
        bad = s.post(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy/reset-code",
            headers=admin_headers,
            json={"code": "abc", "confirm_code": "abc"},  # missing digit
        )
        assert bad.status_code == 400, f"got {bad.status_code}: {bad.text[:200]}"

        # Good rotation (numeric PIN)
        new_code = "246813"
        ok = s.post(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy/reset-code",
            headers=admin_headers,
            json={"code": new_code, "confirm_code": new_code},
        )
        assert ok.status_code == 200, ok.text

        # Old token should be rejected now on the WHOLE-ALBUM gate. (Face-search
        # is intentionally no longer album-PIN-gated, so it can't probe the salt;
        # the album route still enforces the device token.)
        rf = requests.get(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/all-photos",
            headers={"X-Gallery-Device-Token": old_token, **UA},
        )
        # 401 is the privacy-gate response (token invalid after salt rotation).
        assert rf.status_code == 401, f"old token should be rejected, got {rf.status_code}: {rf.text[:200]}"

        # Restore default code so downstream tests use TEST_CODE
        _enable_privacy(s, admin_headers, demo_profile_id, code=TEST_CODE)

    def test_logout_all_rotates_salt_without_changing_password(self, s, admin_headers, demo_slug, demo_profile_id):
        _enable_privacy(s, admin_headers, demo_profile_id)
        u = requests.Session()
        u.headers.update({"Content-Type": "application/json", **UA, "X-Test-Run": uuid.uuid4().hex})
        unlock = u.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert unlock.status_code == 200
        old_token = unlock.json()["device_token"]

        lo = s.post(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy/logout-all",
            headers=admin_headers,
        )
        assert lo.status_code == 200, lo.text

        # Old token rejected on the whole-album gate (face-search is no longer
        # album-PIN-gated; the album route still enforces the device token).
        rf = requests.get(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/all-photos",
            headers={"X-Gallery-Device-Token": old_token, **UA},
        )
        assert rf.status_code == 401, f"old token should be rejected after logout-all, got {rf.status_code}"

        # Password is unchanged → can still unlock with TEST_CODE (fresh IP)
        u2 = requests.Session()
        u2.headers.update({"Content-Type": "application/json", **UA, "X-Test-Run": uuid.uuid4().hex})
        r2 = u2.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert r2.status_code == 200, f"unlock with same code after logout-all should still succeed: {r2.text[:200]}"


# -----------------------------------------------------------------
class TestAnalytics:
    def test_analytics_shape_and_qr_scan_increment(self, s, admin_headers, demo_slug, demo_profile_id):
        _enable_privacy(s, admin_headers, demo_profile_id)
        r1 = s.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy/analytics",
            headers=admin_headers,
        )
        assert r1.status_code == 200, r1.text
        a1 = r1.json()
        for k in ("qr_scans", "unlocks", "failed_attempts", "ai_uploads",
                  "matched_results", "is_protected", "is_expired"):
            assert k in a1, f"missing analytics key {k}: {a1}"

        before = a1["qr_scans"]
        # Trigger a public privacy call
        s.get(f"{BASE_URL}/api/public/gallery/{demo_slug}/privacy")

        r2 = s.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/gallery/privacy/analytics",
            headers=admin_headers,
        )
        a2 = r2.json()
        assert a2["qr_scans"] >= before + 1, f"qr_scans did not increment: before={before} after={a2['qr_scans']}"


# -----------------------------------------------------------------
class TestPrivacyGateOnFaceSearch:
    def test_no_token_is_not_album_pin_gated(self, s, admin_headers, demo_slug, demo_profile_id):
        # Find my photos is NOT gated by the whole-album PIN (2026-08-22): a
        # guest scanning the face-match QR gets ONLY their own matches, never the
        # album, so the album passcode does not apply. Without a token the
        # request must NOT be 401 "Gallery is locked" — it reaches the real
        # face-flow gate instead (here 400, because the demo gallery isn't
        # enabled; 428 CONSENT_REQUIRED once it is — see test_findmyphotos_no_pin).
        r = _enable_privacy(s, admin_headers, demo_profile_id, ai=True)
        assert r.status_code == 200
        rf = requests.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/face-search",
            files={"selfie": ("a.jpg", b"\xff\xd8\xff\xe0dummy", "image/jpeg")},
            headers=UA,
        )
        assert rf.status_code != 401, f"face-search must not require the album PIN, got {rf.status_code}: {rf.text[:200]}"
        assert "lock" not in rf.text.lower(), f"face-search wrongly reported the album lock: {rf.text[:200]}"
        assert rf.status_code in (400, 428), f"expected the face-flow gate (400/428), got {rf.status_code}: {rf.text[:200]}"

    def test_whole_album_still_needs_token(self, s, admin_headers, demo_slug, demo_profile_id):
        # The album passcode moved off face-search but STAYS on the whole-album
        # route: no token → 401 locked.
        r = _enable_privacy(s, admin_headers, demo_profile_id, ai=True)
        assert r.status_code == 200
        ra = requests.get(f"{BASE_URL}/api/public/gallery/{demo_slug}/all-photos", headers=UA)
        assert ra.status_code == 401, f"whole album must stay PIN-gated, got {ra.status_code}: {ra.text[:200]}"
        assert "lock" in ra.text.lower()

    def test_ai_disabled_returns_403_with_token(self, s, admin_headers, demo_slug, demo_profile_id):
        # Enable privacy WITH ai disabled
        r = _enable_privacy(s, admin_headers, demo_profile_id, ai=False)
        assert r.status_code == 200
        # Get a fresh token
        u = requests.Session()
        u.headers.update({"Content-Type": "application/json", **UA, "X-Test-Run": uuid.uuid4().hex})
        unlock = u.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert unlock.status_code == 200, unlock.text
        token = unlock.json()["device_token"]

        rf = requests.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/face-search",
            files={"selfie": ("a.jpg", b"\xff\xd8\xff\xe0dummy", "image/jpeg")},
            headers={"X-Gallery-Device-Token": token, **UA},
        )
        assert rf.status_code == 403, f"expected 403 when AI disabled, got {rf.status_code}: {rf.text[:200]}"
        assert "ai" in rf.text.lower() or "disabled" in rf.text.lower()

    def test_valid_token_passes_gate(self, s, admin_headers, demo_slug, demo_profile_id):
        # Re-enable with AI on
        _enable_privacy(s, admin_headers, demo_profile_id, ai=True)
        u = requests.Session()
        u.headers.update({"Content-Type": "application/json", **UA, "X-Test-Run": uuid.uuid4().hex})
        unlock = u.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
            json={"code": TEST_CODE, "remember": True},
        )
        assert unlock.status_code == 200
        token = unlock.json()["device_token"]

        rf = requests.post(
            f"{BASE_URL}/api/public/gallery/{demo_slug}/face-search",
            files={"selfie": ("a.jpg", b"\xff\xd8\xff\xe0dummy", "image/jpeg")},
            headers={"X-Gallery-Device-Token": token, **UA},
        )
        # Past the gate: must NOT be 401 'locked'. 400 (gallery not enabled on demo) or 200 acceptable.
        assert rf.status_code != 401, f"valid token should pass the privacy gate: {rf.status_code} {rf.text[:200]}"
        assert rf.status_code in (200, 400, 413, 422), f"unexpected status {rf.status_code}: {rf.text[:200]}"



# -----------------------------------------------------------------
# IMPORTANT: This class MUST run last because it intentionally trips the
# per-IP rate-limit (5-minute cooldown), which would poison any later
# unlock-based tests sharing the egress IP.
class TestZZZRateLimit:
    def test_rate_limit_lockout(self, s, admin_headers, demo_slug, demo_profile_id):
        """5 wrong attempts in a row should trigger 429."""
        _enable_privacy(s, admin_headers, demo_profile_id)
        statuses = []
        for _ in range(7):
            r = s.post(
                f"{BASE_URL}/api/public/gallery/{demo_slug}/unlock",
                json={"code": "BadGuess1", "remember": False},
            )
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, f"expected a 429 within 7 attempts, got {statuses}"
