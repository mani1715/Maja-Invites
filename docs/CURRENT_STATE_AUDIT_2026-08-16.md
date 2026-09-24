# MAJA Invites — Current State Audit (2026-08-16)

Read-only discovery pass. No code was modified. Every claim below is tagged **FACT** (verified in code, file:line cited), **INFERENCE** (reasonable conclusion, not directly stated), or **UNKNOWN** (could not confirm this pass). Findings synthesized from six parallel deep-reads of the actual repository at `C:\Users\yemin\Desktop\My Projects\M0001(MajaInvites)`, commit `474cfdb`.

---

## 1. Executive Summary

MAJA Invites is a working, single-VM-deployable FastAPI + React monolith for photographer-run wedding/event invitations, with a real (not aspirational) AWS S3 + Rekognition guest-face-search feature. The most consequential finding for this audit's stated purpose — **is per-event Rekognition isolation real?** — is **yes**: collections are named `maja_wedding_{profile_id}`, created per event, and every index/search call reads the collection id back off that specific event's own database row. There is no shared global face collection.

Two architectural assumptions in the original brief do not match the code and should be corrected before any redesign work starts:
- **Storage is one S3 bucket (`AWS_S3_BUCKET`, region `ap-south-1`)**, not four buckets in `us-east-2`. The four bucket names given in the brief (`maja-portfolio-media-2026` etc.) do not appear anywhere in the codebase.
- **GCP is a manual VM host only** — no GCP-managed service (Cloud SQL, GCS, Cloud Run) is used; Postgres/Redis are self-hosted containers on one Compute Engine VM, provisioned by hand-run `gcloud` commands in a runbook, not by any script in the repo.

Three confirmed, exploitable security findings surfaced (detailed in §16): an unauthenticated gallery-access-code reset IDOR, an unauthenticated RSVP phone-number enumeration endpoint, and a weakly-authenticated RSVP tamper endpoint. None require infrastructure changes to fix — they're missing an ownership check and missing rate limits, respectively, on two or three specific routes.

The database has no formal schema — it's ~255 Postgres tables via a single custom Mongo-compatible JSONB adapter (`pg_adapter.py`), with no foreign keys anywhere; every relationship is a soft string reference validated only in Python. This is a deliberate, working design, not an accident, but it means "the schema" is best understood by reading query call sites, not a migrations directory (there isn't one).

Two frontends exist in the repo: `frontend-v2` (Vite+React, the one actually deployed) and a legacy `frontend/` (CRA) kept only as a fallback reference, not built into the deploy image. CLAUDE.md's "Run locally" instructions describe the legacy stack's ports and are stale relative to `SESSION_CONTEXT.md`/`README.md`.

---

## 2. Project Stack

| Layer | Technology | Version | Evidence |
|---|---|---|---|
| Backend language | Python | 3.11 | `backend/Dockerfile:4`, `ci.yml:25` |
| Backend framework | FastAPI (monolith, `server.py` ~16.6k lines) | — | `server.py` |
| DB driver/adapter | `pg_adapter.py`, custom async Mongo-compatible JSONB layer over `asyncpg` | — | `backend/pg_adapter.py` |
| Database | PostgreSQL | 16-alpine (deploy), local via `initdb` | `deploy/docker-compose.yml:20` |
| Cache/queue | Redis | 7-alpine, persistent (`--appendonly yes`) | `deploy/docker-compose.yml:41-50` |
| Deployed frontend | `frontend-v2` — Vite 5.4 + React **18.3** + react-router-dom 6.28 | — | `frontend-v2/package.json` |
| Legacy/fallback frontend | `frontend/` — CRA via CRACO, React 19 | — | `frontend/package.json:73-75`, not in deploy image |
| Reverse proxy / TLS | Caddy (auto-TLS) | — | `deploy/Caddyfile` |
| Package managers | pip (backend, `requirements.txt`, no `pyproject.toml`); yarn (both frontends) | — | |
| Node | 20 (CI) | — | `ci.yml:92,119` |
| Object storage | AWS S3, **one bucket** | — | `backend/aws_service.py:88-89` |
| Face recognition | AWS Rekognition, per-event collections | — | `backend/gallery_features.py:140-143` |
| CDN | CloudFront, optional/best-effort (falls back to S3 presigned URLs if key file missing) | — | `backend/aws_service.py:67-85` |
| Payments | Razorpay | — | |
| AI | Gemini (`google-generativeai`) | — | |
| Auth token library | `python-jose` (primary), `pyjwt` (secondary, gallery device tokens) | — | `backend/auth.py:3`, `backend/gallery_privacy.py:54` |

`microservices/` in the repo is **not live code** — reduced to a single `db/schema.sql` file consumed only as the Postgres init script by docker-compose. The "gateway + 5 stub services" it once contained were dropped in a prior repo curation.

---

## 3. Project Structure

```
backend/            FastAPI monolith: server.py (16.6k lines) + ~90 router modules
                     (auth, payments, portfolio, pixora community, event system,
                     storage pool, face-match, fulfillment, etc.), worker.py
                     (Redis queue consumer for face jobs), tests/
frontend-v2/         DEPLOYED UI — Vite+React, src/, public/ (design catalogue
                     assets), dist/ (build output)
frontend/            Legacy CRA app — fallback for surfaces not yet ported to
                     frontend-v2, NOT part of the deploy image
microservices/       db/schema.sql only — feeds Postgres init in deploy compose
deploy/              Production stack: docker-compose.yml (postgres, redis, core,
                     worker, caddy — 5 services), Caddyfile, .env.example,
                     backup.sh, restore-test.sh
ops/                 Raw DB backup/restore scripts, wrapped by deploy/backup.sh
docs/                DEPLOYMENT.md (manual GCP+AWS runbook), architecture/recon docs
scripts/             Fulfillment authoring scripts, loadtest.js, secret-scan tooling
.github/workflows/   ci.yml — gate-only (tests, secret scan, build assertions);
                     no CD/deploy job exists
```

Deploy topology (FACT, `deploy/docker-compose.yml`): 5 containers only — `postgres`, `redis`, `core` (uvicorn, 4 workers via `WEB_CONCURRENCY`), `worker` (`python worker.py`, face-job consumer), `caddy` (serves `frontend-v2/dist` as static root, proxies `/api` to `core`). Documented workflow (`docs/DEPLOYMENT.md`): hand-provision a GCP VM → point DNS → fill `deploy/.env` → `yarn build` the frontend → `docker compose up -d --build` → run `init_super_admin.py` once → smoke test → `restore-test.sh` to prove backups restore. No automation performs steps 1 or 5-7; CI does not deploy.

