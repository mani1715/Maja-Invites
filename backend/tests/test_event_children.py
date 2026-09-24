"""
Self-test for the child-collection CRUD engine (Spec 05).

    cd backend && python -m tests.test_event_children

No Postgres — reuses the in-memory FakeDB. Proves:
  1. Create validates required fields; unknown fields are dropped (§23).
  2. List paginates, searches, filters, sorts (§24).
  3. Get/update/delete are ownership-gated through the PARENT event (404/403).
  4. Soft-delete collections hide deleted rows; a foreign owner is blocked.
  5. Reorder sets display_order; non-orderable collections reject it.
  6. Status actions (approve/reject, activate/deactivate, mark_received) apply.
  7. Unknown collection / unknown action → 404.
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


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


USER = {"user_id": "u1", "kind": "user"}
OTHER = {"user_id": "u2", "kind": "user"}


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

    print("1. create + input validation")
    await _expect(kids.create_child(db, USER, eid, "committee_members", {"role": "treasurer"}),
                  422, "missing required name rejected")
    m1 = await kids.create_child(db, USER, eid, "committee_members",
                                 {"name": "Ravi", "role": "treasurer", "hacker": "x", "display_order": 0})
    _check(m1["name"] == "Ravi" and "hacker" not in m1, "created; unknown field dropped")
    m2 = await kids.create_child(db, USER, eid, "committee_members",
                                 {"name": "Sita", "role": "volunteer", "display_order": 1})

    print("2. list / search / filter / paginate")
    lst = await kids.list_children(db, USER, eid, "committee_members")
    _check(lst["total"] == 2 and lst["items"][0]["name"] == "Ravi", "list ordered by display_order")
    s = await kids.list_children(db, USER, eid, "committee_members", search="sita")
    _check(s["total"] == 1 and s["items"][0]["name"] == "Sita", "search matches name")
    f = await kids.list_children(db, USER, eid, "committee_members", filters={"role": "treasurer"})
    _check(f["total"] == 1, "filter by role")
    pg = await kids.list_children(db, USER, eid, "committee_members", limit=1, page=2)
    _check(pg["pages"] == 2 and len(pg["items"]) == 1, "pagination page 2")

    print("3. ownership gate (through parent event)")
    await _expect(kids.list_children(db, OTHER, eid, "committee_members"), 403, "foreign owner blocked")
    await _expect(kids.create_child(db, USER, "evt_nope", "committee_members", {"name": "X", "role": "y"}),
                  404, "unknown event 404")
    await _expect(kids.get_child(db, USER, eid, "committee_members", "mem_nope"), 404, "unknown child 404")

    print("4. update + soft delete")
    up = await kids.update_child(db, USER, eid, "committee_members", m1["id"], {"phone": "999", "hacker": 1})
    _check(up["phone"] == "999" and "hacker" not in up, "update applies allow-listed only")
    await _expect(kids.update_child(db, USER, eid, "committee_members", m1["id"], {"name": ""}),
                  422, "cannot null a required field")
    d = await kids.delete_child(db, USER, eid, "committee_members", m2["id"])
    _check(d["soft"] is True, "committee soft-deletes")
    _check((await kids.list_children(db, USER, eid, "committee_members"))["total"] == 1,
           "soft-deleted row hidden from list")
    await _expect(kids.get_child(db, USER, eid, "committee_members", m2["id"]), 404, "soft-deleted get 404")

    print("5. reorder")
    a = await kids.create_child(db, USER, eid, "festival_schedule", {"festival_day": 1, "day_label": "Day 1"})
    b = await kids.create_child(db, USER, eid, "festival_schedule", {"festival_day": 2, "day_label": "Day 2"})
    ro = await kids.reorder_children(db, USER, eid, "festival_schedule", [b["id"], a["id"]])
    _check(ro["reordered"] == 2, "reorder touched both")
    first = (await kids.list_children(db, USER, eid, "festival_schedule"))["items"][0]
    _check(first["id"] == b["id"], "reorder put Day 2 first")
    await _expect(kids.reorder_children(db, USER, eid, "donations", []), 409, "non-orderable rejects reorder")

    print("6. status actions")
    exp = await kids.create_child(db, USER, eid, "expenses", {"title": "Decor", "amount": 5000})
    _check(exp["approval_status"] == "pending", "expense starts pending")
    act = await kids.act_on_child(db, USER, eid, "expenses", exp["id"], "approve")
    _check(act["approval_status"] == "approved", "expense approved")
    don = await kids.create_child(db, USER, eid, "donations", {"donor_name": "Kiran", "amount": 1100})
    mr = await kids.act_on_child(db, USER, eid, "donations", don["id"], "mark_received")
    got = await kids.get_child(db, USER, eid, "donations", don["id"])
    _check(mr["status"] == "received" and got.get("paid_at"), "offline donation marked received + paid_at set")
    sp = await kids.create_child(db, USER, eid, "sponsors", {"name": "ABC Corp", "tier": "gold"})
    await kids.act_on_child(db, USER, eid, "sponsors", sp["id"], "deactivate")
    _check((await kids.get_child(db, USER, eid, "sponsors", sp["id"]))["is_active"] is False,
           "sponsor deactivated")

    print("7. unknown collection / action")
    await _expect(kids.list_children(db, USER, eid, "not_a_collection"), 404, "unknown collection 404")
    await _expect(kids.act_on_child(db, USER, eid, "expenses", exp["id"], "explode"), 404, "unknown action 404")

    print("8. amount=0 allowed for a zero-value donation")
    z = await kids.create_child(db, USER, eid, "donations", {"donor_name": "Zero", "amount": 0})
    _check(z["amount"] == 0, "amount 0 is a valid amount (not 'missing')")

    print("9. public field metadata (config-driven forms)")
    meta = kids.collections_meta()
    _check(set(meta) == set(kids.CHILD_SPECS), "meta covers every child collection")
    _check("name" in meta["committee_members"]["fields"]
           and meta["committee_members"]["required"] == ["name", "role"],
           "committee meta exposes fields + required")
    _check(meta["expenses"]["actions"] == ["approve", "reject"], "expense actions exposed")

    print("\nALL CHILD-COLLECTION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
