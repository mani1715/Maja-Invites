# Architecture Migration Map

Lane A8. Originally drafted **2026-08-11 14:36 IST** as a mid-migration,
read-only snapshot while lanes A1-A7/A9 were still in flight; that draft
reported 7 of 9 workstreams as "None landed." **Re-verified 2026-08-11
against the current working tree** (`git status` shows all nine lanes'
changes present as uncommitted modifications to `backend/cache_backend.py`,
`event_media_service.py`, `face_consent.py`, `gallery_features.py`,
`live_gallery_features.py`, `premium_features.py`, `security_middleware.py`,
`server.py`, `system_health.py`, plus new modules `face_providers/`,
`media_derivatives.py`, `media_reconcile.py`, `usage_metering.py`,
`request_metrics.py`). **All 9 workstreams have now landed.** Every row
below was re-checked directly against source with grep/read at
re-verification time (file:line citations are current, not carried over
from the earlier draft) and backed by a 14/14 verification gate (see
section 1a).

The in-repo target-architecture source is `docs/MAJA_V2_IMPLEMENTATION_PLAN.md`
(2026-08-10), itself a synthesis over three external ground-truth docs that
are **not checked into this repo** (`MAJA_Backend_Cloud_Architecture_Implementation_Plan.md`,
`MAJA_Codebase_Reconciliation_Report.md`, `MAJA_Old_New_UI_Reconciliation_Meta_Prompt.md`
 - see plan doc line 8) plus `docs/recon/*.md`. Where a row below cites "the
architecture doc" for a specific target it means that external doc via the
plan's synthesis; independent verification against the original was not
possible from this repo checkout.

**Later pass, same day (L7 lane, ops runbooks + map refresh):** six
additional lanes landed after the wave above closed and are folded into
this map below, each independently grep/read-verified against the current
working tree this pass - see the specific row/conflict cited in each case,
not restated here: studio/photographer gallery upload now defaults to
direct-to-S3 presign with multipart fallback (conflict (e)); a face-index
dead-letter queue with per-photo and per-dead-letter retry (new row 10);
the `storage_pool_jobs.py` sweep race flagged open in row 6/conflict (i) is
now closed under a real distributed leader lock; `invitation_v2.py` and
`get_event_by_slug` are now actually deleted, not just approved for
removal (conflict (d), section 5 Retired/superseded); `system_health.py`
gained live Postgres/Redis component checks (row 9 addendum); and a local
dev-tier load test actually ran with results recorded (section 4). Nothing
below claims these six landed in the *original* wave described above -
they are later, separately-verified work, each dated as such inline.

---

## 1. Feature-by-feature: existing -> target -> action taken

