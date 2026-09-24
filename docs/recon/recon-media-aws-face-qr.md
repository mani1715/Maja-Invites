# MEDIA + AWS + FACE + QR — Legacy MAJA Inventory

Repo root: `.../scratchpad/legacy/logic`. All paths below relative to that root.

---

## 1. MODULE MAP

| File | Role | Status |
|---|---|---|
| `backend/aws_service.py` | boto3 S3 + Rekognition + CloudFront signer + Pillow. 296 lines, lazy singletons | REAL, complete |
| `backend/storage_upload.py` | **presign + commit** direct-to-S3. `/api/uploads/presign`, `/api/uploads/commit` | REAL, but **zero frontend callers** |
| `backend/storage_serve.py` | read path: 302 → signed CDN URL. `/api/media`, `/api/uploads/{path}`, `/uploads/{path}` | REAL, mounted at server.py:260 (earliest) |
| `backend/gallery_features.py` | wedding AI gallery: enable→collection, bulk/live upload→S3+IndexFaces, guest selfie→SearchFaces | REAL end-to-end; UI unreachable (§10) |
| `backend/gallery_privacy.py` | access-code + device-JWT gate for guest galleries | REAL, wired |
| `backend/live_gallery_features.py` | **second, disk-only** live gallery + WS + guest upload | REAL but disk-only, no S3, no face indexing |
| `backend/premium_features.py` | **third** live gallery (`live_photos` coll, base64 upload, uploader tokens) | REAL, parallel/duplicate |
| `backend/event_media_service.py` | Ganesh/event-engine media pipeline (disk + WebP variants + optional CDN push) | REAL, module-gated 404 by default |
| `backend/face_ops.py` | admin face dashboard + "reindex" | Dashboard REAL; **reindex is a STUB** |
| `backend/face_consent.py` | DPDP consent record | Writes only — **never read/enforced** |
| `backend/qr_analytics.py` | scan counter + admin rollup | REAL |
| `backend/studio_storage.py` | paid studio storage plans → S3 `studio/{admin_id}/…` | REAL |
| `backend/cloud_backup_service.py` | studio Cloud Backup — **local disk only, not S3** | REAL but disk-backed |
| `backend/storage_pool_hooks.py` / `storage_pool_jobs.py` / `storage/` | multi-drive pool (Drive→S3 pivot) | REAL, **flag OFF by default** |
| `backend/drive_archive.py` | per-studio Google Drive OAuth archive worker | Still mounted + worker started at startup |
| `backend/photo_guard.py` | magic-byte photo sniffing (`sniff_photo`, `assert_photo`) | REAL, reusable |
| `backend/scripts/{use_s3_storage.py,backfill_media.py}` | pool→S3 cutover + backfill/verify | present |
| `backend/tests/` | `test_storage_upload.py`, `test_storage_serve.py`, `test_gallery_privacy.py`, `test_qr_analytics.py`, `test_face_ops_providers.py`, +12 storage tests | present |

---

## 2. S3 PRESIGN / COMMIT — EXACT

`backend/storage_upload.py`. Router mounted server.py:15432, `require_admin` on **both** endpoints.

**`POST /api/uploads/presign`** — body `PresignIn{area, content_type, size_bytes>0, event_id?, filename?}`
- `AREAS = ("qr_photos","selfies","portfolio","cloud_storage","community","media")` — unknown → 400
- `qr_photos|selfies` require `event_id` matching `^[A-Za-z0-9._-]{1,64}$` → else 400
- `ALLOWED` map content_type → (ext, cap). jpeg/png/webp/heic/heif=25MB; mp4/quicktime/webm=500MB; mpeg/mp4-audio/wav=50MB. Unknown → 415. Over cap → 413
- **Server chooses key** (`_key_for`), never client:
  - `qr_photos` → `events/{event_id}/photos/{uuid4hex[:16]}{ext}`
  - `selfies` → `events/{event_id}/ai-selfies/{fid}{ext}`
  - `portfolio` → `portfolios/{photographer_id}/works/{fid}{ext}`
  - `community` → `community/{photographer_id}/posts/{fid}{ext}`
  - `cloud_storage` → `studio/{photographer_id}/backup/{fid}{ext}`
  - default → `media/{photographer_id}/{fid}{ext}`
- `generate_presigned_post` with `Fields={"Content-Type":ct}`, `Conditions=[{"Content-Type":ct},["content-length-range",1,cap]]`, `ExpiresIn=PRESIGN_TTL` (env `UPLOAD_PRESIGN_TTL`, default 900s)
- cloud_storage pre-check: `studio_storage._get_admin_sub` → 402 if no sub; other quota errors swallowed
- returns `{url, fields, key, expires_in}`

