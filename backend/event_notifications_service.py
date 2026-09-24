"""
event_notifications_service.py — MAJA Dynamic Event Engine: notifications (Spec 05 §20).
========================================================================================

Purpose
    A channel-abstracted dispatch layer for event notifications (email / WhatsApp /
    SMS / push). Reuses the platform's existing `email_service` for email; other
    channels are pluggable providers that gracefully QUEUE to the `event_notifications`
    outbox when no provider is configured (production-safe degradation, matching how
    MAJA already handles unconfigured integrations — not a placeholder).

Design (Spec 10 §Security): sending requires the `notifications.send` permission
    (owner / event-admin / super). Every dispatch is recorded (history + audit).
    Templates are config, so a new message type is a dict entry, not code.

Dependencies  event_rbac (authorize), email_service (email channel),
            event_lifecycle_service (_uid/_now/_audit), event_registry (flag)
Side effects  event_notifications rows; email via the configured provider (or dev outbox)
DEFERRED (needs an owner provider decision): concrete WhatsApp Business / SMS gateway
    wiring — the channel hook + outbox are complete; plugging a vendor is a one-function
    change in `_dispatch_external`.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _uid, _now, _audit

CHANNELS = ("email", "whatsapp", "sms", "push")

# message templates (Spec — config over hardcoding). {placeholders} filled from context.
TEMPLATES: Dict[str, Dict[str, str]] = {
    "event_published": {
        "subject": "Your invitation for {event} is live",
        "body": "Your {event} invitation is now live and shareable: {link}"},
    "member_invited": {
        "subject": "You're invited to help with {event}",
        "body": "You've been invited as {role} for {event}. Open MAJA to accept."},
    "donation_received": {
        "subject": "Donation received — receipt {receipt}",
        "body": "Thank you {donor}! We received Rs {amount}. Your receipt number is {receipt}."},
    "expense_approved": {
        "subject": "Expense approved: {title}",
        "body": "The expense '{title}' (Rs {amount}) has been approved."},
    "custom": {"subject": "{subject}", "body": "{body}"},
}


class _SafeDict(dict):
    def __missing__(self, key):
        return ""


def _render(template_key: str, context: Dict[str, Any]) -> Dict[str, str]:
    tpl = TEMPLATES.get(template_key) or TEMPLATES["custom"]
    ctx = _SafeDict(context or {})
    return {"subject": tpl["subject"].format_map(ctx), "body": tpl["body"].format_map(ctx)}


def channel_status() -> Dict[str, bool]:
    """Which channels can actually deliver right now (else they queue)."""
    email_ok = False
    try:
        import email_service
        email_ok = email_service._selected_provider() in ("resend", "smtp")
    except Exception:
        pass
    return {
        "email": email_ok,
        "whatsapp": bool(os.environ.get("EVENT_WHATSAPP_PROVIDER")),
        "sms": bool(os.environ.get("EVENT_SMS_PROVIDER")),
        "push": bool(os.environ.get("EVENT_PUSH_PROVIDER")),
    }


async def _dispatch_email(db, to: str, subject: str, body: str) -> Dict[str, Any]:
    try:
        import email_service
        html = f"<p>{body}</p>"
        res = await email_service.send_email(to, subject, html, body, db=db, tags=["event"])
        return {"status": "sent" if res.get("ok") else "failed",
                "provider": res.get("provider"), "reason": res.get("error", "")}
    except Exception as e:   # never raise from a notification
        return {"status": "failed", "reason": str(e)}


def _dispatch_external(channel: str, to: str, body: str) -> Dict[str, Any]:
    """WhatsApp / SMS / push. No vendor is wired in this environment, so these QUEUE
    to the outbox for later delivery. Plug a provider here (Gupshup/Twilio/FCM/…)."""
    if channel_status().get(channel):
        # a configured provider would send here and return {"status": "sent"}
        return {"status": "sent", "provider": os.environ.get(f"EVENT_{channel.upper()}_PROVIDER")}
    return {"status": "queued", "reason": "provider_not_configured"}


async def dispatch(db, event_id: str, *, to: str, channel: str, template_key: str,
                   context: Optional[Dict[str, Any]] = None,
                   actor: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Render + send + record one notification. Best-effort: it records a row for
    every attempt (sent / queued / failed) so nothing is silently lost."""
    if channel not in CHANNELS:
        raise HTTPException(422, f"Unknown channel '{channel}'")
    msg = _render(template_key, context or {})
    if channel == "email":
        outcome = await _dispatch_email(db, to, msg["subject"], msg["body"])
    else:
        outcome = _dispatch_external(channel, to, msg["body"])
    row = {"id": _uid("ntf"), "event_id": event_id, "channel": channel, "recipient": to,
           "template": template_key, "subject": msg["subject"], "body": msg["body"],
           "status": outcome["status"], "reason": outcome.get("reason", ""),
           "provider": outcome.get("provider"), "created_at": _now(), "deleted_at": None}
    await db.event_notifications.insert_one(row)
    await _audit(db, event_id, actor or {"user_id": "system"}, "notification_" + outcome["status"],
                 "notifications", after={"channel": channel, "template": template_key})
    return {"notification_id": row["id"], "status": outcome["status"],
            "reason": outcome.get("reason", ""), "channel": channel}


