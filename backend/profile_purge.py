"""Shared hard-delete cascade for a wedding profile.

There are NO foreign keys anywhere in this schema, so deleting a `profiles`
row leaves every child row (guests, rsvps, photos, analytics, ...) as a
permanent orphan unless we sweep them explicitly. Two code paths hard-delete a
profile — the 5-day trash sweep (`server._daily_trash_purge`) and the
super-admin bulk "purge" action (`admin_dashboard_v2`) — and they used to
carry two different, drifting cascade lists (the bulk path had none at all).
Both now call `purge_profile_children` so the list stays in one place.

Every step is best-effort and independently guarded: one failing table (or a
missing AWS/Rekognition config) must not strand the rest of the cascade.
A `delete_many({"profile_id": pid})` on a table that happens not to carry
`profile_id` simply matches zero rows — harmless — so the list can be
generous without risking collateral deletion.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("profile_purge")

# Child collections keyed by `profile_id`. Sourced from grepping every
# db.<x>.insert site that stores a profile_id (2026-08-17 forensic finding
# #23.2 + the 546f775 follow-up audit that found ~12 more).
CHILD_BY_PROFILE_ID = (
    # media / galleries
    "gallery_photos", "live_photos", "profile_media", "wedding_album_media",
    "photo_requests", "proofing_photos",
    # face search
    "face_search_sessions", "face_consent",
    # guests / rsvp / interactions
    "guests", "rsvps", "guest_wishes", "greetings", "gift_registry",
    "shagun_records", "song_requests", "check_ins", "guest_reactions",
    "thank_you_messages",
    # analytics / tracking
    "analytics", "view_sessions", "view_analytics", "engagement_analytics",
    "invitation_visitors",
    # lifecycle / ops
    "profile_versions", "link_reactivations", "event_client_accounts",
    "client_budgets", "studio_print_orders",
)

# Child collections keyed by `wedding_id` (same underlying profile id, older
# field name).
CHILD_BY_WEDDING_ID = (
    "live_gallery_photos", "qr_scan_counts",
)


async def purge_profile_children(db, pid: str, gallery_config: dict | None = None,
                                 *, aws_service=None) -> None:
    """Cascade-delete every child row + external artifact for one profile id.

    Caller has already decided this profile is being hard-deleted; this does
    NOT touch the `profiles` row itself (the caller deletes that).
    """
    if not pid:
        return

    # S3: profile-owned assets live under profiles/{id}/ and weddings/{id}/.
    if aws_service is not None and hasattr(aws_service, "delete_prefix"):
        for prefix in (f"profiles/{pid}/", f"weddings/{pid}/"):
            try:
                aws_service.delete_prefix(prefix)
            except Exception as e:
                logger.warning("[purge] S3 %s failed for %s: %s", prefix, pid, e)

    # Rekognition: drop the per-event face collection with the event.
    try:
        coll_id = (gallery_config or {}).get("aws_collection_id")
        if coll_id:
            from face_providers import get_face_provider
            get_face_provider().delete_collection(coll_id)
    except Exception as e:
        logger.warning("[purge] Rekognition cleanup failed for %s: %s", pid, e)

    for coll in CHILD_BY_PROFILE_ID:
        try:
            await getattr(db, coll).delete_many({"profile_id": pid})
        except Exception as e:
            logger.warning("[purge] cascade %s failed for %s: %s", coll, pid, e)
    for coll in CHILD_BY_WEDDING_ID:
        try:
            await getattr(db, coll).delete_many({"wedding_id": pid})
        except Exception as e:
            logger.warning("[purge] cascade %s failed for %s: %s", coll, pid, e)

    # Storage pool: hard-purge Drive-pool copies + release bytes (flag-gated,
    # inert when the pool is off).
    try:
        from storage_pool_hooks import on_event_purged
        on_event_purged(db, pid)
    except Exception as e:
        logger.warning("[purge] storage-pool hook failed for %s: %s", pid, e)