**`POST /api/uploads/commit`** — body `CommitIn{key, area, event_id?, filename?}`
- key-ownership prefix check: `("portfolios/{aid}/","community/{aid}/","studio/{aid}/","media/{aid}/","events/")` → else 403
- `head_object` re-derives size + ContentType; ContentType not in ALLOWED → **delete_object** + 415
- inserts `storage_files` row: `{id:"file_…", photographer_id, event_id, area, provider_ref:{key}, filename, size_bytes, content_type, source_path=key, upload_status:"stored", uploaded_at}`
- returns `{file, url: storage_serve.media_url(key)}`

**SECURITY GAP (flag):** the bare `"events/"` prefix in the commit allowlist means **any admin can commit any other studio's event object** and claim it. Every other area is `{admin_id}`-scoped; `events/` is not.

**GAP:** no public/guest presign. Guest uploads and face-search selfies cannot use this path — it is `require_admin`-only.

---

## 3. CLOUDFRONT SIGNED URLS — EXACT

`aws_service.cf_signer()` / `generate_signed_url(key, expiry_seconds=3600)`:
- Env: `AWS_CLOUDFRONT_PRIVATE_KEY_PATH` (default `/app/backend/aws_cloudfront_private_key.pem`), `AWS_CLOUDFRONT_KEY_PAIR_ID`, `AWS_CLOUDFRONT_DOMAIN`
- Loads PEM via `cryptography`, `CloudFrontSigner(key_pair_id, rsa_signer)`, `rsa_signer = PKCS1v15 + SHA1` (canned policy)
- URL = `https://{AWS_CLOUDFRONT_DOMAIN}/{key}`, `date_less_than = utcnow + expiry`
- **Silent fallback:** key file missing / env unset → logs warning, returns `s3().generate_presigned_url("get_object", …)`. Fails to "slow + expensive", not "broken". Documented as still-open in `MULTI_DRIVE_STORAGE_DESIGN.md` §Phase-10 "Still open".
- Other env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (default `ap-south-1`), `AWS_S3_BUCKET`, `FACE_MATCH_CONFIDENCE_THRESHOLD` (default 90), `MEDIA_SIGNED_URL_TTL` (default 3600), `UPLOAD_PRESIGN_TTL`, `UPLOADS_ROOT`

### 302 redirect mechanism (`storage_serve.py`)
- `media_url(key, expiry=3600)` → `/api/media?k={b64url(key)}&e={unix_exp}&s={sig}`; `sig = urlsafe_b64(HMAC-SHA256(JWT_SECRET_KEY, f"{key}:{exp}"))[:32]`. **No DB read to mint** (drop-in for the old sync `generate_signed_url` at 12 call sites)
- `GET /api/media?k&e&s` → `_verify_media` (403 on bad token / expired / bad sig, `hmac.compare_digest`) → look up `storage_files{source_path==key}` → `orchestrator.get_download_url(doc.id, TTL)` → `_cdn_redirect(url)`; on miss/failure → `aws_service.generate_signed_url(key, TTL)` → redirect
- `GET /api/uploads/{subpath:path}` and `GET /uploads/{subpath:path}` → `_safe_subpath` traversal guard → `storage_files{source_path == uploads_root/sub}` → CDN redirect; else local disk with hand-rolled RFC-7233 Range (`_file_response`, Starlette 0.37.2 `FileResponse` ignores Range)
- 302 not 301, deliberate; `Cache-Control: private, max-age = max(60, TTL//2)`

**BROKEN (latent):** `orchestrator._file_and_account` does `f["drive_account_id"]` — rows written by `storage_upload.commit` have **no `drive_account_id`** → KeyError on every `/api/media` hit for presign-committed files → swallowed by `_cdn_url`'s `except` → falls through to `aws_service.generate_signed_url`. Works, but one exception + warning log per media request.

**INCONSISTENCY:** `event_media_service._push_to_cdn` writes **raw** `https://{cf_domain}/events/{event_id}/gallery/{name}` URLs straight into the `gallery` row (`webp_url/optimized_url/thumbnail_url`), bypassing the `/api/media` indirection → those URLs are unsigned, unrevocable, and expose bucket layout. Directly contradicts `storage_serve.py`'s stated doctrine.

**INCONSISTENCY:** ZIP endpoints (`/gallery/download-all`, `/public/gallery/{slug}/download-zip`) do `s3().get_object(...).read()` **per photo, in-request** — full bytes through EC2, whole body in RAM per photo. Violates the "EC2 never in the media path" rule.

---

## 4. S3 KEY STRUCTURES IN USE (four incompatible layouts)

