# Sign Up Page

Route: `/auth/signup`
Source: `frontend-v2/src/pages/SignUp.jsx`, `AuthSplit.css`, `SignUp.css`
Auth: public (this IS the account-creation surface)

## Overview

A phone/email OTP-gated account creation flow serving the same two personas as Sign In — couples and photographer studios — via a persona tab, since the M12 design system has no separate couple-signup screen. The flow is 3-step: fill the form → verify a one-time code → account created (auto-redirect to the relevant dashboard). Studios additionally get a slugified `username` generated client-side from their studio name.

## Layout

Two-column "auth split" layout (wider card variant, `mj-auth-card--wide`):

1. **Left panel** — brand link, a headline that switches by persona, a perks list (4 bullet points, persona-specific), and a footer note "Free to start. No card required."
2. **Right panel — auth card**, one of three steps:
   - **`form` step:** persona tabs (only shown at this step); H1 + subhead (persona-specific copy); persona-specific name field(s) — Studio name + City for studios, "Your name" for couples; Work/plain email field; Mobile field; Password field with a 4-bar strength meter and strength label; inline error banner; Terms/Privacy checkbox with links (currently pointing at `/soon?f=Terms` / `/soon?f=Privacy` "coming soon" placeholders); submit button ("Create studio account" / "Create account"); footer "Already have a[n account/studio]? Sign in" link.
   - **`otp` step:** "← Edit details" back button; H1 "Verify your email/phone"; info text showing where the code was sent (or the backend's own message); a dev-mode-only code hint (`devOtp`, shown when the backend echoes the OTP in non-production); 6-digit code input; inline error banner; submit button ("Verify & create account" / "Creating studio…" / "Creating account…"); "Resend the code" button (disabled during a 30s cooldown).
   - **`done` step:** checkmark icon, "Studio ready" / "Account ready" heading, "Redirecting you to your dashboard…" subtext.

## Fields

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Persona tab | button group (single-select) | — | — | `'studio'` | Enum: `guest` (For couples) \| `studio` (For photographers) |
| Studio name | text input | Yes, studio persona only | non-empty after trim | `''` | Used to derive the auto-generated `username` |
| City | text input | No | — | `''` | Studio persona only; collected but not shown to be validated or required |
| Your name | text input | Yes, couple persona only | non-empty after trim | `''` | |
| Email | text input (`type="email"`) | Yes | regex `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` | `''` | Label reads "Work email" for studios, "Email" for couples |
| Mobile | text input (`type="tel"`) | Yes | regex `/^\+[1-9]\d{6,14}$/` (strict E.164) | `''` | Placeholder example: `+91 98765 43210` |
| Password | text input (`type="password"`) | Yes | length ≥ 8 (validation gate); strength meter scores 0–4 based on length≥8, mixed case, digit, symbol | `''` | Strength meter shows 4 bars; label text: "Use 8+ characters…" (0) / "Weak password." (1) / "Getting there." (2) / "Good password." (3) / "Strong password." (4) |
| Terms & Privacy agreement | checkbox | Yes | must be checked | `false` | Links to `/soon?f=Terms`, `/soon?f=Privacy` (placeholder "coming soon" pages, not real legal-content pages) |
| OTP code | text input (`inputMode="numeric"`, `maxLength=8`) | Yes | regex `/^\d{4,8}$/` (4–8 digits), non-digits stripped on input | `''` | |

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | Sets `document.title = 'Create your account — MAJA Invites'` |
| `resendIn > 0` | Ticks down once per second |
| Click persona tab | Switches `tab`, resets `step` to `'form'`, clears `error`/`info`/`otp` |
| Submit form step | Runs `validate()` (studio-name-or-name → email format → phone format → password length → agreement checkbox, first failing rule wins); on pass, calls `handleSendOtp` |
| `handleSendOtp` (studio persona) | Tries `sendCode('phone')` first; if that throws, falls back to `sendCode('email')` and shows a "Couldn't reach your phone" info message; on success shows "We sent a 6-digit code to {phone}." and moves to `otp` step |
| `handleSendOtp` (couple persona) | Always `sendCode('email')`; shows "We emailed a 6-digit code to {email}." and moves to `otp` step |
| `sendCode` failure (both attempts, or the single attempt for couples) | Shows the backend's `detail` or "Could not send a verification code. Try again." — step stays at `form` |
| Click "← Edit details" | Returns to `form` step without clearing entered values |
| Click "Resend the code" | No-ops while `resendIn > 0`; otherwise re-calls `sendCode(channel)` (the channel that actually succeeded last time) and resets the 30s cooldown |
| Submit OTP step | Validates OTP shape (`/^\d{4,8}$/`); calls `POST /api/auth/verify-otp`. On failure, shows "That code did not work. Request a fresh one." and stays on `otp` step |
| OTP verified, studio persona | Registers via `POST /api/auth/register` with an auto-slugified `username`; if the registration error message mentions "username" (case-insensitive), retries once with a random 4-digit numeric suffix appended to the slug; on any other registration error, surfaces it. On registration success, calls `adminLogin(email, password)`; if that doesn't report `success`, throws (surfacing "Account created — please sign in." or the login error) — **note: the account was already created server-side at this point even though the UI reports failure**. On full success, moves to `done` step and redirects to `/studio/dashboard` after 900ms |
| OTP verified, couple persona | Calls `userRegister({ email, name, phone, password })` (which itself calls `POST /api/users/register` and sets session state); on success moves to `done` and redirects to `/user/dashboard` after 900ms |
| Registration/login failure after OTP success | Shows the backend `detail`, or the thrown error's `.message`, or "Could not create your account." — the OTP step is not shown again (user is stuck on this error unless they navigate back manually) |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Send OTP | `POST /api/auth/send-otp` | `client.post` directly (raw, not via an `api/*.js` module) | Body: `{ phone, email, channel }`. Response may include `channel` (echoes/overrides requested channel) and, in dev mode, `otp` (plaintext code shown in UI as `devOtp`) |
| Verify OTP | `POST /api/auth/verify-otp` | `client.post` directly | Body: `{ phone, email, channel, otp }` |
| Register (studio) | `POST /api/auth/register` | `client.post` directly | Body: `{ name, username, email, phone, password }`. On a username-collision error, retried once with a suffixed username |
| Register (couple) | `POST /api/users/register` | `UserAuthContext.register()` → `client.post` directly | Body: `{ email, name, password, phone }` |
| Login after studio registration | `POST /api/auth/login` | `AuthContext.login()` | Body: `{ username_or_email: email, password }` (no `totp_code` — a brand-new studio account is assumed not to have MFA enabled yet) |

## Page Relationships

**Links out to:** `/` (brand link), `/auth` (Sign in), `/soon?f=Terms`, `/soon?f=Privacy`; post-signup redirects to `/studio/dashboard` or `/user/dashboard`.

**Linked from:** Landing ("Begin your invitation", "Set up your studio"), Pricing ("Choose {package}", "Start on {plan}"), Features ("Begin your invitation"), HowItWorks, FAQ, Sign In footer links.

## Business Rules

- Both personas are gated by a phone/email OTP step before the account is actually created — the account does not exist until OTP verification succeeds.
- Studio `username` is derived client-side by slugifying the studio name (lowercase, non `[a-z0-9._]` chars collapsed to `_`, trimmed, truncated to 26 chars, prefixed `studio_` if the result is under 3 chars, hard-capped at 30 chars). A server-side uniqueness collision is retried exactly once with a random 4-digit numeric suffix; a second collision is not retried further and surfaces as an error.
- Password minimum length is 8 characters; the 4-segment strength meter is advisory only — the submit gate only checks length ≥ 8, not the computed strength score.
- Phone number must be strict E.164 (`+` followed by 7–15 digits, first digit 1–9) — a bare 10-digit Indian number without `+91` will fail validation.
- Terms/Privacy checkbox is mandatory to proceed past the form step, even though the linked pages are currently `/soon` placeholders rather than real legal documents. [TBC whether real Terms/Privacy content is expected before this ships broadly, given `LINK.terms`/`LINK.privacy` used elsewhere point at `/terms` and `/privacy` instead of `/soon`.]
- Studio OTP delivery prefers SMS, silently falling back to email if the SMS send throws — the couple flow only ever uses email.
- On the (rare) case where OTP verification succeeds but the subsequent studio login fails, the account has already been created server-side; the UI shows an error without offering a direct path back to Sign In pre-filled — the user must manually navigate there. [Potential UX gap, not a documented business rule — flagged for awareness.]
