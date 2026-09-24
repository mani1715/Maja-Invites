/**
 * PHASE 18 - EVENT DESIGN SYSTEM
 * Central Design Registry for Wedding Events
 * 
 * This registry defines 8 wedding-specific designs with:
 * - Base colors and gradients
 * - Texture overlays
 * - Decorations (flowers, gantalu, dheepalu)
 * - Lord image rules
 */

// Event Types
export const EVENT_TYPES = {
  ENGAGEMENT: 'engagement',
  HALDI: 'haldi',
  MEHNDI: 'mehendi',
  MARRIAGE: 'marriage',
  RECEPTION: 'reception'
};

// Lord Rules per Event
export const LORD_RULES = {
  [EVENT_TYPES.ENGAGEMENT]: { allowed: true, mandatory: false },
  [EVENT_TYPES.HALDI]: { allowed: false, mandatory: false },
  [EVENT_TYPES.MEHNDI]: { allowed: false, mandatory: false },
  [EVENT_TYPES.MARRIAGE]: { allowed: true, mandatory: true },
  [EVENT_TYPES.RECEPTION]: { allowed: true, mandatory: false }
};

// Design 1: Elegant Rings (Engagement)
const DESIGN_1 = {
  id: 'design_1',
  name: 'Elegant Rings',
  eventTypes: ['engagement'],
  base_colors: {
    primary: '#FFB6C1',    // Soft pink
    secondary: '#FFE4E1',  // Misty rose
    accent: '#FFD700',     // Gold
    text: '#8B4513'        // Saddle brown
  },
  gradient: {
    type: 'radial',
    colors: ['#FFE4E1', '#FFB6C1', '#FFC0CB'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'linear-gradient(135deg, #FFE4E1 0%, #FFB6C1 50%, #FFC0CB 100%)',
    overlay: 'radial-gradient(circle at 50% 50%, rgba(255,215,0,0.1) 0%, transparent 70%)'
  },
  texture: {
    type: 'rings',
    opacity: 0.15,
    pattern: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="30" r="20" fill="none" stroke="rgba(255,215,0,0.3)" stroke-width="2"/>
      <circle cx="50" cy="30" r="20" fill="none" stroke="rgba(255,215,0,0.3)" stroke-width="2"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'rose',
      colors: ['#FFB6C1', '#FFC0CB', '#FF69B4'],
      positions: ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    },
    gantalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['top-left', 'top-right']
    },
    dheepalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['bottom-left', 'bottom-right']
    }
  },
  lord_allowed: true,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: true,
    show_gantalu: true,
    show_dheepalu: true
  }
};

