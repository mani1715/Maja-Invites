/**
 * Temple design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Temple theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Temple = (() => {
  const b = BASE('Temple');
  const t = {
    background: '#FDF6E8',
    accent: '#B8410E', accentGold: '#D4A24C',
    text: '#2A0E00', heading: '"Cormorant Garamond", serif',
    waterHighlight: '#FFE2A8',
    particle: '#FFD580',
    leaf: '#2F5D3A',
    lotusPink: '#F4A6C0',
    wash: 'linear-gradient(180deg, rgba(40,15,0,0.18) 0%, rgba(40,15,0,0.05) 30%, rgba(40,15,0,0.40) 100%)',
    textBackdrop: 'rgba(40,15,0,0.55)',
    imageOpacity: 0.95,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'temple_engagement_1', title: 'Floral Arch with Couple', image: `${b}/Engagement/WhatsApp Image 2026-05-19 at 12.54.06 PM.jpeg`,
          overlays: [O.PETALS_ROSE, O.GANESHA_GLOW, O.GOLD_SHIMMER, O.GOLD_DUST],
          bg: t.background, ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Sacred Promise', description: 'Rose arch, gold urns, illustrated couple and Ganesha presiding overhead.' },
        { id: 'temple_engagement_2', title: 'Gopuram with Banana Plant & Lotus', image: `${b}/Engagement/WhatsApp Image 2026-05-19 at 12.54.06 PM (1).jpeg`,
          overlays: [O.BANANA_LEAF, O.LOTUS_BLOOM, O.PETALS_LOTUS, O.GANESHA_GLOW],
          bg: '#FFFFFF', textColor: '#2A0E00', textBackdrop: 'rgba(255,255,255,0.70)', textPlacement: 'center',
          headline: 'Engagement at the Temple', description: 'Watercolour gopuram, banana plants and pink lotus petals falling.' },
        { id: 'temple_engagement_3', title: 'Floral Mandap with Brass Lamps', image: `${b}/Engagement/clean-mandap-lotus-garlands.jpg`,
          overlays: [O.BRASS_LAMPS, O.BANANA_LEAF, O.GANESHA_GLOW, O.PETALS_LOTUS],
          bg: '#FBEBE3', textColor: '#5A1810', textBackdrop: 'rgba(255,255,255,0.55)', textPlacement: 'center',
          headline: 'Engagement Day', description: 'Hanging brass lamps, jasmine garlands and a flower-strung mandap.' },
      ],
      Haldi: [
        { id: 'temple_haldi_1', title: 'Swing with Marigold Garlands', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.SWING, O.PETALS_MARIGOLD, O.BANANA_LEAF, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Haldi by the Mandap', description: 'A wooden swing dressed in marigold — the morning glows yellow.' },
        { id: 'temple_haldi_2', title: 'Peacock & Sunflower Courtyard', image: `${b}/Haldi/Haldi Theme for wedding Invitation.jpg`,
          overlays: [O.PEACOCK, O.PETALS_MARIGOLD, O.GOLD_DUST, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Sunflower Haldi', description: 'A peacock at the door and sunflowers everywhere.' },
        { id: 'temple_haldi_3', title: 'Grand Marigold Courtyard', image: `${b}/Haldi/download.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.BRASS_BELLS, O.GOLD_SHIMMER, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Grand Courtyard Haldi', description: 'Pillars wrapped in marigold and a yellow arch above.' },
      ],
      Mehandi: [
        { id: 'temple_mehandi_1', title: 'Henna Pavilion', image: `/designs/all/Temple/Mehandi/download.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.BRASS_LAMPS, O.GOLD_SHIMMER, O.PETALS_WHITE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Mehandi at Twilight', description: 'Lamps lit, henna deepening, marigold falling.' },
        { id: 'temple_mehandi_2', title: 'Garden Mehandi', image: `/designs/all/Temple/Mehandi/download (1).jpg`,
          overlays: [O.BANANA_LEAF, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Henna in the Garden', description: 'Banana leaves overhead, jasmine drifting through.' },
        { id: 'temple_mehandi_3', title: 'Henna Ceremony Bright', image: `/designs/all/Temple/Mehandi/haldi ceremony templates printables.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.GOLD_SHIMMER, O.PEACOCK],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'A Bright Henna Day', description: 'Marigold, peacock and gold filigree corners.' },
      ],
      Marriage: [
        { id: 'temple_marriage_1', title: 'Wooden Mandapam with Brass Lamp', image: `${b}/Marriage/no-text-temple-couple.png`,
          overlays: [O.BRASS_LAMPS, O.BANANA_LEAF, O.SACRED_FIRE, O.GANESHA_GLOW, O.PETALS_WHITE, O.GOLD_SHIMMER],
          bg: '#FBEBC9', ...onLightText(t.accent, '#2A0E00'), textPlacement: 'center',
          headline: 'Sacred Vows', description: 'A carved wooden mandapam, brass diya flickering, jasmine on the column.' },
        { id: 'temple_marriage_2', title: 'Mandap with Sacred Fire & Banana Plants', image: `${b}/Marriage/clean-temple-gopuram.png`,
          overlays: [O.SACRED_FIRE, O.BRASS_BELLS, O.BANANA_LEAF, O.PEACOCK, O.PETALS_MARIGOLD],
          bg: '#FBEBC9', ...onLightText(t.accent, '#2A0E00'), textPlacement: 'top',
          headline: 'Pheras at the Mandap', description: 'Sacred fire, brass bells and banana plants flanking the arch.' },
        { id: 'temple_marriage_3', title: 'Ganesha + Golden Bells Mandap', image: `${b}/Marriage/download (4).jpg`,
          overlays: [O.GANESHA_GLOW, O.BRASS_BELLS, O.LOTUS_BLOOM, O.PEACOCK, O.GOLD_SHIMMER, O.PETALS_LOTUS],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Blessed by Ganesha', description: 'Hanging brass bells, pink lotus and gold filigree archs.' },
      ],
      Reception: [
        { id: 'temple_reception_1', title: 'Brass Lamp Reception', image: `${b}/Reception/1dfd54d9bbaaf30813d7d7c3b0942f9e.jpg`,
          overlays: [O.BRASS_LAMPS, O.CHANDELIER, O.PETALS_ROSE, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Royal Reception', description: 'Chandelier crystals shimmer, fairy-fireflies drift above the floor.' },
        { id: 'temple_reception_2', title: 'Peacock Throne Reception', image: `${b}/Reception/37f3a5da068c06f2cbf0a30b149eb6ea.jpg`,
          overlays: [O.PEACOCK, O.GOLD_SHIMMER, O.PETALS_MARIGOLD, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Peacock Reception', description: 'A peacock-feather backdrop, gold accents, marigold raining down.' },
        { id: 'temple_reception_3', title: 'Garden Reception', image: `${b}/Reception/b09eb1609eb5c8bd686b6d9f6a690ec1.jpg`,
          overlays: [O.PALM_FROND, O.SKY_LANTERN, O.FIREFLY, O.PETALS_WHITE],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Reception in the Garden', description: 'Palm fronds, drifting lanterns and warm fireflies.' },
      ],
      Sangeeth: [
        { id: 'temple_sangeeth_1', title: 'Stage Sangeeth', image: `/designs/all/Temple/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Sangeeth Night', description: 'A glowing stage, lanterns aloft and gold confetti.' },
        { id: 'temple_sangeeth_2', title: 'Bright Sangeeth', image: `/designs/all/Temple/Sangeeth/download (1).jpg`,
          overlays: [O.CONFETTI_GOLD, O.FIREFLY, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Bright Sangeeth', description: 'Spotlights, gold confetti and a night of music.' },
        { id: 'temple_sangeeth_3', title: 'Backstage Sangeeth', image: `/designs/all/Temple/Sangeeth/download (3).jpg`,
          overlays: [O.SKY_LANTERN, O.FIREFLY, O.PETALS_ROSE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Behind-Stage Sangeeth', description: 'A casual sangeeth in the wings — fireflies and laughter.' },
      ],
    },
  };
})();

export default Temple;
