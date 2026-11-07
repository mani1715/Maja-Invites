> Update, 13 October 2026: the ten-design implementation, publishing workflow and verification are documented in [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md). Review all ten [desktop/mobile proposals](ten-designs.html). The audit below describes the original system.

# Photographer portfolio design review

Prepared for Maneesh · 11 October 2026 · MAJA Invites / Pixora

**Recommendation: build Folio first, after draft isolation.** Its portrait-led opening, asymmetric spreads, and restrained studio narrative create the clearest change from the current profile page. It works with a small, carefully selected body of work and does not need video, awards, reviews, or package pricing to feel complete. Afterglow is the alternative if immediate photographic impact is the priority; it needs stronger hero curation.

Open `index.html` for the review board or `concept.html?concept=editorial` for a working page. Everything is isolated under this directory. No production renderer, database, route, subscription plan, or deployment was changed. Forms are local demonstrations and never submit leads. Filters, anchor navigation, photo viewing, keyboard arrows, Escape, focus restoration, and touch swipes are implemented. Project photography is illustrative; no actual couple is assigned a fictional identity.

## 1. What the audit gets right—and what needs correcting

The brief was read first from `docs/ASTRA_PHOTOGRAPHER_PORTFOLIO_CONTEXT.md` in the nested `maja_invites-main` repository. Findings below are based on the current checkout, not a production-server inspection.

| Finding | Verified current behavior | Design implication |
|---|---|---|
| Nine palette swaps | Confirmed; in fact **all ten currently enter the same JSX tree**. `PhotographerPublic.jsx` resolves tokens, not layout components. | Four actual layout components, with independent composition and responsive rules. |
| Editorial unavailable | Its original asymmetric renderer remains only in legacy `frontend/src/portfolioLayouts/premiumEditorial.jsx`. V2 now resolves Editorial's own sand/copper tokens but **still prints the notice claiming a default-premium fallback**. | Preserve the old ID; do not silently replace its visual output while introducing a real editorial layout. |
| Profile-style opening | 30vh hero; shell pulled up by 64px; avatar is an 88px **rounded square**, not a circle. | Studio wordmark, deliberate photograph and typography; no overlapping avatar. |
| Cropped photography | `.mjpf-gallery-item img` forces 4:5 and `object-fit:cover`. Main work figures have no click handler. | Natural ratio images and a shared accessible viewer. |
| No viewer anywhere | Too broad. Main Works lacks one, but `components/community/StudioShowcase.jsx` has a separate highlight viewer with prev/next. | Consolidate the accessible media primitives; do not lose highlights. |
| Only palette changes | `signature` and `depth` do not drive the V2 public composition. Sample cards illustrate tokens without real photos. | Compare the same photographed content in full pages. Decorative motif implementation is not the goal. |
| Data architecture | `server.py:162–165` imports `pg_adapter.Database`, requires `SUPABASE_DB_URL`; `pg_adapter.py` uses asyncpg and JSONB tables. Deploy compose specifies `postgres:16-alpine`. | **PostgreSQL, with Mongo-shaped methods; not deployed MongoDB.** Runtime production health/version was not queried. |
| Flat portfolio document | Inaccurate. Profiles, albums, works, testimonials, branding and CRM are separate logical collections backed by PostgreSQL tables. | Introduce a normalized rendering contract; keep ownership joins explicit. |
| Editor APIs | Actual paths are `/api/portfolio/profile`, `/design`, `/works`, `/albums`, `/testimonials`, `/team`, `/tier`; not `/api/studio/portfolio`. | Extend the real contracts. Existing UI route remains `/studio/portfolio`. |
| Lead API | Actual POST is `/api/public/photographer/{id-or-slug}/enquiry`. Stores `pixora_crm_clients` and `pixora_crm_timeline`. | Reuse it; add a public API client function and one shared form. |
| Date availability and notifications | No collision lookup or email/WhatsApp dispatch in `portfolio_leads.py`. `availability_status` is a manually supplied string, not a calendar. | “Enquire about your wedding”; never “Date available”, “Reserve” or “Check availability”. |
| Published separation | No draft snapshot. Profile updates, work/testimonial edits and design changes mutate current records. `publishNow` writes the same profile with a boolean; selecting a design saves immediately. Public portfolio GET does **not** reject `is_published:false`. | A Publish button alone does not provide staging. Fix the architecture before offering safe editing. |
| SEO route | Current verified handlers are `/photographer/{slug}`, legacy `/photographer/{slug}/portfolio`, and `/api/og/photographer/{slug}`. `/p/` links occur elsewhere, but the claimed `/p/{slug}` SEO handler was not found in inspected backend routes. | Preserve existing canonical handlers; trace deployed `/p/` routing before changing any alias. Do not assume the brief's route contract. |

