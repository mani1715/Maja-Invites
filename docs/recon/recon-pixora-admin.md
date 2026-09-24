# PIXORA + ADMIN — Legacy MAJA Inventory (P1/P2, recon level)

Repo root: `C:/Users/yemin/AppData/Local/Temp/claude/C--Users-yemin-Desktop-Final/47ddb487-77b8-4a9b-a6bc-4dd498541feb/scratchpad/legacy/logic`

## 0. API_SURFACE.md caveats (read before trusting it)

- Generator does not resolve `include_router(prefix=...)`. `studio_storage.py` routes listed as `/admin/studio-storage/*` and `/super-admin/studio-storage/*` are really `/api/admin/...` / `/api/super-admin/...` (`server.py:15161` mounts with `prefix="/api"`). Same class of error for any bare `/admin` (18) and `/super-admin` (7) namespace rows.
- Guard column is inferred from the literal `Depends(...)` name. **False PUBLIC**: all 23 `super_admin_v2.py` routes show `—` but use a wrapper dep `_su = Depends(require_super_admin)` (`super_admin_v2.py:51`) → genuinely super-admin-guarded.
- **False guarded**: `POST /api/public/qr-scan/{slug}` shows `require_admin`; source (`qr_analytics.py`) has no auth dep — it is public + IP rate-limited (5/hr). Frontend pings it from `LivePhotoWall.jsx:46`.
- Duplicate path rows in the table = real duplicate registrations (see §7 collisions), not generator noise.

---

## 1. PIXORA — scale

| Surface | Count |
|---|---|
| `pixora_service.py` route rows | 228 (308 KB, single file, one `APIRouter` built at line 667) |
| `/api/pixora/*` | 182 (`require_admin` 162, `require_super_admin` 40 across whole module) |
| `/api/public/pixora/*` + `/api/public/p/{username}` | 14 (unauthenticated) |
| `/api/admin/*` owned by pixora_service | 32 (all `require_super_admin`) |
| `pixora_dm.py` | 5 (`get_current_admin`) |
| `marketplace_service.py` | 2, both PUBLIC (`/api/marketplace/config-options`, `/quote`) |

Identity model: a Pixora "member" IS a photographer/studio = `db.admins` row. `pixora_*.studio_id → admins.id`. Profile display joins `db.portfolio_profiles` (23 refs). Couples do NOT get Pixora identity.

## 2. Pixora capability groups (route-prefix → approx count)

Community core: `posts` 11 · `feed` 1 · `comments` 2 · `reels` 3 · `stories` 3 · `highlights` 4 · `saved`/`collections` 4 · `follow`/`following`/`network` 3 · `trending` 1 · `discover` 1 · `search` 1 · `report` 1 · `notifications` 3 · `me` 1 · `settings` 2 · `post-meta` 1.
Public read: `/api/public/pixora/{feed,foryou,nearby,search,hashtag/{tag},hashtags/trending,reels/feed,reels/{id}/view,stories,stories/{id}/vote,highlights/{sid},highlight/{id},packages/{sid}}` 13 + `/api/public/p/{username}` 1.
Workspace OS: `workspaces` 18 (tasks, guests, documents, milestones, team, bookings, comment, activity, analytics).
CRM/business: `crm` 9 · `finance` 3 · `budget` 4 · `revenue` 1 · `insights` 1 · `content-analytics` 1 · `wedding-bi` 1 · `storage` 1 · `checkin` 1.
Commerce: `marketplace` 7 · `packages` 3 · `gigs` 5 · `campaigns` 10 · `applications` 2 · `deliverables` 1 · `brands` 3 · `talent` 3 · `bookings` 3 · `business/quote` 1.
Vendors: `vendors` 3 · `vendor` 2 · `vendor-reviews` 1 · `vendor-categories` 1.
Growth/gamification: `challenges` 2 · `submissions` 2 · `awards` 2 · `leaderboard` 1 · `score-history` 1 · `chapters` 2 · `events` 3 · `learn` 2 · `certifications` 1 · `mentors` 3 · `connections` 3 · `creators` 2 · `benefits` 1 · `team` 3 · `testimonial-videos` 2.
AI (real Gemini via `ai_service.gemini_generate`, fed only real DB signals, deterministic fallback): `career` 2 (L1822) · `portfolio-review` 2 (L4750) · `business-assistant` 2 (L4840) · `pricing-intelligence` 1 (heuristic, no LLM).
Infra: `media/upload` 1 · `capabilities` 1 · `/api/push/{register,preferences}` 2 · `/api/track` 1 · `/api/currency/rates` 1 · `/api/pixora/dm/*` 5.

