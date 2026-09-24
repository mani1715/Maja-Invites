# MAJA V2 — Implementation Plan (for approval before building)

**Date:** 2026-08-10 · **Status: AWAITING OWNER APPROVAL — no code written yet**

Ground truth sources analyzed:
- `logic.zip` — legacy wedding-36 repo (270 backend .py, 403 frontend .js, 1,182 API routes, 46 docs)
- `M 12 New ui.zip` — 106 `.dc.html` DC-runtime design prototypes (verified identical to the on-disk `M 12 New ui` folder)
- `MAJA_Backend_Cloud_Architecture_Implementation_Plan.md`, `MAJA_Codebase_Reconciliation_Report.md`, `MAJA_Old_New_UI_Reconciliation_Meta_Prompt.md`
- 8 deep recon inventories produced by an Opus agent fleet — in [`recon/`](recon/) beside this file. **Every claim below is grounded in those files.**

---

## 1. The verdict that shapes everything

**The backend does not need to be rebuilt. The frontend does not need to be thrown away. The real work is smaller and different than the meta-prompts assume:**

| Assumption in the docs | What recon actually found |
|---|---|
| "Implement S3 presigned uploads" | **Already built** (`storage_upload.py` presign+commit, key structure, size caps, head_object re-verify) — but has **zero frontend callers** and is admin-only |
| "Implement CloudFront delivery" | **Already built** (`storage_serve.py` 302→signed CDN URL, HMAC media tokens, Range support) — but the CF key pair was never configured, so it silently falls back to S3 presigned URLs |
| "Implement Rekognition Face Match" | **~80% already built end-to-end** (`gallery_features.py`: per-profile collections, `IndexFaces` from S3Object, `SearchFacesByImage`, sessions, thresholds, expiry cleanup) — but **the shipped UI never calls it** (FindMyPhotosModal uses the manual photo-request flow), indexing runs inline in the upload request (no worker/queue/retry), reindex is a write-only stub, and consent is recorded but never enforced |
| "Implement QR gallery with secure tokens" | QR = plain public slug URL (by design — invitations are public). Gallery privacy gate (bcrypt access code + device JWT) **already exists and works** |
| "Migrate to PostgreSQL" | Already on Postgres (JSONB via `pg_adapter`, Mongo removed). New collections need **zero migration** (auto-create) |
| "New UI is the new app" | The 106 `.dc.html` pages are **design prototypes** (DC runtime), not an application. They are the visual spec, nothing more |

**Therefore the plan is: keep the legacy monolith as the engine, fix its critical defects, wire up the already-built cloud paths, finish Face Match properly, and re-skin the React frontend to the M12 design system — P0 screens first.**

This follows the meta-prompt's own rules: no rewrite, no feature loss, new UI = presentation contract, legacy = behavior contract.

---

## 2. Architecture decision record

