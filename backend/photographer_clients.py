"""
photographer_clients.py — "Photographer's Client" scoped portal.

A photographer can hand the couple/family a login scoped to ONE invitation
("event"). From the studio panel the photographer generates credentials
(auto/"predefined" from the event name, or fully custom). The client logs in on
the Client tab of the photographer login screen and gets a read-mostly portal
for that single invitation:

  • Link analytics   — opens / unique views / device split
  • RSVP             — list + stats + CSV export (read-only)
  • Wishes           — view all, add, delete, feature/approve (moderation)
  • Live gallery      — photo count + the QR/live-gallery link (view-only)

Security model
--------------
* Credentials live in their own collection `event_client_accounts` (one per
  profile; unique lowercased `username`). Passwords are bcrypt-hashed.
* Login mints an `event_client` JWT via auth.create_client_token(profile_id).
  That token is REJECTED by the admin/photographer deps (see auth.py), so it can
  only ever reach the `/api/client/*` endpoints here.
* Every client endpoint resolves the profile_id from the TOKEN, never the URL —
  a client can only read/manage its own event.

Wired in server.py:
    from photographer_clients import build_photographer_clients_router
    app.include_router(build_photographer_clients_router(
        db, get_current_admin, get_current_event_client))
"""
from __future__ import annotations

import io
import csv
import re
import uuid
import time
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import verify_password, get_password_hash, create_client_token

logger = logging.getLogger("photographer_clients")

MAX_FEATURED = 3
_USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,40}$")

# Very light in-memory brute-force throttle (per process). Not a substitute for
# a gateway rate limiter, but blunts credential stuffing on a single node.
_LOGIN_FAILS: dict = {}
_LOCK_AFTER = 8
_LOCK_WINDOW = 300  # seconds


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify_username(base: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (base or "").lower()).strip("-")
    return (s or "client")[:34]


def _gen_password() -> str:
    # Readable, unambiguous-ish, ~9 chars.
    alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(9))


def _throttled(key: str) -> bool:
    rec = _LOGIN_FAILS.get(key)
    if not rec:
        return False
    fails, first = rec
    if time.time() - first > _LOCK_WINDOW:
        _LOGIN_FAILS.pop(key, None)
        return False
    return fails >= _LOCK_AFTER


def _note_fail(key: str) -> None:
    fails, first = _LOGIN_FAILS.get(key, (0, time.time()))
    if time.time() - first > _LOCK_WINDOW:
        fails, first = 0, time.time()
    _LOGIN_FAILS[key] = (fails + 1, first)


def _clear_fail(key: str) -> None:
    _LOGIN_FAILS.pop(key, None)


# --- Models ----------------------------------------------------------------
class ClientAccessCreate(BaseModel):
    mode: Literal["predefined", "custom"] = "predefined"
    username: Optional[str] = Field(default=None, max_length=40)
    password: Optional[str] = Field(default=None, max_length=120)


class ClientAccessPatch(BaseModel):
    enabled: bool


