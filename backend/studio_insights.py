"""
studio_insights.py — a photographer's OWN analytics, surfaced in-panel.

Closes the audit gap: the platform already computes QR-gallery, storage and
face-search analytics, but ONLY the super-admin could see them (aggregated across
every studio). A photographer had no scoped view of their own numbers.

This reuses the exact same signals — `live_gallery_photos` + `qr_scan_counts`
(QR/gallery), `backup_files` (studio storage), `gallery_photos.face_count`
(face search) — but scopes every aggregate to the invitations the caller owns
(`db.profiles.admin_id == me`). Nothing here reads another studio's data: the
owned-profile id set is the hard boundary, taken from the token's admin id, never
from a request parameter.

    from studio_insights import build_studio_insights_router
    app.include_router(build_studio_insights_router(db, get_current_admin))
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Set

from fastapi import APIRouter, Depends

logger = logging.getLogger("studio_insights")

GB = 1024 ** 3
GUEST_SOURCES = {"guest"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gb(b: int) -> float:
    return round((b or 0) / GB, 3)


def _mb(b: int) -> float:
    return round((b or 0) / (1024 * 1024), 1)


async def _find(db, coll: str, flt: dict, limit: int = 200000) -> List[dict]:
    try:
        rows = await getattr(db, coll).find(flt, {"_id": 0}).to_list(limit)
        for r in rows:
            r.pop("_id", None)
        return rows
    except Exception:
        return []


async def _owned_profiles(db, admin_id: str) -> List[dict]:
    """Every invitation this studio owns. The scope boundary for all insights."""
    return await _find(db, "profiles", {"admin_id": admin_id})


def _owned_ids(profiles: List[dict]) -> Set[str]:
    ids: Set[str] = set()
    for p in profiles:
        if p.get("id"):
            ids.add(p["id"])
    return ids


async def compute_insights(db, admin_id: str, days: int = 90) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()

    profiles = await _owned_profiles(db, admin_id)
    owned = _owned_ids(profiles)
    slug_by_id = {p["id"]: p.get("slug") for p in profiles if p.get("id")}
    name_by_id = {p["id"]: (p.get("couple_names") or p.get("event_name") or p.get("slug") or p["id"])
                  for p in profiles if p.get("id")}

    # ---- QR / live gallery (scoped) --------------------------------------
    photos = [p for p in await _find(db, "live_gallery_photos", {})
              if (p.get("wedding_id") or p.get("profile_id")) in owned]
    scans = [s for s in await _find(db, "qr_scan_counts", {})
             if s.get("wedding_id") in owned]

    uploads_by_event: Dict[str, int] = defaultdict(int)
    bytes_by_event: Dict[str, int] = defaultdict(int)
    guest = studio = total_bytes = 0
    for p in photos:
        wid = p.get("wedding_id") or p.get("profile_id")
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
    total_uploads = len(photos)
    galleries = len(set(uploads_by_event) | set(scans_by_event))
    conversion = round(min(total_uploads / total_scans, 1.0) * 100, 1) if total_scans else 0.0

    top = sorted(uploads_by_event.items(), key=lambda kv: kv[1], reverse=True)[:10]
    top_events = [{"wedding_id": wid, "name": name_by_id.get(wid, wid),
                   "slug": slug_by_id.get(wid), "uploads": n,
                   "scans": scans_by_event.get(wid, 0),
                   "storage_mb": _mb(bytes_by_event.get(wid, 0))} for wid, n in top]

    qr = {
        "galleries": galleries,
        "total_scans": total_scans,
        "total_uploads": total_uploads,
        "guest_uploads": guest,
        "studio_uploads": studio,
        "scan_to_upload_pct": conversion,
        "uploads_per_gallery_avg": round(total_uploads / galleries, 1) if galleries else 0.0,
        "gallery_storage_gb": _gb(total_bytes),
        "top_events": top_events,
    }

    # ---- Studio storage (scoped: backup_files owned by this studio) -------
    files = [f for f in await _find(db, "backup_files", {})
             if (f.get("studio_id") == admin_id or f.get("admin_id") == admin_id) and not f.get("deleted")]
    backup_bytes = sum(int(f.get("size_bytes", 0)) for f in files)
    by_month: Dict[str, int] = defaultdict(int)
    for f in files:
        mk = (f.get("created_at") or "")[:7]
        if mk:
            by_month[mk] += int(f.get("size_bytes", 0))

    plans = await _find(db, "studio_storage_plans", {})
    my_plans = [p for p in plans if (p.get("studio_id") == admin_id or p.get("admin_id") == admin_id)
                and (p.get("status") or "active") == "active"]
    quota_gb = sum(int(p.get("gb_limit", 0)) for p in my_plans)
    used_gb = _gb(backup_bytes)

    storage = {
        "backup_used_gb": used_gb,
        "backup_files": len(files),
        "quota_gb": quota_gb,
        "used_pct": round(used_gb / quota_gb * 100, 1) if quota_gb else 0.0,
        "has_plan": bool(my_plans),
        "growth_monthly": [{"month": m, "added_gb": _gb(by_month[m])} for m in sorted(by_month)[-12:]],
    }

    # ---- Face search (scoped: gallery_photos in owned profiles) -----------
    gphotos = [p for p in await _find(db, "gallery_photos", {})
               if p.get("profile_id") in owned]
    indexed = [p for p in gphotos if int(p.get("face_count", 0)) > 0]
    total_faces = sum(int(p.get("face_count", 0)) for p in gphotos)
    face_collections = len({p.get("profile_id") for p in indexed if p.get("profile_id")})

    searches = [s for s in await _find(db, "face_search_sessions", {})
                if s.get("profile_id") in owned]
    searches_30 = len([s for s in searches if (s.get("created_at") or "") >= since])
    requests = [r for r in await _find(db, "photo_requests", {})
                if r.get("profile_id") in owned]
    requests_30 = len([r for r in requests if (r.get("created_at") or "") >= since])

    face = {
        "collections": face_collections,
        "indexed_photos": len(indexed),
        "indexed_faces": total_faces,
        "total_photos": len(gphotos),
        "searches_total": len(searches),
        "searches_30d": searches_30,
        "photo_requests_total": len(requests),
        "photo_requests_30d": requests_30,
    }

    return {
        "generated_at": _now(),
        "window_days": days,
        "owned_events": len(owned),
        "qr": qr,
        "storage": storage,
        "face": face,
    }


def build_studio_insights_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["studio-insights"])

    @router.get("/api/studio/insights")
    async def insights(days: int = 90, admin_id: str = Depends(get_current_admin)):
        return await compute_insights(db, admin_id, days=max(1, min(365, int(days or 90))))

    return router
