// The real wedding design catalogue — 188 designs, 10 collections, 6 ceremonies.
//
// WHERE IT COMES FROM: the legacy app addressed its artwork through
// frontend/src/themes/image-manifest.json, which nothing in this repo could
// use because the images were never carried over. `public/designs/catalogue.json`
// is that manifest rebuilt around the vocabulary this app already speaks —
// the theme ids in lib/designCode.js — so a design code like TMPL-ENG-03 now
// resolves to an actual picture instead of a gradient swatch.
//
// WHAT IS IN GIT AND WHAT IS NOT. Only the 480px WebP variants ship here
// (~8 MB for the whole catalogue), plus the 960px ones for the detail view.
// The 1440px originals and the multi-megabyte source files stay out — that
// tree is ~250 MB and belongs behind a CDN, which is the point
// lib/designAssets.js argues at length. `catalogue.json` only ever names a
// variant that is actually present, because a missing image under Vite does
// NOT 404: the SPA fallback answers 200 with index.html, so a broken <img>
// looks perfectly healthy to any status-code check.
//
// EVERY CARD CAN PAINT BEFORE ANY IMAGE ARRIVES. Each entry carries an inline
// LQIP data-URI, the dominant colour, and true pixel dimensions, so the grid
// reserves the right box and shows a real (blurred) impression of the design
// immediately, rather than reflowing when the artwork lands.

import { encodeDesignCode } from './designCode';

const CDN = (import.meta.env.VITE_DESIGN_CDN || '').replace(/\/+$/, '');

/** Resolve a catalogue path (`/designs/opt/...`).
 *
 *  Deliberately NOT lib/designAssets.designAsset(): that one falls back to the
 *  BACKEND origin, which is right for artwork uploaded through the media
 *  pipeline and wrong for these, which are static files served by the same
 *  origin as the app. Sending them to :8001 would 404 every tile in dev. */
export function catalogueUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:)/i.test(path)) return path;
  return CDN ? `${CDN}${path}` : path;
}

const CEREMONY_LABELS = {
  Engagement: 'Engagement',
  Haldi: 'Haldi',
  Mehandi: 'Mehandi',
  Marriage: 'Marriage',
  Reception: 'Reception',
  Sangeeth: 'Sangeet',
};

const THEME_LABELS = {
  south_indian_temple: 'South Indian Temple',
  royal_mughal: 'Royal Mughal',
  bengali_traditional: 'Bengali Traditional',
  punjabi_sangeet: 'Punjabi Sangeet',
  kerala_backwaters: 'Kerala Backwaters',
  christian_elegant: 'Christian Elegant',
  muslim_nikah: 'Muslim Nikah',
  beach_destination: 'Beach Destination',
  nature_eco_wedding: 'Nature / Eco',
  modern_minimal: 'Modern Minimal',
};

export const themeLabel = (id) => THEME_LABELS[id] || id;
export const ceremonyLabel = (id) => CEREMONY_LABELS[id] || id;

/** Display name. Roughly one design in ten is stored under a content-hash
 *  filename with no human meaning; inventing a name for those would be making
 *  something up, so they take the positional label the design code already
 *  encodes — "Temple Engagement 03" is exactly TMPL-ENG-03. */
export function designName(d) {
  if (!d) return '';
  if (d.slug) return d.slug;
  return `${themeLabel(d.theme)} ${ceremonyLabel(d.ceremony)} ${String(d.index + 1).padStart(2, '0')}`;
}

export const designCode = (d) => (d ? encodeDesignCode(d.theme, d.ceremony, d.index) : null);

/** Stable per-design id, safe in a URL and stable across rebuilds. */
export const designId = (d) => (d ? `${d.theme}__${d.ceremony}__${d.stem}` : '');

let cache = null;
let inflight = null;

/** Load the catalogue once per session. Resolves to [] rather than throwing:
 *  a design grid that cannot reach its manifest should degrade to the themed
 *  placeholder treatment, not blank the page. */
export function loadCatalogue() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(catalogueUrl('/designs/catalogue.json'), { credentials: 'omit' })
    .then((r) => {
      // The Vite/SPA fallback answers 200 with index.html for anything it does
      // not have, so "response.ok" is not evidence. Check the payload shape.
      if (!r.ok) throw new Error(`catalogue ${r.status}`);
      return r.json();
    })
    .then((j) => {
      cache = Array.isArray(j?.designs) ? j.designs : [];
      return cache;
    })
    .catch(() => {
      cache = [];
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Group designs by theme id -> ceremony -> designs[], in catalogue order. */
export function groupByTheme(designs) {
  const out = {};
  for (const d of designs) {
    const t = (out[d.theme] ||= { theme: d.theme, label: themeLabel(d.theme), total: 0, ceremonies: {} });
    (t.ceremonies[d.ceremony] ||= []).push(d);
    t.total += 1;
  }
  return out;
}

export function filterDesigns(designs, { theme, ceremony, q } = {}) {
  const needle = (q || '').trim().toLowerCase();
  return designs.filter((d) => {
    if (theme && d.theme !== theme) return false;
    if (ceremony && d.ceremony !== ceremony) return false;
    if (!needle) return true;
    return [designName(d), designCode(d), themeLabel(d.theme), ceremonyLabel(d.ceremony)]
      .filter(Boolean).some((v) => v.toLowerCase().includes(needle));
  });
}

/** Find the design a distributed code (TMPL-ENG-03) points at. */
export function findByCode(designs, code) {
  const c = String(code || '').trim().toUpperCase();
  return designs.find((d) => designCode(d) === c) || null;
}
