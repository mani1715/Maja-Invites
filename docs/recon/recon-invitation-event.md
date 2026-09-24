# INVITATION + EVENT DOMAIN — Legacy MAJA Inventory

**Two parallel, non-overlapping invitation systems.** Wedding/celebration = `profiles` collection, public route `/invite/:slug`. Dynamic Event Engine = `events` collection, public route `/e/:slug`. They share no code, no collections, no auth path. Both must be carried forward or one explicitly dropped.

---

## 0. API_SURFACE.md caveat (READ FIRST)

`API_SURFACE.md` auth column is **wrong for every factory-built router** (`build_*_router(db, require_admin)` pattern). The generator infers the guard from deps *injected into the factory*, not the route. Verified false positives:

| Route in API_SURFACE | Listed guard | Actual code |
|---|---|---|
| `GET /api/public/invite/{slug}/wishes` | `require_admin` | **PUBLIC** (`wishes_features.py:120`, no `Depends`) |
| `GET/POST /api/public/events/{slug}/blessings` | `get_current_buyer` | **PUBLIC** (`event_money_service.py:357,362`) |
| `GET /api/public/gallery/{slug}/photos` (live_gallery_features) | `require_admin` | public |
| `GET /api/public/pixora/*` several | `require_admin` | public |
| `GET /api/events/pricing/*`, `/api/events/design-offer/*` | `require_super_admin` | verify individually |

→ Do not derive the new system's auth matrix from that file. Re-derive from source.

---

## 1. Wedding/celebration data model — `profiles`

`backend/models.py:1167 class Profile` (`extra="ignore"` — unknown keys silently dropped; this has caused ≥3 documented data-loss bugs, see §9).

**Identity/routing**
- `id` (uuid4 str), `admin_id` (owning photographer — data isolation), `slug` (unique link id; **field name is `slug`, but ~12 routes are declared with path param `{slug_url}`** — same thing), `user_id` (consumer-owned profiles).
- Public URL `/invite/{slug}`. Per-event deep link `/invite/{slug}/{event_type}`. Live wall `/invite/{slug}/live-gallery`.

**Core content**: `groom_name`, `bride_name`, `event_type`, `event_date` (datetime), `venue`, `venue_address`, `city`, `invitation_message` (≤200 ch, validated), `about_couple`/`family_details`/`love_story` (HTML), `bride_about`/`groom_about`/`couple_about`, `nakshatram`, `muhurtam`, `celebrant_info` (dict, non-wedding categories).

**Media**: `bride_photo_url`, `groom_photo_url`, `couple_photo_url`, `cover_photo_id`, `opening_photo_url`, `opening_bg_source` (`couple|bride|groom|custom`), + booleans `show_*_photo`, `use_couple_photo_as_qr_bg`, `use_couple_photo_as_invitation_bg`, `use_couple_photo_as_opening_bg`. Actual media rows live in **`profile_media`** collection (`profile_id`, `order`), not on the profile.

**Design/theme linkage (3 overlapping mechanisms — consolidate in rewrite)**
1. `design_id` (`DEFAULT_THEME`) — validated by `model_validator` against `_allowed_design_ids_for_category(invitation_category)`. `selected_design_key` is a duplicate of it.
2. `theme_settings: ThemeSettings` (`theme_id` default `royal_heritage`) — `models.py:124`.
3. `design_selections: Dict[str,str]` e.g. `{"hero": "temple_engagement_2"}` — the per-event design the buyer *paid for*, from the ~180-design catalogue (`design_catalog.py`, mirrors `frontend/src/themes/configs/<prefix>.designs.js`). Theme-prefix map in `design_catalog.THEME_PREFIX_TO_ID` (mughal→royal_mughal, temple→south_indian_temple, minimal, beach, punjabi, bengali, christian, muslim, nature, kerala).
   Separate 8-entry `design_registry.DESIGN_REGISTRY` (`design_1..8`, lord-support flags, per-EventType defaults) is a **third, unrelated registry** — PHASE 22 legacy.

**Sub-events**: `events: List[WeddingEvent]` (`models.py:162`) — max 7, ≥1 visible, **no duplicate `event_type`** (validator). Fields: `event_id`, `event_type`, `name`, `slug`, `enabled`, `date`, `start_time`, `end_time`, `venue_name`, `venue_address`, `map_link`, `latitude/longitude`, `what3words`, `parking_info`, `description`, `theme_id`, `design_preset_id` (legacy), `background_config`, `muhurtham_time` (mandatory for marriage), `dress_code`, `audience`, `video_invitation_*` (**placeholders, NOT IMPLEMENTED** — comment says so).

**Section toggles**: `sections_enabled: SectionsEnabled` (`models.py:832`) — 26 booleans: `opening, welcome, couple, about, family, love_story, photos, video, events, rsvp(default FALSE), greetings(default TRUE), footer, contact, calendar, countdown, qr, decorative_effects, guest_rooms, pre_wedding, live_stream, live_timeline, song_requests, dress_code, check_in`.

**Feature sub-objects on profile**: `background_music{enabled,file_url}`, `map_settings{embed_enabled,latitude,longitude,map_link,what3words,parking_info}`, `contact_info{groom_phone,bride_phone,emergency_phone,email}` (E.164 validated), `rsvp_settings` (dietary/allergies/plus_one/kids toggles), `honeymoon_fund`, `live_stream`, `song_requests_settings`, `dress_code_settings{items[]}`, `seo_settings`, `faq_settings{enabled,title,items[{q,a}]}`, `guest_rooms: List[GuestRoom]`, `pre_wedding_links: List[PreWeddingLink]`, `shagun_settings` (written by premium_features, **not on the Profile model** — extra key), `live_gallery_settings` (same), `wishes_settings.moderation_required` (same), `gallery_config` (same), `translations` (same).

