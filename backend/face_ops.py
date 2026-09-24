"""
face_ops.py — Face Search Operations dashboard (Phase 7).

Real usage from `gallery_photos.face_count`, `face_search_sessions`,
`photo_requests`. Rekognition live status comes from aws_service.healthcheck()
and degrades to `not_configured` when AWS isn't set (the feature is flag-OFF by
default). The rebuild/reindex/retry controls act only when AWS is configured;
otherwise they return a clear `not_configured` — never a fake success.

    from face_ops import build_face_ops_router
    app.include_router(build_face_ops_router(db, require_admin))
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger("face_ops")


async def _count(db, coll: str, query: Dict[str, Any]) -> int:
    try:
        return await getattr(db, coll).count_documents(query)
    except Exception:
        return 0


async def _sum_field(db, coll: str, field: str) -> int:
    """DB-side $sum of a numeric field (adapter pushes it to SQL). Avoids
    loading every row into Python just to add up one column. Falls back to a
    scan for db doubles that don't implement aggregate (e.g. the test FakeDB)."""
    try:
        rows = await getattr(db, coll).aggregate(
            [{"$group": {"_id": None, "total": {"$sum": f"${field}"}}}]).to_list(1)
        return int(rows[0]["total"]) if rows else 0
    except Exception:
        try:
            total = 0
            async for d in getattr(db, coll).find({}, {"_id": 0}):
                total += int(d.get(field) or 0)
            return total
        except Exception:
            return 0


async def _distinct_count(db, coll: str, field: str, query: Dict[str, Any]) -> int:
    """Count distinct values of `field` among matching rows. Bounded by the
    number of distinct values (here: galleries), not the number of rows. Falls
    back to a scan for db doubles without aggregate."""
    try:
        rows = await getattr(db, coll).aggregate(
            [{"$match": query}, {"$group": {"_id": f"${field}"}}]).to_list(100000)
        return len([r for r in rows if r.get("_id")])
    except Exception:
        try:
            seen = set()
            async for d in getattr(db, coll).find(query, {"_id": 0}):
                v = d.get(field)
                if v:
                    seen.add(v)
            return len(seen)
        except Exception:
            return 0


def _rekognition_status() -> Dict[str, Any]:
    try:
        import aws_service
        if not aws_service.is_configured():
            return {"available": False, "status": "not_configured"}
        hc = aws_service.healthcheck() or {}
        return {"available": bool(hc.get("rekognition_reachable", hc.get("s3_reachable"))),
                "status": "ok" if hc.get("s3_reachable") else "degraded"}
    except Exception as e:
        return {"available": False, "status": "unknown", "detail": str(e)[:120]}


async def compute_face_ops(db) -> Dict[str, Any]:
    """Aggregate face-ops totals with DB-side counts/sums rather than loading
    every gallery_photos / face_search_sessions / photo_requests row into
    Python (the old _all(...).to_list(200000) pattern that did not scale)."""
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=30)).isoformat()

    # "indexed" here means "has >=1 detected face" (face_count>0) — the original
    # definition; a photo is not required to carry an explicit indexed:True flag.
    total_photos = await _count(db, "gallery_photos", {})
    indexed_photos = await _count(db, "gallery_photos", {"face_count": {"$gt": 0}})
    total_faces = await _sum_field(db, "gallery_photos", "face_count")
    collections = await _distinct_count(db, "gallery_photos", "profile_id", {"face_count": {"$gt": 0}})
    # Any photo whose indexing recorded a (non-null) error. $ne None excludes both
    # missing and null (a retried photo clears index_error to null), matching the
    # original truthy `p.get("index_error")` check.
    failed = await _count(db, "gallery_photos", {"index_error": {"$ne": None}})

    searches_total = await _count(db, "face_search_sessions", {})
    searches_30 = await _count(db, "face_search_sessions", {"created_at": {"$gte": since}})
    requests_total = await _count(db, "photo_requests", {})
    requests_30 = await _count(db, "photo_requests", {"created_at": {"$gte": since}})

    return {
        "generated_at": now.isoformat(),
        "rekognition": _rekognition_status(),
        "totals": {
            "collections": collections,          # distinct galleries with indexed photos
            "indexed_photos": indexed_photos,     # photos with >=1 detected face
            "indexed_faces": total_faces,
            "total_photos": total_photos,
            "failed_indexing": failed,
        },
        "searches": {"total": searches_total, "last_30d": searches_30},
        "photo_requests": {"total": requests_total, "last_30d": requests_30},
    }


