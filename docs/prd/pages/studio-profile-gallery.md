# Studio Profile Gallery Page

Route: `/studio/profile/:profileId/gallery`
Source: `frontend-v2/src/pages/StudioProfileGallery.jsx`, `StudioGallery.css`
Auth: `RequireStudio` — admin Bearer identity only

## Overview

The photographer's AI face-match gallery manager for one wedding (`:profileId`): enable the AI gallery, bulk-upload photos, browse the uploaded set as a grid with per-photo face-count badges, delete individual photos, and kick off a "download all" batch. Ported from "MAJA Studio Gallery.dc.html".

## Layout

Responsive shell: `MobileNav` + `StudioNav` rail + main content.

1. **Back link** — "← {couple names or 'Back to wedding'}" → `/studio/wedding/{profileId}`.
2. **Hero band** (`stgal-wash`) — H1 "Gallery", couple line, "Upload photos" button (disabled unless the gallery is enabled and not mid-upload; opens a hidden `<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif">`), and a row of 4 static informational chips: "Phone Live Mode", "Phone + DSLR Tether", "WiFi SD Card", "Bulk Upload" (labels only — no dedicated controls for the first three modes on this page; bulk upload is the only one actually wired here).
3. **Body** — one of: skeleton grid (12 tiles), error card + Try again, "not enabled yet" prompt card ("Enable AI gallery" button), or the live gallery:
   - Stats line: `{total_photos} photos · {photos_with_faces} face-matched`, right-aligned "Download all" button (disabled while downloading or if there are no photos).
   - Photo grid (responsive columns by viewport) — each tile: thumbnail (lazy-loaded), a face-count pill (`{n} face(s)`, only if `face_count > 0`), a per-tile delete (✕) button.
   - Empty-gallery message ("No photos yet.") if enabled but zero photos.
4. **Toast** — bottom-fixed, auto-dismisses after 3.6s.

## Fields

No form fields beyond the hidden file input.

| Control | Type | Notes |
|---|---|---|
| Upload photos | file input (hidden, triggered by button) | `multiple`, accepts jpeg/png/webp/heic/heif |

## Interactions

### Page load
- `Promise.all([getProfile(profileId), galleryStats(profileId)])`. If `stats.enabled`, additionally fetches `galleryPhotos(profileId, {limit: 200})`; otherwise `photos` is set to `[]` without a fetch.

### Enable AI gallery
- **Trigger:** "Enable AI gallery" button (shown only when `stats.enabled === false`).
- **Behavior:** `POST /api/admin/profiles/{id}/gallery/enable {enabled: true}`; on success, toasts "AI gallery enabled." and reloads everything. Requires AWS to be configured server-side (503 if not).

### Upload photos
- **Trigger:** file(s) picked via the hidden input; click clears the input value afterward so re-selecting the same file re-fires the change event.
- **Behavior:** `POST /api/admin/profiles/{id}/gallery/bulk-upload` as multipart (`files[]`). Toasts `Uploaded {n} photo(s){, {failed} failed}`. Reloads the gallery afterward regardless of outcome.

### Delete a photo
- **Trigger:** click a tile's ✕ button — gated by a native `window.confirm("Delete this photo? This also removes it from face-search matching.")`.
- **Behavior:** `DELETE /api/admin/profiles/{id}/gallery/photos/{photoId}`; on success removes it from local state immediately (no full reload); on failure toasts the error.

### Download all
- **Trigger:** "Download all" (disabled while running or if `total_photos === 0`).
- **Behavior:** `GET /api/admin/profiles/{id}/gallery/download-all` returns a manifest of `{name, url}` signed-URL entries; the page synthesizes and clicks a hidden `<a download>` for each, 250ms apart, to avoid the browser blocking a burst of simultaneous downloads. Toasts the count started.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Get profile | GET | `/api/admin/profiles/{id}` | Mount | For the couple-name header line |
| Gallery stats | GET | `/api/admin/profiles/{id}/gallery/stats` | Mount, after any mutating action | `{enabled, total_photos, photos_with_faces, by_method, last_upload_at, auto_delete_at}` |
| Gallery photos | GET | `/api/admin/profiles/{id}/gallery/photos?limit=200` | Mount (only if enabled), after mutations | Each photo: `id, upload_method, face_count, width, height, file_size, created_at, thumb_url` (short-lived signed URL), `original_url` |
| Enable gallery | POST | `/api/admin/profiles/{id}/gallery/enable` | "Enable AI gallery" | `{enabled}`; also creates the AWS Rekognition face collection and issues a live-upload token server-side |
| Bulk upload | POST | `/api/admin/profiles/{id}/gallery/bulk-upload` | File picker change | **Multipart**, not presigned — see Business Rules |
| Delete photo | DELETE | `/api/admin/profiles/{id}/gallery/photos/{photoId}` | Confirmed delete | Also deletes the Rekognition face indexed for that photo, if any |
| Download-all manifest | GET | `/api/admin/profiles/{id}/gallery/download-all` | "Download all" | Returns signed S3/CloudFront URLs — the client downloads each directly, never proxying bytes through the app server |

## Page Relationships

- **From:** Studio Wedding Detail's "Open AI gallery →" link.
- **To:** `/studio/wedding/{profileId}` (back link).
- **Data coupling:** `stats.total_photos`/`photos_with_faces` shown here also back Studio Wedding Detail's "Gallery photos" KPI tile — the two pages query the same `gallery/stats` endpoint independently, so a change on this page isn't reflected on Wedding Detail until that page's own next load.

## Business Rules

- **Upload path is deliberately multipart, not the generic presign→S3→commit flow** (`api/uploads.js`) used elsewhere in the app — gallery photos need server-side thumbnailing + Rekognition face-indexing on ingest, which only the `bulk-upload` multipart handler performs (writing to `db.gallery_photos`). The generic presign flow writes to an unrelated `db.storage_files` collection and would "succeed" while the photo never actually appears in this gallery — so it is explicitly not used here, despite `api/uploads.js` existing and being used elsewhere in the app.
- AI gallery is opt-in per wedding and requires AWS to be configured on the backend (`is_configured()`); attempting to enable it without AWS env vars set returns a 503, surfaced generically as "Could not enable the gallery."
- Deleting a photo also removes its Rekognition face record from the collection — guests searching by selfie afterward will no longer match that photo.
- "Download all" streams nothing through the app server — it hands back signed URLs and the browser fetches each directly from S3/CloudFront (a deliberate change from an earlier version that proxied full bytes through EC2 and could exhaust memory on large galleries).
- The 3 non-bulk-upload chips ("Phone Live Mode", "Phone + DSLR Tether", "WiFi SD Card") are informational only on this page — no control here drives them; they describe upload paths handled elsewhere (e.g. desktop uploader token flow in `premium_features.py`, live gallery guest uploads) rather than being alternate actions available from this screen.