All 20 design screenshots plus sample and editor captures were inventoried and reviewed in `previews/audit-contact-sheet.jpg`; Editorial desktop and the editor were also inspected at larger size. The original images are in the audit script's referenced Antigravity artifact directory. They contain **broken photography**, including the hero and thumbnails. They demonstrate repeated composition, but cannot visually establish cropping quality; that conclusion comes from CSS. Do not rerun the original capture script casually: it mutates the demo profile's live design ID.

The current page also omits meaningful saved fields such as `past_works`, studio photographs and team. It prefers all `works` over `featured`, so selection is not actually honored as curation. Services and FAQ do not consistently use section gates; the whole profile is returned even where rendering is gated. Existing front-end comments about full-replacement work updates are stale: the backend now uses `exclude_unset=True` (with title still required by `WorkIn`). These are contract issues to resolve, not copy into the new renderer.

## 2. Four distinct concepts

| | Afterglow · Cinematic | Folio · Editorial | Open Frame · Gallery | Studio House · Contemporary |
|---|---|---|---|---|
| Opening | Wide, edge-to-edge photograph with bottom-aligned title | Large off-center title, full portrait at right, small landscape detail at left | Compact heading straight into varied-ratio photography | Business introduction at left; tall photograph at right |
| Navigation | Horizontal studio header; persistent mobile enquiry | Thin magazine masthead; quiet inline links | Persistent desktop side index; compact mobile header and category controls | Clear business header and early enquiry action |
| Sequence | Hero → stories → studio → portrait/detail → services → enquiry | Editorial opener → photograph spreads → studio → services → enquiry | Photo browsing → collections → studio → services → enquiry | Split hero → services → work → studio → enquiry |
| Photo presentation | Alternating portrait/landscape stories and a wide chapter | Deliberate 5/7 and 4/8 relationships; generous whitespace | Natural image sizes in a staggered grid, filters and full-screen viewer | Balanced project pairs; smaller portrait and landscape pair below |
| Mobile | Complete landscape image then separate title; sticky enquiry | Title → portrait → introduction → detail; asymmetry becomes intentional margins | Single photograph stream; portrait inset, landscapes full width; no lateral scrolling | Copy and CTA first, portrait second; services become ruled rows |
| Sparse mode | One story; no padded hero placeholder | One portrait can carry the whole identity | Remove categories with no members in production; single-column browsing | One service list and photograph; omit trust/price modules |
| Best fit | Studios with a strong cinematic signature | Curated wedding and editorial practices | Photographers selling through depth of work | Studios whose clients need service and booking information |
| Main tradeoff | Hero crop and contrast need editorial control | Requires meaningful curation, not random uploads | A large library needs loading and filter discipline | Requires more accurate business content to reach full potential |

All use one fixture: **Lumiere Stories**, based on the audit's fictional Udaipur studio, the same tagline/about copy, four service labels, and five real reference photographs. Photos span portrait, landscape, detail and celebration compositions. They are stock references, not Lumiere's work; the page banner and credits state this. No awards, client totals, experience counts, verification badges, ratings, reviews, team identities, prices, or turnaround claims have been invented. Empty optional modules are intentionally omitted in every preview. There is no availability widget.

## 3. Section-by-section specification

### Afterglow

