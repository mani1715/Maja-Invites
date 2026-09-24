"""
founding_admin.py — super-admin controls for the Founding-100 pricing.

    GET   /api/super-admin/founding/status          live state + settings + plan prices
    PATCH /api/super-admin/founding/settings        enable/disable, limit, auto-switch
    POST  /api/super-admin/founding/apply-catalogue  write the approved catalogue
    PATCH /api/super-admin/founding/portfolio/{plan_key} edit one plan's regular/founding prices (plan id, or an unambiguous tier name)

Everything is super-admin gated. Nothing here is reachable by a normal user, and the
public pages keep serving regular pricing until founding is switched on here.
"""
from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from founding_pricing import (
    founding_status, get_founding_settings, update_founding_settings,
    seed_founding_settings, apply_founding_portfolio_catalogue,
    set_portfolio_plan_prices, portfolio_cards, AmbiguousPlanKey,
)


# These MUST live at module scope. This module uses
# `from __future__ import annotations`, so a handler's `body: SettingsPatch`
# annotation is a string that Pydantic resolves against the MODULE globals —
# a class defined inside the router builder is invisible there. It failed
# loudly but late: `TypeAdapter[ForwardRef('SettingsPatch')] is not fully
# defined`, which 500'd /openapi.json (killing /docs and /redoc) and broke
# body parsing on the two PATCH routes below, so founding pricing could be
# read but never saved. Same root cause as the dead event-purchase webhook.
class SettingsPatch(BaseModel):
    founding_users_enabled: Optional[bool] = None
    founding_user_limit: Optional[int] = None
    auto_switch_to_regular_pricing: Optional[bool] = None


class PlanPricePatch(BaseModel):
    durations: Optional[Dict[str, int]] = None
    durations_founding: Optional[Dict[str, int]] = None


def build_founding_admin_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["founding-admin"])

    async def _snapshot() -> dict:
        st = await founding_status(db)
        settings = await get_founding_settings(db)
        plans = await db.subscription_plans.find({"product": "portfolio"}).to_list(100)
        for p in plans:
            p.pop("_id", None)
        # Show both prices per cycle (founding mode carries regular_price + founding_price).
        return {"status": st, "settings": settings,
                "plans": portfolio_cards(plans, "founding")}

    @router.get("/api/super-admin/founding/status")
    async def founding_admin_status(_su=Depends(require_super_admin)):
        return await _snapshot()

    @router.patch("/api/super-admin/founding/settings")
    async def founding_admin_settings(body: SettingsPatch, _su=Depends(require_super_admin)):
        try:
            await update_founding_settings(db, body.dict(exclude_none=True))
        except ValueError as e:
            raise HTTPException(400, str(e))
        return await _snapshot()

    @router.post("/api/super-admin/founding/apply-catalogue")
    async def founding_admin_apply(_su=Depends(require_super_admin)):
        await seed_founding_settings(db)
        res = await apply_founding_portfolio_catalogue(db)
        snap = await _snapshot()
        snap["applied"] = res
        return snap

    # `{plan_key}` is a plan id, or a tier name while that name is unique. The
    # console sends the id; the tier form is kept so older links still resolve.
    @router.patch("/api/super-admin/founding/portfolio/{plan_key}")
    async def founding_admin_plan(plan_key: str, body: PlanPricePatch, _su=Depends(require_super_admin)):
        try:
            await set_portfolio_plan_prices(db, plan_key, body.durations, body.durations_founding)
        except AmbiguousPlanKey as e:
            # 409, not 404: the plan exists — several do, and picking one would
            # be writing a price onto a plan the owner did not choose.
            raise HTTPException(409, str(e))
        except ValueError as e:
            raise HTTPException(404, str(e))
        return await _snapshot()

    return router
