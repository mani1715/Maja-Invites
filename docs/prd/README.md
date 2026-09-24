# MAJA Invites — Product Requirements Document

> Source of truth for this PRD: `frontend-v2/src/App.jsx` (route table), `frontend-v2/src/api/*.js`
> (what the rewritten frontend actually calls), `docs/API_SURFACE.md` (full backend route dump,
> 1182 routes / 181 namespaces, generated 2026-08-06), and `backend/store_features.py` (pricing).
> Scope: **frontend-v2 only** — the rewritten React app. The legacy CRA app (`frontend/`) still
> serves everything not yet ported; see "Legacy-only surfaces" below.

## System Overview

MAJA Invites is a done-for-you Indian wedding invitation platform. A photography
studio, on behalf of the couple they're serving, picks a design and pays a
one-time price (post-pivot: purchasing is photographer-only, see below), and
MAJA's studio team builds and delivers a live, shareable invitation link. From there the
invitation runs itself for the couple's guests: ceremony-by-ceremony pages, RSVPs,
a live QR photo gallery guests upload straight into, opt-in "find my photos" face
matching, a guest wishes wall, and an optional digital shagun (cash gift) collection
with its own Razorpay flow.

**PRODUCT PIVOT 2026-08-11 (owner-decided, final): normal-user (couple/buyer)
accounts are retired.** Photographers/studios are now the only account
holders — see `docs/ARCHITECTURE_MIGRATION_MAP.md` §6b for the full
endpoint-level evidence (`backend/user_auth.py`, `user_features.py` now
answer `410 NORMAL_USERS_RETIRED`; 34/34 in `backend/tests/test_users_retired.py`).
The three-identity model below is rewritten to match; the couple-account
identity previously described here no longer exists.

Two account identities, each with its own login, plus one scoped
non-account token:

1. **Studio (photographer/admin)** — runs the business: builds and manages every
   couple's invitation, moderates the live gallery, tracks earnings, regenerates QR
   codes, and is now also the only identity that can purchase a design. Identity: a
   Bearer JWT (`admin_token`) issued by `/api/auth/login`. Role `admin`.
2. **Super-admin** — the platform owner. Same `admins` collection as Studio,
   distinguished only by `role=super_admin` (`require_super_admin` gates on the
   `role` field alone — no separate login flow, no env allowlist).
3. **Event-client** — a couple given a *separate*, narrower login by their
   photographer (username + passcode, not a couple-owned account) to check on
   RSVPs/wishes/photos for exactly one invitation, no purchasing power. Identity:
   a JWT (`client_token`, `auth.create_client_token(profile_id)`) scoped to one
   `profile_id`, used only by `/api/client/*`. This is the Couple Access portal —
   untouched by the pivot, it was never a normal-user account to begin with.

**"Buyer" is now photographer-only.** Pre-pivot, `get_current_buyer` accepted
*either* the couple cookie *or* the studio Bearer JWT. Post-pivot,
`store_features.py`'s `_require_studio_buyer` (`:433-449`) is the sole
ordering guard: it requires a studio Bearer JWT and explicitly rejects both
a couple-session cookie (410/401, that identity no longer exists) and an
event_client Bearer (`typ == "event_client"` checked and refused) — a
Couple Access link can never place an order. "Buyer" is not a fourth login
flow; it means "a photographer/studio account, checking out."

Everyone else — a wedding guest — needs no login at all; the guest-facing invitation,
RSVP, wishes wall, live gallery, and shagun pages are public, scoped by the
invitation's `slug` in the URL. Public visitors (including a couple browsing
without a photographer) may browse designs/pricing, but purchasing is
gated to a photographer identity — the buyer-facing pages carry a
"connect with your photographer to get this design" note (`Cart.jsx`,
`Checkout.jsx`) rather than a sign-up path.

## Module Overview