## 3. Pixora collections (73 distinct `db.*`)

`pixora_posts, pixora_comments, pixora_critiques, pixora_reels, pixora_stories, pixora_highlights, pixora_saves, pixora_shares, pixora_views, pixora_follows, pixora_connections, pixora_hashtags, pixora_signals, pixora_interests, pixora_reel_interests, pixora_collections, pixora_reports, pixora_notifications, pixora_challenges, pixora_submissions, pixora_awards, pixora_award_noms, pixora_achievements, pixora_completions, pixora_score_history, pixora_chapter_members, pixora_checkins, pixora_events, pixora_gigs, pixora_mentors, pixora_mentor_requests, pixora_team, pixora_talent, pixora_brands, pixora_campaigns, pixora_campaign_apps, pixora_campaign_payments, pixora_deliverables, pixora_bookings, pixora_booking_history, pixora_listings, pixora_listing_reviews, pixora_purchases, pixora_packages, pixora_quotes, pixora_vendors, pixora_vendor_reviews, pixora_vendor_categories, pixora_verifications, pixora_workspaces, pixora_workspace_activity, pixora_tasks, pixora_milestones, pixora_guests, pixora_documents, pixora_crm_clients, pixora_crm_timeline, pixora_finance_entries, pixora_budget_items, pixora_settings, pixora_portfolio_reviews, pixora_career_reports, pixora_business_reports, pixora_video_testimonials, pixora_dm_threads, pixora_dm_messages`
Shared/borrowed: `admins, users, user_sessions, portfolio_profiles, portfolio_works, portfolio_albums, portfolio_testimonials, analytics_events, push_tokens, push_outbox, notification_prefs, app_settings, admin_action_log`.

DM invariant: `pixora_dm_threads.key = "|".join(sorted([a,b]))` — one thread per unordered pair; every handler refuses non-participants.

## 4. Pixora gating invariants (`community_gating.py`)

- Community tier is DERIVED from the portfolio subscription — no second plan system. `TIER_RANK = {free:0, normal:0, basic:1, premium:2, pro:3}`.
- `ensure_capability()` **fails OPEN on any error** — never locks a user out.
- `community_grandfathered: True` stamped once by `run_gating_backfill` (guarded by `platform_flags` marker `community_gating_backfilled`); grandfathered studios bypass all gating.
- Kill switch: feature flag `community_plan_gating` (default enabled).
- Hardcoded `TEST_FREE_EMAILS = {test.user@majacreations.com, test.studio@maja.test}` always get full access.
- Admin-editable matrix (Pricing Hub → Community Settings) is authoritative when configured; falls back to `CAP_MIN_TIER` otherwise.
- Storage: `storage_accounting.ensure_can_store` — Pixora media shares ONE pool with portfolio. Upload dir `/app/uploads/community`, served as `/api/uploads/...` (proxy forwards `/api/*` only).
- `from __future__ import annotations` is deliberately ABSENT in `pixora_service.py` — re-adding it breaks `/openapi.json` and body parsing for its function-scoped Pydantic models (comment at L31–36).

## 5. Pixora frontend

