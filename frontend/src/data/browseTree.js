/* ──────────────────────────────────────────────────────────────────────────
   browseTree.js — the master category taxonomy for the home drill-down.

   SINGLE SOURCE OF TRUTH: real designs are NEVER copied into this file. The
   Wedding branch is generated as  Style → Event → gallery  where each gallery
   node only points at a (themeId, event); the actual design cards (id, image,
   title, metadata) are loaded at render time from the theme configs
   (src/themes/configs/*). So every design appears in exactly one place, nothing
   is duplicated, and adding designs to a theme config needs no change here.

   Node shapes:
     { slug, label, children:[...] }              → a category (drill deeper)
     { slug, label, gallery:{themeId,event}, … }  → a leaf that opens a real
                                                     gallery of that event's designs
     { slug, label, comingSoon:true }             → a category with no designs yet
     { slug, label, eventTemplates:'<event_type>'}→ a leaf that opens the Dynamic Event
                                                     Engine's approved templates for that
                                                     event type (e.g. ganesh_chaturthi),
                                                     loaded from /api/events/templates/*
     { slug, label, design:{themeId,event,index} }→ (legacy) single-design leaf
   ────────────────────────────────────────────────────────────────────────── */

// Canonical events (mirrors EVENTS in src/themes/allDesigns.js).
const EVENTS = ['Engagement', 'Haldi', 'Mehandi', 'Marriage', 'Reception', 'Sangeeth'];

// The 10 real "styles" = the 10 built theme configs. religion/region are
// style-level metadata used for filtering/SEO (designs themselves carry none).
const WEDDING_STYLES = [
  { label: 'Temple',    themeId: 'south_indian_temple', religion: 'Hindu',     region: 'South India' },
  { label: 'Mughal',    themeId: 'royal_mughal',        religion: 'Hindu',     region: 'North India' },
  { label: 'Bengali',   themeId: 'bengali_traditional', religion: 'Hindu',     region: 'East India' },
  { label: 'Punjabi',   themeId: 'punjabi_sangeet',     religion: 'Sikh',      region: 'North India' },
  { label: 'Kerala',    themeId: 'kerala_backwaters',   religion: 'Hindu',     region: 'Kerala' },
  { label: 'Christian', themeId: 'christian_elegant',   religion: 'Christian', region: 'Pan-India' },
  { label: 'Muslim',    themeId: 'muslim_nikah',        religion: 'Muslim',    region: 'Pan-India' },
  { label: 'Beach',     themeId: 'beach_destination',   religion: 'Any',       region: 'Coastal' },
  { label: 'Nature',    themeId: 'nature_eco_wedding',  religion: 'Any',       region: 'Pan-India' },
  { label: 'Minimal',   themeId: 'modern_minimal',      religion: 'Any',       region: 'Pan-India' },
];

// Aspirational styles the user wants visible but for which no theme exists yet.
// Listed as Coming Soon so they are NOT aliases of real themes (no duplication).
const WEDDING_SOON_STYLES = ['Traditional', 'Royal', 'Luxury', 'Floral', 'Destination', 'Modern'];

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── node helpers ──
const cat = (label, children) => ({ slug: slugify(label), label, children });
const soon = (label) => ({ slug: slugify(label), label, comingSoon: true });
const gallery = (label, themeId, event, meta = {}) => ({
  slug: slugify(label), label, gallery: { themeId, event }, ...meta,
});
// A live leaf backed by the Dynamic Event Engine's template catalog (approved designs
// served from /api/events/templates/<eventType>). Reuses that single source of truth —
// no artwork is copied into this file.
const eventGallery = (label, eventType, meta = {}) => ({
  slug: slugify(label), label, eventTemplates: eventType, ...meta,
});

// One style → its 6 event galleries (each loads that theme+event's real designs).
const styleNode = (s) =>
  cat(s.label, EVENTS.map((ev) =>
    gallery(ev, s.themeId, ev, { style: s.label, religion: s.religion, region: s.region })));

/* ── WEDDING — the real design library (Style → Event → gallery) ─────────── */
const wedding = cat('Wedding', [
  ...WEDDING_STYLES.map(styleNode),
  ...WEDDING_SOON_STYLES.map(soon),
]);

/* ── OCCASIONS ───────────────────────────────────────────────────────────── */
const occasions = cat('Occasions', [
  soon('Birthday'),
  soon('Anniversary'),
  soon('Engagement Party'),
]);

/* ── TRADITIONAL CEREMONIES ──────────────────────────────────────────────── */
const traditionalCeremonies = cat('Traditional Ceremonies', [
  soon('Half Saree Ceremony'),
  soon('Puberty Ceremony'),
  soon('Dhoti Ceremony'),
  soon('Baby Shower'),
  soon('Naming Ceremony'),
  soon('Annaprashan'),
  soon('Cradle Ceremony'),
]);

/* ── HOUSEWARMING ────────────────────────────────────────────────────────── */
const housewarming = cat('Housewarming', [
  soon('Gruhapravesam'),
  soon('Vastu Puja'),
  soon('Satyanarayana Puja'),
]);

/* ── RELIGIOUS ───────────────────────────────────────────────────────────── */
const religious = cat('Religious', [
  soon('Tirupati'),
  eventGallery('Ganesh', 'ganesh_chaturthi'),   // LIVE — Ganesh Chaturthi templates
  soon('Lakshmi'),
  soon('Shiva'),
]);

/* ── CURATED COLLECTIONS — Coming Soon so they never DUPLICATE wedding art ── */
const luxuryCollection = cat('Luxury Collection', [
  soon('Mughal Royal'), soon('Rajput Royal'), soon('Palace Luxury'), soon('Editorial Luxury'),
]);
const modernCollection = cat('Modern Collection', [
  soon('Scandinavian'), soon('Editorial'), soon('Botanical'), soon('Contemporary'),
]);

/* ── LOVE ────────────────────────────────────────────────────────────────── */
const love = cat('Love', [
  cat("Valentine's Day", [soon('Floral'), soon('Luxury'), soon('Modern')]),
]);

/* ── ROOTS (home shows these first) ──────────────────────────────────────── */
export const BROWSE_ROOTS = [
  wedding,
  occasions,
  traditionalCeremonies,
  housewarming,
  religious,
  luxuryCollection,
  modernCollection,
  love,
];

/** Walk the tree by an array of slugs. Returns { node, trail } or null. */
export function resolveBrowsePath(segments) {
  const trail = [];
  let level = BROWSE_ROOTS;
  let node = null;
  for (const seg of segments) {
    node = (level || []).find((n) => n.slug === seg);
    if (!node) return null;
    trail.push(node);
    level = node.children;
  }
  return { node, trail };
}
