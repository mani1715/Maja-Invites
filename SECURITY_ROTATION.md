# Secret rotation

`.github/workflows/ci.yml` has pointed at this file since the secret-scan job
was written. The file lived only in `mani1715/wedding-36` and was never carried
over, so the runbook it promised did not exist here. This is it.

---

## What is actually at risk

**This repository's history is clean.** All 55 commits were scanned for live
credential patterns — AWS keys, Razorpay live keys, Stripe keys, Google API
keys, signed JWTs, private key blocks, Postgres URLs with passwords. The only
match was the literal string `rzp_live_PLACEHOLDER` in a test fixture.

The leak is in **`mani1715/wedding-36`**, the old repo, where `backend/.env` was
committed. That repo is private, which limits but does not remove the exposure:
every credential in that history is readable by anyone with repo access and by
anyone who has ever cloned it, including CI runners and any fork.

**Making the old repo private did not rotate anything.** If those credentials
are still the ones production uses, they are still live.

---

## Order matters

Rotate in this order. The first one is different from the rest.

### 1. `JWT_SECRET_KEY` — do this first

Everything else on the list is a key to a third-party service, and abuse of one
shows up on someone's bill. This one is different: **it signs your own
authentication tokens.** Anyone holding it can mint a token claiming to be any
user, including a super-admin, without touching a password, an OTP, or a login
route. There is no log entry that distinguishes a forged token from a real one.

It also needs no vendor console — it is a random string you generate:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Set it in the production environment, then restart the API.

**Everyone is logged out.** Every issued token is signed with the old key and
becomes invalid the moment the new one is live. That is the point. Photographers
and super-admins sign in again; couples' `event_client` links need reissuing.
Do it at a quiet hour, not mid-event.

Rotated locally on 2026-08-15 and verified: both seeded accounts issue working
tokens and authenticated calls return 200 under the new key. **Production is
NOT done** — that is an environment this session has no access to.

### 2. Supabase `service_role`

The service-role key bypasses row-level security entirely. Treat it as a
database superuser credential, because that is what it is.

Supabase dashboard → Project Settings → API → Reset `service_role`. Update
`SUPABASE_DB_URL` / the service key in the production environment, restart, then
confirm the API answers `/api/health` and one authenticated read.

### 3. AWS access keys

IAM → Users → the key's user → Security credentials.

Create a NEW access key first, deploy it, confirm S3 upload and CloudFront
signing still work, and only then **deactivate** the old key. Deactivate before
delete: deactivation is instantly reversible if something you forgot was still
using it, deletion is not.

Check CloudTrail for use of the old key after deactivation. Anything still
calling it is a service you did not know about.

### 4. Razorpay

Dashboard → Settings → API Keys → Regenerate. Rotate the **webhook secret** at
the same time (Settings → Webhooks); a stale webhook secret means payment
callbacks fail signature verification and orders silently stop being marked
paid.

Production currently runs **test** keys (`rzp_test_`), so no real money is
exposed today — but this must be done as part of going live, not after.

### 5. Gemini API key

Google AI Studio / Cloud console → API keys → delete and reissue. Restrict the
new key by API and by referrer if the console offers it.

Lowest urgency of the five: the blast radius is quota spend, not data.

### 6. Postgres password

Only if the production database is reachable from outside its own network. If it
is only addressable from the app container, the credential is not the boundary
the network is — rotate it, but not before the four above.

---

## After rotating

- Delete `.env.backup`, `.env.backup2` and any similar file from the production
  host. They do not exist in this checkout; they were in the old repo's tree.
- Confirm `git check-ignore backend/.env` still prints the path.
- Run `python scripts/scan_secrets.py --tree`. Expect `clean`.

---

## Purging the old repo's history

Rotation makes the leaked values worthless, which is the fix. Rewriting history
is optional and comes second — a purged history with live credentials is worse
than an intact history with dead ones.

If you do purge, `git filter-repo --path backend/.env --invert-paths` rewrites
every commit hash, so every clone must be re-cloned and every open PR is
invalidated. Rotate first regardless.

---

## Stopping the next one

`scripts/scan_secrets.py` is the same rule CLAUDE.md states as a habit
("before every push, scan the staged diff"), enforced instead of remembered:

```bash
python scripts/scan_secrets.py --install-hooks
```

That installs a **pre-commit** hook (staged changes) and a **pre-push** hook
(everything the push would send). CI's gitleaks job still runs, but it only sees
a commit that has already been pushed — by then rotation is the only remedy.
This one refuses while refusing is still free.

Findings print redacted. A scanner that echoes the secret into your scrollback
has leaked it a second time.

It is deliberately tuned against false positives. The first run fired three
times and all three were fine — a doc comment showing `postgres:postgres`, a
`${POSTGRES_PASSWORD}` interpolation, and a fixture key named `LiveLooking123`.
A gate that cries wolf gets bypassed, and a bypassed gate is worse than none.
If you add a rule, add its placeholder exemption in the same commit.
