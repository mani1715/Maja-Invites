/**
 * mediaUrl.js — Frontend URL helper for backend-served media.
 * Ported verbatim from legacy frontend/src/utils/mediaUrl.js, plus the data:-URI
 * guard noted in docs/recon/recon-frontend-logic.md §2 (the legacy resolver had
 * no guard and would prepend BACKEND_URL to a data: URI, breaking inline images).
 *
 * Background:
 *   The backend exposes static files at BOTH `/uploads/...` and `/api/uploads/...`.
 *   In production the ingress only routes `/api/*` to FastAPI — everything else
 *   falls through to the SPA (index.html), so a bare `/uploads/x.jpg` renders as
 *   a broken image. This helper normalises any URL the backend ever wrote into
 *   the database into one that always lands on the backend through the ingress.
 *
 * Usage:
 *   import { resolveMediaUrl } from '@/lib/mediaUrl';
 *   <img src={resolveMediaUrl(value)} />
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export function resolveMediaUrl(value) {
  if (!value) return '';
  // data: URIs (inline/base64 images) must never be prefixed with BACKEND_URL.
  if (/^data:/i.test(value)) return value;
  // Already absolute? leave it alone.
  if (/^https?:\/\//i.test(value)) {
    // Catch absolute URLs that still embed the bad `/uploads/` path.
    return value.replace(/(https?:\/\/[^/]+)\/uploads\//i, `$1/api/uploads/`);
  }
  // Make sure we always use the /api/uploads/... path so the ingress
  // routes it to the backend instead of the SPA fallback.
  let path = value;
  if (path.startsWith('/uploads/')) path = '/api' + path;
  if (!path.startsWith('/')) path = '/' + path;
  return `${BACKEND_URL}${path}`;
}

export default resolveMediaUrl;
