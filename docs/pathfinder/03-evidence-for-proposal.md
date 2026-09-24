# Pathfinder Phase 2 -- Evidence for the Unified Proposal

Raw candidate unifications, ranked by value/risk, for the orchestrator to
turn into `03-unified-proposal.md`. Full citations for each live in
`02-duplication-report.md` (referenced by item letter below); this file
only adds the ranking judgment and the effort/risk signal.

Rating scale: **Value** = user/business/security impact if fixed.
**Risk** = chance of breaking something live if changed. **Effort** =
rough size of the smallest correct fix (not a full rebuild estimate).

---

## Tier 1 -- high value, low-to-medium risk, do first

### 1. Consolidate Razorpay order-create / signature-verify onto `event_payments.py` -- (report item B2)
- **Value: high.** This is a money-correctness path. `event_payments.py`
  exists specifically because the old bare-`except` pattern couldn't
  distinguish a forged signature from an unreachable gateway
  (`backend/event_payments.py:2-16`). That exact risky pattern is still
  live in `backend/monetization_features.py:429`,
  `backend/store_features.py:799`, `backend/subscription_service.py:292`,
  `backend/user_features.py:804`, plus 5 more independent
  `order.create` sites (`backend/link_reactivation.py:151`,
  `backend/premium_features.py:989`, `backend/server.py:11926,13419`,
  `backend/studio_storage.py:520`).
- **Risk: low.** The target module already exists, is already used
  correctly by 2 modules, and the change is mechanical (swap a local
  try/except for a shared function call) -- no new abstraction, no
  behavior change to the happy path.
- **Effort: medium** -- 9+ call sites, each needs its own test pass since
  they're in different purchase flows (credit packs, subscriptions,
  studio storage, link reactivation, etc.), but the pattern is identical
  each time.
- **Unification target:** `event_payments.create_order()` /
  `event_payments.verify_signature()` (module name is legacy-sounding but
  the logic is generic; rename only if it reduces confusion, not required).

### 2. Unify the live-gallery photo store -- (report item A)
- **Value: high.** This is a previously-shipped, user-facing bug (empty
  wall despite uploads) that is currently masked, not fixed --
  `backend/live_wall_feed.py:1-22` is a permanent per-request merge of two
  collections rather than a migration. Every wall poll pays the cost of
  querying both `live_photos` and `live_gallery_photos`
  (`live_wall_feed.py:103-111`), and every future write path (moderate,
  favorite, delete) has to remember to check both stores
  (`backend/premium_features.py:635-636,656-657`) or silently 404 on half
  the photos.
- **Risk: medium.** Needs a real data migration (backfill
  `live_gallery_photos` rows into `live_photos`, or vice versa) and a
  cutover of the guest-upload write path
  (`backend/live_gallery_features.py:321`) -- touches a live, actively
  used guest-facing feature.
- **Effort: medium** -- one migration script + repointing one write
  endpoint + deleting the merge logic once the migration is verified.
- **Unification target:** `db.live_photos` (richer shape --
  `approved`/`favorite_count`/`favorited_by` already exist there); retire
  `db.live_gallery_photos` and `live_wall_feed.py`'s dual-read after
  backfill.

### 3. Delete confirmed-orphaned invitation-viewer surfaces -- (report item E)
- **Value: medium.** Removes an unauthenticated-by-slug endpoint
  (`backend/server.py:5502` `get_event_by_slug`) and an entire unused
  module (`backend/invitation_v2.py`, mounted at
  `backend/server.py:15686`) that no frontend calls -- smaller attack
  surface, smaller thing to reason about when asking "how does an
  invitation get fetched."
- **Risk: low.** Confirmed zero references in `frontend-v2/src` or
  `frontend/src` via repo-wide grep for both the route shape and
  `viewer_v2`/`/api/v2`.
- **Effort: low** -- delete the route handler + the module + its
  `include_router` call.

---

## Tier 2 -- real value, needs a product/ownership decision before touching

### 4. Decide the fate of the parallel event-purchase engine -- (report item B3)
- **Value: high** either way the decision goes: if retiring, removes a
  live money-processing surface (`backend/event_purchase_service.py:171`
  `webhook_purchase`, mounted at `backend/server.py:16382`) that has no
  reachable UI in the deployed app -- dead attack surface plus ongoing
  Razorpay webhook liability for no product benefit. If porting, it means
  `frontend-v2` is missing a whole feature (the Dynamic Event Engine /
  `/events` flow) that legacy still has.
