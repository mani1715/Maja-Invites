# Feature-Parity Audit — old `M04(Mani)` → new `MajaInvites`

Date: 2026-08-17 · New repo baseline: `fc4672e` · Old repo baseline: `maja-v2` @ `6546a54`

> **STATUS: remediated.** This document is the audit as originally found. Almost
> everything in sections A–E has since been implemented — see
> [`SESSION_CONTEXT.md`](../SESSION_CONTEXT.md) §0.0.73 for what shipped, what
> was deliberately not shipped (impersonation, the plan-price representation
> decision), and the bugs the work uncovered along the way. Kept as-written so
> the reasoning behind each decision stays auditable.

## Which "old repo" this compares against

`M04(Mani)` contains four folders. Three are near-copies of the same codebase:

| Folder | Git? | backend `.py` | Frontends | Verdict |
|---|---|---|---|---|
| `maja-v2` | yes (`6546a54`) | 154 | `frontend/`, `frontend-v2/` | **canonical — direct ancestor of the new repo** |
| `wedding-36` | yes (`67d7954`) | 152 | `frontend/` only | older snapshot |
| `logic` | no | 152 | `frontend/` only | copy, no history |
| `MAJA_V2_PLAN` | — | — | — | planning docs + recon |

Everything below compares **`maja-v2` → the new repo**.

## The one structural fact that explains this whole audit

The old product shipped on **`frontend/`** — a Create-React-App with 387 files and the complete feature set.
Old `frontend-v2/` was only a **40-file partial rebuild**, barely started.

The new repo carried `frontend/` over **byte-identical** (387 files, zero drift) as a non-deployed reference,
and shipped a **new `frontend-v2/` with 144 files** as the only deployed UI.

So the parity question is not "did the backend survive" — it did. It is:
**how much of the 387-file old UI got re-implemented in the 144-file new UI.**

That framing predicts the dominant finding, which is exactly what all eight audit agents independently converged on:

> **The backend is at or ahead of parity. The gaps are almost entirely "backend shipped, UI never wired up."**

## Headline numbers

| Layer | Old | New | Delta |
|---|---|---|---|
| Backend modules | 154 | 161 | +11 added, −4 removed |
| Backend routes | 997 | 982 | 44 old routes absent — **26 are the deliberate credits/user retirement** |
| Legacy CRA `frontend/` | 387 files | 387 files | identical, not deployed |
| Deployed UI | `frontend/` (387) | `frontend-v2/` (144) | **the real gap surface** |

Of 44 absent routes: 26 deliberate credit/user-account retirement, 5 from a dead prototype
(`invitation_v2.py`, never wired into any old UI — its removal is asserted by
`test_dead_surface_removal.py`), 9 renamed/superseded, **4 genuinely lost**.

---

# A. TRUE FUNCTIONAL GAPS — need a decision or new code

These are not "UI not built". The capability does not exist in the new repo at all.

### A1. Gift codes and referral rewards are a dead end — **product decision needed**
- Old: `POST /api/account/redeem-code` (`gift_code_routes.py`), `POST /api/account/redeem-referral` (`photographer_referrals.py`) — both granted credits to the redeemer (and to the referrer).
- New: super-admin can still **mint** gift codes and view a redemption log; photographers still get and rotate a `MAJA-XXXXXX` referral code. **No redemption endpoint exists.** Deliberate — `test_credits_retired.py` asserts it.
- Impact: live UI promises a reward that can never be claimed. Module docstrings in both files still document the deleted endpoints.
- **Decision required:** what does a code grant now that credits are gone — a free link, a % discount at checkout, storage bonus, or retire the surfaces entirely?

### A2. No refund capability for real money — **operational gap**
- Old `/refund` was credits-only (correctly dropped). But the new repo has **no refund endpoint of any kind**: zero `razorpay_client.payment.refund` calls anywhere in `backend/`.
- `disputes.py` records a `refunded` **status label** but moves no money. `super_admin_v2.py` still carries an orphaned `RefundRequest` model as dead code.
- Impact: every store-order / shagun / donation refund must be executed by hand in the Razorpay merchant dashboard, outside the product.

