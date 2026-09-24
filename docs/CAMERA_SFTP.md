# Camera → SFTP → S3 ingestion (MAJA Invites)

Send photographs straight from a supported camera into a MAJA event's gallery
and AI Face Match, **without the image bytes ever passing through the website /
app server**. First supported camera: **Sony α7 IV (ILCE-7M4)**.

Two secure transports, same everything else (auth, isolation, ingest):
- **FTPES** (FTP-over-TLS) — `camera_ftps_server.py`. **The Sony α7 IV uses this**
  — verified against Sony's FTP Help Guide, the a7 IV supports FTP/FTPES and has
  **no SFTP**.
- **SFTP** (SSH) — `camera_sftp_server.py`. For generic SFTP-capable cameras/tethers.

The camera's protocol (from its `camera_profiles` entry) decides which endpoint
the panel shows. Plain unencrypted FTP is never enabled.

> Status: implemented + locally tested on branch `feat/camera-sftp-ingestion`.
> The SFTP daemon and the Sony acceptance test are **manual** VM steps (below) —
> nothing here deploys itself.

---

## 1. Architecture

```
Camera (Sony α7 IV, SFTP)
  → SFTP endpoint on the VM  (camera_sftp_server.py, port 2222)
     • password auth, verified against the per-event credential (bcrypt)
     • the SFTP username maps SERVER-SIDE to exactly one event + photographer
  → bytes land in a per-connection temp file for a moment
  → camera_ingest.ingest_bytes()  →  gallery_features._ingest_photo_bytes()
     • magic-byte validation (photo_guard)   • sha256 dedup (per event)
     • ORIGINAL stored untouched in S3        • preview/thumb derivatives
     • db.gallery_photos row                  • FACE_INDEX enqueued
  → temp file deleted (nothing accumulates on the VM)
  → worker.py → Rekognition collection  maja_wedding_{profile_id}
  → Find My Photos returns ONLY this event's photos
```

The camera lane is an **additional** ingestion path. It does not replace the
browser direct-to-S3 upload, and it reuses — unchanged — the existing gallery,
queue, worker, Rekognition per-event collection, and Find-My-Photos. There is no
second gallery, queue, face system, or event model.

### Why self-hosted SFTP (not AWS Transfer Family)
AWS Transfer Family is a managed SFTP→S3 front-end, but it bills ~$0.30/hour per
endpoint (~$216/month whether used or not) plus ~$0.04/GB. To avoid that fixed
cost, the SFTP server is self-hosted on the VM and pushes each file to S3 via the
normal ingest (uploads *into* S3 are free). Bytes touch the VM only transiently.
The `CameraTransferProvider` abstraction (`camera_profiles.py`) leaves room to add
a managed adapter later without touching the ingest pipeline.

---

## 2. Files

| File | Role |
|------|------|
| `backend/camera_profiles.py` | camera-agnostic capability registry (Sony α7 IV + generic profiles). No `if brand == "sony"` in the pipeline. |
| `backend/camera_transfer_service.py` | credential lifecycle (create/activate/rotate/disable/revoke/expire) + `authenticate()`; binds username → event → photographer, all server-side. |
| `backend/camera_ingest.py` | feeds received bytes into `gallery_features._ingest_photo_bytes`; writes the `camera_events` audit row. |
| `backend/camera_sftp_server.py` | the write-only SFTP daemon (paramiko). Runs as its own process. |
| `backend/camera_router.py` | HTTP surface (auth/config/status/revoke only — never image bytes). |
| `frontend-v2/src/components/gallery/CameraUploadPanel.jsx` | studio "Camera" tab. |
| `frontend-v2/src/pages/AdminCameras.jsx` | super-admin fleet view + revoke + audit. |
| `backend/tests/test_camera_sftp.py` | 11 tests: lifecycle, isolation, traversal, rejects. |
| `deploy/docker-compose.camera.yml` | optional overlay that runs the SFTP daemon (manual). |

DB collections (auto-created by pg_adapter): `db.camera_transfers`, `db.camera_events`.

---

## 3. Security model

- **SFTP only.** SSH transport encryption. No FTP; FTPS is a documented future
  compatibility target, not terminated by this server. Plain FTP is never enabled.
- **Auth = password, bcrypt-verified.** We terminate the server ourselves, so we
  only ever *verify* the password — it is stored as a bcrypt hash (like admin
  passwords), shown in plaintext exactly **once** at create/rotate, and replaced
  (never revealed) on rotate. No recoverable secret, nothing to leak. No AWS
  credentials ever go near the camera.
- **Event isolation.** The SFTP **username** is the only source of the event
  association. It maps server-side to one `profile_id` (+ owning `admin_id`). The
  camera cannot choose or influence the event. A credential for event A can only
  ever write to event A. Verified by `test_sftp_event_isolation_credentials_cannot_cross`.
- **Path-traversal immunity (structural).** The client-supplied "path" is never
  turned into a real filesystem path — only its sanitized basename is kept as a
  cosmetic label. Every write goes to a server-named temp file in the connection's
  private tempdir. `../`, absolute paths, and Windows separators cannot escape.