### 2.1 Backend — KEEP the monolith, extend in house style
- `server.py` (16k lines) + ~90 router factories stay. New capabilities land as **new router-factory modules** following the documented registration rules (order-sensitive: before `api_router` inclusion, never after the event-children catch-all; `require_admin`=dict vs `get_current_admin`=str; no `from __future__ import annotations`).
- **Drop the 5 microservice stubs + gateway** from the deploy (they serve only `/health`, gateway `ROUTES=[]` proxies everything to core anyway). Caddy → core directly. Removes 5 idle PG pools and one hop. The `microservices/db/schema.sql` + Caddyfile (the hardened one) are kept.
- Add **one real worker process** (same codebase, separate container: `python -m worker`) consuming a Redis queue for `FACE_INDEX`, `FACE_SEARCH`, thumbnails, cleanup. Leader-locked jobs move here from the 21 in-web startup hooks where sensible; the APScheduler pattern (already leader-elected via Redis lock) is reused.
- The clean `app/domain/services/repositories` layering from the architecture doc becomes the **convention for new modules only**. No mechanical reorganization of working code. (Doc's own rule: "Do NOT mechanically reorganize the entire legacy codebase.")

### 2.2 Frontend — RESKIN IN PLACE, not a second app
The legacy React 19 app keeps running with every feature intact. The M12 design system (Pixora palette #6D28D9/#8B5CF6/#A855F7, 70/20/10 white/lavender/purple, aurora/glass/petals, radius 14/20/16/999, mj* motion) is applied **screen by screen**, using the 106 `.dc.html` pages as the visual spec:

1. Port the M12 design tokens into the app as a global stylesheet + shared components (aurora hero, glass card, button system, nav) — one-time foundation.
2. Rebuild **P0 screens** pixel-faithful to their `.dc.html` counterparts (guest invitation, live wall, gallery unlock + Find-My-Photos, QR pages, studio gallery/upload, auth screens).
3. Everything not yet reskinned keeps its current working UI. **No feature can disappear, because nothing is deleted** — this satisfies the meta-prompt's preservation rules automatically.
4. The crown-jewel logic modules (recon-frontend-logic.md) are preserved per their per-file port strategy: `resolveMediaUrl` (consolidate the 3 divergent copies into 1), `portfolioDesigns.js` + theme lazy-loader (verbatim), `designCode.js` (verbatim — codes are in the wild), CartContext + `order.free` bypass (adapt), auth contexts (keep every hard-won pattern: single-flight refresh, 15s watchdog, 401-only-clears, Safari-private-mode guards).
5. New API client layer: extend the `services/eventApi.js` pattern app-wide; kill the 157 direct `REACT_APP_BACKEND_URL` imports as screens are touched (not big-bang).

**Why not a fresh React app from the .dc.html pages?** 106 screens × business wiring under a 1-week event deadline, while the legacy app already works and already contains the money/auth/theme logic. Reskin-in-place ships the same visual result with a fraction of the risk. The DC pages stay as the reference spec for every screen we touch.

### 2.3 Cloud — user's new architecture doc wins
- **GCP `e2-standard-4`** VM: Caddy + FastAPI core (4 workers) + worker + PostgreSQL 16 + Redis (docker compose, one file, the hardened Caddyfile).
- **AWS**: S3 (private, Block Public Access, lifecycle), CloudFront (OAC, signed URLs — finally configure the key pair), Rekognition (`ap-south-1`).
- Legacy `AWS_ARCHITECTURE.md` (full-AWS EC2 design) is used for its bucket/IAM/lifecycle/face-match details only; hosting stays GCP per your newer doc.
- Scale path unchanged: e2-standard-4 → 8 → 16, only on measured triggers.

---

## 3. Phases

### PHASE 0 — Safety net (before any feature code) — ~half a day
| # | Task | Why |
|---|---|---|
| 0.1 | New git repo from `logic.zip` content, **fresh history** (old repo history contains live secrets — recon-security S1) | non-negotiable |
| 0.2 | **Rotate all 6 secret sets**: Razorpay key+webhook, Supabase service_role+anon, AWS access key pair, Gemini, Postgres password, CloudFront key pair *(owner action — I'll list exact consoles)* | S1: only JWT was ever rotated |
| 0.3 | `SEED_TEST_ACCOUNTS` default → `0`; delete/gate the `is_test_buyer` free-paid-goods bypass in prod | S2: public default password ⇒ free paid designs |
| 0.4 | Convert `_production_readiness_warnings` from WARN → **refuse to boot** in production; fix its `DEV_MODE_OTP` default mismatch | boots insecure today |
| 0.5 | Local run gate: `run.ps1` on PG 5433/backend 8001 (M08 port-clash trap), full boot + smoke of `/api/invite/{slug}/full` | prove baseline before touching anything |

### PHASE 1 — P0 money & correctness bug fixes (backend) — ~1 day
These are live-revenue defects found by recon; they ship before any new feature:

| # | Fix | Source |
|---|---|---|
| 1.1 | **Store verify order-binding**: check signature against `order["razorpay_order_id"]`, not the client payload (same fix in `/api/payments/verify` + ownership check) | recon-money §11 — pay ₹1, mark ₹15k order paid |
| 1.2 | **Add Razorpay webhook for store orders** (share `event_payments.py` verifier — the reference impl) | buyer closes tab ⇒ money taken, order stuck `created` |
| 1.3 | Unify the two divergent design-price resolvers (`discount_price:0` quotes ₹0 on one endpoint, ₹2999 on the other) | recon-money §2 |
| 1.4 | **Route collision fix**: `GET /api/public/gallery/{slug}/photos` — the privacy-gated face-search results endpoint is shadowed by an ungated live-gallery route that dumps every photo | recon-media §13.1 — privacy hole |
| 1.5 | `storage_upload.commit` — close the bare `"events/"` prefix (any admin can claim another studio's objects) | recon-media §13.3 |
| 1.6 | Portfolio subscriptions never expire (no `current_period_end` check) — add expiry to `_active_portfolio_plan` | recon-money §11 |
| 1.7 | **Translations never render**: add `translations` to `Profile` + `InvitationPublicView` + pass-through (paid AI translation currently buys nothing) | recon-invitation §10 |
| 1.8 | Live-wall moderation reads only `live_photos` — extend to both collections so photographer uploads are moderatable | recon-invitation §12 |
| 1.9 | Remove `odia`/`urdu` from the sold language catalog (sold but unrenderable) — or add render support; default: stop selling | recon-money §11 |
| 1.10 | White-label dict/str dep bug (`require_admin` returns dict) — branding never applies publicly | recon-portfolio §15.1 |

### PHASE 2 — P0 cloud media path (wire what exists) — ~1 day
| # | Task |
|---|---|
| 2.1 | Run the S3 cutover that was never flipped: `scripts/use_s3_storage.py`, orchestrator default → S3; disable the Drive archive worker + hooks (Drive retired 2026-08-06, code still runs) |
| 2.2 | Configure CloudFront: OAC distribution, key pair, `AWS_CLOUDFRONT_*` env — kill the silent S3-presign fallback; **startup check fails loudly if CF signing is unavailable in prod** |
| 2.3 | Frontend: photographer bulk upload + studio uploads switch to `presign → PUT S3 → commit` (path exists, zero callers today). Legacy in-RAM upload endpoints stay as fallback, flagged deprecated |
| 2.4 | Add **guest/public presign** (scoped: selfie + guest-upload areas, size-capped, rate-limited, slug-validated) so guest media also bypasses the VM |
| 2.5 | Fix the `orchestrator._file_and_account` KeyError on presign-committed rows (every `/api/media` hit currently throws + falls back) |
| 2.6 | ZIP download endpoints → presigned-URL manifest (stop streaming every original through the VM) |
| 2.7 | S3 lifecycle rules written against the **actual** key prefixes (`weddings/…`, `events/…`, `portfolios/…`, `studio/…` — recon-media §4; the docs' prefix list is wrong) |

### PHASE 3 — P0 Face Match, production-grade — ~1–1.5 days
Reuse the working `gallery_features.py` pipeline; make it honest and async:

| # | Task |
|---|---|
| 3.1 | **Worker + Redis queue**: `FACE_INDEX` jobs (move indexing out of the upload request; retry w/ backoff, throttle handling, idempotent by photo_id, writes `index_error` on failure — the field FaceOps already reads but nothing ever writes) |
| 3.2 | **Reindex made real**: worker consumes `needs_reindex` (today: write-only stub that lies `{queued: n}`) |
| 3.3 | `FACE_SEARCH` as job with selfie-hash Redis cache (`fm:{profile}:{sha256}`, 24h) per the AWS doc §11 |
| 3.4 | **Consent enforced**: `face-search` requires a consent record for the session (consent write endpoint already exists); add withdrawal + deletion (selfie S3 objects + sessions + collection delete on event close — cleanup jobs already exist, wire consent into them) |
| 3.5 | **Wire the UI**: FindMyPhotosModal → real `/face-search` flow (selfie → job → poll → matched gallery), no-match state, low-confidence rejected (threshold ≥90 configurable, per-profile override exists). Manual photo-request stays as fallback CTA |
| 3.6 | Acceptance: 5,000-photo event indexes asynchronously while API stays responsive; duplicate indexing prevented; results event-isolated (per-profile collections already guarantee this) |

### PHASE 4 — P0 security hardening — ~1 day
From recon-security §10 carry-forward checklist (the items that block a public event):
- CSRF: strict Origin-check middleware on state-changing `/api/*`; `user_session_token` → `SameSite=lax` (same-origin SPA)
- Authenticate the live-gallery WebSocket (slug + gallery token)
- Global JSON body-size cap middleware; default write-path rate limit (Redis-backed) on top of the existing per-endpoint limits
- Rate-limit/gate the open cost/abuse routes: `/api/translate`, `/api/ai/*`, `face-search`, `download-zip`, `PUT /api/rsvp/{id}`, desktop-upload
- **Enforce MFA at super-admin login** (TOTP fully built, never wired into login) + account lockout w/ backoff using the existing captcha routes
- JWT blacklist: fail-closed on privileged routes; promote `jti` column in schema.sql (blacklist table currently full-scans and never expires — `create_index` is a no-op)
- One Caddyfile (the hardened microservices one): HSTS, XFO, nosniff, Permissions-Policy, `*.map`→404, `GENERATE_SOURCEMAP=false`
- `CORS_ORIGINS` explicit prod origins; remove `*` from `.env.example`

### PHASE 5 — P0 new-UI reskin (frontend) — ~2 days, parallel with 2–4
Foundation first, then screens in guest-first order (the audience that can't tolerate breakage):

1. **Design-system foundation**: M12 tokens → `src/styles/pixora.css` + shared components (PxButton, PxCard, PxAuroraHero, PxGlass, nav) mapped from the design-system/*.ts files already authored in the M12 folder
2. **Guest surfaces** (spec: `MAJA Guest Invitation`, `Ceremony Invitation`, `Live Photo Wall`, `Wedding Live Gallery`, `Guest Arrival`, `Save the Date` .dc.html): `LuxuryPublicInvitation` + live wall + gallery unlock + Find-My-Photos — **with the new Face Match flow from Phase 3**
3. **QR surfaces** (`Wedding QR Codes`): QR display/regenerate + scan-tracking kept
4. **Buyer flow** (`Cart`, `Checkout`, `Order Details Form`): reskin, keep `order.free` bypass + server-quote invariants
5. **Studio P0** (`Studio Dashboard`, `Studio Gallery`, upload): reskin + presign upload path
6. **Auth screens** (`Sign In`, `Create Account`, `Reset Password`)

Per-screen definition of done = the legacy spec's own checklist: no raw `/uploads`, no price arithmetic, no client access decisions, loading/error states, 44px targets, reduced-motion, no overflow at 280–2560, data-testids kept.

### PHASE 6 — Deploy + verify — ~1 day
- GCP e2-standard-4: docker compose (caddy, core, worker, postgres, redis), firewall 80/443 only, SSH keys only, PG+Redis private
- **Backups: pg_dump daily + WAL, encrypted to S3 `maja-backups` (Object Lock), and ONE TESTED RESTORE before the event** (S3: top risk — scripts exist, never scheduled, never tested)
- Sentry DSN live, uptime monitor on `/api/health`, disk/CPU/RAM alerts
- Deploy flow: backup-check → migrate → build → deploy → health → smoke → monitor; previous image kept for rollback
- Load test the event path (invite/full, gallery photos, face-search, guest upload) at 100/500/1000/2000 concurrent; publish real numbers, no claimed capacity

### PHASE 7 — P1 (after the event, order per meta-prompt)
Portfolio + directory reskin (fix client-side-only design tier gate server-side) → studio suite reskin → super-admin reskin (port only the 2 canonical pricing consoles; the 3 dead admin pricing services and the credits system are retired with documented `DEPRECATED_BY_EXPLICIT_DECISION` status) → notifications (WhatsApp/SMS provider wiring — currently mock) → subscriptions renewal job (plan-change `pending_*` fields are written and never read).

### PHASE 8 — P2 (explicitly deferred, nothing deleted)
Pixora reskin (228 routes, 73 collections — works today, keeps its current UI), marketplace, brand deals, mentors, event-engine (Ganesh) expansion, Kubernetes/multi-VM. All remain functional through the untouched legacy screens.

---

## 4. Deliverables & docs (per meta-prompt Phase 30)
Produced during the build, in `docs/`: `MAJA_RECONCILIATION_MATRIX.md` (seeded from the 8 recon files — most rows already known), `MAJA_FINAL_ARCHITECTURE.md`, `MAJA_API_CONTRACTS.md` (only new/changed contracts; `API_SURFACE.md` regenerated as the base — with the generator fixed to resolve factory-injected deps, since its auth column is provably wrong today), `MAJA_SECURITY_REVIEW.md`, `MAJA_DEPLOYMENT_PLAN.md`, `MAJA_TEST_PLAN.md`, and post-build `MAJA_IMPLEMENTATION_STATUS.md`.

## 5. Execution model
Fable as orchestrator + Opus worker fleet (your standing methodology): deterministic scripts for mechanical work (token/CSS migration — same approach as the M12 elevation campaign), Opus agents for judgment work (screen rebuilds, bug fixes with tests), adversarial verify pass per phase, machine gates (pytest suite + boot smoke + the M12-style design gate adapted to the React app).

## 6. Honest estimates
- **P0 (Phases 0–6): ~5–7 working days** wall-clock with the fleet. The docs' "1–2 day P0" is achievable only for the backend half (because so much already exists); the frontend reskin of guest surfaces is the long pole.
- The live event needs Phases 0–4 + Phase 5 items 1–3 + Phase 6 as the minimum ship set.
- No claims of zero latency / 100% uptime / 100% face accuracy. Face match ships with a visible "no confident match" state and the manual request fallback.

## 7. Open questions (need your answers before build starts)
1. **Repo location**: new repo at `Desktop\My Projects\M04(Mani)\maja-v2` seeded from logic.zip with fresh git history (my recommendation, required by the secrets-in-history finding) — or continue in the existing `wedding-36` repo?
2. **Frontend approach**: approve **reskin-in-place** (§2.2)? The alternative (fresh React app from the 106 prototypes) is a much larger, riskier build I recommend against for the event timeline.
3. **Event P0 confirmation**: is the minimum ship set = public invitation + RSVP/wishes + QR → live gallery + guest upload + Face Match ("get your photos")? Anything else the specific event needs (shagun? gift registry? — both work today and stay working either way)?
4. **Cloud readiness**: do you have the GCP project + AWS account + domain DNS access ready, and can you do the 6 secret rotations when I hand you the checklist? Razorpay **live** keys available?
5. **Timeline**: the docs say "live event within ~a week" — what is the actual event date?