- `pages/PixoraCommunity.jsx` — **235 KB monolith**, ~58 tab keys (feed, spotlight, reels, stories, marketplace, crm, workspaces, brand_deals, talent, vendors, mentors, learning, challenges, leaderboards, awards, ai_review, ai_assistant, analytics, verification, perks, upgrades, why_upgrade …). Route `/studio/community` (RequireStudio).
- `pages/PixoraReels.jsx` (22 KB) `/community/reels` · `pages/PublicCommunity.jsx` `/community` · `pages/PixoraPublicProfile.jsx` `/p/:username` · `HashtagPage` `/community/tag/:tag` · `AboutCommunity` `/community/about` · `components/CommunityMedia.jsx`, `CommunityStrip.jsx`.

---

## 6. ADMIN — which console is canonical

**Canonical (live, has a routed UI):**

| Console | Route | Backend | Routes |
|---|---|---|---|
| Super-admin dashboard | `/super-admin/dashboard` | `super_admin_v2.py` + server.py | 23 |
| Pricing Hub | `/super-admin/pricing` (+8 legacy aliases) | **`super_admin_pricing.py`** | 26 |
| Pricing Engine | `/super-admin/pricing-engine` | `pricing_hub_service.py` | 23+4 |
| Fulfillment / ops mega-console | `/super-admin/fulfillment` | `fulfillment_service.py` (9) + `store_features.py` fulfillment/settings + **32 pixora admin routes** | 19 tabs |
| Support Desk | `/super-admin/support` | `support_tickets.py` | 11 |
| Disputes | `/super-admin/disputes` | `disputes.py` | 6 |
| Moderation | `/super-admin/moderation` | `moderation_bulk.py` (4) + `auto_moderation.py` (2) | 6 |
| System Health | `/super-admin/system-health` | `system_health.py` | 1 |
| User Investigation | `/super-admin/investigation` | `user_investigation.py` | 2 |
| BI | `/super-admin/bi` | `business_intelligence.py` | 1 |
| Storage | `/super-admin/storage-analytics` | `storage_analytics.py` | 1 (+ `storage_pool_service.py` 21) |
| QR Analytics | `/super-admin/qr-analytics` | `qr_analytics.py` | 2 |
| Face Ops | `/super-admin/face-ops` | `face_ops.py` | 2 |
| Providers | `/super-admin/providers` | `providers_admin.py` | 1 |
| Profitability | `/super-admin/profitability` | `profitability.py` | 1 |
| Delivery | `/super-admin/delivery` | `delivery_tracking.py` | 2 |
| Security (MFA/RBAC/impersonate) | `/super-admin/security` | `admin_security.py` | 8 |
| Expiry tiers / Founding / Gift codes / Feature flags / Feature requests | own routes | various | — |
| Photographer detail | `/super-admin/photographers/:adminId` | `super_admin_service.py` (photographers subset only) | 4 of 17 |
| Build queue | `/studio/build-queue` (studio-scoped, NOT super-admin) | `store_features.py` | 3 |

**DEAD / ORPHANED backend (mounted, zero frontend consumers):**

- `restructured_admin_service.py` — 13 routes `/api/admin/restructured/*`. Zero callers. Collections `credit_pack_categories, credit_plans, design_pricing_by_user_type, monthly_plans`.
- `enhanced_admin_service.py` — 17 routes `/api/admin/pricing/{features,designs,durations,themes,mixed-theme,monthly-packs}`. Zero *intentional* callers, but see collision §7. Collections `*_enhanced`, `duration_options`, `monthly_packs`, `mixed_theme_pricing`.
- `super_admin_service.py` — 13 of 17 dead (`design-pricing`, `credit-packages`, `theme-packages`, `feature-pricing`, `invitations/{id}`). Only `/photographers*` is consumed.
- `marketplace_service.py` — both routes dead.
- `admin_dashboard_v2.py` `/api/admin/tags` dead; `profiles/paginated` + `export.csv` are consumed by **`LuxuryDashboard.jsx` (photographer panel)**, not super-admin — this router is mis-named, it is studio-facing.