**Lifecycle/expiry**: `is_active`, `status: WeddingStatus` (draft/ready/published/archived), `link_expiry_type` (hours/days/permanent), `link_expiry_value`, `link_expiry_date`, `expires_at` (invitation expiry, distinct from link expiry — default event_date+7d), `expiry_days`, `auto_delete_photos`, `published_at`.
`check_profile_active()` (server.py:518) = `is_active != False` AND `now <= (link_expiry_date or expires_at)`. Returns 410 when false. **Dead duplicate `check_profile_active_old` at server.py:663.**

**Monetization**: `plan_type` (FREE/SILVER/GOLD/PLATINUM), `plan_expires_at`, `selected_features[]`, `total_credit_cost`, `digital_shagun_enabled`, `phonepe_upi_id`, `phonepe_qr_code`.

**Multilingual**: `language: List[str]` (primary), `enabled_languages: List[str]` — English **mandatory**, allow-list of 11: english/hindi/tamil/telugu/bengali/punjabi/hinglish/marathi/gujarati/kannada/malayalam. `custom_text: Dict[lang, Dict[section, Any]]` — also abused as an extension bag under key `_maja` (see §9). `translations: {lang: {field: text}}` written by AI.

**Category**: `invitation_category` ∈ `wedding|baby_birthday|half_saree|puberty|dhoti` (`invitation_categories.py`, `CATEGORY_META` per-category label/gradient/fields/`supports_sub_events`).

---

## 2. Authoring model — two distinct paths

### 2a. Form-authored (the 99% path)
Photographer/user fills `LuxuryProfileForm` / `CelebrationProfileForm` → `profiles` doc → `/invite/:slug` rendered by the **shared data-driven template** `frontend/src/pages/LuxuryPublicInvitation.jsx` (1916 lines, single God component).

### 2b. Generated/hand-designed (done-for-you fulfillment)
`INVITATION_AUTHORING.md` + `INVITATION_FULFILLMENT.md`.

Pipeline: admin console download `MAJA-AB12CD.json` → `node scripts/new-invitation.mjs` → `frontend/src/invitations/<owner>/<event>/{data.js,index.jsx}` → Claude designs `index.jsx` → git push → `redeploy.sh` on VM → `node scripts/deliver.mjs MAJA-AB12CD /invite/<owner>/<event>`.

**Contract**
- `data.js` = content only, no markup. `index.jsx` = `export default function Invitation({ data })`, **never hardcode couple details**.
- `data.slug` MUST match the backing profile or RSVP/wishes post into a void. Guard interactive sections with `{data.slug && …}`.
- `data.expires_at` — expiry enforced by the **route**, not the page (`GeneratedInvitationRoute.jsx`).
- Only import from `@/invitations/kit`. **No new dependencies.**
- Route: `/invite/:slug/:eventType` → `GeneratedInvitationRoute` dynamically imports `../invitations/${owner}/${event}/index.jsx`; **on import failure falls through to `<LuxuryPublicInvitation/>`** — this is how ordinary per-event links keep working. Path segments regex-gated `^[a-z0-9][a-z0-9-]{0,60}$` (blocks traversal).
- Code-split per invitation on purpose (static cross-import would bundle all).

**`frontend/src/invitations/kit.js` — the whole supported surface (84 lines)**
- Re-exported from `@/pages/LuxuryPublicInvitation`: `RSVPForm`, `WishForm`, `Countdown`, `PhotoMarquee`, `TiltCard`, `HeroCover`, `BrideGroomCoupleShowcase`.
- From `@/components/luxury/`: `GiftRegistrySection`, `DigitalShagunSection`, `VenuesSection`, `DressCodeSection`, `FaqSection`, `GuestUploadButton`, `WhatsAppShare`, `AmbientMusicPlayer`, `AddToCalendarButton`, `LivePhotoWallTeaser`, `ScrollSection`.
- `motion`, `AnimatePresence`, `useReducedMotion` from framer-motion.
- `tokens` = `{gold #D4AF37, goldBright #E8C766, ivory #FFF8DC, crimson #8B0000, burgundy #4A0E2A, night #0E0A06, border rgba(212,175,55,.28)}`.
- `mediaUrl(u)` — **load-bearing**: rewrites `/uploads/...` → `${API}/api/uploads/...` because behind ingress only `/api/*` reaches the backend. A bare `/uploads/x.jpg` 404s.
- `fluid(min,vw,vh,max)` → `clamp(${min}rem, min(${vw}vw,${vh}vh), ${max}rem)`. Breakpoint-only sizing is banned (landscape-phone overflow). Verify at 280/390/844×390/768/1440/2560.
- `InvitationShell` — luxe theme + aurora + jaali layers.
- Reference impl: `frontend/src/invitations/meera-kabir/wedding/`. Second sample: `riya-aarav/reception/`.
- Non-negotiables: `aspectRatio` + `objectFit:cover` on every image; `loading="lazy" decoding="async"` below hero; honour reduced motion; nothing fixed bottom-left (Back/Home/WhatsApp pills live there).

`data.js` shape (from reference): `{slug, fulfillment_code, bride, groom, event_label, event_date(ISO), expires_at, venue{name,city,map_link}, story, people[{name,role,photo,about}], gallery[{url,caption}], schedule[{name,when,where}]}`.

---

## 3. Publish flows (THREE separate, incompatible)