1. **Header:** left wordmark, Work / Studio / Enquire. Omit optional links when their sections do not render. No platform marketing navigation inside the studio site.
2. **Photographic prologue:** selected landscape hero. Desktop maximum 1000px, preferred 78vh; title on a restrained bottom scrim. Editor chooses focal point and checks both breakpoints. Mobile shows the entire landscape, then solid-background title: do not force a wide ceremony into a phone-height crop. A portrait hero switches to a contained image with adjacent text.
3. **Selected stories:** one tall project lead at left, larger landscape at right, then one broad chapter. Titles and location, where saved, sit below the photo. Project action opens its scoped story viewer; the preview demonstrates photo viewing only.
4. **Studio statement:** two columns, prominent editorial sentence and actual `about` text. Collapse to one column on mobile.
5. **Detail interlude:** portrait beside `cover_description` or studio tagline; omit when no second image. No autoplay film or looping zoom.
6. **Services:** numbered, ruled text rows, not decorative cards. Films may follow only when valid video exists, using a poster and explicit play button.
7. **Optional trust/business:** one real review at a time in normal document flow; actual packages as text rows if supplied. No carousel required. Team stays a compact list in the studio block.
8. **Enquiry and footer:** shared form; mobile bottom action links to it and reserves safe-area space. Preserve server-authorized branding.

### Folio

1. **Masthead:** wordmark and a fine rule; Work / Enquire retained on mobile, Studio available in page flow.
2. **Cover composition:** short large heading at left, intact portrait at right, small landscape beneath the introductory note. Portrait is not cropped to match a neighboring text column. Missing detail removes that slot and its gap.
3. **First spread:** section number, editorial heading, broad natural-ratio photograph centered below.
4. **Second spread:** portrait at left, short narrative above a landscape at right. Alternate group proportions, not alternating colour cards. Use saved project story/description; omit the text when absent. Phone order follows the reading order: portrait → story → landscape.
5. **Studio essay:** restrained display heading and readable about text. Optional studio photos and a real named team list belong here, not a fabricated “founder” feature.
6. **Services / optional reviews / packages:** compact lower-page material. Real review uses a plain quotation and attribution; packages become ruled rows. No empty titles or reserved blank grids.
7. **Enquiry:** paper-toned two-column closing section. One column on phone, with the form below the introduction.

### Open Frame

1. **Desktop side index:** 240px column containing wordmark, real location, section links and enquiry. Sticky only while it fits the viewport; browser zoom must allow normal scroll.
2. **Opening:** short heading, followed immediately by category filters and images. No oversized empty hero.
3. **Photograph wall:** explicit CSS Grid rows with natural image heights, not experimental native masonry or CSS columns that scramble keyboard reading order. Initial batch ≤12 images; production offers “Load more” with a real count. No infinite-loading trap.
4. **Collections:** albums/projects with title and cover, linked to scoped viewing. Preview's category shortcuts are local filters, not server-backed albums. Keep active category in URL state in production.
5. **Studio / services:** quieter supporting material after browsing. Real reviews and packages may appear here if present and entitled.
6. **Mobile:** single-column stream with portrait insets, full-width landscapes, wrapping filters and 44px controls. Keep scroll position when returning from viewer. Compact enquiry in top header; no bottom overlay across photographs.
7. **Enquiry and footer:** same contract and transparent result states as other concepts.

### Studio House

1. **Header:** conventional wordmark and primary navigation. Add Services / Team only when actually rendered; menu disclosure is needed if real content creates more than four links.
2. **Split hero:** strong studio introduction, location, direct enquiry, secondary work link, tall photograph fully preserved. Phone puts useful text and enquiry before the photograph.
3. **Services early:** strong heading plus ruled service list. Optional descriptions require new fields; do not fabricate from service names.
4. **Selected projects:** offset two-up landscape pair followed by a quieter portrait/landscape pair. Story information below each image. Collapse to ordered single-column rows on phone.
5. **Studio and team:** about, optional working location/studio photos, then named team as text rows (existing team supports name, role, portfolio link, **not headshot**). Add portraits only after a proper media field exists.
6. **Testimonials:** optional, only genuine `text`, `author`, rating. Limit visible quotes to avoid a wall of proof. No supplied reviews in this fixture, so absent in previews.
7. **Packages:** optional, use actual public catalog `price_inr`, `unit`, `description`, `includes/features`. Desktop three ruled columns at most; mobile stacked rows. Package CTA pre-fills a message in the enquiry form. No new platform price or tier decisions. A blank price is “Price on request”, not ₹0.
8. **FAQ / logistics:** native disclosure rows, only real q/a. Show saved delivery/travel details only if supplied; no default promises.
9. **Closing enquiry:** dark olive field with clear light controls; optional real phone/email links alongside the form. No direct-call links in the mock because no verified studio contacts were supplied.

