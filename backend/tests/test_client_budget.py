"""
test_client_budget.py — the studio's money ledger for one invitation.

    cd backend && python -m tests.test_client_budget

Money code gets a suspicious test suite: whole rupees only, no negatives, the
remaining amount always computed (never stored stale), an overpayment shown as its
own number instead of a negative balance, and a studio unable to read another
studio's ledger.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet          # noqa: E402
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException                # noqa: E402
from tests.test_storage_orchestrator import FakeDB   # noqa: E402
import client_budget as cb                       # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


def raises(fn, needle=""):
    try:
        fn()
        return False
    except HTTPException as e:
        return needle.lower() in str(e.detail).lower()
    except Exception:
        return False


def _eps(router, path, method="GET"):
    for r in router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return r.endpoint
    raise AssertionError(f"no endpoint {method} {path}")


async def main():
    print("=== amounts: whole rupees, nothing else ===")
    ok("plain int", cb.parse_amount(12000) == 12000)
    ok("comma-formatted string", cb.parse_amount("1,20,000") == 120000)
    ok("rupee sign stripped", cb.parse_amount("₹5000") == 5000)
    ok("float rounds to whole rupees", cb.parse_amount(2499.6) == 2500)
    ok("zero is allowed by the parser", cb.parse_amount(0) == 0)
    ok("negative refused", raises(lambda: cb.parse_amount(-1), "negative"))
    ok("junk refused", raises(lambda: cb.parse_amount("about ten thousand"), "must be a number"))
    ok("blank refused", raises(lambda: cb.parse_amount(""), "required"))
    ok("None refused", raises(lambda: cb.parse_amount(None), "required"))
    ok("a booking typo is caught", raises(lambda: cb.parse_amount(10 ** 12), "looks wrong"))

    print("\n=== dates ===")
    ok("a real date passes", cb.parse_date("2026-08-15") == "2026-08-15")
    ok("empty means no date set", cb.parse_date("") is None)
    ok("wrong shape refused", raises(lambda: cb.parse_date("15/08/2026"), "look like"))
    ok("impossible date refused", raises(lambda: cb.parse_date("2026-02-31"), "not a real date"))

    print("\n=== the summary maths ===")
    s = cb.summarise({"profile_id": "p1", "total_inr": 50000, "payments": [
        {"id": "a", "amount_inr": 20000, "date": "2026-07-01"},
        {"id": "b", "amount_inr": 5000, "date": "2026-07-20"}]})
    ok("paid is the sum of payments", s["paid_inr"] == 25000)
    ok("remaining is computed", s["remaining_inr"] == 25000)
    ok("percent paid", s["percent_paid"] == 50.0)
    ok("not settled yet", s["settled"] is False)
    ok("no phantom overpayment", s["overpaid_inr"] == 0)

    over = cb.summarise({"total_inr": 10000, "payments": [{"id": "a", "amount_inr": 12000}]})
    ok("overpayment never shows as negative remaining", over["remaining_inr"] == 0)
    ok("...it is its own number", over["overpaid_inr"] == 2000)
    ok("and it counts as settled", over["settled"] is True)

    empty = cb.summarise(None)
    ok("an untouched ledger is all zeros, not a crash",
       empty["total_inr"] == 0 and empty["paid_inr"] == 0 and empty["remaining_inr"] == 0)
    ok("no divide-by-zero on percent", empty["percent_paid"] == 0)
    ok("currency defaults to INR", empty["currency"] == "INR")

    unsorted = cb.summarise({"total_inr": 100, "payments": [
        {"id": "late", "amount_inr": 1, "date": "2026-09-01"},
        {"id": "early", "amount_inr": 1, "date": "2026-01-01"}]})
    ok("payments come back in date order",
       [p["id"] for p in unsorted["payments"]] == ["early", "late"])

    print("\n=== the endpoints ===")
    db = FakeDB()
    await db.profiles.insert_one({"id": "prof1", "admin_id": "studio_a",
                                  "bride_name": "Divya", "groom_name": "Arjun"})
    await db.profiles.insert_one({"id": "prof2", "admin_id": "studio_b"})
    await db.admins.insert_one({"id": "studio_a", "role": "admin"})
    A = {"admin_id": "studio_a", "role": "admin"}
    B = {"admin_id": "studio_b", "role": "admin"}
    OWNER = {"admin_id": "boss", "role": "super_admin"}

    router = cb.build_client_budget_router(db, get_current_admin=lambda: A)
    get = _eps(router, "/api/admin/profiles/{profile_id}/budget", "GET")
    put = _eps(router, "/api/admin/profiles/{profile_id}/budget", "PUT")
    pay = _eps(router, "/api/admin/profiles/{profile_id}/budget/payments", "POST")
    dele = _eps(router, "/api/admin/profiles/{profile_id}/budget/payments/{payment_id}", "DELETE")

    first = await get(profile_id="prof1", admin=A)
    ok("a fresh invitation has an empty ledger, not a 404", first["total_inr"] == 0)

    r = await put(profile_id="prof1", payload={"total_inr": "1,50,000", "due_date": "2026-08-15",
                                              "notes": "half now, half on the day"}, admin=A)
    ok("the agreed total is stored as whole rupees", r["total_inr"] == 150000)
    ok("the promised date is stored", r["due_date"] == "2026-08-15")
    ok("nothing is paid yet", r["paid_inr"] == 0 and r["remaining_inr"] == 150000)

    r = await pay(profile_id="prof1", payload={"amount_inr": 75000, "date": "2026-07-24",
                                              "note": "advance, UPI"}, admin=A)
    ok("a payment lands", r["paid_inr"] == 75000)
    ok("remaining drops", r["remaining_inr"] == 75000)
    ok("halfway", r["percent_paid"] == 50.0)
    ok("the note is kept", r["payments"][0]["note"] == "advance, UPI")

    r = await pay(profile_id="prof1", payload={"amount_inr": 75000}, admin=A)
    ok("a payment with no date defaults to today", bool(r["payments"][1]["date"]))
    ok("fully paid", r["remaining_inr"] == 0 and r["settled"] is True)

    try:
        await pay(profile_id="prof1", payload={"amount_inr": 0}, admin=A)
        ok("a zero payment is refused", False)
    except HTTPException as e:
        ok("a zero payment is refused", "not a payment" in str(e.detail))
    try:
        await pay(profile_id="prof1", payload={"amount_inr": -500}, admin=A)
        ok("a negative payment is refused", False)
    except HTTPException as e:
        ok("a negative payment is refused", "negative" in str(e.detail))

    pid = r["payments"][0]["id"]
    r = await dele(profile_id="prof1", payment_id=pid, admin=A)
    ok("deleting a payment recomputes everything", r["paid_inr"] == 75000 and r["remaining_inr"] == 75000)
    ok("it is really gone", all(p["id"] != pid for p in r["payments"]))
    try:
        await dele(profile_id="prof1", payment_id="nope", admin=A)
        ok("deleting an unknown payment 404s", False)
    except HTTPException as e:
        ok("deleting an unknown payment 404s", e.status_code == 404)

    print("\n=== who can see it ===")
    try:
        await get(profile_id="prof2", admin=A)
        ok("a studio cannot read another studio's ledger", False)
    except HTTPException as e:
        ok("a studio cannot read another studio's ledger", e.status_code == 403)
    try:
        await put(profile_id="prof2", payload={"total_inr": 1}, admin=A)
        ok("...nor write it", False)
    except HTTPException as e:
        ok("...nor write it", e.status_code == 403)
    owner_view = await get(profile_id="prof2", admin=OWNER)
    ok("the owner can see any ledger", owner_view["total_inr"] == 0)
    ok("studio_b sees its own", (await get(profile_id="prof2", admin=B))["profile_id"] == "prof2")
    try:
        await get(profile_id="ghost", admin=A)
        ok("an unknown invitation 404s", False)
    except HTTPException as e:
        ok("an unknown invitation 404s", e.status_code == 404)

    print("\n=== auth-dep shape (regression: 500 when wired with a str dep) ===")
    # The endpoint was wired with get_current_admin (returns a bare id STRING),
    # but the handlers read admin.get(...) — str.get() raised AttributeError -> 500.
    # _ctx() must tolerate a string admin so either dep shape works.
    s1 = await get(profile_id="prof1", admin="studio_a")
    ok("string admin (get_current_admin shape) does NOT 500", s1["total_inr"] == 150000)
    try:
        await get(profile_id="prof2", admin="studio_a")
        ok("string admin still enforces ownership (403)", False)
    except HTTPException as e:
        ok("string admin still enforces ownership (403)", e.status_code == 403)

    print("\n=== persistence ===")
    again = await get(profile_id="prof1", admin=A)
    ok("the ledger survives a re-read", again["total_inr"] == 150000 and again["paid_inr"] == 75000)
    ok("only one ledger doc per invitation",
       len(await db.client_budgets.find({"profile_id": "prof1"}, {"_id": 0}).to_list(10)) == 1)

    print("\n" + "=" * 60)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
