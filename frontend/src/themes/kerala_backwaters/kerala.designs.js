/**
 * Kerala Backwaters — Design Catalog (18 designs)
 *
 * Each event has 3 design variants. Each design entry encapsulates:
 *  • a poster image (from /designs/all/Kerala_Backwaters/<Event>/...)
 *  • the array of overlay animation IDs that should render on top
 *  • the color palette + text-placement hint
 *
 * The DesignRenderer component reads this and composes the visuals.
 */
import { KERALA_COLORS } from './kerala.colors';

const BASE = '/designs/all/Kerala_Backwaters';

/** Overlay layer IDs the renderer understands (mapped to animation components). */
export const OVERLAY = {
  WATER:        'water',         // WaterRipple
  PETALS_LOTUS: 'petals_lotus',  // PetalFall pink lotus
  PETALS_WHITE: 'petals_white',  // PetalFall white jasmine
  PETALS_MARIGOLD: 'petals_marigold',
  LOTUS_BLOOM:  'lotus_bloom',   // floating lotus SVGs with bob
  LILY_PADS:    'lily_pads',
  BANANA_LEAF:  'banana_leaf',   // LeafSway around frame
  BRASS_BELLS:  'brass_bells',   // PendulumSwing hanging bells
  BRASS_LAMPS:  'brass_lamps',   // LanternGlow + FlameAnimation
  PEACOCK:      'peacock',       // hue-rotate shimmer overlay
  SACRED_FIRE:  'sacred_fire',   // FlameAnimation large
  GOLD_SHIMMER: 'gold_shimmer',  // GoldShimmer on frame
  FIREFLY:      'firefly',       // FireflyParticle gold sparkles
  SKY_LANTERN:  'sky_lantern',   // SkyLanternFloat
  GANESHA_GLOW: 'ganesha_glow',  // CSS pulse on Ganesha icon
  WATER_RIPPLE_RINGS: 'water_ripple_rings', // CSS expanding rings
  HOUSEBOAT:    'houseboat',     // drifting boat
  TURMERIC_STEAM: 'turmeric_steam',
  SWING:        'swing',
};

