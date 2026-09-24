# Guest Invitation Page

Route: `/invite/:slug`
Source: `frontend-v2/src/pages/GuestInvitation.jsx`, `GuestInvitation.css`, `styles/inviteShared.css`
Auth: public (no login) — a decorative "seal" gate only, not a real access control

## Overview

The full public wedding/celebration invitation a guest opens from a shared link. Renders the couple's story, event timeline, dress code/FAQ, photo gallery, digital shagun/gift registry, RSVP form, and a guest wishes wall, all driven by one envelope call (`GET /api/invite/{slug}/full`). Every section is conditionally rendered based on flags in that envelope (`sections_enabled`), so the page's actual visible shape varies per invitation/plan.

## Layout

1. **Decorative "seal" gate** (`gateOpen`, local UI state only) — a tappable wax-seal button ("Tap the seal to open"); tapping it reveals a decorative "passcode" input (any 4+ characters accepted) before revealing the page content underneath. This is **not** a real security gate — `/invite/{slug}/full` carries no passcode check today; it exists purely for the "wax-seal opening" ritual UX described on Landing.
2. **Hero** — kicker "You are invited ✦", couple names, event date, venue line, directions/share links (from `venues.main_venue.links`), a live countdown (days/hours/mins/secs, shown only if `sections_enabled.countdown` and the invite hasn't passed), an "RSVP now" anchor button (only if `sections_enabled.rsvp`), and a scroll hint.
3. **Story section** — a pull-quote from `love_story` or fallback `invitation_message` (only if `sections_enabled.love_story !== false` and either field is present).
4. **Event timeline** — a card grid of every enabled event (`events[].enabled !== false`), each showing date/time, name, venue name, and directions/share links (only if `sections_enabled.events !== false` and at least one enabled event exists).
5. **Dress code + FAQ split** — left column: dress-code title + itemized list (label + optional notes) or an empty-state note if no items; right column: "Good to know" FAQ card list (question/answer pairs) or an empty-state note. Section renders only if dress code is enabled or `faq_settings.enabled`.
6. **Gallery preview** — up to 12 photos from `invite.media` (filtered to `media_type === 'photo'`), or 6 empty placeholder tiles if there are none; a "Add your photos →" link to the live gallery route, shown only if `gallery_info.enabled`. Section renders only if `sections_enabled.photos !== false`.
7. **Shagun / gifts section** (`#gifts`) — renders only if shagun is enabled or a `gifts` response was returned. Shows a headline/body (from `gifts.headline`/`shagun.blessing_message`/fallback copy), suggested-amount pills + "Send shagun" button (only if `shagun_enabled`), and, if `gifts.enabled`, a gift block (UPI ID + copy button, masked bank details, external registry link, gift-suggestion chips).
8. **RSVP section** (`#rsvp`) — renders only if `sections_enabled.rsvp`. Name, phone, optional allergies field (if `rsvp_settings.allergies_enabled`), a set of status buttons (with an extra "Yes, with my partner" option if `rsvp_settings.plus_one_enabled`), an adaptive CAPTCHA step, and a success state.
9. **Wishes wall** — renders unless `sections_enabled.greetings === false`. Lists existing wishes (from the envelope's `wishes[]`) and a submission form (name + message).
10. **Footer** — sign-off with the couple's names, links to Save the Date and the Live Photo Wall, a "Digital shagun" anchor link (if the shagun section is showing), and an "Invitation by MAJA" credit.

## Fields

**RSVP form:**

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Guest name | text input | Yes | non-empty after trim | `''` | |
| Guest phone | text input | Yes | non-empty after trim (no format regex) | `'+91'` | |
| Allergies | text input | No | — | `''` | Only shown/sent if `rsvp_settings.allergies_enabled` |
| RSVP status choice | button group (single-select) | Yes | must pick one before submit is enabled | none selected | Base options: `Yes, with joy` (`yes`), `Regretfully no` (`no`), `Trying my best` (`maybe`); a 4th option `Yes, with my partner` (`yes` + `plusOne: true`) appears if `rsvp_settings.plus_one_enabled` |
| CAPTCHA answer | text input | Yes, only when a CAPTCHA challenge is issued | — | `''` | Shown only in the `captcha` submit-status state |

**Wishes form:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Guest name | text input | Yes (HTML `required`) | non-empty after trim | `''` |
| Message | textarea | Yes (HTML `required`) | non-empty after trim | `''` |

**Shagun modal:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Suggested amount | button group (single-select) | No (has a default) | — | `shagun.suggested[1].amount` or `[0].amount` or `0` |
| Guest name | text input | Yes (checked in-code before send) | non-empty after trim | `''` |
| Custom amount | number input | No | overrides the selected pill if provided; must resolve to ≥ 1 | `''` |
| Message (blessing) | textarea (2 rows) | No | — | `''` |

**Decorative gate:** passcode text input — free text, accepted once length ≥ 4 (no real validation, purely a UX beat).

## Interactions

| Trigger | Behavior |
|---|---|
| Tap the wax seal | Reveals the decorative passcode input (`needsPasscode = true`) |
| Submit decorative passcode | If trimmed length ≥ 4, closes the gate (`gateOpen = false`); otherwise shows "Just a few more characters." and keeps the gate open |
| Countdown reaches zero | `countdown.elapsed` becomes true and the countdown block hides |
| Click an RSVP status option | Sets the chosen option as `choice` (highlighted) |
| Submit RSVP form | Requires `choice`, `name`, `phone` all present; builds payload (`guest_name`, `guest_phone`, `status`, `guest_count: 1`, optional `plus_one: true`, optional `allergies`) and calls the shared RSVP submit hook |
| RSVP hook returns `captcha` status | Shows a math-style challenge (`captcha.challenge`) + answer input + "Verify & send RSVP" button in place of the normal submit button |
| Click "Verify & send RSVP" | Resubmits the original payload with `captcha.challenge_id` and the typed answer |
| RSVP submission succeeds | Shows a thank-you success panel in place of the form |
| Click a suggested shagun amount | Highlights it and sets it as the pending amount |
| Click "Send shagun" | Opens the shagun modal, pre-filled with the currently selected suggested amount |
| Shagun modal: click UPI direct-pay button | Validates name + amount; on pass, best-effort records the shagun via `recordShagun` (failure is silently ignored — "still let them pay"), then redirects the browser to a `upi://pay?...` deep link |
| Shagun modal: click Razorpay button (only shown if `shagun.razorpay_enabled`) | Validates name + amount; lazy-loads the Razorpay checkout script if not already present; creates a server-side order via `createShagunRazorpayOrder`; opens the Razorpay modal; on the payment handler callback, calls `verifyShagunRazorpay` with the returned signature fields — success shows "Blessing received with love.", failure shows "Payment went through but verification failed. We will follow up." |
| Copy UPI ID / bank details | Copies to clipboard via `navigator.clipboard.writeText`; shows "Copied" for 1.6s (silently no-ops if the Clipboard API is unavailable) |
| Submit wishes form | Requires name + message non-empty; on success, if the response's `status === 'approved'`, prepends the wish to the visible list immediately; otherwise shows a "your blessing is awaiting a quick review" pending note. Either way the form fields are cleared |
| Wishes submission fails | Shows the backend's `detail` or a generic error note, form fields are **not** cleared |
| `useInviteFull` returns a non-`ready` status | Renders `InviteStateScreen` instead of the invitation body — see states below |

## API Dependencies

| Action | Method & Endpoint | Module / Hook | Notes |
|---|---|---|---|
| Load the invitation envelope | `GET /api/invite/{slug}/full` | `api/invitations.js` `getFull()` via `lib/useInviteFull.js` | Drives `status`: `loading` → `ready` \| `not_found` (404) \| `expired` (410) \| `locked` (401/403 — not observed to occur for this endpoint today) \| `error` |
| Passcode retry (defensive) | `GET /api/invite/{slug}?passcode=` | `api/invitations.js` `getBySlug()` via `useInviteFull`'s `retry(passcode)` | Wired for a `locked` state that the current backend doesn't actually produce for this endpoint; kept for forward-compatibility |
| Load gift registry | `GET /api/invite/{slug}/gifts` | `api/invitations.js` `getGifts()` | Fired on mount once `env` is available; failure sets `gifts = null` (section still renders based on `shagunEnabled` alone) |
| Submit a wish/blessing | `POST /api/invite/{slug}/wishes` | `api/invitations.js` `submitWish()` | Goes to `db.guest_wishes` (auto-approved path), distinct from `/greetings` (moderation-gated, different collection) |
| Submit RSVP | `POST /api/rsvp?slug=...&captcha_id=...&captcha_answer=...` | `api/invitations.js` `submitRsvp()` via `lib/useRsvpSubmit.js` | `slug`/`captcha_id`/`captcha_answer` are query params, not body fields |
| Generate CAPTCHA challenge | `POST /api/captcha/generate` | `api/invitations.js` `generateCaptcha()` | Fired only after a `captcha`-classified RSVP error |
| Record shagun (UPI path) | `POST /api/invite/{slug}/shagun/record` | `api/invitations.js` `recordShagun()` | Best-effort, unverified — only a blessing-counter record; failure does not block the UPI deep link |
| Create Razorpay order for shagun | `POST /api/invite/{slug}/shagun/razorpay/order` | `api/invitations.js` `createShagunRazorpayOrder()` | |
| Verify Razorpay shagun payment | `POST /api/invite/{slug}/shagun/razorpay/verify` | `api/invitations.js` `verifyShagunRazorpay()` | Called from the Razorpay `handler` callback with `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature` plus the original amount/name/message |

## Page Relationships

**Links out to:**
- `/save-the-date/{slug}` (footer)
- `/invite/{slug}/live-gallery` (gallery section CTA + footer)
- `#gifts`, `#rsvp` (in-page anchors)
- External: Google Maps directions links, WhatsApp share links (from `venues` data), `upi://pay` deep link, Razorpay checkout modal (external script)

**Linked from:** shared invitation links (WhatsApp/SMS/email/printed QR), Save the Date page (implicitly, once the full invite is ready), Ceremony Invitation's "Full invitation" nav link and "See the full wedding invitation" footer link, Live Photo Wall gate copy ("locked"), Guest Arrival's "Open the invitation" button.

## Business Rules

- The wax-seal/passcode gate is decorative UX only, not an access-control mechanism — the underlying `/full` data has already loaded before the gate is even shown.
- Section visibility is driven by `invite.sections_enabled` flags baked in at profile-build time server-side; the frontend does not independently decide what's "included" in a plan.
- The wishes system has two parallel backend collections: `/wishes` (auto-approved, feeds this page's wall) vs. `/greetings` (pending-by-default, a separate moderation-gated collection) — this page deliberately submits to `/wishes` so a guest's blessing appears immediately rather than silently landing somewhere else.
- The public gift view (`GET /gifts`) is a masked, server-redacted document (bank digits redacted) — it is a materially different shape than the unmasked `gifts` field that may exist on the `/full` envelope for admin use; the page must render from the `/gifts` call, not the envelope's raw field.
- RSVP is rate-limited and adaptively CAPTCHA-gated by the backend; the frontend must be prepared to re-submit the same payload with a CAPTCHA answer on a `400`-with-captcha-language response, and to show a distinct message on `429`.
- The countdown, when shown, is a pure client-side ticking clock against `event_date` — never re-verified against the server between renders.
- Digital shagun has two independent payment paths that can both be available simultaneously: a raw `upi://pay` deep link (works without any payment gateway integration) and a Razorpay-hosted checkout (requires `shagun.razorpay_enabled`); a guest may use either.
