// Design artwork resolution.
//
// Resolution order for design artwork references:
//   1. Already absolute (http/https/data/blob) -> use as-is.
//   2. VITE_DESIGN_CDN is set -> join with CDN origin.
//   3. Bundled frontend static assets (/designs/*, /assets/*) -> resolve from frontend origin.
//   4. Backend uploads (/uploads/*) -> resolve from normalized backend origin.

import { getBackendUrl } from './backendUrl';

const CDN = (import.meta.env.VITE_DESIGN_CDN || '').replace(/\/+$/, '');

/** Resolve one design-artwork reference to a loadable URL, or '' if absent. */
export function designAsset(ref) {
  if (!ref) return '';
  const str = String(ref).trim();
  if (/^(https?:|data:|blob:)/i.test(str)) return str;

  let path = str.startsWith('/') ? str : `/${str}`;

  // If explicit CDN is configured, use it for all design paths
  if (CDN) return `${CDN}${path}`;

  // Bundled frontend static artwork in public/designs or public/assets
  if (path.startsWith('/designs/') || path.startsWith('/assets/')) {
    return path;
  }

  // Backend uploads
  if (path.startsWith('/uploads/')) path = `/api${path}`;
  const backend = getBackendUrl();
  return backend ? `${backend}${path}` : path;
}

/** True when artwork is available (bundled locally or via CDN/backend). */
export const hasDesignArtwork = true;

/** Deterministic gradient for a theme id — the placeholder used wherever a
 *  design has no artwork yet. */
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

/** Pick the best artwork reference off an API design/theme object. */
export function designImage(obj) {
  if (!obj) return '';
  const ref =
    obj.preview_image ||
    obj.preview ||
    obj.thumbnail ||
    obj.image_url ||
    obj.background_image ||
    obj.cover_image ||
    '';
  return designAsset(ref);
}
