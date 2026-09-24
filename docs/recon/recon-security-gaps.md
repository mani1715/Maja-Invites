# SECURITY + OPEN GAPS — legacy MAJA (wedding-36) recon

Repo: `.../scratchpad/legacy/logic`. All paths below are relative to that root.

## 0. Source docs — dates + trust level

| Doc | Date | Trust |
|---|---|---|
| `SECURITY_AND_GAPS.md` | 2026-06-13 | STALE. C1–C5/H1/H3/M1 fixed; H2/H5/M2/T1–T3 language obsolete (Mongo→Postgres migration happened after) |
| `SECURITY-HARDENING-STATUS.md` | 2026-07-30 | PARTIALLY FALSE for the monolith deploy — see §7 (Caddy split) |
| `SECURITY-PENTEST-2026-07-30.md` | 2026-07-30 | Accurate; F4 fixed in-pass; F1/F2/F3/F5/F6 status changed since |
| `SECURITY_AUDIT.md` | 2026-08-04 | Most complete, but 4 claims now stale — see §9 |
| `SECURITY_ROTATION.md` / `SECURITY_RUNBOOK.md` | 2026-07-25 / 2026-08-05 | Owner-action checklists, 5 of 6 boxes still UNCHECKED |
| `API_SURFACE.md` | 2026-08-06 | Generated; 1182 routes; auth column is INFERRED and over-reports PUBLIC (§4) |

Verification method below = read of `backend/*.py` on disk, not doc trust.

---

## 1. OPEN findings — MUST NOT carry into V2

### 🔴 CRITICAL

**S1. Live secrets in git history — UNRESOLVED, unrotated.**
`backend/.env` + `frontend/.env` committed historically. `SECURITY_ROTATION.md` §Status: only `JWT_SECRET_KEY` ticked. Razorpay key+webhook, Supabase `service_role`, AWS access key pair, Gemini, history-scrub — ALL UNCHECKED as of 2026-08-05. Source maps were also publicly served for an unknown window (`SECURITY-HARDENING-STATUS.md` P1), so anything baked into the FE build leaked too.
Repo owner named in runbook: `github.com/mani1715/wedding-36`.
CI gitleaks runs `--no-git --source .` → working tree ONLY; history leak is deliberately NOT gated (`.github/workflows/ci.yml`, secret-scan job comment).

**S2. Test-account seed defaults ON in production, with a paid-goods bypass.** NOT in any security doc.
`backend/seed_test_accounts.py:45` → `os.environ.get("SEED_TEST_ACCOUNTS", "1")` — enabled unless explicitly `0`. Wired at `server.py:15406` `@app.on_event("startup")`.
Creates `test.user@maja.test` / `test.studio@maja.test`, shared password `MajaTest@123` (hardcoded default, `seed_test_accounts.py:31`).
`store_features.py:688-711` — `is_test_buyer(db, current)` → order written `"status": "paid"` with **no Razorpay charge**. Anyone knowing the public default password gets free paid designs + a comped studio account. File's own docstring says "Remove before public launch."

**S3. No DB backups / PITR / tested restore.** `ops/backup_db.sh` + `ops/restore_db.sh` exist as scripts only; no cron, no scheduler, no restore evidence. `SECURITY_AUDIT.md` §14 rates this top risk.

**S4. No monitoring / alerting / IR.** `SENTRY_DSN` wiring present (`server.py:216-223`, guarded no-op without DSN) but DSN is not in `backend/.env.example` as a required var and nothing polls `/api/health`. No APM, no uptime monitor, no on-call.

### 🟠 HIGH

