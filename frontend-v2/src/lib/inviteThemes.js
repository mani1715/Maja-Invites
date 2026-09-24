/**
 * The ten master themes, as CSS custom properties the invitation renders from.
 *
 * WHY THIS EXISTS
 * The catalogue sells 188 designs grouped into these ten themes, the backend
 * stores the choice on the profile and returns it as `design_id` on
 * `/api/invite/{slug}/full` — and the guest invitation never read it. Every
 * published invitation rendered in the same purple "night" palette no matter
 * which design the couple paid for. The legacy app resolved the same field
 * (`data.design_id || data.design_theme || 'royal_mughal'`) and themed the whole
 * page from it; that is the behaviour restored here.
 *
 * WHAT THIS IS NOT
 * Not a port of `frontend/src/themes/masterThemes.js`. That file is a bag of
 * nested objects a component reads at render time; this is a flat token map the
 * stylesheet consumes, which is how frontend-v2 already themes everything else.
 * The palettes, fonts and names are the product's, so those carry over exactly —
 * inventing new colours would silently change what customers already bought.
 *
 * EVERY TOKEN HAS A FALLBACK. `themeVars()` returns only what a theme defines;
 * the CSS keeps the current values as its defaults, so an unknown or missing
 * `design_id` renders exactly as it does today rather than as an unstyled page.
 */

// `mode` drives the two things a palette cannot express on its own: whether the
// page reads as a dark canvas with light ink (`night`) or a light one with dark
// ink (`day`). It decides the glass and scrim treatment, nothing else.
export const INVITE_THEMES = {
  royal_mughal: {
    id: 'royal_mughal',
    name: 'Royal Mughal',
    culture: 'North Indian · Mughal',
    blurb: 'Crimson velvet, champagne gold and ivory silk — palace grandeur.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#8B0000', accent: '#D4AF37', bg: '#FFF8DC', bgAlt: '#F5ECC9', ink: '#2F2F2F', inkSoft: '#6B4423' },
    fonts: { display: '"DM Serif Display", Spectral, serif', body: '"Cormorant Garamond", Spectral, serif' },
  },
  south_indian_temple: {
    id: 'south_indian_temple',
    name: 'South Indian Temple',
    culture: 'South Indian · Temple',
    blurb: 'Temple gold, deep maroon and parchment — sacred and resplendent.',
    mode: 'day',
    motion: 'festive',
    colors: { primary: '#D4AF37', accent: '#420D09', bg: '#F5E6BE', bgAlt: '#FFFAF0', ink: '#3E2723', inkSoft: '#5D4037' },
    fonts: { display: 'Cinzel, Spectral, serif', body: '"Cormorant Garamond", Spectral, serif' },
  },
  modern_minimal: {
    id: 'modern_minimal',
    name: 'Modern Minimal',
    culture: 'Contemporary',
    blurb: 'Dusty rose, sage and soft sand — quiet, elegant, contemporary.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#DCAE96', accent: '#8A9A5B', bg: '#F5F5DC', bgAlt: '#FAF9F6', ink: '#3D2B1F', inkSoft: '#717171' },
    fonts: { display: 'Fraunces, Spectral, serif', body: 'Manrope, Inter, sans-serif' },
  },
  beach_destination: {
    id: 'beach_destination',
    name: 'Beach Destination',
    culture: 'Destination · Coastal',
    blurb: 'Ocean teal, warm bronze and sunset peach — Goa or Maldives ready.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#005F69', accent: '#BFA379', bg: '#F2D2BD', bgAlt: '#FFF8F2', ink: '#0E3540', inkSoft: '#3A6A77' },
    fonts: { display: 'Fraunces, Spectral, serif', body: 'Manrope, Inter, sans-serif' },
  },
  punjabi_sangeet: {
    id: 'punjabi_sangeet',
    name: 'Punjabi Sangeet',
    culture: 'Punjabi · Sangeet',
    blurb: 'Imperial purple, silver frost and pure white — dholna-ready elegance.',
    mode: 'day',
    motion: 'festive',
    colors: { primary: '#4B0082', accent: '#C0C0C0', bg: '#FFFFFF', bgAlt: '#F4F1FA', ink: '#1A0033', inkSoft: '#5E4B83' },
    fonts: { display: '"DM Serif Display", Spectral, serif', body: 'Manrope, Inter, sans-serif' },
  },
  bengali_traditional: {
    id: 'bengali_traditional',
    name: 'Bengali Traditional',
    culture: 'Bengali · Hindu',
    blurb: 'Sindoor red, conch-shell white and gold — Tagore-inspired warmth.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#8B0000', accent: '#D4AF37', bg: '#FFFFFF', bgAlt: '#FFF8E7', ink: '#2C1810', inkSoft: '#6E0F0F' },
    fonts: { display: '"DM Serif Display", Spectral, serif', body: '"Cormorant Garamond", Spectral, serif' },
  },
  christian_elegant: {
    id: 'christian_elegant',
    name: 'Christian Elegant',
    culture: 'Christian · Catholic',
    blurb: 'Deep mocha, soft sand and dusty rose — chapel-worthy serenity.',
    mode: 'day',
    motion: 'none',
    colors: { primary: '#3D2B1F', accent: '#B08968', bg: '#FAFAFA', bgAlt: '#F5F0EB', ink: '#2F2F2F', inkSoft: '#5A5A5A' },
    fonts: { display: 'Fraunces, Spectral, serif', body: 'Manrope, Inter, sans-serif' },
  },
  muslim_nikah: {
    id: 'muslim_nikah',
    name: 'Muslim Nikah',
    culture: 'Muslim · Nikah',
    blurb: 'Hunter green, antique gold and ivory — Islamic geometric grace.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#355E3B', accent: '#D4AF37', bg: '#FFF8DC', bgAlt: '#F0F4EE', ink: '#1F2E22', inkSoft: '#4A6650' },
    fonts: { display: 'Cinzel, Spectral, serif', body: '"Cormorant Garamond", Spectral, serif' },
  },
  nature_eco_wedding: {
    id: 'nature_eco_wedding',
    name: 'Nature / Eco Wedding',
    culture: 'Eco · Outdoor',
    blurb: 'Forest sage, terracotta and soft sand — sustainable, earthy luxury.',
    mode: 'day',
    motion: 'subtle',
    colors: { primary: '#8A9A5B', accent: '#E97451', bg: '#F5F5DC', bgAlt: '#FAF9F4', ink: '#2D3B1F', inkSoft: '#5A6F3D' },
    fonts: { display: 'Fraunces, Spectral, serif', body: 'Manrope, Inter, sans-serif' },
  },
  kerala_backwaters: {
    id: 'kerala_backwaters',
    name: 'Kerala Backwaters',
    culture: 'South Indian · Backwaters',
    blurb: 'Deep teal water, brass gold and lotus pink — God’s Own Country, gliding.',
    // The only palette written as a dark canvas: its background IS the deep
    // teal, so light ink on it is the design, not an inversion of it.
    mode: 'night',
    motion: 'festive',
    colors: { primary: '#0B3D45', accent: '#D4A24C', bg: '#0B3D45', bgAlt: '#0E6070', ink: '#F5ECD7', inkSoft: '#E8D9B3' },
    fonts: { display: '"Cormorant Garamond", Spectral, serif', body: 'Mukta, Inter, sans-serif' },
  },
};

