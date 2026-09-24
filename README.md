# MAJA Invites — M0001 (production home)

Digital wedding & celebration invitation platform: legacy business logic (1,182-route FastAPI monolith) + the M12 UI (frontend-v2, built 1:1 from the design prototypes) + single-VM cloud architecture (GCP compute + AWS S3/CloudFront/Rekognition).

Curated from the `maja-v2` build repo on 2026-08-11 — build/audit scratch, legacy one-off reports, and the vestigial microservices shell were dropped; git history preserved.

## Layout
| Path | What |
|---|---|
| `backend/` | FastAPI monolith (`server.py` + ~90 routers), `worker.py` (face-match queue consumer), tests (module-script style: `python -m tests.test_x`) |
| `frontend-v2/` | **The website** — Vite + React, screens ported from the M12 `.dc.html` designs, typed API client, 3 auth identities |
| `frontend/` | Legacy CRA app — fallback ONLY for surfaces not yet ported (super-admin consoles, full studio suite, Pixora). No new work goes here |
| `microservices/db/schema.sql` | Postgres schema (auto-applied on first DB init; referenced by deploy compose) |
| `deploy/` | Production stack: docker-compose (caddy/core/worker/postgres/redis), hardened Caddyfile, `.env.example`, encrypted backup + restore-test scripts |
| `docs/` | `DEPLOYMENT.md` (GCP+AWS runbook + secret-rotation checklist), `MAJA_IMPLEMENTATION_STATUS.md` (verified state), `API_SURFACE.md`, recon inventories, implementation plan |
| `scripts/` | Done-for-you invitation authoring (`new-invitation.mjs`, `deliver.mjs`), `loadtest.js`, `check-secrets.sh` |
| `ops/` | Raw DB backup/restore scripts (wrapped by `deploy/backup.sh`) |

## Run locally
One-time setup:
```
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
cd frontend-v2 && yarn install
```
Then:
```
.\run.ps1
```
Website http://localhost:8127 · API http://localhost:8001/api/health · Stop: `.\stop.ps1`
(Ports 5433/8001/8127 on purpose — 5432/8000/3100 collide with sibling projects. Postgres binaries are reused from `wedding-36\.localpg\pgsql` — see note in `run.ps1`.)

## Deploy
Follow `docs/DEPLOYMENT.md` end-to-end: rotate the six secret sets FIRST (old repo history was compromised), provision GCP e2-standard-4 + AWS (S3 private, CloudFront OAC + key pair, Rekognition ap-south-1), fill `deploy/.env`, build `frontend-v2` (`yarn build`, no sourcemaps), `docker compose up -d --build`, run the smoke list, prove a restore with `deploy/restore-test.sh`.

## House rules (backend)
See `CLAUDE.md` — router registration order is load-bearing; `require_admin` returns a dict, `get_current_admin` a string; never add `from __future__ import annotations` to router modules; pg_adapter is Mongo-shaped over JSONB (no `$lookup`/`$unwind`; filter booleans in Python).
