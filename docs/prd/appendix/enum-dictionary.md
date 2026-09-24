# Enum Dictionary

Every enum below is grounded in code with a `file:line` citation. Where two systems define
overlapping-but-not-identical values (e.g. two "package" concepts, two "status" concepts), both
are listed separately rather than merged — merging them would be a guess. Anything whose
business meaning couldn't be pinned down from the code alone is marked **[TBC]**.

## Design & content

### Design theme (`THEME_ABBR`)

Source: `frontend-v2/src/lib/designCode.js:8-19`. The 4-letter code is the first segment of a
design's public-facing code (`<THEME4>-<EVENT3>-<NN>`).

| Code | Theme ID | Label [TBC — display label not in this file, inferred from id] |
|---|---|---|
| `TMPL` | `south_indian_temple` | South Indian Temple |
| `MUGH` | `royal_mughal` | Royal Mughal |
| `BENG` | `bengali_traditional` | Bengali Traditional |
| `PUNJ` | `punjabi_sangeet` | Punjabi Sangeet |
| `KERL` | `kerala_backwaters` | Kerala Backwaters |
| `CHRS` | `christian_elegant` | Christian Elegant |
| `MSLM` | `muslim_nikah` | Muslim Nikah |
| `BEAC` | `beach_destination` | Beach Destination |
| `NATR` | `nature_eco_wedding` | Nature / Eco Wedding |
| `MNML` | `modern_minimal` | Modern Minimal |

### Ceremony event type (`EVENT_ABBR`)

Source: `frontend-v2/src/lib/designCode.js:21-28`. The 3-letter code is the second segment of a
design code. This is the same value the `:eventType` route param on
`/invite/:slug/:eventType` (`CeremonyInvitation` page) and `getEventInvitation(slug, eventType)`
(`frontend-v2/src/api/invitations.js:18-19`) take.

| Code | Event type |
|---|---|
| `ENG` | Engagement |
| `HAL` | Haldi |
| `MEH` | Mehandi |
| `MRG` | Marriage |
| `REC` | Reception |
| `SNG` | Sangeeth |

**[TBC]** Whether `event_type` on a store order (`CreateOrderRequest.event_type`,
`backend/store_features.py:394`) is validated against this same 6-value set or accepted as free
text — the Pydantic field is a bare `Optional[str]` with no `Literal`/enum constraint in
`store_features.py`.

## Pricing & checkout

Two pricing models coexist in `backend/store_features.py` — the legacy ceremony-package model
(what a design code's price historically meant) and the current à-la-carte model (what the live
cart in frontend-v2 actually charges). A third, feature-flagged "unified pricing engine" is a
work in progress. All figures are DEFAULTS — every one is admin-editable in the Pricing Hub
(`db.store_packages` / `db.store_addons` / `db.store_features` / `db.store_languages`) and the
defaults below only apply until an admin edits them.

### Legacy ceremony packages (`PACKAGES`)

Source: `backend/store_features.py:49-54`. Still accepted by `CreateOrderRequest.package`
(default `"premium"`) for backward compatibility; not what `Cart.jsx`/`Checkout.jsx` send today
(see à-la-carte below).

| Key | Label | Ceremonies covered | Price (English / Regional, INR) |
|---|---|---|---|
| `classic` | Classic | 1 | 1,499 / 1,499 |
| `premium` | Premium (default, featured) | 3 | 2,999 / 2,999 |
| `royal` | Royal | Unlimited | 4,999 / 4,999 |
| `bespoke` | Bespoke | Unlimited | 9,999 / 9,999 |

Legacy package language (`CreateOrderRequest.language`, default `"english"`):
`english` | `regional` (`backend/store_features.py:56`).

### À-la-carte features (`FEATURES`) — the live cart model

Source: `backend/store_features.py:85-118`. Total = design price + every paid feature picked +
every extra language. A handful ship free with every design; the buyer's main language is free.

**Included free with every design:**

| Key | Label |
|---|---|
| `rsvp` | RSVP & guest replies |
| `timeline` | Event timeline |
| `family_details` | Family details |
| `countdown` | Countdown to the day |
| `maps` | Venue map & directions |
| `music` | Background music |

**Priced individually (INR):**

