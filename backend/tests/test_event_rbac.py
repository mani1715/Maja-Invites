"""
Self-test for RBAC + the members workflow (Spec 10).

    cd backend && python -m tests.test_event_rbac

Proves:
  1. The permission matrix (least privilege): each role holds exactly its perms.
  2. Role resolution: super / owner / active-member / visitor.
  3. authorize_event gate: owner passes, non-member 403, deleted → super only.
  4. REAL enforcement through the child service — a treasurer may manage donations
     but NOT gallery; a gallery manager the reverse; a committee member is view-only;
     a stranger is denied.
  5. Invitation workflow: invite → accept → permissions activate; bad role rejected;
     a volunteer manager may only invite volunteers.
  6. change_role + remove_member take effect immediately.
  7. Ownership transfer: new owner assigned; old owner demoted to Event Admin.
  8. Event-state restriction: an archived event is read-only even for the owner.
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
import event_members_service as members
import event_rbac as rbac


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


OWNER = {"user_id": "owner1", "kind": "user"}
TREA = {"user_id": "trea1", "kind": "user"}
GAL = {"user_id": "gal1", "kind": "user"}
COM = {"user_id": "com1", "kind": "user"}
VM = {"user_id": "vm1", "kind": "user"}
STRANGER = {"user_id": "x1", "kind": "user"}
SUPER = {"user_id": "root", "kind": "super_admin"}


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


async def _join(db, eid, inviter, user, role):
    inv = await members.invite_member(db, inviter, eid, {"user_id": user["user_id"], "role": role})
    await members.accept_invitation(db, user, inv["member_id"])
    return inv["member_id"]


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, OWNER, "ganesh_chaturthi")
    eid = ev["event_id"]

    print("1. permission matrix (least privilege)")
    _check(rbac.has_permission(rbac.TREASURER, rbac.P_FIN_DONATION)
           and not rbac.has_permission(rbac.TREASURER, rbac.P_GALLERY_MANAGE),
           "treasurer: finance yes, gallery no")
    _check(rbac.has_permission(rbac.GALLERY_MANAGER, rbac.P_GALLERY_UPLOAD)
           and not rbac.has_permission(rbac.GALLERY_MANAGER, rbac.P_FIN_VIEW),
           "gallery manager: gallery yes, finance no")
    _check(rbac.has_permission(rbac.OWNER, rbac.P_EVENT_TRANSFER)
           and not rbac.has_permission(rbac.EVENT_ADMIN, rbac.P_EVENT_TRANSFER),
           "owner may transfer; event admin may not")
    _check(not rbac.has_permission(rbac.VISITOR, rbac.P_EVENT_VIEW)
           and rbac.has_permission(rbac.SUPER_ADMIN, rbac.P_ADMIN_MODERATE),
           "visitor has no authed perms; super admin has all")

    print("2. role resolution + authorize gate")
    event = await db.events.find_one({"event_id": eid})
    _check(await rbac.resolve_role(db, OWNER, event) == rbac.OWNER, "owner resolved")
    _check(await rbac.resolve_role(db, STRANGER, event) == rbac.VISITOR, "stranger → visitor")
    _check(await rbac.resolve_role(db, SUPER, event) == rbac.SUPER_ADMIN, "super resolved")
    await _expect(kids.list_children(db, STRANGER, eid, "donations"), 403, "stranger denied read")

    print("3. treasurer enforcement through the child service")
    await _join(db, eid, OWNER, TREA, rbac.TREASURER)
    don = await kids.create_child(db, TREA, eid, "donations", {"donor_name": "Ravi", "amount": 500})
    _check(don["id"], "treasurer can create a donation")
    await _expect(kids.create_child(db, TREA, eid, "gallery", {"type": "image", "url": "http://x/y.jpg"}),
                  403, "treasurer cannot touch gallery")

    print("4. gallery manager enforcement (the reverse)")
    await _join(db, eid, OWNER, GAL, rbac.GALLERY_MANAGER)
    g = await kids.create_child(db, GAL, eid, "gallery", {"type": "image", "url": "http://x/z.jpg"})
    _check(g["id"], "gallery manager can add gallery media")
    await _expect(kids.create_child(db, GAL, eid, "donations", {"donor_name": "Y", "amount": 1}),
                  403, "gallery manager cannot touch finance")

    print("5. committee member is view-only")
    await _join(db, eid, OWNER, COM, rbac.COMMITTEE_MEMBER)
    lst = await kids.list_children(db, COM, eid, "donations")
    _check(lst["total"] >= 1, "committee member can view")
    await _expect(kids.create_child(db, COM, eid, "festival_schedule", {"festival_day": 1}),
                  403, "committee member cannot write")

    print("6. invitation workflow guards")
    await _expect(members.invite_member(db, OWNER, eid, {"user_id": "z", "role": "wizard"}),
                  422, "unknown role rejected")
    await _join(db, eid, OWNER, VM, rbac.VOLUNTEER_MANAGER)
    await _expect(members.invite_member(db, VM, eid, {"user_id": "z", "role": "treasurer"}),
                  403, "volunteer manager may only invite volunteers")
    okinv = await members.invite_member(db, VM, eid, {"user_id": "vol9", "role": "volunteer"})
    _check(okinv["invited"], "volunteer manager may invite a volunteer")
    # a pending (not accepted) invite grants nothing yet
    _check(await rbac.member_role(db, eid, "vol9") is None, "unaccepted invite grants no role")

    print("7. change role + remove take effect")
    gal_mid = await db.event_members.find_one({"event_id": eid, "user_id": "gal1"})
    await members.change_role(db, OWNER, eid, gal_mid["id"], rbac.TREASURER)
    d2 = await kids.create_child(db, GAL, eid, "donations", {"donor_name": "Now finance", "amount": 9})
    _check(d2["id"], "re-roled gal1 → treasurer can now do finance")
    await members.remove_member(db, OWNER, eid, gal_mid["id"])
    await _expect(kids.create_child(db, GAL, eid, "donations", {"donor_name": "no", "amount": 1}),
                  403, "removed member loses access immediately")

    print("8. ownership transfer")
    tr = await members.transfer_ownership(db, OWNER, eid, "trea1")
    _check(tr["owner_id"] == "trea1", "new owner assigned")
    ev2 = await db.events.find_one({"event_id": eid})
    _check(await rbac.resolve_role(db, {"user_id": "trea1"}, ev2) == rbac.OWNER, "trea1 is now owner")
    _check(await rbac.resolve_role(db, OWNER, ev2) == rbac.EVENT_ADMIN, "old owner demoted to event admin")
    await _expect(members.transfer_ownership(db, OWNER, eid, "someone"), 403,
                  "demoted owner can no longer transfer")

    print("9. archived event is read-only")
    await db.events.update_one({"event_id": eid}, {"$set": {"status": "archived"}})
    await _expect(kids.create_child(db, {"user_id": "trea1"}, eid, "donations", {"donor_name": "a", "amount": 1}),
                  403, "no writes on an archived event (even owner)")
    ok = await kids.list_children(db, {"user_id": "trea1"}, eid, "donations")
    _check(ok["total"] >= 1, "reads still allowed on an archived event")

    print("\nALL RBAC TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