**A. Wedding** — `POST /api/weddings/{wedding_id}/publish` (`get_current_admin`) → `wedding_lifecycle_service.publish_wedding()` (deducts credits atomically) → then fire-and-forget `drive_archive.enqueue_archive`. Siblings: `/upgrade` (charges the *difference*), `/archive`. `status` on profile ∈ draft/ready/published/archived.

**B. Fulfillment (done-for-you)** — super-admin only, `fulfillment_service.py`:
- `GET /api/admin/fulfillment/requests?buyer_kind=&status=`
- `GET /api/admin/fulfillment/requests/{code}` (full download)
- `POST .../{code}/build-invitation` `{rebuild?}` → `order_to_invitation.build_invitation_payload()` — PURE function, order→`profiles` doc; returns preview `/invite/<slug>`, editor `/studio/profile/<id>/edit`, and a **`warnings[]`** list (placeholder names, missing photo, unrenderable purchased language, map link with no coords). Result is `status=draft, is_published=false`. Slug derived from fulfillment code ⇒ pressing twice returns the SAME invitation. `rebuild:true` re-applies onto same profile id, link never changes. Order → `build_status=building`, gains `profile_id`.
- `POST .../{code}/deliver` `{live_url, profile_id?}` → `build_status=delivered`, stores `live_url`. **HARD RULE: never deliver until the owner explicitly says "update".**
- `POST .../{code}/drive` (sets `drive_folder_qr`, `drive_folder_selfies`), `GET /api/admin/fulfillment/events?buyer_kind=`, `GET /api/admin/fulfillment/{code}/face-match`.
- Order doc `db.invitation_orders`: `fulfillment_code` (MAJA-XXXXXX), `buyer_kind` (photographer|user), `user_id`, `design_id`, `theme_id`, `event_type`, `package`, `amount_inr`, `status` (created→paid), `build_status` (awaiting_payment→pending_info→building→delivered), `info` (full form), `quote`, `addons`, `live_url`, `profile_id`, `drive_folder_qr`, `drive_folder_selfies`, timestamps.
- `order_to_invitation.py` maps: `_EVENT_TYPES` (wedding→marriage etc.), `_PLAN_BY_PACKAGE` (bespoke/platinum→PLATINUM, premium/gold→GOLD, classic/silver→SILVER), `_FEATURE_SECTIONS` (paid feature key → sections_enabled flags). `RENDERABLE_LANGUAGES` = the 11 above; the cart also sells **`odia` and `urdu` which the invitation model cannot render** — dropped with a warning. `build_slug(order)` = `<groom>-<bride>-<code-derived>` deterministic.

**C. Dynamic Event Engine** — `POST /api/events/{event_id}/publish` (`event_lifecycle_service.publish`) — see §7.

---

## 4. RSVP (wedding side)

- `POST /api/rsvp?slug=<slug>` (PUBLIC, `server.py:5800`). Body `RSVPCreate{guest_name, guest_phone(E.164 validated), status yes|no|maybe, guest_count 1..10, message ≤250}`. Stored `db.rsvps` with `profile_id`, plus `dietary_preference`, `allergies`, `plus_one`, `kids_count`.
  Guards: rate limit **5/IP/day**; adaptive CAPTCHA via `check_submission_captcha_required(slug, ip, device_id, "rsvp")` + `db.captcha_challenges` (sha256 answer, expiring, single-use, `X-Device-Id` header); 404 if no profile; 410 if link expired; **403 if `expires_at` passed**.
- `PUT /api/rsvp/{rsvp_id}` (PUBLIC) — edit.
- `GET /api/invite/{slug}/rsvp/check?phone=&guest_name=` — **48-hour edit window**. Without `guest_name` returns only `{exists, can_edit, hours_remaining}`; with matching (case-insensitive) `guest_name` returns full row. Deliberate anti-enumeration design.
- `POST /api/invite/{slug}/rsvp-smart` (PUBLIC, `premium_features.py:1158`) — extended fields: `meal_preference`, `dietary_restrictions[]`, `transport_needed`, `accommodation_needed`, `event_rsvps[]` (per-sub-event), `attendee_count`. Writes `db.rsvps` with `smart:true`. **410 if `is_active` false. No rate limit, no CAPTCHA on this path — parallel unguarded door to the same collection.**
- Admin export: `GET /api/admin/profiles/{id}/rsvps/export-smart?fmt=csv|xlsx|json`. **xlsx fallback calls `export_rsvps_smart.__wrapped__(...)` — fragile, breaks if decorator stack changes.**
- `GET /api/rsvp-suggestions` (server.py:9171).
- Frontend posts to `/api/rsvp?slug=...` only (`LuxuryPublicInvitation.jsx:1757`).

---

## 5. Wishes vs Greetings — TWO parallel systems, same UI concept

| | Greetings | Wishes |
|---|---|---|
| Collection | `db.greetings` | `db.guest_wishes` |
| Status field | `approval_status` (pending/approved/rejected) | `status` (pending/approved/rejected) |
| Default | **pending** (moderation required) | **approved** (auto-approve) unless `profile.wishes_settings.moderation_required` |
| Submit | `POST /api/invite/{slug}/greetings` | `POST /api/invite/{slug}/wishes` |
| Rate limit | 3/IP/day + CAPTCHA | 3/IP/day per profile per day via `db.wish_rate_limits{ip_hash,profile_id,day}` (sha256[:24] of IP), no CAPTCHA |
| Public read | embedded in `/api/invite/{slug}` (`greetings`, top 20 approved) | `GET /api/public/invite/{slug}/wishes?limit` |
| Admin | `/api/admin/greetings/{id}/approve|reject`, DELETE | `/api/admin/profiles/{id}/wishes[?status]`, `/{wish_id}/approve|reject|feature`, `/bulk-approve`, DELETE |
| Featured | — | max 3 pinned, oldest auto-rotated out on 4th; featuring also auto-approves |