| Key | Label | Price |
|---|---|---|
| `qr_live_gallery` | Live photo gallery (QR) | 999 |
| `guest_uploads` | Guest photo uploads | 499 |
| `enhanced_gallery` | Enhanced gallery layouts | 699 |
| `ai_face_match` | Get-Your-Photos (guest photo requests) | 1,499 |
| `selfie_search` | Selfie search for guests | 999 |
| `custom_video` | Custom video (AI) | 2,999 |
| `custom_video_editing` | Custom video editing (studio) | 9,999 |
| `premium_delivery` | Priority delivery | 999 |
| `premium_support` | Dedicated support | 499 |
| `guest_cab_booking` | Guest cab booking (Ola / Rapido / Uber) | 699 |

### Legacy add-on bundle (`ADDONS`)

Source: `backend/store_features.py:58-63`. Overlaps in purpose with the à-la-carte `FEATURES`
above (e.g. `live_gallery` ≈ `qr_live_gallery`) — kept as a separate catalogue for the legacy
package-based checkout path.

| Key | Label | Price (INR) |
|---|---|---|
| `live_gallery` | Live Photo Gallery | 999 |
| `ai_face_match` | Get-Your-Photos (guest photo requests) | 1,499 |
| `custom_video` | Custom Video (AI) | 2,999 |
| `custom_video_editing` | Custom Video Editing (Studio) | 9,999 |

### Language catalog — à la carte (`LANGUAGE_CATALOG`)

Source: `backend/store_features.py:121-136`. Default main language: `english`. Every language
below costs ₹499 as an *additional* language; the buyer's chosen main language is free.

| Key | Label |
|---|---|
| `english` | English |
| `telugu` | Telugu |
| `tamil` | Tamil |
| `hindi` | Hindi |
| `kannada` | Kannada |
| `malayalam` | Malayalam |
| `marathi` | Marathi |
| `bengali` | Bengali |
| `gujarati` | Gujarati |
| `punjabi` | Punjabi |

Deliberately **not** sold: `odia`, `urdu` — the invitation builder
(`order_to_invitation.RENDERABLE_LANGUAGES`) can't render either yet, so selling them would take
payment for a language that silently gets dropped at build time (`backend/store_features.py:132-135`).

### Unified pricing engine v2 — feature packs (`feature_pack_key`)

Source: `backend/store_features.py:407`, gated by the `new_pricing_enabled` app setting
(`backend/store_features.py:644-668`). Only active when the flag is on **and** the order carries
both `feature_pack_key` and `duration_id` — otherwise checkout falls back to à-la-carte or the
legacy package quote.

| Key | Meaning |
|---|---|
| `celebration` | [TBC — tier name only, pricing/scope resolved via `pricing_engine.quote_wedding`, not in `store_features.py`] |
| `signature` | [TBC — same] |
| `royal` | [TBC — same] |

### Order status (`invitation_orders.status`)

Source: `backend/store_features.py:760` (set at `create_order`) and the `verify_order` handler.

| Value | Meaning |
|---|---|
| `created` | Razorpay order created, payment not yet confirmed |
| `paid` | Payment signature verified (or a test-account free-claim bypass) |

No persisted `failed` state was found — a failed signature verification (`400 "Payment
signature verification failed"`, `backend/store_features.py:805`) simply leaves the order at
`created` rather than writing a terminal failure status.

### Order build status (`invitation_orders.build_status`)

Source: `backend/store_features.py:761` (comment states the full lifecycle explicitly).

| Value | Meaning |
|---|---|
| `awaiting_payment` | Order created, payment not yet confirmed |
| `pending_info` | Paid; waiting on the buyer's wedding-detail submission (`OrderDetails` page) |
| `building` | Studio has accepted the request and is building the invitation |
| `delivered` | Invitation published and linked back to the order (`profile_id` set) |

## Auth & admin

### Admin role (`AdminRole`)

Source: `backend/models.py:545-548`.

| Value | Meaning |
|---|---|
| `super_admin` | Platform owner — full control |
| `admin` | Photographer/studio — limited to their own data |

### Admin status (`AdminStatus`)

Source: `backend/models.py:551-555`. Checked at login (`backend/server.py:1112-1122`) — a
`suspended` or `inactive` account gets a `403` before password/MFA is even evaluated further.

| Value | Meaning |
|---|---|
| `active` | Normal, can sign in |
| `suspended` | `403 "Account suspended. Please contact support."` |
| `inactive` | `403 "Account inactive. Please contact support."` |

### Wedding/profile internal lifecycle (`WeddingStatus`) [TBC — reconciliation with dashboard filter below]

