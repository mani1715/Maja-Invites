"""
Self-test for the public invitation surface (renderer data + RSVP).

    cd backend && python -m tests.test_event_public

Proves public_get exposes the guest-facing sections (schedule / gallery / active
sponsors / resolved template) and that a guest can RSVP from the public page with
server-side validation.
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


USER = {"user_id": "o1", "kind": "user"}


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
    await life.autosave(db, eid, USER, {
        "event_information": {"event_name": "Utsav", "start_date": "2026-08-27", "end_date": "2026-09-06"},
        "venue_details": {"google_map_url": "https://m/x", "venue_name": "Hall"},
        "organizer_information": {"phone": "9", "name": "Mandali"},
        "theme_selection": {"template": "peacock_darbar"}})
    # public-facing children
    await kids.create_child(db, USER, eid, "festival_schedule", {"festival_day": 1, "day_label": "Day 1", "display_order": 0})
    await kids.create_child(db, USER, eid, "gallery", {"type": "image", "url": "http://x/a.jpg", "display_order": 0})
    await kids.create_child(db, USER, eid, "sponsors", {"name": "ABC", "tier": "Gold"})
    inactive = await kids.create_child(db, USER, eid, "sponsors", {"name": "OldCo"})
    await kids.act_on_child(db, USER, eid, "sponsors", inactive["id"], "deactivate")
    pub = await life.publish(db, eid, USER)

    print("1. public_get exposes guest-facing sections")
    doc = await life.public_get(db, pub["slug"])
    _check(doc["template"]["template_id"] == "peacock_darbar" and doc["template"]["layout"]["text_zone"]["top"],
           "resolved template + text-zone layout attached")
    _check(len(doc["schedule"]) == 1 and doc["schedule"][0]["day_label"] == "Day 1", "schedule attached")
    _check(len(doc["gallery"]) == 1, "gallery attached")
    _check(len(doc["sponsors"]) == 1 and doc["sponsors"][0]["name"] == "ABC",
           "only ACTIVE sponsors shown publicly")
    _check("owner_id" not in doc, "owner hidden on public payload")

    print("2. public RSVP")
    await _expect(life.submit_public_rsvp(db, pub["slug"], {"attendance_status": "yes"}),
                  422, "RSVP without a name rejected")
    r = await life.submit_public_rsvp(db, pub["slug"], {"guest_name": "Ravi", "attendance_status": "yes", "guests_count": 3})
    _check(r["ok"], "guest RSVP recorded")
    row = await db.event_rsvp.find_one({"event_id": eid, "guest_name": "Ravi"})
    _check(row and row["source"] == "public" and row["guests_count"] == 3, "RSVP row stored with source=public")
    await _expect(life.submit_public_rsvp(db, "no-such", {"guest_name": "X", "attendance_status": "yes"}),
                  404, "RSVP to unknown event 404")

    print("\nALL PUBLIC INVITATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
