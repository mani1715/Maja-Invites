"""
studio_staff.py — studio staff accounts + ownership transfer (delegated access).

Closes the audit gap: a studio was a single login. Real studios have a manager,
an editor, a second shooter — people who need scoped access without sharing the
owner's password.

Architecture note (important + honest): across this codebase a studio's identity
IS its owner's `admin_id` (portfolio_profiles.id, every *_scoped record's
studio_id, …). So "staff" is modelled as a DELEGATED-ACCESS layer over that stable
identity, not a second identity for the same data:

  * `studio_staff` — a membership: {id, studio_id (the owner account id),
    member_admin_id, email, name, role, status(invited|active|revoked),
    invite_token, created_at, accepted_at}. A staff member has their OWN admin
    login; the membership grants them a role on this studio.
  * `resolve_access(db, actor, studio_id)` → the actor's effective role
    (owner|manager|editor|viewer|None) — the single primitive every caller uses to
    authorise a studio action. `has_permission(role, action)` reads the matrix.

Ownership transfer is likewise expressed through this layer, NOT by rewriting
account identity (which would cascade through slugs, storage keys and every
scoped row and risk orphaning data). Transfer records a `primary_owner_admin_id`
overlay for the studio and demotes the previous owner to an active `manager`
membership, so they keep working access. `resolve_access` honours the overlay, so
the new primary owner gets owner-level permission everywhere the primitive is used.

    from studio_staff import build_studio_staff_router
    app.include_router(build_studio_staff_router(db, get_current_admin))
"""
from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("studio_staff")

ROLES = ["owner", "manager", "editor", "viewer"]
ROLE_RANK = {"owner": 3, "manager": 2, "editor": 1, "viewer": 0}
ASSIGNABLE_ROLES = ["manager", "editor", "viewer"]   # owner is never hand-assigned

