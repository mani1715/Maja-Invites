# Media Storage Architecture

Canonical reference for where MAJA Invites media lives, how it gets there,
and what protects it. Source of truth for code behavior is
[`backend/media_storage.py`](../backend/media_storage.py) (bucket routing,
key builders, limits) and [`backend/aws_service.py`](../backend/aws_service.py)
(the boto3 S3/Rekognition/CloudFront layer) — this document explains the
architecture around them; if it and the code disagree, the code is right.

Each section below is marked **[CODE]** (this repo implements it) or
**[EXTERNAL]** (a human runs it once outside this repo — Terraform/console/CLI).

---

## 1. The four buckets **[EXTERNAL create · CODE routes]**

Four private S3 buckets, region `us-east-2` in production. Bucket creation,
the bucket policy, and CORS are external (§7); routing to them and the key
layout inside them is code (`media_storage.py`).

| Category | Env var | Production bucket |
|---|---|---|
| portfolio | `AWS_S3_PORTFOLIO_BUCKET` | `maja-portfolio-media-2026` |
| event | `AWS_S3_EVENT_BUCKET` | `maja-event-media-2026` |
| invitation | `AWS_S3_INVITATIONS_BUCKET` | `maja-invitations-media-2026` |
| face | `AWS_S3_FACE_BUCKET` | `maja-face-private-2026` |

Account `655671523450`, region `us-east-2`.

Resolution order per category (`media_storage.bucket_for`, the authoritative
resolver): the canonical name above → the deprecated `S3_BUCKET_<CATEGORY>`
spelling (still accepted, warns once) → the legacy single `AWS_S3_BUCKET`, so
a single-bucket dev/test deploy keeps working unchanged.

**`face` is the exception: it never falls back.** Private biometric selfies
must not silently land in a shared media bucket, so an unset
`AWS_S3_FACE_BUCKET` resolves to `""` and the face path stays disabled rather
than writing somewhere shared.

`AWS_S3_BUCKET` itself is deprecated. It survives only for the ~14 modules
written before the split (gallery_features, studio_storage, storage_upload,
media_reconcile, auto_moderation, storage_pool_jobs, …); when it is unset,
`aws_service.bucket()` now resolves those callers to the **event** bucket
rather than to `""`.

### Key layout

S3 has no real directories; these are object-key prefixes. The database
(`media_assets`, see §3) is the source of truth for what a key means — S3 is
the storage layer only, and no marker/placeholder objects are ever created.

```
maja-portfolio-media-2026
  photographer/{pid}/portfolio/{images|videos|thumbnails}/{uuid}.{ext}

maja-event-media-2026
  photographer/{pid}/event/{eid}/{photos|videos|audio|thumbnails}/{uuid}.{ext}

maja-invitations-media-2026
  photographer/{pid}/event/{eid}/invitation/{iid}/
    {images|videos|audio|background-music|thumbnails}/{uuid}.{ext}

maja-face-private-2026
  event/{eid}/sessions/{sid}/selfie
```

Object keys are **always** generated server-side — `uuid4().hex` plus an
extension chosen from an allowlist keyed by MIME type
(`media_storage.extension_for`). A guest or photographer's uploaded filename
is stored as display metadata only (`sanitize_filename`); it is never part
of the key, so there is no path-traversal or key-collision surface from user
input. `{pid}` / `{eid}` / `{iid}` are database ids resolved server-side from
the authenticated session — never taken from the request body (§6).

---

## 2. Direct-upload sequence **[CODE]**

A 2 TB shoot never transits the app server. The backend is the control
plane only — it authorizes and verifies, the bytes move browser → S3 directly.

```
Browser                          Backend (control plane)              S3
   │  1. POST authorize session      │                                  │
   │ ────────────────────────────►   │  validate MIME/size, resolve key │
   │                                  │  create_multipart_upload()  ────┼──►
   │  ◄── session_id, upload_id, key │  ◄───────────────────────────── │
   │                                  │                                  │
   │  2. GET presigned part URL(s)   │                                  │
   │ ────────────────────────────►   │  presign_upload_part() per part │
   │  ◄── presigned PUT URL(s)       │                                  │
   │                                  │                                  │
   │  3. PUT part bytes ──────────────────────────────────────────────►│
   │  ◄── 200 + ETag header ─────────────────────────────────────────  │
   │        (repeat 2-3 per part; parts may run in parallel)            │
   │                                  │                                  │
   │  4. POST complete (parts+ETags) │                                  │
   │ ────────────────────────────►   │  complete_multipart_upload()────┼──►
   │                                  │  head_object() to verify size   │
   │                                  │  ◄─────────────────────────────│
   │                                  │  insert media_assets row        │
   │  ◄── media asset record ────────│                                  │
```