// Design 2: Pastel Dreams (Engagement)
const DESIGN_2 = {
  id: 'design_2',
  name: 'Pastel Dreams',
  eventTypes: ['engagement'],
  base_colors: {
    primary: '#E6E6FA',    // Lavender
    secondary: '#FFF0F5',  // Lavender blush
    accent: '#DDA0DD',     // Plum
    text: '#4B0082'        // Indigo
  },
  gradient: {
    type: 'linear',
    colors: ['#FFF0F5', '#E6E6FA', '#DDA0DD'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'linear-gradient(180deg, #FFF0F5 0%, #E6E6FA 50%, #DDA0DD 100%)',
    overlay: 'radial-gradient(ellipse at 50% 30%, rgba(221,160,221,0.2) 0%, transparent 60%)'
  },
  texture: {
    type: 'hearts',
    opacity: 0.1,
    pattern: `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg">
      <path d="M40,70 C30,60 10,45 10,30 C10,20 17,13 25,13 C30,13 35,16 40,22 C45,16 50,13 55,13 C63,13 70,20 70,30 C70,45 50,60 40,70z" fill="rgba(221,160,221,0.2)"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'mixed',
      colors: ['#E6E6FA', '#DDA0DD', '#FFB6C1'],
      positions: ['top-corners', 'bottom-corners']
    },
    gantalu: {
      enabled: true,
      color: '#DDA0DD',
      positions: ['top-left', 'top-right']
    },
    dheepalu: {
      enabled: true,
      color: '#DDA0DD',
      positions: ['bottom-left', 'bottom-right']
    }
  },
  lord_allowed: true,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: true,
    show_gantalu: true,
    show_dheepalu: true
  }
};

// Design 3: Turmeric Glow (Haldi)
const DESIGN_3 = {
  id: 'design_3',
  name: 'Turmeric Glow',
  eventTypes: ['haldi'],
  base_colors: {
    primary: '#FFD700',    // Gold
    secondary: '#FFFF00',  // Yellow
    accent: '#FFA500',     // Orange
    text: '#8B4500'        // Dark orange
  },
  gradient: {
    type: 'radial',
    colors: ['#FFFFE0', '#FFD700', '#FFA500'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'radial-gradient(circle at 50% 50%, #FFFFE0 0%, #FFD700 50%, #FFA500 100%)',
    overlay: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,165,0,0.05) 10px, rgba(255,165,0,0.05) 20px)'
  },
  texture: {
    type: 'bindelu',
    opacity: 0.12,
    pattern: `<svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="30" r="4" fill="rgba(255,165,0,0.3)"/>
      <circle cx="20" cy="20" r="3" fill="rgba(255,165,0,0.25)"/>
      <circle cx="40" cy="20" r="3" fill="rgba(255,165,0,0.25)"/>
      <circle cx="20" cy="40" r="3" fill="rgba(255,165,0,0.25)"/>
      <circle cx="40" cy="40" r="3" fill="rgba(255,165,0,0.25)"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'marigold',
      colors: ['#FFD700', '#FFA500', '#FFFF00'],
      positions: ['scattered']
    },
    gantalu: {
      enabled: false,
      color: null,
      positions: []
    },
    dheepalu: {
      enabled: false,
      color: null,
      positions: []
    }
  },
  lord_allowed: false,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: false,
    show_gantalu: false,
    show_dheepalu: false
  }
};