| Producer | Key |
|---|---|
| `gallery_features._photo_keys` | `weddings/{profile_id}/photos/{photo_id}/orig.jpg` + `…/thumb.jpg` |
| `gallery_features._selfie_key` | `weddings/{profile_id}/selfies/{session_id}.jpg` |
| `gallery_features` photo-request | `photo-requests/{profile_id}/{req_id}.jpg` |
| `storage_upload._key_for` | `events/{event_id}/photos/…`, `events/{event_id}/ai-selfies/…`, `portfolios/…`, `community/…`, `studio/{pid}/backup/…`, `media/{pid}/…` |
| `studio_storage._file_key` | `studio/{admin_id}/{file_id}.{ext}` |
| `event_media_service._push_to_cdn` | `events/{event_id}/gallery/{filename}` |
| `server.py` trash purge | `profiles/{profile_id}/` (delete_prefix) |

`AWS_ARCHITECTURE.md` §7 documents only the `events/…` layout. The live wedding gallery uses `weddings/…` → **lifecycle rules written against the documented prefixes will not match the actual gallery data.**

S3 object tags (used for lifecycle): `expire-at` (YYYY-MM-DD), `kind` (`selfie`|`photo-request`|`studio-backup`), `wedding`, `method`, `admin_id`. `event_media_service` sets **no tags**.

---

## 5. RETIRED GOOGLE DRIVE POOL — WHAT REMAINS

Owner decision 2026-08-06: S3+CloudFront primary, Drive out. Nothing was deleted.

Still present and wired:
- `backend/storage/` package: `base.py` (StorageProvider ABC), `gdrive_provider.py` (19KB, intact), `s3_provider.py`, `orchestrator.py` (41KB), `crypto.py` (Fernet cred encryption), `migrate.py`
- `get_provider(kind)`: `s3|aws|r2 → S3Provider`; `gdrive|drive|google → GoogleDriveProvider`
- **`StorageOrchestrator.current_account(kind="gdrive")` and `upload_file(kind="gdrive")` still default to gdrive.** `storage_pool_hooks` calls `orch.current_account()` with no arg → Drive. Switching to S3 depends entirely on running `scripts/use_s3_storage.py` to register an S3 account row; the code default was never flipped
- `storage_pool_hooks.mirror_upload/mirror_delete/provision_*` called from: `live_gallery_features` guest upload (`area="qr_photos"`), `premium_features` guest upload (`area="selfies"`), `event_media_service` (`area="qr_photos"`), `studio_storage` upload (`area="cloud_storage"`), pixora/portfolio
- **Gated by `app_settings.storage_pool_enabled`, default `False`** → all hooks inert today
- Orchestrator folder tree (Drive semantics, meaningless on S3): `Photographers/<Name>/{Events/<Event>/{QR_Photos,Selfies}, Portfolio, Cloud_Storage, Community, Media}`
- Account pool machinery kept: `slot: current|standby`, `pool_order`, `_reserve` atomic committed_bytes under soft_limit_pct (default 95), `_promote_next` failover, `_DEGRADE_AFTER_FAILURES=3`, `_MAX_ACCOUNT_ATTEMPTS=3`, `SOFT_DELETE_RETENTION_DAYS=5`
- `drive_archive.py` (separate, per-studio OAuth) **still mounted and its worker still started** at server.py startup (`_drive_archive_startup`). `live_gallery_features.photographer_upload` still calls `drive_archive.enqueue_archive`. Env `GOOGLE_DRIVE_REDIRECT_URI`, `GOOGLE_DRIVE_SCOPE`, `STORAGE_POOL_CLIENT_ID/SECRET/REDIRECT_URI/SCOPE`
- `orchestrator.download_file` docstring still claims the serving path uses it — **stale**; `storage_serve` uses `get_download_url`

---

## 6. GALLERY PRIVACY / GUEST ACCESS TOKEN

`backend/gallery_privacy.py`. Storage: `profiles.gallery_privacy` sub-document.

Fields: `{enabled, password_hash(bcrypt), remember_days∈{7,30,90}, public_highlights_enabled, private_full_gallery_enabled, ai_face_match_enabled, allow_downloads, allow_share, expires_at, device_token_salt, updated_at, stats{unlocks,failed_attempts,ai_uploads,qr_scans,matched_results}}`

- Access code rule: `^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9!@#$%^&*_\-+=?.]{4,20}$`
- `POST /api/public/gallery/{slug}/unlock` → verify bcrypt → HS256 JWT `{sub:"gallery", pid, salt, iat, exp}` signed with `JWT_SECRET_KEY`, TTL = remember_days (or 1 day if `remember=false`). Returns `{device_token, expires_at, remember_days, allow_downloads, allow_share, ai_face_match_enabled}`
- Client sends `X-Gallery-Device-Token` header **or** `?device_token=` query
- `enforce_gallery_access(profile, request)` → no-op if not `(enabled AND password_hash)`; 410 if expired; 401 otherwise. Called by gallery_features `face-search`, `photo-request`, `photos`, `download-zip`
- Brute force: **in-process** dicts `_attempts`/`_blocked_until` keyed `(ip, slug)`; 5 attempts / 5-min window → 5-min block. Resets on restart, not shared across workers
- `logout-all` / `reset-code` rotate `device_token_salt` → invalidate all devices
- `GET /api/public/gallery/{slug}/privacy` also `$inc gallery_privacy.stats.qr_scans` (second, independent scan counter — see §8)
- Frontend: `frontend/src/hooks/useGalleryAccess.js`, `components/luxury/GalleryLockScreen.jsx`, `GalleryPrivacyEditor.jsx`

