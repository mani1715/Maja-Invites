> Refinement completed 13 October 2026: see [the current visual and verification report](REFINEMENT_REVIEW.md). New publications use renderer version 3; existing versions 1 and 2 keep their original renderer until explicit republication.

# Photographer portfolio redesign — implementation review

13 October 2026 · Local implementation; not deployed

Start with [the offline desktop/mobile review board](ten-designs.html). It contains all ten designs and links to their complete page screenshots. The [overview image](ten-design-overview.jpg) compares all ten at once. Interactive samples use `/portfolio-samples`; the owner workspace remains `/studio/portfolio`; public URLs remain `/photographer/{slug}`.

## What is complete

All ten stable design IDs have separate version 2 compositions integrated into the sample board, private editor preview and public renderer. These are working React designs, not just static concepts. Public rendering changes only when an owner publishes. Existing version 1 markup and theme tokens remain in place for portfolios that have not opted in.

The workspace supports private saves, desktop/tablet/mobile preview, deliberate publication, revision conflicts, immutable version history and restoration into a draft. It includes private photo/video uploads, hero selection and focal position, logo, featured projects, collection assignment, captions/alt text, project ordering, contact/social fields, services, FAQs, packages and team controls. Less common existing profile fields remain editable through an explicit advanced-field apply control.

Public enquiry forms use the existing lead-capture API. Sample and draft-preview forms explicitly send nothing. The optional date is an enquiry preference; it does not claim to check availability or reserve a booking.

## Verified critique

- The original v2 viewer used the same markup for all ten IDs. The “nine layouts only change colours” finding understated this: Editorial also resolved to that shared layout. Its palette existed, but its promised asymmetric composition did not. An outdated fallback notice remained in the original viewer.
- The old design picker and profile editor changed public data immediately. The original public endpoint did not consistently use `is_published` as a publication boundary.
- Uniform project crops, limited gallery interaction and the overlapping profile treatment weakened the business-website presentation.
- The database is PostgreSQL. `pg_adapter.py` provides collection-style methods over JSONB tables; those methods are not evidence of a deployed MongoDB database. New persistence and transaction tests use that actual PostgreSQL adapter.
- The context document's `/p/{username}` SEO statement was inaccurate for this checkout. That URL serves the community profile. Photographer portfolio SEO uses the photographer routes. No `/p` route was reassigned.

The original audit corrections and four foundational proposals remain in [REVIEW.md](REVIEW.md). The full design specification and implementation rationale are in [TEN_DESIGN_EXECUTION_PLAN.md](TEN_DESIGN_EXECUTION_PLAN.md). This report records the implemented outcome wherever the planning document describes a broader option.

## Designs and section arrangements

All compositions finish with available, entitled business information and the real enquiry section. Empty optional sections are omitted. Studio and work navigation links appear only when their destinations exist. Mobile navigation uses a consistent accessible menu; the photographic composition and project interaction change per design.

| Stable ID | Name / direction | Desktop composition and sequence | Mobile treatment |
|---|---|---|---|
| `free_studio_neutral` | Studio Neutral / accessible starter | Compact photograph beside introduction; selected work in three columns; studio; services | Photograph and copy stack; single-column work; compact menu |
| `basic_golden_hour` | Golden Hour / warm storytelling | Spacious photo/copy opening; alternating story pairs; services; studio | Complete photograph first; each story becomes a vertical image/text pair |
| `basic_darkroom` | Darkroom / dramatic photography | Strong typographic opening; contained photograph; indexed project stage; studio; services | Active photograph above the project index; touch-sized project controls |
| `basic_nordic` | Nordic Light / quiet studio | Centered navigation; split introduction; studio before work; irregular gallery; services | Copy precedes an inset portrait; deliberate one-column gallery rhythm |
| `premium_gallery_wall` | Gallery Wall / exhibition | Left navigation; typographic title; filterable staggered gallery; services; studio | Sidebar becomes menu; gallery follows reading order, with an inset first photograph |
| `premium_film_strip` | Film Strip / cinematic narrative | Photo-led prologue; numbered vertical chapters; studio; services | Full-width photographic prologue and vertical chapters; native video only when supplied |
| `premium_liquid_glass` | Liquid Glass / contemporary | Restrained translucent navigation; split photographic panel; offset projects; studio; services | Opaque navigation; image-first stacked panels; no blur dependency |
| `premium_contact_sheet` | Contact Sheet / documentary index | Type-led opening and small frame; expandable project index with category filters; services; studio | Smaller inset opening image; expandable rows simplify to readable labels and vertical content |
| `premium_aurora` | Aurora Studio / creative business | Bold masthead; image diptych; services early; asymmetric work mosaic; studio | Staggered vertical diptych, then services and a linear work sequence |
| `premium_editorial` | Editorial / Folio / magazine | Asymmetric portrait cover and detail photograph; editorial spreads; studio; services | Offset portrait and detail remain distinct; spreads become a varied-width vertical sequence |

