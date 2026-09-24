# Pathfinder Phase 2 -- Duplication Report

Every claim below cites >=2 `file:line` locations. Verdict is either
**legitimate specialization** (different trust model / data source / audience
-- keep both) or **accidental divergence** (same concern, should converge).
Ranked roughly by production risk in `03-evidence-for-proposal.md`.

---

## A. Live gallery: two photo stores for one wall

**Concern:** "photos on the live gallery wall for wedding X."

- Write path 1 (photographer's "Upload to QR Gallery", studio panel, guest
  uploader): `backend/live_gallery_features.py:321`
  `POST /api/invite/{slug}/gallery/guest-upload` -- writes `db.live_gallery_photos`
  (keyed `wedding_id`, per module header comment
  `live_gallery_features.py:1-2`).
- Write path 2 / read path (the public wall itself):
  `backend/premium_features.py:597` `GET /invite/{slug}/live-gallery` --
  reads `db.live_photos` (keyed `profile_id`, has `approved` /
  `favorite_count` / `favorited_by`), favorite toggle at
  `premium_features.py:676`.
- Frontend calls both without knowing they're different stores:
  `frontend-v2/src/api/gallery.js:11-12` (`getWall` -> premium_features.py)
  vs `frontend-v2/src/api/gallery.js:15-23` (`guestUpload` ->
  live_gallery_features.py).
- The divergence was already discovered as a **production bug** and patched
  with a reconciliation shim rather than a real merge:
  `backend/live_wall_feed.py:1-22` docstring: "MAJA grew two independent
  live-gallery implementations that write to two different collections ...
  every photo a studio uploaded went into one collection and the wall
  guests scan the QR for read the other. The wall was permanently empty."
  `fetch_wall()` (`live_wall_feed.py:72-128`) now reads BOTH collections on
  every poll and merges/dedupes client-side; `find_photo()`
  (`live_wall_feed.py:165-175`) has to probe both stores for moderate/
  favorite/delete to work at all (`premium_features.py:635-636,656-657`).

**Verdict: accidental divergence**, already self-diagnosed in the codebase.
Not legitimate specialization -- both collections hold the same entity
(a wall photo) for the same feature, just written by two code paths that
grew independently.

**Simplest unification:** pick one collection (`live_photos` already has
the richer shape -- `approved`, `favorite_count`, `favorited_by`) as the
system of record. Point `live_gallery_features.py`'s guest-upload and the
photographer/studio upload paths at it directly. Delete
`live_wall_feed.py`'s dual-read merge once there is one writer; keep a
one-time backfill migration for existing `live_gallery_photos` rows, not a
permanent read-time shim. Capability loss: none identified -- both
collections are already unified in shape by `live_wall_feed.normalise()`
(`live_wall_feed.py:41-55`), so the merge function IS the target schema.

---

## B. Price / package resolution: 3+ independent copies, already numerically inconsistent

**Concern:** "what does a MAJA invitation cost."

- Backend ground truth for what checkout actually charges (à-la-carte):
  `backend/store_features.py:85` `FEATURES` dict + `:237`
  `quote_alacarte()`, DB-overridable via `db.store_features` /
  `db.store_languages` (`store_features.py:83-84`).
- A second, still-LIVE catalogue backs the informational tier cards shown
  on the Pricing page: `backend/store_features.py:49-54` `PACKAGES`
  (`classic` 1499, `premium` 2999, `royal` **4999**, `bespoke` 9999) is
  the code-default fallback for `db.store_packages`
  (admin-editable in Pricing Hub -> Link Packages,
  `store_features.py:140-142`), served live at
  `backend/store_features.py:498` `GET /api/store/packages` and rendered
  by `frontend-v2/src/pages/Pricing.jsx:104-105`. The module's own
  comment at `store_features.py:69` clarifies these tiers no longer drive
  what checkout charges ("The owner does not sell ceremony packages
  (Classic/Premium/Royal/Bespoke)" as an order unit -- `quote_alacarte()`
  does) but the catalogue display itself is real and admin-editable, not
  dead.
