# MAJA Invites — Session Context (through 2026-08-12)

Full context of the build session that took the repo from "nav tabs broken" to
the committed photographer-only pivot (`5acb5bf`). A fresh agent reading this
file plus the referenced docs can continue without the original conversation.

## What this product is now (post-pivot, final decisions)

- **Photographers/studios are the ONLY account holders.** Normal-user (couple/
  buyer) accounts are retired end-to-end. Couples experience the product only
  through: (a) public invitation pages, (b) the scoped Couple Access portal
  their photographer issues (`/couple/access/:slug`, `POST /api/client/login`,
  JWT `typ=event_client`), and (c) a note on the home page telling them to
  connect with a partner photographer.
- **INR money only, via Razorpay.** Credits are retired. Every credit
  purchase/grant/spend/refund path answers `410 CREDITS_RETIRED` (shared
  helper `credits_retired_error()` in `backend/credit_service.py`). These 410s
  are BY DESIGN — do not "fix" them.
- **Normal-user endpoints answer `410 NORMAL_USERS_RETIRED`** (`backend/
  user_auth.py` shim; buyer guard `get_current_buyer` in `server.py` accepts
  ONLY studio Bearer tokens — rejects couple cookies AND event_client tokens).
- **Single sign-in** (`/auth`): one page for everyone; role-routed —
  `super_admin` → `/admin/dashboard`, `admin` → `/studio/dashboard`. Signup is
  studios only ("Set up your studio" CTA everywhere).
- Public visitors can browse designs/pricing/community/reels/photographer
  directory; ordering gates on a studio session (see `Cart.jsx` /
  `Checkout.jsx` inline gate panel).

## Timeline of this session (each wave committed)

1. **Nav/IA audit + fixes** — commit `2f4a5d5`. Canonical `NAV_LINKS`
   (`frontend-v2/src/lib/marketingLinks.js`), shared `MarketingNav`,
   `ScrollManager` hash-scroll fix in `App.jsx`, logout wired through
   `AuthContext.logout` in StudioNav/MobileNav/AdminNav, review credentials
   seeded, PRD + pathfinder + legal docs generated.
2. **Landing nav CSS fix** — commit `24d2242`. Hamburger desktop-visible bug
   was CSS source-order (media `display:none` before base `display:flex`);
   base is now `display:none`, shown under `@media (max-width:1119.98px)`.
3. **Unified sign-in + in-app super-admin console** — commit `997feeb`.
   Couples tab removed from SignIn; role-based routing; fixed
   `GET /api/super-admin/admins` 500 (directory demo rows without `email`).
4. **Production architecture migration** (from
   `MAJA_Production_Architecture_Modification.md`, 39 sections) — commits
   `65757dd` + `e80aec9`. FaceMatchProvider abstraction
   (`backend/face_providers/`), originals never replaced
   (`media_derivatives.py`: original + preview 2048w JPEG + thumb 480w WEBP),
   SHA-256 dedup, presign-primary uploads, face DLQ + worker retry, rate
   limits (selfie search 15/h/IP, 600/h/event), nightly reconciliation
   (`media_reconcile.py`), usage metering + COGS, request metrics/p95,
   Redis cache_backend, leader locks. See
   `docs/ARCHITECTURE_MIGRATION_MAP.md` for the full old→new map.
5. **Legacy parity (wedding-36) P1 build** — commit `d13af5e`. 11 screens:
   StudioPortfolio (plan/design picker), StudioPlans, StudioDesigns,
   StudioOrders, StudioCommunity, AdminPricing (INR hub), Community, Reels,
   PixoraProfile, PhotographerDirectory, PhotographerPublic. Route table in
   `frontend-v2/src/App.jsx` is the source of truth.
6. **Photographer-only pivot** — commit `5acb5bf` (39 files, +1196/−3604).
   Deleted UserDashboard/UserWeddingEdit/UserAuthContext/api/users.js/
   RequireUser + `backend/invitation_v2.py`; 410 walls everywhere (incl. 4
   residual paths: super_admin_v2 refund, user_purchase_service /confirm,
   registration add_credits, buyer-guard couple-cookie acceptance); home CTA
   "Set up your studio" + couples note linking `/photographers`.

Verification at each wave: adversarial verify lanes (13/14/23/28 gates all
PASS), test suites (`test_credits_retired` 21/21, `test_users_retired` 34/34,
plus gallery/face/media/metering/metrics suites — all module-scripts, run as
`python -m tests.test_x`, NOT pytest), `yarn build` green, live checks on
:8001 (users/login → 410, client/login → 200), browser sweep on :8127.

