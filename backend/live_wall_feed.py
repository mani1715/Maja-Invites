"""
live_wall_feed.py — one feed for the public QR photo wall.

THE BUG THIS FIXES: MAJA grew two independent live-gallery implementations that
write to two different collections —

  * `live_gallery_features.py`  -> db.live_gallery_photos   (keyed `wedding_id`)
       the photographer's "Upload to QR Gallery", the studio's own photo panel,
       and the guest uploader on the wall;
  * `premium_features.py`       -> db.live_photos           (keyed `profile_id`,
       plus `approved`, `favorite_count`, `favorited_by`)
       and this is the one the PUBLIC wall at /invite/{slug}/live-gallery read.

So every photo a studio uploaded went into one collection and the wall guests
scan the QR for read the other. The wall was permanently empty — "0 photos, the
wall is awake" — no matter how much was uploaded. The QR gallery is a paid
feature, so this was the whole product not working.

Rather than migrate rows (which would strand whichever collection an older
deployment used), the wall now reads BOTH and normalises them to one shape. New
uploads keep going wherever their own endpoint puts them; the wall no longer
cares.

Normalised photo:
    {id, url, thumb_url, micro_url, caption, uploader_name, source,
     favorite_count, created_at, _store}
`_store` records which collection a photo came from so the favourite toggle can
update the right one.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("live_wall")

STORE_LIVE_PHOTOS = "live_photos"
STORE_GALLERY = "live_gallery_photos"


def normalise(doc: Dict[str, Any], store: str) -> Dict[str, Any]:
    """One shape for the wall, whichever collection the row came from."""
    return {
        "id": doc.get("id"),
        "url": doc.get("url") or doc.get("photo_url") or "",
        "thumb_url": doc.get("thumb_url") or doc.get("url") or "",
        "micro_url": doc.get("micro_url") or doc.get("thumb_url") or doc.get("url") or "",
        "caption": doc.get("caption") or "",
        # `uploader_name` (live_photos) vs `guest_name` (live_gallery_photos).
        "uploader_name": doc.get("uploader_name") or doc.get("guest_name") or "",
        "source": doc.get("source") or "photographer",
        "favorite_count": int(doc.get("favorite_count") or 0),
        "created_at": doc.get("created_at") or "",
        "_store": store,
    }


def _visible(doc: Dict[str, Any]) -> bool:
    """Hidden only when something explicitly says so.

    `live_photos` carries `approved`; `live_gallery_photos` has no such field and
    its rows come from the studio's own upload, so a MISSING flag means visible.
    Treating missing as "not approved" is what would keep the wall empty.
    """
    if doc.get("approved") is False:
        return False
    if doc.get("deleted") is True or doc.get("hidden") is True:
        return False
    return True


async def fetch_wall(db, profile_id: str, since: Optional[str] = None,
                     limit: int = 60, skip: int = 0) -> Dict[str, Any]:
    """Newest-first page of the wall, merged across both collections.

    Deliberately cheap, because the wall POLLS: the id lookup on each collection
    is an `$or` of two JSONB containments, which the per-table GIN index serves,
    and the page only over-fetches enough rows to survive the merge + visibility
    filter. `total` comes from two counts rather than from the merged window, so
    the "N photos" chip stays right past the first page.
    """
    limit = max(1, min(int(limit or 60), 500))
    skip = max(0, int(skip or 0))
    # Enough headroom to absorb hidden rows and cross-collection interleaving
    # without pulling the whole gallery on every poll.
    window = limit + skip + 40
    rows: List[Dict[str, Any]] = []

    async def _pull(coll, store: str, key: str):
        q: Dict[str, Any] = {key: profile_id}
        if since:
            q["created_at"] = {"$gt": since}
        try:
            cur = coll.find(q, {"_id": 0, "favorited_by": 0}).sort("created_at", -1)
            docs = await cur.to_list(window)
        except Exception as e:
            logger.warning("[live_wall] %s read failed: %s", store, e)
            return []
        out = [normalise(d, store) for d in docs if _visible(d)]
        rows.extend(out)
        return docs

    await _pull(db.live_photos, STORE_LIVE_PHOTOS, "profile_id")
    # `profile_id` is a real generated column on live_gallery_photos with a btree
    # index (schema.sql live_gallery_profile_idx), and every writer sets it — so
    # that is the fast path. Only if it yields nothing do we try the legacy
    # `wedding_id` key, which costs a second query on empty galleries and never
    # on a populated one.
    got = await _pull(db.live_gallery_photos, STORE_GALLERY, "profile_id")
    if not got:
        await _pull(db.live_gallery_photos, STORE_GALLERY, "wedding_id")

    # A row written to BOTH collections (some paths mirror) must appear once.
    seen = set()
    unique: List[Dict[str, Any]] = []
    for r in sorted(rows, key=lambda x: str(x.get("created_at") or ""), reverse=True):
        key = r["id"] or (r["url"], r["created_at"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    page = unique[skip:skip + limit]
    # ALWAYS the real total, never the size of this page. The wall polls every 8s
    # with `since` and assigns whatever `total` comes back to its "N photos" chip
    # (LivePhotoWall.jsx), so returning the delta would make the counter fall to
    # zero eight seconds after load. Two indexed COUNTs are cheap.
    return {"photos": page, "total": await _count_both(db, profile_id)}


async def _count_both(db, profile_id: str) -> int:
    """How many photos the wall would show, across both collections.

    Counted in SQL, not by materialising the gallery. `approved` is only ever
    present on live_photos, and a MISSING flag means visible — so the filter is
    "not explicitly false" rather than "== true", which is the mistake that would
    hide every photographer upload all over again.

    A photo mirrored into both collections is counted twice; that is a display
    count on a rare case, and the alternative is reading every row on every poll.
    """
    total = 0
    for coll, flt in ((db.live_photos, {"profile_id": profile_id, "approved": {"$ne": False}}),
                      (db.live_gallery_photos, {"profile_id": profile_id})):
        try:
            total += int(await coll.count_documents(flt) or 0)
        except Exception as e:
            logger.warning("[live_wall] count failed: %s", e)
    if total == 0:
        # Legacy rows keyed only on `wedding_id`.
        try:
            total = int(await db.live_gallery_photos.count_documents(
                {"wedding_id": profile_id}) or 0)
        except Exception:
            pass
    return total


async def total_count(db, profile_id: str) -> int:
    """How many photos the wall would show. Used for counters/cards."""
    out = await fetch_wall(db, profile_id, limit=500)
    return out["total"]


async def find_photo(db, photo_id: str):
    """(doc, collection) for a photo id, looked up in both stores."""
    for coll, store in ((db.live_photos, STORE_LIVE_PHOTOS),
                        (db.live_gallery_photos, STORE_GALLERY)):
        try:
            doc = await coll.find_one({"id": photo_id}, {"_id": 0})
        except Exception:
            doc = None
        if doc:
            return doc, coll
    return None, None
