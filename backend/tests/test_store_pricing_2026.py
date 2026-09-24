"""
test_store_pricing_2026.py — Invitation Suite + Wave Face Match (2026 pricing redesign).

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_store_pricing_2026.py -q

Covers docs/PRICING_REDESIGN_2026.md §5 (Wave Face Match + QR) and §6
(Invitation Suite): totals are server-computed from pricing_catalog.py and a
client-sent amount is always ignored; the public invitations + face-match
endpoints and /api/store/catalog agree on shape; a face-match SKU stamps
face_photo_limit on the order at create time; and the fulfillment plan-type
mapping (royal -> GOLD, invitation_suite tiers -> SILVER/GOLD/PLATINUM).

Two kinds of test here, deliberately not gated the same way:
  * `TestPlanTypeMapping` is a pure-function check of order_to_invitation.py —
    no DB, no live server — so it runs even when the stack is down.
  * Everything else needs the RUNNING server (live-suite pattern —
    tests/live.py require_live/login) and is gated through the `base_url`
    fixture below, so only THOSE tests skip when nothing answers at
    REACT_APP_BACKEND_URL — a down backend does not hide the pure checks.
  * `test_subscribe...`-style payment round-trips additionally need Razorpay
    actually configured (not just a live server) and skip cleanly with a
    named reason when it isn't — see the 503 handling in
    `_create_invitation_suite_order`.
"""
from __future__ import annotations

import pytest
import requests

from tests.live import login, require_live, UA_HEADER
from order_to_invitation import _PLAN_BY_PACKAGE, _PLAN_BY_INVITATION_SUITE_TIER
from tests.test_order_to_invitation import ORDER as SAMPLE_ORDER

# The buyer must be a COMPED account or every order-total assertion below
# skips on a 503 from the payment gateway. seed_test_accounts.py comps
# `test.studio@maja.test`; it does NOT comp admin@wedding.com, and this file
# used to point at the latter — so six money-path checks (suite totals, the
# client-sent-amount guard, the face photo limit) silently did not run on any
# machine where the flag had not been set by hand. A skip is not a pass.
# Precondition: SEED_TEST_ACCOUNTS=1 in backend/.env (opt-in, refused in prod).
PHOTOGRAPHER_EMAIL = "test.studio@maja.test"
PHOTOGRAPHER_PASSWORD = "MajaTest@123"

# key -> components -> expected total_inr, straight from docs §6.
INVITATION_TOTALS = {
    ("basic", ("digital", "video")): 7000,
    ("basic", ("digital", "video", "physical")): 9000,
    ("premium", ("digital", "video", "physical")): 16000,
    ("custom", ("digital", "video", "physical")): 20000,
}


# --------------------------------------------------------------------------- #
# Pure-function: fulfillment plan-type mapping. No server needed.
# --------------------------------------------------------------------------- #
class TestPlanTypeMapping:
    def test_royal_package_maps_to_gold_explicitly(self):
        # Used to silently fall through to the .get(..., "GOLD") default;
        # now an explicit entry (docs §6).
        assert _PLAN_BY_PACKAGE["royal"] == "GOLD"

    def test_invitation_suite_tier_mapping(self):
        assert _PLAN_BY_INVITATION_SUITE_TIER == {
            "basic": "SILVER", "premium": "GOLD", "custom": "PLATINUM"}

    @pytest.mark.parametrize("tier,expected", [
        ("basic", "SILVER"), ("premium", "GOLD"), ("custom", "PLATINUM")])
    def test_build_invitation_payload_invitation_suite_plan_type(self, tier, expected):
        from order_to_invitation import build_invitation_payload
        order = dict(SAMPLE_ORDER, order_type="invitation_suite", invitation_tier=tier)
        out = build_invitation_payload(order, "admin_test")
        assert out["profile"]["plan_type"] == expected

    def test_build_invitation_payload_royal_package_plan_type(self):
        from order_to_invitation import build_invitation_payload
        order = dict(SAMPLE_ORDER, package="royal")
        order.pop("order_type", None)
        out = build_invitation_payload(order, "admin_test")
        assert out["profile"]["plan_type"] == "GOLD"