## House rules (bind every future session)

- **Execution model**: Fable orchestrates; Sonnet Workflow fleets implement.
  Fleet-first parallel lanes with strict file ownership (one lane owns
  `App.jsx`/navs). Adversarial verify lanes with structured schemas. Curl-
  verify endpoints before coding against them. Don't stop mid-phase.
- **Stack**: FastAPI monolith (`backend/server.py` ~16k lines + ~90 routers)
  over `pg_adapter` (Mongo-shaped JSONB on Postgres 5433; NO multi-statement
  transactions; `find_one_and_update` is the only CAS primitive and its
  upsert branch is NOT atomic). frontend-v2 = Vite + React 18, **yarn not
  npm**, `@` → `/src`, light-only M12 aesthetic, lazy routes. Legacy CRA
  admin on :3100 (launch.json uses 8.3 short paths — PS 5.1 quoting).
- **Code rules**: ASCII-only content; no `from __future__ import annotations`
  in routers; router registration order is load-bearing; `require_admin` →
  dict vs `get_current_admin` → str; tests use FakeDB from
  `tests.test_storage_orchestrator`.
- **Money**: server-authoritative amounts — client sends IDs, never prices.
  Canonical INR surfaces: `store_features.py` admin endpoints +
  `subscription_service.py`. Legacy `/api/super-admin/pricing/*` is
  credits-denominated and 410-walled — the :3100 screens for it must NOT be
  used.
- **Env gotchas**: PS 5.1 `Start-Process` needs `$null = $p.Handle`;
  BotDetectionMiddleware 403s bare curl UAs (send browser UA);
  `invite_view` has 500/day/IP quota; browser pane may hide → use ref clicks
  + `form.requestSubmit()`.

## Live stack & review access

`run.ps1` starts PG :5433 / uvicorn :8001 / vite :8127. Backend restarted
post-pivot (all 410s live). Review logins (LOCAL ONLY, delete before deploy
via `seed_review.py --cleanup`): see `docs/REVIEW_CREDENTIALS.md` —
`review-studio@maja.local` / `review-admin@maja.local` / couple-access
`review-couple`, all `Review@2026!`.

## Outstanding work

**P2 legacy pages (offered, not yet requested):** client hub CRM, messages,
earnings/insights, staff/security/white-label/audit, storage/cloud-backup,
public browse-themes, story/about, cookies/data-retention legal pages.

**Owner-side before go-live** (documented in `docs/DEPLOYMENT.md`,
`docs/LEGAL_AND_RISK.md`, `docs/LOADTEST_RESULTS.md`):

1. Rotate all 6 secret sets (Razorpay, Supabase, AWS, Gemini, Postgres,
   CloudFront) — old repo git history is compromised.
2. Provision GCP VM + AWS S3/CloudFront(OAC)/Rekognition ap-south-1; fill
   `deploy/.env`.
3. VM-scale load tests (1000/2500/5000 tiers; local 25/100/250 already run).
4. DB cleanup: Rs0 orphan storage rows in `subscription_plans` (frontend
   filters them meanwhile).
5. Legal `[BRACKETED]` placeholders + lawyer review.
6. Disclosure: pre-migration gallery photos have no recoverable original.

**Parked decisions:** dual live-gallery collections + event-engine fate
(`docs/pathfinder/` D2/Tier 2); `user_features.py` super-admin CRUD for
retired user accounts still exists (only the user side is 410'd).

## Key artifacts (read these, don't re-derive)

| Doc | What |
|---|---|
| `docs/ARCHITECTURE_MIGRATION_MAP.md` | old→new architecture map |
| `docs/API_SURFACE.md` | endpoint inventory |
| `docs/REVIEW_CREDENTIALS.md` | review logins + seed/cleanup |
| `docs/DEPLOYMENT.md` | production ops runbook |
| `docs/LEGAL_AND_RISK.md` | legal terms + future risks |
| `docs/LOADTEST_RESULTS.md` | local load tests + VM procedure |
| `docs/prd/` | 29 page-level PRDs + appendices |
| `docs/pathfinder/` | architecture flowcharts + parked decisions |
| Memory file | `~/.claude/projects/C--Users-yemin-Desktop-Final/memory/project_maja_v2_reconciliation.md` |
