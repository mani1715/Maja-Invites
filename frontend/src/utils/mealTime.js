/**
 * mealTime.js — small utility to derive a meal label from a "hh:mm" time.
 *
 * The Pricing Hub / Profile Form lets photographers enter a single meal time
 * per event (e.g. "12:30").  We auto-derive a human label (Breakfast, Lunch,
 * Snacks, Dinner) so the invitation banner can render a chip like
 * "🍽 Lunch — 12:30 PM".
 *
 * Bands (24-hour, inclusive on both sides):
 *   06:00 – 10:30  → Breakfast
 *   11:00 – 15:30  → Lunch
 *   15:31 – 18:30  → Snacks / High Tea
 *   18:31 – 23:30  → Dinner
 *   Anything else  → "Meal" (no specific label)
 */
export function classifyMealTime(time) {
  if (!time || typeof time !== 'string') return null;
  // Accept both "HH:MM" and "H:MM AM/PM"
  const cleaned = time.trim().toUpperCase();
  let hh = NaN;
  let mm = 0;
  const ampm = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (ampm) {
    hh = parseInt(ampm[1], 10);
    mm = parseInt(ampm[2], 10);
    if (ampm[3] === 'PM' && hh < 12) hh += 12;
    if (ampm[3] === 'AM' && hh === 12) hh = 0;
  } else {
    return null;
  }
  if (Number.isNaN(hh)) return null;
  const minutes = hh * 60 + mm;
  if (minutes >= 6 * 60 && minutes <= 10 * 60 + 30) return 'Breakfast';
  if (minutes >= 11 * 60 && minutes <= 15 * 60 + 30) return 'Lunch';
  if (minutes >= 15 * 60 + 31 && minutes <= 18 * 60 + 30) return 'Snacks';
  if (minutes >= 18 * 60 + 31 && minutes <= 23 * 60 + 30) return 'Dinner';
  return 'Meal';
}

/** Format "HH:MM" 24h → "h:mm AM/PM" for display. */
export function formatMealTime(time) {
  if (!time || typeof time !== 'string') return '';
  const cleaned = time.trim().toUpperCase();
  // Already AM/PM form?
  if (/AM|PM/.test(cleaned)) return cleaned;
  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return cleaned;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const suffix = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${mm} ${suffix}`;
}

/** Convenience — returns null or {label, displayTime}. */
export function mealChip(time) {
  if (!time) return null;
  const label = classifyMealTime(time);
  if (!label) return null;
  return { label, displayTime: formatMealTime(time) };
}