**Verdict:** pricing has FIVE competing admin implementations (`super_admin_pricing` = canonical UI, `pricing_hub_service` = second live UI, `enhanced_admin_service` + `restructured_admin_service` + `super_admin_service` pricing = dead). Port only the first two.

---

## 7. BROKEN / STUBBED / DOCUMENTED-BUT-NOT-IMPLEMENTED

**BROKEN — route collisions (first-registered wins in FastAPI):**
1. `GET /api/admin/pricing/designs` — `enhanced_admin_service` (mounted `server.py:15755`) **shadows** `pricing_hub_service` (mounted `server.py:16240`). `PricingEngineHub.jsx` calls it and silently receives the *enhanced* payload shape (`design_pricing_enhanced`) instead of the hub's. Same-prefix `PUT /designs/{id}` is hub-only so reads and writes hit different collections.
2. `GET /api/admin/storage/overview` — `storage_analytics.py` (15281) shadows `pixora_service.py` (15458). Pixora's storage-overview endpoint is unreachable dead code.

**BROKEN / not enforced — security:**
3. **Admin MFA is enrollment-only.** `admin_security.py` implements TOTP + backup codes + `/api/admin/mfa/{status,enroll/start,enroll/verify,disable}`, but `grep -n "mfa" server.py` returns **zero hits** — the admin login path never calls `verify_totp`. Enrolling MFA does not protect any login.
4. **RBAC is a catalogue with zero enforcement.** `admin_security.py` exports `has_permission()` and a `PERMISSIONS` list (`billing.view, billing.refund, disputes.manage, support.manage, moderation.manage, users.view, users.suspend, storage.view, analytics.view, settings.manage, flags.manage`…), plus `/api/admin/rbac/{catalogue,me,assign}`. The docstring promises a `require_permission()` dependency factory — **that function does not exist in the file** and is used by no route. Authorization is still binary `require_admin` / `require_super_admin` everywhere.

**STUBBED / no-op:**
5. `POST /api/admin/face-ops/reindex/{profile_id}` sets `gallery_photos.needs_reindex = True`. **Nothing in the codebase reads `needs_reindex`** — no worker consumes it. Reindex is a write-only flag.
6. `face_ops` `failed_indexing` counts `gallery_photos.index_error`; **nothing ever writes `index_error`** → always 0.
7. `POST /api/pixora/campaigns/{id}/payments` (`pixora_service.py:5278`) — explicitly `"method": "placeholder"`, ledger row only, **no funds move**. Response carries the disclaimer string.
8. Push provider (`pixora_service.py:839–857`) — writes `push_outbox`/`push_tokens`; the FCM/APNs POST is a `TODO(final step)` comment. No delivery.
9. Razorpay-live detection `_razorpay_live()` (L453) gates on `"PLACEHOLDER" not in key` — committed keys are placeholders.
10. `GET /api/pixora/benefits` returns a module constant `BENEFITS` (static list, no DB).

**Infra-degraded-by-design (honest, not broken):** auto-moderation is a deterministic text heuristic until AWS set (`screen_image()` upgrades to Rekognition); delivery `delivered/opened/bounced` need `POST /api/webhooks/delivery` + `DELIVERY_WEBHOOK_SECRET`; storage/profitability costs are labelled env rates (`STORAGE_COST_INR_PER_GB, SMS_COST_INR, EMAIL_COST_INR, REKOGNITION_COST_INR, PAYMENT_FEE_PCT`) surfaced in an `assumptions` block; face-ops returns `not_configured` and reindex 503s rather than faking.

**Stale docs:** `ADMIN_PANEL_AUDIT.md` (2026-08-04, score 68/100) lists support/BI/health/MFA/investigation/disputes/bulk-moderation/impersonation/profitability as ❌ MISSING. All were built 2026-08-05 (`ADMIN_IMPLEMENTATION_REPORT.md`, 16 phases, gate 67/67 suites / 1780 checks). **Do not plan from ADMIN_PANEL_AUDIT.md.** Its residual-true gaps: no live chat, no KYC, no photographer warning/strike system, no cohort/funnel analytics, no scheduled/segmented campaigns.
`ADMIN_IMPLEMENTATION_REPORT.md` says Phase 4 adds a `chargebacks` collection — actual collection is `disputes`.

