/**
 * Photographer Portfolio -- Background Design System (owner's 9-design brief).
 * Ported verbatim (data unchanged) from
 * frontend/src/data/portfolioDesigns.js -- comments ASCII-ized only.
 *
 * Free (1) x Basic (3) x Premium (5). Each design is a self-contained visual
 * DIRECTION -- exact palette + type + a signature background motif -- that frames
 * the photography without competing with it.
 *
 * Token set (renderer relies on all of these):
 *   bg        page background         surface   card / panel background
 *   ink       primary text            inkSoft   secondary text
 *   line      hairline / border       accent    the one accent colour
 *   accentInk text ON the accent      heading   display font-family (loaded)
 *   body      body font-family        preview   picker gradient chip
 *   depth     true -> 3D scroll motion (premium)
 *   signature background motif key
 *   dark      true -> dark ground (light ink)
 */

const INTER = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const FRAUNCES = "'Fraunces', 'Cormorant Garamond', Georgia, serif";
const PLAYFAIR = "'Playfair Display', 'Cormorant Garamond', Georgia, serif";
const ARCHIVO = "'Archivo Narrow', 'Inter', sans-serif";
const JOST = "'Jost', 'Inter', sans-serif";
const SPACE = "'Space Grotesk', 'Inter', sans-serif";
const ZILLA = "'Zilla Slab', 'Playfair Display', serif";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const LORA = "'Lora', Georgia, serif";

export const PORTFOLIO_DESIGNS = [
  // ------------------------- FREE (1) -- clean, professional -------------------------
  {
    id: 'free_studio_neutral', tier: 'free', name: 'Studio Neutral',
    vibe: 'Clean, neutral, genre-agnostic -- the restraint is the signature.',
    bg: '#FAFAF8', surface: '#FFFFFF', ink: '#1A1A1A', inkSoft: 'rgba(26,26,26,0.60)',
    line: '#E4E2DC', accent: '#8A8578', accentInk: '#FFFFFF',
    heading: INTER, body: INTER, depth: false, dark: false, signature: 'none',
    preview: 'linear-gradient(135deg,#FFFFFF,#EDEBE4)',
  },

  // ------------------------- BASIC (3) -- genre-tuned -------------------------
  {
    id: 'basic_golden_hour', tier: 'basic', name: 'Golden Hour',
    vibe: 'Warm, romantic backdrop for wedding & portrait photographers.',
    bg: '#F7F3EC', surface: '#FFFFFF', ink: '#2B1D18', inkSoft: 'rgba(43,29,24,0.62)',
    line: 'rgba(43,29,24,0.14)', accent: '#C97B4A', accentInk: '#FFFFFF',
    heading: FRAUNCES, body: INTER, depth: false, dark: false, signature: 'sunlight',
    preview: 'linear-gradient(135deg,#F7F3EC,#E6C39B)',
  },
  {
    id: 'basic_darkroom', tier: 'basic', name: 'Monochrome Darkroom',
    vibe: 'Moody gallery-wall darkroom for fine-art & street photographers.',
    bg: '#0F0F0F', surface: 'rgba(255,255,255,0.045)', ink: '#EDEDED', inkSoft: 'rgba(237,237,237,0.55)',
    line: 'rgba(237,237,237,0.16)', accent: '#B8985E', accentInk: '#0F0F0F',
    heading: ARCHIVO, body: INTER, depth: false, dark: true, signature: 'grain',
    preview: 'linear-gradient(135deg,#0F0F0F,#2A2A2A)',
  },
  {
    id: 'basic_nordic', tier: 'basic', name: 'Nordic Light',
    vibe: 'Airy Scandinavian minimalism for landscape / nature / travel.',
    bg: '#F5F6F4', surface: '#FFFFFF', ink: '#3A4A47', inkSoft: 'rgba(58,74,71,0.60)',
    line: '#DCE3DE', accent: '#8FA89C', accentInk: '#FFFFFF',
    heading: JOST, body: JOST, depth: false, dark: false, signature: 'horizon',
    preview: 'linear-gradient(135deg,#F5F6F4,#DCE3DE)',
  },

  // ------------------------- PREMIUM (5) -- bespoke, signature move -------------------------
  {
    id: 'premium_gallery_wall', tier: 'premium', name: 'Gallery Wall',
    vibe: 'Museum-immersive, warm gallery white with a bronze plaque accent.',
    bg: '#EFEDE6', surface: '#FFFFFF', ink: '#141414', inkSoft: 'rgba(20,20,20,0.60)',
    line: '#D9D2C4', accent: '#9C8F7A', accentInk: '#FFFFFF',
    heading: FRAUNCES, body: INTER, depth: true, dark: false, signature: 'gallery',
    preview: 'linear-gradient(135deg,#EFEDE6,#D9D2C4)',
  },
  {
    id: 'premium_film_strip', tier: 'premium', name: 'Film Strip Cinematic',
    vibe: 'Lightbox contact-strip for film & cinematic photographers.',
    bg: '#101010', surface: 'rgba(255,255,255,0.05)', ink: '#E8E4DA', inkSoft: 'rgba(232,228,218,0.58)',
    line: 'rgba(232,228,218,0.16)', accent: '#C1272D', accentInk: '#FFFFFF',
    heading: PLAYFAIR, body: INTER, mono: MONO, depth: true, dark: true, signature: 'filmstrip',
    preview: 'linear-gradient(135deg,#101010,#C1272D)',
  },
  {
    id: 'premium_liquid_glass', tier: 'premium', name: 'Liquid Glass Editorial',
    vibe: 'Fashion-magazine glassmorphism for editorial photographers.',
    bg: '#EDEBE6', surface: 'rgba(255,255,255,0.60)', ink: '#1C1C1E', inkSoft: 'rgba(28,28,30,0.60)',
    line: 'rgba(28,28,30,0.12)', accent: '#B98FA6', accentInk: '#1C1C1E',
    heading: PLAYFAIR, body: INTER, depth: true, dark: false, signature: 'glass',
    preview: 'linear-gradient(135deg,#EDEBE6,#B98FA6)',
  },
  {
    id: 'premium_contact_sheet', tier: 'premium', name: 'Analog Contact Sheet',
    vibe: 'Scanned contact-sheet look for documentary & photojournalism.',
    bg: '#DAD5C8', surface: '#FFFDF8', ink: '#2B2B28', inkSoft: 'rgba(43,43,40,0.62)',
    line: '#8C8776', accent: '#A63B2E', accentInk: '#FFFFFF',
    heading: ZILLA, body: LORA, mono: MONO, depth: true, dark: false, signature: 'contactsheet',
    preview: 'linear-gradient(135deg,#DAD5C8,#B7AE99)',
  },
  {
    id: 'premium_aurora', tier: 'premium', name: 'Aurora Portfolio',
    vibe: 'Living generative gradient field for creative / conceptual work.',
    bg: '#0B0B10', surface: 'rgba(255,255,255,0.05)', ink: '#F1EFEF', inkSoft: 'rgba(241,239,239,0.62)',
    line: 'rgba(241,239,239,0.16)', accent: '#B85C8A', accentInk: '#0B0B10',
    heading: SPACE, body: SPACE, depth: true, dark: true, signature: 'aurora',
    preview: 'linear-gradient(135deg,#5B4B8A,#2E7D6B,#B85C8A)',
  },
  {
    // `layout` USED to name a component that would render the whole public page
    // instead of the shared token renderer. No such component was ever built,
    // and PhotographerPublic reads no `layout` key — so the promise in this
    // entry was the only trace of it, while the page silently rendered as
    // premium_gallery_wall. The key is gone and the description now describes
    // the palette, which is real. An asymmetric-grid layout engine can come
    // back as a separate design when something actually renders it.
    id: 'premium_editorial', tier: 'premium', name: 'Premium Editorial',
    vibe: 'Warm sand and copper with a Cormorant display face -- print-editorial calm.',
    bg: '#F4F1EA', surface: '#EAE5DA', ink: '#171410', inkSoft: 'rgba(23,20,16,0.62)',
    line: 'rgba(23,20,16,0.16)', accent: '#9A6A45', accentInk: '#F4F1EA',
    heading: "'Cormorant Garamond',Georgia,serif",
    body: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    depth: false, dark: false, signature: 'editorial',
    preview: 'linear-gradient(135deg,#F4F1EA,#EAE5DA 55%,#D8B48A)',
  },
];

