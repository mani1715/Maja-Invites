/**
 * EVENT-BASED BACKGROUND CONFIGURATION
 * 
 * Implements event-specific background rules with dual-layer support:
 * - Hero/Top Background: Displayed at top of invitation
 * - Scroll Background: Displayed as user scrolls down
 * 
 * EVENT RULES:
 * - Engagement → Lord background at top, rings background on scroll
 * - Marriage → Full temple + lord background (both layers)
 * - Reception → Royal background, lord optional
 * - Haldi → Trendy yellow background (NO lord allowed)
 * - Mehendi → Trendy green mehendi background (NO lord allowed)
 */

// Import existing deity options for lord backgrounds
import { DEITY_OPTIONS } from './religiousAssets';

/**
 * Background Layer Types
 */
export const BACKGROUND_LAYERS = {
  HERO: 'hero',      // Top/Hero section background
  SCROLL: 'scroll'   // Scroll/Body background
};

/**
 * ENGAGEMENT BACKGROUNDS
 * Lord at top, rings/flowers on scroll
 */
export const ENGAGEMENT_BACKGROUNDS = {
  hero: {
    type: 'lord',
    options: DEITY_OPTIONS.filter(d => d.id !== 'none'),
    label: 'Lord Background (Top)',
    description: 'Religious deity background for hero section'
  },
  scroll: {
    type: 'rings_flowers',
    options: [
      {
        id: 'engagement_rings_gold',
        name: 'Golden Rings',
        description: 'Elegant golden engagement rings',
        images: {
          thumbnail: '/assets/backgrounds/engagement_rings_gold_thumb.webp',
          mobile: '/assets/backgrounds/engagement_rings_gold_mobile.webp',
          desktop: '/assets/backgrounds/engagement_rings_gold_desktop.webp'
        }
      },
      {
        id: 'engagement_rings_diamond',
        name: 'Diamond Rings',
        description: 'Sparkling diamond engagement rings',
        images: {
          thumbnail: '/assets/backgrounds/engagement_rings_diamond_thumb.webp',
          mobile: '/assets/backgrounds/engagement_rings_diamond_mobile.webp',
          desktop: '/assets/backgrounds/engagement_rings_diamond_desktop.webp'
        }
      },
      {
        id: 'engagement_flowers_pink',
        name: 'Pink Flowers',
        description: 'Romantic pink floral arrangement',
        images: {
          thumbnail: '/assets/backgrounds/engagement_flowers_pink_thumb.webp',
          mobile: '/assets/backgrounds/engagement_flowers_pink_mobile.webp',
          desktop: '/assets/backgrounds/engagement_flowers_pink_desktop.webp'
        }
      },
      {
        id: 'engagement_flowers_white',
        name: 'White Flowers',
        description: 'Pure white floral elegance',
        images: {
          thumbnail: '/assets/backgrounds/engagement_flowers_white_thumb.webp',
          mobile: '/assets/backgrounds/engagement_flowers_white_mobile.webp',
          desktop: '/assets/backgrounds/engagement_flowers_white_desktop.webp'
        }
      },
      {
        id: 'engagement_flowers_mixed',
        name: 'Mixed Flowers',
        description: 'Colorful mixed floral bouquet',
        images: {
          thumbnail: '/assets/backgrounds/engagement_flowers_mixed_thumb.webp',
          mobile: '/assets/backgrounds/engagement_flowers_mixed_mobile.webp',
          desktop: '/assets/backgrounds/engagement_flowers_mixed_desktop.webp'
        }
      }
    ],
    label: 'Scroll Background',
    description: 'Rings or flowers for scrolling sections'
  }
};

/**
 * MARRIAGE BACKGROUNDS
 * Full temple + lord for both layers
 */
