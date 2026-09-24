"""
portfolio_leads.py — public "enquire with this photographer" → real CRM lead.

Closes the audit gap: a couple viewing a photographer's public portfolio could
only tap a WhatsApp/phone link — nothing was captured, and the studio's CRM had
no inbound pipeline. This adds a public enquiry endpoint that writes a real lead
straight into the SAME CRM the photographer already works
(`pixora_crm_clients`, status "lead") plus a timeline note, so the enquiry shows
up under Community → CRM with a "portfolio" source tag.

Design choices (honest + safe):
  * The lead is stored REGARDLESS of the studio's plan tier. Capturing an inbound
    enquiry must never be silently dropped for a free studio; the CRM *management*
    UI stays plan-gated as before, but a real lead is a real lead.
  * Studio resolved via portfolio_service._resolve_studio (id OR pretty slug), the
    exact resolver the public portfolio page uses — the two never drift.
  * At least one reply channel (phone or email) is required so every captured lead
    is actually actionable.
  * The endpoint is rate-limited per IP to keep the pipeline clean of spam.

    from portfolio_leads import build_portfolio_leads_router
    app.include_router(build_portfolio_leads_router(db))
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("portfolio_leads")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(s: Optional[str], n: int) -> str:
    return (s or "").strip()[:n]


class EnquiryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=160)
    event_type: str = Field(default="", max_length=60)
    event_date: str = Field(default="", max_length=20)
    message: str = Field(default="", max_length=2000)


async def create_lead(db, studio_key: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve the studio behind `studio_key` and write a CRM lead + timeline note.

    Raises ValueError for bad input, LookupError if the studio doesn't exist.
    Returns a small summary (never leaks other CRM data).
    """
    from portfolio_service import _resolve_studio

    name = _clean(data.get("name"), 120)
    if not name:
        raise ValueError("Your name is required.")
    phone = _clean(data.get("phone"), 40)
    email = _clean(data.get("email"), 160)
    if not phone and not email:
        raise ValueError("Add a phone number or email so the studio can reply.")
    if email and not _EMAIL_RE.match(email):
        raise ValueError("That email address doesn't look right.")

    sid, raw = await _resolve_studio(db, studio_key)
    admin = await db.admins.find_one({"id": sid}, {"_id": 0})
    if not raw and not admin:
        raise LookupError("Photographer not found")

    now = _now()
    event_type = _clean(data.get("event_type"), 60)
    event_date = _clean(data.get("event_date"), 20)
    message = _clean(data.get("message"), 2000)
    note_bits = [b for b in (event_type, event_date) if b]
    summary_note = "Enquiry via portfolio" + (f" — {' · '.join(note_bits)}" if note_bits else "")

    client_id = f"cli_{uuid.uuid4().hex[:14]}"
    doc = {
        "id": client_id, "studio_id": sid,
        "name": name, "phone": phone, "email": email,
        "event_type": event_type, "event_date": event_date,
        "status": "lead", "budget_inr": 0,
        "payment_status": "unpaid", "contract_status": "none",
        "notes": message, "follow_up_date": "",
        "source": "portfolio",           # tags the lead's origin in the CRM list
        "created_at": now, "updated_at": now,
    }
    await db.pixora_crm_clients.insert_one(doc)

    await db.pixora_crm_timeline.insert_one({
        "id": f"tl_{uuid.uuid4().hex[:12]}", "studio_id": sid, "client_id": client_id,
        "stage": "inquiry", "note": (message or summary_note)[:2000], "created_at": now,
    })

    logger.info("[leads] new portfolio enquiry for studio=%s client=%s", sid, client_id)
    return {"ok": True, "lead_id": client_id, "studio_id": sid}


def build_portfolio_leads_router(db) -> APIRouter:
    router = APIRouter(tags=["portfolio-leads"])

    @router.post("/api/public/photographer/{studio_id}/enquiry")
    async def enquire(studio_id: str, payload: EnquiryIn, request: Request):
        # Throttle by IP+studio so the pipeline can't be spammed.
        try:
            from cache_backend import rate_limit_allow
            ip = request.client.host if request and request.client else "unknown"
            if not await rate_limit_allow(f"enquiry:{ip}:{studio_id}", limit=8, window_seconds=3600):
                raise HTTPException(429, "Too many enquiries — please try again later.")
        except HTTPException:
            raise
        except Exception:
            pass
        try:
            return await create_lead(db, studio_id, payload.model_dump())
        except ValueError as e:
            raise HTTPException(400, str(e))
        except LookupError as e:
            raise HTTPException(404, str(e))

    return router
