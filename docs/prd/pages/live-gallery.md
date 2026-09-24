# Live Gallery Page

Route: `/invite/:slug/live-gallery`
Source: `frontend-v2/src/pages/LiveGallery.jsx` (thin re-export) → `frontend-v2/src/pages/LivePhotoWall.jsx`, `LivePhotoWall.css`; sub-component `frontend-v2/src/components/FindMyPhotos.jsx`
Auth: public, but may require a gallery passcode ("device token") if the gallery is privacy-protected

## Overview

The live, guest-facing wedding photo wall: a real-time (WebSocket-backed, polling fallback) merged feed of photos from the studio and from guests, with a guest photo-upload flow, a favoriting mechanic, a lightbox, and a self-serve "Find my photos" selfie face-search flow. Access to a protected gallery is gated by a passcode that exchanges for a device token, persisted in `localStorage` per-slug so a returning visitor on the same device doesn't need to re-enter it.

## Layout

**Loading:** spinner + "Loading the gallery…".

**Locked gate** (rendered when `access.isProtected && !deviceToken`):
- "M" mark, "Gallery locked" eyebrow, couple-name heading (from a separate `GET /invite/{slug}` call, used only for display), explanatory copy, a passcode input, a "Remember this device" checkbox (default checked), and an "Unlock the wall" submit button. If the privacy-fetch itself failed (network/5xx), shows a "Try again" retry button instead of the unlock form (fail-closed: a backend blip assumes the gallery is protected, never renders it unlocked by default).

**Unlocked wall:**
1. **Header** — "The wall is awake" live-chip, couple-name title, "Find my photos" button, and an "Add photos" button (shown only if `guest_uploads_allowed`).
2. **Meta row** — total photo count, guest-photo count, a live-filter row (Everything / From guests / By the studio).
3. **Masonry grid** — one tile per visible photo (thumbnail, optional caption + uploader-name overlay, a "Guest" badge for guest-sourced photos); clicking opens the lightbox. Loading/error/empty states render in place of the grid.
4. **"Load older photographs"** button, shown while more pages remain.
5. **Footer** — a "please don't repost" courtesy note + "Made with MAJA Invites" credit.
6. **Upload modal** (`modal === 'upload'`) — name field, optional caption field, a multi-file picker (images only, ≤25MB each — oversized files are silently skipped with a count shown), submit ("Put them on the wall"), and a success sub-state with "Add more" / "Back to the wall".
7. **"Find my photos" modal** (`modal === 'find'`) — renders `<FindMyPhotos>` (see below).
8. **Lightbox overlay** — full photo, caption, uploader/date line, Download / Favorite / Close actions.
9. **Toast notice** — transient (2.6s) message for background failures (e.g. a failed favorite, a WebSocket access-revocation notice).

### Find My Photos sub-flow (selfie face search)

A self-contained step machine inside the modal: `intro → matching → results | no-match | failed`.

- **`intro`** — explains the one-time-use / 24-hour-deletion policy, a required consent checkbox ("I agree to a one-time face match on my selfie."), an optional contact field (phone/email, "to send your link" — collected but its actual use is not evidenced in the reviewed request payloads), "Take a selfie" (camera capture) / "Choose a photo" (file picker) buttons — both disabled until consent is checked.
- **`matching`** — spinner, "Looking through the wall…".
- **`results`** — "Found N of you.", a 3-column grid of matched photos (each showing a similarity-percentage badge), a "Download all N" button, "Change selfie" to restart.
- **`no-match`** — explanation + a collapsible "Ask the studio to send my photos instead" fallback form.
- **`failed`** — error message + the same fallback form + "Try again".
- **Fallback form** (shown inside `no-match`/`failed`) — Name (optional), Email (required), WhatsApp (required), and a selfie attachment field (only shown if no selfie is already on file from the just-run search); a "Send request" button and a "sent" confirmation state.

## Fields

**Gallery unlock:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Passcode | text input | Yes | non-empty (server validates the actual match) | `''` |
| Remember this device | checkbox | No | — | `true` |

**Upload modal:**

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Your name | text input | Yes | non-empty after trim | `''` | "So the couple knows who to thank" |
| Caption | text input | No | — | `''` | Applies to all files in this batch |
| Photo files | multi-file picker (`accept="image/*"`) | Yes, at least one | Per-file size ≤ 25MB — oversized files are dropped from the selection with an inline warning count | `[]` | Uploaded one file per API call, sequentially |

**Find My Photos — intro step:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Consent checkbox | checkbox | Yes | must be checked to enable selfie capture/choice buttons | `false` |
| Contact (phone or email) | text input | No | — | `''` |
| Selfie | file (camera-capture or file-picker input) | Yes | image file; picking a file only triggers a search if consent is already checked | none |