| # | Feature | Existing implementation (file:line) | Target per architecture doc | Action taken this wave | Files modified/created |
|---|---|---|---|---|---|
| 1 | **Face-match provider abstraction** | Direct `aws_service` calls scattered in `gallery_features.py` (`create_face_collection`, `index_photo_faces`, `search_faces_by_selfie`, `delete_face_collection`, plus an inline `aws_service.rekognition().delete_faces` at the old delete-photo site) - Rekognition is not swappable | `FaceMatchProvider` interface so Rekognition can be swapped for a self-hosted model (MAJA_V2_IMPLEMENTATION_PLAN.md Phase 3 groundwork) | **LANDED - wired into every call site.** `gallery_features.py:51` imports `get_face_provider` from `face_providers`; it is now called at collection-create (`:269`), face-delete-on-photo-delete (`:441`), face-index (`:901`, `:948`), and collection-delete-on-gallery-cleanup (`:1250`). Zero remaining direct `aws_service.rekognition()`/`delete_faces` calls in `gallery_features.py` (confirmed by grep). `test_face_provider_wiring.py` additionally poisons `aws_service`'s face wrappers (monkeypatched to raise `AssertionError` if called) and asserts all 10 checks still pass, proving no call site bypasses the provider. `SelfHostedProvider` still raises `NotImplementedError` on every method (no licensed model) - unchanged, expected for Phase 1. Note: `face_providers/__init__.py:8-9`'s module docstring ("interface + providers only, no call-site rewiring") is now stale text left over from the original Phase-1 commit - harmless but worth a one-line fix in a follow-up. | Modified: `backend/gallery_features.py`. Created (prior draft, now wired): `backend/face_providers/*`, `backend/tests/test_face_provider_wiring.py` (new this wave, 10 checks). |
| 2 | **Originals preserved + unified derivatives** | Five near-duplicate resize implementations, each re-encoding (not preserving) the source: `aws_service.make_thumbnail`; `live_gallery_features._save_image_with_thumbs`; `premium_features.py` photographer/guest upload; `event_media_service.optimize_image`; `server.py convert_to_webp[_responsive]` | One shared derivative pipeline that keeps the true original byte-for-byte (MAJA_V2_IMPLEMENTATION_PLAN.md verdict table: AI gallery "historically DISCARDED originals") | **LANDED.** `gallery_features.py:_ingest_photo` (the shared upload path for both admin bulk-upload and guest live-upload, `:1065-1160`) now calls `media_derivatives.make_standard_set()` inside `_process_blocking` (`:1131-1136`) and stores a true 3-object layout per photo: `_original_key()` (`:157`) writes the untouched original bytes to `originals/{photo_id}.{ext}` (extension from sniffed format, not re-encoded), `_photo_keys()` (`:129`) writes `photos/{photo_id}/preview.jpg` and `photos/{photo_id}/thumb.webp`. The photo doc stores `original_s3_key` alongside legacy-compatible `s3_key`/`thumb_s3_key` aliases (`:1151-1153`) so every existing reader keeps working. Face indexing now runs off the preview derivative, not the original (`index_photo_job`, `:904`: `photo.get("preview_s3_key") or photo["s3_key"]`, with fallback for pre-migration rows). `event_media_service.optimize_image` was also refactored to reuse `media_derivatives.normalize`/`encode` for decode/EXIF/RGB-flatten and per-variant encode (its own resize-per-variant + 409 duplicate policy stayed inline, unchanged - see row 3). | Modified: `backend/gallery_features.py`, `backend/event_media_service.py`. Unchanged from prior draft: `backend/media_derivatives.py`, `backend/tests/test_media_derivatives.py` (13 checks). New this wave: `backend/tests/test_gallery_originals.py` (18 checks). |
| 3 | **sha256 dedup** | Two separate upload paths exist. (a) The generic studio/photographer storage pool (`storage/orchestrator.py:upload_file`, lines 466-476) already does sha256 dedup - pre-existing, not new. (b) The gallery-photo path bypassed the orchestrator entirely - no hash, no dedup, duplicate uploads created duplicate rows and S3 objects. | Content-hash dedup on gallery photo upload (implied by the lane's existence - no in-repo document states the exact target) | **LANDED, and extended beyond just the gallery path.** `gallery_features.py:_ingest_photo` (`:1090-1097`) computes `checksum = hashlib.sha256(data).hexdigest()` and does a per-profile `find_one({"profile_id", "checksum"})` skip before any S3 write, returning `{"duplicate": True}` and the existing row instead of re-storing (marked `ponytail:` - plain find-then-insert, not CAS-atomic against a same-instant concurrent duplicate; acceptable, upgrade path noted inline). The same pattern was independently added to `live_gallery_features.py` (`_find_duplicate` helper, `:137-140`, used at 3 upload sites: `:260-261`, `:375-376`, `:523-524`) and `premium_features.py` (2 upload sites: `:465-467`, `:541-543`), both scoped per-profile/per-wedding. `event_media_service.py` was left on its own **pre-existing** checksum + 409 policy (`find_duplicate`/`_checksum`, `:103-104`, `:244-246`; `on_duplicate` param controls cancel/replace/keep-both at `:279-284`) rather than being switched to the silent-skip pattern - deliberately kept, different UX contract (buyer-facing upload, not gallery/live-wall). | Modified: `backend/gallery_features.py`, `backend/live_gallery_features.py`, `backend/premium_features.py`. New tests: `backend/tests/test_gallery_originals.py` (dedup checks included in its 18), `backend/tests/test_media_dedup_paths.py` (11 checks, covers the derivative-helper contract + the guest-upload dedup path together). |
| 4 | **Face-search rate limits** | `gallery_features.py:515` `public_face_search` had no `rate_limit_allow` call at all. Only the *consent* endpoints next to it were limited. `security_middleware.py:456-461` exempted `/api/public/*` with a comment claiming face-search "keep[s] their own per-endpoint limiters" - which was false at the time. | A real per-endpoint limiter on the face-search selfie upload, matching the pattern already used for login/OTP/forgot-password | **LANDED - the comment is now true.** `gallery_features.py:593-598` adds two `rate_limit_allow` gates inside `public_face_search`: per-IP (`face_search:ip:{guest_ip}`, limit `FACE_SEARCH_LIMIT_PER_IP` env, default 15/hr, `:74`) and per-gallery (`face_search:profile:{profile['id']}`, limit `FACE_SEARCH_LIMIT_PER_EVENT` env, default 600/hr, `:75`). Both return `429` with `Retry-After: 3600` on trip. `security_middleware.py`'s comment was updated in the same wave (`:456-463`) to correctly state the limiter now lives in `gallery_features.py`'s own route, not the middleware. Verified by `tests/test_face_search_limits.py` (19 checks, includes a direct denial-then-`Retry-After` assertion). | Modified: `backend/gallery_features.py`, `backend/security_middleware.py`. New: `backend/tests/test_face_search_limits.py`. |
| 5 | **Withdrawal deletion** | `face_consent.py:97-114` `withdraw_face_consent` only set `withdrawn_at` on matching `db.face_consent` rows - it never touched `face_search_sessions`, never deleted the selfie S3 object, never touched the match cache. | "add withdrawal + deletion (selfie S3 objects + sessions + collection delete on event close - cleanup jobs already exist, wire consent into them)" - MAJA_V2_IMPLEMENTATION_PLAN.md Phase 3 item 3.4 | **LANDED.** `face_consent.py:withdraw_face_consent` (`:99-146` in the current file) still marks every matching `face_consent` row withdrawn, then additionally: finds every `face_search_sessions` row for `(profile_id, guest_ip)`, deletes each session's `selfie_s3_key` object from S3, purges the `fm:{profile_id}:{selfie_hash}` match-cache entry (new `selfie_hash` field, set at selfie-search time in `gallery_features.py:638-660` alongside the existing `selfie_s3_key`), then bulk-deletes the session rows. All of it best-effort (never raises, never blocks the withdrawal response) and scoped correctly per the DPDP note in the function's own docstring: only the withdrawing guest's own selfie-derived artifacts are purged, not the photographer's indexed photos. Verified by `tests/test_face_search_limits.py` (same 19-check file covers withdrawal: purge counts, both S3 keys deleted, other guests' sessions/cache entries left untouched). | Modified: `backend/face_consent.py`, `backend/gallery_features.py` (added `selfie_hash` field). |
| 6 | **Sweep leader lock** | Two independent sweep loops: (a) `server.py` gallery scheduler - already leader-locked, pre-existing. (b) `storage_pool_jobs.py:_job_loop` - gated only by `_due()`, a read-then-write on `db.app_settings` with no CAS guard - a real concurrent-worker race if ever run multi-process. | Bring the ungated sweep loop onto the same `acquire_lock`-leader pattern as the gallery scheduler | **LANDED for the loop actually fixed this wave - a different one than originally scoped, and the originally-flagged gap is still open.** `server.py:1487` imports `acquire_lock as _acquire_lock`; `_expiry_sweep_loop` (`:3378-3391`, the hourly invitation-expiry sweeper, a third loop not mentioned in the original draft's row 6 at all) now calls `if await _acquire_lock("expiry_sweep_leader", interval): await _expiry_sweep_once()` instead of running unconditionally - closing a real multi-worker race on that sweep. **`storage_pool_jobs.py`'s `_job_loop`/`_due()` (the loop this row originally targeted) was left unchanged in this same wave** - at the time, `_due()` was still a plain `find_one` then `update_one`, no `acquire_lock`, no CAS guard. **UPDATE (later pass, re-verified this session): that gap is now CLOSED too** - see conflict (i) below for the fix and its evidence; it landed in a later pass than this row's original wave, on `storage_pool_jobs.py` itself (not `server.py`). | Modified this wave: `backend/server.py`. Modified in the later pass: `backend/storage_pool_jobs.py` (see conflict (i)). |
| 7 | **Media reconciliation (gallery/S3 path)** | A reconciler already existed, but only for the generic photographer/studio storage pool (`storage_pool_jobs.py:376`); gallery photos never entered `upload_logs`, so they were invisible to it - no S3-vs-DB reconciliation, no stuck-job recovery, for the direct-S3 gallery path. | Reconciliation for the S3-default cutover specifically (MAJA_V2_IMPLEMENTATION_PLAN.md Phase 2.1) | **LANDED.** New `backend/media_reconcile.py`, single entry point `run_media_reconcile(db)`, registered as APScheduler job `id="media_reconcile"` at `server.py:16308-16309` (nightly 3:30am IST, leader-locked by the same gallery-scheduler lock its neighbors use - the module itself takes no lock). Three sections, each best-effort and independently caught: (1) stale `face_search_sessions` stuck `queued`/`requeued_once` >15min - claimed via `find_one_and_update` with the status guard in the filter (CAS, not read-then-write), requeued once then failed on a second stale pass; (2) `gallery_photos` never indexed and no `index_error`, >1h old, batch-capped at 200 - re-enqueued as `FACE_INDEX`; (3) newest 20 photos per run head-checked against S3, missing objects marked `storage_status: "missing"` and surfaced via one admin alert. Heartbeat via `system_health.record_job_run`. The gallery listing endpoint now surfaces this reconciler's state to the admin UI: `gallery_features.py:374-387` derives `processing_status` (ready/failed/missing/indexing) from `indexed`/`index_error`/`storage_status` per photo. Verified by `tests/test_media_reconcile.py` (26 checks: stale-search requeue/fail, unindexed re-enqueue, missing-object detection + alert, heartbeat, processing_status derivation). | Created: `backend/media_reconcile.py`, `backend/tests/test_media_reconcile.py`. Modified: `backend/server.py`, `backend/gallery_features.py`. |
| 8 | **Usage metering** | `storage_accounting.py` already metered per-studio storage bytes against the plan cap - capacity/quota metering only, not request- or API-cost metering (Rekognition calls, uploads, searches). | Broader usage metering per the architecture doc (exact scope not verifiable - external doc not in repo) | **LANDED.** New `backend/usage_metering.py`: `record_usage(metric, scope_id, amount)` buffers events via Redis `HINCRBY` on a single pending hash (process-local dict fallback with no Redis), called from `gallery_features.py` at every metered point (`photo_uploaded`, `duplicate_skipped`, `face_index`, `faces_indexed`, download manifests, etc.). `usage_flush_loop` (leader-locked, `acquire_lock("usage_flush_leader", 290)`, every 300s, wired at `server.py:15579-15588`) drains the buffer into `db.usage_records` as `{scope_id, date, metric, amount}` daily rollup docs via `find_one_and_update` upsert (atomic increment, no race). Two endpoints: `GET /api/admin/usage/{profile_id}` (owner or super-admin, per-profile totals + `estimated_cogs`) and `GET /api/super-admin/usage/summary` (platform-wide totals + top scopes/events), both registered via `build_usage_router` at `server.py:15579-15580`. COGS estimate reuses `profitability.py`'s env-configurable INR rates. Verified by `tests/test_usage_metering.py` (19 checks: Redis + no-Redis flush paths, rollup math, COGS math, both endpoints' auth/ownership/404 branches). | Created: `backend/usage_metering.py`, `backend/tests/test_usage_metering.py`. Modified: `backend/server.py`, `backend/gallery_features.py` (record_usage call sites). |
| 9 | **Request metrics** | Nothing found. No metrics middleware, no `/metrics` endpoint, nothing exported. `AbusePreventionMiddleware` tracked per-IP counts for abuse detection only, not exported as metrics. | Request metrics (latency/error-rate/throughput) per the load-test targets (P95 <300ms API / <500ms face search) | **LANDED.** New `backend/request_metrics.py`: `RequestMetricsMiddleware` added as the **outermost** middleware (`server.py:16478-16480`, added last/after CORS - "Lane A9" comment explains this deliberately so its timer covers the full stack, not just the route). Every response gets `X-Request-Id` (also added to CORS `expose_headers` at `server.py:16471`). Latency is bucketed per route-class (first two path segments) into a fixed in-process histogram (edges 50/100/300/500/1000/3000ms) with a coarse p95 estimator; 5xx responses counted separately, including ones raised by an inner middleware (re-raised after being counted). Admin endpoint `GET /api/admin/system/metrics` (super-admin only) returns the per-route-class snapshot plus face-queue depth (new `cache_backend.queue_length`) and job heartbeats for `usage_flush`/`media_reconcile`. `system_health.py` was also updated to report live queue depth instead of a static "OK" (`_check_queue`, degraded above 500 pending). Verified by `tests/test_request_metrics.py` (22 checks: bucketing, X-Request-Id uniqueness, 5xx counting incl. re-raise path, admin snapshot shape). **UPDATE (later pass, re-verified this session):** `system_health.py` was further extended with real Postgres (`_check_postgres`, `:76-100` - active connections + long-running (>30s) query count via `pg_stat_activity`, DB size) and Redis (`_check_redis`, `:107-122` - hit rate, evicted keys, memory, sourced from the new `cache_backend.redis_info()`, `:80-103`) component checks, both now reporting live signals instead of a static placeholder. `docs/DEPLOYMENT.md` sec 10.3 documents the resulting daily monitoring runbook against these exact fields. | Created: `backend/request_metrics.py`, `backend/tests/test_request_metrics.py`. Modified: `backend/server.py`, `backend/cache_backend.py` (added `queue_length`, and later `redis_info`), `backend/system_health.py`. |
| 10 | **Face-index dead-letter queue + per-photo retry** *(landed in the later L7-verified pass, not the original wave above)* | Before this pass: `worker.py:_give_up` on `MAX_ATTEMPTS` exhaustion wrote only `index_error` (on the photo) / `status: "failed"` (on the search session) - a durable trace, but no queryable list of failed jobs and no per-job retry control beyond the whole-gallery `reindex` endpoint. | A dead-letter queue with admin-facing retry (doc sec 30) | **LANDED.** `worker.py:_give_up` (`:85-122`) still writes that same bookkeeping, unchanged, then additionally best-effort inserts a `db.face_dead_letters` row (`:108-120`: `job_type`, `payload`, `profile_id`, `photo_id`, `session_id`, `error`, `attempts`, `status: "dead"`) inside its own `try/except` so a DLQ-write failure never masks the primary bookkeeping above it. `face_ops.py` exposes three endpoints, all owner-scoped via `_require_owned_profile_by_id` (`:78-90`, same owner-or-super_admin rule as `gallery_features._require_owned_profile`): `GET /api/admin/face-ops/dead-letters?profile_id=<id>` (`:124-130`, latest 100); `POST /api/admin/face-ops/retry-photo/{photo_id}` (`:132-157` - clears `index_error`, flags `needs_reindex`, re-enqueues `FACE_INDEX` or runs it inline with no queue configured, marks that photo's matching dead-letters `"retried"`); `POST /api/admin/face-ops/dead-letters/{dl_id}/requeue` (`:159-179` - CAS claim via `find_one_and_update` with `status: "dead"` in the filter, house no-read-then-write rule followed correctly, so a double-click can't double-enqueue; re-enqueues the original payload with `attempt` reset to 0). `docs/DEPLOYMENT.md` sec 10.1 wires this into the Rekognition-quota runbook (dead-letter spike as the actionable throttle signal). | Modified: `backend/worker.py`, `backend/face_ops.py`. |

**Net effect of this wave as observed:** all nine workstreams landed and are
wired into the code paths that motivated them - `gallery_features.py` now
routes every face-match call through the provider abstraction, preserves the
true original on every new upload, dedupes by content hash, rate-limits the
public face-search endpoint, and surfaces reconciler-derived photo status;
`face_consent.py` withdrawal now actually deletes the guest's selfie
artifacts; usage and request metrics are both live with admin-facing
endpoints. The one workstream that landed differently than originally
scoped is row 6 (sweep leader lock): the fix closed a real race on the
invitation-expiry sweep, not the `storage_pool_jobs.py` sweep the original
draft named - that specific gap was left open at the time (see conflict
(i) for its later-pass closure, row 10 for the wave-10 addition, and the
header note above for the full list of what changed in the later pass).

### 1a. Verification gate - 14/14 passed

Re-run at re-verification time, this repo checkout, Windows/PowerShell +
git-bash, project venv (`.venv/Scripts/python.exe` unless noted):

1. **Full-backend `compileall` clean.** `python -m compileall -q backend` -
   zero output, exit 0. No syntax errors across all 9 modified files + 5 new
   modules.
2. **9 new test modules pass** (each is a standalone `assert`-based
   script/`main()`, run directly - `pytest` collection needs
   `pytest-asyncio` + `asyncio_mode=auto`, which this repo doesn't configure,
   so these are invoked as `python tests/test_x.py` /
   `python -m tests.test_x`, matching their own module docstrings):
   `media_derivatives` 13/13, `face_providers` 14/14, `face_provider_wiring`
   10/10, `gallery_originals` 18/18, `face_search_limits` 19/19,
   `media_reconcile` 26/26, `media_dedup_paths` 11/11, `usage_metering`
   19/19, `request_metrics` 22/22. All 0 failed.
3. **5 pre-existing regression suites still pass**, chosen for touching the
   modified surface directly: `test_account_security.py` (15/15, auth/session
   paths near `security_middleware.py`), `test_storage_serve.py` (20/20,
   signed-URL serving near the new `original_s3_key`/3-object layout),
   `test_system_health.py` (14/14, now covers the new `_check_queue`),
   `test_photo_guard.py` (all passed, the byte-sniffing gate `_ingest_photo`
   still calls first), `test_travel_links.py` (48/48, guest-facing counters
   adjacent to `live_gallery_features.py`'s dedup change). Two other
   candidates (`test_gallery_privacy.py`, `test_invite_full_and_webp.py`)
   need a live server + `REACT_APP_BACKEND_URL` and were exercised instead
   via the boot smoke below, not run standalone.
4. **Boot smoke on :8003.** Booted a scratch `uvicorn server:app` instance
   on port 8003 (separate from the already-running dev instance on :8001)
   against the same local Postgres, full startup log clean - Postgres pool
   connected, usage-metering flush loop started, `media_reconcile` job
   added to the gallery APScheduler alongside its established neighbors,
   no warnings besides the expected missing `GEMINI_API_KEY` (unrelated,
   pre-existing, optional feature). `GET /api/health` returned
   `200 {"status":"ok","db":true}` with an `x-request-id` response header
   present. Process stopped after the check.
5. **Worker fail-closed guard verified.** Traced `worker.py:_dispatch`
   (`:104-118`, unmodified this wave): if `index_photo_job`/`run_search_job`
   return a non-ok result - including a provider failure, e.g.
   `SelfHostedProvider`'s `NotImplementedError` - `_dispatch` raises rather
   than treating it as success, feeding the existing
   retry-with-backoff/give-up path (`MAX_ATTEMPTS=5`, exponential delay,
   `_give_up` writes a durable `index_error`/session-failed record). A
   broken or misconfigured face provider therefore cannot silently mark
   photos as indexed; confirmed consistent with `test_face_provider_wiring.py`'s
   provider-substitution tests (10/10).

---

## 2. Already-compliant inventory (no work needed)

Verified directly against source, independent of this wave:

- **Async face queue + worker retry/backoff + inline fallback.** Queue name `maja:jobs:face` (`face_queue.py:15`); `worker.py:124-133` retries with exponential backoff (`min(2**attempt, 60)`, capped by `MAX_ATTEMPTS`) before giving up (`worker.py:83-99`); with no Redis configured, `gallery_features.py` runs the same job body inline as a fallback.
- **Event-scoped face collections.** `_profile_collection_id` builds `maja_wedding_{profile_id}` (`gallery_features.py:119-122`) - one Rekognition collection per wedding profile, sanitized for the allowed charset.
- **Selfie 24h TTL job + whole-gallery purge.** `cleanup_expired_selfies` (`gallery_features.py:1268-1285`) purges `face_search_sessions` + their S3 selfie objects older than 24h, hourly. `cleanup_expired_galleries` (`gallery_features.py:1231-1263`) does the full teardown (S3 prefix, Rekognition collection, `gallery_photos`, `face_search_sessions`) for weddings past `auto_delete_at`, daily at 3am IST - and now routes the collection delete through `get_face_provider()` (row 1 above) instead of calling Rekognition directly. Both run under the leader-locked APScheduler (`server.py:16316-16324`, lock key `scheduler:gallery:leader`).
- **Presigned uploads + CF-signed serving.** `storage_upload.py`: presigned POST (`:161-209`) + `head_object` re-verification on commit (`:218-242`, "the client is not trusted for size or type"). `storage_serve.py:283-317` `/api/media`: signature checked before any CDN URL is minted, falls back to a direct S3 signed URL when no CDN mirror exists (`:296-300`).
- **`fm:` search cache.** `gallery_features.py:637-639` - selfie-hash Redis cache keyed `fm:{profile_id}:{sha256(selfie)}`, 24h TTL, skips Rekognition entirely on a repeat selfie for the same gallery. Now also purged on consent withdrawal (row 5 above).
- **Consent 428 gate.** `gallery_features.py:585-587` - `public_face_search` returns `428 CONSENT_REQUIRED` before any selfie bytes are processed if no valid, non-withdrawn consent record exists for `(profile_id, ip_hash)`.
- **Download-all signed-URL manifests.** `gallery_features.py:393-399` `download_all_photos_manifest` - returns per-photo signed URLs instead of streaming bytes through the app server (explicit before/after comment citing the old full-body-through-EC2 behavior). Now signs the true original when present (row 2 above).
- **Generic-pool sha256 dedup, write-ahead log, and orphan reconciliation.** `storage/orchestrator.py:466-476` (dedup short-circuit), `:478-487` (write-ahead `upload_logs` row before provider write), `storage_pool_jobs.py:376` + `:432-445` (daily reconciler for `orphan_check` rows). Covers the photographer/studio storage pool; the gallery-photo path now has its own equivalent (row 7 above).
- **Per-studio storage quota metering.** `storage_accounting.py:1-50` - bytes-used vs plan cap across 10 media collections, single source of truth reusing `portfolio_service._storage_cap_bytes`.
- **Existing per-endpoint rate limiters (pattern face-search now follows too).** login (`server.py:1042-1044`), forgot-password (`:1539-1540`), OTP (`:1619-1621`), user login (`user_auth.py:252-254`), face-consent grant/withdraw (`face_consent.py:70`, `:110`), QR scan (`qr_analytics.py:123`), portfolio enquiry (`portfolio_leads.py:118`), review (`photographer_directory.py:493`), guest live-upload (`live_gallery_features.py:353,355`), face-search (`gallery_features.py:593-598`, row 4 above). All via `cache_backend.rate_limit_allow`.

---

## 3. Conflicts / deviations flagged for the owner

Evidence-first, no silent choice made on any of these.

**(a) "Events" vs "profiles."** The architecture doc's unit of work is the
*event*; this codebase's unit is the wedding *profile*
(`profile_id == doc's event_id` everywhere in the gallery subsystem - see
`_s3_prefix`/`_photo_keys`/`_profile_collection_id`, `gallery_features.py:112-131`).
Recommendation: treat this as vocabulary, not a data-model gap - no
migration needed, but future doc/code cross-references should say so
explicitly to avoid confusing "event" with the separate, actually-dead
`event_invitation` system in (d) below. Unaffected by this wave.

**(b) AI gallery historically discarded originals - RESOLVED for new
uploads this wave; pre-existing photos remain unrecoverable.**
`media_derivatives.make_standard_set()` is now called from
`gallery_features.py:_ingest_photo` (row 2 above) - every photo uploaded
through this gallery from this wave forward stores its true original
byte-for-byte at `_original_key()`. **Disclosure that remains true for the
owner:** photos uploaded *before* this wave were re-encoded to a 2000w JPEG
and stored as `orig.jpg` with no true original ever kept; there is no
recoverable original for those rows, and no migration can create one after
the fact. This is now the "new uploads only" state the plan describes -
it was not yet that state as of the prior draft.

**(c) Two parallel live-gallery photo stores.** `live_gallery_features.py`
writes to `db.live_gallery_photos` (keyed `wedding_id`); `premium_features.py`
writes to `db.live_photos` (keyed `profile_id`, has `approved`). `live_wall_feed.py:37-38,103-168`
is the merge shim that dual-reads both on every request. Parked per
`docs/pathfinder/03-unified-proposal.md` decision D2 (canonical store:
`live_photos`, backfill + repoint + delete the shim, scheduled behind a
maintenance window) - **still not touched this wave.** Both stores did each
gain their own independent per-profile dedup (row 3 above), which does not
change this conflict - it remains two collections, now two collections that
each dedupe internally.

**(d) Dead per-event_invitation Rekognition system - RESOLVED in the later
pass (was: untouched, flagged for a separate removal pass).** Was: `ei_{event_invitation_id}`
collections created and deleted but never indexed into or searched - no
code path called `IndexFaces`/`SearchFacesByImage` against an `ei_`
collection. **Now:** per-event_invitation collection *creation* is removed
entirely - grep confirms zero `create_face_collection(` calls remain
anywhere in `server.py`. `delete_face_collection(` (`server.py:3319`,
inside `_purge_invitation_assets`) is deliberately **kept** - it still
needs to clean up collections created by legacy rows from before this
removal. `models.py:533`'s `rekognition_collection_id` field is likewise
kept, same legacy-read reason. `db.face_matches` was already only ever
counted/deleted, never written - unaffected, still true. Verified by
`backend/tests/test_dead_surface_removal.py`, rerun this pass: 9/9 checks
passed (no `create_face_collection`, `delete_face_collection` still
present, `rekognition_collection_id` still referenced, no other test
imports the removed surfaces).

**(e) Presign now primary for studio/photographer uploads - PARTIALLY
RESOLVED in the later pass; guest flows are still, and remain, multipart-
only.** Was: the gallery path had no presign flow at all, only multipart
`bulk-upload`, per an explicit `ponytail:` comment on
`StudioProfileGallery.jsx` explaining that the generic
`uploadViaPresign`/`storage_upload.py` path couldn't be reused because it
writes to the unrelated `db.storage_files` collection, not
`db.gallery_photos`.

**Now, studio/photographer path:** `gallery_features.py` gained its own
presign flow - `POST .../gallery/presign-upload` (`:539-555`) + `POST
.../gallery/commit-upload` (`:557-604`, routes through
`_ingest_photo_bytes` exactly like the multipart path, so it correctly
lands in `db.gallery_photos`, not `db.storage_files`) - and
`frontend-v2/src/pages/StudioProfileGallery.jsx:28-57`'s
`uploadFileViaPresign` calls it as the **primary** path per file: presign
-> browser `PUT` straight to S3 -> commit. It falls back to the existing
multipart `bulk-upload` only on a `503` (S3 not configured), a failed/
network-error `PUT`, or a non-ok commit response - confirmed reading the
function end to end. This resolves the original finding for this path.

**Do not confuse this with `uploadViaPresign` in
`frontend-v2/src/api/uploads.js:23-29`** - a separate, still-distinct
presign implementation (the one the original finding was actually about,
targeting `db.storage_files` via `/api/uploads/presign`/`commit`) - it
**still has zero callers repo-wide**, re-confirmed by grep this pass.
Nothing routes through it; it remains dead code, unrelated to the gallery
presign flow that now exists alongside it under a different name.

**Still true, unaffected by this pass: guest-facing uploads remain
multipart-only, no presign path exists for them.** Guest live/phone-tether
upload (`POST /api/live-upload/{profile_id}`, multipart,
`gallery_features.py:25`) and the guest face-search selfie upload (`POST
/api/public/gallery/{slug}/face-search`, multipart, `:29`) have no presign
equivalent - presign unification for guest flows remains future work.

**(f) gdrive pool fallback retained inside `current_account`.**
`storage/orchestrator.py:200-218` - `current_account()` defaults to
`DEFAULT_PROVIDER` (`os.environ.get("STORAGE_DEFAULT_PROVIDER", "s3")`,
`:90`) but falls back to the `gdrive` pool when the S3 pool has no eligible
account (`:216-217`), "so provisioning/mirroring never silently dies." This
remains a deliberate owner decision recorded 2026-08-06, **retained
unchanged this wave**.

**(g) Four incompatible S3 key layouts coexist.** Gallery photos:
`weddings/{profile_id}/...` (`gallery_features.py:118-119`), now split
per-photo into three objects (original/preview/thumb - row 2 above) but
still under the same top-level prefix family. Event invitations:
`event-invitations/{id}/...` (`server.py:3328`). Generic storage pool:
provider-assigned folder refs under the Photographers/&lt;Name&gt;/...
charter hierarchy (`storage/orchestrator.py:13-17`). `storage_serve.py`'s
`/api/media` endpoint absorbs this by addressing objects opaquely by signed
key (`:283-303`) rather than assuming a layout - still no rewrite attempted
or needed.

**(h) Stale security-middleware comment - RESOLVED this wave.**
`security_middleware.py:456-463` previously claimed face-search "keep[s]
their own per-endpoint limiters," which was false at the time (row 4,
original draft). Both halves are now true: the comment was rewritten in
this wave to correctly say the limiter lives in `gallery_features.py`'s own
route (not the middleware, since `/api/public/*` is exempt from the
blanket per-IP throttle), and the limiter itself now exists (row 4 above).
No further action needed.

**(i) No multi-statement transactions in pg_adapter - CLOSED this pass, the
one previously-open gate is now guarded.** Confirmed at multiple sites,
worth recording all three: `storage/orchestrator.py:25-30` uses a raw
conditional `UPDATE` with the guard in the outer `WHERE` clause
(Postgres-safe under lock contention). `media_reconcile.py:_reconcile_stale_searches`
uses the other accepted pattern - `find_one_and_update` CAS with the status
guard directly in the filter. `storage_pool_jobs.py`'s `_due()`
(`:576-590`) is **still**, on its own, a plain read-then-write `update_one`
with no CAS guard in the filter - that part of the original finding stands.
**But it is no longer reachable concurrently.** `_job_loop` (`:593-619`)
now wraps every one of `_due()`'s 4 call sites (`:607,609,611,613` - grep
confirms these are the only callers of `_due(` in the file) inside `if
await cache_backend.acquire_lock("storage_pool_jobs_leader", 290):`
(`:603`). `acquire_lock` is a real distributed lock - `SET key val NX EX`
against Redis (`cache_backend.py:200-212`), one winner per TTL window
across however many uvicorn workers are running, not a per-process no-op
(it only silently "always wins" in the documented no-Redis case, which
means a single-process deploy where the race can't occur anyway). With
only one worker per iteration ever calling `_due()`, the read-then-write
pattern is safe in practice - exactly what `_due()`'s own docstring
(`:577-579`) already asserted by design ("only safe because `_job_loop`
only calls this from inside the acquire_lock-elected leader iteration").
That design intent is now actually enforced. **Distinct from, and in
addition to, row 6's `server.py:_expiry_sweep_loop` fix** (a different
sweep loop, fixed in the original wave) - this repo now has zero
confirmed-unsafe read-then-write gates.

**(j) VM sizing mismatch.** In-repo deploy docs
(`docs/DEPLOYMENT.md:31,41`, `deploy/docker-compose.yml:2`,
`docs/MAJA_V2_IMPLEMENTATION_PLAN.md:52,133`, `README.md:34`) consistently
specify GCP `e2-standard-4`. This task's brief states the architecture doc
specifies `E2-standard-8`; that string does not appear anywhere in this
repo (external doc, not checked in - see header). Flagging per instruction;
owner picks at provision time. Scale path is already documented as
`e2-standard-4 -> 8 -> 16` on measured triggers
(`MAJA_V2_IMPLEMENTATION_PLAN.md:55`), so an `-8` start is a one-line
change to the two GCP-provisioning docs whenever the owner decides.
Unaffected by this wave.

---

## 4. Load-test checklist (target: 100 -> 5000 concurrent, P95 &lt;300ms API / &lt;500ms face search)

Harness: `scripts/loadtest.js` (k6) for VM-scale, plus a new
`scripts/loadtest-local.mjs` (zero-dep Node, `node:http`, 117 lines) for a
local dev-machine tier, added in the later pass. **Status, re-verified
this pass: local dev tier RUN and recorded; VM-scale k6 tier still NOT
RUN.**

`docs/LOADTEST_RESULTS.md` (259 lines) records a real local run - 25/100/250
concurrent against the dev laptop's shared `:8001` stack (single uvicorn
worker sharing CPU cores with Postgres, Redis, and a Vite dev server).
Real numbers, "real" meaning with the known-by-design `/api/invite/review-demo`
daily-quota 429s excluded: tier 25 error rate 0.0%, tier 100 2.9%, tier 250
31.2% (breaches the 5%-error abort criteria, as expected - the run was
deliberately taken to the brief's top tier to see the full ceiling). The
doc's own verdict, worth repeating here rather than re-deriving: these
numbers "validate that the request path works correctly under concurrency
and degrades gracefully... they say nothing about whether production will
hit 300ms" - a single shared-core laptop process is not comparable to the
doc's target topology (multi-worker uvicorn, its own VM, pooled Postgres).
`docs/DEPLOYMENT.md` sec 10.4 now points here as the local-tier half of its
load-test-before-launch gate.

The k6-based **VM-scale ladder that would actually certify the doc's
targets remains unrun** - 100->500->1000->2500->5000 concurrent plus the
5/10-simultaneous-event scenarios below are fully specified in
`docs/LOADTEST_RESULTS.md`'s "Production procedure" section but have no
results file, no CI job, nothing recording an actual run against a VM -
confirmed by grep across `docs/` for any k6 output artifact. The gap table
below (face-search scenario missing, thresholds still generic, guest-upload
path uncovered) is entirely about this still-unrun VM-scale harness and
remains accurate as originally written.

Current coverage vs. gap, read directly from the script:

| Target scenario | In `loadtest.js` today | Gap to close before it can certify the doc's numbers |
|---|---|---|
| Guest opens invitation (`/api/invite/{slug}/full`) | Yes - primary scenario | none |
| Gallery-info call on page load | Yes - secondary scenario | none |
| Health ping baseline | Yes | none |
| Concurrency ramp to 5000 VUs | No - script auto-aborts at 5% error rate or 1.5s P95 (`loadtest.js:26-27`); `PEAK` env var must be set explicitly per run, default not verified at 5000 | Run with `PEAK=5000`; the auto-abort will report the real ceiling, not necessarily reach 5000 |
| Face-search endpoint (`/api/public/gallery/{slug}/face-search`) | **Not covered** - script explicitly states GET-only, never writes, never touches an upload path (`loadtest.js:7-8`) | Needs a new scenario: multipart selfie POST, since face-search is the &lt;500ms target and the only write/compute-heavy path in the doc's targets. The endpoint now has a real per-IP/per-gallery rate limit (row 4 above, `FACE_SEARCH_LIMIT_PER_IP`/`_PER_EVENT`) - a load test scenario must either raise those env vars for the run or account for 429s in its pass/fail criteria, or it will hit the limiter well before 5000 concurrent |
| P95 &lt;300ms API / &lt;500ms face search as pass/fail thresholds | No - current thresholds are generic (error rate &gt;5%, P95 &gt;1.5s) (`loadtest.js:26-27`), not the doc's specific 300ms/500ms targets | Add explicit k6 `thresholds` block per scenario matching the doc's numbers. `request_metrics.py`'s new `/api/admin/system/metrics` endpoint (row 9 above) can now cross-check the k6-side numbers against server-side bucketed latency per route-class during a run |
| Guest upload path | **Not covered** | Needs a scenario against `live_gallery_features.py`'s guest-upload endpoint (already rate-limited server-side, `:353,355`) - now also exercises the new per-wedding dedup path (row 3 above) under load, worth asserting duplicate-heavy load doesn't regress it |

Recommendation: extend `scripts/loadtest.js` with the two missing
scenarios (face-search, guest upload) and per-scenario thresholds, then run
from the VM per the script's own instructions (`loadtest.js:10-13`) -
never from a laptop, never during peak hours. **UPDATE (later pass): a
local-tier run now exists (see above, `docs/LOADTEST_RESULTS.md`) and
validates the request path under concurrency - the VM-scale k6 ladder that
would certify the doc's actual P95/error-rate targets is still the one
item nothing in this repo has run yet.** `docs/DEPLOYMENT.md` sec 10.4's
go/no-go checklist gates launch on that VM-scale run specifically, not the
local one.

---

## 5. Retired / superseded

- **`backend/invitation_v2.py`** and **`server.py` `get_event_by_slug`** -
 **REMOVED in the later pass (was: approved for removal per
 `docs/pathfinder/03-unified-proposal.md` decision D3, not deleted yet).**
 Decision D3 is now resolved, not just approved: `backend/invitation_v2.py`
 does not exist (confirmed via file search), no `invitation_v2` import or
 `build_invitation_v2_router` mount string remains in `server.py`, and
 there are zero `/api/v2` references repo-wide outside the removal-proof
 test itself. `get_event_by_slug` and its `"/invite/{slug}/event/{event_slug}"`
 route are likewise gone from `server.py` - grep clean on both. Verified
 live by `backend/tests/test_dead_surface_removal.py`, rerun this pass:
 9/9 checks passed (covers both this item and conflict (d)'s Rekognition
 half in one test run).
- **`ei_` per-event_invitation Rekognition collections** - see conflict (d)
 above, **RESOLVED in the later pass** (collection *creation* removed;
 *deletion* deliberately kept for legacy rows).
- **Drive archive worker + hooks** - per
 `docs/MAJA_V2_IMPLEMENTATION_PLAN.md` Phase 2.1, Drive was retired
 2026-08-06 as the default but the code still runs
 (`storage/orchestrator.py:216-218` fallback, conflict (f) above, kept
 deliberately - not superseded, still load-bearing as a fallback).
- **5 microservice stubs + gateway** - per
 `docs/MAJA_V2_IMPLEMENTATION_PLAN.md` section 2.1, dropped from the deploy
 (`/health`-only stubs, empty gateway `ROUTES=[]`); `microservices/db/schema.sql`
 and the hardened Caddyfile were kept and ported into `deploy/`. Reflected
 already in `deploy/docker-compose.yml` per commit `84d1422`.

---

## 6. Product pivot 2026-08-11

Owner-decided, final, separate from the 9-workstream wave above. Verified
against this checkout's uncommitted working tree (`git status`: modified
`backend/credit_service.py`, `gift_code_routes.py`, `monetization_features.py`,
`photographer_referrals.py`, `seed_review.py`, `store_features.py`,
`super_admin_pricing.py`, `user_auth.py`, `user_features.py`; deleted
`backend/tests/test_razorpay_tier_discount.py`; modified `frontend-v2/src/App.jsx`,
`components/RouteGuards.jsx`, `lib/marketingLinks.js`, `pages/AuthCallback.jsx`,
`pages/Cart.jsx`, `pages/Checkout.jsx`, `pages/Faq.jsx`, `pages/HowItWorks.jsx`,
`pages/Landing.jsx`, `pages/MANIFEST.md`, `pages/Pricing.jsx`, `pages/SignIn.jsx`,
`pages/SignUp.jsx`; deleted `src/api/users.js`, `src/context/UserAuthContext.jsx`,
`pages/UserDashboard.{jsx,css}`, `pages/UserWeddingEdit.{jsx,css}`; new
`backend/tests/test_credits_retired.py` and `test_users_retired.py`).
**The `:8001` dev process predates this working tree and house rules bar
restarting it** - live-HTTP re-verification wasn't possible this pass;
every claim below is source-read and test-suite-verified instead. Both new
suites were rerun for this doc: `test_credits_retired.py` 12/12 passed,
`test_users_retired.py` 34/34 passed.

### 6a. Credits retired - 410 wall

All money is INR via Razorpay now; no credit purchase, grant, or spend
exists anywhere. Every such endpoint raises the shared
`credits_retired_error()` (`backend/credit_service.py:24-37` -
`{"code": "CREDITS_RETIRED", ...}`, HTTP 410) **before touching Razorpay or
the DB** - confirmed for the purchase path specifically by
`test_credits_retired.py`'s mock Razorpay client, which raises
`AssertionError` if `order.create` is ever called; it isn't.

Killed endpoint groups:
- `POST /api/admin/credits/purchase/create-order`, `POST
  /api/admin/credits/purchase/verify` (`monetization_features.py:177-191`) -
  the credit-pack purchase flow.
- `POST /api/payments/razorpay-webhook` (`monetization_features.py:199-201`)
  - the credit-pack webhook only; store/subscription webhooks are separate
  paths, untouched.
- `POST /api/account/redeem-code` (`gift_code_routes.py:205-211`) -
  redemption only ever granted credits; the surrounding CRUD
  (create/list/update/deactivate, `:121-194`) stays for historical/admin
  visibility since it doesn't itself grant.
- `POST /api/account/redeem-referral` (`photographer_referrals.py:160-165`)
  - same reasoning; referral-code CRUD (`:128-194`) stays.
- The entire `/api/super-admin/pricing/*` router - 20+ routes (catalog,
  credit-packs, subscriptions, themes, designs, options,
  photographer-tiers, feature-packs) - gated by one router-level dependency
  `_pricing_retired` (`super_admin_pricing.py:237-251`), so **reads 410
  too, not just writes** - "the owner's simpler rule" per its own comment,
  rather than picking through 20+ routes one by one. Confirmed live over
  HTTP by `test_credits_retired.py` (`TestClient`, not just a function call).
- `/api/users/credits/purchase/create-order`, `/verify`, `/purchases`,
  `/credits/ledger` - these four are credit endpoints specifically, folded
  into the normal-user 410 wall in 6b below since they live in
  `user_features.py`.

Read-only balance/history stays working: `GET /api/admin/credits/purchases`
still 200s (`monetization_features.py:206`), confirmed by test - retirement
didn't break passive display.

**RESOLVED: pay-money-get-nothing hazard.** `credit_service.py`'s own
docstring predates this pivot and names the pre-existing shim directly:
"The credit system has been removed from MAJA Invites (subscriptions
replaced it)... every method is an async no-op... No balances, no ledger,
no gateway." That shim was already live before this pivot - meaning
`POST /api/admin/credits/purchase/create-order` -> `/verify` would take a
real Razorpay payment for a "credit pack," then `CreditService.add_credits()`
(a no-op, `credit_service.py:46-47`) would silently do nothing:
`get_credit_balance()` always returned `{"available_credits": 0}` (`:63-64`).
A photographer/couple paying real INR for credits got charged and received
a balance that could never move - pay money, get nothing. This wave closes
the hole by 410-ing the purchase endpoints *before* Razorpay is ever
called, so the transaction can no longer happen at all, instead of
happening and silently failing to grant. Not previously flagged as a
conflict/deviation row in section 3 above - recorded and marked resolved
here for the first time.

