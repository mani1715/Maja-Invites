/**
 * textContrast.js — pick a readable text colour against any background.
 *
 * Used everywhere we render the photographer's names / date / venue
 * on top of a design card so the text "highlights with the background"
 * (dark text on light bg, light text on dark bg).
 */

/** Parse a `#RRGGBB`, `#RGB`, or `rgb(r,g,b)` style colour to {r,g,b}. */
export function parseColor(input) {
  if (!input) return { r: 0, g: 0, b: 0 };
  if (typeof input !== 'string') return { r: 0, g: 0, b: 0 };
  const s = input.trim();
  // rgb / rgba
  const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  }
  // #RGB
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** Perceived luminance 0..255 (ITU-R BT.601). Higher = lighter. */
export function luminance(color) {
  const { r, g, b } = parseColor(color);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Quick boolean — true when the background is "light" (needs dark text). */
export function isLight(color, threshold = 150) {
  return luminance(color) > threshold;
}

/**
 * Pick a text colour with high contrast against `bg`.
 *   Returns one of two well-known choices:
 *     • '#1A0F08' (deep espresso) for light backgrounds
 *     • '#FFF8DC' (cornsilk ivory) for dark backgrounds
 */
export function readableText(bg, { dark = '#1A0F08', light = '#FFF8DC' } = {}) {
  return isLight(bg) ? dark : light;
}

/**
 * A semi-transparent "panel" background that contrasts with `bg`.
 *   Light bg → dark translucent panel.
 *   Dark  bg → light translucent panel.
 */
export function readablePanel(bg, alpha = 0.78) {
  return isLight(bg)
    ? `rgba(20, 14, 8, ${alpha})`
    : `rgba(252, 246, 232, ${alpha})`;
}

/**
 * Pair of (panelBg, textColor) tuned for max legibility on `bg`.
 *
 * Returns:
 *   {
 *     panel:  "rgba(...)",   // backdrop card colour
 *     text:   "#XXXXXX",     // headline / body colour
 *     accent: "#XXXXXX",     // small caption colour (lower contrast)
 *   }
 */
export function readableTextPair(bg, themeAccent = '#D4AF37') {
  const light = isLight(bg);
  return {
    panel: light ? 'rgba(255, 250, 235, 0.92)' : 'rgba(14, 10, 6, 0.78)',
    text:  light ? '#1A0F08' : '#FFF8DC',
    accent: themeAccent,
    muted: light ? 'rgba(40, 26, 16, 0.72)' : 'rgba(255,248,220,0.9)',
    shadow: light
      ? '0 2px 10px rgba(255,255,255,0.55), 0 1px 0 rgba(255,255,255,0.85)'
      : '0 2px 14px rgba(0,0,0,0.65), 0 1px 0 rgba(0,0,0,0.45)',
  };
}
