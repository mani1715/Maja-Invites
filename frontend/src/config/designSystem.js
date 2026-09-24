/**
 * PHASE 22: Premium Background Design System - Frontend Configuration
 * 
 * This file contains the design registry and utilities for the event-wise
 * background and design engine system.
 */

// Design Type Definitions
export const BACKGROUND_TYPES = {
  CSS: 'css',
  IMAGE: 'image',
  HYBRID: 'hybrid'
};

// Event Types
export const EVENT_TYPES = {
  ENGAGEMENT: 'engagement',
  HALDI: 'haldi',
  MEHENDI: 'mehendi',
  MARRIAGE: 'marriage',
  RECEPTION: 'reception'
};

/**
 * Design Registry - 8 Premium Designs
 * Matches backend design_registry.py configuration
 */
export const DESIGN_REGISTRY = [
  {
    design_id: 'design_1',
    name: 'Royal Temple Gold',
    description: 'Traditional temple theme with golden accents',
    event_types: [EVENT_TYPES.ENGAGEMENT, EVENT_TYPES.MARRIAGE, EVENT_TYPES.RECEPTION],
    supports_lord: true,
    background_type: BACKGROUND_TYPES.HYBRID,
    default_colors: {
      primary: '#D4AF37',
      secondary: '#8B0000',
      accent: '#FFD700'
    },
    preview_image: '/designs/preview/design_1.jpg',
    css_class: 'royal-temple-gold',
    background_image: '/designs/backgrounds/temple-pattern.png',
    gradient: 'linear-gradient(135deg, rgba(212,175,55,0.1) 0%, rgba(139,0,0,0.1) 100%)',
    pattern: 'temple-motif',
    is_default: true,
    order: 1
  },
  {
    design_id: 'design_2',
    name: 'Vibrant Haldi Celebration',
    description: 'Bright and cheerful yellow theme for Haldi ceremonies',
    event_types: [EVENT_TYPES.HALDI],
    supports_lord: false,
    background_type: BACKGROUND_TYPES.CSS,
    default_colors: {
      primary: '#FFD700',
      secondary: '#FF8C00',
      accent: '#FFA500'
    },
    preview_image: '/designs/preview/design_2.jpg',
    css_class: 'vibrant-haldi',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)',
    is_default: true,
    order: 2
  },
  {
    design_id: 'design_3',
    name: 'Mehendi Green Magic',
    description: 'Elegant green with floral mehendi patterns',
    event_types: [EVENT_TYPES.MEHENDI],
    supports_lord: false,
    background_type: BACKGROUND_TYPES.HYBRID,
    default_colors: {
      primary: '#228B22',
      secondary: '#9ACD32',
      accent: '#3CB371'
    },
    preview_image: '/designs/preview/design_3.jpg',
    css_class: 'mehendi-green',
    background_image: '/designs/backgrounds/mehendi-pattern.png',
    gradient: 'linear-gradient(135deg, rgba(34,139,34,0.2) 0%, rgba(60,179,113,0.2) 100%)',
    pattern: 'mehendi-floral',
    is_default: true,
    order: 3
  },
  {
    design_id: 'design_4',
    name: 'Elegant Royal Maroon',
    description: 'Rich maroon with golden divine elements',
    event_types: [EVENT_TYPES.ENGAGEMENT, EVENT_TYPES.MARRIAGE, EVENT_TYPES.RECEPTION],
    supports_lord: true,
    background_type: BACKGROUND_TYPES.IMAGE,
    default_colors: {
      primary: '#800000',
      secondary: '#B8860B',
      accent: '#CD853F'
    },
    preview_image: '/designs/preview/design_4.jpg',
    background_image: '/designs/backgrounds/royal-maroon-texture.jpg',
    is_default: false,
    order: 4
  },
  {
    design_id: 'design_5',
    name: 'Pastel Pink Romance',
    description: 'Soft pink with romantic floral touches',
    event_types: [EVENT_TYPES.ENGAGEMENT, EVENT_TYPES.RECEPTION],
    supports_lord: true,
    background_type: BACKGROUND_TYPES.CSS,
    default_colors: {
      primary: '#FFB6C1',
      secondary: '#FF69B4',
      accent: '#FFC0CB'
    },
    preview_image: '/designs/preview/design_5.jpg',
    css_class: 'pastel-pink-romance',
    gradient: 'linear-gradient(135deg, #FFB6C1 0%, #FFC0CB 50%, #FF69B4 100%)',
    is_default: true,
    order: 5
  },
  {
    design_id: 'design_6',
    name: 'Deep Royal Blue',
    description: 'Majestic blue with silver accents',
    event_types: [EVENT_TYPES.ENGAGEMENT, EVENT_TYPES.MARRIAGE, EVENT_TYPES.RECEPTION],
    supports_lord: true,
    background_type: BACKGROUND_TYPES.HYBRID,
    default_colors: {
      primary: '#000080',
      secondary: '#4169E1',
      accent: '#C0C0C0'
    },
    preview_image: '/designs/preview/design_6.jpg',
    css_class: 'deep-royal-blue',
    background_image: '/designs/backgrounds/royal-pattern.png',
    gradient: 'linear-gradient(135deg, rgba(0,0,128,0.3) 0%, rgba(65,105,225,0.3) 100%)',
    pattern: 'royal-motif',
    is_default: true,
    order: 6
  },
  {
    design_id: 'design_7',
    name: 'Sunset Orange Glow',
    description: 'Warm sunset gradient for modern celebrations',
    event_types: [EVENT_TYPES.HALDI, EVENT_TYPES.MEHENDI, EVENT_TYPES.RECEPTION],
    supports_lord: false,
    background_type: BACKGROUND_TYPES.CSS,
    default_colors: {
      primary: '#FF4500',
      secondary: '#FF8C00',
      accent: '#FFD700'
    },
    preview_image: '/designs/preview/design_7.jpg',
    css_class: 'sunset-orange',
    gradient: 'linear-gradient(135deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)',
    is_default: false,
    order: 7
  },
  {
    design_id: 'design_8',
    name: 'Emerald Green Elegance',
    description: 'Deep emerald with golden divine touches',
    event_types: [EVENT_TYPES.ENGAGEMENT, EVENT_TYPES.MARRIAGE, EVENT_TYPES.RECEPTION],
    supports_lord: true,
    background_type: BACKGROUND_TYPES.HYBRID,
    default_colors: {
      primary: '#046307',
      secondary: '#50C878',
      accent: '#FFD700'
    },
    preview_image: '/designs/preview/design_8.jpg',
    css_class: 'emerald-elegance',
    background_image: '/designs/backgrounds/emerald-texture.png',
    gradient: 'linear-gradient(135deg, rgba(4,99,7,0.2) 0%, rgba(80,200,120,0.2) 100%)',
    pattern: 'divine-pattern',
    is_default: false,
    order: 8
  }
];

