/**
 * Christian design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Christian theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Christian = (() => {
  const b = BASE('Christian');
  const t = {
    background: '#161830', accent: '#D4A24C', accentGold: '#FFD700',
    text: '#F8F4EC', heading: '"Cormorant", serif',
    leaf: '#7A9A6A', particle: '#FFE2A8',
    wash: 'linear-gradient(180deg, rgba(20,20,40,0.40) 0%, rgba(20,20,40,0.06) 40%, rgba(20,20,40,0.45) 100%)',
    textBackdrop: 'rgba(20,20,40,0.55)',
    imageOpacity: 0.92,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'christian_engagement_1', title: 'Garden Engagement', image: `${b}/Engagement/christian-eng-clean-1.png`,
          overlays: [O.PETALS_ROSE, O.EUCALYPTUS, O.CHURCH_DOVE, O.GOLD_DUST],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'top',
          headline: 'A Garden Promise', description: 'White doves, sage eucalyptus and rose petals everywhere.' },
        { id: 'christian_engagement_2', title: 'Save the Date', image: `${b}/Engagement/download.jpg`,
          overlays: [O.PETALS_ROSE, O.STAINED_GLASS, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'center',
          headline: 'Save the Date', description: 'Stained-glass light dapples the page; roses fall.' },
        { id: 'christian_engagement_3', title: 'Romantic Engagement', image: `${b}/Engagement/download (1).jpg`,
          overlays: [O.PETALS_ROSE, O.CHURCH_CANDLES, O.GOLD_DUST],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'bottom',
          headline: 'By Candlelight', description: 'Candles flicker, roses drift, the night softens.' },
      ],
      Haldi: [
        { id: 'christian_haldi_1', title: 'Sangeet & Mehendi', image: `${b}/Haldi/christian-haldi-clean-1.png`,
          overlays: [O.PETALS_MARIGOLD, O.EUCALYPTUS, O.GOLD_DUST],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'top',
          headline: 'Pre-Wedding Brunch', description: 'A bright Indo-Christian morning of celebration.' },
        { id: 'christian_haldi_2', title: 'Morning Reception', image: `${b}/Haldi/christian-haldi-clean-2.png`,
          overlays: [O.PETALS_MARIGOLD, O.PETALS_WHITE, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'center',
          headline: 'Morning Celebration', description: 'Yellow, gold and the first light of the wedding day.' },
        { id: 'christian_haldi_3', title: 'Welcome Brunch', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'bottom',
          headline: 'A Welcome Brunch', description: 'Eucalyptus, white roses and quiet conversation.' },
      ],
      Mehandi: [
        { id: 'christian_mehandi_1', title: 'Mehendi & Sangeet', image: `/designs/all/Christian/Mehandi/Wedding Illustrationa.jpg`,
          overlays: [O.PETALS_ROSE, O.EUCALYPTUS, O.GOLD_SHIMMER, O.CHURCH_CANDLES],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Mehendi Evening', description: 'Candles and roses, henna patterns deepening.' },
        { id: 'christian_mehandi_2', title: 'Garden Mehendi', image: `/designs/all/Christian/Mehandi/download (1).jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Garden Mehendi', description: 'Eucalyptus and jasmine, drifting white petals.' },
        { id: 'christian_mehandi_3', title: 'Mehendi Ceremony', image: `/designs/all/Christian/Mehandi/haldi ceremony templates printables.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.PETALS_ROSE, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Mehendi Day', description: 'Marigold and rose, a long beautiful afternoon.' },
      ],
      Marriage: [
        { id: 'christian_marriage_1', title: 'Cathedral Wedding', image: `${b}/Marriage/Invite Template.jpg`,
          overlays: [O.CHURCH_CANDLES, O.CHURCH_DOVE, O.STAINED_GLASS, O.PETALS_ROSE, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'I Do', description: 'Cathedral doors open, the dove flies out, roses fall.' },
        { id: 'christian_marriage_2', title: 'Garden Path Wedding', image: `${b}/Marriage/download.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST, O.CHURCH_DOVE],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Vows in the Garden', description: 'A path of eucalyptus, white roses underfoot.' },
        { id: 'christian_marriage_3', title: 'Grand Golden Frame', image: `${b}/Marriage/download (1).jpg`,
          overlays: [O.SUNBURST, O.PETALS_ROSE, O.GOLD_SHIMMER, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'A Golden Vow', description: 'Sunburst rays and a hundred drifting petals.' },
      ],
      Reception: [
        { id: 'christian_reception_1', title: 'Save the Date Reception', image: `${b}/Reception/christian-reception-clean-1.png`,
          overlays: [O.PETALS_ROSE, O.EUCALYPTUS, O.FIREFLY, O.GOLD_DUST],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'top',
          headline: 'A Quiet Reception', description: 'Roses, eucalyptus and warm fireflies.' },
        { id: 'christian_reception_2', title: 'Love Story Reception', image: `${b}/Reception/christian-reception-clean-2.png`,
          overlays: [O.PETALS_ROSE, O.CHANDELIER, O.GOLD_SHIMMER],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'center',
          headline: 'Our Love Story', description: 'Chandelier sparkle, rose petals across the floor.' },
        { id: 'christian_reception_3', title: 'Reception Toast', image: `${b}/Reception/christian-reception-clean-3.png`,
          overlays: [O.CHURCH_CANDLES, O.PETALS_ROSE, O.GOLD_DUST, O.FIREFLY],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'bottom',
          headline: 'A Reception Toast', description: 'Candlelight, fireflies and a thousand soft moments.' },
      ],
      Sangeeth: [
        { id: 'christian_sangeeth_1', title: 'Welcome Sangeet', image: `/designs/all/Christian/Sangeeth/Editable Pink Mehndi Welcome Sign & Invitation _ 2 in 1 Sangeet Dholki Canva Template Bundle.jpg`,
          overlays: [O.PETALS_ROSE, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'top',
          headline: 'Welcome to the Sangeet', description: 'Sky lanterns, fireflies and a great deal of dancing.' },
        { id: 'christian_sangeeth_2', title: 'Sangeet at the Hall', image: `/designs/all/Christian/Sangeeth/download.jpg`,
          overlays: [O.CHANDELIER, O.PETALS_ROSE, O.CONFETTI_GOLD, O.FIREFLY],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'center',
          headline: 'A Glittering Sangeet', description: 'Chandelier above, gold confetti below.' },
        { id: 'christian_sangeeth_3', title: 'Garden Sangeet', image: `/designs/all/Christian/Sangeeth/download (1).jpg`,
          overlays: [O.EUCALYPTUS, O.SKY_LANTERN, O.FIREFLY, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#1A1530'), textPlacement: 'bottom',
          headline: 'Garden Sangeet', description: 'Eucalyptus and lanterns over a dancing crowd.' },
      ],
    },
  };
})();

export default Christian;