// Tier -> which design tiers are unlocked (higher tiers include lower ones).
export const TIER_UNLOCKS = {
  normal: ['free'],
  free: ['free'],
  basic: ['free', 'basic'],
  premium: ['free', 'basic', 'premium'],
};

export function designsForTier(tier) {
  const allowed = TIER_UNLOCKS[(tier || 'free').toLowerCase()] || ['free'];
  return PORTFOLIO_DESIGNS.filter((d) => allowed.includes(d.tier));
}

export function getDesign(id) {
  return PORTFOLIO_DESIGNS.find((d) => d.id === id) || null;
}

// The design a studio gets before it picks one -- per plan.
export const DEFAULT_DESIGN_BY_TIER = {
  normal: 'free_studio_neutral',
  free: 'free_studio_neutral',
  basic: 'basic_golden_hour',
  premium: 'premium_gallery_wall',
};

// Always returns a complete design -- the renderer can rely on the tokens.
export function resolveDesign(designId, tier) {
  return getDesign(designId)
    || getDesign(DEFAULT_DESIGN_BY_TIER[(tier || 'free').toLowerCase()])
    || PORTFOLIO_DESIGNS[0];
}

// Exact FREE portfolio feature list (owner spec) -- shown on the Free plan card.
export const FREE_PORTFOLIO_FEATURES = [
  'Hero Section',
  'Photographer / Studio Name',
  'Tagline',
  'Location',
  'Experience',
  'Cover Description',
  'About Us Section',
  'Services Section',
  'Contact Information (Phone, WhatsApp, Instagram)',
  'Availability Status',
  'Standard Portfolio Template',
  'Automatic Portfolio Generation',
  'Mobile Responsive Portfolio',
  'Photo Upload Limit: 500 MB',
];