Third comment system: **`db.invitation_v2_comments`** (see §6). Three wish/comment stores for one product concept.

---

## 6. `invitation_v2.py` — Viewer V2 (395 lines, prefix `/api/v2`)

Long-scroll builder whose **entire config lives as `profiles.viewer_v2`** (piggybacks existing auth/slug/media). 13 ordered sections: cover, groom, bride, couple, details, comments, qr, ai_match, directions, parking, stay, rsvp, closing — each with `<section>_enabled`.

Routes:
- `GET|PUT /api/v2/admin/profiles/{profile_id}/viewer-config` (`get_current_admin`) — PUT merges `{defaults, existing, payload.config}`; sets `viewer_v2_updated_at`.
- `POST /api/v2/admin/profiles/{id}/viewer-config/section-toggle?section=&enabled=` — allow-list of 13 section names.
- `GET /api/v2/invitations/{slug}` **PUBLIC** — one-shot payload `{profile(safe subset), config, comments(≤50), gallery{enabled,face_search_enabled,total_photos}}`. Strips `stay_guests`, replaces with `_stay_lookup_available` boolean.
- `POST|GET /api/v2/invitations/{slug}/comments` **PUBLIC** — 403 if `comments_enabled` false; name ≤80, message ≤800; **no rate limit, no IP hash, no CAPTCHA**.
- `DELETE /api/v2/admin/comments/{id}` (soft, `deleted`+`deleted_by`), `GET /api/v2/admin/profiles/{id}/comments?include_deleted`.
- `GET /api/v2/invitations/{slug}/stay-lookup?name=` **PUBLIC** — substring match **in either direction** (`q in full_name or full_name in q`) ⇒ a 2-char query can leak the whole guest list. 403 if `stay_enabled` false.

`_profile_by_id_or_slug` looks up `{"id":ident}` then `{"slug":ident}` — note it returns `slug_url` key in responses but the column is `slug`.

**Status: fully implemented backend; no frontend route found consuming `/api/v2/invitations/:slug`.** Treat as orphaned/parallel to `LuxuryPublicInvitation` unless a consumer surfaces.

---

## 7. Dynamic Event Engine (`events` collection, `/e/:slug`)

**Whole module 404s unless `app_settings.ganesh_module_enabled === true`** (`event_registry.MODULE_FLAG`, default **OFF**; env `GANESH_MODULE_ENABLED` overrides at boot). Every route calls `await _gate()`.

**Only ONE event type registered: `ganesh_chaturthi`** (`event_registry.EVENT_TYPES`). Everything else in the engine is generic machinery with one consumer. `supported_languages ["en","te","hi"]`, `free_edits 15`, `durations [1,3,5,7,9,11,custom]`, 14 `feature_keys` (journey, per_day_schedule, per_day_photos, blessings_wall, donations, money_portal, spending_folders, extra_languages, countdown, prasadam_menu, previous_year_gallery, pdf_download, money_report, whatsapp_share).

**`event_lifecycle_service.py` (545 ln)**
- State machine: `draft→{incomplete,ready_for_review}`, `incomplete↔draft/ready`, `ready→{draft,incomplete,published}`, `published→{live,completed,archived}`, `live→{completed,archived}`, `completed→archived`, `archived→published`. Invalid transitions 409.
- `events` root doc: `event_id` (`evt_<hex14>`) + `id` mirror, `event_type`, `is_event_module`, `title`, `description`, `status`, `is_public`, `template_id`, `theme_id`, `language`, `start_date`, `end_date`, `timezone` (Asia/Kolkata), `venue_id`, `publish_slug`, `current_version`, `content{}`, `theme{}`, `seo{}`, `edit_count`, `published_at`, `deleted_at`, `owner_id`, `owner_kind`.
- **Normalization routing** driven by registry `section.store`: `event`→root scalars (`_ROOT_SCALARS` = title/description/start_date/end_date/timezone/festival_year/organizer_name/temple_name/secondary_languages), `root_obj:<key>`→nested object, `one:<coll>`→1:1 child (venues, organizers), `collection:<coll>`→deferred to children CRUD, `system`→ignored.
- `PATCH /api/events/{id}/autosave` — free, unlimited, never counts as an edit; recomputes status ready/incomplete via `validate_for_publish`.
- `validate_for_publish` is **config-driven** from each section's `required_fields`; also enforces `start_date <= end_date`.
- `publish`: 409 if archived; 422 with `{message, errors[]}`; **first publish free, each later publish = 1 edit; 402 once `edit_count >= free_edits` unless `edit_paid`**; slug generated collision-safe from `title-festival_year`; upserts a row in **`db.invitations`** `{invitation_id, event_id, public_url:"/e/<slug>", template_version, status:"active", qr_code_url:None, view_count, share_count}`; fire-and-forget `storage_pool_hooks.provision_event`.
- `archive`/`restore`/`soft_delete` (`deleted_at`, 5-day recycle mirror via `on_event_deleted`).
- `GET /api/public/events/{slug}` **PUBLIC** — 404 unless `is_public && !deleted_at && !is_suspended && !is_hidden`; strips `owner_id`; attaches `venue`, `organizer`, `schedule` (festival_schedule), `gallery`, `sponsors` (active only), `journey` (celebration_journey), `highlights`, `prasadam`, `granted_features` (via `event_plan_gating.public_event_features`, **None = ungated/legacy**), `template` (from `event_templates`).
- `POST /api/public/events/{slug}/rsvp` **PUBLIC** — `{guest_name(required), attendance_status yes|no|maybe, guests_count 1..50, phone[:20], message[:500]}` → `db.event_rsvp` with `source:"public"`. **No rate limit, no CAPTCHA.**