// Design 4: Sunshine Celebration (Haldi)
const DESIGN_4 = {
  id: 'design_4',
  name: 'Sunshine Celebration',
  eventTypes: ['haldi'],
  base_colors: {
    primary: '#FFEB3B',    // Bright yellow
    secondary: '#FFF9C4',  // Light yellow
    accent: '#FF9800',     // Deep orange
    text: '#F57C00'        // Orange
  },
  gradient: {
    type: 'linear',
    colors: ['#FFF9C4', '#FFEB3B', '#FFC107'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'linear-gradient(135deg, #FFF9C4 0%, #FFEB3B 50%, #FFC107 100%)',
    overlay: 'radial-gradient(circle at 30% 40%, rgba(255,152,0,0.1) 0%, transparent 50%)'
  },
  texture: {
    type: 'dots',
    opacity: 0.08,
    pattern: `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="5" fill="rgba(255,152,0,0.2)"/>
      <circle cx="10" cy="10" r="3" fill="rgba(255,152,0,0.15)"/>
      <circle cx="40" cy="10" r="3" fill="rgba(255,152,0,0.15)"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'sunflower',
      colors: ['#FFEB3B', '#FFC107', '#FF9800'],
      positions: ['border']
    },
    gantalu: {
      enabled: false,
      color: null,
      positions: []
    },
    dheepalu: {
      enabled: false,
      color: null,
      positions: []
    }
  },
  lord_allowed: false,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: false,
    show_gantalu: false,
    show_dheepalu: false
  }
};

// Design 5: Mehndi Magic (Mehndi)
const DESIGN_5 = {
  id: 'design_5',
  name: 'Mehndi Magic',
  eventTypes: ['mehendi'],
  base_colors: {
    primary: '#2E7D32',    // Green
    secondary: '#81C784',  // Light green
    accent: '#4CAF50',     // Medium green
    text: '#1B5E20'        // Dark green
  },
  gradient: {
    type: 'radial',
    colors: ['#C8E6C9', '#81C784', '#4CAF50'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'radial-gradient(ellipse at 50% 50%, #C8E6C9 0%, #81C784 50%, #4CAF50 100%)',
    overlay: 'linear-gradient(45deg, rgba(46,125,50,0.05) 25%, transparent 25%, transparent 75%, rgba(46,125,50,0.05) 75%)'
  },
  texture: {
    type: 'mehndi',
    opacity: 0.15,
    pattern: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <path d="M50,10 Q60,30 50,50 Q40,30 50,10" fill="none" stroke="rgba(46,125,50,0.3)" stroke-width="2"/>
      <circle cx="50" cy="50" r="8" fill="none" stroke="rgba(46,125,50,0.3)" stroke-width="1.5"/>
      <path d="M50,58 L50,80" stroke="rgba(46,125,50,0.3)" stroke-width="2"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'vine',
      colors: ['#2E7D32', '#4CAF50', '#81C784'],
      positions: ['border-elegant']
    },
    gantalu: {
      enabled: false,
      color: null,
      positions: []
    },
    dheepalu: {
      enabled: false,
      color: null,
      positions: []
    }
  },
  lord_allowed: false,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: false,
    show_gantalu: false,
    show_dheepalu: false
  }
};

// Design 6: Emerald Garden (Mehndi)
const DESIGN_6 = {
  id: 'design_6',
  name: 'Emerald Garden',
  eventTypes: ['mehendi'],
  base_colors: {
    primary: '#00695C',    // Teal
    secondary: '#80CBC4',  // Light teal
    accent: '#26A69A',     // Medium teal
    text: '#004D40'        // Dark teal
  },
  gradient: {
    type: 'linear',
    colors: ['#B2DFDB', '#80CBC4', '#4DB6AC'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'linear-gradient(180deg, #B2DFDB 0%, #80CBC4 50%, #4DB6AC 100%)',
    overlay: 'radial-gradient(circle at 70% 30%, rgba(0,105,92,0.1) 0%, transparent 60%)'
  },
  texture: {
    type: 'paisley',
    opacity: 0.12,
    pattern: `<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg">
      <path d="M40,10 Q60,20 60,40 Q60,60 40,70 Q35,65 35,40 Q35,20 40,10" fill="rgba(0,105,92,0.2)"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'leaf',
      colors: ['#00695C', '#26A69A', '#80CBC4'],
      positions: ['corners-elegant']
    },
    gantalu: {
      enabled: false,
      color: null,
      positions: []
    },
    dheepalu: {
      enabled: false,
      color: null,
      positions: []
    }
  },
  lord_allowed: false,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: false,
    show_gantalu: false,
    show_dheepalu: false
  }
};

