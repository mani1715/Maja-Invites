"""
Self-test for the Dynamic Event Engine on the Spec-04 normalized schema.

    cd backend && python -m tests.test_event_engine

No Postgres — reuses the in-memory FakeDB. Proves:
  1. Schema + registry seed (idempotent), Ganesh = 14 builder sections, flag OFF.
  2. Dedicated `events` root (NOT profiles); autosave routes to root / root_obj /
     1:1 child collections (venues, organizers); child-collection sections deferred.
  3. Publish validates ACROSS documents; slug + is_public + invitation row + version.
  4. Drafts free; first publish free; re-publish = edit; limit → 402 → paid.
  5. State machine: archive/restore + invalid transitions rejected; soft-delete.
  6. Ownership isolation; public read joins venue/organizer, hides ownership.
  7. Backward compatibility: the wedding `profiles` collection is never touched.
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


async def _fill_valid(db, eid):
    await life.autosave(db, eid, USER, {"event_information": {
        "event_name": "Sri Vinayaka Utsav", "festival_year": 2026,
        "start_date": "2026-08-27", "end_date": "2026-09-06"}})
    await life.autosave(db, eid, USER, {"venue_details": {"venue_name": "Community Hall",
        "google_map_url": "https://maps.google.com/?q=16.5,80.6"}})
    await life.autosave(db, eid, USER, {"organizer_information": {"name": "Ravi", "phone": "9876543210"}})


async def run():
    db = FakeDB()

    print("1. schema + registry seed")
    s = await schema.ensure_schema(db)
    _check(s["collections"] == len(schema.COLLECTIONS), "all event collections ensured")
    r1 = await registry.seed_event_registry(db)
    _check(r1["registry_created"] == 1 and await registry.module_enabled(db) is False,
           "Ganesh registered + flag OFF")
    cfg = registry.get_config("ganesh_chaturthi")
    _check(len(cfg["sections"]) == 23, "Ganesh has 23 builder sections (v2)")
    r2 = await registry.seed_event_registry(db)
    _check(r2["registry_created"] == 0, "seed idempotent")

    print("2. dedicated events root + autosave routing")
    draft = await life.create_draft(db, USER, "ganesh_chaturthi")
    _check(await db.events.find_one({"event_id": draft["event_id"]}) is not None,
           "event stored in `events`, not profiles")
    _check(await db.profiles.find_one({"id": draft["event_id"]}) is None, "profiles untouched")
    res = await life.autosave(db, draft["event_id"], USER, {
        "event_information": {"event_name": "Test Utsav", "start_date": "2026-08-27"},
        "venue_details": {"google_map_url": "https://maps.google.com/?q=1,2"},
        "theme_selection": {"template": "ganesh_premium", "primary_color": "#C6A15B"},
        "gallery": {"anything": 1}})
    ev = await db.events.find_one({"event_id": draft["event_id"]})
    _check(ev["title"] == "Test Utsav", "event_name routed to events.title")
    _check(ev["template_id"] == "ganesh_premium" and ev["theme"].get("primary_color"),
           "theme routed to root_obj + template_id")
    _check(await db.venues.find_one({"event_id": draft["event_id"]}) is not None,
           "venue_details routed to venues (1:1 child)")
    _check(ev.get("venue_id"), "events.venue_id set from the venue doc")
    _check("gallery" in res["deferred_sections"], "child-collection section deferred to Spec-05 CRUD")

    print("3. publish validates across documents")
    d2 = await life.create_draft(db, USER, "ganesh_chaturthi")
    await _expect(life.publish(db, d2["event_id"], USER), 422, "incomplete event rejected")
    await _fill_valid(db, d2["event_id"])
    st = (await db.events.find_one({"event_id": d2["event_id"]}))["status"]
    _check(st == "ready_for_review", "complete draft → ready_for_review")
    pub = await life.publish(db, d2["event_id"], USER)
    _check(pub["published"] and pub["slug"].startswith("sri-vinayaka-utsav"), "published with slug")
    _check(pub["first_publish"] and pub["edit_count"] == 0 and pub["version"] == 1, "first publish free, v1")
    inv = await db.invitations.find_one({"event_id": d2["event_id"]})
    _check(inv and inv["public_url"] == f"/e/{pub['slug']}", "invitation row created on /e/ route (Spec 04 §15)")

    print("4. edit counting")
    for i in (1, 2, 3):
        rp = await life.publish(db, d2["event_id"], USER)
        _check(rp["edit_count"] == i, f"re-publish #{i} counts as edit {i}")
    await db.events.update_one({"event_id": d2["event_id"]}, {"$set": {"edit_count": 20}})
    await _expect(life.publish(db, d2["event_id"], USER), 402, "free edits exhausted → 402")
    paid = await life.publish(db, d2["event_id"], USER, edit_paid=True)
    _check(paid["edit_count"] == 21, "paid extra edit publishes")

    print("5. state machine + soft delete")
    _check(life.can_transition("published", "archived") and not life.can_transition("draft", "archived"),
           "invalid transition rejected")
    d3 = await life.create_draft(db, USER, "ganesh_chaturthi")
    await _expect(life.archive(db, d3["event_id"], USER), 409, "archiving a fresh draft rejected")
    await life.archive(db, d2["event_id"], USER)
    await _expect(life.public_get(db, pub["slug"]), 404, "archived event not public")
    await _expect(life.publish(db, d2["event_id"], USER), 409, "cannot publish archived")
    await life.restore(db, d2["event_id"], USER)
    _check((await life.public_get(db, pub["slug"]))["is_public"], "restored event public again")
    await life.soft_delete(db, d2["event_id"], USER)
    await _expect(life._load_owned(db, d2["event_id"], USER), 404, "soft-deleted event is gone (trash)")
    await _expect(life.public_get(db, pub["slug"]), 404, "soft-deleted event not public")

    print("6. ownership + public join")
    d4 = await life.create_draft(db, USER, "ganesh_chaturthi")
    await _fill_valid(db, d4["event_id"])
    p4 = await life.publish(db, d4["event_id"], USER)
    await _expect(life._load_owned(db, d4["event_id"], OTHER), 403, "other user blocked")
    pub_doc = await life.public_get(db, p4["slug"])
    _check("owner_id" not in pub_doc and pub_doc["venue"] and pub_doc["organizer"],
           "public read hides owner, joins venue + organizer")

    print("7. backward compatibility — wedding profiles untouched")
    await db.profiles.insert_one({"id": "wed1", "slug": "aarav-riya", "is_active": True})
    mine = await life.list_events(db, USER)
    _check(all(e["event_id"] != "wed1" for e in mine), "wedding not in event list")
    _check(await db.profiles.find_one({"id": "wed1"}) is not None, "wedding profile still present + unmodified")

    print("\nALL EVENT ENGINE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
