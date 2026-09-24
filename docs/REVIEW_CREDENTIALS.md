# Review credentials — LOCAL REVIEW ONLY

Seeded by `backend/seed_review.py` against the local stack:

- Postgres `localhost:5433`, db `maja`
- Backend `http://localhost:8001`
- frontend-v2 `http://localhost:8127`
- Legacy CRA admin app `http://localhost:3100` (start it separately if you need it)

Every account uses the same password, **`Review@2026!`**, except the couple
access code below (also `Review@2026!`, but a different login system — see
notes).

Re-seed any time with:

```
cd backend
SUPABASE_DB_URL=postgresql://postgres@localhost:5433/maja \
PYTHONIOENCODING=utf-8 ALLOW_INSECURE_JWT=1 SEED_TEST_ACCOUNTS=0 \
../.venv/Scripts/python seed_review.py
```

It is idempotent — safe to rerun any time, resets passwords, never
duplicates rows.

## DELETE BEFORE DEPLOY

These are local review accounts only. Before deploying anywhere real, run:

```
cd backend
SUPABASE_DB_URL=<your db> ../.venv/Scripts/python seed_review.py --cleanup
```

This removes both admin accounts, the couple/user account, the demo profile,
its couple-access login, and the sample store order. `seed_review.py` also
refuses to run at all (seed or cleanup path aside) when `ENVIRONMENT` /
`ENV` / `APP_ENV` is set to `production` — same guard `seed_test_accounts.py`
uses.

## Logins

| Surface | URL | Credentials | Notes |
|---|---|---|---|
| Studio dashboard | `http://localhost:8127/studio/dashboard` | `review-studio@maja.local` / `Review@2026!` | Log in at `http://localhost:8127` (Studio login) or POST `/api/auth/login` with `username_or_email` + `password`. Role `admin`. MFA is off, account status `active` (never locked). Owns the `review-demo` wedding and its sample order. |
| Super-admin console | `http://localhost:8127/auth` (photographer tab) → auto-routes to `http://localhost:8127/admin/dashboard` | `review-admin@maja.local` / `Review@2026!` | ONE sign-in page for every role: `/api/auth/login` returns the account's `role`, and SignIn routes `super_admin` → `/admin/dashboard`, `admin` → `/studio/dashboard`. The in-app Platform console shows live stats + the photographers table; deep management (pricing hub, disputes, fulfillment) still lives in the legacy console at `http://localhost:3100/super-admin/dashboard` (same credentials) until those surfaces are ported. `require_super_admin` gates by the `role` field alone — no env allowlist exists. |
| ~~User dashboard (couple/buyer account)~~ | ~~`http://localhost:8127/user/dashboard`~~ | — | **REMOVED — product pivot 2026-08-11, normal-user (couple/buyer) accounts retired.** Photographers/studios are the only account holders now; `/user/dashboard` and `/user/profile/:id/edit` no longer exist in `App.jsx`, and every `/api/users/*` route now answers `410 NORMAL_USERS_RETIRED` (`backend/user_auth.py`, `user_features.py`). See the note below the table and `docs/ARCHITECTURE_MIGRATION_MAP.md` §6b. |
| Couple access (per-invitation login) | `http://localhost:8127/couple/access/review-demo` | username `review-couple` / password `Review@2026!` | **Unaffected by the pivot — stays.** This is the "photographer's client" scoped portal (`backend/photographer_clients.py`, `event_client_accounts` collection, `POST /api/client/login`). Scoped to exactly one invitation (`review-demo`) via a JWT with `typ=event_client`; read-mostly access to RSVP/wishes/analytics/gallery for that event only. This is NOT a normal-user account and was never part of the retirement above. |
| Guest invitation (public) | `http://localhost:8127/invite/review-demo` | none — public | Demo wedding "Ravi & Meera", published (`status=published`, `is_active/is_published/is_enabled=true`). Two events render on the Live Timeline: Wedding Ceremony (10:30–13:00) and Reception (18:30–22:00), both at Taj Krishna, Hyderabad. Verified via `GET /api/invite/review-demo` and `GET /api/invite/review-demo/full`. |

**Credits and normal-user endpoints now 410 by design.** Every `/api/users/*`
account route and every credit purchase/grant/spend route (credit-pack
purchase, gift-code redeem, referral redeem, the whole legacy
`/api/super-admin/pricing/*` console) answers `410 Gone` on purpose — not a
bug to work around during review. `backend/tests/test_users_retired.py`
(34/34 passed) and `backend/tests/test_credits_retired.py` (12/12 passed)
cover this at the source level; the running `:8001` dev process predates
these changes (uncommitted working-tree edits, confirmed via `git status`)
so it still answers the old way until restarted — do not restart it per
house rules, treat the test suites as the source of truth for this pivot,
not a live probe against `:8001`.

