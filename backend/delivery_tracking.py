"""
delivery_tracking.py — Email/SMS delivery observability (Phase 12).

Every email/SMS send is logged to `delivery_log` at the moment it's sent (works
TODAY). Downstream states — delivered / opened / clicked / bounced / failed —
arrive via the provider's webhook (Resend / SES / MSG91 / Twilio) once you point
it at `/api/webhooks/delivery` with a shared secret. No fake states: until the
webhook is connected, rows simply stay at "sent".

Privacy: the recipient is stored MASKED (`a***@gmail.com`, `***4321`), never in
full.

    from delivery_tracking import build_delivery_router, record_send, record_event
    app.include_router(build_delivery_router(db, require_admin))
"""
from __future__ import annotations

import os
import uuid
import hmac
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, Request, HTTPException

logger = logging.getLogger("delivery")

# furthest-reached ranking so a late "delivered" webhook can't downgrade "opened"
_RANK = {"sent": 0, "queued": 0, "delivered": 1, "opened": 2, "clicked": 3,
         "bounced": -1, "failed": -1, "complained": -2}
POSITIVE = {"delivered", "opened", "clicked"}
NEGATIVE = {"bounced", "failed", "complained"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask(channel: str, recipient: str) -> str:
    r = (recipient or "").strip()
    if not r:
        return "unknown"
    if channel == "email" and "@" in r:
        user, _, dom = r.partition("@")
        return f"{user[:1]}***@{dom}"
    digits = "".join(c for c in r if c.isdigit())
    return f"***{digits[-4:]}" if len(digits) >= 4 else "***"


async def record_send(db, channel: str, recipient: str, provider: str,
                      message_id: Optional[str] = None, ok: bool = True,
                      dev: bool = False, tags: Optional[List[str]] = None) -> Optional[str]:
    """Log a send. Never raises. Returns the row id."""
    try:
        rid = f"dlv_{uuid.uuid4().hex[:14]}"
        status = "sent" if ok else "failed"
        await db.delivery_log.insert_one({
            "id": rid,
            "channel": channel,                # "email" | "sms"
            "recipient_masked": _mask(channel, recipient),
            "provider": provider or "unknown",
            "message_id": message_id,
            "dev": bool(dev),
            "tags": tags or [],
            "status": status,
            "events": [{"event": status, "at": _now_iso()}],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
        return rid
    except Exception as e:
        logger.warning("[delivery] record_send failed: %s", e)
        return None


async def record_event(db, message_id: str, event: str,
                       channel: Optional[str] = None, meta: Optional[dict] = None) -> Optional[dict]:
    """Apply a provider webhook event to the matching send row."""
    event = (event or "").strip().lower()
    if not message_id or event not in _RANK:
        return None
    q = {"message_id": message_id}
    row = await db.delivery_log.find_one(q, {"_id": 0})
    if not row:
        return None
    events = row.get("events", [])
    events.append({"event": event, "at": _now_iso(), "meta": meta or {}})
    # advance status only forward (positive) or to a negative terminal state
    cur = row.get("status", "sent")
    new_status = cur
    if event in NEGATIVE:
        new_status = event
    elif _RANK.get(event, 0) > _RANK.get(cur, 0) and cur not in NEGATIVE:
        new_status = event
    await db.delivery_log.update_one(q, {"$set": {"events": events, "status": new_status, "updated_at": _now_iso()}})
    return {"message_id": message_id, "status": new_status}


async def delivery_stats(db, days: int = 30, channel: Optional[str] = None) -> Dict[str, Any]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = await db.delivery_log.find({}, {"_id": 0}).to_list(200000)
    rows = [r for r in rows if (r.get("created_at") or "") >= since and (not channel or r.get("channel") == channel)]

    def _has(r, evs):
        return any(e.get("event") in evs for e in r.get("events", []))

    sent = len(rows)
    delivered = sum(1 for r in rows if _has(r, {"delivered", "opened", "clicked"}))
    opened = sum(1 for r in rows if _has(r, {"opened", "clicked"}))
    clicked = sum(1 for r in rows if _has(r, {"clicked"}))
    bounced = sum(1 for r in rows if _has(r, {"bounced"}))
    failed = sum(1 for r in rows if r.get("status") == "failed")

    by_provider: Dict[str, int] = defaultdict(int)
    by_day: Dict[str, int] = defaultdict(int)
    by_channel: Dict[str, int] = defaultdict(int)
    for r in rows:
        by_provider[r.get("provider", "unknown")] += 1
        by_channel[r.get("channel", "unknown")] += 1
        day = (r.get("created_at") or "")[:10]
        if day:
            by_day[day] += 1

    def _rate(n, d):
        return round(n / d * 100, 1) if d else 0.0

    return {
        "window_days": days,
        "totals": {"sent": sent, "delivered": delivered, "opened": opened,
                   "clicked": clicked, "bounced": bounced, "failed": failed},
        "rates_pct": {
            "delivery": _rate(delivered, sent),
            "bounce": _rate(bounced, sent),
            "open": _rate(opened, delivered),
            "click": _rate(clicked, opened),
            "failure": _rate(failed, sent),
        },
        "by_provider": dict(by_provider),
        "by_channel": dict(by_channel),
        "daily": [{"day": d, "sent": by_day[d]} for d in sorted(by_day)[-30:]],
        "webhook_connected": bool(os.environ.get("DELIVERY_WEBHOOK_SECRET")),
    }


def _normalize_webhook(channel: str, body: dict) -> Optional[Dict[str, str]]:
    """Best-effort map of common provider payloads → {message_id, event}."""
    if not isinstance(body, dict):
        return None
    # Our own generic shape
    if body.get("message_id") and body.get("event"):
        return {"message_id": str(body["message_id"]), "event": str(body["event"])}
    # Resend: {type:"email.delivered", data:{email_id:"..."}}
    t = body.get("type")
    if t and str(t).startswith("email."):
        mid = (body.get("data") or {}).get("email_id") or (body.get("data") or {}).get("id")
        if mid:
            return {"message_id": str(mid), "event": str(t).split(".", 1)[1]}
    # Twilio: {MessageSid, MessageStatus}
    if body.get("MessageSid") and body.get("MessageStatus"):
        m = {"delivered": "delivered", "sent": "sent", "undelivered": "failed", "failed": "failed"}
        return {"message_id": str(body["MessageSid"]), "event": m.get(str(body["MessageStatus"]).lower(), "sent")}
    return None


def build_delivery_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["delivery"])

    @router.post("/api/webhooks/delivery")
    async def delivery_webhook(request: Request):
        secret = os.environ.get("DELIVERY_WEBHOOK_SECRET", "")
        if not secret:
            raise HTTPException(503, "Delivery webhook not configured")
        provided = request.headers.get("x-webhook-secret") or request.query_params.get("secret") or ""
        if not hmac.compare_digest(provided, secret):
            raise HTTPException(401, "Bad webhook secret")
        try:
            body = await request.json()
        except Exception:
            body = {}
        channel = request.query_params.get("channel", "email")
        norm = _normalize_webhook(channel, body)
        if not norm:
            return {"ok": True, "ignored": True}
        await record_event(db, norm["message_id"], norm["event"], channel=channel, meta={"src": "webhook"})
        return {"ok": True}

    @router.get("/api/admin/delivery/stats")
    async def stats(days: int = 30, channel: Optional[str] = None, admin=Depends(require_admin)):
        return await delivery_stats(db, days=max(1, min(365, int(days or 30))), channel=channel)

    @router.get("/api/admin/delivery/recent")
    async def recent(channel: Optional[str] = None, limit: int = 50, admin=Depends(require_admin)):
        rows = await db.delivery_log.find({}, {"_id": 0}).to_list(200000)
        if channel:
            rows = [r for r in rows if r.get("channel") == channel]
        rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return {"items": rows[:max(1, min(200, int(limit or 50)))]}

    return router
