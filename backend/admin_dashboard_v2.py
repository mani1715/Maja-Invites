"""
admin_dashboard_v2.py — Bucket 1 extras for the Photographer/Studio dashboard.

Adds (all under /api/admin):
  • GET    /admin/profiles/paginated      — page / page_size / status / sort / q / tag
  • POST   /admin/profiles/bulk-action    — delete / archive / unarchive / publish / unpublish / restore
  • GET    /admin/profiles/trash          — list soft-deleted (deleted_at within 30d)
  • POST   /admin/profiles/{id}/restore-trash
  • DELETE /admin/profiles/{id}/purge     — hard delete from trash
  • PATCH  /admin/profiles/{id}/quick     — quick edit (couple names, date, status, tags)
  • PATCH  /admin/profiles/{id}/tags      — replace tags array
  • GET    /admin/profiles/{id}/quick-stats — views/RSVPs/wishes/gallery counters in 1 call
  • GET    /admin/profiles/export.csv     — CSV export of profiles + counters
  • GET    /admin/notifications           — recent activity (rsvps/wishes/payment alerts)
  • GET    /admin/notifications/unread-count

Soft-delete semantics:
  • DELETE /admin/profiles/{id} sets is_active=False (existing).
  • This module sets `deleted_at` on bulk-action delete + on PATCH quick action.
  • Items where deleted_at >= now()-30d show up in /trash, else they are hard-purged
    by the daily sweep (or by /admin/profiles/{id}/purge).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
import asyncio
import csv
import io
import logging

logger = logging.getLogger(__name__)

# Module-level cache for collection-existence checks.  `list_collection_names`
# is a heavy round-trip and used to be called inside every quick-stats request
# — that single line was the dominant cause of dashboard lag with many cards.
_collection_exists_cache: Dict[str, bool] = {}


async def _collection_exists(db, name: str) -> bool:
    if name in _collection_exists_cache:
        return _collection_exists_cache[name]
    names = await db.list_collection_names()
    # Populate cache for every existing collection in one shot.
    for n in names:
        _collection_exists_cache[n] = True
    _collection_exists_cache.setdefault(name, name in names)
    return _collection_exists_cache[name]


def build_admin_dashboard_v2_router(
    db,
    require_admin,
    log_audit_action,
    wedding_lifecycle_service=None,
    aws_service=None,
):
    router = APIRouter(prefix="/api/admin", tags=["admin-dashboard-v2"])

    # ---------- helpers ----------
    def _is_super(admin_data):
        return admin_data.get("role") == "super_admin"

    async def _check_ownership(profile_id: str, admin_data: dict):
        profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        if not _is_super(admin_data) and profile.get("admin_id") != admin_data["admin_id"]:
            raise HTTPException(status_code=403, detail="Not authorized for this profile")
        return profile

    def _normalize_dt(p: dict):
        for k in ("event_date", "created_at", "updated_at", "link_expiry_date",
                  "expires_at", "deleted_at", "archived_at", "published_at",
                  "publish_at"):
            v = p.get(k)
            if v and isinstance(v, datetime):
                p[k] = v.isoformat()
        return p

    # ---------- listing ----------
    class PaginatedProfilesResponse(BaseModel):
        items: List[Dict[str, Any]]
        total: int
        page: int
        page_size: int
        total_pages: int

    @router.get("/profiles/paginated", response_model=PaginatedProfilesResponse)
    async def get_profiles_paginated(
        page: int = Query(1, ge=1),
        page_size: int = Query(12, ge=1, le=100),
        status: Optional[str] = Query(None,
            description="all|draft|published|expiring|archived|trash"),
        sort: str = Query("newest",
            description="newest|oldest|date_asc|date_desc|most_viewed|name_asc"),
        q: Optional[str] = Query(None,
            description="Search across bride, groom, slug, phone, email, tags, city"),
        tag: Optional[str] = Query(None, description="Single tag filter"),
        admin_data: dict = Depends(require_admin),
    ):
        query: Dict[str, Any] = {"is_template": {"$ne": True}}
        if not _is_super(admin_data):
            query["admin_id"] = admin_data["admin_id"]

        status_norm = (status or "all").lower()
        # "published" is defined EVERYWHERE else in this codebase (and in the
        # dashboard UI) as status==PUBLISHED OR is_published==true — a link
        # delivered via fulfillment can carry is_published without status. The
        # filter must match that, or a genuinely-published link vanishes from the
        # Published tab ("no published links" despite one existing).
        IS_PUBLISHED = {"$or": [{"status": "PUBLISHED"}, {"is_published": True}]}
        NOT_PUBLISHED = {"$and": [{"status": {"$ne": "PUBLISHED"}},
                                  {"$or": [{"is_published": {"$ne": True}},
                                           {"is_published": {"$exists": False}}]}]}
        NOT_ARCHIVED = {"$or": [{"archived_at": None}, {"archived_at": {"$exists": False}}]}

        if status_norm == "trash":
            query["deleted_at"] = {"$exists": True, "$ne": None}
        else:
            # Non-trash: only show non-deleted. Every tab is MUTUALLY EXCLUSIVE —
            # archived links live ONLY under the Archived tab, so All/Draft/
            # Published/Expiring never mix them in.
            and_clauses: list = [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
            if status_norm == "archived":
                query["archived_at"] = {"$exists": True, "$ne": None}
            elif status_norm == "draft":
                and_clauses += [NOT_ARCHIVED, NOT_PUBLISHED]
            elif status_norm == "published":
                and_clauses += [NOT_ARCHIVED, IS_PUBLISHED]
            elif status_norm == "expiring":
                soon = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                and_clauses.append(NOT_ARCHIVED)
                query["expires_at"] = {"$lte": soon, "$ne": None}
            else:  # "all" → everything active, minus archived
                and_clauses.append(NOT_ARCHIVED)
            query["$and"] = and_clauses

        if q:
            qre = {"$regex": q.strip(), "$options": "i"}
            query["$or"] = [
                {"bride_name": qre}, {"groom_name": qre}, {"slug": qre},
                {"city": qre}, {"venue": qre},
                {"contact_info.bride_phone": qre},
                {"contact_info.groom_phone": qre},
                {"contact_info.bride_email": qre},
                {"contact_info.groom_email": qre},
                {"tags": qre},
            ]

        if tag:
            query["tags"] = tag

        sort_map = {
            "newest":      [("created_at", -1)],
            "oldest":      [("created_at", 1)],
            "date_asc":    [("event_date", 1)],
            "date_desc":   [("event_date", -1)],
            "most_viewed": [("view_count", -1)],
            "name_asc":    [("bride_name", 1), ("groom_name", 1)],
        }
        sort_spec = sort_map.get(sort, sort_map["newest"])

        total = await db.profiles.count_documents(query)
        skip = (page - 1) * page_size
        cursor = (db.profiles.find(query, {"_id": 0})
                  .sort(sort_spec).skip(skip).limit(page_size))
        items = [_normalize_dt(p) async for p in cursor]
        return PaginatedProfilesResponse(
            items=items, total=total, page=page, page_size=page_size,
            total_pages=max(1, (total + page_size - 1) // page_size),
        )

    # ---------- bulk action ----------
    class BulkActionRequest(BaseModel):
        ids: List[str] = Field(..., min_length=1, max_length=200)
        action: str  # delete|archive|unarchive|publish|unpublish|restore|purge|tag

    class BulkActionResponse(BaseModel):
        matched: int
        modified: int
        action: str
        details: Optional[Dict[str, Any]] = None

    @router.post("/profiles/bulk-action", response_model=BulkActionResponse)
    async def bulk_action(req: BulkActionRequest, admin_data: dict = Depends(require_admin)):
        # Scope to ownership
        scope: Dict[str, Any] = {"id": {"$in": req.ids}}
        if not _is_super(admin_data):
            scope["admin_id"] = admin_data["admin_id"]

        now_iso = datetime.now(timezone.utc).isoformat()
        action = req.action.lower()

        if action == "delete":
            update = {"$set": {"deleted_at": now_iso, "is_active": False, "updated_at": now_iso}}
        elif action == "restore":
            update = {"$unset": {"deleted_at": ""}, "$set": {"is_active": True, "updated_at": now_iso}}
        elif action == "archive":
            update = {"$set": {"archived_at": now_iso, "updated_at": now_iso}}
        elif action == "unarchive":
            update = {"$unset": {"archived_at": ""}, "$set": {"updated_at": now_iso}}
        elif action == "publish":
            # ── Route bulk publish through the lifecycle service so credits
            # are deducted exactly like a single publish. Each profile is
            # processed independently — failures don't roll back successes.
            if wedding_lifecycle_service is None:
                raise HTTPException(
                    status_code=503,
                    detail="Publish service not configured. Please use /api/weddings/{id}/publish.",
                )
            results = {"success": 0, "failed": 0, "errors": []}
            # Resolve ownership for non-super admins.
            scoped_ids = req.ids
            if not _is_super(admin_data):
                # Restrict to profiles owned by this admin to avoid silent skips.
                owned = await db.profiles.find(
                    {"id": {"$in": req.ids}, "admin_id": admin_data["admin_id"]},
                    {"id": 1, "_id": 0},
                ).to_list(len(req.ids))
                scoped_ids = [d["id"] for d in owned]
                results["failed"] += len(req.ids) - len(scoped_ids)
                if len(req.ids) != len(scoped_ids):
                    not_owned = set(req.ids) - set(scoped_ids)
                    for pid in not_owned:
                        results["errors"].append({"profile_id": pid, "error": "Not owned"})

            for profile_id in scoped_ids:
                # For bulk, the publisher must be the owner of the row
                # (super admin is allowed to publish anyone's). We pass the
                # admin_id stored on the profile when super-admin acts.
                owner_admin_id = admin_data["admin_id"]
                if _is_super(admin_data):
                    p = await db.profiles.find_one({"id": profile_id}, {"admin_id": 1})
                    if p:
                        owner_admin_id = p.get("admin_id") or admin_data["admin_id"]
                try:
                    await wedding_lifecycle_service.publish_wedding(
                        wedding_id=profile_id,
                        admin_id=owner_admin_id,
                    )
                    results["success"] += 1
                except ValueError as e:
                    results["failed"] += 1
                    results["errors"].append({"profile_id": profile_id, "error": str(e)})
                except Exception as e:
                    results["failed"] += 1
                    results["errors"].append({"profile_id": profile_id, "error": f"unexpected: {e}"})
            try:
                await log_audit_action(
                    action="profile_bulk_publish",
                    admin_id=admin_data["admin_id"],
                    profile_id=",".join(req.ids[:10]),
                    profile_slug="bulk",
                    details={"results": results, "ids": req.ids},
                )
            except Exception:
                pass
            return BulkActionResponse(
                matched=len(req.ids),
                modified=results["success"],
                action=action,
                details=results,
            )
        elif action == "unpublish":
            update = {"$set": {"status": "DRAFT", "is_published": False, "updated_at": now_iso}}
        elif action == "purge":
            # Hard delete — only if currently in trash.
            # AND clean up S3 files for that profile.
            scope_purge = dict(scope)
            scope_purge["deleted_at"] = {"$exists": True, "$ne": None}

            # Fetch full docs first so we can compute refunds + collect S3 keys.
            profiles_to_purge = await db.profiles.find(scope_purge).to_list(1000)

            details = {
                "deleted": 0,
                "s3_cleanup_attempted": 0,
                "s3_cleanup_failed": 0,
                "errors": [],
            }

            # Shared cascade: child-table sweep + S3 + Rekognition + storage
            # pool, same helper the 5-day trash sweep uses. Without this, this
            # admin-triggered hard delete orphaned every child table immediately
            # (546f775 follow-up audit P1).
            from profile_purge import purge_profile_children
            for profile in profiles_to_purge:
                pid = profile.get("id")
                if not pid:
                    continue
                details["s3_cleanup_attempted"] += 1
                try:
                    await purge_profile_children(
                        db, pid, profile.get("gallery_config"), aws_service=aws_service)
                except Exception as e:
                    details["s3_cleanup_failed"] += 1
                    logger.warning(f"purge cascade failed for {pid}: {e}")

            res = await db.profiles.delete_many(scope_purge)
            details["deleted"] = res.deleted_count

            try:
                await log_audit_action(
                    action="profile_bulk_purge",
                    admin_id=admin_data["admin_id"],
                    profile_id=",".join(req.ids[:10]),
                    profile_slug="bulk",
                    details={"count": res.deleted_count, "ids": req.ids, **details},
                )
            except Exception:
                pass
            return BulkActionResponse(
                matched=res.deleted_count,
                modified=res.deleted_count,
                action=action,
                details=details,
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

        res = await db.profiles.update_many(scope, update)
        # Storage pool: keep the Drive-pool 5-day recycle in lockstep with the app
        # trash. Fire only for the OWNED/matched ids (scope already enforces
        # ownership) so a bulk call can't touch another studio's pooled storage.
        if action in ("delete", "restore"):
            try:
                from storage_pool_hooks import on_event_deleted, on_event_restored
                owned_ids = [d["id"] for d in await db.profiles.find(
                    scope, {"id": 1, "_id": 0}).to_list(len(req.ids))]
                for pid in owned_ids:
                    if action == "delete":
                        on_event_deleted(db, pid, admin_data["admin_id"])
                    else:
                        on_event_restored(db, pid)
            except Exception as _e:
                logger.warning("storage-pool bulk %s hook failed to schedule: %s", action, _e)
        try:
            await log_audit_action(
                action=f"profile_bulk_{action}",
                admin_id=admin_data["admin_id"],
                profile_id=",".join(req.ids[:10]),
                profile_slug="bulk",
                details={"matched": res.matched_count, "modified": res.modified_count, "ids": req.ids},
            )
        except Exception:
            pass
        return BulkActionResponse(
            matched=res.matched_count, modified=res.modified_count, action=action
        )

    # ---------- trash ----------
    @router.get("/profiles/trash")
    async def list_trash(admin_data: dict = Depends(require_admin)):
        # 5-day retention, aligned with the storage-pool recycle window.
        cutoff = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        query: Dict[str, Any] = {
            "deleted_at": {"$gte": cutoff, "$ne": None, "$exists": True},
            "is_template": {"$ne": True},
        }
        if not _is_super(admin_data):
            query["admin_id"] = admin_data["admin_id"]
        raw = await db.profiles.find(query, {"_id": 0}).sort("deleted_at", -1).to_list(500)
        items = [_normalize_dt(p) for p in raw]
        return {"items": items, "total": len(items), "retention_days": 5}

    @router.post("/profiles/{profile_id}/restore-trash")
    async def restore_from_trash(profile_id: str, admin_data: dict = Depends(require_admin)):
        await _check_ownership(profile_id, admin_data)
        now_iso = datetime.now(timezone.utc).isoformat()
        res = await db.profiles.update_one(
            {"id": profile_id},
            {"$unset": {"deleted_at": ""}, "$set": {"is_active": True, "updated_at": now_iso}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
        # Storage pool: cancel the pending 5-day recycle (no-op if none).
        try:
            from storage_pool_hooks import on_event_restored
            on_event_restored(db, profile_id)
        except Exception as _e:
            logger.warning("storage-pool restore hook failed to schedule: %s", _e)
        return {"message": "Profile restored", "profile_id": profile_id}

    @router.delete("/profiles/{profile_id}/purge")
    async def purge_profile(profile_id: str, admin_data: dict = Depends(require_admin)):
        await _check_ownership(profile_id, admin_data)

        # F4/D2 fix (Phase-2 audit): single-profile purge must mirror the
        # bulk-purge flow —
        # and clean up its S3 prefix. Previously this endpoint only ran
        # `delete_one`, leaving an inconsistency between single vs bulk purge.
        profile = await db.profiles.find_one(
            {"id": profile_id, "deleted_at": {"$exists": True, "$ne": None}},
            {"_id": 0},
        )
        if not profile:
            raise HTTPException(
                status_code=400,
                detail="Profile must be in trash before it can be purged",
            )

        details: Dict[str, Any] = {
            "refunded": 0,
            "refunded_for_profile": False,
            "s3_cleanup_attempted": False,
            "s3_cleanup_failed": False,
        }

        # ── S3 cleanup: best-effort, uses delete_prefix on profile key. ──
        try:
            if aws_service is not None and hasattr(aws_service, "delete_prefix"):
                details["s3_cleanup_attempted"] = True
                aws_service.delete_prefix(f"profiles/{profile_id}/")
        except Exception as e:
            details["s3_cleanup_failed"] = True
            logger.warning(f"S3 cleanup failed for {profile_id}: {e}")

        res = await db.profiles.delete_one(
            {"id": profile_id, "deleted_at": {"$exists": True, "$ne": None}}
        )
        if res.deleted_count == 0:
            raise HTTPException(
                status_code=400,
                detail="Profile must be in trash before it can be purged",
            )
        # Storage pool: hard-purge the Drive-pool copies + release bytes now.
        try:
            from storage_pool_hooks import on_event_purged
            on_event_purged(db, profile_id)
        except Exception as e:
            logger.warning(f"storage-pool purge hook failed for {profile_id}: {e}")
        try:
            await log_audit_action(
                action="profile_purge",
                admin_id=admin_data["admin_id"],
                profile_id=profile_id,
                profile_slug=profile.get("slug", "purged"),
                details={"hard_deleted": True, **details},
            )
        except Exception:
            pass
        return {"message": "Profile permanently deleted", **details}

    # ---------- quick edit ----------
    class QuickEditRequest(BaseModel):
        bride_name: Optional[str] = None
        groom_name: Optional[str] = None
        event_date: Optional[str] = None  # ISO
        status: Optional[str] = None      # DRAFT|PUBLISHED
        tags: Optional[List[str]] = None
        publish_at: Optional[str] = None  # ISO future
        notes: Optional[str] = None

    @router.patch("/profiles/{profile_id}/quick")
    async def quick_edit(
        profile_id: str, req: QuickEditRequest,
        admin_data: dict = Depends(require_admin),
    ):
        await _check_ownership(profile_id, admin_data)
        upd = {k: v for k, v in req.model_dump(exclude_none=True).items()}
        if not upd:
            raise HTTPException(status_code=400, detail="No fields to update")
        if "tags" in upd and len(upd["tags"]) > 20:
            raise HTTPException(status_code=400, detail="Maximum 20 tags allowed")

        # BUG 3 FIX (Option B — server-side guard):
        # Quick-edit must NEVER be a backdoor to publishing without paying
        # credits. If the caller is trying to set status=PUBLISHED on a
        # profile that isn't already published, refuse — they must go
        # through the lifecycle service (POST /api/weddings/{id}/publish)
        # which deducts a credit. Unpublishing (PUBLISHED → DRAFT) is fine
        # because it has no credit side-effect.
        if upd.get("status") == "PUBLISHED":
            existing = await db.profiles.find_one({"id": profile_id}, {"status": 1, "is_published": 1})
            already_published = bool(existing and (existing.get("status") == "PUBLISHED" or existing.get("is_published")))
            if not already_published:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "To publish, use the Publish step in the full editor. "
                        "This is required so credits are deducted correctly."
                    ),
                )

        upd["updated_at"] = datetime.now(timezone.utc).isoformat()
        if upd.get("status") == "PUBLISHED":
            upd["is_published"] = True
            upd.setdefault("published_at", upd["updated_at"])
        elif upd.get("status") == "DRAFT":
            upd["is_published"] = False
        await db.profiles.update_one({"id": profile_id}, {"$set": upd})
        try:
            await log_audit_action(
                action="profile_quick_edit",
                admin_id=admin_data["admin_id"],
                profile_id=profile_id,
                profile_slug=(await db.profiles.find_one({"id": profile_id}, {"slug": 1})).get("slug", ""),
                details=upd,
            )
        except Exception:
            pass
        return {"message": "Profile updated", "updated_fields": list(upd.keys())}

    # ---------- tags ----------
    class TagsRequest(BaseModel):
        tags: List[str] = Field(default_factory=list, max_length=20)

    @router.patch("/profiles/{profile_id}/tags")
    async def update_tags(
        profile_id: str, req: TagsRequest,
        admin_data: dict = Depends(require_admin),
    ):
        await _check_ownership(profile_id, admin_data)
        clean = sorted({t.strip() for t in req.tags if t and t.strip()})[:20]
        await db.profiles.update_one(
            {"id": profile_id},
            {"$set": {"tags": clean, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"tags": clean}

    @router.get("/tags")
    async def list_all_tags(admin_data: dict = Depends(require_admin)):
        # Rolled up in Python, not with an aggregate: this used $unwind, which the
        # Postgres adapter does not implement, so the endpoint raised
        # NotImplementedError and 500'd on every call (a Mongo->PG leftover).
        # Counting tags client-side needs no operator support at all.
        q: Dict[str, Any] = {}
        if not _is_super(admin_data):
            q["admin_id"] = admin_data["admin_id"]
        rows = await db.profiles.find(q, {"_id": 0, "tags": 1}).to_list(20000)
        counts: Dict[str, int] = {}
        for r in rows:
            for t in (r.get("tags") or []):
                t = str(t).strip()
                if t:
                    counts[t] = counts.get(t, 0) + 1
        # Same ordering the pipeline produced: most used first, ties alphabetical.
        ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:100]
        return {"items": [{"tag": t, "count": n} for t, n in ordered]}

    # ---------- quick stats per card ----------
    @router.get("/profiles/{profile_id}/quick-stats")
    async def quick_stats(profile_id: str, admin_data: dict = Depends(require_admin)):
        await _check_ownership(profile_id, admin_data)

        # Run every count + the profile lookup in parallel — total wall-time
        # ≈ slowest single query instead of the sum of all of them.  This was
        # a major source of the photographer-dashboard "loading too lazy"
        # slowness reported in Feb 2026.
        async def _count(coll_name: str, query: Dict[str, Any]) -> int:
            try:
                if not await _collection_exists(db, coll_name):
                    return 0
                return await db[coll_name].count_documents(query)
            except Exception:
                return 0

        profile_task = db.profiles.find_one(
            {"id": profile_id},
            {"_id": 0, "view_count": 1, "unique_visitors": 1},
        )
        (profile, rsvp_count, wish_count, gallery_views) = await asyncio.gather(
            profile_task,
            _count("rsvps", {"profile_id": profile_id}),
            _count("wishes", {"profile_id": profile_id}),
            _count("gallery_events", {"profile_id": profile_id, "type": "view"}),
        )
        return {
            "views": int((profile or {}).get("view_count", 0)),
            "unique_visitors": int((profile or {}).get("unique_visitors", 0)),
            "rsvps": rsvp_count,
            "wishes": wish_count,
            "gallery_views": gallery_views,
        }

    # ---------- CSV export ----------
    @router.get("/profiles/export.csv")
    async def export_csv(
        status: Optional[str] = None,
        admin_data: dict = Depends(require_admin),
    ):
        query: Dict[str, Any] = {"is_template": {"$ne": True}}
        if not _is_super(admin_data):
            query["admin_id"] = admin_data["admin_id"]
        if status and status != "all":
            if status == "trash":
                query["deleted_at"] = {"$exists": True, "$ne": None}
            else:
                query["status"] = status.upper()

        cursor = db.profiles.find(query, {"_id": 0}).sort("created_at", -1)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "slug", "bride_name", "groom_name", "event_type", "event_date",
            "city", "venue", "status", "is_published", "view_count",
            "unique_visitors", "tags", "created_at", "updated_at",
        ])
        async for p in cursor:
            writer.writerow([
                p.get("id", ""), p.get("slug", ""),
                p.get("bride_name", ""), p.get("groom_name", ""),
                p.get("event_type", ""), str(p.get("event_date", "")),
                p.get("city", ""), p.get("venue", ""),
                p.get("status", ""), p.get("is_published", False),
                p.get("view_count", 0), p.get("unique_visitors", 0),
                ",".join(p.get("tags", []) or []),
                str(p.get("created_at", "")), str(p.get("updated_at", "")),
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="weddings.csv"'},
        )

    # ---------- notifications ----------
    @router.get("/notifications")
    async def list_notifications(
        limit: int = Query(20, ge=1, le=100),
        admin_data: dict = Depends(require_admin),
    ):
        """Lightweight notification feed by aggregating recent activity:
           - New RSVPs in last 7 days
           - New wishes in last 7 days
           - Recent credit purchases / debits
           - Expiring invitations within 7 days
        """
        admin_id = admin_data["admin_id"]
        is_super = _is_super(admin_data)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        # Owner's profiles set
        owner_q: Dict[str, Any] = {"is_template": {"$ne": True}}
        if not is_super:
            owner_q["admin_id"] = admin_id
        owner_profiles = list(await db.profiles.find(
            owner_q, {"_id": 0, "id": 1, "slug": 1, "bride_name": 1, "groom_name": 1,
                      "expires_at": 1, "admin_id": 1}
        ).to_list(1000))
        owner_ids = [p["id"] for p in owner_profiles]
        profile_by_id = {p["id"]: p for p in owner_profiles}

        feed: List[Dict[str, Any]] = []

        # RSVPs
        try:
            async for r in db.rsvps.find(
                {"profile_id": {"$in": owner_ids}, "created_at": {"$gte": cutoff}},
                {"_id": 0, "profile_id": 1, "guest_name": 1, "created_at": 1, "attendees": 1},
            ).sort("created_at", -1).limit(limit):
                pr = profile_by_id.get(r.get("profile_id"), {})
                feed.append({
                    "type": "rsvp",
                    "icon": "MessageCircle",
                    "title": f"{r.get('guest_name', 'Guest')} replied",
                    "subtitle": f"{pr.get('bride_name','')} & {pr.get('groom_name','')}",
                    "profile_id": r.get("profile_id"),
                    "at": r.get("created_at"),
                })
        except Exception:
            pass

        # Wishes. The collection is `guest_wishes` and the guest's name is
        # `guest_name` (wishes_features.py writes both). This read used to say
        # `db.wishes` / `author_name` — a collection nothing writes and a field
        # nobody sets — so the guard `"wishes" in list_collection_names()` was
        # always False and a wish has never once appeared in this feed.
        try:
            async for w in db.guest_wishes.find(
                {"profile_id": {"$in": owner_ids}, "created_at": {"$gte": cutoff}},
                {"_id": 0, "profile_id": 1, "guest_name": 1, "author_name": 1,
                 "created_at": 1},
            ).sort("created_at", -1).limit(limit):
                pr = profile_by_id.get(w.get("profile_id"), {})
                who = w.get("guest_name") or w.get("author_name") or "Guest"
                feed.append({
                    "type": "wish",
                    "icon": "Heart",
                    "title": f"{who} left a wish",
                    "subtitle": f"{pr.get('bride_name','')} & {pr.get('groom_name','')}",
                    "profile_id": w.get("profile_id"),
                    "at": w.get("created_at"),
                })
        except Exception:
            pass

        # Expiring soon
        try:
            soon = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            for p in owner_profiles:
                exp = p.get("expires_at")
                if exp and isinstance(exp, str) and exp <= soon:
                    feed.append({
                        "type": "expiring",
                        "icon": "Clock",
                        "title": f"{p.get('bride_name','')} & {p.get('groom_name','')} expires soon",
                        "subtitle": f"Link expires {exp[:10]}",
                        "profile_id": p["id"],
                        "at": exp,
                    })
        except Exception:
            pass

        # Sort + slice
        feed.sort(key=lambda x: str(x.get("at") or ""), reverse=True)
        feed = feed[:limit]
        return {"items": feed, "total": len(feed)}

    @router.get("/notifications/unread-count")
    async def unread_count(admin_data: dict = Depends(require_admin)):
        # Simple heuristic: count items in last 24h.
        # created_at is stored as an ISO-8601 string; the adapter can't bind a
        # datetime range against the generated timestamptz column, so fetch by
        # profile_id (text) and compare ISO strings in Python (lexicographic ==
        # chronological for a consistent ISO format).
        cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        admin_id = admin_data["admin_id"]
        is_super = _is_super(admin_data)
        owner_q: Dict[str, Any] = {"is_template": {"$ne": True}}
        if not is_super:
            owner_q["admin_id"] = admin_id
        owner_ids = [p["id"] for p in await db.profiles.find(owner_q, {"_id": 0, "id": 1}).to_list(1000)]

        def _recent(rows: List[Dict[str, Any]]) -> int:
            return sum(1 for r in rows if str(r.get("created_at") or "") >= cutoff_iso)

        rsvps = await db.rsvps.find(
            {"profile_id": {"$in": owner_ids}}, {"_id": 0, "created_at": 1}).to_list(5000)
        rsvp_c = _recent(rsvps)
        wish_c = 0
        try:
            wishes = await db.guest_wishes.find(
                {"profile_id": {"$in": owner_ids}}, {"_id": 0, "created_at": 1}).to_list(5000)
            wish_c = _recent(wishes)
        except Exception:
            pass
        return {"count": rsvp_c + wish_c, "rsvps": rsvp_c, "wishes": wish_c}

    return router
