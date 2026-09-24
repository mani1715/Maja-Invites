"""
event_children_service.py — MAJA Dynamic Event Engine: child-collection CRUD (Spec 05).
=======================================================================================

Purpose
    ONE generic CRUD engine for every unbounded child collection an event owns —
    committee_members, festival_schedule, gallery (metadata), albums, donations,
    sponsors, expenses, event_rsvp. Doc 05 names these endpoint families (§10-17);
    Doc 04 is the field authority. Rather than eight near-identical routers, each
    collection is a CONFIG row here (Master Guide §Configuration over Hardcoding,
    §Reuse over Rewrite) and a single set of handlers serves them all.

Inputs      db, the current buyer (hybrid auth), an event_id, a collection key
Outputs     paginated lists (§24), single rows, create/update/delete/reorder/actions
Dependencies  event_rbac (per-operation authorization), event_lifecycle_service
            (_audit, _uid, _now),
            event_registry (module flag), event_schema (soft-delete policy)
Side effects  writes the child collection + an audit row per mutation (§27)
Future extension  a new child collection = a new CHILD_SPECS entry; no new handler.

Scope note (Doc 05, honoured per Master Guide §Never Guess):
  * Implemented here: create / list / get / update / delete / reorder + simple
    status actions (approve-reject, activate-deactivate, mark-received).
  * DEFERRED to their own specs (external creds / underspecified): real payment
    verification (§14), notifications (§20), auto-translation (§21), QR & asset
    generation (§18), and the granular 10-role permission matrix (§4 → Doc 10
    Security). Access here is owner-or-super-admin, resolved through the parent
    event, so a caller can only ever touch children of an event they own.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _audit, _uid, _now
from event_schema import SOFT_DELETE_ENTITIES


# --------------------------------------------------------------------------- #
# per-collection configuration (the ONLY place a child collection is described)
# --------------------------------------------------------------------------- #
class ChildSpec:
    def __init__(self, *, id_prefix: str, fields: Tuple[str, ...],
                 required: Tuple[str, ...] = (), defaults: Optional[Dict[str, Any]] = None,
                 orderable: bool = False, search_fields: Tuple[str, ...] = (),
                 default_sort: Tuple[str, int] = ("created_at", 1),
                 filterable: Tuple[str, ...] = (),
                 actions: Optional[Dict[str, Dict[str, Any]]] = None):
        self.id_prefix = id_prefix
        self.fields = fields                     # allow-list for create/update (input validation §23)
        self.required = required
        self.defaults = defaults or {}
        self.orderable = orderable               # supports display_order + /reorder
        self.search_fields = search_fields
        self.default_sort = default_sort
        self.filterable = filterable             # query-param filters allowed (§24)
        self.actions = actions or {}             # name -> {field: value} status transition

    @property
    def soft_delete(self) -> bool:
        return self.collection in SOFT_DELETE_ENTITIES

    collection: str = ""                         # set when registered below


CHILD_SPECS: Dict[str, ChildSpec] = {
    "committee_members": ChildSpec(
        id_prefix="mem",
        fields=("name", "role", "phone", "email", "photo_url", "responsibility",
                "display_order", "status"),
        required=("name", "role"),
        defaults={"status": "active", "display_order": 0},
        orderable=True, search_fields=("name", "role"),
        default_sort=("display_order", 1), filterable=("role", "status"),
        actions={"activate": {"status": "active"}, "deactivate": {"status": "inactive"}},
    ),
    "festival_schedule": ChildSpec(
        id_prefix="day",
        # v2 per-day model: each day carries an ordered `items` list
        # [{time,title,kind,note}] plus special-day highlighting and a
        # photo-unlock time (per-day photos upload only AFTER the day ends).
        fields=("festival_day", "day_label", "date", "start_time", "end_time",
                "rituals", "description", "display_order",
                "items", "is_special", "special_kind", "special_note",
                "photos_locked_until"),
        required=("festival_day",),
        defaults={"display_order": 0, "items": [], "is_special": False},
        orderable=True, search_fields=("day_label", "description"),
        default_sort=("display_order", 1), filterable=("festival_day", "is_special"),
    ),
    # v2 — year-by-year "celebration journey" (2018 → this year), optional photo.
    "celebration_journey": ChildSpec(
        id_prefix="jny",
        fields=("year", "label", "photo_url", "display_order"),
        required=("year",),
        defaults={"display_order": 0},
        orderable=True, search_fields=("label",),
        default_sort=("year", 1),
    ),
    # v2 — special highlights list (Sthapana, Archana, Annadanam, …).
    "highlights": ChildSpec(
        id_prefix="hlt",
        fields=("title", "icon", "display_order"),
        required=("title",),
        defaults={"display_order": 0},
        orderable=True, search_fields=("title",),
        default_sort=("display_order", 1),
    ),
    # v2 — prasadam menu list.
    "prasadam_menu": ChildSpec(
        id_prefix="prs",
        fields=("item", "note", "display_order"),
        required=("item",),
        defaults={"display_order": 0},
        orderable=True, search_fields=("item",),
        default_sort=("display_order", 1),
    ),
    # v2 — guest blessings wall (guests submit at runtime; owner moderates).
    "event_blessings": ChildSpec(
        id_prefix="bls",
        fields=("guest_name", "message", "status", "is_featured", "display_order"),
        required=("guest_name", "message"),
        defaults={"status": "pending", "is_featured": False, "display_order": 0},
        search_fields=("guest_name", "message"),
        default_sort=("created_at", -1), filterable=("status", "is_featured"),
        actions={"approve": {"status": "approved"}, "reject": {"status": "rejected"},
                 "feature": {"is_featured": True}, "unfeature": {"is_featured": False}},
    ),
    "gallery": ChildSpec(
        id_prefix="med",
        # metadata CRUD only — the actual binary upload reuses the storage
        # pipeline and is wired in the media phase (Doc 07), not invented here.
        fields=("type", "url", "thumbnail_url", "webp_url", "album_id", "caption",
                "width", "height", "display_order", "festival_day"),
        required=("type", "url"),
        defaults={"type": "image", "display_order": 0},
        orderable=True, search_fields=("caption",),
        default_sort=("display_order", 1), filterable=("type", "album_id", "festival_day"),
    ),
    "albums": ChildSpec(
        id_prefix="alb",
        fields=("name", "cover_media_id", "description", "display_order"),
        required=("name",),
        defaults={"display_order": 0},
        orderable=True, search_fields=("name",),
        default_sort=("display_order", 1),
    ),
    "donations": ChildSpec(
        id_prefix="don",
        # Spec 08 §Donation Fields (currency/reference/category/receipt/anonymity)
        fields=("donor_name", "amount", "currency", "phone", "email", "message",
                "payment_method", "transaction_reference", "category", "status",
                "receipt_number", "receipt_date", "is_anonymous", "hide_amount",
                "hide_message", "display_name"),
        required=("donor_name", "amount"),
        defaults={"status": "pending", "payment_method": "offline", "currency": "INR",
                  "category": "General Donation", "is_anonymous": False},
        search_fields=("donor_name", "phone", "transaction_reference", "receipt_number"),
        default_sort=("created_at", -1),
        filterable=("status", "payment_method", "category"),
        # "verify" here = manually mark an OFFLINE/cash donation received. Gateway
        # verification (Razorpay webhook) is a future enhancement (Spec 08 §Future).
        actions={"mark_received": {"status": "received"}, "reject": {"status": "rejected"}},
    ),
    "sponsors": ChildSpec(
        id_prefix="spo",
        # Spec 08 §Sponsors (description/contact/priority/status)
        fields=("name", "logo_url", "tier", "website_url", "description",
                "contact_person", "amount", "priority", "display_order", "is_active"),
        required=("name",),
        defaults={"tier": "Supporter", "is_active": True, "display_order": 0},
        orderable=True, search_fields=("name", "contact_person"),
        default_sort=("display_order", 1), filterable=("tier",),
        actions={"activate": {"is_active": True}, "deactivate": {"is_active": False}},
    ),
    "expenses": ChildSpec(
        id_prefix="exp",
        # Spec 08 §Expense Fields (vendor/invoice/tax/payment_method/paid_by)
        fields=("title", "category", "description", "vendor", "invoice_number",
                "amount", "tax", "payment_method", "paid_by", "bill_url",
                "approval_status", "spent_at", "notes"),
        required=("title", "amount"),
        defaults={"approval_status": "pending"},
        search_fields=("title", "category", "vendor", "invoice_number"),
        default_sort=("created_at", -1), filterable=("category", "approval_status"),
        # simple approve/reject stay here; the full pending→approved→paid→closed
        # state machine lives in event_finance_service (Spec 08 §Approval Workflow).
        actions={"approve": {"approval_status": "approved"},
                 "reject": {"approval_status": "rejected"}},
    ),
    "event_rsvp": ChildSpec(
        id_prefix="rsv",
        fields=("guest_name", "phone", "email", "attendance_status",
                "guests_count", "message"),
        required=("guest_name", "attendance_status"),
        defaults={"guests_count": 1},
        search_fields=("guest_name", "phone"),
        default_sort=("created_at", -1), filterable=("attendance_status",),
    ),
}
for _name, _spec in CHILD_SPECS.items():
    _spec.collection = _name


def _spec(collection: str) -> ChildSpec:
    s = CHILD_SPECS.get(collection)
    if not s:
        raise HTTPException(404, "Unknown collection")
    return s


def collections_meta() -> Dict[str, Any]:
    """Public field metadata so the Builder renders add/edit forms from the
    schema (Doc 06 §Form Management — config-driven, no hardcoded fields)."""
    return {name: {"fields": list(s.fields), "required": list(s.required),
                   "orderable": s.orderable, "soft_delete": s.soft_delete,
                   "actions": list(s.actions.keys()),
                   "search_fields": list(s.search_fields),
                   "filterable": list(s.filterable)}
            for name, s in CHILD_SPECS.items()}


def _clean(spec: ChildSpec, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only allow-listed fields (§23 input validation — unknown keys dropped)."""
    return {k: v for k, v in (payload or {}).items() if k in spec.fields}


