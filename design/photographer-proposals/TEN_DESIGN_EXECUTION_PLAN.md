# Ten-design photographer portfolio redesign — execution plan

Prepared for Maneesh · 11 October 2026

**Status: planning completed before implementation; local implementation and verification completed on 13 October 2026.** This is the original design and execution specification. See [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) for what shipped locally, verification evidence, deliberate scope choices and release dependencies, and [ten-designs.html](ten-designs.html) for all ten desktop/mobile previews. Nothing has been deployed or migrated in production.

## 1. Outcome and non-negotiable boundaries

Deliver ten genuinely distinct layouts under the ten existing design IDs. A photographer can discover eligible designs, edit a private draft, preview it in the same renderer used publicly, deliberately publish, and recover the preceding publication. Existing public portfolios retain their current layout until the owner explicitly publishes a redesigned version.

Scope: `/photographer/:slug`, `/studio/portfolio`, `/portfolio-samples`, their portfolio data and related public/SEO readers. Preserve invitation, client-gallery, community, billing and developer-portfolio behavior. No stack replacement or new UI framework. Changes are local until a separate deployment request.

Execution order is fixed: **verify contracts → build ten-design review board → build publication safety → integrate editor/public renderer → verify all ten → hand off**. Visual components can be built for isolated samples before publication work; public customer routing cannot switch before publication tests pass.

## 2. Verified ground truth

Read the original context, previous `REVIEW.md`, existing board/components, registry, editor, public renderer, portfolio backend, adapter, pricing catalog, subscription seeding, directory, route definitions and ingress configuration. Also made a read-only request to the running **local** `/api/subscriptions/plans?product=portfolio`; the five paid plan mappings below matched code. This was not a production database inspection.

- PostgreSQL is required by `backend/server.py`; `pg_adapter.py` uses asyncpg and JSONB. Collection-shaped methods are an adapter interface, not MongoDB deployment.
- `update_one` and `find_one_and_update` use guarded row-locking SQL. The latter returns an after-image, even when callers might expect Mongo-style pre-image semantics. A group of adapter calls does **not** share a transaction automatically.
- Current editor design selection immediately POSTs `/api/portfolio/design`; profile/work/review edits are also direct writes. A client request counter does not protect concurrent edits across tabs.
- Existing public portfolio GET does not enforce `is_published:false`. A boolean alone cannot become the new publication boundary.
- Current ten IDs all use one V2 composition. Editorial has its own palette, but its asymmetric layout is absent and its fallback notice remains.
- `/p/:username` is explicitly routed to **PixoraProfile**, backed by `/api/public/p/{username}`. It is not the portfolio SSR route described in the initial brief. Leave its route/identity intact; inspect its portfolio-content reader for draft leaks.
- Canonical portfolio SEO handlers are `/photographer/{slug}`, legacy `/photographer/{slug}/portfolio`, and `/api/og/photographer/{slug}`. Caddy directs portfolio crawler traffic to the backend.
- Existing enquiry is `/api/public/photographer/{id-or-slug}/enquiry`. It saves CRM client and timeline records for all plan tiers. No event-calendar lookup or notification dispatch is implemented in that path.

Source anchors: `backend/pricing_catalog.py:100`, `backend/subscription_service.py:65`, `backend/portfolio_service.py:102`, `:488`, `:767`, `:1126`, `:1361`; `backend/pg_adapter.py:507`; `frontend-v2/src/App.jsx:430`; `frontend-v2/src/pages/StudioPortfolio.jsx:363`. Line numbers describe the planning baseline and will move during execution.

## 3. Billing plans, design categories and access

Design categories remain `free`, `basic`, `premium`. Billing plans remain Free/no subscription, Basic, Pro, Advanced, Premium and Custom. Do not introduce a `pro` renderer entitlement: current consumers understand backend `normal`, `basic`, `premium`.

Exact design sets:

- **F:** `free_studio_neutral`.
- **B:** F plus `basic_golden_hour`, `basic_darkroom`, `basic_nordic`.
- **P:** B plus `premium_gallery_wall`, `premium_film_strip`, `premium_liquid_glass`, `premium_contact_sheet`, `premium_aurora`, `premium_editorial`.