Source: `backend/models.py:558-563`. This is the model-level enum; see the next table for the
*different* string set the Studio Dashboard's own status filter actually uses — the two appear
related but were not confirmed to be the same values.

| Value | Meaning |
|---|---|
| `draft` | Unlimited edits, no credit consumption |
| `ready` | All required fields filled, ready to publish |
| `published` | Credits consumed, publicly accessible |
| `archived` | Public link disabled, no refunds |

### Studio Dashboard profile-list status filter

Source: `backend/admin_dashboard_v2.py:95-96` (`GET /api/admin/profiles/paginated`, called by
`studio.listProfiles` in `frontend-v2/src/api/studio.js:11-12`, used on the Studio Dashboard page).

| Value | Meaning |
|---|---|
| `all` | Every non-deleted, non-archived-tab profile (default) |
| `draft` | Not yet published |
| `published` | `status == "PUBLISHED"` **or** `is_published == true` (both checked — a link delivered via fulfillment can carry `is_published` without the status field, `admin_dashboard_v2.py:109-114`) |
| `expiring` | [TBC — filter branch not read in this pass] |
| `archived` | `archived_at` set |
| `trash` | `deleted_at` set (soft-deleted) |

### Studio Dashboard profile-list sort

Source: `backend/admin_dashboard_v2.py:97-98`.

`newest` (default) | `oldest` | `date_asc` | `date_desc` | `most_viewed` | `name_asc`

### Login/session error codes

Source: `backend/server.py` (admin login handler).

| HTTP status | `detail.code` | Meaning | Citation |
|---|---|---|---|
| 401 | *(plain string, no code)* | `"Incorrect credentials"` | `server.py:1106-1109` |
| 403 | *(plain string)* | Account suspended | `server.py:1112-1116` |
| 403 | *(plain string)* | Account inactive | `server.py:1118-1122` |
| 401 | `MFA_REQUIRED` | Admin has MFA enabled; login needs a TOTP/backup code | `server.py:1131` |
| 401 | `MFA_INVALID` | Submitted TOTP/backup code didn't verify | `server.py:1141` |
| 429 | *(plain string, `Retry-After` header)* | Too many login attempts (IP or account backoff) | `server.py:1043-1060` |

`AuthContext.login()` (`frontend-v2/src/context/AuthContext.jsx:107-119`) unpacks both the
object-shaped `{code, message}` detail (MFA cases) and the plain-string detail (everything else)
into a single `{success:false, error, code, status, retryAfter}` shape.

### Face-match consent

Source: `backend/gallery_features.py:534-541`, `backend/face_consent.py`.

| HTTP status | `detail.code` | Meaning |
|---|---|---|
| 428 | `CONSENT_REQUIRED` | No valid (non-withdrawn, ≤90-day-old) consent on file for this (gallery, guest-IP) pair — must call `faceConsent(slug, agreed=true)` before `faceSearch` will process a selfie |

Consent state is a boolean pair (`agreed`, `withdrawn_at`), not a multi-value enum: a record
counts as valid consent only while `agreed == true` **and** `withdrawn_at` is unset, within a
90-day window (`face_consent.py:43-52`). Withdrawal (`face_consent.py:99-114`) is public and
IP-keyed — no login needed to withdraw consent already given from that IP.

### Per-ceremony invitation errors

Source: `frontend-v2/src/api/invitations.js:10-17` (comment), cross-referencing
`backend/server.py:5332`'s `get_event_invitation`. Returned by
`GET /api/invite/{slug}/{eventType}`.

| HTTP status | Meaning |
|---|---|
| 400 | Unknown `eventType` |
| 404 | No `event_invitations` row for this slug/event and no matching legacy event ("not found in this invitation") |
| 404 | A matching row exists but is explicitly disabled or expired ("... is not available") |
| 410 | The invitation's **profile-level** link (not this ceremony specifically) has expired |

## Not covered by this pass

`docs/API_SURFACE.md` enumerates far more status/role/tier vocabularies across the 181
namespaces frontend-v2 doesn't touch (Pixora, super-admin pricing tiers, subscription plans,
credit packages, founding-member pricing, etc.) — out of scope here; see the README's
"Legacy-only surfaces" table. Only enums reachable from code frontend-v2 actually calls, or from
files the task named directly (`store_features.py`, `designCode.js`), are listed above.
