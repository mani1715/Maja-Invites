# VM acceptance runbook

For the OWNER to run over SSH, by hand, against a VM just deployed with
`./deploy.sh --review`. Every step says what you should see. Where a single
curl can't prove the thing (a phone scanning a QR, fulfillment linking an
order), that's stated plainly instead of faking a command.

**This is a review-deployment runbook, not a production health check.** Steps
7-8 require `SEED_TEST_ACCOUNTS=1` in `deploy/.env`, which grants a
free-order bypass on the account it seeds — that flag must never be set on a
stack holding real client data (`backend/seed_test_accounts.py` refuses to
seed if `ENVIRONMENT=production`, but it is still your responsibility to
never set the flag on a real deploy). Run this against a throwaway review VM,
not the box your studios actually use.

---

## 0. Setup

```bash
BASE=http://<VM_IP>          # the IP deploy.sh --review printed at the end
UA=(-A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
```

Every API call in this runbook needs that `UA` header — `BotDetectionMiddleware`
blocks a bare-curl user agent with 403 on most routes. `/api/auth/login` and
`/api/invite/*` are exempt, but sending it everywhere is simplest.

**Never `echo`/`print` `$TOK` or any password to a shared terminal/log.** Where
a step needs the token visible for `Authorization: Bearer $TOK`, that's fine —
just don't `echo "$TOK"` on its own.

### Who you log in as

Unlike the **local** dev stack (`./run.ps1`), a fresh VM deploy does **not**
auto-create a photographer account. `admin@wedding.com` / `admin123` is a
local-only seed (`backend/init_admin.py`, never invoked by `deploy.sh` or
`docker-compose.yml`) — do not expect it to exist on the VM.

What a fresh VM **does** create automatically, gated by env vars in
`deploy/.env`:

- **Super-admin** — only after you run, once,
  `docker compose run --rm core python init_super_admin.py` (per
  `docs/DEPLOYMENT.md` §6 "First deploy"). Credentials are whatever you set
  for `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`
  in `deploy/.env`.
- **Comped test studio** `test.studio@maja.test` / `MajaTest@123` — only if
  `SEED_TEST_ACCOUNTS=1` is set in `deploy/.env` (seeded automatically by
  `core` at startup, `backend/seed_test_accounts.py`). This account gets a
  free-order bypass in `store_features.create_order`, which is what lets
  steps 7-8 buy face-match SKUs without a live Razorpay payment. **This flag
  must be unset before this VM ever holds real data.**

For steps 1-6 and 9-16, your own real studio login works fine. For steps 7-8
(quota purchase), you need the comped test studio unless you're prepared to
pay real Razorpay money for `face_match_2000`/`3000`.

Login (either account — same endpoint):

```bash
TOK=$(curl -s "${UA[@]}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test.studio@maja.test","password":"MajaTest@123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
```

Expected: a JWT string in `$TOK`. A 429 means the login rate limiter tripped
(15/IP, 10/identifier per 15 min) — wait or use the other account.

---

## 1. Invitation creation

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/admin/profiles" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{
    "groom_name": "AcceptGroom",
    "bride_name": "AcceptBride",
    "event_type": "wedding",
    "event_date": "2026-12-12T00:00:00",
    "venue": "Test Hall",
    "city": "Bengaluru",
    "design_id": "royal_heritage",
    "invitation_category": "wedding"
  }'
```

Expected: `200`/`201` with a JSON body containing `id` and `slug` (the server
derives the slug from the two names — you cannot request one). Save both:

```bash
PID=<the "id" from the response>
SLUG=<the "slug" from the response>
```

---

## 2. Invitation publishing

The **only** canonical publish route:

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/weddings/$PID/publish" \
  -H "Authorization: Bearer $TOK"
```

Expected: `200`. Then open in a browser:

```
$BASE/invite/$SLUG
```

Expected: the guest invitation page renders (not a 404/blank page).

---

## 3. Photographer login

Already done in step 0 (`POST /api/auth/login`). UI equivalent:

```
$BASE/auth  ->  sign in  ->  redirects to /studio/dashboard
```

Expected: the studio dashboard loads and lists the invitation created in
step 1.

---

## 4. Event creation