- `frontend-v2/src/pages/Faq.jsx:8-10,15` hardcodes THREE tiers as static
  copy instead of reading the live catalogue: "Classic is 1,499, Royal is
  5,999 and Bespoke is 9,999" -- omits Premium entirely, and prices Royal
  at **5,999**.
- `frontend-v2/src/pages/Landing.jsx:31-49` hardcodes FOUR tiers
  independently: Classic 1,499 / Premium 2,999 / Royal **5,999** / Bespoke
  9,999, repeated again in its own FAQ copy at `Landing.jsx:54`.
- Landing.jsx and Faq.jsx agree with each other on Royal's price (5,999),
  but BOTH disagree with the code-level `PACKAGES` default (4,999) that
  `Faq.jsx:8-10`'s own comment says it is sourced from ("match
  store_features.py's PACKAGES defaults"). Whether the currently-live
  admin-edited value in `db.store_packages` matches 4,999 or 5,999 can't
  be determined by static analysis -- either way, two independently
  hand-typed copies of the same number is how they were able to disagree
  with their own cited source in the first place, and neither is wired to
  notice a future admin price change in the Pricing Hub.
- `frontend/src/pages/LandingPage.jsx:687,856` (legacy) hardcodes a third,
  looser copy: "From ₹1,499" only.
- Live, correct price rendering exists and is used correctly on
  `frontend-v2/src/pages/Pricing.jsx:104-105,145-146` (reads
  `pkg.price?.english` / `plan.price` straight from the `/api/store/*`
  response) and `frontend-v2/src/pages/Checkout.jsx:126-136` (reads
  `quoteData` from `/api/store/quote`).

**Verdict: accidental divergence**, and plausibly wrong today (Royal
5,999 vs the 4,999 code-default is a real number mismatch between
marketing copy and the value it was documented as copied from -- whether
it is currently wrong in production depends on the live
`db.store_packages` row, which static analysis can't see, but the
hand-copied figures cannot track it either way). The individual instances
of "hardcode static marketing
copy instead of an API call" are each defensible in isolation (both files
have a `ponytail`-style comment acknowledging the tradeoff) but the same
number was independently transcribed in 3 places with no single source,
so they've already drifted from each other and from the backend.

**Simplest unification:** `PACKAGES` (`store_features.py:49-54`) stays --
it is the live fallback for a real, admin-editable catalogue. What should
go is the hand-typed copies. Replace the hardcoded price strings in
`Faq.jsx:15` and `Landing.jsx:31-49,54` with either (a) a build-time
constant file both pages import, generated from (or manually kept in
sync with, with a lint/test check) the current `PACKAGES` defaults, or
(b) drop the specific rupee figures from marketing copy and say "see
pricing" linking to the live `/pricing` page. Given these are one-time
SEO/conversion copy blocks, a shared constants file (rung 6 of the ladder
-- one file, no API call) is
enough; a live fetch is overkill for static FAQ text.

### B2. Razorpay order-create reimplemented 9+ times

Beyond the shared helper `backend/event_payments.py:129` `create_order()`
(built explicitly, per its own header at `event_payments.py:2-31`, to be
"the ONE Razorpay surface for events" after two ad-hoc paths shared a bare
`except Exception` that couldn't tell a forged signature from an
unreachable gateway), `razorpay_client.order.create(...)` is independently
called in:

`backend/event_finance_service.py:279`, `backend/link_reactivation.py:151`,
`backend/monetization_features.py:251`, `backend/premium_features.py:989`,
`backend/server.py:11926`, `backend/server.py:13419`,
`backend/store_features.py:723`, `backend/studio_storage.py:520`,
`backend/subscription_service.py:589`, `backend/user_features.py:717`.

