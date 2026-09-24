/**
 * SCALABLE THEME SYSTEM - PRODUCTION-READY FOUNDATION
 * 
 * This is the centralized configuration for all invitation themes.
 * Each theme supports dynamic switching and includes visual, structural, 
 * and feature-level properties.
 * 
 * Theme Properties:
 * - themeId: Unique identifier for the theme
 * - name: Display name of the theme
 * - backgroundColor: Primary background color for the theme
 * - accentColors: Array of accent colors for highlights, borders, etc.
 * - hasLord: Whether theme supports religious deity backgrounds
 * - hasGantalu: Whether theme supports temple bells (gantalu) decoration
 * - hasFire: Whether theme supports fire/lamp (diya) elements
 * - colors: Detailed color palette
 * - fonts: Typography configuration
 * - spacing: Layout spacing rules
 * - card: Card styling properties
 * - image: Image styling properties
 */

export const THEME_SYSTEM = {
  // Theme 1: Royal Red
  royal_red: {
    themeId: 'royal_red',
    name: 'Royal Red',
    backgroundColor: '#8B0000',
    accentColors: ['#FFD700', '#FFC700', '#B8860B', '#CD853F'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#8B0000',
      secondary: '#FFD700',
      background: '#8B0000',
      card: '#A52A2A',
      text: '#FFF8DC',
      accent: '#FFC700',
      border: '#B8860B'
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
      border: '2px solid #FFD700',
      radius: '12px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '8px'
    }
  },

  // Theme 2: Temple Gold
  temple_gold: {
    themeId: 'temple_gold',
    name: 'Temple Gold',
    backgroundColor: '#DAA520',
    accentColors: ['#800000', '#FF9933', '#D2691E', '#FFA500'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#800000',
      secondary: '#FF9933',
      background: '#DAA520',
      card: '#F0E68C',
      text: '#3E2723',
      accent: '#D2691E',
      border: '#FFA500'
    },
    fonts: {
      heading: "'Cinzel', serif",
      body: "'Libre Baskerville', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(128, 0, 0, 0.25)',
      border: '2px solid #800000',
      radius: '12px'
    },
    image: {
      border: '4px solid #FF9933',
      radius: '8px'
    }
  },

  // Theme 3: Divine Yellow
  divine_yellow: {
    themeId: 'divine_yellow',
    name: 'Divine Yellow',
    backgroundColor: '#FFD700',
    accentColors: ['#DC143C', '#FF4500', '#FF8C00', '#FFA500'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#DC143C',
      secondary: '#FF4500',
      background: '#FFD700',
      card: '#FFF8DC',
      text: '#8B0000',
      accent: '#FF8C00',
      border: '#FFA500'
    },
    fonts: {
      heading: "'Merriweather', serif",
      body: "'Noto Serif', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(220, 20, 60, 0.2)',
      border: '2px solid #DC143C',
      radius: '12px'
    },
    image: {
      border: '4px solid #FF4500',
      radius: '8px'
    }
  },

  // Theme 4: Sacred Orange
  sacred_orange: {
    themeId: 'sacred_orange',
    name: 'Sacred Orange',
    backgroundColor: '#FF8C00',
    accentColors: ['#800000', '#FFD700', '#8B0000', '#DAA520'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#800000',
      secondary: '#FFD700',
      background: '#FF8C00',
      card: '#FFA500',
      text: '#4A0E0E',
      accent: '#8B0000',
      border: '#DAA520'
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Crimson Text', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(128, 0, 0, 0.3)',
      border: '2px solid #800000',
      radius: '12px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '8px'
    }
  },

  // Theme 5: Lotus Pink
  lotus_pink: {
    themeId: 'lotus_pink',
    name: 'Lotus Pink',
    backgroundColor: '#FFB6C1',
    accentColors: ['#FFD700', '#FFFFFF', '#F0E68C', '#FAFAD2'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#FFB6C1',
      secondary: '#FFD700',
      background: '#FFB6C1',
      card: '#FFE4E1',
      text: '#4A2C2A',
      accent: '#F0E68C',
      border: '#FAFAD2'
    },
    fonts: {
      heading: "'Quicksand', sans-serif",
      body: "'Nunito', sans-serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(255, 215, 0, 0.25)',
      border: '2px solid #FFD700',
      radius: '16px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '12px'
    }
  },

  // Theme 6: Peacock Blue
  peacock_blue: {
    themeId: 'peacock_blue',
    name: 'Peacock Blue',
    backgroundColor: '#4169E1',
    accentColors: ['#FFD700', '#20B2AA', '#4682B4', '#5F9EA0'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#4169E1',
      secondary: '#FFD700',
      background: '#4169E1',
      card: '#6495ED',
      text: '#F0F8FF',
      accent: '#20B2AA',
      border: '#4682B4'
    },
    fonts: {
      heading: "'Spectral', serif",
      body: "'Source Sans Pro', sans-serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
      border: '2px solid #FFD700',
      radius: '12px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '8px'
    }
  },

  // Theme 7: Emerald Green
  emerald_green: {
    themeId: 'emerald_green',
    name: 'Emerald Green',
    backgroundColor: '#50C878',
    accentColors: ['#FFD700', '#FFFACD', '#F5DEB3', '#D4AF37'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#50C878',
      secondary: '#FFD700',
      background: '#50C878',
      card: '#90EE90',
      text: '#1B4D3E',
      accent: '#FFFACD',
      border: '#F5DEB3'
    },
    fonts: {
      heading: "'Josefin Sans', sans-serif",
      body: "'Roboto', sans-serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(255, 215, 0, 0.25)',
      border: '2px solid #FFD700',
      radius: '12px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '8px'
    }
  },

  // Theme 8: Classic Ivory
  classic_ivory: {
    themeId: 'classic_ivory',
    name: 'Classic Ivory',
    backgroundColor: '#FFFFF0',
    accentColors: ['#800000', '#FFD700', '#8B0000', '#B8860B'],
    hasLord: true,
    hasGantalu: true,
    hasFire: true,
    colors: {
      primary: '#800000',
      secondary: '#FFD700',
      background: '#FFFFF0',
      card: '#FAFAF0',
      text: '#3E1F1F',
      accent: '#8B0000',
      border: '#B8860B'
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Georgia', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(128, 0, 0, 0.2)',
      border: '2px solid #800000',
      radius: '12px'
    },
    image: {
      border: '4px solid #FFD700',
      radius: '8px'
    }
  }
};


