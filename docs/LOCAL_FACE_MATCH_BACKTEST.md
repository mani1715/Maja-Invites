# Local Face-Match Backtest + Security Hardening Gate

Local-only acceptance run. **No VM/AWS/CloudFront touched; nothing pushed.**
Result of the gate is a deployment-readiness decision, at the bottom.

- **CURRENT_COMMIT** (start): `8d024eb`
- **HEAD** (end): `54fb056` — 3 new commits made locally this phase, **not pushed**:
  - `f16abaa` fix NameError (missing `List` import) — caught by booting the backend
  - `8c176e9` test: expect `no_face` in the indexing breakdown
  - `54fb056` fix `compute_face_ops` semantics + aggregate fallback — caught by the event gate
- **BRANCH**: `main` · **WORKTREE**: repo root

## Test environment

| Service | How | Port |
|---|---|---|
| Postgres | existing portable cluster (`.localpg/data`, `pg_ctl`) | 5433 |
| Redis | `redis-server` (installed) | 6379 |
| Backend | `.venv` uvicorn `server:app`, `SEED_TEST_ACCOUNTS=1` | 8001 |
| Frontend | `yarn build` (static gate; Vite) | — |

`backend/.env` has `JWT_SECRET_KEY` + `SUPABASE_DB_URL` but **no AWS keys** →
every Rekognition/S3-dependent test is `BLOCKED_EXTERNAL_AWS` (there is no local
Rekognition and no local S3; fabricating PASS is forbidden).

## Commands used

```bash
# stack: pg_ctl start (5433), redis-server (6379), uvicorn (8001)
PYTHONIOENCODING=utf-8 ./.venv/Scripts/python.exe -m pytest backend/tests -q   # x2
cd backend && ../.venv/Scripts/python.exe -m tests.run_event_suite
./.venv/Scripts/python.exe scripts/scan_secrets.py --tree
./.venv/Scripts/python.exe scripts/find_dict_admin_deref.py
cd frontend-v2 && yarn build
# live probes: SQLi on /api/auth/login, no-auth on /api/admin/*, P0 live-wall gate
```

## Automated results

- **pytest backend/tests: 819 passed / 3 skipped / 1 xfailed — TWICE consecutively**
  (48s, 52s). The 3 skips are AWS-live e2e (`test_face_quota_e2e_live`,
  face-index-live), correctly skipped without AWS.
- **Event gate: 76/76 suites, 1958 checks, ALL GREEN.**
- **Secret scan: clean.** **admin-id deref scan: clean.**
- **frontend-v2 build: clean.**

## Bugs found and fixed this phase

1. **NameError on backend boot** (`f16abaa`) — `list_face_ids_for_image`
   annotated `List[str]` but `aws_service` never imported `List`. `py_compile`
   does not evaluate annotations; the module-level def does at import → crash.
   Caught only by actually starting uvicorn. **This is the class of bug a local
   backtest exists to catch.**
2. **`compute_face_ops` miscounted** (`54fb056`) — a prior bounded rewrite gated
   counts on an `indexed` flag the data model does not require (indexed ==
   `face_count>0`) and called `aggregate`, which the test FakeDB lacks. Restored
   original semantics + added a scan fallback. Event gate 4→0 failures.
3. Test shape (`8c176e9`) — `no_face` added to the indexing breakdown.

## Security findings (live-probed locally)

- **P0 live-wall PIN gate — LIVE VERIFIED (the headline fix from `9dd60ce`).**
  Seeded a PIN-protected profile, probed `GET /api/invite/{slug}/live-gallery`:
  - no token → **401** · bogus token → **401** · wrong PIN → **401**
  - unlock with correct PIN → token → **200**
  Before the fix this endpoint returned the full wall with no token.
- **SQL injection on `/api/auth/login`** — `admin' --`, `' OR '1'='1`,
  `'; DROP TABLE admins; --` → **401**; malformed → **422**; valid login → **200**
  after the DROP payload (table intact). Parameterized via pg_adapter. PASS.
- **No-auth admin endpoints** (`/api/admin/face-ops/overview`,
  `/gallery/quota`, `/face-match-qr`) → **403**. PASS.
- **face-ops overview on real Postgres** → **200** (aggregate `$sum`/`$group`
  path works; empty DB → zeros, no 500).

### Low-priority observation (not fixed — no practical impact)
`gallery_privacy.public_unlock` (line ~353) generates an ephemeral
`secrets.token_hex(8)` salt when `device_token_salt` is absent and does **not**
persist it, so tokens for such a profile never verify. Real galleries always
set the salt at PIN-creation (line ~178), so no live gallery is affected; only a
hand-constructed/legacy privacy object lacking the salt would hit it. One-line
fix if ever needed: persist the generated salt.

## BLOCKED — VM/AWS REQUIRED (not run locally; not fabricated)

These are `BLOCKED_EXTERNAL_AWS` — no local Rekognition, no local S3, no AWS keys:

- Phase 6/7 direct-S3 multipart + original byte SHA-256 preservation
- Phase 9–14 actual face indexing, multi-face, no-face against real Rekognition,
  Rekognition **collection isolation**, the guest selfie→search journey, and the
  **cross-event face attack** (Event A QR + Person B selfie → 0 results)
- Phase 18 live S3 authorization (bucket listing / forged key)
- Phase 23 live selfie upload to the private face bucket + lifecycle delete
- Phase 25 Rekognition retry idempotency + the ListFaces orphan cleanup —
  `BLOCKED_EXTERNAL_AWS_IAM` (needs `rekognition:ListFaces` on maja-backend)
- Phase 26 indexing throughput / search-latency performance numbers
- Phase 22 safe local load simulation — not run
- Phase 27 mobile device sweep — not run locally

Their enforcing logic is code-verified (audit §0.0.83 with file:line + unit
tests on FakeDB), but the spec's rule stands: static verification is not a live
PASS. Run them in `docs/VM_ACCEPTANCE_RUNBOOK.md` on the VM.

## Readiness decision

Everything runnable locally is green; every unrunnable item is a real
AWS/VM dependency marked NOT VERIFIED, not a fabricated PASS. No open P0/P1: the
one P0 (live-wall gate) is fixed and live-verified.

```
READY_FOR_VM_DEPLOYMENT=YES
```

Preconditions before the VM run:
1. Push the 3 local commits (`f16abaa`, `8c176e9`, `54fb056`) — the boot-crash
   fix (`f16abaa`) is **mandatory**; without it the backend will not start.
2. Add `rekognition:ListFaces` to the maja-backend IAM policy (Phase 25).
3. Run the AWS/VM-blocked phases above via the acceptance runbook and record
   actual measurements (no assumed SLA).