def _require(spec: ChildSpec, data: Dict[str, Any]) -> None:
    missing = [f for f in spec.required
               if data.get(f) in (None, "") and not (f == "amount" and data.get(f) == 0)]
    if missing:
        raise HTTPException(422, {"message": "Missing required fields", "fields": missing})


# --------------------------------------------------------------------------- #
# services (every one gated by ownership of the PARENT event)
# --------------------------------------------------------------------------- #
async def _live(db, spec: ChildSpec, flt: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async for d in getattr(db, spec.collection).find(flt):
        if spec.soft_delete and d.get("deleted_at"):
            continue
        d.pop("_id", None)
        out.append(d)
    return out


async def list_children(db, current, event_id: str, collection: str, *,
                        page: int = 1, limit: int = 50, sort: Optional[str] = None,
                        order: str = "asc", search: str = "",
                        filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_VIEW)   # 404/403 gate
    spec = _spec(collection)
    rows = await _live(db, spec, {"event_id": event_id})

    for k, v in (filters or {}).items():          # §24 filter (allow-listed)
        if k in spec.filterable and v not in (None, ""):
            rows = [r for r in rows if str(r.get(k)) == str(v)]
    if search and spec.search_fields:              # §24 search
        q = search.lower()
        rows = [r for r in rows
                if any(q in str(r.get(f, "")).lower() for f in spec.search_fields)]

    sort_key = sort if (sort in spec.fields or sort in ("created_at", "updated_at")) \
        else spec.default_sort[0]
    reverse = (order == "desc") if sort else (spec.default_sort[1] == -1)
    rows.sort(key=lambda r: (r.get(sort_key) is None, r.get(sort_key)), reverse=reverse)

    total = len(rows)
    page = max(1, int(page)); limit = max(1, min(int(limit), 200))
    start = (page - 1) * limit
    return {"items": rows[start:start + limit], "total": total, "page": page,
            "limit": limit, "pages": (total + limit - 1) // limit}


async def _load_child(db, spec: ChildSpec, event_id: str, child_id: str) -> Dict[str, Any]:
    doc = await getattr(db, spec.collection).find_one({"id": child_id, "event_id": event_id})
    if not doc or (spec.soft_delete and doc.get("deleted_at")):
        raise HTTPException(404, "Item not found")
    doc.pop("_id", None)
    return doc


async def get_child(db, current, event_id: str, collection: str, child_id: str) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_VIEW)
    return await _load_child(db, _spec(collection), event_id, child_id)


def _write_perm(collection: str) -> str:
    return rbac.CHILD_WRITE_PERM.get(collection, rbac.P_EVENT_EDIT)


async def create_child(db, current, event_id: str, collection: str,
                       payload: Dict[str, Any]) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, _write_perm(collection))
    spec = _spec(collection)
    data = {**spec.defaults, **_clean(spec, payload)}
    _require(spec, data)
    cid = _uid(spec.id_prefix)
    doc = {"id": cid, "child_id": cid, "event_id": event_id, **data,
           "deleted_at": None, "created_at": _now(), "updated_at": _now()}
    await getattr(db, spec.collection).insert_one(doc)
    await _audit(db, event_id, current, "create", collection, after={"id": cid})
    doc.pop("_id", None)
    return doc


