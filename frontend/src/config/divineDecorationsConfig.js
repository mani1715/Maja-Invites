/**
 * DIVINE DECORATIONS CONFIGURATION
 * 
 * Structural layout rules for divine decorations based on event type and theme
 * Controls visibility and positioning of LORD IMAGE, GANTALU (bells), and DHEEPALU (fire lamps)
 * 
 * Configuration Flags:
 * - showLord: Display deity image at top-center
 * - showGantalu: Display temple bells at top-left and top-right
 * - showFire: Display fire lamps at bottom corners
 */

/**
 * Event-specific decoration rules
 * Defines which decorations are visible for each event type
 */
export const EVENT_DECORATION_RULES = {
  engagement: {
    showLord: true,
    showGantalu: true,
    showFire: true,
    description: 'Engagement: lord + gantalu + rings background'
  },
  
  marriage: {
    showLord: true,
    showGantalu: true,
    showFire: true,
    description: 'Marriage: lord + gantalu + temple background'
  },
  
  reception: {
    showLord: true,
    showGantalu: true,
    showFire: true,
    description: 'Reception: lord + gantalu + royal background'
  },
  
  haldi: {
    showLord: false,
    showGantalu: false,
    showFire: false,
    description: 'Haldi: NO lord, NO gantalu, NO fire'
  },
  
  mehendi: {
    showLord: false,
    showGantalu: false,
    showFire: false,
    description: 'Mehendi: NO lord, NO gantalu, NO fire'
  }
};

/**
 * Default decoration settings (fallback)
 */
export const DEFAULT_DECORATION_CONFIG = {
  showLord: true,
  showGantalu: true,
  showFire: true
};

/**
 * Layout configuration for each decoration element
 */
export const DECORATION_LAYOUT = {
  lord: {
    position: 'top-center',
    description: 'Medium size on load, fades after scroll',
    zIndex: 5,
    initialOpacity: 0.9,
    scrolledOpacity: 0.5,
    scrollThreshold: 100, // pixels scrolled before fade starts
    maxHeight: {
      mobile: '250px',
      tablet: '300px',
      desktop: '350px'
    }
  },
  
  gantalu: {
    position: 'top-left-right',
    description: 'Two bells at top corners, visible first 2 seconds, fade on scroll',
    zIndex: 10,
    initialVisibleDuration: 2000, // milliseconds
    fadeOnScroll: true,
    scrollFadeThreshold: 50, // pixels scrolled before fade starts
    size: {
      mobile: { width: '48px', height: '64px' },
      tablet: { width: '56px', height: '72px' },
      desktop: { width: '64px', height: '80px' }
    },
    ropeHeight: '80px'
  },
  
  fire: {
    position: 'bottom-corners',
    description: 'Near bottom corners, low opacity, static',
    zIndex: 10,
    opacity: 0.4,
    bottomOffset: '32px',
    sideOffset: {
      mobile: '16px',
      desktop: '32px'
    },
    size: {
      mobile: { width: '64px', height: '80px' },
      desktop: { width: '80px', height: '96px' }
    }
  }
};

/**
 * Get decoration configuration for a specific event type
 * @param {string} eventType - Event type (engagement, marriage, reception, haldi, mehendi)
 * @returns {Object} Decoration configuration with showLord, showGantalu, showFire flags
 */
export const getDecorationConfig = (eventType) => {
  if (!eventType) {
    return DEFAULT_DECORATION_CONFIG;
  }
  
  const normalizedEventType = eventType.toLowerCase();
  return EVENT_DECORATION_RULES[normalizedEventType] || DEFAULT_DECORATION_CONFIG;
};

/**
 * Check if decorations should be shown for an event type
 * @param {string} eventType - Event type
 * @returns {boolean} True if any decoration should be shown
 */
export const shouldShowDecorations = (eventType) => {
  const config = getDecorationConfig(eventType);
  return config.showLord || config.showGantalu || config.showFire;
};

/**
 * Check if lord image should be shown
 * @param {string} eventType - Event type
 * @returns {boolean}
 */
export const shouldShowLord = (eventType) => {
  const config = getDecorationConfig(eventType);
  return config.showLord;
};

/**
 * Check if gantalu (bells) should be shown
 * @param {string} eventType - Event type
 * @returns {boolean}
 */
export const shouldShowGantalu = (eventType) => {
  const config = getDecorationConfig(eventType);
  return config.showGantalu;
};

/**
 * Check if fire lamps should be shown
 * @param {string} eventType - Event type
 * @returns {boolean}
 */
export const shouldShowFire = (eventType) => {
  const config = getDecorationConfig(eventType);
  return config.showFire;
};

/**
 * Get layout configuration for a specific decoration element
 * @param {string} element - Element name (lord, gantalu, fire)
 * @returns {Object} Layout configuration
 */
export const getLayoutConfig = (element) => {
  return DECORATION_LAYOUT[element] || {};
};

/**
 * Get all event types that allow lord decorations
 * @returns {Array} Array of event types
 */
export const getLordEnabledEvents = () => {
  return Object.keys(EVENT_DECORATION_RULES).filter(
    eventType => EVENT_DECORATION_RULES[eventType].showLord
  );
};

/**
 * Validate event type
 * @param {string} eventType - Event type to validate
 * @returns {boolean} True if valid event type
 */
export const isValidEventType = (eventType) => {
  if (!eventType) return false;
  return Object.keys(EVENT_DECORATION_RULES).includes(eventType.toLowerCase());
};
