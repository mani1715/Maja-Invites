# Reset Password & Auth Callback

Routes: `/auth/reset`, `/reset-password` (both render `ResetPassword`); `/auth/callback` (renders `AuthCallback`)
Source: `frontend-v2/src/pages/ResetPassword.jsx`, `ResetPassword.css`, `frontend-v2/src/pages/AuthCallback.jsx`
Auth: public

## Overview

Two small, related public auth surfaces documented together because they sit on either side of the same account-recovery/identity-linking space:

- **Reset Password** (`/auth/reset`, aliased at `/reset-password`) is a single route that renders one of two screens depending on whether a `?token=` query param is present: no token → **Request Reset Link**; token present → **Set New Password**. This covers the couple/studio-agnostic password-reset flow (the endpoint contract doesn't distinguish persona at this layer).
- **Auth Callback** (`/auth/callback`) is the return target for the couple's "Sign in with Google" OAuth flow. It is never linked to directly from within this page set (the actual "Sign in with Google" trigger lives in `UserAuthContext.loginWithGoogle`, not observed wired to a button on Sign In/Sign Up in the reviewed pages — [TBC where the Google button lives, if anywhere in the current build]). The backend redirects the browser here once the session cookie is set (or with `?error=1` on failure).

## Layout — Reset Password

**Request Reset Link (no token):**
1. "← Back to sign in" link.
2. Glass card: H1 "Reset your password", subhead ("…we'll send a reset link. It expires in 30 minutes."), Email field, inline validation note, Submit button ("Send reset link").
3. Sent state: checkmark icon, "Check your inbox", the email address it was sent to, guidance text, "Resend the email" button (disabled during a 30s cooldown).
4. Footer: "Still locked out? Write to support@majacreations.com".

**Set New Password (token present):**
1. "← Back to sign in" link.
2. Glass card: H1 "Choose a new password", subhead ("This link is single-use. Saving signs you out of every other device."), inline error banner, New password field with 4-bar strength meter + label, Confirm password field with live match/mismatch note, Submit button ("Save new password"), repeated "Saving signs you out of every other device." note.
3. Done state: checkmark icon, "Password updated", guidance text, "Go to sign in" button.
4. Footer (only when not done): "Link expired? Request a new one" (→ `/auth/reset`, i.e., itself without a token).

## Layout — Auth Callback

No visible UI beyond a single loading line: "Signing you in…" (class `mj-loader`). The page is a pure redirect/transition screen.

## Fields

**Request Reset Link:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| Email | text input (`type="email"`) | Yes | regex `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` | `''` |

**Set New Password:**

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| New password | text input (`type="password"`) | Yes | strength score ≥ 2 (of 4) required to submit | `''` |
| Confirm password | text input (`type="password"`) | Yes | must exactly equal New password | `''` |

Submit is enabled only when `score >= 2 && matched` (`ready`).

**Auth Callback:** no fields — reads `?next=` and `?error=` from the URL query string only.

## Interactions — Reset Password

| Trigger | Behavior |
|---|---|
| Page mount | Sets `document.title = 'Reset password — MAJA Invites'`; reads `token` from the query string once, which decides which sub-screen renders |
| `cooldown`/resend timers | Tick down once per second on both sub-screens |
| Submit Request-Reset form | Validates email format client-side ("Enter a valid email address." if invalid); on valid, calls `POST /api/auth/forgot-password`; on success shows the "Check your inbox" state and starts a 30s cooldown |
| Request-Reset network/5xx failure | Shows the backend's `detail` or "Could not reach the server. Try again." — note the backend intentionally always returns 200 for a *valid request* (no user enumeration), so this error path only fires on actual network/server failure, not on "email not found" |
| Click "Resend the email" | No-ops during cooldown; otherwise resubmits the same request and restarts the cooldown |
| Submit Set-New-Password form | Blocked if `!ready \|\| loading`; calls `POST /api/auth/reset-password` with `{ token, password }`; on success shows the "Password updated" state |
| Set-New-Password failure | Shows the backend's `detail` or "Could not reset your password. The link may have expired." |
| Click "Go to sign in" (done state) | Routes to `/auth` |
| Click "Link expired? Request a new one" | Routes to `/auth/reset` (drops the token, re-renders the Request-Reset screen) |

## Interactions — Auth Callback

| Trigger | Behavior |
|---|---|
| Page mount | If `?error=1` (or any truthy `error` param) is present, immediately redirects to `/auth` (replace), skipping the refresh call entirely |
| Page mount (no error param) | Calls `refresh()` (`UserAuthContext.checkAuth`, i.e. `GET /api/users/me`) to hydrate `user` state from the now-set session cookie, then navigates to `?next=` if it's a same-origin path (`startsWith('/')`), else to `/user/dashboard` (replace) |
| Component unmount before `refresh()` resolves | Guarded via a `live` flag so the post-refresh navigation is skipped if the component is no longer mounted |

Note: `UserAuthContext`'s own boot effect explicitly skips its own `/me` probe when `window.location.pathname === '/auth/callback'`, deferring entirely to this page's own `refresh()` call — avoiding a race between two competing `/me` fetches right after the OAuth cookie is set.

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Request reset link | `POST /api/auth/forgot-password` | `client.post` directly (raw) | Body: `{ email }`. Always 200 per backend contract — no enumeration of whether the email exists |
| Set new password | `POST /api/auth/reset-password` | `client.post` directly (raw) | Body: `{ token, password }`. 400 on invalid/expired token |
| Refresh session after OAuth | `GET /api/users/me` | `UserAuthContext.refresh` (aliases `checkAuth`) | Called by AuthCallback only; hydrates `user` and sets the `maja_user_session_active` localStorage flag on success |

## Page Relationships

**Reset Password links out to:** `/auth` (back to sign in, both sub-screens), `mailto:support@majacreations.com`, `/auth/reset` (self, token-dropping "request new one" link).

**Reset Password linked from:** Sign In ("Forgot password?").

**Auth Callback is the redirect target of:** the backend's Google OAuth callback (`backend`'s `/api/users/auth/google/callback`, which itself is reached via `UserAuthContext.loginWithGoogle()` → `GET {API_URL}/api/users/auth/google/login?redirect=<next>`). No page in the reviewed set renders a visible "Sign in with Google" button that calls `loginWithGoogle` — [TBC: the trigger may exist elsewhere in the app (e.g., a dashboard) or may be a not-yet-wired affordance].

