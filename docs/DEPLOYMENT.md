# MAJA v2 — Production Deployment Runbook

Deploys `deploy/docker-compose.yml`: **caddy + core + worker + postgres + redis
+ backup** on a single GCP VM. No gateway, no microservice stubs — see
`../../MAJA_V2_PLAN/recon/recon-backend-core.md` §7-8 for why those were retired
(MAJA_V2_PLAN is a sibling of this repo, not inside it — not present on a
fresh `git clone`; this reference is for the team's working copy only)
from the live path. This is the only supported production topology.

---

## 0. Topology

```
Internet
   │  :80 / :443
   ▼
caddy (auto-TLS, security headers, SPA static files)
   │  /api/*, /uploads/*, /robots.txt, /sitemap.xml, crawler UA
   ▼
core (uvicorn, 4 workers, :8200) ───┐
worker (background jobs) ───────────┤
                                     ▼
                          postgres:5432   redis:6379 (persistent — face-match
                          (in-stack)       queue + OTP + rate-limit state)
```

Everything except S3/CloudFront/Rekognition/Razorpay/Gemini/Supabase-Auth
lives on this one VM. Recommended size: **e2-standard-4** (4 vCPU / 16 GB) —
sized for `max_connections=200` on Postgres and `WEB_CONCURRENCY=4` on core.

A sixth service, `backup`, also connects directly to `postgres:5432` (not
shown above — it has no public/inter-service traffic) to run the nightly
encrypted dump. See §10.5 Backups.

---

## 1. GCP VM

```bash
gcloud compute instances create maja-prod \
  --zone=asia-south1-a \
  --machine-type=e2-standard-4 \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=100GB --boot-disk-type=pd-ssd \
  --tags=maja-web

# Firewall: only 80/443 (public) + 22 (SSH, key-only — GCP's default already
# disables password auth for OS Login; do not enable password SSH).
gcloud compute firewall-rules create maja-web-http \
  --allow=tcp:80,tcp:443 --target-tags=maja-web --source-ranges=0.0.0.0/0
gcloud compute firewall-rules create maja-ssh \
  --allow=tcp:22 --target-tags=maja-web --source-ranges=0.0.0.0/0
# (Tighten --source-ranges on the SSH rule to your office/VPN CIDR if you have
# one — 0.0.0.0/0 + key-only auth is the floor, not the target.)

gcloud compute os-login ssh-keys add --key-file=~/.ssh/id_ed25519.pub
```

Do **not** set a root/user password; rely on SSH keys (`gcloud compute ssh`
or OS Login) exclusively.

## 2. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker   # or log out/in
docker compose version   # confirm v2 plugin (docker-compose.yml uses `condition:` healthchecks)
```

## 3. DNS

Point an A record at the VM's external IP (`gcloud compute instances
describe maja-prod --format='get(networkInterfaces[0].accessConfigs[0].natIP)'`)
before starting Caddy — it fetches the Let's Encrypt cert on first request and
will retry-loop on a 404 DNS lookup otherwise. Give propagation a few minutes;
verify with `dig +short yourdomain.com`.

## 4. Clone + fill `.env`

```bash
git clone <your-repo-url> /opt/maja && cd /opt/maja
cp deploy/.env.example deploy/.env
nano deploy/.env   # fill EVERY value — see the grouped comments in the file
```

At minimum before first `up`: `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`,
`SUPABASE_DB_URL` (must match `POSTGRES_PASSWORD`), `JWT_SECRET_KEY`,
`ENVIRONMENT=production`, `CORS_ORIGINS` (your real domain, not `*`),
`SUPER_ADMIN_USERNAME/EMAIL/PASSWORD` (compose refuses to start `core`
without these — no `ChangeMe@123` fallback). Payment/AI/email/SMS keys can
follow later; those features degrade gracefully when unset.

---

## 5. AWS setup (S3 + CloudFront + Rekognition)

### 5.1 S3 bucket — private, versioned, encrypted

```bash
aws s3api create-bucket --bucket maja-media-prod --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-public-access-block --bucket maja-media-prod \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption --bucket maja-media-prod \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-bucket-versioning --bucket maja-media-prod \
  --versioning-configuration Status=Enabled
```

Set `AWS_S3_BUCKET=maja-media-prod`, `AWS_REGION=ap-south-1`,
`STORAGE_DEFAULT_PROVIDER=s3` in `deploy/.env`.

### 5.2 CloudFront distribution with Origin Access Control (OAC)

Console (`CloudFront → Distributions → Create`) is fastest for the OAC wizard:
1. Origin: the S3 bucket above, **Origin access → Origin access control
   settings (recommended)** → create a new OAC → CloudFront will offer to
   update the bucket policy for you — accept it (grants
   `cloudfront.amazonaws.com` read via a `AWS:SourceArn` condition scoped to
   this distribution; the bucket itself stays fully private, no public ACL).
2. Viewer protocol policy: **Redirect HTTP to HTTPS**.
3. Note the distribution domain (`dxxxxxxx.cloudfront.net`) →
   `AWS_CLOUDFRONT_DOMAIN` in `deploy/.env` (or your own CNAME if you attach one).

### 5.3 CloudFront signed-URL key pair (trusted key group)

The legacy AWS-account "CloudFront key pairs" require root credentials and are
deprecated — use a **trusted key group** instead:

```bash
openssl genrsa -out cf-private-key.pem 2048
openssl rsa -pubout -in cf-private-key.pem -out cf-public-key.pem

aws cloudfront create-public-key --public-key-config \
  Name=maja-signing-key,CallerReference="$(date +%s)",EncodedKey="$(cat cf-public-key.pem)" \
  --query 'PublicKey.Id' --output text
# -> this Id is AWS_CLOUDFRONT_KEY_PAIR_ID

aws cloudfront create-key-group --key-group-config \
  Name=maja-signers,Items=<the-public-key-id-above>
```

Then in the distribution's cache behavior for signed paths, set **Restrict
viewer access → Yes** and attach the key group. Copy `cf-private-key.pem`
onto the VM at the path `AWS_CLOUDFRONT_PRIVATE_KEY_PATH` points to
(`/app/backend/aws_cloudfront_private_key.pem` by default — inside the
bind-mounted repo, so drop it at `<repo>/backend/aws_cloudfront_private_key.pem`
on the host). **Never commit it** — `.gitignore`/`.pre-commit-config.yaml`
already block `*.pem`; confirm before first commit on this box.

### 5.4 Rekognition (face search)

```bash
aws rekognition create-collection --collection-id maja-faces-prod --region ap-south-1
```

Region must be `ap-south-1` to match `AWS_REGION` and avoid cross-region
latency/cost on every face-match call. `face_ops.py` creates one collection
per profile at runtime (recon-backend-core.md confirms per-profile isolation)
— this bootstrap collection is only needed if the code expects a shared
default; skip it if profile collections are created lazily (confirm against
current `face_ops.py` before running).

### 5.5 Least-privilege IAM policy

> **Superseded for the current deployment.**
> [`docs/AWS_CONNECTION.md`](AWS_CONNECTION.md) §6 is authoritative: the live
> identity is `maja-backend` with `MAJA-Backend-S3-Rekognition`, scoped to the
> four `*-2026` buckets, and it carries a per-call permission matrix that a
> test enforces. The policy below predates the four-bucket split (it names the
> old single `maja-media-prod` bucket) and is kept only as background for that
> older layout. Notably it granted `rekognition:ListCollections`, which the
> current policy deliberately drops — `DescribeCollection` answers the only
> question the application actually asks, without exposing every collection
> name in the account.

One IAM user (not root), access key rotated per the checklist in §8. Scope to
the bucket and the Rekognition collection prefix only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3MediaBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::maja-media-prod/*"
    },
    {
      "Sid": "S3BucketList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::maja-media-prod"
    },
    {
      "Sid": "RekognitionFaces",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:DescribeCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFrontSigningKeyReadOnly",
      "Effect": "Allow",
      "Action": ["cloudfront:GetPublicKey", "cloudfront:GetKeyGroup"],
      "Resource": "*"
    }
  ]
}
```

(Rekognition does not support resource-ARN scoping on collection operations
as of this writing — `Resource: "*"` is the ceiling; the action list itself
is the least-privilege boundary. Revisit if AWS adds collection-level ARNs.)

```bash
aws iam create-policy --policy-name maja-media-least-priv --policy-document file://maja-iam-policy.json
aws iam create-user --user-name maja-prod-svc
aws iam attach-user-policy --user-name maja-prod-svc --policy-arn <policy-arn-from-above>
aws iam create-access-key --user-name maja-prod-svc
# -> AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY into deploy/.env
```

---

## 6. First deploy

```bash
cd /opt/maja

# 1) Build the SPA (outside compose — no frontend-build service in deploy/).
#    frontend-v2 is the app compose actually serves — Caddy mounts
#    ../frontend-v2/dist read-only (see deploy/docker-compose.yml's `caddy`
#    service). It's a Vite app, not the legacy CRA `frontend/`, so its only
#    build-time env var is VITE_BACKEND_URL (empty = same-origin, Caddy
#    proxies /api to core). GENERATE_SOURCEMAP is a CRA-only flag — Vite
#    already omits source maps from `vite build` by default, so no env var
#    is needed here to keep them out of the bundle.
docker run --rm -v "$PWD/frontend-v2":/app -w /app \
  -e VITE_BACKEND_URL="" \
  node:20 sh -c "yarn install --frozen-lockfile --network-timeout 600000 && yarn build"
test -f frontend-v2/dist/index.html || { echo "FE build failed"; exit 1; }

# 2) Bring up db + redis first, wait healthy, then everything else.
cd deploy
docker compose up -d postgres redis
docker compose up -d --build core worker caddy

# 3) Seed the super-admin (one-shot, idempotent — safe to re-run).
docker compose run --rm core python init_super_admin.py

# 4) Health check.
curl -sf https://$DOMAIN/api/health || echo "HEALTH CHECK FAILED"
docker compose ps   # all 5 services should show Up/healthy
```

**Smoke list** (run after every deploy, not just the first):
- `GET /api/health` → 200
- `GET /` → SPA shell loads, no console errors for missing bundle chunks
- `GET /api/invite/<a-real-slug>/full` → 200 with profile JSON
- Admin login at `/admin` with the seeded super-admin
- `robots.txt` and `sitemap.xml` serve from core, not the SPA fallback
- One test RSVP / gallery upload if a demo profile exists
- Check `docker compose logs core worker --tail=100` for startup errors
  (21 `@app.on_event("startup")` hooks run here — recon-backend-core.md §9)

## 7. Rollback

The compose file has no fixed `image:` tags (it builds from source), so pick
one of:

**A — git-based (matches `redeploy.sh`'s proven pattern, slower, always correct):**
```bash
git log --oneline -5        # find the last-known-good commit
git checkout <prev-sha>
cd deploy && docker compose up -d --build core worker
```

**B — image-tag based (faster, needs advance prep):** before each deploy, tag
the images you're about to replace so a rollback is a re-tag, not a rebuild:
```bash
docker compose build core worker
docker tag deploy-core:latest maja-core:$(date +%Y%m%d-%H%M)
docker tag deploy-worker:latest maja-worker:$(date +%Y%m%d-%H%M)
# rollback: docker compose up -d --no-build --scale core=0 ... (re-tag the
# previous image as :latest, then `docker compose up -d`)
```
Prefer **A** unless deploys are frequent enough to justify maintaining a tag
history — it is one fewer thing to get wrong during an incident.

The frontend has its own rollback: `frontend/atomic-build.sh` never touches
`frontend/build/` on a failed build, and Caddy serves straight from that
directory — so a bad frontend deploy is just "re-run the build step from the
previous commit," no compose action needed.

---

## 8. Secret rotation checklist

Legacy repo history is compromised (recon-security-gaps.md S1) — rotate ALL
of these before go-live, not just the ones you think leaked:

| # | Secret set | Console location | Env var(s) to update |
|---|---|---|---|
| 1 | Razorpay key + webhook secret | razorpay.com/app → Settings → API Keys; Settings → Webhooks → (edit) → Secret | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| 2 | Supabase `service_role` + `anon` | supabase.com/dashboard/project/_/settings/api → Project API keys → Reset | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `REACT_APP_SUPABASE_ANON_KEY` (rebuild FE after) |
| 3 | AWS access key pair | IAM → Users → `maja-prod-svc` → Security credentials → Create new key, then deactivate+delete the old one | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| 4 | Gemini API key | aistudio.google.com/apikey → Delete old, Create new | `GEMINI_API_KEY` |
| 5 | Postgres password | On the VM: `docker compose exec postgres psql -U maja -d maja -c "ALTER USER maja WITH PASSWORD '<new>';"` then update `.env` and restart `core`/`worker` | `POSTGRES_PASSWORD`, `SUPABASE_DB_URL` |
| 6 | CloudFront signing key pair | CloudFront → Public keys → delete old → repeat §5.3 to mint a new one, update the distribution's key group | `AWS_CLOUDFRONT_KEY_PAIR_ID`, replace the `.pem` file at `AWS_CLOUDFRONT_PRIVATE_KEY_PATH` |

After any rotation: `cd deploy && docker compose up -d --force-recreate core worker` (Redis/Postgres don't need a restart for app-level secrets — only for #5). Do not consider rotation done until you've confirmed the OLD credential is deactivated/deleted at the provider, not just replaced in `.env`.

---

## 9. Load testing

Install `hey` (simpler, single Go binary) or `ab` (apache2-utils, already
present on most Debian boxes):
```bash
sudo apt-get install -y apache2-utils   # ab
# or: curl -L -o /usr/local/bin/hey https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 && chmod +x /usr/local/bin/hey
```

Run **from the VM itself or a same-region box**, not your laptop — you'll
measure your home connection instead of the server. Run at a low-traffic
hour; while it runs it is indistinguishable from a DoS.

Ladder — 100 → 500 → 1000 → 2000 concurrent requests, against a cheap
read-only endpoint (`/api/health`) and the heaviest real guest request
(`/api/invite/<slug>/full`):

```bash
SLUG=aarav-and-riya-demo

for N in 100 500 1000 2000; do
  echo "=== hey: $N concurrent, /api/health ==="
  hey -n $((N*5)) -c "$N" https://$DOMAIN/api/health

  echo "=== hey: $N concurrent, /api/invite/$SLUG/full ==="
  hey -n $((N*5)) -c "$N" "https://$DOMAIN/api/invite/$SLUG/full"
done

# ab equivalent (per rung):
# ab -n $((N*5)) -c $N https://$DOMAIN/api/health
# ab -n $((N*5)) -c $N "https://$DOMAIN/api/invite/$SLUG/full"
```

**Record at each rung:**
- p50 / p95 / p99 latency (`hey` prints a percentile histogram directly)
- error rate (non-2xx / connection failures — `hey`'s "Status code distribution")
- requests/sec achieved vs requested (throughput ceiling)
- `docker stats` on the VM during the run (which container saturates first —
  expect `core` CPU or `postgres` connections, given `WEB_CONCURRENCY=4` /
  `DB_POOL_MAX=10` / `max_connections=200`)
- the rung where error rate crosses 5% or p95 crosses 1.5s — that's your
  practical ceiling for this VM size; use it to decide when to scale up
  (bigger VM) vs out (needs re-introducing a load balancer + stateless core,
  which this single-VM topology does not support today)

`scripts/loadtest.js` (k6) already exists in the repo root with the same
philosophy (auto-abort thresholds) if k6 is preferred over hey/ab — it is not
part of the `deploy/` lane and is left as-is.

---

## 10. Production operations

### 10.1 Rekognition quota planning (do this 2+ weeks before a large event)

1. **Estimate peak `SearchFacesByImage` calls/sec.** `guests_expected x
 searches_per_guest / peak_window_seconds` (most guests open "Find My
 Photos" in the same 30-60min window right after the ceremony - that
 window, not the event's full duration, is what stresses AWS). Cross-check
 against the app's own abuse ceilings so you know which one binds first:
 `FACE_SEARCH_LIMIT_PER_IP` (default 15/hr/guest) and
 `FACE_SEARCH_LIMIT_PER_EVENT` (default 600/hr/gallery) - both env-tunable,
 `gallery_features.py:84-85` - are **hourly** app-layer caps, not AWS's
 per-second TPS ceiling. A burst of guests hitting the button in the same
 60 seconds can spike per-second load well above a low AWS TPS default
 while staying comfortably under the hourly cap.
2. **Check the real TPS ceiling.** AWS Console -> Service Quotas -> Amazon
 Rekognition -> search "SearchFacesByImage" and "IndexFaces" transactions
 per second. Region-specific (`AWS_REGION`, `ap-south-1` per sec 5.4 of
 this doc) - not discoverable from this repo, check the console directly.
3. **Request an increase if step 1 approaches step 2.** File it 2+ weeks out
 - AWS's Rekognition quota-review turnaround is not same-week-guaranteed.
4. **Verify the retry path actually catches throttling, not just hopes.**
 `worker.py:144-154`: any Rekognition call failure (including AWS
 `ThrottlingException`) retries with exponential backoff
 (`min(2**attempt, 60)`, `MAX_ATTEMPTS=5`) before giving up. Grep the
 worker log during/after the event:
 ```bash
 docker compose logs worker | grep "retrying in"
 ```
 A spike in that line right after go-live is your quota-pressure signal -
 earlier than guests reporting failures. If retries exhaust, the job lands
 in `face_dead_letters` (`worker.py:105-122`) and is visible at
 `GET /api/admin/face-ops/dead-letters?profile_id=<id>`
 (`face_ops.py:124-130`) - spot-check the event's profile during a large
 event. Retry individually once quota lands, via
 `POST /api/admin/face-ops/retry-photo/{photo_id}` or
 `POST /api/admin/face-ops/dead-letters/{dl_id}/requeue`
 (`face_ops.py:132-179`, the latter CAS-guarded - `status: "dead"` in the
 `find_one_and_update` filter, so a double-click can't double-enqueue).

### 10.2 S3 lifecycle policies

Object key layout (`gallery_features.py:146-185`):
`weddings/{profile_id}/photos/{photo_id}/original{ext}` (true original),
`.../preview.jpg` (2048w JPEG q85), `.../thumb.webp` (480w WEBP q80,
`media_derivatives.py:122-123`), and `weddings/{profile_id}/staging/{uuid}
{ext}` (presign-upload scratch space, `_staging_prefix`,
`gallery_features.py:184-185`). **Constraint that shapes every rule below:**
all three per-photo objects (original/preview/thumb) carry the exact same
tags (`expire-at`, `wedding`, `method` - `gallery_features.py:1250`,
`:1280-1282`; no tag distinguishes an original from its derivatives), and
`profile_id` sits between `weddings/` and `staging/`/`photos/` in every key
 - a single bucket-level `Prefix` filter cannot isolate "originals only" or
"staging only" across all profiles. These are per-owner-plan decisions, not
defaults to apply blindly bucket-wide.

**Originals to STANDARD_IA, 30 days after upload.** Nearest safe native
lever given the constraint above is `ObjectSizeGreaterThan` - previews/
thumbs are re-encoded down to ~2048px/480px, a phone/DSLR original is
routinely several MB larger. `Days` here counts from the object's own
upload date, **not** from the `expire-at` tag's value - S3 lifecycle cannot
key a transition off a custom tag's content, only off object age or an
exact tag key+value match:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket maja-media-prod --lifecycle-configuration '{
  "Rules": [
    {
      "ID": "gallery-originals-to-ia",
      "Status": "Enabled",
      "Filter": {"And": {"Prefix": "weddings/", "ObjectSizeGreaterThan": 1048576}},
      "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}]
    }
  ]
}'
```

Caveat that actually matters: under **default** retention
(`cleanup_expired_galleries`, `gallery_features.py:1231-1263`, daily 3am
IST) the entire gallery - every original included - is hard-deleted 1 day
after `link_expiry_date`, which for most weddings is well inside 30 days.
This rule is therefore dormant under default behavior; it only does
anything for an owner plan that extends retention past 30 days (an
archival tier that keeps originals after the live gallery closes - does
not exist in the code today). The 1MiB size threshold is a heuristic, not
exact - tune it against your real original-vs-preview size distribution,
or add a distinguishing tag (`kind: original`, mirroring the existing
`kind: selfie` tag at `gallery_features.py:736`) at upload time in a
follow-up code change if precision matters more than this approximation.

**`staging/` - abort incomplete multipart + short expiry.**
`generate_presigned_put` (`aws_service.py`) issues a presigned **single
PUT**, not a multipart upload, so `AbortIncompleteMultipartUpload` is a
no-op today - harmless to add now as a bucket-wide safety net in case
chunked/multipart uploads are introduced later (it only ever touches
abandoned multipart parts, never a completed object):

```bash
aws s3api put-bucket-lifecycle-configuration --bucket maja-media-prod --lifecycle-configuration '{
  "Rules": [
    {
      "ID": "abort-incomplete-multipart",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 2}
    }
  ]
}'
```

A native 2-day `Expiration` scoped to *just* orphaned staging objects is
not expressible today - no shared prefix across profiles, per the
constraint above. Orphan cleanup for failed commits is already handled at
the app layer instead: successful commits self-delete their staging object
immediately (`gallery_features.py:597-600`), and `media_reconcile.py`'s
sampler sweeps orphaned `staging/` objects left behind by failed commits
(comment at `gallery_features.py:601-603`). Treat that app-level sweep as
the real safety net for staging orphans; the S3-native rule above is
defense-in-depth, currently a no-op.

**Selfies - no S3-native rule needed.** Already fully handled at the app
layer: `cleanup_expired_selfies` (`gallery_features.py:1268-1285`) purges
`face_search_sessions` and their selfie S3 objects older than 24h, hourly,
under the leader-locked scheduler. An S3-native lifecycle expiry on top
would only risk racing the app's own deletion for no benefit - leave as-is.

### 10.3 Monitoring runbook (daily)

Two admin endpoints, both super-admin only:

| Check | Source | Alarm threshold |
|---|---|---|
| API p95 latency per route-class | `GET /api/admin/system/metrics` -> `routes.<class>.approx_p95_ms` (`request_metrics.py`, bucket edges 50/100/300/500/1000/3000ms) | Sustained >300ms on guest-facing `/api/*` classes - matches the target in `docs/ARCHITECTURE_MIGRATION_MAP.md` sec 4 |
| Face-match queue depth | Same endpoint, `face_queue_depth` (also `GET /api/admin/system/health` -> `components[key=queue]`, `system_health.py:191-200`) | `system_health.py:188` already flags DEGRADED above 500 pending - treat that as the alarm line, don't wait for guests to complain |
| Postgres | `GET /api/admin/system/health` -> `components[key=postgres]` (`system_health.py:76-100`): active connections, long-running query count (>30s), DB size | Active connections approaching the pool ceiling (`DB_POOL_MAX x WEB_CONCURRENCY`, sec 9 above) or any `long_running_queries` > 0 sustained |
| Redis | Same endpoint, `components[key=redis]` (`system_health.py:107-122`): hit rate, evicted keys, memory | DEGRADED trips automatically above 10k lookups with <50% hit rate, or any eviction (`system_health.py:103-104`) - an eviction means Redis is undersized, check `fm:` face-match-cache and rate-limit key volume first |
| Job heartbeats | `GET /api/admin/system/health` -> `jobs[].stale` (`system_health.py:203-214`), also per-job at `.../metrics` -> `job_heartbeats.{usage_flush,media_reconcile}` | `stale=true` when a job hasn't reported in `JOB_STALE_HOURS=26` (`system_health.py:29`) - a daily job silently dying looks like this before anything else breaks |
| Dead-letter accumulation | `GET /api/admin/face-ops/dead-letters?profile_id=<id>` (`face_ops.py:124-130`) | Per-profile only, not aggregated platform-wide - spot-check galleries from events in the last 24h; a nonzero, growing count off baseline is the earliest sign of a face-indexing problem (bad provider creds, AWS throttling, corrupt uploads) |

Overall gate: `GET /api/admin/system/health` -> `overall`
(`system_health.py:230-238`) is `DOWN` only if `database` itself is down;
everything else degraded (AWS, Redis, queue, stale job) rolls up to
`DEGRADED`. Treat `DEGRADED` as "investigate today," `DOWN` as "page now."

### 10.4 Load-test-before-launch gate

Full procedure, tiers, and harnesses: `docs/LOADTEST_RESULTS.md`. Two tiers
exist there - do not treat the first as evidence for go-live:

- **Local dev tier - RUN, not production evidence.**
 `scripts/loadtest-local.mjs` (zero-dep Node, `node:http`) already ran
 against the shared dev laptop (single uvicorn worker sharing cores with
 Postgres/Redis/Vite) at 25/100/250 concurrent - see
 `docs/LOADTEST_RESULTS.md`'s "LOCAL DEV MACHINE" section for the numbers.
 Its own verdict: validates the request path holds up and degrades
 gracefully under concurrency; says nothing about whether production hits
 300ms. Rerun anytime with `TIER=N DURATION=30 node
 scripts/loadtest-local.mjs` from `backend/` - safe, never touches prod.
- **VM-scale production tier - NOT RUN.** `scripts/loadtest.js` (k6),
 100->500->1000->2500->5000 concurrent ladder plus 5-and-10-simultaneous-
 event scenarios, documented in `docs/LOADTEST_RESULTS.md`'s "Production
 procedure" section - run from the VM itself (never a laptop, never during
 peak hours) before any real launch.

**Go/no-go gate.** No literal numbered "sec 36" acceptance checklist exists
anywhere in this repo (grepped `docs/`, `docs/prd`, `docs/recon`,
`docs/pathfinder` for a numbered acceptance-criteria section past single
digits - none found); `docs/LOADTEST_RESULTS.md` compiled the equivalent
from the doc's actual targets (`ARCHITECTURE_MIGRATION_MAP.md` sec 4) plus
this doc's secs 6-9. Reproduced verbatim - every box must be checked before
go-live:

- [ ] P95 <300ms sustained at the target production concurrency for
 general API endpoints
- [ ] P95 <500ms sustained for face-search, once that scenario is added to
 the harness
- [ ] Error rate <5% at target concurrency, at every rung up to the target
 (not just the final one)
- [ ] `GET /api/health` returns 200 throughout the full ladder, including
 at the highest rung reached
- [ ] `GET /api/admin/system/metrics` and `GET /api/admin/system/health`
 report normal/non-degraded throughout
- [ ] `docker stats` shows no container pinned at 100% CPU sustained, no
 restarts, at the target concurrency
- [ ] DB connections stay under the pool ceiling (`DB_POOL_MAX=10` x
 `WEB_CONCURRENCY=4`) at target concurrency
- [ ] Redis reachable and `instantaneous_ops_per_sec` not saturating
 throughout
- [ ] Rekognition `ThrottledCount` near zero at expected face-search volume
 (CloudWatch)
- [ ] CloudFront `CacheHitRate` healthy for media/derivative traffic
 (CloudWatch) - currently untested by any harness (no upload/media
 scenario)
- [ ] 5-simultaneous-events and 10-simultaneous-events scenarios both pass
 the same P95/error-rate bars as the single-slug ladder
- [ ] Health check post-run: `/api/health` recovers to normal latency
 within the cooldown window after the highest rung tested
- [ ] Rollback tested per sec 7 of this doc before go-live, not just
 documented
- [ ] Secret rotation checklist (sec 8 of this doc) completed for
 production credentials

Do not launch on the local-tier numbers alone - they measure correctness
under concurrency, not capacity.

### 10.5 Backups

Two independent lanes — Postgres is automated inside the stack; S3 media is
not (a scheduled script you must wire up yourself).

**Postgres — automated, nightly, in-stack.** The `backup` compose service
(`deploy/docker-compose.yml`, entrypoint `deploy/backup-cron-entrypoint.sh`)
runs inside the stack and needs no host cron: it connects to `postgres`
directly over the compose network at 02:00 UTC daily, then
`pg_dump -Fc | gzip | openssl enc -aes-256-cbc -pbkdf2` (passphrase from
`BACKUP_PASSPHRASE`) into the `backupdata` volume, pruning copies older than
`BACKUP_RETENTION_DAYS` (default 30). It **refuses to start** (logs and
exits — `restart: unless-stopped` will keep retrying and logging the error)
if `BACKUP_PASSPHRASE` or `POSTGRES_PASSWORD` is unset, scoped to just that
container so a missing passphrase never blocks `core`/`worker`/`caddy` from
coming up. Set `BACKUP_PASSPHRASE` and (optionally) `BACKUP_RETENTION_DAYS`
in `deploy/.env` before first `up` — see `deploy/.env.example`. Losing
`BACKUP_PASSPHRASE` makes every encrypted backup permanently unrecoverable;
store it in a password manager or secret store that survives losing this VM,
never only in `deploy/.env` on the same disk as the backups.

This container has no off-box upload step today — backups live only in the
`backupdata` volume on this VM. `deploy/backup.sh` (host-cron, `docker
compose exec` based, uploads to `BACKUP_S3_BUCKET`) and the standalone
`ops/backup_db.sh` / `ops/restore_db.sh` pair remain available as the
off-box / manual path; `ops/backup_db.sh` now encrypts the same way (AES-256-
CBC/pbkdf2, `BACKUP_PASSPHRASE`) and refuses to write a plaintext dump unless
`ALLOW_UNENCRYPTED_BACKUP=1` is explicitly set. `ops/restore_db.sh` decrypts
automatically for any `.enc` source and falls back to plain `gunzip` for
older, pre-encryption dumps.

Prove restores actually work — `deploy/restore-test.sh` decrypts the latest
backup into a disposable scratch Postgres container and runs sanity `SELECT`s
against it; run it quarterly (or after any backup-script change), never
against the live `postgres` service. See its header for the cron-reminder
line.

**S3 media — not automated, must be scheduled.** `deploy/backup_media.sh`
mirrors `AWS_S3_BUCKET` to a second bucket (`MEDIA_BACKUP_BUCKET`, see
`deploy/.env.example`) via `aws s3 sync ... --storage-class STANDARD_IA`. It
is **not** part of the compose stack — schedule it via host cron:

```bash
45 2 * * *  AWS_S3_BUCKET=... MEDIA_BACKUP_BUCKET=... /opt/maja/deploy/backup_media.sh >> /var/log/maja-media-backup.log 2>&1
```

(02:45 UTC — staggered after the `backup` service's 02:00 Postgres dump so
the two don't compete for bandwidth.) **Until this is scheduled somewhere,
S3 media — every original photo/video, every wedding gallery — has no
second copy anywhere.** Enable versioning on `MEDIA_BACKUP_BUCKET` (§5.1) so
the sync itself can't propagate an accidental delete/overwrite into the only
backup copy.