**RESOLVED: credits/INR collision.** `super_admin_pricing.py`'s legacy
console wrote CREDITS-denominated prices (`FeaturePack.base_price`, `:224`,
inline comment `# credits`) into the same pricing surfaces real INR
pricing (`/admin/pricing`) now serves from - "a live mis-pricing hazard
once other surfaces read those rows as INR" per the router's own
`ponytail:` comment (`:238-244`). The router-level 410 removes the hazard
by removing read access to the whole surface, not just writes - so a stale
CREDITS-denominated row can no longer be read back as if it were INR by
any surface. Likewise not a previously-flagged section-3 row; recorded and
resolved here.

### 6b. Normal users retired

Photographers/studios are the only account holders. Every couple/buyer
account endpoint now 410s, or a photographer/studio identity is required
in its place:

- `user_auth.py` - every public account route (`register`, `login`,
  `auth/google/login`, `auth/google/callback`, `me`, `logout`, `:104-126`)
  answers `410 NORMAL_USERS_RETIRED` regardless of payload - confirmed a
  malformed `register` body still 410s, never 422s first. `get_current_user`
  stays wired into `user_features`/`account_data`/`live_gallery_features`/
  `celebration_translation` as `get_current_public_user` per its own
  docstring, but since no new session can ever be created it 401s in
  practice there - those call sites are out of this pivot's scope, noted
  but not touched this pass.
