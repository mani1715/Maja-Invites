# Ceremony Invitation Page

Route: `/invite/:slug/:eventType`
Source: `frontend-v2/src/pages/CeremonyInvitation.jsx`, `CeremonyInvitation.css`, `styles/inviteShared.css`
Auth: public (no login)

## Overview

A single-ceremony view of a multi-event invitation (e.g. just the Mehendi, or just the Reception), reached either by a guest picking a ceremony pill from the full invitation, or directly via the per-event QR code studios generate on the Wedding QR Codes admin page. Unlike the full invitation, this page is authoritative per-ceremony: it consults the dedicated per-event endpoint first (which carries that ceremony's own design/deity override and its own independent `enabled`/expiry state) rather than trusting the shared envelope's client-side event filter alone.

## Layout

1. **Ceremony nav pills** — one pill per enabled event from the shared envelope (`invite.events`, `enabled !== false`), each linking to `/invite/{slug}/{event_type}`; the pill matching the current ceremony is highlighted. A "Full invitation" button links back to `/invite/{slug}`.
2. **If the requested ceremony resolves to a known event:**
   - **Hero** — "You are invited to the ✦" kicker, ceremony label (`event.name` or a friendly fallback from `CEREMONY_LABELS`, or the raw `event_type`), couple names (split from the combined string), date/time line (with an optional Muhurtham time), venue line, an RSVP CTA anchor (`#rsvp`, only if the full envelope's `sections_enabled.rsvp` is true).
   - **Description section** — a pull-quote from `event.description`, if present.
   - **"Ceremony details" card** — repeats time + name + venue in a card format.
   - **Dress code + logistics split** — left: `event.dress_code` text, if present. Right: a "Getting there" logistics block sourced from the matching per-event venue (or the main venue as fallback) — venue address/name, optional parking info, directions/share links, and a static "Children very welcome" note.
   - **Ceremony RSVP** (`#rsvp`) — only rendered if the full envelope's RSVP section is enabled.
   - **Footer** — "Made with MAJA Invites" link back to `/`.
3. **If the requested ceremony does not resolve** (no matching event) — a "Template preview" fallback card: "This ceremony hasn't been set up yet." + explanation naming the couple (if known) and the requested `eventType`, with an "Open the main invitation" button.

## Fields

**Ceremony RSVP (`CeremonyRsvp`) — a compact quick-RSVP, distinct from the full invitation's RSVP form:**

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Guest name | text input | Yes (checked before enabling status buttons) | non-empty after trim | `''` | |
| Guest phone | text input | Yes (checked before enabling status buttons) | non-empty after trim (no format regex) | `'+91'` | |
| RSVP status choice | button group (single-select) | Yes | Buttons are `disabled` until both name and phone are non-empty | none selected | Options: `Yes, with joy` (`yes`), `Regretfully no` (`no`), `Trying my best` (`maybe`) — **no plus-one option here**, unlike the full invitation's RSVP form |
| CAPTCHA answer | text input | Yes, only when a challenge is issued | — | `''` | |

## Interactions

| Trigger | Behavior |
|---|---|
| `useInviteFull(slug)` not yet `ready` | Renders `InviteStateScreen` (loading/not_found/expired/locked/error) in place of the page |
| `/full` is ready, but `useEventInvitation(slug, eventType)` is still `loading` or `skip` | Renders a loading `InviteStateScreen` — this brief second loading beat prevents flashing the profile-default design/deity before the per-event-authoritative one arrives |
| `useEventInvitation` resolves `unavailable` | Renders the `expired` `InviteStateScreen` — this specific ceremony was explicitly disabled or its own expiry passed; the page deliberately does **not** fall back to the shared envelope in this case |
| `useEventInvitation` resolves `ready` | Its `design_id`/`deity_id` are merged onto the matching event from the shared envelope, overriding the envelope's own values for this ceremony |
| `useEventInvitation` resolves `legacy` (400 unknown type, 404 no match, network hiccup, etc.) | Falls back to purely client-side matching against the shared envelope's `events[]` by `event_type` or `slug`, un-overridden |
| Click a ceremony nav pill | Client-side route to `/invite/{slug}/{that event's event_type}` |
| Click "Full invitation" | Routes to `/invite/{slug}` |
| Click a ceremony RSVP status button | Immediately submits (no separate "submit" click) — `pick(opt)` both sets the choice and calls `submit(...)` synchronously if name+phone are already filled |
| Ceremony RSVP hook returns `captcha` | Shows the CAPTCHA challenge + answer input + an inline "Verify" button (distinct from the full invitation's RSVP, where the whole submit button itself becomes "Verify & send RSVP") |
| Ceremony RSVP succeeds | Shows "Wonderful — you're on the list. Thank you for letting us know." in place of the form |
| Click "See the full wedding invitation →" | Routes to `/invite/{slug}` |
| Fallback (unset ceremony) — click "Open the main invitation" | Routes to `/invite/{slug}` |

## API Dependencies

| Action | Method & Endpoint | Module / Hook | Notes |
|---|---|---|---|
| Load the shared invitation envelope | `GET /api/invite/{slug}/full` | `useInviteFull` (same hook as Guest Invitation) | Supplies venues, wishes-section flags, the full event list for the nav pills |
| Load per-ceremony authoritative view | `GET /api/invite/{slug}/{eventType}` | `api/invitations.js` `getEventInvitation()` via `lib/useEventInvitation.js` | Checks `db.event_invitations` first — this is the exact URL shape QR codes generated on the Studio "Wedding QR Codes" page point at. Response is `InvitationPublicView`-shaped with `events[]` pre-filtered to this event_type |
| Submit ceremony RSVP | `POST /api/rsvp?slug=...&captcha_id=...&captcha_answer=...` | `api/invitations.js` `submitRsvp()` via `lib/useRsvpSubmit.js` | Same shared hook/endpoint as the full invitation's RSVP |
| Generate CAPTCHA challenge | `POST /api/captcha/generate` | `api/invitations.js` `generateCaptcha()` | |

## Page Relationships

**Links out to:** `/invite/{slug}` (multiple placements: "Full invitation" pill-row button, fallback CTA, footer credit-adjacent "See the full wedding invitation" link), `/invite/{slug}/{otherEventType}` (nav pills), `/` (footer "Made with MAJA Invites"), external directions/WhatsApp-share links from venue data.

**Linked from:** Guest Invitation's ceremony timeline cards are not direct links to this page (they show inline event cards, not per-event routes) — the actual entry points are: the nav pills on this page itself (once here), and per-event QR codes generated on the Studio "Wedding QR Codes" admin page (`StudioProfileQrCodes.jsx`).

## Business Rules

- The per-event endpoint (`/invite/{slug}/{eventType}`) is authoritative for exactly three things this ceremony can override independently of the rest of the invitation: `design_id`, `deity_id`, and its own `enabled`/expiry state. Everything else (venues, wishes, shagun, sections_enabled) is still sourced from the shared `/full` envelope.
- An explicitly disabled or expired single ceremony renders as "expired," even if the couple's overall invitation link is still fully valid — the two expiry states are independent.
- Error taxonomy on the per-event endpoint: `400` unknown `event_type`, `404` with "not found in this invitation" (no `event_invitations` row and no matching legacy event) → treated as `legacy` (fall back to client-side filtering); `404` with "is not available" (explicitly disabled/expired) → treated as `unavailable` (show expired state, no fallback); `410` → profile-level link expired, also folded into `legacy` handling per the hook's catch-all.
- Ceremony RSVP intentionally omits the plus-one option present on the full invitation's RSVP — the product surface for a single-ceremony quick-RSVP is deliberately narrower.
- Nav pills always list **every** enabled event from the full envelope, unfiltered by whether each one individually has its own `event_invitations` row — so a couple can navigate between ceremonies even if only some of them have per-event QR-authoritative data.