| Plan | Allowed design IDs | Existing feature restrictions | Proposed implementation |
|---|---|---|---|
| Free / no current portfolio subscription | F | Backend `normal`; 500 MB default shared-media pool; base section set; no premium team-save or premium SEO payload | Redesigned Studio Neutral selectable; same functional image viewer and enquiry where applicable; no artificial visual degradation |
| Basic | B | Backend `basic`; local catalog 512 MB; section-list behavior described below; premium team-save/SEO still gated | All four existing eligible IDs get version 2; no premium layout selection |
| Pro | P — all ten | Backend `premium`; local catalog 2 GB; full/default section set; existing premium feature gates | All ten selectable; preserve current paid benefits |
| Advanced | P — all ten | Backend `premium`; local catalog 10 GB; same feature gates as Pro | All ten selectable; no invented middle design tier |
| Premium | P — all ten | Backend `premium`; local catalog 20 GB; same feature gates | All ten selectable |
| Custom | P — all ten | Backend `premium`; local catalog 20 GB; existing first-purchase setup-fee behavior remains outside redesign | All ten selectable; do not interpret name as automatic bespoke-design or domain entitlement |
| Existing legacy/admin-configured plans | Existing server-resolved set | Explicit `portfolio_tier`, active status/expiry/grace, plan section list and storage overrides determine behavior | Preserve overrides; report ambiguous rows rather than changing customer subscriptions |

Storage figures are existing catalog observations, not proposed quotas. Actual plan overrides and purchased storage add-ons remain authoritative. No price is introduced or changed.

### Conflicts that must not be “fixed” by removing access

1. **Basic feature bullets versus section resolver:** Basic marketing features list about/services/gallery/contact/WhatsApp/Instagram, but an active plan with no nonempty `portfolio_sections` currently receives all 15 default section keys. The local Basic plan has no section list. Preserve that effective section access; do not apply a new frontend Basic restriction because of its marketing bullets.
2. **Premium design category versus plan name:** Pro and Advanced already have premium-category access. The UI must say “Available on Pro, Advanced, Premium and Custom,” not imply that only the billing plan named Premium qualifies.
3. **Missing legacy plan metadata:** the fallback premium-name list omits Advanced/Custom, so missing plan records/explicit `portfolio_tier` can resolve unexpectedly. Detect and report; preserve known established paid entitlement through an explicit, reviewed compatibility rule. Do not mass-edit subscription records.
4. **Multiple subscriptions:** premium rank wins today, but equal-rank plan selection can pick whichever row is encountered first for section/storage details. Preserve observed access, test the conflict, and avoid reducing benefits while redesigning. A billing resolver overhaul is a separate decision.
5. **Declared feature strings are not APIs:** `3d_animations`, booking_form, analytics and custom-domain text cannot be treated as proof of working infrastructure. Keep actual enabled behavior; do not invent services to make labels appear true.
6. **Existing published above-tier design after downgrade:** current renderer still resolves a known saved ID. Preserve that published version. New design selections and new version-2 publication must pass server entitlement validation; a rejected publish never destroys or restyles the current site.
7. **Section filtering versus response privacy:** current public data includes fields beyond rendered sections. Draft data must be absent at the backend boundary, not merely hidden by JSX. Retain paid section access while introducing an explicit public-field allowlist.

## 4. Ten distinct design specifications

Shared primitives handle forms, media, typography tokens and accessibility. Each design has its own layout component and responsive composition. A palette or a different CSS class on the same section stack is not sufficient.

