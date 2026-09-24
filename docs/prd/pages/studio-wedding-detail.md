# Studio Wedding Detail Page

Route: `/studio/wedding/:id`
Source: `frontend-v2/src/pages/StudioWeddingDetail.jsx`, `StudioWeddingDetail.css`
Auth: `RequireStudio` — admin Bearer identity only

## Overview

The per-wedding overview/home for the studio: 4 KPI tiles (views, RSVPs, wishes, gallery photos), a per-event status list, a merged recent-activity feed (latest RSVPs + wishes), and a sidebar with the copyable invitation link, a compact wedding-details summary, and a couple-access shortcut. This is the "Overview" tab of the per-wedding tool rail (`WeddingToolbar`), which every other per-wedding studio page shares. Ported from "MAJA Studio Wedding Detail.dc.html".

## Layout

Responsive shell: `MobileNav` + `StudioNav` rail + main content.

1. **`WeddingToolbar`** (shared component, also used by Live Gallery and QR Codes) — "← All weddings" back-link (→ `/studio/dashboard`), page title (couple names or "Wedding"), couple date/city line, a status pill (defaults to "Published" — not fetched/derived on this page, [TBC: static default vs. real profile status]), a "View invitation" link, and the horizontal-scroll tool rail (Overview / Theme settings / QR codes / … — only Overview and Live gallery route to real pages; the rest go to `/soon`).
2. **KPI row** (4 tiles) — Invitation views (+ unique visitors), RSVPs in (+ yes/no breakdown), Wishes (+ pending-review count, amber-highlighted if > 0), Gallery photos (+ face-matched count, or "AI gallery not enabled").
3. **Two-column body** (stacks to one column under 1024px):
   - **Left:**
     - "Events in this wedding" card — one row per `profile.events[]` (name, date/time, venue, Live/Draft pill), or "No events added yet."; footer link "View live invitation" (external, `profile.invitation_link`).
     - "Recent activity" card — merged, time-sorted (newest first, capped at 6) feed of RSVPs (`"{guest} RSVP'd yes/no/maybe{ for N}."`) and wishes (`"{author} left a wish."`), each with a relative-time label (`now`/`{n}m`/`{n}h`/`{n}d`) and a colored dot (purple for yes/wish, amber otherwise).
   - **Right (sidebar):**
     - "Invitation link" card — read-only link display, "Copy invitation link" button (label flips to "Link copied").
     - "Wedding details" card — Event type, Language(s), Venue; "Open AI gallery →" link.
     - "Couple access" card — explanatory copy, "Open couple access" link.
4. **Toast** — bottom-fixed, fires only on copy-link success/failure.

## Fields

Read-only page — no form fields, only the copy-link action and outbound navigation links.

## Interactions

### Page load
- `Promise.all([getProfile(id), quickStats(id), listRsvps(id), listWishes(id), galleryStats(id)])` — a single combined loading/error state for all five; any one failing surfaces the generic error card (no per-tile partial-failure handling, unlike Studio Dashboard's KPI/list split).

### Copy invitation link
- **Trigger:** "Copy invitation link" button.
- **Behavior:** writes `{origin}/invite/{profile.slug}` to the clipboard; on success flips the button label to "Link copied" and shows a toast for 2.6s; on failure shows a "Could not copy — copy it manually." toast instead.

### Retry
- **Trigger:** "Try again" on the error card.
- **Behavior:** re-runs the same `Promise.all` load.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Get profile | GET | `/api/admin/profiles/{id}` | Mount | Full profile doc, including `events[]`, `slug`, `invitation_link`, `bride_name`/`groom_name`, `venue`, `city`, `event_type`, `enabled_languages`/`language` |
| Quick stats | GET | `/api/admin/profiles/{id}/quick-stats` | Mount | `views`, `unique_visitors`, `rsvps` (used as a fallback count if `rsvps.length` isn't representative) |
| List RSVPs | GET | `/api/admin/profiles/{id}/rsvps` | Mount | Array of `{id, guest_name, status, guest_count, created_at}` — status `yes`/`no`/other feeds both the KPI breakdown and the activity feed |
| List wishes | GET | `/api/admin/profiles/{id}/wishes` | Mount | `{wishes[], counts: {approved, pending}}` |
| Gallery stats | GET | `/api/admin/profiles/{id}/gallery/stats` | Mount | Same endpoint as Studio Profile Gallery — `{enabled, total_photos, photos_with_faces}` |

All five are ownership-scoped to the calling admin (super_admin bypasses) via the shared `_verify_admin_owns`/ownership-check pattern used throughout `studio.py`'s admin routes.

## Page Relationships

- **From:** Studio Dashboard's wedding cards; `WeddingToolbar`'s "Overview" tab from Studio Live Gallery and Studio QR Codes pages (both render the same toolbar with `weddingId` pinned to this route).
- **To:** `/studio/dashboard` (back link), `/studio/profile/{id}/gallery` (Open AI gallery), `/couple/access` (Open couple access — not scoped to this specific wedding; a generic entry point), `/studio/wedding/{id}/live-gallery` and `/studio/profile/{id}/qr-codes` (via the shared toolbar's tool rail), external `profile.invitation_link` (View live invitation).
- **Data coupling:** the "Gallery photos" KPI and Studio Profile Gallery's own stats both read `gallery/stats` for the same profile independently — no shared cache or cross-page refresh trigger.

## Business Rules

- The RSVP/wishes "Recent activity" feed merges two independently-paginated sources (first 5 of each) and re-sorts client-side by `created_at` — it is not a true unified activity log; an event type not covered by RSVPs/wishes (e.g. gallery uploads, payment) never appears here.
- The status pill in `WeddingToolbar` defaults to `"Published"` when no `status` prop is passed — this page doesn't pass one, so the pill always renders "Published" regardless of the wedding's actual draft/published/archived state. [TBC whether this is an intentional simplification or a gap versus Studio Dashboard's more accurate `statusOf()` derivation.]
- "Couple access" links to a generic `/couple/access` entry point, not one pre-scoped to this specific wedding/slug — the couple authenticates separately on that page.
- Gallery KPI shows "AI gallery not enabled" as the delta text (rather than a photo sub-count) whenever `galleryStats.enabled` is false, regardless of `total_photos`.