**S5. Monolith deploy serves the UNHARDENED Caddyfile.**
`redeploy.sh:49` → `docker compose -f docker-compose.yml -f docker-compose.deploy.yml`.
`docker-compose.deploy.yml:53` mounts `./frontend/Caddyfile`.
`frontend/Caddyfile` (33 lines) has **zero** security headers: no HSTS, no CSP-Report-Only, no X-Frame-Options, no Permissions-Policy, no COOP, no `*.map` → 404, no `/robots.txt` + `/sitemap.xml` routing, no junk-path 404.
All of that lives ONLY in `microservices/Caddyfile` (+ `GENERATE_SOURCEMAP: "false"` only in `microservices/docker-compose.deploy.yml:68`).
⇒ Every "FIXED" row in `SECURITY-HARDENING-STATUS.md` P1/P2/P6 is false for the monolith path. Backend `SecurityHeadersMiddleware` covers `/api/*` responses only — the HTML shell gets nothing.

**S6. `admin_token` still in `localStorage`.** `frontend/src/context/AuthContext.js:52,126,268,350,365`. P5.5 migration plan written (`SECURITY-HARDENING-STATUS.md`), never executed. Blast radius reduced (access TTL now 60 min, §5) but not closed.

**S7. Normal-user session cookie is `SameSite=none` with NO CSRF token.**
`backend/user_auth.py:127-134` → `httponly=True, secure=True, samesite="none"`, path `/`.
Only CSRF machinery in the codebase is the Google-OAuth `state` param (`user_auth.py:274,326`). No double-submit token, no Origin check middleware. Cross-site POSTs carry the cookie. `SECURITY_AUDIT.md` §4 claims "✅ CSRF (`user_auth.py`)" — **that claim is wrong**; it is OAuth state only.

**S8. No global write-path rate limit; no global body-size cap.**
Middleware stack is exactly 4 (`server.py:16315-16337`): SecurityHeaders, BotDetection, AbusePrevention, CORS. No body-size middleware anywhere (`grep content-length|MAX_BODY|body_size` → nil). Rate limiting is opt-in per endpoint (§6) — ~10 call sites out of 1182 routes.

**S9. `WEBSOCKET /api/ws/gallery/{wedding_id}` unauthenticated.**
`live_gallery_features.py:180-188` — connect with any `wedding_id`, receive every live-gallery push for that wedding. No token, no passcode check.

**S10. No account lockout with backoff.** Login limits are fixed-window counters (`login:id:{identifier}` 10/900s, `server.py:1042`; `ulogin:id:` same, `user_auth.py:244`) — better than IP-only, but no exponential backoff, no temporary lock, no CAPTCHA escalation. `/api/captcha/generate` + `/api/captcha/verify` + `/api/check-captcha-required` routes exist but are not wired into the login limiter.

**S11. S3 / IAM / encryption-at-rest / WAF posture UNVERIFIED.** Console-only; `SECURITY_RUNBOOK.md` §4 unticked. Block-Public-Access, SSE, CloudFront OAC, least-priv IAM key, Cloudflare/WAF — all unconfirmed.

**S12. Data-retention policy + automated enforcement missing.** Retention code exists only for storage-pool/backup features (`storage_pool_jobs.py`, `cloud_backup_service.py`) — not for guest PII, RSVP data, or face vectors.

### 🟡 MEDIUM

**S13. Prod-readiness check only WARNS, never blocks.** `server.py:15962-15986`, gated on `ENVIRONMENT in (production,prod)`. Flags: unset `JWT_SECRET_KEY`, wildcard `CORS_ORIGINS`, unset `RAZORPAY_WEBHOOK_SECRET`, `DEV_MODE_OTP=1`, unset `REDIS_URL`. Boot proceeds regardless.

**S14. Prod-readiness `DEV_MODE_OTP` check has a default-mismatch bug.** `server.py:15975` reads default `"1"`; the actual flag at `server.py:1452` defaults `"0"`. Unset env ⇒ false warning every prod boot (alarm fatigue, not a hole).

**S15. `CORS_ORIGINS="*"` is the shipped default in `backend/.env.example:15`.** Code degrades safely (credentials disabled on wildcard, §5) but the example invites a wildcard prod deploy.

**S16. JWT blacklist fails OPEN.** `auth.py:187-199` — `_is_jwt_blacklisted` returns `False` on any lookup error or missing db. Revoked token accepted during a DB hiccup.