**`event_children_service.py` (442 ln)** — ONE generic CRUD engine, `CHILD_SPECS` config table. Collections + id prefixes: `committee_members`(mem), `festival_schedule`(day), `celebration_journey`(jny), `highlights`(hlt), `prasadam_menu`(prs), `event_blessings`(bls), `gallery`(med), `albums`(alb), `donations`(don), `sponsors`(spo), `expenses`(exp), `event_rsvp`(rsv). Per-spec: `fields` allow-list (unknown keys dropped), `required`, `defaults`, `orderable`, `search_fields`, `default_sort`, `filterable`, `actions` (approve/reject/feature/activate/deactivate/mark_received).
Routes: `GET/POST /api/events/{id}/{collection}`, `POST .../reorder`, `GET/PATCH/DELETE .../{child_id}`, `POST .../{child_id}/{action}`, plus `GET /api/event-meta/child-collections` (returns `collections_meta()` so the Builder renders forms from schema). All authorize via `event_rbac.authorize_event`. Soft-delete governed by `event_schema.SOFT_DELETE_ENTITIES`.
**Declared DEFERRED in docstring:** real payment verification (§14), notifications (§20), auto-translation (§21), QR & asset generation (§18), the granular 10-role permission matrix (§4). Access is owner-or-super-admin resolved through the parent event.

**`event_media_service.py` (460 ln)** — `POST /api/events/{id}/gallery/upload` (multipart), `GET .../days/{festival_day}/photo-status`, `DELETE .../gallery/{media_id}` (soft), `GET .../gallery-usage`.
Security: magic-byte sniff (client MIME never trusted), ext allow-list `{jpg,jpeg,png,webp,gif,mp4,mov,webm}`, `BLOCKED_EXT` incl. `.svg/.html/.js`, path-traversal-safe basename, caps 15 MB image / 200 MB video, sha256 dedupe (`on_duplicate` cancel|replace|keep → 409 `{code:"DUPLICATE"}`), quota gate `storage_accounting.ensure_can_store`, upload throttle 429.
Per-day rule (`event_day_photos.enforce_day_upload`): a day's photos unlock only after the day arrives; ≤5 photos + 1 video (≤100 MB) per day.
Output: preserved original + WebP `original/large(1280)/medium(768)/small(320)`, quality 82, `original_max` 1920. Row written to **`db.gallery`** with `studio_id` + `size_bytes` (quota), `area:"event_gallery"`, `festival_day`.
**STUBBED / NOT WIRED (explicit in docstring):** `scan_clean()` = clean-by-default, no virus scanner; `VIDEO_TRANSCODER = None` ⇒ videos stored original-only, `transcode_status:"pending"`, no poster; S3/CloudFront push only if `aws_service.is_configured()` + cloudfront domain, else local disk; **no signed URLs for private downloads**.

**`event_members_service.py` (216 ln)** — invite→accept/reject workflow. `db.event_members` rows `{id(mem_), event_id, user_id, email, role, status invited|active|rejected|removed, invited_by, invited_at, accepted_at, deleted_at}`. Routes `GET/POST /api/events/{id}/members`, `PATCH/DELETE .../members/{member_id}`, `POST /api/events/{id}/transfer-ownership`, `POST /api/events/invitations/{member_id}/accept|reject`.
Invariants: volunteer_manager may only invite volunteers; email-only invite binds to the accepting user; an invite with a `user_id` rejects a mismatched accepter (403); **transfer demotes outgoing owner to `event_admin` member** and removes the new owner's member row; no hard deletes.
**Docstring flags: emailing/WhatsApp of the invite is NOT sent here** — the invite is only created and surfaced.

**`event_notifications_service.py` (178 ln)** — `GET /api/events/{id}/notifications/channels`, `POST /api/events/{id}/notifications`, `GET .../notifications` (history). Channels `email|whatsapp|sms|push`. Templates config dict: `event_published`, `member_invited`, `donation_received`, `expense_approved`, `custom` (`_SafeDict` → missing placeholders render empty, never KeyError).
**Email only actually delivers** (via `email_service`, requires provider resend|smtp). **WhatsApp/SMS/push are NOT WIRED** — `_dispatch_external` returns `{"status":"queued","reason":"provider_not_configured"}` unless `EVENT_{CHANNEL}_PROVIDER` env is set, and even then the "send" branch is a comment (`# a configured provider would send here`) that returns `sent` **without sending anything**. Every attempt still writes an `event_notifications` row.

**`event_translation_service.py` (100 ln)** — `GET /api/events/{id}/translations`, `POST /api/events/{id}/translate {language}`. Translates only `title` + `content.{heading, subheading, welcome_message, invitation_note}` into `events.translations[lang]`. Reuses `celebration_translation._gemini_translate`. Degrades to `{translated:false, reason:"translation_unavailable"}` when no AI key — never blocks the builder. 422 if language not in registry `supported_languages`.

**`event_rbac.py`** — 10 roles: `owner, event_admin, treasurer, gallery_manager, schedule_manager, volunteer_manager, decoration_manager, food_manager, volunteer` + super. ~25 permission constants (`event.view/edit/delete/publish/archive/restore/transfer/clone`, `builder.edit`, `gallery.*`, `schedule.manage`, `finance.*`, `members.*`, `reports.view`, `analytics.view`, `notifications.send`, `admin.moderate`). `CHILD_WRITE_PERM` maps collection→permission; expenses approve requires `P_FIN_EXPENSE_APPROVE` specifically.

