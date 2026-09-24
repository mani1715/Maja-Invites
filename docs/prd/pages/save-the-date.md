# Save the Date Page

Route: `/save-the-date/:slug`
Source: `frontend-v2/src/pages/SaveTheDate.jsx`, `SaveTheDate.css`, `styles/inviteShared.css`
Auth: public (no login)

## Overview

A lightweight teaser page a couple can share before the full invitation is ready — a single photo, the couple's names, the date, venue, and a countdown, with an "Add to calendar" action and a "Copy the link" share affordance. It calls a dedicated, lighter-weight endpoint than the full invitation (no view-tracking side effects implied by the naming).

## Layout

**Loading state:** spinner + "One moment" / "Loading the save-the-date…".

**Gone/error state:** an "×" icon card, "This page is unavailable.", and one of two messages depending on cause (see Interactions), with a "Go to MAJA Invites" button back to `/`.

**Ready state:**
1. **Photo panel** — the couple's photo (`couple_photo_url` → `bride_photo_url` → `groom_photo_url` fallback chain), a decorative glow overlay, and an optional caption from `invitation_message`.
2. **Content panel:**
   - Kicker "Save the date ✦"
   - Couple names (groom, then "& {bride}")
   - Date line (formatted, e.g. "FEBRUARY 14, 2027")
   - Venue line ("VENUE, CITY") + static "An invitation follows." note
   - Countdown (days/hours/minutes — no seconds, unlike the full invitation's countdown), hidden once elapsed
   - "Add to calendar" button and "Copy the link" button
   - The current page's host+path shown as plain text below the actions

## Fields

None — this page has no data-entry fields, only two action buttons.

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount / `slug` present | Calls `GET /api/save-the-date/{slug}`; sets `status` to `loading` → `ready` on success |
| Fetch fails with `404` or `410` | Sets `status = 'gone'` — shown message: "The link may have expired, or the couple has taken it down. If you were expecting an invitation, ask them for the new link." |
| Fetch fails with any other error | Sets `status = 'error'` — shown message: "We couldn't load this page right now. Please try again shortly." |
| Countdown reaches zero | The countdown block is hidden (`countdown.elapsed`) |
| Click "Add to calendar" | Navigates (plain anchor, not a client route) to `{API_URL}/api/invite/{slug}/calendar` — the backend generates and serves the calendar file/redirect |
| Click "Copy the link" | Copies `window.location.href` to the clipboard via `navigator.clipboard.writeText`; shows "Link copied" label for 2 seconds; silently no-ops if the Clipboard API throws/is unavailable |
| Click "Go to MAJA Invites" (gone/error state) | Routes to `/` |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Load teaser data | `GET /api/save-the-date/{slug}` | `api/invitations.js` `getSaveTheDate()` | Explicitly documented as a "lightweight teaser payload… (no view tracking)," distinct from the full invitation's `/full` envelope |
| Add to calendar | `GET {API_URL}/api/invite/{slug}/calendar` | Direct anchor `href`, not an axios call | Not wrapped in any `api/*.js` module — a plain browser navigation, presumably returning an `.ics` file or a calendar-provider redirect. [TBC exact response shape/behavior — not covered by any frontend module] |

## Page Relationships

**Links out to:** `/` (error/gone state's "Go to MAJA Invites"), external calendar endpoint (`/api/invite/{slug}/calendar`).

**Linked from:** the invite-sharing flow generally (this is typically the first link shared, before the full invitation is built/ready); no other page in the reviewed set links here directly — it is a standalone share target. [TBC — the Guest Invitation footer links to Live Photo Wall and itself but not to Save the Date from elsewhere.]

## Business Rules

- This page is meant to be usable **before** the full invitation exists/is ready — it hits its own lighter `save-the-date` endpoint rather than `/full`, and the "An invitation follows." copy is a static promise that a fuller invitation is coming later at `/invite/{slug}`.
- Countdown here omits seconds (days/hours/minutes only) and ticks once per minute (`useCountdown(teaser?.event_date, 60000)`), a coarser cadence than the full invitation's per-second countdown — appropriate for a page meant to be glanced at, not watched.
- Photo fallback order is couple photo → bride photo → groom photo; if none exist, no image renders (no placeholder graphic).
- `410` and `404` are treated identically as "gone" (expired-or-removed), with no way for the visitor to distinguish "never existed" from "was taken down."