**S17. Role frozen in token.** Role claim is read from the JWT, not re-checked against DB on privileged actions. TTL now 60 min so the window is 1 h, not 30 d.

**S18. CSP is Report-Only and only on the microservices stack.** `microservices/Caddyfile:29`. Backend `security_middleware.py:47` sets an *enforcing* CSP on `/api/*` only, with `script-src 'unsafe-inline' 'unsafe-eval'`. `POST /api/csp-report` sink exists (`server.py`). Never flipped to enforce.

**S19. Decompression-bomb guard relies on Pillow defaults.** No explicit `Image.MAX_IMAGE_PIXELS`, no `DecompressionBombError` catch (per `SECURITY_AUDIT.md` §5; not contradicted on disk).

**S20. No AV/malware scan on non-image upload paths.**

**S21. Dependency CVE gate is advisory only.** `.github/workflows/ci.yml` dependency-audit job has `continue-on-error: true` and `pip-audit ... || true`. No `yarn audit` at all. No Trivy/image scan. Dependabot configured (`.github/dependabot.yml`, weekly pip+npm+actions).

**S22. `mock_token` payment path.** `subscription_service.py:303,613,708,730` + `link_reactivation.py:102,163` — mock gateway mints a `mock_token` the frontend echoes to `/verify`. Guarded by "razorpay keys not ready", but it is a money-path branch selected by server config; verify it is unreachable in V2 prod.

**S23. `AWS_CLOUDFRONT_PRIVATE_KEY_PATH=/app/backend/aws_cloudfront_private_key.pem`** — signing key on container FS by path (`backend/.env.example:66`). Confirm never committed; move to secret manager.

**S24. Bot blocklist blocks generic HTTP clients by UA** (`security_middleware.py:101-117`) — breaks legit S2S/monitoring; trivially spoofable, so defense-in-depth only, not a control.

---

## 2. RESOLVED — must not regress in V2

| ID | Fix verified on disk |
|---|---|
| JWT default secret | `auth.py:35-48` — **refuses to boot** on the built-in default unless `ALLOW_INSECURE_JWT=1` |
| Access-token TTL | `auth.py:56` — 60 min (was 30 d), env-tunable `ACCESS_TOKEN_EXPIRE_MINUTES` |
| Refresh rotation | `auth_sessions.py` — hashed refresh tokens, `family_id`, **reuse detection revokes family**, HttpOnly+`secure=_IS_PROD`+`SameSite=lax` cookies (`:63,:77`) |
| Per-token revocation | `jti` on every token + `jwt_blacklist` TTL collection |
| CORS wildcard+creds | `server.py:16329-16337` — `allow_credentials = not _cors_allow_all`; default is explicit localhost origins, NOT `*` |
| Razorpay webhook free-credit | `monetization_features.py:474-490` — missing/PLACEHOLDER secret ⇒ stored for audit, **never credits**; verified path uses `hmac.compare_digest` |
| Timing-safe compares | `compare_digest` in `admin_security.py`, `delivery_tracking.py`, `event_payments.py`, `invoice_service.py`, `monetization_features.py`, `premium_features.py`, `server.py`, `storage_serve.py`, `studio_storage.py`, `subscription_service.py` |
| Unauth super-admin pricing write | now `require_super_admin` |
| Global exception handler | present; generic 500 + `error_id` |
| `pg_adapter` field-name injection | `_check_field` allowlist `^[A-Za-z0-9_.\-\[\]]+$` at both choke points (PENTEST F4) |
| Path traversal on uploads | `storage_serve.py:264-279` — `_safe_subpath` + `local.relative_to(uploads_root.resolve())` → 404 |
| Signed media | `storage_serve.py:283` `/api/media` verifies HMAC (`_verify_media`) **before** minting a CDN URL |
| Invoice IDOR | `invoice_service.py:175-180` — capability token + `compare_digest`, 404 (not 403) so ids can't be enumerated |
| DPDP | `account_data.py` export + delete-request, both `Depends(get_current_user)`; `face_consent.py` consent-first + rate-limited |
| Face isolation | per-profile Rekognition collections; `ai_face_match` flag **default OFF** (`feature_flags_service.py:27`) |
| Image safety | magic-byte + Pillow `verify()` + MIME allowlist + re-encode + `exif_transpose` (strips GPS) |
| XSS sinks | **zero** `dangerouslySetInnerHTML` in `frontend/src` (verified) |
| Cookie consent | `frontend/src/components/CookieConsent.jsx` + `POST /api/public/cookie-consent` (`consent_routes.py`, 30/h/IP) |
| CI gate | `.github/workflows/ci.yml` — backend test suite, gitleaks (tree), FE lint+build |
| Pre-commit | `.pre-commit-config.yaml` — gitleaks, detect-private-key, 2 MB file cap |
| `DEV_MODE_OTP` | defaults `0` (`server.py:1452`); with no provider `/auth/send-otp` returns 503 |
| Supabase bridge | `sync_supabase_user` verifies JWT server-side, role hardcoded ADMIN, body limited to name/phone/username |
| Client-token isolation | `event_client` token derives `profile_id` from token, never URL; admin deps reject `typ==event_client` |