- `user_features.py` - all 17 user-owned invitation/dashboard routes 410
  the same way (`buy-addon`, `credits/purchase/create-order` + `verify` +
  `purchases` + `ledger`, `profiles/{id}/insights`, `profiles` CRUD
  (POST/GET/PATCH/DELETE), `upload-image`); file dropped from 737 lines to
  35 kept + 702 deleted in this diff.
- `store_features.py` - ordering guard rewritten. `_require_studio_buyer`
  (`:433-449`) replaces `get_current_public_user` on every
  mutating/ordering route (`order/create`, `/verify`, `/edit-state`,
  `/info`, `/info-draft`, `/{order_id}` GET, `my-orders`) - requires a
  photographer/studio Bearer JWT; a couple-session cookie no longer
  authenticates (401), and an event_client (Couple Access) Bearer is
  explicitly rejected too (`payload.get("typ") == "event_client"` checked
  and refused, `:443-446`) so a couple-access link can never place an
  order. Public store READ endpoints (`packages`, `design/{id}/price`,
  `quote`) stay open, no auth. Verified end-to-end over HTTP by
  `test_users_retired.py`: no-Bearer -> 401, couple-cookie -> 401,
  event_client Bearer -> 401, studio Bearer -> 200 with the order recorded
  `buyer_kind=photographer`.