Below the multipart threshold (`MEDIA_MULTIPART_THRESHOLD_BYTES`, default
32 MB) a single presigned PUT is used instead of multipart — same
authorize/verify shape, one part. `aws_service.py` implements the S3 side of
every step: `create_multipart_upload`, `presign_upload_part`,
`list_uploaded_parts` (resume after an interruption),
`complete_multipart_upload`, `abort_multipart_upload`, `head_object`
(server-side completion proof — the backend trusts what S3 reports, not
what the browser claims it uploaded).

---

## 3. Upload-session state machine **[CODE — `upload_sessions_service.py`]**

Every direct upload is tracked as a session so a browser crash, a network
drop, or an abandoned tab never leaves an orphaned multipart upload or a
`media_assets` row that doesn't correspond to real bytes in S3.

```
created ──► uploading ──► completing ──► available
   │             │              │
   │             │              └──► failed   (head_object mismatch, S3 error)
   │             └──────────────────► aborted  (client-cancelled or session error)
   └──────────────────────────────────► expired (idle/absolute timeout, never completed)
```

- **created** — backend validated the request (MIME allowlist, byte ceiling,
  quota headroom), resolved the canonical key, and opened the S3 multipart
  upload (or prepared a single presigned PUT).
- **uploading** — at least one part has been presigned; parts may be
  in-flight or retried by the client independently.
- **completing** — client called complete; backend is calling
  `complete_multipart_upload` and then `head_object` to verify size/ETag
  server-side before trusting the upload.
- **available** — verified; the `media_assets` row is written (or promoted
  from a placeholder) with the real S3 size/etag/content-type. This is the
  only state a caller may treat as "the file exists."
- **failed** — `head_object` didn't match what was expected, or S3 returned
  an error on complete. The multipart upload is aborted so no partial object
  or storage cost lingers.
- **aborted** — the client (or an admin) cancelled before completion.
- **expired** — the session sat idle past `MEDIA_UPLOAD_IDLE_HOURS` (default
  6h) or past its absolute ceiling `MEDIA_UPLOAD_ABSOLUTE_HOURS` (default
  48h) without completing. Caught by the sweep below, not by the client.

**Abandoned-session cleanup is belt-and-braces, two independent layers:**
1. **App-layer sweep** — a scheduled job walks sessions in `created` /
   `uploading` past their idle/absolute window, calls
   `abort_multipart_upload`, and marks them `expired`. This is the layer
   that actually knows about a *session* (and can update its own state),
   not just a bare S3 upload id.
2. **S3-native `AbortIncompleteMultipartUpload`** (`DaysAfterInitiation: 2`,
   all four buckets) — applied by `scripts/apply_s3_lifecycle.py` (§7). Pure
   safety net: if the app-layer sweep is ever down, broken, or a session row
   is lost, S3 itself still reclaims the abandoned parts and their storage
   cost after 2 days. It has no knowledge of session state and never needs
   any — it only ever touches incomplete multipart parts, never a completed
   object.

