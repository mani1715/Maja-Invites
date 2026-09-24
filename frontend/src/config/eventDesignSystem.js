/**
 * PHASE 15 – EVENT DESIGN & COLOR SYSTEM
 * 
 * 8 Reusable Background Designs for Wedding Events
 * Each design supports multiple Indian wedding color variants
 */

// Indian Wedding Color Palette
export const INDIAN_WEDDING_COLORS = {
  red: {
    primary: '#DC143C',
    secondary: '#8B0000',
    accent: '#FFD700',
    light: '#FFC0CB',
  },
  maroon: {
    primary: '#800000',
    secondary: '#5C0000',
    accent: '#DAA520',
    light: '#BC8F8F',
  },
  yellow: {
    primary: '#FFD700',
    secondary: '#FFA500',
    accent: '#FF6347',
    light: '#FFFACD',
  },
  gold: {
    primary: '#DAA520',
    secondary: '#B8860B',
    accent: '#8B0000',
    light: '#F0E68C',
  },
  orange: {
    primary: '#FF8C00',
    secondary: '#FF6347',
    accent: '#FFD700',
    light: '#FFE4B5',
  },
  cream: {
    primary: '#FFFDD0',
    secondary: '#F5DEB3',
    accent: '#8B4513',
    light: '#FFF8DC',
  },
  pastelPink: {
    primary: '#FFB6C1',
    secondary: '#FF69B4',
    accent: '#FFD700',
    light: '#FFF0F5',
  },
  royalBlue: {
    primary: '#4169E1',
    secondary: '#191970',
    accent: '#FFD700',
    light: '#B0E0E6',
  },
  deepGreen: {
    primary: '#228B22',
    secondary: '#006400',
    accent: '#FFD700',
    light: '#90EE90',
  },
};

// 8 Base Design Types
export const DESIGN_TYPES = {
  ROYAL_TEMPLE: 'royal_temple',
  TRADITIONAL_FLORAL: 'traditional_floral',
  MINIMAL_DIVINE: 'minimal_divine',
  FESTIVE_MARIGOLD: 'festive_marigold',
  ELEGANT_RINGS: 'elegant_rings',
  CLASSIC_RED_WEDDING: 'classic_red_wedding',
  SOFT_PASTEL_CELEBRATION: 'soft_pastel_celebration',
  GRAND_RECEPTION_LUXURY: 'grand_reception_luxury',
};

// Design Configuration
export const EVENT_DESIGNS = {
  // Design 1: Royal Temple
  [DESIGN_TYPES.ROYAL_TEMPLE]: {
    id: 'royal_temple',
    name: 'Royal Temple',
    description: 'Traditional temple architecture with ornate patterns',
    defaultColor: 'maroon',
    allowedColors: ['maroon', 'gold', 'red', 'royalBlue'],
    pattern: 'temple',
    features: {
      hasArchPattern: true,
      hasPillarDesign: true,
      hasOrnateTop: true,
      centerClear: true, // Keep center clear for lord image
    },
    responsive: {
      mobile: { patternScale: 0.8, spacing: 'compact' },
      tablet: { patternScale: 1.0, spacing: 'normal' },
      desktop: { patternScale: 1.2, spacing: 'wide' },
    },
  },

  // Design 2: Traditional Floral
  [DESIGN_TYPES.TRADITIONAL_FLORAL]: {
    id: 'traditional_floral',
    name: 'Traditional Floral',
    description: 'Intricate floral patterns with mandalas',
    defaultColor: 'red',
    allowedColors: ['red', 'orange', 'pastelPink', 'yellow'],
    pattern: 'floral',
    features: {
      hasMandala: true,
      hasFloralBorder: true,
      hasCornerDesign: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.7, spacing: 'compact' },
      tablet: { patternScale: 0.9, spacing: 'normal' },
      desktop: { patternScale: 1.1, spacing: 'wide' },
    },
  },

  // Design 3: Minimal Divine
  [DESIGN_TYPES.MINIMAL_DIVINE]: {
    id: 'minimal_divine',
    name: 'Minimal Divine',
    description: 'Clean lines with subtle religious symbols',
    defaultColor: 'cream',
    allowedColors: ['cream', 'gold', 'pastelPink', 'deepGreen'],
    pattern: 'minimal',
    features: {
      hasSubtleSymbols: true,
      hasCleanLines: true,
      hasMinimalBorder: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.85, spacing: 'comfortable' },
      tablet: { patternScale: 1.0, spacing: 'comfortable' },
      desktop: { patternScale: 1.15, spacing: 'spacious' },
    },
  },

  // Design 4: Festive Marigold
  [DESIGN_TYPES.FESTIVE_MARIGOLD]: {
    id: 'festive_marigold',
    name: 'Festive Marigold',
    description: 'Marigold flower garlands and festive elements',
    defaultColor: 'yellow',
    allowedColors: ['yellow', 'orange', 'gold', 'red'],
    pattern: 'marigold',
    features: {
      hasGarlandPattern: true,
      hasFlowerClusters: true,
      hasFestiveAccents: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.75, spacing: 'compact' },
      tablet: { patternScale: 0.95, spacing: 'normal' },
      desktop: { patternScale: 1.2, spacing: 'wide' },
    },
  },

  // Design 5: Elegant Rings
  [DESIGN_TYPES.ELEGANT_RINGS]: {
    id: 'elegant_rings',
    name: 'Elegant Rings',
    description: 'Wedding rings with elegant swirls',
    defaultColor: 'gold',
    allowedColors: ['gold', 'cream', 'pastelPink', 'yellow'],
    pattern: 'rings',
    features: {
      hasRingMotif: true,
      hasElegantSwirls: true,
      hasRomanticAccents: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.8, spacing: 'comfortable' },
      tablet: { patternScale: 1.0, spacing: 'comfortable' },
      desktop: { patternScale: 1.15, spacing: 'spacious' },
    },
  },

  // Design 6: Classic Red Wedding
  [DESIGN_TYPES.CLASSIC_RED_WEDDING]: {
    id: 'classic_red_wedding',
    name: 'Classic Red Wedding',
    description: 'Classic wedding motifs with paisley patterns',
    defaultColor: 'red',
    allowedColors: ['red', 'maroon', 'gold', 'orange'],
    pattern: 'paisley',
    features: {
      hasPaisleyPattern: true,
      hasTraditionalMotifs: true,
      hasRichBorder: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.7, spacing: 'compact' },
      tablet: { patternScale: 0.9, spacing: 'normal' },
      desktop: { patternScale: 1.1, spacing: 'wide' },
    },
  },

  // Design 7: Soft Pastel Celebration
  [DESIGN_TYPES.SOFT_PASTEL_CELEBRATION]: {
    id: 'soft_pastel_celebration',
    name: 'Soft Pastel Celebration',
    description: 'Gentle patterns with soft florals',
    defaultColor: 'pastelPink',
    allowedColors: ['pastelPink', 'cream', 'yellow', 'gold'],
    pattern: 'soft',
    features: {
      hasSoftFloral: true,
      hasGentleGradient: true,
      hasDelicateAccents: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.85, spacing: 'comfortable' },
      tablet: { patternScale: 1.0, spacing: 'comfortable' },
      desktop: { patternScale: 1.1, spacing: 'spacious' },
    },
  },

  // Design 8: Grand Reception Luxury
  [DESIGN_TYPES.GRAND_RECEPTION_LUXURY]: {
    id: 'grand_reception_luxury',
    name: 'Grand Reception Luxury',
    description: 'Luxurious patterns with geometric elegance',
    defaultColor: 'royalBlue',
    allowedColors: ['royalBlue', 'gold', 'maroon', 'deepGreen'],
    pattern: 'luxury',
    features: {
      hasGeometricPattern: true,
      hasLuxuryAccents: true,
      hasGrandBorder: true,
      centerClear: true,
    },
    responsive: {
      mobile: { patternScale: 0.75, spacing: 'compact' },
      tablet: { patternScale: 0.95, spacing: 'normal' },
      desktop: { patternScale: 1.15, spacing: 'wide' },
    },
  },
};