**Frontend**: `/e/:slug` → `EventPublicInvitation.jsx` (885 ln), `/e/:slug/money` → `EventMoneyPortal`, `/events` dashboard, `/events/:eventId/builder`, `/events/preview/:eventType/:templateId`. All API via `services/eventApi.js` `EventService` (`publicRsvp`, `publicDonate`, `publicDonateOrder`, `publicDonateVerify`, `publicLeaderboard`, `publicBlessings`, `publicSubmitBlessing`).

---

## 8. What `/invite/:slug` actually fetches

`LuxuryPublicInvitation.jsx` `fetchInvite()`:
1. **`GET /api/invite/{slug}/full`** (batched, primary). On `401/403`→passcode prompt; `404`→"not found"; `410`→"expired"; other→soft-fall-through.
2. Fallback `GET /api/invite/{slug}[?passcode=]`.
3. Late fallback (800 ms timer, only if `/full` gave no gallery): `GET /api/public/gallery/{slug}/info`.
4. On wish submit: `POST /api/invite/{slug}/greetings`.
5. On RSVP submit: `POST /api/rsvp?slug={slug}`.

**`/api/invite/{slug}/full` response envelope** (server.py:4896):
```
{ invite: InvitationPublicView,
  wishes: [...approved, featured-first then newest, ≤wishes_limit(default 50, max 200)],
  gifts: <gift_registry doc | null>,
  blessings: {blessing_count, blessing_total_amount, wishes_count, recent_blessings[≤30],
              total_count, recent},          // both legacy + new key shapes
  gallery_info: {enabled,total_photos,downloads_enabled,watermark_*,upload_methods,privacy},
  shagun_enabled: bool, shagun: {…UPI deep links…},
  venues: {main_venue, events[]},            // duplicated logic, mirrors /venues
  travel: <travel_links.travel_payload_for_profile(profile)>,
  referral_code: <db.referral_codes.code> }
```
Perf machinery worth preserving: 15 s Redis cache keyed `full:{slug}:{n}`, **single-flight lock** (`lock:{ck}`, 10 s, up to ~2 s wait) to stop stampedes, views counted on cache hits too, all 8 side-queries via `asyncio.gather` with `_safe()` per-query fallback.

`/api/invite/{slug}` (non-batched) rate-limits **500/IP/day** (`invite_view`), fires `_track_invitation_view_audit` as a task (Redis-buffered counters, batch-flushed — deliberately avoids per-view `profiles` row contention).

**Other public `/api/invite/{slug}/*` (all unauthenticated by design)** — 34 routes:
`/full`, `/{event_type}`, `/event/{event_slug}`, `/calendar` (ICS; **registered twice** — an alias at server.py:5276 that must sit above the `{event_type}` catch-all, delegating to the real handler at 7336), `/qr` (PNG stream), `/room-lookup?name=` (min 2 chars, ≤10 matches, strips `phone`), `/rsvp/check`, `/eta` (OSRM), `/venues`, `/gifts`, `/shagun`, `/shagun/record`, `/shagun/razorpay/order`, `/shagun/razorpay/verify`, `/blessings`, `/itinerary?audience=`, `/travel`, `/live-gallery`, `/live-gallery/guest-upload`, `/live-gallery/favorite`, `/gallery/guest-upload`, `/songs`, `/song-requests` (GET+POST), `/greetings` (POST), `/wishes` (POST), `/check-in`, `/view`, `/track-language`, `/track-interaction`.
Plus `/api/profiles/{slug_url}/{share-metadata,qr-code,thank-you,album-media,memory-mode}` and `/api/profiles/{profile_id}/{features,templates}` — public. `/api/save-the-date/{slug}` — lightweight teaser (projection-only, no view tracking).
SSR/OG: `@app.get("/invite/{slug}")` (no `/api` prefix, server.py:10973) serves an OG meta-tag shell + JS redirect; mirror at `/api/og/invite/{slug}`.

---

## 9. Feature-by-feature

**Countdown** — pure frontend (`Countdown` exported from `LuxuryPublicInvitation.jsx:1694`), driven by `event_date` + `sections_enabled.countdown !== false`. No backend.

**Maps / venues (`map_features.py`, 427 ln)** — free/no-key stack: Nominatim (geocode + reverse), OSRM (`router.project-osrm.org`) for ETA, optional `WHAT3WORDS_API_KEY` (returns `{words:null, mode:"mock"}` when unset — graceful, honest).
Admin: `POST /api/admin/map/expand` (follows Google short URL redirects, extracts lat/lng via 3 regexes `@lat,lng` / `!3d..!4d` / `?q=lat,lng`), `GET /api/admin/map/search?q=&country=in`, `POST /api/admin/map/what3words`, `POST /api/admin/map/from-3wa`, `PUT /api/admin/profiles/{id}/events/{event_id}/venue`, `PUT /api/admin/profiles/{id}/main-venue`.
Public: `GET /api/invite/{slug}/eta?from_lat=&from_lng=[&to_*][&event_id]` (event-level pin overrides main), `GET /api/invite/{slug}/venues` → `{main_venue, events[]}` each with deep links `{google_maps, apple_maps, uber, ola, rapido, whatsapp_share, what3words_link}`.
**`travel_links.py` is the corrected single implementation** (docstring): Rapido's `rapido.bike/Booknow` **404s — no destination deep link exists**; Uber's raw `[`/`]` were RFC-3986-invalid and are now percent-encoded; exposes `carries_destination` per provider so the UI can be honest. **BUT `map_features.public_venues` and the inline `/full` builder still contain the OLD duplicated link code with raw brackets and the dead Rapido URL** — three copies, only one fixed.

