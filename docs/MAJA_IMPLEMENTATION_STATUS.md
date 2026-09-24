# MAJA v2 — Implementation Status

**Build date:** 2026-08-10 · **Method:** Fable orchestrator + Sonnet agent fleet (25 fleet agents + 2 residual fixers), fix→verify lane pipeline, machine gates.
**Baseline:** fresh-history repo seeded from the legacy `logic` snapshot (commit `4049624` content). Legacy git history NOT imported (it contains unrotated secrets — see Owner Actions).

---

## Verified results (machine gates, all run 2026-08-10)

| Gate | Result |
|---|---|
| `py_compile` sweep | **273/273 backend files PASS** |
| Backend test suite (module-script runner, live server + local PG) | **95/100 PASS** — 5 failures are dead Mongo-era relics needing `pymongo`/`motor`/`pytest_asyncio` (test the stack removed in the Postgres migration; not installable per no-new-deps rule): `test_batch_a_race_safety`, `test_credit_system`, `test_iter2_meal_time_indexes`, `test_phase2_audit_fixes`, `test_phase3_studio_watermark` |
| Storage sub-suite (after regression fix, below) | **12/12 PASS** |
| Boot smoke (uvicorn :8001, dev env) | health `{"status":"ok","db":true}` · unknown invite → 404 · 3 MB JSON → **413** (body cap live) · cookie + evil Origin POST → **403** (CSRF middleware live) · same-origin POST → 200 · `face-results` route mounted · clean startup log |
| Worker (`python worker.py`) | starts, connects PG, polls `maja:jobs:face`, graceful without Redis, no crash |
| Frontend production build (`yarn build`, no sourcemaps) | **PASS** (~70 s) |
| Rendered build check (:8126) | `pixora.css` loaded (`--px-primary` present), 45 `px-*` elements on landing, correct title/content |

## Completed this pass

**Phase 0 — safety net**
- `SEED_TEST_ACCOUNTS` default `0` + unconditional production refusal; `is_test_buyer` paid-goods bypass hard-disabled in production (`seed_test_accounts.py`).
- `_production_readiness_warnings` → **refuses to boot** in production on critical misconfig (unset JWT secret, wildcard CORS, missing webhook secret, `DEV_MODE_OTP=1`); escape hatch `ALLOW_INSECURE_PROD=1`. Fixed the `DEV_MODE_OTP` default mismatch (`server.py`).

**Phase 1 — money/correctness**
- Store payment verify binds the signature to the **stored** `razorpay_order_id` + order-mismatch 400 (`store_features.py`); same binding + ownership check on legacy `/api/payments/verify` (`server.py`).
- **Store webhook added** (`POST /api/payments/store-webhook`): HMAC + `compare_digest`, PLACEHOLDER-secret fail-safe (stores, never credits), event dedupe, idempotent conditional mark-paid, `razorpay_events` audit. Paid-then-closed-tab orders can no longer strand.
- Price resolver unified (single `design_price_inr`; the ₹0-quote divergence removed). `odia`/`urdu` removed from the sold catalog (unrenderable SKUs).
- **Paid AI translations now render**: `translations` added to `Profile`/`ProfileCreate`/`ProfileUpdate`/`ProfileResponse`/`InvitationPublicView` + all 3 public-view builders.
- Portfolio/subscription expiry enforced (`_sub_is_current`, 3-day grace, legacy rows grandfathered) in `portfolio_service` + directory gate; directory `sort=newest` premium-first fix; white-label dict/str dep bug fixed (branding now applies publicly); **portfolio design tier gate enforced server-side**.
- Live-wall moderation reads both photo collections; blessings `wishes_count` field bug fixed.

**Phase 2 — cloud media**
- `storage_upload.commit` bare `events/` prefix closed (ownership via `_owns_event`); **presign** for `qr_photos`/`selfies` now ownership-checked too.
- Orchestrator: S3-resident rows no longer KeyError on `/api/media` (proper S3 short-circuit); Drive archive worker gated `DRIVE_ARCHIVE_ENABLED=0` default.
- **S3 cutover semantics**: `current_account()` defaults to `STORAGE_DEFAULT_PROVIDER` (s3) with gdrive fallback for pre-cutover pools; pool hooks mirror to the current account's own kind. (`add_account`/`upload_file` keep the legacy gdrive defaults — the pool tests pin that contract; a fleet over-flip here broke `test_storage_migrate` and was fixed + re-verified 12/12.)
- ZIP downloads → **signed-URL manifests** (admin + public); both frontend consumers updated (guest modal + `GalleryManager` sequential downloader).

