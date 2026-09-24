"""
pricing_hub_service.py — MAJA Invites unified Pricing Hub API (Phase 3-6).
==========================================================================

The admin (super-admin) CRUD surface + the public read/quote surface for the
unified pricing engine. Every price on the platform is edited here and resolved
by pricing_engine.py — no hardcoded prices, one source of truth.

Admin (require_super_admin), all under /api/admin/pricing:
    designs         GET · PUT {design_id}                (price + metadata + flags)
    categories      GET · POST · PUT{id} · DELETE{id}    (CRUD + reorder)
    feature-packs   GET · POST · PUT{id}                 (price + dynamic features)
    link-durations  GET · POST · PUT{id} · DELETE{id}
    campaigns       GET · POST · PUT{id} · DELETE{id} · POST{id}/toggle
    plans           GET · PUT{id}                        (portfolio/storage durations+config)
    community       GET · PUT
    simulate        POST                                 (uses the LIVE resolver)

Public (no auth — read-only catalog + quote for checkout):
    GET  /api/pricing/catalog        designs+categories+packs+durations+active campaigns
    POST /api/pricing/quote          wedding: design+pack+duration−discount
    POST /api/pricing/plan-quote     portfolio/storage: plan[cycle]−discount
    GET  /api/campaigns/active        active campaign banners

Every admin write validates (no negative / no accidental ₹0 / unique names) and
appends to pricing_audit_log for rollback.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body

from pricing_engine import (
    quote_wedding, quote_plan, compute_wedding_total, compute_plan_total,
    effective_design_price, validate_price, validate_unique_name, PricingError,
    BILLING_CYCLES, COMMUNITY_CAPS,
)
from subscription_service import sync_plan_durations


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(p: str) -> str:
    return f"{p}_{uuid.uuid4().hex[:12]}"


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc.pop("_id", None)
    return doc


async def _all(coll, flt: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    out = []
    async for d in coll.find(flt or {}):
        out.append(_clean(d))
    return out


def build_pricing_hub_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["pricing-hub"])

    # ------------------------------------------------------------------ #
    # audit
    # ------------------------------------------------------------------ #
    async def _audit(entity: str, entity_id: str, action: str,
                     before: Any, after: Any, actor: Any) -> None:
        try:
            await db.pricing_audit_log.insert_one({
                "id": _uid("aud"), "entity": entity, "entity_id": entity_id,
                "action": action, "before": before, "after": after,
                "actor": (actor or {}).get("admin_id") if isinstance(actor, dict) else str(actor),
                "at": _now(),
            })
        except Exception:
            pass   # audit is best-effort, never blocks a save

    def _price(v, *, allow_zero=True, label="price") -> int:
        try:
            return validate_price(v, allow_zero=allow_zero, label=label)
        except PricingError as e:
            raise HTTPException(status_code=422, detail=str(e))

    # ================================================================== #
    # DESIGN PRICING MANAGER
    # ================================================================== #
    @router.get("/api/admin/pricing/designs")
    async def list_designs(category: str = Query(""),
                           _a=Depends(require_super_admin)):
        rows = await _all(db.pricing_design_prices, {"audience": "normal_user"})
        if category:
            rows = [r for r in rows if r.get("category_id") == category]
        for r in rows:
            r["final_price"] = effective_design_price(r)
        rows.sort(key=lambda r: (not r.get("featured"), r.get("name") or ""))
        return {"designs": rows}

    @router.put("/api/admin/pricing/designs/{design_id}")
    async def upsert_design(design_id: str, body: Dict[str, Any] = Body(...),
                            admin=Depends(require_super_admin)):
        before = await db.pricing_design_prices.find_one(
            {"audience": "normal_user", "design_id": design_id})
        base = _price(body.get("base_price", (before or {}).get("base_price", 0)),
                      label="base_price")
        # final: explicit sale_price wins; else derive from base − %/₹
        if body.get("sale_price") is not None:
            sale = _price(body["sale_price"], label="sale_price")
        else:
            pct = float(body.get("discount_pct") or 0)
            amt = int(body.get("discount_amount") or 0)
            sale = max(0, int(round(base - base * pct / 100.0 - amt)))
        update = {
            "audience": "normal_user", "design_id": design_id,
            "name": body.get("name") or (before or {}).get("name") or design_id,
            "category_id": body.get("category_id", (before or {}).get("category_id")),
            "thumbnail_url": body.get("thumbnail_url", (before or {}).get("thumbnail_url")),
            "active": bool(body.get("active", (before or {}).get("active", True))),
            "featured": bool(body.get("featured", (before or {}).get("featured", False))),
            "trending": bool(body.get("trending", (before or {}).get("trending", False))),
            "best_seller": bool(body.get("best_seller", (before or {}).get("best_seller", False))),
            "new_arrival": bool(body.get("new_arrival", (before or {}).get("new_arrival", False))),
            "base_price": base,
            "discount_pct": float(body.get("discount_pct", (before or {}).get("discount_pct", 0)) or 0),
            "discount_amount": int(body.get("discount_amount", (before or {}).get("discount_amount", 0)) or 0),
            "sale_price": sale, "updated_at": _now(),
        }
        if before:
            await db.pricing_design_prices.update_one(
                {"audience": "normal_user", "design_id": design_id}, {"$set": update})
        else:
            update["id"] = _uid("dp"); update["created_at"] = _now()
            await db.pricing_design_prices.insert_one(update)
        await _audit("design", design_id, "upsert", _clean(before) if before else None, update, admin)
        return {"design_id": design_id, "final_price": effective_design_price(update), "saved": True}

    # ================================================================== #
    # DESIGN CATEGORIES
    # ================================================================== #
    @router.get("/api/admin/pricing/categories")
    async def list_categories(_a=Depends(require_super_admin)):
        rows = await _all(db.design_categories)
        rows.sort(key=lambda r: int(r.get("sort") or 0))
        return {"categories": rows}

    @router.post("/api/admin/pricing/categories")
    async def create_category(body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        names = [c.get("name", "") for c in await _all(db.design_categories)]
        try:
            name = validate_unique_name(names, body.get("name", ""), label="category name")
        except PricingError as e:
            raise HTTPException(422, str(e))
        doc = {"id": _uid("cat"), "name": name,
               "slug": "".join(ch if ch.isalnum() else "_" for ch in name.lower()).strip("_"),
               "active": bool(body.get("active", True)), "sort": int(body.get("sort") or 999),
               "created_at": _now(), "updated_at": _now()}
        await db.design_categories.insert_one(doc)
        await _audit("category", doc["id"], "create", None, doc, admin)
        return doc

    @router.put("/api/admin/pricing/categories/{cat_id}")
    async def update_category(cat_id: str, body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.design_categories.find_one({"id": cat_id})
        if not before:
            raise HTTPException(404, "Category not found")
        upd = {"updated_at": _now()}
        if "name" in body:
            others = [c.get("name", "") for c in await _all(db.design_categories) if c.get("id") != cat_id]
            try:
                upd["name"] = validate_unique_name(others, body["name"], label="category name")
            except PricingError as e:
                raise HTTPException(422, str(e))
        for k in ("active", "sort"):
            if k in body:
                upd[k] = bool(body[k]) if k == "active" else int(body[k])
        await db.design_categories.update_one({"id": cat_id}, {"$set": upd})
        await _audit("category", cat_id, "update", _clean(before), upd, admin)
        return {"saved": True, **upd}

    @router.delete("/api/admin/pricing/categories/{cat_id}")
    async def delete_category(cat_id: str, admin=Depends(require_super_admin)):
        before = await db.design_categories.find_one({"id": cat_id})
        await db.design_categories.delete_one({"id": cat_id})
        await _audit("category", cat_id, "delete", _clean(before) if before else None, None, admin)
        return {"deleted": True}

    # ================================================================== #
    # FEATURE PACKS
    # ================================================================== #
    @router.get("/api/admin/pricing/feature-packs")
    async def list_packs(_a=Depends(require_super_admin)):
        rows = await _all(db.feature_packs)
        rows.sort(key=lambda r: int(r.get("sort") or 0))
        return {"feature_packs": rows}

    @router.post("/api/admin/pricing/feature-packs")
    async def create_pack(body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        key = (body.get("key") or "").strip().lower()
        if not key:
            raise HTTPException(422, "Feature pack key is required")
        if await db.feature_packs.find_one({"key": key}):
            raise HTTPException(422, f"Feature pack '{key}' already exists")
        doc = {"id": _uid("fp"), "key": key, "name": body.get("name") or key.title(),
               "price": _price(body.get("price", 0), label="pack price"),
               "active": bool(body.get("active", True)), "sort": int(body.get("sort") or 999),
               "features": list(body.get("features") or []), "created_at": _now(), "updated_at": _now()}
        await db.feature_packs.insert_one(doc)
        await _audit("feature_pack", doc["id"], "create", None, doc, admin)
        return doc

    @router.put("/api/admin/pricing/feature-packs/{pack_id}")
    async def update_pack(pack_id: str, body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.feature_packs.find_one({"id": pack_id}) or await db.feature_packs.find_one({"key": pack_id})
        if not before:
            raise HTTPException(404, "Feature pack not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        if "price" in body:
            upd["price"] = _price(body["price"], label="pack price")
        if "name" in body:
            upd["name"] = str(body["name"])
        if "active" in body:
            upd["active"] = bool(body["active"])
        if "sort" in body:
            upd["sort"] = int(body["sort"])
        if "features" in body:      # add / remove / reorder = replace the ordered list
            upd["features"] = list(body["features"] or [])
        await db.feature_packs.update_one({"id": before["id"]}, {"$set": upd})
        await _audit("feature_pack", before["id"], "update", _clean(before), upd, admin)
        return {"saved": True, **upd}

    # ================================================================== #
    # LINK DURATION TIERS
    # ================================================================== #
    @router.get("/api/admin/pricing/link-durations")
    async def list_durations(_a=Depends(require_super_admin)):
        rows = await _all(db.link_duration_tiers)
        rows.sort(key=lambda r: int(r.get("sort") or 0))
        return {"link_durations": rows}

    @router.post("/api/admin/pricing/link-durations")
    async def create_duration(body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        names = [d.get("name", "") for d in await _all(db.link_duration_tiers)]
        try:
            name = validate_unique_name(names, body.get("name", ""), label="duration name")
        except PricingError as e:
            raise HTTPException(422, str(e))
        lifetime = bool(body.get("lifetime"))
        doc = {"id": _uid("dur"), "key": body.get("key") or _uid("d"), "name": name,
               "duration_days": None if lifetime else int(body.get("duration_days") or 0),
               "lifetime": lifetime, "price": _price(body.get("price", 0), label="duration price"),
               "description": body.get("description", ""), "active": bool(body.get("active", True)),
               "sort": int(body.get("sort") or 999), "created_at": _now(), "updated_at": _now()}
        await db.link_duration_tiers.insert_one(doc)
        await _audit("link_duration", doc["id"], "create", None, doc, admin)
        return doc

    @router.put("/api/admin/pricing/link-durations/{dur_id}")
    async def update_duration(dur_id: str, body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.link_duration_tiers.find_one({"id": dur_id})
        if not before:
            raise HTTPException(404, "Link duration not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        if "price" in body:
            upd["price"] = _price(body["price"], label="duration price")
        for k in ("name", "description"):
            if k in body:
                upd[k] = str(body[k])
        if "lifetime" in body:
            upd["lifetime"] = bool(body["lifetime"])
            if upd["lifetime"]:
                upd["duration_days"] = None
        if "duration_days" in body and not upd.get("lifetime"):
            upd["duration_days"] = int(body["duration_days"] or 0)
        if "active" in body:
            upd["active"] = bool(body["active"])
        if "sort" in body:
            upd["sort"] = int(body["sort"])
        await db.link_duration_tiers.update_one({"id": dur_id}, {"$set": upd})
        await _audit("link_duration", dur_id, "update", _clean(before), upd, admin)
        return {"saved": True, **upd}

    @router.delete("/api/admin/pricing/link-durations/{dur_id}")
    async def delete_duration(dur_id: str, admin=Depends(require_super_admin)):
        before = await db.link_duration_tiers.find_one({"id": dur_id})
        await db.link_duration_tiers.delete_one({"id": dur_id})
        await _audit("link_duration", dur_id, "delete", _clean(before) if before else None, None, admin)
        return {"deleted": True}

    # ================================================================== #
    # DISCOUNT CAMPAIGNS
    # ================================================================== #
    @router.get("/api/admin/pricing/campaigns")
    async def list_campaigns(_a=Depends(require_super_admin)):
        rows = await _all(db.pricing_campaigns)
        rows.sort(key=lambda r: r.get("start_at") or "", reverse=True)
        return {"campaigns": rows}

    def _campaign_doc(body: Dict[str, Any]) -> Dict[str, Any]:
        dtype = (body.get("discount_type") or "percentage").lower()
        if dtype not in ("percentage", "fixed"):
            raise HTTPException(422, "discount_type must be 'percentage' or 'fixed'")
        val = float(body.get("discount_value") or 0)
        if val < 0:
            raise HTTPException(422, "discount_value must be ≥ 0")
        if dtype == "percentage" and val > 100:
            raise HTTPException(422, "percentage discount cannot exceed 100")
        scope = body.get("scope") or {"mode": "all", "ids": []}
        if scope.get("mode") not in ("all", "designs", "categories", "feature_packs", "portfolio", "storage"):
            raise HTTPException(422, "invalid campaign scope mode")
        return {
            "name": (body.get("name") or "").strip() or "Campaign",
            "description": body.get("description", ""), "banner_text": body.get("banner_text", ""),
            "start_at": body.get("start_at"), "end_at": body.get("end_at"),
            "active": bool(body.get("active", False)), "discount_type": dtype,
            "discount_value": val, "scope": {"mode": scope.get("mode", "all"), "ids": list(scope.get("ids") or [])},
            "priority": int(body.get("priority") or 0), "stackable": False, "updated_at": _now(),
        }

    @router.post("/api/admin/pricing/campaigns")
    async def create_campaign(body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        doc = {"id": _uid("camp"), **_campaign_doc(body), "created_at": _now()}
        await db.pricing_campaigns.insert_one(doc)
        await _audit("campaign", doc["id"], "create", None, doc, admin)
        return doc

    @router.put("/api/admin/pricing/campaigns/{camp_id}")
    async def update_campaign(camp_id: str, body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.pricing_campaigns.find_one({"id": camp_id})
        if not before:
            raise HTTPException(404, "Campaign not found")
        doc = _campaign_doc({**_clean(dict(before)), **body})
        await db.pricing_campaigns.update_one({"id": camp_id}, {"$set": doc})
        await _audit("campaign", camp_id, "update", _clean(before), doc, admin)
        return {"saved": True, **doc}

    @router.post("/api/admin/pricing/campaigns/{camp_id}/toggle")
    async def toggle_campaign(camp_id: str, admin=Depends(require_super_admin)):
        before = await db.pricing_campaigns.find_one({"id": camp_id})
        if not before:
            raise HTTPException(404, "Campaign not found")
        new_state = not bool(before.get("active"))
        await db.pricing_campaigns.update_one({"id": camp_id}, {"$set": {"active": new_state, "updated_at": _now()}})
        await _audit("campaign", camp_id, "toggle", bool(before.get("active")), new_state, admin)
        return {"id": camp_id, "active": new_state}

    @router.delete("/api/admin/pricing/campaigns/{camp_id}")
    async def delete_campaign(camp_id: str, admin=Depends(require_super_admin)):
        before = await db.pricing_campaigns.find_one({"id": camp_id})
        await db.pricing_campaigns.delete_one({"id": camp_id})
        await _audit("campaign", camp_id, "delete", _clean(before) if before else None, None, admin)
        return {"deleted": True}

    # ================================================================== #
    # PORTFOLIO / STORAGE PLANS (durations + config)
    # ================================================================== #
    @router.get("/api/admin/pricing/plans")
    async def list_plans(product: str = Query(""), _a=Depends(require_super_admin)):
        rows = await _all(db.subscription_plans)
        if product:
            rows = [r for r in rows if r.get("product") == product]
        rows.sort(key=lambda r: (r.get("product") or "", int(r.get("sort_order") or 0)))
        return {"plans": rows, "cycles": list(BILLING_CYCLES)}

    @router.put("/api/admin/pricing/plans/{plan_id}")
    async def update_plan(plan_id: str, body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.subscription_plans.find_one({"id": plan_id})
        if not before:
            raise HTTPException(404, "Plan not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        if before.get("product") == "portfolio":
            # Portfolio `durations` are DERIVED from base_monthly, never accepted
            # from the client (docs/PRICING_REDESIGN_2026.md §5). Before this,
            # THIS endpoint wrote `durations` directly while subscription_service.
            # upsert_plan wrote `base_monthly` on the very same plan doc — nothing
            # kept the two in sync, so a super-admin editing the price from one
            # editor left the OTHER editor's number on display, and the public
            # pricing cards (durations readers) and checkout (base_monthly
            # reader) could silently show two different prices for one plan.
            # Any `durations` in `body` is ignored/overwritten by the recompute.
            if "base_monthly" in body:
                upd["base_monthly"] = _price(body["base_monthly"], label="base_monthly")
            if "setup_fee_inr" in body:
                upd["setup_fee_inr"] = _price(body["setup_fee_inr"], label="setup_fee_inr")
            upd.update(sync_plan_durations({**before, **upd}))
        elif "durations" in body and isinstance(body["durations"], dict):
            durations = dict(before.get("durations") or {})
            for cyc, price in body["durations"].items():
                if str(cyc) not in BILLING_CYCLES:
                    raise HTTPException(422, f"invalid billing cycle '{cyc}'")
                durations[str(cyc)] = None if price in (None, "") else _price(price, label=f"{cyc}-month price")
            upd["durations"] = durations
        for k in ("name", "description", "active", "storage_gb", "capacity_gb",
                  "community_tier", "ai_features", "white_label", "custom_domain",
                  "team_members", "priority_support", "featured_placement",
                  "advanced_analytics", "sort_order"):
            if k in body:
                upd[k] = body[k]
        if "name" in upd:
            dupes = [p.get("name", "") for p in await _all(db.subscription_plans)
                     if p.get("id") != plan_id and p.get("product") == before.get("product")]
            try:
                upd["name"] = validate_unique_name(dupes, str(upd["name"]), label="plan name")
            except PricingError as e:
                raise HTTPException(422, str(e))
        await db.subscription_plans.update_one({"id": plan_id}, {"$set": upd})
        await _audit("plan", plan_id, "update", _clean(before), upd, admin)
        return {"saved": True, **upd}

    # ================================================================== #
    # COMMUNITY SETTINGS
    # ================================================================== #
    @router.get("/api/admin/pricing/community")
    async def get_community(_a=Depends(require_super_admin)):
        doc = await db.community_settings.find_one({"id": "community_settings"})
        return _clean(doc) if doc else {"tiers": {}, "capabilities": list(COMMUNITY_CAPS)}

    @router.put("/api/admin/pricing/community")
    async def put_community(body: Dict[str, Any] = Body(...), admin=Depends(require_super_admin)):
        before = await db.community_settings.find_one({"id": "community_settings"})
        tiers = body.get("tiers") or {}
        clean = {tier: {cap: bool(caps.get(cap)) for cap in COMMUNITY_CAPS}
                 for tier, caps in tiers.items() if tier in ("free", "basic", "premium", "pro")}
        doc = {"id": "community_settings", "tiers": clean,
               "capabilities": list(COMMUNITY_CAPS), "updated_at": _now()}
        await db.community_settings.update_one(
            {"id": "community_settings"}, {"$set": doc}, upsert=True)
        await _audit("community", "community_settings", "update",
                     _clean(before) if before else None, doc, admin)
        return {"saved": True, "tiers": clean}

    # ================================================================== #
    # PRICING SIMULATOR (same resolver as production checkout)
    # ================================================================== #
    @router.post("/api/admin/pricing/simulate")
    async def simulate(body: Dict[str, Any] = Body(...), _a=Depends(require_super_admin)):
        kind = (body.get("kind") or "wedding").lower()
        try:
            if kind == "wedding":
                return await quote_wedding(
                    db, design_id=body.get("design_id"),
                    feature_pack_key=body.get("feature_pack_key"),
                    duration_id=body.get("duration_id"))
            return await quote_plan(db, plan_id=body.get("plan_id"),
                                    cycle=str(body.get("cycle") or "1"),
                                    kind=body.get("plan_kind") or "portfolio")
        except PricingError as e:
            raise HTTPException(422, str(e))

    # ================================================================== #
    # PUBLIC — catalog + quote (checkout reads these; no auth)
    # ================================================================== #
    @router.get("/api/pricing/catalog")
    async def public_catalog():
        designs = [d for d in await _all(db.pricing_design_prices, {"audience": "normal_user"})
                   if d.get("active", True)]
        for d in designs:
            d["final_price"] = effective_design_price(d)
        packs = [p for p in await _all(db.feature_packs) if p.get("active", True)]
        packs.sort(key=lambda r: int(r.get("sort") or 0))
        durations = [d for d in await _all(db.link_duration_tiers) if d.get("active", True)]
        durations.sort(key=lambda r: int(r.get("sort") or 0))
        cats = [c for c in await _all(db.design_categories) if c.get("active", True)]
        cats.sort(key=lambda r: int(r.get("sort") or 0))
        return {"designs": designs, "categories": cats,
                "feature_packs": packs, "link_durations": durations}

    @router.post("/api/pricing/quote")
    async def public_quote(body: Dict[str, Any] = Body(...)):
        try:
            return await quote_wedding(
                db, design_id=body.get("design_id"),
                feature_pack_key=body.get("feature_pack_key"),
                duration_id=body.get("duration_id"))
        except PricingError as e:
            raise HTTPException(422, str(e))

    @router.post("/api/pricing/plan-quote")
    async def public_plan_quote(body: Dict[str, Any] = Body(...)):
        try:
            return await quote_plan(db, plan_id=body.get("plan_id"),
                                    cycle=str(body.get("cycle") or "1"),
                                    kind=body.get("kind") or "portfolio")
        except PricingError as e:
            raise HTTPException(422, str(e))

    @router.get("/api/campaigns/active")
    async def public_active_campaigns():
        now = _now()
        out = []
        for c in await _all(db.pricing_campaigns):
            if not c.get("active"):
                continue
            if (c.get("start_at") and c["start_at"] > now) or (c.get("end_at") and c["end_at"] < now):
                continue
            out.append({"id": c["id"], "name": c.get("name"), "banner_text": c.get("banner_text"),
                        "discount_type": c.get("discount_type"), "discount_value": c.get("discount_value"),
                        "scope": c.get("scope")})
        return {"campaigns": out}

    return router
