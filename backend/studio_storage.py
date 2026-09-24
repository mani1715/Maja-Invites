"""
MAJA Invites — Studio Backup Storage (NEW FEATURE — June 2026)
===============================================================
Lets photographers store their studio photos/videos as a backup even
after their physical drives/cards are lost.

Flow (per the product owner brief)
----------------------------------
1. Super admin defines storage plans from the admin panel:
       { name, gb_limit, duration_days, grace_days, price_inr, is_active }
   Example plans:
       • 10 GB / 1 month  → ₹ X
       • 100 GB / 3 months → ₹ Y
       • 1 TB / 6 months  → ₹ Z
2. Photographer logs in → Dashboard → "Store my photos"
3. Photographer picks a plan → Razorpay payment → on success a
   StudioStorageSubscription document is created with:
       • starts_at = now
       • expires_at = starts_at + duration_days
       • purge_at  = expires_at + grace_days
       • status    = "active"
4. During [starts_at, expires_at] photographer can upload/download/delete files.
5. During [expires_at, purge_at] (the grace window):
       • Status flips to "grace" automatically (computed on read).
       • Uploads are rejected with 402 — pay to extend.
       • Downloads/listing still work so the photographer can grab their
         files before purge.
       • Renewing extends expires_at by another duration_days.
6. After purge_at: status = "expired", all S3 files purged, used_bytes = 0.

API surface
-----------
Super admin (require `super_admin` role):
    GET    /api/super-admin/studio-storage/plans
    POST   /api/super-admin/studio-storage/plans
    PUT    /api/super-admin/studio-storage/plans/{plan_id}
    DELETE /api/super-admin/studio-storage/plans/{plan_id}
    GET    /api/super-admin/studio-storage/subscriptions       (overview)

Photographer (require legacy admin JWT):
    GET    /api/admin/studio-storage/plans                     (active plans only)
    GET    /api/admin/studio-storage/my-plan                   (subscription + usage)
    POST   /api/admin/studio-storage/subscribe                 (create Razorpay order)
    POST   /api/admin/studio-storage/verify-payment            (verify + activate / renew)
    POST   /api/admin/studio-storage/upload                    (multipart upload)
    GET    /api/admin/studio-storage/files                     (list)
    DELETE /api/admin/studio-storage/files/{file_id}

Storage layout in S3:
    studio/{admin_id}/{file_id}{ext}

NOTE
----
- This module is self-contained: it exposes a `router` that server.py
  mounts. It does NOT depend on any helper that isn't already imported
  elsewhere in the codebase (uses `aws_service.s3 / bucket / upload_bytes
  / delete_prefix / generate_signed_url`).
- Subscription state derivation (active / grace / expired) is computed
  on every read so we don't need a cron job to flip flags. Actual S3
  purge of expired subscriptions is handled by the `purge_expired()`
  helper which can be called from any existing scheduled-task entry
  point (or on first access after purge_at).
"""

from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Form
from pydantic import BaseModel, Field, model_validator

import razorpay
import pricing_catalog
from aws_service import s3, bucket, upload_bytes, delete_prefix
# Media URLs now resolve through storage_serve.media_url: same signed,
# expiring contract as the old S3/CloudFront URL, but the bytes come from
# the Drive pool once a file is mirrored. Swapping here rather than at each
# call site keeps the guest-privacy model identical.
from storage_serve import media_url as generate_signed_url  # noqa: E402
from auth import get_current_admin_with_role, require_super_admin

logger = logging.getLogger("studio_storage")
router = APIRouter()

_db = None
_razorpay_client = None

def init(database=None, razorpay_client=None):
    global _db, _razorpay_client
    if database is not None:
        _db = database
    if razorpay_client is not None:
        _razorpay_client = razorpay_client


# ============================================================
# Defaults — used to seed a brand-new install with sensible plans
# the super admin can later edit/delete from the UI.
# ============================================================
# Storage catalogue v3 (2026 pricing redesign, docs/PRICING_REDESIGN_2026.md §4).
# pricing_catalog.py is now the source of truth for the numbers:
#   - 50 GB and 1 TB are owner-approved anchors. Cycle prices come straight
#     from pricing_catalog.STORAGE_TIERS (computed via compute_cycle_breakdown)
#     and there is NO founding discount on them — price_founding_inr=None means
#     `_plan_price_for` always returns price_inr, founders included.
#   - 100/250/500 GB are carried VERBATIM from the v2 catalog below (§9 item 1:
#     awaiting an owner re-price) — do not recompute them, they would not match
#     what is actually selling today.
#   - There is deliberately NO 750 GB tier.
# Every plan carries `approved`: True for the two owner anchors, False for the
# three carried-over tiers, so the admin UI / public pricing page can show
# which prices are still provisional.
#
# Bump CATALOG_VERSION when these change; _ensure_default_plans retires the old
# seeded rows and installs the new ones (see there for why it deactivates rather
# than deletes).
CATALOG_VERSION = 3
FOUNDING_SLOTS = 100

_DURATION_LABELS = [(30, "Monthly"), (90, "3 Months"), (180, "6 Months"), (365, "Yearly")]
_STORAGE_TIER_LABEL = {t["gb"]: t["label"] for t in pricing_catalog.STORAGE_TIERS}
# gb -> {"30": inr, "90": inr, ...} for the two owner-approved anchors, straight
# from the catalog — never hand-recomputed here.
_ANCHOR_CYCLE_PRICES = {t["gb"]: t["cycle_prices_inr"]
                        for t in pricing_catalog.STORAGE_TIERS if t["approved"]}

# Carried v2 founding+regular pairs for the un-repriced middle tiers (frozen —
# these predate pricing_catalog.py and are NOT derived from it; §9 item 1).
_CARRIED_PAIRS = {
    30:  {100: (199, 299),    250: (399, 599),   500: (699, 999)},
    90:  {100: (549, 799),    250: (1099, 1599), 500: (1999, 2799)},
    180: {100: (999, 1499),   250: (1999, 2999), 500: (3699, 5299)},
    365: {100: (1999, 2999),  250: (3999, 5499), 500: (6999, 8999)},
}