Every design supports existing project collections and full-screen viewing. Work photographs retain portrait/landscape proportions. The shared functional components make contact behavior, entitlement visibility and keyboard controls consistent without imposing one composition.

**Recommended first choice: Golden Hour.** It best matches the current wedding-oriented content, gives projects room for stories and makes enquiry easy to find. Editorial / Folio is the premium flagship; Gallery Wall is the strongest option for a substantial mixed photography collection. Studio Neutral is intentionally professional rather than visually penalizing free studios.

## Existing plans and restrictions — unchanged

| Existing plan | Allowed stable IDs | Existing restrictions retained | Implementation |
|---|---|---|---|
| Free / no active portfolio subscription (`normal`) | `free_studio_neutral` | Basic section set; existing shared storage allowance; no premium team editing | Professional starter layout and real enquiry capture |
| Basic (`basic`) | Free + `basic_golden_hour`, `basic_darkroom`, `basic_nordic` | Actual section resolver and storage overrides; premium team/SEO rules remain | Four selectable designs, server-validated |
| Pro, Advanced, Premium, Custom with explicit `portfolio_tier=premium` | All ten IDs | Admin section lists, storage overrides, active status/expiry/grace and separate white-label entitlement | Ten selectable designs, server-validated |
| Older or custom/admin-configured plans | Existing resolver result | Explicit entitlement wins; existing name fallback remains unchanged | No subscription reassignment or price change |

Two unresolved catalog inconsistencies are preserved rather than silently changing paid access: an active Basic plan without a section list currently receives all 15 section keys, despite narrower marketing bullets; old Advanced/Custom rows lacking explicit entitlement metadata are not in the premium-name fallback. Equal-rank subscriptions also retain the current first-match section selection. Reconciliation requires a separate catalog/data decision.

Selection **and publication** validate the studio's current entitlement. An expired studio keeps its already published composition; it must choose an entitled design before publishing a new version. There is no automatic visual downgrade. Team visibility, section visibility, premium SEO and enterprise white-label removal retain their existing server decisions.

## Photography, type, spacing, colour and motion

- Photographs use their native proportions and `object-fit: contain`; hero focal controls position the image within its frame. The full-screen viewer also contains the whole image. Gallery captions and alt text are independently editable.
- New originals are retained outside publicly served upload directories. Web photographs are EXIF-oriented WebP copies bounded to 2400 pixels, with a 960-pixel responsive copy. New video uses explicit controls, `playsInline` and `preload="none"`; no autoplay was added. Existing media URLs are retained.
- Hero media loads eagerly; lower work media is lazy. The viewer loads its selected image rather than preloading every full-size gallery photograph.
- Type uses system serif/sans/monospace stacks, avoiding new font dependencies. Desktop display sizes range approximately 44–110px by design; mobile 36–48px, with 31–40px adjustments at 320px. Body copy is 15–16px with 1.65 line height. Captions are 12–13px.
- Sections use roughly 85px vertical space on desktop and 55px on phones. Desktop gutters are usually 5–9%; mobile gutters are 22px. Targets are at least 44px. Focus outlines are visible; native dialog behavior traps focus and Escape closes the viewer, returning focus to the triggering photograph.
- Neutral uses cream/forest; Golden Hour warm ivory/terracotta; Darkroom charcoal; Nordic soft sage; Gallery Wall gallery white; Film Strip dark olive; Liquid Glass pale mineral green; Contact Sheet warm paper; Aurora muted lilac; Folio ivory/olive. Actual values live in the scoped `portfolio.css` rules.
- Motion is limited to a short photograph opacity response. Reduced-motion removes transitions; reduced-transparency and mobile rules make glass navigation opaque. No scroll hijacking, unrelated decorative animation or gradient system was introduced.

## Content and publication architecture

`backend/portfolio_publication.py` owns the workflow. `portfolio_publications` stores the private draft, revision, stable slug and version pointer. `portfolio_versions` stores immutable publication snapshots. Both are JSONB tables created through the existing adapter. Saves use a row lock and revision comparison; publish commits the snapshot, pointer, public profile/works/albums/testimonials and directory fields in one PostgreSQL transaction.

The public collections remain the published projection. This keeps existing directory, work-detail, community and crawler consumers reading published content. Drafts never replace those rows. Legacy mutation endpoints reject writes after a studio adopts the workspace, preventing old direct-edit requests from bypassing publication. Shared community privacy and white-label settings retain their own existing lifecycle.

