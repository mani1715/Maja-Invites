# AI face-match photo quota

How many photos a wedding may put through Rekognition, who decides, and where
the number is enforced.

Companion to [`MEDIA_STORAGE.md`](MEDIA_STORAGE.md) (bucket routing, key layout)
and [`PRICING_REDESIGN_2026.md`](PRICING_REDESIGN_2026.md) (the price book).

---

## 1. Three metrics that are not each other

| Metric | Unit | Where |
|---|---|---|
| Storage | bytes | `studio_storage.py`, `/studio/studio-storage` |
| Face-match quota | **photo count** | `face_quota.py`, per wedding |
| Faces | detections | `gallery_photos.face_count`, informational |

A 30 MB group photo of ten people consumes **30 MB of storage** and **one**
face-match photo unit, and produces **ten** indexed faces. Merging any two of
these into one bar makes a studio buy the wrong thing.

## 2. Where the allocation comes from

`gallery_features.resolve_face_photo_limit(db, profile_id)` — the MAX
`face_photo_limit` across the wedding's **paid** `invitation_orders`.
`store_features.py` stamps that field at order-create time from the
`face_match_2000 / 3000 / 5000` SKUs in `pricing_catalog.FACE_MATCH_TIERS`.

`None` means **uncapped**, and that is not a bug: legacy flat `ai_face_match`
orders never had a limit stamped and must keep working exactly as before.

There is exactly one allocation source. `face_quota.py` does not compute one; it
tracks holds against this one.

## 3. The arithmetic

```
allocated  = resolve_face_photo_limit(profile_id)        # None => unlimited
used       = COUNT(gallery_photos WHERE profile_id = …)  # ACCEPTED photos
reserved   = SUM(requested - committed) over live holds
remaining  = allocated - used - reserved
```

**`used` counts accepted photos, not indexed ones.** A photo whose Rekognition
indexing failed still occupies a purchased slot — the studio bought capacity for
a photo, not for a successful AWS call. Releasing quota on an indexing failure
would let a bad Rekognition day silently inflate the allocation.

A **duplicate** upload matches an existing checksum and inserts no row, so it
consumes nothing, and its share of the hold is released.

## 4. Reservation lifecycle

```
reserved ──▶ committed   every photo in the batch landed
         ├─▶ released    batch abandoned, cancelled, or partly failed
         └─▶ expired     TTL passed (12 h default), swept hourly
```

Reads already ignore a hold past its `expires_at`, so a dead browser tab frees
the quota immediately rather than when the sweeper next runs. The sweep only
keeps the ledger tidy.

## 5. All-or-nothing

A batch that does not fit is refused **whole**. Uploading 100 of 301 and
rejecting 201 leaves a half-delivered event, which is worse than uploading none.

`409` with:

```json
{
  "code": "QUOTA_EXCEEDED",
  "allocated": 2000, "used": 1900, "reserved": 0,
  "remaining": 100, "requested": 301, "excess": 201,
  "message": "Your upload contains 301 photos, but only 100 photos remain …",
  "extension": { "tiers": [...], "custom_whatsapp": true }
}
```

`extension.tiers` comes from `pricing_catalog.FACE_MATCH_TIERS`. **There is no
owner-approved +500 or +1000 photo SKU.** Do not invent one to make the UI
tidier — anything outside the three priced tiers is a WhatsApp quote.

## 6. Concurrency

`available` is two COUNTs plus a SUM, so read-then-write is check-then-act: two
tabs reserving the last 100 slots would both read `remaining = 100` and both
win, overselling capacity the studio paid for.

`reserve()` holds a **Postgres session advisory lock keyed on the profile id**
for the duration of the critical section. Different weddings never contend; a
process that dies drops its connection and Postgres releases the lock.

A db handle with no pool (the unit tests' in-memory `FakeDB`) falls back to a
process-local `asyncio.Lock` **and logs a warning**. That fallback is not the
same guarantee and does not pretend to be.

> `test_case5_concurrent_reservations_cannot_oversell` was verified
> non-vacuous — disabling the advisory lock makes it fail. Redo that check if
> you touch `_profile_lock`: a mutex that silently stops locking looks
> identical to one that works.

## 7. Enforcement points

| Lane | Where | Behaviour |
|---|---|---|
| `POST …/gallery/quota/reserve` | explicit batch hold | the UI calls this first |
| `POST …/gallery/bulk-upload` | reserves `len(files)` | whole batch or nothing |
| `POST …/live-upload/{id}` | reserves `len(files)` | the token says *who*, never *how many* |
| `POST …/gallery/presign-upload` | one-slot hold inline | closes the "never call reserve" gap |
| `POST …/gallery/commit-upload` | commits one | re-verifies the hold |
| `index_photo_job()` | last-ditch | pre-existing; still refuses past the cap |

A `reservation_id` is verified against the wedding it was issued for on every
use. One studio's reservation is a **404** on another studio's wedding — it is
never a bearer token for someone else's capacity.

## 8. The QR

`GET /api/admin/profiles/{id}/face-match-qr` — **one per wedding**, not per
ceremony, because the Rekognition collection is per wedding
(`_profile_collection_id`). Per-ceremony codes would be several QRs pointing at
one identical search. It resolves to the existing public entry
`/invite/{slug}/live-gallery`; there is no second face-match surface.

`409 GALLERY_NOT_ENABLED` when the AI gallery is off — a code that leads to an
empty page is worse than no code.

The target carries the wedding's public slug, which is already printed on every
invitation and encoded in every invitation QR. A separate opaque token would be
a second identifier for a page the first one already reaches. What gates the
photos is `gallery_privacy` (access code + device trust); that is the control to
strengthen if enumeration ever matters.

## 9. Tests

| File | Covers |
|---|---|
| `tests/test_face_quota_reservation.py` | the mandated matrix + lifecycle, against **real Postgres** |
| `tests/test_face_quota_api.py` | HTTP surface, cross-tenant isolation, refusal body |
| `tests/test_public_pricing_separation.py` | public page vs panel, no hardcoded prices |

Both quota modules skip cleanly — never silently pass — when their dependency
is missing.

## 10. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GALLERY_QUOTA_RESERVE_PER_HOUR` | 120 | reservation attempts per studio per hour |
| `GALLERY_PRESIGN_PER_HOUR` | 6000 | presigned upload URLs per studio per hour |

Both go through `cache_backend.rate_limit_allow`, the canonical limiter.
`face_quota.DEFAULT_TTL_MINUTES` (720) and `MAX_BATCH_PHOTOS` (5000) are module
constants, not environment variables — change them in code, with a reason.
