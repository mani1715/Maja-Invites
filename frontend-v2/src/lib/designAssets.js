// Design artwork resolution — the settled answer to the audit's asset question.
//
// THE PROBLEM: the legacy app carried 1,395 design images in git and addressed
// them through frontend/src/themes/image-manifest.json (1,143 entries). That
// tree was dropped from this repo, so every one of those paths 404s, and it is
// also what made the old repo 2,411 files.
//
// THE DECISION (approved 2026-08-13): artwork is NOT restored to git. It is
// served from S3/CloudFront and addressed by URL. Nothing in the bundle grows
// as the catalogue grows, and adding a design needs no deploy.
//
// Resolution order for any design image reference:
//   1. Already absolute (http/https/data) -> use as-is. This is what the API
//      returns once artwork is uploaded through the normal media pipeline.
//   2. VITE_DESIGN_CDN is set -> join it with the path. This is production.
//   3. Neither -> fall back to the backend origin, which serves /uploads/*.
//      Local dev and any design whose artwork lives in uploads/ still work.
//
// A missing image is never a broken <img>: use `designImage()` with the
// placeholder fallback, which renders a themed gradient tile instead.

const CDN = (import.meta.env.VITE_DESIGN_CDN || '').replace(/\/+$/, '');
const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');

/** Resolve one design-artwork reference to a loadable URL, or '' if absent. */
export function designAsset(ref) {
  if (!ref) return '';
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;

  let path = String(ref).trim();
  if (!path.startsWith('/')) path = `/${path}`;

  // Legacy manifest paths (/designs/...) only ever exist on the CDN now.
  if (CDN) return `${CDN}${path}`;

  // Backend fallback: /uploads/* must go through /api/uploads/* so the edge
  // routes it to FastAPI rather than the SPA shell (same rule as mediaUrl.js).
  if (path.startsWith('/uploads/')) path = `/api${path}`;
  return `${BACKEND}${path}`;
}

/** True when artwork is actually configured. Lets a caller choose a real
 *  layout instead of rendering a grid of broken frames. */
export const hasDesignArtwork = Boolean(CDN || BACKEND);

/** Deterministic gradient for a theme id — the placeholder used wherever a
 *  design has no artwork yet. Same palette as the wizard swatches, so the two
 *  screens agree about what a theme looks like. */
const SWATCHES = {
  royal_heritage: ['#7f1d1d', '#b45309'],
  south_indian_temple: ['#b45309', '#fbbf24'],
  temple_gold: ['#d97706', '#fef3c7'],
  royal_mughal: ['#065f46', '#b45309'],
  modern_minimal: ['#f3f4f6', '#9ca3af'],
  modern_lotus: ['#fbcfe8', '#a78bfa'],
  modern_pastel: ['#fecdd3', '#bbf7d0'],
  ivory_elegance: ['#fffbeb', '#d6d3d1'],
  peacock_dream: ['#0f766e', '#eab308'],
  bollywood_luxury: ['#be123c', '#f59e0b'],
  punjabi_sangeet: ['#ea580c', '#facc15'],
  midnight_sangeet: ['#1e1b4b', '#a855f7'],
  bengali_traditional: ['#dc2626', '#fef2f2'],
  kerala_backwaters: ['#15803d', '#fde68a'],
  beach_destination: ['#0ea5e9', '#fde68a'],
  nature_eco_wedding: ['#4d7c0f', '#d9f99d'],
  christian_elegant: ['#e0f2fe', '#f8fafc'],
  muslim_nikah: ['#064e3b', '#d4af37'],
  dark_royal: ['#111827', '#a16207'],
};

export function themeGradient(themeId) {
  const [a, b] = SWATCHES[themeId] || ['#ede9fe', '#a78bfa'];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** Pick the best artwork reference off an API design/theme object. The backend
 *  is not consistent about which key carries it, so try them in order. */
export function designImage(obj) {
  if (!obj) return '';
  const ref = obj.preview_image || obj.preview || obj.thumbnail
    || obj.image_url || obj.background_image || obj.cover_image || '';
  return designAsset(ref);
}
