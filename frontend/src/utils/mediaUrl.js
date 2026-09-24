/**
 * mediaUrl.js — Frontend URL helper for backend-served media.
 *
 * Background:
 *   The backend exposes static files at BOTH `/uploads/...` and `/api/uploads/...`.
 *   In production the Kubernetes ingress only routes `/api/*` paths to the FastAPI
 *   service — everything else falls through to the React dev server (which returns
 *   index.html for any URL it doesn't recognise). That made every uploaded image
 *   render as a broken icon, because the browser fetched the URL and got HTML
 *   back instead of an image.
 *
 *   This helper normalises any URL the backend ever wrote into the database
 *   (legacy `/uploads/...` or new `/api/uploads/...`) into a fully-qualified URL
 *   that always lands on the backend through the ingress.
 *
 * Usage:
 *   import { resolveMediaUrl } from '@/utils/mediaUrl';
 *   <img src={resolveMediaUrl(value)} />
 */
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

export function resolveMediaUrl(value) {
  if (!value) return '';
  // Already absolute? leave it alone.
  if (/^https?:\/\//i.test(value)) {
    // Catch absolute URLs that still embed the bad `/uploads/` path
    // (e.g. https://host/uploads/...). Rewrite them too.
    return value.replace(/(https?:\/\/[^/]+)\/uploads\//i, `$1/api/uploads/`);
  }
  // Make sure we always use the /api/uploads/... path so the ingress
  // routes it to the backend instead of the React SPA fallback.
  let path = value;
  if (path.startsWith('/uploads/')) path = '/api' + path;
  if (!path.startsWith('/')) path = '/' + path;
  return `${BACKEND_URL}${path}`;
}

export default resolveMediaUrl;
