/**
 * PHASE 13 PART 2: Event-Specific Background Assets Configuration
 * 
 * Manages event-specific background images for different wedding events.
 * Each event type has specific background options based on requirements.
 */

// Import existing deity options for lord backgrounds
import { DEITY_OPTIONS } from './religiousAssets';

/**
 * Engagement Backgrounds: Lord backgrounds + Ring/Flower backgrounds
 */
export const ENGAGEMENT_BACKGROUNDS = {
  lord: DEITY_OPTIONS.filter(d => d.id !== 'none'), // All lord backgrounds
  trendy: [
    {
      id: 'engagement_rings_gold',
      name: 'Golden Rings',
      description: 'Elegant golden engagement rings',
      thumbnail: '/assets/backgrounds/engagement_rings_gold_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/engagement_rings_gold_thumb.webp',
        mobile: '/assets/backgrounds/engagement_rings_gold_mobile.webp',
        desktop: '/assets/backgrounds/engagement_rings_gold_desktop.webp'
      }
    },
    {
      id: 'engagement_flowers_pink',
      name: 'Pink Flowers',
      description: 'Romantic pink floral arrangement',
      thumbnail: '/assets/backgrounds/engagement_flowers_pink_thumb.webp',
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
      thumbnail: '/assets/backgrounds/engagement_flowers_white_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/engagement_flowers_white_thumb.webp',
        mobile: '/assets/backgrounds/engagement_flowers_white_mobile.webp',
        desktop: '/assets/backgrounds/engagement_flowers_white_desktop.webp'
      }
    }
  ]
};

/**
 * Haldi Backgrounds: Trendy only (turmeric, bindelu, yellow florals)
 */
export const HALDI_BACKGROUNDS = [
  {
    id: 'haldi_turmeric',
    name: 'Turmeric Traditional',
    description: 'Traditional turmeric paste and flowers',
    thumbnail: '/assets/backgrounds/haldi_turmeric_thumb.webp',
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
    thumbnail: '/assets/backgrounds/haldi_bindelu_thumb.webp',
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
    thumbnail: '/assets/backgrounds/haldi_yellow_florals_thumb.webp',
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
    thumbnail: '/assets/backgrounds/haldi_yellow_abstract_thumb.webp',
    images: {
      thumbnail: '/assets/backgrounds/haldi_yellow_abstract_thumb.webp',
      mobile: '/assets/backgrounds/haldi_yellow_abstract_mobile.webp',
      desktop: '/assets/backgrounds/haldi_yellow_abstract_desktop.webp'
    }
  }
];

/**
 * Mehendi Backgrounds: Trendy only (mehendi patterns, green theme)
 */
export const MEHENDI_BACKGROUNDS = [
  {
    id: 'mehendi_pattern_intricate',
    name: 'Intricate Mehendi',
    description: 'Detailed mehendi hand design',
    thumbnail: '/assets/backgrounds/mehendi_pattern_intricate_thumb.webp',
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
    thumbnail: '/assets/backgrounds/mehendi_green_leaves_thumb.webp',
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
    thumbnail: '/assets/backgrounds/mehendi_paisley_thumb.webp',
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
    thumbnail: '/assets/backgrounds/mehendi_green_abstract_thumb.webp',
    images: {
      thumbnail: '/assets/backgrounds/mehendi_green_abstract_thumb.webp',
      mobile: '/assets/backgrounds/mehendi_green_abstract_mobile.webp',
      desktop: '/assets/backgrounds/mehendi_green_abstract_desktop.webp'
    }
  }
];

/**
 * Marriage Backgrounds: Lord backgrounds only
 */
export const MARRIAGE_BACKGROUNDS = {
  lord: DEITY_OPTIONS.filter(d => d.id !== 'none') // All lord backgrounds, excluding 'none'
};

/**
 * Reception Backgrounds: Mandatory choice - With Lord OR Without Lord (royal/classy)
 */