---

## 8. Admin-side dependencies of P0 (invitations / media / face / QR)

| P0 area | Admin surface it needs | Backend | State |
|---|---|---|---|
| Invitation fulfillment (manual build) | `AdminFulfillment.jsx` tabs `requests`/`events`/`links`/`settings` | `fulfillment_service.py` 9 routes `/api/admin/fulfillment/{requests,requests/{code},requests/{code}/build-invitation,requests/{code}/deliver,requests/{code}/drive,events,links,{code}/face-match}` + `store_features.py` `GET/PUT /api/admin/fulfillment/settings` | LIVE. All `require_super_admin`. `POST /api/fulfillment/{code}/face-match/selfie` is PUBLIC. Spec `INVITATION_FULFILLMENT.md`. |
| Build queue | `/studio/build-queue` | `store_features.py` `GET /api/admin/build-queue`, `POST .../{order_id}/deliver`, `.../edit-applied` | LIVE (studio-scoped) |
| Invitation CRUD/admin | 107 routes under `/api/admin/profiles` — 44 server.py, 11 premium_features, 9 gallery_features, 9 admin_dashboard_v2, 6 wishes_features, 5 photographer_clients, 5 gallery_privacy, 4 client_budget, 4 analytics_extras, 3 live_gallery_features, 3 link_reactivation, 2 map_features, 2 gift_registry | LIVE, spread across 13 modules |
| Event invitations | `/api/admin/event-invitations/*` 5 (server.py) incl. `POST .../{id}/regenerate-qr`, `PUT .../{id}/security`, `POST /sweep-expired` | LIVE |
| Media | `/api/admin/media/{id}` DELETE, `/caption`, `/set-cover`; `/api/admin/upload-image`, `/upload-video`; `/api/super-admin/gallery-uploads`, `/{wedding_id}` | LIVE |
| Gallery / live gallery | `/api/admin/gallery/aws/health`, `/api/admin/live-gallery/{photo_id}` DELETE + `/moderate`, `/api/admin/photo-requests{,/all,/{id}/status}` | LIVE |
| **Face** | **FaceOps console** `/super-admin/face-ops` → `GET /api/admin/face-ops/overview`, `POST /reindex/{profile_id}` | LIVE but reindex is a no-op (§7.5). Reads `gallery_photos.face_count`, `face_search_sessions` (written by `gallery_features.py`), `photo_requests`. |
| **QR** | **QR analytics console** `/super-admin/qr-analytics` → `GET /api/admin/qr-analytics` | LIVE. Scan counter `db.qr_scan_counts{wedding_id,count,last_scan}` written only by `POST /api/public/qr-scan/{slug}`, pinged once per gallery open from `LivePhotoWall.jsx:46`. Metrics also read `live_gallery_photos` + `upload_logs`. |
| Delivery of invites | `/api/admin/whatsapp/{send-invitation,send-reminder,status}` (premium_features), `/api/admin/delivery/{recent,stats}` (delivery_tracking, `db.delivery_log`, `record_send` wired at `server.py:1614`) | LIVE |
| Watermark | `PUT /api/super-admin/profiles/{profile_id}/watermark` | LIVE |
| Storage pool ops | `/api/super-admin/storage/*` 21 (`storage_pool_service.py`) — accounts, alerts, failures/retry, soft-delete/restore/purge-now, dashboard, settings | LIVE, no dedicated page in App.js route list (reachable via SuperAdminStorage/PricingHub) |

## 9. Pixora-owned admin console routes (all `require_super_admin`, all consumed by `AdminFulfillment.jsx`)

