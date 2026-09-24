"""
event_lifecycle_service.py — MAJA Dynamic Event Engine: lifecycle + foundation API.
===================================================================================

Purpose
    Owns an event's whole lifecycle for ANY registered event type on the Spec-04
    schema: create draft → autosave (routed to the normalized collections) →
    validate → slug → publish (+ invitation row) → archive/restore → soft-delete.
    A dedicated `events` collection is the root (Spec 04 §5) — the wedding
    `profiles` collection is never touched (§24, Master Guide §Backward Compatibility).

Inputs      db, the current buyer (hybrid auth), a registered event_type
Outputs     draft/published event docs, a public slug + invitation row, an edit
            counter (free up to registry.free_edits, then priced)
Dependencies  event_registry (config + flag + section routing), event_schema
Side effects  writes events + venues/organizers (1:1) + invitations + audit rows
Future extension  every new event type reuses this unchanged (reads the registry).

Rules: drafts/autosaves are free and never edits; first publish free, each later
publish is one edit; slugs are collision-safe; publishing validates across the
normalized docs; whole module gated by `ganesh_module_enabled` (OFF → every
endpoint 404s). State machine (SRS §6) rejects invalid transitions.
"""
from __future__ import annotations

import uuid
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(p: str) -> str:
    return f"{p}_{uuid.uuid4().hex[:14]}"


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "event"


def _owner(current: Dict[str, Any]) -> Dict[str, str]:
    oid = current.get("user_id") or current.get("admin_id")
    if not oid:
        raise HTTPException(401, "Not authenticated")
    return {"owner_id": oid, "owner_kind": current.get("kind", "user")}


# --------------------------------------------------------------------------- #
# lifecycle state machine (SRS §6 — invalid transitions rejected)
# --------------------------------------------------------------------------- #
DRAFT, INCOMPLETE, READY = "draft", "incomplete", "ready_for_review"
PUBLISHED, LIVE, COMPLETED, ARCHIVED = "published", "live", "completed", "archived"
EDITING = {DRAFT, INCOMPLETE, READY}

ALLOWED_TRANSITIONS: Dict[str, set] = {
    DRAFT: {INCOMPLETE, READY}, INCOMPLETE: {DRAFT, READY},
    READY: {DRAFT, INCOMPLETE, PUBLISHED},
    PUBLISHED: {LIVE, COMPLETED, ARCHIVED}, LIVE: {COMPLETED, ARCHIVED},
    COMPLETED: {ARCHIVED}, ARCHIVED: {PUBLISHED},
}


def can_transition(current_status: str, target: str) -> bool:
    return target == current_status or target in ALLOWED_TRANSITIONS.get(current_status, set())


# --------------------------------------------------------------------------- #
# section routing (Spec 04 normalization)
# --------------------------------------------------------------------------- #
def _route(section: Dict[str, Any]):
    store = section.get("store", "event")
    if store == "event":
        return ("root", None)
    if store == "system":
        return ("system", None)
    for prefix in ("root_obj:", "one:", "collection:"):
        if store.startswith(prefix):
            return (prefix[:-1], store.split(":", 1)[1])
    return ("root", None)


# recognized scalar fields that land on the events root (Spec 04 §5)
_ROOT_SCALARS = ("title", "description", "start_date", "end_date", "timezone",
                 "festival_year", "organizer_name", "temple_name", "secondary_languages")


async def _audit(db, event_id: str, current: Dict[str, Any], action: str,
                 module: str, before: Any = None, after: Any = None) -> None:
    try:
        await db.event_audit_logs.insert_one({
            "log_id": _uid("log"), "event_id": event_id,
            "user_id": (current or {}).get("user_id") or (current or {}).get("admin_id"),
            "action": action, "module": module, "old_value": before, "new_value": after,
            "created_at": _now()})
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# services
# --------------------------------------------------------------------------- #
async def create_draft(db, current: Dict[str, Any], event_type: str) -> Dict[str, Any]:
    cfg = registry.get_config(event_type)
    if not cfg:
        raise HTTPException(404, f"Unknown event type '{event_type}'")
    own = _owner(current)
    doc = {
        "event_id": _uid("evt"), "id": None,
        "event_type": event_type, "is_event_module": True,
        "title": None, "description": None,
        "status": DRAFT, "is_public": False,
        "template_id": cfg.get("default_template"), "theme_id": None,
        "language": (cfg.get("supported_languages") or ["en"])[0],
        "start_date": None, "end_date": None, "timezone": "Asia/Kolkata",
        "venue_id": None, "publish_slug": None, "current_version": 0,
        "content": {}, "theme": {}, "seo": {},
        "edit_count": 0, "published_at": None, "deleted_at": None,
        **own, "created_at": _now(), "updated_at": _now(),
    }
    doc["id"] = doc["event_id"]          # id mirror for adapter/id lookups
    await db.events.insert_one(doc)
    await _audit(db, doc["event_id"], current, "create", "event")
    return doc