Community packages and highlights are copied into a draft. The owner explicitly imports later Community changes and publishes them. Locally authored portfolio packages take precedence over imported packages. Restoration restores the prior snapshot's showcase too. No fake reviews, statistics, awards or team identities are seeded into new drafts.

`backend/portfolio_media.py` keeps originals private. Authenticated previews are fetched as blobs; the editor does not place an owner token in image URLs. Anonymous access returns 404 until an asset has been published. Derivative visibility is promoted in the publication transaction. Media metadata and quota reservation are committed together on upload. New originals and derivatives count once across drafts and versions; retained legacy bytes are reserved on first publication. Version-referenced media is protected from normal deletion and orphan cleanup.

Versions and their media are retained conservatively. Removing a photograph from the current draft does not erase the original or invalidate old published versions. The existing quota still applies; a future retention/purge policy must specify how owners deliberately retire version history.

The editor's preview uses the same `PortfolioRenderer` inside a real iframe, so 390/768px previews respond to their own viewport. It is not a scaled desktop simulation. Publication is available from the reviewed saved draft and rejects a revision changed by another session.

## Compatibility and release sequence

1. Review the ten visual proposals and this local implementation. No customer-wide migration has run.
2. Before any deployment, provide durable private-media storage and backup coverage for `PORTFOLIO_PRIVATE_MEDIA_ROOT` (default `/app/private/portfolio`). Keep it outside public static-file roots. Retain the new media router on any later application rollback so published derivative URLs continue working.
3. Deploy additive backend tables/routes and the version-aware frontend together after the normal project release review. No billing catalog changes are needed.
4. Existing raw portfolios have no version 2 marker and continue through the unchanged legacy markup. Opening the owner workspace creates a private draft and an original-content snapshot. It does not switch the public layout.
5. The owner previews and explicitly publishes. The canonical slug and work IDs are retained. New studios remain unpublished until that step.
6. Restore a prior version into the draft, review it, then publish to revert content. Restoration intentionally does not silently switch the public page. Reverting all the way to version 1 markup is an operational rollback decision, not a mislabeled editor button.

No production deployment, production data write, price change, or subscription reassignment was performed.

## Verification evidence

- **240 Chromium cases passed:** 10 designs × 4 widths (1440/768/390/320) × 6 content cases (rich, sparse, empty, long, commercial, portrait). No horizontal overflow, broken reference images or page exceptions. [Machine-readable results](previews/ten-designs/verification.json).
- **20 complete screenshots**, plus desktop/mobile opening captures, are linked from [the review board](ten-designs.html). Representative desktop/mobile openings were visually inspected. All use the same reference studio.
- Keyboard viewer open/navigation/Escape/focus return, mobile menu navigation, preview enquiry suppression and discovery filters passed.
- **Disposable local PostgreSQL integration passed:** legacy preservation, private draft isolation, all ten free/premium gates, owner isolation, anonymous/private media checks, stale and simultaneous revisions, explicit publish, restore, stable URLs, canonical SEO, directory projection, retained-media accounting and real CRM enquiry persistence. The temporary database is removed by the test.
- **Real React editor integration passed** against those real route handlers and that disposable database: save → authenticated image upload → blob-backed private preview → 390px iframe → publish → public projection. Authentication identity is a test fixture; the production login service is not invoked by this test.
- **13 existing portfolio regression tests passed** (work patching, leads and SEO).
- The frontend production build passes. The later refinement fixed the gallery warning by using the actual paginated invitation API; see the current report for browser verification.

Reproduction: `scripts/verify_portfolio_designs.py` uses an isolated Vite server on localhost:8143. `backend/tests/test_portfolio_publication_pg.py --browser` refuses remote database hosts and creates/drops only its own temporary database. `scripts/build_portfolio_review.py` regenerates the offline board from the screenshot captures.

## Genuine remaining decisions and release limits

- Maneesh's preferred launch emphasis among Golden Hour, Folio and Gallery Wall; all ten are implemented and selectable according to existing access.
- Retention duration and an explicit owner-controlled retirement policy for historic versions/originals. The current behavior retains them and counts their storage; it does not silently delete them.
- Production private-media volume, backup and restore wiring. These were intentionally not deployed.
- Replacement or full clearance of the study's reference photographs before using the sample board as public marketing. The reference photography is labeled and never inserted into customer portfolios.
- Catalog reconciliation for the Basic-section and legacy Advanced/Custom metadata inconsistencies described above. Existing effective behavior is preserved pending that decision.
- Additional logo variants, unrestricted section reordering and per-design typography controls remain optional future product choices. This implementation exposes hero/focal selection, featured order, collection/project order, captions and vocabulary; it keeps each design's deliberate section composition.
- Browser verification is Chromium, not a claim of Safari/Firefox or assistive-technology certification. The existing enquiry service still has its original two-write CRM behavior and no availability/notification integration; no new guarantee was invented.

