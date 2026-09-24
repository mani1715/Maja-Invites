"""
event_members_service.py — MAJA Dynamic Event Engine: members & RBAC workflow (Spec 10).
========================================================================================

Purpose
    The team-management side of RBAC: invite a user to an event with a role, accept/
    reject an invitation, change a member's role, remove a member, list members, and
    transfer ownership (the outgoing owner becomes Event Admin — Spec 10 §Ownership
    Rules). All authorization flows through event_rbac; every change is audited.

Dependencies  event_rbac (roles + authorize_event), event_lifecycle_service
            (_uid/_now/_audit), event_registry (module flag)
Side effects  event_members rows (invited/active/rejected), events.owner_id on
            transfer, audit rows. No hard deletes (Spec 10 §Audit).

Invitation workflow (Spec 10 §Member Invitation Workflow)
    owner → invite (status=invited) → the invited user accepts (status=active) →
    permissions activate. Emailing/WhatsApp of the invite is a notification concern
    (Doc: notifications) — here the invite is created and surfaced to the user.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _uid, _now, _audit


def _uidof(current: Dict[str, Any]) -> Optional[str]:
    return (current or {}).get("user_id") or (current or {}).get("admin_id")


async def list_members(db, current, event_id: str) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_MEMBERS_VIEW)
    out: List[Dict[str, Any]] = []
    async for m in db.event_members.find({"event_id": event_id}):
        if m.get("deleted_at"):
            continue
        m.pop("_id", None)
        out.append(m)
    # include the owner as an implicit member row for a complete picture
    event = await db.events.find_one({"event_id": event_id})
    if event:
        out.insert(0, {"user_id": event.get("owner_id"), "role": rbac.OWNER,
                       "status": "active", "is_owner": True})
    return {"members": out, "assignable_roles": sorted(rbac.ASSIGNABLE_ROLES)}


async def invite_member(db, current, event_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_MEMBERS_INVITE)
    role = (payload or {}).get("role")
    user_id = (payload or {}).get("user_id")
    email = (payload or {}).get("email")
    if role not in rbac.ASSIGNABLE_ROLES:
        raise HTTPException(422, f"'{role}' is not an assignable role.")
    if not user_id and not email:
        raise HTTPException(422, "A user id or email is required to invite a member.")
    # a volunteer manager may only invite volunteers (least privilege)
    inviter_role = await rbac.resolve_role(db, current, await db.events.find_one({"event_id": event_id}))
    if inviter_role == rbac.VOLUNTEER_MANAGER and role != rbac.VOLUNTEER:
        raise HTTPException(403, "A volunteer manager can only invite volunteers.")
    if user_id:
        existing = await db.event_members.find_one({"event_id": event_id, "user_id": user_id})
        if existing and not existing.get("deleted_at"):
            raise HTTPException(409, "That user is already a member or has a pending invite.")
    mid = _uid("mem")
    row = {"id": mid, "event_id": event_id, "user_id": user_id, "email": email,
           "role": role, "status": "invited", "invited_by": _uidof(current),
           "invited_at": _now(), "deleted_at": None, "created_at": _now(), "updated_at": _now()}
    await db.event_members.insert_one(row)
    await _audit(db, event_id, current, "member_invited", "members",
                 after={"member": mid, "role": role})
    return {"invited": True, "member_id": mid, "role": role, "status": "invited"}


async def accept_invitation(db, current, member_id: str) -> Dict[str, Any]:
    """The invited user accepts — activating their permissions."""
    uid = _uidof(current)
    row = await db.event_members.find_one({"id": member_id})
    if not row or row.get("deleted_at"):
        raise HTTPException(404, "Invitation not found")
    if row.get("status") != "invited":
        raise HTTPException(409, "This invitation is no longer pending.")
    # bind an email-only invite to the accepting user; otherwise the user must match
    if row.get("user_id") and row["user_id"] != uid:
        raise HTTPException(403, "This invitation is for a different account.")
    await db.event_members.update_one({"id": member_id}, {"$set": {
        "status": "active", "user_id": uid, "accepted_at": _now(), "updated_at": _now()}})
    await _audit(db, row["event_id"], current, "member_accepted", "members",
                 after={"member": member_id})
    return {"accepted": True, "event_id": row["event_id"], "role": row["role"]}


async def reject_invitation(db, current, member_id: str) -> Dict[str, Any]:
    uid = _uidof(current)
    row = await db.event_members.find_one({"id": member_id})
    if not row or row.get("status") != "invited":
        raise HTTPException(404, "Invitation not found")
    if row.get("user_id") and row["user_id"] != uid:
        raise HTTPException(403, "This invitation is for a different account.")
    await db.event_members.update_one({"id": member_id},
                                      {"$set": {"status": "rejected", "updated_at": _now()}})
    await _audit(db, row["event_id"], current, "member_rejected", "members", after={"member": member_id})
    return {"rejected": True}


async def change_role(db, current, event_id: str, member_id: str, role: str) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_MEMBERS_ROLE)
    if role not in rbac.ASSIGNABLE_ROLES:
        raise HTTPException(422, f"'{role}' is not an assignable role.")
    row = await db.event_members.find_one({"id": member_id, "event_id": event_id})
    if not row or row.get("deleted_at"):
        raise HTTPException(404, "Member not found")
    before = row.get("role")
    await db.event_members.update_one({"id": member_id, "event_id": event_id},
                                      {"$set": {"role": role, "updated_at": _now()}})
    await _audit(db, event_id, current, "member_role_changed", "members",
                 before={"role": before}, after={"role": role})
    return {"member_id": member_id, "role": role}


async def remove_member(db, current, event_id: str, member_id: str) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_MEMBERS_REMOVE)
    row = await db.event_members.find_one({"id": member_id, "event_id": event_id})
    if not row or row.get("deleted_at"):
        raise HTTPException(404, "Member not found")
    await db.event_members.update_one({"id": member_id, "event_id": event_id},
                                      {"$set": {"deleted_at": _now(), "status": "removed", "updated_at": _now()}})
    await _audit(db, event_id, current, "member_removed", "members", before={"member": member_id})
    return {"removed": True, "member_id": member_id}


async def transfer_ownership(db, current, event_id: str, new_owner_id: str) -> Dict[str, Any]:
    """Owner-driven transfer (Spec 10 §Ownership Rules). The outgoing owner becomes
    an Event Admin member unless they were already recorded otherwise."""
    event = await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_TRANSFER)
    if not new_owner_id:
        raise HTTPException(422, "A new owner id is required.")
    old_owner = event.get("owner_id")
    if new_owner_id == old_owner:
        raise HTTPException(409, "That user already owns this event.")
    await db.events.update_one({"event_id": event_id},
                               {"$set": {"owner_id": new_owner_id, "updated_at": _now()}})
    # demote the old owner to Event Admin (as a member)
    if old_owner:
        existing = await db.event_members.find_one({"event_id": event_id, "user_id": old_owner})
        if existing:
            await db.event_members.update_one(
                {"event_id": event_id, "user_id": old_owner},
                {"$set": {"role": rbac.EVENT_ADMIN, "status": "active", "deleted_at": None, "updated_at": _now()}})
        else:
            mid = _uid("mem")
            await db.event_members.insert_one({
                "id": mid, "event_id": event_id, "user_id": old_owner, "role": rbac.EVENT_ADMIN,
                "status": "active", "invited_by": old_owner, "created_at": _now(), "updated_at": _now(),
                "deleted_at": None})
    # if the new owner had a member row, clear it (they're the owner now)
    await db.event_members.update_one(
        {"event_id": event_id, "user_id": new_owner_id},
        {"$set": {"status": "removed", "deleted_at": _now(), "updated_at": _now()}})
    await _audit(db, event_id, current, "ownership_transferred", "members",
                 before={"owner": old_owner}, after={"owner": new_owner_id})
    return {"transferred": True, "event_id": event_id, "owner_id": new_owner_id,
            "previous_owner_role": rbac.EVENT_ADMIN}


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_event_members_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-members"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/{event_id}/members")
    async def members(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await list_members(db, current, event_id)

    @router.post("/api/events/{event_id}/members")
    async def invite(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await invite_member(db, current, event_id, body)

    @router.patch("/api/events/{event_id}/members/{member_id}")
    async def role(event_id: str, member_id: str, body: Dict[str, Any] = Body(...),
                   current=Depends(get_current_buyer)):
        await _gate()
        return await change_role(db, current, event_id, member_id, (body or {}).get("role", ""))

    @router.delete("/api/events/{event_id}/members/{member_id}")
    async def remove(event_id: str, member_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await remove_member(db, current, event_id, member_id)

    @router.post("/api/events/{event_id}/transfer-ownership")
    async def transfer(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await transfer_ownership(db, current, event_id, (body or {}).get("new_owner_id", ""))

    @router.post("/api/events/invitations/{member_id}/accept")
    async def accept(member_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await accept_invitation(db, current, member_id)

    @router.post("/api/events/invitations/{member_id}/reject")
    async def reject(member_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await reject_invitation(db, current, member_id)

    return router