**Find My Photos — fallback ("ask the studio") form:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Name | text input | No | — | `''` |
| Email | text input (`type="email"`) | Yes | non-empty after trim | `''` |
| WhatsApp number | text input | Yes | non-empty after trim | `''` |
| Selfie attachment | file picker | Yes, unless a selfie from the just-run search is already available (`hasSelfieOnFile`) | image file | none |

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | Fires a fire-and-forget `scanPing(slug)` (bumps a QR-scan counter server-side; failure is swallowed); fetches privacy settings; fetches couple names via `getBySlug` (best-effort, failure ignored) |
| Privacy fetch fails | Fails **closed**: assumes the gallery is protected and shows the lock screen with a "Try again" retry rather than the unlock form (never silently unlocks on a backend blip) |
| Submit passcode | Calls `unlock(passcode, remember)`; on success stores a device token (and, if "remember" is checked and the server returned an expiry, persists it to `localStorage` under a per-slug key); on failure shows "Oh dear. That passcode doesn't match." |
| Gallery becomes unlocked (or was never protected) | Fetches the first page of the photo feed (24 items) |
| Filter row click (Everything / From guests / By the studio) | Client-side filters the already-fetched `feed.photos` by `source`; no re-fetch |
| WebSocket connects | On a `photo_added` message, prepends the new photo (de-duplicated by id) to the feed and increments the total; on close, retries with exponential backoff up to 3 attempts, then falls back to 20-second polling; a close code `4401` (device token rejected — e.g. the gallery's lock was changed) immediately falls back to polling and shows a toast ("Your access has changed. Refresh to unlock again if needed.") |
| Poll tick (fallback mode) | Fetches only photos newer than the last-fetched timestamp and merges new ones in; failures are silent (next poll retries) |
| Click "Load older photographs" | Fetches the next page (`skip = current count`), appending and de-duplicating by id; button hides once a page returns fewer than 24 items |
| Click a photo tile | Opens the lightbox for that photo |
| Click "Download" (lightbox) | Opens the photo's resolved URL in a new tab with the `download` attribute |
| Click "Favorite"/"♡" (lightbox or would-be tile-level, only wired in the lightbox) | Calls `favoritePhoto`; on success updates the favorite count and `_favorited` flag both in the feed array and (if open) the lightbox item; on failure shows a toast ("Could not save that — try again.") |
| Click "Add photos" | Opens the upload modal in `form` sub-state |
| Pick files in upload modal | Filters out any file over 25MB, keeping the rest; shows a count of skipped files if any |
| Submit upload | Requires a name and at least one file; uploads files **sequentially, one API call per file**; tracks per-file failures without aborting the batch; on completion: 0 succeeded → `error` state; some succeeded → `done` state with a partial-failure note; all succeeded → plain `done` state. Newly uploaded photos are optimistically merged into the feed immediately |
| Click "Add more" (post-upload) | Resets the upload form back to empty, staying in the modal |
| Click "Back to the wall" / backdrop / outside modal click | Closes the modal (and lightbox, if open) |
| Click "Find my photos" | Opens the Find My Photos modal, starting at `intro` |
| Check consent then take/choose a selfie | Immediately begins the face search (`runSearch`) — moves to `matching` |
| Face search backend responds `428` with `detail.code === 'CONSENT_REQUIRED'` | Automatically records consent (`faceConsent(slug, true)`) then silently retries the same search once — the guest is not shown an extra consent prompt beyond the checkbox they already ticked |
| Face search responds `status: 'done'` immediately | Skips polling; goes straight to `results` (if photos found) or `no-match` |
| Face search responds a pending status | Begins polling `faceResults` every 2.5s, up to a 90-second timeout, after which it shows "This is taking longer than expected." and moves to `failed` |
| Poll returns `status: 'failed'` | Shows the backend's error or a generic message, moves to `failed` |
| Click "Change selfie" | Stops any active poll, clears session/photos, returns to `intro` |
| Click "Download all N" (results) | Fetches a signed-URL manifest (`downloadZip`) and triggers browser downloads for every file in the manifest, staggered 300ms apart (to avoid the browser blocking a rapid burst of downloads) |
| Click "Ask the studio to send my photos instead" (no-match / failed steps) | Reveals the fallback form |
| Submit fallback form | Requires email + WhatsApp non-empty, and a selfie either freshly attached or carried over from the just-run search; posts a manual photo request; on success shows a "sent" confirmation; on failure shows the backend detail or a generic error |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Get gallery privacy settings | `GET /api/public/gallery/{slug}/privacy` | `lib/galleryAccess.js` (raw axios call, bypassing the shared `client` interceptors) | Response drives `is_protected`, `ai_face_match_enabled`, `allow_downloads`, `allow_share`, etc. On failure, a synthetic fail-closed object is substituted client-side |
| Unlock gallery | `POST /api/public/gallery/{slug}/unlock` | `lib/galleryAccess.js` (`unlock`) | Body: `{ code, remember }`. Response: `{ device_token, expires_at }` |
| Bump QR-scan counter | `POST /api/public/qr-scan/{slug}` | `api/qr.js` `scanPing()` | Fire-and-forget; failure caught and ignored |
| Get couple names for header | `GET /api/invite/{slug}` | `api/invitations.js` `getBySlug()` | Best-effort display data only; failure ignored |
| Load photo feed page | `GET /api/invite/{slug}/live-gallery?since&limit&skip` | `api/gallery.js` `getWall()` | Used both for the initial page load, "load older," and poll-mode incremental fetch |
| Upload a guest photo | `POST /api/invite/{slug}/gallery/guest-upload` (multipart) | `api/gallery.js` `guestUpload()` | One file per call; fields `file`, `guest_name`, optional `caption` |
| Toggle favorite | `POST /api/invite/{slug}/live-gallery/favorite` | `api/gallery.js` `favoritePhoto()` | Body: `{ photo_id, device_id }` — `device_id` is a client-generated UUID persisted in `localStorage.maja_device_id` |
| Live updates | `WSS {backend}/api/ws/gallery/{slug}?token={deviceToken}` | raw `WebSocket`, constructed in-page (`wsUrl`) | Falls back to 20s polling after connect failure or after 3 failed reconnect attempts (exponential backoff) |
| Search by selfie | `POST /api/public/gallery/{slug}/face-search` (multipart) | `api/facematch.js` `faceSearch()` | Field: `selfie`; carries the gallery device-token header when the gallery is protected |
| Record face-match consent | `POST /api/public/gallery/{slug}/face-consent` | `api/facematch.js` `faceConsent()` | Body: `{ agreed }`; auto-called on a `428 CONSENT_REQUIRED` response, then the search is retried once |
| Poll face-search results | `GET /api/public/gallery/{slug}/face-results?session_id=` | `api/facematch.js` `faceResults()` | Polled every 2.5s up to 90s |
| Get download manifest | `GET /api/public/gallery/{slug}/download-zip?session_id=` | `api/facematch.js` `downloadZip()` | Response: `{ files: [{ url, name }, ...] }` — despite the name, this returns a list of individually-downloadable signed URLs rather than a server-built zip archive |
| Manual "send my photos" fallback | `POST /api/public/gallery/{slug}/photo-request` (multipart) | `api/facematch.js` `photoRequest()` | Fields: `selfie`, `email`, `whatsapp`, optional `name` |

## Page Relationships

**Links out to:** no client-side route links on this page beyond the download/lightbox actions and external download URLs; it is effectively a terminal page in the invitation flow.

**Linked from:** Guest Invitation ("Add your photos →" gallery-section link, footer "Live photo wall" link), Guest Arrival's "Welcome" screen does not link here directly, Studio's Wedding QR Codes page (QR that scans to this URL, driving the `scanPing`).

## Business Rules

- The gallery's protection state is **fail-closed**: if the privacy-settings fetch itself fails (network/5xx), the page must never render the gallery as unlocked by default — it assumes protected and shows a retry affordance instead. This is an explicit, documented design decision (not the default a naive implementation would produce).
- A device token, once obtained via unlock, is sent both as a custom header (`X-Gallery-Device-Token`) on REST calls and as a `?token=` query param on the WebSocket URL — the WebSocket can independently reject a stale/revoked token (close code `4401`) even after a REST call already succeeded with it.
- Guest photo uploads are capped at 25MB per file client-side; there is no explicit total-batch-size cap beyond the per-file limit.
- "Guest uploads allowed" is a server-controlled flag (`feed.guestUploadsAllowed`, from the wall response) — the "Add photos" button is hidden entirely when it's false, not just disabled.
- Face-search selfies are explicitly time-boxed and single-purpose per the consent copy: "used for this one search and deleted within 24 hours... never shared, never used to train anything, and never linked to your name." This is stated UI copy, not independently re-verified against backend retention behavior in this review.
- Consent for face-matching can be captured two ways: proactively via the intro checkbox (client-side gate before the button even becomes clickable), or reactively via a `428 CONSENT_REQUIRED` response mid-flow — the frontend transparently satisfies the latter and retries once without asking the guest again, since they already ticked the box.
- A "no confident match" result explicitly does **not** mean zero photos exist of the guest — copy reads "more photos may still be coming in" — so the fallback "ask the studio" path exists specifically to route around face-match limitations, not as a data-integrity signal.