### A3. Bespoke invitation pipeline gone — **but still being sold**
- Old had a real hand-authored pipeline: `frontend/src/invitations/kit.js`, per-couple JSX folders (`meera-kabir`, `riya-aarav`), `GeneratedInvitationRoute` with per-invitation expiry and code-split chunks, plus a `new-invitation.mjs` scaffolder.
- New's only invite route is the generic templated `/invite/:slug` → `GuestInvitation.jsx`. The old pattern survives only in the undeployed legacy frontend.
- **The tier is still priced and marketed**: ₹9,999 "Bespoke — dedicated designer, white-glove concierge" in `Landing.jsx`, `pricing_public.py`, `store_features.py`; `order_to_invitation.py` still maps `bespoke → PLATINUM`.
- **Decision required:** rebuild the pipeline, or reword/retire the tier. Selling it as-is is an undeliverable promise.

### A4. Six payment flows have no webhook settlement — **money-loss risk**
Not strictly a regression (old only had a webhook for credit packs, now retired), but the new repo's own
`event_payments.py` documents the pattern and only 2 of 8 flows use it.

| Flow | Webhook | Failure when the browser dies after Razorpay captures |
|---|---|---|
| Store orders | yes | — |
| Event purchase | yes | — |
| **Subscriptions** | **no** | studio paid, plan never activates — *highest value, core recurring revenue* |
| Event donations | no | captured, stays `pending`, no receipt |
| Link reactivation | no | paid, link stays expired |
| Studio storage | no | paid, storage cap never raised |
| Portfolio build-help | no | paid, stays locked (does land in reconcilable `event_orders`) |
| Shagun / premium | no | guest's gift never appears (per-photographer keys make this harder) |

Recovery today = support ticket + manual DB patch. Fix: a signed webhook per flow, or one periodic reconcile sweep over `pending` rows using `order.fetch`.

### A5. Per-ceremony URLs lost their unique slug
- Old: `GET /invite/{slug}/event/{event_slug}` addressed a ceremony by a random-suffixed unique slug (e.g. `marriage-a1b2c3d4`).
- New: `GET /invite/{slug}/{event_type}` addresses by enum type. `WeddingEvent.slug` is still generated and stored but **never read anywhere** — dead data.
- Two consequences: (a) you can no longer have two events of the same type (creation now enforces one-per-type), (b) ceremony URLs are guessable/enumerable rather than opaque.

### A6. Small cosmetic customizations dropped
Per-invite `accent_color`; closing-section `closing_text` / `closing_animation_id` / `closing_signature`;
per-section background overrides (`comments_background_url`, `stay_background_url`); admin-editable micro-copy
(`stay_intro`, `qr_pre_event_text`, `ai_match_pre_event_text`, `directions_label`). These are now baked into the
design template or hardcoded. Low priority, but they were host-editable before.

---

# B. GUEST-FACING: invitation sections the backend serves but the new UI never renders

`GET /invite/{slug}/full` returns every field below. `GuestInvitation.jsx` (647 lines, vs the old
`LuxuryPublicInvitation.jsx` at 1901 lines) does not render them.

| Section | Backend field / route (present) |
|---|---|
| About the couple | `about_couple` |
| Family details | `family_details` |
| Bride / groom individual bios | `bride_about`, `groom_about` |
| Pre-wedding shoot | `pre_wedding_links` |
| Save-the-date video | `video_link` on `celebrant_info` |
| Live stream | `live_stream` (`LiveStreamSettings`) |
| Song requests | `song_requests_settings` (API live, has tests) |
| Guest check-in | `check_in` |
| Contact info (family phone/email) | `contact_info` |
| Parking info | `MapSettings.parking_info` |
| Guest rooms / "Find my room" | `guest_rooms` + `GET /invite/{slug}/room-lookup` — **works, richer than old** |
| Honeymoon fund | `honeymoon_fund` |
| Travel links | `premium_features.py` |
| Ambient background music | `background_music` |
| Add to calendar | no backend needed — pure client, zero code in `frontend-v2` |

Partial: hero is a static "tap the seal" gate (old had a cinematic curtain); events timeline lost its
live NOW/NEXT badges; food-donation is a standalone page instead of an inline scroll section.