| Module | Pages | Core Functionality |
|---|---|---|
| Marketing | Landing, Pricing, Features, How It Works, FAQ, Contact | Public site; design showcase, pricing, editorial content, support contact form |
| Auth | Sign In, Sign Up, Auth Callback, Reset Password | Studio and couple login/registration, Google OAuth return leg, password reset |
| Guest Invitation Experience | Guest Invitation, Ceremony Invitation, Save the Date, Live Gallery, Guest Arrival | The public invitation itself: RSVP, per-ceremony pages, live QR photo wall + face search, day-of check-in/room lookup |
| Shopping & Checkout | Cart, Checkout, Order Details | Design selection → server-quoted price → Razorpay payment → post-purchase wedding-detail intake for the studio to build from |
| ~~Couple Dashboard~~ | ~~User Dashboard, User Wedding Edit~~ | **REMOVED — photographer-only pivot 2026-08-11.** Both pages and their routes are deleted; no couple-owned dashboard exists. See Page Inventory rows 19–20 and `docs/ARCHITECTURE_MIGRATION_MAP.md` §6b. |
| Studio Admin | Studio Dashboard, Studio Profile Gallery, Studio Wedding Detail, Wedding Live Gallery, Studio QR Codes | The photographer's console for the invitations they manage: profile list, AI gallery tools, RSVPs/wishes, live-gallery moderation, QR regeneration |
| Couple Access Portal | Couple Access | A separate, narrower per-invitation login (event-client JWT) a photographer hands a couple who don't want a full MAJA account |
| Legal | Terms, Privacy, Refund Policy | Static legal pages — **routed but not yet implemented**, see note below |
| Utility | Coming Soon, Not Found | Fallback targets for unbuilt nav items and unmatched routes |

## Page Inventory

Auth codes: **Public** = no session · **RequireUser** = couple httpOnly cookie, enforced by
`components/RouteGuards.jsx` · **RequireStudio** = studio Bearer token, same guard · **In-page** =
the page enforces its own identity check rather than being wrapped by a `RouteGuards` component.

| # | Page | Route | Module | Auth Required | Doc |
|---|---|---|---|---|---|
| 1 | Landing | `/` | Marketing | Public | [→](./pages/01-landing.md) |
| 2 | Pricing | `/pricing` | Marketing | Public | [→](./pages/pricing.md) |
| 3 | Features | `/features` | Marketing | Public | [→](./pages/features.md) |
| 4 | How It Works | `/how-it-works` | Marketing | Public | [→](./pages/how-it-works.md) |
| 5 | FAQ | `/faq` | Marketing | Public | [→](./pages/faq.md) |
| 6 | Contact | `/contact` | Marketing | Public | [→](./pages/contact.md) |
| 7 | Sign In | `/auth` | Auth | Public | [→](./pages/sign-in.md) |
| 8 | Sign Up | `/auth/signup` | Auth | Public | [→](./pages/sign-up.md) |
| 9 | Auth Callback | `/auth/callback` | Auth | Public (Google OAuth return leg) | [→](./pages/reset-password-auth-callback.md) |
| 10 | Reset Password | `/auth/reset`, `/reset-password` | Auth | Public | [→](./pages/reset-password-auth-callback.md) |
| 11 | Guest Invitation | `/invite/:slug` | Guest Invitation Experience | Public (slug-scoped) | [→](./pages/guest-invitation.md) |
| 12 | Live Gallery | `/invite/:slug/live-gallery` | Guest Invitation Experience | Public (gallery may add a device-token/privacy-code gate; face-search adds a consent gate) | — not yet authored |
| 13 | Guest Arrival | `/invite/:slug/arrival` | Guest Invitation Experience | Public (slug-scoped) | — not yet authored |
| 14 | Ceremony Invitation | `/invite/:slug/:eventType` | Guest Invitation Experience | Public (slug + eventType-scoped) | [→](./pages/ceremony-invitation.md) |
| 15 | Save the Date | `/save-the-date/:slug` | Guest Invitation Experience | Public (slug-scoped, no view tracking) | [→](./pages/save-the-date.md) |
| 16 | Cart | `/cart` | Shopping & Checkout | Public (quote-only, no order created here) | — not yet authored |
| 17 | Checkout | `/checkout` | Shopping & Checkout | In-page — studio Bearer required post-pivot (photographer-only purchasing); page renders for a signed-out visitor with an inline "connect with your photographer" gate instead of a redirect (was: couple cookie OR studio Bearer, redirect to `/auth`) | — not yet authored |
| 18 | Order Details | `/order/:orderId/details` | Shopping & Checkout | In-page — buyer identity enforced server-side (`_require_studio_buyer`, post-pivot: studio Bearer only); no client-side redirect, unauthenticated calls surface as an API error | — not yet authored |
| 19 | ~~User Dashboard~~ | ~~`/user/dashboard`~~ | Couple Dashboard | **removed - photographer-only pivot** | Route and page deleted (`App.jsx`, `pages/UserDashboard.jsx`); backing `/api/users/*` routes now 410 |
| 20 | ~~User Wedding Edit~~ | ~~`/user/profile/:profileId/edit`~~ | Couple Dashboard | **removed - photographer-only pivot** | Route and page deleted (`App.jsx`, `pages/UserWeddingEdit.jsx`); backing `/api/users/profiles/*` routes now 410 |
| 21 | Studio Dashboard | `/studio/dashboard` | Studio Admin | RequireStudio | — not yet authored |
| 22 | Studio Profile Gallery | `/studio/profile/:profileId/gallery` | Studio Admin | RequireStudio | — not yet authored |
| 23 | Studio Wedding Detail | `/studio/wedding/:id` | Studio Admin | RequireStudio | — not yet authored |
| 24 | Wedding Live Gallery | `/studio/wedding/:weddingId/live-gallery` | Studio Admin | RequireStudio | — not yet authored |
| 25 | Studio QR Codes | `/studio/profile/:profileId/qr-codes` | Studio Admin | RequireStudio | — not yet authored |
| 26 | Couple Access | `/couple/access`, `/couple/access/:slug` | Couple Access Portal | In-page — event-client JWT (`client_token`), own login gate, not a `RouteGuards` wrapper | — not yet authored |
| 27 | Terms | `/terms` | Legal | Public (intended) | — **not implemented, see note** |
| 28 | Privacy | `/privacy` | Legal | Public (intended) | — **not implemented, see note** |
| 29 | Refund Policy | `/refund` | Legal | Public (intended) | — **not implemented, see note** |
| 30 | Coming Soon | `/soon` | Utility | Public | — not yet authored |
| 31 | Not Found | `*` | Utility | Public | — not yet authored |