export const INVITE_THEME_IDS = Object.keys(INVITE_THEMES);

// What the app rendered before any of this existed. An invitation with no
// design, or one naming a theme we do not know, keeps exactly that look rather
// than falling back to a different couple's palette.
export const HOUSE_THEME = {
  id: 'house',
  name: 'MAJA House',
  culture: '',
  blurb: '',
  mode: 'night',
  motion: 'subtle',
  colors: { primary: '#6D28D9', accent: '#E5A93C', bg: '#190F33', bgAlt: '#241448', ink: '#F6F3FF', inkSoft: '#C4B5FD' },
  fonts: { display: 'Spectral, serif', body: 'Inter, sans-serif' },
};

/** #RRGGBB -> "r, g, b" so a token can be used inside rgba(). */
function rgbTriplet(hex) {
  const h = String(hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return '109, 40, 217';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * The theme an invitation should render in.
 *
 * Accepts the whole `invite` object or a bare id. Field order matches the
 * legacy resolver so an invitation themed one way before is themed the same way
 * now: `design_id`, then `design_theme`, then the design key.
 *
 * A design id from the catalogue (e.g. a 188-design code) is not a theme id, so
 * an unrecognised value falls through to the house theme rather than guessing.
 */
export function resolveInviteTheme(inviteOrId) {
  const raw = typeof inviteOrId === 'string'
    ? inviteOrId
    : (inviteOrId?.design_id || inviteOrId?.design_theme
       || inviteOrId?.selected_design_key || inviteOrId?.theme_id);
  if (!raw) return HOUSE_THEME;
  const key = String(raw).trim().toLowerCase();
  return INVITE_THEMES[key] || HOUSE_THEME;
}

/**
 * Inline style object of the theme's custom properties.
 *
 * Spread onto the invitation's root element. The stylesheet declares the
 * current (house) values as fallbacks in every `var()`, so a partial theme —
 * or none — degrades to today's rendering instead of to nothing.
 */
export function themeVars(theme) {
  const t = theme || HOUSE_THEME;
  const c = t.colors || {};
  return {
    '--inv-primary': c.primary,
    '--inv-primary-rgb': rgbTriplet(c.primary),
    '--inv-accent': c.accent,
    '--inv-accent-rgb': rgbTriplet(c.accent),
    '--inv-bg': c.bg,
    '--inv-bg-rgb': rgbTriplet(c.bg),
    '--inv-bg-alt': c.bgAlt,
    '--inv-bg-alt-rgb': rgbTriplet(c.bgAlt),
    '--inv-ink': c.ink,
    '--inv-ink-rgb': rgbTriplet(c.ink),
    '--inv-ink-soft': c.inkSoft,
    '--inv-font-display': t.fonts?.display,
    '--inv-font-body': t.fonts?.body,
  };
}

/** Attributes for the invitation root: theme id + light/dark treatment. */
export function themeAttrs(theme) {
  const t = theme || HOUSE_THEME;
  return { 'data-inv-theme': t.id, 'data-inv-mode': t.mode, 'data-inv-motion': t.motion };
}
