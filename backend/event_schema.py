"""
event_schema.py — MAJA Dynamic Event Engine: database layer (Spec 04).
======================================================================

Purpose
    Declares every Ganesh-module collection, its indexes, and its soft-delete
    policy, and creates them idempotently. Implements Spec 04 exactly: a dedicated
    `events` root (NOT the wedding `profiles` collection — §24 forbids touching
    wedding collections), normalized child collections, real B-tree indexes on
    slugs / foreign keys / status / dates (§23), and soft-delete (§20).

Inputs      a db handle (pg_adapter with .pool, or the in-memory test FakeDB)
Outputs     ensured tables + indexes; helper filters for soft-delete
Dependencies  pg_adapter (for index DDL; skipped gracefully on FakeDB)
Side effects  CREATE TABLE / CREATE INDEX IF NOT EXISTS — additive, reversible
Future extension  new event types reuse these SAME collections (§25) — no new schema.

Naming (Spec 04 §22): primary keys `*_id`, foreign keys reference parent `*_id`,
booleans `is_*`, timestamps `created_at`/`updated_at`/`deleted_at`, dates in UTC.
Event-scoped analogues of platform collections are prefixed `event_` so they can
never collide with the wedding side (`rsvps`, `notifications`, …).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger("event_schema")

# every collection the module owns (Spec 04 §3-19)
COLLECTIONS: List[str] = [
    "event_registry", "events", "venues", "organizers", "committee_members",
    "festival_schedule", "gallery", "albums", "donations", "sponsors",
    "expenses", "event_budget", "invitations", "event_rsvp", "event_notifications",
    "event_analytics", "event_audit_logs", "event_members",
    # v2 additions
    "celebration_journey", "highlights", "prasadam_menu", "event_blessings",
    # v2 pricing (owner-set design / plan / feature prices — see event_pricing.py)
    "event_design_prices", "event_plan_prices", "event_feature_prices",
    # v2 payments — one row per Razorpay order so every rupee is reconcilable
    "event_orders",
    # v2 — host requests for an extra feature on their link (owner reviews/grants)
    "event_feature_requests",
]

# B-tree indexes per collection (Spec 04 per-section "Indexes" + §23).
INDEXES: Dict[str, List[str]] = {
    "event_registry": ["slug", "status", "category"],
    "events": ["owner_id", "publish_slug", "status", "event_type", "deleted_at"],
    "venues": ["event_id"],
    "organizers": ["event_id"],
    "committee_members": ["event_id", "role", "status"],
    "festival_schedule": ["event_id", "festival_day", "display_order"],
    "gallery": ["event_id", "album_id", "type"],
    "albums": ["event_id"],
    "donations": ["event_id", "status", "paid_at"],
    "sponsors": ["event_id", "tier"],
    "expenses": ["event_id", "category", "approval_status"],
    "event_budget": ["event_id"],
    "invitations": ["public_url", "status", "event_id"],
    "event_rsvp": ["event_id", "attendance_status"],
    "event_notifications": ["recipient", "status", "event_id"],
    "event_analytics": ["event_id"],
    "event_audit_logs": ["event_id", "user_id", "action"],
    "event_members": ["event_id", "user_id", "role", "status"],
    # v2 additions
    "celebration_journey": ["event_id", "year", "display_order"],
    "highlights": ["event_id", "display_order"],
    "prasadam_menu": ["event_id", "display_order"],
    "event_blessings": ["event_id", "status", "is_featured"],
    # v2 pricing
    "event_design_prices": ["event_type", "template_id"],
    "event_plan_prices": ["event_type", "key"],
    "event_feature_prices": ["event_type", "feature_key"],
    "event_orders": ["order_id", "event_id", "status", "kind"],
    "event_feature_requests": ["event_id", "owner_id", "status"],
}

# Spec 04 §20 — soft-delete supported here; audit logs are NEVER deleted.
SOFT_DELETE_ENTITIES = {
    "events", "committee_members", "gallery", "festival_schedule",
    "sponsors", "expenses", "event_notifications",
    # v2 additions
    "celebration_journey", "highlights", "prasadam_menu", "event_blessings",
}

# rows are "live" unless soft-deleted (deleted_at set). pg_adapter filters
# booleans in Python, so services pass this and post-filter, mirroring the
# wedding trash pattern.
NOT_DELETED = {"deleted_at": None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_schema(db) -> Dict[str, Any]:
    """Create every collection + its indexes. Idempotent; safe on every boot.
    Index DDL runs only against a real Postgres pool (skipped on the test DB)."""
    ensure = getattr(db, "ensure_table", None)
    if ensure:
        for name in COLLECTIONS:
            await ensure(name)

    made = 0
    pool = getattr(db, "pool", None)
    # a real asyncpg pool has .acquire(); the in-memory test DB does not, so index
    # DDL is simply skipped there (indexes are a production-Postgres concern).
    if pool is not None and hasattr(pool, "acquire"):
        for coll, fields in INDEXES.items():
            for field in fields:
                idx = f"{coll}_{field}_idx"
                sql = (f'CREATE INDEX IF NOT EXISTS "{idx}" '
                       f'ON "{coll}" (((data->>\'{field}\')))')
                try:
                    async with pool.acquire() as conn:
                        await conn.execute(sql)
                    made += 1
                except Exception as e:   # pragma: no cover - never block boot on an index
                    logger.warning("event_schema: index %s skipped: %s", idx, e)
    return {"collections": len(COLLECTIONS), "indexes_ensured": made}


def is_soft_deletable(collection: str) -> bool:
    return collection in SOFT_DELETE_ENTITIES