| Existing ID / display name | Hero and navigation | Section composition and photography | Typography / visual character | Deliberate mobile treatment |
|---|---|---|---|---|
| `free_studio_neutral` — Studio Neutral | Compact landscape introduction above a left-aligned name, location and enquiry; small horizontal header | Introduction → selected work in natural-ratio rows → about/services → contact. Optional entitled content follows without dead space | Clear humanist sans; restrained neutral rules; no decorative cards | Full landscape image, name and action; one-column work stream; compact accessible disclosure if links overflow |
| `basic_golden_hour` — Golden Hour | Spacious landscape opening with introduction alongside its lower edge; studio mark left, narrative links right | Alternating image/story pairs, a full-width story break, about, services, genuine reviews/packages where entitled, enquiry | Warm ivory, terracotta for limited accents; soft serif headings with readable sans body | Each image precedes its corresponding story; landscape stays intact; in-flow enquiry repeats after selected work |
| `basic_darkroom` — Darkroom | Large contained photograph on dark canvas; compact utility header and numbered project index | Opening → project selector/list with large active project stage → studio information → services → enquiry. Photo stage complements, not replaces, a readable project list | Condensed display sans and neutral body; charcoal/ivory; frame metadata as small factual text | Photo → project heading → vertical project list; no hover dependency or horizontal project strip |
| `basic_nordic` — Nordic Light | Airy asymmetric split: short introduction left, portrait right; simple centered wordmark/navigation | Studio introduction → quiet photo pairs with unequal widths → service details → collections → contact. About integrated into opening when short | Geometric sans; soft neutral/sage; broad margins, fine dividers | Introduction and enquiry first, portrait inset next; photo pairs become ordered figures with generous but reduced gaps |
| `premium_gallery_wall` — Gallery Wall / Open Frame | Persistent side index on desktop; collection title opens directly into the exhibition | Varied-size project covers in explicit ordered grid → selected collection viewer → studio/services → enquiry; labels outside photographs | Refined serif collection titles and neutral sans captions; gallery-white surface | Side index becomes compact header; single ordered exhibition stream; wrapping collection filters, intact portrait insets |
| `premium_film_strip` — Film Strip / Afterglow | Wide chapter-opening photograph with title below/over safe negative space; top studio header plus chapter links | Narrative prologue → vertically sequenced story chapters → film poster if actual media exists → studio/services → closing enquiry | Film-title serif paired with restrained mono chapter numbers; dark ink and cream | Whole landscape then text; chapter markers stay in vertical flow; optional sticky enquiry with safe-area space; no forced sideways scroll |
| `premium_liquid_glass` — Liquid Glass | Image field with a small translucent navigation island and separate opaque title panel; no text directly over uncontrolled image areas | Offset featured-project panels on opaque surfaces → paired image/story area → studio/services → enquiry on solid background | Contemporary sans, subtle translucent chrome, crisp large type; blur limited to navigation/detail chrome | Header and all text surfaces become opaque; portrait/landscape images retain proportions; menu opens an accessible solid panel |
| `premium_contact_sheet` — Contact Sheet | Typographic studio masthead with one small lead photograph and useful category/project index | Numbered documentary work rows; project labels and grouping take priority over decoration; expand a collection into natural-ratio images → notes/about → services/contact | Slab/mono labels plus readable serif/sans text; newsprint/ink, restrained rust accents | Each numbered project becomes an expandable vertical group; filters wrap; no tiny thumbnail grid as the primary experience |
| `premium_aurora` — Aurora Studio | Bold large studio title across the opening; asymmetric photographic diptych beneath; compact corner menu/action | Studio statement → featured campaign/session spotlight → image mosaic → services/team where supplied → enquiry | Display grotesk, high-contrast neutral base with a restrained violet accent; imagery dominates | Name wraps freely above a single-image sequence; mosaic becomes intentional full-width/inset alternation; all content remains visible without animation |
| `premium_editorial` — Editorial / Folio | Off-center magazine title, intact tall portrait and small landscape detail; fine-rule masthead | Cover composition → broad story → asymmetric portrait/text/landscape spread → studio essay → services/real business content → elegant enquiry | Refined serif display and neutral sans body; paper/olive ink, generous whitespace | Title → portrait → introduction → detail; editorial spread becomes image → story → image with purposeful margins |

Foundations: Studio House informs Studio Neutral/Nordic/Aurora business clarity; Afterglow informs Film Strip and Darkroom's photographic restraint; Open Frame informs Gallery Wall and Contact Sheet's browsing; Folio becomes Editorial and informs Golden Hour's narrative pacing. **They are not duplicated foundation pages with changed palettes.**

For all ten, support populated entitled team, testimonials, packages, awards/equipment, video, location/coverage and social/contact sections through layout-specific slots. Do not force every optional block into every fixture. A Studio Neutral owner receives all sections their actual plan permits even though its default composition is compact.

