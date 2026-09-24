"""
Extensibility proof (Spec 13 §Future Expansion / §Final Objective).

    cd backend && python -m tests.test_event_extensibility

Registers a SECOND, differently-shaped event type ("Birthday": no venue, a single
date) purely as a REGISTRY CONFIG entry — no new engine code — and drives it through
the whole stack (create → autosave routing → registry-driven validation → publish →
child CRUD → RBAC). This demonstrates the Dynamic Event Engine claim: a new event
type is configuration, not code.

Crucially the new type has DIFFERENT required fields than Ganesh (no Google-Maps
venue, no end date), so a green run proves validation is genuinely config-driven.
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
import event_rbac as rbac


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


OWNER = {"user_id": "host1", "kind": "user"}
STRANGER = {"user_id": "x9", "kind": "user"}
NEW_TYPE = "birthday"


def _birthday_config():
    S = [
        registry._sec("event_information", "Event Information", store="event",
                      required_fields=["event_name", "start_date"]),           # single date, no end
        registry._sec("organizer_information", "Host", store="one:organizers",
                      required_fields=["phone"]),
        registry._sec("theme_selection", "Theme", store="root_obj:theme"),
        registry._sec("gallery", "Gallery", store="collection:gallery", module="gallery"),
        registry._sec("publish", "Publish", store="system"),
    ]
    return {
        "event_type_id": NEW_TYPE, "event_type": NEW_TYPE, "name": "Birthday",
        "event_name": "Birthday", "slug": "birthday", "category": "personal",
        "icon": "cake", "status": "active", "default_template": "birthday_bright",
        "supported_languages": ["en"], "languages": ["en"], "modules": ["gallery"],
        "layouts": ["birthday_bright"], "sections": S, "builder_config": {"sections": S},
        "free_edits": 5,
    }


async def run():
    db = FakeDB()
    # register the new type as CONFIG ONLY (restored afterwards)
    original = dict(registry.EVENT_TYPES)
    registry.EVENT_TYPES[NEW_TYPE] = _birthday_config()
    try:
        await schema.ensure_schema(db)
        await registry.seed_event_registry(db)

        print("1. new type exists purely from config")
        _check(registry.get_config(NEW_TYPE)["name"] == "Birthday", "registry serves the new type")
        reg = await db.event_registry.find_one({"event_type": NEW_TYPE})
        _check(reg is not None, "new type seeded into event_registry")

        print("2. the SAME engine creates + routes it")
        ev = await life.create_draft(db, OWNER, NEW_TYPE)
        eid = ev["event_id"]
        _check(ev["event_type"] == NEW_TYPE and ev["template_id"] == "birthday_bright",
               "create_draft used the new type's default template")
        await life.autosave(db, eid, OWNER, {
            "event_information": {"event_name": "Aarav turns 5", "start_date": "2026-10-02"},
            "organizer_information": {"phone": "9000000000"},
            "theme_selection": {"template": "birthday_bright", "primary_color": "#FF7AA2"},
            "gallery": {"x": 1}})
        row = await db.events.find_one({"event_id": eid})
        _check(row["title"] == "Aarav turns 5", "event_information routed to root")
        _check(await db.organizers.find_one({"event_id": eid}) is not None, "host routed to organizers child")

        print("3. registry-driven validation adapts to the new shape")
        # NO venue required for a birthday, and only ONE date — a Ganesh-shaped
        # validator would wrongly demand a venue + end date here.
        errors = await life.validate_for_publish(db, row)
        _check(errors == [], "birthday validates WITHOUT a venue or end date")
        pub = await life.publish(db, eid, OWNER)
        _check(pub["published"] and pub["slug"].startswith("aarav-turns-5"), "new type publishes")

        print("4. child CRUD + RBAC work unchanged for the new type")
        g = await kids.create_child(db, OWNER, eid, "gallery", {"type": "image", "url": "http://x/p.jpg"})
        _check(g["id"], "owner can add gallery media on the new type")
        try:
            await kids.create_child(db, STRANGER, eid, "gallery", {"type": "image", "url": "http://x/q.jpg"})
            _check(False, "stranger should be denied")
        except HTTPException as e:
            _check(e.status_code == 403, "RBAC denies a stranger on the new type → 403")

        print("5. wedding profiles still untouched")
        _check(await db.profiles.find_one({"id": eid}) is None, "new event never wrote to profiles")

        print("\nALL EXTENSIBILITY TESTS PASSED — a new event type is config, not code")
    finally:
        registry.EVENT_TYPES.clear()
        registry.EVENT_TYPES.update(original)


if __name__ == "__main__":
    asyncio.run(run())
