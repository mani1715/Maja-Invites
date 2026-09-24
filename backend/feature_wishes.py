"""
feature_wishes.py — "I want something that isn't on the list."

The owner's ask: wherever a buyer is choosing features, let them ASK for one we
don't sell yet. They type what they want plus THEIR PHONE NUMBER; the owner sees
a highlighted notification in the admin panel with that number, calls them, and
they agree the feature and the price on the phone.

Deliberate design decisions:

  * A phone number is REQUIRED and normalised, because the entire point is that
    the owner can call back. A request with no reachable number is worthless, so
    it is rejected at the door rather than stored and silently ignored.
  * Requests are visible to the owner whether or not the person is signed in.
    Someone who has not bought yet is exactly the lead worth calling.
  * `is_new` drives the highlight, and only the owner can clear it — so an unread
    lead cannot quietly disappear.
  * Rate-limited per phone number: a bored visitor cannot fill the console with
    hundreds of rows and bury real leads.
  * Consent is recorded with the request. The person is told, in the payload we
    store, that they are asking us to call them — that IS the lawful basis for
    the call, so it must be captured, not assumed.

Collection: db.feature_wishes
    {id, text, phone, name, email, source, design_id, order_id, user_id,
     buyer_kind, consent_call, status, is_new, admin_note, quoted_price_inr,
     created_at, updated_at, contacted_at}

Public:  POST /api/feature-wishes
Owner:   GET  /api/admin/feature-wishes            (?status=&only_new=)
         GET  /api/admin/feature-wishes/summary     (badge count for the panel)
         PATCH /api/admin/feature-wishes/{id}
"""
from __future__ import annotations

import asyncio
import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field

logger = logging.getLogger("feature_wishes")

STATUSES = ("new", "contacted", "quoted", "agreed", "declined", "closed")
MAX_PER_PHONE_PER_DAY = 5
MAX_TEXT = 1200

# What the buyer is agreeing to when they submit. Stored WITH the request so
# there is a record of exactly what they were told, not a claim about it later.
CONSENT_TEXT = (
    "I'm asking MAJA Invites to contact me on this number about the feature I've "
    "described. I understand this is a request, not an order: the feature and its "
    "price are agreed on the call, nothing is charged now, and my existing "
    "invitation is unaffected. My number is used only to reply to this request."
)


# Where the "someone wants a custom feature" alert goes. Overridable via env so
# the address can change (or a second recipient be added) without a code deploy;
# comma-separated for more than one.
DEFAULT_ALERT_EMAIL = "ettelamaneesh@gmail.com"
SITE_URL = os.environ.get("PUBLIC_SITE_URL", "https://majainvites.com")


def alert_recipients() -> list:
    raw = os.environ.get("FEATURE_REQUEST_ALERT_EMAIL", DEFAULT_ALERT_EMAIL)
    return [a.strip() for a in raw.split(",") if a.strip()]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def alert_email(wish: Dict[str, Any]) -> tuple:
    """(subject, html, text) for the owner alert.

    The subject line carries the phone number on purpose: on a phone's lock
    screen the notification alone is enough to know who to call, without opening
    anything. The body leads with the number as a tel: link for the same reason.
    """
    who = wish.get("name") or "Someone"
    phone = wish.get("phone") or ""
    text_body = (wish.get("text") or "").strip()
    subject = f"Feature request from {who} · {phone}"

    console = f"{SITE_URL}/super-admin/feature-requests"
    html = f"""<!doctype html><html><body style="margin:0;background:#0A0A0F;
      font-family:Inter,Arial,sans-serif;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#16110C;border-radius:12px;
        border:1px solid rgba(201,168,76,0.35);padding:28px;color:#FFF8DC;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
          color:rgba(232,213,163,0.7);">Custom feature request</p>
        <h1 style="font-size:20px;color:#E8D5A3;margin:0 0 4px;">{_esc(who)} wants something we don't sell</h1>
        <p style="margin:14px 0 4px;font-size:13px;color:rgba(255,248,220,0.6);">Call them on</p>
        <p style="margin:0 0 18px;font-size:26px;">
          <a href="tel:{_esc(phone)}" style="color:#E8C766;text-decoration:none;">{_esc(phone)}</a>
        </p>
        <div style="background:rgba(255,255,255,0.04);border-left:3px solid #D4AF37;
          padding:12px 14px;border-radius:4px;font-size:15px;line-height:1.6;
          color:rgba(255,248,220,0.9);white-space:pre-wrap;">{_esc(text_body)}</div>
        <p style="margin:16px 0 0;font-size:12px;color:rgba(255,248,220,0.5);">
          Asked from: {_esc(wish.get('source') or 'cart')}
          {(' · design ' + _esc(wish.get('design_id'))) if wish.get('design_id') else ''}
          {(' · ' + _esc(wish.get('email'))) if wish.get('email') else ''}
        </p>
        <p style="margin:22px 0 0;">
          <a href="{console}" style="display:inline-block;background:#D4AF37;color:#16110C;
            text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;
            font-weight:600;">Open in the admin panel</a>
        </p>
        <p style="margin-top:22px;font-size:12px;color:rgba(255,248,220,0.45);">
          They ticked the box agreeing to be called on this number.</p>
      </div></body></html>"""

    text = (f"{who} wants a feature we don't sell yet.\n\n"
            f"Call: {phone}\n\n{text_body}\n\n"
            f"Asked from: {wish.get('source') or 'cart'}\n"
            f"Admin panel: {console}\n")
    return subject, html, text