---

## 3. Secret VARIABLE NAMES (names only — `backend/.env.example`)

`SUPABASE_DB_URL` · `DB_POOL_MIN` · `DB_POOL_MAX` · `CORS_ORIGINS` · `JWT_SECRET_KEY` · `ENVIRONMENT` · `REDIS_URL` · `DEV_MODE_OTP` · `GEO_LOOKUP_DISABLED` · `GEMINI_API_KEY` · `GEMINI_MODEL` · `RAZORPAY_KEY_ID` · `RAZORPAY_KEY_SECRET` · `RAZORPAY_WEBHOOK_SECRET` · `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_REGION` · `AWS_S3_BUCKET` · `AWS_CLOUDFRONT_DOMAIN` · `AWS_CLOUDFRONT_KEY_PAIR_ID` · `AWS_CLOUDFRONT_PRIVATE_KEY_PATH` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_OAUTH_REDIRECT_URI` · `GOOGLE_DRIVE_REDIRECT_URI` · `GOOGLE_DRIVE_SCOPE` · `PUBLIC_BASE_URL` · `FRONTEND_BASE_URL` · `WHAT3WORDS_API_KEY` · `EMAIL_PROVIDER` · `EMAIL_FROM` · `EMAIL_FROM_NAME` · `RESEND_API_KEY` · `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_TLS` · `FRONTEND_URL` · `INVOICE_SELLER_NAME` · `INVOICE_SELLER_GSTIN` · `INVOICE_SELLER_ADDRESS` · `INVOICE_SELLER_STATE` · `INVOICE_PREFIX` · `INVOICE_HSN_SAC` · `GST_RATE`

Root `.env.example`: `DOMAIN` · `ACME_EMAIL` · `REACT_APP_SUPABASE_URL` · `REACT_APP_SUPABASE_ANON_KEY`.

**Read by code but MISSING from `.env.example`** (silent-hole risk): `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALLOW_INSECURE_JWT`, `SENTRY_DSN`, `SEED_TEST_ACCOUNTS`, `TEST_ACCOUNT_PASSWORD`.

**Rotation status (`SECURITY_ROTATION.md` §Status):** ✅ `JWT_SECRET_KEY` only. ❌ Razorpay key secret + webhook secret · ❌ Supabase service_role + anon · ❌ AWS access key + secret · ❌ Gemini · ❌ history scrub + force-push. Also unlisted but implicated: Postgres password, CloudFront key pair.

---

## 4. The 263 "unguarded" routes — REVIEW STATUS: over-reported, sampled-verified

`API_SURFACE.md` guard table: `require_admin` 344 · `require_super_admin` 281 · **`PUBLIC` 263** · `get_current_admin` 208 · `get_current_buyer` 55 · `get_current_public_user` 18 · `current_admin_dep` 10 · `get_current_admin_with_role` 3.

The generator infers auth from the *literal* dependency name in the decorator. It misses (a) deps injected as router-factory params and (b) wrapper deps. Confirmed false positives:

| Module | "PUBLIC" count | Actual guard |
|---|---:|---|
| `super_admin_v2.py` | 20 | `Depends(_su)` → `Depends(require_super_admin)` (`:51`) |
| `photographer_clients.py` | 12 | `Depends(get_current_event_client)` (factory param, `:119`) |
| `studio_storage.py` | 5 | `Depends(current_super_admin_dep)` (`:367,376,387,402,893`) |
| `client_studio_service.py` | 5 | event-client dep (factory param) |
| `account_data.py` | 2 | `Depends(get_current_user)` (`:45,81`) |
| `event_money_service.py` | 8 | own `/event-money/login` token dep |

⇒ **≈50+ of the 263 are guarded.** Remaining ~210 split into: genuinely-public-by-design (invite/RSVP/OG/robots/sitemap/health/pricing catalogs/pixora feed/photographer directory) and capability-token-protected (invoice download, `/api/media`).

Unguarded routes by module: `server.py` 87 · `pixora_service.py` 26 · `super_admin_v2.py` 20* · `premium_features.py` 13 · `photographer_clients.py` 12* · `event_money_service.py` 8* · `gallery_features.py` 7 · `user_auth.py` 6 · `music_library.py` 6 · `live_gallery_features.py` 6 · `studio_storage.py` 5* · `pricing_public.py` 5 · `photographer_directory.py` 5 · `client_studio_service.py` 5* · rest ≤4. (*=false positive)

**Genuinely public + still worth a V2 decision:**
- `POST /api/templates/{template_id}/purchase` (server.py) — unauth purchase route
- `POST /api/translate`, `POST /api/ai/note-suggestions` (server.py) — unauth AI calls = billable-cost abuse, no rate limit found
- `PUT /api/rsvp/{rsvp_id}` (server.py) — unauth RSVP edit
- `POST /api/referrals/apply` (server.py)
- `WEBSOCKET /api/ws/gallery/{wedding_id}` (S9)
- `POST /api/invite/{slug}/gallery/guest-upload` + `POST /api/invite/{slug}/live-gallery/guest-upload` + `POST /api/live-upload/{profile_id}` + `POST /api/live-gallery/desktop-upload` — public write; only the first is rate-limited (§6)
- `GET /api/public/gallery/{slug}/download-zip` — bulk export, unauth
- `POST /api/public/gallery/{slug}/face-search` — biometric, unauth
- Shagun/donate money routes: `/api/invite/{slug}/shagun/razorpay/{order,verify}`, `/api/public/events/{slug}/donate{,/order}`, `/api/public/events/donate/verify` — public by design, signature-verified (§8)

**NO systematic IDOR sweep was ever run.** `SECURITY_AUDIT.md` §2 explicitly recommends one and it does not exist; `SECURITY-PENTEST` §limits confirms "no running-instance IDOR sweep across all ~40 routers."

---

## 5. CORS / cookie / CSRF — current config

**CORS** (`server.py:16323-16337`): origins from `CORS_ORIGINS` env, default `http://localhost:3100,http://localhost:3000`. `_cors_allow_all` when `*` → `allow_credentials=False` + `allow_origins=["*"]`. Explicit origins → `allow_credentials=True`. Warns in prod on wildcard. **Correct.** `.env.example` still ships `CORS_ORIGINS="*"` (S15).

