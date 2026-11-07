/**
 * mediaUrl.js — Frontend URL helper for backend-served media and local assets.
 *
 * Background:
 *   - data: and blob: URIs must NEVER be prefixed with BACKEND_URL.
 *   - Pre-existing absolute URLs (signed S3 URLs, CDNs, external images) must be preserved.
 *   - Bundled static assets (/designs/*, /assets/*, /home/*, /portfolio-reference/*)
 *     resolve from the frontend origin (or VITE_DESIGN_CDN for designs if set).
 *   - Uploaded backend media (/uploads/* or /api/uploads/*) resolves with BACKEND_URL.
 */
import { getBackendUrl } from './backendUrl';

export function resolveMediaUrl(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';

  // 1. Guard inline data: and client blob: URLs
  if (/^(data:|blob:)/i.test(str)) return str;

  // 2. Already absolute HTTP/HTTPS URL
  if (/^https?:\/\//i.test(str)) {
    // Normalise any internal backend URLs that embed unproxied /uploads/
    return str.replace(/(https?:\/\/[^/]+)\/uploads\//i, '$1/api/uploads/');
  }

  // 3. Ensure leading slash for path matching
  let path = str.startsWith('/') ? str : `/${str}`;

  // 4. Bundled frontend static assets (served directly by Vite/Netlify)
  if (
    path.startsWith('/designs/') ||
    path.startsWith('/assets/') ||
    path.startsWith('/home/') ||
    path.startsWith('/portfolio-reference/')
  ) {
    const cdn = (import.meta.env.VITE_DESIGN_CDN || '').replace(/\/+$/, '');
    if (cdn && path.startsWith('/designs/')) {
      return `${cdn}${path}`;
    }
    return path;
  }

  // 5. Uploaded backend media: ensure /api/uploads/ path
  if (path.startsWith('/uploads/')) path = `/api${path}`;

  const backend = getBackendUrl();
  return backend ? `${backend}${path}` : path;
}

export default resolveMediaUrl;
