/* designCode.js — friendly, reversible design codes (no DB).
   code = <THEME4>-<EVENT3>-<NN>  e.g. MUGH-ENG-01
   Maps (themeId, event, index) ⇄ code so the same code a user copies from the
   showcase resolves back to the exact design in the code-search box. */

export const THEME_ABBR = {
  south_indian_temple: 'TMPL',
  royal_mughal: 'MUGH',
  bengali_traditional: 'BENG',
  punjabi_sangeet: 'PUNJ',
  kerala_backwaters: 'KERL',
  christian_elegant: 'CHRS',
  muslim_nikah: 'MSLM',
  beach_destination: 'BEAC',
  nature_eco_wedding: 'NATR',
  modern_minimal: 'MNML',
};

export const EVENT_ABBR = {
  Engagement: 'ENG',
  Haldi: 'HAL',
  Mehandi: 'MEH',
  Marriage: 'MRG',
  Reception: 'REC',
  Sangeeth: 'SNG',
};

const THEME_FROM = Object.fromEntries(Object.entries(THEME_ABBR).map(([k, v]) => [v, k]));
const EVENT_FROM = Object.fromEntries(Object.entries(EVENT_ABBR).map(([k, v]) => [v, k]));

export function encodeDesignCode(themeId, event, index) {
  const t = THEME_ABBR[themeId];
  const e = EVENT_ABBR[event];
  if (!t || !e) return null;
  return `${t}-${e}-${String(index + 1).padStart(2, '0')}`;
}

export function decodeDesignCode(code) {
  const parts = String(code || '').trim().toUpperCase().split('-');
  if (parts.length !== 3) return null;
  const themeId = THEME_FROM[parts[0]];
  const event = EVENT_FROM[parts[1]];
  const index = parseInt(parts[2], 10) - 1;
  if (!themeId || !event || Number.isNaN(index) || index < 0) return null;
  return { themeId, event, index };
}

// self-check: round-trip must be stable
export function _selfTest() {
  const c = encodeDesignCode('royal_mughal', 'Engagement', 0);
  const d = decodeDesignCode(c);
  console.assert(c === 'MUGH-ENG-01', 'encode', c);
  console.assert(d && d.themeId === 'royal_mughal' && d.event === 'Engagement' && d.index === 0, 'decode', d);
}