### Visual acceptance per design

Before integration, capture full desktop and phone pages on the comparison board. For each pair of designs, verify material differences in all six required dimensions: hero, navigation, section composition, gallery, typography and mobile behavior. If the difference cannot be explained without mentioning colour, revise the composition. Document which photograph crops are intentional; provide uncropped viewing.

Use one consistent representative dataset for the main ten-way comparison. Keep reference-photo credits and demo labels. Never use a stock reference as a customer's upload. Add separate sparse and non-wedding fixtures to verify flexibility; do not fill real portfolios with them.

## 5. Categories and terminology

The backend currently advertises two different taxonomies:

- Event categories: Wedding, Pre Wedding, Haldi, Mehendi, Reception, Engagement, Birthday, Corporate, Baby Shoot, Outdoor, Destination Wedding.
- Photography styles/specialties: Wedding Photography, Candid Photography, Traditional Photography, Pre-Wedding Photography, Engagement Photography, Maternity Photography, Birthday & Events, Portrait Photography, Fashion Photography, Product Photography, Travel Photography, Wildlife Photography, Drone Photography, Videography, Cinematography.

**Commercial and newborn are not exact canonical labels here.** Discovery can describe “Commercial / product” as a friendly grouping of Product Photography and Corporate, and “Family / baby” as a grouping of Maternity and Baby Shoot. Do not silently rewrite saved labels or claim a new backend category exists. An optional owner-selected presentation vocabulary is additive, not a subscription gate.

Design discovery has three independent filters:

1. Style: Cinematic, Editorial, Gallery, Minimal, Contemporary (multi-tag support).
2. Suitable specialties: advisory tags mapped to the existing taxonomies.
3. Access: Available to me / All, with actual billing-plan names returned by server metadata.

Suggested suitability: Neutral/Nordic for broad studio, portrait, maternity and product work; Golden Hour/Folio for wedding, portrait and fashion storytelling; Darkroom/Film Strip for wedding, event and film-led practices; Gallery Wall/Contact Sheet for portrait, travel, wildlife, documentary/event work; Liquid Glass/Aurora for fashion, product and contemporary studios. Every eligible photographer may select every eligible design regardless of specialty.

Terminology resolver: wedding focus → “Stories” / “Your celebration”; portrait or maternity focus → “Sessions” / “Your session”; product/fashion/corporate focus → “Projects” / “Your project”; mixed/unknown → “Selected work” / “Your enquiry”. Use explicit owner choice first, conservative specialty inference second. “Couple”, “bride”, “groom” and wedding-specific sample text never become universal defaults.

## 6. Rendering and data architecture

Proposed frontend boundary:

```text
src/portfolio/
  catalog.js                  # stable IDs, version, style/suitability metadata
  normalizePortfolio.js       # legacy + snapshot -> safe view model
  PortfolioRenderer.jsx       # selects ID + renderer_version
  legacy/LegacyPortfolio.jsx  # preserved V1 composition
  layouts/                    # ten independent composition modules
  components/                 # media, viewer, menu, sections, enquiry
  fixtures/                   # clearly isolated demo/test data
  styles/                     # scoped tokens + one stylesheet per layout
```

`design_id` remains unchanged. `renderer_version:1` identifies existing appearance; `renderer_version:2` identifies the redesigned composition. Keep palette/token data needed by V1 untouched. A version-2 catalog can extend metadata without rewriting old saved IDs. Unknown IDs/version combinations use a documented safe fallback and log the condition; never corrupt stored data on read.

One normalized view model carries studio identity, presentation settings, projects, albums, studio photos, services, team, reviews, packages, proof/equipment, videos, location and contact, plus server-computed permitted sections. It is derived from an explicit public allowlist. Never spread raw profile/database metadata into public JSON.

Samples, design-selection thumbnails, authenticated draft previews and public pages import the **same version-2 layout components**. Use rendering modes only for framing, demo labels and interaction policy: sample/preview forms are disabled or simulated; public mode calls the real enquiry endpoint. Do not maintain a second HTML version of the ten layouts after React integration.