Only `event_finance_service.py` and `event_purchase_service.py` import and
use `event_payments.py` (`grep -l "from event_payments import"` returns
exactly those two plus `portfolio_service.py` and `store_features.py`, and
`store_features.py` only imports it for `webhook_payment` parsing, not for
order-create/verify -- `backend/store_features.py:850`). Signature
verification is separately reimplemented (not via
`event_payments.verify_signature`) in
`backend/monetization_features.py:429`, `backend/store_features.py:799`,
`backend/subscription_service.py:292`, `backend/user_features.py:804`.

**Verdict: accidental divergence.** `event_payments.py` exists precisely
to fix this class of bug and is used by 2 of ~11 call sites.

**Simplest unification:** route every `order.create` / signature-verify
call through `event_payments.create_order()` /
`event_payments.verify_signature()` (rename module-neutral if desired --
its logic is not event-specific). No new abstraction needed; the module
already exists and already does the right thing.

### B4. Three layered quote resolvers behind one `order/create` endpoint

`backend/store_features.py:634` `create_order()` -- the single endpoint
`frontend-v2/src/pages/Checkout.jsx` calls -- tries three independent
pricing resolvers in a fallback chain, each with its own pricing model:

1. `backend/pricing_engine.py:381` `quote_wedding()` -- a flag-gated
   ("Phase 4... Unified pricing engine", `store_features.py:638-641`)
   design + feature-pack + link-duration + campaign-discount resolver,
   used only `if _new_pricing and payload.feature_pack_key and
   payload.duration_id` (`store_features.py:648`).
2. `backend/store_features.py:237` `quote_alacarte()` -- the current live
   default, used `if q is None and payload.main_language`
   (`store_features.py:670-673`).
3. `backend/store_features.py:341` `_quote()` -- the original
   package+language+addon resolver keyed off `PACKAGES`/`ADDONS`
   (`store_features.py:49-63`), the final fallback if neither of the
   above produced a quote (`store_features.py:674-675`).

**Verdict: legitimate versioning, but three live resolvers behind one
endpoint is real complexity, not just history.** Each was plausibly the
"current" model at some point (`_quote` -> `quote_alacarte` -> the
flag-gated `pricing_engine.quote_wedding`), and the fallback chain is a
deliberate backward-compatibility choice (`store_features.py:640-641`
says so explicitly), not an accident. It still means a bug in checkout
pricing requires checking three modules and a feature flag to find which
one actually ran for a given order.

**Simplest unification:** once `new_pricing_enabled` has been on for a
full deprecation window with no regressions, delete `_quote()`/`PACKAGES`
-consuming path and `quote_alacarte()` in favor of
`pricing_engine.quote_wedding()` alone (or vice versa, if Phase 4 is
abandoned) -- collapse to one resolver, not three. Do not attempt this
now; it needs confirmation of which model is actually the intended
long-term one first.

### B3. A second, parallel purchase engine wired only to the legacy frontend

The "Dynamic Event Engine" money path (`backend/event_payments.py`,
`backend/event_purchase_service.py:171` `webhook_purchase`,
`backend/event_finance_service.py`) is mounted and live
(`backend/server.py:16382` `build_event_purchase_router`,
`backend/server.py:16358` `build_event_finance_router`) but is called ONLY
from the legacy frontend's `/events`, `/events/:eventId/builder` routes
(`frontend/src/App.js:400-401`, pages `EventsDashboard.jsx`,
`EventBuilder.jsx`). A repo-wide grep for `events/purchase`,
`EventsDashboard`, `EventBuilder` under `frontend-v2/src` returns zero
hits. Since `frontend/` is never deployed (see `00-features.md`
canonical-UI determination), this is a second complete purchase pipeline
running in production with no reachable UI, still processing real
Razorpay webhook traffic if configured. See `03-evidence-for-proposal.md`
for the retire-or-port decision this forces.

---

## C. Navigation: legitimate factoring in `frontend-v2`, orphaned duplicate in legacy

- `frontend-v2/src/components/nav/RailNav.jsx:4-6` is explicitly the
  shared mechanics behind three consumers: `AdminNav.jsx:39`,
  `StudioNav.jsx:62`, `PixoraNav.jsx` -- one collapse/rail/wide breakpoint
  ladder, documented as intentional in the component's own comment.
