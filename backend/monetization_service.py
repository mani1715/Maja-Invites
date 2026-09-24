"""
monetization_service.py — Phase 9 revenue SKUs (integration-ready).

Adds the paid upsells the launch audit flagged as missing, WITHOUT touching core
business logic and WITHOUT requiring live payment keys:

  • Storage add-ons        +10 / +25 / +50 / +100 GB (one-time bonus on top of plan cap)
  • Featured Photographer  paid placement (homepage / discover / search) for N days
  • Verification tiers      Standard / Professional (paid verification upsell)
  • Featured Listing        marketplace/vendor featured placement for N days

Payment model (mirrors Phase 6 marketplace):
  purchase() records an order. When real Razorpay keys are NOT configured it returns
  "Payment integration pending configuration." and grants nothing. When they ARE
  configured it returns payment_ready. The SAME grant path (activate_order) is what a
  payment-success webhook will call — so wiring payments later needs no new logic. A
  super-admin can also activate an order manually today (realise revenue before keys).

Entitlements are additive and read by existing systems:
  storage_bonus_bytes()  → portfolio_service._storage_cap_bytes adds this to the cap
  admins.featured_until  → directory / search surface featured studios first
  listing.featured_until → marketplace surfaces featured listings first
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

logger = logging.getLogger("monetization")

GB = 1024 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _payments_configured() -> bool:
    import os
    kid = os.environ.get("RAZORPAY_KEY_ID", "")
    ksec = os.environ.get("RAZORPAY_KEY_SECRET", "")
    return bool(kid and ksec and "PLACEHOLDER" not in kid and "PLACEHOLDER" not in ksec)


# ---- SKU catalog (admin can later move pricing into the Pricing Hub) ----------
CATALOG: Dict[str, List[Dict[str, Any]]] = {
    "storage": [
        {"sku": "storage_10", "label": "+10 GB", "gb": 10, "price_inr": 199},
        {"sku": "storage_25", "label": "+25 GB", "gb": 25, "price_inr": 399},
        {"sku": "storage_50", "label": "+50 GB", "gb": 50, "price_inr": 699},
        {"sku": "storage_100", "label": "+100 GB", "gb": 100, "price_inr": 1199},
    ],
    "featured_photographer": [
        {"sku": "feat_ph_7", "label": "Featured — 7 days", "days": 7, "price_inr": 499,
         "placements": ["homepage", "discover", "search"]},
        {"sku": "feat_ph_30", "label": "Featured — 30 days", "days": 30, "price_inr": 1499,
         "placements": ["homepage", "discover", "search"]},
    ],
    "verification": [
        {"sku": "verify_standard", "label": "Standard Verification", "level": 1, "price_inr": 299},
        {"sku": "verify_pro", "label": "Professional Verification", "level": 2, "price_inr": 799},
    ],
    "featured_listing": [
        {"sku": "feat_list_7", "label": "Featured Listing — 7 days", "days": 7, "price_inr": 199},
        {"sku": "feat_list_30", "label": "Featured Listing — 30 days", "days": 30, "price_inr": 599},
    ],
}

_SKU_INDEX = {item["sku"]: (cat, item) for cat, items in CATALOG.items() for item in items}


# ---- entitlement reads (used by portfolio storage cap + directory/search) -----
async def storage_bonus_bytes(db, studio_id: str) -> int:
    """Sum of active storage add-ons for a studio, in bytes (0 if none)."""
    try:
        rows = await db.storage_addons.find({"studio_id": studio_id, "active": True}, {"_id": 0}).to_list(200)
        return sum(int(r.get("gb") or 0) for r in rows) * GB
    except Exception:
        return 0


async def is_featured(db, studio_id: str) -> bool:
    try:
        a = await db.admins.find_one({"id": studio_id}, {"_id": 0}) or {}
        fu = a.get("featured_until")
        return bool(fu and fu > _now())
    except Exception:
        return False


async def _apply_entitlement(db, order: Dict[str, Any]) -> None:
    """Grant the thing that was paid for. Called by activate_order (admin now,
    payment webhook later). Idempotent-ish (re-activating extends featured windows)."""
    cat, item, sid = order["category"], order["item"], order["studio_id"]
    if cat == "storage":
        await db.storage_addons.insert_one({
            "id": f"sa_{uuid.uuid4().hex[:12]}", "studio_id": sid, "gb": int(item["gb"]),
            "active": True, "order_id": order["id"], "created_at": _now()})
    elif cat == "featured_photographer":
        until = (datetime.now(timezone.utc) + timedelta(days=int(item["days"]))).isoformat()
        await db.admins.update_one({"id": sid}, {"$set": {"featured_until": until}})
    elif cat == "verification":
        lvl = int(item["level"])
        await db.pixora_verifications.update_one(
            {"studio_id": sid},
            {"$set": {"studio_id": sid, "status": "approved", "level": lvl,
                      "paid": True, "updated_at": _now()}}, upsert=True)
        await db.admins.update_one({"id": sid}, {"$set": {"pixora_verified_level": lvl, "is_verified": True}})
    elif cat == "featured_listing":
        until = (datetime.now(timezone.utc) + timedelta(days=int(item["days"]))).isoformat()
        if order.get("target_id"):
            await db.pixora_listings.update_one({"id": order["target_id"]}, {"$set": {"featured_until": until}})


class PurchaseIn(BaseModel):
    sku: str
    target_id: Optional[str] = None   # e.g. a listing id for featured_listing


def build_monetization_router(db, require_admin, require_super_admin=None) -> APIRouter:
    router = APIRouter(tags=["monetization"])

    @router.get("/api/monetization/catalog")
    async def catalog(admin: dict = Depends(require_admin)):
        return {"catalog": CATALOG, "payments_configured": _payments_configured(),
                "currency": "INR"}

    @router.post("/api/monetization/purchase")
    async def purchase(payload: PurchaseIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        entry = _SKU_INDEX.get(payload.sku)
        if not entry:
            raise HTTPException(404, "Unknown item")
        cat, item = entry
        order = {"id": f"mo_{uuid.uuid4().hex[:14]}", "studio_id": sid, "sku": payload.sku,
                 "category": cat, "item": item, "target_id": payload.target_id,
                 "amount_inr": int(item["price_inr"]), "status": "payment_pending",
                 "created_at": _now()}
        await db.monetization_orders.insert_one(order)
        base = {"order_id": order["id"], "sku": payload.sku, "amount_inr": order["amount_inr"], "label": item["label"]}
        if not _payments_configured():
            return {"status": "payment_pending", **base,
                    "message": "Payment integration pending configuration."}
        return {"status": "payment_ready", **base,
                "message": "Proceed to payment to activate this upgrade."}

    @router.get("/api/monetization/my")
    async def my_purchases(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        orders = await db.monetization_orders.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        addons = await db.storage_addons.find({"studio_id": sid, "active": True}, {"_id": 0}).to_list(200)
        return {"orders": orders,
                "entitlements": {
                    "storage_bonus_gb": sum(int(a.get("gb") or 0) for a in addons),
                    "featured": await is_featured(db, sid),
                }}

    if require_super_admin is not None:
        @router.get("/api/admin/monetization/orders")
        async def all_orders(_s=Depends(require_super_admin)):
            rows = await db.monetization_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
            realised = sum(int(o.get("amount_inr") or 0) for o in rows if o.get("status") == "active")
            pending = sum(int(o.get("amount_inr") or 0) for o in rows if o.get("status") == "payment_pending")
            return {"orders": rows, "revenue_realised_inr": realised, "revenue_pending_inr": pending,
                    "payments_configured": _payments_configured()}

        @router.post("/api/admin/monetization/orders/{order_id}/activate")
        async def activate_order(order_id: str, _s=Depends(require_super_admin)):
            """Grant a paid upgrade (manual until payments are live; the payment webhook
            will call this same path). Idempotent: an already-active order is a no-op."""
            o = await db.monetization_orders.find_one({"id": order_id}, {"_id": 0})
            if not o:
                raise HTTPException(404, "Order not found")
            if o.get("status") == "active":
                return {"activated": True, "already": True}
            await _apply_entitlement(db, o)
            await db.monetization_orders.update_one({"id": order_id},
                                                    {"$set": {"status": "active", "activated_at": _now()}})
            return {"activated": True}

    return router
