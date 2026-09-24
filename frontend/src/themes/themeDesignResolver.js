/**
 * themeDesignResolver — resolves a (themeId, event, optional designIndex)
 * triple into a concrete design entry + theme tokens that
 * UniversalDesignRenderer / KeralaDesignRenderer can consume.
 *
 * Used by the public-facing invitation so wedding guests actually SEE
 * the 180 animated invitation designs shipped in this codebase.
 *
 * Inputs:
 *   • themeId — the masterThemes ID stored on the wedding profile
 *               (or one of THEME_ID_ALIASES legacy IDs)
 *   • event   — one of EVENTS (Engagement|Haldi|Mehandi|Marriage|Reception|Sangeeth)
 *               OR an event_type string from the backend (engagement, haldi,
 *               mehendi, marriage, reception, sangeet) — we normalise.
 *   • designIndex — 0..2 — which of the 3 design variants to use.
 *                   Defaults to 0 (first design).
 *
 * Returns: { theme, design, event } or null when no match.
 */
import { ALL_DESIGNS, EVENTS, hasThemeLoader, useThemeDesigns } from './allDesigns';
import { KERALA_DESIGNS } from './kerala_backwaters/kerala.designs';
import { KERALA_COLORS } from './kerala_backwaters/kerala.colors';
import { THEME_ID_ALIASES } from './masterThemes';

const KERALA_TOKENS = {
  background: KERALA_COLORS.water,
  accent: KERALA_COLORS.secondary,           // brass/temple gold
  accentGold: KERALA_COLORS.secondary,
  text: KERALA_COLORS.text,
  heading: '"Cormorant Garamond", serif',
  leaf: KERALA_COLORS.bananaLeaf,
  particle: KERALA_COLORS.particle,
  lotusPink: KERALA_COLORS.lotus,
  waterHighlight: KERALA_COLORS.waterHighlight,
  wash: 'linear-gradient(180deg, rgba(0,10,15,0.40) 0%, rgba(0,10,15,0.08) 40%, rgba(0,10,15,0.55) 100%)',
  textBackdrop: 'rgba(5,40,45,0.55)',
  imageOpacity: 0.94,
};

/** Smart page background — keeps the area surrounding a design card
 *  visually contiguous with the design's actual artwork tone.
 *
 *  Most theme tokens.background values are cream (because the master
 *  theme catalogue is cream-by-default). But several designs use dark
 *  night-time photographs (Punjabi Sangeet, Marriage at night, etc.).
 *  On those, the cream page bg created a jarring border around a black
 *  card.  We infer "this image is dark" from the design's `textColor`
 *  (light text = dark photo) and fall back to a near-black page bg in
 *  that case, so the card flows out to the edges seamlessly. */
