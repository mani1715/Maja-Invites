/**
 * Punjabi design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Punjabi theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Punjabi = (() => {
  const b = BASE('Punjabi');
  const t = {
    background: '#FFF8E8', accent: '#C8102E', accentGold: '#FFD700',
    text: '#2A0E00', heading: '"Tiro Devanagari Hindi", serif',
    leaf: '#5A6F3D', particle: '#FFD700',
    wash: 'linear-gradient(180deg, rgba(40,10,0,0.20) 0%, rgba(40,10,0,0.05) 40%, rgba(40,10,0,0.45) 100%)',
    textBackdrop: 'rgba(40,10,0,0.55)',
    imageOpacity: 0.95,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'punjabi_engagement_1', title: 'Pink Mandala Engagement', image: `${b}/Engagement/Wedding Inviation Background.jpg`,
          overlays: [O.MANDALA, O.PETALS_ROSE, O.CONFETTI_GOLD, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Punjabi Promise', description: 'A slow-rotating mandala and golden confetti.' },
        { id: 'punjabi_engagement_2', title: 'Palace Engagement', image: `${b}/Engagement/invitation cards,.jpg`,
          overlays: [O.PHULKARI, O.CONFETTI_GOLD, O.PETALS_BOUGAINVILLEA, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Roka Ceremony', description: 'A phulkari border, marigold confetti, joy.' },
        { id: 'punjabi_engagement_3', title: 'Royal Engagement', image: `${b}/Engagement/download (1).jpg`,
          overlays: [O.PEACOCK, O.PETALS_BOUGAINVILLEA, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Royal Roka', description: 'Peacock display, bougainvillea raining down.' },
      ],
      Haldi: [
        { id: 'punjabi_haldi_1', title: 'Haldi & Bhangra', image: `${b}/Haldi/no-text-haldi-courtyard.png`,
          overlays: [O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.CONFETTI_GOLD],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Haldi & Bhangra', description: 'Dhol beats and a sea of marigold.' },
        { id: 'punjabi_haldi_2', title: 'Pink Haldi', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.SWING, O.PETALS_MARIGOLD, O.CONFETTI_GOLD, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Pink Haldi', description: 'A swing, marigold confetti, golden steam.' },
        { id: 'punjabi_haldi_3', title: 'Haldi Pavilion', image: `${b}/Haldi/download (1).jpg`,
          overlays: [O.PHULKARI, O.PETALS_MARIGOLD, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Pavilion Haldi', description: 'Phulkari border and marigold cascade.' },
      ],
      Mehandi: [
        { id: 'punjabi_mehandi_1', title: 'Mehendi at the Haveli', image: `/designs/all/Punjabi/Mehandi/Wedding Illustrationa.jpg`,
          overlays: [O.PHULKARI, O.PETALS_BOUGAINVILLEA, O.GOLD_SHIMMER, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Mehendi at the Haveli', description: 'Phulkari borders, bougainvillea falling.' },
        { id: 'punjabi_mehandi_2', title: 'Garden Mehendi', image: `/designs/all/Punjabi/Mehandi/download.jpg`,
          overlays: [O.PETALS_BOUGAINVILLEA, O.MOROCCAN_LANTERN, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'A Garden Mehendi', description: 'Lanterns lit, magenta petals everywhere.' },
        { id: 'punjabi_mehandi_3', title: 'Family Mehendi', image: `/designs/all/Punjabi/Mehandi/download (1).jpg`,
          overlays: [O.PHULKARI, O.CONFETTI_GOLD, O.PETALS_ROSE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'A Family Mehendi', description: 'Phulkari, roses and golden confetti.' },
      ],
      Marriage: [
        { id: 'punjabi_marriage_1', title: 'Anand Karaj', image: `${b}/Marriage/download.jpg`,
          overlays: [O.SACRED_FIRE, O.LOTUS_BLOOM, O.BRASS_BELLS, O.PETALS_MARIGOLD, O.GOLD_SHIMMER, O.PHULKARI],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Anand Karaj', description: 'Sacred fire, brass bells and phulkari grandeur.' },
        { id: 'punjabi_marriage_2', title: 'Mandap with Chandelier', image: `${b}/Marriage/download (1).jpg`,
          overlays: [O.CHANDELIER, O.PETALS_BOUGAINVILLEA, O.PALM_FROND, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Royal Punjabi Wedding', description: 'Tiered chandeliers, palm fronds and bougainvillea.' },
        { id: 'punjabi_marriage_3', title: 'Domed Mandap', image: `${b}/Marriage/download (2).jpg`,
          overlays: [O.GANESHA_GLOW, O.PEACOCK, O.BRASS_BELLS, O.PETALS_BOUGAINVILLEA, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Pheras at the Dome', description: 'Peacock and brass bells in a golden dome.' },
      ],
      Reception: [
        { id: 'punjabi_reception_1', title: 'Grand Punjabi Reception', image: `${b}/Reception/download.jpg`,
          overlays: [O.CHANDELIER, O.CONFETTI_GOLD, O.FIREFLY, O.PETALS_BOUGAINVILLEA],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Grand Reception', description: 'Chandelier glitter, gold confetti, fireflies.' },
        { id: 'punjabi_reception_2', title: 'Royal Hall Reception', image: `${b}/Reception/download (1).jpg`,
          overlays: [O.CHANDELIER, O.MOROCCAN_LANTERN, O.CONFETTI_GOLD, O.PEACOCK],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Royal Hall', description: 'Chandelier and peacock — pure Punjabi luxury.' },
        { id: 'punjabi_reception_3', title: 'Garden Reception', image: `${b}/Reception/download (2).jpg`,
          overlays: [O.PALM_FROND, O.SKY_LANTERN, O.CONFETTI_GOLD, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Garden Reception', description: 'Palm fronds, sky lanterns and warm fireflies.' },
      ],
      Sangeeth: [
        { id: 'punjabi_sangeeth_1', title: 'Dholki Night', image: `/designs/all/Punjabi/Sangeeth/no-text-sangeet-umbrellas.png`,
          overlays: [O.PHULKARI, O.CONFETTI_GOLD, O.PETALS_BOUGAINVILLEA, O.SKY_LANTERN],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Dholki Night', description: 'Phulkari, dholki beats and golden confetti.' },
        { id: 'punjabi_sangeeth_2', title: 'Sangeet at the Hall', image: `/designs/all/Punjabi/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.CONFETTI_GOLD, O.FIREFLY, O.SKY_LANTERN],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'A Glittering Sangeet', description: 'Chandelier glitter and a thousand spinning dancers.' },
        { id: 'punjabi_sangeeth_3', title: 'Family Sangeet', image: `/designs/all/Punjabi/Sangeeth/download (1).jpg`,
          overlays: [O.SKY_LANTERN, O.CONFETTI_GOLD, O.PETALS_BOUGAINVILLEA, O.FIREFLY],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Family Sangeet', description: 'Sky lanterns above, dance below.' },
      ],
    },
  };
})();

export default Punjabi;