export const MARRIAGE_BACKGROUNDS = {
  hero: {
    type: 'temple_lord',
    options: DEITY_OPTIONS.filter(d => d.id !== 'none'),
    label: 'Temple + Lord Background',
    description: 'Full temple deity background for entire page'
  },
  scroll: {
    type: 'temple_lord',
    options: DEITY_OPTIONS.filter(d => d.id !== 'none'),
    label: 'Temple + Lord Background',
    description: 'Same temple deity background continues'
  }
};

/**
 * RECEPTION BACKGROUNDS
 * Royal background, lord optional
 */
export const RECEPTION_BACKGROUNDS = {
  hero: {
    type: 'royal_classy',
    options: [
      {
        id: 'reception_royal_gold',
        name: 'Royal Gold',
        description: 'Luxurious gold and maroon theme',
        images: {
          thumbnail: '/assets/backgrounds/reception_royal_gold_thumb.webp',
          mobile: '/assets/backgrounds/reception_royal_gold_mobile.webp',
          desktop: '/assets/backgrounds/reception_royal_gold_desktop.webp'
        }
      },
      {
        id: 'reception_royal_purple',
        name: 'Royal Purple',
        description: 'Majestic purple and gold combination',
        images: {
          thumbnail: '/assets/backgrounds/reception_royal_purple_thumb.webp',
          mobile: '/assets/backgrounds/reception_royal_purple_mobile.webp',
          desktop: '/assets/backgrounds/reception_royal_purple_desktop.webp'
        }
      },
      {
        id: 'reception_classy_silver',
        name: 'Classy Silver',
        description: 'Elegant silver and white theme',
        images: {
          thumbnail: '/assets/backgrounds/reception_classy_silver_thumb.webp',
          mobile: '/assets/backgrounds/reception_classy_silver_mobile.webp',
          desktop: '/assets/backgrounds/reception_classy_silver_desktop.webp'
        }
      },
      {
        id: 'reception_classy_champagne',
        name: 'Champagne Elegance',
        description: 'Sophisticated champagne and ivory',
        images: {
          thumbnail: '/assets/backgrounds/reception_classy_champagne_thumb.webp',
          mobile: '/assets/backgrounds/reception_classy_champagne_mobile.webp',
          desktop: '/assets/backgrounds/reception_classy_champagne_desktop.webp'
        }
      }
    ],
    label: 'Royal Background',
    description: 'Royal/classy backgrounds for reception'
  },
  scroll: {
    type: 'royal_classy_or_lord',
    options: [
      ...DEITY_OPTIONS.filter(d => d.id !== 'none'), // Lord option
      {
        id: 'reception_royal_gold',
        name: 'Royal Gold',
        description: 'Luxurious gold and maroon theme',
        images: {
          thumbnail: '/assets/backgrounds/reception_royal_gold_thumb.webp',
          mobile: '/assets/backgrounds/reception_royal_gold_mobile.webp',
          desktop: '/assets/backgrounds/reception_royal_gold_desktop.webp'
        }
      },
      {
        id: 'reception_royal_purple',
        name: 'Royal Purple',
        description: 'Majestic purple and gold combination',
        images: {
          thumbnail: '/assets/backgrounds/reception_royal_purple_thumb.webp',
          mobile: '/assets/backgrounds/reception_royal_purple_mobile.webp',
          desktop: '/assets/backgrounds/reception_royal_purple_desktop.webp'
        }
      }
    ],
    label: 'Scroll Background (Lord Optional)',
    description: 'Royal backgrounds or optional lord background'
  }
};

/**
 * HALDI BACKGROUNDS
 * Trendy yellow only - NO lord allowed
 */
