"""
profitability.py — unit-economics / P&L estimate (Phase 14).

Revenue is REAL (reuses business_intelligence over subscriptions + orders). Costs
are ESTIMATES built from real volumes × clearly-labelled, env-configurable rates:

  storage   — storage_analytics monthly estimate (used GB × STORAGE_COST_INR_PER_GB)
  sms       — sms sends (delivery_log) × SMS_COST_INR
  email     — email sends (delivery_log) × EMAIL_COST_INR
  face      — face operations × REKOGNITION_COST_INR
  payments  — revenue × PAYMENT_FEE_PCT (gateway fee)

Every rate is surfaced in `assumptions` so the number is auditable, never a black
box. This is a planning tool, not accounting.

    from profitability import build_profitability_router
    app.include_router(build_profitability_router(db, require_admin))
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from fastapi import APIRouter, Depends

logger = logging.getLogger("profitability")


def _rate(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except Exception:
        return default


async def _count(db, coll: str, pred=None) -> int:
    try:
        rows = await getattr(db, coll).find({}, {"_id": 0}).to_list(200000)
        return len([r for r in rows if (pred is None or pred(r))]) if pred else len(rows)
    except Exception:
        return 0


async def compute_profitability(db, days: int = 30) -> Dict[str, Any]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # --- revenue (real) ---
    from business_intelligence import compute_bi
    bi = await compute_bi(db, days=days)
    revenue = bi["revenue"]["window_inr"]

    # --- volumes (real) ---
    sms = await _count(db, "delivery_log", lambda r: r.get("channel") == "sms" and (r.get("created_at") or "") >= since)
    email = await _count(db, "delivery_log", lambda r: r.get("channel") == "email" and (r.get("created_at") or "") >= since)
    # face operations — count guarded across likely collections; 0 if none exist.
    face = 0
    for coll in ("face_searches", "photo_requests", "gallery_face_ops"):
        face = await _count(db, coll, lambda r: (r.get("created_at") or "") >= since)
        if face:
            break

    # --- storage cost (real usage × labelled rate) ---
    from storage_analytics import compute_storage
    storage_cost = (await compute_storage(db))["cost_estimate"]["monthly_inr"]

    # --- rates ---
    sms_rate = _rate("SMS_COST_INR", 0.20)
    email_rate = _rate("EMAIL_COST_INR", 0.10)
    face_rate = _rate("REKOGNITION_COST_INR", 0.10)
    fee_pct = _rate("PAYMENT_FEE_PCT", 2.0)

    costs = {
        "storage_inr": round(storage_cost, 2),
        "sms_inr": round(sms * sms_rate, 2),
        "email_inr": round(email * email_rate, 2),
        "face_inr": round(face * face_rate, 2),
        "payment_fees_inr": round(revenue * fee_pct / 100, 2),
    }
    total_cost = round(sum(costs.values()), 2)
    profit = round(revenue - total_cost, 2)
    margin = round(profit / revenue * 100, 1) if revenue else 0.0

    return {
        "window_days": days,
        "revenue_inr": revenue,
        "costs": costs,
        "total_cost_inr": total_cost,
        "profit_inr": profit,
        "margin_pct": margin,
        "volumes": {"sms_sends": sms, "email_sends": email, "face_ops": face},
        "assumptions": {
            "storage_inr_per_gb": _rate("STORAGE_COST_INR_PER_GB", 2.0),
            "sms_inr": sms_rate, "email_inr": email_rate,
            "face_inr": face_rate, "payment_fee_pct": fee_pct,
            "note": "Costs are estimates from real volumes × configurable rates; not accounting.",
        },
    }


def build_profitability_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["profitability"])

    @router.get("/api/admin/profitability")
    async def profitability(days: int = 30, admin=Depends(require_admin)):
        return await compute_profitability(db, days=max(1, min(365, int(days or 30))))

    return router