## 4. Shared visual and interaction system

| Token / behavior | Specification |
|---|---|
| Typography | Prototype uses local Georgia and Arial, so review does not depend on a font CDN. Production candidate: licensed/self-hosted Cormorant Garamond for Folio, restrained display serif for Afterglow, neutral grotesk for Open Frame, serif/grotesk pairing for Studio House. Choose final font after testing real studio names and Indian-language fallback; a font is not a layout. |
| Scale | Desktop display 68–112px; phone 54–62px; section heads 40–64px; body 16px/1.6; form labels 12–14px; essential captions ≥12px production. Eyebrows 10–11px with moderate tracking. No fixed-height text boxes. |
| Width and rhythm | Max content 1600px; prose 55–65ch. Desktop margins 5–8%, mobile 20–22px. Spacing unit 4px; normal gaps 16/24/32; major desktop sections 70–100px, mobile 48–60px. The gap belongs to the visible section; absent sections create none. |
| Afterglow | Charcoal olive #181B17; ivory #F4EFE4; muted #BEC1B6. Photography supplies the saturated colour. One functional hero scrim only. |
| Folio | Paper #F4F0E7; olive ink #343829; secondary #656756; hairlines #D4D4C9. |
| Open Frame | Near-white #FBFAF7; ink #282B27; secondary #60655E. No ornamental frames or shadows. |
| Studio House | Chalk #F6F6F0; evergreen #233F37; secondary #56695E; support #E6EBE1. |
| Contrast | Target WCAG AA: 4.5:1 normal text, 3:1 large text and meaningful control boundaries. Photograph-overlay contrast must be measured on the selected hero; mobile avoids overlay text. Do not use an arbitrary studio accent as body text until checked. |
| Photography | Preserve intrinsic aspect ratio for galleries and project detail. Cropping allowed only for an explicitly selected hero/cover with focal preview and uncropped viewer. Save width/height to prevent layout shifts. Provide 480/960/1600 derivatives and responsive `srcset`; viewer requests display derivative, never an original/master. |
| Loading | Eager/high-priority only for LCP image; lazy/decode async below the fold. No blank hero placeholder if there is no asset: render typography-led header. Reserve intrinsic dimensions in production; failed image removes its media slot while retaining a meaningful project link. |
| Full-screen viewer | Native dialog in prototype; contained image; labelled Close, Previous, Next; Escape/arrows; focus trap via dialog, return focus, scroll lock, touch swipe with buttons as alternatives. Production scope is selected project/filter; preload adjacent display images only; no EXIF/location disclosure by default. Prototype viewer intentionally traverses all five reference images. |
| Motion | 160–200ms opacity/colour feedback, optional 180ms viewer fade. No scroll hijack, parallax, auto slideshow, zooming hero, decorative particle effects or continuous motion. Reduced-motion removes animation and smooth scroll. |
| Responsive | 320–600: single-column intentional order; 601–1023: two-column where readable; ≥1024: full composition. Touch actions ≥44px. Handle safe areas, browser zoom, long titles, RTL/localized content before release. |

Sparse rules: zero photos → text-led studio opening and enquiry, no borrowed imagery; one photo → use it once prominently and omit duplicate projects; one work → full-width story; no about → omit essay and link; no team/reviews/packages → omit section and nav; no contact channels → retain real enquiry form if studio resolution succeeds. Do not insert published demo content. The sparse preview demonstrates removal of services and most images, not every possible empty-state permutation; zero-content, failed-media and long-content fixtures belong in implementation acceptance tests.

## 5. Content model and editor requirements

Use a **single normalized view model**, then four structural renderers (`AfterglowLayout`, `FolioLayout`, `OpenFrameLayout`, `StudioHouseLayout`). Reuse media/viewer/form primitives, but do not force layout wrappers or section order to be identical. The public route remains `/photographer/:slug`.

