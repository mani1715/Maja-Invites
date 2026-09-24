# MAJA Invites — Missing-Details Forensic Discovery Pass (2026-08-17)

Read-only. No code, infrastructure, database, AWS, or GCP was modified. This document is a companion to, not a replacement for, [`CURRENT_STATE_AUDIT_2026-08-16.md`](CURRENT_STATE_AUDIT_2026-08-16.md) (the "baseline"). It does not repeat baseline conclusions except where a finding here contradicts or resolves one. Repo: `C:\Users\yemin\Desktop\My Projects\M0001(MajaInvites)`, commit `474cfdb`.

Tags used throughout: **FACT** (verified in code, file:line cited), **INFERENCE** (reasonable conclusion, not directly stated), **UNKNOWN** (not determined this pass).

---

## 1. Complete Database Table Inventory

Methodology (FACT): grepped `db\.[a-z_]+\.` across all backend `.py` files (including `backend/storage/*.py`, `backend/face_providers/*.py`, `backend/scripts/*.py` — the full recursive tree, not just top-level), classified each call site by pg_adapter method (`insert_one/insert_many/update_one/update_many/delete_one/delete_many/find_one_and_update/replace_one` = writer; `find/find_one/aggregate/count_documents/distinct` = reader).

**269 distinct tables found** — larger than the baseline's rough "~255" estimate (that estimate undercounted because it didn't sweep `backend/storage/`, `backend/face_providers/`, `backend/scripts/`). ACTIVE = has both a writer and reader call site in production (non-test) code. LEGACY = matches a known-retired feature. INERT = name appears only in a comment/dead path. UNKNOWN = only a writer or only a reader found.

Representative slice of the full inventory (grouped by domain — the complete 269-row table is available in the source agent transcript; below are the tables load-bearing for the rest of this document):

