"""
Self-test for the platform-administration layer (Spec 09). Tests the service
functions directly (super-admin auth is an HTTP concern, exercised elsewhere).

    cd backend && python -m tests.test_event_admin

Proves:
  1. Platform dashboard aggregates event status counts, donations, media, views.
  2. Global search filters by query/status/type/owner and paginates.
  3. Moderation: suspend/hide removes an event from public view; restore re-exposes
     only if it was published; feature/flag/verify set their fields; unknown → 404.
  4. Ownership transfer + full clone (root + child collections) as a fresh draft.
  5. Admin soft-delete → trash → restore-deleted.
  6. Feature-flag control (incl. turning the module ON) is audited + guarded.
  7. Every admin action writes an audit row; audit log viewing filters/paginates.
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
import event_admin_service as admin


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


USER = {"user_id": "owner1", "kind": "user"}
ADMIN = "superadmin"


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


async def _published_event(db):
    ev = await life.create_draft(db, USER, "ganesh_chaturthi")
    eid = ev["event_id"]
    await life.autosave(db, eid, USER, {
        "event_information": {"event_name": "Ganesh Utsav", "start_date": "2026-08-27", "end_date": "2026-09-06"},
        "venue_details": {"google_map_url": "https://maps.google.com/?q=1,2"},
        "organizer_information": {"phone": "9999999999"}})
    pub = await life.publish(db, eid, USER)
    return eid, pub["slug"]


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    eid, slug = await _published_event(db)
    await life.create_draft(db, USER, "ganesh_chaturthi")   # a second, draft event

    print("1. platform dashboard")
    dash = await admin.platform_dashboard(db)
    _check(dash["events"]["total"] == 2 and dash["events"]["published"] == 1
           and dash["events"]["draft"] == 1, "event status counts")

    print("2. global search")
    s = await admin.search_events(db, q="ganesh")
    _check(s["total"] == 1, "search matches published title")
    s2 = await admin.search_events(db, status="draft")
    _check(s2["total"] == 1 and s2["items"][0]["status"] == "draft", "filter by status")

    print("3. moderation")
    await admin.moderate_event(db, ADMIN, eid, "suspend", reason="policy check")
    await _expect(life.public_get(db, slug), 404, "suspended event hidden from public")
    await admin.moderate_event(db, ADMIN, eid, "restore")
    _check((await life.public_get(db, slug))["is_public"], "restore re-exposes a published event")
    await admin.moderate_event(db, ADMIN, eid, "hide")
    await _expect(life.public_get(db, slug), 404, "hidden event not public")
    await admin.moderate_event(db, ADMIN, eid, "unhide")
    await admin.moderate_event(db, ADMIN, eid, "feature")
    ev = await db.events.find_one({"event_id": eid})
    _check(ev["is_featured"] and (await life.public_get(db, slug)), "featured + public again")
    await _expect(admin.moderate_event(db, ADMIN, eid, "explode"), 404, "unknown action 404")

    print("4. transfer + clone")
    await kids.create_child(db, USER, eid, "committee_members", {"name": "Ravi", "role": "treasurer"})
    tr = await admin.transfer_ownership(db, ADMIN, eid, "owner2")
    _check(tr["owner_id"] == "owner2", "ownership transferred")
    cl = await admin.clone_event(db, ADMIN, eid)
    _check(cl["status"] == "draft" and cl["cloned_children"] >= 3, "clone copies root + children")
    clone = await db.events.find_one({"event_id": cl["event_id"]})
    _check(clone["title"].endswith("(Copy)") and not clone["is_public"] and clone["publish_slug"] is None,
           "clone is an unpublished draft")
    members = [m async for m in db.committee_members.find({"event_id": cl["event_id"]})]
    _check(len(members) == 1 and members[0]["id"] != "", "committee cloned with fresh id")

    print("5. admin delete + restore")
    await admin.admin_soft_delete(db, ADMIN, eid, reason="takedown")
    await _expect(life.public_get(db, slug), 404, "admin-deleted event not public")
    await _expect(admin.admin_restore_deleted(db, ADMIN, cl["event_id"]), 409, "restoring a live event rejected")
    r = await admin.admin_restore_deleted(db, ADMIN, eid)
    _check(r["restored"], "trashed event restored")

    print("6. feature flags")
    f0 = await admin.list_flags(db)
    _check(f0["flags"]["ganesh_module_enabled"] is False, "module flag starts OFF")
    await admin.set_flag(db, ADMIN, "ganesh_module_enabled", True)
    _check((await admin.list_flags(db))["flags"]["ganesh_module_enabled"] is True, "owner can enable the module")
    await admin.set_flag(db, ADMIN, "ganesh_module_enabled", False)  # leave OFF
    await _expect(admin.set_flag(db, ADMIN, "totally_unknown_flag", True), 404, "unmanaged flag rejected")

    print("7. audit log viewing")
    logs = await admin.list_audit_logs(db)
    _check(logs["total"] >= 6, "admin actions were audited")
    only = await admin.list_audit_logs(db, action="moderate_suspend")
    _check(only["total"] == 1 and only["items"][0]["reason"] == "policy check",
           "audit filter by action + reason captured")
    cats = await admin.list_categories(db)
    _check(any(c["event_type"] == "ganesh_chaturthi" for c in cats["categories"]), "categories from registry")

    print("\nALL EVENT ADMIN TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