All CSS is scoped under a portfolio root and design modifier, e.g. `.portfolio-v2[data-design=…]`. Avoid global element selectors leaking into dashboard, invitations or galleries. Reuse installed React/Vite and existing font assets where viable; no unnecessary component or animation dependency.

### Additive presentation controls

- Hero asset and optional mobile variant; focal x/y per breakpoint; contain/cover preference with crop preview.
- Ordered featured work IDs, validated as owned by the current studio.
- Supported section order within each design's composition constraints; visible move-up/down buttons as an alternative to dragging.
- Caption/alt text and intrinsic image dimensions keyed to stable media IDs while preserving legacy URL arrays.
- Explicit logo variants; do not silently redefine an existing avatar as a wordmark.
- Density, caption visibility, and a small whitelist of layout-specific settings: chapter numbering, index grouping, opaque/translucent chrome, editorial lead placement. No arbitrary CSS/HTML input.
- Presentation vocabulary/specialty grouping. No new subscription restrictions.

Reuse existing profile/work/album/testimonial fields. Preserve `past_works` separately until the owner intentionally converts it to structured projects. Studio photos remain behind-the-scenes/location material. Existing team data has name/role/link, not headshots; add a media field only if needed. Retain both profile pricing data and public catalog packages during migration; do not delete either.

## 7. Publication safety before public replacement

### Storage contract

Use explicit PostgreSQL migration(s) and a narrowly scoped repository module. Proposed tables:

- `portfolio_publication_state`: studio_id primary key, draft JSONB, draft_revision integer, published_version_id, previous_published_version_id, lifecycle mode, timestamps.
- `portfolio_publication_versions`: immutable ID, studio_id, version number, schema version, design ID, renderer version, validated public document JSONB, media-reference manifest, publication actor/time, source revision. Unique `(studio_id, version)`.
- Media-reference tracking compatible with the existing upload/storage registry, or an indexed reference manifest consulted by deletion. Do not copy image binaries into version rows.

Verify exact adapter/schema conventions before creating tables. Publication requires one acquired asyncpg connection and a transaction for version insert, pointer switch and directory projection. Do not call separate adapter methods and assume they share that transaction. Guard draft mutations by expected revision; failed guard returns 409. Never perform a CAS upsert on a stale revision, which could mask conflicts.

### Lifecycle

```text
Existing unmanaged portfolio
  -> explicit edit initialization captures current public baseline as V1
  -> private draft copied from the same complete content
  -> select/edit version 2 -> Save draft -> Preview
  -> validate + Publish transaction
  -> new public V2; previous V1 retained

New studio
  -> private draft only -> Publish -> first public version
```

Initialization must capture the baseline before any mutation and be idempotent under concurrent requests. Public GET never creates drafts or performs a redesign migration. No background bulk rewrite of all customer portfolios. Owner draft creation may persist state only when execution is tested against disposable local studios; production migration is not run in this task.

Capture the entire visible publication, including works, albums, review content, package display data and branding presentation. Snapshotting only `profile` would still let edits to shared works or packages change the public page. Existing accessible profiles marked `is_published:false` retain their actual prior public behavior until deliberately migrated/unpublished; do not mass-hide them because the old boolean was unreliable.

**Proposed default for packages:** version the portfolio's displayed package content. The separate commercial catalog remains governed by its own existing workflows. Editor clearly states “Portfolio package display updates when published.” Do not alter checkout/catalog prices. Preserve the previous display data for rollback. Any request for always-live catalog display must be an explicit alternative to this draft guarantee.

Account access controls, subscription entitlement, brand-removal permission and private-media authorization remain live server policy, not privileges a snapshot can freeze forever. A legacy page's appearance is preserved; a snapshot must not bypass an access revocation. Test and expose policy conflicts rather than silently removing an owner's published work.

### Proposed endpoints

| Endpoint | Behavior |
|---|---|
| `GET /api/portfolio/draft` | Owner-only current draft, revision, publication summary and capabilities; no accidental public initialization |
| `POST /api/portfolio/draft` | Explicit idempotent initialization/baseline capture for editing |
| `PUT /api/portfolio/draft` | Validate patch plus `expected_revision`; mutate private draft only; return new revision |
| `GET /api/portfolio/draft/preview` | Owner-only normalized draft payload, private/no-store; renderer version and live entitlement context |
| `POST /api/portfolio/publish` | Validate expected revision, design/section entitlement, media ownership and content; atomically publish; retries cannot create duplicate versions |
| `GET /api/portfolio/versions` | Owner-only publication summaries; no unrelated-studio lookup |
| `POST /api/portfolio/restore` | Copy a retained version into draft, with revision check; deliberate Publish required to go live |