## What got created

Run `backend/seed_review.py` (no args) to create/refresh everything below.
Every write is idempotent (find-then-update-or-insert, keyed by email / slug
/ a fixed id) — reruns never duplicate rows.

1. **Studio admin** — `admins` collection, `role=admin`, `status=active`,
   `mfa.enabled=false` explicitly set (never prompts for a TOTP code, never
   locked out).
2. **Super admin** — same `admins` collection, `role=super_admin`. No
   allowlist mechanism exists for super-admin in this codebase; the `role`
   field alone gates `require_super_admin` (`backend/auth.py`).
3. **(Retired) Couple/user account** — `seed_review.py` no longer creates
   this row (product pivot 2026-08-11: normal-user accounts don't exist).
   It instead deletes a stale `users` row for `review-couple@maja.local` on
   every run, if one is left over from a pre-pivot seed
   (`_remove_legacy_couple_user_row`, `backend/seed_review.py`). `/api/users/login`
   now answers `410 NORMAL_USERS_RETIRED` regardless of credentials.
4. **Demo wedding `review-demo`** — owned by the studio admin (`admin_id` set
   to the studio admin's id). Built with
   `backend/order_to_invitation.build_invitation_payload` — the exact mapping
   the real fulfillment flow uses to turn a paid order into a profile
   document, so what you're reviewing is the real code path, not a
   hand-rolled shortcut. Then published (`status/is_active/is_published/
   is_enabled`).
   - **Events**: 2 `WeddingEvent` rows (marriage + reception) written the
     same way `backend/scripts/seed_demo_events.py` already does in this
     repo — a raw `events` list on the profile document, which is exactly
     what the public invite endpoint reads.
   - **Couple access code**: `event_client_accounts` row, username
     `review-couple`, scoped to this one profile.
   - **Sample store order**: `invitation_orders` row `invord_reviewdemo`,
     `buyer_kind=photographer`, `user_id=<studio admin id>`, `status=paid`,
     `build_status=delivered`, linked to the `review-demo` profile. Visible
     via `GET /api/store/my-orders` with the studio admin's Bearer token.
5. **Gallery rows — skipped on purpose.** This repo has no bundled
   placeholder images anywhere (`frontend/public/sample-wedding/*` and the
   frontend-v2 equivalent don't exist locally — checked). Any photo URL
   seeded here would 404 in the gallery/photo UI, so bride/groom/couple photo
   fields and the gallery collections were left empty instead of pointing at
   assets that don't exist. The invitation renders correctly without them
   (empty photo sections, not broken ones).

## Verified against the live backend (2026-08-11, pre-pivot)

```
POST /api/auth/login        {"username_or_email":"review-studio@maja.local", ...}   -> 200, admin token
POST /api/auth/login        {"username_or_email":"review-admin@maja.local", ...}    -> 200, super_admin token
POST /api/users/login       {"email":"review-couple@maja.local", ...}               -> 200, session cookie  [STALE - see below]
POST /api/client/login      {"username":"review-couple", ...}                       -> 200, event_client token
GET  /api/invite/review-demo                                                        -> 200, full profile incl. events
GET  /api/invite/review-demo/full                                                   -> 200, batched payload
GET  /api/store/my-orders   (studio Bearer token)                                   -> 200, 1 order (invord_reviewdemo)
GET  /api/studio/my-weddings (studio Bearer token)                                  -> 200, review-demo listed
```

**The `/api/users/login` row above is now stale** — it was captured before the
2026-08-11 product pivot. That endpoint now answers `410 NORMAL_USERS_RETIRED`
in source (`backend/user_auth.py:104-110`), confirmed by
`backend/tests/test_users_retired.py` (34/34 passed, run this pass). It could
not be re-verified live for this update because the `:8001` dev process this
table was captured against still predates the pivot's uncommitted changes and
house rules bar restarting it — re-run this table's live checks after the
next deploy/restart picks up the pivot code. Every other row above is
unaffected by the pivot and still accurate.

Note: `/api/users/login` and `/api/client/login` sit behind
`BotDetectionMiddleware` (`backend/security_middleware.py`), which blocks a
handful of known non-browser user agents including bare `curl` — use a
browser or set a normal `User-Agent` header when testing those two endpoints
by hand. `/api/auth/login` and `/api/invite/*` are explicitly exempted from
that middleware.