| Need | Existing source | Required change / safeguard |
|---|---|---|
| Identity | `studio.name`, `profile.studio_name`, tagline, about, cover_description, location/contact/social | Normalize without silently dropping any raw fields. Respect entitled white-label decision. No subscription tier shown as a quality endorsement. |
| Hero | `profile.hero_image`; `avatar` | Add `presentation.hero_asset_id`, desktop/mobile normalized focal x/y, fit mode, optional mobile asset. Keep legacy hero fallback; do not reinterpret avatar as logo without owner choice. |
| Logo | avatar and entitled `white_label.logo_url` | Add explicit light/dark logo variants, alt/name and sizing. Validate contrast. Branding entitlement stays server-authoritative. |
| Projects | `portfolio_works`: title, description, story, date, venue, location, image_url, thumbnail_url, video_url, gallery, featured, album_id | Reuse `featured`; add ordered featured IDs. Gallery currently string URLs: additive metadata keyed by stable asset ID for alt/caption/dimensions/focal point. Never destructively rewrite arrays on read. |
| Curated highlights | `profile.past_works[{image,title,caption}]`, capped 5 | Separate legacy highlights from structured works. Offer owner-assisted conversion, preserve originals and stable identifiers. No invented couple/date fields. |
| Collections | `portfolio_albums` with title, category, cover_image, description; separate public Pixora highlights/items | Normalize both explicitly; do not conflate collections with client-delivery galleries or expose private gallery URLs. |
| Studio media | `profile.studio_photos[{image,caption}]`, capped 12 | Use for place/behind-the-scenes, not as the primary wedding gallery. |
| Services | profile.services string list, styles | Optional `service_details` keyed by service ID if descriptions needed. Empty list means no section. |
| Team | `profile.team_members` through premium-gated `/api/portfolio/team`: name, role, portfolio_link | Add portrait asset/alt only if needed. Preserve premium enforcement and ownership. |
| Testimonials | `portfolio_testimonials`: author, text, rating | Real supplied reviews only; exclude placeholder-marked entries consistently from display and schema. No seed reviews in live pages. |
| Packages | Public `/api/public/pixora/packages/{sid}`; profile.pricing_packages also exists | Make catalog the proposed display source, but inventory both and ask owner to resolve conflicts; do not overwrite either. Keep saved amounts/currency behavior. |
| Layout preferences | `design_id` currently | Add schema version, layout ID, preset ID, section order, caption visibility, gallery density, optional hero heading override. Whitelist each setting per layout. |
| SEO | seo_title/description/keywords; `portfolio_seo.resolve_seo`, server crawler routes | Render metadata from published snapshot. Keep canonical and legacy aliases; preserve premium JSON-LD/keyword gate and thin-content noindex logic. |

Editor proposal: **Content / Layout / Branding / Enquiries / Publish**. Separate tier/admin billing from creative editing; keep a clearly accessible plan link. Content edits a shared dataset. Layout shows accurate thumbnails and side-by-side desktop/mobile preview, not palette cards. Selecting a concept updates only the draft. Use native reorder controls with Move up/down alternatives to drag-and-drop. Expose just the preferences relevant to a layout. Show hidden-by-plan sections explicitly to the owner without deleting their data.

Add an image inspector with uncropped original composition preview, focal crosshair, desktop/mobile crop preview, alt text and caption. “Hero image” and “Featured work” are separate choices. Empty-content guidance lives in the editor only. Long studio names wrap naturally. Section visibility is the intersection of real content, explicit owner preference, and server entitlements.

### Enquiry contract

Production posts `{name, phone, email, event_type, event_date, message}` to **`/api/public/photographer/${encodeURIComponent(slug)}/enquiry`**. Name required; at least phone or email; email validated. Venue is not a standalone backend field: keep it in message unless explicitly added. Event date is optional plain enquiry data, never a booking check. Current limits: name 120, phone 40, email 160, event type 60, date 20, message 2000 characters.

Pending: disable duplicate submission, retain inputs. Success: “Your enquiry was received. The studio can reply using your contact details.” Do not promise response time or notifications. Validation/400/422: inline field or form error. 404: studio unavailable, preserve text. 429: retry-later message. Network/5xx: keep fields and show actual configured alternate contact. Do not blindly retry POST: CRM plus timeline writes currently lack a transactional/idempotent request boundary. Add request idempotency and a transaction before automatic retry. Current throttle is eight/IP/studio/hour and fails open when limiter errors. Decide operational spam protection and notification delivery separately; neither is a visual availability feature.

## 6. Actual gates, without new pricing decisions

