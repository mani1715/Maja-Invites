"""
event_money_service.py — MAJA Dynamic Event Engine: money portal, leaderboard, blessings.
==========================================================================================

Ganesh v2 §3. Three surfaces, all behind `ganesh_module_enabled`:

  1. PUBLIC (no auth) — guests submit/read blessings; read the donor leaderboard
     (sorted big→small, anonymity + hide-amount respected).
  2. OWNER (get_current_buyer + owns the event) — create up to 8 scoped "money member"
     logins, list/revoke them, and download the money report (CSV).
  3. MONEY MEMBER (own scoped JWT) — the ≤8 people the owner authorises to record who
     gave money + add spending. The token authorises exactly ONE event_id; every member
     endpoint resolves the event from the token, never the URL, so a member can only ever
     touch their own event.

Reuse: donations/expenses/blessings live in the existing child collections; auth reuses
`auth.get_password_hash / verify_password / create_access_token`. Razorpay online
donations stay in event_finance_service — this module is the offline/who-gave + portal layer.
"""
from __future__ import annotations

import csv
import io
from datetime import timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.responses import PlainTextResponse

import event_registry as registry
from auth import get_password_hash, verify_password, create_access_token, decode_access_token
from event_lifecycle_service import _uid, _now

MONEY_ROLE = "event_money"
MAX_MEMBERS = 8
MONEY_ENTRY_ROLE = "money_entry"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _owner_id(current: Dict[str, Any]) -> Optional[str]:
    return (current or {}).get("user_id") or (current or {}).get("admin_id")


