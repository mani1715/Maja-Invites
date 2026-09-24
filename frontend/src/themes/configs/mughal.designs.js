/**
 * Mughal design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Mughal theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Mughal = (() => {
  const b = BASE('Mughal');
  const t = {
    background: '#E8D4A8', accent: '#C8A45D', accentGold: '#E8C97A',
    text: '#2C1810', heading: '"Cinzel Decorative", serif',
    leaf: '#4A5D3A', particle: '#E8C97A',
    wash: 'linear-gradient(180deg, rgba(40,20,10,0.20) 0%, rgba(40,20,10,0.05) 40%, rgba(40,20,10,0.40) 100%)',
    textBackdrop: 'rgba(40,20,10,0.55)',
    imageOpacity: 0.95,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'mughal_engagement_1', title: 'Ring Ceremony at the Arch', image: `${b}/Engagement/Engagement template.jpg`,
          overlays: [O.WISTERIA, O.PETALS_ROSE, O.CHURCH_CANDLES, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Engagement at the Mughal Arch', description: 'Wisteria drifts down, candles flicker, roses on every side.' },
        { id: 'mughal_engagement_2', title: 'Palace Garden Engagement', image: `${b}/Engagement/palace-garden-engagement.jpg`,
          overlays: [O.PEACOCK, O.LOTUS_BLOOM, O.PALM_FROND, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Palace Promise', description: 'Peacock at the balustrade, lotus on the water.' },
        { id: 'mughal_engagement_3', title: 'Palace Domes & Peacocks', image: `${b}/Engagement/download.jpg`,
          overlays: [O.PEACOCK, O.BRASS_LAMPS, O.PALM_FROND, O.PETALS_ROSE],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Domes & Peacocks', description: 'Diyas on the dome edges, peacocks watching from above.' },
      ],
      Haldi: [
        { id: 'mughal_haldi_1', title: 'Royal Haldi · Peacocks & Lattice', image: `/designs/textless/haldi_peacocks_lattice.png`,
          overlays: [O.SWING, O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Royal Haldi', description: 'Peacocks at the lattice, marigold cascading down, turmeric warm on the breeze.' },
        { id: 'mughal_haldi_2', title: 'Haldi at the Palace Courtyard', image: `${b}/Haldi/Haldi Theme for wedding Invitation.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.PEACOCK, O.GOLD_SHIMMER, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Palace Haldi', description: 'Peacock above, turmeric below, marigold all around.' },
        { id: 'mughal_haldi_3', title: 'Grand Mughal Haldi Pavilion', image: `/designs/textless/haldi_mughal_pavilion.png`,
          overlays: [O.PETALS_MARIGOLD, O.MOROCCAN_LANTERN, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Mughal Haldi Day', description: 'Marigold arches over a pink pavilion, brass lamps awaiting the bride.' },
      ],
      Mehandi: [
        { id: 'mughal_mehandi_1', title: 'Mughal Henna Pavilion', image: `/designs/all/Mughal/Mehandi/Wedding Illustrationa.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.PETALS_WHITE, O.GOLD_SHIMMER, O.PETALS_ROSE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Henna at the Palace', description: 'Moroccan lanterns sway, rose and white petals drift.' },
        { id: 'mughal_mehandi_2', title: 'Garden Mehandi', image: `/designs/all/Mughal/Mehandi/download.jpg`,
          overlays: [O.WISTERIA, O.PETALS_ROSE, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Mehandi in the Wisteria', description: 'Wisteria florets drift past the henna artist.' },
        { id: 'mughal_mehandi_3', title: 'Royal Henna Night', image: `/designs/all/Mughal/Mehandi/download (1).jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.STAR_FIELD, O.CRESCENT_MOON, O.PETALS_WHITE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'A Royal Henna Night', description: 'Under stars and crescent moon, lanterns lit.' },
      ],
      Marriage: [
        { id: 'mughal_marriage_1', title: 'Palace Wedding', image: `${b}/Marriage/3173d9216524700e93025f232b185831.jpg`,
          overlays: [O.PEACOCK, O.LOTUS_BLOOM, O.BRASS_LAMPS, O.WATER, O.PETALS_BOUGAINVILLEA, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Palace Wedding', description: 'Peacock tail, lotus bloom, brass lamps and water rippling beneath.' },
        { id: 'mughal_marriage_2', title: 'Mughal Mandap', image: `${b}/Marriage/download.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.SACRED_FIRE, O.PALM_FROND, O.PETALS_ROSE, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Pheras at the Palace', description: 'Sacred fire framed by Moroccan lanterns and palm fronds.' },
        { id: 'mughal_marriage_3', title: 'Royal Wedding Arch', image: `${b}/Marriage/download (1).jpg`,
          overlays: [O.PEACOCK, O.BRASS_BELLS, O.LOTUS_BLOOM, O.GOLD_SHIMMER, O.PETALS_BOUGAINVILLEA],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Royal Wedding Arch', description: 'Brass bells overhead, bougainvillea raining down.' },
      ],
      Reception: [
        { id: 'mughal_reception_1', title: 'Bespoke Luxury Reception', image: `${b}/Reception/Bespoke Luxury Wedding Invitations _ Shaandaar Events.jpg`,
          overlays: [O.CHANDELIER, O.WISTERIA, O.PETALS_ROSE, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Mughal Reception', description: 'Chandelier crystals, wisteria florets, roses everywhere.' },
        { id: 'mughal_reception_2', title: 'Mughal Reception Background', image: `${b}/Reception/Elegant Mughal inspired free background for wedding invitations by the Artistree studio.jpg`,
          overlays: [O.PEACOCK, O.GOLD_SHIMMER, O.FIREFLY, O.PETALS_ROSE],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Reception at the Palace', description: 'Peacock display, gold filigree and warm fireflies.' },
        { id: 'mughal_reception_3', title: 'Grand Mughal Hall', image: `${b}/Reception/download.jpg`,
          overlays: [O.CHANDELIER, O.MOROCCAN_LANTERN, O.PETALS_BOUGAINVILLEA, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'A Grand Hall Reception', description: 'Chandelier above, lanterns on the walls, gold dust in the air.' },
      ],
      Sangeeth: [
        { id: 'mughal_sangeeth_1', title: 'Sangeet at the Palace', image: `/designs/textless/sangeeth_pink_umbrellas.png`,
          overlays: [O.MOROCCAN_LANTERN, O.CONFETTI_GOLD, O.FIREFLY, O.PETALS_BOUGAINVILLEA],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Palace Sangeet', description: 'Pink umbrellas overhead, lanterns lit, cushions all around — let the music begin.' },
        { id: 'mughal_sangeeth_2', title: 'Royal Sangeet Stage', image: `/designs/all/Mughal/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Royal Sangeet', description: 'Chandelier sparkle and sky lanterns drift overhead.' },
        { id: 'mughal_sangeeth_3', title: 'Mughal Night Sangeet', image: `/designs/all/Mughal/Sangeeth/download (1).jpg`,
          overlays: [O.STAR_FIELD, O.CRESCENT_MOON, O.MOROCCAN_LANTERN, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Sangeet Under Stars', description: 'A crescent moon, a thousand stars and gold confetti.' },
      ],
    },
  };
})();

export default Mughal;