- **Write-only.** Reads, deletes, symlinks, rmdir are denied.
- **Rate limiting.** Per-IP auth attempts are throttled (`CAMERA_SFTP_AUTH_MAX_PER_MIN`).
- **Validation reused.** `photo_guard.sniff_photo` (magic bytes, not the
  client's content-type) + a byte-size ceiling. Non-photos are rejected and audited.
- **Idempotency.** Per-event sha256 dedup in `_ingest_photo_bytes` — a retried /
  re-sent photo does not create a duplicate gallery row.
- **Least privilege on S3.** The runtime role only puts objects + tags; the camera
  never sees S3 or AWS credentials, and the SFTP server never exposes the bucket.
- **Audit.** Every received file writes a `camera_events` row (stored / duplicate
  / rejected + reason). Credentials are never logged.

### Do-not-trust list (all enforced server-side)
camera filename · camera directory / path · any client-supplied event id ·
content-type. Authorization and event resolution come only from the authenticated
SFTP identity.

---

## 4. Credential lifecycle

`CREATE` (studio enables) → `ACTIVE` → `ROTATE` (same username, new password,
old dies) → `DISABLE` (studio) / `REVOKE` (admin) → `EXPIRE` (TTL,
`CAMERA_CRED_TTL_DAYS`, default 120). `authenticate()` enforces active +
not-expired on every connect. Enabling requires the event's **photo gallery /
AI Face Match to be enabled first** (that is what creates the Rekognition
collection the camera photos index into).

HTTP surface (all under `/api`, Bearer `admin_token`):
- Studio (owner-scoped): `…/profiles/{id}/camera/status|config|enable|rotate|disable|events`, `…/camera/profiles`
- Admin (super-admin): `…/camera/transfers`, `…/camera/{profile_id}/revoke`, `…/camera/events`

The one-time plaintext password is returned only by `enable` / `rotate`.

---

## 5. Camera compatibility

| Camera | Protocol | Support | Notes |
|--------|----------|---------|-------|
| **Sony α7 IV (ILCE-7M4)** | **FTPES** | **SUPPORTED** | Sony "Secure Protocol: ON" = FTPES. Host/Port(21)/User/Password. Accept the self-signed cert prompt. The a7 IV has NO SFTP. |
| Any FTPES camera | FTPES | **PARTIAL / UNVERIFIED** | Should work; not acceptance-tested. |
| Any SFTP camera / tether | SFTP | **PARTIAL / UNVERIFIED** | The SFTP daemon (port 2222) is for these. |
| Plain FTP | FTP | **NOT SUPPORTED** | Insecure — never enabled. |
| Camera RAW (.ARW) | — | **NOT face-indexed** | Rekognition needs JPEG/PNG. Shoot JPEG or JPEG+RAW. |
| HEIC | — | **PARTIAL** | Depends on server HEIF decode; prefer JPEG. |

Do not claim universal camera compatibility — only the Sony α7 IV is verified.

---

## 6. Local testing (no AWS, no camera)

The full auth / isolation / traversal / reject matrix runs in-process (paramiko
client ↔ server, mocked ingest):

```bash
PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_camera_sftp.py -q
```

To run the daemon locally against the dev stack (uploads fall back to disk with
no AWS):

```bash
# from backend/, with the local stack up (SUPABASE_DB_URL set)
CAMERA_SFTP_BIND_PORT=2222 python camera_sftp_server.py
# then, from another shell, using any sftp client with a credential minted via
# the studio "Camera" tab (needs AWS for the gallery to actually store):
sftp -P 2222 maja-xxxx@127.0.0.1
```

---

## 7. Production deployment (MANUAL — Phase 5, nothing here auto-deploys)

Prereqs: the backend image already includes `paramiko` (added to
`backend/requirements.txt`), so the SFTP service reuses the `deploy-core` image.

1. **DNS**: point `ftp.majainvites.com` → the VM's public IP (A record).
2. **Env** (`deploy/.env`): set
   ```
   CAMERA_SFTP_HOST=ftp.majainvites.com
   CAMERA_SFTP_PORT=2222          # the port shown to the photographer
   CAMERA_SFTP_BIND_PORT=22       # the port INSIDE the container
   CAMERA_CRED_TTL_DAYS=120
   ```
3. **Run the daemon** with the overlay (adds one service; does not touch the
   running stack's other services):
   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.camera.yml up -d camera-sftp
   ```
   The overlay publishes container `22` as host `2222`. The persisted host key
   (`backend/.camera_sftp_host_key`) gives a stable fingerprint the photographer
   verifies; it is gitignored.
4. **GCP firewall**: open TCP 2222 to the world (or to the studio's IPs):
   ```bash
   gcloud compute firewall-rules create maja-camera-sftp \
     --allow=tcp:2222 --direction=INGRESS --target-tags=maja \
     --source-ranges=0.0.0.0/0 --description="MAJA camera SFTP"
   # ensure the instance carries the maja tag (once):
   # gcloud compute instances add-tags <INSTANCE> --tags=maja
   ```
5. **Verify** the daemon is listening and shows a fingerprint:
   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.camera.yml logs --tail=20 camera-sftp
   ```

### FTPES (the Sony α7 IV path — it has no SFTP)

6. **Env** (`deploy/.env`): add
   ```
   CAMERA_FTPS_PORT=21
   CAMERA_FTPS_MASQUERADE_ADDRESS=34.67.38.190   # the VM's PUBLIC ip — REQUIRED for passive
   CAMERA_FTPS_PASV_MIN=30000
   CAMERA_FTPS_PASV_MAX=30009
   ```
7. **Start the FTPES daemon** (same overlay file):
   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.camera.yml up -d --build camera-ftps
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.camera.yml logs --tail=20 camera-ftps
   ```
   Expect `camera FTPES server listening on 0.0.0.0:21 passive=30000-30009 masquerade=34.67.38.190`.
   A self-signed cert (`backend/.camera_ftps_cert.pem`) is generated on first run.
8. **GCP firewall**: FTPES needs the control port AND the passive range:
   ```bash
   gcloud compute firewall-rules create maja-camera-ftps \
     --allow=tcp:21,tcp:30000-30009 --direction=INGRESS \
     --source-ranges=0.0.0.0/0 --network=default --description="MAJA camera FTPES"
   ```

The web/worker services are unchanged; only the new `camera-sftp` / `camera-ftps`
services open ports. Postgres/Redis stay internal. `ftp.majainvites.com` must be
**DNS-only** (not proxied) — Cloudflare's free proxy is HTTP-only and won't carry
SFTP/FTPES.

---

## 8. Sony α7 IV acceptance test (MANUAL — Phase 6)

Do this by hand once the daemon is up. **Claude does not run the camera test.**

1. In MAJA: create Event A, assign to Photographer A (super-admin).
2. Studio panel → the event → **Gallery → enable AI Face Match** (creates the
   Rekognition collection).
3. Studio panel → Gallery → **Camera** tab → pick "Sony — a7 IV" → **Enable
   camera transfer**. Copy the shown Host / Port / Username / Password (shown
   once — save the password).
4. **Get the camera online first**: Network → FTP Transfer Func. → **FTP Connect
   Method** = Wi-Fi (or USB-LAN/Tethering, or wired LAN). For Wi-Fi, open the
   access-point setting and join a router/hotspot **with internet** (that SSID +
   Wi-Fi password are the network's, NOT MAJA). This is only how the camera
   reaches the internet.
5. **Server Setting** (still under FTP Transfer Func.):
   - Host Name: `ftp.majainvites.com`
   - **Secure Protocol: ON** (this is FTPES). If it warns about a root-certificate
     error, choose to **connect anyway** — the link is still TLS-encrypted.
   - Port: `21`
   - User / Password: from step 3
   - Directory: `/`
6. Enable **FTP Auto Transfer: ON** (or select an image → FTP Transfer).
7. Take **one photo** (JPEG or JPEG+RAW).
8. Verify, in order:
   - camera shows transfer complete;
   - `AdminCameras` (or the studio Camera tab) shows **Received/Stored +1**,
     Last photo just now;
   - `db.gallery_photos` has a row with `upload_method="sftp_camera"`;
   - the FACE_INDEX job ran (Indexed count rises; `worker` logs);
   - **Find My Photos** for Event A returns the photo.
9. **Prove isolation**: create Event B; upload from Event A's camera credential;
   confirm the photo lands in Event A only, and a selfie search on Event B never
   returns it.

---

## 9. Troubleshooting & recovery

| Symptom | Cause / fix |
|---------|-------------|
| Camera "connection failed" | Firewall port not open; wrong host/port; daemon not running (`logs camera-sftp`). |
| "authentication failed" | Wrong/rotated password, or credential disabled/revoked/expired — rotate in the Camera tab. |
| Host key mismatch warning on camera | The daemon's host key changed (e.g. `backend/.camera_sftp_host_key` was deleted). Re-verify the new fingerprint shown in the Camera tab. |
| Photo transfers but never appears | It was rejected (not a JPEG/PNG, too large, or gallery not enabled) — check `AdminCameras → Recent activity` reason, or `db.camera_events`. |
| Indexed count stuck | Face worker down or a dead-letter — see `AdminFaceOps`; the FACE_INDEX retry/dead-letter path is shared with all uploads. |
| Duplicate re-sends | Deduped by per-event sha256 — a re-sent identical photo is recorded `duplicate`, not stored twice. |
| Want to cut a camera off now | Studio: Disable. Admin: Revoke (`AdminCameras`). Either blocks the next connect immediately. |

Failure recovery is inherited from the existing pipeline: FACE_INDEX jobs retry
(5×, exponential backoff) and dead-letter to `db.face_dead_letters`, requeueable
from `AdminFaceOps`. A camera that reconnects after a network drop and re-sends is
idempotent (sha256 dedup).