// Design 7: Divine Temple (Marriage)
const DESIGN_7 = {
  id: 'design_7',
  name: 'Divine Temple',
  eventTypes: ['marriage'],
  base_colors: {
    primary: '#8B0000',    // Dark red
    secondary: '#DC143C',  // Crimson
    accent: '#FFD700',     // Gold
    text: '#FFF5E1'        // Cream
  },
  gradient: {
    type: 'radial',
    colors: ['#DC143C', '#B22222', '#8B0000'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'radial-gradient(ellipse at 50% 50%, #DC143C 0%, #B22222 50%, #8B0000 100%)',
    overlay: 'repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(255,215,0,0.03) 50px, rgba(255,215,0,0.03) 100px)'
  },
  texture: {
    type: 'temple',
    opacity: 0.2,
    pattern: `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
      <path d="M60,10 L70,40 L100,40 L75,60 L85,90 L60,70 L35,90 L45,60 L20,40 L50,40 Z" fill="rgba(255,215,0,0.3)"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'lotus',
      colors: ['#FFD700', '#FFA500', '#FF6347'],
      positions: ['all-corners']
    },
    gantalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['top-left', 'top-right']
    },
    dheepalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['bottom-left', 'bottom-right']
    }
  },
  lord_allowed: true,
  lord_mandatory: true,
  hero_opening: {
    duration: 2000,
    show_lord: true,
    show_gantalu: true,
    show_dheepalu: true
  }
};

// Design 8: Royal Reception (Reception)
const DESIGN_8 = {
  id: 'design_8',
  name: 'Royal Reception',
  eventTypes: ['reception'],
  base_colors: {
    primary: '#1A237E',    // Royal blue
    secondary: '#3F51B5',  // Indigo
    accent: '#FFD700',     // Gold
    text: '#E8EAF6'        // Light indigo
  },
  gradient: {
    type: 'linear',
    colors: ['#3F51B5', '#303F9F', '#1A237E'],
    stops: [0, 50, 100]
  },
  background: {
    base: 'linear-gradient(135deg, #3F51B5 0%, #303F9F 50%, #1A237E 100%)',
    overlay: 'radial-gradient(circle at 50% 50%, rgba(255,215,0,0.08) 0%, transparent 70%)'
  },
  texture: {
    type: 'elegant',
    opacity: 0.1,
    pattern: `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="30" height="30" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="1"/>
      <rect x="60" y="10" width="30" height="30" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="1"/>
      <rect x="10" y="60" width="30" height="30" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="1"/>
      <rect x="60" y="60" width="30" height="30" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="1"/>
    </svg>`
  },
  decorations: {
    flowers: {
      enabled: true,
      type: 'orchid',
      colors: ['#FFD700', '#FFA500', '#3F51B5'],
      positions: ['top-elegant', 'bottom-elegant']
    },
    gantalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['top-left', 'top-right']
    },
    dheepalu: {
      enabled: true,
      color: '#FFD700',
      positions: ['bottom-left', 'bottom-right']
    }
  },
  lord_allowed: true,
  lord_mandatory: false,
  hero_opening: {
    duration: 2000,
    show_lord: true,
    show_gantalu: true,
    show_dheepalu: true
  }
};

// Central Design Registry
export const DESIGN_REGISTRY = {
  design_1: DESIGN_1,
  design_2: DESIGN_2,
  design_3: DESIGN_3,
  design_4: DESIGN_4,
  design_5: DESIGN_5,
  design_6: DESIGN_6,
  design_7: DESIGN_7,
  design_8: DESIGN_8
};

// Event to Design Mapping (Defaults)
export const EVENT_DESIGN_MAPPING = {
  [EVENT_TYPES.ENGAGEMENT]: ['design_1', 'design_2'],
  [EVENT_TYPES.HALDI]: ['design_3', 'design_4'],
  [EVENT_TYPES.MEHNDI]: ['design_5', 'design_6'],
  [EVENT_TYPES.MARRIAGE]: ['design_7'],
  [EVENT_TYPES.RECEPTION]: ['design_8']
};

// Helper Functions
export const getDesignById = (designId) => {
  return DESIGN_REGISTRY[designId] || null;
};

export const getDesignsForEvent = (eventType) => {
  const designIds = EVENT_DESIGN_MAPPING[eventType] || [];
  return designIds.map(id => DESIGN_REGISTRY[id]).filter(Boolean);
};

export const getDefaultDesignForEvent = (eventType) => {
  const designs = getDesignsForEvent(eventType);
  return designs[0] || null;
};

export const isLordAllowedForEvent = (eventType) => {
  const rules = LORD_RULES[eventType];
  return rules ? rules.allowed : false;
};

export const isLordMandatoryForEvent = (eventType) => {
  const rules = LORD_RULES[eventType];
  return rules ? rules.mandatory : false;
};

export const getAllDesigns = () => {
  return Object.values(DESIGN_REGISTRY);
};

export const getDesignThumbnail = (designId) => {
  const design = getDesignById(designId);
  if (!design) return null;
  
  return {
    id: design.id,
    name: design.name,
    gradient: design.background.base,
    primaryColor: design.base_colors.primary,
    accentColor: design.base_colors.accent
  };
};

export default DESIGN_REGISTRY;