Control-plane abuse guards (never applied to the S3 transfer itself, which
is the client talking straight to S3 within the presigned URL's scope):
`MEDIA_MAX_ACTIVE_SESSIONS` sessions open per admin at once (default 200),
`MEDIA_SESSION_RATE_PER_HOUR` session creations per admin per hour (default
2000).

---

## 4. Limits and quotas — env vars **[CODE, defaults from `media_storage.py`]**

All env-tunable; unset uses the default in the code, not in this table —
this table documents what the code currently defaults to.

| Var | Default | Meaning |
|---|---|---|
| `MEDIA_MAX_IMAGE_BYTES` | 200 MB | Per-file ceiling, `image` and `thumbnail` kinds |
| `MEDIA_MAX_VIDEO_BYTES` | 64 GiB | Per-file ceiling, `video` kind |
| `MEDIA_MAX_AUDIO_BYTES` | 1 GiB | Per-file ceiling, `audio` kind |
| `MEDIA_MAX_MUSIC_BYTES` | 200 MB | Per-file ceiling, `music` kind (invitation background music) |
| `MEDIA_EVENT_QUOTA_BYTES` | 3 TiB | Aggregate cap per event, checked at session creation against `media_assets` |
| `MEDIA_PHOTOGRAPHER_QUOTA_BYTES` | 5 TiB | Aggregate cap per photographer |
| `MEDIA_MULTIPART_THRESHOLD_BYTES` | 32 MB | Files at/above this use multipart; below, a single presigned PUT |
| `MEDIA_UPLOAD_IDLE_HOURS` | 6 | Session sliding idle window before it's eligible for expiry |
| `MEDIA_UPLOAD_ABSOLUTE_HOURS` | 48 | Session absolute ceiling regardless of activity |
| `MEDIA_MAX_ACTIVE_SESSIONS` | 200 | Concurrent open upload sessions allowed per admin |
| `MEDIA_SESSION_RATE_PER_HOUR` | 2000 | Session-creation rate limit per admin |

Not env-tunable — S3 protocol limits, hardcoded in `media_storage.py`:
`MIN_PART_BYTES` = 5 MiB (S3's own minimum part size), `MAX_PARTS` = 10,000
(S3's hard cap per upload), `PART_PRESIGN_BATCH_MAX` = 100 (how many part
URLs the backend will presign in one authorize call), `MAX_FILENAME_LEN` =
255 (display-filename truncation, unrelated to the key).

---

## 5. Face-search session flow **[CODE]**

```
Guest scans QR ──► /invite/{slug} ──► consent screen ──► selfie capture
                                                              │
                                            selfie bytes ─────┼──► face bucket
                                                              │    event/{eid}/sessions/{sid}/selfie
                                                              │
                                            Rekognition SearchFacesByImage
                                            against the collection bound to
                                            this event, server-side only
                                                              │
                                            matches ──► guest sees their photos
```

- The selfie is stored under `face_selfie_key(event_id, session_id)` →
  `event/{eid}/sessions/{sid}/selfie` in the dedicated `maja-face-private-2026`
  bucket — never mixed into the event/portfolio/invitation buckets, so a
  bucket-level policy can treat biometric material differently from ordinary
  photos without a prefix filter.
- The Rekognition collection id and the search call are both server-side;
  the browser never talks to Rekognition directly and never receives AWS
  credentials (§6). The id is derived per wedding profile
  (`gallery_features._profile_collection_id` → `maja_wedding_{profile_id}`),
  so one event's search can never reach another's faces.
- The backend holds **no `rekognition:ListCollections`**. It can create,
  describe, index, search, and delete *its own* collections, but cannot
  enumerate the account — `DescribeCollection` answers "does this event's
  collection exist" without that. See
  [`docs/AWS_CONNECTION.md`](AWS_CONNECTION.md) §6 for the full runtime
  permission matrix, and §4 for why bucket-configuration reads are a separate
  audit identity rather than a runtime grant.
- Accepted upload MIME types are the same image allowlist as everything
  else (`SELFIE_ALLOWED_MIME`) — the selfie is always re-encoded before any
  further processing.
- **Retention: 24h.** The selfie and its session row are deleted by the
  app's own scheduled cleanup once the session is older than 24h. The face
  bucket's lifecycle rule (`Expiration: Days=2`, prefix `event/`, applied by
  `apply_s3_lifecycle.py`) is a second, S3-native backstop in case that
  app-layer sweep is ever late or down — 2 days, not 24h, specifically so it
  never races the app's own deletion under normal operation and only ever
  fires as a true fallback.

---

## 6. Security controls **[CODE, enforced by the buckets being private — see §7 for the external half]**

- **Private buckets.** No object is ever public; every read goes through a
  signed URL (§7 CloudFront/S3) or a presigned PUT scoped to one key. Public
  Access Block is verified all-four-true by `apply_s3_lifecycle.py`.
- **No AWS credentials in the browser, ever.** The browser only ever holds a
  short-lived presigned URL scoped to exactly one S3 key and one HTTP verb.
- **Server-side ownership on every id.** `{photographer_id}`, `{event_id}`,
  `{invitation_id}` in a key are resolved from the authenticated
  admin/session on the backend, never accepted from the request body — a
  client cannot name another studio's prefix.
- **Generated object keys.** `uuid4().hex` + an allowlisted extension; user
  filenames are metadata only, never key material (rules out path
  traversal and filename-based collisions).
- **MIME allowlists, per kind.** `ALLOWED_MIME` in `media_storage.py` maps
  each `(kind, mime)` pair to its extension; anything not listed is
  rejected outright — notably no `image/svg+xml` (no scriptable image
  format ever reaches S3).

---

## 7. CloudFront-optional delivery **[CODE routes · EXTERNAL to provision a distribution]**

Delivery is CDN-accelerated when configured, and degrades to a plain S3
presigned URL when it isn't — the app must work with zero CloudFront setup.
`aws_service.generate_signed_url(key, expiry_seconds, bucket_name)`:

1. If `AWS_CLOUDFRONT_PRIVATE_KEY_PATH` + `AWS_CLOUDFRONT_KEY_PAIR_ID` +
   `AWS_CLOUDFRONT_DOMAIN` are all set **and** the key's bucket is the
   legacy default bucket (`aws_service.bucket()`), it returns a
   CloudFront-signed URL (canned policy, RSA-SHA1 per the CloudFront
   signer spec).
2. Otherwise it returns a plain S3 presigned GET.

**Known gap this migration introduces:** condition 1 checks the key's
bucket against the single legacy `bucket()`, not against any of the four
new per-category buckets. Until a per-bucket CloudFront distribution (or a
multi-origin one) is wired up, reads from `AWS_S3_PORTFOLIO_BUCKET` /
`_EVENT_` / `_INVITATIONS_` / `_FACE_` always fall through to path 2 — correct
and private, just not CDN-accelerated. Extending the domain lookup to cover
the four buckets is a follow-up, not required for the buckets to work
correctly today.

---

## 8. Ops runbook **[EXTERNAL bucket/CORS setup · CODE for the lifecycle script]**

### One-time, external, per bucket
1. Create the bucket (Terraform/console), region `us-east-2`, versioning per
   your retention policy.
2. Attach a bucket policy that denies anything the Public Access Block
   doesn't already stop (defense in depth) — no public grants.
3. Set CORS so the browser can PUT parts directly and read back the `ETag`
   header it needs to hand to the complete-multipart-upload call (browsers
   block reading response headers cross-origin unless the server explicitly
   exposes them).

   The configuration is now checked in at [`deploy/s3-cors.json`](../deploy/s3-cors.json)
   and applied by the lifecycle script rather than pasted by hand:

```bash
python scripts/apply_s3_lifecycle.py --cors           # dry-run: prints the diff
python scripts/apply_s3_lifecycle.py --cors --apply   # writes it
```

   Origins: `http://localhost:8127`, `http://127.0.0.1:8127`,
   `https://majainvites.com`, `https://app.majainvites.com`. `PUT` is required
   for both single presigned-PUT uploads and multipart part uploads;
   `ExposeHeaders: ["ETag", …]` is required or the browser cannot read the
   ETag it must send back on complete — multipart uploads fail at the last
   step without it, which looks like a mysterious upload hang.

4. (Optional) Point a CloudFront distribution at the bucket if
   CDN-accelerated delivery is wanted for that category (§7 gap).

### Recurring / after provisioning — this repo
```bash
python scripts/apply_s3_lifecycle.py               # dry run — review first
python scripts/apply_s3_lifecycle.py --apply       # enforce PAB + SSE + lifecycle
```
Idempotent — safe to run again after adding a bucket, rotating creds, or as
a periodic drift check. It never touches bucket policy or CORS (those stay
external, §7 steps 2-3) and never widens Public Access Block or downgrades
SSE-KMS to SSE-S3 — see the script's own docstring for exactly what it
checks and writes.

---

## 9. What's still external / not yet built

- Bucket creation, bucket policy, CORS, and any CloudFront distribution
  (§7, §8) — this repo assumes they exist; it does not provision them.
- Per-bucket CloudFront delivery (§7 gap) — today CDN delivery only covers
  the legacy default bucket.
- `upload_sessions_service.py`'s state machine (§3) is specified here as the
  contract the direct-upload API is built against; check that file directly
  for the current implementation status.
