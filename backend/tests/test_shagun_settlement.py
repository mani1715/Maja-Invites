"""
Self-test for the Shagun settlement safety net.

    cd backend && PYTHONIOENCODING=utf-8 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m pytest tests/test_shagun_settlement.py -q

Shagun (guest sends the couple money as a wedding gift) uses the
PHOTOGRAPHER'S OWN Razorpay keys, not the platform's, so the platform-wide
event_payments.verify_webhook (single shared secret) can't authenticate a
callback for it. Before this: /shagun/razorpay/order created a Razorpay order
and returned it WITHOUT writing anything to the DB -- if the guest's browser
died after Razorpay captured the payment, the money was taken and nothing
ever recorded it.

Fix: /shagun/razorpay/order now writes a `shagun_intents` write-ahead row
(mirrors `upload_intents`, see media_reconcile.py), and
premium_features.reconcile_shagun_intents (the sweep) asks Razorpay directly
-- using that SAME photographer's keys -- whether an unverified order got
paid. Both the sweep and the browser's /shagun/razorpay/verify settle through
one shared, CAS-guarded helper, premium_features._settle_shagun, so a
shagun_records row is written exactly once no matter which path gets there
first.

In-memory FakeDB (tests.test_storage_orchestrator); no live stack; Razorpay's
`Client` is monkeypatched to a tiny in-memory fake exposing exactly the two
calls _settle_shagun makes: order.payments() (sweep, discovers the payment)
and payment.fetch() (browser, already knows the payment id).

Covers:
  1. order creation writes a `created` shagun_intents row.
  2. sweep settles a paid-but-unverified intent -- exactly once (a second
     sweep pass is a no-op, no duplicate shagun_records row).
  3. sweep leaves an unpaid intent alone (still `created`, untouched).
  4. sweep after /verify already settled -> no-op, no double record.
  5. browser /verify after the sweep already settled -> no-op, same record.
  6. no/invalid keys -> intent marked failed after the attempt cap; the sweep
     still settles a different, healthy intent in the SAME run.
  7. bounded cap -- `limit=` is respected even when more stale intents exist.
  8. terminal purge only removes old settled/failed rows, not fresh ones or
     a `created` row that's simply outside the 15-minute staleness window.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import razorpay  # noqa: E402 -- real package; only .Client gets monkeypatched

import premium_features as pf  # noqa: E402
from tests.test_storage_orchestrator import FakeDB  # noqa: E402


# --------------------------------------------------------------------------- #
# Fake Razorpay -- only the two calls _settle_shagun makes, plus order.create
# for the order-creation-side test.
# --------------------------------------------------------------------------- #
_STATE = {"order_payments": {}, "payments": {}}


def _reset_state():
    _STATE["order_payments"] = {}
    _STATE["payments"] = {}


class _FakeOrderAPI:
    def create(self, data):
        order_id = f"order_{uuid.uuid4().hex[:10]}"
        _STATE["order_payments"].setdefault(order_id, [])
        return {"id": order_id}

    def payments(self, order_id):
        return {"items": _STATE["order_payments"].get(order_id, [])}


class _FakePaymentAPI:
    def fetch(self, payment_id):
        pay = _STATE["payments"].get(payment_id)
        if pay is None:
            raise RuntimeError("no such payment")
        return pay


class _FakeRazorpayClient:
    def __init__(self, auth=None):
        self.auth = auth
        self.order = _FakeOrderAPI()
        self.payment = _FakePaymentAPI()


def setup_module(_m):
    razorpay.Client = _FakeRazorpayClient


def teardown_module(_m):
    pass  # process exits with the test run; no real Client to restore to


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
def _ago(**kw):
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat()


def _profile(pid="prof_1", key_id="rzp_test_key1", key_secret="secret1", fee=5.0):
    return {
        "id": pid, "slug": pid, "groom_name": "Aarav", "bride_name": "Riya",
        "shagun_settings": {
            "enabled": True, "razorpay_enabled": True,
            "razorpay_key_id": key_id, "razorpay_key_secret": key_secret,
            "platform_fee_percent": fee,
        },
    }


def _intent(iid, profile_id, order_id, status="created", created_at=None,
           guest_name="Priya Auntie", message="So happy for you!", attempts=0):
    return {
        "id": iid, "profile_id": profile_id, "razorpay_order_id": order_id,
        "guest_name": guest_name, "message": message, "amount_requested": 501,
        "status": status, "attempts": attempts,
        "created_at": created_at or _ago(minutes=20),
    }


def _sign(key_secret, order_id, payment_id):
    return hmac.new(key_secret.encode("utf-8"), f"{order_id}|{payment_id}".encode("utf-8"),
                    hashlib.sha256).hexdigest()


ADMIN = "ph_studio_one"


async def _noop_admin():
    raise NotImplementedError  # never called -- endpoints invoked directly


def _router(db):
    return pf.build_premium_router(db, _noop_admin, _noop_admin, lambda *a, **k: None)


def _endpoint(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


# --------------------------------------------------------------------------- #
# 1. order creation writes the write-ahead intent
# --------------------------------------------------------------------------- #
async def test_order_creation_writes_intent():
    print("\n[1] order creation writes a `created` shagun_intents row")
    _reset_state()
    db = FakeDB()
    await db.profiles.insert_one(_profile("prof_order"))
    order_ep = _endpoint(_router(db), "/api/invite/{slug}/shagun/razorpay/order", "POST")

    out = await order_ep("prof_order", {"amount": 501, "guest_name": "Priya Auntie",
                                        "message": "So happy for you!"})
    _check("order_id" in out, "order endpoint returns an order_id")

    intent = await db.shagun_intents.find_one({"razorpay_order_id": out["order_id"]}, {"_id": 0})
    _check(intent is not None, "order creation writes a shagun_intents row")
    _check(intent["status"] == "created", "intent starts as `created`")
    _check(intent["profile_id"] == "prof_order", "intent keyed to the right profile")
    _check(intent["guest_name"] == "Priya Auntie", "guest_name persisted for the sweep to use")
    _check(intent["message"] == "So happy for you!", "message persisted for the sweep to use")
    _check(intent["amount_requested"] == 501, "requested amount persisted")
    _check(intent.get("created_at"), "created_at stamped")


# --------------------------------------------------------------------------- #
# 2. sweep settles a paid-but-unverified intent, exactly once
# --------------------------------------------------------------------------- #
async def test_sweep_settles_unverified_paid_intent_exactly_once():
    print("\n[2] sweep settles a paid-but-unverified intent exactly once")
    _reset_state()
    db = FakeDB()
    await db.profiles.insert_one(_profile("prof_2"))
    order_id = "order_paid_2"
    await db.shagun_intents.insert_one(_intent("i2", "prof_2", order_id))
    _STATE["order_payments"][order_id] = [
        {"id": "pay_2", "status": "captured", "amount": 50100}]

    counts = await pf.reconcile_shagun_intents(db)
    _check(counts["settled"] == 1, "first pass settles the intent")

    records = await db.shagun_records.find({"profile_id": "prof_2"}, {"_id": 0}).to_list(10)
    _check(len(records) == 1, "exactly one shagun_records row written")
    rec = records[0]
    _check(rec["amount"] == 501, "amount converted from paise, from Razorpay's own record")
    _check(rec["platform_fee"] == 25.05, "5% platform fee split")
    _check(rec["photographer_amount"] == 475.95, "remainder credited to the photographer")
    _check(rec["guest_name"] == "Priya Auntie", "guest_name carried from the intent")
    _check(rec["verified"] is True and rec["status"] == "paid", "settled record marked verified/paid")

    intent = await db.shagun_intents.find_one({"id": "i2"}, {"_id": 0})
    _check(intent["status"] == "settled", "intent flipped to settled")
    _check(intent["settled_record_id"] == rec["id"], "intent links to the record it produced")

    counts2 = await pf.reconcile_shagun_intents(db)
    _check(counts2["settled"] == 0, "second pass finds nothing to do -- intent no longer `created`")
    records2 = await db.shagun_records.find({"profile_id": "prof_2"}, {"_id": 0}).to_list(10)
    _check(len(records2) == 1, "still exactly one record after a second sweep pass")


# --------------------------------------------------------------------------- #
# 3. sweep leaves an unpaid intent alone
# --------------------------------------------------------------------------- #
async def test_sweep_leaves_unpaid_intent_alone():
    print("\n[3] sweep leaves an unpaid intent alone")
    _reset_state()
    db = FakeDB()
    await db.profiles.insert_one(_profile("prof_3"))
    order_id = "order_unpaid_3"
    await db.shagun_intents.insert_one(_intent("i3", "prof_3", order_id))
    _STATE["order_payments"][order_id] = []  # never paid

    counts = await pf.reconcile_shagun_intents(db)
    _check(counts["not_captured"] == 1, "counted as not_captured, not settled/failed")
    _check(await db.shagun_records.count_documents({}) == 0, "no record written")

    intent = await db.shagun_intents.find_one({"id": "i3"}, {"_id": 0})
    _check(intent["status"] == "created", "intent left exactly as it was")
    _check(intent["attempts"] == 0, "not paid yet is not an error -- attempts not bumped")


# --------------------------------------------------------------------------- #
# 4. sweep after /verify already settled -> no-op
# --------------------------------------------------------------------------- #
async def test_sweep_after_verify_already_settled_is_noop():
    print("\n[4] sweep after /verify already settled -> no-op, no double record")
    _reset_state()
    db = FakeDB()
    profile = _profile("prof_4", key_secret="secret4")
    await db.profiles.insert_one(profile)
    order_id = "order_4"
    await db.shagun_intents.insert_one(_intent("i4", "prof_4", order_id))
    payment_id = "pay_4"
    _STATE["payments"][payment_id] = {"id": payment_id, "status": "captured", "amount": 50100}

    verify_ep = _endpoint(_router(db), "/api/invite/{slug}/shagun/razorpay/verify", "POST")
    sig = _sign("secret4", order_id, payment_id)
    out = await verify_ep("prof_4", {"razorpay_order_id": order_id, "razorpay_payment_id": payment_id,
                                     "razorpay_signature": sig})
    _check(out["success"] is True, "/verify settles first")

    counts = await pf.reconcile_shagun_intents(db)
    _check(counts["settled"] == 0 and counts["not_captured"] == 0,
          "already-settled intent is not even selected by the sweep")
    records = await db.shagun_records.find({"profile_id": "prof_4"}, {"_id": 0}).to_list(10)
    _check(len(records) == 1, "sweep did not double-write the record")


# --------------------------------------------------------------------------- #
# 5. browser /verify after the sweep already settled -> no-op
# --------------------------------------------------------------------------- #
async def test_verify_after_sweep_already_settled_is_noop():
    print("\n[5] browser /verify after the sweep already settled -> no-op")
    _reset_state()
    db = FakeDB()
    profile = _profile("prof_5", key_secret="secret5")
    await db.profiles.insert_one(profile)
    order_id = "order_5"
    await db.shagun_intents.insert_one(_intent("i5", "prof_5", order_id))
    payment_id = "pay_5"
    _STATE["order_payments"][order_id] = [
        {"id": payment_id, "status": "captured", "amount": 50100}]
    _STATE["payments"][payment_id] = {"id": payment_id, "status": "captured", "amount": 50100}

    counts = await pf.reconcile_shagun_intents(db)
    _check(counts["settled"] == 1, "sweep settles first")
    pre = await db.shagun_records.find({"profile_id": "prof_5"}, {"_id": 0}).to_list(10)
    _check(len(pre) == 1, "one record after the sweep")

    verify_ep = _endpoint(_router(db), "/api/invite/{slug}/shagun/razorpay/verify", "POST")
    sig = _sign("secret5", order_id, payment_id)
    out = await verify_ep("prof_5", {"razorpay_order_id": order_id, "razorpay_payment_id": payment_id,
                                     "razorpay_signature": sig})
    _check(out["success"] is True, "browser /verify still 200s")
    _check(out["record"]["id"] == pre[0]["id"], "browser gets back the SAME record the sweep created")

    post = await db.shagun_records.find({"profile_id": "prof_5"}, {"_id": 0}).to_list(10)
    _check(len(post) == 1, "browser /verify after the sweep does not double-write")


# --------------------------------------------------------------------------- #
# 6. no/invalid keys -> failed after attempt cap; sweep keeps going
# --------------------------------------------------------------------------- #
async def test_key_failure_marks_failed_after_cap_sweep_continues():
    print("\n[6] no/invalid keys -> intent failed after the attempt cap; sweep continues past it")
    _reset_state()
    db = FakeDB()
    # Photographer with no keys configured at all (empty secret) -- the exact
    # "photographer with no/invalid keys" case the task calls out; must
    # degrade quietly rather than raising out of the sweep.
    await db.profiles.insert_one(_profile("prof_bad", key_id="", key_secret=""))
    await db.shagun_intents.insert_one(_intent("i_bad", "prof_bad", "order_bad"))

    # A second, healthy intent in the SAME run -- proves one bad row doesn't
    # take down the rest of the sweep.
    await db.profiles.insert_one(_profile("prof_good", key_secret="secretgood"))
    _STATE["order_payments"]["order_good"] = [
        {"id": "pay_good", "status": "captured", "amount": 20000}]
    await db.shagun_intents.insert_one(_intent("i_good", "prof_good", "order_good"))

    for i in range(pf.SHAGUN_INTENT_MAX_ATTEMPTS):
        counts = await pf.reconcile_shagun_intents(db)
        bad = await db.shagun_intents.find_one({"id": "i_bad"}, {"_id": 0})
        if bad["status"] == "failed":
            break
        _check(bad["status"] == "created", f"pass {i+1}: still retryable, attempts={bad['attempts']}")

    bad = await db.shagun_intents.find_one({"id": "i_bad"}, {"_id": 0})
    _check(bad["status"] == "failed", "bad-key intent terminally failed after the attempt cap")
    _check(bad["attempts"] == pf.SHAGUN_INTENT_MAX_ATTEMPTS, "attempts capped at the max")
    _check(await db.shagun_records.count_documents({"profile_id": "prof_bad"}) == 0,
          "no phantom record for the never-settleable intent")

    good = await db.shagun_intents.find_one({"id": "i_good"}, {"_id": 0})
    _check(good["status"] == "settled", "the healthy intent settled despite the other one failing")
    _check(await db.shagun_records.count_documents({"profile_id": "prof_good"}) == 1,
          "healthy intent produced exactly one record")


# --------------------------------------------------------------------------- #
# 7. bounded cap
# --------------------------------------------------------------------------- #
async def test_sweep_respects_bounded_cap():
    print("\n[7] sweep respects the bounded per-run cap")
    _reset_state()
    db = FakeDB()
    await db.profiles.insert_one(_profile("prof_cap"))
    for n in range(5):
        order_id = f"order_cap_{n}"
        await db.shagun_intents.insert_one(_intent(f"i_cap_{n}", "prof_cap", order_id))
        _STATE["order_payments"][order_id] = []  # unpaid -- cheap, deterministic to count

    counts = await pf.reconcile_shagun_intents(db, limit=3)
    _check(counts["not_captured"] == 3, "only `limit` rows processed in one run, not all 5")


# --------------------------------------------------------------------------- #
# 8. terminal purge
# --------------------------------------------------------------------------- #
async def test_terminal_purge_removes_only_old_terminal_rows():
    print("\n[8] terminal purge removes only old settled/failed rows")
    _reset_state()
    db = FakeDB()
    old, fresh = _ago(days=35), _ago(days=5)
    await db.shagun_intents.insert_one(
        _intent("i_settled_old", "p", "o1", status="settled", created_at=old))
    await db.shagun_intents.insert_one(
        _intent("i_failed_old", "p", "o2", status="failed", created_at=old))
    await db.shagun_intents.insert_one(
        _intent("i_settled_fresh", "p", "o3", status="settled", created_at=fresh))
    # `created` row: recent enough (1 minute) to be outside the 15-minute
    # staleness window, so the main sweep loop never touches it -- isolates
    # this test to the purge step, same convention as
    # test_upload_intents_sweep.test_terminal_purge_removes_only_old_terminal_rows.
    await db.shagun_intents.insert_one(
        _intent("i_created_recent", "p", "o4", status="created", created_at=_ago(minutes=1)))

    counts = await pf.reconcile_shagun_intents(db)
    _check(counts["purged"] == 2, "only the two OLD terminal rows purged")
    remaining = {d["id"] async for d in db.shagun_intents.find({})}
    _check(remaining == {"i_settled_fresh", "i_created_recent"},
          "fresh terminal row and the recent `created` row both survive")


if __name__ == "__main__":
    import asyncio

    async def _run_all():
        await test_order_creation_writes_intent()
        await test_sweep_settles_unverified_paid_intent_exactly_once()
        await test_sweep_leaves_unpaid_intent_alone()
        await test_sweep_after_verify_already_settled_is_noop()
        await test_verify_after_sweep_already_settled_is_noop()
        await test_key_failure_marks_failed_after_cap_sweep_continues()
        await test_sweep_respects_bounded_cap()
        await test_terminal_purge_removes_only_old_terminal_rows()
        print("\nALL SHAGUN SETTLEMENT CHECKS PASSED")

    asyncio.run(_run_all())
