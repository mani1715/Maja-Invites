# Wedding Live Gallery Page (Studio Moderation)

Route: `/studio/wedding/:weddingId/live-gallery`
Source: `frontend-v2/src/pages/WeddingLiveGallery.jsx`, `WeddingLiveGallery.css`
Auth: `RequireStudio` — admin Bearer identity only

## Overview

The studio's moderation console for one wedding's live photo wall — the same feed guests see/contribute to at `/invite/:slug/live-gallery` (public page, not covered here). The studio reviews All/Pending/Published photos, bulk-publishes a selection, pauses/resumes guest uploads, and toggles three moderation rules. This page is fetch-once-and-manually-refresh; it does **not** hold a live/streaming connection — see Business Rules for the discrepancy with how this page is sometimes described elsewhere.

## Layout

Sticky `MobileNav` + `StudioNav` sidebar + main content.

1. **`WeddingToolbar`** (shared with Studio Wedding Detail / QR Codes) — active tab "Live gallery".
2. **Top row** — a static "● Live" chip (styling only, not tied to a real connection state — see Business Rules), a 3-tab pill group (All/Pending/Published, each suffixed with its live count), and a "Pause uploads"/"Resume uploads" toggle button (disabled until settings load).
3. **KPI strip** (`px-aurora` background) — 3 tiles: "Uploaded today", "Awaiting review", "Guests uploading" (count of distinct guest uploader names among today's — actually all-time — guest-type photos).
4. **Two-column body:**
   - **Left: photo grid** — selectable tiles (border highlights on select), each showing the thumbnail, uploader name (or "Studio"/"Guest"), and a small mark (✓ approved / · pending). Below the grid: "Publish {n} selected" and "Clear selection" buttons.
   - **Right: rail** —
     - "Guest uploads" card — static explanatory copy + a placeholder line ("Table QR — set up under this wedding's QR codes page"); no live QR rendered here.
     - "Moderation" card — 3 toggle switches (`RULES`): "Hold guest photos for review before publishing" (`moderation_required`), "Auto-approve photos as they arrive" (`auto_approve`), "Watermark guest uploads" (`watermark_enabled`).
     - "After the event" card — static explanatory copy only.
5. **Toast** — bottom-fixed, 2.4s auto-dismiss.

## Fields

No form fields — selection state and toggle switches only.

| Control | Type | Notes |
|---|---|---|
| Tab filter | 3-way pill group | All / Pending / Published — filters the grid client-side from the one already-fetched photo list, no re-fetch |
| Photo tile select | toggle (click) | Multi-select; feeds "Publish {n} selected" |
| Pause/Resume uploads | button | Flips `settings.guest_upload_enabled` |
| Moderation rule switches ×3 | toggle switch | Each independently PUTs the full settings object with one key flipped |

## Interactions

### Page load
- `Promise.all([adminGetPhotos(weddingId), getLiveGallerySettings(weddingId)])`, once, on mount (guarded on `weddingId` being present).

### Filter tabs
- Purely client-side `.filter()` over the already-loaded `photos` array — switching tabs never re-fetches.

### Select / clear photos
- Click toggles a photo id in/out of `selected[]`. "Clear selection" empties it.

### Publish selected
- **Trigger:** "Publish {n} selected" (no-ops with a "Select some photos first." toast if nothing is selected).
- **Behavior:** fires `PUT /api/admin/live-gallery/{photoId}/moderate?approved=true` **once per selected photo id**, in parallel (`Promise.all`). On success, optimistically flips `approved: true` for those ids in local state, clears the selection, toasts the count published. On any failure, toasts a generic "Could not publish — please try again." (partial failures within the batch aren't distinguished per-photo).

### Pause / resume uploads
- **Trigger:** the toggle button.
- **Behavior:** optimistically flips `guest_upload_enabled` in local state immediately, then `PUT /api/admin/profiles/{weddingId}/live-gallery/settings` with the full settings object. On failure, reverts the optimistic flip and toasts an error.

### Toggle a moderation rule
- **Trigger:** one of the 3 rule switches (disabled individually while its own save is in flight, via `savingRule`).
- **Behavior:** same optimistic-update-then-PUT-then-revert-on-failure pattern as pause/resume, scoped to that one key. Success toasts `{label} turned on./off.`.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Admin photo list | GET | `/api/admin/profiles/{weddingId}/live-gallery` | Mount | Returns `{photos[], total}`, merged from two backend collections (`live_photos` for guest/desktop uploads, `live_gallery_photos` for photographer uploads) so neither source is unmoderatable from here |
| Live gallery settings | GET | `/api/admin/profiles/{weddingId}/live-gallery/settings` | Mount | `{enabled, guest_upload_enabled, auto_approve, moderation_required, watermark_enabled, max_photos_per_guest}` |
| Moderate photo | PUT | `/api/admin/live-gallery/{photoId}/moderate?approved={bool}` | Publish action, once per selected id | Looks the photo up across both backend collections before updating |
| Update settings | PUT | `/api/admin/profiles/{weddingId}/live-gallery/settings` | Pause/resume, rule toggle | Always sends the **entire** settings object (spread + one changed key), not a partial patch |

## Page Relationships

- **From:** `WeddingToolbar`'s "Live gallery" tab from Studio Wedding Detail / QR Codes (shares `weddingId`).
- **To:** other `WeddingToolbar` tabs (Overview is the only other built one; the rest route to `/soon`).
- **Data coupling:** this page and the public `/invite/:slug/live-gallery` wall both ultimately read/write the same two Mongo collections (`live_photos`, `live_gallery_photos`) via different endpoints — approving a photo here makes it visible on the public wall on that page's next fetch, but there is no push/socket link between the two; each polls or loads independently.

## Business Rules

- **This page has no realtime/WebSocket channel.** Despite the "● Live" chip and the "Live gallery" naming, the photo list and settings are fetched once on mount and only refreshed by the page's own mutation handlers (optimistic local updates) or a manual reload (browser refresh / route re-entry) — there is no polling interval, WebSocket, or device-token handshake on this admin page. (Device-token-gated realtime access — including a documented `4401` stop/close code — exists elsewhere in this codebase for the **public** guest-facing live photo wall (`LivePhotoWall.jsx` / `lib/galleryAccess.js`), which is a different page from this studio moderation console and outside this document's scope.)
- Publishing is a **fan-out of individual PUT calls**, one per selected photo — there is no dedicated bulk-moderate endpoint. A partial failure mid-batch (e.g. network drop after 3 of 10 succeed) is invisible to the studio beyond the generic failure toast; the successfully-moderated photos are not distinguished from the failed ones in the UI.
- `moderation_required` and `auto_approve` are two independently toggleable flags with overlapping effect — the backend's actual approval logic for a **guest** upload is `approved = auto_approve AND NOT moderation_required` (see `premium_features.py::guest_upload`), so with both flags on, `moderation_required` wins and guest photos land pending. Desktop/photographer uploads instead approve purely on `auto_approve` (backend `desktop_upload`), ignoring `moderation_required` entirely. This page exposes both switches as flat, independent toggles with no inline explanation of that interaction.
- Filter tabs (All/Pending/Published) operate on a snapshot fetched at page load — a photo approved elsewhere (e.g. another admin session) while this page is open won't move tabs until the page is reloaded.
- The "Guest uploads" rail card is informational only on this page; actually generating/viewing the table QR that drives guest uploads lives on the separate QR Codes page (`/studio/profile/{profileId}/qr-codes`), not here — the copy explicitly says so.
