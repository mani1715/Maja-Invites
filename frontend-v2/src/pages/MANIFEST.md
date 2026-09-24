# Pages manifest

Every P0 route is wired in `src/App.jsx` to a lazy-loaded placeholder below.
Lane agents: overwrite your file(s) in place (same path, same default export
name) — do not rename, App.jsx's `lazy()` imports are path-bound.

| File | Route | Default export |
|---|---|---|
| `Landing.jsx` | `/` | `Landing` |
| `Pricing.jsx` | `/pricing` | `Pricing` |
| `Features.jsx` | `/features` | `Features` |
| `HowItWorks.jsx` | `/how-it-works` | `HowItWorks` |
| `Faq.jsx` | `/faq` | `Faq` |
| `Contact.jsx` | `/contact` | `Contact` |
| `SignIn.jsx` | `/auth` | `SignIn` |
| `SignUp.jsx` | `/auth/signup` | `SignUp` |
| `ResetPassword.jsx` | `/auth/reset` | `ResetPassword` |
| `AuthCallback.jsx` | `/auth/callback` | `AuthCallback` (added during route audit — backend/user_auth.py's Google OAuth callback redirects here; was previously unrouted) |
| `GuestInvitation.jsx` | `/invite/:slug` | `GuestInvitation` (renamed from `PublicInvitation.jsx` per the guest-invite lane brief; old file deleted) |
| `CeremonyInvitation.jsx` | `/invite/:slug/:eventType` | `CeremonyInvitation` (renamed from `EventInvitation.jsx` per the guest-invite lane brief; old file deleted) |
| `SaveTheDate.jsx` | `/save-the-date/:slug` | `SaveTheDate` (added by guest-invite lane, not in the original P0 list) |
| `LiveGallery.jsx` | `/invite/:slug/live-gallery` | `LiveGallery` |
| `Cart.jsx` | `/cart` | `Cart` |
| `Checkout.jsx` | `/checkout` | `Checkout` |
| `OrderDetails.jsx` | `/order/:orderId/details` | `OrderDetails` |
| `StudioDashboard.jsx` | `/studio/dashboard` | `StudioDashboard` |
| `StudioProfileGallery.jsx` | `/studio/profile/:profileId/gallery` | `StudioProfileGallery` |
| `StudioWeddingDetail.jsx` | `/studio/wedding/:id` | `StudioWeddingDetail` (added by studio-core lane, not in the original P0 list; `WeddingToolbar` already assumed this route shape) |
| `StudioProfileQrCodes.jsx` | `/studio/profile/:profileId/qr-codes` | `StudioProfileQrCodes` |
| `CoupleAccess.jsx` | `/couple/access` | `CoupleAccess` |
| `NotFound.jsx` | `*` (404) | `NotFound` |

`_Placeholder.jsx` is shared scaffolding (not a route) — every page above
currently renders it. Once your lane overwrites a page file you can delete
its `import Placeholder from './_Placeholder'` line; leave `_Placeholder.jsx`
itself alone until every page is built (other lanes still depend on it).