// ============================================================================
// UTILITY FUNCTIONS - Production-Ready Helper Functions
// ============================================================================

/**
 * Get theme configuration by themeId
 * @param {string} themeId - The unique identifier for the theme
 * @returns {object} Theme configuration object
 */
export const getThemeById = (themeId) => {
  return THEME_SYSTEM[themeId] || THEME_SYSTEM.royal_red;
};

/**
 * Get all available theme IDs
 * @returns {string[]} Array of all theme IDs
 */
export const getAllThemeIds = () => {
  return Object.keys(THEME_SYSTEM);
};

/**
 * Get all themes as an array
 * @returns {object[]} Array of all theme objects
 */
export const getAllThemes = () => {
  return Object.values(THEME_SYSTEM);
};

/**
 * Check if a theme supports lord backgrounds
 * @param {string} themeId - The theme identifier
 * @returns {boolean} True if theme supports lord backgrounds
 */
export const themeSupportsLord = (themeId) => {
  const theme = getThemeById(themeId);
  return theme.hasLord;
};

/**
 * Check if a theme supports gantalu (temple bells)
 * @param {string} themeId - The theme identifier
 * @returns {boolean} True if theme supports gantalu
 */
export const themeSupportsGantalu = (themeId) => {
  const theme = getThemeById(themeId);
  return theme.hasGantalu;
};

/**
 * Check if a theme supports fire/lamp elements
 * @param {string} themeId - The theme identifier
 * @returns {boolean} True if theme supports fire elements
 */
export const themeSupportsFire = (themeId) => {
  const theme = getThemeById(themeId);
  return theme.hasFire;
};

/**
 * Apply theme CSS variables to document root
 * Enables dynamic theme switching without page reload
 * @param {string} themeId - The theme identifier to apply
 */
export const applyTheme = (themeId) => {
  const theme = getThemeById(themeId);
  const root = document.documentElement;
  
  // Apply color variables
  root.style.setProperty('--theme-primary', theme.colors.primary);
  root.style.setProperty('--theme-secondary', theme.colors.secondary);
  root.style.setProperty('--theme-background', theme.colors.background);
  root.style.setProperty('--theme-card', theme.colors.card);
  root.style.setProperty('--theme-text', theme.colors.text);
  root.style.setProperty('--theme-accent', theme.colors.accent);
  root.style.setProperty('--theme-border', theme.colors.border);
  
  // Apply accent colors (for gradients, highlights, etc.)
  theme.accentColors.forEach((color, index) => {
    root.style.setProperty(`--theme-accent-${index + 1}`, color);
  });
  
  // Apply font variables
  root.style.setProperty('--theme-font-heading', theme.fonts.heading);
  root.style.setProperty('--theme-font-body', theme.fonts.body);
  
  // Apply spacing variables
  root.style.setProperty('--theme-spacing-section', theme.spacing.section);
  root.style.setProperty('--theme-spacing-card', theme.spacing.card);
  
  // Apply card styling variables
  root.style.setProperty('--theme-card-shadow', theme.card.shadow);
  root.style.setProperty('--theme-card-border', theme.card.border);
  root.style.setProperty('--theme-card-radius', theme.card.radius);
  
  // Apply image styling variables
  root.style.setProperty('--theme-image-border', theme.image.border);
  root.style.setProperty('--theme-image-radius', theme.image.radius);
  
  // Store current theme ID in data attribute for conditional styling
  root.setAttribute('data-theme-id', themeId);
  
  return theme;
};

