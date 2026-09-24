"""Studio-storage feature gate + per-invitation watermark override.

Ported August 2026 from a Mongo-era file that could not be collected: it
imported `motor` and seeded profiles straight into MongoDB.

Kept — both surfaces are live:
  * TASK 1 — the global studio-storage toggle, its gated endpoints and its
    deliberate bypass list (a studio that already pays must still see its own
    plan and files after the feature is switched off platform-wide).
  * TASK 4B — the super-admin watermark override, which overrules whatever the
    studio chose.

Dropped — TASK 4A tested normal-user credit add/deduct. Normal user accounts
and credits were both permanently retired; `test_users_retired.py` and
`test_credits_retired.py` assert that end state.

Seeding is through the admin API instead of the database, so the fixture goes
through the same validation a real invitation does.
"""
import uuid

import pytest
import requests

from tests.live import UA_HEADER, create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)

SUPER = ("mani_8328@majacreations.com", "Maneesh@1234")
PHOTO = ("admin@wedding.com", "admin123")


def _client(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", **UA,
                      "Authorization": f"Bearer {login(*creds)}"})
    return s


@pytest.fixture(scope="module")
def s_client():
    return _client(SUPER)


@pytest.fixture(scope="module")
def p_client():
    return _client(PHOTO)


@pytest.fixture(scope="module", autouse=True)
def _leave_feature_enabled(s_client):
    """Whatever a test does to the global toggle, put it back. A test that
    disables a platform feature and dies must not leave it disabled."""
    yield
    s_client.put(f"{BASE_URL}/api/super-admin/studio-storage/settings",
                 json={"enabled": True}, timeout=30)


# ────────────────────────────────────────────────────────────────────
# TASK 1 — studio-storage global feature toggle
# ────────────────────────────────────────────────────────────────────
class TestFeatureToggle:
    def test_settings_are_super_admin_only(self, s_client, p_client):
        r = s_client.get(f"{BASE_URL}/api/super-admin/studio-storage/settings", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("enabled"), bool)

        r2 = p_client.get(f"{BASE_URL}/api/super-admin/studio-storage/settings", timeout=30)
        assert r2.status_code in (401, 403), \
            f"a photographer can read super-admin settings: {r2.status_code}"

    def test_status_endpoint_answers_either_way(self, p_client, s_client):
        for enabled in (True, False):
            s_client.put(f"{BASE_URL}/api/super-admin/studio-storage/settings",
                         json={"enabled": enabled}, timeout=30)
            r = p_client.get(f"{BASE_URL}/api/admin/studio-storage/status", timeout=30)
            assert r.status_code == 200, r.text
            assert r.json()["enabled"] is enabled

    def test_gate_closes_and_the_bypass_list_still_works(self, p_client, s_client):
        r = s_client.put(f"{BASE_URL}/api/super-admin/studio-storage/settings",
                         json={"enabled": False}, timeout=30)
        assert r.status_code == 200 and r.json()["enabled"] is False

        gated = [
            ("GET", "/api/admin/studio-storage/plans", None),
            ("POST", "/api/admin/studio-storage/subscribe", {"plan_id": "x"}),
            ("POST", "/api/admin/studio-storage/verify-payment",
             {"plan_id": "x", "razorpay_order_id": "x",
              "razorpay_payment_id": "y", "razorpay_signature": "z"}),
        ]
        for method, path, body in gated:
            resp = p_client.request(method, f"{BASE_URL}{path}", json=body, timeout=30)
            assert resp.status_code == 403, \
                f"{method} {path} expected 403, got {resp.status_code}: {resp.text[:200]}"

        # A studio that already pays keeps access to its own plan and files.
        for path in ("/api/admin/studio-storage/my-plan",
                     "/api/admin/studio-storage/files"):
            resp = p_client.get(f"{BASE_URL}{path}", timeout=30)
            assert resp.status_code == 200, \
                f"GET {path} expected 200, got {resp.status_code}: {resp.text[:200]}"

        resp = p_client.delete(
            f"{BASE_URL}/api/admin/studio-storage/files/does-not-exist-xyz", timeout=30)
        assert resp.status_code != 403, "delete should bypass the gate; got 403"

    def test_re_enable_restores_access(self, p_client, s_client):
        s_client.put(f"{BASE_URL}/api/super-admin/studio-storage/settings",
                     json={"enabled": False}, timeout=30)
        assert p_client.get(f"{BASE_URL}/api/admin/studio-storage/plans",
                            timeout=30).status_code == 403

        s_client.put(f"{BASE_URL}/api/super-admin/studio-storage/settings",
                     json={"enabled": True}, timeout=30)
        r = p_client.get(f"{BASE_URL}/api/admin/studio-storage/plans", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), (list, dict))


# ────────────────────────────────────────────────────────────────────
# TASK 4B — per-invitation watermark override
# ────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def invitation(p_client):
    headers = {"Authorization": p_client.headers["Authorization"],
               "Content-Type": "application/json"}
    slug, pid = create_wedding(headers)
    try:
        yield {"slug": slug, "profile_id": pid}
    finally:
        delete_wedding(headers, pid)


def _invite(slug):
    return requests.get(f"{BASE_URL}/api/invite/{slug}", headers=UA, timeout=15)


def _set_override(s_client, profile_id, force):
    return s_client.put(f"{BASE_URL}/api/super-admin/profiles/{profile_id}/watermark",
                        json={"force": force}, timeout=30)


class TestWatermarkOverride:
    def test_force_on(self, s_client, invitation):
        r = _set_override(s_client, invitation["profile_id"], "on")
        assert r.status_code == 200, r.text
        assert r.json()["admin_watermark_override"] == "on"

        body = _invite(invitation["slug"]).json()
        assert body.get("requires_watermark") is True
        assert body.get("admin_watermark_override") == "on"

    def test_force_off(self, s_client, invitation):
        r = _set_override(s_client, invitation["profile_id"], "off")
        assert r.status_code == 200, r.text

        body = _invite(invitation["slug"]).json()
        assert body.get("requires_watermark") is False
        assert body.get("admin_watermark_override") == "off"

    def test_force_user_returns_control_to_the_studio(self, s_client, invitation):
        _set_override(s_client, invitation["profile_id"], "on")
        r = _set_override(s_client, invitation["profile_id"], "user")
        assert r.status_code == 200, r.text
        assert r.json()["admin_watermark_override"] == "user"

        body = _invite(invitation["slug"]).json()
        assert body.get("admin_watermark_override") == "user"
        # With the override cleared the answer comes from the profile itself,
        # so assert it is a real boolean rather than pinning a value the
        # fixture does not control.
        assert isinstance(body.get("requires_watermark"), bool)

    def test_invalid_force_value_is_rejected(self, s_client, invitation):
        r = _set_override(s_client, invitation["profile_id"], "garbage")
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_unknown_profile_returns_404(self, s_client):
        r = _set_override(s_client, "does-not-exist-xyz", "on")
        assert r.status_code == 404, r.text

    def test_requires_super_admin(self, p_client, invitation):
        r = p_client.put(
            f"{BASE_URL}/api/super-admin/profiles/{invitation['profile_id']}/watermark",
            json={"force": "on"}, timeout=30)
        assert r.status_code in (401, 403), \
            f"a photographer can set the admin watermark override: {r.status_code}"
