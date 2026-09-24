# Guest Arrival Page

Route: `/invite/:slug/arrival`
Source: `frontend-v2/src/pages/GuestArrival.jsx`, `GuestArrival.css`
Auth: public (no login)

## Overview

An on-site, mobile-first arrival experience for a guest who has just reached the venue (typically reached via a QR code at the entrance) — a "Welcome" screen, an optional "Check in" form that marks the guest as arrived, and an optional "Know your room" lookup for guests who are also staying at a linked accommodation. Which of the latter two tabs appear is controlled per-invitation by `sections_enabled.check_in` and `sections_enabled.guest_rooms`.

## Layout

1. **Pill nav** — tabs for `Welcome` (always present), `Check in` (if enabled), `Know your room` (if enabled).
2. **Welcome screen** — "A note for you ✦" eyebrow, "{FirstName}, you're here." heading, welcome copy, a decorative voice-note "player" (play/pause toggle only — no real audio asset or endpoint backs it, so it is static onboarding chrome by design, not a broken feature), an "Open the invitation" button (→ `/invite/{slug}`), and a "Save for later" / "Saved to your phone" toggle button (local UI state only, does not actually persist a bookmark anywhere).
3. **Check In screen:**
   - Pre-submit: "Let them know you made it." heading, a form (Your name, Phone, party-size chip selector), submit button ("Submit").
   - Post-submit success: a checkmark, "You're checked in.", "Thanks, {guest_name}. The hosts have been notified.", a note to show the screen at the welcome desk, and a "Check someone else in" button that resets the form.
4. **Know Your Room screen** — "Where you're staying." heading, a name-search form ("Your name" + "Find" button), and one of: a room-detail card per match (room number, building/floor, check-in/check-out/notes rows, a "Directions" link if an address exists), a "No room under that name." empty state, or a "Couldn't search right now" error state.
5. **Profile-load error state** — if the underlying invitation lookup fails entirely, the whole page collapses to a single "Can't open this page." card with the backend's error detail, replacing all three tabs.

## Fields

**Check In form:**

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Your name | text input | Yes | non-empty after trim | `''` | Placeholder: "As it appears on the invitation" |
| Phone | text input | Yes | non-empty after trim (no format regex) | `''` | Placeholder: "+91" |
| Party size | button group (single-select) | No (has a default) | — | `'2'` | Enum: `1`, `2`, `3`, `4`, `5+` — sent as free text inside a `note` field (`Party of {party}`), not a structured count |

**Know Your Room search:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Name query | text input | Yes | trimmed length ≥ 2 to actually search (shorter input is treated as `missing`) | `''` |

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | Fetches `GET /invite/{slug}` (via `getBySlug`) to get `sections_enabled` and the couple's first name for the Welcome copy; failure sets a page-wide error state, replacing all content |
| Viewport resize | Recomputes responsive padding/sizing breakpoints (`isPhone` < 640px, `isMobile` < 760px) — layout-only, no functional change |
| Click a nav pill | Switches the active `screen` between `Welcome` / `Check in` / `Know your room` — purely local state, no re-fetch |
| Click the voice-note play button | Toggles `playing` (label switches "Tap to play" ↔ "Playing…") — decorative only, no actual audio playback wired |
| Click "Save for later" | Toggles `bookmarked` label between "Save for later" and "Saved to your phone" — local UI state only, not persisted |
| Click "Open the invitation" | Routes (plain anchor) to `/invite/{slug}` |
| Edit Check-In name/phone | Clears any existing `ciError` as the user types |
| Click a party-size chip | Sets `party` to that value (single-select) |
| Submit Check-In form | Requires name + phone non-empty; calls `checkIn`; on success shows the success panel with the server's `guest_name`; on failure shows the backend's `detail` or a generic retry message |
| Click "Check someone else in" | Clears `checkedIn`, `ciName`, `ciPhone`, returning to the empty form |
| Edit room-search query | Clears any prior `roomState` result as the user types |
| Submit room search with query length < 2 | Sets `roomState = 'missing'` locally, without calling the backend |
| Submit room search with query length ≥ 2 | Calls `roomLookup`; sets `roomState = 'found'` (with `roomMatches`) if any matches return, else `'missing'`; sets `roomState = 'error'` on a request failure |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Load invitation profile | `GET /api/invite/{slug}` | `api/invitations.js` `getBySlug()` | Supplies `sections_enabled.check_in`, `sections_enabled.guest_rooms`, and `bride_name`/`groom_name` for the Welcome greeting. If this call is present but doesn't error, `check_in`/`guest_rooms` default to enabled (`!profile || sections.x !== false`) — i.e. the tabs are also shown while `profile` is still `null` (pre-fetch), only hiding once a loaded profile explicitly turns a section off |
| Submit check-in | `POST /api/invite/{slug}/check-in` | `api/invitations.js` `checkIn()` | Body: `{ guest_name, guest_phone, note }`. Response has no table-number field — the confirmation screen deliberately doesn't fabricate one |
| Search accommodation by guest name | `GET /api/invite/{slug}/room-lookup?name=` | `api/invitations.js` `roomLookup()` | Response: `{ matches: [...] }`, each match potentially including `room_number`, `building`, `floor`, `check_in`, `check_out`, `notes`, `address`, `map_link` |

## Page Relationships

**Links out to:** `/invite/{slug}` ("Open the invitation").

**Linked from:** typically a dedicated venue-entrance QR code (not one of the QR types generated by the Studio "Wedding QR Codes" admin page in the reviewed backend surface — [TBC exact QR provisioning path for this specific route]); not linked from any other reviewed frontend page.

## Business Rules

- The three tabs are independently togglable per-invitation via `sections_enabled.check_in` and `sections_enabled.guest_rooms` — a couple can offer arrival check-in without room lookup, or vice versa, or neither (Welcome-only).
- Party size on check-in is captured as a free-text note (`Party of {size}`), not a structured numeric field — the backend receives no distinct `party_size` field, only the embedded note string.
- The check-in confirmation screen intentionally does not display a table/seat number, because the check-in response doesn't return one — this is called out as a deliberate choice not to fabricate data the backend doesn't provide.
- The welcome "voice note" player and "save for later" bookmark are both non-functional UI affordances by design — no audio asset/endpoint and no persistence layer back them; they exist purely as onboarding chrome consistent with the original design mock, not as claims of a working feature.
- Room lookup requires at least 2 characters before it will query the backend — this is a client-side gate to avoid triggering broad-match searches on a single keystroke, not a backend-enforced minimum.