**Auth Callback navigates on to:** `/auth` (on OAuth error), or `?next=` / `/user/dashboard` (on success).

## Business Rules

- Reset-link request never reveals whether an email is registered (always 200) — a thrown/caught error on this screen means a genuine network or server failure, not "no such account."
- Reset link expires in 30 minutes (per the on-screen copy; not independently re-verified against backend TTL config — [TBC]).
- Reset token is single-use; successfully setting a new password signs the user out on every other device/session, per the on-screen copy.
- New password strength gate for the Set-New-Password form is more lenient than Sign Up's: submit only requires a strength score ≥ 2 out of 4 (Sign Up requires length ≥ 8 outright as its hard gate, with the same 4-point scoring model for the meter).
- Both sub-screens share the exact same password-strength scoring function and color/label ramp as Sign Up (`scorePassword`, `STRENGTH_COLOR`, `STRENGTH_LABEL`), duplicated in this file rather than imported from a shared module. [TBC whether this duplication is deliberate or a candidate for extraction.]
- `next` redirect target on Auth Callback is validated as same-origin (`startsWith('/')`) before use — an open-redirect guard consistent with Sign In's `safePath()`.
- Route `/reset-password` and `/auth/reset` are true aliases — both render the identical `ResetPassword` component with identical behavior; there is no functional difference between them. [TBC why both exist — possibly for legacy-link compatibility.]