**Note on the legal pages [TBC — implementation gap, not a business decision]:** `App.jsx`
imports `@/pages/legal/Terms`, `@/pages/legal/Privacy`, `@/pages/legal/RefundPolicy`
(`App.jsx:35-37`) and routes `/terms`, `/privacy`, `/refund` to them, but
`frontend-v2/src/pages/legal/` does not exist in the repository as of this analysis — no
`Terms.jsx`, `Privacy.jsx`, or `RefundPolicy.jsx` file, no `legal/` directory at all. These
three lazy imports will fail at build/dev time until the files are added. This PRD documents
the routes per the contract `App.jsx` declares; the pages themselves are pending.

Rows marked "not yet authored" exist in `App.jsx` and were confirmed against their page
component and API calls during this pass, but a full per-page field/interaction doc (per the
`pages/` template already established by the 12 existing docs) has not been written yet — that
is follow-up work, out of scope for this pass.

## Legacy-only Surfaces

`docs/API_SURFACE.md` documents 1182 backend routes across 181 namespaces. frontend-v2's
`src/api/*.js` calls roughly 60 of them (see `appendix/api-inventory.md`). Everything else is
still served exclusively by the legacy CRA app at `frontend/` (128 page components) — it has not
been ported and there is no frontend-v2 equivalent yet.

| Surface | Legacy pages (examples) | Backend namespace(s) | Routes |
|---|---|---|---|
| Super-admin consoles (platform owner) | `SuperAdminPricingHub`, `SuperAdminStorage`, `SuperAdminModeration`, `SuperAdminDisputes`, `SuperAdminSecurity`, `SuperAdminSystemHealth`, `SuperAdminUserInvestigation`, `SuperAdminQRAnalytics`, `SuperAdminFoundingPricing`, `SuperAdminGiftCodes`, `LuxurySuperAdminDashboard`, and 12+ more | `/api/super-admin/*` (pricing, v2, storage, founding, credit-packs, photographers, discount-codes, design-pricing, gift-codes, admins, event-categories, referrals, theme-bundle-pricing, feature-pricing, invitations, credit-purchases, gallery-uploads, users, theme-packages), `/admin`, `/super-admin` | ~281 routes (`require_super_admin` guard) |
| Full studio suite (beyond the 5 ported studio pages) | `AIStudio`, `StudioClientWork`, `StudioContentAnalytics`, `StudioDesigns`, `StudioEarnings`, `StudioInsights`, `StudioMessages`, `StudioPlansPage`, `StudioSecurity`, `StudioStaff`, `StudioStaffAccept`, `StudioStoragePage`, `StudioWhiteLabel` | `/api/admin/*` namespaces frontend-v2 doesn't touch: analytics, moderation, disputes, investigation, white-label, workspaces, monetization, marketplace, feature-wishes review queue, campaigns, and most of the 107-route `/api/admin/profiles` surface beyond gallery/RSVPs/wishes/quick-stats | Majority of the 344-route `require_admin` guard |
| Pixora (photographer social/business network) | `PixoraCommunity`, `PixoraPublicProfile`, `PixoraReels`, plus Pixora DMs, CRM, campaigns, marketplace, verification | `/api/pixora/*`, `/api/admin/pixora/*` | 182 + 7 routes — the single largest namespace in the whole backend |