| Existing gate | Current code behavior |
|---|---|
| Design selection | Backend `normal` (frontend free) → `free_studio_neutral`; basic adds `basic_golden_hour`, `basic_darkroom`, `basic_nordic`; premium adds all six premium IDs. POST `/api/portfolio/design` rejects unknown or above-tier IDs with 403. |
| Existing public design | Known saved ID is resolved without a new public tier check. Unknown/missing falls back by tier. Do not blank a site on downgrade or silently reinterpret a saved ID. |
| Sections | No active portfolio subscription gets hero/about/services/featured_work/availability/contact. Active plan with a nonempty explicit `portfolio_sections` list gets that valid list plus forced hero/contact. Active plan without it gets all 15 defaults, **including basic plans**. Never hardcode the brief's simple basic/premium section matrix. |
| Storage | Free 500 MB; paid defaults 5 GB basic / 20 GB premium, overridable by plan. Shared media pool with server-accounted bytes. The declared free 2-photo/1-video constants are not referenced in the current upload/create handlers; do not present them as enforced item limits. |
| Content counts | Past works 5, studio photos 12, FAQ 15, team 30 in inspected save handlers. The brief's 2/3/5 works and 6/15/30 highlights matrix is not the verified implementation. Public works fetched up to 500; current UI truncates at 24. |
| Leads | Stored for every tier. CRM management has its own gate. No basis here for a premium-only form. |
| SEO | Main public payload `seo` only for premium. Crawler resolver still emits base title/description/canonical/OG for other tiers; keywords and JSON-LD are premium-only. Thin-content indexing depends on content, not simply tier. |
| Team / build help | Team save requires premium. Build help unlocks by premium or separately paid build-help status. Preserve existing flow and prices. |
| White label / domains | White-label entitlement is super-admin granted; hide-platform-branding honored only when entitled. A stored `custom_domain` is not proof of active DNS/host routing or a blanket premium entitlement. Verify routing before promising it. |

No new design is allocated to any subscription tier in this proposal. For development, use internal feature flags; before customer rollout, obtain entitlement policy, extend the existing server allowlist and test it. The plan UI must continue reading server plans rather than embedding amounts.

## 7. Safe publishing and migration plan

1. **Inventory and capture:** enumerate existing IDs, slugs, aliases, profiles, works, albums, testimonials, package sources and actual plan overrides read-only. Snapshot current public JSON/SEO/screenshots for real content-rich and sparse portfolios. Confirm `/p/` behavior at ingress and SPA; preserve it if currently live. No automatic re-slugging.
2. **Fix the publication boundary first:** add versioned PostgreSQL snapshot storage, e.g. `portfolio_versions` with studio_id, version, schema_version, complete public document, media refs, created_by, created_at, and published pointer. Add explicit indexes/uniqueness rather than relying on generic lazy-created GIN tables. Use an actual SQL transaction or compare-and-swap revision; Mongo-style method names do not imply Mongo transactions.
3. **Seed without disappearance:** all currently reachable portfolios retain their current public output as baseline v1, even where the boolean conflicts with actual visibility. Flag conflicting `is_published:false` records for owner/admin review; do not mass-unpublish. Brand-new studios start as unpublished drafts. Treat explicit unpublish as a separate, intentional action.
4. **Draft covers everything:** profile, works/order/captions, testimonials, albums, team, presentation settings and package display references must be part of preview state. Snapshot presentation data so deleting/editing a shared work or catalog package cannot mutate the published page indirectly. Decide whether transactional product prices should instead update independently and disclose that behavior. Pin media references so draft deletions never remove files used by a published version.
5. **Authenticated preview:** proposed draft APIs require `require_admin` and derive owner from the JWT, never caller studio ID. Preview is authenticated or short-lived scoped token, noindex, private/no-store, never in sitemap. Save Draft ≠ Publish. Use expected-version checks and clear conflicts. Publish revalidates content, ownership, media access and entitlements, then atomically switches the published pointer. Rollback republishes a retained version with the same validation.
6. **Compatibility registry:** every existing design ID stays mapped to `legacy-stack-v1` plus its exact existing palette/font overrides. Keep `premium_editorial`'s legacy behavior until an owner opts into the real Folio layout; its misleading notice can be fixed separately. Store `legacy_design_id`, `layout_id`, `layout_version`, `preset_id`; never repurpose an old ID. New internal candidates: `afterglow_v1`, `folio_v1`, `open_frame_v1`, `studio_house_v1`. These are not yet saleable tier assignments.
7. **Implement shared adapter and primitives:** normalize legacy fields without deleting data. Preserve `resolveMediaUrl` path normalization but recognize it is **not** a derivative-security layer. Backend must provide public-safe display derivatives and verify media ownership; never concatenate original/master asset URLs in the viewer. Sanitize rich content and validate external links. Scope work/album/media references to studio; verify album ownership rather than relying on client filters.
8. **Folio pilot:** feature-flag only, owner's opt-in draft, compare old/new at desktop/mobile, explicit Publish. Keep old renderer fallback behind saved version, not an automatic switch. Add remaining layouts only after composition review.
9. **Verification before release:** existing URL/canonical/OG/JSON-LD/sitemap equivalence; plan downgrade and multiple subscriptions; no cross-studio read/write/asset references; draft absent from all public paths including individual work and highlight endpoints; publish conflict/rollback; lead success/validation/429/network/idempotency; no-original-media exposure; no fabricated content; keyboard, touch, reduced motion, 320/390/768/1024/1440 widths, long/localized copy, empty/one/many/failed images, slow network, landscape phone. Target LCP ≤2.5s, CLS ≤0.1, INP ≤200ms on representative mobile; these are targets, not measured preview results.