def _esc(value) -> str:
    """Escape for HTML. Buyer-supplied text goes into an email body, so it must
    not be able to inject markup — the same rule as any other untrusted input."""
    return (str(value or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


def normalise_phone(raw: str) -> str:
    """Reduce an Indian mobile number to digits and validate it can be dialled.

    Accepts the shapes people actually type — "+91 98765 43210",
    "098765-43210", "9876543210" — and rejects what cannot be called.
    Returns E.164-ish "+919876543210", or "" when it is not a usable number.
    """
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91{digits}"
    if len(digits) == 11 and digits.startswith("0") and digits[1] in "6789":
        return f"+91{digits[1:]}"
    if len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
        return f"+91{digits[2:]}"
    # Any other country: keep it if it is a plausible international length.
    if 8 <= len(digits) <= 15:
        return f"+{digits}"
    return ""


class WishIn(BaseModel):
    text: str = Field(min_length=5, max_length=MAX_TEXT)
    phone: str = Field(min_length=6, max_length=24)
    name: str = Field("", max_length=120)
    email: str = Field("", max_length=254)
    # Where they were standing when they asked — cart, invitation form, panel.
    source: str = Field("cart", max_length=64)
    design_id: str = Field("", max_length=64)
    order_id: str = Field("", max_length=64)
    consent_call: bool = False


class WishPatch(BaseModel):
    status: Optional[str] = None
    admin_note: Optional[str] = None
    quoted_price_inr: Optional[int] = None
    is_new: Optional[bool] = None


def build_feature_wish_router(db, get_current_buyer=None, require_super_admin=None) -> APIRouter:
    router = APIRouter(tags=["feature-wishes"])

    def _card(doc: Dict[str, Any]) -> Dict[str, Any]:
        d = dict(doc)
        d.pop("_id", None)
        return d

    # ---- public: the exact wording the buyer must agree to ----------------
    @router.get("/api/feature-wishes/consent")
    async def wish_consent():
        """Served rather than duplicated in the frontend: the text we STORE with
        each request and the text the buyer READS must be the same string, or the
        consent record is worthless."""
        return {"consent_text": CONSENT_TEXT, "max_text": MAX_TEXT}

    # ---- public: ask for a feature ----------------------------------------
    @router.post("/api/feature-wishes")
    async def create_wish(payload: WishIn):
        phone = normalise_phone(payload.phone)
        if not phone:
            raise HTTPException(
                422, "Please enter a phone number we can call you on (for example 98765 43210).")
        if not payload.consent_call:
            raise HTTPException(
                422, "Please tick the box so we know it's okay to call you about this.")

        text = payload.text.strip()
        if len(text) < 5:
            raise HTTPException(422, "Please tell us a little more about what you need.")

        # Rate limit per number so real leads are never buried under noise.
        since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        try:
            recent = await db.feature_wishes.find({"phone": phone}, {"_id": 0}).to_list(50)
        except Exception:
            recent = []
        if len([r for r in recent if (r.get("created_at") or "") >= since]) >= MAX_PER_PHONE_PER_DAY:
            raise HTTPException(
                429, "We've already received your requests — our team will call you shortly.")

        doc = {
            "id": f"wish_{uuid.uuid4().hex[:14]}",
            "text": text,
            "phone": phone,
            "name": (payload.name or "").strip()[:120],
            "email": (payload.email or "").strip()[:160],
            "source": (payload.source or "cart").strip()[:40],
            "design_id": (payload.design_id or "").strip()[:120],
            "order_id": (payload.order_id or "").strip()[:120],
            "user_id": None, "buyer_kind": None,
            "consent_call": True,
            "consent_text": CONSENT_TEXT,
            "status": "new",
            "is_new": True,          # drives the highlight in the admin panel
            "admin_note": "", "quoted_price_inr": None,
            "created_at": _now(), "updated_at": _now(), "contacted_at": None,
        }

        # Attach the signed-in buyer when there is one. Anonymous requests are
        # still kept — someone who hasn't bought yet is a lead worth calling.
        if get_current_buyer is not None:
            try:
                cur = await get_current_buyer()          # type: ignore[misc]
                if cur:
                    doc["user_id"] = cur.get("user_id")
                    doc["buyer_kind"] = cur.get("kind")
            except Exception:
                pass

        await db.feature_wishes.insert_one(doc)
        logger.info("[feature_wishes] new request %s from %s (source=%s)",
                    doc["id"], phone, doc["source"])

        # Email the owner. Deliberately AFTER the insert and never awaited into
        # the response: the lead is already safe in the database, so a mail
        # outage must not fail the buyer's submission or make them retry (which
        # would only trip the rate limit). The email is the convenience; the row
        # is the record.
        asyncio.ensure_future(_notify_owner(doc))

        return {"submitted": True, "id": doc["id"],
                "message": "Thank you — we'll call you on this number to talk it through."}

    async def _notify_owner(wish: Dict[str, Any]) -> None:
        try:
            from email_service import send_email
            subject, html, text = alert_email(wish)
            for to in alert_recipients():
                out = await send_email(to, subject, html, text, db=db,
                                       tags=["feature-request"])
                if out.get("ok"):
                    # dev_mode means no provider is configured: it was logged and
                    # written to email_outbox, NOT delivered. Say which happened
                    # so a silent dev-mode never reads as a real send.
                    logger.info("[feature_wishes] alert %s to %s (provider=%s%s)",
                                wish["id"], to, out.get("provider"),
                                ", DEV MODE — not actually delivered"
                                if out.get("dev_mode") else "")
                else:
                    logger.error("[feature_wishes] alert to %s FAILED: %s — the "
                                 "request is still in the admin panel", to,
                                 out.get("error"))
            await db.feature_wishes.update_one(
                {"id": wish["id"]}, {"$set": {"alert_sent_at": _now()}})
        except Exception:
            logger.exception("[feature_wishes] owner alert failed for %s — lead is "
                             "safe in the panel", wish.get("id"))

    # ---- owner ------------------------------------------------------------
    if require_super_admin is not None:
        @router.get("/api/admin/feature-wishes/summary")
        async def wish_summary(_s=Depends(require_super_admin)):
            """Badge counts for the admin panel — new requests must be obvious."""
            try:
                rows = await db.feature_wishes.find({}, {"_id": 0}).to_list(1000)
            except Exception:
                rows = []
            new_rows = [r for r in rows if r.get("is_new")]
            return {
                "total": len(rows),
                "new": len(new_rows),
                "open": len([r for r in rows
                             if r.get("status") not in ("closed", "declined")]),
                # Newest first so the panel can show "Priya · +9198… · wants X".
                "latest": sorted(new_rows, key=lambda r: r.get("created_at") or "",
                                 reverse=True)[:5],
            }

        @router.get("/api/admin/feature-wishes")
        async def list_wishes(status: str = "", only_new: bool = False,
                              _s=Depends(require_super_admin)):
            try:
                rows = await db.feature_wishes.find({}, {"_id": 0}).to_list(1000)
            except Exception:
                rows = []
            if status:
                rows = [r for r in rows if r.get("status") == status]
            if only_new:
                rows = [r for r in rows if r.get("is_new")]
            rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
            return {"items": [_card(r) for r in rows], "statuses": list(STATUSES)}

        @router.patch("/api/admin/feature-wishes/{wish_id}")
        async def patch_wish(wish_id: str, payload: WishPatch = Body(...),
                             _s=Depends(require_super_admin)):
            doc = await db.feature_wishes.find_one({"id": wish_id}, {"_id": 0})
            if not doc:
                raise HTTPException(404, "Request not found")
            upd: Dict[str, Any] = {"updated_at": _now()}
            if payload.status is not None:
                if payload.status not in STATUSES:
                    raise HTTPException(400, f"status must be one of {', '.join(STATUSES)}")
                upd["status"] = payload.status
                # Moving off "new" means the owner has picked it up, so the
                # highlight clears itself — one action, not two.
                if payload.status != "new":
                    upd["is_new"] = False
                if payload.status == "contacted" and not doc.get("contacted_at"):
                    upd["contacted_at"] = _now()
            if payload.admin_note is not None:
                upd["admin_note"] = payload.admin_note[:2000]
            if payload.quoted_price_inr is not None:
                upd["quoted_price_inr"] = max(0, int(payload.quoted_price_inr))
            if payload.is_new is not None:
                upd["is_new"] = bool(payload.is_new)
            await db.feature_wishes.update_one({"id": wish_id}, {"$set": upd})
            return {"saved": True, "id": wish_id, **upd}

    return router