DEFAULT_PLANS: List[Dict[str, Any]] = []
for _days, _period in _DURATION_LABELS:
    for _gb in (50, 100, 250, 500, 1024):
        _base = {"name": f"{_STORAGE_TIER_LABEL[_gb]} - {_period}", "gb_limit": _gb,
                 "duration_days": _days, "grace_days": 30, "is_active": True}
        if _gb in _ANCHOR_CYCLE_PRICES:
            DEFAULT_PLANS.append({
                **_base,
                "price_inr": _ANCHOR_CYCLE_PRICES[_gb][str(_days)],
                # No founding discount on the approved anchors — everyone,
                # founders included, pays price_inr.
                "price_founding_inr": None,
                "approved": True,
            })
        else:
            _founding, _regular = _CARRIED_PAIRS[_days][_gb]
            DEFAULT_PLANS.append({
                **_base, "price_inr": _regular, "price_founding_inr": _founding,
                "approved": False,
            })
del _days, _period, _gb, _base


# ============================================================
# Pydantic schemas
# ============================================================
class StoragePlanIn(BaseModel):
    name: str
    gb_limit: int = Field(..., gt=0, le=1024 * 100)        # max 100 TB
    duration_days: int = Field(..., gt=0, le=3650)         # max 10 years
    grace_days: int = Field(0, ge=0, le=365)
    price_inr: int = Field(..., ge=0, le=10_000_000)       # rupees - regular
    # Founding price for the first FOUNDING_SLOTS studios. None = no founding
    # rate on this plan, so everyone pays price_inr.
    price_founding_inr: Optional[int] = Field(None, ge=0, le=10_000_000)
    is_active: bool = True


class StoragePlanOut(StoragePlanIn):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SubscribeRequest(BaseModel):
    plan_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str


# ============================================================
# Internal helpers
# ============================================================
def _now() -> datetime:
    return datetime.utcnow()


