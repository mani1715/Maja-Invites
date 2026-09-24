# Order Details Page

Route: `/order/:orderId/details`
Source: `frontend-v2/src/pages/OrderDetails.jsx`, `OrderDetails.css`, `buyer-shared.css`
Auth: requires a signed-in identity (same `get_current_public_user` dependency as the store APIs — couple or admin/studio, whichever created the order) — no `RouteGuard` wrapper; a signed-out visitor gets a 401 from `getOrder` and the page renders its generic error state rather than redirecting to `/auth`

## Overview

Post-payment intake form for a "done-for-you" studio order (as opposed to the self-service invitation editor at `/user/profile/:id/edit`). The buyer tells the studio everything needed to hand-build the invitation — couple names, date/venue, family names, music, digital shagun/UPI, one FAQ pair — with the form auto-saving a draft every 2 seconds and resuming a previous session if one exists. Once submitted, the order moves into the studio's build queue and the page shows a static "Thank you" screen.

## Layout

1. **Nav** — MAJA Invites brand mark (→ `/`) only; no back-link.
2. **Resume banner** (conditional, only if an unsubmitted draft exists) — "Resume your previous invitation?" with **Resume** / **Start fresh** buttons.
3. **Locked state** (`editState.can_edit === false`) — "Editing is closed" or "Not editable yet" card with the server's `reason` text and either a pre-filled WhatsApp deep link ("Contact us on WhatsApp for changes") or plain contact copy.
4. **Form** (editable state) — sectioned cards, each a `Section`/`Field` pair:
   - **The couple** — Groom's full name, Bride's full name
   - **When & where** — Wedding date, Venue name, Map link, Directions & parking, City, Phone number
   - **With the blessings of our families** — Groom's father/mother, Bride's father/mother
   - **Background music & films** (full-width) — Music or film link
   - **Gifts & digital shagun** — UPI ID, Message with the gift
   - **Guest FAQ** — one Question/Answer pair
   - Inline error banner, "Complete" submit button (spinner while submitting)
   - A "Saved" tag flashes briefly (1.2s) after each successful autosave
5. **Done state** — "Thank you!" card with the server's `message` (or a default) and a "Back to MAJA Invites" link.

## Fields

All fields map onto the legacy `OrderInfoRequest` shape — top-level keys plus a free-form `extra` dict — so the studio's existing fulfillment console keeps reading the same field names unchanged.

| Field | Type | Required | Maps to | Notes |
|---|---|---|---|---|
| Groom's full name | text | **Yes** | `groom_name` | |
| Bride's full name | text | **Yes** | `bride_name` | |
| Wedding date | `type="date"` | **Yes** | `event_date` | |
| Venue name | text | No | `venue` | |
| Map link | text | No | `extra.venue_google_map_link` | |
| Directions & parking | text | No | `extra.parking.text` | `extra.parking.enabled`/`google_map_link` exist in the data shape but have no form control on this page |
| City | text | No | `city` | |
| Your phone number | text (`inputMode="tel"`) | **Yes** | `phone` | |
| Groom's father / mother | text | No | `extra.groom_father` / `extra.groom_mother` | |
| Bride's father / mother | text | No | `extra.bride_father` / `extra.bride_mother` | |
| Music or film link | text | No | `extra.background_music_url` | |
| UPI ID | text | No | `extra.shagun.upi_id` | Setting a non-empty value also sets `extra.shagun.enabled` and `extra.accepting_gifts` to true in the same change |
| Message with the gift | text | No | `extra.shagun.message` | |
| FAQ Question / Answer | text ×2 | No | `extra.faq[0].q` / `.a` | Single-pair array; empty if both q and a are blank |

Required-field validation (`REQUIRED` list: bride, groom, date, phone) runs client-side on submit only — focuses the first invalid field and shows "Please fill in {label}." No per-field inline validation on blur/change.

## Interactions

### Page load
- `GET /api/store/order/{orderId}` (`loadState`: `loading` → `ready`/`error`).
- If `data.info` exists (already submitted at least once), the form is seeded from it directly — no resume prompt, the buyer is just editing their own current values.
- Else if `data.info_draft` exists, the resume banner appears instead of auto-applying the draft.

