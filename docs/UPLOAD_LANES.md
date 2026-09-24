# Upload lanes — inventory before cleanup

Which upload paths exist, which the deployed frontend actually uses, and what
may be retired. **Nothing is deleted on the strength of this document.** It is
the caller inventory that has to exist first.

---

## 0. One distinction that keeps getting muddled

**Proxying upload bytes** — the browser POSTs a file *to the app server*, which
holds it in memory and forwards it to S3. This is what the architecture forbids:
a 2 TB shoot would flow through uvicorn.

**Reading an already-uploaded S3 object** — the browser uploaded straight to S3,
and the server then GETs that object to derive a preview and a thumbnail. This
is *not* a proxy upload. The upload already happened without the server, and the
derivative work has to read the bytes somewhere.

`gallery/commit-upload` does the second thing. An earlier note in this repo
called it a proxy; that was wrong, and the distinction matters because
"eliminate byte proxying" must not be read as "stop generating derivatives".

---

## 1. The three direct-to-S3 lanes

| Lane | Backend | Shape | Frontend wrapper | Used by a page? |
|---|---|---|---|---|
| **A. POST-policy** | `storage_upload.py` — `/api/uploads/presign` + `/api/uploads/commit` | presigned POST policy, single shot, ≤25 MB | `api/uploads.js` → `uploadViaPresign` | **No** |
| **B. Session/multipart** | `upload_sessions_service.py` — `/api/media/upload-sessions/*` | control-plane session, presigned PUT or multipart parts, resumable, tens of GB | `api/uploads.js` → `lib/multipartUploader.js` → `uploadMedia` | **No** |
| **C. Gallery presign** | `gallery_features.py` — `/gallery/presign-upload` + `/gallery/commit-upload` | presigned PUT to a per-profile staging prefix, then server-side copy + derivatives | `api/studio.js` → `StudioProfileGallery.jsx` | **Yes — this is the one in production** |

**The finding that matters:** neither of the two "generic" lanes has a page
consumer. `lib/multipartUploader.js` exports `uploadMedia` and `pickConcurrency`;
only `pickConcurrency` is imported anywhere. So "retire A, keep B" does not by
itself change what any user touches — the photographer upload that actually runs
is lane C.

Sequence for lane C, which is the architecture the spec asks for:

```
browser → POST /gallery/presign-upload   (auth, ownership, quota hold, server-chosen key)
browser → PUT  <presigned URL> ──────────────────────────► S3      ← bytes never touch the app
browser → POST /gallery/commit-upload    (head_object, derivatives, DB row, FACE_INDEX job)
```

## 2. Byte-proxy endpoints (`UploadFile`)

29 handlers across 10 modules still accept a file body. They are **not** all
equivalent:

| Module | Count | What it carries | Priority |
|---|---|---|---|
| `server.py` | 12 | admin images, album media, couple photos, QR backgrounds | low — small, one-off |
| `gallery_features.py` | 7 | `bulk-upload` (the lane-C fallback), `live-upload`, guest selfies | **bulk-upload is the one that matters** |
| `live_gallery_features.py` | 3 | guest wall uploads (phone camera, small) | low |
| `guest_features.py` | 2 | guest submissions | low |
| `studio_storage.py`, `premium_features.py`, `portfolio_service.py`, `pixora_service.py`, `event_media_service.py`, `cloud_backup_service.py` | 1 each | portfolio images, Pixora posts, backup | medium — `cloud-backup` can carry large files |

Selfies are deliberately proxied: they are ~100 KB after client-side
thumbnailing, and routing them through the server keeps them out of any
browser-reachable bucket path.

## 3. Retirement order (not yet performed)

1. **Lane A.** Zero page consumers. Retire the frontend wrappers first
   (`uploadViaPresign`, `postToS3`), leave the backend routes answering with a
   deprecation log for one release, then remove. `test_storage_upload.py` covers
   the routes and must be retired with them.
2. **Lane B or lane C — pick one.** They solve the same problem twice. Lane B is
   more capable (resumable, multipart, GB-scale); lane C is the one users touch.
   The cheap move is to point `StudioProfileGallery` at lane B and delete lane C,
   which also gets resumability for free. That is a real migration with a real
   regression surface, not a deletion.
3. **`gallery/bulk-upload`** only after lane C's presign path has telemetry
   showing the fallback is not firing. It exists because the presign PUT can fail
   (S3 unconfigured, CORS, expired policy) and the studio should still be able to
   upload.

## 4. Rule

Do not delete a route because this document lists it. Delete it when:

* grep shows no caller in `frontend-v2/`, `backend/`, or `scripts/`;
* the tests covering it are retired in the same commit;
* for a public route, a deprecation window has passed with no traffic.