**Hotels / accommodation** — `profiles.guest_rooms[]` (`GuestRoom`: guest_name, phone, room_number, building, floor, address, map_link, check_in, check_out, notes). Public lookup `GET /api/invite/{slug}/room-lookup?name=` strips `phone` from the response. Separate V2 mechanism: `viewer_v2.stay_guests[]` + `/api/v2/invitations/{slug}/stay-lookup`. "Hotels nearby" is a Google-Maps search link built in `travel_links.py`.

**Digital Shagun (`premium_features.py`)** — `profiles.shagun_settings` `{enabled, upi_id, payee_name, suggested_amounts[101,501,1001,2001,5001,11000], blessing_message, gpay/phonepe/paytm handles, razorpay_enabled, razorpay_key_id, razorpay_key_secret, platform_fee_percent 5.0}`.
Public `GET /api/invite/{slug}/shagun` builds `upi://pay?pa=&pn=&am=&cu=INR&tn=` deep links; returns `{enabled:false}` if disabled or no `upi_id`.
`POST /invite/{slug}/shagun/record` — **records an arbitrary client-supplied amount into `db.shagun_records` with NO payment verification** (blessing-counter only). `POST .../razorpay/order` uses the *photographer's own* keys (refuses placeholder secrets), `POST .../razorpay/verify` does real HMAC-SHA256 `order|payment` signature check then records with `platform_fee` split. `GET /invite/{slug}/blessings` = counter + wall-of-love.
**BUG in `/blessings`**: counts wishes with `{"is_approved": True}` — the field is `status`, not `is_approved`, so `wishes_count` is always 0 there. Also `"guest_wishes" in await db.list_collection_names()` on every request. (`/full` computes the same number correctly.)
**SECURITY: `razorpay_key_secret` is stored in plaintext on the profile doc and is returned by `GET /api/admin/profiles/{id}/shagun`.**

**Gift registry (`gift_registry.py`, 270 ln)** — own collection `db.gift_registry`, one doc per `profile_id`. `GET /api/gifts/presets` (8 built-in `DEFAULT_PRESETS`: blessing/shagun/cash/home/experience/jewellery/charity/pooja). `GET|PUT /api/admin/profiles/{id}/gifts`. Public `GET /api/invite/{slug}/gifts` — when disabled returns a polite `{enabled:false}` note rather than 404; **masks bank account to last 4 digits**; nulls UPI/bank/registry fields whose `accept_*` flag is off. Max 20 suggestions; headline ≤80, message ≤500; non-UUID client ids (`tmp-…`) are stripped and regenerated.