- **Risk: high to get wrong** -- this is a product-scope call
  (was the event engine intentionally deprioritized, or is it a gap in
  the v2 port?), not a code-cleanup call. Do not delete or port
  unilaterally.
- **Effort:** N/A until the decision is made; retiring is low-effort
  (delete the routers + modules), porting is a multi-page feature build.
- **Action:** flag for the product owner; this evidence file is the
  input, not the decision.

### 5. Decide whether `client_token` (Couple Access portal) should collapse into `user_session_token` -- (report item F)
- **Value: medium-high if intentional** -- one fewer auth mechanism,
  one fewer place `AuthContext`-style boot/refresh logic has to be
  maintained (`frontend-v2/src/lib/clientAuth.js` is currently a
  hand-rolled parallel to `UserAuthContext.jsx` with none of its retry/
  refresh hardening -- compare `clientAuth.js:16-25` to
  `frontend-v2/src/api/client.js:44-85`).
- **Risk: high** -- touches a live login flow
  (`backend/photographer_clients.py:254`) for real studio-issued
  accounts; merging identities that are only superficially similar (a
  self-serve buyer vs. a studio-issued per-wedding guest login) could be
  a genuine product-requirements mismatch, not a bug.
- **Effort:** medium if approved -- point `photographer_clients.py`'s
  login at `user_auth.py`'s cookie-setting code instead of
  `auth.create_client_token`.
- **Action:** flag for confirmation; do not merge without product
  sign-off that these are meant to be the same account concept.

---

## Tier 3 -- low risk, low effort, do opportunistically

### 6. Shared price-copy source for Faq.jsx / Landing.jsx -- (report item B)
- **Value: medium** -- marketing-copy correctness/trust; currently two
  static copies disagree with each other's cited source on Royal's price.
- **Risk: low** -- copy-only change, no logic touched.
- **Effort: low** -- one shared constants file (or drop specific figures
  in favor of a link to the live `/pricing` page). Rung 6 of the ladder;
  does not need a live API call for static SEO copy.

### 7. Legacy-frontend overlap cleanup -- (report item G)
- **Value: medium** -- pure maintenance/clarity; `frontend/` carries ~15
  pages that are fully superseded by `frontend-v2` equivalents with zero
  production traffic (see the route table in report item G).
- **Risk: low** -- confirmed dormant (`docker-compose.yml:124-129`,
  `run.ps1:72-81` never serve `frontend/`).
- **Effort: low-medium** depending on choice: delete superseded pages
  (lower long-term maintenance) vs. annotate each with a pointer to its
  `frontend-v2` replacement (safer if `frontend/` is intentionally kept
  as a build reference during an ongoing port -- confirm which before
  deleting).

### 8. Backport the `data:` URI guard into legacy `mediaUrl.js` -- (report item D)
- **Value: low** -- only matters if a legacy page still renders (it
  doesn't, currently).
- **Risk: none** -- one-line, isolated fix.
- **Effort: trivial** -- copy `frontend-v2/src/lib/mediaUrl.js:22-23`
  into `frontend/src/utils/mediaUrl.js`. Do only if `frontend/` is being
  kept around; otherwise moot.

### 9. Confirm the drive-archive job-loss-on-restart tradeoff -- (report item H)
- **Value: low-medium** -- an in-flight per-studio Drive archive job is
  silently dropped on every backend deploy/restart
  (`backend/drive_archive.py:17-18`'s `asyncio.Queue` has no persistence,
  unlike the Redis-backed `face_queue.py`).
- **Risk: low to check, medium to fix** -- checking is free (ask whether
  this was a deliberate scope-reduction or an oversight); fixing means
  moving drive-archive jobs onto the existing `worker.py` dispatch table
  (`backend/worker.py:104`) as a new job type, not building a second
  durable queue.
- **Effort: low to confirm, medium to fix** if the tradeoff turns out to
  be unwanted.

---

## No action needed

### Navigation factoring -- (report item C)
`frontend-v2`'s `RailNav`/`AdminNav`/`StudioNav`/`PixoraNav`/`MarketingNav`/
Landing-bespoke-nav split is already correctly factored (shared mechanics
in `RailNav.jsx`, intentional separation documented in-code at
`MarketingNav.jsx:5-9`). Nothing to unify inside `frontend-v2`; the only
nav-related action is part of item 7 above (legacy overlap), not a
separate nav-specific fix.

### `GuestInvitation`/`CeremonyInvitation` shared hook -- (report item E, v2-internal part)
Already unified via `useInviteFull.js`; `useEventInvitation.js`'s extra
call is a legitimate, documented specialization (per-ceremony QR-code
authoritative override), not divergence. No action.