# What each role may do. The owner implicitly has every permission.
ROLE_PERMISSIONS: Dict[str, set] = {
    "owner":   {"view", "edit_portfolio", "manage_bookings", "manage_finance",
                "manage_staff", "manage_billing", "transfer_ownership"},
    "manager": {"view", "edit_portfolio", "manage_bookings", "manage_finance", "manage_staff"},
    "editor":  {"view", "edit_portfolio"},
    "viewer":  {"view"},
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def has_permission(role: Optional[str], action: str) -> bool:
    return bool(role) and action in ROLE_PERMISSIONS.get(role, set())


async def _primary_owner(db, studio_id: str) -> str:
    """The account that currently holds primary ownership (transfer overlay aware)."""
    s = await db.studio_settings.find_one({"studio_id": studio_id}, {"_id": 0})
    return (s or {}).get("primary_owner_admin_id") or studio_id


async def resolve_access(db, actor: str, studio_id: str) -> Optional[str]:
    """The actor's effective role on `studio_id`, or None. The auth primitive."""
    if not actor or not studio_id:
        return None
    if actor == await _primary_owner(db, studio_id):
        return "owner"
    m = await db.studio_staff.find_one(
        {"studio_id": studio_id, "member_admin_id": actor, "status": "active"}, {"_id": 0})
    return (m or {}).get("role")


async def require_role(db, actor: str, studio_id: str, action: str) -> str:
    role = await resolve_access(db, actor, studio_id)
    if not has_permission(role, action):
        raise PermissionError(f"You don't have permission to {action.replace('_', ' ')}.")
    return role


async def list_staff(db, studio_id: str) -> Dict[str, Any]:
    rows = await db.studio_staff.find({"studio_id": studio_id}, {"_id": 0}).to_list(500)
    rows = [r for r in rows if r.get("status") != "revoked"]
    rows.sort(key=lambda r: (ROLE_RANK.get(r.get("role"), -1) * -1, r.get("created_at") or ""))
    owner = await _primary_owner(db, studio_id)
    return {"owner_admin_id": owner, "staff": [
        {k: v for k, v in r.items() if k != "invite_token"} for r in rows]}


async def invite_staff(db, studio_id: str, email: str, name: str, role: str) -> Dict[str, Any]:
    email = (email or "").strip().lower()
    name = (name or "").strip()[:120]
    if not _EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address.")
    if role not in ASSIGNABLE_ROLES:
        raise ValueError("Role must be manager, editor or viewer.")
    existing = await db.studio_staff.find_one(
        {"studio_id": studio_id, "email": email}, {"_id": 0})
    if existing and existing.get("status") != "revoked":
        raise ValueError("That person is already invited or on your team.")

    # If an admin account already uses this email, pre-link it (they still must accept).
    acct = await db.admins.find_one({"email": email}, {"_id": 0})
    token = secrets.token_urlsafe(24)
    doc = {
        "id": f"stf_{uuid.uuid4().hex[:14]}", "studio_id": studio_id,
        "email": email, "name": name or (acct or {}).get("name") or email.split("@")[0],
        "member_admin_id": (acct or {}).get("id"), "role": role,
        "status": "invited", "invite_token": token,
        "created_at": _now(), "accepted_at": None,
    }
    await db.studio_staff.insert_one(doc)
    logger.info("[staff] invited %s to studio %s as %s", email, studio_id, role)
    # invite_token is returned once so the owner can share the accept link
    return {"staff": {k: v for k, v in doc.items() if k != "_id"}}


async def accept_invite(db, token: str, member_admin_id: str, member_email: str = "") -> Dict[str, Any]:
    m = await db.studio_staff.find_one({"invite_token": token}, {"_id": 0})
    if not m or m.get("status") == "revoked":
        raise LookupError("This invite is no longer valid.")
    if m.get("status") == "active":
        return {"ok": True, "already": True, "studio_id": m["studio_id"]}
    # If the invite was pinned to a specific account, enforce it.
    if m.get("member_admin_id") and m["member_admin_id"] != member_admin_id:
        raise PermissionError("This invite belongs to a different account.")
    await db.studio_staff.update_one(
        {"id": m["id"]},
        {"$set": {"status": "active", "member_admin_id": member_admin_id,
                  "accepted_at": _now(), "invite_token": None}})
    return {"ok": True, "studio_id": m["studio_id"], "role": m["role"]}


async def update_role(db, studio_id: str, staff_id: str, role: str) -> Dict[str, Any]:
    if role not in ASSIGNABLE_ROLES:
        raise ValueError("Role must be manager, editor or viewer.")
    m = await db.studio_staff.find_one({"id": staff_id, "studio_id": studio_id}, {"_id": 0})
    if not m:
        raise LookupError("Staff member not found.")
    await db.studio_staff.update_one({"id": staff_id, "studio_id": studio_id},
                                     {"$set": {"role": role}})
    return {"ok": True}


async def revoke_staff(db, studio_id: str, staff_id: str) -> Dict[str, Any]:
    m = await db.studio_staff.find_one({"id": staff_id, "studio_id": studio_id}, {"_id": 0})
    if not m:
        raise LookupError("Staff member not found.")
    await db.studio_staff.update_one({"id": staff_id, "studio_id": studio_id},
                                     {"$set": {"status": "revoked", "invite_token": None}})
    return {"ok": True}


async def my_memberships(db, member_admin_id: str) -> List[dict]:
    """Studios (other than my own account) where I'm active staff."""
    rows = await db.studio_staff.find(
        {"member_admin_id": member_admin_id, "status": "active"}, {"_id": 0}).to_list(200)
    out = []
    for r in rows:
        out.append({"studio_id": r["studio_id"], "role": r["role"],
                    "name": await _studio_display(db, r["studio_id"])})
    return out


async def _studio_display(db, sid: str) -> str:
    doc = await db.admins.find_one({"id": sid}, {"_id": 0})
    return (doc or {}).get("studio_name") or (doc or {}).get("name") or "Studio"


async def transfer_ownership(db, actor: str, studio_id: str, new_owner_admin_id: str) -> Dict[str, Any]:
    """Hand primary ownership to an ACTIVE staff member. Previous owner stays on as
    an active `manager` so they never lose access. Identity/data are not moved."""
    if await resolve_access(db, actor, studio_id) != "owner":
        raise PermissionError("Only the current owner can transfer ownership.")
    if not new_owner_admin_id or new_owner_admin_id == actor:
        raise ValueError("Choose a different team member to transfer to.")
    target = await db.studio_staff.find_one(
        {"studio_id": studio_id, "member_admin_id": new_owner_admin_id, "status": "active"}, {"_id": 0})
    if not target:
        raise ValueError("The new owner must be an active staff member first.")

    current_owner = await _primary_owner(db, studio_id)
    now = _now()
    # record the overlay
    await db.studio_settings.update_one(
        {"studio_id": studio_id},
        {"$set": {"studio_id": studio_id, "primary_owner_admin_id": new_owner_admin_id,
                  "ownership_updated_at": now}}, upsert=True)
    # the new owner's membership becomes 'owner' (so lists read correctly)
    await db.studio_staff.update_one({"id": target["id"]}, {"$set": {"role": "owner"}})
    # keep the previous owner on the team as a manager (upsert their membership)
    prev = await db.studio_staff.find_one(
        {"studio_id": studio_id, "member_admin_id": current_owner}, {"_id": 0})
    if prev:
        await db.studio_staff.update_one({"id": prev["id"]},
                                         {"$set": {"role": "manager", "status": "active"}})
    else:
        await db.studio_staff.insert_one({
            "id": f"stf_{uuid.uuid4().hex[:14]}", "studio_id": studio_id,
            "email": (await db.admins.find_one({"id": current_owner}, {"_id": 0}) or {}).get("email", ""),
            "name": await _studio_display(db, current_owner),
            "member_admin_id": current_owner, "role": "manager", "status": "active",
            "invite_token": None, "created_at": now, "accepted_at": now,
        })
    await db.studio_ownership_transfers.insert_one({
        "id": f"xfer_{uuid.uuid4().hex[:12]}", "studio_id": studio_id,
        "from_admin_id": current_owner, "to_admin_id": new_owner_admin_id, "at": now})
    logger.info("[staff] ownership of studio %s transferred %s -> %s", studio_id, current_owner, new_owner_admin_id)
    return {"ok": True, "studio_id": studio_id, "new_owner_admin_id": new_owner_admin_id}


# ------------------------------ HTTP ------------------------------------------
class InviteIn(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    name: str = Field(default="", max_length=120)
    role: str = Field(default="viewer")


class RoleIn(BaseModel):
    role: str


class AcceptIn(BaseModel):
    token: str = Field(min_length=8)


class TransferIn(BaseModel):
    new_owner_admin_id: str = Field(min_length=1)


def _wrap(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(403, str(exc))
    return HTTPException(500, "Staff error")


def build_studio_staff_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["studio-staff"])

    @router.get("/api/studio/staff")
    async def staff_list(me: str = Depends(get_current_admin)):
        try:
            await require_role(db, me, me, "manage_staff")
            data = await list_staff(db, me)
            data["my_role"] = await resolve_access(db, me, me)
            return data
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/staff/invite")
    async def staff_invite(payload: InviteIn, me: str = Depends(get_current_admin)):
        try:
            await require_role(db, me, me, "manage_staff")
            return await invite_staff(db, me, payload.email, payload.name, payload.role)
        except Exception as e:
            raise _wrap(e)

    @router.patch("/api/studio/staff/{staff_id}")
    async def staff_update(staff_id: str, payload: RoleIn, me: str = Depends(get_current_admin)):
        try:
            await require_role(db, me, me, "manage_staff")
            return await update_role(db, me, staff_id, payload.role)
        except Exception as e:
            raise _wrap(e)

    @router.delete("/api/studio/staff/{staff_id}")
    async def staff_revoke(staff_id: str, me: str = Depends(get_current_admin)):
        try:
            await require_role(db, me, me, "manage_staff")
            return await revoke_staff(db, me, staff_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/staff/accept")
    async def staff_accept(payload: AcceptIn, me: str = Depends(get_current_admin)):
        try:
            return await accept_invite(db, payload.token, me)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/studio/staff/memberships")
    async def staff_memberships(me: str = Depends(get_current_admin)):
        return {"memberships": await my_memberships(db, me)}

    @router.post("/api/studio/staff/transfer-ownership")
    async def staff_transfer(payload: TransferIn, me: str = Depends(get_current_admin)):
        try:
            await require_role(db, me, me, "transfer_ownership")
            return await transfer_ownership(db, me, me, payload.new_owner_admin_id)
        except Exception as e:
            raise _wrap(e)

    return router