---

## 7. LIVE GALLERY + GUEST UPLOAD — THREE PARALLEL IMPLEMENTATIONS

**A. `live_gallery_features.py`** — collection `live_gallery_photos`, disk root `/app/uploads/weddings/{wedding_id}/{gallery|guest_uploads}/`
- WS `/api/ws/gallery/{wedding_id}` — in-process `GalleryConnectionManager`, slug→id resolution, 30s heartbeat, broadcasts `{type: photo_added|photo_deleted}`. **Single-process only — no Redis pub/sub, breaks with >1 worker**
- Photographer: `POST /api/admin/profiles/{id}/live-gallery/upload` (multipart list, `store_to_storage`+`storage_folder` opt-in → `studio_storage.auto_archive_to_studio_storage`, quota-aware messaging)
- Guest: `POST /api/invite/{slug}/gallery/guest-upload` — **public, unauthenticated**. Rate limits via `cache_backend.rate_limit_allow`: 40/600s per IP, 400/600s per slug. `photo_guard.assert_photo` byte-sniff, MAX 25MB. Fields `guest_name` (≤60), `caption` (≤200). Auto-publish, no moderation
- `_save_image_with_thumbs`: original re-encoded JPEG q88, `thumb_{base}.webp` 800px q82, `micro_{base}.webp` 200px q70. URLs `/api/uploads/weddings/{wid}/{folder}/{name}`
- Host variants under `/api/users/profiles/{id}/live-gallery/{upload,photos,{photo_id}}` (user JWT, ownership by `profile.user_id`)
- **No S3, no Rekognition, no privacy gate anywhere in this module**

**B. `premium_features.py`** — collection `live_photos`, disk `/app/uploads/live_gallery/{profile_id}/`
- `POST /api/invite/{slug}/live-gallery/guest-upload` — **base64 JSON body**, 8MB cap, resize 1600px q82 + 480px thumb, moderation via `live_gallery_settings.{auto_approve,moderation_required}`, plan gate `pricing_activation.has_feature(…,"guest_uploads")`
- Uploader tokens: `POST …/live-gallery/uploader-token` → `token = uuid4().hex + uuid4().hex` (**256-bit random**, good), coll `uploader_tokens{token, profile_id, admin_id, expires_at, revoked}`, default TTL 72h; consumed by `POST /api/live-gallery/desktop-upload` via `X-Uploader-Token` header
- `GET /api/invite/{slug}/live-gallery` reads **both** collections (see `live_wall_feed.py`) — a prior bug where the guest wall was permanently empty

**C. `gallery_features.py`** — the S3/Rekognition wedding gallery (§10), `gallery_photos` collection.

---

## 8. QR — IMPLEMENTATION TODAY

**Token format: THERE IS NO QR TOKEN.** Every QR encodes a plain public URL built from the profile slug:
- `GET /api/invite/{slug}/qr` (server.py:7301) → `{PUBLIC_BASE_URL|FRONTEND_BASE_URL|REACT_APP_BACKEND_URL}/invite/{slug}`, `qrcode` lib, ERROR_CORRECT_L, box_size 10, border 4, PNG StreamingResponse
- `GET /api/profiles/{slug_url}/qr-code?size=` (server.py:9966) → base64 PNG, size 100–1000, public
- `GET /api/events/{event_id}/qr-code?size=` (server.py:10037) → public
- `_build_branded_qr` (server.py:2812) → ERROR_CORRECT_H, couple-photo/背景 composite via `_load_qr_background_bytes` (`use_couple_photo_as_qr_bg` default True → `couple_photo_url`; else `qr_background_media_id` / `custom_text._maja.qr_background_photo_url`). Result cached as base64 in `event_invitations.{qr_image, qr_url}`
- `POST /api/admin/event-invitations/{id}/regenerate-qr`, `POST /api/admin/profiles/{id}/regenerate-all-qrs`

⇒ **Predictable.** Slug is user-chosen and enumerable. The only access control behind a scanned QR is `gallery_privacy` (opt-in, default off). No signed/rotating QR payload exists.

