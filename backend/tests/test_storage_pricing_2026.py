"""
test_storage_pricing_2026.py — studio storage catalog v3 (2026 pricing redesign).

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_storage_pricing_2026.py -q

Covers docs/PRICING_REDESIGN_2026.md §4 end to end against the RUNNING server
(live-suite pattern — tests/live.py require_live/login; skips cleanly when the
stack is down):

  * GET /api/public/pricing/storage serves the v3 anchors (50 GB, 1 TB) with a
    real list/save/pct_off breakdown, the carried middle tiers (100/250/500 GB)
    flagged approved:false with no fabricated discount, and no 750 GB tier.
  * The live DB actually got bumped to catalog v3 (via _ensure_default_plans,
    triggered lazily the first time a studio-storage endpoint is hit) — the
    photographer-facing plan list shows the same prices the public page shows.
  * POST /api/admin/studio-storage/subscribe for the 50 GB monthly plan quotes
    ₹299 (skips cleanly if Razorpay isn't configured locally — this assertion
    needs a live gateway, not just a live server).
"""
from __future__ import annotations

import pytest
import requests

from tests.live import login, require_live, UA_HEADER

BASE_URL = require_live()

# The buyer must be a COMPED account or every order-total assertion below
# skips on a 503 from the payment gateway. seed_test_accounts.py comps
# `test.studio@maja.test`; it does NOT comp admin@wedding.com, and this file
# used to point at the latter — so six money-path checks (suite totals, the
# client-sent-amount guard, the face photo limit) silently did not run on any
# machine where the flag had not been set by hand. A skip is not a pass.
# Precondition: SEED_TEST_ACCOUNTS=1 in backend/.env (opt-in, refused in prod).
PHOTOGRAPHER_EMAIL = "test.studio@maja.test"
PHOTOGRAPHER_PASSWORD = "MajaTest@123"

EXPECTED_APPROVED_CYCLES = {
    50:   {"30": 299, "90": 799, "180": 1599, "365": 2999},
    1024: {"30": 2999, "90": 8499, "180": 16199, "365": 30599},
}
EXPECTED_CARRIED_CYCLES = {
    100: {"30": 299, "90": 799, "180": 1499, "365": 2999},
    250: {"30": 599, "90": 1599, "180": 2999, "365": 5499},
    500: {"30": 999, "90": 2799, "180": 5299, "365": 8999},
}


@pytest.fixture(scope="module")
def photographer_token():
    return login(PHOTOGRAPHER_EMAIL, PHOTOGRAPHER_PASSWORD)


@pytest.fixture(scope="module")
def photographer_headers(photographer_token):
    return {**UA_HEADER, "Authorization": f"Bearer {photographer_token}"}


class TestPublicStorageEndpoint:
    """GET /api/public/pricing/storage — the v3 catalog, no DB round-trip needed
    to be right (it is built straight from pricing_catalog.STORAGE_TIERS)."""

    @pytest.fixture(scope="class")
    def payload(self):
        r = requests.get(f"{BASE_URL}/api/public/pricing/storage", headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_five_tiers_no_750gb(self, payload):
        gbs = sorted(t["gb_limit"] for t in payload["tiers"])
        assert gbs == [50, 100, 250, 500, 1024]
        assert 750 not in gbs

    @pytest.mark.parametrize("gb,expected", EXPECTED_APPROVED_CYCLES.items())
    def test_approved_anchor_prices(self, payload, gb, expected):
        tier = next(t for t in payload["tiers"] if t["gb_limit"] == gb)
        assert tier["approved"] is True
        for days, final_inr in expected.items():
            assert tier["cycles"][days]["final_inr"] == final_inr
        # A genuine, computed discount exists on every non-monthly cycle.
        assert tier["cycles"]["365"]["list_inr"] is not None
        assert tier["cycles"]["365"]["save_inr"] == \
            tier["cycles"]["365"]["list_inr"] - tier["cycles"]["365"]["final_inr"]
        assert isinstance(tier["cycles"]["365"]["pct_off"], int)

    @pytest.mark.parametrize("gb,expected", EXPECTED_CARRIED_CYCLES.items())
    def test_carried_tier_prices_and_no_fake_discount(self, payload, gb, expected):
        """Carried tiers show their live prices; any discount shown must be
        DERIVED (list = the tier's own monthly x months), never a fabricated
        anchor. The endpoint is DB-driven so admin edits stay live — pct_off
        exists here exactly because the carried multi-month rows genuinely
        undercut monthly x months."""
        tier = next(t for t in payload["tiers"] if t["gb_limit"] == gb)
        assert tier["approved"] is False
        monthly_inr = expected["30"]
        for days, final_inr in expected.items():
            cyc = tier["cycles"][days]
            assert cyc["final_inr"] == final_inr
            if days == "30":
                assert cyc["pct_off"] is None and cyc["list_inr"] is None
                continue
            months = {"90": 3, "180": 6, "365": 12}[days]
            honest_list = monthly_inr * months
            if cyc["list_inr"] is not None:
                assert cyc["list_inr"] == honest_list
                assert cyc["save_inr"] == honest_list - final_inr
                assert 0 < cyc["pct_off"] < 100


class TestPhotographerPlansReflectV3:
    """The photographer-facing plan list (DB-backed, via _ensure_default_plans)
    must show the same v3 numbers the public page shows — same catalog, one
    source of truth."""

    @pytest.fixture(scope="class")
    def plans(self, photographer_headers):
        r = requests.get(f"{BASE_URL}/api/admin/studio-storage/plans",
                         headers=photographer_headers, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["items"]

    def test_no_750gb_plan(self, plans):
        assert 750 not in {p["gb_limit"] for p in plans}

    def test_50gb_monthly_matches_public_page(self, plans):
        p = next(p for p in plans if p["gb_limit"] == 50 and p["duration_days"] == 30)
        assert p["price_inr"] == 299
        assert p.get("approved") is True
        # No founding discount on the approved anchor — effective price is
        # price_inr regardless of founding eligibility.
        assert p["effective_price_inr"] == 299

    def test_100gb_monthly_carried_and_unapproved(self, plans):
        p = next(p for p in plans if p["gb_limit"] == 100 and p["duration_days"] == 30)
        assert p["price_inr"] == 299
        assert p.get("approved") is False


class TestSubscribeQuotesV3Price:
    """POST /api/admin/studio-storage/subscribe for the 50 GB monthly plan must
    quote exactly ₹299 — needs Razorpay configured; skips cleanly otherwise."""

    def test_subscribe_50gb_monthly_amount(self, photographer_headers):
        plans_r = requests.get(f"{BASE_URL}/api/admin/studio-storage/plans",
                               headers=photographer_headers, timeout=15)
        assert plans_r.status_code == 200, plans_r.text
        plan = next(p for p in plans_r.json()["items"]
                   if p["gb_limit"] == 50 and p["duration_days"] == 30)

        r = requests.post(f"{BASE_URL}/api/admin/studio-storage/subscribe",
                          json={"plan_id": plan["id"]}, headers=photographer_headers, timeout=15)
        if r.status_code == 503:
            pytest.skip("Razorpay not configured on this backend — /subscribe "
                       "amount check needs a real gateway, not just a live server")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plan"]["price_inr"] == 299
        # `amount` is Razorpay's own field, in paise.
        assert data["amount"] == 299 * 100