### Autosave draft
- **Trigger:** any form field change, debounced 2000ms (`DRAFT_DEBOUNCE_MS`).
- **Guard:** only fires once the order has loaded and `order.edit_state.can_edit` is true and the buyer hasn't already completed submission (`done` is null).
- **Behavior:** `PUT /api/store/order/{orderId}/info-draft` with the whole form; on success flashes "Saved" for 1.2s. Failures are silently swallowed (best-effort autosave).

### Resume banner
- **Resume:** merges `resumePrompt` (the draft) into the form, dismisses the banner.
- **Start fresh:** dismisses the banner without touching the form (which stays at its `EMPTY_FORM` seed).

### Submit ("Complete")
- **Trigger:** form submit.
- **Client validation:** each of bride/groom/date/phone must be non-empty (trimmed) or the submit is blocked with a focus + inline message.
- **Behavior:** `POST /api/store/order/{orderId}/info` with the full form. On success, stores the response as `done` (switches to the Thank You screen). On failure, shows the backend's `detail` or "Could not submit your details. Please try again."

### Locked state
- Rendered instead of the form whenever `order.edit_state.can_edit` is false (see Business Rules for exactly when). If the server-configured studio WhatsApp number is present, shows a `wa.me` deep link pre-filled with a message including the order id; otherwise a plain "contact our team" note.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Get order | GET | `/api/store/order/{orderId}` | Mount, retry-on-error | Response includes the order plus a computed `edit_state` object (`can_edit`, `reason`, `first_fill`, `delivered`, `post_delivery_edits_remaining`, `whatsapp_number`, …) |
| Save draft | PUT | `/api/store/order/{orderId}/info-draft` | Debounced form change | 403s (via `_require_editable`) if `edit_state.can_edit` is false — the debounce guard on the frontend is meant to prevent this from firing, but the backend re-checks independently |
| Submit info | POST | `/api/store/order/{orderId}/info` | "Complete" submit | First-ever submission flips `build_status` to `building` and reserves the order's storage folders; a submission **after delivery** instead increments `post_delivery_edits` and raises an admin notification (see Business Rules) — no rebuild is triggered |

All three require the caller to be the order's own owner (`user_id` match) — a stranger's order id 404s rather than leaking data.

## Page Relationships

- **From:** Checkout, on both the free-order path and the paid-and-verified path (`navigate('/order/{orderId}/details')`); also directly reachable/bookmarkable by URL since the flow may span multiple sessions (autosave + resume exist specifically for this).
- **To:** `/` (brand mark, "Back to MAJA Invites" on the done screen), an external `wa.me/{number}` deep link (locked state, studio contact).
- **Data coupling:** none with other reviewed pages — Order Details doesn't feed data back into Cart/Checkout/UserDashboard directly, though a submitted order does surface as an "Orders" tab card on UserDashboard once its `build_status` changes.

## Business Rules

- **Edit window** (server-computed `edit_state`, `store_features.py::_edit_state`):
  - Unpaid orders can never be edited (`can_edit=false`, "Payment required before adding details.").
  - The **first fill** is always allowed regardless of any other setting.
  - After the first fill, the studio can lock a specific order (`edit_locked`) or turn off editing globally (`fulfillment_settings.edit_enabled`) — either blocks further edits with an explanatory reason.
  - While the order is still being prepared (`pending_info`/`building`, not yet delivered) and not locked, editing stays open.
  - **After delivery**, the buyer gets up to **3** more edits (`POST_DELIVERY_MAX_EDITS`). Each edit after delivery does **not** trigger a rebuild — it just raises an admin notification ("Buyer edited details after delivery — update the live link") for the studio to apply the change manually. Once all 3 are used, further edits are blocked and the buyer is pointed at WhatsApp.
- The first-ever submission (`build_status: pending_info → building`) also reserves two Drive folders (QR photos + guest selfies) via `event_folders.ensure_order_folders` and raises a "ready to build" admin notification carrying the folder names and storage account — this happens synchronously in the submit request, best-effort (folder-reservation failure doesn't fail the submission).
- `extra` is a free-form dict, not a fixed schema — this form only surfaces a subset of the fields the legacy full order form supported (no photo uploads, no ceremony-type picker); other `extra` keys the legacy form used are simply absent here, not removed server-side.
- Draft autosave is cross-device by design (server-persisted via `info-draft`, not just localStorage) so a buyer can start on mobile and resume on desktop.
