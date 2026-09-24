/**
 * Bengali design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Bengali theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Bengali = (() => {
  const b = BASE('Bengali');
  const t = {
    background: '#F5E4CE', accent: '#CC0000', accentGold: '#FFD700',
    text: '#2C1810', heading: '"Cormorant Garamond", serif',
    leaf: '#2F5D3A', particle: '#FFD700',
    wash: 'linear-gradient(180deg, rgba(45,15,10,0.20) 0%, rgba(45,15,10,0.06) 40%, rgba(45,15,10,0.45) 100%)',
    textBackdrop: 'rgba(45,15,10,0.55)',
    imageOpacity: 0.95,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'bengali_engagement_1', title: 'Ashirbad Engagement', image: `${b}/Engagement/IMG-20260518-WA0015.jpg`,
          overlays: [O.PETALS_LOTUS, O.SHANKHA, O.GOLD_SHIMMER, O.SINDOOR_ARC],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Ashirbad', description: 'Conch-shell glow, lotus petals and a sindoor red arc.' },
        { id: 'bengali_engagement_2', title: 'Engagement at the Mandap', image: `${b}/Engagement/IMG-20260518-WA0017.jpg`,
          overlays: [O.BRASS_BELLS, O.PETALS_LOTUS, O.GOLD_SHIMMER, O.SINDOOR_ARC],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Bengali Engagement', description: 'Brass bells and lotus petals frame the morning.' },
        { id: 'bengali_engagement_3', title: 'Traditional Engagement', image: `${b}/Engagement/download.jpg`,
          overlays: [O.SHANKHA, O.PETALS_LOTUS, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'A Sacred Promise', description: 'The shankha sounds, the alpana is drawn.' },
      ],
      Haldi: [
        { id: 'bengali_haldi_1', title: 'Gaye Holud', image: `${b}/Haldi/Haldi.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.BANANA_LEAF, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Gaye Holud', description: 'Banana leaves overhead, turmeric in every bowl.' },
        { id: 'bengali_haldi_2', title: 'Holud Invitation', image: `${b}/Haldi/Haldi invitation card.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.BRASS_LAMPS, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Gaye Holud Day', description: 'Marigold falls, brass lamps glow.' },
        { id: 'bengali_haldi_3', title: 'Holud Mandap', image: `${b}/Haldi/download.jpg`,
          overlays: [O.BANANA_LEAF, O.PETALS_MARIGOLD, O.SHANKHA, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Holud at the Mandap', description: 'A morning of yellow, banana leaves and gold filigree.' },
      ],
      Mehandi: [
        { id: 'bengali_mehandi_1', title: 'Bengali Mehendi', image: `/designs/all/Bengali/Mehandi/IMG-20260518-WA0027 (1).jpg`,
          overlays: [O.PETALS_LOTUS, O.BRASS_LAMPS, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Bengali Mehendi', description: 'Lotus petals and brass lamps; henna deepens.' },
        { id: 'bengali_mehandi_2', title: 'Garden Mehendi', image: `/designs/all/Bengali/Mehandi/IMG-20260518-WA0033 (1).jpg`,
          overlays: [O.BANANA_LEAF, O.PETALS_LOTUS, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Mehendi in the Garden', description: 'Banana leaves overhead, fuchsia lotus on every side.' },
        { id: 'bengali_mehandi_3', title: 'Pavilion Mehendi', image: `/designs/all/Bengali/Mehandi/download (1).jpg`,
          overlays: [O.BRASS_BELLS, O.PETALS_BOUGAINVILLEA, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Pavilion Mehendi', description: 'Brass bells and magenta bougainvillea.' },
      ],
      Marriage: [
        { id: 'bengali_marriage_1', title: 'Banana Leaf Arch Wedding', image: `${b}/Marriage/IMG-20260518-WA0028.jpg`,
          overlays: [O.BANANA_LEAF, O.BRASS_BELLS, O.PETALS_LOTUS, O.LOTUS_BLOOM, O.SACRED_FIRE, O.GOLD_SHIMMER, O.SHANKHA],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Subho Bibaho', description: 'Banana-leaf arch, brass bells, sacred fire and pink lotus.' },
        { id: 'bengali_marriage_2', title: 'Mandap with Sacred Fire', image: `${b}/Marriage/IMG-20260518-WA0029.jpg`,
          overlays: [O.SACRED_FIRE, O.BRASS_BELLS, O.BANANA_LEAF, O.GANESHA_GLOW, O.SHANKHA],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Pheras of the Bengali', description: 'Brass bells overhead, sacred fire below.' },
        { id: 'bengali_marriage_3', title: 'Peacock & Bougainvillea', image: `${b}/Marriage/IMG-20260518-WA0041.jpg`,
          overlays: [O.PEACOCK, O.BOUGAINVILLEA, O.PETALS_BOUGAINVILLEA, O.BANANA_LEAF, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Peacock Wedding', description: 'A peacock at the arch, bougainvillea everywhere.' },
      ],
      Reception: [
        { id: 'bengali_reception_1', title: 'Bou Bhat Reception', image: `${b}/Reception/IMG-20260518-WA0024.jpg`,
          overlays: [O.CHANDELIER, O.PETALS_ROSE, O.FIREFLY, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Bou Bhat', description: 'Chandelier above, fireflies through the hall.' },
        { id: 'bengali_reception_2', title: 'Garden Bou Bhat', image: `${b}/Reception/IMG-20260518-WA0032.jpg`,
          overlays: [O.BANANA_LEAF, O.PETALS_LOTUS, O.SKY_LANTERN, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Garden Bou Bhat', description: 'Banana leaves overhead, sky lanterns above.' },
        { id: 'bengali_reception_3', title: 'Reception at the Hall', image: `${b}/Reception/IMG-20260518-WA0035.jpg`,
          overlays: [O.CHANDELIER, O.MOROCCAN_LANTERN, O.PETALS_LOTUS, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Reception at the Hall', description: 'Chandelier sparkle, lotus petals on the floor.' },
      ],
      Sangeeth: [
        { id: 'bengali_sangeeth_1', title: 'Sangeet Night', image: `/designs/all/Bengali/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Glittering Sangeet', description: 'Chandelier, sky lanterns and gold confetti.' },
        { id: 'bengali_sangeeth_2', title: 'Stage Sangeet', image: `/designs/all/Bengali/Sangeeth/download (1).jpg`,
          overlays: [O.SKY_LANTERN, O.PETALS_BOUGAINVILLEA, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Stage Sangeet', description: 'Family on stage, sky lanterns drifting overhead.' },
        { id: 'bengali_sangeeth_3', title: 'Garden Sangeet', image: `/designs/all/Bengali/Sangeeth/download (2).jpg`,
          overlays: [O.BANANA_LEAF, O.FIREFLY, O.PETALS_LOTUS, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Garden Sangeet', description: 'Banana leaves and lotus petals frame the night.' },
      ],
    },
  };
})();

export default Bengali;