**Analytics** (`qr_analytics.py`):
- `POST /api/public/qr-scan/{slug}` — public; rate-limited 5/3600s per (ip, slug); `record_scan` resolves slug→`profiles.id`, upserts `qr_scan_counts{wedding_id, count, last_scan}`. Called from `frontend/src/pages/LivePhotoWall.jsx:46`
- `GET /api/admin/qr-analytics` (`require_admin`) → `compute_qr_analytics`: reads **whole** `live_gallery_photos` (`to_list(200000)`), `qr_scan_counts`, `upload_logs`. Returns galleries, total_scans, total_uploads, guest/studio split (`source=="guest"`), failed_uploads (`upload_logs.status=="failed"`), `scan_to_upload_pct = min(uploads/scans,1)*100`, storage_bytes/gb, top-10 events
- **Duplicate counter:** `gallery_privacy` also `$inc`s `gallery_privacy.stats.qr_scans` on `GET /public/gallery/{slug}/privacy`. Two unreconciled scan tallies
- Admin UI: `frontend/src/pages/SuperAdminQRAnalytics.jsx`, `QRCodeManagement.jsx`, `components/QRCodeDisplay.jsx`

---

## 9. BACKGROUND JOB INFRASTRUCTURE

No Celery, no queue service. Three mechanisms:

1. **APScheduler** (`server.py:~16108`), `AsyncIOScheduler(timezone=Asia/Kolkata)`, **leader-elected via Redis lock** `scheduler:gallery:leader` TTL 120s + heartbeat task (`cache_backend.acquire_lock/renew_lock`; returns True with no Redis → single-worker unchanged):
   - `gallery_daily` 03:00 IST → `cleanup_expired_galleries` (S3 `delete_prefix(weddings/{id}/)`, `delete_face_collection`, purge `gallery_photos` + `face_search_sessions`, flip `gallery_config.enabled=false`)
   - `selfie_hourly` :15 → `cleanup_expired_selfies` (delete selfie S3 objects + sessions > 24h)
   - `trash_purge_daily` 04:00 → `delete_prefix(profiles/{pid}/)` + `storage_pool_hooks.on_event_purged` for profiles soft-deleted > 5d
   - `storage_lifecycle_daily` 05:00 → `subscription_service.run_storage_lifecycle`
   - `view_count_flush` every 30s
2. **`storage_pool_jobs.start_jobs(db)`** — bare `asyncio.create_task(_job_loop)`, 120s boot delay, 300s tick, due-ness persisted in `app_settings[STATE_KEY]`. **Not leader-gated → duplicates under multi-worker.** Jobs: `disk_sweep` /10min (delegates to `scripts/backfill_media.backfill_disk`), `hourly` (provider health, quota sync, drift >1GB warn, degraded→active recovery), `daily` (stale pending/uploading→failed, orphan adoption, counter reconcile), `weekly` (capacity forecast + `alert()`), `run_retries` (re-mirror `upload_logs.status=deferred` from `source_ref`)
3. **`storage_pool_hooks`** bounded in-process mirror queue: `asyncio.Queue(maxsize=200)`, 4 workers, `MAX_INLINE_BYTES=64MB`; overflow/oversize → `upload_logs` row `status="deferred"` with `source_ref` for the retry job
4. **`drive_archive.start_worker(db,…)`** — separate asyncio worker task, started unconditionally at startup

**No job queue exists for face indexing.** Indexing runs inline inside the upload request via `asyncio.to_thread`, bounded by `GALLERY_BULK_CONCURRENCY` (default 4).

---

## 10. FACE — WHAT EXISTS vs WHAT IS MISSING

### Rekognition calls that DO exist (`aws_service.py`, all real boto3)
| Fn | AWS API | Called from |
|---|---|---|
| `create_face_collection(cid)` | `create_collection` (swallows `ResourceAlreadyExists`) | `POST /api/admin/profiles/{id}/gallery/enable` |
| `delete_face_collection(cid)` | `delete_collection` | `cleanup_expired_galleries` |
| `index_photo_faces(cid, s3_key, external_image_id, max_faces=15)` | **`index_faces` with `Image={"S3Object":{Bucket,Name}}`** — bytes never leave S3. `DetectionAttributes=["DEFAULT"]`, `QualityFilter="AUTO"`. `InvalidParameterException` → `{ok:True, face_count:0}` | `_ingest_photo` (bulk + live upload) |
| `search_faces_by_selfie(cid, selfie_bytes, threshold, max_faces=100)` | **`search_faces_by_image` with `Image={"Bytes": …}`** — selfie bytes DO transit EC2. Dedupes by `ExternalImageId` keeping best similarity | `POST /api/public/gallery/{slug}/face-search` (called with `max_faces=200`) |
| — | `delete_faces(CollectionId, FaceIds)` | `DELETE …/gallery/photos/{photo_id}` |
| `healthcheck()` | `head_bucket` + `list_collections(MaxResults=1)` | `GET /api/admin/gallery/aws/health`, `face_ops` |

