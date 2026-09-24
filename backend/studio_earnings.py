"""
studio_earnings.py — a photographer's consolidated earnings dashboard.

Closes the audit gap: the studio's income was only visible buried inside the giant
Community tab. This surfaces it as a dedicated view from the REAL finance ledger
(`pixora_finance_entries` — income/expense) plus booking counts
(`pixora_bookings`). Scoped to the caller (studio_id = their own admin id).

    from studio_earnings import build_studio_earnings_router
    app.include_router(build_studio_earnings_router(db, get_current_admin))
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from fastapi import APIRouter, Depends

logger = logging.getLogger("studio_earnings")


async def _all(db, coll: str, flt: dict) -> List[dict]:
    try:
        rows = await getattr(db, coll).find(flt, {"_id": 0}).to_list(20000)
        for r in rows:
            r.pop("_id", None)
        return rows
    except Exception:
        return []


async def compute_earnings(db, studio_id: str, days: int = 90) -> Dict[str, Any]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    entries = await _all(db, "pixora_finance_entries", {"studio_id": studio_id})

    def _amt(e):
        return int(e.get("amount_inr") or 0)

    income = sum(_amt(e) for e in entries if e.get("kind") == "income")
    expense = sum(_amt(e) for e in entries if e.get("kind") == "expense")
    win = [e for e in entries if (e.get("date") or "") >= since]
    income_win = sum(_amt(e) for e in win if e.get("kind") == "income")
    expense_win = sum(_amt(e) for e in win if e.get("kind") == "expense")

    by_month: Dict[str, Dict[str, int]] = defaultdict(lambda: {"income": 0, "expense": 0})
    for e in entries:
        mk = (e.get("date") or "")[:7]
        if mk:
            by_month[mk][e.get("kind", "income")] += _amt(e)
    monthly = [{"month": m, "income": by_month[m]["income"], "expense": by_month[m]["expense"],
                "net": by_month[m]["income"] - by_month[m]["expense"]} for m in sorted(by_month)[-12:]]

    by_cat: Dict[str, int] = defaultdict(int)
    for e in entries:
        if e.get("kind") == "income":
            by_cat[e.get("category") or "Uncategorised"] += _amt(e)
    top_income = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:8]

    bookings = await _all(db, "pixora_bookings", {"vendor_owner_id": studio_id})
    b_status: Dict[str, int] = defaultdict(int)
    for b in bookings:
        b_status[b.get("status") or "inquiry"] += 1

    return {
        "window_days": days,
        "totals": {"income_inr": income, "expense_inr": expense, "net_inr": income - expense,
                   "entries": len(entries)},
        "window": {"income_inr": income_win, "expense_inr": expense_win,
                   "net_inr": income_win - expense_win},
        "monthly": monthly,
        "income_by_category": [{"category": c, "inr": v} for c, v in top_income],
        "bookings": {"total": len(bookings), "by_status": dict(b_status)},
    }


def build_studio_earnings_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["studio-earnings"])

    @router.get("/api/studio/earnings")
    async def earnings(days: int = 90, admin_id: str = Depends(get_current_admin)):
        return await compute_earnings(db, admin_id, days=max(1, min(365, int(days or 90))))

    return router
