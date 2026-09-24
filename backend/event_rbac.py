"""
event_rbac.py — MAJA Dynamic Event Engine: Role-Based Access Control (Spec 10).
==============================================================================

Purpose
    The ONE authority for "may this caller do this thing to this event?". Defines
    the roles, the explicit least-privilege permission matrix, ownership + member
    resolution, event-state restrictions, and a single `authorize_event()` the whole
    module calls. No permission relies on the frontend — every check is server-side
    (Spec 10 §Security Rules).

Design (Spec 10 §Design Principles)
    * Least privilege: each role gets an EXPLICIT permission set. The hierarchy is a
      management RANK (who may assign whom); it is deliberately NOT linear permission
      inheritance, because the role definitions have cross-cutting denials (e.g. a
      Treasurer outranks a Gallery Manager for seniority yet must NOT touch gallery).
    * Owner and Super Admin hold every event permission, so existing owner-driven
      flows are unchanged; member roles are additive, new, tested behaviour.

Dependencies  (leaf module) — imports nothing from the other event services, so the
    dependency graph stays acyclic: rbac ← lifecycle/children/media/finance/members.
Side effects  none (pure evaluation + reads); callers do the auditing.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import HTTPException

MEMBERS_COLLECTION = "event_members"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# roles (Spec 10 §Permission Hierarchy) — rank is for management, not inheritance
# --------------------------------------------------------------------------- #
SUPER_ADMIN = "super_admin"
PLATFORM_ADMIN = "platform_admin"
OWNER = "owner"
EVENT_ADMIN = "event_admin"
TREASURER = "treasurer"
GALLERY_MANAGER = "gallery_manager"
SCHEDULE_MANAGER = "schedule_manager"
VOLUNTEER_MANAGER = "volunteer_manager"
COMMITTEE_MEMBER = "committee_member"
VOLUNTEER = "volunteer"
PHOTOGRAPHER = "photographer"
VISITOR = "visitor"

RANK = {
    SUPER_ADMIN: 100, PLATFORM_ADMIN: 90, OWNER: 80, EVENT_ADMIN: 70,
    TREASURER: 60, GALLERY_MANAGER: 55, SCHEDULE_MANAGER: 54,
    VOLUNTEER_MANAGER: 53, PHOTOGRAPHER: 40, COMMITTEE_MEMBER: 30,
    VOLUNTEER: 20, VISITOR: 0,
}

# roles an owner/admin may actually assign to a member (Spec 10 §Role Definitions)
ASSIGNABLE_ROLES = {EVENT_ADMIN, TREASURER, GALLERY_MANAGER, SCHEDULE_MANAGER,
                    VOLUNTEER_MANAGER, COMMITTEE_MEMBER, VOLUNTEER, PHOTOGRAPHER}


# --------------------------------------------------------------------------- #
# permissions (Spec 10 §Permission Categories) — flat, explicit strings
# --------------------------------------------------------------------------- #
# event / builder
P_EVENT_VIEW = "event.view"
P_EVENT_EDIT = "event.edit"
P_EVENT_DELETE = "event.delete"
P_EVENT_PUBLISH = "event.publish"
P_EVENT_ARCHIVE = "event.archive"
P_EVENT_RESTORE = "event.restore"
P_EVENT_TRANSFER = "event.transfer"
P_EVENT_CLONE = "event.clone"
P_BUILDER_EDIT = "builder.edit"
# gallery
P_GALLERY_VIEW = "gallery.view"
P_GALLERY_UPLOAD = "gallery.upload"
P_GALLERY_DELETE = "gallery.delete"
P_GALLERY_ALBUM = "gallery.album"
P_GALLERY_MANAGE = "gallery.manage"
P_GALLERY_DOWNLOAD = "gallery.download"
# schedule
P_SCHEDULE_MANAGE = "schedule.manage"
# finance
P_FIN_VIEW = "finance.view"
P_FIN_DONATION = "finance.donation_manage"
P_FIN_EXPENSE_CREATE = "finance.expense_create"
P_FIN_EXPENSE_APPROVE = "finance.expense_approve"
P_FIN_SPONSOR = "finance.sponsor_manage"
P_FIN_BUDGET = "finance.budget"
P_FIN_REPORT = "finance.report"
# members / reports / analytics / notifications / admin
P_MEMBERS_INVITE = "members.invite"
P_MEMBERS_REMOVE = "members.remove"
P_MEMBERS_ROLE = "members.role"
P_MEMBERS_VIEW = "members.view"
P_REPORTS_VIEW = "reports.view"
P_ANALYTICS_VIEW = "analytics.view"
P_NOTIFY_SEND = "notifications.send"
P_ADMIN_MODERATE = "admin.moderate"

# read-only perms (allowed even when an event is archived)
READ_PERMS: Set[str] = {P_EVENT_VIEW, P_GALLERY_VIEW, P_FIN_VIEW, P_MEMBERS_VIEW,
                        P_REPORTS_VIEW, P_ANALYTICS_VIEW, P_GALLERY_DOWNLOAD}

_ALL_GALLERY = {P_GALLERY_VIEW, P_GALLERY_UPLOAD, P_GALLERY_DELETE, P_GALLERY_ALBUM,
                P_GALLERY_MANAGE, P_GALLERY_DOWNLOAD}
_ALL_FINANCE = {P_FIN_VIEW, P_FIN_DONATION, P_FIN_EXPENSE_CREATE, P_FIN_EXPENSE_APPROVE,
                P_FIN_SPONSOR, P_FIN_BUDGET, P_FIN_REPORT}
_ALL_MEMBERS = {P_MEMBERS_INVITE, P_MEMBERS_REMOVE, P_MEMBERS_ROLE, P_MEMBERS_VIEW}
_ALL_EVENT = {P_EVENT_VIEW, P_EVENT_EDIT, P_EVENT_DELETE, P_EVENT_PUBLISH,
              P_EVENT_ARCHIVE, P_EVENT_RESTORE, P_EVENT_TRANSFER, P_EVENT_CLONE,
              P_BUILDER_EDIT}

# the complete set an OWNER holds (every module permission)
OWNER_PERMS: Set[str] = (_ALL_EVENT | _ALL_GALLERY | _ALL_FINANCE | _ALL_MEMBERS |
                         {P_SCHEDULE_MANAGE, P_REPORTS_VIEW, P_ANALYTICS_VIEW, P_NOTIFY_SEND})

# --------------------------------------------------------------------------- #
# the permission matrix (Spec 10 §Role Definitions) — explicit per role
# --------------------------------------------------------------------------- #
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    SUPER_ADMIN: set(OWNER_PERMS) | {P_ADMIN_MODERATE},          # everything
    PLATFORM_ADMIN: {P_EVENT_VIEW, P_EVENT_ARCHIVE, P_EVENT_RESTORE, P_EVENT_CLONE,
                     P_ADMIN_MODERATE, P_REPORTS_VIEW, P_ANALYTICS_VIEW,
                     P_GALLERY_VIEW, P_FIN_VIEW, P_MEMBERS_VIEW},  # no transfer/delete/edit
    OWNER: set(OWNER_PERMS),
    EVENT_ADMIN: (set(OWNER_PERMS) - {P_EVENT_TRANSFER, P_EVENT_DELETE}),  # ops, no transfer/delete
    TREASURER: set(_ALL_FINANCE) | {P_EVENT_VIEW, P_REPORTS_VIEW, P_ANALYTICS_VIEW},
    GALLERY_MANAGER: set(_ALL_GALLERY) | {P_EVENT_VIEW},
    SCHEDULE_MANAGER: {P_SCHEDULE_MANAGE, P_EVENT_VIEW},
    VOLUNTEER_MANAGER: {P_MEMBERS_INVITE, P_MEMBERS_VIEW, P_EVENT_VIEW},
    COMMITTEE_MEMBER: {P_EVENT_VIEW},
    VOLUNTEER: {P_EVENT_VIEW},
    PHOTOGRAPHER: {P_GALLERY_UPLOAD, P_GALLERY_DOWNLOAD, P_GALLERY_VIEW, P_EVENT_VIEW},
    VISITOR: set(),                                              # public-only (unauthed)
}

# child-collection → the WRITE permission its mutations require (Spec 10 §Permission
# Categories). Reads require only P_EVENT_VIEW.
CHILD_WRITE_PERM: Dict[str, str] = {
    "committee_members": P_MEMBERS_ROLE,
    "festival_schedule": P_SCHEDULE_MANAGE,
    "gallery": P_GALLERY_MANAGE,
    "albums": P_GALLERY_ALBUM,
    "donations": P_FIN_DONATION,
    "sponsors": P_FIN_SPONSOR,
    "expenses": P_FIN_EXPENSE_CREATE,
    "event_rsvp": P_EVENT_EDIT,
}


def _uid(current: Dict[str, Any]) -> Optional[str]:
    return (current or {}).get("user_id") or (current or {}).get("admin_id")


def is_super(current: Dict[str, Any]) -> bool:
    return bool((current or {}).get("is_super") or (current or {}).get("kind") == SUPER_ADMIN)


async def member_role(db, event_id: str, user_id: str) -> Optional[str]:
    if not user_id:
        return None
    row = await getattr(db, MEMBERS_COLLECTION).find_one(
        {"event_id": event_id, "user_id": user_id})
    if row and row.get("status") == "active" and not row.get("deleted_at"):
        return row.get("role")
    return None


async def resolve_role(db, current: Dict[str, Any], event: Dict[str, Any]) -> str:
    """The caller's effective role for THIS event (Spec 10 §Permission Evaluation)."""
    if is_super(current):
        return SUPER_ADMIN
    if (current or {}).get("kind") == PLATFORM_ADMIN:
        return PLATFORM_ADMIN
    uid = _uid(current)
    if uid and event.get("owner_id") == uid:
        return OWNER
    role = await member_role(db, event["event_id"], uid)
    return role or VISITOR


