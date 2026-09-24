# AWS Connection — operator runbook

How to point the deployed stack at AWS, verify it's actually connected, and
what least-privilege IAM should replace once someone has time. Companion to
[`docs/MEDIA_STORAGE.md`](MEDIA_STORAGE.md) (architecture/key layout) and
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md) §5 (initial bucket/CloudFront/Rekognition
provisioning — written for an earlier single-bucket `ap-south-1` layout; the
env var names and region below are the current, live ones and win on any
conflict). Source of truth for behavior is always `backend/aws_service.py`
and `backend/media_storage.py`.

## 1. Account and buckets

- Account: `655671523450`
- Region: `us-east-2` (all four buckets and Rekognition collections live here)
- Four private S3 buckets, one per media category:

| Category | Canonical env var | Bucket |
|---|---|---|
| portfolio | `AWS_S3_PORTFOLIO_BUCKET` | `maja-portfolio-media-2026` |
| event | `AWS_S3_EVENT_BUCKET` | `maja-event-media-2026` |
| invitation | `AWS_S3_INVITATIONS_BUCKET` | `maja-invitations-media-2026` |
| face | `AWS_S3_FACE_BUCKET` | `maja-face-private-2026` |

These are not secrets — the values above are already in
`deploy/.env.example`. Each canonical var falls back to the older
`S3_BUCKET_<CATEGORY>` spelling (deprecated, logs a warning once), and the
first three additionally fall back to the legacy single `AWS_S3_BUCKET` for a
single-bucket dev/test deploy. `face` never falls back — a private selfie
must not silently land in a shared media bucket
(`aws_service.bucket_for_category`).

Also set:

```
AWS_REGION=us-east-2
```

## 2. Credentials — two options

The application runs as **`maja-backend`**, carrying only
`MAJA-Backend-S3-Rekognition` (§6). There is exactly ONE set of backend
credentials — do not create a second. The optional audit profile (§4) is a
*different, read-only* identity used only by the smoke test, never by the
application.

Both delivery options below are wired into `deploy/docker-compose.yml`
already; pick one.

### Option A — explicit keys in `deploy/.env` (simpler, weaker)

```
AWS_ACCESS_KEY_ID=<access key id>
AWS_SECRET_ACCESS_KEY=<secret key>
```