**Note on documentation accuracy**: `CLAUDE.md`'s "Run locally" section (frontend on :3100, backend :8000) describes the legacy stack and is stale. Current dev reality (`run.ps1`, confirmed by two independent audit passes): frontend-v2/Vite on **:8127**, backend on **:8001**, Postgres on **:5433** locally, `initdb`-created cluster with `-A trust`. `run.ps1` also contains a machine-specific fallback path (`C:\Users\yemin\Desktop\My Projects\M04(Mani)\wedding-36\...`) that would fail on any other machine.

---

## 4. Frontend Current State

**Framework** (FACT): React 18.3.1 + Vite 5.4.11, react-router-dom 6.28.1. All routes defined in one file, `frontend-v2/src/App.jsx` (~155 `<Route>` entries), every page `lazy()`-loaded behind a shared `<Suspense>`. State management is React Context only (`AuthContext.jsx` — no separate normal-user context, consistent with that persona's retirement). API layer is a single shared axios instance (`api/client.js`) plus ~30 per-domain wrapper modules; no react-query/SWR.

**Auth token handling** (FACT, `client.js:1-112`): `admin_token` (photographer/studio identity) lives in `localStorage`, attached via request interceptor; single-flight 401-refresh via `POST /api/auth/refresh`, guarded so cookie-only requests never enter the refresh path; on failure the token is cleared and a `maja:logout` DOM event fires. **`event_client` (Couple Access) tokens are also `localStorage`/Bearer**, not an HttpOnly cookie (`ClientAuthContext.js:16,25-27` — see §16, finding 4).

**Route guards** (FACT): `RequireStudio` (any authenticated photographer) and `RequireSuperAdmin` (Bearer + `role==='super_admin'`), both in `components/RouteGuards.jsx`.

**Route inventory by area** (FACT, from `App.jsx`):
- Marketing/public: Landing, Pricing, Features, HowItWorks, Faq, Contact, Story, Support, Vendors, FoodDonation.
- Auth: SignIn, SignUp, AuthCallback, ResetPassword.
- Guest-facing: `GuestInvitation` (`/invite/:slug`), `LiveGallery` (thin re-export of `LivePhotoWall.jsx`), `GuestArrival`, `CeremonyInvitation`, `SaveTheDate`.
- Commerce: Cart, Checkout, OrderDetails.
- Studio panel (all `RequireStudio`-guarded): dashboard, per-wedding tabs (guests/messages/gifts/analytics/client/setup/album/live-gallery), portfolio(+build), plans, designs, orders, community, Pixora hub, earnings, insights, staff, security, AI tools, backup, directory, audit logs, white-label, calendar, storage, messages, client-work, events dashboard/builder.
- Super-admin panel (all `RequireSuperAdmin`-guarded): dashboard, pricing, fulfillment, build-queue, support, disputes, moderation, face-ops, system health, feature flags, BI, profitability, storage, delivery, investigation, QR analytics, feature wishes, marketplace, storage pool, events, food donation, access control, approvals.
- Public directory/portfolio/community: PhotographerDirectory, PhotographerPublic, PixoraProfile, Community(+reels, hashtag), PortfolioSamples, Browse, Themes, DesignPreview.
- Legal pages.
- Dozens of deliberate legacy-bookmark `<Navigate>` aliases (e.g. old `/super-admin/*` → `/admin/*`).

**Redirect-only, not-yet-built routes** (SESSION_CONTEXT §0.0.70 claim **verified accurate**, all 7 confirmed present and still just `<Navigate>`):

| Path | Target |
|---|---|
| `/designs` | `/browse` |
| `/create/ganesh` | `/events` |
| `/community/about` | `/story` |
| `/portfolio-plans` | `/pricing` |
| `/order/pending` | `/studio/orders` |
| `/experience/demo` | `/features` |
| `/studio/themes` | `/browse` |

**Functional-area status**:
- Auth UI: complete, MFA/TOTP handling present in `AuthContext.login`.
- Event/invitation creation: **two parallel systems** — `StudioWeddingWizard.jsx` (classic wizard, `api/weddings.js`) and `EventBuilder.jsx`/`EventPublic.jsx` (newer generic "Event Engine", `api/events.js`). Whether both are meant to coexist long-term is a product decision, not a bug — flagged as worth confirming.
- RSVP: folded into `GuestInvitation.jsx`, no separate page.
- Gallery: real implementation is `LivePhotoWall.jsx`; `LiveGallery.jsx` is a 3-line re-export.
- Guest selfie/face search: `components/FindMyPhotos.jsx` (316 lines) — consent flow, zip download, photo-request all wired; appears feature-complete.
- Admin/studio dashboard: `StudioDashboard.jsx` → `api/studio.js` → real `/api/studio/my-weddings` etc.
- Super-admin: `AdminDashboard.jsx` → `api/admin.js`; note the backend endpoint prefix is still `/api/super-admin/*` even though the frontend route path was renamed to `/admin/*`.
- Portfolio/design catalogue, Pixora community: both present with real API wiring, Pixora backed by a large 8-panel component tree.

**Duplication — confirmed still present**: `PhotographerPublic.jsx:16-17` hand-maintains its own copy of the ten portfolio design-token maps (its own comment names the canonical source, `lib/portfolioDesigns.js`, but never imports it). Both files currently agree on values, but this is exactly the kind of drift that produced a prior silent-mismatch bug (per SESSION_CONTEXT).

**Legacy screens — updated finding**: three of the ~30 items SESSION_CONTEXT §0.0.70 flagged as "probably superseded, never verified" (`Phase30Analytics`, `PhotographerProfilePage`, `ThemeSettings`) **do not exist anywhere in `frontend-v2/src`** — they were never ported from the legacy app at all, not "present but superseded." Similarly `/admin/analytics/overview`, `/admin/analytics/global`, `plan-purchase-details` have no matching route or file in `frontend-v2` — they hit the catch-all 404. This narrows (but doesn't close) the remaining verification task in §0.0.70 item 8.

---

## 5. Backend Current State

**Structure** (FACT): `server.py` mounts ~40 feature-domain routers via `app.include_router(...)` (100+ calls, concentrated at `server.py:15274-16626`) on top of a large set of RSVP/guest/profile endpoints defined directly on the shared `api_router`. Most feature modules use a `build_X_router(db, require_admin, ...)` factory pattern.

**Middleware stack** (registered near the end of `server.py`, FastAPI applies bottom-added-runs-first): `OriginCheckMiddleware`, `BodySizeLimitMiddleware`, `SecurityHeadersMiddleware`, `BotDetectionMiddleware` (this is SEO/share-crawler UA detection for serving crawler-optimized HTML, **not** a request-blocking bot-defense layer — see §16 note), `AbusePreventionMiddleware`, CORS, `RequestMetricsMiddleware`. Global exception handler exists (`@app.exception_handler(Exception)`).

**Auth** — see §7 for full detail. Three token families (admin/photographer, super-admin, event_client "Couple Access"), HS256 JWT, secret from `JWT_SECRET_KEY` with a fail-hard boot guard on the primary path.

**Endpoint inventory** (representative, grouped — full list is 150+ routes, not exhaustively reproduced):

| Area | Representative endpoints | Auth | Notes |
|---|---|---|---|
| Event/wedding create+manage | `/api/events`, `/api/events/{id}`, `/publish`, `/archive` | `get_current_buyer` | Newer generic "event" abstraction, parallel to legacy profile CRUD |
| Legacy invitation/profile CRUD | `/admin/profiles`, `/admin/profiles/{id}`, enable/disable/expire, duplicate/save-as-template | `require_admin` | The actual day-to-day "create an invitation" path |
| RSVP | `POST /api/rsvp`, `GET /admin/profiles/{id}/rsvps`, newer `POST /api/public/events/{slug}/rsvp` | public (rate-limited) for submit; admin for views | Dedup by `profile_id`+`guest_phone` |
| Guest management | CRUD, bulk-delete, CSV import/template, voice notes, WhatsApp bulk-link gen | admin / token-scoped guest portal | |
| Event-day photo/media | `POST /api/events/{id}/gallery/upload`, day-status, delete | `get_current_buyer` | Parallel gallery system to the one below |
| Studio gallery (photographer-managed) | enable, upload-methods, regen-token, stats/photos/download-all, delete, presign-upload/commit-upload, live-upload by token | admin management; signed token for live upload | Presign-primary direct-to-S3 upload path confirmed live |
| Live gallery (guest-facing, during event) | `POST /api/invite/{slug}/gallery/guest-upload`, `GET /api/public/gallery/{slug}/photos` | public upload/view, admin delete | Distinct collection from the studio gallery system above — two parallel gallery subsystems coexist |
| Guest selfie / face search | `POST /public/gallery/{slug}/face-search` | public, consent + rate-limit gated | Full pipeline: DPDP consent gate, per-IP+per-event rate limit, 20MB cap, image validation, selfie-hash cache (24h), Redis queue or inline fallback |
| Photo request (manual fulfillment) | `POST /public/gallery/{slug}/photo-request` | public | Explicitly not automated yet, by its own code comment |
| Face-ops admin console | overview, reindex, dead-letter list/retry/requeue | `require_admin` | DLQ inspection/retry UI |
| Photo retrieval/deletion | list, download-all, delete, face-results, download-zip | admin mgmt / session-scoped public read | S3 GET/delete + CloudFront-or-presigned signed URLs |

**AWS calls** (all in `backend/aws_service.py`, module-level lazy singleton clients): `s3().put_object`, `generate_presigned_url` (GET and PUT), `rekognition().create_collection`, `index_faces`, `search_faces_by_image`, `delete_faces`, batched `delete_objects`. Face-provider abstraction (`face_providers/base.py`, `rekognition.py`) exists as a pluggable interface, only Rekognition implementation found.

**Background processing** (FACT): Redis-backed custom queue, **not** Celery/APScheduler. `face_queue.py` wraps Redis LPUSH/BRPOP (`cache_backend.queue_push`/`queue_pop_blocking`); `worker.py` is a standalone process popping jobs and dispatching to the same job-body functions the request path calls inline when Redis is absent. DLQ: `MAX_ATTEMPTS = 5`, exponential backoff, dead-letter insert into `face_dead_letters` on exhaustion, admin-inspectable/retryable via `face_ops.py`. Graceful shutdown on SIGINT/SIGTERM. No Celery/APScheduler found anywhere (grep clean). Similar job/DLQ patterns exist in `storage_pool_jobs.py`, `media_reconcile.py`, `usage_metering.py`, `drive_archive.py` — **UNKNOWN** whether these share `worker.py` or run as separate processes.

**Validation**: heavy Pydantic usage (172 `BaseModel` occurrences in `models.py`), `response_model=` used extensively for output validation too. Manual validation supplements Pydantic at multipart/file-upload boundaries (size caps, magic-byte image checks, regex).

---

## 6. Database Current State

**Mechanism** (FACT): `backend/pg_adapter.py` — a hand-written async Mongo-compatible facade over Postgres/asyncpg, **not an ORM**. Every "collection" is a Postgres table with an identical fixed shape, created lazily:

```sql
CREATE TABLE IF NOT EXISTS {table} (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS {table}_data_gin ON {table} USING gin(data);
```

`id` is app-generated (`uuid.uuid4().hex`). All document content lives in the `data` JSONB column. The module docstring's mention of "generated columns" is aspirational — `ensure_table` creates none; any additional indexed/promoted field comes from a separate `Collection.create_index` call made at server startup (~40 call sites), which builds real `CREATE INDEX CONCURRENTLY` on `(data ->> 'field')`.

**Known race condition** (documented in code, matches CLAUDE.md's note): `CREATE TABLE IF NOT EXISTS` is not atomic against a concurrent first-creator — two coroutines can both pass the existence check and collide in the Postgres catalog. Mitigated by catching `UniqueViolationError`/`DuplicateTableError` and treating the loser as success — so it doesn't 500, but the race is real and was observed in production per the in-code comment.

**Atomic-update mechanism**: `find_one_and_update` and single-row `update_one`/`delete_one` use `SELECT ... FOR UPDATE` to emulate Mongo's `findAndModify` under Postgres READ COMMITTED. Named dependents in the code comments: wedding-publish idempotency, invoice-number counters, and face-search session/dead-letter claims.

**Collections inventory** (FACT — names; INFERENCE — purpose): ~255 distinct tables. By subsystem:
- Identity/auth: `admins`, `users` (**flagged**: CLAUDE.md says normal-user accounts were retired, but `users` table and its seed file still appear active — not further traced this pass), `refresh_tokens`, `jwt_blacklist`, `login_attempts`/`login_history`, `password_resets`, `device_sessions`, `captcha_challenges`.
- Invitations/events: `profiles` (the core wedding/event doc), `event_registry`, `events`, `invitations`, `event_members`, `rsvps`, `event_orders`, `wedding_profiles`, `wedding_album_media`, `drafts`.
- Gallery/photos: `gallery`, `gallery_photos` (fields: `profile_id`, `face_count`, `aws_face_ids`, `indexed`, `needs_reindex`, `index_error`), `live_gallery_photos`, `photo_requests`, `proofing_galleries`.
- Face recognition: see below.
- Storage/backup: `storage_accounts`, `storage_files`, `drive_credentials`, `backup_events`/`backup_files`, `studio_storage_plans`.
- Pricing/commerce: `subscription_plans`, `orders`, `payments`, `invoices`, coupon/discount tables, a dozen `pricing_*` tables, and **legacy credit-system tables that still exist as names in code** (`credit_ledger`, `credit_wallets`, `credit_packages` etc.) despite credits being product-retired — likely dead writes/historical reads only, not further traced.
- Pixora community: ~55 tables, all `pixora_`-prefixed — the single largest owner block.
- Photographer/studio ops: bookings, contracts, staff, referrals, reviews.
- Admin/audit: `admin_action_log`, `audit_logs`, `event_audit_logs`, `pricing_audit_log`.
- Fulfillment: `invitation_orders`, `event_client_accounts`.

**Relationships** (FACT, as coded — no idealization): **zero foreign-key constraints anywhere.** `id` is the only DB-enforced-unique column, per table. Every relationship is a string ID stored inside one document's `data`, pointing at another table's `id`, validated (or not) only in application Python. Examples: `gallery_photos.profile_id → profiles.id`, `face_search_sessions.profile_id → profiles.id`, `face_dead_letters.{profile_id,photo_id,session_id}` → their respective tables, `profiles.admin_id → admins.id`.

**Indexes/constraints**: every table has `id PRIMARY KEY` + a blanket GIN index on `data`. No other uniqueness constraints exist at the schema level found this pass (e.g. nothing stops two `admins` rows sharing an email at the DB level — only a seed-time `WHERE NOT EXISTS` guard). Runtime `create_index` calls support `unique=True`, `sparse=True`, and `expireAfterSeconds` — the last is a **no-op for actual data deletion**: Postgres has no native TTL, so the code explicitly warns any caller relying on Mongo TTL semantics needs an external sweeper. No `migrations/` directory with authoritative SQL exists at repo root.

**Timestamps/soft-delete**: `created_at`/`updated_at` columns exist on every table by construction, but many documents *also* carry independent `created_at`/`updated_at` keys inside `data`, set by application code — these can drift from the column values, and since no promotion/generated-column step was observed for most tables, most `.sort("created_at")` queries likely order on the JSONB string value, not the column (INFERENCE). No single consistent soft-delete flag found; a `deleted_at` convention is implied for the admin/profile domain by an index comment but not traced to its owning file this pass.

**Face-recognition storage** (traced end-to-end, FACT): see §12 for the full flow. Key tables: `gallery_photos` (stores `aws_face_ids`, `face_count` directly on the photo doc — no separate faces table), `face_search_sessions` (`{profile_id, guest_ip, selfie_s3_key, selfie_hash, matched_photo_ids, similarity_map, status, expires_at}`), `face_consent` (`{profile_id, ip_hash, agreed, withdrawn_at}`, 90-day validity), `face_dead_letters` (DLQ). A second, separate, apparently-inert `face_match_records` table exists in `fulfillment_service.py`, keyed by `event_code` rather than `profile_id`, explicitly marked in its own code comment as a manual-fulfillment path not yet wired to real matching.

**Current ER-style relationship description** (only relationships actually found in code):

```
admins
 → profiles (admin_id)
    → gallery_photos (profile_id)
       → face_search_sessions (via matched_photo_ids)
    → face_search_sessions (profile_id)
    → face_consent (profile_id)
    → face_dead_letters (profile_id, photo_id, session_id)
    → rsvps (profile_id, implied)
    → guests (profile_id, implied)
```

All arrows are soft JSONB string references, not FK constraints.

**Gaps for follow-up**: `microservices/db/schema.sql` was located but not read in full — it may declare promoted columns for some tables that would change "GIN-only" conclusions above; whether `db.users` has genuinely dead write paths post-pivot was not conclusively verified.

---

## 7. Authentication Current State

**Mechanism**: two JWT libraries in use — `python-jose` for the primary admin/super-admin/event_client path (`backend/auth.py`), and a separate `pyjwt` usage for gallery device-tokens and live-upload tokens (`gallery_privacy.py`, `gallery_features.py`). Both HS256, both read `JWT_SECRET_KEY`, but with **different fallback defaults** if unset (`auth.py`'s fail-hard guard vs. `gallery_privacy.py`'s unguarded `"change-me"` fallback) — low practical risk since the primary path already fail-hards, but a real inconsistency worth unifying.

**Token types and expiry**:
| Token | Claims | Expiry | Storage (frontend) |
|---|---|---|---|
| Admin/photographer | `sub` (admin id), `role`, `exp`, `jti` | 60 min access (env-tunable), refresh-cookie-backed | `localStorage.admin_token`, Bearer |
| Super-admin | same shape, `role='super_admin'` | same | same |
| `event_client` (Couple Access) | `sub`=profile_id, `typ='event_client'`, `role='event_client'`, `exp`, `jti` | 7 days default | **`localStorage.client_token`, Bearer** (not HttpOnly — see §16) |
| Gallery device token | — | 7/30/90 days, admin-configurable | device-scoped |
| Live-upload token | — | env-tunable hours | token in URL/header |
| Impersonation token | carries `imp` actor claim | 30 min | admin-only tool |

`jti` claims back a Redis/DB blacklist for logout revocation. The admin dependency chain explicitly rejects `typ=='event_client'` tokens and vice versa — a real, enforced boundary between personas, not just documentation. Supabase-issued tokens (asymmetric, JWKS-verified) are also accepted and mapped to a local `admins` row by `sub`/email.

**Secret source**: `JWT_SECRET_KEY` env var; app refuses to boot with an insecure default unless `ALLOW_INSECURE_JWT=1` is explicitly set (real fail-hard fix, per code comment addressing a prior latent bug).

---

## 8. Authorization Current State

**Ownership-check pattern** (FACT): a consistent `_require_owned_profile`-style helper is repeated across `gallery_features.py`, `guest_features.py`, `photographer_clients.py`, `usage_metering.py`, and generalized in `event_lifecycle_service.py`. One instance carries an explicit comment: *"H1 (Broken Access Control) fix — object-level authorization"* — i.e., this exact class of bug was found and fixed once before, then the same pattern was propagated to sibling modules. `require_super_admin` fails **closed** on a JWT-blacklist-lookup DB error (stricter than the general admin path, which fails open for availability — a deliberate, documented tradeoff).

**Confirmed gap**: `gallery_privacy.py`'s admin routes (`admin_get`, `admin_update`, `admin_reset_code`, `admin_logout_all`, `admin_analytics`) depend only on `get_current_admin` (any authenticated photographer from any studio) and look up the target profile with **no comparison against `profile.admin_id`**. See §16, finding 1, for exploitability.

Spot-checked and found correctly gated: `super_admin_service.py` (~13 routes), `storage_pool_service.py` (~21 routes) — all behind `require_super_admin`, no gaps found. `event_lifecycle_service.py` and `photographer_clients.py`'s client-access issuance are correctly scoped to the resource owner.

**Public/guest boundary**: the face-search endpoint resolves the profile from the URL slug server-side and never accepts a client-supplied profile id for storage/collection lookups — no cross-event leakage found there. Two RSVP endpoints do have weaker boundaries — see §16.

---

## 9. Media Storage Current State

**Buckets** (FACT): one bucket only, `AWS_S3_BUCKET` env var, region `ap-south-1` (not the four-bucket / `us-east-2` scheme in the original brief — that architecture is not implemented anywhere in code). All media types (portfolio, invitations, event photos, guest selfies) share this one bucket, distinguished by key prefix only.

**Key structure** (FACT, `gallery_features.py:146-204`):
```
weddings/{profile_id}/photos/{photo_id}/preview.jpg
weddings/{profile_id}/photos/{photo_id}/thumb.webp
weddings/{profile_id}/photos/{photo_id}/original{ext}
weddings/{profile_id}/selfies/{session_id}.jpg
```
`profile_id` (the event) is the isolation key for S3 paths, matching the Rekognition isolation key.

**Access control**: no public-read ACLs found anywhere; every read goes through `generate_signed_url`, which prefers a CloudFront-signed URL if configured (private-key file present + domain set) and falls back cleanly to an S3 presigned GET otherwise — the code does not hard-depend on CloudFront, consistent with it being "blocked by AWS account verification."

**Upload path**: presigned-PUT direct-to-S3 for originals (browser PUTs to a staging key; server does an S3-side `copy_object` to finalize — bytes never re-transit the app server), matching CLAUDE.md's "presign-primary uploads" note.

**Thumbnails**: Pillow-generated, 400px-wide JPEG q85, plus a `thumb.webp` convention.

**Originals preserved**: yes, at a distinct `original{ext}` key, separate from the re-encoded preview — legacy pre-migration rows fall back to `s3_key` where `original_s3_key` is absent.

**Deletion**: genuinely deletes the S3 objects (preview/thumb/original), not just the DB row, wrapped in try/except so an S3 failure doesn't block DB deletion (logged, not retried/DLQ'd on that specific path).

**Guest selfie retention**: `cleanup_expired_selfies` purges S3 object + session row for selfies older than 24 hours — a real deletion path exists (contrary to a "probably no deletion" default assumption). **UNKNOWN**: whether this hourly job is actually wired into a scheduler at server startup — not confirmed this pass, should be checked before relying on it in production.

---

## 10. AWS Current State

| Service | Status | Evidence |
|---|---|---|
| S3 | **ACTIVELY USED** — single bucket, presigned upload/download, thumbnailing, deletion | `aws_service.py` |
| Rekognition | **ACTIVELY USED** — per-event collections, index/search/delete faces | `aws_service.py`, `gallery_features.py` |
| CloudFront | **PARTIAL** — code supports it, falls back gracefully when unconfigured; matches CLAUDE.md's "blocked by account verification" | `aws_service.py:67-85` |
| CloudTrail | **CONFIGURED, not code-integrated** — no code reads CloudTrail data; it's an account-level audit log, not consumed by the app | UNKNOWN beyond brief's own claim |
| IAM | presumably backs the access key in use; no IAM API calls found in code | UNKNOWN specifics |
| Lambda | **NOT USED** — confirmed intentionally removed per project brief; no trace found in code | — |

No hardcoded credentials found; `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/`AWS_S3_BUCKET` are the only S3/Rekognition env vars, plus three CloudFront-specific ones. boto3 clients are module-level lazy singletons with `retries={"max_attempts": 3, "mode": "adaptive"}` globally configured.

---

## 11. GCP Current State

**FACT — GCP is a manual-runbook compute target only, not code-integrated.** No service-account JSON in the repo, no GCP infrastructure SDK in `requirements.txt` (the only Google packages present are for Gemini AI and Google Drive OAuth — application features, not GCP infra APIs), no Cloud Run manifest, no k8s YAML, no Terraform/Deployment Manager config anywhere.

All GCP references live in `docs/DEPLOYMENT.md` as literal `gcloud` commands a human runs by hand (`gcloud compute instances create maja-prod --machine-type=e2-standard-4`, firewall rules for 80/443/22, OS Login SSH key setup). Nothing in the repo invokes `gcloud` programmatically.

**INFERENCE**: GCP's role is exactly one unmanaged Compute Engine VM hosting the docker-compose stack. Postgres and Redis are self-hosted containers on that VM, not GCP-managed services. All product infrastructure beyond compute (object storage, CDN, face recognition) is AWS.

---

## 12. Face Recognition Current State

This was the audit's central question: **is guest-selfie search correctly isolated per event, or is there one global collection?**

**Verdict: genuinely per-event. FACT, confirmed by reading the actual collection-id derivation and every call site that uses it.**

```python
# backend/gallery_features.py:140-143
def _profile_collection_id(profile_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_.\-]", "_", profile_id)
    return f"maja_wedding_{safe}"
```

Called once at gallery-enable time (`gallery_features.py:307-309`), and the resulting collection id is persisted onto that specific event's own profile document (`gallery_config.aws_collection_id`). Every subsequent index/search/delete call for that event reads the collection id back off that same profile row (`gallery_features.py:1005, 1056, 481, 1393`) — there is exactly one Rekognition collection per event, and no code path lets a search for event A read event B's collection id. A `models.py:533` field (`rekognition_collection_id`) that looks like a second, older collection-tracking scheme was confirmed **inert legacy plumbing** — a test (`test_dead_surface_removal.py:48`) explicitly asserts the collection-creation call it would have driven is no longer invoked from `server.py`.

**Indexing** (FACT): triggered on event-photo upload (not on guest selfie upload — selfies are only ever searched, never indexed). `ExternalImageId` = the app's `photo_id`. Indexes the 2048px preview image, not the true original (cost control). Returned `FaceId`s are written directly onto the `gallery_photos` document (`aws_face_ids`, `face_count`) — no separate faces table. Zero faces detected → Rekognition's `InvalidParameterException` is caught and treated as a valid `face_count: 0` result, not an error. Multiple faces → `MaxFaces=15` cap, all stored.

**Searching** (FACT): guest selfie → `search_faces_by_image` against the event's own collection → matches resolved back to photos via `ExternalImageId` (= `photo_id`) directly, no lookup table needed → best-similarity dedup per photo → stored on a `face_search_sessions` row. Zero matches is a normal "done, empty" result, not an error. A "no face in selfie" Rekognition error returns a friendly user-facing message; any other client error marks the session `failed` without raising to the caller. Retries happen one layer up, in `worker.py`'s dispatch loop.

**Guest selfie lifecycle**: stored in the same shared bucket at `weddings/{profile_id}/selfies/{session_id}.jpg`, deleted by an hourly-intent cleanup job after 24 hours (S3 object + session row) — **UNKNOWN whether this job is actually scheduled in production**, only its existence and docstring intent were confirmed.

**Consent** (FACT): a `face_consent` table gates the whole flow — DPDP-style, salted+truncated-SHA256 IP hash, 90-day validity, and a withdrawal path that best-effort purges the guest's own selfie + cache key + session rows (explicitly scoped to not touch the photographer's own indexed photos).

**Failure handling**: `face_dead_letters` DLQ after 5 retry attempts with exponential backoff, admin-inspectable/retryable via `face_ops.py`. Redis-absent fallback runs the same job body synchronously inline rather than silently dropping it.

**A second, separate, apparently-dead face-match table** (`fulfillment_service.py`'s `face_match_records`, keyed by `event_code` not `profile_id`) exists for the manual-fulfillment workflow and is explicitly marked in its own comment as not yet wired to real matching — do not confuse this with the live Rekognition flow above.

---

## 13. Complete Data Flows

**A. Login** (photographer): `SignIn.jsx` → `POST /auth/login` → per-IP + per-identifier rate limit, exponential backoff on repeated failure (Redis-backed, in-memory fallback) → `auth.py` verifies credentials against `admins` → issues admin JWT + refresh-cookie session → frontend stores `admin_token` in `localStorage`.

**B. Event/invitation creation**: two parallel paths exist — (1) legacy: `StudioWeddingWizard.jsx` → `POST /admin/profiles` → `require_admin` → writes a `profiles` row; (2) newer: `EventBuilder.jsx` → `POST /api/events` → `get_current_buyer` → writes an `events`/`event_registry` row. Which is authoritative for new work is a product question, not determinable from code alone.

**C. RSVP submission**: `GuestInvitation.jsx` → `POST /invite/{slug}/rsvp` → rate-limited (5/IP/day) + CAPTCHA escalation → dedup check by `profile_id`+`guest_phone` → writes an `rsvps` row. Status-check and update endpoints (`GET .../rsvp/check`, `PUT /rsvp/{id}`) exist with materially weaker protection — see §16.

**D. Event photo upload (studio-managed gallery)**: admin UI → presigned-PUT request → browser PUTs bytes directly to an S3 staging key → server-side `copy_object` finalizes at the real key → thumbnail generated → face-indexing job enqueued (Redis) or run inline → `index_faces` against the event's Rekognition collection → `FaceId`s + `face_count` written onto the `gallery_photos` row.

**E. Guest selfie upload / face search**: `FindMyPhotos.jsx` → consent check → `POST /public/gallery/{slug}/face-search` → per-IP+per-event rate limit, 20MB cap, image validation → selfie stored in S3 → SHA-256 hash checked against a 24h cache (skip Rekognition on repeat) → `search_faces_by_image` against the event's own collection → matches resolved to `photo_id`s → `face_search_sessions` row updated → results returned/polled by the frontend.

**F. Photo deletion**: admin UI → `DELETE .../photos/{id}` → ownership check (`_require_owned_profile`, correctly applied here) → Rekognition `delete_faces` for that photo's `aws_face_ids` → S3 object deletion (preview/thumb/original) → DB row deletion.

---

## 14. Current System Architecture

```
Guest / Photographer (browser)
 ↓
Caddy (TLS, static frontend-v2/dist + /api proxy)                         [ACTIVE]
 ↓                                    ↓
frontend-v2 (Vite/React, static)      FastAPI core (uvicorn, 4 workers)   [ACTIVE]
                                        ↓                ↓
                                     Postgres          Redis                [ACTIVE]
                                    (pg_adapter,      (rate limits, OTP,
                                    ~255 JSONB         face-job queue)
                                    tables, no FKs)
                                        ↓
                                     worker.py (Redis BRPOP consumer,      [ACTIVE]
                                     face index/search jobs, DLQ)
```

```
FastAPI core / worker.py
 ↓
AWS S3 (single bucket, ap-south-1)         [ACTIVE]
 ↓
AWS Rekognition (per-event collections)    [ACTIVE]
 ↓
AWS CloudFront (signed URLs, optional)     [PARTIAL — blocked by account verification, code falls back cleanly]
```

```
GCP Compute Engine VM (single, manually provisioned)   [ACTIVE, but manual — no IaC in repo]
 → hosts the entire docker-compose stack above
```

```
frontend/ (legacy CRA app)                              [LEGACY — not deployed]
microservices/ (gateway + 5 stub services)               [LEGACY — reduced to one schema.sql]
fulfillment_service.py face_match_records                [LEGACY/UNUSED — parallel, unwired face-match table]
CloudTrail                                                [CONFIGURED, not code-consumed]
GCP-managed services (Cloud SQL, GCS, Cloud Run)          [UNUSED — not part of the architecture]
AWS Lambda                                                [PLANNED-THEN-REMOVED — intentionally absent]
```

---

## 15. Current Status Scorecard

| Area | Status | Evidence |
|---|---|---|
| Frontend | COMPLETE (frontend-v2) | 155-route App.jsx, all major personas covered |
| Backend | COMPLETE | 150+ routes, 90 router modules, working middleware stack |
| Database | COMPLETE but unconventional | No FKs, no migrations dir, JSONB-only; works, documented gaps noted |
| Authentication | COMPLETE | 3-persona JWT scheme, fail-hard secret guard, blacklist revocation |
| Authorization | PARTIAL | Consistent ownership pattern exists but one router (`gallery_privacy.py` admin routes) doesn't apply it |
| Events | COMPLETE, but DUPLICATED | Two parallel creation systems (legacy profile CRUD vs. newer Event Engine) |
| Invitations | COMPLETE | |
| RSVP | PARTIAL | Submission path well-protected; check/update endpoints are not (see Security) |
| Media | COMPLETE | Presign-primary upload, originals preserved, real deletion |
| S3 | COMPLETE, but ARCHITECTURE MISMATCH | One bucket in `ap-south-1`, not the four-bucket `us-east-2` scheme assumed in the brief |
| Rekognition | COMPLETE, per-event isolation CONFIRMED | `maja_wedding_{profile_id}` collections |
| Guest selfie | COMPLETE | Consent-gated, rate-limited, 24h retention job present (scheduling UNVERIFIED) |
| Face matching | COMPLETE | Full index/search/DLQ pipeline |
| CloudTrail | CONFIGURED, UNUSED by app code | Account-level only |
| CloudFront | PARTIAL | Graceful fallback, blocked by account verification per brief |
| GCP deployment | PARTIAL | Manual VM runbook only, no IaC |
| AWS integration | COMPLETE | S3 + Rekognition both fully wired |
| Error handling | COMPLETE | Global handler, per-job DLQ, graceful degradation patterns throughout |
| Logging | PARTIAL | Per-module stdlib loggers; no central aggregation config found; `SENTRY_DSN` flagged as commonly unset (crash reporting gap) |
| Security | PARTIAL | 3 confirmed exploitable findings (below), otherwise a mature, previously-audited posture |
| Scalability | UNKNOWN | No load-test results reviewed this pass; see §18 |

---

## 16. Security Findings

Ranked by severity. All CONFIRMED via direct code read, not inferred.

1. **IDOR — `gallery_privacy.py` admin routes have no ownership check.** `admin_get`, `admin_update`, `admin_reset_code`, `admin_logout_all`, `admin_analytics` (`gallery_privacy.py:344-442`) authenticate any photographer (`get_current_admin`) but never verify the target `profile_id` belongs to that photographer's studio. **Exploit**: any logged-in photographer can supply another studio's `profile_id` to read that gallery's privacy config, **reset its access code** (locking out the real owner and all guests), or view its unlock/scan analytics. The fix pattern (`_require_owned_profile`) already exists and is used correctly in sibling modules — it simply wasn't applied here.

2. **Unauthenticated RSVP phone-number enumeration + PII disclosure.** `GET /invite/{slug}/rsvp/check?phone=...&guest_name=...` (`server.py:5908-5978`) has no rate limiting and no CAPTCHA, unlike its sibling submission endpoint. It confirms whether a phone number RSVP'd to a known-slug event, and returns the **full RSVP record** (phone, guest_count, message) when a matching guest name is also supplied. An attacker with a wedding's public invite URL can enumerate the guest list and, for any hit, brute-force guest names to pull PII.

3. **Weakly-authenticated RSVP tampering, chainable with #2.** `PUT /rsvp/{rsvp_id}` (`server.py:5981-6034`) has no rate limiting; its only "auth" is the caller re-supplying the guest's phone number in the request body. Combined with finding #2's phone+name disclosure, an attacker can silently rewrite another guest's RSVP status/count/message.

4. **`event_client` (Couple Access) tokens stored in `localStorage`, not HttpOnly.** (`frontend-v2` `ClientAuthContext.js:16,25-27`.) A larger XSS blast radius than the retired normal-user cookie model — any XSS on a couple-facing page could read this token and impersonate the couple for up to 7 days. Not necessarily wrong (Bearer/localStorage is a valid pattern), but it's an asymmetry from the httpOnly-cookie approach used elsewhere in the product's own history, worth a deliberate decision either way.

5. **Minor — inconsistent JWT-secret fallback.** `gallery_privacy.py:60` reads `JWT_SECRET_KEY` with its own unguarded `"change-me"` default, independent of `auth.py`'s fail-hard boot check on the same env var. Low practical risk (the primary path already refuses to boot insecurely), but two independent reads of one secret with different insecure defaults is worth unifying.

**Not a finding, noted for accuracy**: CLAUDE.md's claim that "bot-detection middleware blocks bare curl" does not match the code — the `BotDetectionMiddleware`/crawler-detection logic found (`server.py` ~10820-10900) decides whether to serve crawler-optimized HTML for SEO/share-link purposes; it does not reject non-browser requests. If curl is actually being blocked in practice, that's happening at an edge layer outside this repo (referenced in a comment near that code) — worth confirming with the owner since it affects how this codebase should be tested going forward.

**Not a finding, already handled**: secret rotation (AWS/Razorpay/Supabase/Gemini/JWT) — owner confirmed already done; not re-flagged per standing instruction. No hardcoded live secrets found in source in this pass.

---

## 17. Performance Findings

- **JSONB text-extraction queries are unindexed by default.** Any query filtering on a field not explicitly promoted via `create_index` falls back to `data ->> 'field'` extraction, which the blanket GIN index does not accelerate for non-equality/non-containment lookups. At current data volumes this is likely invisible; it becomes a real cost as tables grow (see §18).
- **`expireAfterSeconds` on `create_index` is a no-op.** Any code relying on Mongo-style TTL semantics for automatic row expiry is not actually getting it — rows accumulate until an external sweeper runs (or forever, if none does for a given table). Worth auditing which tables assume this.
- **Face-indexing runs against the 2048px preview, not the full original** — a deliberate, reasonable cost-control choice, not a bug.
- **Selfie-hash 24h cache** avoids redundant Rekognition calls for repeat searches by the same guest — a real, working optimization.
- No load-test results or query-plan (`EXPLAIN`) data were reviewed this pass — the above are structural observations, not measured numbers.

---

## 18. Scalability Findings

Based on the architecture as read (no load testing performed this pass — these are structural inferences from the code, not measurements):

- **10–100 events**: current design should perform without issue. Single-VM deploy, one Postgres instance, GIN-indexed JSONB is adequate at this scale.
- **1,000 events**: the ~255-table JSONB-only design likely still holds for point lookups (`id`-keyed or GIN-containment queries), but any list/filter view that isn't backed by an explicit `create_index` call starts doing full-table JSONB scans. Worth auditing which admin/studio list views (e.g. "all my weddings", "all RSVPs for an event") have a real index vs. rely on the fallback text-extraction path.
- **10,000 events**: single-VM Postgres + Redis becomes the likely first bottleneck regardless of query efficiency — no read replica, no connection pooler visible beyond `DB_POOL_MIN`/`DB_POOL_MAX` env tuning, single `core` container with 4 uvicorn workers. The `worker.py` face-job consumer is also single-process — a burst of simultaneous event-day uploads across many concurrent weddings would serialize through one Redis queue and one worker.
- **100 → 100,000 photos/event**: Rekognition's per-collection face limit and S3's effectively unlimited object count mean storage isn't the constraint — the face-indexing job queue and worker throughput are. At 100,000 photos for one event, the 24h selfie-cache and per-event rate limits help guest search stay cheap, but initial bulk indexing of that many photos through a single-worker queue would take a long time; no evidence of horizontal worker scaling in the current `docker-compose.yml` (one `worker` replica).
- **100 → 10,000 guests/event**: the unauthenticated, unrate-limited RSVP check/update endpoints (§16, findings 2-3) become materially more dangerous at higher guest counts — larger PII exposure surface, more plausible names to brute-force against. This is as much a security-at-scale concern as a performance one.
- No connection pooling middleware (like PgBouncer) was found in `docker-compose.yml` — at high concurrency, Postgres's own per-connection overhead (not pooled beyond asyncpg's in-process pool) could become a limit before query cost does.

---

## 19. Technical Debt

- **Two parallel event-creation systems** (legacy `profiles`/`admin/profiles` CRUD vs. newer `events`/Event Engine) — not resolved to one canonical path.
- **Two parallel gallery subsystems** (`gallery_features.py` studio-managed vs. `live_gallery_features.py` guest-upload-during-event) with separate photo collections.
- **Two parallel face-match systems**: the live Rekognition pipeline (`gallery_features.py`) and an inert manual-fulfillment table (`fulfillment_service.py`'s `face_match_records`) — risk of confusion for a future maintainer who finds the second one and assumes it's live.
- **Duplicated portfolio design-token maps** (`PhotographerPublic.jsx` vs. `lib/portfolioDesigns.js`) — currently in sync, previously caused a silent rendering mismatch when they weren't.
- **Two independent JWT-secret reads with different insecure fallbacks** (`auth.py` vs. `gallery_privacy.py`).
- **Legacy credit-system table names still present** in code despite the product-level credit retirement — likely dead, not confirmed fully inert.
- **`users` table/seed still active** despite normal-user accounts being a retired persona per product decision — worth confirming this is genuinely inert.
- **No formal migrations directory** — schema evolution happens implicitly via `ensure_table`/`create_index` calls scattered across ~90 files; there's no single place to see "the schema" or diff it over time.
- **`expireAfterSeconds` no-op** on `create_index` — any code assuming Mongo TTL semantics is silently wrong.
- **CLAUDE.md's "Run locally" section is stale** relative to the actual current dev stack (ports, paths) — a real onboarding hazard already flagged by the repo's own `SESSION_CONTEXT.md`.
- **`run.ps1` has a machine-specific fallback path** to a sibling repo checkout that only exists on the original author's machine.
- **Missing referential integrity everywhere** — a deliberate architectural choice (JSONB-Mongo-style), but it means every "relationship" is only as correct as the Python code that maintains it; there's no DB-level backstop against orphaned references.

---

## 20. Unused / Legacy Components

- `frontend/` — legacy CRA app, kept only as an unported-surface reference, not built into the deploy image.
- `microservices/` — reduced to one `db/schema.sql` file consumed by docker-compose init; the gateway + 5 stub services it once held are gone.
- `fulfillment_service.py`'s `face_match_records`/`face_match_rate_limits` — a separate, seemingly dead, manual-fulfillment face-match table, explicitly marked "not yet wired to real matching" in its own comment.
- `models.py:533` `rekognition_collection_id` field — confirmed inert; the live collection-tracking scheme lives entirely in `gallery_config.aws_collection_id` on the profile document instead.
- Legacy credit-system tables (`credit_ledger`, `credit_wallets`, `credit_packages`, etc.) — product-level feature retired, table names/possible dead code paths remain.
- Three items from SESSION_CONTEXT's "~30 legacy screens, never verified" list (`Phase30Analytics`, `PhotographerProfilePage`, `ThemeSettings`) were confirmed this pass to **not exist in frontend-v2 at all** — never ported, not merely superseded. The remaining ~27 items in that list were not individually re-verified this pass.
- 7 confirmed redirect-only routes in `frontend-v2` (`/designs`, `/create/ganesh`, `/community/about`, `/portfolio-plans`, `/order/pending`, `/experience/demo`, `/studio/themes`).
- `db.users` table — possibly fully dead post-pivot, not conclusively confirmed.

---

## 21. Unknown / Needs Verification

- Whether `cleanup_expired_selfies` and `cleanup_expired_galleries` are actually invoked by a scheduler at server startup in production, or exist only as callable-but-unscheduled functions.
- Full contents of `microservices/db/schema.sql` — may declare promoted/generated columns for some tables that would change conclusions about which fields are actually indexed.
- Whether `storage_pool_jobs.py`, `media_reconcile.py`, `usage_metering.py`, `drive_archive.py` background jobs run under the same `worker.py` process or as separate scripts.
- Whether `db.users` (normal-user accounts) has any remaining live write path, or is fully inert post-pivot.
- The remaining ~27 (of ~30) legacy-screen items from SESSION_CONTEXT §0.0.70 item 8, not individually re-verified this pass.
- Whether the "bot-detection blocking bare curl" behavior CLAUDE.md describes exists at an edge/proxy layer this codebase-only audit couldn't see.
- CloudTrail — confirmed active at the AWS account level per the brief, but no code in this repo consumes it; its actual current configuration was not independently verified (out of scope for a codebase-only audit).
- IAM policy specifics for the credentials in use — not verifiable from code.
- Whether production has actually had all six secret sets rotated (owner confirmed this in conversation; SECURITY_ROTATION.md's own text still says "NOT done" as of its last edit, predating that confirmation) — flagged only for internal consistency of the docs, not re-raised as an open task per standing instruction.
- Production readiness of the four flagged-missing integrations (email provider, SMS/OTP provider, live Razorpay key, — AWS is present) — confirmed absent from `.env.example` defaults, but current production `.env` state wasn't read (out of scope/inaccessible to a repo-only audit).

---

## 22. Current System Summary — "CURRENT STATE BASELINE"

Use this as the input baseline for the next phase (schema/architecture redesign discussion):

- **Stack**: FastAPI monolith (Python 3.11) + custom Mongo-compatible JSONB-over-Postgres adapter (no ORM, no FKs, no migrations dir) + Redis (rate limits, OTP, face-job queue) + Vite/React 18 frontend (`frontend-v2`, the only deployed one) + Caddy reverse proxy, all on one manually-provisioned GCP Compute Engine VM via docker-compose (5 containers: postgres, redis, core, worker, caddy).
- **AWS footprint**: one S3 bucket (`ap-south-1`, not the four-bucket/`us-east-2` scheme originally assumed), per-event Rekognition collections (`maja_wedding_{profile_id}` — genuinely isolated, confirmed), optional CloudFront (graceful fallback when unconfigured). No Lambda (intentionally removed). CloudTrail active at account level but not code-consumed.
- **Auth**: three JWT personas (photographer/studio, super-admin, event_client "Couple Access"), HS256, fail-hard secret guard on the primary path, consistent ownership-check pattern across most (not all) resource-scoped routes.
- **Known-good**: per-event face isolation, presign-primary media uploads with preserved originals, consent-gated guest selfie flow with a real (if unverified-as-scheduled) retention/deletion job, mature rate-limiting on login and face-search, a working DLQ for face-job failures.
- **Known-bad, concrete and fixable without architecture changes**: missing ownership check on `gallery_privacy.py` admin routes; missing rate limits on two RSVP endpoints; inconsistent JWT-secret fallback between two auth code paths.
- **Known-messy, needs a product decision before a redesign**: two parallel event-creation systems, two parallel gallery subsystems, one dead parallel face-match table, legacy credit tables of unclear liveness, ~255 ungoverned JSONB collections with no formal schema authority.
- **Known-manual**: GCP provisioning, deploys, and secret rotation are all human-run runbooks today — nothing in this repo automates infrastructure or deployment beyond `docker compose up`.

This document is the discovery pass only. No fixes, redesigns, or migrations were proposed or applied.