A wedding profile **is** the event container — step 1's `POST
/api/admin/profiles` already created it; there is no separate "event" object
to create. UI equivalent for a human running the wizard instead of curl:

```
$BASE/studio/wedding/new
```

---

## 5. Photographer photo upload (UI, drag-drop)

```
$BASE/studio/profile/$PID/gallery
```

1. Click **"Enable AI gallery"**. This calls `POST
   /api/admin/profiles/{id}/gallery/enable`, which calls Rekognition
   `CreateCollection` — **this step needs live AWS credentials** and doubles
   as a real Rekognition connectivity check (distinct from the smoke test —
   see §16).
   Expected: button changes to enabled state; no error toast.
2. Drag photo files onto the **"Drop photos here"** area.
   Expected: files upload, progress shows, then appear in the grid below.

---

## 6. Direct S3 multipart proof (bytes never transit the VM)

**Browser proof:** during step 5's upload, open DevTools -> Network, filter
by `PUT`. Expected: every PUT request's host is `*.s3.<region>.amazonaws.com`
(or `s3.amazonaws.com`) — **never** `$BASE`'s host. If any PUT targets the
VM, the direct-to-S3 path is broken.

**Scripted variant** (proves the same thing against `/api/media/upload-sessions`,
the multipart-capable sibling used for larger media — see
`docs/MEDIA_STORAGE.md` §2-3):

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/media/upload-sessions" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"category":"event","kind":"image","mime":"image/jpeg","size_bytes":123456,"event_id":"'"$PID"'"}'
```

Expected: `200` with `session_id`, `mode` (`"single"` for a file this small),
`bucket`, `key`, and (for `mode=single`) `upload_url` whose host is
`amazonaws.com` — again, never `$BASE`. For a file over the multipart
threshold (`mode="multipart"`), no `upload_url` is returned; instead call:

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/media/upload-sessions/<session_id>/parts" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"part_numbers":[1]}'
```

Expected: `200` with `{"urls": {"1": "<amazonaws.com PUT URL>"}}`. This
runbook does not script an actual multipart PUT+complete round trip — the
DevTools check above is the practical proof; the point under test (image
bytes never transit the VM) is proven either way.

---

## 7. Quota — first purchase, reserve, refusal, extension

Requires the comped `test.studio@maja.test` account from step 0 (or a real
Razorpay payment — the store order below returns `503` if the buyer isn't
comped and the gateway isn't reachable). Uses a **fresh** profile owned by
that account — repeat step 1 logged in as `test.studio@maja.test` and set
`PID`/`SLUG` accordingly, then enable its gallery via the UI (step 5.1) or:

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/admin/profiles/$PID/gallery/enable" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"enabled":true}'
```

**Buy 2000 face-match photos** (the real store path — pricing comes from the
catalogue, not the browser):

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/store/order/create" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"design_id":"royal_heritage","esign_agreed":true,"main_language":"english","features":["face_match_2000"]}'
```

Expected: `200` with `order_id`. On the comped account this order is
immediately `status=paid`. Confirm:

```bash
curl -s "${UA[@]}" "$BASE/api/store/order/<order_id>" -H "Authorization: Bearer $TOK"
```

Expected: `"status": "paid"`, `"face_photo_limit": 2000`.

**Honest caveat:** on a real (non-comped) buyer, `invitation_orders.profile_id`
— the order-to-wedding link that makes the quota apply — is stamped by the
**fulfillment console** when the studio builds the invitation, not by this
curl. There is no single command that both pays and links; that's the
fulfillment team's job, done once per real order. For this scripted test the
comped order already exists un-linked; if you want to see the link happen
without touching the database directly, do it from the fulfillment UI. If
you just want to see the quota respond, skip straight to the GET below —
`resolve_face_photo_limit` reads the MAX `face_photo_limit` across the
wedding's **paid** orders, so once fulfillment (or you, via the console)
links `order_id` to `PID`, the quota reflects it without any other step.

**Check quota:**

```bash
curl -s "${UA[@]}" "$BASE/api/admin/profiles/$PID/gallery/quota" -H "Authorization: Bearer $TOK"
```

Expected once linked: `{"allocated":2000,"used":0,"reserved":0,"remaining":2000,"unlimited":false,...}`.

**Reserve 301 (must be refused whole — nothing half-done):**

```bash
curl -s -w '\n%{http_code}\n' "${UA[@]}" -X POST \
  "$BASE/api/admin/profiles/$PID/gallery/quota/reserve" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"photo_count":301}'