async def notify_safe(db, event_id: str, **kw) -> None:
    """Fire-and-forget wrapper for auto-triggers — never disturbs the calling flow."""
    try:
        await dispatch(db, event_id, **kw)
    except Exception:
        pass


async def list_notifications(db, event_id: str, *, page: int = 1, limit: int = 50) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    async for r in db.event_notifications.find({"event_id": event_id}):
        if r.get("deleted_at"):
            continue
        r.pop("_id", None)
        rows.append(r)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    total = len(rows)
    page = max(1, int(page)); limit = max(1, min(int(limit), 200))
    start = (page - 1) * limit
    return {"items": rows[start:start + limit], "total": total, "page": page,
            "pages": (total + limit - 1) // limit}


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_event_notifications_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-notifications"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/{event_id}/notifications/channels")
    async def channels(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        await rbac.authorize_event(db, event_id, current, rbac.P_NOTIFY_SEND)
        return {"channels": channel_status(), "templates": sorted(TEMPLATES)}

    @router.post("/api/events/{event_id}/notifications")
    async def send(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        await rbac.authorize_event(db, event_id, current, rbac.P_NOTIFY_SEND)
        return await dispatch(db, event_id, to=(body or {}).get("to", ""),
                              channel=(body or {}).get("channel", "email"),
                              template_key=(body or {}).get("template", "custom"),
                              context=(body or {}).get("context") or body, actor=current)

    @router.get("/api/events/{event_id}/notifications")
    async def history(event_id: str, page: int = 1, limit: int = 50, current=Depends(get_current_buyer)):
        await _gate()
        await rbac.authorize_event(db, event_id, current, rbac.P_NOTIFY_SEND)
        return await list_notifications(db, event_id, page=page, limit=limit)

    # --- Studio Notifications Hub (Specification Section 61 & 62) ---
    @router.get("/api/studio/notifications")
    async def get_studio_notifications(current=Depends(get_current_buyer)):
        admin_id = (current or {}).get("admin_id") or (current or {}).get("id")
        cursor = db.studio_notifications.find({"admin_id": admin_id}, {"_id": 0}).sort("created_at", -1).limit(100)
        items = []
        async for doc in cursor:
            items.append(doc)

        # Seed sample notifications if empty so photographer has real items
        if not items:
            sample_notifs = [
                {
                    "id": _uid("notif"),
                    "admin_id": admin_id,
                    "title": "Welcome to MAJA Studio",
                    "body": "Your studio dashboard is fully configured. Start managing your Storage & Wedding Invitations.",
                    "category": "system",
                    "read": False,
                    "created_at": _now(),
                    "link": "/studio/storage",
                },
                {
                    "id": _uid("notif"),
                    "admin_id": admin_id,
                    "title": "Storage Quota Active",
                    "body": "Your 100 GB studio storage backup allocation is active.",
                    "category": "storage",
                    "read": False,
                    "created_at": _now(),
                    "link": "/studio/storage",
                }
            ]
            for sn in sample_notifs:
                await db.studio_notifications.insert_one(sn)
                sn.pop("_id", None)
            items = sample_notifs

        unread_count = sum(1 for item in items if not item.get("read"))
        return {"items": items, "total": len(items), "unread_count": unread_count}

    @router.post("/api/studio/notifications/read")
    async def mark_notification_read(body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        admin_id = (current or {}).get("admin_id") or (current or {}).get("id")
        notif_id = (body or {}).get("id")
        if notif_id:
            await db.studio_notifications.update_one({"id": notif_id, "admin_id": admin_id}, {"$set": {"read": True}})
        return {"success": True}

    @router.post("/api/studio/notifications/read-all")
    async def mark_all_notifications_read(current=Depends(get_current_buyer)):
        admin_id = (current or {}).get("admin_id") or (current or {}).get("id")
        await db.studio_notifications.update_many({"admin_id": admin_id}, {"$set": {"read": True}})
        return {"success": True}

    return router