- `frontend-v2/src/components/nav/MarketingNav.jsx:5-9` is a second,
  separate shared nav for the 5 secondary marketing pages, with its own
  comment explaining why: "each .dc.html hand-coded a near identical nav
  ... Landing keeps its own bespoke nav (scroll-fade + hamburger drawer),
  which this shape doesn't need."
- `frontend-v2/src/pages/Landing.jsx:80-100` is that third, intentionally
  separate bespoke nav (scroll-fade class toggle + full-screen drawer).
- Legacy (`frontend/`) has only ONE componentized nav,
  `frontend/src/components/PublicShell.jsx:20` `Nav`, covering marketing
  chrome for ~10 public pages (`PublicShell.jsx:143-152`); a repo-wide
  search for nav/sidebar components elsewhere in `frontend/src` returns
  nothing, meaning legacy's studio/admin panel chrome is embedded ad hoc
  per page rather than componentized at all.

**Verdict: legitimate specialization inside `frontend-v2`** (three
genuinely different chrome requirements -- rail-collapse dashboards vs.
static secondary-page nav vs. scroll-reactive hero nav -- already unified
where they share mechanics via `RailNav`). The legacy `Nav` is **dormant
duplication** (item G covers the full legacy-overlap list) rather than a
live divergence, since `frontend/` never runs in this deploy.

**Simplest unification:** none needed inside `frontend-v2` -- this is the
example of already-correct factoring, not a problem to fix. For legacy,
see item G's retire recommendation.

---

## D. Media URL builders: verbatim port, one bugfix not backported

- `frontend-v2/src/lib/mediaUrl.js:1-4` states outright: "Ported verbatim
  from legacy frontend/src/utils/mediaUrl.js, plus the data:-URI guard...
  the legacy resolver had no guard and would prepend BACKEND_URL to a
  data: URI, breaking inline images."
- The guard: `frontend-v2/src/lib/mediaUrl.js:22-23`
  (`if (/^data:/i.test(value)) return value;`) has no counterpart in
  `frontend/src/utils/mediaUrl.js:22-29`, confirmed by reading both files
  side by side -- the legacy version goes straight from the null check
  (`utils/mediaUrl.js:23`) to the `https?://` check (`:25`) with no `data:`
  branch.
- Both resolvers independently encode the same backend contract quirk
  (`/uploads/...` must become `/api/uploads/...` so the ingress routes it
  to FastAPI instead of falling through to the SPA):
  `frontend-v2/src/lib/mediaUrl.js:29-33` vs
  `frontend/src/utils/mediaUrl.js:30-35`.
- Backend side has its own, unrelated media-URL concern: signed/expiring
  URLs for private storage-key-addressed objects,
  `backend/storage_serve.py:136-139` `media_url()` (HMAC-signed, `/api/media?k=...`),
  which is a different mechanism from the public `/uploads/` and
  `/api/uploads/` static paths the frontend helpers rewrite.

**Verdict: accidental divergence** between the two frontend copies (same
function, same bug class, fixed in only one place) -- **not** a
duplication involving the backend's `storage_serve.media_url()`, which
solves an unrelated problem (signed access to CloudFront-backed keys) and
should stay separate.

**Simplest unification:** since `frontend/` is dormant, no runtime risk
today. If/when any legacy page still renders, backport the one-line
`data:` guard (`mediaUrl.js:22-23`) into
`frontend/src/utils/mediaUrl.js` to close the gap, or -- simpler still --
delete the legacy copy and have any surviving legacy page that needs it
import `frontend-v2`'s version isn't possible across separate app builds,
so the smallest real fix is the one-line backport, not a shared package.

---

## E. Invitation-fetch paths: clean shared hook in v2, raw per-page fetch in legacy, plus 3 backend endpoints and one orphaned viewer