# --------------------------------------------------------------------------- #
# Live-server fixtures — only tests that request these skip when the stack is
# down; the pure-function class above is unaffected.
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def base_url():
    return require_live()


@pytest.fixture(scope="module")
def photographer_headers(base_url):
    token = login(PHOTOGRAPHER_EMAIL, PHOTOGRAPHER_PASSWORD)
    return {**UA_HEADER, "Authorization": f"Bearer {token}"}


def _create_invitation_suite_order(base_url, headers, tier, components, extra_body=None):
    body = {"design_id": "royal_heritage", "esign_agreed": True,
            "order_type": "invitation_suite", "invitation_tier": tier,
            "components": list(components)}
    if extra_body:
        body.update(extra_body)
    return requests.post(f"{base_url}/api/store/order/create", json=body,
                         headers=headers, timeout=20)


def _get_order(base_url, headers, order_id):
    r = requests.get(f"{base_url}/api/store/order/{order_id}", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


class TestInvitationSuiteOrderTotals:
    """Server-computed totals from pricing_catalog.invitation_total — the client
    never gets to price its own order. Skips per-case if Razorpay isn't
    configured (create_order needs it unless the buyer is a comped test
    account, which admin@wedding.com is not guaranteed to be)."""

    @pytest.mark.parametrize("tier_components,expected", INVITATION_TOTALS.items())
    def test_total(self, base_url, photographer_headers, tier_components, expected):
        tier, components = tier_components
        r = _create_invitation_suite_order(base_url, photographer_headers, tier, components)
        if r.status_code == 503:
            pytest.skip("Payment gateway not configured on this backend — needs "
                       "a real Razorpay key or a comped test-buyer account")
        assert r.status_code == 200, r.text
        order = _get_order(base_url, photographer_headers, r.json()["order_id"])
        assert order["quote"]["total_inr"] == expected
        assert order["order_type"] == "invitation_suite"
        assert order["invitation_tier"] == tier
        assert order["components"] == list(components)

    def test_empty_components_rejected_400(self, base_url, photographer_headers):
        # Raised before any payment-gateway code runs, so this always executes
        # once the server is up, regardless of Razorpay configuration.
        r = _create_invitation_suite_order(base_url, photographer_headers, "basic", [])
        assert r.status_code == 400, r.text

    def test_client_sent_amount_is_ignored(self, base_url, photographer_headers):
        r = _create_invitation_suite_order(
            base_url, photographer_headers, "basic", ["digital"],
            extra_body={"amount": 1, "total": 1, "amount_inr": 1, "total_inr": 1})
        if r.status_code == 503:
            pytest.skip("Payment gateway not configured on this backend")
        assert r.status_code == 200, r.text
        order = _get_order(base_url, photographer_headers, r.json()["order_id"])
        # The real server-computed price (basic digital alone = 5000), not the
        # bogus client-sent 1.
        assert order["quote"]["total_inr"] == 5000


class TestFacePhotoLimitOnOrder:
    def test_face_match_feature_sets_photo_limit(self, base_url, photographer_headers):
        body = {"design_id": "royal_heritage", "esign_agreed": True,
                "main_language": "english", "features": ["face_match_2000"]}
        r = requests.post(f"{base_url}/api/store/order/create", json=body,
                          headers=photographer_headers, timeout=20)
        if r.status_code == 503:
            pytest.skip("Payment gateway not configured on this backend")
        assert r.status_code == 200, r.text
        order = _get_order(base_url, photographer_headers, r.json()["order_id"])
        assert order["face_photo_limit"] == 2000


class TestPublicEndpointShapes:
    def test_invitations_endpoint_shape(self, base_url):
        r = requests.get(f"{base_url}/api/public/pricing/invitations", headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert {t["key"] for t in data["tiers"]} == {"basic", "premium", "custom"}
        basic = next(t for t in data["tiers"] if t["key"] == "basic")
        assert basic["components"] == {"digital": 5000, "video": 2000, "physical": 2000}
        assert basic["all_three_inr"] == 9000

    def test_face_match_endpoint_shape(self, base_url):
        r = requests.get(f"{base_url}/api/public/pricing/face-match", headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["custom_whatsapp"] is True
        by_key = {t["key"]: t for t in data["tiers"]}
        assert by_key["face_match_2000"] == {"key": "face_match_2000", "photos": 2000, "price_inr": 5000}
        assert by_key["face_match_3000"]["price_inr"] == 7000
        assert by_key["face_match_5000"]["price_inr"] == 10000

    def test_store_catalog_carries_both_new_tier_lists(self, base_url):
        r = requests.get(f"{base_url}/api/store/catalog", headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert {t["key"] for t in data["invitation_tiers"]} == {"basic", "premium", "custom"}
        assert {t["key"] for t in data["face_match_tiers"]} == \
            {"face_match_2000", "face_match_3000", "face_match_5000"}

    def test_legacy_face_match_skus_hidden_but_new_ones_priced(self, base_url):
        r = requests.get(f"{base_url}/api/store/catalog", headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        paid = {f["key"]: f for f in r.json()["paid_features"]}
        assert "ai_face_match" not in paid, "retired SKU must not display on the public catalog"
        assert "selfie_search" not in paid, "retired SKU must not display on the public catalog"
        assert paid["face_match_2000"]["price"] == 5000
        assert paid["face_match_3000"]["price"] == 7000
        assert paid["face_match_5000"]["price"] == 10000


class TestSuiteDoubleSubmitGuard:
    """Audit P3: a rapid double-submit on /api/store/order/create used to mint
    two Razorpay orders for one purchase intent. In-process (FakeDB + stub
    gateway) because the guard sits past the Razorpay-configured check, which
    the local stack fails before reaching it."""

    @pytest.mark.asyncio
    async def test_second_identical_suite_create_reuses_the_order(self, monkeypatch):
        import store_features
        from tests.test_storage_orchestrator import FakeDB

        monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_t3st_dedupe_key")
        monkeypatch.setenv("RAZORPAY_KEY_SECRET", "t3st_dedupe_secret")

        class _Orders:
            def __init__(self):
                self.created = 0
            def create(self, body):
                self.created += 1
                return {"id": f"order_stub_{self.created}"}

        class _Rzp:
            def __init__(self):
                self.order = _Orders()

        rzp = _Rzp()
        db = FakeDB()
        # Non-test photographer buyer (no admins row -> is_test_buyer False).
        async def current_user():
            return {"user_id": "ph_dedupe", "kind": "photographer",
                    "name": "D", "email": "d@x.com", "phone": None}

        router = store_features.build_store_router(db, rzp, current_user)
        create = next(r.endpoint for r in router.routes
                      if r.path == "/api/store/order/create" and "POST" in r.methods)

        payload = store_features.CreateOrderRequest(
            design_id="suite_no_design", order_type="invitation_suite",
            invitation_tier="basic",
            components=["digital", "video"], esign_agreed=True)
        first = await create(payload, current=await current_user())
        second = await create(payload, current=await current_user())

        assert first["order_id"] == second["order_id"]
        assert second.get("reused_pending") is True
        assert rzp.order.created == 1, "second click must not mint a second gateway order"
        rows = [d async for d in db.invitation_orders.find({})]
        assert len(rows) == 1

        # A DIFFERENT selection is a genuine new purchase, never deduped.
        other = store_features.CreateOrderRequest(
            design_id="suite_no_design", order_type="invitation_suite",
            invitation_tier="basic",
            components=["digital"], esign_agreed=True)
        third = await create(other, current=await current_user())
        assert third["order_id"] != first["order_id"]
        assert rzp.order.created == 2