Where the new UI is **ahead** of old: face-search flow (consent + polling + "ask the studio" fallback),
live photo wall (WebSocket retry/backoff + polling fallback + filters + favoriting + lightbox),
RSVP captcha, per-ceremony invitation pages, Razorpay-backed shagun checkout.

---

# C. COUPLE PORTAL — the densest cluster of unwired backend

Old `ClientDashboard.jsx` had 5 tabs. New `CoupleAccess.jsx` has roughly 2.

| Capability | Backend in new repo | UI |
|---|---|---|
| Contracts + e-sign | `GET /api/client/contracts`, `POST /contracts/{id}/sign` (`client_studio_service.py`) | **missing** |
| Proofing / select favorites / print orders | `GET /api/client/proofing`, `POST /photos/{id}/select`, `POST /print-orders` | **missing** |
| RSVP list + CSV export | `GET /api/client/rsvps`, `/rsvps/stats`, `/rsvps/export` (`photographer_clients.py`) | **missing** |
| Detailed analytics (opens over time, devices, click tracking) | `GET /api/client/analytics` | **missing** |
| Wish moderation (approve / feature / delete) | `POST/DELETE /api/client/wishes*` | read-only list |

New additions the old portal lacked: gallery preview grid, shagun total received, days-to-go.

---

# D. STUDIO PANEL — missing UI, backend intact

Ranked by how often a working photographer would hit it.

1. **Gallery upload-method configuration** — Phone Live Mode QR + 24h token regenerate, WiFi SD-card POST URL, DSLR tether toggle, guest-contribution toggle. New page shows the four method names as **static non-interactive chips**. Backend: `gallery_features.py` `PATCH .../upload-methods`, `.../regenerate-token`, `.../credentials`. *This is how photographers get event-day photos in without a laptop — likely the single most impactful gap.*
2. **Gallery password / privacy admin** — set password, trusted devices, reset code, force-logout, unlock analytics. Backend `gallery_privacy.py` fully intact; `api/gallery.js` only calls the **public** read endpoint. A trust feature that is silently non-functional for studios.
3. **Cloud backup: upload, folder management, zip download** — the page can browse/delete/restore but there is **no way to put a file in**. `backupFolders`/`backupCreateFolder`/`backupDeleteFolder` exist in `api/studioOps.js` as **dead exports** never imported. Backend `cloud_backup_service.py` intact.
4. **Portfolio album / work management** — add-delete albums, add-delete-feature individual photos and videos. `StudioPortfolio.jsx:687` literally says *"Full album management is not on this page yet."* Backend `portfolio_service.py` intact.
5. **Post-wedding "Thank You" editor** — text/video gratitude note, scheduled. Backend `PUT /api/admin/profiles/{id}/thank-you` intact, zero UI.
6. **Per-guest voice invitation** — `POST/DELETE .../guests/{id}/voice` routed, no caller.
7. **Gallery settings tab** — auto-delete date, Rekognition collection id, usage-by-method breakdown.
8. *Nit:* `/studio/pixora-analytics` redirects to `/studio/insights`, a **different** feature. The real panel is at `/studio/pixora?group=studio_tools&panel=analytics`.

Confirmed at parity or better: wedding wizard, guest list + CSV + WhatsApp, RSVP, wishes/greetings moderation,
wedding album, QR codes, gallery upload (now direct-to-S3 with per-photo status), client access + budget, staff +
ownership transfer, calendar, earnings, digital shagun, Pixora hub (verbatim 8-group/46-panel port), security,
audit logs, white-label. New-only: `StudioInsights.jsx`, `StudioAiTools.jsx` (old had `AIStudio.jsx` but never routed it).

---

# E. SUPER-ADMIN CONSOLE — missing UI, backend intact

No capability was dropped outright. Seven clusters of live endpoints have **zero call-sites** in `frontend-v2`:

1. **Founding-100 pricing controls** — `founding_admin.py` (status / settings / apply-catalogue / per-tier price). Old had a dedicated 239-line page; the public pricing page already reads founding state.
2. **MFA enroll/verify/disable + impersonation** — `admin_security.py`. Old's `SuperAdminSecurity.jsx` had full UI; new's `AdminAccessControl.jsx` does RBAC only and comments that impersonation is "deliberately NOT wired up". A security-admin regression.
3. **Create / block / suspend a studio** — `POST /api/super-admin/admins`, `PUT .../{id}/status`. New's `AdminDashboard.jsx` is read-only *by its own code comment*.
4. **Studio cloud-storage plan management** (INR) — plan CRUD, enable toggle, subscriber list (`studio_storage.py`).
5. **Pricing hub — 6 of 8 endpoint groups unused** — categories, feature-packs, link-durations, campaigns, plans, community, simulator. Only `pricing/designs` is wired.
6. **`super_admin_v2.py` cluster** — platform settings, homepage CMS editor, theme rollout, broadcast messages, coupons, admin login-history.
7. **BI overview** — `GET /api/admin/bi/overview` (cohorts, funnel, referrals, coupon redemptions) entirely unused; `AdminBI.jsx` only uses the separate revenue endpoints.

Also: no platform-wide audit-log view — the only consumer, `StudioAuditLogs.jsx`, is scoped to the studio panel.

At parity: fulfillment, build queue, face ops, moderation + auto-moderation, disputes, support, QR analytics,
system health, investigation, feature flags, delivery, profitability, storage pool, feature wishes.
New-only: food donation admin, marketplace/approvals, events module config.

---

# F. CONFIRMED NOT GAPS

- **Credits** — wallet, packs, ledger, credit-priced catalogues, `redeem` grants. Deliberate; `test_credits_retired.py` enforces it by walking real routers.
- **Normal user accounts** — `/api/users/*` → 410, User Dashboard retired. Deliberate.
- **`invitation_v2.py`** — comments + viewer-config prototype, never referenced by any old UI. Real equivalents (`greetings`, `guest_wishes`, `Profile.sections_enabled`) existed in old and carried over. Only loss: no atomic `section-toggle` endpoint; the client resends the whole profile to flip one flag.
- **Add-ons / design-pricing / expiry-tiers** — all present, renamed, and ₹-denominated: `store_features.py` (broader SKU set), `pricing_hub_service.py` + `pricing_public.py`, `link_duration_tiers` + a genuinely new `link_reactivation.py` (pay-per-day revival of expired links).
- **Legacy `/payments/*`** — was broken in the old repo too (`current_admin` annotated `dict` but returns `str` → 500 on every call) with zero frontend callers. Correct deletion.
- **`SuperAdminPricingHub.jsx` calling the 410'd router** — exists only in the undeployed legacy `frontend/`. Deployed `frontend-v2` uses `AdminPricing.jsx` and deliberately avoids that surface.
- **System-level architecture** — Ganesh/Dynamic Event Engine (schema, registry, lifecycle, RBAC, children, media, finance, members, ≤8-login money portal, notifications, translation, same `ganesh_module_enabled` flag), Pixora conformance items, SEO/discovery (sitemap, robots, JSON-LD, crawler routing, `check_seo_routes.py`), multi-drive storage + S3/CloudFront, Rekognition face match + self-hosted fallback, fulfillment console — **all present**.
- Most gaps the *old* repo's own audits flagged have since been **built** in new: BI/MRR, support tickets, system health, staff accounts + ownership transfer, 2FA, DMs, disputes, auto-moderation, bulk moderation, user investigation, CI, Sentry, cookie consent.

---

# G. Recommended sequence

**Decide first (cannot be coded around):**
- A1 — what a gift code / referral grants post-credits
- A3 — rebuild bespoke pipeline, or reword the ₹9,999 tier

**Then, highest value per unit of work:**
1. A4 — webhook or reconcile sweep for the 6 unsettled payment flows (start with subscriptions)
2. C — couple portal: contracts, proofing, RSVP export (5 live APIs, no backend work)
3. D1 + D2 — gallery upload-methods config and privacy admin (event-day critical)
4. B — invitation sections; they are pure render work against fields already in the payload
5. D3–D7 — backup upload/folders, portfolio albums, thank-you editor, voice invites
6. E — super-admin: founding pricing, MFA/impersonation, studio block/suspend
7. A2 — refund endpoint
8. A5, A6 — ceremony slug addressing, cosmetic customization fields

The overwhelming majority of this is **frontend wiring against APIs that already exist and are tested** —
not new system design.