Within `frontend-v2` itself, `GuestInvitation.jsx` and
`CeremonyInvitation.jsx` already share one hook
(`frontend-v2/src/lib/useInviteFull.js:10`, called at
`GuestInvitation.jsx:32` and `CeremonyInvitation.jsx:18`) --
**this is legitimate, already-unified code**, not a duplication.
`CeremonyInvitation.jsx:23` additionally calls
`frontend-v2/src/lib/useEventInvitation.js:22` for the per-ceremony
design/deity override that QR codes require (`useEventInvitation.js:4-8`
explains why `/full`'s client-side filter isn't authoritative for that).

The real duplication is legacy vs. v2:

- `frontend/src/pages/GeneratedInvitationRoute.jsx:1-5` (the legacy
  equivalent of `CeremonyInvitation.jsx`, mounted at legacy's
  `/invite/:slug/:eventType`) wraps the 1,901-line
  `frontend/src/pages/LuxuryPublicInvitation.jsx`, which independently
  calls the same batched endpoint via raw inline axios:
  `frontend/src/pages/LuxuryPublicInvitation.jsx:132`
  (`axios.get(`${API_URL}/api/invite/${slug}/full`)`) -- no shared hook,
  no shared api client, own `API_URL` construction at
  `LuxuryPublicInvitation.jsx:62`.
- Backend serves the same contract to both apps from
  `backend/server.py:4945` `get_invitation_full()`, plus two more
  slug-scoped view endpoints (`server.py:4913`, `server.py:5332`) and a
  fourth, uncalled one (`server.py:5502`, "PHASE 17", zero references in
  either frontend -- dead code).
- A wholly separate viewer subsystem, `backend/invitation_v2.py:1-23`
  ("Invitation Viewer V2 ... prefixed with /api/v2"), mounted at
  `backend/server.py:15686`, has no caller in either frontend at all.

**Verdict:** the `GuestInvitation`/`CeremonyInvitation` shared-hook
relationship is **legitimate, already-correct specialization** (shared
data fetch, specialized per-ceremony override). The legacy-vs-v2 split is
**dormant duplication** (item G). The orphaned `/invite/{slug}/event/{event_slug}`
endpoint and the entire `invitation_v2.py` module are **dead code**, not
duplication in the "two live paths diverging" sense -- but they inflate
the surface a future maintainer has to rule out when reasoning about "how
does an invitation get fetched."

**Simplest unification:** delete `server.py:5502`
(`get_event_by_slug`) and `invitation_v2.py` (and its
`app.include_router(invitation_v2_router)` at `server.py:15686`) unless a
concrete near-term plan exists to wire either to a frontend. For the
legacy/v2 split, see item G.

---

## F. Auth / session handling: four independent identity mechanisms, two of which both represent "the couple"

- Admin/photographer -- Bearer JWT, `localStorage.admin_token`:
  `frontend-v2/src/context/AuthContext.jsx:19-21` (read),
  `backend/auth.py:211` `get_current_admin`.
- Couple/buyer (self-serve account) -- httpOnly cookie
  `user_session_token`: `frontend-v2/src/context/UserAuthContext.jsx:7-17`
  (session-active flag in localStorage, token itself never touches JS),
  `backend/user_auth.py:137-142` (`set_cookie`).
- Super-admin -- role flag checked on the SAME admin JWT, not a distinct
  token: `backend/auth.py:317` `require_super_admin` (wraps
  `_resolve_admin_with_role`, `auth.py:262`).