`/api/admin/pixora/{reports, reports/{id}/resolve, verifications, verifications/{sid}/review, members, audit-log, content/{target_type}/{target_id}}` (7) · `/api/admin/vendors{,/analytics,/{id}/action}` · `/api/admin/vendor-categories{,/{id}}` · `/api/admin/vendor-reviews/{id}` · `/api/admin/talent{,/{id}/action}` · `/api/admin/campaigns{,/{id}/action}` · `/api/admin/brands/{id}/verify` · `/api/admin/bookings/{id}/resolve` · `/api/admin/workspaces{,/analytics}` · `/api/admin/events{,/{id}}` · `/api/admin/analytics/{global,overview}` · `/api/admin/industry-analytics` · `/api/admin/marketplace/activity` · `/api/admin/currency/rates` (GET/PUT) · `/api/admin/push/stats` · `/api/admin/storage/overview` (shadowed).
Audit trail: `db.admin_action_log`; moderation targets `db.pixora_reports`.

## 10. Admin collections by module

`admin_security` → `admins, audit_logs` · `support_tickets` → `support_tickets, ticket_messages, audit_logs, admins, users` · `disputes` → `disputes, audit_logs` · `moderation_bulk`/`auto_moderation` → `pixora_reports, audit_logs` · `user_investigation` → `login_attempts` (new; `record_login_attempt` wired at `server.py:1074` admin-login, `server.py:1677` OTP, `user_auth.py:248` user-login), `device_sessions, audit_logs, pixora_reports, admins, users` · `system_health` → `job_heartbeats` (`record_job_run` called from `storage_pool_jobs.py:519` and `auto_moderation.py:164`), `profiles, storage_accounts` · `delivery_tracking` → `delivery_log` · `super_admin_v2` → `broadcasts, coupons, homepage_cms, platform_settings, theme_rollout, login_history, credit_ledger` · `admin_dashboard_v2` → `profiles, rsvps, wishes, credit_ledger` · `qr_analytics` → `qr_scan_counts` · `business_intelligence`/`profitability`/`providers_admin`/`storage_analytics` hold no collections of their own (pure aggregators).

## 11. Files (absolute paths)

Backend: `.../legacy/logic/backend/{pixora_service.py, pixora_dm.py, marketplace_service.py, admin_dashboard_v2.py, super_admin_service.py, super_admin_v2.py, super_admin_pricing.py, enhanced_admin_service.py, restructured_admin_service.py, pricing_hub_service.py, admin_security.py, user_investigation.py, support_tickets.py, system_health.py, moderation_bulk.py, auto_moderation.py, disputes.py, face_ops.py, qr_analytics.py, providers_admin.py, profitability.py, business_intelligence.py, storage_analytics.py, delivery_tracking.py, fulfillment_service.py, community_gating.py, storage_accounting.py, storage_pool_service.py, founding_admin.py, server.py}`
Frontend: `.../legacy/logic/frontend/src/pages/{PixoraCommunity.jsx, PixoraReels.jsx, PixoraPublicProfile.jsx, PublicCommunity.jsx, AboutCommunity.jsx, AdminFulfillment.jsx, AdminBuildQueue.jsx, LuxurySuperAdminDashboard.jsx, SuperAdminPricingHub.jsx, PricingEngineHub.jsx, SuperAdmin{BI,Delivery,Disputes,ExpiryTiers,FaceOps,FeatureFlags,FeatureWishes,FoundingPricing,GiftCodes,Login,Moderation,Profitability,Providers,QRAnalytics,Security,Storage,Support,SystemHealth,UserInvestigation}.jsx, PhotographerDetail.jsx}`; routes in `.../frontend/src/App.js:357-394`.
Docs: `ADMIN_PANEL_AUDIT.md` (STALE), `ADMIN_IMPLEMENTATION_REPORT.md` (current), `ADMIN_BUSINESS_AUDIT.md`, `PIXORA_PLATFORM_AUDIT.md`, `PIXORA_COMMUNITY_CONFORMANCE.md`, `PIXORA_COMMUNITY_PLAN.md`, `PIXORA_REDESIGN_HANDOFF.md`, `INVITATION_FULFILLMENT.md`, `API_SURFACE.md`.