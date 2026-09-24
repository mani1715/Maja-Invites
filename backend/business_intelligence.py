"""
business_intelligence.py — the executive BI dashboard (Phase 11).

Computes the subscription-business metrics the platform was missing (the audits
flagged: revenue totals existed, but no MRR/ARR/churn/retention/conversion). All
figures are derived from REAL collections — subscriptions, users, admins,
invitation_orders / credit_purchases, referrals / photographer_referrals,
gift_code_redemptions — never seeded or faked. Missing data yields zeros, not
guesses.

Money is stored in paise; outputs expose both `_paise` and rounded `_inr`.

    from business_intelligence import build_bi_router
    app.include_router(build_bi_router(db, require_admin))
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends

logger = logging.getLogger("bi")

ACTIVE_SUB = "active"
CHURNED = {"cancelled", "canceled", "expired"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso)
    except Exception:
        return None


def _cycle_months(cycle: Optional[str]) -> int:
    c = (cycle or "monthly").lower()
    if any(k in c for k in ("year", "annual")):
        return 12
    if "half" in c or "semi" in c:
        return 6
    if "quarter" in c:
        return 3
    return 1


def _amount_paise(doc: dict) -> int:
    q = doc.get("quote") or {}
    for src in (q, doc):
        for k in ("total_paise", "amount_paise", "price_paise", "amount"):
            v = src.get(k)
            if isinstance(v, (int, float)) and v > 0:
                return int(v)
    return 0


def _sub_monthly_paise(sub: dict) -> int:
    """Normalise a subscription's cycle price to a monthly run-rate (MRR)."""
    total = _amount_paise(sub)
    return int(round(total / _cycle_months(sub.get("cycle"))))


def _inr(paise: int) -> float:
    return round((paise or 0) / 100, 2)


def _month_key(iso: Optional[str]) -> Optional[str]:
    d = _parse(iso)
    return d.strftime("%Y-%m") if d else None


async def _all(db, coll: str, limit: int = 200000) -> List[dict]:
    try:
        rows = await getattr(db, coll).find({}, {"_id": 0}).to_list(limit)
        for r in rows:
            r.pop("_id", None)
        return rows
    except Exception:
        return []


async def compute_bi(db, days: int = 30) -> Dict[str, Any]:
    now = _now()
    since = now - timedelta(days=days)
    since_iso = since.isoformat()

    subs = await _all(db, "subscriptions")
    active = [s for s in subs if (s.get("status") or "").lower() == ACTIVE_SUB]
    mrr_paise = sum(_sub_monthly_paise(s) for s in active)

    # by product / tier
    by_product: Dict[str, int] = defaultdict(int)
    for s in active:
        by_product[s.get("product") or "unknown"] += 1

    # new + churned in window → churn rate
    new_subs = [s for s in subs if (s.get("created_at") or "") >= since_iso]
    churned = [s for s in subs if (s.get("status") or "").lower() in CHURNED
               and (s.get("cancelled_at") or s.get("updated_at") or s.get("created_at") or "") >= since_iso]
    churn_base = len(active) + len(churned)
    churn_rate = round(len(churned) / churn_base * 100, 2) if churn_base else 0.0

    # signups + growth (users + photographers)
    users = await _all(db, "users")
    admins = await _all(db, "admins")

    def _signup_series(rows, key):
        m: Dict[str, int] = defaultdict(int)
        for r in rows:
            mk = _month_key(r.get(key))
            if mk:
                m[mk] += 1
        return m

    user_series = _signup_series(users, "created_at")
    admin_series = _signup_series(admins, "created_at")
    months = sorted(set(user_series) | set(admin_series))[-12:]
    growth = [{"month": mo, "couples": user_series.get(mo, 0), "photographers": admin_series.get(mo, 0)} for mo in months]
    new_users_30 = len([u for u in users if (u.get("created_at") or "") >= since_iso])
    new_admins_30 = len([a for a in admins if (a.get("created_at") or "") >= since_iso])

    # activation + conversion (photographers)
    published = await _all(db, "portfolio_profiles")
    published_ids = {p.get("admin_id") or p.get("id") for p in published if p.get("is_published")}
    paid_admin_ids = {s.get("studio_id") for s in active if s.get("studio_id")}
    total_admins = len(admins) or 1
    activated_admins = len({*published_ids, *paid_admin_ids} - {None})
    conversion_rate = round(len(paid_admin_ids) / total_admins * 100, 2)
    activation_rate = round(activated_admins / total_admins * 100, 2)

    # referrals + coupons
    referrals = await _all(db, "referrals")
    photog_referrals = await _all(db, "photographer_referrals")
    redemptions = await _all(db, "gift_code_redemptions")

    # revenue — sum paid amounts across the money collections (guarded, real fields)
    revenue_events: List[dict] = []
    for s in subs:
        if (s.get("status") or "").lower() in (ACTIVE_SUB, "paid", "past_due"):
            revenue_events.append({"amount": _amount_paise(s), "at": s.get("created_at")})
    for coll in ("invitation_orders", "credit_purchases"):
        for r in await _all(db, coll):
            st = (r.get("status") or "").lower()
            if st in ("paid", "completed", "success", "captured") or _amount_paise(r) > 0 and not st:
                revenue_events.append({"amount": _amount_paise(r), "at": r.get("created_at") or r.get("paid_at")})
    total_rev = sum(e["amount"] for e in revenue_events)
    rev_30 = sum(e["amount"] for e in revenue_events if (e.get("at") or "") >= since_iso)
    rev_month: Dict[str, int] = defaultdict(int)
    for e in revenue_events:
        mk = _month_key(e.get("at"))
        if mk:
            rev_month[mk] += e["amount"]
    revenue_series = [{"month": mo, "revenue_inr": _inr(rev_month[mo])} for mo in sorted(rev_month)[-12:]]

    return {
        "generated_at": now.isoformat(),
        "window_days": days,
        "recurring": {
            "mrr_paise": mrr_paise, "mrr_inr": _inr(mrr_paise),
            "arr_paise": mrr_paise * 12, "arr_inr": _inr(mrr_paise * 12),
            "active_subscriptions": len(active),
            "by_product": dict(by_product),
            "new_subscriptions_window": len(new_subs),
            "churned_window": len(churned),
            "churn_rate_pct": churn_rate,
        },
        "growth": {
            "total_couples": len(users), "total_photographers": len(admins),
            "new_couples_window": new_users_30, "new_photographers_window": new_admins_30,
            "monthly": growth,
        },
        "funnel": {
            "photographer_conversion_pct": conversion_rate,
            "photographer_activation_pct": activation_rate,
            "paid_photographers": len(paid_admin_ids),
            "activated_photographers": activated_admins,
        },
        "revenue": {
            "total_paise": total_rev, "total_inr": _inr(total_rev),
            "window_paise": rev_30, "window_inr": _inr(rev_30),
            "monthly": revenue_series,
        },
        "referrals": {
            "total": len(referrals) + len(photog_referrals),
            "couple_referrals": len(referrals), "photographer_referrals": len(photog_referrals),
        },
        "coupons": {"redemptions": len(redemptions)},
    }


def build_bi_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["business-intelligence"])

    @router.get("/api/admin/bi/overview")
    async def bi_overview(days: int = 30, admin=Depends(require_admin)):
        return await compute_bi(db, days=max(1, min(365, int(days or 30))))

    return router