async def _require_owned_profile_by_id(db, profile_id: Optional[str], admin: dict) -> dict:
    """Object-level authorization for a profile_id, same rule as
    gallery_features._require_owned_profile (owner match or super_admin; a
    legacy profile with no admin_id is let through). Takes require_admin's
    {admin_id, role} dict directly -- role is already known, no extra
    db.admins lookup needed here."""
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0}) if profile_id else None
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    owner = profile.get("admin_id")
    if owner and owner != admin.get("admin_id") and admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="You do not have access to this profile")
    return profile


def build_face_ops_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["face-ops"])

    @router.get("/api/admin/face-ops/overview")
    async def overview(admin=Depends(require_admin)):
        return await compute_face_ops(db)

    @router.post("/api/admin/face-ops/reindex/{profile_id}")
    async def reindex(profile_id: str, admin=Depends(require_admin)):
        await _require_owned_profile_by_id(db, profile_id, admin)
        st = _rekognition_status()
        if not st.get("available"):
            raise HTTPException(503, "Rekognition not configured — connect AWS to reindex.")
        # AWS present: mark the gallery's photos for re-indexing, then actually
        # enqueue a REINDEX job so a running worker picks it up. `needs_reindex`
        # stays as the durable flag (worker.py's REINDEX handler also re-scans
        # for it), so a worker started later still catches up even if no queue
        # was available right now.
        try:
            n = 0
            async for p in db.gallery_photos.find({"profile_id": profile_id}):
                await db.gallery_photos.update_one({"id": p["id"]}, {"$set": {"needs_reindex": True}})
                n += 1
            import face_queue
            queued = await face_queue.enqueue({"type": "REINDEX", "profile_id": profile_id})
            if queued:
                return {"queued": True, "profile_id": profile_id, "photos_flagged": n}
            return {"queued": False, "note": "no queue — worker offline, flag set",
                    "profile_id": profile_id, "photos_flagged": n}
        except Exception as e:
            raise HTTPException(500, str(e)[:200])

    @router.get("/api/admin/face-ops/dead-letters")
    async def list_dead_letters(profile_id: str, admin=Depends(require_admin)):
        await _require_owned_profile_by_id(db, profile_id, admin)
        rows = await db.face_dead_letters.find(
            {"profile_id": profile_id}, {"_id": 0}
        ).sort("created_at", -1).limit(100).to_list(100)
        return {"dead_letters": rows}

    @router.post("/api/admin/face-ops/retry-photo/{photo_id}")
    async def retry_photo(photo_id: str, admin=Depends(require_admin)):
        photo = await db.gallery_photos.find_one({"id": photo_id}, {"_id": 0})
        if not photo:
            raise HTTPException(status_code=404, detail="Photo not found")
        await _require_owned_profile_by_id(db, photo.get("profile_id"), admin)

        await db.gallery_photos.update_one(
            {"id": photo_id},
            {"$set": {"index_error": None, "needs_reindex": True}})

        import face_queue
        job = {"type": "FACE_INDEX", "photo_id": photo_id,
               "profile_id": photo.get("profile_id"), "attempt": 0}
        queued = await face_queue.enqueue(job)
        if not queued:
            # No worker/Redis -- run the same job body inline, exactly like
            # _ingest_photo does for a fresh upload.
            import gallery_features
            await gallery_features.index_photo_job(db, photo_id)

        await db.face_dead_letters.update_many(
            {"photo_id": photo_id, "status": "dead"},
            {"$set": {"status": "retried"}})

        return {"queued": queued, "photo_id": photo_id}

    @router.post("/api/admin/face-ops/dead-letters/{dl_id}/requeue")
    async def requeue_dead_letter(dl_id: str, admin=Depends(require_admin)):
        dl = await db.face_dead_letters.find_one({"id": dl_id}, {"_id": 0})
        if not dl:
            raise HTTPException(status_code=404, detail="Dead letter not found")
        await _require_owned_profile_by_id(db, dl.get("profile_id"), admin)

        # CAS claim -- the guard is in the filter (house rule: no
        # read-then-write here), so a double-click can't double-enqueue.
        claimed = await db.face_dead_letters.find_one_and_update(
            {"id": dl_id, "status": "dead"},
            {"$set": {"status": "requeued"}},
            return_document=True)
        if not claimed:
            raise HTTPException(status_code=409, detail={"already": "requeued"})

        import face_queue
        payload = dict(dl.get("payload") or {})
        payload["attempt"] = 0
        queued = await face_queue.enqueue(payload)
        return {"queued": queued, "dead_letter_id": dl_id}

    return router
