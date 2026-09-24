# PORTFOLIO + PHOTOGRAPHER + STUDIO — legacy MAJA inventory

Repo root: `.../scratchpad/legacy/logic`. Paths below relative to it.

## 1. Module map / wiring (server.py line → factory)

| Line | Wire | Dep passed | Dep return type |
|---|---|---|---|
| 15104 | `photographer_clients.build_photographer_clients_router(db, get_current_admin, get_current_event_client)` | str, str | — |
| 15302 | `studio_earnings.build_studio_earnings_router(db, get_current_admin)` | str | — |
| 15305 | `studio_insights.build_studio_insights_router(db, get_current_admin)` | str | — |
| 15308 | `portfolio_leads.build_portfolio_leads_router(db)` | public | — |
| 15311 | `studio_staff.build_studio_staff_router(db, get_current_admin)` | str | — |
| 15314 | `client_studio_service.build_client_studio_router(db, get_current_admin, get_current_event_client)` | str, str | — |
| 15436 | `portfolio_service.build_portfolio_router(db, require_admin, require_super_admin)` | **dict**, str | — |
| 15440 | `calendar_service.build_calendar_router(db, require_admin)` | **dict** | — |
| 15449 | `studio_weddings.build_studio_weddings_router(db, require_admin)` | **dict** | — |
| 15453 | `white_label_service.build_white_label_router(db, require_admin, require_super_admin)` | **dict**, str | — |
| 15515 | `photographer_directory.build_photographer_directory_router(db=db, get_current_admin=...)` | str | — |
| 15524 | `seed_demo_photographers(db)` on startup | — | — |

`auth.py:314 require_admin` returns **dict** `{'admin_id','role'}`; `auth.py:301 require_super_admin` and `get_current_admin` return **str** admin_id. Mixing these is the source of §15 bug #1.

Adjacent (not in read list, same surface): `client_studio_service.py` (contracts/proofing/print), `studio_weddings.py`, `studio_storage.py` (backup plans), `studio_folders.py`, `studio_credit.py`, `photographer_referrals.py`, `discovery.py`, `storage_accounting.py`, `pricing_public.py`.

`backend/studio_content_analytics.py` **DOES NOT EXIST**. The named surface is frontend `frontend/src/pages/StudioContentAnalytics.jsx` → calls `GET /api/pixora/content-analytics` (implemented in `pixora_service.py:4030`, `require_admin`).

## 2. Collections (JSONB via pg_adapter, no migrations)

`portfolio_profiles` (id = studio_id = owner admin_id; carries `slug`, `design_id`, `team_members`, `past_works`, `studio_photos`, `faqs`, `seo_*`) · `portfolio_albums` · `portfolio_works` (`size_bytes` server-authoritative) · `portfolio_testimonials` · `portfolio_build_requests` · `portfolio_build_unlocks` · `plan_purchase_details` · `photographer_reviews` (`status` pending|published|rejected) · `studio_bookings` · `studio_blocks` · `studio_avail_cfg` (id = studio_id) · `studio_staff` · `studio_settings` (`primary_owner_admin_id` overlay) · `studio_ownership_transfers` · `white_label` (id = studio_id) · `event_client_accounts` (1 per profile, unique lowercase `username`, bcrypt) · `studio_contracts` · `proofing_galleries` · `proofing_photos` · `studio_print_orders` · `uploaded_media` (upload registry) · `subscriptions` (`product:"portfolio"`) · `subscription_plans` (`portfolio_tier`, `portfolio_sections`, `storage_gb|storage_mb`).

Directory fields live on **`admins`**, not portfolio: `directory_listed`, `available_now`, `available_at`, `service_cities` (lowercased), `bio`, `portfolio_images`, `portfolio_videos`, `starting_price`, `is_demo`, `pixora_verified_level`, `is_verified`.

## 3. Route inventory