async def update_child(db, current, event_id: str, collection: str, child_id: str,
                       payload: Dict[str, Any]) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, _write_perm(collection))
    spec = _spec(collection)
    before = await _load_child(db, spec, event_id, child_id)
    patch = _clean(spec, payload)
    if not patch:
        return before
    merged = {**before, **patch}
    _require(spec, merged)                          # can't null out a required field
    patch["updated_at"] = _now()
    await getattr(db, spec.collection).update_one(
        {"id": child_id, "event_id": event_id}, {"$set": patch})
    await _audit(db, event_id, current, "update", collection,
                 before={k: before.get(k) for k in patch}, after=patch)
    return {**merged, "updated_at": patch["updated_at"]}


async def delete_child(db, current, event_id: str, collection: str, child_id: str) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, _write_perm(collection))
    spec = _spec(collection)
    await _load_child(db, spec, event_id, child_id)   # 404 if absent
    if spec.soft_delete:
        await getattr(db, spec.collection).update_one(
            {"id": child_id, "event_id": event_id},
            {"$set": {"deleted_at": _now(), "updated_at": _now()}})
    else:
        await getattr(db, spec.collection).delete_one({"id": child_id, "event_id": event_id})
    await _audit(db, event_id, current, "delete", collection, before={"id": child_id})
    return {"deleted": True, "id": child_id, "soft": spec.soft_delete}