export function pageBgForDesign(design, theme) {
  const fallback = theme?.tokens?.background || '#FDF2D6';
  if (!design) return fallback;
  const tc = String(design.textColor || '').toUpperCase();
  const isLightText = tc === '#F5ECD7' || tc === '#FFF8DC' || tc === '#FFF8E8';
  // Explicit dark design.bg wins
  if (design.bg && /^#[0-2]/.test(design.bg)) return design.bg;
  if (isLightText) return '#0E0905';
  return design.bg || fallback;
}


const EVENT_NORMALISE = {
  engagement: 'Engagement',
  haldi:      'Haldi',
  mehendi:    'Mehandi',   // backend spells it "mehendi", catalogue is "Mehandi"
  mehandi:    'Mehandi',
  marriage:   'Marriage',
  wedding:    'Marriage',
  reception:  'Reception',
  sangeet:    'Sangeeth',
  sangeeth:   'Sangeeth',
};

export const normaliseEvent = (event) => {
  if (!event) return 'Marriage';
  if (EVENTS.includes(event)) return event;
  return EVENT_NORMALISE[String(event).toLowerCase()] || 'Marriage';
};

export const resolveThemeId = (themeId) => {
  if (!themeId) return 'royal_mughal';
  return THEME_ID_ALIASES[themeId] || themeId;
};

/**
 * useResolvedThemeDesigns — loads the ONE catalogue chunk that `resolveDesign`
 * / `resolveHeroDesign` / `findDesignById` will read for `themeId`, and
 * re-renders the caller when it lands.
 *
 * Every component that calls those three MUST call this too. They read the
 * `ALL_DESIGNS` cache synchronously and return `null` on a miss, so before this
 * existed they only worked because a module-level idle preload of all 9 themes
 * happened to have finished first — a race that also cost every route 9 chunks.
 *
 * Safe to call with a not-yet-fetched id (`undefined`/`null` = no-op), so it can
 * sit above the component's early returns and pick the theme up on a later render.
 */
export const useResolvedThemeDesigns = (themeId) => {
  const resolved = themeId ? resolveThemeId(themeId) : null;
  // Kerala is statically imported below, and `resolveDesign` falls back to
  // royal_mughal for any id with no catalogue of its own — so load the chunk
  // that will actually be read, not one that can never resolve.
  const target = !resolved || resolved === 'kerala_backwaters'
    ? null
    : (hasThemeLoader(resolved) ? resolved : 'royal_mughal');
  return useThemeDesigns(target);
};

/**
 * Resolve a (themeId, event, designIndex) → { theme, design, event }.
 * Falls back gracefully when entries are missing.
 */
export const resolveDesign = (themeId, event, designIndex = 0) => {
  const resolvedTheme = resolveThemeId(themeId);
  const evt = normaliseEvent(event);

  // Kerala lives in its own catalogue
  if (resolvedTheme === 'kerala_backwaters') {
    const list = KERALA_DESIGNS[evt] || KERALA_DESIGNS.Marriage || [];
    const design = list[designIndex] || list[0];
    if (!design) return null;
    return {
      theme: { tokens: KERALA_TOKENS, motionKey: 'kerala_backwaters' },
      design,
      event: evt,
    };
  }

  // All other themes come from allDesigns.js
  const entry = ALL_DESIGNS[resolvedTheme];
  if (!entry) {
    // Theme not in the new design catalogue — fall back to royal_mughal
    const fb = ALL_DESIGNS.royal_mughal;
    if (!fb) return null;
    const list = fb.events[evt] || fb.events.Marriage || [];
    return {
      theme: { tokens: fb.tokens, motionKey: 'royal_mughal' },
      design: list[designIndex] || list[0],
      event: evt,
    };
  }

  const list = entry.events[evt] || entry.events.Marriage || [];
  const design = list[designIndex] || list[0];
  if (!design) return null;

  return {
    theme: { tokens: entry.tokens, motionKey: resolvedTheme },
    design,
    event: evt,
  };
};

/**
 * Resolve the "hero" design for a wedding — i.e. the marquee design used
 * on the main public invitation page. Picks the Marriage design (variant 0)
 * unless overrides are present on the profile.
 */
export const resolveHeroDesign = (themeId, designSelections = {}) => {
  // designSelections is a future-proof map: { Marriage: 'temple_marriage_2', ... }
  // If the caller supplies a string, treat it as a specific design id.
  const override = designSelections.Marriage || designSelections.hero;
  if (override) {
    const found = findDesignById(themeId, override);
    if (found) return found;
  }
  return resolveDesign(themeId, 'Marriage', 0);
};

/** Lookup a design by its id across all themes / Kerala catalogue. */
export const findDesignById = (themeId, designId) => {
  if (!designId) return null;
  const resolved = resolveThemeId(themeId);

  if (resolved === 'kerala_backwaters') {
    for (const evt of Object.keys(KERALA_DESIGNS)) {
      const d = KERALA_DESIGNS[evt].find((x) => x.id === designId);
      if (d) return { theme: { tokens: KERALA_TOKENS, motionKey: 'kerala_backwaters' }, design: d, event: evt };
    }
    return null;
  }

  const entry = ALL_DESIGNS[resolved];
  if (!entry) return null;
  for (const evt of Object.keys(entry.events)) {
    const d = entry.events[evt].find((x) => x.id === designId);
    if (d) return { theme: { tokens: entry.tokens, motionKey: resolved }, design: d, event: evt };
  }
  return null;
};