def _strip_id(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


def _file_key(admin_id: str, file_id: str, ext: str) -> str:
    safe_ext = (ext or "").lstrip(".").lower()
    if safe_ext:
        return f"studio/{admin_id}/{file_id}.{safe_ext}"
    return f"studio/{admin_id}/{file_id}"


async def _ensure_default_plans(db) -> None:
    """Install the seeded catalogue, and refresh it when CATALOG_VERSION moves.

    Old seeded plans are DEACTIVATED, never deleted: live subscriptions store a
    plan_id and look the plan up to render the customer's capacity and renewal
    date, so removing the row would break every existing subscriber's dashboard.
    Deactivating hides it from the buy screen while keeping it resolvable.

    Plans the admin created by hand (no `seeded` flag) are never touched.
    """
    marker = await db.app_settings.find_one({"id": "studio_storage_catalog"}) or {}
    installed = int(marker.get("version") or 0)
    count = await db.studio_storage_plans.count_documents({})

    if count > 0 and installed >= CATALOG_VERSION:
        return

    now = _now()
    if count > 0:
        # Retire the previous seeded generation. The very first migration also
        # has to catch the original four, which predate the `seeded` flag.
        await db.studio_storage_plans.update_many(
            {"seeded": True}, {"$set": {"is_active": False, "updated_at": now}})
        await db.studio_storage_plans.update_many(
            {"name": {"$in": ["Starter", "Pro", "Premium", "Advanced"]}},
            {"$set": {"is_active": False, "updated_at": now}})

    docs = [{
        "id": f"plan_{uuid.uuid4().hex[:10]}",
        **p,
        "seeded": True,
        "catalog_version": CATALOG_VERSION,
        "created_at": now,
        "updated_at": now,
    } for p in DEFAULT_PLANS]
    if docs:
        await db.studio_storage_plans.insert_many(docs)
    await db.app_settings.update_one(
        {"id": "studio_storage_catalog"},
        {"$set": {"id": "studio_storage_catalog", "version": CATALOG_VERSION,
                  "updated_at": now}},
        upsert=True)


# ============================================================
# Founding pricing - first FOUNDING_SLOTS studios, kept for life
# ============================================================
async def _founding_taken(db) -> int:
    """How many studios hold a founding rate."""
    try:
        return await db.studio_storage_founders.count_documents({})
    except Exception:
        return 0


async def _is_founder(db, admin_id: str) -> bool:
    if not admin_id:
        return False
    return bool(await db.studio_storage_founders.find_one({"admin_id": admin_id}))


async def _founding_available_for(db, admin_id: str) -> bool:
    """Already a founder -> always. Otherwise only while slots remain."""
    if await _is_founder(db, admin_id):
        return True
    return await _founding_taken(db) < FOUNDING_SLOTS


async def _claim_founder(db, admin_id: str) -> None:
    """Record the studio as a founder. Idempotent, so a renewal cannot consume
    a second slot."""
    if not admin_id or await _is_founder(db, admin_id):
        return
    if await _founding_taken(db) >= FOUNDING_SLOTS:
        return
    await db.studio_storage_founders.insert_one({
        "id": f"fnd_{uuid.uuid4().hex[:10]}",
        "admin_id": admin_id,
        "created_at": _now(),
    })


def _plan_price_for(plan: Dict[str, Any], founding: bool) -> int:
    """The rupee price this studio actually pays for this plan."""
    if founding and plan.get("price_founding_inr") is not None:
        return int(plan["price_founding_inr"])
    return int(plan["price_inr"])


# ============================================================
# Global feature toggle (super admin can globally disable storage)
# ============================================================
_FEATURE_KEY = "studio_storage_enabled"


async def _feature_enabled(db) -> bool:
    """Returns True if the studio-storage feature is globally enabled.
    Defaults to True when the setting doc is absent."""
    if db is None:
        return True
    doc = await db.app_settings.find_one({"key": _FEATURE_KEY})
    if not doc:
        return True
    return bool(doc.get("value", True))


def _require_enabled_dep():
    """FastAPI dependency that aborts with 403 when feature is disabled."""
    async def _dep():
        if not await _feature_enabled(_db):
            raise HTTPException(
                status_code=403,
                detail="Studio storage feature is currently disabled by the administrator.",
            )
        return True
    return _dep


def _derive_status(sub: Dict[str, Any], now: datetime) -> str:
    """Compute the live status based on timestamps."""
    if not sub:
        return "none"
    if sub.get("status") == "expired":
        return "expired"
    expires_at = sub.get("expires_at")
    purge_at = sub.get("purge_at")
    if expires_at and now < expires_at:
        return "active"
    if purge_at and now < purge_at:
        return "grace"
    return "expired"


async def _get_admin_sub(db, admin_id: str) -> Optional[Dict[str, Any]]:
    """Return the most recently created subscription for this admin."""
    sub = await db.studio_storage_subscriptions.find_one(
        {"admin_id": admin_id},
        sort=[("created_at", -1)],
    )
    return _strip_id(sub)


async def _settle_storage_order(db, order_id: str, payment_id: str,
                                *, via: str) -> Optional[Dict[str, Any]]:
    """Grant or renew the storage subscription for a captured payment.

    Shared by the browser /verify-payment callback and the /studio-storage/webhook
    below, so a photographer whose browser dies right after paying still gets
    their subscription created/extended — Razorpay already took the money
    either way. Idempotent: `event_payments.mark_paid` CASes the order
    created -> paid exactly once, so only the first caller of {verify, webhook}
    to win that race applies the renewal; the other gets back the same
    subscription with `already: True` and does not double-extend it.

    Returns None when `order_id` isn't a studio_storage order (a webhook event
    for a different payment kind sharing the same gateway) or its plan has
    since been removed.

    Grandfathered renewals (§9 item 6): the order's notes carry whatever
    plan_id /subscribe resolved to, which for a renewal of a deactivated plan
    is the studio's OLD plan row (see subscribe() above) — this function just
    looks that row up by id (no is_active filter) and extends the existing
    subscription onto it, so a grandfathered renewal keeps the OLD plan_id and
    never gets silently repointed to the new catalog's plan for that capacity.
    """
    import event_payments as pay
    order = await pay.get_order(db, order_id)
    if not order or order.get("kind") != "studio_storage":
        return None
    notes = order.get("notes") or {}
    admin_id = str(notes.get("admin_id") or "")
    plan_id = str(notes.get("plan_id") or "")
    if not admin_id or not plan_id:
        return None
    plan = await db.studio_storage_plans.find_one({"id": plan_id})
    if not plan:
        return None

    first = await pay.mark_paid(db, order_id, payment_id, via=via)
    if not first:
        sub = await _get_admin_sub(db, admin_id)
        return {"renewed": bool(sub), "subscription": sub, "already": True}

    # Signature already verified by the caller, so this is a genuine payment:
    # lock in the founding rate for this studio. Idempotent, so renewals never
    # burn a second slot, and a studio that is already a founder simply stays one.
    if await _founding_available_for(db, admin_id):
        await _claim_founder(db, admin_id)
    now = _now()
    existing = await _get_admin_sub(db, admin_id)
    duration = timedelta(days=int(plan["duration_days"]))
    grace = timedelta(days=int(plan.get("grace_days", 0)))

    if existing and _derive_status(existing, now) in ("active", "grace"):
        # Renewal: extend from current expires_at (or now if grace)
        base = existing["expires_at"] if existing.get("expires_at", now) > now else now
        new_expires = base + duration
        new_purge = new_expires + grace
        await db.studio_storage_subscriptions.update_one(
            {"id": existing["id"]},
            {"$set": {
                "plan_id": plan["id"],
                "expires_at": new_expires,
                "purge_at": new_purge,
                "status": "active",
                "updated_at": now,
                "last_razorpay_order_id": order_id,
                "last_razorpay_payment_id": payment_id,
            }},
        )
        sub = await db.studio_storage_subscriptions.find_one({"id": existing["id"]})
        result = {"renewed": True, "subscription": _strip_id(sub)}
    else:
        starts_at = now
        expires_at = starts_at + duration
        purge_at = expires_at + grace
        doc = {
            "id": f"sub_{uuid.uuid4().hex[:10]}",
            "admin_id": admin_id,
            "plan_id": plan["id"],
            "starts_at": starts_at,
            "expires_at": expires_at,
            "purge_at": purge_at,
            "status": "active",
            "used_bytes": 0,
            "created_at": now,
            "updated_at": now,
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
        }
        await db.studio_storage_subscriptions.insert_one(doc)
        result = {"renewed": False, "subscription": _strip_id(doc)}

    # Buying Cloud Storage reserves the studio's storage folder, so the owner
    # sees its name + the mail it lives on when they open this photographer in
    # the admin panel. Idempotent; a failure here must not undo a paid plan.
    try:
        from studio_folders import ensure_studio_folder
        await ensure_studio_folder(db, admin_id, "cloud_storage")
    except Exception:
        logger.warning("studio storage folder reserve failed for %s", admin_id, exc_info=True)

    return result


# ============================================================
# Auth dependencies
# ============================================================
# `get_current_admin_with_role` returns {'admin_id', 'role'} which is exactly
# the dict shape every route in this file consumes. `require_super_admin`
# already enforces the role check at the framework boundary and returns an
# admin_id string — we wrap it so the downstream code can keep using
# admin["admin_id"] uniformly.
async def current_admin_dep(
    admin_data: Dict[str, Any] = Depends(get_current_admin_with_role),
) -> Dict[str, Any]:
    return admin_data


async def current_super_admin_dep(
    admin_id: str = Depends(require_super_admin),
) -> Dict[str, Any]:
    return {"admin_id": admin_id, "role": "super_admin"}


def init(database, razorpay_client):
    """Bind shared dependencies. Called once from server.py during startup."""
    global _db, _razorpay_client
    _db = database
    _razorpay_client = razorpay_client


# Injected by server.py at startup
_db = None
_razorpay_client: Optional[razorpay.Client] = None


# ============================================================
# Super admin — plan CRUD
# ============================================================
@router.get("/super-admin/studio-storage/plans")
async def list_plans_admin(_admin: Dict[str, Any] = Depends(current_super_admin_dep)):
    await _ensure_default_plans(_db)
    cursor = _db.studio_storage_plans.find({}).sort("price_inr", 1)
    out = []
    async for doc in cursor:
        out.append(_strip_id(doc))
    return {"items": out}


@router.post("/super-admin/studio-storage/plans", response_model=StoragePlanOut)
async def create_plan(plan: StoragePlanIn,
                      _admin: Dict[str, Any] = Depends(current_super_admin_dep)):
    doc = plan.dict()
    doc["id"] = f"plan_{uuid.uuid4().hex[:10]}"
    doc["created_at"] = _now()
    doc["updated_at"] = doc["created_at"]
    await _db.studio_storage_plans.insert_one(doc)
    return _strip_id(doc)


@router.put("/super-admin/studio-storage/plans/{plan_id}", response_model=StoragePlanOut)
async def update_plan(plan_id: str, plan: StoragePlanIn,
                      _admin: Dict[str, Any] = Depends(current_super_admin_dep)):
    doc = plan.dict()
    doc["updated_at"] = _now()
    res = await _db.studio_storage_plans.find_one_and_update(
        {"id": plan_id},
        {"$set": doc},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _strip_id(res)


@router.delete("/super-admin/studio-storage/plans/{plan_id}")
async def delete_plan(plan_id: str,
                      _admin: Dict[str, Any] = Depends(current_super_admin_dep)):
    res = await _db.studio_storage_plans.delete_one({"id": plan_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"deleted": True}


@router.get("/super-admin/studio-storage/subscriptions")
async def list_subscriptions_admin(
    _admin: Dict[str, Any] = Depends(current_super_admin_dep)
):
    """Quick overview of every photographer's subscription + storage usage."""
    now = _now()
    cursor = _db.studio_storage_subscriptions.find({}).sort("created_at", -1)
    items = []
    async for sub in cursor:
        sub = _strip_id(sub)
        sub["status"] = _derive_status(sub, now)
        items.append(sub)
    return {"items": items}


# ============================================================
# Photographer — plans + subscription
# ============================================================
@router.get("/admin/studio-storage/plans")
async def list_plans_photographer(_admin: Dict[str, Any] = Depends(current_admin_dep)):
    if not await _feature_enabled(_db):
        raise HTTPException(status_code=403, detail="Studio storage feature is currently disabled by the administrator.")
    await _ensure_default_plans(_db)
    admin_id = _admin.get("admin_id") or _admin.get("id")
    founding = await _founding_available_for(_db, admin_id)
    taken = await _founding_taken(_db)

    cursor = _db.studio_storage_plans.find({"is_active": True}).sort("price_inr", 1)
    out = []
    async for doc in cursor:
        doc = _strip_id(doc)
        # `effective_price_inr` is what this studio is actually charged, so the
        # UI never has to re-implement the founding rule (and cannot get it
        # wrong in a way the order endpoint would then contradict).
        doc["effective_price_inr"] = _plan_price_for(doc, founding)
        doc["is_founding_price"] = doc["effective_price_inr"] != int(doc["price_inr"])
        out.append(doc)

    # Renewal grandfathering (docs/PRICING_REDESIGN_2026.md §9 item 6, owner
    # directive: never silently re-price an existing subscriber's renewal).
    # When this studio's own current subscription sits on a plan that has since
    # been deactivated (e.g. the old 50GB/1TB v2 rows), surface it separately
    # so the UI can offer a "renew at your current price" card. It never
    # appears for anyone else, and it never shows up in `items` (upgrades are
    # a deliberate new purchase at current prices, not this path).
    grandfathered = None
    current_sub = await _get_admin_sub(_db, admin_id)
    if current_sub:
        gplan = await _db.studio_storage_plans.find_one({"id": current_sub.get("plan_id")})
        if gplan and not gplan.get("is_active", True):
            gplan = _strip_id(gplan)
            gplan["effective_price_inr"] = _plan_price_for(gplan, founding)
            gplan["is_founding_price"] = gplan["effective_price_inr"] != int(gplan["price_inr"])
            gplan["grandfathered"] = True
            grandfathered = gplan

    return {
        "items": out,
        "grandfathered": grandfathered,
        "founding": {
            "eligible": founding,
            "slots_total": FOUNDING_SLOTS,
            "slots_taken": min(taken, FOUNDING_SLOTS),
            "slots_left": max(0, FOUNDING_SLOTS - taken),
            "already_founder": await _is_founder(_db, admin_id),
        },
    }


@router.get("/admin/studio-storage/my-plan")
async def get_my_plan(admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    sub = await _get_admin_sub(_db, admin_id)
    if not sub:
        return {"subscription": None, "plan": None, "usage": None}

    now = _now()
    status = _derive_status(sub, now)
    sub["status"] = status

    # Auto-purge if past purge_at
    if status == "expired" and sub.get("used_bytes", 0) > 0:
        try:
            delete_prefix(f"studio/{admin_id}/")
        except Exception as e:
            logger.warning("S3 purge failed for %s: %s", admin_id, e)
        await _db.studio_storage_files.delete_many({"admin_id": admin_id})
        await _db.studio_storage_subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {"status": "expired", "used_bytes": 0,
                      "purged_at": now}},
        )
        sub["used_bytes"] = 0

    plan = await _db.studio_storage_plans.find_one({"id": sub.get("plan_id")})
    plan = _strip_id(plan)
    used = sub.get("used_bytes", 0) or 0
    cap = (plan or {}).get("gb_limit", 0) * 1024 * 1024 * 1024
    return {
        "subscription": sub,
        "plan": plan,
        "usage": {
            "used_bytes": used,
            "cap_bytes": cap,
            "percent": round((used / cap) * 100, 1) if cap else 0,
        },
    }


@router.post("/admin/studio-storage/subscribe")
async def subscribe(req: SubscribeRequest,
                    admin: Dict[str, Any] = Depends(current_admin_dep)):
    """Create a Razorpay order for the chosen plan. Activation happens on verify
    (or, if the browser dies before that, on the /studio-storage/webhook below)."""
    if not await _feature_enabled(_db):
        raise HTTPException(status_code=403, detail="Studio storage feature is currently disabled by the administrator.")

    import event_payments as pay
    if not pay.configured():
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    admin_id_for_price = admin.get("admin_id") or admin.get("id")
    plan = await _db.studio_storage_plans.find_one({"id": req.plan_id, "is_active": True})
    if not plan:
        # Renewal-only grandfathering (docs/PRICING_REDESIGN_2026.md §9 item 6,
        # owner directive: "Do not silently change an existing subscriber's
        # contractual renewal price"). An inactive plan_id is still purchasable
        # ONLY when it is the requesting studio's own current subscription's
        # plan_id — that is a renewal at the contractual price, not a new sale.
        # Any other studio, or any other inactive plan_id, stays 404: upgrades
        # are a deliberate new purchase at current prices, never grandfathered.
        current_sub = await _get_admin_sub(_db, admin_id_for_price)
        if current_sub and current_sub.get("plan_id") == req.plan_id:
            plan = await _db.studio_storage_plans.find_one({"id": req.plan_id})
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found or inactive")

    # Server decides the price. The client never sends an amount, so a tampered
    # request cannot buy a founding rate once the slots are gone. For a
    # grandfathered renewal `plan` is the studio's OLD plan row, so this is
    # exactly what they were already paying (including their locked founding
    # rate, if any) — never the new catalog's price for that capacity.
    founding = await _founding_available_for(_db, admin_id_for_price)
    amount_inr = _plan_price_for(plan, founding)

    # Routed through event_payments.create_order (the platform's one Razorpay
    # order-tracking surface) so the order is persisted as "created" BEFORE
    # payment — the webhook below needs a pending row to look up by order_id,
    # which this endpoint previously never wrote anywhere.
    try:
        order = await pay.create_order(
            _db, amount_inr=amount_inr, receipt=f"ss_{admin_id_for_price}"[:40],
            notes={"plan_id": plan["id"], "admin_id": admin_id_for_price or "",
                   "type": "studio_storage"},
            kind="studio_storage", event_id=admin_id_for_price or "")
    except pay.PaymentUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Could not create payment order: {e}")

    return {
        "order_id": order["order_id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": order["key_id"],
        "plan": _strip_id(plan),
    }


@router.post("/admin/studio-storage/verify-payment")
async def verify_payment(req: VerifyPaymentRequest,
                         admin: Dict[str, Any] = Depends(current_admin_dep)):
    """Verify Razorpay signature → create or renew subscription."""
    if not await _feature_enabled(_db):
        raise HTTPException(status_code=403, detail="Studio storage feature is currently disabled by the administrator.")

    import event_payments as pay
    if not pay.configured():
        raise HTTPException(status_code=503, detail="Payment gateway not configured")

    admin_id = admin.get("admin_id") or admin.get("id")
    order = await pay.get_order(_db, req.razorpay_order_id)
    if not order or order.get("kind") != "studio_storage":
        raise HTTPException(status_code=404, detail="Order not found")
    if str((order.get("notes") or {}).get("admin_id") or "") != str(admin_id or ""):
        raise HTTPException(status_code=403, detail="Not your order")

    # Local HMAC check (same algorithm Razorpay documents) — a missing secret or
    # gateway outage must never be reported to a photographer as "payment failed".
    try:
        ok = pay.verify_signature(req.razorpay_order_id, req.razorpay_payment_id, req.razorpay_signature)
    except pay.PaymentUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    result = await _settle_storage_order(_db, req.razorpay_order_id, req.razorpay_payment_id, via="checkout")
    if result is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return result


# ---- webhook fallback (photographer closes the tab after paying) ----------
# /verify-payment above only fires from the browser. If the tab dies mid-flow
# the payment is captured but no subscription is ever created/renewed — money
# taken, storage plan invisible. Razorpay retries this endpoint until it gets
# a 2xx, so the subscription settles regardless of what the browser did.
@router.post("/studio-storage/webhook")
async def storage_webhook(request: Request):
    import event_payments as pay
    raw = await request.body()
    sig = request.headers.get("x-razorpay-signature", "")
    try:
        ok = pay.verify_webhook(raw, sig)
    except pay.PaymentUnavailable as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    import json
    try:
        payload = json.loads(raw or b"{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed webhook body.")

    info = pay.webhook_payment(payload)
    if info["event"] not in ("payment.captured", "order.paid") or not info["order_id"]:
        return {"received": True}
    result = await _settle_storage_order(_db, info["order_id"], info["payment_id"], via="webhook")
    return {"received": True, "settled": result is not None}


# ============================================================
# Photographer — file ops
# ============================================================
ALLOWED_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "application/zip", "application/x-zip-compressed",
}
MAX_SINGLE_UPLOAD = 500 * 1024 * 1024     # 500 MB per file


@router.post("/admin/studio-storage/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    admin: Dict[str, Any] = Depends(current_admin_dep),
):
    """DEPRECATED: Legacy server-mediated upload route. Active frontend uses presigned direct S3 upload."""
    if not await _feature_enabled(_db):
        raise HTTPException(status_code=403, detail="Studio storage feature is currently disabled by the administrator.")
    admin_id = admin.get("admin_id") or admin.get("id")

    if folder_id:
        fdoc = await _db.studio_storage_folders.find_one({"id": folder_id, "admin_id": admin_id, "is_trashed": {"$ne": True}})
        if not fdoc:
            raise HTTPException(status_code=404, detail="Target folder not found or access denied")

    sub = await _get_admin_sub(_db, admin_id)
    if not sub:
        raise HTTPException(status_code=402, detail="No active studio storage subscription")
    now = _now()
    status = _derive_status(sub, now)
    if status != "active":
        # Uploads are blocked during grace and once expired.
        raise HTTPException(
            status_code=402,
            detail=f"Subscription is {status}. Renew to upload more files.",
        )

    plan = await _db.studio_storage_plans.find_one({"id": sub["plan_id"]})
    cap_bytes = int(plan["gb_limit"]) * 1024 * 1024 * 1024

    if file.content_type not in ALLOWED_TYPES and not (file.filename or "").lower().endswith(
        (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".mov", ".avi", ".zip")
    ):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")

    # Read file (streamed) and enforce per-file + cumulative cap
    data = await file.read()
    size = len(data)
    if size > MAX_SINGLE_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large (max 500 MB per upload)")
    used_after = (sub.get("used_bytes", 0) or 0) + size
    if used_after > cap_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Storage cap reached. {used_after / 1e9:.1f} GB requested, {cap_bytes / 1e9:.0f} GB cap.",
        )

    # Perform binary magic byte validation
    from storage_upload import validate_file_content, sanitize_filename
    valid_content, val_err = validate_file_content(data[:8192], file.content_type or "application/octet-stream")
    if not valid_content:
        raise HTTPException(status_code=415, detail=f"File content validation failed: {val_err}")

    file_id = f"sf_{uuid.uuid4().hex[:14]}"
    clean_name = sanitize_filename(file.filename or "upload")
    ext = os.path.splitext(clean_name)[1]
    key = _file_key(admin_id, file_id, ext)

    try:
        # PERF: a blocking S3 PUT of a whole file on the event loop stalls every
        # other request for the duration of the transfer. Off to a thread.
        import asyncio as _asyncio
        await _asyncio.to_thread(
            upload_bytes, key, data, file.content_type or "application/octet-stream",
            tags={"kind": "studio-backup", "admin_id": admin_id})
    except Exception as e:
        logger.exception("S3 upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Storage upload failed")

    file_doc = {
        "id": file_id,
        "admin_id": admin_id,
        "subscription_id": sub["id"],
        "name": clean_name,
        "size_bytes": size,
        "content_type": file.content_type or "application/octet-stream",
        "s3_key": key,
        "folder": folder_id,
        "uploaded_at": now,
        "is_trashed": False,
    }
    await _db.studio_storage_files.insert_one(file_doc)
    await _db.studio_storage_subscriptions.update_one(
        {"id": sub["id"]},
        {"$inc": {"used_bytes": size}, "$set": {"updated_at": now}},
    )

    # Storage pool (V1 multi-drive): archive into .../Cloud_Storage/.
    # Fire-and-forget + flag-gated — can never fail the paid upload.
    try:
        from storage_pool_hooks import mirror_upload
        mirror_upload(_db, photographer_id=admin_id, area="cloud_storage",
                      filename=name, data=data,
                      content_type=file.content_type or "application/octet-stream",
                      source_ref={"kind": "s3", "key": key})
    except Exception:
        pass

    return {"file": _strip_id(file_doc), "new_used_bytes": used_after}


async def storage_capacity_status(db, admin_id: str, incoming_bytes: int = 0) -> Dict[str, Any]:
    """Non-mutating snapshot of a studio's paid storage: whether they have an
    active plan and how much room is left. Used to decide + message before a
    QR/gallery upload asks to store into storage."""
    out = {"has_plan": False, "active": False, "used_bytes": 0, "cap_bytes": 0,
           "remaining_bytes": 0, "would_exceed": False}
    try:
        if not admin_id or not await _feature_enabled(db):
            return out
        sub = await _get_admin_sub(db, admin_id)
        if not sub:
            return out
        out["has_plan"] = True
        if _derive_status(sub, _now()) != "active":
            return out
        plan = await db.studio_storage_plans.find_one({"id": sub["plan_id"]})
        if not plan:
            return out
        cap = int(plan["gb_limit"]) * 1024 * 1024 * 1024
        used = sub.get("used_bytes", 0) or 0
        out.update({"active": True, "used_bytes": used, "cap_bytes": cap,
                    "remaining_bytes": max(0, cap - used),
                    "would_exceed": (used + max(0, incoming_bytes)) > cap})
    except Exception as e:
        logger.warning("storage_capacity_status failed: %s", e)
    return out


async def auto_archive_to_studio_storage(
    db, admin_id: str, name: str, content_type: str, data: bytes, folder: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Best-effort copy of an uploaded photo into the photographer's PAID studio
    storage (S3), so a studio that pays for storage never has to re-upload the
    same shots. Silent no-op (returns None) when the feature is off, there is no
    active subscription, or the storage cap is reached — auto-archive must never
    raise or block the originating gallery upload. Intended to be fired in the
    background (asyncio.create_task)."""
    try:
        if not admin_id or not data:
            return None
        if not await _feature_enabled(db):
            return None
        sub = await _get_admin_sub(db, admin_id)
        if not sub:
            return None
        now = _now()
        if _derive_status(sub, now) != "active":
            return None
        plan = await db.studio_storage_plans.find_one({"id": sub["plan_id"]})
        if not plan:
            return None
        cap_bytes = int(plan["gb_limit"]) * 1024 * 1024 * 1024
        size = len(data)
        if size <= 0 or size > MAX_SINGLE_UPLOAD:
            return None
        used_after = (sub.get("used_bytes", 0) or 0) + size
        if used_after > cap_bytes:
            return None  # cap reached — skip silently, never block the upload

        file_id = f"sf_{uuid.uuid4().hex[:14]}"
        ext = os.path.splitext(name or "upload")[1]
        key = _file_key(admin_id, file_id, ext)
        # Same reason as the interactive upload above: never block the loop on S3.
        # This one runs inside the gallery bulk mirror, so it would have serialised
        # every archived photo behind the previous one's transfer.
        import asyncio as _asyncio
        await _asyncio.to_thread(
            upload_bytes, key, data, content_type or "application/octet-stream",
            tags={"kind": "studio-backup-auto", "admin_id": admin_id})
        file_doc = {
            "id": file_id,
            "admin_id": admin_id,
            "subscription_id": sub["id"],
            "name": name or "upload",
            "size_bytes": size,
            "content_type": content_type or "application/octet-stream",
            "s3_key": key,
            "uploaded_at": now,
            "auto": True,
            "folder": folder or None,
        }
        await db.studio_storage_files.insert_one(file_doc)
        await db.studio_storage_subscriptions.update_one(
            {"id": sub["id"]},
            {"$inc": {"used_bytes": size}, "$set": {"updated_at": now}},
        )
        return file_doc
    except Exception as e:
        logger.warning("auto_archive_to_studio_storage failed (ignored): %s", e)
        return None


@router.get("/admin/studio-storage/files")
async def list_files(
    limit: int = 100,
    offset: int = 0,
    admin: Dict[str, Any] = Depends(current_admin_dep),
):
    admin_id = admin.get("admin_id") or admin.get("id")
    sub = await _get_admin_sub(_db, admin_id)
    if not sub:
        return {"items": [], "total": 0}

    cursor = (
        _db.studio_storage_files
        .find({"admin_id": admin_id})
        .sort("uploaded_at", -1)
        .skip(max(0, offset))
        .limit(min(max(1, limit), 500))
    )
    items: List[Dict[str, Any]] = []
    async for doc in cursor:
        doc = _strip_id(doc)
        try:
            doc["download_url"] = generate_signed_url(doc["s3_key"], expiry_seconds=3600)
        except Exception as e:
            logger.warning("signed url failed: %s", e)
            doc["download_url"] = None
        items.append(doc)
    total = await _db.studio_storage_files.count_documents({"admin_id": admin_id})
    return {"items": items, "total": total}


@router.delete("/admin/studio-storage/files/{file_id}")
async def delete_file(file_id: str,
                      admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    doc = await _db.studio_storage_files.find_one({"id": file_id, "admin_id": admin_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        s3().delete_object(Bucket=bucket(), Key=doc["s3_key"])
    except Exception as e:
        logger.warning("S3 delete failed (continuing): %s", e)
    await _db.studio_storage_files.delete_one({"id": file_id})

    # Multi-drive pool: delete the Cloud_Storage mirror + release its bytes.
    # Correlates on the S3 key the mirror was stored under. Fire-and-forget.
    try:
        from storage_pool_hooks import mirror_delete
        mirror_delete(_db, photographer_id=admin_id, source_path=doc.get("s3_key"),
                      area="cloud_storage", filename=doc.get("name"))
    except Exception:
        pass

    # Decrement usage (clamp to zero)
    sub = await _get_admin_sub(_db, admin_id)
    if sub:
        new_used = max(0, (sub.get("used_bytes", 0) or 0) - int(doc.get("size_bytes", 0)))
        await _db.studio_storage_subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {"used_bytes": new_used, "updated_at": _now()}},
        )
    return {"deleted": True}



# ============================================================
# Super admin — global feature toggle
# ============================================================
class FeatureToggleIn(BaseModel):
    enabled: bool


@router.get("/super-admin/studio-storage/settings")
async def get_feature_settings(
    _admin: Dict[str, Any] = Depends(current_super_admin_dep),
):
    return {"enabled": await _feature_enabled(_db)}


@router.put("/super-admin/studio-storage/settings")
async def update_feature_settings(
    body: FeatureToggleIn,
    admin: Dict[str, Any] = Depends(current_super_admin_dep),
):
    await _db.app_settings.update_one(
        {"key": _FEATURE_KEY},
        {"$set": {
            "key": _FEATURE_KEY,
            "value": bool(body.enabled),
            "updated_at": _now(),
            "updated_by": admin.get("admin_id"),
        }},
        upsert=True,
    )
    return {"enabled": bool(body.enabled)}


# Photographer-facing status (used by dashboard tile + storage page header
# to decide whether to render the entry point). Always works even when the
# feature is disabled (it tells the UI exactly that).
@router.get("/admin/studio-storage/status")
async def get_feature_status(
    _admin: Dict[str, Any] = Depends(current_admin_dep),
):
    return {"enabled": await _feature_enabled(_db)}


# ============================================================
# NEW REDESIGNED STORAGE APIS (Specification Sections 5, 8, 10, 11, 12, 13, 14, 15, 16)
# ============================================================

MAX_SINGLE_VIDEO_BYTES = 500 * 1024 * 1024  # 500 MB max per single video file


@router.get("/admin/studio-storage/dashboard")
async def get_storage_dashboard(admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    sub = await _get_admin_sub(_db, admin_id)
    now = _now()
    
    total_bytes = 100 * 1024 * 1024 * 1024  # Default 100 GB tier if no sub
    used_bytes = 0
    subscription_status = "none"
    starts_at = None
    expires_at = None
    renewal_date = None
    plan_id = None

    if sub:
        subscription_status = _derive_status(sub, now)
        plan = await _db.studio_storage_plans.find_one({"id": sub.get("plan_id")})
        if plan:
            total_bytes = int(plan.get("gb_limit", 100)) * 1024 * 1024 * 1024
            plan_id = plan.get("id")
        used_bytes = int(sub.get("used_bytes", 0) or 0)
        starts_at = sub.get("starts_at")
        expires_at = sub.get("expires_at")
        renewal_date = expires_at

    remaining_bytes = max(0, total_bytes - used_bytes)
    usage_pct = round((used_bytes / total_bytes * 100), 2) if total_bytes > 0 else 0

    files_cursor = _db.studio_storage_files.find({"admin_id": admin_id, "is_trashed": {"$ne": True}})
    photo_count = 0
    video_count = 0
    recent_uploads = []
    async for f in files_cursor.sort("uploaded_at", -1):
        ct = f.get("content_type", "")
        if "video" in ct:
            video_count += 1
        else:
            photo_count += 1
        if len(recent_uploads) < 10:
            doc = _strip_id(f)
            doc["download_url"] = generate_signed_url(doc.get("s3_key"), expiry_seconds=3600)
            recent_uploads.append(doc)

    folder_count = await _db.studio_storage_folders.count_documents({"admin_id": admin_id, "is_trashed": {"$ne": True}})

    return {
        "total_bytes": total_bytes,
        "used_bytes": used_bytes,
        "remaining_bytes": remaining_bytes,
        "usage_pct": usage_pct,
        "photo_count": photo_count,
        "video_count": video_count,
        "folder_count": folder_count,
        "subscription_status": subscription_status,
        "starts_at": starts_at,
        "expires_at": expires_at,
        "renewal_date": renewal_date,
        "plan_id": plan_id,
        "recent_uploads": recent_uploads,
    }


class FolderCreateIn(BaseModel):
    name: str
    parent_id: Optional[str] = None


@router.post("/admin/studio-storage/folders")
async def create_folder(body: FolderCreateIn, admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    parent_id = body.parent_id or None
    if parent_id:
        pdoc = await _db.studio_storage_folders.find_one({"id": parent_id, "admin_id": admin_id, "is_trashed": {"$ne": True}})
        if not pdoc:
            raise HTTPException(status_code=404, detail="Parent folder not found or access denied")

    folder_id = f"fld_{uuid.uuid4().hex[:14]}"
    now = _now()
    doc = {
        "id": folder_id,
        "admin_id": admin_id,
        "name": body.name.strip(),
        "parent_id": parent_id,
        "created_at": now,
        "updated_at": now,
        "is_trashed": False,
    }
    await _db.studio_storage_folders.insert_one(doc)
    return _strip_id(doc)


@router.get("/admin/studio-storage/folders")
async def list_folders(parent_id: Optional[str] = None, admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    query = {"admin_id": admin_id, "is_trashed": {"$ne": True}}
    if parent_id:
        query["parent_id"] = parent_id
    else:
        query["parent_id"] = None
    cursor = _db.studio_storage_folders.find(query).sort("name", 1)
    folders = []
    async for f in cursor:
        folders.append(_strip_id(f))
    return {"folders": folders}


@router.delete("/admin/studio-storage/folders/{folder_id}")
async def delete_folder(folder_id: str, admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    await _db.studio_storage_folders.update_one({"id": folder_id, "admin_id": admin_id}, {"$set": {"is_trashed": True}})
    return {"trashed": True}


@router.post("/admin/studio-storage/trash/{file_id}")
async def trash_file(file_id: str, admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    await _db.studio_storage_files.update_one({"id": file_id, "admin_id": admin_id}, {"$set": {"is_trashed": True}})
    return {"trashed": True}


@router.post("/admin/studio-storage/restore/{file_id}")
async def restore_file(file_id: str, admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    await _db.studio_storage_files.update_one({"id": file_id, "admin_id": admin_id}, {"$set": {"is_trashed": False}})
    return {"restored": True}


@router.get("/admin/studio-storage/trash")
async def list_trash(admin: Dict[str, Any] = Depends(current_admin_dep)):
    admin_id = admin.get("admin_id") or admin.get("id")
    cursor = _db.studio_storage_files.find({"admin_id": admin_id, "is_trashed": True}).sort("uploaded_at", -1)
    items = []
    async for doc in cursor:
        doc = _strip_id(doc)
        doc["download_url"] = generate_signed_url(doc["s3_key"], expiry_seconds=3600)
        items.append(doc)
    return {"items": items}


class CompressRequest(BaseModel):
    file_ids: Optional[List[str]] = None
    file_id: Optional[str] = None
    target_mb: float = 2.0  # Target size in MB (e.g. 10, 5, 2, 1)
    mode: Optional[str] = None
    replace_original: bool = False

    @model_validator(mode="before")
    def norm_compress_payload(cls, values):
        if isinstance(values, dict):
            if not values.get("file_ids") and values.get("file_id"):
                values["file_ids"] = [values["file_id"]]
            if values.get("mode") == "replace":
                values["replace_original"] = True
        return values


@router.post("/admin/studio-storage/compress")
async def compress_photos(body: CompressRequest, admin: Dict[str, Any] = Depends(get_current_admin_with_role)):
    admin_id = admin.get("admin_id") or admin.get("id")
    file_ids = body.file_ids or ([body.file_id] if body.file_id else [])
    if not file_ids:
        raise HTTPException(400, "No file_ids provided for compression.")

    processed = 0
    failed = 0
    target_bytes = int(body.target_mb * 1024 * 1024)

    from PIL import Image as PILImage
    import io
    from pathlib import Path

    uploads_root = Path(os.environ.get("UPLOADS_ROOT", "/app/uploads"))

    for fid in file_ids:
        doc = await _db.studio_storage_files.find_one({"id": fid, "admin_id": admin_id})
        is_backup_doc = False
        if not doc:
            doc = await _db.backup_files.find_one({"id": fid, "studio_id": admin_id})
            is_backup_doc = True

        if not doc:
            failed += 1
            continue

        mime = doc.get("mime_type") or doc.get("content_type") or ""
        if not ("image" in mime or (doc.get("name") or "").lower().endswith((".jpg", ".jpeg", ".png", ".webp"))):
            failed += 1
            continue

        try:
            img_bytes = None
            disk_path = None
            if doc.get("s3_key"):
                try:
                    obj = s3().get_object(Bucket=bucket(), Key=doc["s3_key"])
                    img_bytes = obj["Body"].read()
                except Exception:
                    pass

            if not img_bytes:
                raw_url = doc.get("url") or doc.get("thumbnail_url") or ""
                if raw_url:
                    rel = raw_url.split("/uploads/", 1)[-1] if "/uploads/" in raw_url else raw_url.lstrip("/")
                    disk_path = (uploads_root / rel).resolve()
                    if disk_path.exists() and disk_path.is_file():
                        img_bytes = disk_path.read_bytes()

            if not img_bytes:
                failed += 1
                continue

            img = PILImage.open(io.BytesIO(img_bytes))
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            quality = 85
            out_io = io.BytesIO()
            img.save(out_io, format="JPEG", quality=quality, optimize=True)

            while out_io.tell() > target_bytes and quality > 35:
                quality -= 10
                out_io = io.BytesIO()
                img.save(out_io, format="JPEG", quality=quality, optimize=True)

            compressed_data = out_io.getvalue()
            new_size = len(compressed_data)

            if body.replace_original:
                if doc.get("s3_key"):
                    upload_bytes(doc["s3_key"], compressed_data, "image/jpeg")
                elif disk_path:
                    disk_path.write_bytes(compressed_data)
                
                target_coll = _db.backup_files if is_backup_doc else _db.studio_storage_files
                await target_coll.update_one(
                    {"id": fid},
                    {"$set": {"size_bytes": new_size, "mime_type": "image/jpeg", "content_type": "image/jpeg", "compressed": True}}
                )
            else:
                new_file_id = f"sf_{uuid.uuid4().hex[:14]}"
                if doc.get("s3_key"):
                    new_key = _file_key(admin_id, new_file_id, ".jpg")
                    upload_bytes(new_key, compressed_data, "image/jpeg")
                    new_url = f"/api/uploads/{new_key}"
                elif disk_path:
                    sub = disk_path.parent
                    new_disk_name = f"{new_file_id}.jpg"
                    new_path = sub / new_disk_name
                    new_path.write_bytes(compressed_data)
                    rel = new_path.relative_to(uploads_root.resolve()).as_posix()
                    new_url = f"/api/uploads/{rel}"
                else:
                    new_url = doc.get("url")

                if is_backup_doc:
                    new_doc = {
                        "id": new_file_id,
                        "studio_id": admin_id,
                        "name": f"compressed_{doc.get('name', 'photo.jpg')}",
                        "folder_id": doc.get("folder_id"),
                        "size_bytes": new_size,
                        "mime_type": "image/jpeg",
                        "url": new_url,
                        "thumbnail_url": new_url,
                        "deleted": False,
                        "compressed": True,
                        "created_at": _now()
                    }
                    await _db.backup_files.insert_one(new_doc)
                else:
                    new_doc = {
                        "id": new_file_id,
                        "admin_id": admin_id,
                        "subscription_id": doc.get("subscription_id"),
                        "name": f"compressed_{doc.get('name', 'photo.jpg')}",
                        "size_bytes": new_size,
                        "content_type": "image/jpeg",
                        "uploaded_at": _now(),
                        "compressed": True,
                        "folder": doc.get("folder"),
                    }
                    await _db.studio_storage_files.insert_one(new_doc)
            processed += 1
        except Exception as e:
            logger.warning("Photo compression failed for file %s: %s", fid, e)
            failed += 1

    return {"processed": processed, "failed": failed}


class SyncGalleryRequest(BaseModel):
    photo_urls: List[str]
    folder_id: Optional[str] = None


@router.post("/admin/studio-storage/sync-gallery")
async def sync_gallery_photos(body: SyncGalleryRequest, admin: Dict[str, Any] = Depends(get_current_admin_with_role)):
    admin_id = admin.get("admin_id") or admin.get("id")
    synced = 0

    for url in body.photo_urls:
        file_id = f"sf_{uuid.uuid4().hex[:14]}"
        key = _file_key(admin_id, file_id, ".jpg")
        doc = {
            "id": file_id,
            "admin_id": admin_id,
            "name": f"synced_{file_id}.jpg",
            "size_bytes": 102400,
            "content_type": "image/jpeg",
            "s3_key": key,
            "uploaded_at": _now(),
            "synced_from_gallery": True,
            "folder": body.folder_id,
        }
        await _db.studio_storage_files.insert_one(doc)
        synced += 1

    return {"synced": synced}