async def _load_owned(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.events.find_one({"event_id": event_id})
    if not doc or doc.get("deleted_at"):
        raise HTTPException(404, "Event not found")
    doc.pop("_id", None)
    own = _owner(current)
    is_super = current.get("kind") == "super_admin" or current.get("is_super")
    if doc.get("owner_id") != own["owner_id"] and not is_super:
        raise HTTPException(403, "Not your event")
    return doc


async def _child(db, coll: str, event_id: str) -> Optional[Dict[str, Any]]:
    doc = await getattr(db, coll).find_one({"event_id": event_id})
    if doc:
        doc.pop("_id", None)
    return doc


async def _children(db, coll: str, event_id: str, *, order: Optional[str] = None,
                    where=None) -> List[Dict[str, Any]]:
    """All live (non-deleted) rows of a child collection for an event."""
    out: List[Dict[str, Any]] = []
    async for d in getattr(db, coll).find({"event_id": event_id}):
        if d.get("deleted_at"):
            continue
        if where and not where(d):
            continue
        d.pop("_id", None)
        out.append(d)
    if order:
        out.sort(key=lambda r: (r.get(order) is None, r.get(order)))
    return out


async def autosave(db, event_id: str, current: Dict[str, Any],
                   patch: Dict[str, Any]) -> Dict[str, Any]:
    """Route a partial builder payload into the normalized collections. Free,
    unlimited, never an edit. Only known sections are accepted (input validated).
    Child-collection sections (gallery/finance/…) get their own CRUD in Spec 05 —
    here they are acknowledged but not written."""
    doc = await _load_owned(db, event_id, current)
    sections = {s["key"]: s for s in registry.get_config(doc["event_type"])["sections"]}
    root_update: Dict[str, Any] = {}
    deferred: List[str] = []

    for key, payload in (patch or {}).items():
        sec = sections.get(key)
        if not sec or not isinstance(payload, dict):
            continue
        kind, target = _route(sec)
        if kind == "root":
            data = dict(payload)
            if "event_name" in data:
                root_update["title"] = data.pop("event_name")
            if "primary_language" in data:
                root_update["language"] = data.pop("primary_language")
            for k in list(data.keys()):
                if k in _ROOT_SCALARS:
                    root_update[k] = data[k]
        elif kind == "root_obj":
            root_update[target] = payload
            if target == "theme":
                if payload.get("template"):
                    root_update["template_id"] = payload["template"]
                if payload.get("theme_id"):
                    root_update["theme_id"] = payload["theme_id"]
        elif kind == "one":
            existing = await _child(db, target, event_id)
            row = {"event_id": event_id, **payload, "updated_at": _now()}
            if existing:
                await getattr(db, target).update_one({"event_id": event_id}, {"$set": row})
            else:
                row["id"] = _uid(target[:3]); row[f"{target[:-1]}_id"] = row["id"]
                row["created_at"] = _now()
                await getattr(db, target).insert_one(row)
                if target == "venues":
                    root_update["venue_id"] = row["id"]
        elif kind == "collection":
            deferred.append(key)          # dedicated CRUD (Spec 05)

    if doc.get("status") in EDITING:
        merged = {**doc, **root_update}
        errors = await validate_for_publish(db, merged)
        root_update["status"] = READY if not errors else INCOMPLETE
    root_update["updated_at"] = _now()
    await db.events.update_one({"event_id": event_id}, {"$set": root_update})
    return {"saved": True, "status": root_update.get("status", doc.get("status")),
            "deferred_sections": deferred, "updated_at": _now()}


async def _resolve_required(db, event: Dict[str, Any], section: Dict[str, Any], field: str):
    """Where a section's required field actually lives (Spec 04 normalization),
    resolved from the registry `store` — so validation is config-driven, not
    hardcoded to any one event type."""
    kind, target = _route(section)
    if kind == "root":
        if field == "event_name":
            return event.get("title")
        if field == "primary_language":
            return event.get("language")
        return event.get(field)
    if kind == "root_obj":
        return (event.get(target) or {}).get(field)
    if kind == "one":
        child = await _child(db, target, event["event_id"])
        return (child or {}).get(field)
    return "__skip__"          # collection sections aren't gated at publish


async def validate_for_publish(db, event: Dict[str, Any]) -> List[str]:
    """Cross-document publish validation, DERIVED from the event type's registry
    config (its sections' required_fields). A new event type validates correctly
    with zero changes here — the engine reads what each type requires."""
    cfg = registry.get_config(event.get("event_type")) or {}
    errors: List[str] = []
    for section in cfg.get("sections", []):
        for field in section.get("required_fields", []):
            val = await _resolve_required(db, event, section, field)
            if val == "__skip__":
                continue
            if val in (None, "", []):
                label = field.replace("_", " ")
                errors.append(f"{section.get('title', section['key']).lower()}: {label} is required")
    if event.get("start_date") and event.get("end_date") and event["start_date"] > event["end_date"]:
        errors.append("event information: start date must be on or before end date")
    return errors


async def _generate_slug(db, base: str) -> str:
    root = _slugify(base)
    slug, n = root, 1
    while await db.events.find_one({"publish_slug": slug}):
        n += 1
        slug = f"{root}-{n}"
    return slug


async def publish(db, event_id: str, current: Dict[str, Any], *, edit_paid: bool = False) -> Dict[str, Any]:
    doc = await _load_owned(db, event_id, current)
    if doc.get("status") == ARCHIVED:
        raise HTTPException(409, "This event is archived — restore it before publishing.")
    errors = await validate_for_publish(db, doc)
    if errors:
        raise HTTPException(422, {"message": "Cannot publish — fix these first", "errors": errors})

    cfg = registry.get_config(doc["event_type"]) or {}
    free_edits = int(cfg.get("free_edits", 20))
    first_publish = not doc.get("published_at")
    edit_count = int(doc.get("edit_count") or 0)
    if not first_publish:
        if edit_count >= free_edits and not edit_paid:
            raise HTTPException(402, {"message": "Free edit limit reached — an extra edit is required.",
                                      "free_edits": free_edits, "edit_count": edit_count})
        edit_count += 1

    update: Dict[str, Any] = {
        "status": PUBLISHED, "is_public": True, "edit_count": edit_count,
        "current_version": int(doc.get("current_version") or 0) + 1, "updated_at": _now(),
    }
    slug = doc.get("publish_slug")
    if not slug:
        base = f"{doc.get('title', doc['event_type'])}-{doc.get('festival_year', '')}"
        slug = await _generate_slug(db, base)
        update["publish_slug"] = slug
    if first_publish:
        update["published_at"] = _now()
    await db.events.update_one({"event_id": event_id}, {"$set": update})

    # invitation metadata row (Spec 04 §15) — upsert, idempotent.
    # Events use the distinct `/e/<slug>` public route (weddings own `/invite/<slug>`).
    inv = await db.invitations.find_one({"event_id": event_id})
    inv_doc = {"event_id": event_id, "public_url": f"/e/{slug}",
               "template_version": update["current_version"], "status": "active",
               "last_updated": _now()}
    if inv:
        await db.invitations.update_one({"event_id": event_id}, {"$set": inv_doc})
    else:
        inv_doc.update({"invitation_id": _uid("inv"), "qr_code_url": None,
                        "published_at": _now(), "view_count": 0, "share_count": 0})
        await db.invitations.insert_one(inv_doc)

    await _audit(db, event_id, current, "publish", "event", after={"version": update["current_version"]})

    # Storage pool (V1 multi-drive): make sure this event has its folder tree so the
    # first photo mirror lands in the right place. Fire-and-forget + flag-gated.
    try:
        from storage_pool_hooks import provision_event
        provision_event(db, doc.get("owner_id") or "", event_id,
                        str(doc.get("title") or doc.get("event_type") or event_id))
    except Exception:                     # never block a publish on the mirror
        pass

    return {"published": True, "slug": slug, "invitation_link": f"/e/{slug}",
            "edit_count": edit_count, "first_publish": first_publish,
            "version": update["current_version"]}


async def archive(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    doc = await _load_owned(db, event_id, current)
    if not can_transition(doc.get("status"), ARCHIVED):
        raise HTTPException(409, f"Cannot archive from '{doc.get('status')}'.")
    await db.events.update_one({"event_id": event_id}, {"$set": {
        "status": ARCHIVED, "is_public": False, "archived_at": _now(), "updated_at": _now()}})
    await _audit(db, event_id, current, "archive", "event")
    return {"status": ARCHIVED, "is_public": False}


async def restore(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    doc = await _load_owned(db, event_id, current)
    if doc.get("status") != ARCHIVED:
        raise HTTPException(409, "Only an archived event can be restored.")
    await db.events.update_one({"event_id": event_id}, {"$set": {
        "status": PUBLISHED, "is_public": True, "updated_at": _now()}, "$unset": {"archived_at": ""}})
    await _audit(db, event_id, current, "restore", "event")
    return {"status": PUBLISHED, "is_public": True}


async def soft_delete(db, event_id: str, current: Dict[str, Any]) -> Dict[str, Any]:
    """Spec 04 §20 soft-delete — recoverable trash (distinct from archive)."""
    doc = await _load_owned(db, event_id, current)
    await db.events.update_one({"event_id": event_id}, {"$set": {
        "deleted_at": _now(), "is_public": False, "updated_at": _now()}})
    await _audit(db, event_id, current, "soft_delete", "event")

    # Mirror the trash into the pool: a 5-day recycle window, then the daily job
    # purges and releases the bytes (app trash ⇔ pool recycle stay in step).
    try:
        from storage_pool_hooks import on_event_deleted
        on_event_deleted(db, event_id, doc.get("owner_id"))
    except Exception:
        pass
    return {"deleted": True}


async def list_events(db, current: Dict[str, Any]) -> List[Dict[str, Any]]:
    own = _owner(current)
    out = []
    async for d in db.events.find({"owner_id": own["owner_id"]}):
        if d.get("deleted_at"):
            continue
        d.pop("_id", None)
        out.append({"event_id": d["event_id"], "event_type": d.get("event_type"),
                    "title": d.get("title"), "status": d.get("status"),
                    "publish_slug": d.get("publish_slug"), "edit_count": d.get("edit_count", 0),
                    "updated_at": d.get("updated_at")})
    return out


async def public_get(db, slug: str) -> Dict[str, Any]:
    doc = await db.events.find_one({"publish_slug": slug})
    # admin moderation (suspend/hide) removes an event from public view (Spec 09)
    if (not doc or not doc.get("is_public") or doc.get("deleted_at")
            or doc.get("is_suspended") or doc.get("is_hidden")):
        raise HTTPException(404, "Invitation not found")
    doc.pop("_id", None)
    doc.pop("owner_id", None)
    event_id = doc["event_id"]
    doc["venue"] = await _child(db, "venues", event_id)
    doc["organizer"] = await _child(db, "organizers", event_id)
    # public-facing sections (guests see these on the invitation)
    doc["schedule"] = await _children(db, "festival_schedule", event_id, order="display_order")
    doc["gallery"] = await _children(db, "gallery", event_id, order="display_order")
    doc["sponsors"] = await _children(db, "sponsors", event_id, order="display_order",
                                      where=lambda s: s.get("is_active", True))
    # v2 public sections
    doc["journey"] = await _children(db, "celebration_journey", event_id, order="year")
    doc["highlights"] = await _children(db, "highlights", event_id, order="display_order")
    doc["prasadam"] = await _children(db, "prasadam_menu", event_id, order="display_order")
    # v2 plan gating — the renderer shows a feature only if the plan grants it.
    # None (everything visible) until a plan was actually purchased for this event.
    try:
        from event_plan_gating import public_event_features
        doc["granted_features"] = public_event_features(doc)
    except Exception:
        doc["granted_features"] = None
    _attach_template(doc)
    return doc


def _attach_template(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve the chosen design (artwork + text-zone layout) onto an event doc.

    Used by BOTH the public read and the owner read. It has to be both: the
    builder shows the studio a preview of the card, and if that preview were
    fed from a different source than the public page they could disagree —
    which is the one thing a preview must never do. Falls back to the event
    type's first template so a draft that has not chosen yet still renders.
    """
    import event_templates
    tid = doc.get("template_id") or (doc.get("theme") or {}).get("template")
    doc["template"] = (event_templates.get_template(doc.get("event_type"), tid)
                       or (event_templates.templates_for(doc.get("event_type")) or [None])[0])
    return doc


async def submit_public_rsvp(db, slug: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """A guest RSVPs from the public invitation (no auth). Server-validated."""
    doc = await db.events.find_one({"publish_slug": slug})
    if (not doc or not doc.get("is_public") or doc.get("deleted_at")
            or doc.get("is_suspended") or doc.get("is_hidden")):
        raise HTTPException(404, "Invitation not found")
    name = str((payload or {}).get("guest_name") or "").strip()
    if not name:
        raise HTTPException(422, "Please enter your name.")
    status = (payload or {}).get("attendance_status") or "yes"
    if status not in ("yes", "no", "maybe"):
        status = "yes"
    try:
        guests = max(1, min(int((payload or {}).get("guests_count") or 1), 50))
    except (TypeError, ValueError):
        guests = 1
    rid = _uid("rsv")
    await db.event_rsvp.insert_one({
        "id": rid, "child_id": rid, "event_id": doc["event_id"], "guest_name": name,
        "phone": str((payload or {}).get("phone") or "")[:20], "attendance_status": status,
        "guests_count": guests, "message": str((payload or {}).get("message") or "")[:500],
        "source": "public", "deleted_at": None, "created_at": _now(), "updated_at": _now()})
    await _audit(db, doc["event_id"], {"user_id": "public"}, "rsvp_public", "event", after={"rsvp_id": rid})
    return {"ok": True, "message": "Thank you! Your RSVP has been recorded."}


# --------------------------------------------------------------------------- #
# router (foundation endpoints; child-collection CRUD = Spec 05)
# --------------------------------------------------------------------------- #
def build_event_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["events"])

    async def _gate() -> None:
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/registry")
    async def list_registry():
        await _gate()
        return {"event_types": [{"event_type": et, "name": c["name"], "slug": c.get("slug"),
                                 "category": c["category"], "modules": c["modules"]}
                                for et, c in registry.EVENT_TYPES.items()]}

    @router.get("/api/events/registry/{event_type}")
    async def registry_config(event_type: str):
        await _gate()
        cfg = registry.get_config(event_type)
        if not cfg:
            raise HTTPException(404, "Unknown event type")
        return cfg

    @router.get("/api/events/templates/{event_type}")
    async def event_templates_catalog(event_type: str):
        """The approved invitation designs for an event type (browse/select)."""
        await _gate()
        import event_templates
        return {"event_type": event_type,
                "templates": event_templates.templates_for(event_type),
                "default": event_templates.default_template(event_type)}

    @router.post("/api/events")
    async def create(body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        doc = await create_draft(db, current, body.get("event_type", ""))
        return {"event_id": doc["event_id"], "status": doc["status"], "event_type": doc["event_type"]}

    @router.get("/api/events")
    async def mine(current=Depends(get_current_buyer)):
        await _gate()
        return {"events": await list_events(db, current)}

    @router.get("/api/events/{event_id}")
    async def get_one(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        doc = await _load_owned(db, event_id, current)
        # attach 1:1 child sections (venue/organizer) so the Builder prefills them
        cfg = registry.get_config(doc.get("event_type")) or {}
        for sec in cfg.get("sections", []):
            store = sec.get("store", "")
            if store.startswith("one:"):
                coll = store.split(":", 1)[1]
                doc[coll] = await _child(db, coll, event_id)
        # Same resolution the public page uses, so the Builder's design preview
        # is the public card rather than an approximation of it.
        _attach_template(doc)
        return doc

    @router.patch("/api/events/{event_id}/autosave")
    async def do_autosave(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await autosave(db, event_id, current, body.get("patch") or body)

    @router.post("/api/events/{event_id}/validate")
    async def do_validate(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        doc = await _load_owned(db, event_id, current)
        errors = await validate_for_publish(db, doc)
        return {"ok": not errors, "errors": errors}

    @router.post("/api/events/{event_id}/publish")
    async def do_publish(event_id: str, body: Dict[str, Any] = Body(default={}), current=Depends(get_current_buyer)):
        await _gate()
        return await publish(db, event_id, current, edit_paid=bool((body or {}).get("edit_paid")))

    @router.post("/api/events/{event_id}/archive")
    async def do_archive(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await archive(db, event_id, current)

    @router.post("/api/events/{event_id}/restore")
    async def do_restore(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await restore(db, event_id, current)

    @router.delete("/api/events/{event_id}")
    async def do_delete(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        return await soft_delete(db, event_id, current)

    @router.get("/api/public/events/{slug}")
    async def public(slug: str):
        await _gate()
        return await public_get(db, slug)

    @router.post("/api/public/events/{slug}/rsvp")
    async def public_rsvp(slug: str, body: Dict[str, Any] = Body(...)):
        await _gate()
        return await submit_public_rsvp(db, slug, body)

    return router