Names are proposed contracts, not claims that these APIs already exist. Auth derives studio ID from `require_admin`; a submitted studio_id is never trusted. Admin-assisted builds require existing privileged authorization and audit attribution. Preview will be owner-authenticated initially; public shareable preview tokens are deferred to avoid a second exposure path.

### All mutation and read paths must agree

The new editor alone is insufficient. Existing profile/design/work/album/testimonial/team writes must route through draft mutation for managed studios, or reject unsupported legacy callers with an explicit conflict/upgrade response. Never keep a hidden bypass that still updates a public record. Remove immediate “apply and save live” behavior from design selection. Unsaved navigation warns the owner; draft-save success says “Draft saved”, not “Published”.

Route public portfolio, single-work detail, SEO resolver, sitemap/directory projection and portfolio portions of the Pixora community profile through published data or a published projection. `pixora_service.py` has several direct profile/work readers that require classification. Community posts/reels remain outside scope, but none of their aggregate endpoints may expose draft portfolio fields.

Draft uploads must be private in practice, not just absent from portfolio JSON. Existing `/api/uploads` paths and display media serving need an access audit. New draft-only assets require owner authorization/short-lived access until publication grants public display access. Originals remain private. Published or retained-version media is pinned against draft deletion; reference metadata must not double-charge storage for one physical asset.

### Editor flow

1. Persistent status: Draft / Published / Unpublished changes; publication timestamp and current design version.
2. Content editor: existing identity, work, services and optional modules; accurate saved limits.
3. Design selector: ten real thumbnails, style/specialty/access filters; eligible designs select into draft only; ineligible designs show truthful plan access.
4. Image/layout inspector: hero/focal previews, featured order and supported settings.
5. Preview: same components at desktop/tablet/phone widths; explicit Draft label outside portfolio content.
6. Publish action: summary of design/content changes; deliberate click; no request to re-buy already-owned access.
7. Conflict: do not overwrite another tab's revision. Offer reload and preserve the local unsaved patch for review.
8. History: view prior publication, restore into draft, preview, publish. Never erase the last published snapshot automatically.

## 8. Shared functional behavior

**Photo viewing:** full-screen accessible dialog, contained display derivative, project/filter-scoped next/previous, Escape and arrow keys, touch swipe plus visible buttons, focus trapping/restoration and scroll lock. Preserve scroll position on close. Load neighboring display images on demand; never load every full-resolution asset initially. Do not expose EXIF or original/master URLs.

**Enquiries:** one component POSTs the existing `/enquiry` payload: name, phone, email, event_type, event_date, message. At least one contact channel required. Preferred date is informational. Successful persistence is confirmed from the backend response; no promise of notification delivery or availability. Retain form inputs on 400/422/429/network/5xx; do not retry non-idempotent submissions automatically. Address partial CRM/timeline failure with a transaction/idempotency key if added; tests must prove one lead per accepted request.

**External contact:** normalize phone and WhatsApp safely, permit intended http(s)/tel/mailto destinations, reject unsafe schemes, use appropriate `rel` for external tabs. Only show configured contacts; no sample phone numbers. Preserve studio branding policy.

**Navigation:** links only for visible sections. Real menu buttons expose expanded state and controlled target; keyboard Escape closes overlays; no inaccessible hover-only navigation. Use a skip link and visible focus ring.

**Optional sections:** no content means no heading, empty card, nav link or reserved gap. Awards/testimonials/counts are saved claims only, never fallback filler. Unknown/mixed specialty uses neutral wording.

**Page states:** loading reserves stable media geometry; missing portfolio gives a meaningful not-found page; fetch failure offers retry; gallery-load failure does not invent images; no hero/logo uses a strong text identity. Individual media failure preserves project title/story and hides its failed image. Zero works is a legitimate studio/about/contact page.

