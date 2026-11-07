/**
 * backendUrl.js — Centralized backend origin normalization.
 *
 * Normalizes `import.meta.env.VITE_BACKEND_URL`:
 * - Strips leading/trailing whitespace.
 * - Strips trailing slashes.
 * - Strips trailing `/api` if accidentally provided (e.g. `https://api.example.com/api` -> `https://api.example.com`)
 *   so that subsequent requests (`/api/auth/me`, `/api/admin/...`) never produce `/api/api/...`.
 * - Returns a clean origin string (e.g. `https://api.majainvites.com`) or `''` if empty.
 */

export function getBackendUrl() {
  let url = (import.meta.env.VITE_BACKEND_URL || '').trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  if (url.toLowerCase().endsWith('/api')) {
    url = url.slice(0, -4).replace(/\/+$/, '');
  }
  return url;
}

export const BACKEND_URL = getBackendUrl();
export default getBackendUrl;