export const HALDI_BACKGROUNDS = {
  hero: {
    type: 'trendy_yellow',
    options: [
      {
        id: 'haldi_turmeric',
        name: 'Turmeric Traditional',
        description: 'Traditional turmeric paste and flowers',
        images: {
          thumbnail: '/assets/backgrounds/haldi_turmeric_thumb.webp',
          mobile: '/assets/backgrounds/haldi_turmeric_mobile.webp',
          desktop: '/assets/backgrounds/haldi_turmeric_desktop.webp'
        }
      },
      {
        id: 'haldi_bindelu',
        name: 'Bindelu Pattern',
        description: 'Traditional bindelu design with yellow theme',
        images: {
          thumbnail: '/assets/backgrounds/haldi_bindelu_thumb.webp',
          mobile: '/assets/backgrounds/haldi_bindelu_mobile.webp',
          desktop: '/assets/backgrounds/haldi_bindelu_desktop.webp'
        }
      },
      {
        id: 'haldi_yellow_florals',
        name: 'Yellow Florals',
        description: 'Vibrant yellow marigolds and flowers',
        images: {
          thumbnail: '/assets/backgrounds/haldi_yellow_florals_thumb.webp',
          mobile: '/assets/backgrounds/haldi_yellow_florals_mobile.webp',
          desktop: '/assets/backgrounds/haldi_yellow_florals_desktop.webp'
        }
      },
      {
        id: 'haldi_yellow_abstract',
        name: 'Yellow Abstract',
        description: 'Modern yellow abstract pattern',
        images: {
          thumbnail: '/assets/backgrounds/haldi_yellow_abstract_thumb.webp',
          mobile: '/assets/backgrounds/haldi_yellow_abstract_mobile.webp',
          desktop: '/assets/backgrounds/haldi_yellow_abstract_desktop.webp'
        }
      }
    ],
    label: 'Yellow Background (Hero)',
    description: 'Trendy yellow backgrounds - no lord allowed'
  },
  scroll: {
    type: 'trendy_yellow',
    options: [
      {
        id: 'haldi_turmeric',
        name: 'Turmeric Traditional',
        description: 'Traditional turmeric paste and flowers',
        images: {
          thumbnail: '/assets/backgrounds/haldi_turmeric_thumb.webp',
          mobile: '/assets/backgrounds/haldi_turmeric_mobile.webp',
          desktop: '/assets/backgrounds/haldi_turmeric_desktop.webp'
        }
      },
      {
        id: 'haldi_yellow_florals',
        name: 'Yellow Florals',
        description: 'Vibrant yellow marigolds and flowers',
        images: {
          thumbnail: '/assets/backgrounds/haldi_yellow_florals_thumb.webp',
          mobile: '/assets/backgrounds/haldi_yellow_florals_mobile.webp',
          desktop: '/assets/backgrounds/haldi_yellow_florals_desktop.webp'
        }
      }
    ],
    label: 'Yellow Background (Scroll)',
    description: 'Trendy yellow backgrounds - no lord allowed'
  }
};

/**
 * MEHENDI BACKGROUNDS
 * Trendy green mehendi only - NO lord allowed
 */
export const MEHENDI_BACKGROUNDS = {
  hero: {
    type: 'trendy_green',
    options: [
      {
        id: 'mehendi_pattern_intricate',
        name: 'Intricate Mehendi',
        description: 'Detailed mehendi hand design',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_pattern_intricate_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_pattern_intricate_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_pattern_intricate_desktop.webp'
        }
      },
      {
        id: 'mehendi_green_leaves',
        name: 'Green Leaves',
        description: 'Fresh green leaf pattern',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_green_leaves_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_green_leaves_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_green_leaves_desktop.webp'
        }
      },
      {
        id: 'mehendi_paisley',
        name: 'Paisley Pattern',
        description: 'Traditional paisley mehendi design',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_paisley_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_paisley_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_paisley_desktop.webp'
        }
      },
      {
        id: 'mehendi_green_abstract',
        name: 'Green Abstract',
        description: 'Modern green theme with abstract elements',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_green_abstract_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_green_abstract_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_green_abstract_desktop.webp'
        }
      }
    ],
    label: 'Green Background (Hero)',
    description: 'Trendy green mehendi backgrounds - no lord allowed'
  },
  scroll: {
    type: 'trendy_green',
    options: [
      {
        id: 'mehendi_pattern_intricate',
        name: 'Intricate Mehendi',
        description: 'Detailed mehendi hand design',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_pattern_intricate_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_pattern_intricate_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_pattern_intricate_desktop.webp'
        }
      },
      {
        id: 'mehendi_green_leaves',
        name: 'Green Leaves',
        description: 'Fresh green leaf pattern',
        images: {
          thumbnail: '/assets/backgrounds/mehendi_green_leaves_thumb.webp',
          mobile: '/assets/backgrounds/mehendi_green_leaves_mobile.webp',
          desktop: '/assets/backgrounds/mehendi_green_leaves_desktop.webp'
        }
      }
    ],
    label: 'Green Background (Scroll)',
    description: 'Trendy green mehendi backgrounds - no lord allowed'
  }
};

