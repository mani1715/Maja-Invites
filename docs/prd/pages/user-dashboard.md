# User Dashboard Page

Route: `/user/dashboard`
Source: `frontend-v2/src/pages/UserDashboard.jsx`, `UserDashboard.css`
Auth: `RequireUser` — couple/buyer cookie identity only; signed-out visitors are redirected to `/auth` with `state: { from: '/user/dashboard', persona: 'couple' }`

## Overview

The couple's home base after signing in: a tabbed console (Home / Orders / Profile) showing their live invitation link and quick stats, a merged list of every "order" they have (self-service invitations + done-for-you studio orders), an inline profile editor for their primary invitation, and DPDP-style account data export/delete tools. Ported from the "MAJA User Dashboard" M12 prototype but trimmed to only what the real backend supports (see Business Rules for the deliberate deviations from the mock).

## Layout

1. **Nav** (`mjud-nav`) — brand (→ `/`), "Browse designs" (→ `/pricing`), "Cart" (→ `/cart`), "Log out" button.
2. **Header** — "Hello, {first name}" + subtext.
3. **Tab row** (`role="tablist"`) — Home / Orders / Profile.
4. **Home tab:**
   - Error banner + Retry if the invitations list failed to load.
   - Skeleton while loading; empty state ("You haven't created an invitation yet." + Browse designs CTA) if the buyer has zero invitations.
   - Otherwise, a **hero card** for the buyer's first invitation (`profiles[0]`): eyebrow "Your invitation", `{bride} & {groom}`, event type + formatted date + city, a copyable `maja.in/{slug}` link box, "Enter details" (→ edit page) and "View invitation" (→ public page) buttons.
   - A **3-tile stats grid** (RSVPs so far / Blessings / Gallery photos) sourced from the hero invitation's insights, each with a skeleton state and, for RSVPs, a "{coming} coming · {awaiting} awaiting" sub-line.
5. **Orders tab:**
   - Error banner (either profiles or orders failed), skeleton, or empty state.
   - A card list merging both order sources (see Fields) — thumbnail swatch, title, status badge, meta line, note line, primary action button, secondary action button.
6. **Profile tab:**
   - Skeleton, empty state ("Create an invitation first…"), or a form card ("Invitation details") for the hero invitation with a grid of labeled inputs/textarea and a "Save changes" button (disabled unless dirty).
   - An "Account data" card — explanatory copy, "Export my data" button, "Delete my account" button.
7. **Delete-account confirmation modal** — title, warning copy, Cancel / Delete account buttons.
8. **Toast** — bottom-fixed, success or error styling, auto-dismisses after 2.6s.

## Fields

### Profile tab form (`FIELD_DEFS`)

| Field | Type | Maps to | Notes |
|---|---|---|---|
| Groom's name | text | `groom_name` | |
| Bride's name | text | `bride_name` | |
| Event date | `datetime-local` | `event_date` | Converted via local (not UTC) getters both ways — `toISOString()` would silently shift the displayed/saved time by the browser's UTC offset |
| City | text | `city` | |
| Venue | text | `venue` | |
| Invitation message (span 2 cols) | textarea | `invitation_message` | "The line at the top of your invitation" |

Save button is disabled unless the form is `dirty` (any field touched since last load/save) and not currently `saving`. Empty-string/null fields are dropped from the PATCH body entirely rather than sent as blanks.

### Orders tab — merged card fields (computed, not a form)

| Source | Card fields |
|---|---|
| Self-service invitation (`profiles[]`) | title = couple names or `celebrant_info.name`, status always **"Live"** (self-service links publish immediately), meta = `{category} · {date}`, note = venue/city or "No venue set yet.", primary = "View invitation" (→ `/invite/{slug}`), secondary = "Edit" (→ `/user/profile/{id}/edit`) |
| Studio order (`orders[]`) | title = `package_label`/`design_id`, status derived from `build_status` ("Live" if delivered + has `live_url`, "In build", else "Details pending"), meta = `Order {fulfillment_code} · ₹{amount}`, primary = "View invitation" (external, if Live) or "Enter details" (→ `/order/{id}/details`), secondary = "Invoice" (flashes "Invoices aren't available for studio orders yet." — no invoice endpoint exists) |

## Interactions

### Page load / auth
- If `authLoading` resolves with no `user`, redirects to `/auth` (replace).
- Once signed in, fires `listProfiles()` and `myOrders()` in parallel; each has its own loading/error state.