Tradeoff: the secret key sits in a file on the VM (`deploy/.env`, not
committed — confirm it's gitignored before touching it). Anyone with root or
a backup of that file has the key until it's rotated. Simplest to set up and
the only option if the VM has no IAM role attached.

### Option B — mounted credentials profile / instance role (preferred)

Two ways to avoid putting the secret key in `deploy/.env` at all:

- **Instance role** (best, if the VM is on AWS/EC2): attach an IAM role to
  the instance. `boto3`'s default credential chain picks it up automatically
  — no `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` needed anywhere.
  `aws_service.credential_source()` reports this as `iam-role`.
- **Mounted shared-credentials file** (this VM is GCP, not EC2, so no
  instance role — this is the realistic option here): put an
  `~/.aws/credentials` (and optional `config`) file on the host, set
  `AWS_SHARED_CREDENTIALS_DIR=/home/deploy/.aws` in `deploy/.env`, and
  uncomment the matching `${AWS_SHARED_CREDENTIALS_DIR}:/root/.aws:ro` volume
  line for the `core` and `worker` services in `deploy/docker-compose.yml`.
  Set `AWS_PROFILE` in `deploy/.env` if the credentials file has more than
  one profile. `credential_source()` reports this as
  `shared-credentials-file`.

Tradeoff: the key material still exists (mounted read-only files aren't
role-based like EC2), but it's out of `deploy/.env`, out of `docker inspect`
output, and easier to rotate by replacing one file outside the compose
config. Do this before the next key rotation if choosing between the two.

**Never leave `AWS_ACCESS_KEY_ID` set to an empty string** if using Option B
— `aws_service._aws_kwargs()` treats a present-but-empty key as "use these
credentials" and fails signature validation instead of falling through to
the shared-credentials chain. Leave the line absent or fully commented out.

## 3. Rebuild + restart after changing `.env`

`env_file: [.env]` values are baked in at container start, not hot-reloaded:

```bash
cd deploy
docker compose up -d --build core worker
docker compose logs -f core   # confirm no boot error
```

Rebuilding `caddy`/`postgres`/`redis` is not needed for an AWS-only env
change — only `core` (the API) and `worker` (background jobs) read AWS_* vars.

## 4. Running the smoke test on the VM

```bash
cd /path/to/repo
python scripts/aws_smoke_test.py                       # read-only
python scripts/aws_smoke_test.py --write               # + isolated write path
python scripts/aws_smoke_test.py --profile-id <id>     # also verify one event's
                                                       # face collection
```

The script has **two lanes**, and the distinction is the whole point:

| Lane | Identity | What it proves | Failure meaning |
|---|---|---|---|
| **RUNTIME** | the application's own (`maja-backend`) | the app can resolve buckets, read/write objects, presign, run the multipart lifecycle, and use Rekognition | a real outage — exits 1 |
| **AUDIT** | `AWS_SMOKE_AUDIT_PROFILE` (optional) | bucket *configuration*: region, default encryption, public-access block, CORS | infrastructure drift, never an app outage |

Statuses:

| Status | Meaning | Affects exit code |
|---|---|---|
| `PASS` | check succeeded | — |
| `FAIL` | real failure | **yes, exit 1** |
| `WARN` | worth fixing, not broken | no |
| `SKIP` | not requested (e.g. no `--write`) | no |
| `SKIP-AUDIT` | audit check, no audit profile configured | no |
| `SKIP-NOT-CREATED` | resource doesn't exist yet (e.g. a gallery never enabled) | no |

Exit codes: `0` = no failures, `1` = a real failure, `2` = no credentials
resolved on this host (the environment isn't wired yet — a different problem
from AWS rejecting something). It never prints an AWS secret key.

### Why audit checks are separate

Reading a bucket's region, encryption, public-access block or CORS requires
`s3:GetBucketLocation`, `s3:GetEncryptionConfiguration`,
`s3:GetBucketPublicAccessBlock` and `s3:GetBucketCORS`. The application never
performs those calls — they answer infrastructure-review questions. Granting
them to `maja-backend` purely so this script prints green would let the
application's credentials read the configuration of every bucket they can
name, for zero application benefit. So they are **deliberately absent** from
`MAJA-Backend-S3-Rekognition`, and their absence shows as `SKIP-AUDIT`, not
`FAIL`.

To actually run them, point the script at a separate read-only profile:

```bash
export AWS_SMOKE_AUDIT_PROFILE=maja-audit
python scripts/aws_smoke_test.py
```

That profile needs only:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "MajaBucketConfigAudit",
    "Effect": "Allow",
    "Action": [
      "s3:GetBucketLocation",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketCORS"
    ],
    "Resource": [
      "arn:aws:s3:::maja-portfolio-media-2026",
      "arn:aws:s3:::maja-event-media-2026",
      "arn:aws:s3:::maja-invitations-media-2026",
      "arn:aws:s3:::maja-face-private-2026"
    ]
  }]
}
```

The audit session is used for configuration reads **only**. Every runtime
operation goes through `aws_service`, i.e. the application identity — a
runtime check that passed using audit credentials would prove nothing about
production. `backend/tests/test_aws_least_privilege.py` asserts that
separation structurally, so it cannot rot.

### Write-path safety

`--write` touches only `_smoketest/{uuid}/` inside the **event** bucket. Every
destructive call routes through `guard_prefix()`, which raises rather than
touch a key outside the prefix generated for that run, and refuses any prefix
that isn't a `_smoketest/` one. The run also refuses to start if any resolved
bucket name doesn't end in `-2026`. Cleanup aborts unfinished multipart
uploads *before* deleting objects (an incomplete upload is invisible to an
object listing and still bills), runs in a `finally` so a partial failure
still cleans up, and reports how many objects remain — a non-zero remainder
is a `FAIL`. Repeated runs cannot collide: each gets a fresh UUID prefix.

## 5. Reading backend health output

`aws_service.healthcheck()` returns:

```json
{
  "configured": true,
  "credential_source": "env" | "iam-role" | "shared-credentials-file" | "none",
  "bucket": "maja-event-media-2026",
  "buckets": {"portfolio": "...", "event": "...", "invitation": "...", "face": "..."},
  "region": "us-east-2",
  "cf_signer": true,
  "cf_domain": "cdn.majainvites.com",
  "s3_buckets_reachable": {"<bucket>": true, ...},
  "s3_reachable": true,
  "rekognition_reachable": true
}
```

`configured: false` means either no credentials resolved or `bucket()` (the
legacy default) is empty — check `credential_source` first, then
`buckets_unconfigured` (present only when one of the four is unset).

`rekognition_reachable` is probed with **DescribeCollection on an id that
cannot exist** (`aws_service.HEALTH_PROBE_COLLECTION`): `ResourceNotFound` is
the healthy answer. It deliberately does not call `ListCollections`, which
would require permission to enumerate every collection in the account just to
answer "is the service up" — and under the least-privilege policy that probe
reported `AccessDenied` as "unreachable", which was wrong.

## 6. Runtime IAM policy — `MAJA-Backend-S3-Rekognition`

Attached to `maja-backend`, the identity the application runs as. This is the
deployed policy, not a proposal.

### The permission matrix

Every S3 call the application makes, and why. `backend/tests/
test_aws_least_privilege.py::TestRuntimePermissionMatrix` fails if a call
appears in the backend that isn't in this table, so the policy cannot silently
lag the code.

| Application call | IAM action | Resource | Why the app needs it |
|---|---|---|---|
| `put_object` (`upload_bytes`) | `s3:PutObject` | object | server-side uploads: thumbnails, CDN mirror, selfies |
| `generate_presigned_url` (GET) | `s3:GetObject` | object | private media delivery to the browser |
| `generate_presigned_put` / `generate_presigned_post` | `s3:PutObject` | object | direct browser→S3 upload, so large files never transit the API |
| `get_object` | `s3:GetObject` | object | gallery download manifest, storage-pool jobs |
| `head_object` | `s3:GetObject` | object | upload completion verification, reconcile sweeps |
| `copy_object` | `s3:GetObject` + `s3:PutObject` | object | gallery photo moves |
| `delete_object` / `delete_objects` | `s3:DeleteObject` | object | asset deletion, expiry sweeps, `delete_prefix` |
| `create_multipart_upload` | `s3:PutObject` | object | large-file upload sessions |
| `presign_upload_part` (browser PUT) | `s3:PutObject` | object | part upload |
| `list_parts` | `s3:ListMultipartUploadParts` | object | resumable uploads: which parts already landed |
| `complete_multipart_upload` | `s3:PutObject` | object | finalize |
| `abort_multipart_upload` | `s3:AbortMultipartUpload` | object | cancel + abandoned-upload cleanup |
| `head_bucket` | `s3:ListBucket` | bucket | health check |
| `list_objects_v2` (`delete_prefix`) | `s3:ListBucket` | bucket | delete every object under an event/profile prefix |
| `list_multipart_uploads` | `s3:ListBucketMultipartUploads` | bucket | find and abort abandoned uploads |

Rekognition (face search), all six genuinely called:

| Call | IAM action | Why |
|---|---|---|
| `create_collection` | `rekognition:CreateCollection` | one collection per wedding when the gallery is enabled |
| `describe_collection` | `rekognition:DescribeCollection` | health probe + "does this event's collection exist" — the least-privilege alternative to enumerating |
| `index_faces` | `rekognition:IndexFaces` | index event photos |
| `search_faces_by_image` | `rekognition:SearchFacesByImage` | guest selfie → their photos |
| `delete_faces` | `rekognition:DeleteFaces` | remove a deleted photo's faces |
| `delete_collection` | `rekognition:DeleteCollection` | gallery expiry / profile purge |

**Deliberately NOT granted:** `s3:GetBucketLocation`,
`s3:GetEncryptionConfiguration`, `s3:GetBucketPublicAccessBlock`,
`s3:GetBucketCORS` (infrastructure audit — see §4) and
`rekognition:ListCollections` (would expose every collection name in the
account; `DescribeCollection` answers the only question the app asks).

### The policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MajaFourBucketsObjectOps",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::maja-portfolio-media-2026/*",
        "arn:aws:s3:::maja-event-media-2026/*",
        "arn:aws:s3:::maja-invitations-media-2026/*",
        "arn:aws:s3:::maja-face-private-2026/*"
      ]
    },
    {
      "Sid": "MajaFourBucketsListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::maja-portfolio-media-2026",
        "arn:aws:s3:::maja-event-media-2026",
        "arn:aws:s3:::maja-invitations-media-2026",
        "arn:aws:s3:::maja-face-private-2026"
      ]
    },
    {
      "Sid": "MajaRekognitionFaceOps",
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DescribeCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces",
        "rekognition:DeleteCollection"
      ],
      "Resource": "*"
    }
  ]
}
```

Notes:

- `s3:ListMultipartUploadParts` is object-level (it is `ListParts` on a
  specific upload); `s3:ListBucketMultipartUploads` is bucket-level. Both are
  needed: the first for resumable uploads, the second to find abandoned ones.
- Rekognition has no per-collection resource ARN support, so `Resource: "*"`
  is scoped by the action allowlist instead. Dropping `ListCollections` is
  what keeps that `*` from meaning "read every collection in the account".
- If a new feature needs a new S3/Rekognition action, add it to the policy,
  this table, and `TestRuntimePermissionMatrix` in the same commit — the test
  exists to force that.

## 7. Verification checklist after any credential or bucket change

```bash
python scripts/aws_smoke_test.py --write            # runtime must be all PASS
AWS_SMOKE_AUDIT_PROFILE=maja-audit \
  python scripts/aws_smoke_test.py                  # audit lane should PASS
PYTHONIOENCODING=utf-8 python -m pytest backend/tests -q -k "aws"
```

Runtime FAILs are real. `SKIP-AUDIT` without an audit profile is expected and
correct. `SKIP-NOT-CREATED` on an event collection means the gallery was never
enabled for that event — also not a problem.
