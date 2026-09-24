/**
 * Design Themes Configuration
 * 
 * Each theme defines visual styling including:
 * - Colors (primary, secondary, background, text, accent)
 * - Fonts (heading and body font families)
 * - Spacing and layout properties
 */

export const DESIGN_THEMES = [
  {
    id: 'royal_classic',
    name: 'Royal Classic',
    description: 'Elegant maroon and gold with traditional motifs',
    thumbnail: '/assets/designs/royal_classic_thumb.webp',
    preview: '/assets/designs/royal_classic_preview.webp',
    colors: {
      primary: '#8B0000',      // Deep maroon
      secondary: '#FFD700',     // Gold
      background: '#FFF8E7',    // Cream
      text: '#2C1810',          // Dark brown
      accent: '#B8860B',        // Dark goldenrod
      card: '#FFFFFF'           // White cards
    },
    fonts: {
      heading: 'Playfair Display',
      body: 'Lora'
    }
  },
  {
    id: 'floral_soft',
    name: 'Floral Soft',
    description: 'Pastel pink with delicate floral patterns',
    thumbnail: '/assets/designs/floral_soft_thumb.webp',
    preview: '/assets/designs/floral_soft_preview.webp',
    colors: {
      primary: '#FFB6C1',       // Light pink
      secondary: '#FF69B4',     // Hot pink
      background: '#FFF5F7',    // Very light pink
      text: '#4A4A4A',          // Dark gray
      accent: '#FF1493',        // Deep pink
      card: '#FFFFFF'           // White cards
    },
    fonts: {
      heading: 'Cormorant Garamond',
      body: 'Crimson Text'
    }
  },
  {
    id: 'divine_temple',
    name: 'Divine Temple',
    description: 'Warm ivory and gold with sacred temple aesthetics',
    thumbnail: '/assets/designs/divine_temple_thumb.webp',
    preview: '/assets/designs/divine_temple_preview.webp',
    colors: {
      primary: '#D4AF37',       // Gold
      secondary: '#8B4513',     // Saddle brown
      background: '#FFF8DC',    // Cornsilk
      text: '#3E2723',          // Dark brown
      accent: '#CD853F',        // Peru
      card: '#FFFBF0'           // Ivory cards
    },
    fonts: {
      heading: 'Cinzel',
      body: 'Spectral'
    }
  },
  {
    id: 'modern_minimal',
    name: 'Modern Minimal',
    description: 'Clean white and gray with contemporary design',
    thumbnail: '/assets/designs/modern_minimal_thumb.webp',
    preview: '/assets/designs/modern_minimal_preview.webp',
    colors: {
      primary: '#2C3E50',       // Dark blue-gray
      secondary: '#95A5A6',     // Gray
      background: '#FFFFFF',    // White
      text: '#34495E',          // Dark gray
      accent: '#3498DB',        // Blue
      card: '#F8F9FA'           // Very light gray cards
    },
    fonts: {
      heading: 'Montserrat',
      body: 'Open Sans'
    }
  },
  {
    id: 'cinematic_luxury',
    name: 'Cinematic Luxury',
    description: 'Dark gradient with gold accents and premium feel',
    thumbnail: '/assets/designs/cinematic_luxury_thumb.webp',
    preview: '/assets/designs/cinematic_luxury_preview.webp',
    colors: {
      primary: '#1A1A1A',       // Almost black
      secondary: '#DAA520',     // Goldenrod
      background: '#0F0F0F',    // Very dark gray
      text: '#E8E8E8',          // Light gray
      accent: '#FFD700',        // Gold
      card: '#2A2A2A'           // Dark gray cards
    },
    fonts: {
      heading: 'Playfair Display',
      body: 'Raleway'
    }
  }
];

/**
 * Get theme by ID
 * @param {string} themeId - Theme identifier
 * @returns {object|null} Theme configuration or null if not found
 */
export const getTheme = (themeId) => {
  return DESIGN_THEMES.find(theme => theme.id === themeId) || DESIGN_THEMES[0];
};

/**
 * Get all available theme IDs
 * @returns {string[]} Array of theme IDs
 */
export const getThemeIds = () => {
  return DESIGN_THEMES.map(theme => theme.id);
};
