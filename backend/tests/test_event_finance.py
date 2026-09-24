"""
Self-test for the finance & donation layer (Spec 08).

    cd backend && python -m tests.test_event_finance

Proves:
  1. Config: default donation/expense categories, suggested amounts, tiers.
  2. Budget is DERIVED and updates automatically from transactions.
  3. Donation verify → sequential receipt number; receipt payload respects anonymity.
  4. Public donation path validates amount/name, records as pending, no client-trusted total.
  5. Expense state machine: pending→approved→paid→closed; illegal jumps rejected.
  6. Dashboard cards + charts aggregate correctly.
  7. CSV report generates and masks anonymous donors.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_children_service as kids
import event_finance_service as fin


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


USER = {"user_id": "u1", "kind": "user"}


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, USER, "ganesh_chaturthi")
    eid = ev["event_id"]
    # publish so the public donation path can find it by slug
    await life.autosave(db, eid, USER, {
        "event_information": {"event_name": "Ganesh Utsav", "start_date": "2026-08-27", "end_date": "2026-09-06"},
        "venue_details": {"google_map_url": "https://maps.google.com/?q=1,2"},
        "organizer_information": {"phone": "9999999999"}})
    pub = await life.publish(db, eid, USER)
    event = await db.events.find_one({"event_id": eid})

    print("1. finance config")
    cfg = await fin.finance_config(db)
    _check(101 in cfg["suggested_amounts"] and "Prasadam" in cfg["donation_categories"],
           "suggested amounts + donation categories present")
    _check("Title Sponsor" in cfg["sponsor_tiers"] and "Pooja Items" in cfg["expense_categories"],
           "sponsor tiers + expense categories present")

    print("2. budget derives from transactions")
    b0 = await fin.get_budget(db, event)
    _check(b0["actual_income"] == 0 and b0["remaining_budget"] == 0, "empty budget is zero")
    await fin.set_budget(db, event, USER, {"target_collection": 10000, "estimated_expense": 4000})
    d1 = await kids.create_child(db, USER, eid, "donations", {"donor_name": "Ravi", "amount": 2000})
    await fin.verify_donation(db, event, USER, d1["id"])
    await kids.create_child(db, USER, eid, "sponsors", {"name": "ABC", "amount": 3000})
    b1 = await fin.get_budget(db, event)
    _check(b1["donations_received"] == 2000 and b1["sponsor_income"] == 3000
           and b1["actual_income"] == 5000, "income = received donations + active sponsors")
    _check(b1["collection_progress"] == 20.0, "collection progress vs target")

    print("3. receipts")
    d2 = await kids.create_child(db, USER, eid, "donations", {"donor_name": "Sita", "amount": 500})
    v2 = await fin.verify_donation(db, event, USER, d2["id"])
    _check(v2["receipt_number"].endswith("00002"), "receipt numbers are sequential")
    again = await fin.verify_donation(db, event, USER, d2["id"])
    _check(again.get("already_verified"), "re-verify is idempotent")
    anon = await kids.create_child(db, USER, eid, "donations",
                                   {"donor_name": "Hidden", "amount": 100, "is_anonymous": True})
    await fin.verify_donation(db, event, USER, anon["id"])
    rc = await fin.get_receipt(db, event, anon["id"])
    _check(rc["donor_name"] == "Anonymous", "receipt masks an anonymous donor")

    print("4. public donation path")
    await _expect(fin.submit_public_donation(db, pub["slug"], {"amount": 0, "donor_name": "X"}),
                  422, "zero amount rejected")
    await _expect(fin.submit_public_donation(db, pub["slug"], {"amount": 251}),
                  422, "missing name (non-anon) rejected")
    ok = await fin.submit_public_donation(db, pub["slug"], {"amount": 251, "donor_name": "Kiran", "category": "Food"})
    _check(ok["status"] == "pending" and ok["donation_id"], "public pledge recorded as pending")
    await _expect(fin.submit_public_donation(db, "no-such-slug", {"amount": 10, "donor_name": "Z"}),
                  404, "unknown event 404")

    print("5. expense approval state machine")
    e1 = await kids.create_child(db, USER, eid, "expenses", {"title": "Sound", "amount": 1500})
    await _expect(fin.transition_expense(db, event, USER, e1["id"], "paid"),
                  409, "cannot skip pending→paid")
    await fin.transition_expense(db, event, USER, e1["id"], "approved")
    await fin.transition_expense(db, event, USER, e1["id"], "paid")
    closed = await fin.transition_expense(db, event, USER, e1["id"], "closed")
    _check(closed["status"] == "closed", "pending→approved→paid→closed works")
    await _expect(fin.transition_expense(db, event, USER, e1["id"], "approved"),
                  409, "closed is terminal")
    b2 = await fin.get_budget(db, event)
    _check(b2["actual_expense_paid"] == 1500, "paid expense reduces balance automatically")

    print("6. dashboard")
    dash = await fin.dashboard(db, event)
    _check(dash["cards"]["total_donations"] == 2600, "donations card = 2000+500+100 received")
    _check(dash["cards"]["pending_approvals"] == 0, "no pending expenses left")
    _check("Food" not in dash["charts"]["donation_by_category"], "pending public donation not counted (not received)")
    _check(dash["charts"]["income_vs_expense"]["expense"] == 1500, "income vs expense chart")

    print("7. CSV report + anonymity")
    csv_text = await fin.report_csv(db, event, "donations")
    _check("Receipt Number" in csv_text and "Anonymous" in csv_text and "Hidden" not in csv_text,
           "donations CSV renders + masks anonymous donor")
    await _expect(fin.report_csv(db, event, "nope"), 404, "unknown report 404")

    print("8. online donation payment (Razorpay, server-side verify)")
    import hmac
    import hashlib
    os.environ["RAZORPAY_KEY_ID"] = "rzp_test_abc"
    os.environ["RAZORPAY_KEY_SECRET"] = "secret123"
    _check(fin.payments_configured(), "payments configured with test keys")
    dp = await kids.create_child(db, USER, eid, "donations", {"donor_name": "Payer", "amount": 1500})
    await db.donations.update_one({"id": dp["id"]}, {"$set": {"razorpay_order_id": "order_T1"}})
    sig = hmac.new(b"secret123", b"order_T1|pay_T1", hashlib.sha256).hexdigest()
    res = await fin.verify_donation_payment(db, {"razorpay_order_id": "order_T1",
                                                 "razorpay_payment_id": "pay_T1",
                                                 "razorpay_signature": sig})
    _check(res["verified"] and res["receipt_number"], "valid signature → received + receipt")
    # Idempotency: a re-submitted/duplicated verify must return the SAME receipt,
    # never mint a second one (regression for the missing-idempotency P1 fix).
    again = await fin.verify_donation_payment(db, {"razorpay_order_id": "order_T1",
                                                   "razorpay_payment_id": "pay_T1",
                                                   "razorpay_signature": sig})
    _check(again.get("receipt_number") == res["receipt_number"] and again.get("already"),
           "re-verify is idempotent → same receipt, already=True")
    await _expect(fin.verify_donation_payment(db, {"razorpay_order_id": "order_T1",
                                                   "razorpay_payment_id": "pay_T1",
                                                   "razorpay_signature": "deadbeef"}),
                  400, "forged signature rejected")
    os.environ["RAZORPAY_KEY_ID"] = "rzp_test_PLACEHOLDER"
    grace = await fin.create_donation_order(db, pub["slug"], {"amount": 251, "donor_name": "Off"})
    _check(grace["configured"] is False and grace["donation_id"],
           "no keys → graceful offline pledge (records, doesn't fail)")

    print("\nALL EVENT FINANCE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
