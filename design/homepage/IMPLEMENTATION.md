# Pixora homepage — The Wisteria World

Implemented 14 October 2026 in the actual platform homepage at `/`. This task changes the platform homepage, not any photographer’s published portfolio. No deployment or production data changes.

[Visual review and motion recording](review.html) · [Desktop complete page](homepage-1440-full.png) · [Mobile complete page](homepage-390-full.png)

## Design

The reference became a complete visual system: original lavender wisteria landscapes; pearl backgrounds; ink-purple text; large editorial serif headings; compact sans-serif supporting text; generous spacing; a dark plum studio section; subtle rules instead of repeated decorative cards.

The full homepage includes a photographic atmosphere, four product pathways, three real portfolio-layout previews, an asymmetric community photography composition, live community posts when present, a clearly labelled studio workflow, MAJA invitation artwork and process, expandable real invitation collections, server-sourced invitation pricing, native FAQ disclosures, a landscape closing section and complete navigation footer.

The mobile landscape is separately composed in portrait orientation. Mobile layouts use narrower editorial typography, stacked portfolio examples, offset photographs, a conventional navigation disclosure and compact product/pricing grids. There is no horizontal carousel or scroll hijacking.

## Motion and accessibility

- Petals: 22 desktop / 12 mobile, slowly falling with independent rotation and drift.
- Clouds: two soft compositor-transformed layers on 60/76-second cycles.
- Water: subtle horizontal refraction of the actual lake artwork, plus gently expanding reflection contours. No autoplay video or sound is used on the homepage.
- One canvas capped at approximately 30fps and 1.5 device pixel ratio. Its animation stops when offscreen or the document is hidden; all observers/listeners and animation frames are cleaned up on unmount.
- Persistent Pause motion control. The OS reduced-motion preference disables decorative animation and transitions; the button explains that the device preference is active.
- Skip link, visible keyboard focus, semantic headings and sections, native FAQ controls, mobile menu Escape handling and focus return. Opaque controls/navigation under reduced transparency.
- No new JS dependency or remote font was added.

## Integration retained

- Existing signup/sign-in, community, photographer directory, pricing, contact, legal and feature routes.
- All ten portfolio designs and their current URLs. No portfolio renderer or publication behavior was changed in this task.
- `store.packages()` remains the source of invitation amounts. Unavailable prices show a link to current pricing. Studio subscriptions remain explicitly separate from invitation purchases.
- `CommunityStrip` still uses the real feed endpoints and hides itself when empty or unavailable. Reference examples do not impersonate community members.
- `ThemeShowcase` still opens the actual live invitation preview and collection routes. It loads on demand. The previous reveal-on-entry styles required a scoped override so newly opened collection cards remain visible.
- Existing invitation feature descriptions were retained in `homeContent.js`. No fabricated statistics, reviews or business claims were copied from the reference.

## Main source files

- `frontend-v2/src/pages/Landing.jsx` and `Landing.css`: full page and `.pxh`-scoped design system.
- `frontend-v2/src/components/home/HomeAtmosphere.jsx`: native animation with motion/performance safeguards.
- `frontend-v2/src/components/home/homeContent.js`: retained invitation-tier and FAQ content.
- `frontend-v2/public/home/`: optimized desktop/mobile artwork and portfolio preview images.
- `scripts/verify_homepage_redesign.py`: repeatable local browser checks with isolated API fixtures.

Previous homepage sources are retained as `Landing.before.jsx` and `Landing.before.css` in this review directory.

## Verification

- Production build passed: 425 modules, 11.99 seconds.
- 16 Chromium responsive/content cases: 320, 360, 390, 600, 768, 1024, 1440 and 1920px, each with empty and populated API fixtures. No horizontal overflow or broken images. [Machine-readable results](verification.json).
- Tested real motion changes between frames, pause stability, persisted pause after reload and OS reduced motion.
- Tested mobile navigation, anchor navigation, Escape/focus return and the real signup route.
- Tested FAQ disclosure, on-demand invitation collection display and the real live-preview modal.
- Tested server pricing values, populated community rendering and honest empty/unavailable API behavior. Fixtures are isolated browser responses, not saved customer data.
- Complete desktop/tablet/mobile screenshots and a ten-second ambient-motion recording are included. Desktop and mobile pages were visually reviewed from top to footer.

## Assets and limits

The desktop artwork is about 249 KB WebP; mobile has its own optimized portrait WebP. All generated assets are saved inside `frontend-v2/public/home`, not only in the image tool’s output folder. Built-in image generation was used; [the prompts and provenance](ASSET_PROMPTS.md) are retained here.

Reference photography and portfolio examples reuse the project’s existing study media and credits. Confirm clearance or replace these reference images before publishing marketing material. Original atmospheric artwork is illustrative and makes no claim about a real location.

Browser verification is Chromium, with API fixtures; this is not a production backend or Safari/iOS device certification. Existing production private-media/storage/backup prerequisites from the portfolio work remain unresolved and were not affected. No site registration, hosting changes, payment changes or deployment were performed.
