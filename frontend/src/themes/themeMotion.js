/**
 * themeMotion.js — Per-theme scroll-animation tuning table.
 *
 * Every scroll-driven animation reads from this map. The components stay
 * identical across themes; only the easing / duration / stagger / depth values
 * change here. That makes it easy to tweak a theme's "personality" without
 * touching component code.
 *
 * Mapping table — masterThemes.js id → motion key:
 *   royal_mughal        → mughal
 *   south_indian_temple → temple
 *   punjabi_sangeet     → punjabi
 *   bengali_traditional → bengali
 *   modern_minimal      → minimal
 *   beach_destination   → beach
 *   nature_eco_wedding  → eco
 *   christian_elegant   → christian
 *   muslim_nikah        → nikah
 *   kerala_backwaters   → kerala
 */

export const themeMotion = {
  mughal: {
    easing: [0.22, 1, 0.36, 1],
    duration: { fast: 0.9, normal: 1.1, slow: 1.4 },
    stagger: 0.085,
    perspective: '800px',
    extraEffect: 'goldDustBurst',
    wordRevealY: '110%',
    photoTilt: 18,
    cardDepth: 14,
    accent: '#C9A84C',
  },
  temple: {
    easing: [0.4, 0, 0.2, 1],
    duration: { fast: 0.8, normal: 1.0, slow: 1.3 },
    stagger: 0.075,
    perspective: '900px',
    extraEffect: 'brassGlow',
    wordRevealY: '105%',
    photoTilt: 15,
    cardDepth: 12,
    accent: '#DAA520',
  },
  punjabi: {
    easing: [0.34, 1.56, 0.64, 1],
    duration: { fast: 0.5, normal: 0.65, slow: 0.85 },
    stagger: 0.045,
    perspective: '600px',
    extraEffect: 'confettiPop',
    wordRevealY: '120%',
    photoTilt: 22,
    cardDepth: 18,
    accent: '#FFD700',
  },
  bengali: {
    easing: [0.22, 1, 0.36, 1],
    duration: { fast: 1.0, normal: 1.2, slow: 1.6 },
    stagger: 0.095,
    perspective: '700px',
    extraEffect: 'sindoorUnderline',
    wordRevealY: '110%',
    photoTilt: 16,
    cardDepth: 13,
    accent: '#FFD700',
  },
  minimal: {
    easing: [0.4, 0, 0.2, 1],
    duration: { fast: 0.7, normal: 0.9, slow: 1.2 },
    stagger: 0.10,
    perspective: '1200px',
    extraEffect: 'none',
    wordRevealY: '100%',
    photoTilt: 10,
    cardDepth: 8,
    accent: '#D4AF37',
  },
  beach: {
    easing: [0.16, 1, 0.3, 1],
    duration: { fast: 0.7, normal: 0.9, slow: 1.1 },
    stagger: 0.07,
    perspective: '900px',
    extraEffect: 'rippleWave',
    wordRevealY: '108%',
    photoTilt: 16,
    cardDepth: 12,
    accent: '#E9C46A',
  },
  eco: {
    easing: [0.34, 1.28, 0.64, 1],
    duration: { fast: 0.75, normal: 0.95, slow: 1.2 },
    stagger: 0.08,
    perspective: '800px',
    extraEffect: 'leafFlutter',
    wordRevealY: '108%',
    photoTilt: 14,
    cardDepth: 11,
    accent: '#CDDC39',
  },
  christian: {
    easing: [0.25, 0.46, 0.45, 0.94],
    duration: { fast: 0.9, normal: 1.1, slow: 1.4 },
    stagger: 0.09,
    perspective: '1000px',
    extraEffect: 'candleGlow',
    wordRevealY: '105%',
    photoTilt: 12,
    cardDepth: 10,
    accent: '#FFD700',
  },
  nikah: {
    easing: [0.22, 1, 0.36, 1],
    duration: { fast: 0.85, normal: 1.05, slow: 1.35 },
    stagger: 0.082,
    perspective: '900px',
    extraEffect: 'geometricDraw',
    wordRevealY: '108%',
    photoTilt: 14,
    cardDepth: 12,
    accent: '#C5A028',
  },
  kerala: {
    easing: [0.22, 1, 0.36, 1],      // calm water glide
    duration: { fast: 0.9, normal: 1.2, slow: 1.6 },
    stagger: 0.09,
    perspective: '1000px',
    extraEffect: 'waterRipple',
    wordRevealY: '110%',
    photoTilt: 12,
    cardDepth: 10,
    accent: '#D4A24C',
  },
};

/** Map a `themeId` (from masterThemes.js) → themeMotion key. */
export const idToMotionKey = {
  royal_mughal:        'mughal',
  south_indian_temple: 'temple',
  punjabi_sangeet:     'punjabi',
  bengali_traditional: 'bengali',
  modern_minimal:      'minimal',
  beach_destination:   'beach',
  nature_eco_wedding:  'eco',
  christian_elegant:   'christian',
  muslim_nikah:        'nikah',
  kerala_backwaters:   'kerala',
  bollywood_luxury:    'kerala', // alias
};

/** Safe lookup with mughal fallback. */
export const getMotionConfig = (themeId) =>
  themeMotion[idToMotionKey[themeId]] || themeMotion.mughal;