Do not maintain two live write paths once draft mode is enabled: adapt the existing editor and assisted-build writes to draft storage, or explicitly deny unsupported legacy mutations for migrated studios. Public portfolio, SEO, directory, work details and package/collection presentation must agree on the published version. Preserve existing ownership checks and strengthen any gaps discovered; the redesign must not introduce a bypass through a convenient preview endpoint.

## 8. Genuine unresolved decisions

1. Which composition should proceed: Folio recommended, or Afterglow/Open Frame/Studio House? Palette refinement follows structural selection.
2. Which owner-approved photos and wordmark represent the pilot studio? Reference photos cannot represent a customer's actual work. Confirm hero crop and final font/language coverage with those assets.
3. Package source conflict: profile pricing versus public catalog; should published display pricing be versioned or intentionally live? This affects draft promises.
4. Publication migration policy for records explicitly marked unpublished but currently publicly readable, and public behavior after intentional unpublish (404/410/contact-only). Preserve current URLs until decided.
5. Entitlements for the **new** layouts and any custom domain service. No new prices or tier assignments chosen here.
6. Who receives/manages leads on each plan, and whether reliable email/WhatsApp notifications should be added. Current capture is broader than CRM management access.
7. Which section-order constraints should be exposed? Recommend guarded presets first; unrestricted drag-and-drop can destroy the chosen composition.
8. How `/p/` is actually routed in the deployed environment. The brief claims an SSR contract not found in the current backend.

## Evidence map

- `frontend-v2/src/pages/PhotographerPublic.jsx` and `.css`: public composition, omissions and image crop.
- `frontend-v2/src/lib/portfolioDesigns.js`: token catalog, tier resolver and defaults.
- `frontend-v2/src/pages/StudioPortfolio.jsx`, `.css`, `StudioPortfolioBuild.jsx`: current save, publish, design and build-help flows.
- `frontend-v2/src/components/studio/PortfolioGallery.jsx`: album/work creation and featured control; actual captions need richer editing.
- `frontend-v2/src/components/community/StudioShowcase.jsx`: actual public highlights/packages component (the context's studio path is inaccurate).
- `frontend-v2/src/api/portfolio.js`, `publicPortfolio.js`, `publicCatalog.js`: real client API paths.
- `frontend/src/portfolioLayouts/premiumEditorial.jsx`: legacy-only layout reference; not copied into production.
- `backend/portfolio_service.py`: profile/work models, partial updates, limits, tier resolution, section gates, public output and SEO resolver.
- `backend/portfolio_leads.py`: actual enquiry payload, CRM writes and throttle.
- `backend/portfolio_seo.py`, `backend/server.py`: metadata and canonical crawler routes.
- `backend/pg_adapter.py`, `deploy/docker-compose.yml`: PostgreSQL architecture.
- `backend/white_label_service.py`: enterprise branding entitlement.

The original brief remains unchanged. Treat this review as its verified correction and proposed next step.