async def reorder_children(db, current, event_id: str, collection: str,
                           ordered_ids: List[str]) -> Dict[str, Any]:
    await rbac.authorize_event(db, event_id, current, _write_perm(collection))
    spec = _spec(collection)
    if not spec.orderable:
        raise HTTPException(409, "This collection is not orderable")
    n = 0
    for i, cid in enumerate(ordered_ids or []):
        row = await getattr(db, spec.collection).find_one({"id": cid, "event_id": event_id})
        if row and not (spec.soft_delete and row.get("deleted_at")):
            await getattr(db, spec.collection).update_one(
                {"id": cid, "event_id": event_id},
                {"$set": {"display_order": i, "updated_at": _now()}})
            n += 1
    await _audit(db, event_id, current, "reorder", collection, after={"count": n})
    return {"reordered": n}


async def act_on_child(db, current, event_id: str, collection: str, child_id: str,
                       action: str) -> Dict[str, Any]:
    # expense approve/reject needs the approval permission specifically (Spec 10)
    perm = rbac.P_FIN_EXPENSE_APPROVE if collection == "expenses" else _write_perm(collection)
    await rbac.authorize_event(db, event_id, current, perm)
    spec = _spec(collection)
    transition = spec.actions.get(action)
    if transition is None:
        raise HTTPException(404, f"Unknown action '{action}'")
    await _load_child(db, spec, event_id, child_id)
    patch = {**transition, "updated_at": _now()}
    if action in ("mark_received",):
        patch["paid_at"] = _now()
    await getattr(db, spec.collection).update_one(
        {"id": child_id, "event_id": event_id}, {"$set": patch})
    await _audit(db, event_id, current, action, collection, after={"id": child_id})
    return {"id": child_id, "action": action, **transition}


# --------------------------------------------------------------------------- #
# router — one generic surface for every child collection (Doc 05 §10-17)
# --------------------------------------------------------------------------- #
def build_event_children_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-children"])

    async def _gate() -> None:
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    # distinct prefix so it never collides with /api/events/{event_id}/{collection}
    @router.get("/api/event-meta/child-collections")
    async def _meta():
        await _gate()
        return collections_meta()

    @router.get("/api/events/{event_id}/{collection}")
    async def _list(event_id: str, collection: str, page: int = 1, limit: int = 50,
                    sort: Optional[str] = None, order: str = "asc", search: str = "",
                    current=Depends(get_current_buyer)):
        await _gate()
        return await list_children(db, current, event_id, collection,
                                   page=page, limit=limit, sort=sort, order=order, search=search)

    @router.post("/api/events/{event_id}/{collection}")
    async def _create(event_id: str, collection: str, body: Dict[str, Any] = Body(...),
                      current=Depends(get_current_buyer)):
        await _gate()
        return await create_child(db, current, event_id, collection, body)

    @router.post("/api/events/{event_id}/{collection}/reorder")
    async def _reorder(event_id: str, collection: str, body: Dict[str, Any] = Body(...),
                       current=Depends(get_current_buyer)):
        await _gate()
        return await reorder_children(db, current, event_id, collection,
                                      body.get("ordered_ids") or body.get("ids") or [])

    @router.get("/api/events/{event_id}/{collection}/{child_id}")
    async def _get(event_id: str, collection: str, child_id: str,
                   current=Depends(get_current_buyer)):
        await _gate()
        return await get_child(db, current, event_id, collection, child_id)

    @router.patch("/api/events/{event_id}/{collection}/{child_id}")
    async def _update(event_id: str, collection: str, child_id: str,
                      body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        return await update_child(db, current, event_id, collection, child_id, body)

    @router.delete("/api/events/{event_id}/{collection}/{child_id}")
    async def _delete(event_id: str, collection: str, child_id: str,
                      current=Depends(get_current_buyer)):
        await _gate()
        return await delete_child(db, current, event_id, collection, child_id)

    @router.post("/api/events/{event_id}/{collection}/{child_id}/{action}")
    async def _action(event_id: str, collection: str, child_id: str, action: str,
                      current=Depends(get_current_buyer)):
        await _gate()
        return await act_on_child(db, current, event_id, collection, child_id, action)

    return router
