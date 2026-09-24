"""
calendar_service.py — Occupancy Calendar / booking availability (Part 11).

A studio manages its bookings + blocked dates; customers see availability on the
public profile before enquiring.

Collections (JSONB, auto-created):
  studio_bookings   — one per booking (date, slot, event, client, status)
  studio_blocks     — blocked/vacation/travel days
  studio_avail_cfg  — per-studio availability config (buffer days, recurring holidays)

Booking status: accepted | tentative | cancelled.
Slot: full_day | half_day_morning | half_day_evening.
Block kind: blocked | vacation | travel | holiday.

Wired in server.py:
    from calendar_service import build_calendar_router
    app.include_router(build_calendar_router(db, require_admin))
"""
from __future__ import annotations

import uuid
import logging
import calendar as _cal
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("calendar")

SLOTS = ["full_day", "half_day_morning", "half_day_evening"]
BOOKING_STATUS = ["accepted", "tentative", "cancelled"]
BLOCK_KINDS = ["blocked", "vacation", "travel", "holiday"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BookingIn(BaseModel):
    date: str                      # YYYY-MM-DD
    slot: str = "full_day"
    event_type: Optional[str] = None
    client_name: Optional[str] = None
    location: Optional[str] = None
    maps_url: Optional[str] = None
    status: str = "tentative"
    notes: Optional[str] = None
    color: Optional[str] = None


class BlockIn(BaseModel):
    date: str
    kind: str = "blocked"
    note: Optional[str] = None


class AvailCfgIn(BaseModel):
    buffer_days: int = 0
    recurring_holidays: List[int] = Field(default_factory=list)  # weekday ints 0=Mon..6=Sun
    accepting_bookings: bool = True


def build_calendar_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["calendar"])

    @router.get("/api/calendar/meta")
    async def meta():
        return {"slots": SLOTS, "booking_status": BOOKING_STATUS, "block_kinds": BLOCK_KINDS}

    # ---- bookings ----------------------------------------------------------
    @router.post("/api/calendar/bookings")
    async def create_booking(payload: BookingIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if payload.slot not in SLOTS:
            raise HTTPException(400, "Invalid slot")
        if payload.status not in BOOKING_STATUS:
            raise HTTPException(400, "Invalid status")
        doc = {"id": f"bkg_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **payload.model_dump(), "created_at": _now()}
        await db.studio_bookings.insert_one(doc)
        return {"booking": doc}

    @router.get("/api/calendar/bookings")
    async def list_bookings(admin: dict = Depends(require_admin),
                            month: Optional[str] = None):
        sid = admin["admin_id"]
        rows = await db.studio_bookings.find({"studio_id": sid}, {"_id": 0}).sort("date", 1).to_list(1000)
        if month:  # YYYY-MM prefix filter in Python
            rows = [r for r in rows if str(r.get("date", "")).startswith(month)]
        return {"bookings": rows}

    @router.put("/api/calendar/bookings/{bid}")
    async def update_booking(bid: str, payload: BookingIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        b = await db.studio_bookings.find_one({"id": bid, "studio_id": sid}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Booking not found")
        await db.studio_bookings.update_one({"id": bid}, {"$set": {**payload.model_dump(), "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/calendar/bookings/{bid}")
    async def delete_booking(bid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.studio_bookings.delete_one({"id": bid, "studio_id": sid})
        return {"deleted": True}

    # ---- blocks ------------------------------------------------------------
    @router.post("/api/calendar/blocks")
    async def create_block(payload: BlockIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if payload.kind not in BLOCK_KINDS:
            raise HTTPException(400, "Invalid block kind")
        doc = {"id": f"blk_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **payload.model_dump(), "created_at": _now()}
        await db.studio_blocks.insert_one(doc)
        return {"block": doc}

    @router.delete("/api/calendar/blocks/{blk}")
    async def delete_block(blk: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.studio_blocks.delete_one({"id": blk, "studio_id": sid})
        return {"deleted": True}

    # ---- availability config ----------------------------------------------
    @router.get("/api/calendar/config")
    async def get_cfg(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        cfg = await db.studio_avail_cfg.find_one({"id": sid}, {"_id": 0})
        return {"config": cfg or {"buffer_days": 0, "recurring_holidays": [], "accepting_bookings": True}}

    @router.put("/api/calendar/config")
    async def put_cfg(payload: AvailCfgIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = {"id": sid, "studio_id": sid, **payload.model_dump(), "updated_at": _now()}
        existing = await db.studio_avail_cfg.find_one({"id": sid}, {"_id": 0})
        if existing:
            await db.studio_avail_cfg.update_one({"id": sid}, {"$set": doc})
        else:
            await db.studio_avail_cfg.insert_one(doc)
        return {"saved": True, "config": doc}

    # ---- month occupancy (studio view) ------------------------------------
    async def _month_map(sid: str, year: int, month: int) -> Dict[str, Any]:
        prefix = f"{year:04d}-{month:02d}"
        bookings = await db.studio_bookings.find({"studio_id": sid}, {"_id": 0}).to_list(1000)
        blocks = await db.studio_blocks.find({"studio_id": sid}, {"_id": 0}).to_list(1000)
        cfg = await db.studio_avail_cfg.find_one({"id": sid}, {"_id": 0}) or {}
        recurring = set(cfg.get("recurring_holidays", []))
        bookings = [b for b in bookings if str(b.get("date", "")).startswith(prefix)]
        blocks = [b for b in blocks if str(b.get("date", "")).startswith(prefix)]
        days = _cal.monthrange(year, month)[1]
        out: Dict[str, Any] = {}
        by_date_book: Dict[str, List[Dict[str, Any]]] = {}
        for b in bookings:
            by_date_book.setdefault(b["date"], []).append(b)
        by_date_block = {b["date"]: b for b in blocks}
        for d in range(1, days + 1):
            iso = f"{prefix}-{d:02d}"
            wd = date(year, month, d).weekday()
            dbookings = [b for b in by_date_book.get(iso, []) if b.get("status") != "cancelled"]
            block = by_date_block.get(iso)
            if block:
                status = block.get("kind", "blocked")
            elif wd in recurring:
                status = "holiday"
            elif any(b.get("slot") == "full_day" for b in dbookings):
                status = "booked"
            elif dbookings:
                status = "partial"
            else:
                status = "available"
            out[iso] = {"status": status, "bookings": dbookings,
                        "block": block, "weekday": wd}
        return out

    @router.get("/api/calendar/month")
    async def month(year: int, month: int, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        return {"year": year, "month": month, "days": await _month_map(sid, year, month)}

    # ---- PUBLIC availability (customers view; no client PII) ---------------
    @router.get("/api/public/photographer/{studio_id}/availability")
    async def public_availability(studio_id: str, year: int, month: int):
        full = await _month_map(studio_id, year, month)
        # strip private booking details — expose only per-day availability status
        pub = {iso: {"status": ("available" if v["status"] == "partial" else v["status"]),
                     "has_slots": v["status"] in ("available", "partial")}
               for iso, v in full.items()}
        return {"year": year, "month": month, "days": pub}

    return router