```

Expected: `409` with a `detail` object containing `code: "QUOTA_EXCEEDED"`,
plus `allocated`, `used`, `reserved`, `remaining`, `requested`, `excess`
fields and an `extension.tiers` list (`[2000, 3000, 5000]` photos). If the
allocation is still 2000/0/0/2000 (no photos uploaded yet), 301 fits under an
empty quota and returns `200` instead — upload or fabricate photos first if
you need to see the refusal at a lower headroom, or just reserve `2001` to
force the refusal regardless of prior usage.

**Reserve 100 (should fit):**

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/admin/profiles/$PID/gallery/quota/reserve" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"photo_count":100}'
```

Expected: `200` with a `reservation_id`. Re-GET quota — `remaining` drops
immediately by 100 (a hold consumes headroom before any byte uploads).

---

## 8. Quota extension

Buy the next tier:

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/store/order/create" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"design_id":"royal_heritage","esign_agreed":true,"main_language":"english","features":["face_match_3000"]}'
```

Link it to `PID` the same way as step 7 (fulfillment console, or the DB link
if you're testing the module directly). Re-GET quota:

```bash
curl -s "${UA[@]}" "$BASE/api/admin/profiles/$PID/gallery/quota" -H "Authorization: Bearer $TOK"
```

Expected: `allocated: 3000` — allocation is `MAX(face_photo_limit)` across
paid orders, not additive, so buying 3000 after 2000 raises the ceiling to
3000, it does not sum to 5000.

---

## 9. Background face indexing

After uploading real photos (step 5 or the bulk-upload API):

```bash
curl -s "${UA[@]}" "$BASE/api/admin/profiles/$PID/gallery/quota" -H "Authorization: Bearer $TOK"
```

Expected: an `indexing` object — `{"total":N,"indexed":N,"processing":N,"failed":N}`.
`processing` is derived (`total - indexed - failed`), so it can't disagree
with the other two.

Watch the worker process the queue:

```bash
./deploy.sh --logs worker
```

Expected: `FACE_INDEX` job log lines as photos finish indexing.

Retry one photo that failed:

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/admin/face-ops/retry-photo/<photo_id>" \
  -H "Authorization: Bearer $TOK"
```

Expected: `200` with `{"queued": true, "photo_id": "<photo_id>"}` (or
`"queued": false` with a note if no worker/Redis is up — the flag is still
set and a live worker picks it up later). A photo id from a wedding you
don't own answers `403`; an unknown photo id answers `404`.

---

## 10. Event-specific Rekognition (cross-event isolation)

The Rekognition collection id is derived per wedding:
`maja_wedding_<profileId>` (`gallery_features._profile_collection_id`) — one
collection per wedding, shared across that wedding's ceremonies, never
shared across weddings.

**Isolation test:**
1. Create and enable the gallery on a **second** profile (repeat steps 1 and
   5.1) — call it `PID2`/`SLUG2`.
2. Upload photos of person A only into `PID`'s gallery, and photos of person
   B only into `PID2`'s gallery.