| Table | Domain | Active? | Created/First Touched | Main Writers | Main Readers | Purpose |
|---|---|---|---|---|---|---|
| `admins` | Identity/Auth | ACTIVE | `account_security.py:53` | `account_security.py`, `admin_security.py`, `auth.py`, `server.py` | pervasive | Photographer/studio accounts — the platform's only live account type |
| `users` | Identity/Auth | **LEGACY BUT REFERENCED** (not dead) | `user_auth.py` | none (write path 410s) | `account_data.py`, `user_features.py`, `user_investigation.py`, `fulfillment_service.py` | Retired normal-user persona; see §17 |
| `profiles` | Invitations | ACTIVE | `server.py:2176` | ~15 modules | ~230 call sites across nearly every module | The core wedding/invitation entity — legacy system, still the only live one for weddings |
| `events` | Invitations (new engine) | ACTIVE, but dormant-by-default | `event_lifecycle_service.py:129` | `event_lifecycle_service.py`, `event_admin_service.py` | same + 6 sibling `event_*_service.py` files | Generic multi-event-type engine; flag-gated `ganesh_module_enabled`, currently registers only `ganesh_chaturthi` — see §8 |
| `event_registry` | Config | ACTIVE (seed-only) | `event_registry.py:276-290` | seed script only | `event_lifecycle_service.py` | Declares valid event types/schemas for the Event Engine |
| `invitations` | Invitations (new engine) | ACTIVE | `event_lifecycle_service.py:305,310,314` | `event_lifecycle_service.py`, `event_admin_service.py` | same | Events-engine's own "invitation" concept — **not the same table as `profiles`**, disjoint schema/FK (`event_id` not `profile_id`) |
| `event_members` | Invitations (new engine) | ACTIVE | `event_members_service.py:73` | `event_members_service.py` | same | Team/RBAC membership for Event Engine events — no equivalent exists for `profiles` |
| `guests` | Guest mgmt | ACTIVE | `guest_features.py:146` | `guest_features.py` | `guest_features.py`, `admin_dashboard_v2.py` | Per-event guest list (legacy/profiles side) |
| `rsvps` | RSVP | ACTIVE | `server.py` (RSVP submit region) | `server.py` | `server.py`, `photographer_clients.py`, `analytics_extras.py`, `monetization_features.py`, `admin_dashboard_v2.py` | Legacy/profiles RSVPs |
| `event_rsvp` | RSVP (new engine) | ACTIVE | `event_lifecycle_service.py:447` | `event_lifecycle_service.py` | same | A **third**, separate RSVP table — see §6, §8 |
| `gallery_photos` | Gallery (studio) | ACTIVE | `gallery_features.py:1314` | `gallery_features.py`, `worker.py` | `gallery_features.py`, `face_ops.py`, `media_reconcile.py`, `drive_archive.py`, `studio_weddings.py`, `photographer_clients.py` | Photographer-uploaded, S3-backed, Rekognition-indexed photos |
| `live_gallery_photos` | Gallery (live, system A) | ACTIVE | `live_gallery_features.py:300,405,546` | `live_gallery_features.py` | `live_gallery_features.py`, `live_wall_feed.py`, `monetization_features.py` | Guest-uploaded event-day photos, disk-stored — see §9 |
| `live_photos` | Gallery (live, system B) | ACTIVE | `premium_features.py:508,584` | `premium_features.py` | `premium_features.py`, `live_wall_feed.py` | A **second, independently-built** guest-upload gallery — see §9 |
| `profile_media` | Invitation gallery | ACTIVE | `server.py:4714` | `server.py` | `server.py` | Host-curated hero/cover photos on the invite page — see §9 |
| `wedding_album_media` | Invitation gallery | ACTIVE | `server.py:9544` | `server.py` | `server.py` | A **separate** "Wedding Album" feature, disjoint from `profile_media` — see §9 |
| `portfolio_works` / `portfolio_albums` / `portfolio_profiles` | Portfolio | ACTIVE | `portfolio_service.py` | `portfolio_service.py` | `portfolio_service.py`, `photographer_directory.py`, `pixora_service.py` | Photographer's own marketing portfolio — architecturally separate from event galleries, no cross-write found |
| `proofing_galleries` / `proofing_photos` | Proofing | ACTIVE | `client_studio_service.py` | `client_studio_service.py` | same | Client-studio "select your favorites" flow |
| `photo_requests` | Manual fulfillment | ACTIVE | `gallery_features.py:867-917` (list/status only; creation site not re-verified) | `gallery_features.py` | `gallery_features.py` | Manual "get my photos" lead capture — explicitly not automated per baseline §12 |
| `face_search_sessions` | Face search | ACTIVE | `gallery_features.py:720,755,768` | `gallery_features.py`, `worker.py` | `gallery_features.py`, `media_reconcile.py`, `face_consent.py` | Per-selfie-search job/result state |
| `face_consent` | Face search | ACTIVE | `face_consent.py:80-90` | `face_consent.py` | `face_consent.py` | DPDP consent ledger |
| `face_dead_letters` | Face search DLQ | ACTIVE | `worker.py:109-120` | `worker.py` | `face_ops.py` | Failed face jobs after 5 retries |
| `face_match_records` | Face search (fulfillment, legacy) | **LEGACY, likely inert** | `fulfillment_service.py:423-444` | `fulfillment_service.py` | `fulfillment_service.py` | Manual-fulfillment-only face-match table, own comment says "not yet wired to real matching" — confirmed by baseline, not re-verified as fully dead this pass |
| `orders`, `payments`, `invoices`, `subscriptions` | Commerce | ACTIVE | `subscription_service.py` | `subscription_service.py` | multiple | See §10 for the full multi-surface commerce picture — these names are **reused with incompatible shapes** across different modules |
| `invitation_orders` | Commerce (store) | ACTIVE | `store_features.py:783` | `store_features.py` | `store_features.py` | The store/à-la-carte purchase order table — distinct from `orders` (subscriptions) |
| `event_orders` | Commerce (new engine) | ACTIVE | `event_payments.py:144-149` | `event_payments.py` | `event_payments.py` | A **fourth** independent order table — see §10 |
| `credit_ledger`, `credit_purchases`, `credit_plans`, `user_credit_ledger` | Commerce (legacy credits) | **NOT fully inert** — see §17 | various | `restructured_admin_service.py` still writes `credit_plans` | `super_admin_v2.py`, `super_admin_pricing.py`, `user_features.py`, `business_intelligence.py`, `user_investigation.py` | Product-retired feature with live read AND (for `credit_plans`) live write paths still reachable |
| `credit_packages` | Commerce (legacy credits) | INERT | `init_default_pricing.py:306` | orphaned script only | none | Dead stub |
| `credit_wallets` | — | **DOES NOT EXIST** | — | — | — | Baseline's name doesn't match any real table — correction |
| `pixora_*` (~55 tables) | Community | ACTIVE | `pixora_service.py` | `pixora_service.py` | `pixora_service.py` | Largest single-owner block; not individually field-audited this pass |
| `studio_staff` | Team/RBAC | ACTIVE, but functionally isolated | `studio_staff.py` | `studio_staff.py` | `studio_staff.py` only | See §14 — its permission matrix is not consulted by any other router |
| `storage_accounts`, `storage_files`, `storage_folders` | Storage pool | ACTIVE | `backend/storage/orchestrator.py` (not top-level `backend/*.py` — baseline's original grep missed this file) | `backend/storage/*.py` | `backend/storage/*.py`, `storage_pool_service.py` | Platform-level pooled Google Drive accounts |
| `admin_action_log` | Audit | ACTIVE, but narrow | `pixora_service.py:759` | `pixora_service.py` only | `pixora_service.py` | Despite its generic name, has exactly ONE call site in the whole backend — most admin actions actually log to `audit_logs` instead (§21) |
| `audit_logs` | Audit | ACTIVE, comprehensive | pervasive (~48 sites) | pervasive | `user_investigation.py`, `server.py` | The real general-purpose admin/security audit trail |
| `event_audit_logs` | Audit (new engine) | ACTIVE, narrow | `event_admin_service.py:61`, `event_lifecycle_service.py:98` | same | same | Scoped only to Event Engine lifecycle actions |
| `pricing_audit_log` | Audit (pricing) | ACTIVE, narrow | `pricing_activation.py:59`, `pricing_hub_service.py:72` | same | same | Scoped only to pricing-hub changes |

**Correction to baseline**: the true collection count is **269, not ~255** — the shortfall was a grep-scope gap (baseline's search didn't recurse into `backend/storage/`), not a real discrepancy in what exists.

---

## 2. Field-Level Inventory (priority tables)

`profiles` (partial — the full model has ~90 fields per `models.py`'s `Profile`/`ProfileCreate`, not reproduced in full here):

| Field | Type | Required? | Used For | Written By | Read By | Indexed? | Relationship |
|---|---|---|---|---|---|---|---|
| `id` | string, `uuid4().hex` | yes | primary key | `server.py:2176` | pervasive | Y (PK) | — |
| `admin_id` | string, `uuid4().hex` | yes (but see caveat) | ownership | create/duplicate/template endpoints | pervasive ownership checks | Y (`profiles_admin_created_desc` etc., §4) | → `admins.id` |
| `slug` | string | yes, unique-in-practice | public URL | create endpoint | public invite lookup | Y (`profiles_slug`) | — |
| `status` | string enum | yes | lifecycle | many | many | Y (compound with `admin_id`) | — |
| `is_template` | boolean | no | template flag | `server.py:2724` | `server.py:2724,2749`, `admin_dashboard_v2.py:103` | **N** (no index — §4 gap #6) | — |
| `is_published` | boolean | no | publish flag | publish endpoints | `admin_dashboard_v2.py:113-116` | **N** (§4 gap #7) | — |
| `deleted_at` | timestamp or null | no | soft-delete | delete endpoint | trash-tab filters | Y (sparse partial, `admin_id+deleted_at`) | — |
| `archived_at` | timestamp or null | no | archive flag | archive endpoint | archived-tab filters | Y (sparse partial) | — |
| `gallery_config` | nested object | no | studio gallery settings | `gallery_features.py:325,335,346,1104,1318,1401` | `gallery_features.py` throughout | N/A (nested, not independently indexed) | contains `aws_collection_id` (→ Rekognition, external) |
| `created_at` (data key) | ISO string | yes (app-set) | sort/display | ~164 write sites | ~133 sort call sites | **NOT the same as the schema column** — see §16 | — |

`gallery_photos`:

| Field | Type | Used For | Written By | Read By | Indexed? |
|---|---|---|---|---|---|
| `profile_id` | string | parent FK | `_ingest_photo_bytes`, `gallery_features.py:1314` | 9+ call sites (`gallery_features.py`, `face_ops.py`, `drive_archive.py`, `media_reconcile.py`) | **N — no index found anywhere** (§4 gap #1, the single most-queried unindexed field in the whole schema) |
| `s3_key`, `thumb_s3_key`, `original_s3_key` | string, S3 key path | delete/retrieval | upload/commit endpoints | `delete_photo` (`gallery_features.py:462-463`) | N/A |
| `aws_face_ids` | array of Rekognition FaceId strings | face delete on photo delete | `index_photo_job` | `delete_photo` | N/A (external IDs) |
| `face_count` | int | UI/analytics | `index_photo_job` | `gallery_features.py:380` (filtered count) | **N** |
| `needs_reindex`, `index_error` | boolean / string | retry bookkeeping | `worker.py` | `worker.py`, `face_ops.py` | N/A |

`face_search_sessions`:

| Field | Type | Used For | Written By | Read By | Indexed? |
|---|---|---|---|---|---|
| `id`/`session_id` | **`str(uuid.uuid4())` — dashed UUID**, NOT the `.hex` convention used everywhere else | polling, DLQ FK | `gallery_features.py:720` | frontend polling, `face_dead_letters.session_id` | Y (PK) |
| `profile_id` | string | parent FK | creation | `gallery_features.py:1417`, `media_reconcile.py:67`, `face_consent.py:125` | **N — no index found** (§4 gap #2) |
| `selfie_s3_key`, `selfie_hash` | string | retention sweep, 24h dedup cache | creation | `cleanup_expired_selfies` | N/A |
| `matched_photo_ids` | **array** of `gallery_photos.id` | resolve results | search job | frontend results display | N/A (array) |
| `status` | string enum: `queued/done/failed` | job state machine | search job, worker | polling | N/A |

`admins`, `orders`, `payments`, `subscriptions` field shapes are covered in depth in §10 (Payment/Commerce Forensics) rather than duplicated here, since their field-level detail is inseparable from the multi-surface commerce finding.

**Type inconsistency flagged**: `id`/session-id generation format is NOT uniform across the schema — `face_search_sessions.id` uses dashed UUID (`str(uuid.uuid4())`) while `profiles.id`, `admins.id`, `gallery_photos.id`, and effectively every other table use `.hex` (32-char, no dashes). Confirmed FACT, `gallery_features.py:720` vs. the pervasive `.hex` pattern elsewhere.

---

## 3. Relationship Discovery

| Source Table | Field | Target Table | Target Field | Relationship | Required | Enforced? |
|---|---|---|---|---|---|---|
| `profiles` | `admin_id` | `admins` | `id` | many:1 | yes at create; legacy rows may lack it | **Not a DB FK.** No existence check at write time; ownership checked only at read time via `_require_owned_profile`-style helpers. Legacy rows with no `admin_id` bypass the check entirely (logged, not rejected) — `gallery_features.py:226-235` |
| `gallery_photos` | `profile_id` | `profiles` | `id` | many:1 | yes | Python-only; existence looked up only incidentally (to fetch `admin_id` for ownership), not as a referential guard. **Orphan-prone** — nothing stops a `gallery_photos` row surviving after its `profiles` row is hard-deleted (confirmed concretely in §23 finding 2) |
| `face_search_sessions` | `profile_id` | `profiles` | `id` | many:1 | yes | same pattern |
| `face_search_sessions` | `matched_photo_ids` | `gallery_photos` | `id` (via Rekognition `ExternalImageId`) | **array, 1:many** | no | not checked against `gallery_photos` existence on read — orphan-prone if a photo is later deleted |
| `guests` | `profile_id` | `profiles` | `id` | many:1 | yes at create | parent existence guaranteed only by construction (written after `_get_profile_owned` succeeds), not by a DB check |
| `rsvps` | `profile_id` | `profiles` | `id` | many:1 | yes | parent resolved server-side from slug at write time |
| `events` | `owner_id` + `owner_kind` | `admins.id` **or** `users.id` | `id` | many:1 | yes | **Polymorphic, but explicitly tagged** — `event_lifecycle_service.py:49-53`: `owner_kind` disambiguates which table `owner_id` resolves against. The one deliberately self-describing polymorphic reference in the codebase. |
| `event_audit_logs` | `user_id` | `admins.id` **or** `users.id` | `id` | many:1 | — | **Polymorphic and UNTAGGED** — `event_lifecycle_service.py:100`: `(current or {}).get("user_id") or (current or {}).get("admin_id")`, no companion `kind` field stored. A downstream reader cannot tell which table it resolves against without re-deriving it elsewhere. |
| `pixora_*` (~55 tables) | `studio_id` | `admins` | `id` | many:1 | yes | **`studio_id` is a rename of `admin_id`, not a distinct entity** — `studio_id = admin["admin_id"]` (`subscription_service.py:679` etc.) — see §16 for the drift this has caused |
| `storage_files` | `studio_id` / `drive_account_id` | `admins`, `drive_credentials` | `id` | many:1 | yes | `storage_analytics.py:53` reads `f.get("studio_id") or f.get("admin_id")` — **direct evidence the two field names are already confused by the app's own code** |
| `orders`/`invoices` | `razorpay_order_id`, `razorpay_payment_id` | *(Razorpay, external)* | — | many:1 | set post-payment | External gateway IDs (`order_xxx`/`pay_xxx` format) coexist with a differently-shaped local `id` on the same document — see §15 |
| `event_children_service` generic child tables | `event_id` + own `id` | `events` | `event_id` | many:1 | yes | No DB check that `event_id` still exists when a child row is created/read |

**Orphan-prone relationships, explicit list**: `gallery_photos.profile_id`, `face_search_sessions.profile_id`, `rsvps.profile_id`, `guests.profile_id`, all `pixora_*.studio_id` tables, `event_children_service` child tables' `event_id`. None have a DB-level cascade or an integrity sweep. This is not hypothetical — §23 finding 2 confirms the 5-day profile trash-purge hard-deletes `profiles` rows without cascading to any of these.

**Arrays-of-IDs**: `gallery_photos.aws_face_ids` (external Rekognition IDs), `face_search_sessions.matched_photo_ids` (→ `gallery_photos.id`).

**ID-format mismatches**: none found where a field claims to reference `admins.id` but stores a different shape — `admins.id` is consistently `.hex` and every `admin_id`/`studio_id` write traced matches. The real mismatch is **external IDs living beside local ones on the same document** (Razorpay's `order_/pay_` prefixed strings next to a local `id`).

---

## 4. Index Forensics

**Three independent, non-overlapping index-creation mechanisms exist** (this itself is new information the baseline did not surface):

| # | Mechanism | Runs | Reaches an EXISTING production DB? |
|---|---|---|---|
| A | `pg_adapter.Collection.create_index()` real DDL — `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS` | every server boot (`server.py` startup handlers) | **Yes** |
| B | `event_schema.ensure_schema()` (`backend/event_schema.py:98-122`) | every server boot | **Yes** — single-field expression indexes only (no compounds), 27 indexes across 25 Event-Engine collections |
| C | `microservices/db/schema.sql` — full `CREATE TABLE` + generated columns + indexes | **only on a brand-new Postgres volume** (Postgres `initdb` semantics) | **No**, for any already-existing production volume — confirmed by `pg_adapter.py`'s own code comment |

**Consequence**: on the real running database, only mechanisms A and B reliably apply. Schema.sql's ~30 declared indexes (including several `UNIQUE` constraints on `orders`, `payments`, `subscriptions`, `invoices`) are only live if that exact volume was initialized fresh from it — this directly resolves baseline §21's open question, and the answer is: **mostly no, for any long-running production database.**

**Mechanism A — corrected count**: baseline estimated "~40 call sites." Actual count: **13 textual call-site lines producing 26 real indexes** (one of which, `profiles.id`, is redundant with the PK). The "~40" figure appears to have conflated mechanism A with the previously-unmentioned mechanism B.

**Notable indexes that exist** (mechanism A): `payment_records.razorpay_payment_id` (UNIQUE), `gift_code_redemptions.(code,admin_id)` (UNIQUE), `profiles.(admin_id,created_at)`, `profiles.(admin_id,status,created_at)`, `profiles.(admin_id,deleted_at)` (sparse), `profiles.(admin_id,archived_at)` (sparse), `profiles.slug`, `rsvps.profile_id`, plus ~15 more analytics/engagement-tracking single/compound indexes.

**Confirmed missing-index gaps** (query pattern cited, no matching index in any of the 3 mechanisms):

| # | Field(s) | Query site | Impact |
|---|---|---|---|
| 1 | `gallery_photos.profile_id` | 9+ sites (`gallery_features.py`, `face_ops.py`, `drive_archive.py`, `media_reconcile.py`) | The single most-queried unindexed field found in the whole schema |
| 2 | `face_search_sessions.profile_id` | `gallery_features.py:1417`, `media_reconcile.py:67`, `face_consent.py:125` | — |
| 3 | `guests.profile_id` (sorted by `created_at`) | `guest_features.py:126` | — |
| 4 | `rsvps.guest_phone` (compound with `profile_id`) | `server.py:5924-5927` — the same endpoint flagged in baseline §16 finding 2 | Indexing gap compounds the security gap already reported |
| 5 | `profiles.is_template`, `.is_published`, `.expires_at`, sort keys `view_count`/`bride_name`+`groom_name` | `admin_dashboard_v2.py:103,113-116,135,160-161`, `server.py:2724,2749` | Studio dashboard list/filter views |
| 6 | `admins.role` | `super_admin_v2.py:120` | — |
| 7 | `orders.(studio_id,status)`, `payments.(studio_id,status)` | `monetization_features.py:103,105` | Only covered under the fresh-volume-only mechanism C |
| 8 | `subscriptions.product` (no `studio_id` prefix) | `founding_pricing.py:171`, `subscription_service.py:476` | Schema.sql's compound index leads with `studio_id`, doesn't cover this filter shape even if live |
| 9 | `portfolio_works.studio_id`, `portfolio_albums.studio_id`, `portfolio_profiles` (frequently unfiltered `.find({})`) | `monetization_features.py:129-130`, `pixora_service.py` (10+ sites), `photographer_directory.py:186` | — |
| 10 | All ~55 `pixora_*` tables' `studio_id`/`followee` filters | sampled `pixora_service.py:868-1077` | Zero coverage across the entire community subsystem |
| 11 | `storage_accounts.kind`, `storage_addons.(studio_id,active)`, `storage_files.upload_status`, sort `uploaded_at`, `storage_event_deletions.status`, `storage_folders.event_id` | `event_folders.py:94`, `monetization_service.py:79,154`, `storage/migrate.py`, `storage/orchestrator.py` | — |
| 12 | `audit_logs` sort key `timestamp` | `server.py:807-810,4482` | The only `audit_logs` index anywhere (schema.sql, fresh-volume-only) covers `actor_id`/`action`, neither of which is `timestamp` |
| 13 | `profiles` multi-field `$regex` search (`bride_name`,`city`,`venue`,`contact_info.*`,`tags`) | `admin_dashboard_v2.py:140-150` | Structurally unindexable by any btree the codebase builds — needs `pg_trgm`, absent everywhere |

---

## 5. Query Forensics

Covered inline within §4's gap table above (the user's requested format is preserved there since index coverage and query pattern are two views of the same evidence). Additional query-shape notes not already captured:

- `admin_dashboard_v2.py:652-655` — bulk `$in` + range filter (`profile_id: {$in:[...]}`, `created_at: {$gte: cutoff}`) sorted by `created_at desc`: the single-field `profile_id` index exists but is not compound with `created_at`, so this specific query pattern cannot use one index efficiently even though a partial index exists for the leading field.
- `founding_pricing.py:171`, `subscription_service.py:476` — unbounded `.find({"product": p}).to_list(100000)` calls exist (no pagination) against `subscriptions` — a structural scale risk independent of indexing (see §24).
- Pixora domain (sampled 11 of ~55 tables at `pixora_service.py:868-1077`) — every sampled table's `studio_id`/`followee` filter and every sort key (`day`, `created_at`, `price_inr`) has zero index coverage; only the blanket per-table GIN applies.

---

## 6. API → Database Map

Deep traces for the specific endpoints requested (not all 150+ routes — see baseline for the representative table):

```
POST /api/auth/register
→ tables written: admins (insert)
→ tables read: admins (uniqueness checks)
→ Redis: yes (OTP key deletion, requires prior verified OTP session)
→ authorization: none (public signup, gated on prior OTP verification)

POST /api/auth/login
→ tables written: none on success; login_attempts/login_history on FAILURE only
→ tables read: admins
→ Redis: yes (rate_limit_allow per-IP+per-identifier, exponential backoff state)

POST /admin/profiles  (legacy invitation creation — THE live path)
→ tables written: profiles (insert), audit_logs (create action)
→ tables read: admins (super-admin impersonation target), profiles (slug-collision loop)
→ S3: no direct call; storage_pool_hooks.provision_event fire-and-forget, flag-gated OFF by default
→ authorization: require_admin

POST /api/events  (newer Event Engine creation)
→ tables written: events (draft insert)
→ GATE: entire module 404s unless `ganesh_module_enabled` flag is true — this is DORMANT infrastructure by default, not a currently-competing live system
→ authorization: get_current_buyer (hybrid admin/user dep)

POST /api/weddings/{wedding_id}/publish  (the ACTUAL live-bearing publish path — NOT /admin/profiles/{id}/enable, NOT the Event Engine's publish)
→ service: wedding_lifecycle_service.py:257-454
→ tables written: profiles (find_one_and_update lock-claim, then status/expiry update)
→ tables read: profiles, expiry_tiers, admins
→ background job: drive_archive.enqueue_archive (best-effort, fire-and-forget)
→ authorization: get_current_admin, ownership enforced via admin_id match inside the CAS filter itself (not a separate helper call)
→ api/weddings.js:20-23 carries an explicit comment: "only publish path is /api/weddings/{id}/publish — do not 'optimise' this" — evidence this was a previously-fixed footgun

POST /api/rsvp  (guest RSVP submit — the actual route; slug is a query param, not a path segment)
→ tables written: rsvps (insert), captcha_challenges (consumed)
→ tables read: profiles (by slug), rsvps (dedup by profile_id+guest_phone), captcha_challenges
→ Redis: yes — rate limit (5/IP/day) + CAPTCHA escalation
→ authorization: none (public); well-protected. Its siblings GET /invite/{slug}/rsvp/check and PUT /rsvp/{rsvp_id} are NOT similarly protected — confirms baseline §16 findings 2-3 unchanged.

POST /api/public/events/{slug}/rsvp  (Event Engine's OWN, separate RSVP endpoint)
→ tables written: event_rsvp (insert) — a THIRD, entirely separate RSVP table from `rsvps`
→ authorization: public
→ Only reachable from an Event-Engine-published /e/{slug} page, itself dormant-by-default

POST /admin/profiles/{profile_id}/gallery/enable
→ tables written: profiles (gallery_config sub-doc update — sets aws_collection_id etc.)
→ Rekognition: yes — create_collection(collection_id), only if payload.enabled
→ authorization: get_current_admin + _require_owned_profile — CORRECTLY applied here (contrast with gallery_privacy.py's sibling admin routes, which are NOT — baseline §16 finding 1)

DELETE .../gallery/photos/{photo_id}  (studio photo delete)
→ tables written: gallery_photos (delete)
→ S3: yes — delete_objects (preview/thumb/original), try/except-wrapped
→ Rekognition: yes — delete_faces, try/except-wrapped
→ authorization: get_current_admin + _require_owned_profile — confirmed correctly applied

POST /api/invite/{slug}/gallery/guest-upload  (guest-facing live gallery upload)
→ tables written: live_gallery_photos (insert) — DISTINCT table from gallery_photos
→ S3: NO for the primary write — bytes saved to LOCAL DISK (UPLOAD_ROOT); a best-effort fire-and-forget mirror to a Drive-backed storage pool happens separately
→ Rekognition: NO — no face indexing happens on guest-uploaded live-gallery photos AT ALL. These photos are permanently excluded from face-search. This is a functional gap, not just a storage-path difference — see §9.
→ Redis: yes — dual rate limits (per-IP, per-slug)
→ real-time: WebSocket/SSE broadcast to connected viewers — a feature the studio gallery path does not have
→ authorization: none (public, rate-limited by design)

POST /public/gallery/{slug}/face-search
→ tables written: face_search_sessions (insert)
→ S3: yes (selfie upload, tagged for 24h retention sweep)
→ Redis: yes (dual rate limits, 24h selfie-hash cache)
→ Rekognition: yes, but INDIRECT — happens inside the enqueued/inline job body, not in this handler
→ background job: yes — face_queue "FACE_SEARCH", DLQ after 5 attempts
→ authorization: public; gated by privacy-code check + DPDP consent + dual rate limits

POST /api/client/login  (couple/client access)
→ tables read: event_client_accounts (by username), profiles (by acc.profile_id)
→ throttle: its OWN independent (IP, username) throttle mechanism — a FOURTH distinct throttling implementation in the codebase (admin login, RSVP submit, face-search, and this one each have separately-coded throttle logic, not a shared helper)
→ FILE PATH CORRECTION to baseline: the token-storage file is frontend-v2/src/lib/clientAuth.js (a plain module, NOT a React context), not "ClientAuthContext.js" as the baseline cited — that name only exists in the legacy, non-deployed frontend/. The underlying finding (localStorage.client_token, not httpOnly) is unchanged and reconfirmed at lib/clientAuth.js:10,16-25,37-38.

POST /api/store/order/create  (store/à-la-carte purchase)
→ tables written: invitation_orders (insert, both test-bypass and real-payment paths)
→ External: razorpay_client.order.create(), amount always server-recomputed from stored prices, price=0 rejected (422)
→ TEST-account bypass: fully skips Razorpay, marks paid with amount_inr=0 for owner dogfooding — same bypass pattern INDEPENDENTLY reimplemented in subscription_service.create_subscription (not shared code)

POST /api/subscriptions/create + /verify
→ tables written (create): subscriptions (insert), orders (insert) — TWO rows for one pending purchase, not one
→ tables written (verify): subscriptions (status→active, CAS-guarded), orders (status→paid, UNGUARDED), payments (insert, UNGUARDED), audit_logs (insert)
→ See §10 A.5 for the concrete double-insert race this unguarded sequence creates
→ authorization: require_admin (studio/photographer only)
```

**Explicit "parallel-system" flags, sharpened beyond the baseline's framing:**

1. **Event creation is not two competing live systems today — legacy is live, Event Engine is dormant.** `events`/Event Engine 404s entirely unless `ganesh_module_enabled` is set, and currently only registers the `ganesh_chaturthi` event type — never `wedding`. Whether the flag is actually on in production is UNKNOWN this pass.
2. **A THIRD publish mechanism exists** (`wedding_lifecycle_service.py`, not `event_lifecycle_service.py`, not a simple `enable` toggle) and it's the one the live frontend actually calls — a future reader searching only the two "obvious" places would miss the real path.
3. **RSVP storage is split three ways**: `rsvps` (legacy, live), `event_rsvp` (Event Engine, dormant-by-default), and no reconciliation between them.
4. **Gallery subsystems diverge in more than storage path** — the live-gallery guest-upload system never indexes faces, meaning guest-uploaded photos are invisible to the face-search feature entirely (see §9).
5. **The free-test-account payment bypass is independently reimplemented** in `store_features.py` and `subscription_service.py` — same intent, two non-shared code paths.

---

## 7. Frontend → API → Database Trace

Summary of journeys traced to their actual live path (full endpoint chains are in §6; this section records which FRONTEND components are the real, reachable entry points):

- **Photographer signup/login**: `SignIn.jsx` → `AuthContext.jsx:97` → `/api/auth/login` → `admins`.
- **Event/invitation creation**: TWO frontend entry points confirmed still both wired — `StudioWeddingWizard.jsx` → `api/weddings.js` → `/api/admin/profiles` (**the live, load-bearing path** — reachable from the Studio panel) vs. `EventBuilder.jsx` → `api/events.js` → `/api/events` (gated behind `ganesh_module_enabled`; if the flag is off in production, this entire UI hits a 404 wall — UNKNOWN whether that's the case).
- **Invitation publishing**: `StudioWeddingWizard.jsx:190` → `api/weddings.js:32` → `POST /api/weddings/{id}/publish` — this is the confirmed live publish path, distinct from both the Event Engine's publish and the simple gallery `enable` toggle.
- **Guest RSVP**: `GuestInvitation.jsx:513` → `invitations.js:57` → `/api/rsvp` → `rsvps` table — the live wedding-invite RSVP path. Event Engine's separate RSVP (`events.js:87`) only reachable from an Event-Engine-published `/e/{slug}` page.
- **Gallery upload (studio side)**: exact calling component not identified with full confidence this pass — `gallery.js` does NOT carry the presign/commit calls (those exports are privacy/unlock/live-gallery/favorite only); the studio presign/commit calls likely live in `uploads.js` — **UNKNOWN, flagged for follow-up**, not resolved this pass.
- **Live guest photo upload**: `LivePhotoWall.jsx` (the real implementation — `LiveGallery.jsx` is a 3-line re-export per baseline) → `gallery.js:20` → `/api/invite/{slug}/gallery/guest-upload` → `live_gallery_photos` + local disk.
- **Guest selfie search**: `FindMyPhotos.jsx` (imported by `LivePhotoWall.jsx`, confirming it's reachable from the live event-day gallery page) → `facematch.js:9` → `/api/public/gallery/{slug}/face-search`.
- **Couple/client access**: `CoupleAccess.jsx:98` → `lib/clientAuth.js:35` → `/api/client/login` → `event_client_accounts` + `profiles`. **File path correction to baseline** noted in §6.
- **Portfolio**: `portfolio.js` hits `portfolio_service.py` routes; portfolio access is gated through the SAME `subscriptions` system as everything else, not a separate credit/portfolio-specific paywall — `portfolio.js:36` calls `/api/subscriptions/plans?product=portfolio`.
- **Admin operations (super-admin viewing a photographer)**: `AdminDashboard.jsx` → `admin.js:4` → `/api/super-admin/admins` — backend owner module not re-traced this pass (UNKNOWN, likely `super_admin_service.py` per baseline, not re-verified for this specific route).

---

## 8. Event Model Forensics

**Verdict: (c) leaning strongly toward (b) — historical/architectural duplicates of the same underlying concept, built as two fully disjoint systems, currently kept apart mostly by scope and a rollout flag, not by any genuine enforced separation of concerns.**

**Evidence for genuine separation** (why this isn't simply "the same thing twice"):
- **Zero code coupling** — `event_lifecycle_service.py` never imports/calls anything in `server.py`'s profile routes, `gallery_features.py`, or `fulfillment_service.py`, and vice versa. This is an *asserted design rule* in the code itself: `event_lifecycle_service.py:9-10` states "A dedicated `events` collection is the root — the wedding `profiles` collection is never touched," and it's **enforced by tests** (`test_event_engine.py:80`: `_check(await db.profiles.find_one({"id": draft["event_id"]}) is None, "profiles untouched")`).
- **Two entirely separate frontend wizard flows** with no shared component.
- **No Pydantic model overlap** — `Profile`/`ProfileCreate` in `models.py` is a hard-coded ~90-field wedding shape; `events` has no Pydantic model at all, it's a config-driven generic schema (`event_registry.py`).
- **The Event Engine currently registers only ONE event type: `ganesh_chaturthi`** (`event_registry.py:222`) — never `wedding` — and the whole module is **flag-gated off by default** (`ganesh_module_enabled`, `event_registry.py:32,300-307`). So today they are not two live systems competing for the same traffic; `events` is dormant, narrower-scope parallel infrastructure, not (yet) a live duplicate.

**Evidence the overlap is real and significant** (why it's not "genuinely different concepts" either):
- Both represent a single celebratory occasion owned by a photographer/user, produce a public shareable slug/link, support a draft→published-style lifecycle, support RSVP, support gallery/media, support donations/gifting. This is the exact conceptual overlap the baseline flagged, now confirmed feature-by-feature.
- `event_members` (team/RBAC) has no equivalent on the `profiles` side at all (`profiles` is single-owner only) — a genuine capability gap between the two, not just duplication.

**Bottom line, sharper than the baseline's framing**: the risk is **prospective, not current**. If `wedding` (or any type overlapping `profiles`' domain) is ever registered in `event_registry.EVENT_TYPES` and the flag flipped on, the two systems would genuinely compete to represent the same real-world object with incompatible schemas, separate slugs (`/invite/:slug` vs `/e/:slug`), separate RSVP/member/gallery subsystems, and **no migration or dedup path visible anywhere in this codebase.** Whether such a migration is planned is UNKNOWN — no doc/comment addressing it was found beyond a reference to a "Master Guide §Backward Compatibility" that could not be located as an actual file this pass.

`wedding_profiles` — **does not exist as a live collection.** The only two hits repo-wide are explanatory comments about a historical bug: a homepage counter used to query `db.wedding_profiles` (a collection nothing ever wrote to) and always returned 0; it was fixed to query `db.profiles` instead. This name is a dead artifact of a prior bug, not a real table — baseline's inclusion of it in the list of "tables to compare" was based on a name that no longer (and perhaps never) pointed at real data.

---

## 9. Gallery Model Forensics

**This is the single most consequential new finding of this whole pass.** The baseline's one-line flag ("two parallel gallery subsystems... with separate photo collections") substantially undersold the situation.

**Actual count: at least five, arguably six, independently-built "photos attached to something" systems:**

| System | Table(s) | Storage | Face-indexed? |
|---|---|---|---|
| Studio Gallery (AI face-match) | `gallery_photos` | S3, presign-primary | **YES — the only one** |
| Live Guest Gallery, system A | `live_gallery_photos` | Local disk | No |
| Live Guest Gallery, system B | `live_photos` | Local disk (different dir) | No |
| Invitation Gallery (host hero/cover photos) | `profile_media` | Local disk | No |
| "Wedding Album" (separate later feature) | `wedding_album_media` | Local disk | No |
| Portfolio Media (photographer's own marketing) | `portfolio_works`/`portfolio_albums` | Local disk, storage-pool mirrored | No (architecturally separate, correctly not a duplicate — no cross-write found) |

**The live-gallery duplication is self-documented in the code, not inferred.** `backend/live_wall_feed.py:1-22` contains this verbatim comment:

> "THE BUG THIS FIXES: MAJA grew two independent live-gallery implementations that write to two different collections — `live_gallery_features.py` → `db.live_gallery_photos` (keyed `wedding_id`) ... and `premium_features.py` → `db.live_photos` (keyed `profile_id`, plus `approved`, `favorite_count`, `favorited_by`) and this is the one the PUBLIC wall at `/invite/{slug}/live-gallery` read. So every photo a studio uploaded went into one collection and the wall guests scan the QR for read the other. The wall was permanently empty."

The team's fix was a **read-side reconciliation shim** (`live_wall_feed.py`'s `fetch_wall()`, merging + de-duping both tables at query time), not a consolidation of the writers. New photos still land in whichever table their specific upload endpoint targets:

- `live_gallery_features.py` guest-upload → `live_gallery_photos` only
- `premium_features.py` guest-upload (a **different** guest-upload endpoint, `/invite/{slug}/live-gallery/guest-upload`) → `live_photos` only

**A live asymmetry confirmed in the reconciliation itself**: the PUBLIC wall (`GET /invite/{slug}/live-gallery`) is merged across both tables via `live_wall_feed.fetch_wall`. The ADMIN moderation view (`GET /admin/profiles/{profile_id}/live-gallery`) is **NOT merged** — it reads `live_photos` only. So a photographer moderating their live gallery cannot see or moderate photos that landed in `live_gallery_photos` through the sibling upload path.

**Cross-write analysis — direct answer to the user's core question**: **no single physical photo is written into more than one gallery-photo table by any single upload call.** Every upload endpoint targets exactly one table (confirmed by tracing both cited guest-upload insert sites: `live_gallery_features.py:405` writes only to `live_gallery_photos`, plus a fire-and-forget storage-pool mirror in a *different* subsystem; `premium_features.py:584` writes only to `live_photos`, same pattern). The "duplication" is **structural** (two tables serving one product concept), not **per-row** (no photo gets double-counted as data) — though `live_wall_feed.py`'s own `_count_both()` comment explicitly anticipates a photo *could* someday be mirrored into both, implying the authors considered but never observed or built that cross-write.

**Face-indexing scope — confirmed and product-relevant**: Rekognition indexing (`index_photo_job`, `worker.py`, `face_ops.py`) touches **`gallery_photos` exclusively**. No Rekognition/`face_queue` import exists anywhere in `live_gallery_features.py`, and the live-gallery block of `premium_features.py` has no face-related calls either. **A guest who uploads a photo of themselves to the live QR wall will never have that photo surfaced by another guest's face-search** — face-search only ever searches the photographer's own studio-gallery uploads. This is a product-relevant functional gap flowing directly from the table split, distinct from and more concrete than the baseline's framing as a pure "duplication risk."

**`profile_media` vs `wedding_album_media`**: two more, independently-built, near-identical "photos attached to the invitation" systems — separate cap limits (20 vs 50), separate disk paths, separate CRUD, no cross-reference found between them. A fourth/fifth instance of the exact same duplication pattern.

---

## 10. Payment / Commerce Forensics

**There isn't one payment system — there are four**, each with its own order table and its own independently-implemented Razorpay HMAC signature verification:

| Surface | Order/entity table | Verify endpoint |
|---|---|---|
| Store (à-la-carte design purchase) | `invitation_orders` | `POST /api/store/order/verify` (`store_features.py:804-841`) |
| Subscription (recurring plans) | `subscriptions` + `orders` + `payments` | `POST /api/subscriptions/verify` (`subscription_service.py:773-838`) |
| Legacy plan-activation (pre-store) | `payments` (different shape, `payment_id`-keyed) | `POST /payments/verify` (`server.py:12320-12482`) |
| Event Engine (new, unified attempt) | `event_orders` | `event_payments.py` |

`event_payments.py` was built specifically to unify this — its own docstring says it exists because the other ad-hoc verifiers couldn't distinguish "forged signature" from "SDK/network failure." **But `store_features.py` and `subscription_service.py` were never migrated onto it** — they each still carry their own local HMAC reimplementation. `server.py` has a **third**, independent copy of the identical HMAC construction. INFERENCE: incremental feature layering, not deliberate design.

**No single table is authoritative for "did this payment succeed" across all four surfaces** — each surface answers this differently (`invitation_orders.status=="paid"`, `subscriptions.status=="active"` AND a `payments.status=="captured"` row, `payments.payment_status=="success"`, `event_orders.status=="paid"`). Worse: **`subscription_service.py`'s `payments` collection and `server.py`'s legacy `payments` collection are two different document shapes sharing one collection name** (`status` vs `payment_status`, `subscription_id`-keyed vs `payment_id`-keyed). A caller reading `db.payments` without knowing which surface wrote the row will misparse it. **FACT, flagged as a real correctness hazard, not just messiness.**

**Entitlement model — two genuinely different architectures for two different products**: subscriptions read entitlement LIVE off the `subscriptions` row at request time ("any active sub with a future end covers the studio," `subscription_service.py:163-193`); the store flow instead **copies** entitlement fields onto the invitation/profile document at delivery time (`apply_order_entitlements`, `store_features.py:1161-1174`) — the order itself is not re-read live for entitlement checks after delivery. No single pattern governs entitlement across the app.

**Idempotency — mostly real, one confirmed gap with concrete failure mode**:
- Store order verify: real CAS (`status: {"$ne":"paid"}`), reused correctly by the webhook fallback. **Solid.**
- Razorpay webhook signature verification: real, constant-time compare, degrades to accept-but-never-act (logged) if the webhook secret is unset.
- Webhook replay protection: real, dedupe key `f"{event_type}:{payment_id or order_id}"` checked against `db.razorpay_events` — but **this check-then-insert has no backing unique index**, so two concurrent webhook deliveries can both pass the dedupe check before either inserts (TOCTOU). Low severity — doesn't cause double-crediting since the actual entitlement mutation is separately CAS-protected — but the dedup ledger itself is not race-safe.
- **Subscription verify — CONFIRMED double-insert bug pattern**: the CAS guard on `subscriptions.status` (`{"id":..., "status":{"$ne":"active"}}`) is correctly used for that ONE write, but the code never inspects the CAS's own result (`matched_count`) before proceeding into three further UNGUARDED writes: `orders.update_one` (unconditional), `payments.insert_one` (unconditional), `audit_logs.insert_one` (unconditional). **Two racing `/subscriptions/verify` calls: only one wins the status CAS, but BOTH fall through into the payments-ledger insert — a genuine, concrete duplicate-row risk in the billing ledger**, not theoretical. This is the sharpest single finding in this section. Contrast: `store_features.py`'s equivalent handler treats its CAS result as load-bearing (re-reads the row rather than assuming success) — the pattern that avoids this bug already exists one file away.
- No idempotency key on order/subscription *creation* itself — a client double-click before the first Razorpay order returns creates two separate `invitation_orders` rows with two separate Razorpay orders. No sweeper found for abandoned `status="created"` orders.

**Refunds — no real refund code exists anywhere.** Confirmed by grep: the only Razorpay-payment-object method called is `.fetch`, never `.refund`. `disputes.py`'s `"refunded"` status value is a **manual admin label only** — PATCHing a dispute to `"refunded"` writes a string into the `disputes` collection and never calls any Razorpay API or touches any order/payment/subscription status. `monetization_features.py`'s own docstring explicitly documents this as intentional: refunds are Razorpay-dashboard-only, out-of-band, by design — not a gap someone forgot, but the `disputes.py` status label could mislead a future maintainer into thinking the system tracks/enacts refunds when it only labels them.

---

## 11. State Machine Forensics

| Entity | State Field | Notable Values | Set By | Trigger |
|---|---|---|---|---|
| Store order | `invitation_orders.status` | `created → paid` | `store_features.py` | checkout / webhook |
| Store order | `invitation_orders.build_status` | `awaiting_payment → pending_info → building → delivered` | `store_features.py` | payment verify → buyer fills info → admin delivers |
| Store order (test bypass) | both fields | jump straight to `paid`+`pending_info` | `store_features.py:713-736` | test-buyer flag — **skips the intermediate states entirely**, a real, deliberate, documented shortcut that never exists in prod |
| Subscription | `subscriptions.status` | `pending → active → (expired\|cancelled\|past_due)` | `subscription_service.py` | create/verify/daily-sweep/cancel |
| Subscription | `subscriptions.status = "past_due"` | **DEAD STATE** | never set anywhere | Documented in a code comment as a valid transition target; grepped the entire module, no function ever writes this value. No dunning/auto-charge-failure path exists to reach it (`auto_renew` is hardcoded `False`) |
| RSVP | `rsvps.status` | **THREE incompatible vocabularies read across three different endpoints in the same file** | — | see below |

**Confirmed, concrete finding — RSVP status vocabulary mismatch**: `server.py:6099-6103` reads `"yes"/"no"/"maybe"`; `server.py:9180-9182` reads `"confirmed"/"declined"/"pending"`; `server.py:10532-10534` reads `"accepted"/"declined"/"pending"` — **three different aggregation/dashboard endpoints filtering the SAME `rsvps.status` field against three incompatible spellings.** INFERENCE, high-confidence: at most one of these vocabularies matches what the actual RSVP-submission endpoint writes; the other one or two are very likely silently counting zero matches (a dashboard showing 0 confirmed RSVPs while the data is actually populated under a different spelling). Where the field is actually WRITTEN at submission time was not traced this pass — flagged as the next thing to check to resolve which vocabulary is "real." This is a materially more concrete finding than a generic "worth auditing" note — it's a live 3-way spelling collision, not a hypothetical.

**Other flagged issues**: two `payments` collections with incompatible shapes sharing one name (see §10) is as much a state-machine hazard as a payment one — a future "list all payments" view built against `db.payments` needs to already know which shape it's reading.

---

## 12. Tenancy / Ownership Forensics

Proven from code, not assumed:

| Resource | Owner field | Class | Evidence |
|---|---|---|---|
| Legacy profile/invitation | `admin_id` | EXPLICIT | Checked in every sibling `_get_profile_owned`/`_require_owned_profile` helper. Legacy rows with no `admin_id` bypass the check (logged, not rejected). |
| Event (Event Engine) | `owner_id` | EXPLICIT, but **two competing implementations** | `event_lifecycle_service.py`'s own CRUD routes (create/publish/archive/delete) use a *simple* owner-only check; sibling feature modules (`event_media_service.py`, `event_children_service.py`, `event_finance_service.py`, `event_members_service.py`, etc.) use a *rich* RBAC gate (`event_rbac.py`) with a full permission matrix. **Same resource type, two different authorization mechanisms depending on which router you hit.** |
| Guest record | `profile_id` (no direct owner field) | IMPLICIT | Ownership derived only by first resolving `profiles.admin_id` |
| RSVP | `profile_id` (create/list) / **NONE** (update) | IMPLICIT / **MISSING** | `PUT /rsvp/{rsvp_id}` has no auth dependency at all — a client-supplied phone-number match on the row itself is the only "ownership," not a photographer/owner concept |
| Studio gallery photo | `profile_id` (no direct owner field on photo doc) | IMPLICIT | Resolved via `_require_owned_profile` before every photo op |
| Live gallery photo | `wedding_id`/`admin_id` OR `user_id` depending on caller persona | IMPLICIT, **INCONSISTENT owner-field family** | Two different ownership-resolution code paths for the same photo type, keyed to different fields depending on which persona's router is hit |
| Order (`invitation_orders`) | `user_id` (but this IS the photographer's `admin_id`, routed through the hybrid buyer dependency) | EXPLICIT | Naming trap flagged for future tenant_id design — field is `admin_id`-shaped but literally named `user_id` |
| Payment | inherited from parent order/subscription | IMPLICIT | No independent ownership field on payment records |
| Subscription, Portfolio | `studio_id` = `admin["admin_id"]` | EXPLICIT | Query-scoped by construction |
| Client/Couple-Access credential | `profile_id` | IMPLICIT (issuance side), then EXPLICIT via the JWT itself once issued | — |
| Storage account (pooled) | **none — by design** | MISSING (correctly, not a bug) | Platform-level shared resource, gated by `require_super_admin` only |
| Pixora content (~55 tables) | `studio_id` | EXPLICIT, but **inconsistent enforcement idiom** | Most deletes scope-by-construction (silent no-op on mismatch, no 403 signal); a minority (`pixora_workspaces`, `pixora_tasks`) fetch-then-check (can distinguish 404 vs 403) |

**Cross-cutting structural finding**: two fundamentally different "ownership check" idioms coexist across the whole app, both individually safe:
1. **Fetch-then-compare** (profile/gallery/guest/client-access routers) — returns 403 on mismatch.
2. **Scope-by-construction** (portfolio/subscription/pixora/store-order routers) — filters the query itself, mismatch silently affects 0 rows (404-shaped, never 403).

Neither is wrong in isolation, but a caller can't infer from resource type alone which failure mode to expect — and this matters concretely for any future tenant_id/Row-Level-Security migration, since RLS naturally produces the "scope-by-construction" shape everywhere, which would silently change observable behavior for every route currently in bucket 1.

---

## 13. Authorization Forensics

Full role × resource matrix constructed (profile/event/guest/RSVP/gallery/photo/order/payment/subscription/portfolio/client-access/storage/pixora — condensed here to the flagged findings; the complete matrix is in the source agent transcript). Key results:

**New differing-sibling-route findings** (beyond the one already known from baseline §16):

1. **`store_features.py:1087-1093` (`require_super_admin`) vs. `store_features.py:1125-1151` (`require_admin`)** — same internal fulfillment-ops surface (`get_fulfil_settings`/`set_fulfil_settings` vs. `build_queue`/`mark_edit_applied`/`deliver`), one tier requires super-admin, its sibling tier accepts ANY authenticated photographer. **Concrete exploit**: any logged-in photographer can view the entire cross-tenant build queue and mark OTHER studios' orders as delivered.
2. **`live_gallery_features.py:449-467` (`admin_id`-keyed ownership helper) vs. `live_gallery_features.py:504-576` (`user_id`-keyed ownership helper)** — same live-gallery-photo resource, two independent owner-field families depending on caller persona; not individually exploitable (each correctly checks its own persona's field) but exactly the kind of drift that produces a bug when one path is patched and the other isn't.
3. **Pixora content deletes**: scope-by-construction (silent no-op) vs. fetch-then-check (`_require_ws`) for the same content family — a consistency debt, not a security bug.

**STAFF role — a genuine, distinct, but functionally isolated permission primitive.** `studio_staff.py` defines a real 4-rank role system (`owner/manager/editor/viewer`) with an explicit permission matrix (`edit_portfolio`, `manage_bookings`, `manage_finance`, `manage_billing`). **But `resolve_access`/`require_role`/`has_permission` are called nowhere outside `studio_staff.py` itself** (grep-confirmed). Every OTHER resource router (portfolio, bookings, guests, galleries, finances) authorizes purely on `admin_id == caller's own admin_id` from the JWT — it never consults the staff permission matrix. **Consequence**: an invited "manager" or "editor" can only operate `studio_staff.py`'s own 5 endpoints (list/invite/update-role/revoke/accept/transfer); they cannot actually manage the owner's portfolio, bookings, guests, or finances through any other router, because those routers key everything to the CALLER's own `admin_id`, and a staff member's `admin_id` is a different account than the owner's. **The permission matrix is aspirational/dead for every capability except `manage_staff`/`transfer_ownership`.** This is the opposite failure mode from the known gallery_privacy.py IDOR — a permission layer that under-grants relative to its own documented design, not one that over-grants. Whether the frontend still offers staff-role actions that would 404/403 against these unenforced permissions is UNKNOWN this pass.

**Ownership-check re-audit of 4 additional routers** (as specifically requested, to check for more instances of the known `gallery_privacy.py`-class bug): `studio_staff.py`, `studio_storage.py`, `photographer_clients.py`, `fulfillment_service.py` — **all four correctly scope by owner. No new instance of that bug class found.** `fulfillment_service.py`'s lack of per-studio scoping is correct-by-design (it's the super-admin's own cross-studio ops console).

---

## 14. ID Strategy Forensics

| Entity | ID field | Generation | Format | Notes |
|---|---|---|---|---|
| Profile (legacy) | `profiles.id` | `uuid.uuid4().hex` | 32-char hex | Immutable by convention |
| Event (Event Engine) | `events.event_id` **and** `events.id` (mirrored) | `_uid("evt")` → `f"{p}_{uuid.uuid4().hex[:14]}"` | `evt_` + 14 hex | **Two ID field names for the same primary key, by explicit design** (`id` mirrors `event_id`, per an in-code comment "id mirror for adapter/id lookups") — unlike `profiles`, which only has one |
| Guest | `guests.id` | UNKNOWN exact format (Pydantic default factory not opened this pass) | UNKNOWN | — |
| Photo | `gallery_photos.id` | `.hex` pattern (consistent with siblings) | 32-char hex | `ExternalImageId` at Rekognition index time is set to this `photo_id` directly — no join table needed to resolve matches |
| Order (local) | `orders.id` | **TWO different formats coexist**: bare `uuid4().hex` (`store_features.py`) AND a prefixed short form `f"ord_{uuid4().hex[:16]}"` (`subscription_service.py`) | mixed | Different local ID conventions depending on which subsystem wrote the row |
| Order (external) | `razorpay_order_id`/`razorpay_payment_id` | Razorpay-issued | `order_`/`pay_` prefixed | Looked up by exact match in webhook/verify flows — i.e. a local table's row is found via the EXTERNAL gateway ID, not the local `id`, at that specific lookup site |
| Session (face-search) | `face_search_sessions.id` | `str(uuid.uuid4())` — **dashed**, unlike the `.hex` convention used almost everywhere else | 36-char dashed UUID | Minor, real format inconsistency |

**One-id-two-concepts check**: `profile_id` is used consistently for the legacy wedding/profile entity only — **no case found** of `profile_id` being reused to mean an Event-Engine event (confirming §8's "genuinely separate, not accidentally merged" conclusion at the ID level too). The one genuine same-field/two-meanings case is `owner_id` (admin vs. user), and it IS explicitly tagged with a companion `owner_kind` field — a good pattern, not a hazard.

---

## 15. Data Consistency Forensics

| Concept | Representation A | Representation B | Drift Status |
|---|---|---|---|
| Timestamp | Schema column `created_at` (Postgres `DEFAULT now()`, always correct) | App-set `data.created_at` JSONB key | **CONFIRMED structural risk.** 164 literal app-set write sites found vs. 133 `.sort("created_at",...)` call sites. Since no generated column promotes `created_at`, every one of those 133 sorts orders on the JSONB string value, never the column — meaning the reliably-correct column value is never consulted by the query layer. If any write path ever skips setting the key, that row silently sorts wrong/last. Not caught in the act this pass, but the structural exposure is real and confirmed by code shape. |
| Entity id | `profile_id` (legacy) | `event_id` (Event Engine) | **REFUTED as interchangeable** — genuinely two distinct entity families with no cross-use found (consistent with §8/§14). Risk is architectural duplication, not field-naming drift. |
| Lifecycle field | `status` | `state` | **REFUTED as a naming duplicate** — every `"state"` occurrence found this pass is a geographic address field (Indian state name), not a workflow field. No sibling-table naming collision exists here. |
| Referent | `admin_id` | `studio_id` | **CONFIRMED drift, actively compensated for in code.** `studio_id` is not a distinct entity — it's `admin_id` under a product-facing rename used pervasively in Pixora/subscription/portfolio/storage modules while other modules (`profiles.admin_id`, gallery ownership checks) keep the original name. `storage_analytics.py:53` and `studio_insights.py:124,133` are direct evidence the drift already caused real confusion — both read `f.get("studio_id") or f.get("admin_id")` because the authors could no longer be sure which name a given row used. |
| Collection identifier | `collection_id` (Pixora "saved posts" folder) | `aws_collection_id` (Rekognition face collection) | **REFUTED as the same concept** — two unrelated things that happen to share the word "collection." False cognate, not drift, but worth flagging for anyone grepping the term expecting one meaning. |

---

## 16. Legacy / Dead-Code Forensics

**Important meta-note surfaced by this pass**: the CLAUDE.md content that was loaded into this session's context differs from the CLAUDE.md actually on disk in this repo — the on-disk version explicitly disclaims some of the companion docs (`START_HERE.md`, `PIXORA_*`, `UI_DESIGN_SYSTEM.md`) as living only in the old `wedding-36` repo, and describes credits as fully **deleted** (there is no `credit_service.py` or `credits_retired_error()` anywhere in this repo — that premise, carried over from the baseline audit, was incorrect). Treat any prior session's cached understanding of CLAUDE.md's content as potentially stale relative to the file actually on disk.

**Resolved deadness verdicts:**

1. **`db.users`**: **LEGACY BUT REFERENCED, not fully dead.** Write path genuinely dead — `/api/users/register` and `/login` both `raise HTTPException(410, ...)` before touching the DB, confirmed killed in commit `5acb5bf`. The live signup form posts to `/api/auth/register`, which writes `admins`, not `users`. But READ/update paths are still mounted and reachable (`account_data.py`, `user_features.py`, password-reset routes), touching only pre-existing rows since no new session can ever be minted. Admin/investigation tooling still reads it, super-admin-gated.

2. **Legacy credit tables — NOT 100% inert, contrary to the baseline's characterization.** The baseline's premise of a `credit_service.py`/`credits_retired_error()` shared guard does not exist in this repo at all (zero grep hits). Retirement was done ad hoc, per-module, which is exactly why several credit tables are still live:
   - `credit_ledger` — **ACTIVE reads**: `super_admin_v2.py` (revenue analytics, super-admin gated) and `super_admin_pricing.py:741` (photographer tier-history, reachable by ANY photographer).
   - `user_credit_ledger` — ACTIVE read, super-admin gated.
   - `credit_purchases` — ACTIVE reads (DPDP export, admin investigation, BI).
   - **`credit_plans` — the worst finding here: `restructured_admin_service.py:120-189` still exposes LIVE WRITE endpoints (insert_one/update_one) against this table, mounted, gated only by `require_super_admin`, with zero frontend caller.** A super-admin token can still mutate credit pricing data today, despite the product-level retirement.
   - `credit_packages` — genuinely dead (orphaned seed script, never invoked).
   - `credit_wallets` — **does not exist in code at all**; the baseline's name doesn't match anything real.

3. **"~30 legacy screens" — the baseline's own premise doesn't hold up.** `SESSION_CONTEXT.md`'s figure is actually a count of leftover *API call references*, not a named list of 30 screens — only 5 items were ever individually named, 3 already confirmed absent by a prior pass. Of the 2 remaining nameable items: CloudBackup history view → **PRESENT+ROUTED** (`frontend-v2/src/pages/StudioBackup.jsx`, live at `/studio/backup`); the analytics/`plan-purchase-details` routes → present but low-confidence (SESSION_CONTEXT itself flags one as having "no obvious consumer"). **There is no larger hidden list of ~27 more items to verify — it doesn't exist as stated in the baseline/task framing.**

4. **`microservices/` — confirmed genuinely mounted** (`deploy/docker-compose.yml:34`, into Postgres's `docker-entrypoint-initdb.d`) but **only executes on a fresh Postgres volume** per Postgres's own init-script semantics. `pg_adapter.py`'s `ensure_table()` transparently creates the same tables generically whenever schema.sql hasn't already run, so on any reused volume (all local dev via `run.ps1`) schema.sql's promoted columns/constraints never apply. **Verdict: legitimately live on fresh production deploys, silently bypassed everywhere else** — this directly explains §4's finding that mechanism C's ~30 indexes/constraints can't be assumed live.

5. **Additional dead code found opportunistically**: `backend/init_admin.py`, `init_default_design_prices.py`, `seed_test_invitation.py` — zero importers anywhere (backend, docs, CI, deploy scripts); only cross-referenced by name in comments of other orphaned scripts. Genuinely unreachable except by manual human invocation. `init_super_admin.py` is NOT dead — it's the documented one-time bootstrap step. `docs/DEPLOYMENT.md` still warns against using `microservices/docker-compose*.yml` files that no longer exist anywhere in the repo — a dead warning about already-deleted files.

---

## 17. Documentation Contradiction Forensics

Fewer clean NEW contradictions surfaced than expected — the on-disk docs are largely internally consistent with each other. The one dangerous gap found was between a prior session's *cached/loaded* understanding of CLAUDE.md and the real, on-disk file (§16) — not between the real docs and the real code.

| Document | Claim | Actual Code | Correct Current State |
|---|---|---|---|
| CLAUDE.md (on-disk) test-count claim vs. SESSION_CONTEXT.md | The two canonical docs state different pytest pass counts on the same date (one says 226 passed/2 skipped, the other 295/2) | Not independently re-run this pass | The two docs disagree with each other by 69 tests on the same date — one is stale relative to the other; which is current was not re-verified |
| `docs/DEPLOYMENT.md` | Warns against using root/microservices `docker-compose*.yml` files | Those specific files no longer exist anywhere in the repo | Dead warning about already-deleted files |
| Baseline audit's own premise | Implies a shared `credit_service.py`/`credits_retired_error()` retirement guard exists | Zero grep hits for either name anywhere in the repo | No such helper exists; retirement was done ad hoc per-module — directly explains why several credit tables are still live (§16) |

---

## 18. External Service Contract Map

Condensed (full per-service blocks are in the source agent transcript):

- **AWS S3** — purpose: all media storage (single bucket, `ap-south-1`). Retry: boto3 `Config(retries={"max_attempts":3,"mode":"adaptive"})`, library-level only. Timeout: **none explicit** — boto3 defaults apply unbounded. Failure: mostly log-and-continue; a failed delete leaves a silent orphan object.
- **AWS Rekognition** — same client config as S3 (shared `Config`). Two layers of retry: boto3's + `worker.py`'s own job-level retry (5 attempts, exponential backoff to 60s) → DLQ.
- **AWS CloudFront** — no live API calls at all; "calling" it just means constructing a signed URL locally via RSA-SHA1. Confirmed graceful, working fallback to S3 presigned URLs when key file is missing.
- **Redis** — purpose: rate limiting, OTP/kv, face-job queue, leader locks for every scheduled job, view-count buffering. **Universal fail-open pattern**: every helper substitutes an in-process equivalent on any Redis exception rather than retrying. Timeout: `socket_connect_timeout=2s` only, no read/operation timeout.
- **Razorpay** — no explicit timeout, no retry, at any of the (at least 3, possibly 4) independent integration points found across the codebase (§10). `event_payments.py`'s newer integration distinguishes gateway failure from signature failure; the older `studio_storage.py`/`premium_features.py` `razorpay.Client` usages were located but not independently traced for the same anti-pattern this pass — flagged as a follow-up.
- **Google Gemini** — single documented SDK touch point (`ai_service.py`), no explicit timeout (thread-offloaded so it can't block the event loop, but the thread itself has no deadline), no retry. Fallback-on-failure is delegated to each caller, not centralized — not verified whether every caller actually implements one.
- **Google Drive** — two distinct integrations: (1) `drive_archive.py`, per-studio opt-in backup, flag-gated `DRIVE_ARCHIVE_ENABLED` (off by default); (2) the platform-owned multi-drive storage pool (`storage_pool_*.py`), not independently re-traced this pass. `drive_archive.py`'s queue is a **non-durable in-process `asyncio.Queue`**, not Redis — a process restart silently drops any archive jobs that were enqueued but not yet processed.
- **GCP Compute Engine VM** — confirmed, again, to be purely a compute substrate with zero code-level integration — no `gcloud`/GCP infra SDK calls anywhere in `backend/*.py`.

---

## 19. Failure / Recovery Forensics

**Cross-cutting finding: no explicit timeouts anywhere.** S3/Rekognition rely on boto3 defaults, Postgres's `asyncpg` pool has no `command_timeout` set at all, Redis has connect-only timeout (2s, no operation timeout), Razorpay/Gemini/most Google Drive calls run unbounded on library defaults. Recovery from a genuine hang (as opposed to a clean error response) is not engineered for any of these services.

**No cross-write atomicity in multi-step cleanup**: `cleanup_expired_galleries` deletes from 2 collections and updates a 3rd with independent per-record try/except blocks — a crash mid-loop leaves partial state with no automated reconciliation for that specific pattern (contrast with the S3/Rekognition drift path, which IS covered by `media_reconcile.py`'s heuristic sampler).

**Redis leader-lock fail-open risk (new, not surfaced by the baseline)**: all 5 interval/cron-style scheduled jobs (gallery cleanup, usage-flush, storage-pool jobs, expiry-sweep) use a Redis-backed leader-election lock so only one of the 4 uvicorn workers runs each job. If Redis is reachable at boot but drops mid-run, the lock's fail-open behavior means **every worker becomes "leader" simultaneously**, running each scheduled job N times concurrently instead of once — a genuine correctness gap under partial Redis outage, not just degraded performance.

**`drive_archive._archive_worker`'s in-process queue has no persistence** — unlike every other queue in the system (which use Redis), this one is an `asyncio.Queue` local to the process. A restart silently drops anything enqueued but not yet processed, with no re-enqueue-on-boot and no DLQ. Also off by default via feature flag.

---

## 20. Background Job Forensics

**Baseline's central open UNKNOWN is resolved**: `cleanup_expired_selfies`/`cleanup_expired_galleries` ARE genuinely scheduled. **FACT**: an `AsyncIOScheduler` (APScheduler) is constructed and registered at server startup, using `CronTrigger`/`IntervalTrigger` jobs, gated by a Redis leader lock with heartbeat renewal. This is a real scheduler registration, not opportunistic per-request triggering.

Full inventory of every background/async job found:

| Job | Trigger | Scheduled? |
|---|---|---|
| `cleanup_expired_selfies` | APScheduler `CronTrigger`, hourly (`:15` past the hour, IST) | **YES** |
| `cleanup_expired_galleries` | APScheduler `CronTrigger`, daily 03:00 IST | **YES** |
| `_daily_trash_purge` | APScheduler `CronTrigger`, daily 04:00 IST | **YES** — see §23 for why this matters (orphan-record risk) |
| `_daily_storage_lifecycle` | APScheduler `CronTrigger`, daily 05:00 IST | **YES** |
| `_nightly_media_reconcile` | APScheduler `CronTrigger`, daily 03:30 IST | **YES** |
| `_flush_view_counts` | APScheduler `IntervalTrigger`, every 30s | **YES** |
| Face index/search jobs | HTTP-request-triggered, inline fallback if no Redis | **NOT periodic** — opportunistic, per-upload/per-search |
| `usage_flush_loop` | `asyncio.create_task`, `while True: sleep(300)`, leader-locked | **YES** (interval loop, not cron, but genuinely periodic) |
| `storage_pool_jobs._job_loop` | `asyncio.create_task`, `while True: sleep(300)` with internal per-sub-job due-check gating (10min/hourly/daily/weekly) | **YES** |
| `drive_archive._archive_worker` | `asyncio.create_task`, idles on an in-process `asyncio.Queue.get()` | **NOT a scheduler** — queue-consumer only, fed opportunistically; also off by default |
| `_expiry_sweep_loop` (invitation link expiry) | `asyncio.create_task`, hourly interval, leader-locked | **YES** |
| `_storage_maintenance` | Direct call inside `@app.on_event("startup")` | **NOT SCHEDULED — runs exactly once, at process boot, never again.** Sits among genuinely-scheduled jobs in the same code region; a maintainer skimming that block could easily assume it's periodic. Explicit negative finding, verified by reading all 24 startup handlers. |
| `storage_pool_hooks.on_event_*`/`provision_*` | Inline, fired from specific CRUD endpoints | **NOT a scheduler** — synchronous best-effort hooks, fire-and-forget |

No `celery`, no `apscheduler.schedulers.background.BackgroundScheduler` (the sync variant), no second scheduler instance found anywhere else.

---

## 21. Observability Forensics

| Capability | Status | Evidence |
|---|---|---|
| Structured/central logging | **ABSENT** | Only `logging.basicConfig(...)` — stdlib text logs, per-module `getLogger`. No JSON formatter, no shipper config. |
| Request-ID propagation | **IMPLEMENTED, but response-only, not a real trace** | Generated per-request, stamped on the response `X-Request-Id` header. Never read from an incoming header, never attached to the stdlib logging record (no contextvar/LoggerAdapter), never passed into `audit_logs` writes. You cannot grep one id across a log line AND a DB row for the same request. |
| Metrics collection | **IMPLEMENTED, but in-process and unaggregated** | Real latency-bucket histogram + 5xx counter, but lives in a module-level Python dict — per-worker, in-memory, lost on restart, NOT aggregated across the 4 uvicorn workers or the separate `worker.py` process. Exposed only via a pull-only admin endpoint someone has to poll. No Prometheus/StatsD/OTel exporter anywhere. |
| Health/readiness | **IMPLEMENTED** | `/api/health` does a real DB check (`count_documents`), returns 503 on failure. Plus AWS-specific and broader system-health admin endpoints. No liveness/readiness split (fine for single-VM, would matter for k8s-style rolling deploys). |
| Sentry | **IMPLEMENTED — overturns the baseline's characterization.** | Real `sentry_sdk.init(...)` call, conditionally guarded (`if _sentry_dsn:`), wrapped in try/except so a broken SDK never blocks boot. The baseline's framing of this as "commonly unset, implying a gap" undersold it — the wiring is real code, the only actual open question is whether `SENTRY_DSN` is set in the live production `.env`, which is out of scope for a repo-only read. |
| Audit-log coverage | **Real but lopsided across 4 differently-named tables** | `audit_logs` (~48 write sites) is genuinely comprehensive for auth/security/admin actions. `admin_action_log` (despite its generic name) has exactly ONE call site in the whole backend. `event_audit_logs` and `pricing_audit_log` are each scoped to their own narrow subsystem. An investigator has to already know which of the 4 tables a given action family lands in — no unifying query surface. |

---

## 22. Backup / Restore Forensics

- **What's backed up**: **Postgres only.** No script anywhere syncs S3, exports Redis, or exports Rekognition collections.
- **The single biggest new risk surfaced by this pass**: **S3 media has zero backup coverage anywhere in this codebase.** No `aws s3 sync`, no versioning/replication config, no cross-region copy job found repo-wide. Losing the single S3 bucket means **permanent, unrecoverable loss** of every portfolio image, invitation asset, event photo, and guest selfie — there is no second copy anywhere in this codebase's backup story. This is worse than the baseline's "Postgres-only" framing suggested, since the Postgres story turns out to be real and working (see below) — the media story has nothing at all.
- **Frequency/trigger**: **manual, not automated in this repo.** Both backup scripts contain only a *comment* showing an example crontab line — there is no crontab file, no systemd timer, and the deploy compose file has no scheduled backup service among its 5 containers. Nothing in version control proves the cron line was ever actually installed on the production VM.
- **Encryption**: two backup scripts exist with **materially different security postures**. `deploy/backup.sh` (the newer, hardened one): real AES-256-CBC, PBKDF2-stretched passphrase, refuses to run without the passphrase set. `ops/backup_db.sh` (the older one, referenced by the older runbook's cron example): **no local encryption at all** — plain gzip, relies solely on optional S3 server-side encryption that's off unless separately configured.
- **Retention**: local-only pruning (`find ... -mtime +N -delete`); no equivalent prune step for the S3-side copies in either script — S3 backup objects accumulate forever unless an out-of-repo bucket lifecycle rule exists (unverifiable from code).
- **`restore-test.sh` — a genuine DR test, not a stub.** Pulls the newest backup from S3, decrypts it, spins up a **disposable scratch Postgres container** (never touches the live database), restores into it, runs real `SELECT count(*)` sanity checks on 3 named tables (deliberately including one pg_adapter-auto-created table not in schema.sql, specifically to prove auto-created tables survive restore), fails loudly on any mismatch, tears the scratch container down. Its only gap: like the backup script itself, it's cron-commented, not actually scheduled — "genuinely tested" is conditional on someone having run it, which the repo can't prove happened.

**Bottom line**: Postgres has a real, working, quarterly-testable encrypted-backup story *if* someone installed the cron line by hand — nothing in the repo confirms they did. S3 media has no backup story at all. This asymmetry is worth the owner's direct attention.

---

## 23. Security Forensics (new findings only — baseline's 5 findings not repeated)

**Ownership-check re-audit of 4 additional routers** (as requested, to check for more instances of the known IDOR class): `studio_staff.py`, `studio_storage.py`, `photographer_clients.py`, `fulfillment_service.py` — **all four correctly scoped, no new instance found.**

**New findings:**

1. **No DB-level uniqueness stops two simultaneously-active subscriptions for one studio+product.** Across the ENTIRE backend, `create_index(..., unique=True)` is called at exactly **two** total call sites (`payment_records.razorpay_payment_id` and `gift_code_redemptions.(code,admin_id)`). `subscriptions` has no such constraint. `verify_subscription`'s CAS only guards the *specific subscription document being verified* — it never checks whether another `subscriptions` row already exists active for the same studio+product before activating this one. **Concrete failure scenario**: a studio double-submits `/subscriptions/create` for the same product (two `pending` rows, two different ids — e.g. a slow-response retry), both get independently verified, and nothing stops both CAS updates from succeeding since they target different row ids — result: **two concurrently-active subscription rows for one studio+product**, each with its own billing period and its own `orders`/`payments` rows. This is a real double-billing/entitlement-bookkeeping bug, not theoretical — the code elsewhere assumes at-most-one-active-per-studio-per-product but never enforces it.

2. **Orphan records — the daily trash-purge hard-delete does not cascade, confirmed concretely.** The scheduled sweep that empties the profile trash (`_daily_trash_purge`, §20) runs a genuine hard `delete_many` on `profiles` after 5 days in the trash — distinct from the soft-delete that merely sets `is_active=False`. Its only other cleanup is S3-prefix deletion and a storage-pool purge hook — both media-layer. **It does NOT touch `gallery_photos`, `rsvps`, `guests`, `face_search_sessions`, `face_consent`, `face_dead_letters`, `event_client_accounts`, `invitation_orders`, `subscriptions`, `analytics`, or any of the ~10 other tables carrying a soft `profile_id` reference.** Since there are zero FK constraints anywhere (confirmed by baseline §6 and re-confirmed here), every one of those child rows becomes a permanent orphan after the 5-day purge. Concretely: `gallery_photos.profile_id` rows for a purged event still reference Rekognition FaceIds and S3 keys that the purge DID clean up server-side — any code path that re-reads such an orphaned row (a stale cache, a report/export job) will 404 against S3/Rekognition with no clear signal why. Also a slow, silent DB-bloat source with nothing to prune it afterward.

3. **Minor TOCTOU in the Razorpay webhook dedup path** — see §10's idempotency discussion; low severity since the actual entitlement mutation is separately CAS-protected, but the dedup ledger itself is not race-safe.

4. **Unsafe state transitions — checked specifically, none found.** `event_lifecycle_service.py`'s `publish`/`archive`/`restore` all gate on the current status via `can_transition()` or explicit equality checks before mutating, with no bypass path found. Naming this explicitly since it was directly asked for — a clean result, not a gap.

---

## 24. Scale-Relevant Data

| Entity | Write pattern | Per-entity cap in code | Estimate | Why |
|---|---|---|---|---|
| Events/profiles | One row per creation call, behind a paid purchase flow | None found | LOW–MEDIUM | Naturally rate-limited by the business economics of purchase, not a guest-driven fan-out entity |
| Guests | One row per import line/manual add | **No per-event ceiling on total guest count found anywhere** (only a per-guest sub-feature cap on song requests) | MEDIUM | Bounded in practice by wedding-list realism, but nothing in code stops an arbitrarily large CSV import |
| RSVPs | One row per submit, 5/IP/day rate limit | No per-event cap | MEDIUM | IP throttling slows abuse but doesn't bound legitimate large-guest-list growth, and this is the same table exposed by the unauthenticated enumeration endpoint (baseline §16) — growth increases that exposure surface |
| Photos (`gallery_photos`) | One row per finalized upload; direct-to-S3 presign removes the app server as an ingest bottleneck | No write-side per-event photo cap found | HIGH | Bounded only by the SINGLE-WORKER Redis face-indexing queue, not by any row-count guard — a simultaneous wedding-day burst across many studios serializes through one consumer process |
| Face search sessions | One row per selfie search | No cap on session count per event; 24h selfie S3-object TTL exists (now confirmed scheduled, §20) but the DB ROW itself has no observed cleanup | MEDIUM–HIGH | Volume scales with guests × searches-per-guest; even with S3 bytes purged, `face_search_sessions` rows accumulate unbounded |
| Audit logs (`audit_logs` + 3 siblings) | ~48 distinct write sites, one row per matching action, zero batching | No TTL (`expireAfterSeconds` is a confirmed no-op, baseline §6/§17) | HIGH | The most CERTAIN unbounded-growth table in the schema — confirmed structurally, not inferred, since every one of ~48 action types writes with no expiry mechanism that actually deletes rows |
| Pixora content (~55 tables) | One row per post/comment/like/etc. | Not individually audited this pass | HIGH | INFERENCE only — largest single table-count block by a wide margin; community/social content is inherently high-cardinality |
| Orders | One row per create call, **no idempotency key** | None | LOW–MEDIUM | Bounded by real purchase intent, but the missing idempotency key means double-submits inflate this table faster than genuine purchase volume alone would predict |
| Payments (`payment_records`) | One row per capture | Protected — one of only TWO unique-constrained fields in the entire database | LOW | The one table in this list with a real DB-level growth/correctness backstop — the exception, not the rule |

---

## 25. Final Gap Matrix

### WHAT WE NOW KNOW (fully understood, this pass + baseline combined)

- The exact 3-mechanism index-creation story and which indexes are actually live on a real (non-fresh) production database.
- The complete relationship graph (no FKs anywhere; every reference is a soft JSONB string, validated only in Python) with every orphan-prone edge named.
- That `events`/Event Engine is architecturally disjoint from `profiles` by deliberate, test-enforced design — and currently dormant (flag-gated, single non-wedding event type registered) rather than actively competing for the same traffic.
- That the live-gallery duplication (`live_gallery_photos` vs `live_photos`) is a self-documented, known, previously-partially-patched (read-side only) bug, not a hidden one — and that face-indexing never reaches either of them, only the separate studio-gallery system.
- The full multi-surface commerce picture: four independent order/payment surfaces, a concrete confirmed double-insert race in subscription verification, and confirmation that refunds are entirely manual/out-of-band by design.
- The actual RSVP status vocabulary collision (three incompatible spellings across three endpoints reading the same field).
- The real ownership/authorization matrix across every major resource type, including the STAFF-role-is-functionally-inert finding and two new differing-sibling-route authorization gaps.
- That background job scheduling is real (APScheduler + leader-locked interval loops) for the jobs the baseline had flagged as unknown, plus a newly-identified fail-open risk in the leader-lock mechanism itself under partial Redis outage.
- That S3 media has zero backup coverage anywhere in the codebase, while Postgres backup/restore is a genuinely working, tested mechanism (conditional on the cron line having been installed by hand).
- That several "product-retired" credit tables still have live read paths, and one (`credit_plans`) still has a live, reachable WRITE path.
- The correct current-state understanding of `db.users` (legacy but referenced, not dead) and `microservices/db/schema.sql` (live only on fresh-volume deploys).

### WHAT IS STILL UNKNOWN

| Unknown | Why Unknown | What Would Verify It | Blocks Schema Redesign? |
|---|---|---|---|
| Which RSVP status vocabulary (`yes/no/maybe` vs `confirmed/declined/pending` vs `accepted/declined/pending`) is actually written at submission time | Write site not traced to conclusion this pass | Read the actual `POST /api/rsvp` handler's field-write code to the end | **Yes** — must be resolved before any RSVP schema consolidation, since it determines which of 2-3 admin dashboards are currently silently broken |
| Whether `ganesh_module_enabled` (Event Engine gate) is actually set in production | Out of scope for a repo-only read; not in `.env.example` defaults | Check the live production `.env`/`app_settings` value | Partially — determines whether the "two event systems" risk is current or purely prospective |
| Where the studio-side gallery presign/commit-upload calls are made from in the frontend | `gallery.js` doesn't carry them; likely `uploads.js`, not read this pass | Open `frontend-v2/src/api/uploads.js` and the calling component | No — a documentation gap, not an architectural blocker |
| Whether `SENTRY_DSN` is actually set in production | Repo-only read cannot see live env | Check the production `.env` | No |
| Exact Pydantic default-id-factory for `Guest.id`, and the standalone `payments` table's id-generation call site | Not opened this pass, out of the prioritized field-inventory list | Read `models.py`'s `Guest` model and the relevant insert call | No |
| Whether any frontend UI still offers STAFF-role actions that would now 404/403 against the unenforced permission matrix | Frontend was out of scope for this forensic pass | Grep frontend-v2 for `studio_staff`/role-conditional UI | No — a UX-consistency question, not a data-model one |
| Whether `microservices/db/schema.sql`'s constraints were ever actually applied to the CURRENT production volume (i.e. was it ever a fresh-init, or has it always been upgraded-in-place) | Cannot be determined from code; depends on the deployment's history | Query the live production DB directly for the presence of schema.sql's declared indexes/generated columns | **Yes** — materially changes which indexes/constraints can be assumed to exist today |
| Full field-level inventory for the remaining ~250 of 269 tables (only ~15 priority tables were done to field level this pass) | Scope/budget limit for this pass, not a blocker in principle | A further, more exhaustive field-inventory pass focused on Pixora (~55 tables) and storage/commerce long-tail tables | Partially — sufficient detail exists for every table this document identifies as load-bearing for the redesign; the long tail (mostly Pixora) would benefit from a dedicated follow-up before THAT subsystem specifically is redesigned |

### REDESIGN READINESS

| Model | Rating | Why |
|---|---|---|
| Database model | **PARTIAL** | Core relationship graph, index reality, and orphan risks are now well understood; the fresh-vs-upgraded-volume schema.sql question is a real blocker for knowing which constraints exist today |
| API model | **PARTIAL** | The load-bearing endpoints are traced end-to-end; the full 150+-route surface is not, and one calling-frontend-file gap (`uploads.js`) remains |
| Event model | **PARTIAL, trending READY** | The duplication is fully characterized with a clear, evidence-backed verdict (architecturally separate, currently dormant, prospectively risky) — what's missing is a product decision, not more evidence |
| Gallery model | **PARTIAL** | The duplication and its functional consequences (face-search gap) are now fully characterized with a clear evidence trail — again, what's missing is a consolidation decision, not more forensic work |
| Commerce model | **NOT READY** | Four independent, non-unified payment surfaces with one confirmed active data-integrity bug (subscription double-insert) — this needs to be understood in full detail (including the two untraced `razorpay.Client` usages in `studio_storage.py`/`premium_features.py`) before any redesign, not just documented |
| Tenancy model | **PARTIAL** | Ownership fields are now mapped per resource type with their EXPLICIT/IMPLICIT/MISSING/INCONSISTENT classification — sufficient to design a tenant_id strategy, but the two ownership-check idioms (fetch-then-compare vs scope-by-construction) need a normalization decision first |
| Authorization model | **PARTIAL** | Matrix is built; STAFF-role gap and 2 new differing-sibling-route findings are documented; no further forensic work is strictly required, only decisions |
| Background processing | **READY** | Full inventory complete, scheduling reality resolved, failure modes (leader-lock fail-open, non-durable Drive-archive queue) documented |
| Infrastructure model | **READY** | GCP-as-compute-only, single-bucket S3, AWS service contracts, and the Postgres-backed/S3-unbacked backup asymmetry are all fully characterized |

This document, combined with `CURRENT_STATE_AUDIT_2026-08-16.md`, is the complete current-state input for the next phase. No fixes, redesigns, or migrations were proposed or applied in either document.
