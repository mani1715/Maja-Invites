"""
storage_analytics.py — Storage Command Center (Phase 6).

REAL usage from the platform's own data — `backup_files.size_bytes` (per studio),
the Google-Drive pool `storage_accounts` (capacity/committed bytes), storage-plan
quotas, and `upload_logs` for failed uploads. The ONLY estimate is the monthly
cost, computed as used-GB × a configurable rate (`STORAGE_COST_INR_PER_GB`, an
honest planning figure, clearly labelled — not billing data).

    from storage_analytics import build_storage_analytics_router
    app.include_router(build_storage_analytics_router(db, require_admin))
"""
from __future__ import annotations

import os
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from fastapi import APIRouter, Depends

logger = logging.getLogger("storage_analytics")

GB = 1024 ** 3
DEFAULT_COST_INR_PER_GB = 2.0   # planning estimate (≈ S3 standard); override via env


def _gb(b: int) -> float:
    return round((b or 0) / GB, 3)


async def _all(db, coll: str) -> List[dict]:
    try:
        rows = await getattr(db, coll).find({}, {"_id": 0}).to_list(200000)
        for r in rows:
            r.pop("_id", None)
        return rows
    except Exception:
        return []


async def compute_storage(db) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=30)).isoformat()

    files = [f for f in await _all(db, "backup_files") if not f.get("deleted")]
    total_bytes = sum(int(f.get("size_bytes", 0)) for f in files)

    by_studio: Dict[str, int] = defaultdict(int)
    by_month: Dict[str, int] = defaultdict(int)
    for f in files:
        by_studio[f.get("studio_id") or f.get("admin_id") or "unknown"] += int(f.get("size_bytes", 0))
        mk = (f.get("created_at") or "")[:7]
        if mk:
            by_month[mk] += int(f.get("size_bytes", 0))
    top = sorted(by_studio.items(), key=lambda kv: kv[1], reverse=True)[:20]

    # Google-Drive pool
    accounts = await _all(db, "storage_accounts")
    pool_capacity = sum(int(a.get("capacity_bytes", 0)) for a in accounts)
    pool_used = sum(int(a.get("committed_bytes", 0)) for a in accounts)
    active_accounts = [a for a in accounts if not a.get("disabled")]

    # storage plans (quota sold)
    plans = await _all(db, "studio_storage_plans")
    active_plans = [p for p in plans if (p.get("status") or "active") == "active"]
    sold_gb = sum(int(p.get("gb_limit", 0)) for p in active_plans)

    # failed uploads (last 30d)
    ulogs = await _all(db, "upload_logs")
    failed_uploads = len([u for u in ulogs if u.get("status") == "failed" and (u.get("started_at") or u.get("created_at") or "") >= since])

    rate = float(os.environ.get("STORAGE_COST_INR_PER_GB", DEFAULT_COST_INR_PER_GB))
    used_gb = _gb(total_bytes + pool_used)
    est_cost = round(used_gb * rate, 2)

    return {
        "generated_at": now.isoformat(),
        "usage": {
            "backup_used_gb": _gb(total_bytes),
            "pool_used_gb": _gb(pool_used),
            "pool_capacity_gb": _gb(pool_capacity),
            "pool_used_pct": round(pool_used / pool_capacity * 100, 1) if pool_capacity else 0.0,
            "total_used_gb": used_gb,
            "sold_quota_gb": sold_gb,
            "files": len(files),
        },
        "cost_estimate": {
            "inr_per_gb": rate,
            "monthly_inr": est_cost,
            "note": "Estimate = used GB × configurable rate (STORAGE_COST_INR_PER_GB); not billing data.",
        },
        "top_consumers": [{"studio_id": sid, "used_gb": _gb(b)} for sid, b in top],
        "growth_monthly": [{"month": m, "added_gb": _gb(by_month[m])} for m in sorted(by_month)[-12:]],
        "providers": {
            "drive_accounts": len(accounts),
            "drive_active": len(active_accounts),
            "pool_capacity_gb": _gb(pool_capacity),
            "pool_used_gb": _gb(pool_used),
        },
        "health": {
            "failed_uploads_30d": failed_uploads,
            "active_storage_plans": len(active_plans),
        },
    }


def build_storage_analytics_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["storage-analytics"])

    @router.get("/api/admin/storage/overview")
    async def overview(admin=Depends(require_admin)):
        return await compute_storage(db)

    return router