**`/api/portfolio` (23, all `require_admin` dict-dep)** — `GET meta` · `GET|PUT profile` · `GET|POST albums`, `DELETE albums/{album_id}` · `POST upload` · `GET|POST works`, `PUT|DELETE works/{work_id}` · `GET|POST testimonials`, `DELETE testimonials/{tid}` · `GET tier` · `POST design` · `GET|PUT team` (premium-gated on PUT only) · `GET build-help`, `POST build-help/order`, `POST build-help/verify` · `GET|POST build-request`. Plus `POST /api/plan-purchase-details` (admin) and super-admin `GET /api/admin/plan-purchase-details`, `GET /api/admin/portfolio-build-requests`, `POST /api/admin/portfolio-build-requests/{req_id}/status?status=` (**query param**, not body).

**Public portfolio** — `GET /api/public/photographer/{studio_id}/portfolio` (id OR slug) · `GET /api/public/photographer/{studio_id}/works/{work_id}` · `POST /api/public/photographer/{studio_id}/enquiry` · `GET /api/public/photographer/{studio_id}/availability?year&month`.

**Directory / discovery (public)** — `GET /api/public/photographers` (filters: city, available, state, q, category, skill, min_experience, verified, min_rating, sort, country, min_budget, max_budget) · `GET /api/public/photographers/{photographer_id}` · `POST /api/public/photographers/{photographer_id}/reviews` · `GET /api/public/discovery/{segment}` · `GET /api/public/discovery/{city_seg}/{service_seg}` · `GET /api/public/photographer-stats`.

**Directory (studio, `get_current_admin` str-dep)** — `POST /api/admin/photographer/availability` · `GET|POST /api/admin/photographer/profile` · `GET /api/admin/photographer/reviews`. **Review moderation** `GET /api/admin/photographer-reviews/pending` + `POST /api/admin/photographer-reviews/{review_id}/moderate?action=approve|<any>` — declared `get_current_admin` then super-admin checked in-body via `_require_super`.

**`/api/calendar` (10, `require_admin` dict)** — `GET meta` · `GET|POST bookings`, `PUT|DELETE bookings/{bid}` · `POST blocks`, `DELETE blocks/{blk}` · `GET|PUT config` · `GET month?year&month`.

**`/api/studio` (23)** — earnings, insights, my-weddings, wedding/{profile_id}, white-label GET/PUT, staff (7), contracts (4), proofing (4), print-orders (2).

**`/api/client` (17, `event_client` token)** — login, overview, analytics, rsvps + /stats + /export, wishes CRUD/approve/reject/feature, contracts + sign, proofing + select, print-orders.

**Crawler SSR (server.py)** — `GET /photographer/{slug}/portfolio` (11087) + `GET /api/og/photographer/{slug}` (11094) → `portfolio_service.resolve_public_portfolio_seo`. `GET /photographers`, `/photographers/{a}`, `/photographers/{a}/{b}` (11179/11184/11265) + `/api/og/photographers*` twins → `photographer_directory.resolve_discovery_page`. Sitemap (server.py ~11341–11380) emits published portfolio slugs + `/photographers` + `enumerate_discovery_pages()`.

## 4. The 15-section catalog (`portfolio_service.py:113`)

Order is render order: `hero, about, journey, statistics, services, featured_work, why_choose_us, testimonials, equipment, awards, event_highlights, booking_process, availability, contact, special_feature`.

- `BASIC_SECTIONS` (free, 6): hero, about, services, featured_work, availability, contact.
- `PREMIUM_SECTIONS` = BASIC + journey, statistics, why_choose_us, testimonials, equipment, awards, event_highlights, booking_process, special_feature (15).
- `_portfolio_sections(db, sid)` resolution: no active portfolio sub → BASIC; sub whose plan has non-empty `portfolio_sections` list → that ∩ catalog, forced to include `hero`+`contact`, re-sorted to canonical order; sub with no list → all 15.
- Plan-level `portfolio_sections` is authored in super-admin UI `SuperAdminPricingHub.jsx` (SectionPicker) → `subscription_service.py:339/876`.
- **Server-side enforced**: `sections` returned by the public portfolio endpoint; frontend `PublicPhotographerProfile.jsx` gates every block through `const has = (s) => (sections||[]).includes(s)`. The studio-side editor (`PhotographerPortfolio.jsx`) does **not** consume `unlocked_sections`/`locked_sections` from `/api/portfolio/tier` — a free studio can fill premium fields; they just don't render publicly.
- `PORTFOLIO_DEFAULTS` overlays placeholder copy so a page is never empty (`_merge_defaults`). Placeholder works/testimonials (`DEFAULT_WORKS`, `DEFAULT_TESTIMONIALS`) are defined but **deliberately never injected** into the public payload (owner rule "no fake hyping") — dead constants.