async def _owned_event(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    ev = await db.events.find_one({"event_id": event_id}) or await db.events.find_one({"id": event_id})
    if not ev or ev.get("deleted_at"):
        raise HTTPException(404, "Event not found")
    is_super = (current or {}).get("kind") == "super_admin"
    if ev.get("owner_id") != _owner_id(current) and not is_super:
        raise HTTPException(403, "Not your event")
    ev.pop("_id", None)
    return ev


async def _event_by_slug(db, slug: str) -> Dict[str, Any]:
    ev = (await db.events.find_one({"publish_slug": slug})
          or await db.events.find_one({"slug": slug})
          or await db.events.find_one({"event_id": slug}))
    if not ev or ev.get("deleted_at"):
        raise HTTPException(404, "Not found")
    ev.pop("_id", None)
    return ev


def _blessings_moderated(ev: Dict[str, Any]) -> bool:
    cfg = ((ev.get("data") or {}).get("blessings_config")) or ev.get("blessings_config") or {}
    return bool(cfg.get("moderation"))


def _blessings_enabled(ev: Dict[str, Any]) -> bool:
    cfg = ((ev.get("data") or {}).get("blessings_config")) or ev.get("blessings_config") or {}
    # default ON unless explicitly disabled
    return cfg.get("enabled", True) is not False


def _donation_config(ev: Dict[str, Any]) -> Dict[str, Any]:
    return ((ev.get("data") or {}).get("donation_config")) or ev.get("donation_config") or {}


async def _live(db, collection: str, event_id: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for d in getattr(db, collection).find({"event_id": event_id}):
        if d.get("deleted_at"):
            continue
        d.pop("_id", None)
        out.append(d)
    return out


def _amt(d: Dict[str, Any]) -> float:
    try:
        return float(d.get("amount") or 0)
    except Exception:
        return 0.0


# --------------------------------------------------------------------------- #
# leaderboard (shared by public + portal)
# --------------------------------------------------------------------------- #
async def leaderboard(db, event_id: str, *, public: bool) -> Dict[str, Any]:
    rows = [d for d in await _live(db, "donations", event_id)
            if d.get("status") not in ("rejected",)]
    rows.sort(key=_amt, reverse=True)   # big → small
    total = round(sum(_amt(d) for d in rows), 2)
    donors: List[Dict[str, Any]] = []
    for d in rows:
        anon = bool(d.get("is_anonymous"))
        name = "Anonymous" if anon else (d.get("display_name") or d.get("donor_name") or "Guest")
        entry = {"id": d.get("id"), "name": name, "amount": _amt(d),
                 "cause": d.get("category"), "message": None if d.get("hide_message") else d.get("message")}
        if not public:
            entry["phone"] = d.get("phone")
            entry["status"] = d.get("status")
        if public and d.get("hide_amount"):
            entry["amount"] = None
        donors.append(entry)
    return {"total": total, "count": len(rows), "donors": donors}


async def spending_summary(db, event_id: str) -> Dict[str, Any]:
    """Category-wise "where the money went" (mandap, food, decoration…).

    Public-safe by construction: amounts per category only — never who recorded the
    entry, never a vendor's contact. Drafts/rejected entries are excluded so the
    published figure always matches what the committee actually approved."""
    rows = [e for e in await _live(db, "expenses", event_id)
            if e.get("approval_status") not in ("rejected", "draft")]
    buckets: Dict[str, float] = {}
    for e in rows:
        cat = (e.get("category") or "Other").strip() or "Other"
        buckets[cat] = round(buckets.get(cat, 0.0) + _amt(e), 2)
    folders = [{"category": k, "amount": v} for k, v in buckets.items()]
    folders.sort(key=lambda f: f["amount"], reverse=True)     # big → small, like the donors
    return {"folders": folders, "spent_total": round(sum(buckets.values()), 2),
            "entries": len(rows)}


# --------------------------------------------------------------------------- #
# money members (owner creates ≤8 scoped logins)
# --------------------------------------------------------------------------- #
async def _members(db, event_id: str) -> List[Dict[str, Any]]:
    return [m for m in await _live(db, "event_members", event_id)
            if m.get("role") == MONEY_ENTRY_ROLE]


async def create_member(db, event_id: str, current, username: str, password: str) -> Dict[str, Any]:
    await _owned_event(db, event_id, current)
    username = (username or "").strip().lower()
    if len(username) < 3 or len(password or "") < 6:
        raise HTTPException(422, "Username ≥ 3 chars and password ≥ 6 chars required")
    existing = await _members(db, event_id)
    if len(existing) >= MAX_MEMBERS:
        raise HTTPException(409, f"Maximum {MAX_MEMBERS} money members reached")
    if any((m.get("username") == username) for m in existing):
        raise HTTPException(409, "That username already exists for this event")
    mid = _uid("emem")
    doc = {"id": mid, "member_id": mid, "event_id": event_id, "role": MONEY_ENTRY_ROLE,
           "username": username, "password_hash": get_password_hash(password),
           "can_edit_own": True, "status": "active", "created_by": _owner_id(current),
           "deleted_at": None, "created_at": _now(), "updated_at": _now()}
    await db.event_members.insert_one(doc)
    # return the plaintext ONCE for the owner to copy/share
    return {"member_id": mid, "username": username, "password": password}


async def list_members(db, event_id: str, current) -> Dict[str, Any]:
    await _owned_event(db, event_id, current)
    return {"members": [{"member_id": m.get("id"), "username": m.get("username"),
                         "status": m.get("status"), "created_at": m.get("created_at")}
                        for m in await _members(db, event_id)],
            "max": MAX_MEMBERS}


async def revoke_member(db, event_id: str, current, member_id: str) -> Dict[str, Any]:
    await _owned_event(db, event_id, current)
    await db.event_members.update_one(
        {"id": member_id, "event_id": event_id},
        {"$set": {"deleted_at": _now(), "status": "revoked", "updated_at": _now()}})
    return {"revoked": True, "member_id": member_id}


async def member_login(db, event_ref: str, username: str, password: str) -> Dict[str, Any]:
    ev = await _event_by_slug(db, event_ref)
    username = (username or "").strip().lower()
    member = None
    for m in await _members(db, ev["event_id"]):
        if m.get("username") == username and m.get("status") == "active":
            member = m
            break
    if not member or not verify_password(password or "", member.get("password_hash", "")):
        raise HTTPException(401, "Invalid username or password")
    token = create_access_token(
        {"role": MONEY_ROLE, "event_id": ev["event_id"], "member_id": member["id"],
         "username": username},
        expires_delta=timedelta(hours=12))
    return {"token": token, "event_id": ev["event_id"], "event_name": ev.get("event_name"),
            "username": username}


def money_member_from_token(authorization: Optional[str]) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Login required")
    payload = decode_access_token(authorization.split(" ", 1)[1].strip())
    if not payload or payload.get("role") != MONEY_ROLE or not payload.get("event_id"):
        raise HTTPException(401, "Invalid session")
    return payload


# --------------------------------------------------------------------------- #
# money entries (member records who-gave + spending) — event from the TOKEN
# --------------------------------------------------------------------------- #
_DON_FIELDS = ("donor_name", "amount", "phone", "message", "category",
               "is_anonymous", "hide_amount", "hide_message", "display_name")
_EXP_FIELDS = ("title", "category", "amount", "vendor", "notes")


async def record_donation(db, event_id: str, member_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = {k: payload.get(k) for k in _DON_FIELDS if k in payload}
    if not data.get("donor_name") or not _amt(data):
        raise HTTPException(422, "Donor name and a positive amount are required")
    did = _uid("don")
    doc = {"id": did, "child_id": did, "event_id": event_id, "status": "received",
           "payment_method": "offline", "currency": "INR",
           "entered_by": member_id, "paid_at": _now(),
           "deleted_at": None, "created_at": _now(), "updated_at": _now(),
           **data}                                   # apply the entry, then normalise
    doc["category"] = doc.get("category") or "General Donation"
    doc["is_anonymous"] = bool(doc.get("is_anonymous"))
    await db.donations.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def edit_donation(db, event_id: str, member_id: str, don_id: str,
                        payload: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.donations.find_one({"id": don_id, "event_id": event_id})
    if not doc or doc.get("deleted_at"):
        raise HTTPException(404, "Donation not found")
    if doc.get("entered_by") != member_id:
        raise HTTPException(403, "You can only edit entries you added")
    patch = {k: payload.get(k) for k in _DON_FIELDS if k in payload}
    patch["updated_at"] = _now()
    await db.donations.update_one({"id": don_id, "event_id": event_id}, {"$set": patch})
    return {**{k: v for k, v in doc.items() if k != "_id"}, **patch}


async def add_expense(db, event_id: str, member_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = {k: payload.get(k) for k in _EXP_FIELDS if k in payload}
    if not data.get("title") or not _amt(data):
        raise HTTPException(422, "A title and a positive amount are required")
    eid = _uid("exp")
    doc = {"id": eid, "child_id": eid, "event_id": event_id,
           "approval_status": "approved", "paid_by": member_id,
           "deleted_at": None, "created_at": _now(), "updated_at": _now(),
           **data}
    doc["category"] = doc.get("category") or "General"
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def money_report(db, event_id: str) -> Dict[str, Any]:
    dons = [d for d in await _live(db, "donations", event_id) if d.get("status") != "rejected"]
    exps = await _live(db, "expenses", event_id)
    collected = round(sum(_amt(d) for d in dons), 2)
    spent = round(sum(_amt(e) for e in exps), 2)
    # spending grouped by folder (category)
    folders: Dict[str, float] = {}
    for e in exps:
        folders[e.get("category") or "General"] = round(folders.get(e.get("category") or "General", 0) + _amt(e), 2)
    return {"collected": collected, "spent": spent, "balance": round(collected - spent, 2),
            "donations": dons, "expenses": exps, "folders": folders}


def _report_csv(report: Dict[str, Any], event_name: str) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"Money Report — {event_name}"])
    w.writerow([])
    w.writerow(["DONATIONS"])
    w.writerow(["Donor", "Amount", "Cause", "Status", "Phone", "Date"])
    for d in sorted(report["donations"], key=_amt, reverse=True):
        name = "Anonymous" if d.get("is_anonymous") else (d.get("donor_name") or "")
        w.writerow([name, _amt(d), d.get("category", ""), d.get("status", ""),
                    d.get("phone", ""), (d.get("paid_at") or d.get("created_at") or "")[:10]])
    w.writerow([])
    w.writerow(["SPENDING (by folder)"])
    w.writerow(["Folder", "Amount"])
    for folder, amt in sorted(report["folders"].items(), key=lambda kv: kv[1], reverse=True):
        w.writerow([folder, amt])
    w.writerow([])
    w.writerow(["Collected", report["collected"]])
    w.writerow(["Spent", report["spent"]])
    w.writerow(["Balance", report["balance"]])
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# blessings (public submit + read; owner moderates via the children router)
# --------------------------------------------------------------------------- #
async def submit_blessing(db, slug: str, guest_name: str, message: str) -> Dict[str, Any]:
    ev = await _event_by_slug(db, slug)
    if not _blessings_enabled(ev):
        raise HTTPException(403, "Blessings are not enabled for this invitation")
    if not (guest_name or "").strip() or not (message or "").strip():
        raise HTTPException(422, "Name and message are required")
    status = "pending" if _blessings_moderated(ev) else "approved"
    bid = _uid("bls")
    doc = {"id": bid, "child_id": bid, "event_id": ev["event_id"],
           "guest_name": guest_name.strip()[:80], "message": message.strip()[:600],
           "status": status, "is_featured": False, "display_order": 0,
           "deleted_at": None, "created_at": _now(), "updated_at": _now()}
    await db.event_blessings.insert_one(doc)
    return {"submitted": True, "moderated": status == "pending"}


async def list_blessings(db, slug: str, limit: int = 100) -> Dict[str, Any]:
    ev = await _event_by_slug(db, slug)
    rows = [b for b in await _live(db, "event_blessings", ev["event_id"])
            if b.get("status") == "approved"]
    rows.sort(key=lambda b: (not b.get("is_featured"), b.get("created_at") or ""), reverse=False)
    rows = [{"guest_name": b.get("guest_name"), "message": b.get("message"),
             "is_featured": bool(b.get("is_featured")), "created_at": b.get("created_at")}
            for b in rows[:max(1, min(int(limit), 300))]]
    return {"blessings": rows, "total": len(rows)}


# --------------------------------------------------------------------------- #
# router
# --------------------------------------------------------------------------- #
def build_event_money_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-money"])

    async def _gate() -> None:
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    # ---- public ----
    @router.get("/api/public/events/{slug}/leaderboard")
    async def _public_board(slug: str):
        await _gate()
        ev = await _event_by_slug(db, slug)
        cfg = _donation_config(ev)
        board = await leaderboard(db, ev["event_id"], public=True)
        top_n = int(cfg.get("top_donors_count") or 3)
        board["top"] = board["donors"][:max(0, top_n)] if cfg.get("show_top_donors", True) else []
        board["upi_id"] = cfg.get("upi_id")
        board["qr_image_url"] = cfg.get("qr_image_url")
        board["causes"] = [c.strip() for c in str(cfg.get("causes") or "").split(",") if c.strip()]
        # "where the money went" — opt-in, amounts per category only (no names).
        if cfg.get("show_spending"):
            board["spending"] = await spending_summary(db, ev["event_id"])
        return board

    @router.post("/api/public/events/{slug}/blessings")
    async def _submit_blessing(slug: str, body: Dict[str, Any] = Body(...)):
        await _gate()
        return await submit_blessing(db, slug, body.get("guest_name", ""), body.get("message", ""))

    @router.get("/api/public/events/{slug}/blessings")
    async def _list_blessings(slug: str, limit: int = 100):
        await _gate()
        return await list_blessings(db, slug, limit)

    # ---- owner ----
    @router.post("/api/events/{event_id}/money-members")
    async def _create_member(event_id: str, body: Dict[str, Any] = Body(...),
                             current=Depends(get_current_buyer)):
        await _gate()
        return await create_member(db, event_id, current, body.get("username", ""), body.get("password", ""))

    @router.get("/api/events/{event_id}/money-members")
    async def _list_members(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await list_members(db, event_id, current)

    @router.delete("/api/events/{event_id}/money-members/{member_id}")
    async def _revoke_member(event_id: str, member_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await revoke_member(db, event_id, current, member_id)

    @router.get("/api/events/{event_id}/money-report.csv")
    async def _owner_report(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        ev = await _owned_event(db, event_id, current)
        rep = await money_report(db, event_id)
        return PlainTextResponse(_report_csv(rep, ev.get("event_name") or "Event"),
                                 media_type="text/csv")

    # ---- money member portal (event from the TOKEN) ----
    @router.post("/api/event-money/login")
    async def _login(body: Dict[str, Any] = Body(...)):
        await _gate()
        return await member_login(db, body.get("slug") or body.get("event_id") or "",
                                  body.get("username", ""), body.get("password", ""))

    @router.get("/api/event-money/overview")
    async def _overview(authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        rep = await money_report(db, m["event_id"])
        return {"event_id": m["event_id"], "username": m.get("username"),
                "collected": rep["collected"], "spent": rep["spent"], "balance": rep["balance"],
                "folders": rep["folders"]}

    @router.get("/api/event-money/donations")
    async def _member_board(authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        return await leaderboard(db, m["event_id"], public=False)

    @router.post("/api/event-money/donations")
    async def _member_add_don(body: Dict[str, Any] = Body(...),
                              authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        return await record_donation(db, m["event_id"], m["member_id"], body)

    @router.patch("/api/event-money/donations/{don_id}")
    async def _member_edit_don(don_id: str, body: Dict[str, Any] = Body(...),
                               authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        return await edit_donation(db, m["event_id"], m["member_id"], don_id, body)

    @router.post("/api/event-money/expenses")
    async def _member_add_exp(body: Dict[str, Any] = Body(...),
                              authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        return await add_expense(db, m["event_id"], m["member_id"], body)

    @router.get("/api/event-money/report.csv")
    async def _member_report(authorization: Optional[str] = Header(default=None)):
        await _gate()
        m = money_member_from_token(authorization)
        rep = await money_report(db, m["event_id"])
        return PlainTextResponse(_report_csv(rep, "Event"), media_type="text/csv")

    return router
