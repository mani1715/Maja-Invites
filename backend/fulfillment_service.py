"""
fulfillment_service.py — Admin operations console for the manual (done-for-you)
invitation build. See INVITATION_FULFILLMENT.md for the full workflow.

Flow: buyer picks design + plan -> pays -> fills details. Each paid order carries
a short `fulfillment_code` (e.g. MAJA-AB12CD). The admin pulls the request here,
downloads the data + chosen design, has the invitation designed, then DELIVERS by
attaching the live link (+ optional published profile) — which surfaces the link
in BOTH the admin console and the buyer's panel.

Two audiences kept separate via `buyer_kind`:
  photographer  -> "premium members" (studio accounts)
  user          -> "normal users"

Per-event the admin can record two Google-Drive folder ids:
  drive_folder_qr       -> where photographer-uploaded QR gallery photos live
  drive_folder_selfies  -> where AI-face-match selfies land (metadata in
                           face_match_records: {phone, email?, photo_id})

Google Drive AUTO-upload is NOT wired here (needs Google creds; AI face match is a
future step). These fields + the face_match_records collection are the plumbing.

Wired in server.py:
    from fulfillment_service import build_fulfillment_router
    app.include_router(build_fulfillment_router(db, require_super_admin))
"""
from __future__ import annotations

import re
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, Body, Request

logger = logging.getLogger("fulfillment")

SELFIE_MAX_PER_IP_PER_EVENT_PER_DAY = 25   # abuse guard on the public capture
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s-]{6,17}$")


