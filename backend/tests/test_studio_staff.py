"""
test_studio_staff.py — studio staff accounts + ownership transfer, on FakeDB.

    cd backend && python -m tests.test_studio_staff
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import studio_staff as st                                    # noqa: E402

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


async def err(coro, exc):
    try:
        await coro
        return False
    except exc:
        return True
    except Exception:
        return False


async def main():
    db = FakeDB()
    await db.admins.insert_one({"id": "s1", "email": "owner@x.com", "name": "Owner Studio", "studio_name": "Owner Studio"})
    await db.admins.insert_one({"id": "a2", "email": "editor@x.com", "name": "Ed"})
    await db.admins.insert_one({"id": "a3", "email": "mgr@x.com", "name": "Mia"})

    # ---- permission matrix (pure) ----------------------------------------
    ok("owner can transfer", st.has_permission("owner", "transfer_ownership"))
    ok("editor can edit portfolio", st.has_permission("editor", "edit_portfolio"))
    ok("editor cannot manage bookings", not st.has_permission("editor", "manage_bookings"))
    ok("viewer only views", st.has_permission("viewer", "view") and not st.has_permission("viewer", "edit_portfolio"))
    ok("None role has nothing", not st.has_permission(None, "view"))

    # ---- invite + validation ---------------------------------------------
    ok("bad email rejected", await err(st.invite_staff(db, "s1", "nope", "X", "editor"), ValueError))
    ok("bad role rejected", await err(st.invite_staff(db, "s1", "x@y.com", "X", "boss"), ValueError))

    inv = await st.invite_staff(db, "s1", "editor@x.com", "Ed", "editor")
    token = inv["staff"]["invite_token"]
    ok("invite created (invited)", inv["staff"]["status"] == "invited" and token)
    ok("invite pre-linked to existing admin a2", inv["staff"]["member_admin_id"] == "a2")
    ok("duplicate invite rejected", await err(st.invite_staff(db, "s1", "editor@x.com", "Ed", "editor"), ValueError))

    # before accept: no access yet
    ok("no access before accept", await st.resolve_access(db, "a2", "s1") is None)
    # wrong account can't accept a pinned invite
    ok("wrong account cannot accept", await err(st.accept_invite(db, token, "a3"), PermissionError))

    acc = await st.accept_invite(db, token, "a2")
    ok("accept ok", acc["ok"] and acc["studio_id"] == "s1")
    ok("editor access after accept", await st.resolve_access(db, "a2", "s1") == "editor")
    ok("owner is owner", await st.resolve_access(db, "s1", "s1") == "owner")
    ok("stranger has no access", await st.resolve_access(db, "zzz", "s1") is None)

    # ---- require_role enforcement ----------------------------------------
    ok("editor blocked from manage_staff", await err(st.require_role(db, "a2", "s1", "manage_staff"), PermissionError))
    ok("owner passes manage_staff", await st.require_role(db, "s1", "s1", "manage_staff") == "owner")

    # ---- role change + list ----------------------------------------------
    staff_id = inv["staff"]["id"]
    await st.update_role(db, "s1", staff_id, "manager")
    ok("role updated to manager", await st.resolve_access(db, "a2", "s1") == "manager")
    lst = await st.list_staff(db, "s1")
    ok("list hides invite_token", all("invite_token" not in s for s in lst["staff"]))

    # ---- ownership transfer ----------------------------------------------
    # a3 must be active staff first
    inv3 = await st.invite_staff(db, "s1", "mgr@x.com", "Mia", "manager")
    await st.accept_invite(db, inv3["staff"]["invite_token"], "a3")
    ok("transfer to non-staff rejected", await err(st.transfer_ownership(db, "s1", "s1", "nobody"), ValueError))
    ok("non-owner cannot transfer", await err(st.transfer_ownership(db, "a2", "s1", "a3"), PermissionError))

    xfer = await st.transfer_ownership(db, "s1", "s1", "a3")
    ok("transfer ok", xfer["ok"] and xfer["new_owner_admin_id"] == "a3")
    ok("a3 is now owner", await st.resolve_access(db, "a3", "s1") == "owner")
    ok("previous owner demoted to manager (keeps access)", await st.resolve_access(db, "s1", "s1") == "manager")
    ok("audit row written", len(await db.studio_ownership_transfers.find({"studio_id": "s1"}, {"_id": 0}).to_list(10)) == 1)
    # previous owner can no longer transfer
    ok("old owner loses transfer right", await err(st.require_role(db, "s1", "s1", "transfer_ownership"), PermissionError))

    # ---- revoke -----------------------------------------------------------
    await st.revoke_staff(db, "s1", staff_id)
    ok("revoked member loses access", await st.resolve_access(db, "a2", "s1") is None)

    print(f"\nStudio Staff: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
