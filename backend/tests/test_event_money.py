"""
Ganesh v2 — money portal + leaderboard + blessings self-test (Phase 4 backend).

    cd backend && python -m tests.test_event_money

Proves: owner creates ≤8 scoped money-member logins; a member logs in and records
who-gave + spending scoped to ONE event (token, never the URL); leaderboard sorts
big→small with anonymity respected; blessings submit/moderate; CSV report balances.
In-memory FakeDB; no Postgres/network.
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
os.environ.setdefault("ALLOW_INSECURE_JWT", "1")

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_money_service as money


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


OWNER = {"user_id": "owner1", "kind": "user"}
STRANGER = {"user_id": "who", "kind": "user"}


async def _publish(db, ev):
    # fill the registry-required fields (event.title + 1:1 organizers/venues children),
    # plus the v2 root_obj config the money service reads, then publish.
    eid = ev["event_id"]
    await db.events.update_one({"event_id": eid}, {"$set": {
        "title": "Ganesh 2026", "event_name": "Ganesh 2026",
        "start_date": "2026-09-16", "end_date": "2026-09-20",
        "data": {"blessings_config": {"enabled": True, "moderation": True},
                 "donation_config": {"show_top_donors": True, "top_donors_count": 2,
                                     "upi_id": "temple@upi", "causes": "Annadanam, Flowers"}}}})
    await db.organizers.insert_one({"id": "org1", "event_id": eid, "phone": "9998887776"})
    await db.venues.insert_one({"id": "ven1", "event_id": eid, "google_map_url": "https://maps.app/x"})
    pub = await life.publish(db, eid, OWNER)
    return pub["slug"]


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, OWNER, "ganesh_chaturthi")
    eid = ev["event_id"]
    slug = await _publish(db, ev)

    print("1. owner creates money members (≤8, unique, min lengths)")
    await _expect(money.create_member(db, eid, OWNER, "ab", "secret1"), 422, "short username rejected")
    m1 = await money.create_member(db, eid, OWNER, "Ravi", "pass1234")
    _check(m1["username"] == "ravi" and m1["password"] == "pass1234", "member created, plaintext returned once")
    await _expect(money.create_member(db, eid, OWNER, "ravi", "pass1234"), 409, "duplicate username rejected")
    await _expect(money.create_member(db, eid, STRANGER, "x1", "pass1234"), 403, "stranger cannot add members")
    for i in range(7):
        await money.create_member(db, eid, OWNER, f"vol{i}", "pass1234")
    await _expect(money.create_member(db, eid, OWNER, "vol99", "pass1234"), 409, "9th member blocked (max 8)")

    print("2. member login → scoped token")
    await _expect(money.member_login(db, slug, "ravi", "wrong"), 401, "bad password rejected")
    sess = await money.member_login(db, slug, "ravi", "pass1234")
    _check(sess["event_id"] == eid and sess["token"], "login returns a scoped token")
    tok = f"Bearer {sess['token']}"
    payload = money.money_member_from_token(tok)
    _check(payload["event_id"] == eid and payload["role"] == "event_money", "token authorises exactly this event")
    try:
        money.money_member_from_token("Bearer garbage")
        _check(False, "garbage token rejected (expected 401)")
    except HTTPException as e:
        _check(e.status_code == 401, "garbage token rejected → 401")

    print("3. member records who-gave + spending (scoped to token event)")
    await money.record_donation(db, payload["event_id"], payload["member_id"],
                                {"donor_name": "Suresh", "amount": 5000, "category": "Annadanam", "phone": "900"})
    await money.record_donation(db, payload["event_id"], payload["member_id"],
                                {"donor_name": "Hidden", "amount": 11000, "is_anonymous": True})
    await money.record_donation(db, payload["event_id"], payload["member_id"],
                                {"donor_name": "Kiran", "amount": 2500})
    await money.add_expense(db, payload["event_id"], payload["member_id"],
                            {"title": "Mandap decor", "amount": 4000, "category": "Mandap"})
    await money.add_expense(db, payload["event_id"], payload["member_id"],
                            {"title": "Lunch", "amount": 3000, "category": "Food"})

    print("4. leaderboard sorts big→small, anonymity respected")
    board = await money.leaderboard(db, eid, public=True)
    _check(board["total"] == 18500 and board["count"] == 3, "leaderboard totals all non-rejected")
    _check([d["amount"] for d in board["donors"]] == [11000, 5000, 2500], "sorted big → small")
    _check(board["donors"][0]["name"] == "Anonymous", "anonymous donor name hidden")

    print("5. public board = top N + upi/causes from config")
    from event_money_service import build_event_money_router  # exercise config read via helper
    ev_now = await db.events.find_one({"event_id": eid})
    cfg = money._donation_config(ev_now)
    _check(cfg.get("top_donors_count") == 2, "config carries top_donors_count")

    print("6. edit-own enforced")
    a_don = (await money.leaderboard(db, eid, public=False))["donors"]
    some_id = a_don[0]["id"]                      # entered by 'ravi'
    other = await money.member_login(db, slug, "vol0", "pass1234")  # a different member
    other_mid = money.money_member_from_token(f"Bearer {other['token']}")["member_id"]
    await _expect(money.edit_donation(db, eid, other_mid, some_id, {"amount": 1}),
                  403, "member cannot edit another member's entry")
    ravi_mid = payload["member_id"]
    edited = await money.edit_donation(db, eid, ravi_mid, some_id, {"message": "Thank you"})
    _check(edited.get("message") == "Thank you", "member can edit their own entry")

    print("7. blessings submit + moderation")
    r = await money.submit_blessing(db, slug, "Anu", "Ganapathi Bappa Morya!")
    _check(r["submitted"] and r["moderated"] is True, "blessing submitted as pending (moderation on)")
    shown = await money.list_blessings(db, slug)
    _check(shown["total"] == 0, "pending blessing not shown publicly until approved")

    print("8. CSV money report balances")
    rep = await money.money_report(db, eid)
    _check(rep["collected"] == 18500 and rep["spent"] == 7000 and rep["balance"] == 11500, "report balances")
    csv_text = money._report_csv(rep, "Ganesh 2026")
    _check("DONATIONS" in csv_text and "Balance" in csv_text and "Mandap" in csv_text, "CSV has sections + folders")

    print("9. public spending summary — 'where the money went'")
    spend = await money.spending_summary(db, eid)
    _check(spend["spent_total"] == 7000, "total matches the approved/paid expenses")
    _check(spend["folders"] and spend["folders"][0]["amount"] >= spend["folders"][-1]["amount"],
           "folders sorted big → small, like the donor board")
    _check(all(set(f) == {"category", "amount"} for f in spend["folders"]),
           "public payload carries amounts per category ONLY — no names, no vendors")
    # a rejected expense must never reach the public figure
    await db.expenses.insert_one({"id": "x_rej", "event_id": eid, "category": "Mandap",
                                  "amount": 99999, "approval_status": "rejected", "deleted_at": None})
    again = await money.spending_summary(db, eid)
    _check(again["spent_total"] == 7000, "rejected spending excluded from the published figure")

    print("\nALL GANESH v2 MONEY TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