def has_permission(role: str, perm: str, *, status: str = "") -> bool:
    if role == SUPER_ADMIN:
        return True
    perms = ROLE_PERMISSIONS.get(role, set())
    if perm not in perms:
        return False
    # event-state restriction (Spec 10 §Event State Restrictions): an archived event
    # is read-only except restore.
    if status == "archived" and perm not in READ_PERMS and perm != P_EVENT_RESTORE:
        return False
    return True


async def evaluate(db, current: Dict[str, Any], event: Dict[str, Any], perm: str) -> bool:
    role = await resolve_role(db, current, event)
    return has_permission(role, perm, status=event.get("status", ""))


async def authorize_event(db, event_id: str, current: Dict[str, Any], perm: str) -> Dict[str, Any]:
    """Load the event, resolve the caller's role, enforce `perm`. Returns the event
    doc or raises 404 (missing/deleted) / 403 (forbidden). The single gate every
    event feature endpoint should call."""
    doc = await db.events.find_one({"event_id": event_id})
    if not doc:
        raise HTTPException(404, "Event not found")
    doc.pop("_id", None)
    if doc.get("deleted_at") and not is_super(current):
        raise HTTPException(404, "Event not found")     # deleted → super admin only
    if not await evaluate(db, current, doc, perm):
        raise HTTPException(403, "You do not have permission for this action.")
    return doc