## 9. Image, accessibility and performance standards

- Natural aspect ratio by default. Hero crops require owner focal settings and visual checks at both breakpoints; no destructive image edits. Source originals remain unchanged.
- Responsive display derivatives with dimensions and `srcset`; eager/high-priority only for opening LCP image. Native lazy loading and async decode below fold.
- Video uses a poster and explicit play, `playsInline`, no heavy mobile autoplay, no implicit third-party embed until activated. Empty video fields produce no film block.
- Main body 16px/1.6; readable captions, AA text/control contrast, touch targets at least 44px. Long titles wrap; no fixed-height clipped text.
- Restrained transitions around 160–200ms. Reduced-motion disables motion and smooth scrolling. Liquid Glass has an opaque fallback for reduced transparency/unsupported blur. Aurora is static by default; any optional ambient effect stays outside photographs and stops under reduced motion.
- Typography differentiation can use existing installed assets; load only the active layout's fonts. No network-font dependency for core rendering; test Indian-script fallback where supported content requires it.
- Responsive acceptance widths: 320, 390, 768, 1024, 1440; also landscape phone and browser zoom. No horizontal page overflow.
- Performance targets, not advance claims: LCP ≤2.5s, CLS ≤0.1, INP ≤200ms on a stated representative mobile setup. Record measurement conditions; do not claim Lighthouse/browser tests prove real-user performance.

## 10. Execution work packages and exit checks

| Stage | Concrete changes | Exit check before proceeding |
|---|---|---|
| 0 — Baseline | Save design/plan/category contract evidence; inventory dirty files, public readers/writers, existing media access and test fixtures | No unrelated edits overwritten; mapping and exposure inventory recorded |
| 1 — Ten-design board | Build ten isolated compositions and catalog metadata; maintain same rich fixture, labels and credits; capture desktop/mobile | Ten visually distinct pages, all required dimensions differentiated; no runtime customer routing changed |
| 2 — Publication foundation | Add SQL/repository, baseline initialization, revision-guarded draft writes, immutable publications, media reference/access handling | Real PostgreSQL concurrent write/publish tests; no draft leaks through any inspected public endpoint |
| 3 — Shared adapter/functions | Public allowlist, entitlement resolver integration, media viewer, form, contact actions, optional sections, neutral terminology | Fixtures preserve content, ownership enforced, actual enquiry stored in disposable local CRM |
| 4 — Editor integration | Replace instant live saves; draft status, selector/filters, preview, hero/featured controls, publish/conflict/history | Eligible owner can save/preview/publish; unentitled and other-studio attempts rejected server-side |
| 5 — Version-aware public integration | Existing public URL selects legacy/version-2 renderer; route SEO/directory/work detail through publications; shared sample components | Legacy baseline remains unchanged until publish; SEO/directory metadata advances only at publish |
| 6 — Full regression/visual QA | Ten designs × viewports/content states; frontend build and meaningful backend integration checks | Evidence per design and API contract; no false “passed” from skipped environment-dependent checks |
| 7 — Handoff | Updated board/screenshots, ID/access matrix, architecture/migration notes, runnable checks, actual blockers | Explicit preview-only/integrated/verified status for each design; no deploy or production-data alteration |

Folio is the first integrated pilot inside stages 3–5 because its intended structure is already developed. The phase does **not** end at Folio: all ten must pass the same contracts before claiming the requested implementation complete.

## 11. Test matrix and proof of completion

### Backend / PostgreSQL

- Fresh studio: draft exists privately; public portfolio/work/SEO/directory cannot read it.
- Existing studio: baseline capture leaves public JSON, relevant metadata and V1 screenshot unchanged.
- Every draft section edit, design change and delete leaves public version unchanged until publish.
- Two writers using the same revision: exactly one succeeds; the other gets 409 without losing saved work.
- Concurrent publish and repeat/retry requests create one accepted version; an injected transactional failure leaves the previous pointer and directory state intact.
- Restore does not publish immediately; media needed by current/prior publication survives draft removal.
- Free/Basic/Pro/Advanced/Premium/Custom selection and publication matrix across all ten IDs; unknown ID/version rejected; purchased benefits preserved; grace/expiry/multiple-plan cases tested.
- Cross-studio draft/work/album/media/version references rejected; raw caller IDs cannot select an owner.
- Public portfolio, individual work, SEO, directory, sitemap and Pixora portfolio aggregate return published data only.
- Draft-only asset URLs are unauthorized publicly; display derivative permitted after publish; originals remain inaccessible.
- Real enquiry POST writes correct studio CRM client/timeline; validation, invalid studio, rate limiting, duplicate/incomplete request failure covered without claiming notifications work.

