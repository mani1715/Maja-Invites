"""
test_support_desk.py — Support Desk lifecycle on the in-memory FakeDB.

    cd backend && python -m tests.test_support_desk

Proves the ticketing logic end-to-end without Postgres/network: create → admin
reply (first-response SLA clock) → assign/priority → resolve → requester reopen →
filters/search/pagination → merge → stats → audit trail → internal-note privacy.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB            # noqa: E402
import support_tickets as st                                  # noqa: E402

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


async def seed(db):
    await db.users.insert_one({"user_id": "u1", "name": "Aditi", "email": "aditi@example.com"})
    await db.admins.insert_one({"id": "a1", "name": "Support Sam", "role": "admin"})


async def main():
    db = FakeDB()
    await seed(db)

    # --- create ---------------------------------------------------------------
    requester = await st._requester_identity(db, {"user_id": "u1", "kind": "user"})
    ok("requester identity resolves name/email", requester["name"] == "Aditi" and requester["email"] == "aditi@example.com")

    t = await st.create_ticket(db, requester, "Refund not received",
                               "I paid but no link yet", category="refund", priority="high")
    tid = t["id"]
    ok("ticket created open", t["status"] == "open")
    ok("ticket keeps flat requester_id", t["requester_id"] == "u1")
    ok("category accepted", t["category"] == "refund")
    ok("priority accepted", t["priority"] == "high")
    ok("first message counted", t["message_count"] == 1)
    ok("no first response yet", t["first_response_at"] is None)

    # invalid category falls back; empty subject rejected
    t2 = await st.create_ticket(db, requester, "Help", "cannot login", category="bogus")
    ok("invalid category → other", t2["category"] == "other")
    try:
        await st.create_ticket(db, requester, "", "x")
        ok("empty subject rejected", False)
    except ValueError:
        ok("empty subject rejected", True)

    # --- admin reply stamps first-response SLA --------------------------------
    await st.add_message(db, tid, {"id": "a1", "kind": "admin", "name": "Sam"},
                         "Looking into it now.", internal=False)
    tk = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    ok("first_response_at set on admin reply", tk["first_response_at"] is not None)
    ok("message_count incremented", tk["message_count"] == 2)

    # internal note is private + does not bump the public counter
    await st.add_message(db, tid, {"id": "a1", "kind": "admin", "name": "Sam"},
                         "Checked Razorpay — genuine.", internal=True)
    pub = await st.list_messages(db, tid, include_internal=False)
    allm = await st.list_messages(db, tid, include_internal=True)
    ok("internal note hidden from requester view", len(pub) == 2 and len(allm) == 3)

    # --- assign + priority via update_ticket (audited) ------------------------
    await st.update_ticket(db, tid, {"assignee_admin_id": "a1", "priority": "urgent"},
                           actor_admin_id="a1", assignee_name="Support Sam")
    tk = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    ok("assignee set", tk["assignee_admin_id"] == "a1" and tk["assignee_name"] == "Support Sam")
    ok("priority updated", tk["priority"] == "urgent")
    audits = await db.audit_logs.find({"target": tid}, {"_id": 0}).to_list(100)
    ok("admin action audited", any(a.get("action") == "support.ticket_update" for a in audits))

    # invalid status rejected
    try:
        await st.update_ticket(db, tid, {"status": "banana"}, actor_admin_id="a1")
        ok("invalid status rejected", False)
    except ValueError:
        ok("invalid status rejected", True)

    # --- resolve then requester reply reopens ---------------------------------
    await st.update_ticket(db, tid, {"status": "resolved"}, actor_admin_id="a1")
    tk = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    ok("resolved_at stamped", tk["status"] == "resolved" and tk["resolved_at"] is not None)

    await st.add_message(db, tid, {"id": "u1", "kind": "user", "name": "Aditi"},
                         "Still not received!", internal=False)
    tk = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    ok("requester reply reopens", tk["status"] == "reopened" and tk["resolved_at"] is None)

    # --- filters / search / pagination ----------------------------------------
    listing = await st.list_tickets(db, status="reopened")
    ok("filter by status", listing["total"] == 1 and listing["items"][0]["id"] == tid)
    listing = await st.list_tickets(db, priority="urgent")
    ok("filter by priority", any(i["id"] == tid for i in listing["items"]))
    listing = await st.list_tickets(db, q="aditi")
    ok("search by requester name/email", listing["total"] >= 1)
    listing = await st.list_tickets(db, assignee="unassigned")
    ok("filter unassigned excludes assigned", all(i["id"] != tid for i in listing["items"]))
    page1 = await st.list_tickets(db, page=1, page_size=1)
    ok("pagination shapes", page1["page_size"] == 1 and page1["pages"] >= 2 and len(page1["items"]) == 1)

    # --- merge ----------------------------------------------------------------
    dup = await st.create_ticket(db, requester, "Refund duplicate", "same issue", category="refund")
    res = await st.merge_ticket(db, dup["id"], tid, actor_admin_id="a1")
    ok("merge moved messages", res["into"] == tid and res["moved_messages"] >= 1)
    merged = await db.support_tickets.find_one({"id": dup["id"]}, {"_id": 0})
    ok("merged source closed + flagged", merged["merged_into"] == tid and merged["status"] == "closed")
    listing = await st.list_tickets(db)
    ok("merged ticket excluded from queue", all(i["id"] != dup["id"] for i in listing["items"]))

    # --- stats ----------------------------------------------------------------
    stats = await st.ticket_stats(db)
    ok("stats open count", stats["open"] >= 1)
    ok("stats avg first-response computed", stats["avg_first_response_hours"] is not None)
    ok("stats by_status present", "reopened" in stats["by_status"])
    ok("stats sla fields", stats["sla_first_response_hours"] == 24 and "sla_breaches" in stats)

    print(f"\nSupport Desk: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
