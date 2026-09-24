# API Inventory — endpoints frontend-v2 actually calls

Scope: every export in `frontend-v2/src/api/*.js` (10 files: `auth`, `users`, `studio`,
`invitations`, `facematch`, `uploads`, `gallery`, `qr`, `store`, `pricing`; `client.js` is the
shared axios instance, not an endpoint list). ~60 distinct backend routes.

**Auth identity column** is the *verified* identity (read from the backend source, not the
auto-generated `docs/API_SURFACE.md` guard column — see the README's global notes for why that
doc's guard column is unreliable for factory-built routers like `store_features.py`):

- **Public** — no auth dependency
- **Studio Bearer** — `Authorization: Bearer <admin_token>`, attached automatically by `client.js`
- **Couple cookie** — httpOnly `user_session_token`, `withCredentials`
- **Buyer** — `get_current_buyer` (`backend/server.py:15289`): couple cookie OR studio Bearer
- **Event-client JWT** — `client_token`, isolated axios instance, `/api/client/*` only
- **Public + gallery gate** — no user auth, but gated by the gallery's own privacy
  device-token and/or the face-match consent record

## `api/auth.js` — studio admin identity (**file itself unused** — see note)

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `login` | POST | `/api/auth/login` | Public → issues Bearer | Not called via this file — `AuthContext.jsx` calls `client.post('/api/auth/login', ...)` directly |
| `refresh` | POST | `/api/auth/refresh` | Studio Bearer (refresh cookie) | Not called via this file — `client.js`'s own response interceptor calls it directly on a 401 |
| `me` | GET | `/api/auth/me` | Studio Bearer | Not called via this file — `AuthContext.jsx` calls `client.get('/api/auth/me')` directly (boot + `refresh()`) |
| `logout` | POST | `/api/auth/logout` | Studio Bearer | Not called via this file — `AuthContext.jsx` calls `client.post('/api/auth/logout')` directly |

All four routes are real and actively used by the app — just through direct `client` calls in
`AuthContext.jsx`, not through this wrapper module. `api/auth.js` has zero importers.

## `api/users.js` — couple identity

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `me` | GET | `/api/users/me` | Couple cookie | Not called via this file — `UserAuthContext.jsx` calls `client.get('/api/users/me')` directly |
| `register` | POST | `/api/users/register` | Public → issues cookie | Not called via this file — `UserAuthContext.jsx` direct |
| `login` | POST | `/api/users/login` | Public → issues cookie | Not called via this file — `UserAuthContext.jsx` direct (via `SignIn.jsx`) |
| `logout` | POST | `/api/users/logout` | Couple cookie | Not called via this file — `UserAuthContext.jsx` direct |
| `googleLoginUrl` | — (redirect) | `/api/users/auth/google/login` | Public | `SignIn.jsx` / `UserAuthContext.loginWithGoogle` (own inline URL builder, not this export) |
| `listProfiles` | GET | `/api/users/profiles` | Couple cookie | `UserDashboard` |
| `getProfile` | GET | `/api/users/profiles/{profileId}` | Couple cookie (server-scoped to caller's `user_id`) | `UserWeddingEdit` |
| `updateProfile` | PATCH | `/api/users/profiles/{profileId}` | Couple cookie | `UserDashboard`, `UserWeddingEdit` |
| `profileInsights` | GET | `/api/users/profiles/{profileId}/insights` | Couple cookie | `UserDashboard`, `UserWeddingEdit` |
| `exportAccountData` | GET | `/api/account/export` | Couple cookie | `UserDashboard` (DPDP data export) |
| `deleteAccount` | POST | `/api/account/delete-request` | Couple cookie | `UserDashboard` (DPDP delete request) |

`updateProfile`'s server-side whitelist: `groom_name`, `bride_name`, `venue`, `city`,
`invitation_message`, `event_date`, `about_couple`, `love_story`, `whatsapp_groom`,
`whatsapp_bride`, `bride_photo_url`, `groom_photo_url`, `couple_photo_url` — any other key is
silently dropped server-side (`frontend-v2/src/api/users.js:28-31`).

## `api/studio.js` — studio Bearer identity

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `myWeddings` | GET | `/api/studio/my-weddings` | Studio Bearer | Unused — no page calls it |
| `earnings` | GET | `/api/studio/earnings` | Studio Bearer | Unused — no page calls it |
| `insights` | GET | `/api/studio/insights` | Studio Bearer | `StudioDashboard` |
| `listProfiles` | GET | `/api/admin/profiles/paginated` | Studio Bearer | `StudioDashboard` |
| `getProfile` | GET | `/api/admin/profiles/{profileId}` | Studio Bearer | `StudioProfileGallery`, `StudioWeddingDetail` |
| `quickStats` | GET | `/api/admin/profiles/{profileId}/quick-stats` | Studio Bearer | `StudioWeddingDetail` |
| `listRsvps` | GET | `/api/admin/profiles/{profileId}/rsvps` | Studio Bearer | `StudioWeddingDetail` |
| `listWishes` | GET | `/api/admin/profiles/{profileId}/wishes` | Studio Bearer | `StudioWeddingDetail` |
| `galleryStats` | GET | `/api/admin/profiles/{profileId}/gallery/stats` | Studio Bearer | `StudioProfileGallery`, `StudioWeddingDetail` |
| `galleryPhotos` | GET | `/api/admin/profiles/{profileId}/gallery/photos` | Studio Bearer | `StudioProfileGallery` |
| `galleryEnable` | POST | `/api/admin/profiles/{profileId}/gallery/enable` | Studio Bearer | `StudioProfileGallery` |
| `galleryDeletePhoto` | DELETE | `/api/admin/profiles/{profileId}/gallery/photos/{photoId}` | Studio Bearer | `StudioProfileGallery` |
| `galleryDownloadAll` | GET | `/api/admin/profiles/{profileId}/gallery/download-all` | Studio Bearer | `StudioProfileGallery` |
| `galleryBulkUploadMultipart` | POST | `/api/admin/profiles/{profileId}/gallery/bulk-upload` | Studio Bearer | `StudioProfileGallery` (fallback when direct-to-S3 presign fails) |

## `api/invitations.js` — public, slug-scoped

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `getFull` | GET | `/api/invite/{slug}/full` | Public | `CoupleAccess` (direct); `GuestInvitation`/`CeremonyInvitation`'s data hook (`lib/useInviteFull.js`) |
| `getEventInvitation` | GET | `/api/invite/{slug}/{eventType}` | Public | `CeremonyInvitation` via `lib/useEventInvitation.js` |
| `getBySlug` | GET | `/api/invite/{slug}` | Public (optional `passcode` param — accepted client-side but currently a no-op; the real passcode-gated route is `POST /api/event/{event_id}/verify-access`, not wired yet) | `GuestArrival`, `LivePhotoWall`; also the passcode-retry path in `lib/useInviteFull.js` |
| `submitGreeting` | POST | `/api/invite/{slug}/greetings` | Public | Unused — no page calls it (moderation-gated wall, separate from `/wishes` below) |
| `getBlessings` | GET | `/api/invite/{slug}/blessings` | Public | Unused — no page calls it |
| `getSaveTheDate` | GET | `/api/save-the-date/{slug}` | Public (no view tracking) | `SaveTheDate` |
| `getGifts` | GET | `/api/invite/{slug}/gifts` | Public (bank digits masked server-side) | `GuestInvitation` |
| `submitWish` | POST | `/api/invite/{slug}/wishes` | Public | `GuestInvitation` (auto-approved wall, what the public wishes wall actually renders) |
| `submitRsvp` | POST | `/api/rsvp` | Public | `GuestInvitation`, `CeremonyInvitation` via `lib/useRsvpSubmit.js` |
| `generateCaptcha` | POST | `/api/captcha/generate` | Public | Same hook, `lib/useRsvpSubmit.js` |
| `recordShagun` | POST | `/api/invite/{slug}/shagun/record` | Public | `GuestInvitation` (unverified blessing-counter path) |
| `createShagunRazorpayOrder` | POST | `/api/invite/{slug}/shagun/razorpay/order` | Public | `GuestInvitation` |
| `verifyShagunRazorpay` | POST | `/api/invite/{slug}/shagun/razorpay/verify` | Public | `GuestInvitation` |
| `checkIn` | POST | `/api/invite/{slug}/check-in` | Public | `GuestArrival` |
| `roomLookup` | GET | `/api/invite/{slug}/room-lookup` | Public | `GuestArrival` |

## `api/facematch.js` — public + gallery gate

Every call is subject to the gallery's privacy gate (device token, if the gallery is
password-protected) and, for `faceSearch`, the 90-day consent record (`428 CONSENT_REQUIRED`
otherwise). All consumed through the shared `components/FindMyPhotos.jsx` component, embedded on
the Live Gallery page.

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `faceSearch` | POST | `/api/public/gallery/{slug}/face-search` | Public + gallery gate + consent | `FindMyPhotos` (Live Gallery) |
| `faceConsent` | POST | `/api/public/gallery/{slug}/face-consent` | Public | `FindMyPhotos` |
| `faceResults` | GET | `/api/public/gallery/{slug}/face-results` | Public + gallery gate | `FindMyPhotos` |
| `downloadZip` | GET | `/api/public/gallery/{slug}/download-zip` | Public + gallery gate | `FindMyPhotos` |
| `photoRequest` | POST | `/api/public/gallery/{slug}/photo-request` | Public + gallery gate | `FindMyPhotos` (manual fallback when face-search finds nothing) |

## `api/uploads.js` — direct-to-S3 presign (**entirely unused**)

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `presign` | POST | `/api/uploads/presign` | Buyer/Studio Bearer if present, else public [TBC — no explicit guard read in this pass] | Unused — no page calls `uploadViaPresign` or `presign`/`commit` directly |
| `commit` | POST | `/api/uploads/commit` | Same | Unused |
| `postToS3` | PUT/POST (bare axios, no baseURL) | S3 presigned URL | N/A — goes straight to S3, not the app backend | Unused |

## `api/gallery.js` — mixed public / studio Bearer

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `getPrivacy` | GET | `/api/public/gallery/{slug}/privacy` | Public | `lib/galleryAccess.js` hook (Live Gallery) |
| `unlock` | POST | `/api/public/gallery/{slug}/unlock` | Public → issues device token | `lib/galleryAccess.js` hook |
| `getWall` | GET | `/api/invite/{slug}/live-gallery` | Public | `LivePhotoWall`, `CoupleAccess` |
| `guestUpload` | POST | `/api/invite/{slug}/gallery/guest-upload` | Public | `LivePhotoWall` |
| `favoritePhoto` | POST | `/api/invite/{slug}/live-gallery/favorite` | Public | `LivePhotoWall` |
| `adminGetPhotos` | GET | `/api/admin/profiles/{profileId}/live-gallery` | Studio Bearer | `WeddingLiveGallery` |
| `moderatePhoto` | PUT | `/api/admin/live-gallery/{photoId}/moderate` | Studio Bearer | `WeddingLiveGallery` |
| `getLiveGallerySettings` | GET | `/api/admin/profiles/{profileId}/live-gallery/settings` | Studio Bearer | `WeddingLiveGallery` |
| `updateLiveGallerySettings` | PUT | `/api/admin/profiles/{profileId}/live-gallery/settings` | Studio Bearer | `WeddingLiveGallery` |

## `api/qr.js` — mixed public / studio Bearer

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `scanPing` | POST | `/api/public/qr-scan/{slug}` | Public, fire-and-forget (errors swallowed) | `LivePhotoWall` |
| `getProfile` | GET | `/api/admin/profiles/{profileId}` | Studio Bearer | `StudioProfileQrCodes` (duplicate of `studio.getProfile`, same route) |
| `listEventInvitations` | GET | `/api/admin/profiles/{profileId}/event-invitations` | Studio Bearer | `StudioProfileQrCodes` |
| `regenerateQr` | POST | `/api/admin/event-invitations/{invitationId}/regenerate-qr` | Studio Bearer | `StudioProfileQrCodes` |
| `regenerateAllQrs` | POST | `/api/admin/profiles/{profileId}/regenerate-all-qrs` | Studio Bearer | `StudioProfileQrCodes` |

## `api/store.js` — public / buyer identity

Money is always server-quoted from `backend/store_features.py`'s live catalogue; the client only
ever posts selections, never amounts.

| Export | Method | Path | Auth identity (verified from source, not `API_SURFACE.md`) | Used by |
|---|---|---|---|---|
| `quote` | POST | `/api/store/quote` | **Public** — `store_features.py:536-542` has no `Depends` at all. (`API_SURFACE.md` shows `require_super_admin` for this route — confirmed wrong by reading source.) | `Cart`, `Checkout` |
| `createOrder` | POST | `/api/store/order/create` | Buyer (`get_current_buyer`) | `Checkout` |
| `verifyOrder` | POST | `/api/store/order/verify` | Buyer | `Checkout` |
| `myOrders` | GET | `/api/store/my-orders` | Buyer (`API_SURFACE.md` shows `require_admin` — confirmed wrong; source uses `get_current_public_user` param bound to `get_current_buyer`) | `UserDashboard` |
| `catalog` | GET | `/api/store/catalog` | Public | `Cart` |
| `packages` | GET | `/api/store/packages` | Public | `Pricing` |
| `designPrice` | GET | `/api/store/design/{designId}/price` | Public | Unused — no page calls it |
| `getOrder` | GET | `/api/store/order/{orderId}` | Buyer (`API_SURFACE.md` shows `require_super_admin` — confirmed wrong, same `get_current_buyer` binding) | `OrderDetails` |
| `submitOrderInfo` | POST | `/api/store/order/{orderId}/info` | Buyer | `OrderDetails` |
| `saveOrderInfoDraft` | PUT | `/api/store/order/{orderId}/info-draft` | Buyer (`API_SURFACE.md` shows `require_super_admin` — confirmed wrong) | `OrderDetails` |

## `api/pricing.js` — public

| Export | Method | Path | Auth identity | Used by |
|---|---|---|---|---|
| `effective` | GET | `/api/public/pricing/effective` | Public — confirmed via `@public_router.get("/effective")` in `backend/super_admin_pricing.py:788-790` (no `Depends`); this route doesn't appear under any `/api/public/pricing/*` heading in `docs/API_SURFACE.md` at all — the generated doc appears to have missed/misfiled it, not just mis-guarded it | `Pricing` |
| `featureFlags` | GET | `/api/feature-flags` | **Studio super-admin** (`Depends(require_super_admin)`, `backend/feature_flags_service.py:64`) — this contradicts the file's own comment ("Both unauthenticated"), which is wrong for this endpoint | Unused — no page calls it, so the mismatch has no live user impact today |

## Not covered

`api/store.js` re-exports the shared `client` (`export { client }`) — not an endpoint, omitted.
Endpoints reachable only through the legacy CRA app (`frontend/src/services` or equivalent) are
out of scope — this inventory is `frontend-v2/src/api/*.js` only, per the task's source list.