- Event/studio-client (Couple Access portal) -- a FOURTH, separate Bearer
  JWT in `localStorage.client_token`, its own axios instance deliberately
  isolated from the admin one: `frontend-v2/src/lib/clientAuth.js:9-13`
  ("Deliberately ISOLATED from the admin axios instance ... token lives
  in localStorage.client_token (NOT admin_token)"), minted by
  `backend/auth.py:156` `create_client_token`, verified by
  `backend/auth.py:169` `get_current_event_client`.
- A fifth, hybrid dependency exists purely for store/checkout, accepting
  EITHER the user cookie OR the admin bearer:
  `backend/server.py:15289` `get_current_buyer` (comment: "Buyer = a
  normal user (session cookie/bearer) OR a photographer (admin JWT) ...
  Fixes 'checkout logs me out' for photographers").

Two of these (`user_session_token` and `client_token`) both represent "a
member of the couple," but through different mechanisms with different
login surfaces: `UserAuthContext.jsx` is the couple's own self-registered
account (`register`/`login` at `UserAuthContext.jsx:54-66`); `clientAuth.js`
is a studio-issued, per-invitation username/password
(`clientAuth.js:35-41`, backend login at
`backend/photographer_clients.py:254`). A couple who both self-registers
AND receives a studio-issued client login ends up with two independent,
unlinked sessions to the same wedding.

**Verdict:** admin/user/super-admin/hybrid-buyer split is **legitimate
specialization** -- different trust boundaries (photographer vs. couple
vs. platform owner) genuinely need different tokens, and
`get_current_buyer` is a deliberate, well-commented bridge, not
accidental drift. The `user_session_token` vs `client_token` "two ways to
be the couple" split is **borderline** -- defensible today (self-serve
buyer vs. studio-issued client access are genuinely different flows
serving different personas: a couple who bought directly vs. one whose
studio built their invitation for them) but not obviously intentional --
no code or doc comment explains why a couple can't reach the Couple
Access portal data through their own `user_session_token` once
authenticated, or why `photographer_clients.py`'s login couldn't set the
same cookie `user_auth.py` does.

**Simplest unification (if the two "couple" flows are meant to
converge):** have `photographer_clients.py:254`'s login set the same
`user_session_token` cookie `user_auth.py:137-142` sets (scoped to that
profile), and retire `client_token`/`clientAuth.js` entirely, rather than
maintaining a fifth token type. Given this changes a live login flow, flag
for product confirmation before touching it (see
`03-evidence-for-proposal.md` risk rating) -- do not merge without
confirming the personas really are meant to be the same account.

---

## G. Legacy frontend pages overlapping already-ported `frontend-v2` pages

`frontend-v2` is canonical (see `00-features.md`); every route below is
duplicated in the legacy tree with a different, older implementation that
never runs in this deploy. Canonical = frontend-v2 in every row.

| Route | frontend-v2 (canonical) | frontend (legacy, dormant) |
|---|---|---|
| `/` | `frontend-v2/src/App.jsx:74` -> `Landing.jsx` | `frontend/src/App.js:279` -> `LandingPage.jsx` |
| `/features` | `App.jsx:76` -> `Features.jsx` | `App.js:282` -> `FeaturesPage.jsx` |
| `/how-it-works` | `App.jsx:77` -> `HowItWorks.jsx` | `App.js:283` -> `HowItWorksPage.jsx` |
| `/faq` | `App.jsx:78` -> `Faq.jsx` | `App.js:285` -> `FaqPage.jsx` |
| `/invite/:slug` | `App.jsx:85` -> `GuestInvitation.jsx` | `App.js:332` -> `LuxuryPublicInvitation.jsx` |
| `/invite/:slug/:eventType` | `App.jsx:88` -> `CeremonyInvitation.jsx` | `App.js:344` -> `GeneratedInvitationRoute.jsx` |
| `/invite/:slug/live-gallery` | `App.jsx:86` -> `LivePhotoWall.jsx` | `App.js:484` -> `LivePhotoWall.jsx` (separate file, legacy tree) |
| `/save-the-date/:slug` | `App.jsx:89` -> `SaveTheDate.jsx` | `App.js:346` -> `SaveTheDatePage.jsx` |
| `/cart` | `App.jsx:90` -> `Cart.jsx` | `App.js:495` -> `CartPage.jsx` |
| `/checkout` | `App.jsx:91` -> `Checkout.jsx` | `App.js:396` -> `WeddingCheckout.jsx` |
| `/order/:orderId/details` | `App.jsx:92` -> `OrderDetails.jsx` | `App.js:496` -> `OrderDetailsForm.jsx` |
| `/couple/access(/:slug)` | `App.jsx:100-101` -> `CoupleAccess.jsx` | `App.js:349-350` -> `CoupleAccess.jsx` (separate file, legacy tree) |
| `/studio/dashboard` | `App.jsx:95` -> `StudioDashboard.jsx` | `App.js:418` -> `LuxuryDashboard.jsx` |
| `/studio/wedding/:id` | `App.jsx:97` -> `StudioWeddingDetail.jsx` | `App.js:422` -> `StudioWeddingDetail.jsx` (separate file, legacy tree) |
| `/terms`, `/privacy`, `/refund` | `App.jsx:102-104` -> `legal/*.jsx` | `App.js:300-303` -> `LegalPage.jsx` (docKey-switched, one file) |
| `/pricing` | `App.jsx:75` -> `Pricing.jsx` (live-priced) | `App.js:281` -> `Navigate` redirect to `/portfolio-plans` -> `PortfolioPricingPage.jsx` (photographer-plan pricing, not the couple-facing invitation pricing v2 serves) |

Legacy-only surfaces NOT yet ported (kept, per `README.md:12`):
`/super-admin/*` (~20 pages, `App.js:357-394`), full studio suite
(`/studio/designs`, `/studio/staff`, `/studio/earnings`, etc.,
`App.js:404-483`), Pixora community (`App.js:426-432`), the Dynamic Event
Engine UI (`App.js:400-401`, see item B3).

**Verdict:** every overlapping row is **dormant duplication** -- real
divergent implementations, but zero production risk today since
`frontend/` is never served (see `00-features.md`). Risk is entirely
maintenance/confusion cost: a contributor grepping the repo for
"Checkout" or "GuestInvitation" finds two answers and has to know which
one is real.

**Simplest unification:** none of the legacy pages need porting work --
they need a decision. Either (a) delete the overlapping legacy pages now
that `frontend-v2` covers them, keeping only the not-yet-ported surfaces
in `frontend/`, or (b) if `frontend/` is being kept around as a reference
during the ongoing port, add a top-of-file comment on each superseded
page pointing at its `frontend-v2` replacement so a future contributor
doesn't accidentally edit the dead one. Deleting is the lower-maintenance
option once each replacement is confirmed feature-complete.

---

## H. Two independent async job mechanisms for background media work

- Face-match jobs: Redis-backed, `backend/face_queue.py:13-21`
  (LPUSH/BRPOP via `cache_backend.queue_push`/`queue_pop_blocking`),
  consumed by the standalone `backend/worker.py:136` process, with
  documented graceful no-queue-configured fallback
  (`face_queue.py:9-11`).
- Drive-archive jobs: an in-process `asyncio.Queue`,
  `backend/drive_archive.py:17-18` ("An asyncio.Queue acts as a
  lightweight job queue ... No Celery/Redis"), drained by an in-process
  `_archive_worker` task rather than the separate `worker.py` process.

**Verdict: legitimate specialization, but worth a second look.**
Drive-archive jobs are lower-volume and don't need cross-process/durable
queuing the way face-indexing does (per-photo Rekognition calls at
upload-time scale) -- an in-process queue is a reasonable, deliberately
lighter choice, and the module says so explicitly. However, an in-process
`asyncio.Queue` does NOT survive a process restart (unlike the Redis
queue, which does), so an in-flight drive-archive job is silently lost on
every backend deploy -- worth confirming that's an accepted tradeoff
rather than an oversight.

**Simplest unification (if durability turns out to matter):** move
drive-archive jobs onto the existing `face_queue.py`/`worker.py` Redis
pipeline (a new job `type` in `worker.py:104` `_dispatch()`) rather than
inventing a second durable-queue mechanism. Do not build a generic job
queue abstraction for two consumers -- extending the one that already
exists is the smaller diff.
