# SESSION_CONTEXT — latest work handoff

Newest session first. Read §0 before touching anything.

---

## §00 — Start here (updated 2026-08-18)

If you are opening a fresh Claude Code chat on this repo, read this section,
then [`CLAUDE.md`](CLAUDE.md), then jump to whichever numbered section below
covers what you are about to touch. **Everything in this file is an observed
result unless it says otherwise.**

**Where the work is up to.** The backend has been feature-complete for several
sessions. Recent work has been two things: closing the gap between what the
backend can do and what a person can see and click, and then the 2026 pricing
redesign. Newest first:

| Section | What it did |
|---|---|
| [§0.0.82](#0082--deployed-the-full-stack-is-live-on-the-gcp-vm-2026-08-20) | **DEPLOYED.** Full stack live on the GCP VM at http://34.67.38.190 — 10/10 stages, 6/6 containers, AWS smoke 21/21. Four first-run VM prerequisites fixed in deploy.sh (container frontend build, caddy probe, AWS-creds error, BACKUP_PASSPHRASE required). |
| [§0.0.81](#0081--deploysh-one-canonical-vm-entrypoint-ssh-to-the-vm-is-the-blocker-2026-08-19) | `./deploy.sh` VM entrypoint (deploy/check/status/logs/rollback/review), redis health gate, smoke-test deploy gate, invite_view budget knob. **SSH to the VM refused — key not in authorized_keys.** |
| [§0.0.80](#0080--verification-pass-end-to-end-quota-one-device-policy-security-invariants-as-tests-2026-08-19) | End-to-end quota proof against the live stack, invite_view off the daily limiter, one client performance policy, security + deployment invariants as tests. **Every AWS/VM step still unrun.** |
| [§0.0.79](#0079--face-match-quota-reserved-per-batch-one-qr-per-wedding-studio-pricing-moved-behind-sign-in-2026-08-19) | Batch face-match quota with an atomic reservation, one face-match QR per wedding, studio pricing moved behind sign-in, runtime/dev requirements split, `deployed.out`. |
| [§0.0.76](#0076-running-the-pricing-wave-on-a-second-machine) | An independent run of the pricing wave on a clean checkout. Five tests that only passed on one machine, six money-path assertions that were silently skipping, and a founding-console save that could reprice the wrong plan. |
| [§0.0.75](#0075--pricing-completion-wave-every-0074-open-item-closed--one-real-p0-found-by-adversarial-testing-2026-08-18) | Pricing completion wave; founding prices now reach checkout; adversarial suite added. |
| [§0.0.74](#0074--pricing-redesign-2026-owner-price-book-psychological-rounding-four-product-surfaces-2026-08-18) | The 2026 owner price book across four product surfaces. Five portfolio plans, GST-inclusive portfolio totals. |
| [§0.0.73](#0073--old-repo-parity-close-the-gaps-the-ui-rebuild-left-behind-2026-08-17) | Old-repo parity: all 8 Razorpay flows settle without the browser, real refunds, coupons that actually discount. |
| [§0.0.72](#0072--media-storage-architecture-direct-to-s3-multipart-4-bucket-layout-sessions-2026-08-17) | Media storage: direct-to-S3 multipart, 4-bucket layout, upload sessions. |
| [§0.0.71](#0071--forensic-findings-remediation-sweep-2026-08-17) | Forensic remediation sweep. |
| [§0.0.68](#0068-the-home-page-never-opened-a-preview-because-it-never-linked-to-one) | The home page linked to no design or preview at all. Rebuilt around the real catalogue. |
| [§0.0.69](#0069-the-site-was-selling-to-couples-and-quoting-a-price-the-checkout-would-not-honour) | The public site addressed a couple as the buyer, though accounts are studio-only. Re-aimed at photographers. |
| [§0.0.70](#0070-what-is-still-open) | **The open list. Start here for "what do I do next".** |

**Bootstrapping locally** is §0.0.1, and the short version is `.
un.ps1`.
**The verification commands** are in CLAUDE.md under *Standing checks* — run
them, don't re-derive them. Four things about running them that will otherwise
cost you an afternoon:

* **Use the venv's interpreter explicitly.** A bare `python -m pytest` picks up
  system Python, which has no `asyncpg`, and reports
  `Interrupted: 2 errors during collection` on
  `test_adapter_ensure_table_race` and `test_face_dead_letters`. That looks
  exactly like the import-time-stubbing regression §0.0.64 warns about and is
  not it. Run `./.venv/Scripts/python.exe -m pytest backend/tests -q`.
* **The event gate runs from `backend/`,** not the repo root:
  `cd backend && ../.venv/Scripts/python.exe -m tests.run_event_suite`. From
  the root it fails with `No module named 'tests'`. Same for running a single
  live test FILE — the tree works from the root, one file does not.
* **`SEED_TEST_ACCOUNTS=1` must be in `backend/.env`.** The money-path suites
  buy things, and buying needs either real Razorpay keys or the comped account
  the seed creates (`test.studio@maja.test` / `MajaTest@123`). Without it, six
  order-total assertions skip rather than fail — see §0.0.76.
* **Never read a suite that overlapped another run, or a backend restart.**
  Two concurrent pytest runs share one server, one DB and one login rate
  limiter. If you restarted uvicorn mid-run, throw the number away and re-run.

Last full run, 2026-08-18, on a clean checkout: **pytest 692 passed / 3 skipped
/ 1 xfailed**, **event gate 76/76 suites, 1,958 checks, all green**, founding
self-test 49/49, migration self-test green, secret scan / admin-id deref / SEO
routes clean, `yarn build` green, 47 routes swept across all three personas
with 0 console errors. The 3 skips are environmental and each says so: the rate
limiter declining to spend 60 requests, `GEMINI_API_KEY` unset, and storage
`/subscribe` needing a real gateway.

**Four habits this project has learned the hard way**, each from a real
incident recorded below:

1. **A green build, a 200, or rendered text is not evidence.** A missing static
   file answers **200 with `index.html`** under both Vite and Caddy (§0.0.68);
   a React error boundary recovers so a crashed page reads as healthy
   (§0.0.63); `yarn build` never opens a page; HMR reporting an update is not
   evidence the running module changed (§0.0.69).
2. **A test that cannot fail is not a test.** Revert your fix and watch it go
   red before you believe it. Canaries in this file have passed against
   deliberately broken code because the revert was incomplete (§0.0.63) or the
   assertion was `<=` where it needed `<` (§0.0.68).
3. **A skipped test is not a passing test, and a green suite is not a portable
   one.** Six money-path assertions skipped for months behind a 503, and five
   more passed only on the machine whose database had been edited by hand
   (§0.0.76). If a precondition is not created by code in this repo, it is not
   a precondition — it is a local accident.
4. **Check the payload, not the field name you expected — and never identify a
   thing by a field that is not unique.** Most bugs in §0.0.69 and §0.0.76 are
   one system reading another's data under the wrong key, or keying on a name
   where two rows share it.

---

## §0.0.76 — Running the pricing wave on a second machine (2026-08-18)

An independent run of §0.0.71–§0.0.75 on a clean checkout: pull, boot, drive
every surface, run every gate. The pricing redesign, the media-storage rework,
the refund and webhook settlement work all hold up — event gate 76/76, all
47 routes render across the three personas with zero console errors, and the
adversarial suite is genuinely good (it is what caught that wave's own
double-charge race).

Three defects, and they are the same defect three times: **something was
identified by a field that is not unique, or by a precondition no code
creates.**

### The suite was green in one place and red everywhere else

`test_pricing_adversarial_2026.py` ordered through `admin@wedding.com`, whose
docstring described it as "is_test:true (comped buyer)". Nothing in the repo
sets that flag on it — `seed_test_accounts.py` comps `test.studio@maja.test`
and `test.user@maja.test`, and CLAUDE.md documents `admin@wedding.com` only as
the ordinary photographer login. On the authoring machine the flag had been set
by hand, so the file was green there and **503 "Payment gateway not
configured"** on any other checkout: 5 failures.

Fixed by pointing the fixture at the account the seed actually creates, and by
failing with one actionable sentence (`set SEED_TEST_ACCOUNTS=1`) instead of a
bare login error if the seed has not run.

### Six money-path assertions had been skipping, not passing

Same root cause, worse consequence. `test_store_pricing_2026.py` and
`test_storage_pricing_2026.py` catch the 503 and call `pytest.skip`, so the
invitation-suite order totals, the client-sent-amount guard and the face
photo-limit stamp were **silently not running at all** — the exact trap
CLAUDE.md's "a skipped test is not a passing test" warns about, on the money
path. Both now use the comped account: **27 passed, 1 skip**, and the one
remaining skip is honest (storage `/subscribe` needs a real gateway even for a
comped buyer, because the free-order bypass lives on `store/order/create`).

Whole tree: **692 passed / 3 skipped / 1 xfailed**. That reconciles exactly
with the 688/3 reported in §0.0.75 — the same six tests ran there, comped by
hand — plus the four new ones below.

### The founding console could reprice a plan the owner did not choose

Found by loading `/admin/founding` as super-admin: React warned about two
children with the key `Premium`. `AdminFounding.jsx` keys its panels by
`p.tier` — **and saves by `p.tier` too**, into
`find_one({"product": "portfolio", "tier": tier})`. `tier` is not unique: on
this database `plan_portfolio_premium` and the seeded `plan_portfolio_test`
are both "Premium", so "Save Premium" wrote to whichever row came back first,
silently, with a success toast.

This is the THIRD instance of this exact root cause in the 2026 work —
§0.0.75 fixed `apply_founding_portfolio_catalogue` matching by tier name, and
§0.0.74's `StudioPlanPicker` note fixed deduping by `portfolio_tier`. This was
the only one on a write path. Now:

* an **id** match wins;
* a tier name is honoured only while it is unambiguous — two plans answering to
  one name raises `AmbiguousPlanKey` → **409**, because guessing here is a
  price write;
* the update filters on the **resolved row's id**, never the caller's key;
* the console sends `plan_id`, and keys its panels by it.

`tests/test_founding_plan_key.py` plants the collision deliberately and
requires the refusal — and requires that the refusal did not write either row.
Canaried: reverting the lookup fails 2 of its 4 tests.

> **Renaming a path parameter breaks anything that indexes routes by path
> string.** `{tier}` → `{plan_key}` turned the event gate red with
> `KeyError: ('/api/super-admin/founding/portfolio/{tier}', 'PATCH')` — the
> founding self-test looks routes up in `app.routes` by their exact template.
> The URL a client calls is unchanged; only in-repo by-path lookups move.

**Resolved since §0.0.70 was written:** item 6 (the comped `plan_portfolio_test`
leaking into `/api/public/pricing/portfolio`) is fixed — the public endpoint now
returns only the five real plans. It still appears on the super-admin founding
console, which is correct, and is now unambiguous there.

**Gates:** pytest 692/3/1 · event gate 76/76 (1,958 checks) · founding
self-test 49/49 · migration self-test green · secret scan, admin-id deref, SEO
routes clean · `yarn build` green · 47 routes, 0 console errors.

---

## §0.0.83 — Face-match phase audit + remediation (2026-08-20)

A four-way parallel audit of the AI face-match + cross-event isolation + live
gallery surface against the phase spec, then fixed every gap found. **The
architecture was already sound** — per-event Rekognition collections,
server-derived collection ids, direct-S3 upload, atomic face quota (1 photo = 1
unit), enqueue-after-commit indexing, bcrypt-hashed gallery PIN, event-scoped
unlock token — all PASS with file:line evidence. No system was duplicated; every
fix extends the canonical module.

Fixes (commits): `9dd60ce`, `d86c96d`, `a9719af`, `f782b5b`.

1. **P0 SECURITY — live-wall feed was PIN-gated in the UI only.**
   `GET /api/invite/{slug}/live-gallery` (premium_features.py) took no request and
   never called `enforce_gallery_access`, so a protected wedding's whole wall was
   downloadable by hitting the API directly. Now gated with the canonical
   `enforce_gallery_access`; `getWall` forwards the device token it already holds.
2. **Mode separation (spec §18/§22).** Face-match QR pointed at the full live
   wall. New page `FaceMatchPage.jsx` at `/invite/{slug}/find-my-photos` (selfie →
   only matches, never the grid); QR retargeted (server.py + studio card);
   `LivePhotoWall` now honours `private_full_gallery_enabled`.
3. **INDEXED_NO_FACE** state surfaced (processing_status + `no_face` aggregate +
   UI badge/metric). No-face photo no longer indistinguishable from indexed.
4. **Retry duplicate-vector purge.** New best-effort `list_face_ids_for_image`
   deletes a photo's orphaned Rekognition vectors before re-index, on the retry
   path only. Needs `rekognition:ListFaces` to fully engage; degrades to prior
   behaviour without it (returns []). **Owner follow-up: add ListFaces to the
   maja-backend IAM policy.**
5. **Lazy collection create** — index no longer dies `no_collection` if queued
   before gallery-enable; derives + creates the deterministic collection.
6. **Bounded global face-ops** — `compute_face_ops` replaced `find({}).to_list(200000)`
   with count/$sum/$group aggregates.
7. **Owner threshold clamp** to [70,100] (set + read); guests never supply it.

**Verified by code only** (py_compile + `yarn build` clean). The local stack was
down and the VM is the owner's — so NOTHING here is live-verified. The §28-32
acceptance tests (real event → upload → selfie → only-matched-photos, cross-event
isolation, PIN, the P0 curl) must run on the VM after `git pull && ./deploy.sh
--review`. Report every untested item as NOT VERIFIED until then.

---

## §0.0.82 — DEPLOYED: the full stack is live on the GCP VM (2026-08-20)

**The site is up.** The owner ran `./deploy.sh --review` on the VM
(`makersonwheels@maja-invites`) to a clean finish — all 10 stages green, all 6
containers healthy, AWS smoke test **21/21 RUNTIME PASS**. Live at
**http://34.67.38.190** (plain HTTP, `--review`); `HTTPS_URL=https://review.local`
is the placeholder domain, ACME-failing by design until a real domain points at
the VM. `DEPLOYED_COMMIT` was `6d7a660`; deploy.sh is now `a604077`.

**What the first real VM run cost — all fixed in the script, not app code.**
Each stage surfaced one missing VM prerequisite; the pattern was "name it, fix
it in deploy.sh, redeploy":

| Commit | Stage | Fix |
|---|---|---|
| `525b98f` | 5 | VM has no yarn/npm → build frontend in a `node:20-alpine` container. |
| `c8bce1b` | 8 | caddy check used `wget -q -S` (busybox `-q` mutes `-S`) and probed the domain's HTTPS-redirect lane. Review mode now probes the `:80` bare-IP site by exit code. |
| `6d7a660` | 9 | invalid AWS creds tripped the ERR trap with a bare line number; `\|\| IDENT=""` lets the guard name the real cause. |
| `a604077` | 3 | `BACKUP_PASSPHRASE` added to REQUIRED — the unconditional `backup` service hard-refuses to start without it and was crash-looping under a green "Deployment complete". |

**.env gotcha that ate two cycles.** deploy/.env reads the *last* value per key
(`envval` uses `tail -n1`). An earlier `cat >>` block with `REPLACE_ME`
placeholders appended after the real AWS values → placeholders won → buckets
resolved to `REPLACE_ME`, sts failed. Fix was to append the real maja-backend
values last. Runtime identity confirmed `maja-backend` / account
`655671523450` (the identity gate would have hard-failed on maja-admin).

**Demo values still in place (owner follow-ups, not code):** super-admin
password is a throwaway (rotate before public); `DOMAIN=review.local` +
`ACME_EMAIL` are placeholders (set real ones, redeploy WITHOUT `--review`, to
get HTTPS); `--review` is plain HTTP — never sign in as super-admin over it on a
public network. Confirm the maja-admin AWS key is deleted. Port 80 may need a
GCP firewall rule (the summary prints the exact `gcloud` command).

**Known cosmetic:** `error reading bcrypt version` traceback at super-admin
bootstrap is a passlib/bcrypt-4.x version-print quirk — hashing works, account
is created. Pin `bcrypt<4.1` (or bump passlib) to silence; not blocking.

**Next:** `docs/VM_ACCEPTANCE_RUNBOOK.md` — the 18 client-acceptance steps to
run against the live IP now that the stack is up.

---

## §0.0.81 — deploy.sh: one canonical VM entrypoint; SSH to the VM is the blocker (2026-08-19)

**The VM objective is one command:** SSH in, then

```
cd ~/maja_invites
git pull --ff-only origin main
./deploy.sh
```

(first client review before DNS/TLS: `./deploy.sh --review`, which also serves
plain HTTP on the VM's IP; acceptance run with AWS writes:
`./deploy.sh --review --aws-write`).

**Layout.** All logic lives in [`deploy/deploy.sh`](deploy/deploy.sh) (one
brain); root `deploy.sh` and `deployed.out` are 4–6-line `exec` shims pinned by
tests to stay that way. Subcommands: `--deploy` (default) · `--check` (validates
and **changes nothing** — it no longer even fast-forwards; it reports how many
commits behind origin the tree is) · `--review` · `--status` · `--logs [svc…]` ·
`--rollback` · modifiers `--no-pull`, `--aws-write`. Ten numbered stages;
summary prints parseable `DEPLOYED_COMMIT=` / `HTTP_URL=` / `HTTPS_URL=` lines.

**Rollback** records `<epoch> <commit>` per successful deploy in
`$HOME/.maja_deploy_state` — outside the repo, because the git stage refuses a
dirty tree, so a state file inside the checkout could never be written.
`--rollback` checks out the previous recorded commit detached and redeploys
with `--no-pull`; it never touches a volume or the database, and plain
`./deploy.sh` returns to main.

**AWS gates.** Stage 4 prints SET/MISSING per key (never a value) for
AWS_REGION, the four buckets, and the credential vars — missing AWS is a loud
warning (media features off), not a deploy failure. Stage 9, after health: reads
`aws_service.credential_source()` inside the container; `none` → SKIP; anything
else → runs `/app/scripts/aws_smoke_test.py` (read-only; `--write` only under
`--aws-write`) and **fails the deploy on non-zero** — runtime AWS is required
once configured. SKIP-AUDIT lines never affect that exit code (§0.0.78).
Health gains a redis `PING`→`PONG` gate alongside the existing core/pg/worker/
caddy gates.

**invite_view limiter, round two.** §0.0.80 moved it off the calendar-day DB
counter; today the 10 phantom 429s returned anyway — the rolling in-process
counter crossed 500 after several same-day full-suite runs from 127.0.0.1. The
budget is now `INVITE_VIEW_LIMIT_PER_DAY` (default 500, production unchanged);
the gitignored `backend/.env` sets 100000 locally. The knob changes the budget,
never the mechanism. If those 10 tests ever 429 again, check this first.

**Verified here:** bash -n on all three scripts · `--help` 0 / unknown-arg 2 /
`--check`,`--status`,`--rollback` all die cleanly with exit 1 on this
docker-less box · LF shebangs, `100755` in the index ·
`test_deployment_invariants.py` now 13 tests incl. shim discipline · full suite
**819 passed / 3 skipped / 1 xfailed** · regression battery re-confirmed at
baseline by an independent worker before integration.

**NOT verified (needs the VM):** every stage past `--check` — image build,
compose up, all health gates, the AWS smoke lanes, `--status`/`--logs`/
`--rollback` against a running stack, and the whole client acceptance flow.

**THE blocker, exactly:** `ssh predixvm` (`predixbuilds@34.46.14.224`, key
`~/.ssh/predixvm`, ED25519 `SHA256:TdxP44IHa8OOONhy44K6VSxdSzjJoGPORFdmqDFauMY`)
— the key IS offered and the server refuses it: `Permission denied (publickey)`.
The public key is not in that account's `authorized_keys`. Restore with the GCP
console (VM → Edit → SSH Keys → add `~/.ssh/predixvm.pub`), or from any machine
that still has access:
`ssh-copy-id -i ~/.ssh/predixvm.pub predixbuilds@34.46.14.224`. Nothing remote
was modified.

---

## §0.0.80 — Verification pass: end-to-end quota, one device policy, security invariants as tests (2026-08-19)

Follow-up to §0.0.79. Nothing here is a new feature; it is the difference
between "implemented" and "verified", plus the two things §0.0.79 explicitly
left undone that could be done without a VM.

**The quota chain is now proven end to end.**
`tests/test_face_quota_e2e_live.py` runs the acceptance scenario against the
running backend and real Postgres — buy 2,000 photos through the **real store
order path**, 1,900 uploaded, 301 refused whole, the 100 that fit reserved and
committed, the next photo refused, quota extended, the same 301 accepted. The
two earlier suites (module-against-Postgres, HTTP-against-a-double) both stayed
green through a break anywhere in `pricing_catalog → store_features → a paid
invitation_order → resolve_face_photo_limit → face_quota → the API`. This one
does not.

> **"+500" has no SKU.** The owner price book is 2000/3000/5000 plus a WhatsApp
> quote, so "extend by 500" is expressed as buying the next tier and letting
> `MAX(face_photo_limit)` raise the allocation. Do not invent a +500 price to
> make a UI read nicer.

**Two direct-DB steps, and only two**, both documented in the module docstring:
linking a paid order to a wedding (fulfillment's job) and fabricating
already-uploaded photos (real uploads need S3 credentials this box lacks).

> **asyncpg pools are bound to their creating event loop.** The first version of
> that file made the pool in one `asyncio.run()` and used it from another in each
> test, failing with `InterfaceError: another operation is in progress` — an error
> that says nothing about loops. The fixture is async now. Expect this trap in any
> new suite that mixes `asyncio.run()` with a pooled DB.

**`GET /api/invite/{slug}` moved off the DB-persisted limiter.**
`server.check_rate_limit` buckets by **UTC calendar day** and writes a durable
row, so an exhausted counter stayed exhausted until midnight — one heavy test
run poisoned every later run of the day with ten 429s that read exactly like a
regression. **It cost three debugging detours in one session.** It is now on
`cache_backend.rate_limit_allow` with a rolling window, and the suite passes
twice consecutively, which it did not before. The call also switched to
`get_client_ip()`; the old `request.client.host` let a client mint a fresh
500-request budget with a forged `X-Forwarded-For`.

[`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md) is the inventory that has to
precede any further removal — all five mechanisms, a per-endpoint migration
table, and why three of them have **not** moved. Short version: the guest-write
limiters (RSVP, wishes, 3–5/day) stay on Postgres because the canonical limiter
is global only when Redis is up and fail-open otherwise; the gallery-unlock
limiter returns a lockout duration a boolean helper cannot express; the abuse
middleware is global request shaping, not a per-endpoint limiter.

**One client performance policy.**
[`lib/performanceProfile.js`](frontend-v2/src/lib/performanceProfile.js) — 11
tiers controlling thumbnail width, preview width, upload concurrency, prefetch,
decode concurrency, gallery batch size, animation level and virtualization.
`multipartUploader.pickConcurrency` and `LivePhotoWall.pageLimit` were each
reading `navigator.connection` separately; both now read this. Signals are
scored only where the browser exposes them, so Safari and Firefox are not
punished for withholding `deviceMemory`. `reportDecodeMs` / `reportUploadKbps`
feed observed medians back in (demote fast, promote slowly); the gallery's
presigned PUT times itself, so the loop is fed by the upload that actually runs.

> **`yarn build` never evaluates a tier** — a policy that scored every device
> identically would build clean. The 13-assertion self-check runs under node and
> is wired into pytest (`test_performance_profile.py`).

**Security invariants are tests now, not a one-off grep.**
`tests/test_security_sweep.py` (13) pins: no interpolated SQL outside the
adapter, the adapter's identifier validators, no shell execution, no unsafe
deserialization, server-derived S3 keys, the commit-upload traversal guard, the
face bucket never falling back, server-derived Rekognition collection ids, no
`rekognition:ListCollections`, and no AWS/Razorpay secret in the built bundle.
`tests/test_deployment_invariants.py` (10) pins: only caddy publishes ports,
Postgres/Redis/core are `expose:`-only, `deployed.out` is LF + fails fast +
never sources `.env` + performs no destructive operation, and review mode cannot
be enabled by a plain `compose up`.

> Two of my own checks were wrong before they were right, and both mistakes are
> the same shape: a bare `list_collections` grep flagged `pixora_service`'s
> saved-post route, then a widened one flagged the two comments in
> `aws_service.py` that explain why the call is absent. It now matches
> `.list_collections(` — an actual call — and was **proved non-vacuous** by
> injecting one and watching it fail. An over-broad security check gets muted,
> which is worse than not having one.

**Responsive sweep, real browser, real geometry.** Landing, pricing and auth at
320/360/375/390/412/430/480/600/768/1024/1280/1440/1920: no horizontal scroll,
no content overflow. The detector ignores non-interactive, non-text elements —
the hero glows bleed past the viewport by design and are clipped. Studio gallery
and QR pages were additionally confirmed to **render** (quota panel, drop zone,
Find My Photos card, no console errors); the two 409s in the log are the
`GALLERY_NOT_ENABLED` response the QR card handles.

**Gates:** pytest **816 passed / 3 skipped / 1 xfailed** · event gate **76/76,
1,958 checks ALL GREEN** · performance self-check 13/13 · gallery presign
self-test 22/22 · `yarn build` clean · secret + admin-deref + SEO scans clean.

### Blocked from this machine — not "done", not "failing"

No `aws`, `docker` or `gcloud` binary here, no `~/.aws`, and the one SSH host in
`~/.ssh/config` (`predixvm`) rejects the key. So **every VM and AWS step is
unrun**, not passed:

* `git pull` on the VM, `./deployed.out`, Docker build, container health checks
* `aws sts get-caller-identity`, bucket encryption / public-access-block /
  versioning checks, `aws_smoke_test.py` read-only **and** `--write`
* live Rekognition: index/search, multi-face, no-face, retry, dead-letter,
  cross-event isolation
* a real browser→S3 upload proving bytes bypass the VM
* original-byte-size preservation against a real S3 object

`scripts/aws_smoke_test.py` and its two-lane design (§0.0.78) are what should
run there. Nothing in this session weakened an IAM policy or an S3 setting.

---

## §0.0.79 — Face-match quota reserved per batch, one QR per wedding, studio pricing moved behind sign-in (2026-08-19)

**The gap.** `resolve_face_photo_limit()` already knew how many face-match
photos a wedding had bought, and `index_photo_job()` already refused to index
past it. That guard runs **per photo, at index time** — far too late to tell a
photographer that their 301-photo drop will not fit in the 100 photos they have
left. By then 301 objects are in S3, 301 rows are in the database, and the
studio has a half-delivered event.

**[`backend/face_quota.py`](backend/face_quota.py)** adds the missing step and
**no second source of truth**. The allocation still comes from
`resolve_face_photo_limit`; this only tracks holds against it:

```
allocated = the purchased SKU (None => legacy uncapped order)
used      = accepted gallery_photos rows
reserved  = SUM(requested - committed) over live holds
remaining = allocated - used - reserved
```

`used` counts **accepted** photos, not indexed ones. A photo whose Rekognition
indexing failed still occupies a purchased slot — the studio bought capacity for
a photo, not for a successful AWS call. Releasing quota on an indexing failure
would let a flaky AWS day silently inflate the allocation. Duplicates insert no
row, so they consume nothing and their share of the hold is returned.

**All-or-nothing.** 1900 used + 301 requested against 2000 is refused whole,
with the numbers needed to explain it and the real top-up SKUs from
`pricing_catalog`. **There is no owner-approved +500 or +1000 photo SKU**, so
none is offered — anything outside the three priced tiers goes to a WhatsApp
quote. Do not add one without an owner price.

**Concurrency is why this is a module and not an `if`.** `available` is two
COUNTs plus a SUM, so read-then-write is check-then-act: two tabs reserving the
last 100 slots would both read `remaining=100` and both win. `reserve()`
serialises on a **Postgres session advisory lock keyed by the wedding** — other
weddings never contend, and a dead process drops its connection and releases the
lock. A db handle with no pool (the unit tests' FakeDB) falls back to a
process-local mutex **and logs a warning**; it does not pretend to the same
guarantee.

> The concurrency test was confirmed non-vacuous: disabling the advisory lock
> makes `test_case5_concurrent_reservations_cannot_oversell` fail. If you touch
> `_profile_lock`, redo that check — a mutex that silently stops locking looks
> identical to one that works.

**Every lane that can create a gallery photo goes through it.** `bulk-upload`
reserves the whole batch; `live-upload` (token, no login) reserves too — the
token authorises *who* may upload, never *how many*; `presign-upload` takes a
one-slot hold inline when the client did not pre-reserve, which is what stops an
older or hand-rolled client from presigning past the quota. Holds are
re-verified at commit time, and **a reservation id from another wedding is a
404** — it is never a bearer token for someone else's capacity.

**One face-match QR per wedding.** Every QR in the tree was an *invitation* QR
(one per `event_invitation`, opening that ceremony's page). None was a
face-match entry point, so a studio printing a "scan to find your photos" sign
had nothing to print. `GET /api/admin/profiles/{id}/face-match-qr` is that code
— **per wedding, not per ceremony**, because the Rekognition collection is per
wedding, so per-ceremony codes would be several QRs pointing at one identical
search. It resolves to the existing `/invite/{slug}/live-gallery`; no second
face-match surface was created. Gallery not enabled → `409 GALLERY_NOT_ENABLED`
rather than a code that leads nowhere.

> The QR target carries the wedding's public slug, which is already on every
> invitation and in every invitation QR. A separate opaque token would be a
> second identifier for a page the first already reaches. The control that
> actually gates the photos is `gallery_privacy` (access code + device trust).

**Public pricing.** `/pricing` rendered studio portfolio plans across four
billing cycles, storage add-ons and face-match SKUs — the same figures the
signed-in panel already renders from the same backend. It now prices
invitations (the individual offering) and signposts the rest.
**Nothing moved into the panel because the panel already had it**:
`/studio/plans`, `/studio/studio-storage`, and now each event's gallery.
`StudioPlanPicker` / `PlanUnlocks` are left in the tree unreferenced so
restoring the public cards is a revert, not a rebuild.
`tests/test_public_pricing_separation.py` pins both halves.

**Open concern, stated once:** a prospective photographer can no longer see plan
prices before signing up. Real conversion risk; confined to one page and one
commit so it is cheap to reverse.

**Requirements split.** `requirements.txt` was a flat `pip freeze` that
`backend/Dockerfile` installs verbatim, so every production container shipped
black, flake8, mypy, isort and pytest. Those 15 moved to
`requirements-dev.txt`; 29 pins were removed entirely (openai/tiktoken/HF stack,
stripe, pandas/numpy, typer's chain, jsonschema, fsspec, filelock, …) — each
with zero references in `backend/`, `scripts/`, `deploy/` or `ops/`, and none
required by a kept package. Both files verified to resolve against PyPI. CI now
installs both. **`numpy==2.4.6` was the pin forcing Python ≥3.11 and nothing
imported it** — CLAUDE.md's note about 3.10 is now stale for that reason.

**[`deployed.out`](deployed.out)** deploys/updates the stack on a VM. Validates
tooling, docker, compose and every required `deploy/.env` key — **reading values
with `sed`, never `source`**, so secrets never enter the shell — fast-forwards
the branch, builds the frontend *before* Caddy needs it (a missing `dist/` is a
white page, not a container failure), then gates on the backend's own health,
the app's DB pool, the worker process, Caddy serving, and resolved bucket
routing. Never touches a volume, never writes `.env`, never prints a credential.
`--review` adds plain HTTP on the VM's IP via a **separate** `Caddyfile.review`
+ compose overlay, so production's single-site HTTPS config is untouched and the
IP lane cannot be switched on by a plain `compose up`. `.gitattributes` pins LF
+ the exec bit — a CRLF shebang fails on Linux and nowhere else.

**Gates:** pytest **788 passed / 3 skipped / 1 xfailed** (baseline 754/2) ·
event gate **76/76, 1,958 checks ALL GREEN** · `check_seo_routes` clean (20
paths) · gallery presign self-test 22/22 · `yarn build` clean · secret +
admin-deref scans clean. QR endpoint exercised against the running backend: 409
when disabled, 200 with a valid 3,430-byte PNG, `cached:true` on the second
call, state restored and verified.

**Not done, and why:**

* **`deployed.out` has never run a real deploy.** This dev box has no Docker
  daemon; only `--check` was exercised (exit 1 on missing docker, exit 2 on a
  bad flag). Run it on the VM before trusting it.
* **The four legacy rate limiters are still there.** New code uses the canonical
  `cache_backend.rate_limit_allow`, which already covers login (per-IP +
  per-identifier), password reset, OTP, face-search (per-IP + per-event), QR
  scan, guest upload, upload-session creation, and now quota-reserve and
  gallery presign. The DB-persisted limiter in `server.py`, the two in
  `ai_service.py`, `gallery_privacy._check_rate_limit` and
  `security_middleware.track_request` were **not** migrated or removed.
* **S3 event notifications were not added.** The pipeline enqueues
  `FACE_INDEX` after the app's own commit, which already knows exactly which
  session completed — safer than depending on S3 delivery. Revisit only if
  out-of-band writes become a thing.
* **No adaptive-performance policy module.** `pickConcurrency()` in
  `lib/multipartUploader.js` already adapts upload concurrency to
  connection/device, and galleries lazy-load, but the 10–15 tier policy was not
  built.

---

## §0.0.78 — AWS least-privilege: runtime and audit checks split, ListCollections dropped (2026-08-19)

The first live smoke run on the VM (identity `maja-backend`, policy
`MAJA-Backend-S3-Rekognition`) came back with **every runtime operation
green** — bucket resolution, head_bucket, all four routings, face isolation,
upload, head_object, presigned GET, unsigned GET denied 403, presigned PUT,
multipart upload/complete/abort, cleanup — and five red checks:
`s3:GetBucketLocation`, `s3:GetEncryptionConfiguration`,
`s3:GetBucketPublicAccessBlock`, `s3:GetBucketCORS`,
`rekognition:ListCollections`.

**Those five were not fixed by widening the policy.** They are
infrastructure-audit operations the application never performs; granting them
would let the app's credentials read every bucket's configuration and
enumerate every Rekognition collection in account 655671523450 for zero
application benefit. The architecture changed instead:

- **Two lanes.** RUNTIME checks use the application identity and must pass.
  AUDIT checks (bucket configuration) use a *separate read-only profile* named
  by `AWS_SMOKE_AUDIT_PROFILE`, or report `SKIP-AUDIT` and never affect the
  exit code. Statuses are now `PASS` / `FAIL` / `WARN` / `SKIP` /
  `SKIP-AUDIT` / `SKIP-NOT-CREATED`; only `FAIL` exits 1.
- **The audit session may never do runtime work** — a runtime check that
  passed on admin credentials would prove nothing about production.
  `tests/test_aws_least_privilege.py` asserts that structurally (the runtime
  lanes must not reference `audit_s3`, and the four config-read APIs must
  appear only in the audit lane).
- **`rekognition:ListCollections` is gone from the backend entirely.**
  `aws_service.describe_face_collection()` is the least-privilege replacement,
  and `healthcheck()` now probes liveness by describing
  `HEALTH_PROBE_COLLECTION` — an id that cannot exist, where `ResourceNotFound`
  IS the healthy answer. The old probe reported `AccessDenied` as
  "Rekognition unreachable", which was simply wrong under least privilege.
- The Rekognition lane now exercises the six actions the app really uses
  (Create/Describe/Index/Search/DeleteFaces/DeleteCollection). A synthetic
  image has no face, so IndexFaces returns zero records and SearchFacesByImage
  rejects on content — both prove the *permission*, which is what is under
  test. Only `AccessDenied` fails.
- `--profile-id <wedding profile id>` derives the collection id the app
  derives and distinguishes **`SKIP-NOT-CREATED`** (gallery never enabled) from
  `FAIL` (AccessDenied).

**Write-path safety hardened:** every destructive call routes through
`guard_prefix()`, which refuses any key outside this run's
`_smoketest/{uuid}/` prefix and any prefix that isn't a smoke-test one. Its
own test caught a real bug — the abort-path call was unguarded. Cleanup now
aborts unfinished multipart uploads *before* deleting objects (an incomplete
upload is invisible to an object listing and still bills) and runs in a
`finally`, so a partial failure still cleans up.

Docs: `docs/AWS_CONNECTION.md` §4 (two lanes, audit profile + its 4-action
policy), §5 (health probe), §6 (the deployed policy plus a per-call permission
matrix). `docs/DEPLOYMENT.md` §5.5 marked superseded. `TestRuntimePermissionMatrix`
fails if a backend S3 call appears that the matrix does not document, so the
policy cannot silently lag the code.

Gates: pytest **753 passed / 3 skipped / 1 xfailed** · event gate **76/76,
1,958 checks** · `yarn build` clean · secret + admin-deref scans clean · smoke
test exit 2 with guidance on a credential-less box; simulated run confirms the
audit lane reports SKIP-AUDIT and contributes zero failures.

**Still external:** run `python scripts/aws_smoke_test.py --write` on the VM
(runtime must be all PASS), and optionally create the read-only audit profile
to turn the four `SKIP-AUDIT` lines green.

---

## §0.0.77 — AWS four-bucket connection: code side complete, live verification pending credentials (2026-08-19)

Target infra (already provisioned by the owner): account **655671523450**,
region **us-east-2**, four private buckets `maja-{portfolio,invitations,event}-media-2026`
and `maja-face-private-2026`. Operator runbook: [`docs/AWS_CONNECTION.md`](docs/AWS_CONNECTION.md).

**IMPORTANT — this dev box has NO AWS credentials** (no CLI, no `~/.aws`, no
env keys). Everything below is verified offline; the live smoke test is
written and proven to fail cleanly here (exit 2) and must be run on the VM.

**Blocking bugs found and fixed (all would have broken a live deploy):**
- `_aws_kwargs()` defaulted region to **ap-south-1** → every call against the
  us-east-2 buckets would fail with PermanentRedirect. Now defaults to
  `us-east-2` (`aws_service.DEFAULT_REGION`).
- Empty-string credentials (`AWS_ACCESS_KEY_ID=` in a .env, which is normal)
  were passed to botocore as REAL credentials, turning instance-role auth into
  SignatureDoesNotMatch. Now only non-empty keys are passed; otherwise the
  provider chain (env → profile → container/instance role) runs, which is the
  preferred production path.
- `is_configured()` required env keys **and** the obsolete single
  `AWS_S3_BUCKET` → a correct four-bucket deploy using an instance role read
  as "AWS off", silently disabling five feature paths (auto_moderation,
  event_media CDN push, face_ops, gallery_features, invitation cleanup). Now
  `credentials_available() and bucket()`.
- `aws_service.bucket()` returned `""` on a four-bucket deploy, so ~14
  pre-split modules issued requests against a bucket literally named empty.
  Now falls back to the EVENT bucket.
- `index_photo_faces` hardcoded the legacy bucket for Rekognition's
  `S3Object` → indexing pointed at the wrong bucket once photos moved. Now
  takes `bucket_name=`.
- `create_face_collection` surfaced raw AWS errors as a bare 500 on
  gallery-enable. Now returns `{"created": False, "error": ...}`.

**Canonical env names** (old `S3_BUCKET_<CAT>` still accepted, warns once):
`AWS_S3_PORTFOLIO_BUCKET` / `AWS_S3_EVENT_BUCKET` /
`AWS_S3_INVITATIONS_BUCKET` / `AWS_S3_FACE_BUCKET`. **`face` never falls
back** — private biometric data must not land in a shared bucket, so an unset
face bucket disables the path instead.

**Where the resolver lives, and why it matters:** `media_storage.BUCKET_ENV` /
`bucket_for()` is AUTHORITATIVE; `aws_service` delegates lazily. A first
attempt put it in `aws_service` and broke 12 test modules — 46 suites install
a permissive `aws_service` stub whose every attribute is a no-op, so routing
that delegated into it resolved every bucket to `None` under test while
looking correct in production. Do not move it back.

**Also shipped:** `scripts/aws_smoke_test.py` (read-only + `--write`; isolated
`_smoketest/{uuid}/` prefix, refuses buckets not ending `-2026`, verifies
presigned GET works AND unsigned GET is denied, full multipart + abort, then
proves zero objects remain), `deploy/s3-cors.json` + `apply_s3_lifecycle.py
--cors` (CORS was docs-only before; **ExposeHeaders must include ETag** or
multipart completion silently hangs), four-bucket-aware `backup_media.sh`
(face bucket excluded unless `BACKUP_INCLUDE_FACE=1` — backing up 2-day
biometric data defeats its retention), AWS entries in the production-readiness
warnings (warn-only: media config must not take the site down), and the
commented `~/.aws` mount in docker-compose (left commented deliberately:
an empty `AWS_PROFILE` makes botocore raise `ProfileNotFound` for a profile
named `""`, which would break existing deploys).

Gates: pytest **711 passed / 3 skipped / 1 xfailed** · event gate **76/76,
1,958 checks** · `yarn build` clean · secret + admin-deref scans clean ·
smoke test exit 2 with correct guidance, and step-1 config PASSes for all four
buckets when they are set.

**Still external (cannot be done from code):** real credentials on the VM,
then `python scripts/aws_smoke_test.py --write`. The xfail in
`tests/test_media_sessions_live.py` XPASSes the moment AWS is live — that flip
is the cheapest signal the connection works.

---

## §0.0.75 — Pricing completion wave: every §0.0.74 open item closed + one real P0 found by adversarial testing (2026-08-18)

Continuation of §0.0.74 under the owner's "complete and perfect" directive.
docs/PRICING_REDESIGN_2026.md §9 now splits resolved items from the three that
genuinely need owner input (storage middle-tier prices + 750 GB, founding
discount values, Pro-vs-Advanced capability split).

**P0s found and fixed this wave:**
- **Pending-subscription race (found by the new adversarial suite):**
  create-subscription's pending-row dedupe was check-then-insert; 8 concurrent
  creates minted 2 pending subs → two Razorpay orders → double-charge risk.
  Fixed at the DB: partial unique index
  `uniq_pending_sub_per_studio_product_tier_cycle` (WHERE status='pending') +
  `UniqueViolationError` catch that returns the WINNER's pending row to a
  losing racer; stale >24h pendings get expired + one retry. 8-way live race
  test passed 3 consecutive runs.
- **Founding apply-catalogue landmine (found by the owner):** the live admin
  button ran a stale 3-tier catalog matched by TIER NAME — on today's DB it
  would have rolled Basic/Premium back to pre-redesign prices and collided
  with plan_portfolio_pro's id. `apply_founding_portfolio_catalogue` now
  derives from pricing_catalog.PORTFOLIO_PLANS by canonical id
  (founding == regular, inert); `tests/test_founding_pricing.py` rewritten to
  run `apply_pricing_2026` FIRST (the realistic precondition the old test
  never exercised — it seeded an empty FakeDB, which is why the collision
  hid). 49/49.

**Shipped:**
- Storage renewal grandfathering (`studio_storage.py`): a studio may renew its
  own deactivated plan at the contractual price incl. founding rate;
  plans endpoint returns a `grandfathered` card to its owner only.
- Legacy invitation-subscription product retired from sale
  (`apply_pricing_2026_v2`, own marker); settled subscribers keep
  renewal-only access to their tier.
- Truthful plan differentiation: verified every consumer gates
  Pro/Advanced/Premium/Custom identically — a "pro" remap would DOWNGRADE
  paying studios (name-inference fallback lacks "advanced"/"custom");
  documented in pricing_catalog, guarded by test_plan_differentiation_2026.
- Face photo-limit enforced at `gallery_features.index_photo_job` (the one
  choke point all index paths share); limit = max across the wedding's paid
  orders; legacy flat ai_face_match = unlimited; reindex never self-blocks.
- Suite `video` component → `sections_enabled.video`; `physical` →
  `deliverables` on the payload.
- Sign-up funnel wired end-to-end: Pricing → validated sessionStorage stash
  (`src/lib/pricingSelection.js`) → auth → dashboard banner →
  `/studio/order/invitation-suite` (`StudioSuiteCheckout.jsx`, server
  re-priced). Verified live including the signed-out hop.
- MarketingNav mobile collapse (hamburger + drawer <860px) — Sign in/CTA were
  rendering past the viewport edge, untappable, on every marketing page.
- Adversarial suite `test_pricing_adversarial_2026.py` (26 tests): tamper
  matrix, replay/webhook dedup, concurrency, GST/consistency chains, admin
  sync, historical immutability. This is the suite that caught the race.

**Traps re-confirmed:** the persisted 500/day `invite_view` counter tripped
AGAIN this wave (10 "failures" that were just 429s) — clear
`db.rate_limits.delete_many({'endpoint':'invite_view'})` before believing
invite-view test failures. `$?` after a pipe reports tail's exit code, which
hid a real traceback twice.

**Independent audit round (fresh-eyes agent, 16 adversarial questions):**
14/16 clean with live reproduction. Its headline P1 — founding prices were
DISPLAY-ONLY: `_quote` never read `durations_founding`, so an advertised
"₹299/month founding" would have charged ₹499 — plus a P2 (the founding
console could write free-form regular `durations`, diverging page from
checkout) and two P3s (partial founding PATCH deleted unmentioned cycles;
no double-submit guard on suite order create). ALL FOUR FIXED:
- `_quote` charges the founding rate when founding mode is live and the rate
  is genuinely below regular (setup fee never founding-discounted);
  `is_founding_price` on the quote.
- `set_portfolio_plan_prices`: regular edits anchor on cycle "1" and re-derive
  the ladder via sync_plan_durations (free-form per-cycle regular refused);
  founding edits merge per cycle.
- Suite order create reuses a <15-min identical unpaid order instead of
  minting a second Razorpay order on double-submit.
- `tests/test_founding_checkout_2026.py` (6 live tests) is the display==charge
  cross-check that did not exist; the suite-dedupe guard has an in-process
  stub-gateway test in test_store_pricing_2026.py.

Gates at close: pytest **688 passed / 3 skipped / 1 xfailed** · event gate
**76/76 ALL GREEN** · founding 49/49 + migration self-tests ·
`yarn build` clean · secret + admin-deref + bundle-secret scans clean.

---

## §0.0.74 — Pricing redesign 2026: owner price book, psychological rounding, four product surfaces (2026-08-18)

The owner supplied the approved price matrix; the whole plan and every number
live in [`docs/PRICING_REDESIGN_2026.md`](docs/PRICING_REDESIGN_2026.md) — read
it before touching any price. **`backend/pricing_catalog.py` is the single
source of truth**; nothing customer-facing may restate its numbers.

**What changed (mechanics, not numbers):**
- `psychological_price_paise()` reproduces all owner rounding examples exactly
  (round down to …99; bump up within ₹10 unless that leaves a thousand-block —
  ₹5,089.80→₹4,999 but ₹20,389.80→₹20,399). Applied only to multi-month totals;
  monthly passes through (₹499 must NOT become ₹399).
- Portfolio is now FIVE plans (Basic 499 / Pro 899 / Advanced 1399 / Premium
  1999 / Custom 1999 + ₹5,000 one-time setup, first purchase only). Yearly
  cycle discount 20%→15% everywhere. Portfolio totals are **GST-INCLUSIVE**
  (`gst = total − total/1.18` on the quote); invitation/backup subscription
  products keep GST-on-top.
- The old `base_monthly` vs `durations` divergence is DEAD:
  `subscription_service.sync_plan_durations` recomputes `durations` on every
  editor write (upsert_plan AND pricing_hub update_plan), `list_plans` card
  previews read the same finals as `/quote`, and
  `pricing_migration.apply_pricing_2026` (marker-gated:
  `app_settings.pricing_2026_v1_applied`) seeded the 5 plans once.
- Storage: `studio_storage.py` CATALOG_VERSION 3 — 50 GB ₹299 and 1 TB ₹2,999
  owner anchors (no founding rate), 100/250/500 GB carried at v2 prices with
  `approved: False` (owner re-price pending), **750 GB does not exist — never
  invent it**. `subscription_plans[product=storage]` rows are deactivated;
  StudioStorage.jsx owns the buy flow now (StudioPlans dropped its storage tab).
  The public storage endpoint is DB-driven (admin CRUD stays live).
- New products: face-match photo-count SKUs (2000/3000/5000 → ₹5k/7k/10k,
  `face_photo_limit` stamped on orders, custom = WhatsApp CTA via
  `VITE_SUPPORT_WHATSAPP` only) and `invitation_suite` orders (3 tiers × 3
  additive components; basic→SILVER, premium→GOLD, custom→PLATINUM).
- Route fix: `enhanced_admin_service`'s GET shadowing
  `/api/admin/pricing/designs` renamed to `/designs-enhanced`.

**Traps for the next session:**
- `test_founding_pricing.py` / `test_pricing_migration.py` are `__main__`
  self-tests pytest does NOT collect — run them directly
  (`python -m tests.test_founding_pricing`), and don't trust `$?` after a
  pipe: `python … | tail` reports tail's exit code, which hid a real
  traceback this session.
- `admin@wedding.com` now has `is_test: true` locally (test-buyer bypass, ₹0
  orders — production-killed by `_is_production`). That's how the live
  order-total tests execute without Razorpay keys.
- The FakeDB (`tests/test_storage_orchestrator.py`) now has `insert_many`.

**Owner decisions still open:** §9 of the plan doc — storage middle-tier
re-prices + 750 GB, storage renewal grandfathering (old 50GB/1TB subscribers
renew at the new higher anchors), portfolio feature matrix, founding prices for
the new plans, legacy invitation-subscription retirement, face-limit hard
enforcement, suite→builder section wiring, sign-up funnel consumer for the
pricing-page selection stash.

Gates at close: pytest **614 passed / 3 skipped / 1 xfailed** · event gate
**76/76, 1,959 checks ALL GREEN** · `yarn build` clean · secret + admin-deref
scans clean · /pricing verified rendering the approved matrix in-browser.

---

## §0.0.73 — Old-repo parity: close the gaps the UI rebuild left behind (2026-08-17)

Driven by [`docs/PARITY_AUDIT_OLD_VS_NEW.md`](docs/PARITY_AUDIT_OLD_VS_NEW.md)
(old repo = `M04(Mani)/maja-v2`, the direct ancestor). The audit's finding: the
backend was at or ahead of parity; the gaps were almost entirely "backend
shipped, UI never wired up", because the old product ran on a 387-file CRA and
the rebuilt `frontend-v2` shipped with 144.

**Owner constraint restated:** the ONLY account persona is the
photographer/studio, plus super-admin and anonymous public visitors. Couples are
scoped `event_client` tokens, not accounts. Credits stay dead.

**Money / reliability (backend)**
- **All 8 Razorpay flows now settle without the browser.** Webhooks added for
  subscriptions, link reactivation, donations, studio storage and portfolio
  build-help; shagun uses a 15-min reconcile sweep instead (it runs on each
  photographer's OWN keys, so a platform webhook can't authenticate it) via a
  write-ahead `shagun_intents` row. Each flow's `/verify` and its webhook now
  share ONE settlement helper, so side effects can't diverge.
- **Real-money refunds exist** — `refunds_service.py`, super-admin only,
  write-ahead row + CAS + over-refund guard + `/sync` reconciliation. Previously
  every refund was issued by hand in the Razorpay dashboard.
- **Gift codes / referrals can be redeemed again**, in a post-credits currency:
  storage-GB (feeds the existing `storage_addons` → `storage_bonus_bytes` path)
  or a flat-INR discount code minted into the existing `discount_codes`
  collection that `/api/public/discount/validate` already spends. No new
  machinery, no credits.
- `event_payments.create_order` now sets `payment_capture: 1` explicitly, like
  the four hand-rolled `order.create` calls — otherwise those orders inherited
  the account's capture setting.

**Bugs found while doing the above (all pre-existing, all fixed)**
- `link_reactivation` extended `expires_at` BEFORE its CAS flip → a webhook
  racing the browser double-extended the link.
- `studio_storage.verify_payment` had no idempotency guard at all → double call,
  double expiry.
- `pg_adapter._bind()` only coerced timestamp/date, so a promoted **boolean**
  column got `'true'` as text and asyncpg refused the bind — that is why
  featuring a guest wish 500'd (admin side too). Now covers boolean/integer/
  numeric. Test: `tests/test_pg_adapter_typed_binds.py`.
- **Every coupon minted in the console discounted ₹0.** `super_admin_v2` wrote
  `discount_type`/`discount_value`/`active`; both spenders read
  `type`/`value`/`is_active`, so `doc.get("value", 0)` → 0, and deactivating a
  coupon did nothing. The arithmetic existed twice, which is why it was wrong
  twice — it now lives once in `pricing_engine.coupon_discount_paise`, accepts
  both vocabularies for rows already in the DB, and
  `tests/test_coupon_field_contract.py` fails if either checkout regrows a copy.
- **`test_credits_retired.py` was silently green** — it recorded failures into a
  module global pytest never read, so it printed FAIL and reported pass. Now
  guarded so a failure fails the run; turning it on immediately exposed a stale
  assertion demanding `POST /credit-packs → 410` when that route had been
  DELETED (404 — stronger than asked). Re-pinned to the real invariant, plus a
  rename-proof scan that no module calls anything moving a credit balance.
- Two test modules mutated `os.environ` at import scope; pytest imports every
  module at collection, so they leaked Razorpay config into unrelated suites
  regardless of run order. Scoped to `monkeypatch` fixtures.

**Guest-facing** — 13 invitation sections the backend already served but the
rebuilt UI never rendered: about-the-couple, family details, bride/groom bios,
pre-wedding, save-the-date video, live stream, song requests, check-in, contact,
parking, find-my-room, honeymoon fund, travel, ambient music (user-initiated),
add-to-calendar (client-only `.ics`). Plus live NOW/NEXT timeline badges and an
inline food-donation teaser. Components under `src/components/invitation/`.

**Couple portal** — `CoupleAccess.jsx` went from ~2 areas to 5 tabs: contracts +
e-sign, proofing/print orders, RSVP list + CSV export, detailed analytics, wish
moderation. All five APIs were already live and simply uncalled. `clientAuth.js`
now handles 401 (clears the token, explains the link expired) instead of
silently dying at the 7-day mark.

**Studio panel** — gallery upload-methods (Phone Live QR + SD-card URL + token
regen, previously dead chips), gallery password/privacy admin, gallery settings;
cloud-backup upload/folders/zip (there was no way to put a file IN); portfolio
album/work management; post-wedding thank-you editor; per-guest voice invites.
The QR is a vendored byte-mode encoder (no new npm dep) cross-checked bit-for-bit
against the reference implementation.

**Super-admin** — create/block/suspend studios (the dashboard was read-only by
its own comment), MFA enroll/verify/disable, platform-wide audit log, pricing hub
(categories, feature-packs, link-durations, campaigns, plans, community,
simulator), founding-100 controls, platform settings/CMS/theme-rollout/coupons/
login-history, BI overview. New routes wired in `App.jsx`:
`/admin/pricing-hub`, `/admin/founding`, `/admin/platform`.

**Also** — ceremony slug URLs work again (`/invite/{slug}/{ceremony-slug}`;
`WeddingEvent.slug` was written but never read, so ceremony URLs were guessable
enum names); host-editable `accent_color` + closing text/signature/animation
restored; `/studio/pixora-analytics` now redirects to the real Pixora analytics
panel instead of the unrelated insights page.

**Deliberately NOT shipped (decisions, not omissions)**
- **Impersonation UI.** Backend is fine, but the app holds one Bearer identity;
  swapping it flips `admin.role` and `RequireSuperAdmin` bounces the admin into
  `/studio/*` with no way back. Needs a persistent banner anchored in the shell
  first. MFA shipped without it.
- **Plan-price representation.** `subscription_service._quote` prices from
  `base_monthly`; `pricing_engine.compute_plan_total` reads `durations`. Nothing
  is mis-charged (checkout is internally consistent and the resolver refuses
  rather than inventing ₹0), but the two editors disagree about which field is
  authoritative. Bridging means duplicating the CYCLES multipliers — a real
  mispricing risk — so it is documented at `pricing_engine.compute_plan_total`
  and needs an owner call.
- **Bespoke tier.** The old hand-authored pipeline (`kit.js`, per-couple JSX,
  `GeneratedInvitationRoute`, scaffolder) is still gone, while the ₹9,999
  "dedicated designer" tier is still sold. Rebuild or reword — owner call.

**Gates** — pytest **462 passed / 2 skipped / 1 xfailed** (was 392); event gate
**76/76, 1,951 checks ALL GREEN**; `yarn build` clean; secret + admin-deref scans
clean; live smoke: new surfaces 403 (guarded, not 404), public invite 200 with
the new fields present.

---

## §0.0.72 — Media storage architecture: direct-to-S3 multipart, 4-bucket layout, sessions (2026-08-17)

The canonical media-storage pass. Read [`docs/MEDIA_STORAGE.md`](docs/MEDIA_STORAGE.md)
for the full architecture; this entry is the change ledger.

**New core (contract layer)**
- `backend/media_storage.py` — single source of truth for bucket routing
  (`S3_BUCKET_PORTFOLIO/EVENT/INVITATIONS/FACE`, each falling back to legacy
  `AWS_S3_BUCKET` so dev/test is unchanged), canonical key builders
  (`photographer/{pid}/event/{eid}/photos/...`, invitation + portfolio +
  `event/{eid}/sessions/{sid}/selfie`), MIME allowlists, per-kind byte caps,
  quotas, multipart tuning, session TTLs — all env-tunable. Has a `__main__`
  self-check.
- `backend/aws_service.py` — grew `bucket_name=` on every helper plus the full
  multipart API (`create/presign part/list_parts/complete/abort`), `head_object`,
  `delete_object`. CloudFront stays optional: `generate_signed_url` only uses CF
  for the legacy default bucket, presigned-S3 fallback everywhere else.

**Direct-to-S3 upload sessions** — `backend/upload_sessions_service.py`
(`build_upload_sessions_router(db, require_admin)`, mounted in server.py next to
storage_upload). 8 routes under `/api/media`: create session (ownership-verified
against `profiles`/`events`, rate-limited, active-cap, quota-checked via
`media_assets` aggregate; single-PUT ≤32MB else multipart), batch part presign,
GET session (resume — lists uploaded parts), complete (CAS created/uploading→
completing→available, server-side `head_object` size verification — the browser's
word is never trusted), abort, upload-locations (the "upload here" namespace),
assets list/soft-delete. Canonical `media_assets` record on completion. Bytes
never transit the app tier. Cleanup: `cleanup_expired_upload_sessions` (CAS-claim
→ abort MPU/delete object → expired) on the scheduler hourly (`upload_session_hourly`).

**Face-search sessions** (`gallery_features.py`, `face_consent.py`)
- New selfies → private face bucket (`bucket_for("face")`) at
  `event/{profile_id}/sessions/{session_id}/selfie`; `selfie_bucket` stored per
  row; every reader/deleter (search job, hourly sweep, consent withdraw) honors
  it with legacy-bucket fallback for old rows.
- `expires_at` now ENFORCED at read (face-results / zip-manifest → 410).
- Retry-within-session: `POST /api/public/gallery/{slug}/face-search/{sid}/retry`
  — same consent/rate limits, CAS failed|done→queued, retry cap 5
  (`FACE_SESSION_MAX_RETRIES`), selfie overwritten in place, absolute 24h
  ceiling never extended. MIME allowlist (415) on all three selfie routes.

**Auth sessions** (`auth_sessions.py`, `auth.py`)
- Absolute family ceiling: `family_created_at` carried through rotation;
  > `REFRESH_ABSOLUTE_DAYS` (90) → family revoked + 401 (the 30-day idle window
  used to slide forever). `SESSION_IDLE_DAYS` aliases the idle TTL.
- `cleanup_auth_sessions` — bounded sweep of `refresh_tokens`/`device_sessions`/
  `jwt_blacklist` (previously grew forever), scheduled daily (`auth_session_daily`).
- `get_current_event_client` now checks `event_client_accounts` enabled —
  disabling client access is immediate, not at 7-day JWT expiry.

**Presign orphan durability** (`storage_upload.py`, `media_reconcile.py`,
`gallery_features.py`) — every presign writes a `upload_intents` write-ahead row;
commit CASes it committed; `_sweep_upload_intents` in the nightly reconcile reaps
never-committed objects (head→delete→expired, retry-bounded, 30d terminal purge).
The old docstring claims about lifecycle rules/pending sweeps were false and are
fixed. No S3 prefix listing anywhere — intent rows are the index.

**Frontend** (`frontend-v2`)
- `src/lib/multipartUploader.js` — `uploadMedia()`: session→parts→complete,
  device/network-adaptive concurrency (`pickConcurrency()`: saveData/2g→1 …
  desktop→4, cap 6), per-part retry w/ fresh presign, resume via
  `resumeSessionId`, AbortSignal, never buffers the file. `src/api/uploads.js`
  wrappers. StudioProfileGallery upload loop now an N-at-a-time pool.
- Perf: vendor chunk split (entry 257KB→45KB), PixoraHub lazy panels
  (177KB→15KB + 9 on-demand), lazy/decoding attrs on grid imgs,
  connection-aware LivePhotoWall batch (12 on 2g/saveData).

**Ops** — `scripts/apply_s3_lifecycle.py` (dry-run default, `--apply`): PAB
all-true, SSE, merge-safe lifecycle rules (`maja-abort-mpu` 2d all buckets,
face-bucket `event/` expiry 2d). `docs/MEDIA_STORAGE.md` = architecture +
runbook (CORS must expose ETag). `.env.example` extended.

**Gates** — new unit suites (38 tests: upload sessions 10, face 12, auth 6,
intents 10) + live isolation suite `tests/test_media_sessions_live.py`
(12 passed, 1 xfail — create happy-path needs real AWS creds; no cross-tenant
holes found). Full pytest **392 passed / 2 skipped**; event gate 76/76
(1,951 checks) ALL GREEN; `yarn build` green; secret scan clean (dummy
`rzp_live_` fixtures renamed); admin-deref scan clean.

**External blockers (owner)** — create the 4 buckets in us-east-2 + set the
`S3_BUCKET_*` envs; run `apply_s3_lifecycle.py --apply`; set bucket CORS
(ExposeHeaders ETag); real AWS creds on the box (turns the live xfail into a
pass); CloudFront per-bucket distributions whenever account verification lands
(code path already falls back to presigned S3).

---

## §0.0.71 — Forensic-findings remediation sweep (2026-08-17)

Input was the two audit docs ([`docs/CURRENT_STATE_AUDIT_2026-08-16.md`](docs/CURRENT_STATE_AUDIT_2026-08-16.md)
and [`docs/FORENSIC_DISCOVERY_2026-08-17.md`](docs/FORENSIC_DISCOVERY_2026-08-17.md)).
Every item below is implemented, has a runnable check, and the full gates
passed after (pytest, event suite 76/76, `yarn build`). What changed:

**Security**
- `gallery_privacy.py` admin routes (get/update/reset-code/logout-all/analytics)
  now enforce ownership via a local `_require_owned_profile` (same pattern as
  `gallery_features.py`). Test: `tests/test_gallery_privacy_ownership.py`.
- Build-queue console (`build_store_admin_router`) is now mounted with
  `require_super_admin` — it spans every studio's orders; `require_admin` let
  any photographer deliver other studios' orders.
- `GET /invite/{slug}/rsvp/check` (30/IP/day) and `PUT /rsvp/{rsvp_id}`
  (10/IP/day) are rate-limited — they were unthrottled phone-number oracles.
- `gallery_privacy.py` now imports `SECRET_KEY` from `auth` (its independent
  `"change-me"` fallback is gone).

**Commerce**
- `subscription_service.verify_subscription` checks the CAS result before its
  follow-on writes — the racing loser no longer double-inserts a payments
  ledger row. `create_subscription` reuses a <24h pending row for the same
  product+tier+cycle instead of minting duplicates. Test:
  `tests/test_subscription_verify_idempotent.py`.
- Razorpay webhook dedupe is insert-first with `id=event_id` (PK = the
  constraint), closing the check-then-insert TOCTOU.
- `paid_links_count` has a writer again: first delivery of an order increments
  the buyer's counter once (`tier_counted` CAS). Tier ladder unfreezes. Test:
  `tests/test_paid_links_counter.py`.

**Correctness**
- RSVP status vocabulary: rows store `yes/no/maybe`; two dashboards counted
  `confirmed/…` and `accepted/…` and always showed zero. All three aggregation
  sites now go through `rsvp_status.normalize_rsvp_status`. Test:
  `tests/test_rsvp_status_vocab.py`.
- `_daily_trash_purge` cascades: child rows in 15 collections + the
  `weddings/{pid}/` S3 prefix + the per-event Rekognition collection are
  removed with the profile (they used to be orphaned forever). Test:
  `tests/test_trash_purge_cascade.py`.
- Admin live-gallery moderation list now merges BOTH live tables
  (`live_photos` + `live_gallery_photos`) via `live_wall_feed` shapes — the
  photographer could previously only moderate one of the two upload paths.

**Hardening**
- Leader locks fail CLOSED when REDIS_URL is configured but Redis is down
  (was: every uvicorn worker became leader and ran each cron job 4×). Dev
  (no REDIS_URL) unchanged. Test: `tests/test_leader_lock_failclosed.py`.
- Timeouts everywhere: boto3 connect/read, asyncpg `command_timeout` (30s;
  index builds 600s), Redis `socket_timeout`, Gemini `wait_for` (45s). All
  env-tunable — see the new block at the bottom of `.env.example`.
- `drive_archive` re-enqueues jobs stuck `queued`/`running` at worker boot
  (its in-process queue previously dropped them silently on restart).
- Missing indexes added to the startup index block in `server.py`
  (gallery_photos.profile_id, face_search_sessions, guests, rsvps phone,
  audit_logs.timestamp, subscriptions/orders/payments studio compounds,
  portfolio + pixora hot paths, live gallery tables).
- Request IDs: incoming `X-Request-Id` accepted (sanitized), stored in a
  contextvar, injected into log lines as `[rid=…]`. Test:
  `tests/test_request_id_logging.py`.

**Backups**
- New `backup` service in `deploy/docker-compose.yml` — nightly encrypted
  pg_dump at 02:00, retention-pruned. `deploy/backup_media.sh` documents the
  S3→backup-bucket sync (media still has NO second copy until this is
  scheduled with real AWS creds — the one thing code can't do from here).
- `ops/backup_db.sh` now encrypts (refuses plaintext unless
  `ALLOW_UNENCRYPTED_BACKUP=1`); `ops/restore_db.sh` decrypts `.enc`.

**Retirements / cleanup**
- `restructured_admin_service.py` credit-plan and legacy monthly-plan WRITE
  endpoints answer 410 (GETs stay as read-only history). Live pricing is the
  Pricing Hub only.
- `/api/public/pricing/portfolio` filters `is_active=False` plans server-side
  (the comped `plan_portfolio_test` no longer reaches the public payload).
- `PhotographerPublic.jsx` imports design tokens from `lib/portfolioDesigns.js`
  (local copy deleted). ⚠ One deliberate divergence kept: `premium_editorial`
  body font (page uses Inter-first, lib says Helvetica-first) — reconcile when
  someone owns the design call. The 8 previously-unloaded fonts named by
  portfolio designs are now actually linked in `index.html`.
- FakeDB got `find_one_and_update` (after-image semantics, matching
  pg_adapter) — needed by new tests, available to future ones.

**Deliberately NOT done** (need owner/product decisions, not code):
event-engine vs profiles consolidation (dormant, flag-gated — leave), live
gallery writer consolidation (read-merge shim covers the symptom; a writer
merge is a migration), face-indexing of guest uploads (privacy/cost call),
event_client localStorage→httpOnly (session-behavior change), the four missing
prod integrations (email/SMS/live Razorpay/deity artwork).

---

## §0 — Session 5 (2026-08-14): the stack was actually run

Session 4 shipped a lot of code that had **never met a running server**. This
session booted the whole thing and drove it. Everything below is an observed
result, not a reading of the source.

### 0.0.1 How to get a working local stack (this is now reproducible)

The blocker was always Postgres. Both PostgreSQL services on the machine
(17 on :5432, 18 on :5433) use `scram-sha-256` for every connection type in
`pg_hba.conf`, and nobody has their passwords. **You do not need them.**
`initdb` builds a brand-new cluster under a password you choose:

```
initdb -D <datadir> -U postgres --pwfile=<file> -E UTF8 -A scram-sha-256 --locale=C
pg_ctl -D <datadir> -l <log> -o "-p 5433" start
```

`run.ps1` now does exactly this on first run and auto-discovers the Postgres
binaries, so the documented one-command launcher finally works on a machine
that is not the original author's. Three real defects were fixed to get here:

| Defect | Effect before the fix |
|---|---|
| `run.ps1 $pgBin` hard-coded to a sibling `wedding-36` checkout | Launcher died at step 1 on any other machine |
| `pytest-asyncio` / `pytest-timeout` missing from `requirements.txt` | `conftest.py` imports `pytest_asyncio` at module scope → collection died before one test ran |
| No `pytest.ini` anywhere, though `conftest.py` **comments** that auto-mode is on | Every async test failed "async def functions are not natively supported". A full run reported **94 failures that were purely this**. Adding `asyncio_mode = auto` took the same run to **100 passed**. |

Note also: the repo needs **Python 3.11+** (Dockerfile and CI pin 3.11). On
3.10 pip cannot resolve `numpy==2.4.6`. Nothing said so before.

### 0.0.2 What passed

- **CI gate** (`python -m tests.run_event_suite`, in-memory FakeDB, the job CI
  actually runs): **76/76 suites, 1,949 checks, ALL GREEN.**
- **API smoke, 45 probes** across every surface built in session 4 — 44 × 200,
  1 × 404 which was a path *I* invented in the probe list (Learning Hub is
  backed by the ported `src/data/learningResources.js`, not an endpoint).
- **Browser sweep as photographer + super-admin**: all **45 Pixora panels**
  across the 8 groups rendered, **zero** errors; ~120 `/api/*` calls, **every
  one 200**. Only non-200 in the whole session was a login `429` I caused.
- **`yarn build`**: green.

### 0.0.3 A trap worth remembering

My first smoke run reported 9 × 404 and I nearly filed them as "module not
enabled for this deployment". **All nine were my own probe paths being wrong.**
A wrong path and a disabled module return the identical status code. The real
paths were `/api/admin/account/summary` (not `/api/account/summary`),
`/api/admin/mfa/status`, `/api/pixora/analytics`, `/api/pixora/portfolio-review`,
`/api/studio/my-weddings`, `/api/admin/pixora/verifications`,
`/api/admin/fulfillment/requests`, `/api/admin/system/health`.

Note the shape: studio-facing security screens live under **`/api/admin/*`**,
because photographers *are* admin records. Copy paths from the frontend api
module; never type them from memory. This is the same class of mistake as
session 4's §0.6 — assuming instead of checking.

### 0.0.4 The full pytest suite: 100 passed, and why the rest fail

The 113-file `backend/tests` suite is an **integration** suite. After the
asyncio fix it reports ~100 passed / ~46 failed / ~40 errors. **None of the
failures trace to anything built in session 4.** They fall into five buckets:

1. **Dead Mongo-era tests** (~24) — `No module named 'pymongo'` / `'motor'`.
   Mongo was removed from this project; these tests were never updated.
2. **Retired-feature tests** (~23) — `test_credit_system.py` (13) and
   `test_universal_invitations.py` (10) exercise credits and normal-user
   accounts, both permanently retired. They correctly receive `410`.
3. **Login rate-limit self-collision** (~29 occurrences) — `/api/auth/login`
   allows 15/IP and 10/identifier per 15 min. A whole-suite run exceeds this
   and throttles itself. Restarting the backend clears it (limiter is
   in-memory; no Redis locally).
4. **Seed-data dependent** (~19) — e.g. `room-lookup` returns `200` with `[]`
   because `seed_demo_invitation.py` creates no guest-room allocations. The
   endpoint is fine; the fixture is absent.
5. **Incomplete test stubs** (8) — `cannot import name 's3' from 'aws_service'
   (unknown location)`. `s3` *is* defined (`aws_service.py:53`, a function);
   the failure is a test's own stub module, whose own comments flag it as
   fragile in full-suite runs. Passes standalone.

**Do not report the raw failure count as a regression count.** Categorise first.

### 0.0.45 Event invitation designs — artwork, picker, preview, public card

The backend had served 10 approved Ganesh Chaturthi designs all along, each
with artwork, an aspect ratio and a text-zone layout. **None of it reached a
user**, for three independent reasons — worth reading as three distinct
failure modes, because each hides differently:

1. **The files were in the wrong frontend.** All 30 WebP pairs lived in
   `frontend/public/assets/designs/` — the legacy CRA app, which is not
   deployed. `frontend-v2/public/` held four sample photos. So the API kept
   returning `/assets/designs/...` paths that were 404 in the app that ships.
   Nothing in the API would ever reveal this: the contract was perfect.
   Copied into `frontend-v2/public/assets/designs/` (4.4 MB, 30 files).
   `event_templates.py`'s own docstring calls these "committed optimized WebP
   pairs", so in-repo is the intended home — this is NOT the 1,382-file
   wedding artwork question (see §0.0.46).

2. **The preview route was a redirect.** `/events/preview/:eventType/:templateId`
   was `<Navigate to="/events">`. The URL resolved, nothing 404'd, and there
   was no preview. Same trap as §0.7b. Now `pages/EventDesignPreview.jsx`.

3. **The builder had no picker.** `EventBuilder` had Details/Committee/Money
   and no way to choose a design, though the registry marks the field type
   `"template"` precisely so it renders as artwork rather than a dropdown.

New: `components/events/EventInvitationCard.jsx` (the shared renderer),
`EventTemplatePicker.jsx`, a **Design** tab in `EventBuilder`, and the card on
`EventPublic`.

Two things to preserve if you touch this:

- **The renderer must stay config-driven.** Every number comes from
  `template.layout`. `event_templates.py` is explicit that a new event type
  should only add a config entry. Font sizes are in `cqw` (1% of the card's
  own width) so text holds its proportions at any card size — the layout's
  percentages are percentages *of the card*, and px would drift. `overflow:
  "shrink"` is implemented by measuring, not by clamping lines, because
  clamping clips and the config forbids clipping.

- **`theme` is replaced wholesale by autosave**, not merged
  (`root_update[target] = payload`). Saving a template without sending the
  existing colours back would silently wipe them. The Design tab spreads
  `...theme` for this reason, and the verification asserts the colour survives.

**Backend fix:** `_attach_template()` was called only by `public_get`. The
builder's preview would therefore have rendered nothing while looking fine —
the same silent-absent-field failure as StudioSecurity. Both the owner read
and the public read now go through the one helper, so the studio's preview
cannot disagree with the guest's page.

**Also fixed, found on the way — two feature-flag stores.**
`/api/admin/feature-flags` writes `db.feature_flags`; `event_registry.
module_enabled()` reads `db.app_settings`. Creating `ganesh_module_enabled`
from the Feature Flags screen looked like it worked and changed nothing —
every `/api/events/*` route kept answering 404. `AdminFeatureFlags` now has a
**Module rollout** panel wired to `PUT /api/admin/events/config/flags/{key}`,
the only route that moves that gate. **The event module is default OFF; that
panel is how you turn it on.**

### 0.0.46 The wedding design artwork — RESOLVED (commit `23635db`)

**188 designs across 10 collections and 6 ceremonies now ship in this repo**
as `frontend-v2/public/designs/catalogue.json` + 332 WebP files under
`public/designs/opt/` (37 MB — the 480px grid variants plus 960px where they
exist, not the ~250 MB full tree). Rebuilt from the legacy
`frontend/src/themes/image-manifest.json`, which carried per-design responsive
variants, an inline LQIP data-URI, the dominant colour and true pixel
dimensions. All of that is preserved, so a card paints before any image loads.

Read `frontend-v2/src/lib/designCatalogue.js` first — it documents what is in
git vs what belongs on the CDN, and `VITE_DESIGN_CDN` still redirects every
catalogue path if you'd rather serve them from S3.

**Four things worth not rediscovering:**

1. **`/api/themes` and the design catalogue share not one id.** `/api/themes`
   returns the 8 RENDERING themes from `theme_constants.py` (`royal_heritage`,
   `temple_gold`, `peacock_dream`, …). The artwork is keyed by 10 different
   collection ids (`south_indian_temple`, `beach_destination`, …). So
   `/api/themes/south_indian_temple` answers a **genuine 404 and always did** —
   that is why `/browse` showed nothing when you drilled in, and it is not a
   bug in the endpoint. `BrowseDesigns` now resolves the catalogue locally and
   first, and lists the page styles under their own heading.

2. **Legacy filenames are hostile to URLs.** `'sld'flf;_`, commas and spaces,
   one emoji. A `;` is a path-parameter separator and a `,` a sub-delimiter, so
   these 404 through Vite and break differently again through Caddy or S3. Two
   were caught serving 1,290 bytes of `index.html`. Everything shipped is now
   `[a-z0-9-]` plus a short hash. `scripts`-side the rename lives in the
   catalogue builder and is idempotent.

3. **Design names are positional unless a human chose one.** Only six files
   were deliberately named (`clean-mandap-lotus-garlands` and friends). The
   rest are content hashes, WhatsApp exports, generator dumps and stock-library
   SEO titles — including Instagram hashtag strings and **another studio's
   brand name**. Those take the positional label the design code already
   encodes (`TMPL-ENG-03` → "South Indian Temple Engagement 03"). If you want
   real names, they need to be authored, not scraped.

4. **Two placeholder sets were removed, not restored.**
   `assets/designs/{royal_classic,floral_soft,divine_temple,modern_minimal,
   cinematic_luxury}_{thumb,preview}.webp` were ~660-byte **SVGs carrying a
   `.webp` extension** — grey rectangles with the theme name on them. They were
   placeholders in the old repo too. `assets/deities/*` is the same: a
   1920×1080 grey box reading "ganesha", saved as `ganesha_desktop.jpg`. Do not
   "restore" either. The Ganesh artwork under `assets/designs/ganesh/` **is**
   real (20 files, 50–490 KB each) and stays.

`/api/config/designs` still returns those five dead ids, and four of the five
fail `ProfileCreate.validate_design_id` (which requires `THEME_IDS`). Nothing
consumes it. Treat it as legacy config, not a gap to fill.

**How to fetch blobs out of the old repo** — the fast path, and the traps:

**Use `git cat-file --batch`, not sparse-checkout.** Sparse-checkout in cone
mode re-applies the whole pattern set every round, so a folder-by-folder walk
gets slower each step (~1 folder/min, hours for the tree). Keeping one git
process open and streaming SHAs at it lets the promisor fetch blobs on demand
without touching the working tree: **332 files in ~7 minutes**. See
`scratchpad/batch_extract.py` in the session scratch if it survives.

Older traps, still true:

1. **`mani1715/wedding-36` is private.** `raw.githubusercontent.com` 404s on it
   even though `git clone` succeeds, so any bulk fetch must go through git with
   credentials, not plain HTTP. A 404 there is auth, not a wrong path.

2. **Do NOT combine `--depth 1` with `--filter=blob:none`.** The clone works and
   `git ls-tree` lists all 1,384 files, but every later blob fetch dies with
   `early EOF` / `fetch-pack: invalid index-pack output` at the shallow
   boundary. This is not a size problem — a folder containing *two* files
   failed the same way. Drop `--depth 1` and the identical checkout succeeds:

   ```
   git clone --filter=blob:none --no-checkout <url> repo
   cd repo && git sparse-checkout init --cone
   git sparse-checkout set frontend/public/designs
   git checkout
   ```

**And when you verify, do not trust a status code.** The dev server's SPA
fallback answers **200 with `index.html`** for any unknown path, so a missing
image looks fine to a `fetch()`/HEAD check. Check `content-type` and byte
count, or `img.naturalWidth > 0` in the browser. This is how the wedding
category cover was caught still missing while four others were genuinely fixed.

### 0.0.47 Surfaces added in session 5

| Screen | Route | What it unlocks |
|---|---|---|
| Marketplace | `/admin/marketplace` | Campaign + brand moderation, vendor-marketplace analytics, editable exchange rates, push registration stats |
| Storage pool | `/admin/storage-pool` | Drive accounts, 5-day recycle bin, upload-failure retry, capacity alerts, the routing flag |
| Events | `/admin/events` | Event dashboard, search, 11 moderation actions, audit log |
| AI writing tools | `/studio/ai-tools` | Love story, guest greeting, bulk translate |
| Story highlights | `/studio/pixora?g=spotlight&p=highlights` | Permanent snapshots of expiring stories |
| Event design preview | `/events/preview/:eventType/:templateId` | Public preview of an approved design |
| Design tab | `/events/:id/builder` | The template picker + live card |
| Cloud backup | `/studio/backup` | Files, recycle bin, history — 11 endpoints whose bindings existed with **no importer** |
| Platform activity | `/admin/bi` → Activity | Event volume, creator geography, community depth |

### 0.0.48 The UNCOVERED count is not the gap count

Re-running `classify.py` after this session's screens took UNCOVERED from
**87 → 47**. But 47 is still wrong, and in both directions. Verifying each one
individually (backend route still exists? does anything under
`frontend-v2/src` reference it?) splits them:

| | Count | Meaning |
|---|---|---|
| **DEAD** | 14 | No backend route at all — `/api/analytics/summary`, `/api/live-upload/*`, `/api/profiles/{}/theme`, `/api/translate`, `/api/auth/*-supabase`, … Nothing to build. |
| **False positives** | 2 | v2 *does* call them, written differently — `/api/public/p/{}` (PixoraProfile), `/api/public/discovery/{}` (publicCatalog). |
| **Real gaps** | 25 | Backend serves it, v2 never mentions it. |

And several of the 25 are *correctly* absent:

- `/api/public/addons`, `/api/public/expiry-tiers`, `/api/admin/expiry-tiers` —
  these fed the **retired** normal-user PurchaseOptionsWizard. The live buy
  flow is `/api/store/*`, which v2 uses. Adjacent handlers in that file are
  literally `_retired()`.
- `/api/admin/impersonate` — deliberately not wired (§0.7c).
- `/api/push/*` — blocked on `FCM_SERVER_KEY`.
- `/api/public/invite/{}/wishes` — consolidated into `/api/invite/{slug}/full`,
  which already carries `wishes[]`.

**The lesson: a path-family classifier gives you candidates, not findings.**
Both buckets lie — it flags live features as missing when the literal differs,
and flags retired ones as gaps because the route still answers. Verify each
candidate against the backend AND the whole of `src/` before building.

**A failure mode worth naming: dead bindings.** `studioOps.js` had exported
eight `/api/cloud-backup/*` functions for a while and *nothing imported them*.
Grepping the api modules made the feature look wired; only
`grep -rl` over `pages/` and `components/` showed it had no consumer. When
auditing coverage, "an api binding exists" is not evidence — check that a
component actually calls it.

Recurring rule these all follow: **when a thing cannot work, show the server's
own sentence.** The AI page reports "GEMINI_API_KEY not configured"; the
storage pool reports "Connect at least one active storage account before
enabling the pool"; the marketplace says push registrations accumulate while
nothing is delivered. A generic "something went wrong" would have hidden four
different, actionable causes.

### 0.0.5 The bug fix that mattered most, confirmed live

`StudioSecurity` used to read a device list off `/api/admin/account/summary`,
which has never returned one, and therefore always rendered *"Only this session
is active"* — a **false security statement**. It now reads
`/api/auth/sessions` and showed **8 real sessions** with IP and last-seen.

Also confirmed end-to-end: the public feature-wish form on `/support` → the
admin queue at `/admin/feature-wishes`, with the **exact consent string the
buyer agreed to** stored and displayed beside the request. That is why the
consent wording is *fetched* rather than hard-coded in the component.

---

## §0b — Session 4 (2026-08-13): platform reconstruction in frontend-v2

**Commit:** `13f67b7` on `main` · branch `feat/platform-reconstruction` also pushed
**Repo:** https://github.com/mahiunfiltered/maja_invites
**Reference repo (read-only):** https://github.com/mani1715/wedding-36

### 0.1 What this session was

An exhaustive audit of the old repo against this one, then a rebuild of every
platform surface that had backend support but **no UI in the deployed app**.

The audit's real finding was not "the new repo lost features" — the backend here
is a superset. It was: **frontend-v2 is the only UI that ships, and large parts
of the platform had no screen in it at all.**

Rules this rebuild followed, and that you should keep following:

- Extract **functionality, business logic, workflows, API contracts,
  validations and permissions** from the legacy app. Do **not** port its
  screens, layouts or CSS. The v2 design system is the design system.
- **Zero placeholders.** No TODO screens, no "Coming soon", no mock data, no
  fake static screens. If something cannot be built for real, say so.
- **Never restore** normal-user accounts, the user dashboard, credits, credit
  wallet/top-up/purchases, couple Google OAuth, the legacy user portal,
  `/user/*` routes, or any Credits UI. These are permanently retired.
- Before adding a backend endpoint, **check whether one already exists.**
  (This bit me — see §0.6.)

### 0.2 What now exists that did not before

| Area | What landed |
|---|---|
| CI | `frontend-v2-build` job (the deployed app was never built in CI); legacy CRA job demoted to `continue-on-error` |
| Resilience | `ErrorBoundary` self-heals once on a stale-chunk error via `sessionStorage` key `mj_chunk_reload`; `lib/reportError.js` posts to a new `POST /api/client-error` (10/session cap, 5s dedupe, `sendBeacon`) |
| Studio | Wedding creation wizard (6 steps); 13 legacy per-wedding routes regrouped into 6 tabs + legacy-URL redirects; 10 studio-level screens (earnings, insights, staff, security, audit logs, white-label, calendar, storage, messages, client work) |
| Admin | 14 operations screens behind a 3-group console nav (Operations / Money / Platform); the console's first-ever **mobile nav panel** |
| Public | Cookie consent, `legal/Cookies`, `legal/DataRetention`, per-route SEO (`lib/useSeo.js`, no dependency), browse-designs, story, support, vendors, hashtag, photographer discovery |
| Events | All three event pages rewritten against the real contract |
| Pixora | The whole community: **8 groups, 46 panels** at `/studio/pixora` |

**Counts at handoff:** 143 explicit routes (+31 mapped `/super-admin/*`
redirects) · 84 pages · 439 distinct frontend API calls, **all** resolving to a
real backend route · frontend-v2 build green.

### 0.3 Pixora — the information architecture is deliberate

`/studio/pixora` carries the legacy IA verbatim, because that grouping was
itself a considered replacement for an unusable 22-tab strip. Group and panel
both live in the query string (`?g=…&p=…`), so **every panel is linkable** and
survives a refresh.

```
home:        Overview · Notifications · Network · Creators · Events
spotlight:   Post · Following · Discover · Trending · Saved
connect:     Hiring · Mentors · Vendors · Teams · Collaborations
studio:      CRM · AI Review · AI Assistant · Analytics · Pricing Intelligence · Client Management
growth:      Challenges · Awards · Verification · Certifications · Leaderboards · Perks
marketplace: Marketplace · Upgrades · Brand Deals · Resources · Presets · Templates
learning:    All · Photography · Editing · Business · Marketing · AI Tools · Gear Reviews · Guides
profile:     My Profile · Why Upgrade · Portfolio · Settings
```

Files: `src/pages/PixoraHub.jsx` (shell + IA) · `src/components/pixora/`
(`PixoraShell.jsx` primitives, `pixora.css` `pxc-*` system, and one file per
group) · `src/api/pixora.js` (the whole surface) ·
`src/data/learningResources.js` (curated dataset carried over intact).

Two things inside Pixora are genuinely different and must not be merged:
`/api/pixora/marketplace` is **studios selling to each other**;
`/api/monetization/*` is **the platform selling** storage, featured placement
and verification. Resources / Presets / Templates are filtered views over the
first — they were never separate features.

### 0.4 Verified API contracts — do not re-guess these

Every one of these was read out of `backend/pixora_service.py`, and each one
was wrong in a first draft written from the legacy frontend. **The legacy
frontend is not a reliable contract source — it contains its own bugs.**

| Endpoint | The actual contract |
|---|---|
| `POST /api/pixora/connections/request` | body is `{recipient, type, message}` — **not** `studio_id`. `type` ∈ connect \| collaborate \| partnership \| project |
| `POST /api/pixora/connections/{id}/respond` | body is `{action: "accept"\|"decline"}` — **not** `{accept: bool}` |
| `GET /api/pixora/connections` | returns `{incoming[], outgoing[], accepted[]}`, rows carry `other_id` / `other_name`. There is no `connections[]` key (the legacy screen read one and silently rendered empty) |
| `GET /api/pixora/discover` | returns `{photographers[]}` — it is a **directory search**, not a post feed |
| `GET /api/pixora/network` | returns `{following_count, followers_count, following: [id]}` — there is no `followers[]` array |
| `GET /api/pixora/me` | has **no** `storage` block; storage is `GET /api/pixora/storage` (`{used_bytes, cap_gb, percent, full, …}`) |
| `POST /api/pixora/events/{id}/rsvp` | bodyless **toggle**; server enforces capacity and 400s when full |
| `POST /api/pixora/talent` | `{headline, specialties[], showreel_url, rate_card, bio}`; listings are moderated and come back with a `status` |
| `POST /api/pixora/vendor` | `{business_name, category, country/state/city, experience_years, price_min_inr/price_max_inr, services[], contact{}, …}` |
| `POST /api/pixora/team` | `{name, role, photo_url, instagram}` — a public credit, no phone field |
| `POST /api/pixora/gigs` | `{title, location, budget_inr, description}` only |
| `POST /api/pixora/report` | `{target_type, target_id, reason, note}` with fixed vocabularies — free text alone is rejected |
| `POST /api/pixora/business-assistant/generate` | takes **no** body |
| `GET /api/pixora/trending` | `?window=` 24h \| 7d \| 30d |
| `GET /api/pixora/leaderboard` | `?sort=` score \| followers \| engagement \| awards |

**Event engine** (`backend/event_lifecycle_service.py`): the identifier is
`event_id` (not `id`), the display name is `title` (not `name`), the public slug
is `publish_slug` (not `slug`), edits go through `PATCH /events/{id}/autosave`
with a patch body (not `PUT`), and publishing must wait for
`POST /events/{id}/validate` to return `{ok: true}`. The engine is server-gated —
`_gate()` 404s everything when it is disabled, so **treat 404 as "engine off",
not as an error.**

**Plan gating** (`backend/community_gating.py`): gated features answer **403**
with a ready-written upgrade sentence in `detail`. Show that sentence verbatim —
do not paraphrase it, because it names the exact plan. Gated capabilities:
`crm`, `ai_review`, `ai_assistant`, `marketplace_sell`, `photo_post`,
`multi_image_post`, `reels`, `stories`. `useAsync` in `PixoraShell.jsx` already
separates this: **403 → `gated`, 404 → "module not enabled" (empty, not an
error), anything else → `error`.**

### 0.5 Bugs found and fixed in passing

- `test_travel_links.py` — the `aws_service` stub was missing the real module's
  public surface, so the suite had been **red on `main` since `e80aec9`**.
- The sitemap advertised `/themes`, `/plans` and `/story` to Google. All three
  404'd. Replaced with the real route set.
- `WeddingToolbar` built "View invitation" from the internal UUID, so it
  **always** 404'd. Now takes `slug` and disables when absent.
- `StudioPortfolio` linked photographers to `/photographer/:key/portfolio`,
  which does not exist in v2.
- `/live/:profileId` vs `useParams().weddingId` — param name mismatch.
- Duplicate React keys from two nav groups both titled "Studio".

### 0.6 A mistake worth not repeating

I claimed `GET /api/public/events/{slug}` did not exist and asked for approval
to add it. **It already existed** at `event_lifecycle_service.py:535` — my grep
had been truncated by `head -30`. No endpoint was needed; the fix was to rewrite
three pages against the real contract.

**Search exhaustively before concluding something is missing.** In a ~16k-line
`server.py` plus ~90 routers, a truncated grep is not evidence of absence.

### 0.7 Environment gotchas

- `.env` files are **gitignored and absent** from a fresh clone. The backend
  fail-hards on a missing `JWT_SECRET_KEY`.
- `run.ps1`'s `$pgBin` points at a sibling `wedding-36` checkout. On a fresh
  machine, install PostgreSQL 16 and repoint it.
- OneDrive-synced working directories make large git operations time out and can
  hold locks that break `git stash`. Keep the checkout outside OneDrive.
- Cloning the old repo needs `git -c core.longpaths=true clone` — two asset
  filenames exceed the Windows path limit.
- `frontend-v2` has **no lint config**. `yarn build` only type-checks what the
  import graph reaches, so a brand-new component file is not validated until
  something imports it.

### 0.7b Independent migration re-verification (done, partially)

Rather than trusting the session's own summary, old and new were diffed
mechanically. Method and honest result:

**Routes.** 164 legacy routes vs 143 in v2. Of the 21 apparent losses: 13 are
retired-by-design (`/user/*`, `/credits`), 4 more are credits URLs, and the
whole `/super-admin/*` block is covered by a generated redirect table in
`App.jsx` (a naive grep for `<Route path="…">` misses it — it is built with a
template literal). **Four genuine 404s were found and fixed** in this pass:
`/purchase`, `/studio/client/login`, `/studio/dashboard/trash`,
`/themes/:themeId/gallery` — all legacy bookmark aliases.

**API calls.** 569 distinct calls in the legacy frontend vs 439 in v2. 186 of
the difference are endpoints the backend **still serves** but v2 never calls.
**That number is heavily inflated and must not be read as 186 missing
features** — v2 deliberately consolidated many per-section calls into one. For
example the legacy invitation fetched `/invite/{}/venues`, `/songs`, `/travel`
and `/shagun` separately; v2 gets all of it from `/api/invite/{slug}/full`.

**The full 186 have now been classified** (see §0.7d). Buckets:

| Bucket | Count | Meaning |
|---|---|---|
| `SAME-FAMILY` | 76 | v2 calls the same resource by a different route — consolidation, not loss |
| `UNCOVERED` | 87 | v2 never touches that resource family at all — the real candidates |
| `DEAD` | 23 | gone from the backend too; nothing to restore |
| `RETIRED` | 14 | `/users/*`, `/credits/*` — correct to be absent |

Reproduce with the script pattern in §0.7d. `SAME-FAMILY` still deserves
spot-checks — "v2 calls something in this family" is evidence, not proof.

Note the trap that hid three of them: `/super-admin/investigation`,
`/qr-analytics` and `/security` all redirected somewhere plausible
(`/admin/dashboard`, `/admin/bi`, system health). The URL resolved, so nothing
404'd and the loss was invisible. A redirect to a *different* report is not
coverage.

### 0.7c Gaps closed

| Screen | Route | Backing endpoints |
|---|---|---|
| Investigation | `/admin/investigation` | `/admin/investigation/search`, `/subject/{kind}/{id}` |
| QR analytics | `/admin/qr-analytics` | `/admin/qr-analytics` |
| Feature wishes | `/admin/feature-wishes` | `/admin/feature-wishes`, `/summary`, `PATCH /{id}` |
| Access control | `/admin/access-control` | `/admin/rbac/catalogue`, `/me`, `/assign` |
| Wedding album | `/studio/wedding/:id/album` | `/admin/profiles/{id}/album-media` (+ upload, delete) |
| Build my portfolio | `/studio/portfolio/build` | `/portfolio/build-help`, `/build-help/order`, `/verify`, `/build-request` |
| Sessions + MFA | folded into `/studio/security` | `/api/auth/sessions`, `/logout-all`, `/admin/mfa/*` |

`POST /admin/impersonate` exists and is deliberately **not** wired to a button.
It mints a token for another account; that belongs behind a considered flow
with its own audit surface, not a control on a reference screen.

**Four live bugs surfaced while building the security screen.** `StudioSecurity`
was reading four fields off `/admin/account/summary` that it has never
returned — the whole payload is `{email, phone, name, has_password,
auth_provider}`:

- the device list read `a.devices || a.sessions`, both absent, so the panel
  permanently told the user *"No other devices. Only this session is active."*
  A false statement to someone about their own account security is worse than
  a missing feature. Now reads `GET /api/auth/sessions` and filters `revoked`.
- the two-factor stat read `a.mfa_enabled` → always "Off", even with MFA on.
- "Password changed" read `a.password_changed_at` → always "Never".
- change-phone sent `{phone}`; the model field is `new_phone`, so changing
  your number was a guaranteed 422.

The lesson generalises: **a field that is merely absent fails silently and
renders a plausible lie.** When wiring a screen, check the handler's actual
return, not what the field name suggests.

### 0.7d The 87 UNCOVERED, triaged

Classify by grouping the old-only calls by their **legacy screen** — a whole
screen either has a v2 equivalent or it does not, which is far faster than
reasoning about 186 individual routes. Bucket each by whether v2 calls anything
in the same resource family (first three path segments).

**Built in this pass** — these were dead ends the v2 app itself created, by
offering a submission with no queue behind it:

| Queue | Why it mattered |
|---|---|
| Verification review | Studios apply from Pixora → Growth → Verification. Nobody could approve, so every application sat at `pending` forever. |
| Talent moderation | Talent listings are stored `pending` and only `approved` rows are returned by `GET /pixora/talent`. With no approver, the register was permanently empty. |
| Vendor moderation | Same shape — vendor listings need approval to go public. |
| Portfolio build requests | The admin half of the "Build my portfolio" screen built earlier this session. |
| Feature-wish public form | The `/admin/feature-wishes` board had no way to receive anything. Now on `/support`. |

All four queues live at `/admin/approvals`. Note `POST /admin/portfolio-build-requests/{id}/status`
takes **status as a query parameter**, not a JSON body.

**Still uncovered, with a judgement on each:**

| Cluster | Count | Judgement |
|---|---|---|
| ~~`AdminFulfillment` leftovers — campaigns moderation, `industry-analytics`, `push/stats`, currency rates~~ | ~~7~~ | **DONE (session 5)** — `/admin/marketplace`. Campaigns + brands moderation, vendor-marketplace analytics, editable exchange rates, push registration stats. |
| ~~events moderation — `/api/admin/events/*`~~ | ~~9~~ | **DONE (session 5)** — `/admin/events`. Dashboard, search, 11 moderation actions, audit log. Not gated on the module flag, on purpose: switching the engine off must not strand live events. |
| ~~`StoragePoolPanel` — `/super-admin/storage/*`~~ | ~~20~~ | **DONE (session 5)** — `/admin/storage-pool`. Accounts, recycle bin (restore/purge), failure retry, alerts, routing flag. Built *before* the flag goes on deliberately: every route answers while it is off, so you connect accounts and watch capacity first. |
| ~~`AIStudio` — `/admin/ai/*`~~ | ~~3~~ | **DONE (session 5)** — `/studio/ai-tools`. story-v2, greeting-personalize, translate-bulk. `enhance-image` deliberately left out: it takes a base64 image and needs AWS, which is not configured. |
| ~~Pixora highlights — `/pixora/highlights`~~ | ~~3~~ | **DONE (session 5)** — Spotlight → Highlights. |
| `AdminFulfillment` remainder — `/admin/analytics/overview`, `/admin/analytics/global`, `plan-purchase-details` | 3 | Real, lower urgency. `plan-purchase-details` is a bare list (`{details[]}`) with no obvious consumer screen; decide what it is for before building. |
| Push — `/push/register`, `/push/preferences` | 3 | Needs `FCM_SERVER_KEY`, which production does not set. Blocked on config, not code. |
| `Phase30Analytics`, `PhotographerProfilePage`, `ThemeSettings`, `CloudBackup` history, live-upload status, misc public reads | ~30 | Mostly superseded by v2 equivalents on different routes. Spot-check before building. |
| `/api/auth/me-supabase`, `/auth/sync-supabase-user` | 2 | Supabase auth is **not configured in production** — no `SUPABASE_URL`. Dead in practice. |

### 0.0.49 Public endpoints with no UI — surveyed, then closed

The survey (`scratchpad/unsurfaced.py`) enumerates route decorators in
`backend/*.py` and checks each public path against ALL of `frontend-v2/src`,
not just the `api/` modules — a binding nothing imports is dead, which is how
eight `/api/cloud-backup/*` functions once hid.

**71 public routes, 34 unsurfaced → now 70 public, 18 unsurfaced.** Nine of the
remaining 18 are the `/api/og/*` crawler mirrors, which the SPA is not supposed
to call.

Closed in this pass: the design-catalogue SEO renderers (§0.0.46), the public
community feeds on the home page, all of `pricing_public.py`, and the nine
below.

| Endpoint | Now read by |
|---|---|
| `pixora/stories` | `StoriesRail` on `/community` (rail + viewer) |
| `pixora/foryou` | the "For You" tab, which previously called the flat feed |
| `pixora/nearby` | new "Near you" tab with a city box |
| `pixora/packages/{sid}` | `StudioShowcase` on `/photographer/:slug` |
| `pixora/highlights/{sid}` + `highlight/{id}` | same component, with a viewer |
| `studio/{id}/white-label` | `PhotographerPublic` — read from the portfolio response, which already carried it |
| `food-donation` | new public page `/food-donation` |
| `photographer-stats` | live counts on `/photographers` |
| `pricing/designs` | see the note below |

**Two traps this pass produced, worth keeping:**

1. **A namespace import hides a missing export until runtime.** `/community`
   called `pixora.trendingHashtags`, which `api/pixora.js` does not export. That
   is a `TypeError` on mount that took the whole page to the error boundary —
   and `yarn build` stayed green throughout, because Vite does not check
   property access on a `import * as` namespace. The page rendered nothing for
   every visitor. **`yarn build` passing is not evidence a page renders.**

2. **Check the payload, not the field name you expect.** `StudioShowcase` read
   `pk.price`; the server sends `price_inr`. An ₹85,000 package rendered as
   "Price on request" until it was checked against a real response.

**`/api/public/pricing/designs` returns `[]`** and will until an admin populates
`pricing_design_prices` (audience `normal_user`). The design pages therefore
read `/api/store/catalog`, which is public and populated (TMPL-ENG-01 → ₹2,999
with six named features). Binding only the new engine would have shown nothing
forever while looking wired.

**Still unsurfaced (9 real, excluding the `/api/og/*` mirrors):**
`public/addons`, `public/design-pricing`, `public/expiry-tiers`,
`public/theme-bundle-pricing`, `public/discount/validate`,
`public/events/donate/verify`, `public/invite/{slug}/wishes` (consolidated into
`/invite/{slug}/full`), `public/referral-code/{id}`,
`public/referral-code-by-slug/{slug}`.

### 0.0.50 Credits are deleted

Not retired-behind-a-410 — deleted. **26 route handlers across nine modules**,
`credit_service.py` (the no-op shim eleven modules imported) and every call
site, plus the credit models out of `credit_packages.py`, which is renamed
`pricing_models.py` because what survives in it prices designs and themes.

Probed before touching: five endpoints were still answering **200**, including
`GET /api/public/credit-packs` serving a live pack list with prices. All ten
probed paths now 404.

Two things were reporting numbers that could never be true, and were removed
rather than left returning zero: the bulk-purge flow incremented
`refunded_total`/`refunded_count` after calling a refund that was a no-op, and
`credits_spent` in profile analytics aggregated a ledger nothing writes to.
`photographer-stats` had the same problem with `bonus_credits_granted`.

**Kept deliberately:** `super_admin_pricing`'s router still answers
`410 CREDITS_RETIRED` — it is a legacy surface whose rows are credit-denominated
and 20+ routes returning a reason beats them 404ing. The raise is inlined, since
a router retired FOR pricing in credits should not import a credit module.

**Not done:** credit-denominated FIELDS survive in the pricing models
(`credits_required` on design_pricing, `total_credits` on theme packages,
`credits_per_month` on subscription plans) along with
`pricing_calculation_service.py`, which computes in them. They are inert —
nothing sells or spends credits — but removing them is a pricing-model migration
with real regression risk, not a deletion.

**Behaviour changes:** `POST /api/payments/razorpay-webhook` now 404s instead of
410 (it only ever credited `credit_purchases`; store and subscription webhooks
are separate and untouched), and a historical credit purchase, if one exists, is
refunded from the Razorpay dashboard because the endpoint is gone.

### 0.0.51 How to actually test this app (and what that found)

**`yarn build` passing is not evidence that a page renders.** frontend-v2 has no
lint config, so the build is the only static gate — and it does not check
property access on a `import * as ns` namespace. A call to a function the module
does not export is a runtime `TypeError`, never a build error. Three public
routes were crashing on every visit with a green build:

| Route | Error |
|---|---|
| `/community` | `pixora.trendingHashtags is not a function` |
| `/p/:username` | `pixora.publicProfile is not a function` |
| `/community/tag/:tag` | `posts.map is not a function` |

**Check console errors, not rendered text.** The error boundary recovers and
re-renders, so a crashed route still looks populated. A first sweep that keyed
on body text reported **70/70 healthy** and missed two of the three. The sweep
that works:

```js
console.error = (...a) => { window.__ERRS.push(a.join(' ')); orig(...a); };
window.addEventListener('error', …); window.addEventListener('unhandledrejection', …);
// then per route: pushState + popstate, wait ~550ms, filter __ERRS for
//   /is not a function|Cannot read|undefined is not|Unhandled render/
```

Route list comes from `App.jsx`'s `<Route path=…>` and params are filled with
REAL ids (`aarav-and-riya-demo`, `TMPL-ENG-01`, `demo-photographer`), so a 404
means the route cannot find something that exists rather than that the id was
invented.

**`/p/:slug` had no endpoint behind it at all.** `_author_card` builds that URL
and the feed puts it on every public post, so following any byline threw. New
`GET /api/public/pixora/profile/{studio_id}` resolves id or slug and composes
from existing reads. Its counts key on `follower`/`followee` — `pixora_follows`
does NOT use `actor_id`/`studio_id`, and guessing would have made every counter
a silent zero.

**Payload shapes lie about their names.** `/api/public/pixora/search` returns
`results` as an OBJECT of grouped matches; the tag page read it as a list.
Two more of the same class this session: `StudioShowcase` read `pk.price` where
the server sends `price_inr` (an ₹85,000 package rendered as "Price on
request"), and `StudioPlanPicker` read `c.price` where the server sends
`effective_price` (every plan showed ₹0). **Print one real response before
binding to any field.**

### 0.0.52 Secret rotation — status, and what only the owner can do

**This repo's history is clean.** All commits scanned for AWS keys, Razorpay and
Stripe live keys, Google API keys, signed JWTs, private key blocks and Postgres
URLs with passwords. One match: the literal `rzp_live_PLACEHOLDER` in a fixture.
`backend/.env` is gitignored and was never committed here.

The leak is in **`mani1715/wedding-36`**. Private limits the exposure; it does
not remove it, and making a repo private rotates nothing.

**Done:** `JWT_SECRET_KEY` rotated locally (64 bytes url-safe) and verified —
both seeded accounts issue working tokens, authed calls 200 under the new key.
Only fingerprints were printed, never the value.

**Not done, and not doable from a session:** Supabase `service_role`, AWS,
Razorpay, Gemini, production Postgres. All behind vendor consoles.
[`SECURITY_ROTATION.md`](SECURITY_ROTATION.md) has the order and the blast
radius of each. `JWT_SECRET_KEY` is first there because it is the only one that
signs *our own* tokens — holding it mints a super-admin session with no
password, no OTP and nothing in the logs to distinguish it from a real one.

**The gate:** `scripts/scan_secrets.py --install-hooks` turns CLAUDE.md's
"scan before every push" habit into pre-commit + pre-push hooks, and CI runs
`--tree` next to gitleaks.

**Two false negatives it only admitted under a canary.** Reading it said it
worked; feeding it a fake credential file said otherwise, twice — a line-level
placeholder check reused the value-level list containing "EXAMPLE", so a real
password passed because its HOST was `db.example.com`; fixing that left the
Postgres rule testing the whole URL, reproducing the hole one level in. It now
tests the captured password. **Test a scanner with a canary, never by reading
it.**

### 0.0.53 The four production integrations — what each absence actually does

Probed against the running server rather than inferred from missing env vars:

| Integration | State | What it means today |
|---|---|---|
| Email | no provider; `EMAIL_FROM` only | Messages queue in `email_outbox` and are never sent. Password resets and receipts go nowhere. |
| SMS / OTP | no provider; `DEV_MODE_OTP=1` locally | With no provider and dev mode OFF, `/api/auth/send-otp` returns **503**. Locally dev mode returns the OTP in the response body. |
| Razorpay | keys unset locally | Payment-dependent routes refuse cleanly — event donation verify answers `409 "Online payments are not enabled"`. All pricing READS work regardless. |
| AWS | unset | Uploads sit on local disk; Rekognition face-match unavailable. `VITE_DESIGN_CDN` unset is fine — the 188-design catalogue ships in git (§0.0.46). |

**The production hardening gate already covers the dangerous combination, and it
was verified firing, not just read.** `server._production_readiness_warnings()`
**refuses to boot** when `ENVIRONMENT=production` and any critical item is set —
including `DEV_MODE_OTP=1`, which would otherwise return the OTP to the caller
and make the whole OTP gate decorative. Also caught: wildcard `CORS_ORIGINS`,
missing `RAZORPAY_WEBHOOK_SECRET`, missing `JWT_SECRET_KEY`.
`ALLOW_INSECURE_PROD=1` is the emergency override.

A hardening guard for exactly this was about to be added before checking —
**it already existed and was stronger.** Check before building.

### 0.8 Still outstanding

1. **Rotate 6 secret sets** — Razorpay, Supabase (service_role especially), AWS,
   Gemini, Postgres, CloudFront. These were committed to git history and are
   still live. Owner's task; no code change needed.
2. **`VITE_DESIGN_CDN` is now optional, not required.** The 188-design
   catalogue ships in git (§0.0.46) and `/browse` and `/studio/designs` show
   real artwork without it. Setting it still redirects every catalogue path to
   the CDN — worth doing if you want the 1440px originals or want the 37 MB out
   of the bundle. It is **build-time**, so rebuild `frontend-v2/dist` after
   setting it. Two resolvers, deliberately: `lib/designCatalogue.catalogueUrl`
   for the catalogue (CDN or same-origin — never the backend origin, which
   would 404 every tile in dev) and `lib/designAssets.designAsset` for artwork
   uploaded through the media pipeline (CDN → backend → gradient placeholder).
3. **Work the remaining UNCOVERED clusters** in §0.7d, in the order given there.
   The dead-end queues are done; what is left is real but not blocking.
4. **Production is missing four things that are not code problems** (read from
   the live `.env`): no email provider at all, so password resets and receipts
   send nothing; `DEV_MODE_OTP=0` with no provider, so `/auth/send-otp` returns
   **503**; Razorpay is a **test** key, so no real payment can complete; and no
   AWS at all, so uploads sit on local disk and Rekognition is unavailable.
5. ~~**End-to-end verification has not been run.**~~ **Superseded — this is no
   longer true.** It was written when the machine had no Postgres binaries, no
   `.venv` and no `backend/.env`, so the integration suite failed on
   connection-refused. Since session 5 the stack has been booted and driven
   repeatedly: the suite runs green (**295 passed / 2 skipped** as of
   2026-08-16), the event gate is 76/76, and every public route has been swept
   in a real browser. The warning it carried is still worth keeping in mind for
   *new* work — response shapes verified by reading a handler are not verified —
   but do not cite this item as the current state. See §0.0.70 for what is
   actually open.

### 0.0.54 Every public endpoint now has a caller

The survey (`scratchpad/unsurfaced.py`) is down to **10 of 68 public routes
with no frontend match, and nine of those are the `/api/og/*` crawler
mirrors** the SPA is not supposed to call. The tenth,
`/api/public/invite/{slug}/wishes`, is genuinely consolidated — checked, not
assumed: `/api/invite/{slug}/full` returns the same 13 wishes for the same
slug.

Those nine stay unsurfaced by design, but "no caller" is not the same as
"working" — §0.0.59 fetched them as a crawler and found five faults,
including a canonical that 404'd for Googlebot on every portfolio in the
sitemap.

What closed in this pass:

| Endpoint | Now read by |
|---|---|
| `events/{slug}/donate`, `/donate/order`, `donate/verify` | `EventDonate` on `/e/:slug` |
| `profiles/{id}/referral-code`, `profiles/{id}/referrals`, `admin/referrals/override` | `ReferralShare` on the wedding's QR-codes page |
| `public/referral-code-by-slug/{slug}` | `InviteReferralCta` under the invitation sign-off |
| `public/theme-bundle-pricing` | `/browse` cards + collection hero |
| `super-admin/theme-bundle-pricing` (CRUD) | Pricing Hub → Theme Bundles |
| `super-admin/discount-codes` (CRUD) | Pricing Hub → Discount Codes |

### 0.0.55 The bug class an AST sweep found and reading never would

`get_current_admin` returns the `admins.id` as a **str**. Four handlers
annotated it `current_admin: dict` and then called `.get()` on it. That is an
`AttributeError` on *every* call, swallowed by the module's bare
`except Exception` and re-raised as a **500 with a plausible-sounding
message** — which is exactly why they survived so long:

- `POST /profiles/{id}/referral-code` — 500 whenever a code had to be minted.
- `POST /admin/referrals/override` — 500 always.
- `POST /payments/create-order` — 500 always.
- `PUT` profile theme — **saved the theme, then 500'd on the audit-log line.**
  The write succeeded and the client was told it failed.

`celebration_translation.admin_translate` had the same root cause dressed
differently: it tried `.id`, `.admin_id`, then two dict reads, a string
satisfies none, so every authenticated admin fell through to a **401**.

`scratchpad/dictadmin.py` finds these statically — it matches any parameter
whose default is `Depends(get_current_admin)` and then flags a `.get()` or
subscript on that name. Worth re-running after any auth-dependency change.

**Two authorization gaps in the same area, found by probing with a second
studio's token rather than by reading:**

- `/profiles/{id}/referral-code` and `/profiles/{id}/referrals` had no
  ownership check at all. A second photographer could read any profile's
  referral stats by id.
- `/admin/referrals/override` took a `referral_id` and nothing else —
  approve or reject *anything* in the system given an id.

Both now use `_assert_referral_access`, the same test every other
`/profiles/{id}/*` route applies (super-admin bypasses).

One more, worth keeping as a pattern: adding the ownership check made the
stats route answer **`500: 403: You do not have access`** — the correct
refusal reported as a server fault, because the bare `except Exception`
caught its own `HTTPException`. Any handler with a broad except needs
`except HTTPException: raise` above it.

### 0.0.56 Collections nothing writes to

Two of these, found the same way — by asking where a value comes from
instead of trusting the field name.

`/api/invite/{slug}/full` read `db.referral_codes` for its `referral_code`.
**Nothing has ever written to that collection**; the only trace of it was an
index in server.py's bootstrap. The field was `null` on every invitation ever
served. Referrals live in `db.referrals`, keyed `referrer_profile_id`.

And a referral code is **single use** — redeeming stamps the row with the
redeemer and the next read mints a fresh code. All three public readers took
the *first* row for a profile, which could hand a visitor a spent code that
`/referrals/apply` then refuses as "already used". All three now select
`referred_profile_id: None`, and they agree.

### 0.0.57 A read model with no writer looks wired and is not

Two public endpoints were live on the storefront and could never return
anything, because nothing anywhere could create a row:

- `GET /api/public/theme-bundle-pricing` returned `{}` forever. Its upsert
  model required `credits` — so pricing a collection meant supplying a number
  in a currency that is deleted, and the public reader strips that field
  anyway.
- `POST /api/public/discount/validate` was wired into the checkout, and every
  code a customer typed came back "Invalid or inactive code". Correctly, and
  permanently, because no code could be created.

Both now have a Pricing Hub tab. The general lesson is the same one
`/api/public/pricing/designs` taught in §0.0.49: **when you bind a public
reader, check that something can populate it.** An empty list from a healthy
endpoint is indistinguishable from a feature that works.

### 0.0.58 Tests that pinned a moment instead of a behaviour

Four suites were failing or vacuous, all for the same reason.

- **`test_credit_system.py`** — 11 failures, 6 errors, exercising a system
  that no longer exists. Deleted.
- **`test_design_pricing_unified.py`** — every test drives
  `/api/super-admin/pricing/*` (410, retired) or `/api/users/*` (410,
  retired), and its two "public" tests read prices only the retired console
  could set. It also crashed at *collection* on a hardcoded
  `/app/frontend/.env`. Deleted.
- **`test_credits_retired.py`** — asserted the credit routes answered **410**.
  They answer nothing: they were deleted, not shimmed, so four of six tests
  died on `StopIteration` looking for a route. It pinned the migration's
  intermediate state and broke the moment the migration finished. Rewritten
  to assert the end state — that no router registers a credit-granting path,
  walked from the real routers rather than a hand-listed set of URLs. The two
  tests that were still true are unchanged.
- **`test_universal_invitations.py`** — three tests failed against a correct
  server. Two GET hardcoded slugs (`aarav-sita-dbryti`, `test-test-d7c9em`)
  that exist in some other database; one created an invitation dated
  `2026-06-15` and asserted RSVP worked, which by 2026-08-15 is an invitation
  that has genuinely expired. The dates are relative now and the two view
  tests build their own fixtures. **13/13.** Three more classes drove
  `/users/*` with credit assertions and were deleted with the persona.

The shape to watch for: a test that encodes *when* it was written — a literal
date, a seeded slug, a status code from a migration in flight — passes on the
day it is written and reports a false failure forever after. It is the mirror
of the green-but-vacuous test, and just as expensive.

### 0.0.59 The `/api/og/*` routes, and why "unsurfaced" was the wrong question

These nine were the last entries on the unsurfaced list, and they stay there:
they are **crawler mirrors**, and the SPA calling them would be the bug. The
survey counts a route as unsurfaced when no frontend file names it, which for
this group is the correct state, not a gap.

The real question is whether they do the job they exist for. Fetching all
twenty crawler URLs with a Googlebot UA (`scripts/check_seo_routes.py`) found
five faults that a route inventory could never show:

**1. The canonical 404'd.** `portfolio_seo` emits `{SITE}/photographer/{slug}`
as the canonical, the sitemap lists that URL, Caddy routes `/photographer/*`
crawler traffic to the backend — and only `/photographer/{slug}/portfolio` had
a route. Googlebot following the sitemap OR the page's own canonical got a
**404 JSON body**, while a human on the same URL got the app. Every portfolio
in the sitemap was unreachable to a crawler.

**2. `/themes/{id}/gallery` 404'd** the same way — a real SPA route inside
Caddy's `/themes/*` match with nothing behind it.

**3. Invitations redirected Google to themselves.** That renderer tested
`_is_share_crawler` (WhatsApp/Facebook/Twitter) instead of `_is_crawler`
(those PLUS search engines), so Googlebot fell into the human branch and got
`<meta http-equiv="refresh">` pointing at the URL it had just fetched. 17
invitations are in the sitemap. It also ignored `SEO_BOT_RENDER_DISABLED`.

**4. No `<link rel="canonical">` on invitations** — only `og:url`, which does
not do that job. This became urgent in the same session that added the
referral CTA: it hands out `/invite/{slug}?ref=CODE`, and without a canonical
every referral code forks the page into a new URL.

**5. Share cards had no image.** `portfolio_seo` read `avatar` or
`hero_image` only — but a photographer uploads WORK, not an avatar, so a
studio with a full gallery previewed as a bare text card. The gallery was
already being passed in for the ImageGallery JSON-LD node. Directory pages had
no image at all.

**The pattern in all five: a config file and a route table that must agree,
with nothing checking that they do.** The Caddyfile's `path` list is half a
contract; the backend routes are the other half; a mismatch is invisible
because the human path works.

**Absolute URLs are not optional.** The first directory fallback emitted
`/uploads/...` and a crawler silently drops a relative `og:image` — the result
is indistinguishable from having none. `_abs_image_url` now prefers the public
https origin over `request.base_url`, which behind the proxy can be the
internal origin or plain `http`.

**Where the honest answer is "nothing", emit nothing.** A studio that has
uploaded no photos gets no `og:image` and a `summary` card rather than a
`summary_large_image` pointing at a placeholder. There is no house asset to
point at, and inventing a path would give every imageless studio a broken
image instead of no image. `is_demo` rows are skipped for the same reason: a
seeded stock photo must not become the face of a real city page.

`scripts/check_seo_routes.py` pulls its slugs from the live sitemap, so it
runs against any environment (`API=https://… python scripts/check_seo_routes.py`).
It is NOT in CI — it needs a running server; run it against staging after a
deploy. Canary-tested against a dead port: 24 failures, exit 1, no false
clean. `og:image` is a warning and never a failure, because "this studio has
no photos" is not a bug.

### 0.0.60 Buying the portfolio has to make you findable

The owner's rule: sign up, buy the portfolio plan, and your studio's name
appears — so that searching it on Google finds the portfolio. Traced end to
end with a fresh account rather than read.

The directory's plan gate was already right: a studio is listed as soon as it
holds an active portfolio subscription. But the public URL **slug** lived in
`portfolio_profiles`, and that row was only ever created lazily by a READ
(`portfolio_service._ensure_slug`, reached from the public portfolio
endpoint). So a studio that had just paid got:

- a directory card linking to its raw UUID, and
- **no sitemap entry at all**,

and stayed invisible to search until some human happened to open its page.

`ensure_portfolio_slug` now runs on portfolio-plan activation (both the
test-account free path and the gateway verify), plus
`backfill_portfolio_slugs` at startup for everyone who bought earlier.
Verified by clearing a slug, buying through the real endpoint, and watching
the card go UUID → `test-studio` and the sitemap entry appear with nobody
opening the page.

**The lazy-write pattern is the thing to watch for.** A value that only
materialises when someone reads it is fine for a cache and wrong for anything
another system enumerates. The sitemap enumerates.

### 0.0.61 The placeholder defaults were publishing fabricated credentials

Making purchase auto-advertise the page turned a latent problem into an
active one. A studio that had filled in nothing published:

    "Founded in 2020, we have been dedicated to…"
    500 events covered · 350 happy clients · 100,000 photos delivered
    Awards: Best Wedding Photographer (Regional), Certified Cinematographer
    Certifications: Certified Professional Photographer
    Camera gear: Sony A7 IV, Canon EOS R6
    5 years experience · located in "Your City"

`PORTFOLIO_DEFAULTS` is written as **editor placeholder text** — "Your City"
and "Your State" give it away — but both of its call sites are PUBLIC
readers. Awards and certifications nobody earned are not a placeholder
problem; they are the platform asserting credentials on a real business's
behalf, and CLAUDE.md's "real reviews only, no fake hyping" is the same rule.

`_PUBLIC_UNSAFE_DEFAULTS` now withholds every default that reads as a fact
about the business. Whatever the studio actually saved always wins; the
defaults survive only in the studio's own editor.

An empty portfolio is also `noindex,follow` and excluded from the sitemap —
the sitemap and the crawler renderer must agree about the same page, or the
sitemap teaches Google to distrust it. It becomes indexable the moment the
studio writes anything.

### 0.0.62 Five design catalogues, and the premium design that never rendered

`scripts/check_design_catalogues.py` checks all five against a running stack:

| catalogue | result |
|---|---|
| wedding designs (catalogue.json) | 332/332 artwork files serve, 188 designs |
| category designs (baby_birthday, half_saree, puberty, dhoti) | 30/30 |
| event templates (Ganesh) | 20/20 (10 templates × thumb + preview) |
| portfolio designs | 10/10 after the fix below |
| deity artwork | **0/8 — files do not exist** |

**`premium_editorial` was sold and never rendered.** The backend accepted it,
the picker offered it beside the other nine with the same label, and
`POST /api/portfolio/design` returned 200 — but `PhotographerPublic`'s token
table had no entry, so `resolveTokens` fell through to the tier default and
painted the page as `premium_gallery_wall`. No error anywhere. It also
declared `layout: 'premiumEditorial'`, naming a component that exists nowhere,
and advertised "asymmetric grid, films, reels". Wired to the tokens it already
declared; the `layout` key and the copy promising it are gone.

**Deity artwork is genuinely absent** and needs real licensed images from the
owner — not generated stand-ins. `lord_library.py` says so at the top now.
Nothing renders them today, so no user sees a broken image; the danger is a
future UI assuming the paths resolve.

**The 44 that looked broken and were not.** The checker first failed 44
wedding designs for a missing `src960`. They simply have no 960px variant,
and every consumer reads `src960 || src480`. An absent optional field is not a
missing file — only a path that is DECLARED and then fails to serve is a
fault.

### 0.0.63 Sweeping routes: key on console errors, and use a fresh tab

161 routes, three personas. **70 public / 68 studio / 23 admin — two studio
pages crashed**, both invisible to a text-based sweep because the error
boundary recovers and re-renders.

`/studio/calendar` had never worked, through three stacked faults:

1. It sent `?month=2026-08`; the endpoint takes `year:int` and `month:int`.
   Every load 422'd.
2. **FastAPI's 422 `detail` is an ARRAY of objects.** Every handler here does
   `e?.response?.data?.detail || 'fallback'` — 205 of them — and an array is
   truthy, so React got the raw array as a child and threw "Objects are not
   valid as a React child". The page looked crashed; the fault was one query
   param. Flattened in the axios response interceptor, which fixes all 205
   call sites at once and cannot regress a string `detail`; the array stays on
   `detail_raw`.
3. With the request fixed it crashed again: `days` is a MAP keyed by ISO date,
   not the array of `{date, booking, blocked}` the page assumed.

`/studio/profile/{id}/rsvps`, same shape — a 500 and a crash stacked so the
second hid the first. `RSVPResponse` requires guest_name/guest_phone/
guest_count; legacy and seeded rows carry `name`/`guests`, so **one bad row
500'd the entire guest list**. Legacy keys are mapped and an unparseable row
is skipped and logged. `RsvpList` also read `.length` off a null, which is
what `rsvps` is both while loading and on failure.

**Verify on a fresh tab.** The browser console buffer persists across
navigations, so stale entries from before a fix read exactly like a live
failure — twice this session an already-fixed page looked broken because of
it. A new tab has an empty buffer and gives a straight answer.

---

### 0.0.64 `pytest backend/tests` could not run, and that hid four real bugs

CLAUDE.md names `PYTHONIOENCODING=utf-8 python -m pytest backend/tests -q` as
THE verification command. It did not work. Collection died with
`Interrupted: 14 errors during collection`, so the only thing anyone could run
was the curated `tests/run_event_suite` list that CI runs — and everything
outside that list rotted unseen for as long as it took to notice, which was
never. Three separate causes:

1. **An empty `aws_service` stub, planted 45 times.** Each suite did
   `sys.modules.setdefault("aws_service", types.ModuleType("aws_service"))` at
   import so it could pull in `server.py` without boto3. Fine alone; pytest
   imports the whole directory into ONE process, so the first event suite's
   empty module was still installed when a later one ran
   `from aws_service import s3, bucket, upload_bytes` — `ImportError: cannot
   import name 's3' from 'aws_service' (unknown location)`. Six modules died of
   this, and `test_face_provider_wiring.py` had a comment pinning its own
   alphabetical position as a workaround. Now `tests/aws_stub.py`: one stub
   answering ANY name through PEP-562 `__getattr__`, so it cannot be the reason
   an import fails.

2. **`assert BASE_URL` at module scope** in the live-HTTP suites. An assert at
   import time is a collection error, not a skip — four modules took the whole
   directory down with them. Others defaulted to `http://localhost:8000`, where
   nothing has ever listened. `tests/live.py::require_live()` resolves the URL,
   probes it once, and skips the module with a reason when nothing answers.

3. **Four Mongo-era modules** importing `motor` / `pymongo` against
   localhost:27017. Ported or deleted, see 0.0.66.

**Then the tests ran, and 45 failed.** Most were the suite tripping the login
rate limiter over itself — twenty modules each logging in independently is 20
logins from one IP inside a minute, and the limiter (15/IP per 15 min) is doing
its job. `tests/live.py::login()` caches the token per process. What was left
after that was signal, and it included:

* **The homepage banner counted published invitations from `wedding_profiles`,
  a table nothing writes.** Weddings live in `profiles`. The public
  "Photographer Advantages" banner advertised **0 published invitations** to
  every visitor, for ever, no matter how many were live.
* **`test_admin_dashboard_v2.py` had never executed once.** Its login used
  `studio.test@majacreations.com`, which 401s here, and the fixture called
  `pytest.skip` on failure — 26 dashboard tests reporting green while asserting
  nothing. Pointed at the seeded photographer, 25 passed and one found
  `credits_spent` still expected on quick-stats.
* **Two negative tests in `test_bucket1a_song_checkin.py` had also never run**:
  their create payload was missing the required `event_type`, so both hit
  `pytest.skip("Could not create temp profile")` every time.
* Hardcoded `DEMO_PROFILE_ID`s from the old environment (404 here) across five
  files. Those suites now build their own invitation through the admin API and
  delete it after. A test that needs a feature enabled should enable it —
  depending on ambient seed state means the suite reports on the seed.

End state: **226 passed, 2 skipped, 0 errors** across the whole tree.

**A skip is not a pass.** Three of the four bugs above were sitting behind a
`pytest.skip` that nobody read. If a fixture can silently opt a module out, it
will, and the suite will stay green while covering nothing.

### 0.0.65 `create_index` was a no-op, and `find_one_and_update` was neither

Porting the Mongo index tests meant asking what the Postgres equivalent was.
The answer: there wasn't one.

**`pg_adapter.create_index` was `return None`**, with a comment pointing at
`db/schema.sql` — a path that does not exist (the file is
`microservices/db/schema.sql`) and which only ever runs on a FRESH volume, so
it can never fix an existing database. The ~40 `create_index` calls the server
makes at startup created nothing, on a new database or an old one, while
logging `[indexes] profiles dashboard indexes ready`. The seven composite
`profiles_admin_*` indexes behind the studio dashboard's
`find(admin_id …).sort(created_at desc)` are declared nowhere else, so they did
not exist — which is exactly the quadratic slowdown the call site's own comment
says it was written to fix.

It now builds real indexes: key expressions come from `_field_sql`, the same
translation the query builder uses (so the planner recognises them), `sparse`
becomes a partial index over rows that have every indexed field, and everything
is `CREATE INDEX CONCURRENTLY IF NOT EXISTS` on its own connection so a build on
a live table takes no write lock. 27 indexes appeared on the first boot; the
second created 0 and cost one catalog query each. Verified with `EXPLAIN` under
`enable_seqscan = off` that the planner actually uses them — a seq scan on a
36-row table is the right plan, so "the plan didn't change" proves nothing.

Two declarations were deleted rather than made real: `wishes` and
`gallery_events` are collections nothing reads or writes (guest wishes live in
`guest_wishes`). While create_index was a no-op those lines were merely untrue;
once it works they would also CREATE the empty tables.

**`find_one_and_update` was worse.** Two defects in nine lines:

* It returned `row["data"]` raw. asyncpg hands back a jsonb column as JSON
  **text** and every other read path calls `_as_doc` on it; this one did not,
  so the function returned a **str**. `POST /api/weddings/{id}/publish` — the
  one publish path in the product, per CLAUDE.md — died on
  `wedding.get('title')` with `'str' object has no attribute 'get'`, which the
  handler dressed up as a 500. **Publishing an invitation was broken outright.**
  Same for the invoice-number counter, the storage-plan swap, and the
  face-search session claims.
* The atomic claim was not atomic. `UPDATE … WHERE id = (SELECT id … WHERE
  <cond> LIMIT 1)` evaluates the condition in the caller's snapshot and matches
  on `id` alone, so two concurrent publishes both saw the row unclaimed, both
  passed, and the second waited for the row lock and then wrote anyway without
  re-checking. Two clicks published one wedding twice. `FOR UPDATE` on the
  inner select makes Postgres re-run the qual against the committed version
  after the lock (READ COMMITTED / EvalPlanQual); the loser now gets None,
  which is the "somebody got there first" signal every caller already handles.
  `update_one` had the identical shape and the identical fix — `media_reconcile`
  documents "CAS via find_one_and_update, status guard in the filter (house
  rule)", and the house rule did not hold.

The concurrency test in `test_batch_a_race_safety.py` is what caught the second
one, on its first run after the port. It had been uncollectable for months.

**A read model with no writer looks wired and is not — and so does a write path
with no test.**

### 0.0.66 What the four Mongo-era modules became

Ported, not deleted, where the behaviour is still live; deleted where the
feature is gone. Never "fixed" by relaxing an assertion until it passed.

| file | kept | dropped |
|---|---|---|
| `test_iter2_meal_time_indexes` | dashboard + supplementary indexes (now against `pg_indexes`), publish title derivation | paginated/quick-stats (duplicated `test_admin_dashboard_v2`), credits pricing probe, **both meal_time round-trips** |
| `test_phase2_audit_fixes` | slug reuse after soft delete, logout blacklisting a JWT end to end, the OG intercept, the public-invite rate limit | purge refunds + every `credit_ledger` assertion; the trash-purge test that grepped server.py for a string and then re-implemented the purge itself |
| `test_phase3_studio_watermark` | studio-storage gate + bypass list, watermark override | normal-user credit add/deduct |
| `test_batch_a_race_safety` | double-click publish, re-publish refusal, bulk-action not being a backdoor | gift-code redemption race, Razorpay verify double-credit, bulk-purge refund — all routes that no longer exist |

**`meal_time` is gone and was not rebuilt.** `theme_settings` is a typed
`ThemeSettings` model with no `maja` sub-object, `ProfileUpdate` does not carry
`theme_settings` at all, and across the whole backend `meal_time` survives only
in `order_to_invitation.py` copying an order's "meal" note. Nothing reads it,
no model declares it, frontend-v2 never mentions it. Making that test pass
would have meant building the feature, not testing it.

`test_photographer_tiers` shrank the same way. Its admin half targets
`/api/super-admin/pricing/*`, retired and 410 by router dependency, already
covered by `test_credits_retired`. Its live half — `/api/photographer/me/tier`
— stayed. But note: **`paid_links_count` has no writer.** The credit-priced
publish path incremented it and was deleted with credits, so every photographer
resolves to the first tier for ever and `links_to_next` never falls. The
resolution logic is correct and tested; a "progress to your next tier" UI built
on it would promise a promotion that cannot arrive. Said so in a comment on
`my_tier` rather than leaving it to be rediscovered.

### 0.0.67 Smaller things the run turned up

* **Guest check-in was never deduplicated.** The 30-minute guard filtered with
  `{"guest_name": re.compile(...)}` — Mongo/BSON syntax. pg_adapter speaks the
  `{"$regex": …, "$options": "i"}` form and treated a compiled `re.Pattern` as
  a plain value, so the filter matched nothing and every re-tap of the check-in
  button added another guest to the venue count. Fixed at the call site, and
  `_eq` now raises `NotImplementedError` on a Pattern instead of silently
  matching nothing — an unsupported query should fail, not return wrong rows.
* **The studio dashboard's activity feed has never shown a wish.** It read
  `db.wishes` (nothing writes it) for a field named `author_name` (nothing sets
  it); the real collection is `guest_wishes` and the field is `guest_name`. The
  `if "wishes" in list_collection_names()` guard meant it failed silently.
* **`jwt_blacklist` grew for ever.** Its docstring said "a TTL index on `exp`
  keeps the collection bounded"; Postgres has no TTL index, so nothing expired.
  Logout now sweeps expired entries — the writer is the only caller, so there
  is no scheduler to forget.
* **`test_music_presets_returns_60`** pinned the count at 60. The library was
  deliberately cut to 20 because the 60 advertised Indian-wedding titles all
  pointed at the same 16 generic demo instrumentals — the test was pinning the
  dishonest version. It now asserts unique ids, required keys and https urls.
  Its key names were wrong too (`id`/`title`, wire is `preset_id`/`name`); it
  never got far enough to notice.
* **An invitation with no couple photo emits no `og:image` at all.** That is
  the same rule `portfolio_seo` follows deliberately — an invented image is
  worse than none. But a share with no image is a plain link on WhatsApp, which
  is where these invitations actually travel. **A branded default share image
  would fix that for every invitation before the couple uploads anything, and
  it needs real artwork — an owner decision, like the deity art.**
* `GET /api/admin/profiles/{id}` returns neither `title` nor `theme_settings`:
  `ProfileResponse` declares 63 fields and neither is one of them. The
  dashboard reads `title` from the paginated listing, which does return it, so
  nothing is broken — but assert against the listing, not the single GET.

### 0.0.68 The home page never opened a preview, because it never linked to one

Reported as "in home page there is no any previews that are opening". It was
literal, and worse than it sounded.

**The showcase section was decorative fiction.** Six collection names —
*Royal Heritage, Floral Garden, Temple Classic, Mughal Court* — none of which
the catalogue sells, drawn as line-art SVG in `assets/showcase-art.jsx`. Zero
of the six were clickable (verified in the browser: `cards: 6, clickable: 0`).
Above them sat a hand-drawn phone captioned **"Not a mockup"**, over a mockup.

**And the catalogue was orphaned.** `LINK.browseThemes` was `'/pricing'` with
the comment *"no theme browser yet"* — stale: `/browse` holds all 188 designs.
`NAV_LINKS` had no Designs entry either. Grepping every marketing surface, the
only links to `/browse` came from inside the design pages themselves. **A
visitor could not reach a single design from the home page, the nav, or the
footer.** The live sample invitation built last session (`/preview/luxe`) was
in the same position — reachable only if you already knew the URL.

So the previews existed and nothing pointed at them.

**What replaced it** — `components/landing/ThemeShowcase.jsx`, which is the
legacy landing page's behaviour (category tabs → design grid → preview)
rebuilt on this app's catalogue and routes, not ported:

* the real ten collections, with real artwork from `catalogue.json`, real
  counts (`15 designs · 6 ceremonies`) and their real palettes;
* the four celebration categories from `/api/event-categories`, with their
  designs;
* every card opens `LivePreviewModal` — an **iframe of `/preview/luxe` or
  `/preview/celebration/:category`**, the same route "open full screen" points
  at. Not a second rendition that can drift; `?embed=1` just drops that page's
  own chrome. All ten themes verified to resolve distinct palettes through the
  frame (`--inv-primary` differs for each), all four categories their own
  celebrant.

The phone in the section header is now that same iframe. It renders at a real
390px viewport and is scaled down by a CSS variable, because an iframe given a
150px-wide viewport lays itself out for a device that does not exist.

**Degrades honestly.** No catalogue → cards still render from the theme tokens
and simply carry no artwork and no count, rather than a number nobody checked.

#### Two things this pass turned up on the way

* **12 MB of artwork behind one tab.** The celebration galleries served the
  designer's originals as grid thumbnails — `dhoti/` is 12 MB across seven
  images, `dhoti_2.png` alone is 6.1 MB. Nothing had rendered them before, so
  nobody had paid for it. `scripts/optimize_category_designs.py` builds 480px
  WebP siblings (**14,040 KB → 501 KB**, 97% smaller); `thumbnail` now points
  at those and `preview_image` keeps the original. Heaviest tab: **131 KB**.
* **`wedding.cover_preview` had pointed at a file that has never existed here**
  — `/designs/all/…`, the legacy tree, dropped in the rebuild. It survived
  because **a missing static file does not 404**: Vite and the Caddyfile both
  answer 200 with `index.html`, so a status check passes and only the browser
  finds out. `backend/tests/test_category_design_assets.py` therefore checks
  the **filesystem**, not the server, for all 30 designs and 5 covers.

**A `<=` in that test let a deliberate revert pass.** The canary put
`thumbnail` back on the 6 MB originals and the suite stayed green, because
`thumb <= original` is satisfied when they are the same file — which is exactly
the regression. It is `!=` on the path plus `<` on the size now, and the same
canary fails 7 tests.

Also fixed while sweeping: `DesignTile` linked with a bare `<a href>`, so every
click in the design funnel was a full document load; and the five legal pages
never called `useSeo`, so `/terms`, `/privacy` and `/refund` all displayed
whatever title the previous route had left in the tab.

**Gates:** 295 passed / 2 skipped · design catalogue check clean (30/30
category designs) · secret scan, admin-id deref, SEO routes clean · 19 public
routes swept with **0 console errors** · frontend-v2 builds.

> **Lazy images never load in a hidden browser pane.** Mid-sweep, 0 of 10 tiles
> reported loaded and it looked like the artwork was broken. It was not:
> `loading="lazy"` needs the page to composite frames, and the pane was not
> displayed. `fetch()` returned 200 `image/jpeg`, and forcing `loading="eager"`
> decoded it at 720×1280. Check the bytes, not `naturalWidth`.

### 0.0.69 The site was selling to couples, and quoting a price the checkout would not honour

Reported as *"there is no couple or normal user using these website, is purely
for the photographers"*. That is already true of the **architecture** — accounts
are studio accounts, `/api/users/*` answers `410`, and `Cart`/`Checkout` both
gate payment behind a studio Bearer identity. It was not true of the **site**.

**What the marketing site said.** The hero read *"Your wedding, remembered
exactly as it felt … a digital invitation crafted like an heirloom … for the
two of you"* — directly above a **Set up your studio** button. `/pricing`
opened on a tab labelled **For couples**. The FAQ's first question was *"Do I
design the invitation myself?"*. Someone had noticed the pivot enough to add a
*"Planning your wedding? ask your photographer"* line to two pages, but nobody
rewrote the pages.

Rewritten so the photographer is the customer and the couple is their client,
across `Landing`, `Pricing`, `HowItWorks`, `Faq` and the `Features` CTA. Every
factual claim was kept; only the addressee changed. The courtesy line pointing
a couple who lands here at a photographer was kept deliberately — they do land
here, and sending them to the directory is the correct answer.

Two other honesty edits in the same pass: the trust bar's *"Trusted by wedding
photographers across India"* became *"Built for…"* (the first is a social-proof
claim nobody can verify on a young site), and the `/pricing` per-card CTA now
leads with **Sign in to order** and demotes *"Not a photographer? Find one"* to
a secondary line, which is the actual order of likelihood.

#### The site advertised a price the checkout will not charge

Found by checking my own new copy against the store rather than against the old
copy. `Landing.jsx` and `Faq.jsx` both hard-coded the four invitation tiers,
and both said **Royal ₹5,999**.

```
store_features.py  PACKAGES["royal"]["price"]["english"]  ->  4999
GET /api/store/packages                        royal      ->  4999   (what
                                                                     /pricing,
                                                                     the quote
                                                                     and the
                                                                     charge use)
```

`Faq.jsx` even carried a comment asserting its figures *"match store_features.py's
PACKAGES defaults (₹1,499 / ₹5,999 / ₹9,999)"*. They did not, and the comment is
why nobody rechecked. **Both pages now read `/api/store/packages` and print no
figure at all when it fails** — a home page quoting a price the checkout will
not honour is worse than one quoting none.

> The lesson generalises: a hard-coded mirror of a server value is a defect
> waiting for someone to edit the server. If a number is authoritative
> somewhere, render it from there.

#### `/pricing` offered five paid storage tiers at ₹0, unlabelled

`StudioPlanPicker` drives both plan cards and the extra-storage rows from one
`cycle` state. The two endpoints do not agree on how a cycle is keyed:

| Endpoint | Cycle keys |
|---|---|
| `/api/public/pricing/portfolio` | `'1' '3' '6' '12'` (**months**) |
| `/api/public/pricing/storage` | `'30' '90' '180' '365'` (**days**) |

So `(t.cycles || {})[cycle]` missed on every row and rendered
`inr(undefined)` → **₹0**. The same block read `t.storage_gb` / `t.tier`, but
those rows carry `gb_limit` / `label`, so the label cell was empty and
`key={t.plan_id || t.tier}` was `undefined` on all five rows — the React key
warning was the only visible symptom, and it was the thread that led here.

Fixed by mapping months → days, keying on `gb_limit`, and **dropping a row
rather than showing it at zero** when a cycle has no price. Verified across all
four cycles: `50 GB ₹149/Monthly … 1 TB ₹14,999/Yearly`.

**This was only visible because `/pricing` now opens on the studio tab.** It
defaulted to the couple tab, so `StudioPlanPicker` was not mounted on first
paint and nobody had looked. Changing a default is a legitimate way to find
bugs.

#### `/portfolio-samples` sent buyers to look at other photographers

The route was `<Navigate to="/photographers" replace />` — a photographer
researching which plan to buy was redirected to the directory of *other*
photographers. The ten portfolio designs were visible only inside
`/studio/portfolio`, which needs an account, which needs a plan. **The one
question a buyer has before subscribing could only be answered after
subscribing** — the same shape as the invitation-preview gap in §0.0.68.

`pages/PortfolioSamples.jsx` now renders all ten **in their own design**: real
`bg`/`surface`/`ink`/`accent` and type from `lib/portfolioDesigns.js` (imported,
not copied), a tier badge, the palette, and which plan unlocks it. The tiles
inside each card are deliberately **not** stand-in photographs — inventing
someone's photography to sell a palette would be showing work that does not
exist. Linked from the landing studio section and the `/pricing` studio tab.

#### Three placeholder boxes on the home page are gone

`couple portrait, warm film tone`, `invitation detail, mobile screen` and
`studio dashboard preview` were literal striped `div`s with that text in them,
in violation of the standing no-placeholder rule. Replaced with real catalogue
artwork, a live invitation in a phone frame, and — for the studio one — the
actual list of screens behind the sign-in, because a screenshot of a panel
nobody has signed into would itself be a mockup.

**Gates:** 295 passed / 2 skipped · secret scan, admin-id deref, SEO routes
clean · 14 public routes swept with **0 console errors** · frontend-v2 builds.
Commit `827745c`.

> **HMR reporting an update is not evidence the running code changed.** After
> fixing the storage rows I re-checked the page and still saw ₹0, and briefly
> believed the fix was wrong. A hard reload showed it working — the module was
> stale. Reload before you conclude anything from the browser.

---

### 0.0.70 What is still open

Ordered so that anything blocked on the owner is separated from anything a new
session can just pick up. Nothing here is known-broken unless it says so —
these are gaps, decisions and unverified claims.

#### A. Blocked on the owner — no code will help

1. **Rotate 6 secret sets.** Razorpay, Supabase (`service_role` especially),
   AWS, Gemini, Postgres, CloudFront. They were committed to the **old
   `wedding-36`** repo's history and are still live. Order and blast radius are
   in [`SECURITY_ROTATION.md`](SECURITY_ROTATION.md). This repo's history is
   clean and must stay that way.
2. **Four production integrations are absent**, read from the live `.env`:
   no email provider (password resets and receipts send nothing); no SMS/OTP
   provider with `DEV_MODE_OTP=0`, so `/auth/send-otp` returns **503**;
   Razorpay is a **test** key, so no real payment can complete; no AWS, so
   uploads sit on local disk and Rekognition is unavailable.
3. **Deity artwork — 8 files** still missing for the event module.
4. **A branded default `og:image`** for invitations with no couple photo. The
   SEO route check warns about this on every run; it is a design asset
   decision, not a bug.
5. **Decide what happens to `paid_links_count`.** The photographer tier ladder
   (`/api/photographer/me/tier`, and the ladder shown on public pricing) reads
   it, and **nothing has incremented it since credits were deleted** — the only
   writer was the credit-priced publish path. So in production every studio sits
   on the first tier for ever. Either give it a writer or drop the ladder from
   the public page; do not build progress UI on it meanwhile. See the docstring
   on `my_tier` in `super_admin_pricing.py` and the module docstring in
   `backend/tests/test_photographer_tiers.py`.

#### B. Public-data hygiene — small, worth doing early

6. ~~**A test plan is live on a public endpoint.**~~ **RESOLVED (§0.0.76).**
   `/api/public/pricing/portfolio` now returns only the five real plans;
   `plan_portfolio_test` is filtered out. It still shows on the super-admin
   founding console, which is correct — and since §0.0.76 the console can no
   longer confuse it with the real Premium plan when saving a price.

#### C. Routes that still redirect where a page probably belongs

7. Each of these is a `<Route>` whose element is `<Navigate>`. **A redirect
   counts as "present" in any route-parity count while doing nothing**, which
   is how `/portfolio-samples` survived so long. Each needs a judgement call —
   build it, or accept the redirect deliberately and note why:
   `/designs` · `/create/ganesh` · `/community/about` · `/portfolio-plans` ·
   `/order/pending` · `/experience/demo` · `/studio/themes`.

#### D. Legacy screens judged "probably superseded" — never verified

8. Roughly **30 legacy screens** were classified as superseded by reading, not
   by opening them: `Phase30Analytics`, `PhotographerProfilePage`,
   `ThemeSettings`, the CloudBackup history view, the live-upload status view,
   plus `/admin/analytics/overview`, `/admin/analytics/global` and
   `plan-purchase-details`. Given that the same judgement hid a 500 on the
   super-admin console (§0.0.63) and an unreachable design catalogue (§0.0.68),
   **this classification deserves no benefit of the doubt.** Open each against
   the running stack before deciding.
9. **The remaining UNCOVERED clusters in §0.7d**, in the order given there. The
   dead-end queues are done; what is left is real but not blocking.

#### E. Known duplication and rough edges

10. **`PhotographerPublic.jsx` keeps its own copy of the ten portfolio design
    token maps**, duplicating `lib/portfolioDesigns.js`. They agree today — I
    diffed them — but two copies of a palette is exactly how
    `premium_editorial` silently rendered as `premium_gallery_wall` once
    before. Collapse to the lib when someone touches that file.
11. **Portfolio designs name fonts the app does not load.** Fraunces, Playfair
    Display, Archivo Narrow, Jost, Space Grotesk, Zilla Slab, Lora and
    JetBrains Mono all fall back to a system face; only Spectral and Inter are
    linked. Either add the `<link>`s or stop naming faces that never render.
12. **Marketing copy is re-aimed, not finished.** `Landing`, `Pricing`,
    `HowItWorks` and `Faq` were rewritten for the photographer audience;
    `Features` (body copy), `Story` and `Contact` had only their CTAs and
    obvious couple-isms touched. Worth a read-through in one sitting.

#### F. Things you should NOT do

- **Do not restore credits or normal-user accounts**, and do not add a Credits
  or User Dashboard UI. See CLAUDE.md — this is a settled product decision, and
  those routes answer `404`/`410` on purpose.
- **Do not add features to `frontend/`.** It is the legacy CRA app, is not
  deployed, and exists only as a reference for pre-rebuild behaviour.
- **Do not fabricate a charity number.** The food-donation feature uses the real
  CHILDLINE **1098** and nothing else. Ratings come from real reviews only.

## §1 — Earlier sessions

Sessions 1–3 (the photographer-only pivot, the credits retirement, the
normal-user retirement, the original frontend-v2 build) are recorded in the git
history of this repo and in the old repo's own `SESSION_CONTEXT.md`, which was
never carried over. Read `git log` here first; fall back to
`mani1715/wedding-36` only for behaviour that predates the rebuild.