Use an isolated local test database or strictly namespaced disposable test studios and fixtures. Never submit test enquiries to a customer's live studio. If required infrastructure is unavailable, mark those checks blocked, not passed.

### Frontend / visual

For **every design**, capture rich desktop 1440 and mobile 390 full pages (20 required screenshots). Also verify 768, 1024 and 320, reduced motion, keyboard flow and console/network errors. Review every capture visually; counting ten screenshots is not proof of ten compositions.

Content fixtures: rich studio; one image/one project; zero media; missing hero/logo; long name/long text; portrait-only; landscape-only; broken derivative; wedding; portrait; product/corporate; mixed specialty; optional team/reviews/packages absent. Use factual fixture labels, not fabricated public business claims. Check changing a design preserves content.

End-to-end: owner saves draft → preview same layout component → public remains legacy → Publish → public V2 → enquiry persisted → restore previous version into draft. Check stale-tab conflict and unentitled direct API attempts, not only selector disabled states.

Run `npm run build` in `frontend-v2`; targeted backend publication/ownership/entitlement/lead/SEO checks with the repo interpreter; existing portfolio and relevant subscription tests. Add broad regression only where touched dependencies justify it. Record exact commands, counts, skipped/failed tests and environmental limits. No fake passing results from memory or old handoffs.

## 12. Decisions and remaining uncertainties

Decided for execution: retain all ten IDs and current eligibility; use renderer versions; ten independent compositions; same React components for samples/preview/public; authenticated preview; explicit Save Draft/Publish; current and previous publications retained; no new pricing, deployment or production migration.

Items to settle with evidence during stage 0, with conservative defaults:

1. **Plan overrides/conflicting legacy subscriptions:** local catalog is verified, actual production overrides are not. Preserve server-resolved paid access; no data rewrite. Report any rows whose intended entitlement cannot be inferred.
2. **Media privacy:** verify the exact current upload/display serving rules before promising private draft uploads. This can block publication integration, but not the visual board.
3. **Package/branding snapshot policy:** proposed portfolio display snapshots prevent accidental live edits; commercial catalog and account permissions remain separate. Document any product request for live cross-surface updates.
4. **Zero-content/unpublished legacy records:** preserve observed public reachability during compatibility initialization. Do not introduce mass-unpublish behavior; explicit unpublish UX is a separate controlled action if included.
5. **Image/font assets:** reuse licensed/local references for review; customer-owned assets for real portfolios. Unresolved attribution on two existing reference photos means they stay local study assets and should be replaced before distributing a public sample gallery.
6. **Newborn/commercial terminology:** expose friendly discovery groupings without inventing persisted categories; only add taxonomy entries if explicitly desired later.
7. **Rollback after entitlement expiry:** retained snapshot remains recoverable; publishing it must respect current policy without deleting the already-published site. Surface a clear conflict rather than granting a hidden bypass.

These are implementation constraints, not a reason to stop all authorized work. Finish independent design work while investigating them. Report exact blockers when a safety or verification dependency cannot be satisfied.

## 13. Final delivery format

The implementation handoff must contain:

- Ten design IDs/names, actual billing-plan eligibility, suitability/style labels.
- Review board plus twenty desktop/mobile full-page screenshots and representative tablet/narrow/sparse evidence.
- Per-design status: **preview only**, **integrated**, **verified**. Never imply a static page is wired to the backend.
- Working editor/draft/preview/publish/history behavior with concurrency and ownership evidence.
- Stable URL/SEO/directory and legacy-appearance preservation details.
- Real lead persistence evidence from a disposable local studio; no fake availability claim.
- Exact build/test results and genuine unresolved failures.
- Clear statement: no deployment and no production user-data change.