export const KERALA_DESIGNS = {
  Engagement: [
    {
      id: 'kerala_engagement_1',
      title: 'Aerial Backwater with Lotus & Couple in Boat',
      image: `${BASE}/Engagement/kerala-eng-clean-2.png`,
      overlays: [OVERLAY.WATER, OVERLAY.LOTUS_BLOOM, OVERLAY.LILY_PADS, OVERLAY.WATER_RIPPLE_RINGS, OVERLAY.FIREFLY],
      bg: '#10303A',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.55)',
      textPlacement: 'center',
      headline: 'Engagement on the Backwaters',
      description: 'A deep teal water surface, lotus blooming on every side, the couple\u2019s wooden boat drifting on a gentle ripple.',
    },
    {
      id: 'kerala_engagement_2',
      title: 'Wooden Houseboat at Sunrise',
      image: `${BASE}/Engagement/kerala-eng-clean-1.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.HOUSEBOAT, OVERLAY.PETALS_WHITE, OVERLAY.GOLD_SHIMMER],
      bg: '#10303A',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,30,35,0.50)',
      textPlacement: 'top',
      headline: 'Sunrise Engagement Aboard',
      description: 'Jasmine petals drift over warm teal water as the kettuvallam glides past.',
    },
    {
      id: 'kerala_engagement_3',
      title: 'Couple on the Backwater Swing',
      image: `/designs/textless/kerala_couple_swing.png`,
      overlays: [OVERLAY.WATER, OVERLAY.SWING, OVERLAY.PETALS_LOTUS, OVERLAY.BANANA_LEAF],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.50)',
      textPlacement: 'top',
      headline: 'A Promise by the Water',
      description: 'A garlanded swing over the backwaters — sea, sky and silence between two people.',
    },
  ],

  Haldi: [
    {
      id: 'kerala_haldi_1',
      title: 'Backwater Haldi with Banana Leaves',
      image: `${BASE}/Haldi/kerala-haldi-clean-1.png`,
      overlays: [OVERLAY.WATER, OVERLAY.BANANA_LEAF, OVERLAY.PETALS_MARIGOLD, OVERLAY.TURMERIC_STEAM],
      bg: '#0E4047',
      textColor: '#FFF8DC',
      textBackdrop: 'rgba(20,40,20,0.50)',
      textPlacement: 'bottom',
      headline: 'Haldi by the Lake',
      description: 'Banana leaves sway, marigold petals fall, and warm turmeric steam rises from the brass urns.',
    },
    {
      id: 'kerala_haldi_2',
      title: 'Lake Pavilion Haldi Vibes',
      image: `${BASE}/Haldi/kerala-haldi-clean-2.png`,
      overlays: [OVERLAY.WATER, OVERLAY.SWING, OVERLAY.PETALS_MARIGOLD, OVERLAY.LILY_PADS],
      bg: '#0E4047',
      textColor: '#FFF8DC',
      textBackdrop: 'rgba(20,40,20,0.45)',
      textPlacement: 'top',
      headline: 'A Swing on the Water',
      description: 'A teak swing over the backwaters, garlanded in marigolds — Haldi morning, golden hour.',
    },
    {
      id: 'kerala_haldi_3',
      title: 'Floating Haldi Mandap',
      image: `${BASE}/Haldi/download.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.BANANA_LEAF, OVERLAY.PETALS_MARIGOLD, OVERLAY.FIREFLY, OVERLAY.GOLD_SHIMMER],
      bg: '#0E4047',
      textColor: '#FFF8DC',
      textBackdrop: 'rgba(20,40,20,0.50)',
      textPlacement: 'center',
      headline: 'Turmeric on the Water',
      description: 'A floating mandap dressed in marigold and banana leaf — Haldi, Kerala-style.',
    },
  ],

  Mehandi: [
    {
      id: 'kerala_mehandi_1',
      title: 'Mehandi Pavilion with Lotus Border',
      image: `${BASE}/Mehandi/Wedding Illustrationa.jpg`,
      overlays: [OVERLAY.LOTUS_BLOOM, OVERLAY.PETALS_LOTUS, OVERLAY.BRASS_LAMPS, OVERLAY.GOLD_SHIMMER],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.50)',
      textPlacement: 'bottom',
      headline: 'Henna by the Lake',
      description: 'Lotus garlands frame a quiet evening of henna, conversation and brass-lamp light.',
    },
    {
      id: 'kerala_mehandi_2',
      title: 'Backwater Mehandi at Dusk',
      image: `${BASE}/Mehandi/download.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.PETALS_WHITE, OVERLAY.FIREFLY, OVERLAY.BRASS_LAMPS],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.45)',
      textPlacement: 'top',
      headline: 'Mehandi on the Deck',
      description: 'Fairy-light fireflies on the houseboat deck while henna patterns deepen.',
    },
    {
      id: 'kerala_mehandi_3',
      title: 'Garden Pavilion Henna',
      image: `${BASE}/Mehandi/download (1).jpg`,
      overlays: [OVERLAY.BANANA_LEAF, OVERLAY.PETALS_WHITE, OVERLAY.PETALS_LOTUS, OVERLAY.GOLD_SHIMMER],
      bg: '#10303A',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,30,35,0.45)',
      textPlacement: 'center',
      headline: 'Henna in the Coconut Grove',
      description: 'Banana leaves overhead, white jasmine and pink lotus petals at every step.',
    },
  ],

  Marriage: [
    {
      id: 'kerala_marriage_1',
      title: 'Lakeside Mandap with Brass Lamps',
      image: `${BASE}/Marriage/South Indian wedding invitation card.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.BRASS_LAMPS, OVERLAY.BANANA_LEAF, OVERLAY.SACRED_FIRE, OVERLAY.GANESHA_GLOW, OVERLAY.PETALS_WHITE],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.55)',
      textPlacement: 'center',
      headline: 'Sacred Vows by the Backwater',
      description: 'Brass lamps flicker, sacred fire glows, banana leaves frame the lakeside mandap.',
    },
    {
      id: 'kerala_marriage_2',
      title: 'Temple Boat with Peacock & Lotus',
      image: `${BASE}/Marriage/download (1).jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.HOUSEBOAT, OVERLAY.PEACOCK, OVERLAY.LOTUS_BLOOM, OVERLAY.GOLD_SHIMMER, OVERLAY.PETALS_LOTUS],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.55)',
      textPlacement: 'top',
      headline: 'A Vembanad Wedding',
      description: 'The houseboat as mandap, peacock feathers as ornament, the lake as witness.',
    },
    {
      id: 'kerala_marriage_3',
      title: 'Ganesha Mandap with Hanging Bells',
      image: `${BASE}/Marriage/download.jpg`,
      overlays: [OVERLAY.GANESHA_GLOW, OVERLAY.BRASS_BELLS, OVERLAY.BRASS_LAMPS, OVERLAY.SACRED_FIRE, OVERLAY.GOLD_SHIMMER, OVERLAY.PETALS_WHITE],
      bg: '#0E4047',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,40,45,0.55)',
      textPlacement: 'center',
      headline: 'Blessed by Ganesha',
      description: 'Hanging brass bells, an oil-lamp arch, and Ganesha\u2019s gold glow above the mandap.',
    },
  ],

  Reception: [
    {
      id: 'kerala_reception_1',
      title: 'Backwater Reception at Twilight',
      image: `${BASE}/Reception/kerala-reception-clean-1.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.SKY_LANTERN, OVERLAY.FIREFLY, OVERLAY.PETALS_LOTUS],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.55)',
      textPlacement: 'center',
      headline: 'Twilight on the Lake',
      description: 'Sky lanterns rise above the backwaters as the celebration begins.',
    },
    {
      id: 'kerala_reception_2',
      title: 'Banyan Courtyard Reception',
      image: `${BASE}/Reception/download (1).jpg`,
      overlays: [OVERLAY.FIREFLY, OVERLAY.PETALS_WHITE, OVERLAY.GOLD_SHIMMER, OVERLAY.BRASS_LAMPS],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.45)',
      textPlacement: 'top',
      headline: 'Banyan, Brass, Beloveds',
      description: 'Old banyan tree, brass lamps, jasmine drifting through the warm Kerala night.',
    },
    {
      id: 'kerala_reception_3',
      title: 'Floating Stage Reception',
      image: `${BASE}/Reception/download (3).jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.SKY_LANTERN, OVERLAY.LOTUS_BLOOM, OVERLAY.PETALS_LOTUS, OVERLAY.FIREFLY],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.55)',
      textPlacement: 'center',
      headline: 'A Stage on the Water',
      description: 'The reception floats — quite literally — on a lotus-ringed pavilion.',
    },
  ],

  Sangeeth: [
    {
      id: 'kerala_sangeeth_1',
      title: 'Sangeeth on the Houseboat',
      image: `${BASE}/Sangeeth/download.jpg`,
      overlays: [OVERLAY.WATER, OVERLAY.SKY_LANTERN, OVERLAY.FIREFLY, OVERLAY.HOUSEBOAT],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.55)',
      textPlacement: 'center',
      headline: 'Veena & Dholak on the Water',
      description: 'Floating stage. Family band. Fireflies for spotlight.',
    },
    {
      id: 'kerala_sangeeth_2',
      title: 'Welcome Sign Sangeeth',
      image: `${BASE}/Sangeeth/Editable Pink Mehndi Welcome Sign & Invitation _ 2 in 1 Sangeet Dholki Canva Template Bundle.jpg`,
      overlays: [OVERLAY.PETALS_LOTUS, OVERLAY.GOLD_SHIMMER, OVERLAY.FIREFLY],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.45)',
      textPlacement: 'bottom',
      headline: 'Sangeeth Dholki Night',
      description: 'Pink lotus and gold filigree announce the night\u2019s music.',
    },
    {
      id: 'kerala_sangeeth_3',
      title: 'Garden Stage Sangeeth',
      image: `${BASE}/Sangeeth/download (1).jpg`,
      overlays: [OVERLAY.BANANA_LEAF, OVERLAY.SKY_LANTERN, OVERLAY.FIREFLY, OVERLAY.PETALS_WHITE],
      bg: '#0B2A33',
      textColor: KERALA_COLORS.text,
      textBackdrop: 'rgba(5,25,30,0.50)',
      textPlacement: 'top',
      headline: 'Garden Stage Sangeeth',
      description: 'Banana leaves overhead, lanterns above, jasmine in the air.',
    },
  ],
};

export const KERALA_EVENTS = ['Engagement', 'Haldi', 'Mehandi', 'Marriage', 'Reception', 'Sangeeth'];

export const getDesignsForEvent = (event) => KERALA_DESIGNS[event] || [];
export const getDesignById = (id) => {
  for (const event of KERALA_EVENTS) {
    const found = KERALA_DESIGNS[event].find((d) => d.id === id);
    if (found) return { event, design: found };
  }
  return null;
};
