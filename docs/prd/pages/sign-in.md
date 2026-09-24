# Sign In Page

Route: `/auth`
Source: `frontend-v2/src/pages/SignIn.jsx`, `AuthSplit.css`
Auth: public (this IS the sign-in surface); redirects away if already signed in

## Overview

A single sign-in screen serving two separate identities behind a persona tab: couples ("For couples", cookie-session identity via `UserAuthContext`) and photographer studios ("For photographers", Bearer-token identity via `AuthContext`). Studio sign-in additionally supports a TOTP-based MFA step. The page is also the landing target for the app's route guards (`RequireUser`, `RequireStudio`) — a signed-out visitor hitting a protected route is bounced here with `location.state = { from, persona }`, and a successful sign-in returns them to that original destination.

## Layout

Two-column "auth split" layout:

1. **Left panel** (decorative, hidden on narrow viewports per CSS) — "MAJA Invites" brand link back to `/`, a customer quote ("It didn't feel like a form. It felt like someone was actually listening." — Ananya & Rohan, married in Udaipur), and a photograph placeholder frame.
2. **Right panel — auth card:**
   - Persona tabs: "For couples" / "For photographers".
   - H1 + subhead, copy varies by persona ("Welcome back" / "Sign in to manage your invitation, RSVPs and gallery." for couples; "Studio sign in" / "Sign in to your photographer dashboard." for studios).
   - Inline error banner (shown when `displayError` is set).
   - Form: identifier field (labeled "Email" for couples, "Studio email" for studios), password field, and — studio persona only, only once MFA is required — a 6-digit TOTP code field with helper text "From your authenticator app, or a backup code."
   - "Forgot password?" link (→ `/auth/reset`).
   - Submit button, label switches between "Sign in", "Signing in…", and "Try again in {n}s" (during a 429 cooldown).
   - Footer link: couples see "Don't have an invitation yet? Browse themes" (→ `/pricing`); studios see "New studio? Set up your studio" (→ `/auth/signup`).

## Fields

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Persona tab | button group (single-select) | — | — | `'studio'` unless `location.state.persona === 'studio'`... actually default is `'guest'` unless state says `'studio'` | Enum: `guest` (labeled "For couples") \| `studio` (labeled "For photographers"). Initialized from `location.state?.persona` |
| Identifier | text input (`type="email"`) | Yes (HTML `required`) | Browser email-type validation only; no client-side regex | `''` | Couples: their account email. Studios: username-or-email (`username_or_email` field server-side) |
| Password | text input (`type="password"`) | Yes (HTML `required`) | none client-side | `''` | |
| TOTP code | text input (`inputMode="numeric"`) | Yes when shown | Digits only — non-digit characters are stripped on input (`replace(/\D/g,'')`) | `''` | Only rendered for studio persona once `mfaStep` is true; auto-focused when it appears |

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | Sets `document.title = 'Sign in — MAJA Invites'` |
| Admin (`AuthContext`) already resolved and signed in (post-boot) | Redirects to `from \|\| '/studio/dashboard'` (replace) |
| Couple (`UserAuthContext`) already resolved and signed in (post-boot) | Redirects to `from \|\| '/user/dashboard'` (replace) |
| `mfaStep` becomes true | Auto-focuses the TOTP input |
| `retrySeconds > 0` | Ticks down once per second via `setTimeout`; submit is disabled while it's > 0 |
| Click "For couples" / "For photographers" tab | Switches `tab`, clears `error`, resets `mfaStep` to false, clears `totp` |
| Submit (couple persona) | Calls `userLogin({ email, password })`. On success, navigates to `from \|\| '/user/dashboard'`. On failure, falls to the generic catch block (see error handling below) |
| Submit (studio persona, no prior MFA step) | Calls `adminLogin(identifier, password, undefined)`. On `res.success`, navigates to `from \|\| '/studio/dashboard'`. On `res.status === 429`, starts the retry cooldown. On `res.code === 'MFA_REQUIRED'`, sets `mfaStep = true` (no error shown yet — the field simply appears). On any other failure, shows `res.error \|\| 'Sign in failed.'` |
| Submit (studio persona, `mfaStep` true) | Calls `adminLogin(identifier, password, totp)`. On `res.code === 'MFA_INVALID'`, keeps `mfaStep` true and shows "Invalid code. Try again." Other outcomes same as above |
| Login throws (network/5xx, or couple-login failure surfaces here since `userLogin` has no `{success}` contract) | If `status === 429`: reads a `Retry-After` response header (falls back to 60s) and shows the detail message or "Too many attempts."; otherwise shows the response's `detail` string or "Invalid email or password." |
| `retrySeconds > 0` | Submit button is disabled and labeled "Try again in {n}s"; the error banner appends " Try again in {n}s." to whatever error text is set |
| Click "Forgot password?" | Routes to `/auth/reset` |
| Click "Browse themes" (couple footer) | Routes to `/pricing` |
| Click "Set up your studio" (studio footer) | Routes to `/auth/signup` |
| Click "MAJA Invites" brand link | Routes to `/` |