3. On `$BASE/invite/$SLUG2/live-gallery`, use **Find My Photos** with a
   selfie of person A (who only appears in `PID`'s gallery).

Expected: zero matches. A hit here would mean the collections are not
isolated.

---

## 11. Single face-match QR

Before the gallery is enabled:

```bash
curl -s -w '\n%{http_code}\n' "${UA[@]}" "$BASE/api/admin/profiles/$PID/face-match-qr" \
  -H "Authorization: Bearer $TOK"
```

Expected: `409` with `{"code":"GALLERY_NOT_ENABLED", ...}`.

After enabling (step 5.1):

```bash
curl -s "${UA[@]}" "$BASE/api/admin/profiles/$PID/face-match-qr" \
  -H "Authorization: Bearer $TOK"
```

Expected: `200` with `qr_url` (resolves to `/invite/$SLUG/live-gallery`) and
a base64 `qr_image`. UI:

```
$BASE/studio/profile/$PID/qr-codes
```

Expected: a **"Find My Photos"** card showing the same QR.

---

## 12. Guest selfie + face search + matching photos

**Phone-driven (the real flow):** scan the QR from step 11 (or open its
`qr_url` directly), tap **Find My Photos**, take a selfie with the camera.
Expected: after a few seconds, a grid of matching photos appears.

**Scripted variant:**

```bash
curl -s "${UA[@]}" -X POST "$BASE/api/public/gallery/$SLUG/face-search" \
  -F "selfie=@/path/to/selfie.jpg"
```

Expected: `200` with either `{"session_id":..., "status":"done", "match_count":N, "photos":[...]}`
(cache hit / no queue) or `{"session_id":..., "status":"queued"}`. If queued:

```bash
curl -s "${UA[@]}" "$BASE/api/public/gallery/$SLUG/face-results?session_id=<session_id>"
```

Expected: `status` moves from `"queued"` to `"done"` (or `"failed"` with an
`error`), with `match_count` and `photos` once done. Note: this route may
first answer `428 CONSENT_REQUIRED` if the gallery has a privacy/consent
gate enabled — that's expected behavior, not a bug, when consent hasn't been
recorded for this guest IP yet.

---

## 13. Original-resolution download

Pick a known file and record its size:

```bash
ls -l photo.jpg          # note the byte size, e.g. 4213099
```

Upload it via step 5's drag-drop, then from `$BASE/studio/profile/$PID/gallery`
download the original and compare byte sizes on disk — they must match
exactly (not a re-compressed/resized copy).

Scripted cross-check — the admin photo listing returns a signed
`original_url` per photo (the DB's `original_s3_key`, distinct from the
display/thumb key):

```bash
curl -s "${UA[@]}" "$BASE/api/admin/profiles/$PID/gallery/photos" \
  -H "Authorization: Bearer $TOK"
```

Expected: each entry has `thumb_url` and `original_url` as two different
signed URLs; `curl -sI` on `original_url` should report the same
`Content-Length` as the file you uploaded.

---

## 14. Authorization spot-checks (these MUST fail)

```bash
# No token -> 401/403
curl -s -o /dev/null -w '%{http_code}\n' "${UA[@]}" \
  "$BASE/api/admin/profiles/$PID/gallery/quota"

# Another studio's profile id -> 403/404 (log in as your OTHER studio account for $OTHER_TOK)
curl -s -o /dev/null -w '%{http_code}\n' "${UA[@]}" \
  "$BASE/api/admin/profiles/$PID/gallery/quota" -H "Authorization: Bearer $OTHER_TOK"

# A reservation minted for a DIFFERENT wedding -> 404
curl -s -o /dev/null -w '%{http_code}\n' "${UA[@]}" -X POST \
  "$BASE/api/admin/profiles/<some_other_pid>/gallery/quota/reservations/<rid_from_PID>/release" \
  -H "Authorization: Bearer $TOK"

# commit-upload with an s3_key outside this profile's staging prefix -> 403
curl -s -o /dev/null -w '%{http_code}\n' "${UA[@]}" -X POST \
  "$BASE/api/admin/profiles/$PID/gallery/commit-upload" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"s3_key":"gallery/some-other-profile-id/staging/x.jpg"}'
```

Expected exit codes: `401`/`403`, `403`/`404`, `404`, `403` respectively. Any
`200` here is a real access-control bug — stop and report it rather than
continuing the runbook.

---

## 15. Mobile

On a phone (or DevTools device emulation), walk:

- `$BASE/invite/$SLUG` — guest invitation
- `$BASE/invite/$SLUG/live-gallery` — Find My Photos
- `$BASE/studio/dashboard` — studio dashboard
- `$BASE/studio/profile/$PID/gallery` — gallery upload

Expected: layouts adapt, no horizontal scroll, upload/selfie camera picker
works. Reduced-data behavior (smaller images, deferred non-critical assets)
comes from the performance policy automatically — nothing to configure per
page.

---

## 16. Ops quick reference

```bash
./deploy.sh --status          # read-only health probe of the running stack
./deploy.sh --logs            # core + worker + caddy, tailed
./deploy.sh --logs worker     # just the worker (face indexing, retries)
./deploy.sh --rollback        # redeploy the previous recorded commit
```

`./deploy.sh --review`'s own stage 9 already ran `scripts/aws_smoke_test.py`
against the runtime AWS identity and proved: correct AWS account, S3
read/write on all four buckets, presigned-URL/multipart key routing, and
Rekognition `DescribeCollection` permission. It does **not** create a
Rekognition collection or exercise the app's actual gallery-enable /
face-search code paths — steps 5, 10, and 12 above are what prove those, and
are not redundant with the smoke test.
