"""
Ganesh v2 — Phase 1 (registry & schema expansion) self-test.

    cd backend && python -m tests.test_event_ganesh_v2

Proves the v2 foundation: the 9 new builder sections exist (23 total), the feature-key
map is exposed, the new child collections CRUD through the generic engine, the per-day
schedule accepts the v2 fields (items / special-day), and blessings moderation works.
No Postgres — in-memory FakeDB. Wedding side untouched.
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

from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_children_service as kids

USER = {"user_id": "u1", "kind": "user"}


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    cfg = registry.get_config("ganesh_chaturthi")
    keys = [s["key"] for s in cfg["sections"]]

    print("1. registry — v2 sections present")
    _check(len(keys) == 23, "23 builder sections")
    for k in ("languages", "about_festival", "celebration_journey", "special_highlights",
              "dress_code", "prasadam_menu", "blessings_wall", "donation_config", "countdown"):
        _check(k in keys, f"section '{k}' registered")
    _check(cfg.get("free_edits") == 15, "free_edits locked to 15")

    print("2. feature-key map (plan mapping)")
    fk = cfg.get("feature_keys") or []
    for k in ("money_portal", "per_day_photos", "blessings_wall", "spending_folders"):
        _check(k in fk, f"feature key '{k}' available for plans")

    print("3. hero + parking + language fields")
    ei = {s["key"]: s for s in cfg["sections"]}["event_information"]
    ei_fields = [f["key"] for f in ei["fields"]]
    _check("festival_edition" in ei_fields and "since_year" in ei_fields, "hero has Nth-year fields")
    ven = {s["key"]: s for s in cfg["sections"]}["venue_details"]
    _check("parking_available" in [f["key"] for f in ven["fields"]], "venue has parking fields")

    print("4. new child collections registered in schema")
    for c in ("celebration_journey", "highlights", "prasadam_menu", "event_blessings"):
        _check(c in schema.COLLECTIONS, f"schema knows '{c}'")
        _check(schema.is_soft_deletable(c), f"'{c}' is soft-deletable")

    ev = await life.create_draft(db, USER, "ganesh_chaturthi")
    eid = ev["event_id"]

    print("5. celebration journey CRUD (sorted by year)")
    await kids.create_child(db, USER, eid, "celebration_journey", {"year": 2020, "label": "Faith"})
    await kids.create_child(db, USER, eid, "celebration_journey", {"year": 2018, "label": "Beginning"})
    lst = await kids.list_children(db, USER, eid, "celebration_journey")
    _check([r["year"] for r in lst["items"]] == [2018, 2020], "journey sorted ascending by year")

    print("6. per-day schedule accepts v2 fields (items + special day)")
    day = await kids.create_child(db, USER, eid, "festival_schedule", {
        "festival_day": 1, "day_label": "Sthapana Day", "date": "2026-09-16",
        "is_special": True, "special_kind": "festival", "special_note": "Main day",
        "items": [{"time": "08:45 AM", "title": "Ganapathi Sthapana", "kind": "sthapana"},
                  {"time": "12:00 PM", "title": "Maha Harathi", "kind": "harathi"}]})
    got = await kids.get_child(db, USER, eid, "festival_schedule", day["id"])
    _check(got["is_special"] is True and len(got["items"]) == 2, "day stores special flag + items list")

    print("7. highlights + prasadam menu CRUD")
    await kids.create_child(db, USER, eid, "highlights", {"title": "Annadanam"})
    await kids.create_child(db, USER, eid, "prasadam_menu", {"item": "Modakam"})
    _check((await kids.list_children(db, USER, eid, "highlights"))["total"] == 1, "highlight created")
    _check((await kids.list_children(db, USER, eid, "prasadam_menu"))["total"] == 1, "prasadam item created")

    print("8. blessings wall — create + moderate")
    b = await kids.create_child(db, USER, eid, "event_blessings",
                                {"guest_name": "Ravi", "message": "Ganapathi Bappa Morya!"})
    _check(b["status"] == "pending", "guest blessing starts pending")
    await kids.act_on_child(db, USER, eid, "event_blessings", b["id"], "approve")
    await kids.act_on_child(db, USER, eid, "event_blessings", b["id"], "feature")
    got = await kids.get_child(db, USER, eid, "event_blessings", b["id"])
    _check(got["status"] == "approved" and got["is_featured"] is True, "blessing approved + featured")

    print("\nALL GANESH v2 PHASE-1 TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
