/**
 * Canonical photographer taxonomy — the SINGLE source of truth shared by:
 *   • the photographer panel (what a studio selects), and
 *   • the public "Find Photographers" directory (what couples filter by).
 *
 * They must be the same list on both sides, otherwise a couple could filter by
 * an option no photographer can ever select (and vice-versa), and nothing would
 * ever match. Edit here, both places update.
 */

// "All skills" filter ⇄ the photographer's `styles`. Photography Type.
export const PHOTOGRAPHY_TYPES = [
  'Wedding Photography',
  'Candid Photography',
  'Traditional Photography',
  'Pre-Wedding Photography',
  'Engagement Photography',
  'Maternity Photography',
  'Birthday & Events',
  'Portrait Photography',
  'Fashion Photography',
  'Product Photography',
  'Travel Photography',
  'Wildlife Photography',
  'Drone Photography',
  'Videography',
  'Cinematography',
];

// "All services" filter ⇄ the photographer's `services`.
export const SERVICE_OPTIONS = [
  'Photography',
  'Videography',
  'Drone Coverage',
  'Live Streaming',
  'Album Designing',
  'Photo Editing',
  'Video Editing',
  'Pre-Wedding Shoot',
  'Post-Wedding Shoot',
];

// Experience bands ⇄ the photographer's `experience_years` (integer).
export const EXPERIENCE_BANDS = [
  { label: '0–2 Years', min: 0, max: 2 },
  { label: '3–5 Years', min: 3, max: 5 },
  { label: '6–10 Years', min: 6, max: 10 },
  { label: '10+ Years', min: 10, max: 999 },
];

// Budget bands ⇄ the photographer's `starting_price` (₹). Ranges in rupees.
export const BUDGET_BANDS = [
  { label: 'Budget Friendly', min: 0, max: 50000 },
  { label: 'Standard', min: 50000, max: 100000 },
  { label: 'Premium', min: 100000, max: 250000 },
  { label: 'Luxury', min: 250000, max: 100000000 },
];

// Availability status ⇄ the photographer's `availability_status`.
export const AVAILABILITY_OPTIONS = ['Available', 'Limited Slots', 'Fully Booked'];

// Portfolio type ⇄ the photographer's `portfolio_type` ('studio' | 'individual').
export const PORTFOLIO_TYPE_OPTIONS = [
  { value: 'studio', label: 'Studio' },
  { value: 'individual', label: 'Freelance Photographer' },
];

// Rating bands ⇄ computed review average.
export const RATING_BANDS = [
  { label: '4★ & Above', min: 4 },
  { label: '4.5★ & Above', min: 4.5 },
  { label: '5★ Rated', min: 5 },
];

/* ──────────────────────────────────────────────────────────────────────────
   Matching real saved values against these canonical labels.

   The lists above are what a couple picks from. What photographers actually
   have SAVED is looser — live data shows styles stored as "Candid", "Drone",
   "Cinematic" and services as "Wedding Photography", "Reception Coverage",
   "Pre-Wedding Shoots". A strict `stored === selected` comparison therefore
   matched nothing: picking "Candid Photography" could never find a studio that
   saved "Candid", so category search returned an empty page.

   `taxonKey()` compares on meaning instead of spelling: it drops the generic
   trade words that carry no distinction ("photography", "shoot", "coverage"…)
   and compares the remaining word set.
       "Candid Photography"  → candid          ⇄ "Candid"            ✓
       "Drone Coverage"      → drone           ⇄ "Drone"             ✓
       "Pre-Wedding Shoot"   → pre|wedding     ⇄ "Pre-Wedding Shoots" ✓
       "Wedding Photography" → wedding         ⇄ "Wedding Videography"
                                                 (wedding|videography) ✗ — stays
                                                 distinct, as it must.
   ────────────────────────────────────────────────────────────────────────── */
const GENERIC_TAXON_WORDS = new Set([
  'photography', 'photographs', 'photograph', 'photos', 'photo', 'photographer',
  'shoot', 'shoots', 'shooting', 'coverage', 'cover', 'services', 'service',
  'films', 'film', 'and', '&', 'the', 'of',
]);

// Same trade, different word — folded so a couple's pick still finds the studio.
const TAXON_SYNONYMS = {
  cinematic: 'cinematography', cinema: 'cinematography',
  video: 'videography', videos: 'videography',
  candids: 'candid', drones: 'drone', portraits: 'portrait',
  prewedding: 'pre|wedding',
};

export function taxonKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !GENERIC_TAXON_WORDS.has(w))
    .map((w) => TAXON_SYNONYMS[w] || w)
    .join(' ')
    .split(/[ |]+/)
    .filter(Boolean)
    .sort()
    .join('|');
}

/** True when a saved value means the same thing as the selected filter. */
export function taxonMatches(savedValue, selected) {
  if (!selected) return true;
  const a = taxonKey(savedValue);
  const b = taxonKey(selected);
  return !!a && !!b && a === b;
}

/**
 * Options for a filter dropdown: the canonical list PLUS anything photographers
 * have actually saved (from the API facets), deduped by meaning. Without the
 * facets, a real saved value like "Reception Coverage" would exist in profiles
 * but be unselectable — invisible inventory.
 */
export function mergeTaxonOptions(canonical = [], facetValues = []) {
  const out = [];
  const seen = new Set();
  for (const v of [...canonical, ...facetValues]) {
    const k = taxonKey(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/* ── Booking facts couples ask before enquiring (portfolio "Booking" block) ── */
export const TRAVEL_POLICY_OPTIONS = [
  'Travel included within my city',
  'Travel charged extra',
  'Destination weddings welcome',
  'No outstation travel',
];
export const PAYMENT_MODE_OPTIONS = ['UPI', 'Bank Transfer', 'Card', 'Cash', 'Cheque'];
export const SHOOT_TYPE_OPTIONS = ['Indoor', 'Outdoor', 'Studio', 'Destination', 'Temple / Venue'];
export const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Interfaith'];
export const ADD_ON_OPTIONS = [
  'Printed album', 'Same-day edit', 'Live streaming', 'Drone', 'Photo booth',
  'Pre-wedding shoot', 'Save-the-date film', 'Teaser reel', 'Makeup coordination',
];