/**
 * Get all designs
 */
export const getAllDesigns = () => {
  return DESIGN_REGISTRY;
};

/**
 * Get designs filtered by event type
 */
export const getDesignsByEventType = (eventType) => {
  return DESIGN_REGISTRY.filter(design => 
    design.event_types.includes(eventType.toLowerCase())
  );
};

/**
 * Get specific design by ID
 */
export const getDesignById = (designId) => {
  return DESIGN_REGISTRY.find(design => design.design_id === designId);
};

/**
 * Get default design for event type
 */
export const getDefaultDesignForEvent = (eventType) => {
  const designs = getDesignsByEventType(eventType);
  const defaultDesign = designs.find(design => design.is_default);
  return defaultDesign || designs[0] || null;
};

/**
 * Validate if design is compatible with event
 */
export const validateDesignForEvent = (designId, eventType, showLord = false) => {
  const design = getDesignById(designId);
  
  if (!design) {
    return { valid: false, message: 'Design not found' };
  }
  
  // Check if design supports this event type
  if (!design.event_types.includes(eventType.toLowerCase())) {
    return { 
      valid: false, 
      message: `Design '${design.name}' does not support ${eventType} events` 
    };
  }
  
  // Check lord decoration compatibility for Haldi/Mehendi
  const nonLordEvents = [EVENT_TYPES.HALDI, EVENT_TYPES.MEHENDI];
  if (nonLordEvents.includes(eventType.toLowerCase())) {
    if (showLord && design.supports_lord) {
      return { 
        valid: false, 
        message: `Design '${design.name}' cannot be used with lord decorations for ${eventType} events` 
      };
    }
  }
  
  return { valid: true, message: 'Valid' };
};

/**
 * Default designs map for quick lookup
 */
export const DEFAULT_DESIGNS_MAP = {
  [EVENT_TYPES.ENGAGEMENT]: 'design_5',
  [EVENT_TYPES.HALDI]: 'design_2',
  [EVENT_TYPES.MEHENDI]: 'design_3',
  [EVENT_TYPES.MARRIAGE]: 'design_1',
  [EVENT_TYPES.RECEPTION]: 'design_6'
};

/**
 * Generate CSS variables from color palette
 */
export const generateColorVariables = (colorPalette) => {
  if (!colorPalette) return {};
  
  return {
    '--design-primary-color': colorPalette.primary || '#D4AF37',
    '--design-secondary-color': colorPalette.secondary || '#8B0000',
    '--design-accent-color': colorPalette.accent || '#FFD700'
  };
};

/**
 * Apply background design styles
 */
export const applyBackgroundDesign = (design, colorPalette = null) => {
  if (!design) return {};
  
  const colors = colorPalette || design.default_colors;
  const styles = {
    ...generateColorVariables(colors)
  };
  
  // Apply background based on type
  switch (design.background_type) {
    case BACKGROUND_TYPES.CSS:
      if (design.gradient) {
        styles.background = design.gradient;
      }
      break;
      
    case BACKGROUND_TYPES.IMAGE:
      if (design.background_image) {
        styles.backgroundImage = `url(${design.background_image})`;
        styles.backgroundSize = 'cover';
        styles.backgroundPosition = 'center';
        styles.backgroundRepeat = 'no-repeat';
      }
      break;
      
    case BACKGROUND_TYPES.HYBRID:
      if (design.gradient && design.background_image) {
        styles.background = design.gradient;
        styles.backgroundImage = `${design.gradient}, url(${design.background_image})`;
        styles.backgroundSize = 'cover';
        styles.backgroundPosition = 'center';
        styles.backgroundBlendMode = 'overlay';
      } else if (design.gradient) {
        styles.background = design.gradient;
      } else if (design.background_image) {
        styles.backgroundImage = `url(${design.background_image})`;
        styles.backgroundSize = 'cover';
        styles.backgroundPosition = 'center';
      }
      break;
      
    default:
      break;
  }
  
  return styles;
};

export default {
  DESIGN_REGISTRY,
  BACKGROUND_TYPES,
  EVENT_TYPES,
  getAllDesigns,
  getDesignsByEventType,
  getDesignById,
  getDefaultDesignForEvent,
  validateDesignForEvent,
  DEFAULT_DESIGNS_MAP,
  generateColorVariables,
  applyBackgroundDesign
};