### Hero + insights
- `hero = profiles[0]` (or null). Whenever `hero` changes, fetches `profileInsights(hero.id)` for the stats tiles, and re-seeds the Profile-tab form from `hero`'s current field values (discarding any unsaved edits — a fresh `hero` reference always wins).

### Copy invitation link
- **Trigger:** "Copy link" in the hero card.
- **Behavior:** writes `{origin}/invite/{slug}` to the clipboard (best-effort, swallows failure), flips the button label to "Copied" for 1.8s.

### Save profile (Profile tab)
- **Trigger:** form submit, guarded against double-submit while `saving`.
- **Behavior:** builds a body from only the non-empty/non-null fields (event_date converted to ISO), `PATCH`es, replaces the matching entry in `profiles[]` with the server's returned `profile` on success, clears `dirty`, shows a "Saved." toast. Failure shows the backend's `detail` or a generic message, as an error toast.

### Export my data
- **Trigger:** "Export my data".
- **Behavior:** `GET /api/account/export` as a blob, triggers a browser download named `my-data-export.json` via an object URL, then revokes the URL. Toast on success/failure.

### Delete my account
- **Trigger:** "Delete my account" → confirmation modal → "Delete account".
- **Behavior:** `POST /api/account/delete-request` with `{ confirm: true }`; on success closes the modal, calls `logout()`, and navigates to `/` (replace). Failure keeps the modal open and shows an error toast.

### Log out
- **Trigger:** nav "Log out" button.
- **Behavior:** `await logout()` then navigates to `/`.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| List invitations | GET | `/api/users/profiles` | Mount (post-auth) | Couple-owned, scoped server-side to the caller |
| List orders | GET | `/api/store/my-orders` | Mount (post-auth) | All studio orders for the caller, newest first |
| Profile insights | GET | `/api/users/profiles/{id}/insights` | Whenever `hero` changes | RSVP total/coming/not_coming/awaiting, wish count, gallery photo count (own + live-gallery, summed) |
| Update profile | PATCH | `/api/users/profiles/{id}` | Save profile form | Whitelists exactly: `groom_name`, `bride_name`, `venue`, `city`, `invitation_message`, `event_date`, `about_couple`, `love_story`, `whatsapp_groom`, `whatsapp_bride`, `bride_photo_url`, `groom_photo_url`, `couple_photo_url`; any other key is silently dropped server-side |
| Export data | GET | `/api/account/export` | "Export my data" | `responseType: 'blob'` |
| Delete account | POST | `/api/account/delete-request` | Confirmed delete | Anonymizes PII and soft-deletes; irreversible |

## Page Relationships

- **From:** Sign In's post-login redirect (couple persona), `RequireUser` redirect target once authenticated, Studio Wedding Detail's "Open couple access" link goes to `/couple/access` (a separate flow) rather than here directly — [TBC: no page in the reviewed set links straight into `/user/dashboard` other than the auth flow itself].
- **To:** `/` (brand, post-logout, post-delete), `/pricing` (Browse designs, multiple empty-state CTAs), `/cart`, `/user/profile/{id}/edit` (hero "Enter details", Orders-tab "Edit"), `/invite/{slug}` (hero "View invitation", Orders-tab "View invitation" for self-service), `/order/{id}/details` (Orders-tab "Enter details" for pending studio orders), external `live_url` (Orders-tab "View invitation" for delivered studio orders).
- **Data coupling:** the Profile tab only ever edits `profiles[0]` (the "hero") — a buyer with multiple invitations has no way to switch which one is being edited from this page; User Wedding Edit is the only place a *specific* invitation (by id) can be opened directly.

## Business Rules

- **"Hero" invitation is always `profiles[0]`** — whatever order `GET /api/users/profiles` returns first (server-side sort not verified from this page alone — [TBC exact ordering, likely creation order]). A buyer with several invitations only sees stats/edit access for that one from the dashboard.
- Self-service invitations are always shown as **"Live"** status — they publish immediately on creation, unlike studio orders which pass through `awaiting_payment → pending_info → building → delivered`.
- The "Invoice" action on studio-order cards is a deliberate stub: no invoice endpoint exists yet for `invitation_orders`, so the button flashes an explanatory toast instead of attempting a download.
- The DC prototype's "RSVPs & wishes" hero CTA was dropped — its target route (a separate Client Dashboard) doesn't exist in this build; the same numbers already surface via the quick-stat tiles.
- Account delete is a DPDP-style **anonymize + soft-delete**, not a hard row delete — see `backend/account_data.py`. It is irreversible from the UI (no "undo").