**WhatsApp** — three unrelated things:
1. Guest share button `components/luxury/WhatsAppShare.jsx` — pure client, `navigator.share` then `wa.me/?text=`. Fixed bottom-left, 3rd slot in the pill column.
2. Bulk send `POST /api/admin/whatsapp/send-invitation` + `/send-reminder` via **Twilio** (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM`); **falls back to `mode:"mock"` with fake sids when unconfigured** — logs to `db.whatsapp_logs`. Reminder types `7_days|3_days|1_day|custom`, targets `all|confirmed|pending`. Default `+91` prefix for bare numbers.
3. Event-engine WhatsApp channel — queued only (§7).

**Music (`music_library.py`, 191 ln)** — `GET /music/library`, `/library/by-category/{c}`, `/library/by-mood/{m}`, `/library/random`, `/library/search?q=`, `/presets[?category=celebration]`. **HONEST-STUB by design**: all 20 wedding + 10 celebration entries point at 16 SoundHelix demo instrumentals (`_sh(1..16)`), reused across entries; docstring says the previous version's 60 "Ganpati Aarti / Shehnai / Sitar" names were lies about the same files. Custom URL in the picker always wins. Categories: peaceful/elegant/pleasant/romantic/cinematic (wedding), lullaby/joyful/devotional/pleasant/cinematic (celebration). Per-profile playback via `background_music{enabled,file_url}` + `AmbientMusicPlayer`. Guest song requests are a separate feature (`song_requests_settings`, `db.song_requests`, `/invite/{slug}/song-requests`).

**Live photo wall** — `/invite/:slug/live-gallery` → `LivePhotoWall`. Photographer desktop uploader authenticates with `X-Uploader-Token` header against `db.uploader_tokens` (72 h default TTL, revocable) → `POST /api/live-gallery/desktop-upload`. Guest upload `POST /api/invite/{slug}/live-gallery/guest-upload` (base64, ≤8 MB, gated by `live_gallery_settings.guest_upload_enabled` AND `pricing_activation.has_feature(profile,"guest_uploads")` — **permissive on exception / legacy links**). **Known-bug fix in place**: photographer uploads land in `db.live_gallery_photos` while guest uploads land in `db.live_photos`; `live_wall_feed.fetch_wall()`/`find_photo()` read BOTH — the wall was permanently empty before. `admin_get_live_gallery` and `moderate_photo`/`delete_photo` still only touch `db.live_photos` ⇒ **photographer-uploaded photos cannot be moderated or deleted from the admin panel.**

**AI (premium_features)** — `/api/admin/ai/greeting-personalize`, `/translate-bulk`, `/story-v2` (logs `db.ai_story_logs`), `/enhance-image` (pure Pillow: autocontrast/brightness/contrast/color/warm-skin/2× LANCZOS/sharpen; no external API). Languages en/te/hi/ta/kn/mr/bn. Quota errors surface as 503 "AI muse is resting".

---

## 10. Multilingual mechanism — three writers, ONE BROKEN READER

Writers:
1. `celebration_translation.py` → `POST /api/admin/profiles/{id}/translate` (deducts **1 credit** from photographer wallet, 402 on insufficient) and `POST /api/users/profiles/{id}/translate` (free). Gemini 2.5 Flash, `responseMimeType: application/json`, temp 0.2. Languages `tamil|telugu|kannada|malayalam|hindi` (english = source, rejected). Persists `profiles.translations.<language>`. Source payload = `{invitation_message, story, closing_message, subtitle, welcome_blessing}` from `celebrant_info`.
2. `server.py:14790` auto-translate → `profiles.translations` + `translations_updated_at`; `TRANSLATABLE_FIELDS = [bride_name, groom_name, venue, venue_address, story, wedding_invitation_text, welcome_message]`. Read back via `GET /api/admin/profiles/{id}/translations`.
3. `event_translation_service` → `events.translations` (event engine only).

Reader: `LuxuryPublicInvitation.jsx:330-341` builds a language switcher from `Object.keys(data.translations || {})` and resolves `data.translations[activeLang][field]`.

🔴 **BROKEN — `InvitationPublicView` (models.py:1797) has NO `translations` field, and `_build_invitation_public_view` (server.py:4805) never sets it.** `Profile` doesn't declare it either (survives only because it's an extra key on the raw doc). So `data.translations` is **always undefined** on the public page: the language switcher never renders and every credit spent on AI translation buys content that is never displayed. Two separate writers, one paid, zero readers. **Fix = add `translations: Dict[str,Dict[str,Any]] = {}` to `Profile` + `InvitationPublicView` + pass it through.**

Note the two coexisting language vocabularies: profile-level `enabled_languages` uses full English names (`telugu`, `tamil`) while premium/event AI endpoints use ISO codes (`te`, `ta`). No mapping layer exists.

---

## 11. Collections touched by this domain

`profiles`, `profile_media`, `greetings`, `guest_wishes`, `wish_rate_limits`, `invitation_v2_comments`, `rsvps`, `captcha_challenges`, `gift_registry`, `shagun_records`, `live_photos`, `live_gallery_photos`, `uploader_tokens`, `whatsapp_logs`, `ai_story_logs`, `song_requests`, `referrals`, `referral_codes`, `view_sessions`, `invitation_orders`, `face_match_records`, `app_settings`.
Event engine: `events`, `invitations`, `event_registry`, `event_members`, `event_audit_logs`, `event_notifications`, `event_rsvp`, `venues`, `organizers`, `festival_schedule`, `celebration_journey`, `highlights`, `prasadam_menu`, `event_blessings`, `gallery`, `albums`, `donations`, `sponsors`, `expenses`.

---

## 12. BROKEN / STUBBED / DOCUMENTED-BUT-NOT-IMPLEMENTED

🔴 **BROKEN**
- `profiles.translations` never reaches the public page (§10). Paid feature, zero output.
- `premium_features` `/invite/{slug}/blessings` queries `guest_wishes.is_approved` — field is `status` ⇒ `wishes_count` always 0.
- Admin live-gallery moderate/delete only touch `db.live_photos`; photographer photos in `live_gallery_photos` are unmoderatable/undeletable.
- Rapido deep link `rapido.bike/Booknow` (404) and unencoded Uber `dropoff[latitude]` still live in `map_features.public_venues` and the inline `/full` venue builder — fixed only in `travel_links.py`.
- `Profile` uses `extra="ignore"`; three fields were silently dropped in production history (`design_selections`, `faq_settings`, per model comments). Any new field must be added to `Profile` **and** `ProfileCreate`/`ProfileUpdate` **and** `InvitationPublicView` or it vanishes.
- `export_rsvps_smart` xlsx fallback calls `.__wrapped__` on itself.

🟡 **STUBBED / NOT WIRED**
- Google Drive auto-upload for QR photos + selfies — folder-id fields and `face_match_records` exist as plumbing; **no service-account credentials, no upload code** (`INVITATION_FULFILLMENT.md` §AI face match).
- AI face match itself — FUTURE, plumbing only.
- Video transcode (`VIDEO_TRANSCODER = None`), virus scan (`scan_clean` returns True), signed URLs, S3/CloudFront (conditional) — all in `event_media_service`.
- WhatsApp / SMS / push notification channels — outbox queues, no vendor; the "configured" branch returns `sent` without sending.
- Twilio WhatsApp falls back to `mode:"mock"` with synthetic sids.
- What3Words returns `{mode:"mock"}` without an API key.
- `music_library` URLs are 16 SoundHelix demo files reused across 30 named entries (deliberate, documented).
- `WeddingEvent.video_invitation_*` — declared placeholders.
- Event engine: real payment verification, granular 10-role matrix, QR/asset generation, auto-translation at the children level — all `DEFERRED` in `event_children_service` docstring.
- `POST /invite/{slug}/shagun/record` accepts an unverified client-supplied amount.

🟠 **RISK / ORPHANED**
- Whole event engine is behind `ganesh_module_enabled` (default OFF) with exactly one registered event type.
- `invitation_v2` (`/api/v2/*`) has a complete backend and **no discoverable frontend consumer**.
- `stay-lookup` bidirectional substring match leaks the guest list from a 2-char query; V2 comments have no rate limit at all.
- `/invite/{slug}/rsvp-smart` bypasses the rate limit + CAPTCHA that `/api/rsvp` enforces on the same collection.
- `razorpay_key_secret` stored plaintext on the profile and returned by the admin GET.
- Venue-deep-link logic exists in 3 copies; shagun payload in 2; travel payload in 2 (one fixed).