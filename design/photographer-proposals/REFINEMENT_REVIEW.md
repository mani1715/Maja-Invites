# Photographer portfolio refinement — implementation review

13 October 2026. Implemented locally; no deployment or production data changes.

[All ten designs, with complete desktop/mobile pages](ten-designs.html) · [Before/after comparisons](before-after.html) · [Overview image](ten-design-overview.jpg)

The integrated React layouts now differ through the complete page, including their business sections and enquiry treatment. The three previously similar openings are separated: Golden Hour retains an intimate photographic split; Film Strip uses a wide screening stage and credit-style prologue; Liquid Glass places the photograph above a compact introduction. Contact Sheet brings three photographic proofs into the opening instead of a small isolated image.

| Design / stable ID | Distinct composition and complete-page treatment | Mobile behavior |
|---|---|---|
| Studio Neutral / `free_studio_neutral` | Compact photo-led introduction, three-column work rows, practical studio information, two-column service list and soft enquiry background. | Simple full-width photo sequence; compact opening and single-column services. |
| Golden Hour / `basic_golden_hour` | Warm portrait opening, alternating image/story pairs, inset service section, spacious studio introduction and quiet enquiry. | Tall intact opening portrait followed by stories in reading order. |
| Darkroom / `basic_darkroom` | Typographic masthead, dark photographic stage, selectable numbered project index, ruled services and dark enquiry. | Heading precedes the photograph; active project is above its touch-friendly index. |
| Nordic Light / `basic_nordic` | Centered navigation, introduction before studio information, irregular gallery, generous service spacing and inset enquiry. | Text-first cover, narrower opening image and alternating inset photographs. |
| Gallery Wall / `premium_gallery_wall` | Side navigation, exhibition heading, category and collection browsing, staggered photo wall and restrained business information. | Compact menu replaces sidebar; alternating image widths preserve exhibition rhythm. |
| Film Strip / `premium_film_strip` | Wide screening stage, credit-style introduction, numbered photographic chapters, centered studio statement and contrasting enquiry section. | Short screening frame, compact prologue, vertical chapters and uninterrupted native scrolling. |
| Liquid Glass / `premium_liquid_glass` | Image-dominant cover, restrained navigation transparency, compact caption, offset projects, white studio/enquiry areas and service columns. | Opaque navigation, intact opening portrait and inset alternate projects; no split hero. |
| Contact Sheet / `premium_contact_sheet` | Compact type, three photographic proofs, filtered expandable archive, documentary labels and double-rule business sections. | Two useful proofs above the archive, compact headline, native expandable project rows. |
| Aurora Studio / `premium_aurora` | Bold masthead and diptych, inset services bridging into an asymmetric mosaic, strong studio heading and reversed enquiry colours. | Heading-first composition, second inset photo, clear service transition and stacked mosaic. |
| Editorial / Folio / `premium_editorial` | Asymmetric cover, numbered authored story spreads with optional detail photographs, editorial studio columns, service columns and ruled enquiry. | Text-led spreads with alternating inset images; editorial rhythm continues through studio and contact. |

## Content and editor behavior

- Every refined layout renders the photographer's `profile.tagline` and supporting `profile.cover_description`. Existing editor controls save both to the private draft; browser verification confirms both appear in the private preview and published renderer. Missing headlines fall back to studio name, then “Photography”; missing introductions disappear. The repeated documentary headline exists only in the fixture.
- Film Strip has an opening-media selector referencing an existing project video. The backend validates that the selected ID belongs to the submitted portfolio and has a video. Native controls, `playsInline`, no autoplay and no scroll hijacking. The selected opening photograph is the poster and the error fallback. No stock video or new remote media is introduced.
- Existing portrait/landscape compositions remain intact with `object-fit: contain` where constrained; gallery photos use natural dimensions. Private media continues using 960/2400 responsive display derivatives. No original-file access rules were changed.
- A failed photograph is hidden cleanly instead of displaying a broken image. Optional populated sections were tested separately using explicit TEST content; no business claims were added to the shared demonstration studio.
- The existing vocabulary resolver selects stories, sessions, projects or selected work. The generic service heading no longer assumes wedding stories. Refined public page titles use neutral photography terminology; canonical URL handling remains unchanged.
- Existing service, team, testimonial, package and section entitlement behavior is retained. No prices, plan mapping or stable design IDs were changed.

## Compatibility and safety of publication

The refinement uses `renderer_version: 3`. Version 1 remains on the original renderer. Version 2 is frozen in `LegacyPortfolioV2.jsx`, its companion details component and separately scoped `pf2old` stylesheet. Saving or previewing a version 3 draft cannot visually change a version 2 public portfolio. Only explicit publication updates the public renderer version. Tests cover that transition.