## 5. Designs + tier gating

`frontend/src/data/portfolioDesigns.js` — header claims "Free (1) · Basic (3) · Premium (5)", **actual count is 10**: free 1 (`free_studio_neutral`), basic 3 (`basic_golden_hour`, `basic_darkroom`, `basic_nordic`), premium **6** (`premium_gallery_wall`, `premium_film_strip`, `premium_liquid_glass`, `premium_contact_sheet`, `premium_aurora`, `premium_editorial`). The "9 designs" brief is stale; `premium_editorial` was added later as the only `layout:` design (renders via `frontend/src/portfolioLayouts/premiumEditorial.jsx`, bypasses the token renderer entirely).

Gating:
- `TIER_UNLOCKS = {normal|free:['free'], basic:['free','basic'], premium:['free','basic','premium']}`; `DEFAULT_DESIGN_BY_TIER` normal→`free_studio_neutral`, basic→`basic_golden_hour`, premium→`premium_gallery_wall`.
- **FRONTEND-ONLY.** `PhotographerPortfolio.jsx:1113` computes `unlocked = designsForTier(tier.tier).some(...)`; locked cards route to `/studio/plans`. Backend `POST /api/portfolio/design` (portfolio_service.py:893) accepts **any free-form string** with an explicit comment "tier-gated on the client" — no tier check. Public render `resolveDesign(design_id, tier)` falls back to the tier default **only when the id is unknown**, so a hand-POSTed `premium_aurora` renders for a free studio. **Bypassable.**
- Tier demo pages are static HTML: `frontend/src/data/portfolioTierDemos.js` → `public/portfolio-demos/*.html` (4 tiers, self-contained, not the real renderer).

## 6. Tier resolution + storage quota

`_portfolio_tier(db, sid)` → `'normal' | 'basic' | 'premium'`. Source: `db.subscriptions {studio_id, product:'portfolio', status:'active'}` (up to 50 rows) joined to `subscription_plans`; **premium always wins** across multiple active subs. `_plan_tier_of` reads `plan.portfolio_tier`, else infers from tier NAME ∈ `{professional, studio, premium, elite, pro, enterprise}` → premium, else basic.

