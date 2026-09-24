"""
qr_analytics.py — QR photo-sharing analytics (Phase 8).

Aggregates the live-gallery / QR activity the platform generates but never
surfaced to admins: scans, uploads per gallery, uploads per event, failed
uploads, storage consumed, guest-vs-studio split, and the busiest events.

QR *scans* were not tracked, so this adds a real counter: `record_scan(db, slug)`
resolves the invitation and increments `qr_scan_counts[wedding_id]`; the guest
live-gallery page pings it once on open. Everything else is computed from the
existing `live_gallery_photos` + `upload_logs` collections.

    from qr_analytics import build_qr_analytics_router, record_scan
    app.include_router(build_qr_analytics_router(db, require_admin))
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Any, List

from fastapi import APIRouter, Depends, Request

logger = logging.getLogger("qr_analytics")

GUEST_SOURCES = {"guest"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_scan(db, slug: str) -> bool:
    """Increment the scan counter for the invitation behind `slug`. Guarded."""
    try:
        prof = await db.profiles.find_one({"slug": slug}, {"_id": 0})
        wid = (prof or {}).get("id")
        if not wid:
            return False
        existing = await db.qr_scan_counts.find_one({"wedding_id": wid}, {"_id": 0})
        if existing:
            await db.qr_scan_counts.update_one(
                {"wedding_id": wid},
                {"$set": {"count": int(existing.get("count", 0)) + 1, "last_scan": _now()}})
        else:
            await db.qr_scan_counts.insert_one({"wedding_id": wid, "count": 1, "last_scan": _now()})
        return True
    except Exception as e:
        logger.warning("[qr] record_scan(%s) failed: %s", slug, e)
        return False


async def _all(db, coll: str, limit: int = 200000) -> List[dict]:
    try:
        rows = await getattr(db, coll).find({}, {"_id": 0}).to_list(limit)
        for r in rows:
            r.pop("_id", None)
        return rows
    except Exception:
        return []


async def compute_qr_analytics(db, top_n: int = 10) -> Dict[str, Any]:
    photos = await _all(db, "live_gallery_photos")
    scans = await _all(db, "qr_scan_counts")
    logs = await _all(db, "upload_logs")

    uploads_by_event: Dict[str, int] = defaultdict(int)
    bytes_by_event: Dict[str, int] = defaultdict(int)
    guest = studio = total_bytes = 0
    for p in photos:
        wid = p.get("wedding_id") or p.get("profile_id") or "unknown"
        uploads_by_event[wid] += 1
        sz = int(p.get("file_size") or 0)
        bytes_by_event[wid] += sz
        total_bytes += sz
        if (p.get("source") or "").lower() in GUEST_SOURCES:
            guest += 1
        else:
            studio += 1

    scans_by_event = {s.get("wedding_id"): int(s.get("count") or 0) for s in scans}
    total_scans = sum(scans_by_event.values())
    failed_uploads = len([l for l in logs if (l.get("status") or "").lower() == "failed"])

    galleries = len(set(uploads_by_event) | set(scans_by_event))
    total_uploads = len(photos)
    # scan→upload conversion: of QR opens, how many led to an upload (bounded 0-100)
    conversion = round(min(total_uploads / total_scans, 1.0) * 100, 1) if total_scans else 0.0

    top = sorted(uploads_by_event.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    top_events = [{"wedding_id": wid, "uploads": n,
                   "scans": scans_by_event.get(wid, 0),
                   "storage_mb": round(bytes_by_event.get(wid, 0) / (1024 * 1024), 1)} for wid, n in top]

    return {
        "generated_at": _now(),
        "galleries": galleries,
        "total_scans": total_scans,
        "total_uploads": total_uploads,
        "guest_uploads": guest,
        "studio_uploads": studio,
        "failed_uploads": failed_uploads,
        "scan_to_upload_pct": conversion,
        "uploads_per_gallery_avg": round(total_uploads / galleries, 1) if galleries else 0.0,
        "storage_bytes": total_bytes,
        "storage_gb": round(total_bytes / (1024 ** 3), 3),
        "top_events": top_events,
    }


def build_qr_analytics_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["qr-analytics"])

    @router.post("/api/public/qr-scan/{slug}")
    async def qr_scan(slug: str, request: Request):
        # Public, unauthenticated (a guest opening the gallery). Throttle so it
        # can't be spammed into fake numbers.
        try:
            from cache_backend import rate_limit_allow
            ip = request.client.host if request and request.client else "unknown"
            if not await rate_limit_allow(f"qrscan:{ip}:{slug}", limit=5, window_seconds=3600):
                return {"ok": True}
        except Exception:
            pass
        await record_scan(db, slug)
        return {"ok": True}

    @router.get("/api/admin/qr-analytics")
    async def qr_overview(admin=Depends(require_admin)):
        return await compute_qr_analytics(db)

    return router