### Collections
- **One per invitation profile**, id = `maja_wedding_{re.sub(r"[^a-zA-Z0-9_.\-]","_", profile_id)}` (`_profile_collection_id`). Stored as `profiles.gallery_config.aws_collection_id`
- `AWS_ARCHITECTURE.md` §11 documents `event-{id}` — **does not match the code**
- `ExternalImageId = photo_id` (uuid4) → the match→photo join key
- Threshold: `gallery_config.confidence_threshold` (default 90.0) overrides env `FACE_MATCH_CONFIDENCE_THRESHOLD` (default 90). Doc recommends ≥95

### Ingest pipeline (`_ingest_photo`, gallery_features.py:878)
`file.read()` → `photo_guard.sniff_photo` (bytes, rejects svg) → `asyncio.to_thread(_process_blocking)`: `make_thumbnail(2000px q92)` + `make_thumbnail(400px q85)` → 2× `upload_bytes` (tags `expire-at`/`wedding`/`method`) → `index_photo_faces` → row into `gallery_photos{id, profile_id, event_invitation_id, s3_key, thumb_s3_key, upload_method, uploaded_by, file_size, width, height, face_count, aws_face_ids[], indexed, created_at, expires_at}` → `$inc profiles.gallery_config.total_photos`. Optional `archive_fn` → `cloud_backup_service.store_studio_backup_bytes`.

### Search pipeline (`public_face_search`)
`enforce_gallery_access` → `ai_face_match_enabled` check → 20MB cap + `is_valid_image` → `asyncio.to_thread`: `make_thumbnail(800px q88)` → S3 PUT selfie (tag `expire-at` = +24h) → `search_faces_by_image` → `face_search_sessions{id, profile_id, guest_ip, selfie_s3_key, matched_photo_ids[], similarity_map{}, created_at, expires_at(+24h)}` → `$inc gallery_privacy.stats.{ai_uploads, matched_results}` → returns `{session_id, match_count, photos[{id, thumb_url, original_url, similarity}]}`.

### MISSING for a production Rekognition pipeline
- **No job/queue/worker for indexing.** Inline, in-request, thread-pool of 4. No retry, no backlog table, no per-photo `index_error` writer (`face_ops` reads `p.index_error` — **nothing ever sets it**)
- **`POST /api/admin/face-ops/reindex/{profile_id}` is a STUB** — sets `gallery_photos.needs_reindex = True`; **no consumer of that flag exists anywhere in the repo**. Returns `{queued: n}` which is a lie
- **No selfie-hash cache.** `AWS_ARCHITECTURE.md` §11 specifies Redis `fm:{event}:{sha256}` + 24h result cache and `ai-results/{session_id}.json` — neither implemented
- **No signed cookies** for whole-gallery access (§12 of the doc; explicitly listed as not built). 5,000 photos = 5,000 signed URLs today
- **`face_consent` is write-only.** `POST /api/public/gallery/{slug}/face-consent` inserts into `db.face_consent` (rate-limited 60/h/IP, 404 on unknown slug). **`public_face_search` never checks it.** No withdrawal endpoint, no TTL, no deletion-on-event-close beyond whole-collection drop. DPDP requirement documented in AWS_ARCHITECTURE.md §11 is not met
- **No frontend caller for `/face-search`.** `frontend/src/components/luxury/FindMyPhotosModal.jsx` posts to `/api/public/gallery/{slug}/photo-request` — the **manual** flow (selfie + email + WhatsApp → `photo_requests` collection, studio fulfils by hand). The entire Rekognition path is backend-complete and UI-unreachable
- `fulfillment_service.py` `/api/fulfillment/{code}/face-match/selfie` + `/api/admin/fulfillment/{code}/face-match` = **metadata plumbing only**, module docstring states "AI face match is a future step". Collections `face_match_records`, `face_match_rate_limits`
- `face_ops.compute_face_ops` "collections" count = distinct `profile_id` among photos with `face_count>0` — **not** actual Rekognition collections. Loads all of `gallery_photos`/`face_search_sessions`/`photo_requests` with `to_list(200000)` — O(all rows) per dashboard hit
- No bounding boxes persisted (`index_faces` returns them; discarded)
- Frontend admin: `frontend/src/pages/SuperAdminFaceOps.jsx`

---

## 11. ROUTE INVENTORY (from API_SURFACE.md + source)

**Uploads / media**
```
POST   /api/uploads/presign                          require_admin   storage_upload.py
POST   /api/uploads/commit                           require_admin   storage_upload.py
GET    /api/media?k&e&s                               HMAC token      storage_serve.py
GET    /api/uploads/{subpath:path}                    —               storage_serve.py   (mounted server.py:260)
GET    /uploads/{subpath:path}                        —               storage_serve.py
GET    /api/uploads/weddings/{wid}/{folder}/{file}    —               live_gallery_features.py  ← DEAD (shadowed)
```