Caps (`_base_storage_cap_bytes`): no sub → 500 MB; else `plan.storage_gb` → `plan.storage_mb` → tier default (premium 20 GB / basic 5 GB). `_storage_cap_bytes` = base + `monetization_service.storage_bonus_bytes` (purchased add-ons; failure can't shrink base).

`storage_accounting.py` is the single pool. `MEDIA_COLLECTIONS` = portfolio_works, pixora_media, pixora_reels, pixora_stories (expired excluded), pixora_posts, pixora_submissions, pixora_listings, pixora_collab_media, pixora_mentor_media, gallery — plus `uploaded_pending` (registered-but-unattached bytes). `cap_bytes()` delegates back to `portfolio_service._storage_cap_bytes` (circular-by-design, one truth); fallback on error = 500 MB floor.

**Enforcement points (only these):**
1. `POST /api/portfolio/upload` — inline check `used + size > quota` → 403 (portfolio_service.py:731-735); plus rate limit `allow_upload(sid, 30/min)` → 429; per-file caps 25 MB image / 200 MB video; extension allowlist + content-type prefix + magic-byte reject (MZ/ELF/PK/%PDF/<!DO/<htm).
2. `pixora_service.py:3115` — `ensure_can_store` before community upload.
3. `event_media_service.py` — `acct.ensure_can_store`.

Everything else is accounting, not gating. `POST /api/portfolio/works` does **not** re-check quota (comment: enforced at upload, pending bytes counted). Update reconciles by delta; delete calls `release_urls`.

**NOT counted against quota:** `proofing_photos` / `proofing_galleries` (client_studio_service accepts arbitrary photo URLs, no size, collection absent from `MEDIA_COLLECTIONS`), `backup_files` (separate `studio_storage_plans` quota), YouTube-link works (0 bytes, advertised as free in UI).

`FREE_MAX_PHOTOS = 2` / `FREE_MAX_VIDEOS = 1` (portfolio_service.py:79-80) — **declared, never referenced anywhere. DEAD.** Free-tier limiting is bytes-only.

## 7. Directory listing gate (`query_directory`, photographer_directory.py:129)

Loads **all** `admins` (to_list 5000) + all `portfolio_profiles` in memory, then per row:
1. **Opt-out first**: `directory_listed is False` → skip (note: strictly `is False`; missing/None stays listed).
2. **Plan gate**: `not is_demo and pid not in tier_by_id` → skip. `tier_by_id` built from active `product:'portfolio'` subs → `'premium'|'basic'` (premium wins, same name-inference fallback). Free/normal studios are **never** listed.
3. `is_demo` studios bypass the plan gate and are tagged `tier='premium'`.
4. City fallback: `admins.service_cities` ∪ `portfolio.location.city` ∪ `portfolio.coverage_areas`. Budget: `admins.starting_price` else `portfolio.starting_price`; unpriced studios are never excluded by a budget band.
5. Reviews folded in via one grouped query on `photographer_reviews {status:'published'}`; `min_rating` applied after.
6. **Sorts — premium first in every mode except `name`**: relevance = `(tier!='premium', -verified_level, not available_now, -rating, name)`; `rating`/`experience` prefix the same premium key; `newest` sorts premium-first then re-sorts by created_at desc (**second sort discards the premium key — premium-first is a no-op for `sort=newest`**); `name` has no premium key.
7. Facets computed from the filtered set (countries/states/cities/categories/skills).

Availability: `_is_available` requires `available_now` **and** `available_at` within `AVAILABILITY_TTL_MIN = 120` (auto-expiring toggle).

`_sync_directory_fields` (portfolio_service.py:367) mirrors portfolio → `admins` on every `PUT /api/portfolio/profile`: `services`, `styles`, `service_cities` (only when non-empty), `starting_price`. One form drives both.

Demo seed: 3 studios (`demo_photog_lens_lotus`, `demo_photog_saptapadi`, `demo_photog_mughal_frames`), 13 seeded published reviews, ratings derived from reviews (4.6 / 4.25 / 4.8), idempotent, patches `starting_price` + `portfolio_videos` on re-run. `is_demo` filtering: `resolve_discovery_page` and `enumerate_discovery_pages` exclude demos from **counts** but still return them in `photographers`; `PhotographerDiscoveryPage.jsx:51` filters client-side; **`PhotographersPage.jsx` (main `/photographers`) does NOT filter demos**.

## 8. SEO (`portfolio_seo.py`, pure functions, PREMIUM-gated)

`SITE = "https://majainvites.com"`, canonical `{SITE}/photographer/{slug}/portfolio`, `MAX_DESC = 320`.
`resolve_seo(profile, slug, rating, review_count, reviews, gallery_images)` → `{title, description, keywords, canonical, og_image, directions_url, json_ld}`. Auto-derives title `"{name} | {top_service} in {city}"`, description from services+tagline, keywords `"{service} {city}"` ×5 + name, capped 15 deduped.
JSON-LD `@graph`: `Person` (when `portfolio_type=='individual'`) else `ProfessionalService` (+priceRange from `starting_price`/`pricing_packages`, foundingDate, numberOfEmployees, openingHoursSpecification from **structured `opening_hours` only**, slogan) · `BreadcrumbList` · `FAQPage` (≤20) · `ImageGallery` (≤30 abs URLs) · `Review[]` (≤12, placeholders skipped, `itemReviewed` back-link). `aggregateRating` emitted **only** when a real rating + review_count>0.
Gating: `public_portfolio` sets `seo=None` unless tier=='premium'. `resolve_public_portfolio_seo` (crawler/OG) always returns title/description/canonical/og_image, but `keywords=[]` and `json_ld=None` for non-premium.
Discovery SEO lives in `discovery.py`: `MIN_PHOTOGRAPHERS = 3` index threshold, 10-entry `SERVICE_TAXONOMY` (wedding, candid, pre-wedding, engagement, videographer, drone, destination, maternity, baby, cinematic), `discovery_seo(...)['indexable']`, `collection_jsonld`. Sitemap only lists paths clearing the threshold.
Slugs: `_ensure_slug` generates `slugify(studio_name|admin.name)` on first read, dedupes `-2`, `-3`, persisted upsert; kept stable across profile saves.

## 9. Client portal — the third identity

`auth.py:145-190`. `create_client_token(profile_id)` mints JWT `{sub: profile_id, typ:'event_client', role:'event_client', jti}`, TTL `CLIENT_TOKEN_EXPIRE_HOURS` default 168h. `get_current_event_client` returns profile_id; rejects non-`event_client` typ + blacklisted jti. `get_current_admin` (auth.py:245) and `get_current_admin_with_role` (auth.py:289) **explicitly reject `typ=='event_client'`** — hard identity separation. Every `/api/client/*` handler takes profile_id from the token, never the URL.

Flow: photographer opens a wedding → `POST /api/admin/profiles/{profile_id}/client-access` mode `predefined` (username `{slug}-maja`, uniqueness-suffixed; 9-char generated password from unambiguous alphabet) or `custom` (regex `^[a-z0-9._-]{3,40}$`, password ≥6). Plaintext password returned **once**. `regenerate` re-issues, `PATCH` enables/disables, `DELETE` removes. Ownership check `_require_owned_profile` = `profiles.admin_id == caller` or caller role `super_admin`.
Client login: `POST /api/client/login`, in-process throttle `_LOGIN_FAILS` 8 fails / 300 s per `ip:username` (**per-process only, not shared across replicas**).
Portal capability: overview, analytics (read-only from `db.analytics`), rsvps + stats + CSV export, wishes (view/add/delete/approve/reject/feature, `MAX_FEATURED = 3` with oldest-featured auto-rotation; client-added wishes auto-`approved`, `source:'client'`), plus `client_studio_service` contracts (view + sign, records `signer_name`+ip, flips CRM `contract_status`), proofing selects, print-order creation.
Frontend routes `/studio/client`, `/studio/client/login`.

## 10. Leads / enquiries (`portfolio_leads.py`, 131 lines)

`POST /api/public/photographer/{studio_id}/enquiry` (public). Rate limit `cache_backend.rate_limit_allow("enquiry:{ip}:{studio_id}", 8/3600)` → 429; limiter failure is swallowed (fail-open). Validation: name required; **phone OR email required**; email regex. Studio resolved by the shared `portfolio_service._resolve_studio` (id or slug).
Writes **directly into the existing CRM**: `pixora_crm_clients` doc `{status:'lead', source:'portfolio', budget_inr:0, payment_status:'unpaid', contract_status:'none'}` + a `pixora_crm_timeline` row `{stage:'inquiry'}`. **Stored regardless of plan tier** (deliberate); CRM management UI stays plan-gated. This closes audit gap #9 — `PHOTOGRAPHER_PANEL_AUDIT.md` line 61/136 still lists lead→CRM wiring as unwired (**doc is stale**).

## 11. Earnings / insights / content analytics — data sources

**`GET /api/studio/earnings?days=90`** (clamp 1–365) — `pixora_finance_entries {studio_id}` (`kind` income|expense, `amount_inr`, `date` "YYYY-MM-DD" string compare, `category`) + `pixora_bookings {vendor_owner_id}`. Returns totals, windowed totals, last-12-month series, top-8 income categories, booking counts by status. Manual-entry ledger only — **no payment-gateway income is ingested**.

**`GET /api/studio/insights?days=90`** — scope boundary = `db.profiles {admin_id: me}`; every aggregate filtered to those ids **in Python after a full-collection scan** (`_find(db, coll, {})` with limit 200000 on `live_gallery_photos`, `qr_scan_counts`, `gallery_photos`, `face_search_sessions`, `photo_requests`, `backup_files`). Sections: `qr` (galleries, scans, uploads, guest vs studio split, scan→upload %, storage GB, top-10 events), `storage` (backup_files bytes + `studio_storage_plans.gb_limit` quota, monthly growth), `face` (collections, indexed photos/faces, searches, photo_requests). **O(whole-table) per request — scaling hazard, no index use.**

**Content analytics** — `GET /api/pixora/content-analytics?window=7d|30d|90d|all` in `pixora_service.py:4030` (`require_admin`); UI `StudioContentAnalytics.jsx`, route `/studio/pixora-analytics`. Returns totals (views/likes/comments/saves/shares), followers, `top_content`, `top_tags`, `new_followers`, `best_time {weekday,hour}`, `audience_topics`.

Public portfolio views are tracked separately: `POST /api/track {type:'portfolio_view', target_id: slug}` fired from `PublicPhotographerProfile.jsx` — **not surfaced in any studio dashboard**.

## 12. White-label (`white_label_service.py`, 86 lines)

`db.white_label` one doc per studio: `{id, brand_name, logo_url, accent_color, tagline, custom_domain, hide_maja_branding, entitled}`. `hide_maja_branding` only honoured when `entitled` (super-admin granted via `POST /api/admin/white-label/{studio_id}/entitlement?enabled=`); silently forced False otherwise; revoking entitlement also clears it. `GET|PUT /api/studio/white-label` (self), `GET /api/public/studio/{studio_id}/white-label`, `GET /api/admin/white-label` (list + entitled_count). Applied in `public_portfolio`: `studio.name = white_label.brand_name or profile.studio_name`; frontend also overrides accent (`accent = wl?.accent_color || design.accent`). `custom_domain` is **stored only — no DNS/routing/verification anywhere**. UI: `StudioWhiteLabel.jsx` (93 lines).

## 13. Staff / delegated access (`studio_staff.py`)

Model: staff = delegated-access layer over the owner's `admin_id`, never a second identity. Roles `owner > manager > editor > viewer`; `ASSIGNABLE_ROLES = manager|editor|viewer` (owner never hand-assigned). Permission matrix `ROLE_PERMISSIONS`: owner {view, edit_portfolio, manage_bookings, manage_finance, manage_staff, manage_billing, transfer_ownership}; manager = owner minus billing/transfer; editor {view, edit_portfolio}; viewer {view}.
Primitives: `resolve_access(db, actor, studio_id)`, `require_role(...)`, `has_permission(role, action)`.
Ownership transfer: writes `studio_settings.primary_owner_admin_id` overlay, promotes target membership to `owner`, demotes previous owner to active `manager` (upserting a membership if absent), audit row in `studio_ownership_transfers`. Identity/data never moved.
Invites: `secrets.token_urlsafe(24)`, pre-links an existing `admins` row by email, token returned **once** to the owner (out-of-band sharing; **no email is sent**), cleared on accept/revoke. Accept endpoint takes only the token from the logged-in staffer.
**Critical limitation:** every HTTP handler passes `me` as BOTH actor and studio_id (`require_role(db, me, me, ...)`, `list_staff(db, me)`, `invite_staff(db, me, ...)`). So `resolve_access` always resolves to the caller's own studio, and a staff membership grants **no actual access to the owner's studio through any endpoint**. `resolve_access`/`require_role` are imported nowhere else in the backend. Delegated access is **DEFINED BUT NOT ENFORCED / NOT USABLE**. UI: `StudioStaff.jsx` (165), `StudioStaffAccept.jsx`.

## 14. Client-work suite (`client_studio_service.py`, /api/studio + /api/client)

Contracts: create (studio, `_owns` check `profiles {id, admin_id}`) → send → client signs (name + IP) → void; signing updates `pixora_crm_clients.contract_status`. **No e-sign/PDF/audit certificate — a name string.**
Proofing: `proofing_galleries` + `proofing_photos` (studio posts arbitrary photo URL dicts; no upload endpoint, no size, no quota); client toggles `selected` + note.
Print orders: client creates from selected photos (`kind` default "download"), studio sets status via body `{status}`. **No pricing, no payment, no fulfilment** — a status list. UI `StudioClientWork.jsx` (183).

## 15. BROKEN / STUBBED / DOC-DRIFT — flagged

1. **BROKEN — white-label never applies publicly.** `white_label_service` handlers annotate `admin_id: str = Depends(require_admin)`, but server passes `auth.require_admin`, which returns a **dict** `{'admin_id','role'}`. So `GET|PUT /api/studio/white-label` read/write `db.white_label` keyed by that dict, while `get_white_label(db, sid)` from `public_portfolio` and `GET /api/public/studio/{studio_id}/white-label` key by the plain string studio_id → never match. Studio saves branding; the public page never shows it. Fix = `admin["admin_id"]`.
2. **SECURITY — design tier gating is client-side only.** `POST /api/portfolio/design` accepts any `design_id`; public renderer honours it regardless of tier. A free studio can apply any premium design with one curl.
3. **DEAD CODE** — `FREE_MAX_PHOTOS`/`FREE_MAX_VIDEOS` (never referenced); `DEFAULT_WORKS`/`DEFAULT_TESTIMONIALS` (never injected); `PORTFOLIO_TIER_CAPS` only echoed in `/api/portfolio/tier` display.
4. **COUNT DRIFT** — "9 designs (Free 1 / Basic 3 / Premium 5)" is stale; the file ships **10** (premium = 6, `premium_editorial` added later as the only `layout` design).
5. **INCONSISTENT DIRECTORY VISIBILITY** — list endpoint excludes only `directory_listed is False`; detail endpoint `GET /api/public/photographers/{id}` and review submission require `directory_listed: True` **explicitly present**. A studio that never opened the photographer-profile form appears in the list but 404s (`{"photographer": null}`) on the detail card and cannot receive reviews.
6. **SORT BUG** — `sort=newest` in `query_directory` applies the premium-first key then immediately re-sorts by `created_at` desc, discarding it. Premium-first holds for relevance/rating/experience only; `sort=name` has no premium key at all.
7. **STORAGE LEAK** — `proofing_photos` and `studio_print_orders` media are outside `MEDIA_COLLECTIONS`; `POST /api/studio/proofing/{gallery_id}/photos` accepts unbounded URL lists with no size accounting.
8. **SCALE** — `query_directory` loads all `admins` + all `portfolio_profiles` (5000 each) and all active portfolio subs per request; `studio_insights` scans whole collections (limit 200000) and filters in Python. No DB-side filtering anywhere in this subsystem.
9. **THROTTLE IS PER-PROCESS** — `photographer_clients._LOGIN_FAILS` is an in-memory dict; multi-worker/multi-replica deploys weaken it. (`portfolio_leads` and review submission correctly use `cache_backend.rate_limit_allow`, but both swallow limiter errors → fail-open.)
10. **STUB** — `white_label.custom_domain` stored, never routed/verified. **STUB** — print orders have no price/payment. **STUB** — contract "signature" is a typed name.
11. **API_SURFACE.md drift** — lists `GET|PUT /api/studio/white-label` as `require_super_admin`; code uses `require_admin`. Lists `/api/admin/photographer-reviews/*` as `get_current_admin`; super-admin is enforced inside the handler. Lists three `/api/photographers` routes attributed to server.py; the actual decorators are `@app.get("/photographers…")` (no `/api`) plus `@api_router.get("/og/photographers…")` — the generator mis-prefixed them.
12. **PHOTOGRAPHER_PANEL_AUDIT.md (2026-08-04) is stale on 4 items** now implemented: consolidated earnings (`studio_earnings.py`), studio staff + ownership transfer (`studio_staff.py`), photographer-scoped QR/storage/face analytics (`studio_insights.py`), lead→CRM wiring (`portfolio_leads.py`), and client proofing/contracts/print (`client_studio_service.py`). Still accurate: no DMs, no in-panel password/email/2FA self-service, no custom domain, no real print store, no e-sign.
13. **Query-param mutations** (easy to miss when porting): `POST /api/admin/portfolio-build-requests/{req_id}/status?status=`, `POST /api/admin/photographer-reviews/{review_id}/moderate?action=`, `POST /api/admin/white-label/{studio_id}/entitlement?enabled=`. Moderation treats **any** action ≠ `"approve"` as `rejected`.
14. **Build-help double-door** — premium plan OR one-off ₹100 (`BUILD_HELP_FEE_INR`, Razorpay order → signature verify, order matched to the studio so cross-studio unlock is impossible; 409 if already unlocked, 503 when the gateway is unconfigured). One open `pending` build request per studio (prior pending rows deleted on submit).
15. **`/api/public/photographer-stats`** counts **all** non-deleted `admins` as `photographers_total` — includes super-admins and the 3 demo studios. Inflated homepage number.