**Phase 3 — Face Match production pipeline**
- Redis queue (`maja:jobs:face`) + **`backend/worker.py`** consumer: `FACE_INDEX` / `FACE_SEARCH` / `REINDEX`, exponential retry (max 5), `index_error` written on failure (FaceOps reads it), graceful SIGTERM. **Inline fallback preserved when Redis is absent** — dev boxes and a worker outage degrade to the previous synchronous behavior, nothing breaks.
- `public_face_search`: selfie-hash Redis cache (24 h), queued sessions, **consent enforced** (428 `CONSENT_REQUIRED`; withdrawal endpoint added).
- Results endpoint renamed to `GET /api/public/gallery/{slug}/face-results` — this also removes the route shadowing that made the session endpoint unreachable AND exposed a privacy hole.
- FaceOps reindex is real (enqueues; honest `queued:false` note when the queue is down).
- **UI wired to the real pipeline** (`FindMyPhotosModal`): consent step → selfie upload → poll → matched grid with similarity, explicit no-match state, failure state, manual photo-request fallback kept.

**Phase 4 — security**
- `OriginCheckMiddleware` (CSRF for cookie-authed writes, webhook exempt) + `BodySizeLimitMiddleware` (2 MB default, multipart exempt) — wired and smoke-verified.
- `user_session_token` → `SameSite=lax`, `secure` in prod only. JWT blacklist fail-closed on super-admin; `jwt_blacklist` table with promoted `jti` in `schema.sql`.
- **MFA enforced at admin login** (TOTP + backup codes; `MFA_REQUIRED`/`MFA_INVALID` codes) + login lockout with exponential backoff (`Retry-After`, exposed via CORS). Frontend login handles both.
- WebSocket `/api/ws/gallery/{id}` authenticates the gallery device token when privacy is on (4401 close); frontend passes the stored token + stops reconnecting on 4401.
- Bot/abuse exemptions for the new webhook; one hardened Caddyfile (HSTS, XFO, nosniff, Permissions-Policy, `*.map`→404, sourcemaps off).

**Phase 5 — M12 Pixora reskin (guest-critical surfaces)**
- `src/styles/pixora.css` + `src/components/px/` (buttons/cards/glass/aurora/modal/inputs, exact M12 tokens `#6D28D9/#8B5CF6/#A855F7`, radius 14/20/16/999, purple shadow scale, reduced-motion safe).
- Reskinned: guest invitation chrome (theme layer untouched), Live Photo Wall + lock screen, Find-My-Photos (new flow), sign-in/signup/reset (+MFA step), QR management/display, cart/checkout/order-details. All logic, testids, `order.free` branch, server-quote invariants preserved (verify agents diff-checked each).
- `useGalleryAccess` fail-open default fixed → locked-leaning state on privacy fetch failure.

**Phase 6 — deploy**
- `deploy/docker-compose.yml` (caddy/core/worker/postgres/redis — no gateway, no stubs; `${VAR:?}` guards, Redis AOF for the queue), `deploy/Caddyfile`, `deploy/.env.example` (complete var set, no wildcard CORS), `deploy/backup.sh` (encrypted → S3) + `deploy/restore-test.sh`, `docs/DEPLOYMENT.md` (GCP + AWS runbook, IAM policy, CF key pair, rotation checklist, load-test ladder).

## frontend-v2 — the REAL M12 UI (built after an owner pivot away from reskin-in-place)

`frontend-v2/` is a new Vite + React SPA whose screens are ported **1:1 from the 106 `.dc.html` M12 prototypes** ("M 12 New ui") and wired to the legacy backend through a central typed API client. It is now the PRIMARY UI in the deploy stack. The legacy CRA app (`frontend/`) stays as a working fallback for not-yet-ported surfaces; no further work goes into it.

**P0 wave shipped + verified (23 screens):** landing, pricing, features, how-it-works, FAQ, contact · sign-in/signup/reset (dual persona, MFA step, lockout countdown, `/reset-password` email alias) · guest invitation + per-ceremony invitation (wired to the purpose-built `/api/invite/{slug}/{event_type}` endpoint incl. per-ceremony design/deity/enable/expiry, legacy fallback) + save-the-date · live photo wall + wedding live gallery (WS + device token + 4401 stop, guest upload, favorites, QR scan ping) + full Face-Match flow (consent 428 → search → poll face-results → matched grid/no-match/failed + manual fallback + manifest downloads) · studio QR codes + couple access portal (isolated client identity) + guest arrival check-in · cart/checkout/order-details (server-quote verbatim, `order.free` bypass, Razorpay modal, edit-state) · user dashboard + wedding edit · studio dashboard/gallery (presign→S3→commit upload w/ multipart fallback)/wedding detail · 5 shared navs at full DC fidelity (30/11/9/51/15 items verified) + ComingSoon target for unported routes.