**Wedding AI gallery (`gallery_features.py`, prefix `/api`)**
```
GET    /api/admin/gallery/aws/health                          get_current_admin
POST   /api/admin/profiles/{id}/gallery/enable                get_current_admin
PATCH  /api/admin/profiles/{id}/gallery/upload-methods        get_current_admin
POST   /api/admin/profiles/{id}/gallery/regenerate-token      get_current_admin
GET    /api/admin/profiles/{id}/gallery/credentials           get_current_admin
GET    /api/admin/profiles/{id}/gallery/stats                 get_current_admin
GET    /api/admin/profiles/{id}/gallery/photos                get_current_admin
GET    /api/admin/profiles/{id}/gallery/download-all          get_current_admin
DELETE /api/admin/profiles/{id}/gallery/photos/{photo_id}     get_current_admin
POST   /api/admin/profiles/{id}/gallery/bulk-upload           get_current_admin
POST   /api/live-upload/{profile_id}?token=                   live JWT
GET    /api/live-upload/{profile_id}/status?token=            live JWT
GET    /api/public/gallery/{slug}/info                        —
POST   /api/public/gallery/{slug}/face-search                 privacy gate
POST   /api/public/gallery/{slug}/photo-request               privacy gate
GET    /api/public/gallery/{slug}/photos?session_id=          privacy gate   ← DEAD (shadowed)
GET    /api/public/gallery/{slug}/download-zip?session_id=    privacy gate
GET    /api/admin/photo-requests                              get_current_admin
POST   /api/admin/photo-requests/{req_id}/status              get_current_admin
GET    /api/admin/photo-requests/all                          super_admin
```

**Privacy / consent / face-ops / QR**
```
GET    /api/public/gallery/{slug}/privacy                     —
POST   /api/public/gallery/{slug}/unlock                      —
GET/PUT /api/admin/profiles/{id}/gallery/privacy              get_current_admin
POST   /api/admin/profiles/{id}/gallery/privacy/reset-code    get_current_admin
POST   /api/admin/profiles/{id}/gallery/privacy/logout-all    get_current_admin
GET    /api/admin/profiles/{id}/gallery/privacy/analytics     get_current_admin
POST   /api/public/gallery/{slug}/face-consent                — (rate-limited)
GET    /api/admin/face-ops/overview                           require_admin
POST   /api/admin/face-ops/reindex/{profile_id}               require_admin   ← STUB
POST   /api/public/qr-scan/{slug}                             — (rate-limited)
GET    /api/admin/qr-analytics                                require_admin
GET    /api/invite/{slug}/qr                                  —
GET    /api/profiles/{slug_url}/qr-code                       —
GET    /api/events/{event_id}/qr-code                         —
```

**Live gallery (3 modules)**
```
WS     /api/ws/gallery/{wedding_id}                           —               live_gallery_features
POST   /api/invite/{slug}/gallery/guest-upload                — (rate-limited) live_gallery_features
GET    /api/public/gallery/{slug}/photos                      —               live_gallery_features  ← WINS
POST   /api/admin/profiles/{id}/live-gallery/upload           require_admin   live_gallery_features
GET    /api/admin/profiles/{id}/live-gallery/photos           require_admin   live_gallery_features
DELETE /api/admin/profiles/{id}/live-gallery/{photo_id}       require_admin   live_gallery_features
POST   /api/users/profiles/{id}/live-gallery/upload           user JWT        live_gallery_features
GET    /api/users/profiles/{id}/live-gallery/photos           user JWT        live_gallery_features
DELETE /api/users/profiles/{id}/live-gallery/{photo_id}       user JWT        live_gallery_features
GET/PUT /api/admin/profiles/{id}/live-gallery/settings        require_admin   premium_features
POST   /api/admin/profiles/{id}/live-gallery/uploader-token[/revoke]  require_admin  premium_features
POST   /api/live-gallery/desktop-upload                       X-Uploader-Token premium_features
POST   /api/invite/{slug}/live-gallery/guest-upload           plan gate       premium_features
GET    /api/invite/{slug}/live-gallery                        —               premium_features
POST   /api/invite/{slug}/live-gallery/favorite               —               premium_features
PUT    /api/admin/live-gallery/{photo_id}/moderate            require_admin   premium_features
DELETE /api/admin/live-gallery/{photo_id}                     require_admin   premium_features
```

**Event engine media (module-gated 404 unless `ganesh_module_enabled`)**
```
POST   /api/events/{event_id}/gallery/upload                  get_current_buyer + rbac.P_GALLERY_UPLOAD
DELETE /api/events/{event_id}/gallery/{media_id}              get_current_buyer + rbac.P_GALLERY_DELETE
GET    /api/events/{event_id}/gallery-usage                   get_current_buyer + rbac.P_EVENT_VIEW
GET    /api/events/{event_id}/days/{festival_day}/photo-status get_current_buyer
```

---

## 12. COLLECTIONS