frontend-v2 has no route, page, or `api/*.js` call touching any of the above. This is scope,
not a gap: the rewrite ports the couple-facing purchase/invitation flow and a slice of the
studio console first.

## Global Notes

### Permission model

**PRODUCT PIVOT 2026-08-11:** the Couple identity described in the original
three-identity model below is retired. `backend/user_auth.py`'s account
routes (register/login/Google OAuth/me/logout) now all answer
`410 NORMAL_USERS_RETIRED`; `UserAuthContext.jsx` and `RequireUser` are
deleted from the frontend entirely. What remains — two independent
identities, none of which unify into a single "current user":

- **Studio admin** — `Authorization: Bearer <admin_token>` (localStorage), attached
  automatically by every request through `api/client.js` when present. Backed by
  `backend/auth.py` + `auth_sessions.py`. Login can require MFA (`MFA_REQUIRED` /
  `MFA_INVALID`, see enum dictionary) and is rate-limited (`429` with `Retry-After`
  after repeated failures). A single-flight `/api/auth/refresh` runs on a `401` from
  any Bearer request; failure clears the token and fires a `maja:logout` DOM event
  that `AuthContext` listens for. Same identity now also gates checkout (see Buyer,
  below) since it's the only account type left that can purchase.
- ~~**Couple**~~ — **retired.** The httpOnly `user_session_token` cookie flow
  (`backend/user_auth.py`, Google OAuth via `/api/users/auth/google/login` →
  `/auth/callback`) no longer creates sessions; every route in that module 410s
  regardless of payload (confirmed: even a malformed `register` body 410s, never
  422s first — `backend/tests/test_users_retired.py`, 34/34 passed). A stale
  pre-pivot cookie, if a browser still holds one, authenticates nothing — the
  store buyer guard (below) explicitly rejects it.
- **Event-client** — a separate JWT (`client_token`, its own localStorage key,
  isolated axios instance in `lib/clientAuth.js` that never touches the admin
  Authorization header or refresh flow) minted by `POST /api/client/login`
  (username + passcode set by the photographer) and scoped to exactly one
  `profile_id`. Reaches only `/api/client/*` (overview, wishes, RSVP stats/export,
  analytics) — this is the Couple Access portal and it is **untouched by the
  pivot** (confirmed absent from the pivot's modified-file list; its router still
  builds and `/api/client/login` still mounts, per the same test suite above).
  It was never a `/api/users/*` normal-user account and stays exactly as it was.
- **Buyer** (checkout-only concept, now photographer-only) —
  `store_features.py`'s `_require_studio_buyer` (`:433-449`) replaced
  `get_current_buyer`/`get_current_public_user` on every mutating store route
  (`order/create`, `/verify`, `/edit-state`, `/info`, `/info-draft`, `/{order_id}`
  GET, `my-orders`). It requires a studio Bearer JWT and explicitly rejects both
  a couple-session cookie and an event_client Bearer
  (`payload.get("typ") == "event_client"` checked and refused) — a Couple Access
  link can never authenticate an order. Public store READ endpoints (`packages`,
  `design/{id}/price`, `quote`) are unaffected, still open with no auth. Verified
  end-to-end over HTTP: no-Bearer → 401, couple-cookie → 401, event_client
  Bearer → 401, studio Bearer → 200 with the order recorded
  `buyer_kind=photographer`.
