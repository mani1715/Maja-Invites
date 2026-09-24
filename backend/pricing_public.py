"""
pricing_public.py — public, read-only pricing for the marketing pages.

    GET /api/public/pricing/founding-status   -> {mode, slots_left, limit, count, ...}
    GET /api/public/pricing/portfolio         -> Free + Basic/Premium/Pro Studio, every
                                                 cycle priced for the live founding mode
    GET /api/public/pricing/storage           -> 50GB..1TB add-ons, every cycle priced

Honest by construction: the strike-through each card carries is the REAL regular
price (never a fabricated anchor), and a card only shows a discount when the buyer
genuinely pays less. When founding is disabled or the 100 seats are gone, the cards
serve regular pricing automatically. No auth — these are public marketing prices.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

import pricing_catalog
from founding_pricing import (
    founding_status, get_founding_settings, count_founding_studios,
    portfolio_cards, FREE_PORTFOLIO, CYCLE_LABELS,
)
from pricing_engine import founding_state, effective_design_price, pct_off, _int

logger = logging.getLogger("pricing_public")


def invitation_tiers_payload() -> list:
    """{key, name, components:{digital,video,physical}, all_three_inr} rows from
    pricing_catalog.INVITATION_TIERS (docs §6) — shared by the public pricing
    endpoint below and store_features./api/store/catalog so the marketing page
    and the cart can never disagree on an invitation price."""
    return [
        {"key": key, "name": key.title(), "components": dict(prices),
         "all_three_inr": pricing_catalog.invitation_total(key, ["digital", "video", "physical"])}
        for key, prices in pricing_catalog.INVITATION_TIERS.items()
    ]


def face_match_tiers_payload() -> list:
    """{key, photos, price_inr} rows from pricing_catalog.FACE_MATCH_TIERS (docs §5)."""
    return [{"key": t["key"], "photos": t["photos"], "price_inr": t["price_inr"]}
            for t in pricing_catalog.FACE_MATCH_TIERS]


def design_card(row: dict) -> dict:
    """Pure: one design's public pricing card. `base_price` is the honest original;
    the effective (sale) price is what the buyer pays. A strike-through + % off show
    ONLY when there is a genuine discount."""
    base = _int(row.get("base_price"))
    eff = effective_design_price(row)
    discounted = eff < base and base > 0
    return {
        "design_id": row.get("design_id") or row.get("id"),
        "name": row.get("name") or row.get("design_id"),
        "thumbnail_url": row.get("thumbnail_url"),
        "preview_url": row.get("preview_url"),
        "category_id": row.get("category_id"),
        "original_price": base,
        "price": eff,
        "strikethrough": base if discounted else None,
        "discount_pct": pct_off(base, eff) if discounted else 0,
        "featured": bool(row.get("featured")),
        "best_seller": bool(row.get("best_seller")),
        "new_arrival": bool(row.get("new_arrival")),
    }


def build_public_pricing_router(db) -> APIRouter:
    router = APIRouter(tags=["public-pricing"])

    async def _status() -> dict:
        settings = await get_founding_settings(db)
        count = await count_founding_studios(db)
        return founding_state(settings, count)

    @router.get("/api/public/pricing/founding-status")
    async def founding_status_public():
        return await founding_status(db)

    @router.get("/api/public/pricing/portfolio")
    async def portfolio_pricing():
        st = await _status()
        plans = await db.subscription_plans.find({"product": "portfolio"}).to_list(100)
        # Public surface: published plans only. The comped test plan
        # (plan_portfolio_test, is_active=False) was reaching this response and
        # only stayed invisible because StudioPlanPicker happens to de-dupe by
        # tier client-side (SESSION_CONTEXT §0.0.70 item 6).
        plans = [p for p in plans if p.get("is_active", True)]
        # The ladder must ascend Basic -> Pro -> Advanced -> Premium -> Custom;
        # unsorted DB order interleaved upserted and freshly-inserted rows.
        plans.sort(key=lambda p: (p.get("sort_order") or 99, p.get("tier") or ""))
        for p in plans:
            p.pop("_id", None)
        return {
            "mode": st["mode"],
            "founding": st,
            "cycle_labels": CYCLE_LABELS,
            "free": FREE_PORTFOLIO,
            "plans": portfolio_cards(plans, st["mode"]),
        }

    @router.get("/api/public/pricing/storage")
    async def storage_pricing():
        """Studio backup storage add-ons (docs §4). Reads the LIVE
        `studio_storage_plans` rows, not pricing_catalog directly: the
        super-admin CRUD on those rows is a real feature, and a static payload
        would silently stop reflecting owner edits. The v3 seed derives the
        rows from pricing_catalog, so the two agree until the owner edits one —
        which is exactly when the DB must win.

        Breakdown figures derive from each tier's own monthly row (list =
        monthly x months), so an edited price can never show a stale
        strike-through; `extra_saving` is set when the real cut beats the
        standard 5/10/15 ladder. Rows carry `approved` from the seed —
        admin-created rows default to approved (deliberately priced)."""
        st = await _status()
        try:
            from studio_storage import _ensure_default_plans  # lazy: avoid import cycle
            await _ensure_default_plans(db)
        except Exception:
            # Best-effort: a marketing GET must not 500 because first-boot
            # seeding hiccuped; studio_storage's own endpoints re-seed anyway.
            logger.warning("storage plan seeding from public endpoint failed",
                           exc_info=True)
        rows = await db.studio_storage_plans.find({}, {"_id": 0}).to_list(500)
        rows = [r for r in rows if r.get("is_active", True)]
        founding_mode = st["mode"] == "founding"
        std_pct = {30: 0, 90: 5, 180: 10, 365: 15}
        months_of = {30: 1, 90: 3, 180: 6, 365: 12}

        def eff(row) -> int:
            f = row.get("price_founding_inr")
            return int(f if (founding_mode and f) else row.get("price_inr") or 0)

        by_gb: dict = {}
        for r in rows:
            gb = int(r.get("gb_limit") or 0)
            if gb:
                by_gb.setdefault(gb, []).append(r)

        tiers = []
        for gb in sorted(by_gb):
            group = sorted(by_gb[gb], key=lambda r: int(r.get("duration_days") or 0))
            monthly = next((r for r in group if int(r.get("duration_days") or 0) == 30), None)
            cycles = {}
            for r in group:
                days = int(r.get("duration_days") or 0)
                final_inr = eff(r)
                entry = {
                    "label": (r.get("name") or "").split(" - ")[-1] or f"{days} days",
                    "duration_days": days, "plan_id": r.get("id"),
                    "final_inr": final_inr,
                    "list_inr": None, "save_inr": None,
                    "pct_off": None, "extra_saving": False,
                }
                months = months_of.get(days)
                if monthly and months and months > 1:
                    list_inr = eff(monthly) * months
                    if list_inr > final_inr:
                        pct = pct_off(list_inr, final_inr)
                        entry.update({
                            "list_inr": list_inr,
                            "save_inr": list_inr - final_inr,
                            "pct_off": pct,
                            "extra_saving": pct > std_pct.get(days, 0),
                        })
                cycles[str(days)] = entry
            label = ((group[0].get("name") or "").split(" - ")[0]
                     or (f"{gb // 1024} TB" if gb >= 1024 else f"{gb} GB"))
            tiers.append({
                "gb_limit": gb, "label": label,
                # A tier is unapproved if ANY of its rows carries the seed's
                # approved:False marker — an admin-added row (no marker) must
                # not mask a carried tier still awaiting the owner re-price.
                "approved": not any(r.get("approved") is False for r in group),
                "cycles": cycles,
            })
        return {"mode": st["mode"], "founding": st, "tiers": tiers}

    @router.get("/api/public/pricing/invitations")
    async def invitation_pricing():
        """One-time wedding-invitation tiers (docs §6): three tiers x three
        independent add-on components, pure addition — no GST, no psychological
        rounding, owner prices are exact. Replaces the old static INVITATION_PLANS
        list, which had drifted from what checkout actually charged (this page
        showed Royal at ₹5,999 while store_features.PACKAGES really sold it for
        ₹4,999) — the new shape traces to pricing_catalog.py, so that can't
        happen again."""
        return {"tiers": invitation_tiers_payload()}

    @router.get("/api/public/pricing/face-match")
    async def face_match_pricing():
        """Wave Face Match + QR photo-count SKUs (docs §5). Any other photo count
        is a WhatsApp custom quote, not a fixed price — the frontend builds the
        wa.me link from the central VITE_SUPPORT_WHATSAPP config."""
        return {"tiers": face_match_tiers_payload(), "custom_whatsapp": True}

    @router.get("/api/public/pricing/designs")
    async def design_pricing(limit: int = 60, offset: int = 0, category: str = ""):
        """Every design, individually priced (no category gating). Each card carries its
        own original/sale price + a real discount badge when one is set."""
        rows = await db.pricing_design_prices.find({"audience": "normal_user"}).to_list(5000)
        cat = (category or "").strip().lower()
        cards = []
        for r in rows:
            r.pop("_id", None)
            if r.get("active") is False:
                continue
            if cat and (str(r.get("category_id") or "").lower() != cat):
                continue
            cards.append(design_card(r))
        cards.sort(key=lambda d: (not d["featured"], not d["best_seller"], d["name"] or ""))
        total = len(cards)
        lim = max(1, min(int(limit or 60), 200))
        off = max(0, int(offset or 0))
        return {"total": total, "limit": lim, "offset": off, "designs": cards[off:off + lim]}

    return router