// Helper Functions

/**
 * Get design configuration by ID
 */
export const getDesignById = (designId) => {
  return EVENT_DESIGNS[designId] || EVENT_DESIGNS[DESIGN_TYPES.ROYAL_TEMPLE];
};

/**
 * Get color palette by color name
 */
export const getColorPalette = (colorName) => {
  return INDIAN_WEDDING_COLORS[colorName] || INDIAN_WEDDING_COLORS.maroon;
};

/**
 * Get all available designs
 */
export const getAllDesigns = () => {
  return Object.values(EVENT_DESIGNS);
};

/**
 * Get allowed colors for a design
 */
export const getAllowedColors = (designId) => {
  const design = getDesignById(designId);
  return design.allowedColors.map(colorName => ({
    name: colorName,
    palette: getColorPalette(colorName),
  }));
};

/**
 * Validate design and color combination
 */
export const isValidDesignColor = (designId, colorName) => {
  const design = getDesignById(designId);
  return design.allowedColors.includes(colorName);
};

/**
 * Get responsive settings for design
 */
export const getResponsiveSettings = (designId, screenSize = 'mobile') => {
  const design = getDesignById(designId);
  return design.responsive[screenSize] || design.responsive.mobile;
};

/**
 * Generate CSS gradient based on color palette
 */
export const generateGradient = (colorPalette, direction = 'to bottom') => {
  return `linear-gradient(${direction}, ${colorPalette.light}, ${colorPalette.primary})`;
};

/**
 * Generate pattern overlay CSS
 */
export const generatePatternOverlay = (patternType, colorPalette, opacity = 0.1) => {
  const patterns = {
    temple: `repeating-linear-gradient(90deg, ${colorPalette.accent}22 0px, transparent 1px, transparent 50px, ${colorPalette.accent}22 51px)`,
    floral: `radial-gradient(circle at 25% 25%, ${colorPalette.primary}15 1%, transparent 50%)`,
    minimal: `linear-gradient(to bottom right, ${colorPalette.light}80, transparent)`,
    marigold: `radial-gradient(circle at 50% 50%, ${colorPalette.primary}20 5%, transparent 20%)`,
    rings: `radial-gradient(circle at center, transparent 40%, ${colorPalette.accent}10 40%, transparent 60%)`,
    paisley: `repeating-linear-gradient(45deg, ${colorPalette.primary}10 0px, transparent 10px, transparent 30px)`,
    soft: `linear-gradient(135deg, ${colorPalette.light}60, ${colorPalette.primary}10)`,
    luxury: `linear-gradient(to right, ${colorPalette.primary}15, transparent 50%, ${colorPalette.accent}15)`,
  };

  return patterns[patternType] || patterns.minimal;
};

// Design Metadata
export const DESIGN_METADATA = {
  version: '1.0.0',
  totalDesigns: 8,
  colorPaletteCount: 9,
  responsive: true,
  lordImageCompatible: true,
};

export default EVENT_DESIGNS;