- Route-level guarding is `components/RouteGuards.jsx`'s `RequireStudio` (and
  `RequireSuperAdmin`) — `RequireUser` no longer exists. **Checkout, Order
  Details, and Couple Access enforce their own identity in-page** rather than
  through that wrapper (see Page Inventory notes); Checkout now gates on the
  studio Bearer alone (`admin` from `AuthContext`), not the removed couple/user
  check. A stale-but-present Bearer token is treated as signed-in during boot
  retries (`AuthContext.jsx:56-82`) so a flaky backend never silently signs out a
  valid session — only a definitive `401`/`403` clears it.

### Common interaction patterns

- **Money is always server-quoted, in INR paise.** The cart/checkout flow never
  trusts a client-computed amount — every quote and every order total is
  recomputed server-side from the owner's live prices (`backend/store_features.py`,
  see `api/store.js`'s header comment). The client posts back *selections*
  (design/theme/features/languages), never amounts. Order records store both
  `amount_inr` and `amount_paise`.
- **Consent-gated face search.** "Find my photos" (guest selfie → face match) requires
  an explicit, non-withdrawn consent record for that (gallery, guest-IP) pair, valid
  for 90 days, before any selfie is processed — enforced with `428 CONSENT_REQUIRED`
  (`backend/gallery_features.py:539-541`, `backend/face_consent.py`). Withdrawal is
  public/IP-keyed, no login required.
  Face-search is additionally gated by the gallery's own privacy toggle
  (`ai_face_match_enabled`) and, if the gallery is password-protected, a device
  token issued by the unlock flow.
  See `appendix/enum-dictionary.md` for the full status-code table.
- **Link-expiry model.** Every invitation has a computed `expires_at`
  (`calculate_invitation_expires_at`, `backend/server.py:507`); a request against an
  expired profile-level link returns `410`. Per-ceremony invitations layer their own
  independent `enabled` flag and `expires_at` on top of the profile's (see
  `api/invitations.js`'s `getEventInvitation` comment) — a ceremony page can be
  individually disabled or expired even while the rest of the invitation is live.
- **Two parallel "message from a guest" systems** — `/greetings` (moderation-gated,
  pending by default) and `/wishes` (auto-approved, what the public wishes wall
  actually renders). They are not the same collection; a submission through the
  wrong endpoint would never appear where the guest expects it
  (`api/invitations.js:43-49`).
- **Design identity is a reversible 3-part code**, not a database ID exposed to
  users: `<THEME4>-<EVENT3>-<NN>` (e.g. `MUGH-ENG-01`), encoded/decoded by
  `lib/designCode.js` from the theme and ceremony-type enums (see appendix). Same
  code a customer copies from the showcase resolves back to the exact design.
- **`docs/API_SURFACE.md`'s auth-guard column is unreliable for factory-built
  routers.** It's generated by inspecting each route's dependency-injection
  parameter name; `backend/store_features.py`'s `build_store_router(...,
  get_current_public_user, require_super_admin)` wires its *actual* guard in
  through parameters named generically, and the generator mis-attributes several
  routes (`/api/store/quote` shows `require_super_admin` in the doc but has **no
  guard at all** in source; `/api/store/order/{id}`, `/api/store/my-orders`, and
  `/api/store/order/{id}/info-draft` show `require_super_admin`/`require_admin` but
  are wired to `_require_studio_buyer` (post-pivot: studio Bearer only, not
  super-admin, not a couple identity — see Permission model above).
  `appendix/api-inventory.md` uses the verified (source-read) identity
  for every frontend-v2-called endpoint, not the generated doc's guard column;
  where they disagree it's noted inline. The doc's own header carries the same
  caveat ("verify before trusting").
- **A few `api/*.js` exports are currently dead code** — defined, correct, but not
  called from any page yet: all of `api/auth.js` (the same `/api/auth/*` endpoints
  are called directly via the shared `client` from `AuthContext.jsx` instead),
  `api/uploads.js` in full (no page wires up direct-to-S3
  presigned uploads yet), `api/pricing.js`'s `featureFlags`, and
  `api/studio.js`'s `myWeddings`/`earnings`. See `appendix/api-inventory.md` for the
  full per-endpoint breakdown. (`api/users.js` and `UserAuthContext.jsx` — previously
  listed here as dead code — are deleted outright by the 2026-08-11 pivot, not
  merely unused; see Permission model above.)