export const RECEPTION_BACKGROUNDS = {
  with_lord: DEITY_OPTIONS.filter(d => d.id !== 'none'), // All lord backgrounds
  without_lord: [
    {
      id: 'reception_royal_gold',
      name: 'Royal Gold',
      description: 'Luxurious gold and maroon theme',
      thumbnail: '/assets/backgrounds/reception_royal_gold_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/reception_royal_gold_thumb.webp',
        mobile: '/assets/backgrounds/reception_royal_gold_mobile.webp',
        desktop: '/assets/backgrounds/reception_royal_gold_desktop.webp'
      }
    },
    {
      id: 'reception_classy_silver',
      name: 'Classy Silver',
      description: 'Elegant silver and white theme',
      thumbnail: '/assets/backgrounds/reception_classy_silver_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/reception_classy_silver_thumb.webp',
        mobile: '/assets/backgrounds/reception_classy_silver_mobile.webp',
        desktop: '/assets/backgrounds/reception_classy_silver_desktop.webp'
      }
    },
    {
      id: 'reception_royal_purple',
      name: 'Royal Purple',
      description: 'Majestic purple and gold combination',
      thumbnail: '/assets/backgrounds/reception_royal_purple_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/reception_royal_purple_thumb.webp',
        mobile: '/assets/backgrounds/reception_royal_purple_mobile.webp',
        desktop: '/assets/backgrounds/reception_royal_purple_desktop.webp'
      }
    },
    {
      id: 'reception_classy_champagne',
      name: 'Champagne Elegance',
      description: 'Sophisticated champagne and ivory',
      thumbnail: '/assets/backgrounds/reception_classy_champagne_thumb.webp',
      images: {
        thumbnail: '/assets/backgrounds/reception_classy_champagne_thumb.webp',
        mobile: '/assets/backgrounds/reception_classy_champagne_mobile.webp',
        desktop: '/assets/backgrounds/reception_classy_champagne_desktop.webp'
      }
    }
  ]
};

/**
 * Get available backgrounds for a specific event type
 * @param {string} eventType - Event type (engagement, haldi, mehendi, marriage, reception)
 * @returns {object} Available background options
 */
export const getEventBackgrounds = (eventType) => {
  switch (eventType) {
    case 'engagement':
      return ENGAGEMENT_BACKGROUNDS;
    case 'haldi':
      return { trendy: HALDI_BACKGROUNDS };
    case 'mehendi':
      return { trendy: MEHENDI_BACKGROUNDS };
    case 'marriage':
      return MARRIAGE_BACKGROUNDS;
    case 'reception':
      return RECEPTION_BACKGROUNDS;
    default:
      return null;
  }
};

/**
 * Get background by ID from all event backgrounds
 * @param {string} backgroundId - Background identifier
 * @returns {object|null} Background configuration or null
 */
export const getBackgroundById = (backgroundId) => {
  if (!backgroundId) return null;
  
  // Check in all background collections
  const allBackgrounds = [
    ...ENGAGEMENT_BACKGROUNDS.trendy,
    ...HALDI_BACKGROUNDS,
    ...MEHENDI_BACKGROUNDS,
    ...ENGAGEMENT_BACKGROUNDS.lord,
    ...MARRIAGE_BACKGROUNDS.lord,
    ...RECEPTION_BACKGROUNDS.with_lord,
    ...RECEPTION_BACKGROUNDS.without_lord
  ];
  
  return allBackgrounds.find(bg => bg.id === backgroundId) || null;
};

/**
 * Check if an event type allows lord backgrounds
 * @param {string} eventType - Event type
 * @returns {boolean} True if lord backgrounds are allowed
 */
export const allowsLordBackgrounds = (eventType) => {
  return ['engagement', 'marriage', 'reception'].includes(eventType);
};

/**
 * Check if an event type requires background selection
 * @param {string} eventType - Event type
 * @returns {boolean} True if background selection is mandatory
 */
export const requiresBackgroundSelection = (eventType) => {
  return eventType === 'reception'; // Reception requires mandatory choice
};