def _ip_hash(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    return hashlib.sha256(ip.encode()).hexdigest()[:24]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def build_fulfillment_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["fulfillment"])

    async def _studio_portfolio(order: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """For a PHOTOGRAPHER buyer, their portfolio credit (studio name + URL),
        so the owner sees a premium studio's portfolio link beside the request —
        exactly what the owner asked to travel with the event details."""
        if order.get("buyer_kind") != "photographer":
            return None
        admin_id = order.get("user_id")
        try:
            from studio_credit import studio_credit
            c = await studio_credit(db, admin_id)
        except Exception:
            return None
        # Surface it whenever they are premium (published or not) so the owner can
        # still reach/preview it; `show` stays the public-facing gate.
        if not c.get("is_premium"):
            return None
        return {"studio_name": c.get("studio_name"), "portfolio_url": c.get("portfolio_url"),
                "slug": c.get("slug"), "published": bool(c.get("show"))}

    async def _buyer(order: Dict[str, Any]) -> Dict[str, Any]:
        uid = order.get("user_id")
        if order.get("buyer_kind") == "photographer":
            a = await db.admins.find_one({"admin_id": uid}, {"_id": 0}) or await db.admins.find_one({"id": uid}, {"_id": 0})
            if a:
                return {"name": a.get("studio_name") or a.get("name"), "email": a.get("email"), "phone": a.get("phone")}
        u = await db.users.find_one({"user_id": uid}, {"_id": 0}) or await db.users.find_one({"id": uid}, {"_id": 0})
        return {"name": (u or {}).get("name"), "email": (u or {}).get("email"), "phone": (u or {}).get("phone")}

    def _addon_keys(order: Dict[str, Any]) -> set:
        return {(a.get("key") if isinstance(a, dict) else a) for a in (order.get("addons") or [])}

    def _ai_face_match(order: Dict[str, Any]) -> bool:
        return "ai_face_match" in _addon_keys(order)

    def _folder_names(order: Dict[str, Any]) -> Dict[str, str]:
        """The two Drive folders this event needs — QR photos + guest selfies.

        Delegates to event_folders so the names here match exactly what the
        store stamps the moment details are submitted. (This replaced an older
        version that keyed the QR folder off the legacy `live_gallery` add-on and
        so produced no QR folder for à-la-carte orders.)
        """
        from event_folders import folder_names
        return folder_names(order)

    async def _ensure_folders(order: Dict[str, Any]) -> Dict[str, Any]:
        """Idempotently stamp both folder names + the storage account onto the
        order, so the admin sees them and the mail they live on, not an empty box."""
        from event_folders import ensure_order_folders
        await ensure_order_folders(db, order)
        return order

    def _event_status(order: Dict[str, Any]) -> str:
        info = order.get("info") or {}
        date = info.get("event_date") or (info.get("extra") or {}).get("event_date")
        if date and str(date)[:10] < _today():
            return "expired"
        return "active"

    async def _card(order: Dict[str, Any], full: bool = False) -> Dict[str, Any]:
        buyer = await _buyer(order)
        card = {
            "code": order.get("fulfillment_code"),
            "order_id": order.get("id"),
            "buyer_kind": order.get("buyer_kind", "user"),
            "buyer": buyer,
            "design_id": order.get("design_id"),
            "theme_id": order.get("theme_id"),
            "event_type": order.get("event_type"),
            "package": order.get("package"),
            "package_label": order.get("package_label"),
            "amount_inr": order.get("amount_inr"),
            "status": order.get("status"),
            "build_status": order.get("build_status"),
            "has_info": bool(order.get("info")),
            "live_url": order.get("live_url"),
            "profile_id": order.get("profile_id"),
            "drive_folder_qr": order.get("drive_folder_qr"),
            "drive_folder_selfies": order.get("drive_folder_selfies"),
            # Which Google mail those two folders live on (or "reserved" when the
            # storage pool is off). The owner asked to see this beside the request.
            "storage_account": order.get("storage_account"),
            # Premium photographer's portfolio link, travelling with the request.
            "studio_portfolio": await _studio_portfolio(order),
            "ai_face_match": _ai_face_match(order),
            "event_status": _event_status(order),
            "created_at": order.get("created_at"),
            "paid_at": order.get("paid_at"),
            "delivered_at": order.get("delivered_at"),
        }
        card["suggested_folders"] = _folder_names(order)
        card["edit_locked"] = bool(order.get("edit_locked"))
        # The two build decisions the buyer makes, surfaced on every card so the
        # owner can see at a glance how this invitation has to be built.
        try:
            from build_brief import background_of, ceremony_of, CEREMONY, BACKGROUND
            card["background_choice"] = background_of(order)
            card["background_label"] = BACKGROUND[background_of(order)][0]
            card["ceremony_type"] = ceremony_of(order)
            card["ceremony_label"] = CEREMONY[ceremony_of(order)]["label"]
        except Exception:
            pass
        if full:
            card["info"] = order.get("info")          # the couple's full filled form
            card["quote"] = order.get("quote")
            card["addons"] = order.get("addons")
            # The full build prompt — this is what the owner copies/downloads and
            # hands over, so it must say everything, including the background and
            # ceremony choices.
            try:
                from build_brief import build_brief
                from order_to_invitation import build_slug
                card["build_brief"] = build_brief(
                    {**order, "buyer": buyer}, folders=card["suggested_folders"],
                    storage_account=order.get("storage_account"),
                    slug=build_slug(order) if order.get("info") else None)
            except Exception as e:
                logger.warning("[fulfillment] build brief failed for %s: %s",
                               order.get("fulfillment_code"), e)
        return card

    async def _find(code: str) -> Dict[str, Any]:
        o = await db.invitation_orders.find_one({"fulfillment_code": code}, {"_id": 0})
        if not o:
            raise HTTPException(404, "Request not found for that code")
        return o

    # ---- list all requests (paid; filter by buyer_kind / status) ----------
    @router.get("/api/admin/fulfillment/requests")
    async def list_requests(buyer_kind: Optional[str] = None, status: Optional[str] = None,
                            _s=Depends(require_super_admin)):
        q: Dict[str, Any] = {"status": "paid"}
        if buyer_kind in ("photographer", "user"):
            q["buyer_kind"] = buyer_kind
        if status:
            q["build_status"] = status
        rows = await db.invitation_orders.find(q, {"_id": 0}).sort("paid_at", -1).to_list(1000)
        # Backfill folders + storage account for any request whose details are in
        # but predates this (or whose store-side stamp failed), so the list shows
        # the folders and mail without the owner opening each card.
        cards = []
        for o in rows:
            if o.get("info") and not o.get("storage_account"):
                o = await _ensure_folders(o)
            cards.append(await _card(o))
        return {
            "requests": cards,
            "counts": {
                "total": len(cards),
                "premium": sum(1 for c in cards if c["buyer_kind"] == "photographer"),
                "normal": sum(1 for c in cards if c["buyer_kind"] == "user"),
                "pending_info": sum(1 for c in cards if c["build_status"] == "pending_info"),
                "delivered": sum(1 for c in cards if c["build_status"] == "delivered"),
            },
        }

    # ---- one request, full data (this is the download payload) ------------
    @router.get("/api/admin/fulfillment/requests/{code}")
    async def get_request(code: str, _s=Depends(require_super_admin)):
        # Auto-prepare the Drive folder names this event needs (QR photos /
        # guest photo-requests) so the admin never types them by hand.
        order = await _ensure_folders(await _find(code))
        return {"request": await _card(order, full=True)}

    # ---- deliver: attach the live link (surfaces in buyer + admin) --------
    @router.post("/api/admin/fulfillment/requests/{code}/deliver")
    async def deliver(code: str, payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
        order = await _find(code)
        live_url = (payload or {}).get("live_url")
        if not live_url:
            raise HTTPException(400, "live_url required")
        upd = {"build_status": "delivered", "live_url": live_url, "delivered_at": _now_iso()}
        if payload.get("profile_id"):
            upd["profile_id"] = payload["profile_id"]
        await db.invitation_orders.update_one({"fulfillment_code": code}, {"$set": upd})
        return {"code": code, "delivered": True, "live_url": live_url}

    # ---- build the invitation FROM the order's filled details -------------
    @router.post("/api/admin/fulfillment/requests/{code}/build-invitation")
    async def build_invitation(code: str, payload: Dict[str, Any] = Body(default={}),
                               _s=Depends(require_super_admin)):
        """Create a DRAFT invitation from everything the buyer filled in.

        This is the step the owner used to do by hand: read the order JSON, open an
        empty editor, re-type the couple's details. Now the mapping is code
        (order_to_invitation.py), so nothing is mistyped and nothing is forgotten,
        and the response lists what still needs a human.

        Deliberately NOT a delivery: the profile is a draft, previewable at
        /invite/<slug>, and the buyer's panel is untouched until the owner runs the
        separate deliver step. Idempotent — a second call returns the existing
        invitation instead of creating a duplicate (pass rebuild=true to refresh
        the fields of the one it already made).
        """
        order = await _find(code)
        if not order.get("info"):
            raise HTTPException(400, "This request has no filled details yet — nothing to build from.")

        from order_to_invitation import build_invitation_payload, build_slug

        existing_id = order.get("profile_id")
        existing = None
        if existing_id:
            existing = await db.profiles.find_one({"id": existing_id}, {"_id": 0})
        if not existing:
            # A previous build may have linked nothing (or the order was rebuilt);
            # the deterministic slug lets us find our own earlier attempt.
            existing = await db.profiles.find_one({"slug": build_slug(order)}, {"_id": 0})

        rebuild = bool((payload or {}).get("rebuild"))
        if existing and not rebuild:
            return {"code": code, "created": False, "profile_id": existing["id"],
                    "slug": existing.get("slug"), "preview_url": f"/invite/{existing.get('slug')}",
                    "edit_url": f"/studio/profile/{existing['id']}/edit",
                    "warnings": [], "message": "This order already has an invitation."}

        # Whose account it belongs to: the photographer who bought it, else the
        # normal user's own profile has no admin, so it is kept under the owner.
        admin_id = order.get("user_id") if order.get("buyer_kind") == "photographer" else None
        if admin_id:
            found = (await db.admins.find_one({"id": admin_id}, {"_id": 0, "id": 1})
                     or await db.admins.find_one({"admin_id": admin_id}, {"_id": 0, "id": 1}))
            admin_id = (found or {}).get("id") or admin_id
        if not admin_id:
            owner = await db.admins.find_one({"role": "super_admin"}, {"_id": 0, "id": 1})
            admin_id = (owner or {}).get("id")
        if not admin_id:
            raise HTTPException(400, "No account to attach this invitation to.")

        try:
            built = build_invitation_payload(order, admin_id,
                                            slug=existing.get("slug") if existing else None)
        except Exception as e:
            logger.warning("[fulfillment] build-invitation mapping failed for %s: %s",
                           code, e, exc_info=True)
            raise HTTPException(422, f"Could not build an invitation from these details: {e}")

        doc = built["profile"]
        if existing:
            # Refresh the mapped fields, keep identity + anything already added
            # (photos uploaded to the gallery, analytics, wishes — all live in
            # other collections and are keyed on this same id).
            doc["id"] = existing["id"]
            doc["created_at"] = existing.get("created_at") or doc.get("created_at")
            doc["status"] = existing.get("status") or doc["status"]
            doc["is_published"] = existing.get("is_published", False)
            await db.profiles.update_one({"id": existing["id"]}, {"$set": doc})
            profile_id = existing["id"]
        else:
            # Slug is derived from the fulfillment code, so a clash means a
            # DIFFERENT order already took it — disambiguate rather than collide.
            slug = doc["slug"]
            if await db.profiles.find_one({"slug": slug}, {"_id": 0, "id": 1}):
                import uuid as _uuid
                doc["slug"] = f"{slug}-{_uuid.uuid4().hex[:4]}"
            # Sequential PUBLIC invite number (same helper as create_profile).
            from invite_number import assign_invite_no as _assign_no
            await _assign_no(db, doc)
            await db.profiles.insert_one(doc)
            profile_id = doc["id"]

        await db.invitation_orders.update_one(
            {"fulfillment_code": code},
            {"$set": {"profile_id": profile_id, "build_status": "building",
                      "invitation_built_at": _now_iso()}})

        return {"code": code, "created": not existing, "profile_id": profile_id,
                "slug": doc["slug"], "preview_url": f"/invite/{doc['slug']}",
                "edit_url": f"/studio/profile/{profile_id}/edit",
                "warnings": built["warnings"], "features": built["features"],
                "languages": built["languages"],
                "message": ("Draft invitation ready — preview it, fix anything flagged, "
                            "then deliver the link.")}

    # ---- set the two Google-Drive folder ids for this event ---------------
    @router.post("/api/admin/fulfillment/requests/{code}/drive")
    async def set_drive(code: str, payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
        await _find(code)
        upd = {}
        if "drive_folder_qr" in payload:
            upd["drive_folder_qr"] = payload["drive_folder_qr"]
        if "drive_folder_selfies" in payload:
            upd["drive_folder_selfies"] = payload["drive_folder_selfies"]
        if not upd:
            raise HTTPException(400, "nothing to update")
        await db.invitation_orders.update_one({"fulfillment_code": code}, {"$set": upd})
        return {"code": code, **upd}

    # ---- Events view: delivered links, active/expired, premium/normal -----
    @router.get("/api/admin/fulfillment/events")
    async def events(buyer_kind: Optional[str] = None, _s=Depends(require_super_admin)):
        q: Dict[str, Any] = {"status": "paid", "build_status": "delivered"}
        if buyer_kind in ("photographer", "user"):
            q["buyer_kind"] = buyer_kind
        rows = await db.invitation_orders.find(q, {"_id": 0}).sort("delivered_at", -1).to_list(1000)
        cards = [await _card(o) for o in rows]
        return {
            "events": cards,
            "active": [c for c in cards if c["event_status"] == "active"],
            "expired": [c for c in cards if c["event_status"] == "expired"],
            "premium": [c for c in cards if c["buyer_kind"] == "photographer"],
            "normal": [c for c in cards if c["buyer_kind"] == "user"],
            "ai_face_match": [c for c in cards if c["ai_face_match"]],
        }

    @router.get("/api/admin/fulfillment/links")
    async def all_links(source: Optional[str] = None, _s=Depends(require_super_admin)):
        """EVERY invitation link that exists, not just delivered paid orders.

        `events` above lists only invitation_orders with build_status=delivered,
        so invitations created straight from a studio/user panel (which is most
        of them) were invisible to the admin. This walks `profiles` — the actual
        home of every invitation — and joins each one to its order when it has
        one, so nothing that has a link can hide from this console.
        """
        rows = await db.profiles.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).to_list(2000)

        # One pass over orders, then an in-memory index: a per-profile lookup
        # would be N queries for what is a small, bounded collection.
        orders = await db.invitation_orders.find({}, {"_id": 0}).to_list(2000)
        by_profile = {o.get("profile_id"): o for o in orders if o.get("profile_id")}

        out = []
        for p in rows:
            slug = p.get("slug")
            if not slug:
                continue                      # no slug -> no shareable link yet
            order = by_profile.get(p.get("id"))
            owner_kind = "photographer" if p.get("admin_id") else "user"
            out.append({
                "profile_id":   p.get("id"),
                "slug":         slug,
                "live_url":     f"/invite/{slug}",
                "bride_name":   p.get("bride_name") or "",
                "groom_name":   p.get("groom_name") or "",
                "event_type":   p.get("event_type") or "",
                "event_date":   p.get("event_date") or "",
                "created_at":   p.get("created_at") or "",
                "is_published": bool(p.get("is_published") or p.get("published")),
                "owner_kind":   owner_kind,
                "owner_id":     p.get("admin_id") or p.get("user_id") or "",
                # present only when the invitation came through the paid flow
                "fulfillment_code": (order or {}).get("fulfillment_code"),
                "build_status":     (order or {}).get("build_status"),
                "source":           "order" if order else "panel",
            })

        if source in ("order", "panel"):
            out = [r for r in out if r["source"] == source]

        return {
            "links": out,
            "total": len(out),
            "published": len([r for r in out if r["is_published"]]),
            "from_orders": len([r for r in out if r["source"] == "order"]),
            "from_panel": len([r for r in out if r["source"] == "panel"]),
        }

    # ---- AI-face-match selfie metadata (future; storage plumbing) ---------
    # Public capture endpoint records {phone, email?, photo_id} against an event
    # before the guest gets their photos. Actual selfie->Drive upload + matching
    # is wired later once Google creds land.
    @router.post("/api/fulfillment/{code}/face-match/selfie")
    async def record_selfie(code: str, request: Request, payload: Dict[str, Any] = Body(...)):
        order = await db.invitation_orders.find_one({"fulfillment_code": code}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Event not found")
        phone = str((payload or {}).get("phone") or "").strip()
        if not phone or not _PHONE_RE.match(phone):
            raise HTTPException(400, "A valid phone number is required")  # mail optional, phone mandatory
        # per-IP-per-event-per-day rate limit (abuse guard on a public endpoint)
        iph = _ip_hash(request)
        day = _today()
        rl = await db.face_match_rate_limits.find_one({"ip_hash": iph, "event_code": code, "day": day})
        if rl and rl.get("count", 0) >= SELFIE_MAX_PER_IP_PER_EVENT_PER_DAY:
            raise HTTPException(429, "Too many uploads from this device today. Try again tomorrow.")
        rec = {
            "id": f"fm_{_now_iso()}_{phone[-4:]}",
            "event_code": code,
            "phone": phone,
            "email": (payload.get("email") or "").strip() or None,
            "photo_id": payload.get("photo_id"),
            "drive_folder_selfies": order.get("drive_folder_selfies"),
            "created_at": _now_iso(),
        }
        await db.face_match_records.insert_one(rec)
        await db.face_match_rate_limits.update_one(
            {"ip_hash": iph, "event_code": code, "day": day},
            {"$inc": {"count": 1}, "$set": {"updated_at": _now_iso()}}, upsert=True)
        return {"recorded": True, "id": rec["id"]}

    @router.get("/api/admin/fulfillment/{code}/face-match")
    async def list_face_match(code: str, _s=Depends(require_super_admin)):
        rows = await db.face_match_records.find({"event_code": code}, {"_id": 0}).sort("created_at", -1).to_list(100000)
        return {"records": rows, "count": len(rows)}

    return router
