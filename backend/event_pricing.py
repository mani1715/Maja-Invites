"""
event_pricing.py — MAJA Dynamic Event Engine: admin-set prices for event designs,
plans and features (the Ganesh analogue of the wedding Pricing Hub).
=================================================================================

Why this exists
    The wedding side already lets the super-admin price every design
    (`pricing_design_prices`), every link package (`store_packages`) and every
    add-on (`store_addons`). Events had NO price surface at all, so the buy panel
    could only say "plans are being set up" — the owner asked for exactly the same
    three knobs for Ganesh: per-design price, per-plan price, per-feature price.

Design (event-type agnostic — a future event type needs no new code here)
    Three tiny admin-owned collections, all keyed by `event_type`:
      • event_design_prices   {event_type, template_id, base_price, discount_*}
      • event_plan_prices     {event_type, key, name, price, features[], sort}
      • event_feature_prices  {event_type, feature_key, label, price}
    Defaults are SEEDED once (idempotent) from the tables below, so the store is
    never empty and the owner can then edit every number in the Pricing Hub.

    Total for a purchase = design price + plan price + chosen feature add-ons.
    Granted features    = plan features + chosen add-ons (gating itself still
    happens in event_plan_gating, which stays flag-aware and reversible).

Dependencies  event_registry (feature vocabulary), event_templates (design list).
Side effects  inserts default rows on first read; every admin write is audited.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

import event_registry as registry
import event_templates

# --------------------------------------------------------------------------- #
# defaults (owner-editable afterwards — these only seed an empty catalogue)
# --------------------------------------------------------------------------- #
DEFAULT_DESIGN_PRICE_INR = 0          # artwork included with the plan by default

# The three Ganesh plans. `features` are event feature keys (event_registry).
DEFAULT_PLANS: Dict[str, List[Dict[str, Any]]] = {
    "ganesh_chaturthi": [
        {
            "key": "ganesh_basic", "name": "Basic", "price": 1499, "sort": 1,
            "tagline": "A beautiful invitation with the essentials.",
            "features": ["countdown", "prasadam_menu", "whatsapp_share", "pdf_download"],
            "active_days": 30,
        },
        {
            "key": "ganesh_premium", "name": "Premium", "price": 2999, "sort": 2,
            "tagline": "The full festival story — day by day.",
            "featured": True,
            "features": ["countdown", "prasadam_menu", "whatsapp_share", "pdf_download",
                         "journey", "per_day_schedule", "per_day_photos", "blessings_wall",
                         "previous_year_gallery"],
            "active_days": 60,
        },
        {
            "key": "ganesh_royal", "name": "Royal", "price": 4999, "sort": 3,
            "tagline": "Everything, including donations & the money portal.",
            "features": list(registry.GANESH_FEATURE_KEYS),
            "active_days": 90,
        },
    ],
}

# A-la-carte prices for individual features (added on top of any plan).
DEFAULT_FEATURE_PRICES: Dict[str, int] = {
    "journey": 299, "per_day_schedule": 399, "per_day_photos": 499,
    "blessings_wall": 299, "donations": 599, "money_portal": 799,
    "spending_folders": 299, "extra_languages": 499, "countdown": 149,
    "prasadam_menu": 149, "previous_year_gallery": 299, "pdf_download": 199,
    "money_report": 299, "whatsapp_share": 149,
}

FEATURE_LABELS: Dict[str, str] = {
    "journey": "Celebration journey", "per_day_schedule": "Per-day schedule",
    "per_day_photos": "Per-day photos", "blessings_wall": "Blessings wall",
    "donations": "Donations", "money_portal": "Money-collection logins",
    "spending_folders": "Spending folders", "extra_languages": "Extra languages",
    "countdown": "Countdown", "prasadam_menu": "Prasadam menu",
    "previous_year_gallery": "Previous-year gallery", "pdf_download": "PDF download",
    "money_report": "Money report", "whatsapp_share": "WhatsApp share",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(doc or {})
    d.pop("_id", None)
    return d


def feature_label(key: str) -> str:
    return FEATURE_LABELS.get(key, key.replace("_", " ").title())


# --------------------------------------------------------------------------- #
# seeding (idempotent — only fills what the admin has not created yet)
# --------------------------------------------------------------------------- #
async def ensure_seeded(db, event_type: str = "ganesh_chaturthi") -> None:
    """Create the default plan/feature rows once. Never overwrites admin edits."""
    for plan in DEFAULT_PLANS.get(event_type, []):
        existing = await db.event_plan_prices.find_one(
            {"event_type": event_type, "key": plan["key"]})
        if not existing:
            await db.event_plan_prices.insert_one({
                "event_type": event_type, "is_active": True,
                "created_at": _now(), "updated_at": _now(), **plan})

    cfg = registry.get_config(event_type) or {}
    for key in (cfg.get("feature_keys") or []):
        existing = await db.event_feature_prices.find_one(
            {"event_type": event_type, "feature_key": key})
        if not existing:
            await db.event_feature_prices.insert_one({
                "event_type": event_type, "feature_key": key,
                "label": feature_label(key),
                "price": int(DEFAULT_FEATURE_PRICES.get(key, 299)),
                "is_active": True, "created_at": _now(), "updated_at": _now()})


# --------------------------------------------------------------------------- #
# read models
# --------------------------------------------------------------------------- #
def _effective_design_price(doc: Optional[Dict[str, Any]]) -> int:
    """discount (when enabled) wins over base; missing row → the default."""
    if not doc:
        return DEFAULT_DESIGN_PRICE_INR
    if doc.get("discount_enabled") and int(doc.get("discount_price") or 0) > 0:
        return int(doc["discount_price"])
    base = doc.get("base_price")
    return int(base) if isinstance(base, (int, float)) and base >= 0 else DEFAULT_DESIGN_PRICE_INR


async def design_price(db, event_type: str, template_id: str) -> Dict[str, Any]:
    doc = await db.event_design_prices.find_one(
        {"event_type": event_type, "template_id": template_id})
    price = _effective_design_price(doc)
    base = int((doc or {}).get("base_price") or 0) if doc else DEFAULT_DESIGN_PRICE_INR
    return {
        "template_id": template_id, "price_inr": price,
        "base_price": base,
        "price_source": "design" if doc else "default",
        "currency": "INR",
    }


async def list_plans(db, event_type: str) -> List[Dict[str, Any]]:
    await ensure_seeded(db, event_type)
    rows = [_clean(r) async for r in db.event_plan_prices.find({"event_type": event_type})]
    rows = [r for r in rows if r.get("is_active") is not False]
    rows.sort(key=lambda r: (int(r.get("sort") or 0), int(r.get("price") or 0)))
    for r in rows:
        r["price"] = int(r.get("price") or 0)
        r["features"] = list(r.get("features") or [])
        r["feature_labels"] = [feature_label(f) for f in r["features"]]
    return rows


async def list_feature_prices(db, event_type: str) -> List[Dict[str, Any]]:
    await ensure_seeded(db, event_type)
    rows = [_clean(r) async for r in db.event_feature_prices.find({"event_type": event_type})]
    rows = [r for r in rows if r.get("is_active") is not False]
    order = list((registry.get_config(event_type) or {}).get("feature_keys") or [])
    rows.sort(key=lambda r: order.index(r["feature_key"]) if r.get("feature_key") in order else 999)
    for r in rows:
        r["price"] = int(r.get("price") or 0)
        r["label"] = r.get("label") or feature_label(r.get("feature_key", ""))
    return rows


async def get_plan(db, event_type: str, plan_key: str) -> Optional[Dict[str, Any]]:
    for p in await list_plans(db, event_type):
        if p.get("key") == plan_key:
            return p
    return None


async def design_offer(db, event_type: str, template_id: str = "") -> Dict[str, Any]:
    """Everything the public "Get this design" panel needs — fully admin-priced.
    Mirrors /api/store/design-offer on the wedding side."""
    cfg = registry.get_config(event_type)
    if not cfg:
        raise HTTPException(404, "Unknown event type")
    tpl = event_templates.get_template(event_type, template_id) if template_id else None
    dp = await design_price(db, event_type, template_id) if template_id else {
        "template_id": "", "price_inr": DEFAULT_DESIGN_PRICE_INR,
        "base_price": DEFAULT_DESIGN_PRICE_INR, "price_source": "default", "currency": "INR"}
    plans = await list_plans(db, event_type)
    feats = await list_feature_prices(db, event_type)
    cheapest = min([p["price"] for p in plans], default=0)
    return {
        "event_type": event_type,
        "event_name": cfg.get("event_name") or event_type,
        "template_id": template_id,
        "template_name": (tpl or {}).get("name") or "",
        "design_price_inr": dp["price_inr"],
        "design_price_source": dp["price_source"],
        "from_price_inr": dp["price_inr"] + cheapest,
        "plans": plans,
        "feature_addons": feats,
        "currency": "INR",
    }


async def quote(db, event_type: str, template_id: str, plan_key: str,
                addons: Optional[List[str]] = None) -> Dict[str, Any]:
    """Line-item total for a purchase: design + plan + chosen feature add-ons."""
    plan = await get_plan(db, event_type, plan_key)
    if not plan:
        raise HTTPException(422, "Unknown plan")
    dp = await design_price(db, event_type, template_id) if template_id else {"price_inr": 0}
    prices = {f["feature_key"]: f for f in await list_feature_prices(db, event_type)}
    plan_feats = list(plan.get("features") or [])
    chosen = [a for a in (addons or []) if a in prices and a not in plan_feats]
    addon_total = sum(int(prices[a]["price"]) for a in chosen)
    total = int(dp["price_inr"]) + int(plan["price"]) + addon_total
    return {
        "event_type": event_type, "template_id": template_id,
        "design_inr": int(dp["price_inr"]),
        "plan_key": plan_key, "plan_label": plan.get("name") or plan_key,
        "plan_inr": int(plan["price"]),
        "addons": [{"key": a, "label": prices[a]["label"], "price": int(prices[a]["price"])} for a in chosen],
        "addon_total_inr": addon_total,
        "total_inr": total, "currency": "INR",
        "granted_features": plan_feats + chosen,
        "active_days": int(plan.get("active_days") or 0) or None,
    }


# --------------------------------------------------------------------------- #
# router — public reads + super-admin writes
# --------------------------------------------------------------------------- #
def build_event_pricing_router(db, require_super_admin=None, audit=None) -> APIRouter:
    router = APIRouter(tags=["event-pricing"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    async def _log(actor: str, action: str, after: Dict[str, Any]) -> None:
        if audit is None:
            return
        try:
            await audit(db, actor, action, "event_pricing", None, after)
        except Exception:      # never fail a save because the audit trail hiccuped
            pass

    # ---------------- public ----------------
    @router.get("/api/events/design-offer/{event_type}/{template_id}")
    async def _offer(event_type: str, template_id: str):
        await _gate()
        return await design_offer(db, event_type, template_id)

    @router.get("/api/events/pricing/{event_type}")
    async def _pricing(event_type: str):
        await _gate()
        return await design_offer(db, event_type, "")

    @router.post("/api/events/pricing/quote")
    async def _quote(body: Dict[str, Any] = Body(...)):
        await _gate()
        return await quote(db, body.get("event_type") or "ganesh_chaturthi",
                           body.get("template_id") or "", body.get("plan_key") or "",
                           body.get("addons") or [])

    if require_super_admin is None:
        return router

    # ---------------- super-admin ----------------
    @router.get("/api/admin/event-pricing/{event_type}")
    async def _admin_all(event_type: str, _s=Depends(require_super_admin)):
        """The whole event price sheet: every design, plan and feature."""
        cfg = registry.get_config(event_type)
        if not cfg:
            raise HTTPException(404, "Unknown event type")
        await ensure_seeded(db, event_type)
        rows = {}
        async for r in db.event_design_prices.find({"event_type": event_type}):
            rows[_clean(r).get("template_id")] = _clean(r)
        designs = []
        for t in event_templates.templates_for(event_type):
            row = rows.get(t["template_id"]) or {}
            designs.append({
                "template_id": t["template_id"], "name": t["name"], "palette": t.get("palette"),
                "thumbnail_url": t.get("thumbnail_url"),
                "base_price": int(row.get("base_price") or 0) if row else DEFAULT_DESIGN_PRICE_INR,
                "discount_enabled": bool(row.get("discount_enabled")),
                "discount_price": int(row.get("discount_price") or 0),
                "effective_price": _effective_design_price(row or None),
                "is_set": bool(row),
            })
        return {
            "event_type": event_type,
            "event_name": cfg.get("event_name") or event_type,
            "designs": designs,
            "plans": await list_plans(db, event_type),
            "features": await list_feature_prices(db, event_type),
            "feature_keys": [{"key": k, "label": feature_label(k)}
                             for k in (cfg.get("feature_keys") or [])],
            "free_edits": int(cfg.get("free_edits") or 0),
        }

    @router.post("/api/admin/event-pricing/{event_type}/design")
    async def _admin_design(event_type: str, body: Dict[str, Any] = Body(...),
                            _s=Depends(require_super_admin)):
        tid = str(body.get("template_id") or "").strip()
        if not event_templates.get_template(event_type, tid):
            raise HTTPException(422, "Unknown design")
        doc = {
            "event_type": event_type, "template_id": tid,
            "base_price": max(0, int(body.get("base_price") or 0)),
            "discount_enabled": bool(body.get("discount_enabled")),
            "discount_price": max(0, int(body.get("discount_price") or 0)),
            "updated_at": _now(),
        }
        existing = await db.event_design_prices.find_one(
            {"event_type": event_type, "template_id": tid})
        if existing:
            await db.event_design_prices.update_one(
                {"event_type": event_type, "template_id": tid}, {"$set": doc})
        else:
            await db.event_design_prices.insert_one({**doc, "created_at": _now()})
        await _log(str(_s), "event_design_price_set", doc)
        return {"saved": True, **await design_price(db, event_type, tid)}

    @router.post("/api/admin/event-pricing/{event_type}/design/bulk")
    async def _admin_design_bulk(event_type: str, body: Dict[str, Any] = Body(...),
                                 _s=Depends(require_super_admin)):
        """Apply one price to every design of this event type (the owner's usual case)."""
        price = max(0, int(body.get("base_price") or 0))
        n = 0
        for t in event_templates.templates_for(event_type):
            doc = {"event_type": event_type, "template_id": t["template_id"],
                   "base_price": price, "discount_enabled": False, "discount_price": 0,
                   "updated_at": _now()}
            existing = await db.event_design_prices.find_one(
                {"event_type": event_type, "template_id": t["template_id"]})
            if existing:
                await db.event_design_prices.update_one(
                    {"event_type": event_type, "template_id": t["template_id"]}, {"$set": doc})
            else:
                await db.event_design_prices.insert_one({**doc, "created_at": _now()})
            n += 1
        await _log(str(_s), "event_design_price_bulk", {"event_type": event_type, "price": price, "count": n})
        return {"saved": True, "updated": n, "base_price": price}

    @router.post("/api/admin/event-pricing/{event_type}/plan")
    async def _admin_plan(event_type: str, body: Dict[str, Any] = Body(...),
                          _s=Depends(require_super_admin)):
        key = str(body.get("key") or "").strip().lower()
        if not key:
            raise HTTPException(422, "key required")
        await ensure_seeded(db, event_type)
        vocab = set((registry.get_config(event_type) or {}).get("feature_keys") or [])
        feats = [f for f in (body.get("features") or []) if f in vocab]
        doc = {
            "event_type": event_type, "key": key,
            "name": body.get("name") or key.replace("_", " ").title(),
            "tagline": body.get("tagline") or "",
            "price": max(0, int(body.get("price") or 0)),
            "sort": int(body.get("sort") or 0),
            "featured": bool(body.get("featured")),
            "features": feats,
            "active_days": max(0, int(body.get("active_days") or 0)),
            "is_active": body.get("is_active") is not False,
            "updated_at": _now(),
        }
        existing = await db.event_plan_prices.find_one({"event_type": event_type, "key": key})
        if existing:
            await db.event_plan_prices.update_one(
                {"event_type": event_type, "key": key}, {"$set": doc})
        else:
            await db.event_plan_prices.insert_one({**doc, "created_at": _now()})
        await _log(str(_s), "event_plan_price_set", doc)
        return {"saved": True, "plan": await get_plan(db, event_type, key)}

    @router.post("/api/admin/event-pricing/{event_type}/feature")
    async def _admin_feature(event_type: str, body: Dict[str, Any] = Body(...),
                             _s=Depends(require_super_admin)):
        key = str(body.get("feature_key") or "").strip()
        vocab = set((registry.get_config(event_type) or {}).get("feature_keys") or [])
        if key not in vocab:
            raise HTTPException(422, "Unknown feature")
        await ensure_seeded(db, event_type)
        doc = {"event_type": event_type, "feature_key": key,
               "label": body.get("label") or feature_label(key),
               "price": max(0, int(body.get("price") or 0)),
               "is_active": body.get("is_active") is not False,
               "updated_at": _now()}
        existing = await db.event_feature_prices.find_one(
            {"event_type": event_type, "feature_key": key})
        if existing:
            await db.event_feature_prices.update_one(
                {"event_type": event_type, "feature_key": key}, {"$set": doc})
        else:
            await db.event_feature_prices.insert_one({**doc, "created_at": _now()})
        await _log(str(_s), "event_feature_price_set", doc)
        return {"saved": True, "feature": doc}

    return router