/**
 * Get theme features summary
 * @param {string} themeId - The theme identifier
 * @returns {object} Object with boolean flags for all theme features
 */
export const getThemeFeatures = (themeId) => {
  const theme = getThemeById(themeId);
  return {
    hasLord: theme.hasLord,
    hasGantalu: theme.hasGantalu,
    hasFire: theme.hasFire
  };
};

/**
 * Filter themes by feature support
 * @param {object} features - Object with feature flags (e.g., {hasLord: true})
 * @returns {object[]} Array of themes matching the criteria
 */
export const filterThemesByFeatures = (features) => {
  return getAllThemes().filter(theme => {
    return Object.keys(features).every(feature => {
      return theme[feature] === features[feature];
    });
  });
};

/**
 * Get themes that support religious elements (lord, gantalu, fire)
 * @returns {object[]} Array of traditional/religious themes
 */
export const getTraditionalThemes = () => {
  return getAllThemes().filter(theme => 
    theme.hasLord && (theme.hasGantalu || theme.hasFire)
  );
};

/**
 * Get themes that are modern/minimal (no religious elements)
 * @returns {object[]} Array of modern themes
 */
export const getModernThemes = () => {
  return getAllThemes().filter(theme => 
    !theme.hasLord && !theme.hasGantalu && !theme.hasFire
  );
};

/**
 * Validate if a themeId exists in the system
 * @param {string} themeId - The theme identifier to validate
 * @returns {boolean} True if theme exists
 */
export const isValidThemeId = (themeId) => {
  return themeId in THEME_SYSTEM;
};

/**
 * Get accent color by index
 * @param {string} themeId - The theme identifier
 * @param {number} index - Index of accent color (0-based)
 * @returns {string} Hex color code
 */
export const getAccentColor = (themeId, index = 0) => {
  const theme = getThemeById(themeId);
  return theme.accentColors[index] || theme.accentColors[0];
};

/**
 * Get theme background color
 * @param {string} themeId - The theme identifier
 * @returns {string} Background color or gradient
 */
export const getThemeBackground = (themeId) => {
  const theme = getThemeById(themeId);
  return theme.backgroundColor;
};

/**
 * Get theme name for display
 * @param {string} themeId - The theme identifier
 * @returns {string} Human-readable theme name
 */
export const getThemeName = (themeId) => {
  const theme = getThemeById(themeId);
  return theme.name;
};


// ============================================================================
// THEME METADATA - For Admin UI and Documentation
// ============================================================================

export const THEME_METADATA = {
  version: '2.0.0',
  totalThemes: Object.keys(THEME_SYSTEM).length,
  categories: {
    traditional: ['royal_red', 'temple_gold', 'divine_yellow', 'sacred_orange', 'classic_ivory'],
    romantic: ['lotus_pink'],
    vibrant: ['peacock_blue', 'emerald_green']
  },
  defaultTheme: 'royal_red'
};

/**
 * Get theme category
 * @param {string} themeId - The theme identifier
 * @returns {string} Category name or 'uncategorized'
 */
export const getThemeCategory = (themeId) => {
  for (const [category, themes] of Object.entries(THEME_METADATA.categories)) {
    if (themes.includes(themeId)) {
      return category;
    }
  }
  return 'uncategorized';
};

/**
 * Get themes by category
 * @param {string} category - Category name (traditional, modern, romantic, luxury)
 * @returns {object[]} Array of themes in the category
 */
export const getThemesByCategory = (category) => {
  const themeIds = THEME_METADATA.categories[category] || [];
  return themeIds.map(id => getThemeById(id));
};


// Export default for convenient importing
export default {
  THEME_SYSTEM,
  THEME_METADATA,
  getThemeById,
  getAllThemeIds,
  getAllThemes,
  themeSupportsLord,
  themeSupportsGantalu,
  themeSupportsFire,
  applyTheme,
  getThemeFeatures,
  filterThemesByFeatures,
  getTraditionalThemes,
  getModernThemes,
  isValidThemeId,
  getAccentColor,
  getThemeBackground,
  getThemeName,
  getThemeCategory,
  getThemesByCategory
};