**Cookies:**
| Cookie | Flags | File |
|---|---|---|
| refresh token | HttpOnly, `secure=_IS_PROD`, `SameSite=lax`, `max_age=REFRESH_TTL_DAYS*86400` | `auth_sessions.py:63` |
| device id | HttpOnly, `secure=_IS_PROD`, `SameSite=lax`, 365 d | `auth_sessions.py:77` |
| `user_session_token` | HttpOnly, `secure=True`, **`SameSite=none`**, path `/` | `user_auth.py:127-134` |
| `admin_token` | **not a cookie — `localStorage`** | `frontend/src/context/AuthContext.js` |

**CSRF: NONE.** Only `csrf`-named code is the OAuth `state` nonce (`user_auth.py:274,326`). With `SameSite=none` on the user session (S7), state-changing `/api/users/*` and any cookie-authed route are CSRF-reachable cross-site. `SECURITY_AUDIT.md`'s "✅ CSRF" is incorrect.

**Headers:** `security_middleware.py` `SecurityHeadersMiddleware` on `/api/*` — enforcing CSP (`script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`, `Permissions-Policy: geolocation=(),microphone=(),camera=()`, HSTS `max-age=31536000; includeSubDomains` (`:69`). **HTML shell gets none of this on the monolith deploy** (S5).

---

## 6. Rate limiting — current state

Implementation: `backend/cache_backend.py:49` `rate_limit_allow(key, limit, window_seconds)` — fixed-window; Redis `INCR`+`EXPIRE` when `REDIS_URL` set, else in-memory dict with opportunistic cleanup at >10 000 keys. **Fail-open** on any backend error (documented as intentional: guards abuse, not authz).
Client IP: `cache_backend.py:208-213` `client_ip()` — honours a single `X-Forwarded-For` hop, falls back to `request.client.host`. (H2's "wrong IP" is fixed *here*; `security_middleware.py:225,233,362` still uses raw `request.client.host` for bot logging + AbusePrevention.)

Applied at exactly these call sites:

| Key | Limit | File:line |
|---|---|---|
| `login:ip:` / `login:id:` | 15/900s, 10/900s | `server.py:1040,1042` |
| `forgot_pw_ip:` / `forgot_pw_email:` | 10/3600s, 3/3600s | `server.py:1491,1492` |
| `otp:send:ip:` / `otp:send:to:` | 12/3600s, 5/3600s | `server.py:1571,1573` |
| `ulogin:ip:` / `ulogin:id:` | 15/900s, 10/900s | `user_auth.py:242,244` |
| `guestup:ip:` / `guestup:slug:` | 40/600s, 400/600s | `live_gallery_features.py:323,325` |
| `consent:` | 30/3600s | `consent_routes.py:53` |
| `face_consent:` | 60/3600s | `face_consent.py:44` |
| `enquiry:{ip}:{studio_id}` | 8/3600s | `portfolio_leads.py:118` |
| `review:` | 3/3600s | `photographer_directory.py:452` |
| `qrscan:{ip}:{slug}` | 5/3600s | `qr_analytics.py:123` |

**Not covered:** every other write route, `/api/translate`, `/api/ai/*`, `/api/public/gallery/{slug}/face-search`, `/api/public/gallery/{slug}/download-zip`, `/api/live-upload/{profile_id}`, `/api/live-gallery/desktop-upload`, the WebSocket. No edge/WAF layer confirmed.

`AbusePreventionMiddleware` (`security_middleware.py:233+`) still uses module-level `request_tracking` / `soft_blocks` dicts (per-process) — H2 partially open for that path.

---

## 7. Deploy-stack divergence (root cause of stale hardening claims)

Two stacks in one repo:
- **Monolith** — `docker-compose.yml` + `docker-compose.deploy.yml`, driven by `redeploy.sh`. Mounts `frontend/Caddyfile` (unhardened). No `GENERATE_SOURCEMAP` setting → source maps built and served.
- **Microservices** — `microservices/docker-compose.deploy.yml` + `microservices/Caddyfile`. Has HSTS 1 y, XFO DENY, nosniff, Permissions-Policy, COOP `same-origin-allow-popups`, CSP-Report-Only w/ `report-uri /api/csp-report`, `*.map`→404, junk-path→404, `/robots.txt` + `/sitemap.xml` → backend, `GENERATE_SOURCEMAP: "false"`.

`frontend/public/.well-known/security.txt` exists in both.

---

## 8. Webhook / payment signature verification

| Path | Module | Verification |
|---|---|---|
| `POST /api/payments/razorpay-webhook` | `monetization_features.py:474-490` | HMAC-SHA256 + `compare_digest`; **fail-safe**: missing/PLACEHOLDER secret ⇒ stored unverified, never credits. Exempt from bot detection (`security_middleware.py` bypass list) |
| `POST /api/payments/verify` | `server.py` | `razorpay_client.utility.verify_payment_signature` + `compare_digest` |
| credit-pack purchase verify | `monetization_features.py:428-440` | `verify_payment_signature`; failure writes `status:"signature_invalid"`; credit via `_credit_purchase_atomic` (idempotent) |
| `POST /api/events/purchase/webhook` | `event_purchase_service.py:140` | `pay.verify_signature(order,payment,sig)` |
| event payments | `event_payments.py:111` | HMAC + `compare_digest` |
| donations `/api/public/events/donate/verify` | `event_finance_service.py:292-315` | server-side `_pay.verify_signature`; distinguishes 409 (gateway unavailable) from 400 (bad signature) |
| store checkout | `store_features.py:792` | `verify_payment_signature` |
| portfolio purchase | `portfolio_service.py:1045` | `verify_signature` |
| user/design purchase | `user_features.py:804` | `verify_payment_signature` |
| studio storage / subscriptions | `studio_storage.py`, `subscription_service.py` | `compare_digest` present |
| link reactivation | `link_reactivation.py` | delegates to `subscription_service.verify_gateway_payment` |

**Verdict: signature verification is uniform and correct across all payment paths.** Residual: `mock_token` branch (S22), no shared `webhook_events` dedupe ledger confirmed across all paths (`SECURITY_AUDIT.md` §6 open item), test-buyer free-order bypass (S2).

---

## 9. Admin MFA — BUILT, NOT ENFORCED

`backend/admin_security.py` — pure-Python RFC-6238 TOTP (`totp()` `:80`, `verify_totp()` `:85`, `otpauth://` provisioning URI `:100`), hashed backup codes, `_audit()` on enable/disable. Router mounted at `server.py:15329-15330`.

Routes (`API_SURFACE.md:1390-1397`):
- `GET /api/admin/mfa/status` — `require_admin`
- `POST /api/admin/mfa/enroll/start` — `require_admin`
- `POST /api/admin/mfa/enroll/verify` — `require_admin`
- `POST /api/admin/mfa/disable` — `require_super_admin`

**No login-time challenge exists.** `grep -rn "mfa" server.py` → 0 hits; `grep "mfa_required|require_mfa|MFA_REQUIRED"` → 0 hits. Enrolling MFA changes nothing about the login flow — `mfa.enabled` is stored on the admin doc and never read by any auth dependency. Treat as **DOCUMENTED-BUT-NOT-ENFORCED**. No SSO. No admin IP allowlist.

---

## 10. Carry-forward checklist for the V2 deployment

**Before any code is written**
1. Rotate all 6 remaining secret sets (Razorpay key+webhook, Supabase service_role+anon, AWS access key, Gemini, Postgres password, CloudFront key pair). Old repo history is compromised regardless of V2.
2. New repo, fresh history. Do NOT import legacy git history. If reusing, `git filter-repo` + force-push per `SECURITY_ROTATION.md` §2.
3. Secrets in a manager (SSM/Doppler/Vault) injected at deploy — never a `.env` on disk. Include `SENTRY_DSN`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALLOW_INSECURE_JWT`, `SEED_TEST_ACCOUNTS` in the documented var set.

**Boot-time invariants to port forward (all already proven in legacy)**
4. Refuse to boot on the default JWT secret (`auth.py:35-48` pattern).
5. Convert `_production_readiness_warnings` (`server.py:15962`) from WARN to **FAIL** when `ENVIRONMENT=production`. Fix the `DEV_MODE_OTP` default mismatch (`:15975`).
6. `SEED_TEST_ACCOUNTS` default **`0`**, no hardcoded password default, and delete the `is_test_buyer` free-order bypass (`store_features.py:688-711`) or gate it behind the same prod fail.

**Auth / session**
7. `admin_token` → HttpOnly cookie; keep 60 min access TTL + refresh rotation with family reuse detection (`auth_sessions.py` — port as-is).
8. Add CSRF: double-submit token **or** strict `Origin` check middleware on all state-changing `/api/*`. Required before any cookie auth; mandatory while `user_session_token` is `SameSite=none` — prefer `SameSite=lax` in V2 if the SPA is same-origin.
9. Fail-CLOSED blacklist lookup on privileged routes (`auth.py:187-199`).
10. Re-check role against DB on privileged actions, not the token claim.
11. **Enforce MFA at login** for `super_admin` (code exists, wiring does not). Add account lockout with exponential backoff + wire the existing `/api/captcha/*` routes into the login limiter.

**Edge / transport**
12. ONE Caddyfile. Port `microservices/Caddyfile` headers (HSTS 1 y, XFO DENY, nosniff, Permissions-Policy, COOP) + `*.map`→404 + junk-path→404 + robots/sitemap routing. Set `GENERATE_SOURCEMAP=false` on the FE build.
13. Flip CSP from Report-Only to enforce after `/api/csp-report` is quiet; replace `unsafe-inline`/`unsafe-eval` with nonces/hashes.
14. `CORS_ORIGINS` explicit — remove `"*"` from `.env.example`.
15. Cloudflare/WAF in front with `/api/*` rate rules + bot mode.

**API surface**
16. Default rate limiter as middleware on every `POST/PUT/DELETE` (per-IP + per-account); keep the per-endpoint tighter limits on top. Redis-backed, `REDIS_URL` required in prod.
17. Global JSON body-size cap middleware (1–2 MB).
18. Authenticate/authorize `WEBSOCKET /api/ws/gallery/{wedding_id}`.
19. Rate-limit or auth-gate the cost/abuse routes: `/api/translate`, `/api/ai/note-suggestions`, `face-search`, `download-zip`, all four guest/live upload endpoints, `PUT /api/rsvp/{rsvp_id}`, `POST /api/templates/{id}/purchase`.
20. Run the **IDOR sweep that was never run**: automated test hitting every `/{id}` route as user A with user B's object → expect 403/404. Bake into CI.
21. Regenerate the equivalent of `API_SURFACE.md` but make the generator resolve wrapper + factory-injected deps so the PUBLIC count is trustworthy; then require every PUBLIC route to carry an explicit `# public: <reason>` marker.

**Ops (the part that made legacy NO-GO)**
22. Managed Postgres with automated backups + PITR, **plus one tested restore** before launch. RPO ≤ 24 h / RTO ≤ 4 h.
23. Sentry (BE + FE) + uptime monitor on `/api/health` + TLS-expiry monitor + alert routing + one-page IR runbook.
24. S3: Block-Public-Access ON, SSE, CloudFront OAC, UUID keys, short signed-URL TTL, least-priv IAM key (not root), CloudTrail on.
25. CI: make dependency audit **blocking** (drop `continue-on-error`), add `yarn audit`, add Trivy image scan, run gitleaks over **history** (`--no-git` only checks the tree), branch protection on main.
26. Data-retention policy + automated enforcement for guest PII / RSVP / face vectors; consent store for cookies+marketing (face consent already exists).
27. Explicit `Image.MAX_IMAGE_PIXELS` + `DecompressionBombError` catch; AV scan for non-image uploads.

**Do not regress:** the §2 table. Highest-value ports: `auth_sessions.py` (refresh rotation + reuse detection), `photo_guard.py` + re-encode pipeline, `storage_serve.py` traversal + HMAC media guard, `invoice_service.py` capability-token pattern, per-profile Rekognition collections, `pg_adapter._check_field`, the `event_client` token-derived-`profile_id` isolation model.