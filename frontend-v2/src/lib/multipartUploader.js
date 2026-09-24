// Dependency-free single/multipart uploader against the session-based media
// upload API (upload_sessions_service.py). Control-plane calls (create /
// presign parts / complete / abort) go through the shared axios client in
// api/uploads.js; the actual bytes go straight to S3 via plain fetch with
// presigned URLs — no auth header, no baseURL.
import {
  createMediaSession, getMediaSession, presignParts, completeMediaSession, abortMediaSession,
} from '../api/uploads';
import { getProfile } from './performanceProfile';

const PART_BATCH = 100; // max part_numbers per presign call
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_CONCURRENCY = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How many parts to upload in parallel.
 *
 * The device reasoning that used to live here (saveData, effectiveType,
 * deviceMemory, pointer coarseness) moved to lib/performanceProfile.js, which
 * is the one place the app decides what a device can take. Keeping a second
 * copy here meant the uploader and the gallery could disagree about the same
 * phone. This is now a thin read of the shared policy, kept as an exported
 * function so existing callers do not change.
 *
 * @returns {number} 1-6
 */
export function pickConcurrency() {
  return Math.min(MAX_CONCURRENCY, getProfile().uploadConcurrency);
}

// 410 from the parts endpoint means the session itself expired — not
// retryable, distinct from a transient part-PUT failure.
async function presignBatch(sessionId, partNumbers, signal) {
  try {
    const { data } = await presignParts(sessionId, partNumbers, { signal });
    return data.urls;
  } catch (e) {
    if (e?.response?.status === 410) {
      const err = new Error('Upload session expired');
      err.code = 'SESSION_EXPIRED';
      err.noRetry = true;
      throw err;
    }
    throw e;
  }
}

/**
 * Upload one file through the media upload-sessions API, single PUT or
 * multipart depending on what the server chooses for its size.
 * @param {object} opts
 * @param {File} opts.file
 * @param {string} opts.category
 * @param {string} opts.kind
 * @param {string} [opts.eventId]
 * @param {string} [opts.invitationId]
 * @param {(p: {loadedBytes:number, totalBytes:number, doneParts:number, totalParts:number}) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.resumeSessionId] resume an existing session instead of creating one
 * @returns {Promise<object>} the created media asset
 */
export async function uploadMedia({
  file, category, kind, eventId, invitationId, onProgress, signal, resumeSessionId,
}) {
  const checkAborted = () => {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
  };
  const totalBytes = file.size;
  const report = (loadedBytes, doneParts, totalParts) => {
    onProgress?.({ loadedBytes, totalBytes, doneParts, totalParts });
  };

  let session;
  let uploadedParts = [];
  if (resumeSessionId) {
    const { data } = await getMediaSession(resumeSessionId, { signal });
    session = data;
    uploadedParts = data.uploaded_parts || [];
  } else {
    const { data } = await createMediaSession({
      category, kind, mime: file.type, size_bytes: file.size,
      event_id: eventId, invitation_id: invitationId, filename: file.name,
    }, { signal });
    session = data;
  }
  const sessionId = resumeSessionId || session.session_id;
  const abortSession = async () => {
    try { await abortMediaSession(sessionId); } catch (_e) { /* best-effort */ }
  };

  try {
    checkAborted();

    if (session.mode === 'single') {
      report(0, 0, 1);
      const res = await fetch(session.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
        signal,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      report(totalBytes, 1, 1);
      const { data: asset } = await completeMediaSession(sessionId, {}, { signal });
      return asset;
    }

    // multipart
    const { part_size: partSize } = session;
    const totalParts = Math.ceil(file.size / partSize);
    const doneMap = new Map(); // part_number -> {part_number, etag, size}
    uploadedParts.forEach((p) => doneMap.set(p.part_number, p));
    let loadedBytes = uploadedParts.reduce((sum, p) => sum + (p.size || 0), 0);
    report(loadedBytes, doneMap.size, totalParts);

    const remaining = [];
    for (let n = 1; n <= totalParts; n += 1) if (!doneMap.has(n)) remaining.push(n);

    // Presign ahead in batches of <=100, not all up front. Workers share one
    // cursor into `remaining` and one in-flight batch promise so concurrent
    // misses on the same batch don't double-request.
    const urlCache = new Map();
    let presignCursor = 0;
    let presignInFlight = null;
    const getUrl = async (partNumber) => {
      while (!urlCache.has(partNumber)) {
        if (!presignInFlight) {
          const batch = remaining.slice(presignCursor, presignCursor + PART_BATCH);
          presignCursor += batch.length;
          presignInFlight = presignBatch(sessionId, batch, signal)
            .then((urls) => { Object.entries(urls).forEach(([n, u]) => urlCache.set(Number(n), u)); })
            .finally(() => { presignInFlight = null; });
        }
        await presignInFlight;
      }
      return urlCache.get(partNumber);
    };
    const refreshUrl = async (partNumber) => {
      urlCache.delete(partNumber);
      const urls = await presignBatch(sessionId, [partNumber], signal);
      urlCache.set(partNumber, urls[String(partNumber)]);
      return urls[String(partNumber)];
    };

    const uploadPart = async (partNumber) => {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      let lastErr;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        checkAborted();
        // eslint-disable-next-line no-await-in-loop
        const url = attempt === 0 ? await getUrl(partNumber) : await refreshUrl(partNumber);
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch(url, { method: 'PUT', body: blob, signal });
          if (res.status === 410) {
            const err = new Error('Upload session expired');
            err.code = 'SESSION_EXPIRED'; err.noRetry = true;
            throw err;
          }
          if (!res.ok) throw new Error(`Part ${partNumber} failed: ${res.status}`);
          const etag = (res.headers.get('ETag') || '').replace(/"/g, '');
          if (!etag) {
            const err = new Error('S3 CORS must expose ETag');
            err.noRetry = true;
            throw err;
          }
          doneMap.set(partNumber, { part_number: partNumber, etag, size: end - start });
          loadedBytes += (end - start);
          report(loadedBytes, doneMap.size, totalParts);
          return;
        } catch (e) {
          if (e.name === 'AbortError' || e.noRetry) throw e;
          lastErr = e;
          if (attempt < MAX_ATTEMPTS - 1) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(RETRY_DELAYS_MS[attempt]);
          }
        }
      }
      throw lastErr;
    };

    const concurrency = Math.max(1, Math.min(pickConcurrency(), remaining.length || 1));
    let idx = 0;
    const worker = async () => {
      while (idx < remaining.length) {
        const partNumber = remaining[idx];
        idx += 1;
        await uploadPart(partNumber); // eslint-disable-line no-await-in-loop
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    checkAborted();
    const parts = Array.from({ length: totalParts }, (_, i) => doneMap.get(i + 1))
      .map(({ part_number, etag }) => ({ part_number, etag }));
    const { data: asset } = await completeMediaSession(sessionId, { parts }, { signal });
    return asset;
  } catch (err) {
    if (err?.name === 'AbortError') {
      await abortSession();
      throw err;
    }
    await abortSession();
    const wrapped = err instanceof Error ? err : new Error(String(err));
    wrapped.sessionId = sessionId;
    throw wrapped;
  }
}