/**
 * Get background configuration for a specific event type
 * @param {string} eventType - Event type (engagement, marriage, reception, haldi, mehendi)
 * @returns {object|null} Background configuration with hero and scroll layers
 */
export const getEventBackgroundConfig = (eventType) => {
  switch (eventType?.toLowerCase()) {
    case 'engagement':
      return ENGAGEMENT_BACKGROUNDS;
    case 'marriage':
      return MARRIAGE_BACKGROUNDS;
    case 'reception':
      return RECEPTION_BACKGROUNDS;
    case 'haldi':
      return HALDI_BACKGROUNDS;
    case 'mehendi':
      return MEHENDI_BACKGROUNDS;
    default:
      return null;
  }
};

/**
 * Get background asset by ID from all event backgrounds
 * @param {string} backgroundId - Background identifier
 * @returns {object|null} Background asset or null
 */
export const getBackgroundById = (backgroundId) => {
  if (!backgroundId) return null;
  
  // Collect all background options from all event types
  const allBackgrounds = [
    ...ENGAGEMENT_BACKGROUNDS.hero.options,
    ...ENGAGEMENT_BACKGROUNDS.scroll.options,
    ...MARRIAGE_BACKGROUNDS.hero.options,
    ...RECEPTION_BACKGROUNDS.hero.options,
    ...RECEPTION_BACKGROUNDS.scroll.options,
    ...HALDI_BACKGROUNDS.hero.options,
    ...HALDI_BACKGROUNDS.scroll.options,
    ...MEHENDI_BACKGROUNDS.hero.options,
    ...MEHENDI_BACKGROUNDS.scroll.options
  ];
  
  return allBackgrounds.find(bg => bg.id === backgroundId) || null;
};

/**
 * Check if an event type allows lord backgrounds
 * @param {string} eventType - Event type
 * @returns {boolean} True if lord backgrounds are allowed
 */
export const allowsLordBackgrounds = (eventType) => {
  return ['engagement', 'marriage', 'reception'].includes(eventType?.toLowerCase());
};

/**
 * Check if lord backgrounds are MANDATORY for an event type
 * @param {string} eventType - Event type
 * @returns {boolean} True if lord backgrounds are mandatory
 */
export const requiresLordBackgrounds = (eventType) => {
  return ['engagement', 'marriage'].includes(eventType?.toLowerCase());
};

/**
 * Check if an event type PROHIBITS lord backgrounds
 * @param {string} eventType - Event type
 * @returns {boolean} True if lord backgrounds are prohibited
 */
export const prohibitsLordBackgrounds = (eventType) => {
  return ['haldi', 'mehendi'].includes(eventType?.toLowerCase());
};

/**
 * Get default background IDs for an event type
 * @param {string} eventType - Event type
 * @returns {object} Default hero and scroll background IDs
 */
export const getDefaultBackgrounds = (eventType) => {
  const config = getEventBackgroundConfig(eventType);
  if (!config) return { hero: null, scroll: null };
  
  return {
    hero: config.hero.options[0]?.id || null,
    scroll: config.scroll.options[0]?.id || null
  };
};
