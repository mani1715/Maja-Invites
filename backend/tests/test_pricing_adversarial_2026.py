"""
test_pricing_adversarial_2026.py — adversarial matrix, 2026 pricing redesign.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_pricing_adversarial_2026.py -q

Reference: docs/PRICING_REDESIGN_2026.md, SESSION_CONTEXT.md §0.0.74.

Runs entirely against the LIVE backend at :8001 (tests/live.py's
require_live/login pattern — the whole module skips cleanly if nothing
answers there; there is no pure-function half to isolate, unlike
test_store_pricing_2026.py, because every attack here is about what the
RUNNING server actually does over the wire). Two live accounts:

  * test.studio@maja.test / MajaTest@123 — photographer, is_test:true, created
    and comped by seed_test_accounts.py (store + subscription purchases settle
    free, no Razorpay needed). Deliberately NOT admin@wedding.com: nothing in
    the repo comps that account, so using it made this file pass only where
    the flag had been set by hand. See the note by PHOTOGRAPHER below.
    PRECONDITION: `SEED_TEST_ACCOUNTS=1` in backend/.env (the seed is opt-in and
    refused outright in production). Without it the account does not exist and
    the fixture fails with that instruction rather than a bare login error.
  * mani_8328@majacreations.com / ... — super-admin, NOT is_test. A
    subscription purchase for this account therefore takes the REAL
    (mock, since no Razorpay keys are configured locally — verified against
    backend/.env at authoring time) gateway path: pending -> verify ->
    active. That is what makes the REPLAY and CONCURRENCY sections below
    exercises of the real contract instead of skips.

Backend modules (pricing_catalog, pricing_migration, ...) are imported
INSIDE each test function, at call time — other engineers are editing these
modules concurrently while this file is authored; a transient error in one
module must fail only the tests that need it, not blow up collection for
the whole file.

Cleanup convention: any row this file creates by DIRECT DB write, or any
super-admin-account subscription/plan row it creates through the API, is
deleted (or restored, for a price row it edits in place) before the test
returns. Ordinary store/subscription purchases made through the comped
test-studio account's normal is_test flow are NOT cleaned up — that account is
the seed's disposable dogfooding buyer, and test_store_pricing_2026.py /
test_subscription_pricing_2026.py already leave the same kind of rows behind
by convention; adding cleanup only here would be inconsistent, not safer.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import requests

from tests.live import UA_HEADER, login, live_db, require_live

BASE_URL = require_live()

# The comped buyer is the account `seed_test_accounts.py` actually comps, NOT
# admin@wedding.com. That distinction cost five failures on a clean checkout:
# this file used to order through admin@wedding.com and describe it as
# "is_test:true", but nothing in the repo sets that flag on it — the seed comps
# `test.studio@maja.test` (and `test.user@maja.test`), and CLAUDE.md documents
# admin@wedding.com only as the ordinary photographer login. On the machine
# where this suite was written the flag had been set by hand, so the suite was
# green there and 503'd ("Payment gateway not configured") anywhere else, on
# every test that needs an order to actually succeed.
#
# Keep this pointed at the SEEDED account. If the free-order bypass ever needs
# a different buyer, comp it in seed_test_accounts.py so a fresh clone gets it
# too — a precondition no code creates is not a precondition, it is a local
# accident. The seed is opt-in (`SEED_TEST_ACCOUNTS=1`) and refused outright in
# production, so nothing here can comp a real account.
PHOTOGRAPHER = ("test.studio@maja.test", "MajaTest@123")       # is_test:true (seeded)
SUPER_ADMIN = ("mani_8328@majacreations.com", "Maneesh@1234")  # not is_test


@pytest.fixture(scope="module")
def photographer_headers():
    # The comped account only exists when the dogfooding seed has run. Say so
    # in one sentence rather than letting the tests below fail on a login
    # error, or (worse) on a 503 from the payment gateway eight frames deeper —
    # which is exactly how the original mis-set account wasted an afternoon.
    try:
        token = login(*PHOTOGRAPHER)
    except Exception as e:  # noqa: BLE001 — the message is the point
        pytest.fail(
            f"cannot sign in as the comped test studio {PHOTOGRAPHER[0]}: {e}\n"
            "This suite needs the account seed_test_accounts.py creates. Set "
            "SEED_TEST_ACCOUNTS=1 in backend/.env and restart the backend.")
    return {**UA_HEADER, "Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def super_admin_headers():
    return {**UA_HEADER, "Authorization": f"Bearer {login(*SUPER_ADMIN)}"}


def _db_call(coro_fn):
    """Run one async unit of work against the LIVE Postgres via tests.live's
    live_db(), then close the connection. `coro_fn` is an `async def` taking
    the connected db as its only argument."""
    import asyncio

    async def _go():
        db = live_db()
        await db.ensure_connected()
        try:
            return await coro_fn(db)
        finally:
            await db.close()
    return asyncio.run(_go())


# =========================================================================== #
# TAMPER — subscription quote/create must price from the server catalog ONLY
# =========================================================================== #
class TestTamperSubscriptionQuote:
    """/api/subscriptions/quote (and /create, which quotes the same way)
    price from pricing_catalog server-side. QuoteRequest/CreateSubscriptionRequest
    define no amount/total/discount/gst field at all, so a client-sent one
    cannot reach the handler — these tests prove that against the live wire,
    not by reading the pydantic model."""

    def test_client_sent_amount_fields_are_ignored(self):
        """ATTACK: amount/total/discount/gst alongside a valid quote request —
        server must still return the catalog price (Basic/monthly = 49900)."""
        body = {"product": "portfolio", "tier": "Basic", "cycle": "monthly",
                "amount": 1, "amount_paise": 1, "total": 1, "total_paise": 1,
                "subtotal_paise": 1, "discount_paise": 999999, "gst_paise": 0}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["total_paise"] == 49900, r.text

    def test_sql_injection_shaped_tier_is_4xx_not_500(self):
        """ATTACK: tier="premium'; DROP TABLE subscription_plans;--" — a
        nonexistent plan must 404, never 500 (and never touch raw SQL — the
        adapter is parameterized, but a 500 here would still be a real bug)."""
        body = {"product": "portfolio",
                "tier": "premium'; DROP TABLE subscription_plans;--",
                "cycle": "monthly"}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert 400 <= r.status_code < 500, f"got {r.status_code}: {r.text}"

    def test_5000_char_tier_is_4xx_not_500(self):
        """ATTACK: a 5000-char tier string — must not 500 (length blowup in
        the id-build / lookup path)."""
        body = {"product": "portfolio", "tier": "A" * 5000, "cycle": "monthly"}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert 400 <= r.status_code < 500, f"got {r.status_code}: {r.text}"

    def test_unknown_cycle_is_400(self):
        """ATTACK: cycle="fake_cycle_xyz" — must be a clean 400, not an
        unhandled KeyError 500."""
        body = {"product": "portfolio", "tier": "Basic", "cycle": "fake_cycle_xyz"}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_unknown_product_is_400(self):
        """ATTACK: product="crypto_wallet_topup" — must be a clean 400."""
        body = {"product": "crypto_wallet_topup", "tier": "Basic", "cycle": "monthly"}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_fabricated_storage_addon_key_is_dropped_not_priced(self):
        """ATTACK: storage_addons carrying keys that don't exist in
        STORAGE_ADDONS — must add ₹0, never a fabricated (or negative) line."""
        body = {"product": "portfolio", "tier": "Basic", "cycle": "monthly",
                "storage_addons": ["totally_fake_addon_xyz", "", "../../etc/passwd"]}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_paise"] == 49900, data
        assert data["storage_addons"] == [], data["storage_addons"]

    def test_oversized_coupon_code_is_not_500(self):
        """ATTACK: a 50,000-char coupon code — QuoteRequest.coupon has no
        max_length, so this reaches `_apply_coupon`'s DB lookup unbounded.
        Must not 500; if accepted, must resolve to no discount."""
        body = {"product": "portfolio", "tier": "Basic", "cycle": "monthly",
                "coupon": "X" * 50_000}
        r = requests.post(f"{BASE_URL}/api/subscriptions/quote", json=body,
                          headers=UA_HEADER, timeout=15)
        assert r.status_code < 500, f"got {r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            assert r.json()["discount_paise"] == 0
            assert r.json()["coupon"] is None


class TestTamperStoreOrderCreate:
    """/api/store/order/create, order_type=invitation_suite — total is always
    pricing_catalog.invitation_total(tier, components), server-side.
    CreateOrderRequest has no amount/total field for a client to set."""

    @staticmethod
    def _create(headers, tier, components, extra=None):
        body = {"design_id": "royal_heritage", "esign_agreed": True,
                "order_type": "invitation_suite", "invitation_tier": tier,
                "components": components}
        if extra:
            body.update(extra)
        return requests.post(f"{BASE_URL}/api/store/order/create", json=body,
                             headers=headers, timeout=20)

    def test_duplicate_component_is_400(self, photographer_headers):
        """ATTACK: components=["digital","digital"] — must 400, never double-charge."""
        r = self._create(photographer_headers, "basic", ["digital", "digital"])
        assert r.status_code == 400, r.text

    def test_unknown_component_is_400(self, photographer_headers):
        """ATTACK: components=["digital","teleportation"] — unknown key
        rejected outright, never silently dropped-and-priced, never 500."""
        r = self._create(photographer_headers, "basic", ["digital", "teleportation"])
        assert r.status_code == 400, r.text

    def test_empty_components_is_400(self, photographer_headers):
        """ATTACK: components=[] — must 400 before any pricing/order row exists."""
        r = self._create(photographer_headers, "basic", [])
        assert r.status_code == 400, r.text

    def test_sql_injection_shaped_tier_is_400(self, photographer_headers):
        """ATTACK: invitation_tier="premium'--" — unknown tier, 400 not 500."""
        r = self._create(photographer_headers, "premium'--", ["digital"])
        assert r.status_code == 400, r.text

    def test_more_than_3_components_is_422(self, photographer_headers):
        """ATTACK: 4 components — CreateOrderRequest.components is capped at
        max_length=3; must reject at the pydantic boundary, before
        pricing_catalog even runs."""
        r = self._create(photographer_headers, "basic",
                         ["digital", "video", "physical", "digital"])
        assert r.status_code == 422, r.text

    def test_negative_and_absurd_numeric_fields_are_ignored(self, photographer_headers):
        """ATTACK: negative/huge numeric fields riding alongside a valid
        selection — CreateOrderRequest defines no such field, so none of
        them can reach the price. Basic + video alone = ₹2,000."""
        r = self._create(photographer_headers, "basic", ["video"], extra={
            "amount": -999999, "total_paise": -1, "discount_paise": 10 ** 9,
            "gst_paise": -500, "price_inr": -1, "amount_inr": -1})
        assert r.status_code == 200, r.text
        order = requests.get(f"{BASE_URL}/api/store/order/{r.json()['order_id']}",
                             headers=photographer_headers, timeout=20).json()
        assert order["quote"]["total_inr"] == 2000, order["quote"]


# =========================================================================== #
# REPLAY / IDEMPOTENCY
# =========================================================================== #
class TestReplayIdempotency:
    """The same request/delivery, sent twice, must settle exactly once."""

    def test_subscription_verify_replay_is_idempotent(self, super_admin_headers):
        """ATTACK: create a pending mock subscription, verify it
        (pending -> active), then REPLAY the identical /verify call (a
        double-tap on "Pay", or a client retry after a slow response).
        subscription_service._settle_subscription's CAS
        (`status: {"$ne": "active"}`) must make the second call a pure
        idempotent read (`already: true`) with the SAME current_period_end —
        never a second period extension or a second payments-ledger row."""
        cr = requests.post(f"{BASE_URL}/api/subscriptions/create",
                           json={"product": "backup", "tier": "Basic", "cycle": "monthly"},
                           headers=super_admin_headers, timeout=20)
        assert cr.status_code == 200, cr.text
        body = cr.json()
        assert body.get("provider") == "mock", (
            "expected the mock gateway (no live Razorpay keys configured) — got "
            f"{body.get('provider')!r}; re-check whether this account went is_test")
        sub_id, mock_token, order_id = body["subscription_id"], body["mock_token"], body["order_id"]

        try:
            v1 = requests.post(f"{BASE_URL}/api/subscriptions/verify",
                               json={"subscription_id": sub_id, "mock_token": mock_token},
                               headers=super_admin_headers, timeout=20)
            assert v1.status_code == 200, v1.text
            assert v1.json()["status"] == "active", v1.text
            end1 = v1.json()["current_period_end"]

            v2 = requests.post(f"{BASE_URL}/api/subscriptions/verify",
                               json={"subscription_id": sub_id, "mock_token": mock_token},
                               headers=super_admin_headers, timeout=20)
            assert v2.status_code == 200, v2.text
            assert v2.json().get("already") is True, (
                f"replayed verify was NOT recognised as idempotent: {v2.text}")
            assert v2.json()["current_period_end"] == end1, (
                "REPLAY EXTENDED THE BILLING PERIOD — double settlement")
        finally:
            async def _cleanup(db):
                await db.subscriptions.delete_one({"id": sub_id})
                await db.orders.delete_one({"id": order_id})
                await db.payments.delete_one({"subscription_id": sub_id})
                await db.audit_logs.delete_one({"target": sub_id})
            _db_call(_cleanup)

    def test_store_verify_forged_signature_replay_never_flips_status(self, photographer_headers):
        """No live Razorpay is configured locally (checked below, live), so a
        genuine paid->verify->replay round trip cannot be produced over HTTP
        for a NON-test buyer (create 503s), and a TEST-buyer order is already
        paid at create with no razorpay_order_id to verify against — neither
        path can exercise the SUCCESS-path replay live in this environment.

        What CAN be proven live: /verify's failure path is itself safely
        idempotent — a forged signature must 400 and never flip status,
        replayed or not, against a REAL row in the REAL database (the
        equivalent FakeDB coverage already exists in test_store_verify_webhook.py;
        this is the same contract against Postgres)."""
        su = {**UA_HEADER, "Authorization": f"Bearer {login(*SUPER_ADMIN)}"}
        gate = requests.post(f"{BASE_URL}/api/store/order/create",
                             json={"design_id": "royal_heritage", "esign_agreed": True,
                                   "package": "classic"},
                             headers=su, timeout=20)
        if gate.status_code != 503:
            pytest.skip("expected 503 (no Razorpay configured) proving the real "
                       f"paid-order path is unreachable here — got {gate.status_code}; "
                       "environment changed, write the real success-path replay test")

        order_id = f"invord_adv_{uuid.uuid4().hex[:12]}"
        fake_rzp_order = f"order_adv_{uuid.uuid4().hex[:12]}"

        async def _admin_id(db):
            row = await db.admins.find_one({"email": PHOTOGRAPHER[0]}, {"_id": 0, "id": 1})
            return row["id"]
        user_id = _db_call(_admin_id)

        async def _insert(db):
            await db.invitation_orders.insert_one({
                "id": order_id, "user_id": user_id,
                "razorpay_order_id": fake_rzp_order, "status": "created",
                "build_status": "awaiting_payment", "amount_inr": 1499,
                "amount_paise": 149900, "created_at": "2026-01-01T00:00:00+00:00",
            })
        _db_call(_insert)

        try:
            payload = {"order_id": order_id, "razorpay_order_id": fake_rzp_order,
                      "razorpay_payment_id": "pay_forged", "razorpay_signature": "sig_forged"}
            r1 = requests.post(f"{BASE_URL}/api/store/order/verify", json=payload,
                               headers=photographer_headers, timeout=20)
            r2 = requests.post(f"{BASE_URL}/api/store/order/verify", json=payload,
                               headers=photographer_headers, timeout=20)
            assert r1.status_code == 400, r1.text
            assert r2.status_code == 400, r2.text

            async def _status(db):
                row = await db.invitation_orders.find_one({"id": order_id}, {"_id": 0})
                return row["status"]
            assert _db_call(_status) == "created", \
                "a forged-signature replay must never flip order status"
        finally:
            async def _cleanup(db):
                await db.invitation_orders.delete_one({"id": order_id})
            _db_call(_cleanup)

    def test_store_webhook_duplicate_delivery_dedupes_to_one_event(self):
        """ATTACK: Razorpay redelivers the SAME webhook event (it retries on
        any non-2xx, and sometimes even on 2xx). The (event,payment_id)
        dedupe row in db.razorpay_events — added in an earlier session, with
        in-process FakeDB coverage in test_store_verify_webhook.py — must
        hold against the LIVE server writing to the LIVE Postgres."""
        payment_id = f"pay_adv_{uuid.uuid4().hex[:12]}"
        order_id = f"order_adv_{uuid.uuid4().hex[:12]}"
        invord_id = f"invord_adv_{uuid.uuid4().hex[:12]}"

        async def _seed(db):
            await db.invitation_orders.insert_one({
                "id": invord_id, "user_id": "adv_test_dummy",
                "razorpay_order_id": order_id, "status": "created",
                "build_status": "awaiting_payment",
                "created_at": "2026-01-01T00:00:00+00:00",
            })
        _db_call(_seed)

        body = json.dumps({
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id,
                                                "status": "captured"}}},
        })
        try:
            headers = {**UA_HEADER, "X-Razorpay-Signature": "irrelevant-unverified-locally",
                      "Content-Type": "application/json"}
            r1 = requests.post(f"{BASE_URL}/api/payments/store-webhook", data=body,
                               headers=headers, timeout=20)
            r2 = requests.post(f"{BASE_URL}/api/payments/store-webhook", data=body,
                               headers=headers, timeout=20)
            assert r1.status_code == 200 and r1.json() == {"received": True}, r1.text
            assert r2.status_code == 200 and r2.json() == {"received": True}, r2.text

            event_id = f"payment.captured:{payment_id}"

            async def _count(db):
                rows = await db.razorpay_events.find({"event_id": event_id}, {"_id": 0}).to_list(10)
                return len(rows)
            n = _db_call(_count)
            assert n == 1, f"duplicate delivery was re-audited {n} times, expected exactly 1"
        finally:
            async def _cleanup(db):
                await db.invitation_orders.delete_one({"id": invord_id})
                await db.razorpay_events.delete_one({"event_id": f"payment.captured:{payment_id}"})
            _db_call(_cleanup)


# =========================================================================== #
# CONCURRENCY
# =========================================================================== #
class TestConcurrency:
    def test_concurrent_creates_dedupe_to_one_pending_subscription(self, super_admin_headers):
        """ATTACK: fire N genuinely concurrent POST /api/subscriptions/create
        for the SAME (studio, product, tier, cycle) — a double-click, or a
        client retrying a slow request. create_subscription's pending-row
        reuse ("Reuse a recent pending row for the same purchase intent...")
        must collapse them to ONE subscription. This is a real race window:
        the reuse check (read existing pending rows) and the insert of a NEW
        pending row are not wrapped in one transaction or backed by a unique
        constraint — only actual concurrency (not sequential double-clicks)
        can prove the dedupe holds rather than merely usually working."""
        import concurrent.futures as cf

        def _create():
            return requests.post(
                f"{BASE_URL}/api/subscriptions/create",
                json={"product": "backup", "tier": "Plus", "cycle": "monthly"},
                headers=super_admin_headers, timeout=25)

        N = 8
        with cf.ThreadPoolExecutor(max_workers=N) as ex:
            results = [f.result() for f in [ex.submit(_create) for _ in range(N)]]

        ok = [r for r in results if r.status_code == 200]
        sub_ids = {r.json().get("subscription_id") for r in ok}
        order_ids = {r.json().get("order_id") for r in ok if r.json().get("order_id")}

        try:
            assert len(ok) == N, f"{N - len(ok)} of {N} concurrent creates failed: " \
                f"{[r.status_code for r in results if r.status_code != 200]}"
            assert len(sub_ids) == 1, (
                f"{len(sub_ids)} distinct subscriptions minted for {N} concurrent creates "
                f"of one (studio,product,tier,cycle) — pending-row dedupe lost the race: "
                f"{sub_ids}")
        finally:
            async def _cleanup(db):
                for sid in sub_ids:
                    await db.subscriptions.delete_one({"id": sid})
                for oid in order_ids:
                    await db.orders.delete_one({"id": oid})
            _db_call(_cleanup)


# =========================================================================== #
# CONSISTENCY CHAINS (§7 GST / cross-endpoint agreement)
# =========================================================================== #
class TestConsistencyChains:
    """Every surface that shows a price must show the SAME price
    pricing_catalog would compute from the plan's own base_monthly — the
    public marketing card, the plans-list preview, and the live quote."""

    @pytest.mark.parametrize("tier,cycle,cyc_key", [
        ("Basic", "quarterly", "3"),
        ("Premium", "yearly", "12"),
    ])
    def test_portfolio_public_card_list_and_quote_agree(self, tier, cycle, cyc_key):
        import pricing_catalog

        pub = requests.get(f"{BASE_URL}/api/public/pricing/portfolio",
                           headers=UA_HEADER, timeout=15).json()
        card = next(p for p in pub["plans"] if p["tier"] == tier)
        public_final_inr = card["cycles"][cyc_key]["final_inr"]

        lp = requests.get(f"{BASE_URL}/api/subscriptions/plans",
                          params={"product": "portfolio"}, headers=UA_HEADER, timeout=15).json()
        plan_row = next(p for p in lp["plans"] if p["tier"] == tier)
        list_preview_paise = plan_row["cycle_prices"][cycle]["paise"]

        q = requests.post(f"{BASE_URL}/api/subscriptions/quote",
                          json={"product": "portfolio", "tier": tier, "cycle": cycle},
                          headers=UA_HEADER, timeout=15).json()

        expected_final_paise = pricing_catalog.compute_cycle_breakdown(
            plan_row["base_monthly"], cycle)["final_paise"]

        assert public_final_inr * 100 == expected_final_paise, \
            (tier, cycle, "public card", public_final_inr * 100, expected_final_paise)
        assert list_preview_paise == expected_final_paise, \
            (tier, cycle, "plans-list preview", list_preview_paise, expected_final_paise)
        assert q["total_paise"] == expected_final_paise, \
            (tier, cycle, "quote", q["total_paise"], expected_final_paise)

        # GST is INCLUDED in total, never added on top, for portfolio (§7).
        assert q["gst_paise"] == q["total_paise"] - round(q["total_paise"] / 1.18), (
            "gst_paise formula drifted from total - round(total/1.18)")

    @pytest.mark.parametrize("tier,components", [
        ("basic", ["physical"]),
        ("premium", ["digital", "physical"]),
        ("custom", ["digital", "video"]),
    ])
    def test_invitation_suite_public_sum_equals_order_total(self, tier, components, photographer_headers):
        pub = requests.get(f"{BASE_URL}/api/public/pricing/invitations",
                           headers=UA_HEADER, timeout=15).json()
        row = next(t for t in pub["tiers"] if t["key"] == tier)
        expected = sum(row["components"][c] for c in components)

        r = requests.post(f"{BASE_URL}/api/store/order/create", json={
            "design_id": "royal_heritage", "esign_agreed": True,
            "order_type": "invitation_suite", "invitation_tier": tier,
            "components": components}, headers=photographer_headers, timeout=20)
        assert r.status_code == 200, r.text
        order = requests.get(f"{BASE_URL}/api/store/order/{r.json()['order_id']}",
                             headers=photographer_headers, timeout=20).json()
        assert order["quote"]["total_inr"] == expected, \
            (tier, components, order["quote"]["total_inr"], expected)
        assert order["components"] == components

    def test_storage_public_equals_admin_plans_equals_catalog(self, photographer_headers):
        import pricing_catalog

        pub = requests.get(f"{BASE_URL}/api/public/pricing/storage",
                           headers=UA_HEADER, timeout=15).json()
        tier = next(t for t in pub["tiers"] if t["gb_limit"] == 1024)
        public_final = tier["cycles"]["180"]["final_inr"]

        plans = requests.get(f"{BASE_URL}/api/admin/studio-storage/plans",
                             headers=photographer_headers, timeout=15).json()["items"]
        row = next(p for p in plans if p["gb_limit"] == 1024 and p["duration_days"] == 180)

        catalog_row = next(t for t in pricing_catalog.STORAGE_TIERS if t["gb"] == 1024)

        assert public_final == row["price_inr"] == catalog_row["cycle_prices_inr"]["180"], (
            "public", public_final, "admin", row["price_inr"],
            "catalog", catalog_row["cycle_prices_inr"]["180"])


# =========================================================================== #
# ADMIN SYNC
# =========================================================================== #
class TestAdminSync:
    """A super-admin price edit must recompute and reach every serving
    surface immediately, and the one-time 2026 migration must never stomp a
    later edit on restart."""

    def test_put_base_monthly_recomputes_durations_and_public_reflects_it(self, super_admin_headers):
        import pricing_catalog

        tier_name = "Adv_Test_2026"
        plan_id = f"plan_portfolio_{tier_name.lower()}"

        create = requests.post(f"{BASE_URL}/api/admin/subscription-plans", json={
            "product": "portfolio", "tier": tier_name, "base_monthly": 500,
            "sort_order": 999, "is_active": True}, headers=super_admin_headers, timeout=20)
        assert create.status_code == 200, create.text
        assert create.json()["plan_id"] == plan_id

        try:
            put = requests.put(f"{BASE_URL}/api/admin/pricing/plans/{plan_id}",
                               json={"base_monthly": 1000}, headers=super_admin_headers, timeout=20)
            assert put.status_code == 200, put.text

            admin_rows = requests.get(f"{BASE_URL}/api/admin/pricing/plans",
                                      params={"product": "portfolio"},
                                      headers=super_admin_headers, timeout=20).json()["plans"]
            row = next(p for p in admin_rows if p["id"] == plan_id)
            assert row["base_monthly"] == 1000, row

            for cyc_key, catalog_cycle in (("1", "monthly"), ("3", "quarterly"),
                                           ("6", "half_yearly"), ("12", "yearly")):
                expected = pricing_catalog.compute_cycle_breakdown(1000, catalog_cycle)["final_paise"] // 100
                assert row["durations"][cyc_key] == expected, \
                    (cyc_key, row["durations"], expected)

            public_rows = requests.get(f"{BASE_URL}/api/subscriptions/plans",
                                       params={"product": "portfolio"},
                                       headers=UA_HEADER, timeout=20).json()["plans"]
            pub_row = next(p for p in public_rows if p["id"] == plan_id)
            assert pub_row["cycle_prices"]["monthly"]["paise"] == \
                pricing_catalog.compute_cycle_breakdown(1000, "monthly")["final_paise"], (
                "public /api/subscriptions/plans did not pick up the recomputed price")
        finally:
            async def _cleanup(db):
                await db.subscription_plans.delete_one({"id": plan_id})
            _db_call(_cleanup)

    def test_migration_marker_blocks_a_second_apply(self):
        import pricing_migration as mig

        async def _check(db):
            marker = await db.app_settings.find_one({"key": "pricing_2026_v1_applied"}, {"_id": 0})
            assert marker is not None, "the 2026 pricing migration marker is missing from app_settings"
            return await mig.apply_pricing_2026(db)

        result = _db_call(_check)
        assert result == {"skipped": "already applied"}, (
            f"apply_pricing_2026 did NOT no-op on a second call: {result} — a restart "
            "would silently stomp any super-admin price edit back to catalog defaults")


# =========================================================================== #
# HISTORICAL IMMUTABILITY
# =========================================================================== #
class TestHistoricalImmutability:
    def test_order_total_survives_a_later_price_change(self, photographer_headers):
        """A price row edited AFTER an order was placed must not re-price the
        already-settled order — every order stores its own quote at purchase
        time (docs §7: 'Historical orders/subscriptions are never re-priced';
        'migrations only deactivate/insert plan rows going forward')."""
        r = requests.post(f"{BASE_URL}/api/store/order/create", json={
            "design_id": "royal_heritage", "esign_agreed": True,
            "main_language": "english", "features": ["qr_live_gallery"]},
            headers=photographer_headers, timeout=20)
        assert r.status_code == 200, r.text
        order_id = r.json()["order_id"]

        before = requests.get(f"{BASE_URL}/api/store/order/{order_id}",
                              headers=photographer_headers, timeout=20).json()
        original_total = before["quote"]["total_inr"]
        assert original_total > 0

        async def _read_price(db):
            row = await db.store_features.find_one({"key": "qr_live_gallery"}, {"_id": 0})
            return row["price"]
        original_price = _db_call(_read_price)

        try:
            async def _mutate(db):
                await db.store_features.update_one(
                    {"key": "qr_live_gallery"}, {"$set": {"price": 1}})
            _db_call(_mutate)

            after = requests.get(f"{BASE_URL}/api/store/order/{order_id}",
                                 headers=photographer_headers, timeout=20).json()
            assert after["quote"]["total_inr"] == original_total, (
                "order was RE-PRICED by a later catalog price change — "
                f"was {original_total}, now {after['quote']['total_inr']}")
        finally:
            async def _restore(db):
                await db.store_features.update_one(
                    {"key": "qr_live_gallery"}, {"$set": {"price": original_price}})
                await db.invitation_orders.delete_one({"id": order_id})
            _db_call(_restore)
