/**
 * Muslim design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Muslim theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Muslim = (() => {
  const b = BASE('Muslim');
  const t = {
    background: '#0C2A3C', accent: '#C9A227', accentGold: '#FFD700',
    text: '#F5ECD7', heading: '"Amiri", serif',
    leaf: '#1B5E20', particle: '#FFE2A8',
    wash: 'linear-gradient(180deg, rgba(0,10,20,0.40) 0%, rgba(0,10,20,0.10) 40%, rgba(0,10,20,0.50) 100%)',
    textBackdrop: 'rgba(5,30,40,0.55)',
    imageOpacity: 0.92,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'muslim_engagement_1', title: 'Star-Lit Engagement', image: `${b}/Engagement/IMG-20260518-WA0019.jpg`,
          overlays: [O.STAR_FIELD, O.CRESCENT_MOON, O.MOROCCAN_LANTERN, O.MIHRAB_GLOW],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Sacred Promise', description: 'Star field, crescent moon and Moroccan lanterns aglow.' },
        { id: 'muslim_engagement_2', title: 'Mashrabiya Engagement', image: `${b}/Engagement/download.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.GOLD_DUST, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Engagement at the Lattice', description: 'Geometric mashrabiya patterns and gold dust drifting.' },
        { id: 'muslim_engagement_3', title: 'Garden Nikah Engagement', image: `${b}/Engagement/download (1).jpg`,
          overlays: [O.MIHRAB_GLOW, O.PETALS_ROSE, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'A Garden Engagement', description: 'Mihrab arch glowing, roses drifting past.' },
      ],
      Haldi: [
        { id: 'muslim_haldi_1', title: 'Manjha Ceremony', image: `${b}/Haldi/Haldi Theme for wedding Invitation.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Manjha Day', description: 'Yellow, gold and the smell of turmeric — a Manjha morning.' },
        { id: 'muslim_haldi_2', title: 'Manjha Layout', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.SWING, O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Manjha at the Pavilion', description: 'A jewelled swing, marigold petals raining down.' },
        { id: 'muslim_haldi_3', title: 'Mehendi & Manjha', image: `${b}/Haldi/Mehendi invitation template.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.MOROCCAN_LANTERN, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Manjha & Mehendi', description: 'A double celebration — yellow and henna.' },
      ],
      Mehandi: [
        { id: 'muslim_mehandi_1', title: 'Henna Pavilion at Night', image: `/designs/all/Muslim/Mehandi/IMG-20260518-WA0011.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.STAR_FIELD, O.CRESCENT_MOON, O.PETALS_WHITE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'Mehandi Night', description: 'Stars, lanterns and a crescent moon over the henna pavilion.' },
        { id: 'muslim_mehandi_2', title: 'Garden Henna', image: `/designs/all/Muslim/Mehandi/IMG-20260518-WA0012.jpg`,
          overlays: [O.PALM_FROND, O.MOROCCAN_LANTERN, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Henna in the Garden', description: 'Palm fronds overhead, lanterns lit, jasmine drifting.' },
        { id: 'muslim_mehandi_3', title: 'Indoor Mehandi', image: `/designs/all/Muslim/Mehandi/download.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.GOLD_SHIMMER, O.PETALS_ROSE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Mehandi at Home', description: 'Lanterns sway, gold shimmers, roses drift.' },
      ],
      Marriage: [
        { id: 'muslim_marriage_1', title: 'Nikah at the Persian Carpet', image: `${b}/Marriage/download (1).jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.MIHRAB_GLOW, O.GOLD_SHIMMER, O.PETALS_ROSE, O.STAR_FIELD],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Bismillah · Nikah', description: 'Persian carpet, Moroccan lanterns and the mihrab glowing warmly.' },
        { id: 'muslim_marriage_2', title: 'Garden Nikah', image: `${b}/Marriage/download (2).jpg`,
          overlays: [O.PALM_FROND, O.MOROCCAN_LANTERN, O.MIHRAB_GLOW, O.PETALS_WHITE],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Nikah in the Garden', description: 'Palm fronds, lanterns and jasmine — a quiet ceremony.' },
        { id: 'muslim_marriage_3', title: 'Velvet Nikah Hall', image: `${b}/Marriage/download (3).jpg`,
          overlays: [O.CHANDELIER, O.MOROCCAN_LANTERN, O.GOLD_DUST, O.PETALS_ROSE],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Nikah at the Hall', description: 'Chandelier, lanterns and rose petals on the velvet carpet.' },
      ],
      Reception: [
        { id: 'muslim_reception_1', title: 'Walima Night', image: `${b}/Reception/IMG-20260518-WA0034.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.STAR_FIELD, O.GOLD_DUST, O.PETALS_ROSE],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Walima Reception', description: 'Lanterns and gold dust drifting across the dance floor.' },
        { id: 'muslim_reception_2', title: 'Garden Walima', image: `${b}/Reception/IMG-20260518-WA0036.jpg`,
          overlays: [O.PALM_FROND, O.SKY_LANTERN, O.PETALS_WHITE, O.FIREFLY],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Walima in the Garden', description: 'Sky lanterns drift, palm fronds sway, fireflies blink.' },
        { id: 'muslim_reception_3', title: 'Walima at the Hall', image: `${b}/Reception/WhatsApp Image 2026-05-19 at 12.50.42 PM.jpeg`,
          overlays: [O.CHANDELIER, O.MOROCCAN_LANTERN, O.PETALS_ROSE, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Grand Walima', description: 'A chandelier above, lanterns on the walls, roses raining down.' },
      ],
      Sangeeth: [
        { id: 'muslim_sangeeth_1', title: 'Qawwali Night', image: `/designs/all/Muslim/Sangeeth/Editable Pink Mehndi Welcome Sign & Invitation _ 2 in 1 Sangeet Dholki Canva Template Bundle.jpg`,
          overlays: [O.MOROCCAN_LANTERN, O.STAR_FIELD, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Qawwali Night', description: 'Lanterns and stars, gold confetti and the sound of harmonium.' },
        { id: 'muslim_sangeeth_2', title: 'Sangeeth at the Hall', image: `/designs/all/Muslim/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.SKY_LANTERN, O.CONFETTI_GOLD, O.FIREFLY],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Sangeet Night', description: 'Chandelier sparkle, sky lanterns and gold confetti.' },
        { id: 'muslim_sangeeth_3', title: 'Garden Sangeet', image: `/designs/all/Muslim/Sangeeth/download (1).jpg`,
          overlays: [O.PALM_FROND, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Garden Sangeet', description: 'Palm fronds sway as lanterns float overhead.' },
      ],
    },
  };
})();

export default Muslim;