**Foundation:** typed API client honoring all 3 legacy identities (`admin_token` Bearer + single-flight refresh w/ hadBearer guard; couple httpOnly cookie `withCredentials`; isolated `client_token`), 15s auth watchdog, 401/403-only-clears, Safari-private-mode-safe storage; `mediaUrl`/`designCode` ported verbatim; gallery access hook; global design system (all M12 tokens, aurora/glass/petal, mj* keyframes, `[data-reveal]` scroll-reveal convention, reduced-motion kill-switch). Supabase auth bridge intentionally dropped (plain FastAPI login).

**Gates:** `vite build` clean (23 lazy chunks); dev-server smoke against the live backend — landing/pricing/auth render with real API data (`/api/store/packages → 200` through the proxy), 74 animated elements on landing; 8 screen-family lanes each adversarially verified against their `.dc.html` sources (2 FAILs found and fixed: truncated navs, ceremony endpoint bypass).

**Remaining waves (not yet ported — legacy app still covers them):** full studio suite (~25 screens: calendar, earnings, insights, staff, storage, cloud backup, white label, plans, client hub…), super-admin consoles (~15), Pixora surfaces (~15), wedding management tools (greetings, shagun manager, gift registry admin, WhatsApp manager, theme settings, post-wedding…), portfolio editor/directory/profile. Port them wave-by-wave with the same fleet pattern; every unported nav item routes to a styled ComingSoon page.

## Deferred (explicit, with reasons)
- **Guest direct-to-S3 presign** (P2.4): guest wall uploads keep the validated server path (25 MB, rate-limited); selfies must transit the server anyway (`SearchFacesByImage` uses bytes). Revisit if VM bandwidth becomes the bottleneck.
- Signed **cookies** for whole-gallery CDN access (signed URLs per photo for now).
- `BodySizeLimitMiddleware` is a Content-Length check — a chunked-transfer client bypasses it (uvicorn's own limits still apply).
- Pre-existing `from __future__ import annotations` in `photographer_directory.py`/`cache_backend.py`/`face_ops.py` — working in production, left untouched.
- Legacy in-RAM upload endpoints still exist (deprecated; presign path is preferred).
- IDOR sweep automation, CSP enforce-mode flip, WAF, Pixora/admin/portfolio reskin (P1/P2 per plan).
- `Live Photo Wall` reskin follows the light Pixora system; the M12 prototype page was night-themed — flag for owner taste check.

## Known risks
- One-VM deployment (accepted); backups MUST be proven via `restore-test.sh` before the event.
- Rekognition/CloudFront behavior verified at code level only — no live AWS account was available in this environment; first deploy must run the DEPLOYMENT.md smoke list against real AWS.
- The 5 Mongo-relic tests should be deleted or ported (housekeeping).

## Owner actions required before go-live (see docs/DEPLOYMENT.md for consoles)
1. **Rotate all six secret sets** (Razorpay key+webhook, Supabase service_role+anon, AWS key pair, Gemini, Postgres password, CloudFront key pair) — the OLD repo's git history is compromised; this repo is clean but the credentials themselves are not.
2. Create GCP e2-standard-4 + DNS; AWS S3 bucket (private + Block Public Access), CloudFront with OAC + key pair, Rekognition in `ap-south-1`; least-priv IAM per DEPLOYMENT.md.
3. Fill `deploy/.env` (template complete), `yarn build` with `GENERATE_SOURCEMAP=false`, `docker compose up -d --build`, run the smoke list, run `restore-test.sh` once.
4. Razorpay dashboard: point the store webhook at `https://<domain>/api/payments/store-webhook` with the rotated webhook secret.

## Migration commands
- Fresh DB: schema auto-applies from `microservices/db/schema.sql` on first PG init. Existing volume: apply the `jwt_blacklist` table stanza manually via psql.
- S3 cutover on a legacy pool: `python backend/scripts/use_s3_storage.py` (registers the S3 account; `current_account` then routes mirrors to it).

## Rollback
- Previous image tag kept per DEPLOYMENT.md; DB is never destroyed on deploy; every fleet change is a plain git revert on this repo (commits are per-phase).