## API Dependencies

| Action | Method & Endpoint | Module / Context | Notes |
|---|---|---|---|
| Couple login | `POST /api/users/login` | `UserAuthContext.login()` → `client.post` directly (not via `api/users.js`'s exported `login`) | Body: `{ email, password }`. On success sets `user` state and the `maja_user_session_active` localStorage flag; session itself lives in an httpOnly cookie |
| Studio/admin login | `POST /api/auth/login` | `AuthContext.login()` → `client.post` directly (not via `api/auth.js`'s exported `login`, though same endpoint/shape) | Body: `{ username_or_email, password, totp_code? }`. On success stores `access_token` in `localStorage.admin_token` and sets `admin` state |
| Both requests | `axios` shared client | `api/client.js` | Bearer token auto-attached from `localStorage.admin_token` when present; couple requests rely on `withCredentials` cookie only |

## Page Relationships

**Arrives from (redirect-back sources):**
- `RequireStudio` guard (`components/RouteGuards.jsx`) — any `/studio/*` route when signed out → `navigate('/auth', { state: { from: location.pathname, persona: 'studio' } })`
- `RequireUser` guard — any `/user/*` route when signed out → `navigate('/auth', { state: { from: location.pathname, persona: 'couple' } })`

**`from` redirect-back safety:** `safePath()` only accepts a same-app absolute path (`startsWith('/')` and not `startsWith('//')`), preventing a crafted `location.state.from` from becoming an open redirect.

**Links out to:** `/`, `/auth/reset`, `/pricing`, `/auth/signup`, and post-login: `/user/dashboard` or `/studio/dashboard` (or the guarded `from` path).

**Linked from:** Landing nav/drawer ("Sign in"), Pricing nav CTA, most marketing-page nav CTAs where applicable, Sign Up footer ("Already have an account? Sign in" / "Already have a studio? Sign in").

## Business Rules

- Two entirely separate identity systems share this one screen: couples authenticate via httpOnly session cookie (`UserAuthContext`), studios via Bearer JWT stored in `localStorage.admin_token` (`AuthContext`). Switching tabs does not clear a session already established in the other persona.
- Studio login supports TOTP MFA. Backend signals required-vs-invalid via `error.response.data.detail` being an object `{ code, message }` with `code` one of `MFA_REQUIRED` / `MFA_INVALID`; a plain string `detail` means a non-MFA failure.
- Rate limiting: a `429` response (from either persona's login call or explicitly returned from `adminLogin`) starts a client-side countdown read from the `Retry-After` response header (falls back to 60 seconds), during which the submit button is disabled.
- If already authenticated (session resolved during context boot), the page never renders the form — it redirects immediately once the relevant context's `loading` flag clears.
- `mj-auth-quote` testimonial and the photo panel are static decorative content, not sourced from any backend "reviews" data.
- The default persona tab reflects `location.state?.persona` if it's exactly `'studio'`; any other value (including absent) defaults to `'guest'` (couples).