class ClientLogin(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class PhotoSelectIn(BaseModel):
    photo_url: str
    category: Optional[str] = None
    action: Literal["select", "unselect"] = "select"



class WishAdd(BaseModel):
    guest_name: str = Field(min_length=1, max_length=80)
    relationship: Optional[str] = Field(default=None, max_length=80)
    message: str = Field(min_length=1, max_length=600)


def build_photographer_clients_router(db, get_current_admin, get_current_event_client) -> APIRouter:
    router = APIRouter(tags=["photographer-clients"])

    # ------------------------------------------------------------------ utils
    async def _require_owned_profile(profile_id: str, admin_id: str) -> dict:
        p = await db.profiles.find_one(
            {"$or": [{"id": profile_id}, {"slug": profile_id}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Invitation not found")
        owner = p.get("admin_id")
        if owner and owner != admin_id:
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
            if not admin or admin.get("role") != "super_admin":
                raise HTTPException(403, "You do not have access to this invitation")
        return p

    async def _profile_or_404(profile_id: str) -> dict:
        p = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Invitation not found")
        return p

    async def _username_taken(username: str, exclude_profile_id: Optional[str] = None) -> bool:
        row = await db.event_client_accounts.find_one({"username": username}, {"_id": 0})
        return bool(row) and row.get("profile_id") != exclude_profile_id

    async def _unique_predefined_username(profile: dict) -> str:
        base = _slugify_username(profile.get("slug") or profile.get("id") or "client")
        candidate = f"{base}-maja"[:40]
        i = 2
        while await _username_taken(candidate, exclude_profile_id=profile["id"]):
            suffix = f"-maja-{i}"
            candidate = f"{base[:40 - len(suffix)]}{suffix}"
            i += 1
        return candidate

    def _account_public(acc: Optional[dict]) -> dict:
        if not acc:
            return {"has_account": False, "enabled": False, "username": None}
        return {
            "has_account": True,
            "enabled": bool(acc.get("enabled")),
            "username": acc.get("username"),
            "created_at": acc.get("created_at"),
            "updated_at": acc.get("updated_at"),
        }

    def _couple(profile: dict) -> str:
        bride = (profile.get("bride_name") or "").strip()
        groom = (profile.get("groom_name") or "").strip()
        return " & ".join([n for n in (groom, bride) if n]) or (profile.get("slug") or "Invitation")

    # ================================================================
    #  PHOTOGRAPHER SIDE — manage a client login for an invitation
    # ================================================================
    @router.get("/api/admin/profiles/{profile_id}/client-access")
    async def get_client_access(profile_id: str, admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        acc = await db.event_client_accounts.find_one({"profile_id": profile["id"]}, {"_id": 0})
        return _account_public(acc)

    @router.post("/api/admin/profiles/{profile_id}/client-access")
    async def set_client_access(profile_id: str, payload: ClientAccessCreate,
                                admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)

        if payload.mode == "custom":
            username = (payload.username or "").strip().lower()
            password = (payload.password or "").strip()
            if not _USERNAME_RE.match(username):
                raise HTTPException(400, "Username must be 3–40 chars: a–z, 0–9, dot, dash, underscore.")
            if len(password) < 6:
                raise HTTPException(400, "Password must be at least 6 characters.")
            if await _username_taken(username, exclude_profile_id=profile["id"]):
                raise HTTPException(409, "That username is already taken. Choose another.")
        else:
            username = await _unique_predefined_username(profile)
            password = _gen_password()

        now = _now_iso()
        existing = await db.event_client_accounts.find_one({"profile_id": profile["id"]}, {"_id": 0})
        doc = {
            "id": existing.get("id") if existing else f"eca_{uuid.uuid4().hex[:16]}",
            "profile_id": profile["id"],
            "username": username,
            "password_hash": get_password_hash(password),
            "enabled": True,
            "created_by": admin_id,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
        }
        if existing:
            await db.event_client_accounts.update_one(
                {"profile_id": profile["id"]}, {"$set": doc})
        else:
            await db.event_client_accounts.insert_one(doc)

        # Return the plaintext password ONCE for the photographer to copy/share.
        return {"username": username, "password": password, "enabled": True,
                "mode": payload.mode}

    @router.post("/api/admin/profiles/{profile_id}/client-access/regenerate")
    async def regenerate_client_password(profile_id: str, admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        acc = await db.event_client_accounts.find_one({"profile_id": profile["id"]}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "No client login yet — create one first.")
        password = _gen_password()
        await db.event_client_accounts.update_one(
            {"profile_id": profile["id"]},
            {"$set": {"password_hash": get_password_hash(password),
                      "enabled": True, "updated_at": _now_iso()}})
        return {"username": acc.get("username"), "password": password, "enabled": True}

    @router.patch("/api/admin/profiles/{profile_id}/client-access")
    async def toggle_client_access(profile_id: str, payload: ClientAccessPatch,
                                   admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        acc = await db.event_client_accounts.find_one({"profile_id": profile["id"]}, {"_id": 0})
        if not acc:
            raise HTTPException(404, "No client login yet — create one first.")
        await db.event_client_accounts.update_one(
            {"profile_id": profile["id"]},
            {"$set": {"enabled": bool(payload.enabled), "updated_at": _now_iso()}})
        return {"enabled": bool(payload.enabled), "username": acc.get("username")}

    @router.delete("/api/admin/profiles/{profile_id}/client-access")
    async def delete_client_access(profile_id: str, admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        await db.event_client_accounts.delete_one({"profile_id": profile["id"]})
        return {"deleted": True}

    # ================================================================
    #  CLIENT SIDE — login + scoped portal
    # ================================================================
    @router.post("/api/client/login")
    async def client_login(payload: ClientLogin, request: Request):
        username = (payload.username or "").strip().lower()
        client_ip = request.client.host if request.client else "?"
        throttle_key = f"{client_ip}:{username}"
        if _throttled(throttle_key):
            raise HTTPException(429, "Too many attempts. Please try again in a few minutes.")

        acc = await db.event_client_accounts.find_one({"username": username}, {"_id": 0})
        invalid = HTTPException(401, "Invalid username or password.")
        if not acc or not acc.get("enabled"):
            _note_fail(throttle_key)
            raise invalid
        if not verify_password(payload.password, acc.get("password_hash") or ""):
            _note_fail(throttle_key)
            raise invalid

        profile = await db.profiles.find_one({"id": acc["profile_id"]}, {"_id": 0})
        if not profile:
            raise invalid
        _clear_fail(throttle_key)
        token = create_client_token(profile["id"])
        return {
            "token": token,
            "event": {
                "profile_id": profile["id"],
                "slug": profile.get("slug"),
                "couple": _couple(profile),
                "event_date": profile.get("event_date"),
            },
        }

    @router.get("/api/client/overview")
    async def client_overview(profile_id: str = Depends(get_current_event_client)):
        profile = await _profile_or_404(profile_id)
        gc = profile.get("gallery_config") or {}
        photo_count = await db.gallery_photos.count_documents({"profile_id": profile_id})
        rsvps = await db.rsvps.find({"profile_id": profile_id}, {"_id": 0, "status": 1}).to_list(1000)
        wishes = await db.guest_wishes.find({"profile_id": profile_id}, {"_id": 0, "status": 1}).to_list(5000)
        analytics = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0}) or {}
        return {
            "profile_id": profile_id,
            "slug": profile.get("slug"),
            "couple": _couple(profile),
            "event_date": profile.get("event_date"),
            "invite_path": f"/invite/{profile.get('slug')}" if profile.get("slug") else None,
            "gallery": {
                "enabled": bool(gc.get("enabled")),
                "photo_count": photo_count,
                "live_gallery_path": f"/invite/{profile.get('slug')}/live-gallery" if profile.get("slug") else None,
            },
            "quick": {
                "total_views": analytics.get("total_views", 0),
                "rsvp_total": len(rsvps),
                "rsvp_attending": sum(1 for r in rsvps if r.get("status") == "yes"),
                "wishes_total": len(wishes),
                "wishes_pending": sum(1 for w in wishes if w.get("status") == "pending"),
            },
        }

    @router.get("/api/client/analytics")
    async def client_analytics(profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        a = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0}) or {}
        return {
            "total_views": a.get("total_views", 0),
            "unique_views": a.get("unique_views", 0),
            "mobile_views": a.get("mobile_views", 0),
            "desktop_views": a.get("desktop_views", 0),
            "tablet_views": a.get("tablet_views", 0),
            "first_viewed_at": a.get("first_viewed_at"),
            "last_viewed_at": a.get("last_viewed_at"),
            "daily_views": a.get("daily_views", []),
            "map_clicks": a.get("map_clicks", 0),
            "rsvp_clicks": a.get("rsvp_clicks", 0),
        }

    @router.get("/api/client/rsvps")
    async def client_rsvps(status: Optional[str] = None,
                           profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        query = {"profile_id": profile_id}
        if status in ("yes", "no", "maybe"):
            query["status"] = status
        rsvps = await db.rsvps.find(query, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
        return {"rsvps": rsvps}

    @router.get("/api/client/rsvps/stats")
    async def client_rsvps_stats(profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        rsvps = await db.rsvps.find({"profile_id": profile_id}, {"_id": 0}).to_list(500)
        attending = [r for r in rsvps if r.get("status") == "yes"]
        return {
            "total_rsvps": len(rsvps),
            "attending_count": len(attending),
            "not_attending_count": sum(1 for r in rsvps if r.get("status") == "no"),
            "maybe_count": sum(1 for r in rsvps if r.get("status") == "maybe"),
            "total_guest_count": sum(r.get("guest_count", 1) for r in attending),
        }

    @router.get("/api/client/rsvps/export")
    async def client_rsvps_export(profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        rsvps = await db.rsvps.find({"profile_id": profile_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Guest Name', 'Phone', 'Status', 'Guest Count', 'Message', 'Submitted At'])
        for r in rsvps:
            created = r.get("created_at")
            if isinstance(created, datetime):
                created = created.strftime('%Y-%m-%d %H:%M:%S')
            writer.writerow([
                r.get('guest_name', ''), r.get('guest_phone', ''), r.get('status', ''),
                r.get('guest_count', 1), r.get('message', ''), created or '',
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]), media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=rsvps_{profile_id}.csv"})

    # -------- wishes (view all + moderate) ---------------------------------
    @router.get("/api/client/wishes")
    async def client_wishes(status: Optional[str] = None,
                            profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        query = {"profile_id": profile_id}
        if status in ("pending", "approved", "rejected"):
            query["status"] = status
        wishes = await db.guest_wishes.find(query, {"_id": 0, "ip_hash": 0}).sort("created_at", -1).to_list(2000)
        all_w = await db.guest_wishes.find({"profile_id": profile_id}, {"_id": 0, "status": 1, "is_featured": 1}).to_list(5000)
        counts = {
            "pending": sum(1 for w in all_w if w.get("status") == "pending"),
            "approved": sum(1 for w in all_w if w.get("status") == "approved"),
            "rejected": sum(1 for w in all_w if w.get("status") == "rejected"),
            "featured": sum(1 for w in all_w if w.get("is_featured")),
        }
        return {"wishes": wishes, "counts": counts}

    @router.post("/api/client/wishes")
    async def client_add_wish(payload: WishAdd, profile_id: str = Depends(get_current_event_client)):
        await _profile_or_404(profile_id)
        now = _now_iso()
        doc = {
            "id": uuid.uuid4().hex,
            "profile_id": profile_id,
            "guest_name": payload.guest_name.strip(),
            "relationship": (payload.relationship or "").strip() or None,
            "message": payload.message.strip(),
            "status": "approved",          # the client is a trusted moderator
            "is_featured": False,
            "created_at": now,
            "approved_at": now,
            "ip_hash": None,
            "source": "client",
        }
        await db.guest_wishes.insert_one(doc)
        return {"success": True, "wish": {k: v for k, v in doc.items() if k != "ip_hash"}}

    @router.delete("/api/client/wishes/{wish_id}")
    async def client_delete_wish(wish_id: str, profile_id: str = Depends(get_current_event_client)):
        res = await db.guest_wishes.delete_one({"id": wish_id, "profile_id": profile_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    @router.post("/api/client/wishes/{wish_id}/approve")
    async def client_approve_wish(wish_id: str, profile_id: str = Depends(get_current_event_client)):
        res = await db.guest_wishes.update_one(
            {"id": wish_id, "profile_id": profile_id},
            {"$set": {"status": "approved", "approved_at": _now_iso()}})
        if res.matched_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    @router.post("/api/client/wishes/{wish_id}/reject")
    async def client_reject_wish(wish_id: str, profile_id: str = Depends(get_current_event_client)):
        res = await db.guest_wishes.update_one(
            {"id": wish_id, "profile_id": profile_id},
            {"$set": {"status": "rejected", "is_featured": False}})
        if res.matched_count == 0:
            raise HTTPException(404, "Wish not found")
        return {"success": True}

    @router.post("/api/client/wishes/{wish_id}/feature")
    async def client_feature_wish(wish_id: str, profile_id: str = Depends(get_current_event_client)):
        wish = await db.guest_wishes.find_one({"id": wish_id, "profile_id": profile_id}, {"_id": 0})
        if not wish:
            raise HTTPException(404, "Wish not found")
        if wish.get("is_featured"):
            await db.guest_wishes.update_one({"id": wish_id}, {"$set": {"is_featured": False}})
            return {"success": True, "is_featured": False}
        # Auto-rotate the oldest featured when already at the cap.
        featured = await db.guest_wishes.find(
            {"profile_id": profile_id, "is_featured": True}, {"_id": 0}
        ).sort("approved_at", 1).to_list(MAX_FEATURED + 5)
        if len(featured) >= MAX_FEATURED:
            await db.guest_wishes.update_one({"id": featured[0]["id"]}, {"$set": {"is_featured": False}})
        update = {"is_featured": True, "status": "approved"}
        if not wish.get("approved_at"):
            update["approved_at"] = _now_iso()
        await db.guest_wishes.update_one({"id": wish_id}, {"$set": update})
        return {"success": True, "is_featured": True}

    # --- Client Photo Selection (Specification Section 45 & 49) ---
    @router.post("/api/client/photos/select")
    async def client_select_photo(payload: PhotoSelectIn, profile_id: str = Depends(get_current_event_client)):
        now = _now_iso()
        if payload.action == "select":
            doc = {
                "id": f"psel_{uuid.uuid4().hex[:14]}",
                "profile_id": profile_id,
                "photo_url": payload.photo_url,
                "category": payload.category or "General",
                "selected_at": now,
            }
            await db.client_photo_selections.update_one(
                {"profile_id": profile_id, "photo_url": payload.photo_url},
                {"$set": doc},
                upsert=True
            )
            return {"success": True, "selected": True}
        else:
            await db.client_photo_selections.delete_one({"profile_id": profile_id, "photo_url": payload.photo_url})
            return {"success": True, "selected": False}

    @router.get("/api/client/photos/selected")
    async def client_list_selected_photos(profile_id: str = Depends(get_current_event_client)):
        cursor = db.client_photo_selections.find({"profile_id": profile_id}, {"_id": 0}).sort("selected_at", -1)
        items = []
        async for doc in cursor:
            items.append(doc)
        return {"items": items, "count": len(items)}

    @router.get("/api/admin/profiles/{profile_id}/selected-photos")
    async def studio_get_selected_photos(profile_id: str, admin: Any = Depends(get_current_admin)):
        cursor = db.client_photo_selections.find({"profile_id": profile_id}, {"_id": 0}).sort("selected_at", -1)
        items = []
        async for doc in cursor:
            items.append(doc)
        return {"items": items, "count": len(items)}

    return router
