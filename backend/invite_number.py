"""invite_number.py — sequential public invitation number (00001, 00002, …).

Assigned once per invitation from an atomic Postgres counter (the same
SELECT..FOR UPDATE CAS the invoice numbers use). It is a PUBLIC id embedded in
/invite/{code}/{name}, so it is NEVER used to gate access — the resolver still
enforces published + active (see server.py). Because the number is guessable
(sequential), the access guard, not the id, is what protects private events.

Atomicity note: pg_adapter's find_one_and_update is a true CAS only when the
counter ROW ALREADY EXISTS. Its create-on-upsert branch races (two concurrent
first-callers can split into two counter rows with a random-uuid PK). So we seed
the row once at startup (ensure_counter) — after that every next_invite_no takes
the serial FOR UPDATE path. A sparse UNIQUE index on profiles.invite_no is the
backstop that turns any residual race into a retryable error, not a silent dupe.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("invite_number")

COUNTER_ID = "profile_invite_no"


async def ensure_counter(db) -> None:
    """Idempotently seed the counter row + the unique backstop index. Call once
    at startup, before any create_profile can run concurrently."""
    try:
        existing = await db.counters.find_one({"id": COUNTER_ID}, {"_id": 0, "id": 1})
        if not existing:
            try:
                await db.counters.insert_one({"id": COUNTER_ID, "seq": 0})
            except Exception:
                pass  # lost the seed race; the row exists now, which is all we need
    except Exception as e:
        logger.warning("ensure_counter: could not seed invite-number counter: %s", e)
    try:
        # Partial unique index over rows that HAVE invite_no (sparse) — old rows
        # without it are unaffected; two rows can never share a number.
        await db.profiles.create_index([("invite_no", 1)], unique=True, sparse=True)
    except Exception as e:
        logger.warning("ensure_counter: could not create unique invite_no index: %s", e)


async def next_invite_no(db) -> int:
    """The next sequential number (1, 2, 3, …), atomically. Row is pre-seeded so
    this always takes the FOR UPDATE CAS path."""
    doc = await db.counters.find_one_and_update(
        {"id": COUNTER_ID}, {"$inc": {"seq": 1}},
        upsert=True, return_document=True)
    return int((doc or {}).get("seq") or 1)


def invite_code(invite_no) -> str:
    """Zero-padded public code, minimum 5 digits: 1 -> '00001', 42 -> '00042',
    100000 -> '100000'. '' when invite_no is absent (legacy rows)."""
    try:
        n = int(invite_no)
    except (TypeError, ValueError):
        return ""
    return f"{n:05d}" if n > 0 else ""


async def assign_invite_no(db, doc: dict) -> dict:
    """Give `doc` a fresh number + cosmetic name_slug in place. Explicitly
    OVERWRITES any inherited value — the duplicate/from-template paths build the
    new doc from a dict.copy() of the source, so without this the copy would
    carry the source's number and the numeric resolver would return an arbitrary
    one of the two. Returns the same dict for convenience."""
    from url_utils import slugify_name
    doc.pop("invite_no", None)
    doc.pop("name_slug", None)
    doc["invite_no"] = await next_invite_no(db)
    name = (doc.get("title") or "").strip() or \
        f"{doc.get('bride_name', '')} & {doc.get('groom_name', '')}".strip(" &")
    doc["name_slug"] = slugify_name(name)
    return doc
