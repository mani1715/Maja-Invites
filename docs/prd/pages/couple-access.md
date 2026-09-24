# Couple Access Page

Routes: `/couple/access`, `/couple/access/:slug`
Source: `frontend-v2/src/pages/CoupleAccess.jsx`, `CoupleAccess.css`, `frontend-v2/src/lib/clientAuth.js`
Auth: its own, separate identity system — a username/passcode login scoped to a single invitation, entirely isolated from both the couple's own `UserAuthContext` session and the studio's `AuthContext` session

## Overview

A read-only "client portal" a photographer/studio hands to the couple they're working with — a dashboard of the couple's own wedding stats (RSVPs, wishes, photo count, days remaining), latest wishes, event list, a gallery preview, and shagun totals. It authenticates via a dedicated `client_token` (issued by the photographer, distinct from any invitation passcode or the couple's own site login) and reads from a small set of "client"-scoped endpoints plus a couple of the same public/invite endpoints used elsewhere.

## Layout

**Booting state:** plain "Loading…" full-page message while an existing stored token is being validated.

**Signed-out gate:**
- "M" mark, "Couple access" heading, explanatory copy ("The username and passcode your photographer gave you. No account to create.").
- Form: Username, Passcode, inline error text, "Enter" submit button.
- Footer note: "Forgotten the passcode? Ask your photographer, or write to majainvites@gmail.com."

**Signed-in dashboard:**
1. **Header** — "Welcome back" eyebrow, the couple's name (`overview.couple`), a "View the invitation" link (if `overview.invite_path` exists) and a "Leave" (sign-out) button.
2. **Stat tile row** (4 tiles, 2-column on narrow / 4-column on wide viewports):
   - RSVPs in (`quick.rsvp_attending` of `quick.rsvp_total` responded)
   - Wishes (`quick.wishes_total`, with a "N pending" or "All reviewed" note)
   - Photographs (live gallery total if loaded, else `galleryInfo.photo_count`, "Updating live" note)
   - Days to go (computed from `overview.event_date`, floored at 0, with the formatted date as the note)
3. **"Latest wishes" panel** — list of up to 5 wishes (message + guest name/relationship), a "Read all N wishes" / "Show fewer" toggle if there are more than 5, loading/empty states.
4. **"Your events" panel** — list of events (name, venue, date/time), loading/empty states.
5. **"Photographs" panel** — up to 6 gallery thumbnails, a total + guest-contributed count line, an "Open the wall →" link (if `galleryInfo.live_gallery_path` exists), loading/empty states.
6. **"Shagun received" panel** — total amount + contributor count if shagun is enabled and data present, else a "Digital shagun isn't turned on for this invitation." note.
7. **Dashboard-level error banner** — shown if every parallel data call failed ("Some details couldn't load. Pull to refresh or try again shortly.").

## Fields

**Sign-in gate:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Username | text input | Yes | non-empty after trim | `''` |
| Passcode | text input (`type="password"`) | Yes | non-empty after trim | `''` |

No fields exist on the dashboard itself — it is entirely read-only.

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | If a `client_token` already exists in `localStorage`, calls `clientOverview()` to confirm it's still valid; on success sets `authed = true` and loads the dashboard; on failure calls `clientLogout()` (clears the stale token) and falls through to the sign-in gate. If no stored token, skips straight to the gate |
| `authed` becomes true (post-login or post-boot-validation) | Fires `loadDashboard(overview.slug)` — three parallel calls (`clientWishes`, `getFull`, `getWall`) via `Promise.allSettled`, so a partial failure in one doesn't block the others; only shows the dashboard-level error banner if **all three** failed |
| Viewport resize | Recomputes responsive breakpoints (`isMobile` < 760px, `isTablet` 760–1099px) |
| Edit username/passcode | Clears any existing `gateError` as the user types |
| Submit sign-in form | Requires both fields non-empty ("Enter both your username and passcode."); calls `clientLogin(username, password)`, then `clientOverview()`; on success sets `authed = true`; if the login response includes `event.slug`, navigates (replace) to `/couple/access/{that slug}` — normalizing the URL to include the invitation slug even if the visitor started at the bare `/couple/access` |
| Sign-in failure | Shows the backend's `detail` or "That username and passcode don't go together." |
| Click "Leave" | Calls `clientLogout()` (clears the stored token), resets `authed`, `overview`, `wishes`, and the password field — returns to the sign-in gate |
| Click "Read all N wishes" / "Show fewer" | Toggles between showing the first 5 wishes and the full list |
| Click "View the invitation" | Opens `overview.invite_path` in a new tab/context |
| Click "Open the wall →" | Navigates (plain anchor) to `galleryInfo.live_gallery_path` |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Boot-time token check | `GET /api/client/overview` | `lib/clientAuth.js` `clientOverview()` | Uses the isolated `clientApi` axios instance (own `Authorization: Bearer {client_token}` header from `localStorage.client_token`), entirely separate from the shared `api/client.js` instance used by the rest of the app |
| Sign in | `POST /api/client/login` | `lib/clientAuth.js` `clientLogin()` | Body: `{ username, password }`. Response: `{ token, event: { profile_id, slug, couple, event_date } }`; stores `token` into `localStorage.client_token` on success |
| Load wishes | `GET /api/client/wishes` | `lib/clientAuth.js` `clientWishes()` | Response: `{ wishes: [...] }` |
| Load invitation envelope | `GET /api/invite/{slug}/full` | `api/invitations.js` `getFull()` | Reused from the guest-invitation lane; supplies `invite.events` and, when `shagun_enabled`, `blessings` (mapped to the `shagun` panel) |
| Load gallery preview | `GET /api/invite/{slug}/live-gallery?limit=6` | `api/gallery.js` `getWall()` | Reused from the live-gallery lane; supplies `photos`, `total` |

## Page Relationships

**Links out to:** `overview.invite_path` (dynamic, external — the couple's own invitation link), `galleryInfo.live_gallery_path` (dynamic — the live gallery route for this invitation).

**Linked from:** provisioned out-of-band by the photographer/studio (a username+passcode handed to the couple directly) — not linked from any other reviewed frontend page. The route accepts an optional `:slug` purely so a successful login can normalize the URL to a bookmarkable, slug-specific address; visiting `/couple/access` directly still works and resolves the slug from the login response.

## Business Rules

- This is a third, fully independent identity system alongside the couple's own site account (`UserAuthContext`) and the studio's account (`AuthContext`) — a couple can be signed out of (or never have) a MAJA account and still use this portal, because it's a credential the photographer issues per-invitation, not a MAJA user account.
- The token is stored in `localStorage.client_token` and sent as a Bearer header via a dedicated axios instance (`clientApi`) that never touches the admin (`admin_token`) or couple-session (httpOnly cookie) auth paths — the three systems cannot leak into or interfere with one another.
- Dashboard data loads are fault-tolerant per-panel: `Promise.allSettled` means a wishes-API outage still lets events and gallery render normally; the page only shows a blocking error if literally everything failed.
- Shagun total is only shown if the invitation's `shagun_enabled` flag is true on the `/full` envelope — even if a `blessings` object is technically present in a raw response, it's not rendered unless that flag is on.
- "Days to go" is computed client-side from `overview.event_date`, floored at 0 once the date has passed (never shows a negative countdown) — displayed as an em-dash if the event date is missing or unparseable.
- A successful login that doesn't include `event.slug` in its response leaves the browser at whatever URL it was already on (bare `/couple/access` or the slug it was given) rather than forcing a redirect — the slug-in-URL normalization is best-effort, not required for the dashboard to function (the dashboard reads `overview.slug` from the overview call, not from the URL param, once loaded).
