# Coming Soon & Not Found

Routes: `/soon` (renders `ComingSoon`); `*` — any unmatched path (renders `NotFound`)
Source: `frontend-v2/src/pages/ComingSoon.jsx`, `frontend-v2/src/pages/NotFound.jsx`, `frontend-v2/src/pages/_Placeholder.jsx`
Auth: public

## Overview

Two trivial fallback screens documented together because they share the same underlying shell component (`_Placeholder.jsx`) and the same purpose: keep every nav item in the app clickable and visually intentional even where a real screen doesn't exist yet in this build.

- **Coming Soon** (`/soon`) is the shared landing target for every nav/menu item across `StudioNav`, `WeddingToolbar`, and elsewhere whose real screen isn't built — rather than hiding those items (which would make the navigation look incomplete) or disabling them, they route here with a label identifying what was clicked.
- **Not Found** (`*`) is the catch-all 404 for any URL that doesn't match a defined route.

## Layout — Coming Soon

1. `Placeholder` shell (full-height, centered column): "Coming soon" eyebrow (uppercase, letter-spaced), `{label}` as an H1 (serif), and a fixed subline "Not built yet in this preview."
2. "← Back home" link (→ `/`), pinned near the bottom.

## Layout — Not Found

1. `Placeholder` shell only: eyebrow "Coming soon" (same shared copy — not "404" or similar), H1 "404 — Not Found", subline "*" (the literal route pattern, not a friendly message).
2. No back-home link, no other affordance — this is the one shortfall of reusing `Placeholder` as-is for a true error page rather than an unbuilt-feature page.

## Fields

Neither page has fields. `ComingSoon` reads its only piece of dynamic content from the URL/navigation state, not from user input:

| Source | Priority | Example |
|---|---|---|
| `location.state.label` | 1st | Set by a caller that navigated with `navigate(soonPath, { state: { label } })` — [TBC: not observed used this way in the reviewed pages; the `soon()` helper only builds the query-string form] |
| `?f=` query param | 2nd | `soon('QR codes')` → `/soon?f=QR%20codes` — this is how every reviewed caller (`StudioNav`, `WeddingToolbar`) links here |
| `'This page'` | fallback | If neither is present |

## Interactions

### Coming Soon
- Purely presentational — the only actionable element is "← Back home" (→ `/`).

### Not Found
- Purely presentational — no links, no actions. A visitor who lands here (bad URL, typo, stale bookmark) has no in-page way back other than browser navigation or the app's own nav chrome if one is present around it (it is not — no nav/header on this page).

## API Dependencies

None — both pages are fully static, no network calls.

## Page Relationships

- **From (Coming Soon):** every `soon(label)`-built link across the app — observed callers in this page set: `StudioNav` (every item except "Dashboard"), `WeddingToolbar` (every tool tab except "Overview" and "Live gallery"). The `soon()` helper (`components/nav/RailNav.jsx`) is the single source of the `/soon?f=...` URL shape, so any nav surface built against it inherits this same fallback automatically.
- **From (Not Found):** any URL that doesn't match a route in `App.jsx`'s `<Routes>` — including typos in dynamic segments (e.g. a malformed `:profileId`) since React Router only 404s on structurally unmatched paths, not on a route whose param turns out to reference a nonexistent record (those instead hit their page's own "not found"/error state after a failed API call, e.g. Order Details or User Wedding Edit's load-error screens).
- **To:** `/` (Coming Soon's back-home link only).

## Business Rules

- **Design intent, not a bug:** per `pages/MANIFEST.md` and the `RailNav`/`WeddingToolbar` source comments, keeping every navigation item visible-but-routed-to-`/soon` (rather than hidden) is deliberate — it keeps the studio's navigation surface looking complete during incremental rollout, at the cost of some links leading to a stub.
- `ComingSoon` and `NotFound` are visually near-identical (both render `Placeholder`) — `NotFound` inherits the "Coming soon" eyebrow copy verbatim, which is slightly misleading for a genuine 404 (a bad URL isn't "coming soon"), but there is no separate error-page design in this build. [TBC whether this is intentional reuse-for-simplicity or an oversight.]
- Neither page performs any authentication check — both render identically regardless of signed-in state, since they carry no real functionality to gate.