The refined sample board, editor preview and version 3 public page use the same `PortfolioRenderer.jsx`. Version history still restores into a private draft for review. PostgreSQL remains the database, through the existing Mongo-compatible collection adapter; no MongoDB deployment is assumed or introduced.

Private uploads, owner checks, immutable publications, revision conflicts, subscription gates, stable slugs, directory projection, canonical SEO and real CRM lead capture remain in place. Publication visibility checks cover versions 2 and 3. The enquiry form requests a preferred date without offering availability checking.

## Gallery import correction

`CreateGalleryModal.jsx` now calls the real `listPaginated` export from `api/weddings.js`. It follows `total_pages` with the supported 100-item page size, handles cancellation, displays a recoverable error/retry and an empty state, and passes the selected invitation ID to the existing gallery create API. No dummy export was added. The frontend build no longer reports the missing `list` export.

## Verification actually completed

- **240 base Chromium cases:** ten designs × 1440/768/390/320 widths × rich/sparse/empty/long/commercial/portrait content. No horizontal overflow, broken reference photos or page exceptions. Viewer keyboard navigation/Escape/focus return, mobile navigation, sample enquiry suppression and discovery filters passed. [Results](previews/ten-designs/verification.json).
- **80 additional Chromium cases:** all ten designs at the same four widths with populated optional sections and missing photographs/text. Checked team/packages/testimonials/FAQ rendering, authored messaging, clean broken-image hiding and collection filtering. Also checked category filtering, Darkroom's active project, version 2 public routing and Film Strip native controls/photo fallback.
- **48 targeted cases** repeated for final Darkroom/Aurora opening-copy spacing, with refreshed screenshots. [Results](previews/ten-designs/verification-targeted.json).
- **Disposable local PostgreSQL integration:** all ten entitlement checks, private media ownership and anonymous access, original public preservation, stale/concurrent revisions, explicit publication, restoration, stable URLs, directory projection, canonical SEO, retained media accounting and real CRM persistence.
- **Real React browser workflow:** authenticated private upload → save draft → authored headline/intro in 390px private preview → explicit publish → public headline/intro → real enquiry form → CRM record in the temporary PostgreSQL database. A V2 public portfolio remains V2 through draft save, then changes on publication. Authentication identity is a fixture; production login is outside this test.
- **Gallery modal browser check:** simulated listing outage → retry → pages 1 and 2 loaded → second-page invitation selected → correct ID in mocked create payload. No real gallery was created.
- **13 existing regression tests passed** for portfolio work updates, leads and SEO. One existing Python multipart deprecation warning remains.
- **Frontend production build passed**, without the gallery import warning.
- Complete desktop and mobile renders were visually inspected. Twenty full-page PNGs plus twenty opening PNGs are linked from the review board. Before/after captures for the three requested designs are preserved separately.

Reproduce with an isolated Vite server at `127.0.0.1:8143`: `scripts/verify_portfolio_designs.py`, `scripts/verify_portfolio_refinement.py`, `scripts/verify_gallery_invitation_picker.py`, and `backend/tests/test_portfolio_publication_pg.py --browser`. Build boards with `scripts/build_portfolio_review.py` and `scripts/build_portfolio_refinement_review.py`. The database test refuses remote hosts and drops its own temporary database on exit.

## Remaining limitations and release prerequisites

- Production private-media storage, backup and restore wiring still require completion and verification. This is not a deployment-readiness claim.
- Reference-photo clearance/replacement, historical media retention policy and prior catalog inconsistencies remain as documented in the implementation review.
- Browser checks use Chromium. Safari/Firefox, assistive-technology certification and playback compatibility for owner-supplied codecs still need device coverage. Native controls and failure fallback were checked; no real studio video was supplied for content/playback review.
- Existing CRM behavior still has no date-availability integration or notification guarantee.
- Introductory photographs are contained to preserve compositions. A portrait selected for Film Strip is intentionally letterboxed; a supplied landscape photograph or film uses the wide stage more fully.
- Full section reordering and additional logo variants remain future product decisions; this refinement keeps the deliberate layout compositions.

Final completion check — 14 October 2026: frontend production build passed (423 modules; 8.60 seconds), with no missing gallery export warning. All 20 complete-page screenshot files were checked to extend beyond a viewport. Repository-wide whitespace checking reports pre-existing issues in unrelated gallery/media/server/API files; those files were left unchanged by this refinement.