`gallery_photos` · `face_search_sessions` · `photo_requests` · `face_consent` · `face_match_records` · `face_match_rate_limits` · `live_gallery_photos` · `live_photos` · `uploader_tokens` · `qr_scan_counts` · `gallery` (event engine media) · `storage_files` · `storage_accounts` · `storage_folders` · `upload_logs` · `photographer_storage` · `event_storage` · `storage_usage_analytics` · `storage_event_deletions` · `storage_health_log` · `studio_storage_plans` · `studio_storage_subscriptions` · `studio_storage_files` · `backup_folders` · `backup_files` · `backup_events` · `app_settings` (keys: `storage_pool_enabled`, `event_media_config`, storage-jobs state) · `profiles.gallery_config` / `profiles.gallery_privacy` / `profiles.live_gallery_settings` sub-docs.

DB is **Postgres JSONB via `pg_adapter.py`** with a Mongo-shaped API (`find_one`, `$inc`, `$set`). Mongo removed.

---

## 13. BROKEN / STUBBED / DOCUMENTED-BUT-NOT-IMPLEMENTED

| # | Finding | Severity |
|---|---|---|
| 1 | **`GET /api/public/gallery/{slug}/photos` registered twice.** `live_gallery_features` version mounted server.py:15193; `gallery_features` version at ~15585. First wins → the **session-scoped, privacy-gated** face-search result endpoint is unreachable, and the winning route returns **every** live-gallery photo for a slug with **no privacy gate and no auth** | BROKEN + privacy |
| 2 | `GET /api/uploads/weddings/{wid}/{folder}/{file}` in `live_gallery_features` is shadowed by `storage_serve`'s `/api/uploads/{subpath:path}` (mounted line 260) | dead code |
| 3 | `storage_upload.commit` allowlist contains bare `"events/"` → any admin can commit another studio's event object | security |
| 4 | `orchestrator._file_and_account` KeyErrors on `drive_account_id` for presign-committed rows; swallowed, falls back to `aws_service.generate_signed_url` | BROKEN (latent) |
| 5 | `face_ops` reindex writes `needs_reindex` — **no consumer exists** | STUB |
| 6 | `face_consent` recorded but never enforced by `face-search`; no withdrawal endpoint despite docstring | DOC-NOT-IMPL |
| 7 | No frontend caller for `/face-search`; shipped UI uses the manual `/photo-request` flow | feature dark |
| 8 | Selfie-hash Redis cache + `ai-results/{session_id}.json` (AWS_ARCH §11) | NOT BUILT |
| 9 | CloudFront **signed cookies** for galleries (AWS_ARCH §12) | NOT BUILT |
| 10 | CloudFront key pair unset → silent fallback to S3 presigned URLs (bypasses CDN). Flagged "still open" in MULTI_DRIVE §Phase-10 | config landmine |
| 11 | Collection id `maja_wedding_{profile_id}` ≠ documented `event-{id}`; key prefix `weddings/…` ≠ documented `events/…` → **lifecycle rules written from the doc won't match live data** | DOC drift |
| 12 | 9 legacy upload endpoints still `data = await file.read()` (whole file in app RAM). Presign path exists but has **zero** frontend consumers | perf, explicitly open |
| 13 | ZIP endpoints stream every original through EC2 via `s3().get_object().read()` | perf, contradicts doctrine |
| 14 | `event_media_service` writes raw unsigned CloudFront URLs into DB rows, bypassing `/api/media` | security/doctrine |
| 15 | `event_media_service.scan_clean()` returns `True` unconditionally (documented pluggable hook); `VIDEO_TRANSCODER = None` → videos stay `transcode_status:"pending"` forever | STUB (documented) |
| 16 | `gallery_privacy` brute-force lockout is per-process in-memory → ineffective with >1 worker | security |
| 17 | Live-gallery WebSocket manager is in-process → broadcasts lost with >1 worker | correctness at scale |
| 18 | `storage_pool_jobs.start_jobs` not leader-gated (unlike APScheduler) → duplicate job runs per worker | correctness |
| 19 | Orchestrator still defaults `kind="gdrive"`; S3 only becomes primary by running `scripts/use_s3_storage.py` | config landmine |
| 20 | `drive_archive` worker + `live_gallery_features`'s `enqueue_archive` call still active after the Drive retirement decision | dead weight |
| 21 | Two independent QR-scan counters (`qr_scan_counts` vs `gallery_privacy.stats.qr_scans`), never reconciled | data quality |
| 22 | QR payload = public slug URL, no token, no rotation, no signature | design gap |
| 23 | `cloud_backup_service.store_studio_backup_bytes` writes to **local disk** (`/app/uploads/studio-backup/…`), not S3 — the "durable backup" is on the VM | BROKEN promise |
| 24 | `qr_analytics` + `face_ops` load entire collections (`to_list(200000)`) per request | perf |
| 25 | `orchestrator.download_file` docstring still describes the retired Drive-proxy serving path | stale doc |