- Frontend removals: `frontend-v2/src/pages/UserDashboard.{jsx,css}`,
  `UserWeddingEdit.{jsx,css}`, `src/context/UserAuthContext.jsx`,
  `src/api/users.js` all deleted. `App.jsx` drops the `/user/dashboard` and
  `/user/profile/:profileId/edit` routes and the `UserAuthProvider` wrapper
  entirely. `RouteGuards.jsx` drops `RequireUser` (`useUserAuth` import and
  the guard function both removed).
- `photographer_clients.py` (Couple Access portal, event_client JWT) is
  explicitly **untouched** - confirmed absent from `git status`'s modified
  list, and by `test_users_retired.py`'s dedicated check that its router
  still builds and `/api/client/login` is still mounted.

Also removed this pass: `backend/tests/test_razorpay_tier_discount.py` -
tested a normal-user-tier Razorpay discount path that no longer exists.

### 6c. Photographer-only purchasing

`store_features.py`'s `_require_studio_buyer` (6b above) is the single
enforcement point - every design purchase now runs through a
photographer/studio identity; no path carves out an exception for a
couple's own session or a couple-access token.

### 6d. Couple experience = studio-issued access portal only

Couples get invitation access exclusively via the Couple Access portal
(`/couple/access/:slug`, `photographer_clients.py`, event_client JWT
issued *by* the studio via `POST /api/client/login`) - unchanged and
untouched by this pivot (6b above). No other couple-facing account surface
remains: no self-serve registration, no couple-owned dashboard, no couple
session cookie accepted anywhere that matters (store ordering explicitly
rejects it, 6b above).
