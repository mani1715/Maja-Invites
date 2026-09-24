/**
 * MASTER THEMES — 10 Cinematic Cultural Themes
 * Premium B2B SaaS for Indian Wedding Photographers
 * All layouts are locked. Photographers customize accents + content only.
 */

export const MASTER_THEMES = {
  royal_mughal: {
    id: 'royal_mughal',
    name: 'Royal Mughal',
    description: 'Crimson velvet, champagne gold and ivory silk — palace grandeur.',
    category: 'royal',
    culture: 'North Indian · Mughal',
    layoutType: 'classic',
    typography: { heading: '"DM Serif Display", serif', body: '"Cormorant Garamond", serif', accent: '"Cinzel", serif' },
    colors: { primary: '#8B0000', accent: '#D4AF37', background: '#FFF8DC', backgroundVariant: '#F5ECC9', text: '#2F2F2F', textLight: '#6B4423' },
    paletteSwatch: ['#8B0000', '#D4AF37', '#FFF8DC', '#2F2F2F'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'FREE', order: 1, creditCost: 1,
  },
  south_indian_temple: {
    id: 'south_indian_temple',
    name: 'South Indian Temple',
    description: 'Temple gold, deep maroon and parchment — sacred and resplendent.',
    category: 'traditional',
    culture: 'South Indian · Temple',
    layoutType: 'classic',
    typography: { heading: '"Cinzel", serif', body: '"Cormorant Garamond", serif', accent: '"Fraunces", serif' },
    colors: { primary: '#D4AF37', accent: '#420D09', background: '#F5E6BE', backgroundVariant: '#FFFAF0', text: '#3E2723', textLight: '#5D4037' },
    paletteSwatch: ['#D4AF37', '#420D09', '#F5E6BE', '#3E2723'],
    defaultAnimationLevel: 'festive', glassmorphismSupport: true, planRequired: 'FREE', order: 2, creditCost: 1,
  },
  modern_minimal: {
    id: 'modern_minimal',
    name: 'Modern Minimal',
    description: 'Dusty rose, sage and soft sand — quiet, elegant, contemporary.',
    category: 'modern',
    culture: 'Contemporary',
    layoutType: 'minimalist',
    typography: { heading: '"Fraunces", serif', body: '"Manrope", sans-serif', accent: '"DM Serif Display", serif' },
    colors: { primary: '#DCAE96', accent: '#8A9A5B', background: '#F5F5DC', backgroundVariant: '#FAF9F6', text: '#3D2B1F', textLight: '#717171' },
    paletteSwatch: ['#DCAE96', '#8A9A5B', '#F5F5DC', '#3D2B1F'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'SILVER', order: 3, creditCost: 2,
  },
  beach_destination: {
    id: 'beach_destination',
    name: 'Beach Destination',
    description: 'Ocean teal, warm bronze and sunset peach — Goa or Maldives ready.',
    category: 'destination',
    culture: 'Destination · Coastal',
    layoutType: 'modern',
    typography: { heading: '"Fraunces", serif', body: '"Manrope", sans-serif', accent: '"Cormorant Garamond", serif' },
    colors: { primary: '#005F69', accent: '#BFA379', background: '#F2D2BD', backgroundVariant: '#FFF8F2', text: '#0E3540', textLight: '#3A6A77' },
    paletteSwatch: ['#005F69', '#BFA379', '#F2D2BD', '#0E3540'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'SILVER', order: 4, creditCost: 2,
  },
  punjabi_sangeet: {
    id: 'punjabi_sangeet',
    name: 'Punjabi Sangeet',
    description: 'Imperial purple, silver frost and pure white — dholna ready elegance.',
    category: 'festive',
    culture: 'Punjabi · Sangeet',
    layoutType: 'modern',
    typography: { heading: '"DM Serif Display", serif', body: '"Manrope", sans-serif', accent: '"Cinzel", serif' },
    colors: { primary: '#4B0082', accent: '#C0C0C0', background: '#FFFFFF', backgroundVariant: '#F4F1FA', text: '#1A0033', textLight: '#5E4B83' },
    paletteSwatch: ['#4B0082', '#C0C0C0', '#FFFFFF', '#1A0033'],
    defaultAnimationLevel: 'festive', glassmorphismSupport: true, planRequired: 'GOLD', order: 5, creditCost: 3,
  },
  bengali_traditional: {
    id: 'bengali_traditional',
    name: 'Bengali Traditional',
    description: 'Sindoor red, conch-shell white and gold — Tagore-inspired warmth.',
    category: 'traditional',
    culture: 'Bengali · Hindu',
    layoutType: 'classic',
    typography: { heading: '"DM Serif Display", serif', body: '"Cormorant Garamond", serif', accent: '"Fraunces", serif' },
    colors: { primary: '#8B0000', accent: '#D4AF37', background: '#FFFFFF', backgroundVariant: '#FFF8E7', text: '#2C1810', textLight: '#6E0F0F' },
    paletteSwatch: ['#8B0000', '#FFFFFF', '#D4AF37', '#2C1810'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'GOLD', order: 6, creditCost: 3,
  },
  christian_elegant: {
    id: 'christian_elegant',
    name: 'Christian Elegant',
    description: 'Deep mocha, soft sand and dusty rose — chapel-worthy serenity.',
    category: 'elegant',
    culture: 'Christian · Catholic',
    layoutType: 'classic',
    typography: { heading: '"Fraunces", serif', body: '"Manrope", sans-serif', accent: '"Cormorant Garamond", serif' },
    colors: { primary: '#3D2B1F', accent: '#F5F5DC', background: '#FAFAFA', backgroundVariant: '#F5F0EB', text: '#2F2F2F', textLight: '#5A5A5A' },
    paletteSwatch: ['#3D2B1F', '#F5F5DC', '#DCAE96', '#2F2F2F'],
    defaultAnimationLevel: 'none', glassmorphismSupport: true, planRequired: 'GOLD', order: 7, creditCost: 3,
  },
  muslim_nikah: {
    id: 'muslim_nikah',
    name: 'Muslim Nikah',
    description: 'Hunter green, antique gold and ivory — Islamic geometric grace.',
    category: 'traditional',
    culture: 'Muslim · Nikah',
    layoutType: 'classic',
    typography: { heading: '"Cinzel", serif', body: '"Cormorant Garamond", serif', accent: '"Fraunces", serif' },
    colors: { primary: '#355E3B', accent: '#D4AF37', background: '#FFF8DC', backgroundVariant: '#F0F4EE', text: '#1F2E22', textLight: '#4A6650' },
    paletteSwatch: ['#355E3B', '#D4AF37', '#FFF8DC', '#1F2E22'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'GOLD', order: 8, creditCost: 3,
  },
  nature_eco_wedding: {
    id: 'nature_eco_wedding',
    name: 'Nature / Eco Wedding',
    description: 'Forest sage, terracotta and soft sand — sustainable, earthy luxury.',
    category: 'modern',
    culture: 'Eco · Outdoor',
    layoutType: 'minimalist',
    typography: { heading: '"Fraunces", serif', body: '"Manrope", sans-serif', accent: '"DM Serif Display", serif' },
    colors: { primary: '#8A9A5B', accent: '#E97451', background: '#F5F5DC', backgroundVariant: '#FAF9F4', text: '#2D3B1F', textLight: '#5A6F3D' },
    paletteSwatch: ['#8A9A5B', '#E97451', '#F5F5DC', '#2D3B1F'],
    defaultAnimationLevel: 'subtle', glassmorphismSupport: true, planRequired: 'PLATINUM', order: 9, creditCost: 4,
  },
  kerala_backwaters: {
    id: 'kerala_backwaters',
    name: 'Kerala Backwaters',
    description: 'Deep teal water, brass gold and lotus pink — God\u2019s Own Country, gliding.',
    category: 'destination',
    culture: 'South Indian · Backwaters',
    layoutType: 'modern',
    typography: { heading: '"Cormorant Garamond", serif', body: '"Mukta", sans-serif', accent: '"Cinzel", serif' },
    colors: { primary: '#0B3D45', accent: '#D4A24C', background: '#0B3D45', backgroundVariant: '#0E6070', text: '#F5ECD7', textLight: '#E8D9B3' },
    paletteSwatch: ['#0B3D45', '#D4A24C', '#E85A8A', '#F5ECD7'],
    defaultAnimationLevel: 'festive', glassmorphismSupport: true, planRequired: 'PLATINUM', order: 10, creditCost: 5,
  },
};

/* Backward compat: keep old IDs as aliases so existing DB records keep working. */
export const THEME_ID_ALIASES = {
  royal_heritage: 'royal_mughal',
  temple_gold: 'south_indian_temple',
  modern_pastel: 'modern_minimal',
  peacock_dream: 'beach_destination',
  midnight_sangeet: 'punjabi_sangeet',
  modern_lotus: 'bengali_traditional',
  ivory_elegance: 'christian_elegant',
  dark_royal: 'kerala_backwaters',
  bollywood_luxury: 'kerala_backwaters', // Bollywood replaced with Kerala Backwaters
};

export const getThemeById = (themeId) => {
  if (!themeId) return MASTER_THEMES.royal_mughal;
  const resolved = THEME_ID_ALIASES[themeId] || themeId;
  return MASTER_THEMES[resolved] || MASTER_THEMES.royal_mughal;
};

export const getAllThemes = () => Object.values(MASTER_THEMES).sort((a, b) => a.order - b.order);

export const getThemesByCategory = (category) => getAllThemes().filter((t) => t.category === category);

export const getThemesByPlan = (_planType) => {
  // Credit-based access (Feb 2026): every account sees every theme.
  // The legacy FREE/SILVER/GOLD/PLATINUM gating is no longer enforced.
  // `planRequired` is kept on each theme only for backward-compat with
  // existing DB records and is not used for filtering anymore.
  return getAllThemes();
};

export const canUseTheme = (_themeId, _userPlan) => true;

export const getCategoryLabel = (category) => {
  const labels = {
    royal: 'Royal', traditional: 'Traditional', modern: 'Modern', destination: 'Destination',
    festive: 'Festive', elegant: 'Elegant', luxury: 'Luxury',
  };
  return labels[category] || category;
};

export const getPlanLabel = (_plan) => 'Credits';

export const getAnimationVariants = (level) => {
  if (level === 'none') return { hidden: { opacity: 1 }, visible: { opacity: 1 } };
  if (level === 'subtle') return {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  };
  return {
    hidden: { opacity: 0, scale: 0.94, y: 28 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
  };
};
