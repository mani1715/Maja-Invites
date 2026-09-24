/**
 * Nature design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Nature theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Nature = (() => {
  const b = BASE('Nature');
  const t = {
    background: '#D4E8CC', accent: '#8A9A5B', accentGold: '#B89B72',
    text: '#1A3A1A', heading: '"Fraunces", serif',
    leaf: '#5A6F3D', particle: '#E0C97A',
    wash: 'linear-gradient(180deg, rgba(20,40,15,0.25) 0%, rgba(20,40,15,0.04) 40%, rgba(20,40,15,0.40) 100%)',
    textBackdrop: 'rgba(20,40,15,0.55)',
    imageOpacity: 0.96,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'nature_engagement_1', title: 'Botanical Engagement', image: `${b}/Engagement/Free Digital Backdrop.jpg`,
          overlays: [O.EUCALYPTUS, O.BUTTERFLY, O.PETALS_SAGE, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Botanical Engagement', description: 'Eucalyptus, butterflies and soft sage petals.' },
        { id: 'nature_engagement_2', title: 'Forest Engagement', image: `${b}/Engagement/greenery corner clipart.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_SAGE, O.BUTTERFLY],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Forest Engagement', description: 'A path of greenery and one drifting butterfly.' },
        { id: 'nature_engagement_3', title: 'Garden Engagement', image: `${b}/Engagement/download.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST, O.BUTTERFLY],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Garden Engagement', description: 'Eucalyptus and white roses in soft light.' },
      ],
      Haldi: [
        { id: 'nature_haldi_1', title: 'Eco Haldi', image: `${b}/Haldi/Haldi Theme for wedding Invitation.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.EUCALYPTUS, O.TURMERIC_STEAM, O.BUTTERFLY],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'An Eco Haldi', description: 'Marigold on banana leaves, butterflies overhead.' },
        { id: 'nature_haldi_2', title: 'Garden Haldi', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.SWING, O.PETALS_MARIGOLD, O.EUCALYPTUS, O.TURMERIC_STEAM],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Garden Haldi', description: 'A vine-laden swing, marigold petals everywhere.' },
        { id: 'nature_haldi_3', title: 'Forest Haldi', image: `${b}/Haldi/download.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Forest Haldi Day', description: 'Eucalyptus and golden steam at dawn.' },
      ],
      Mehandi: [
        { id: 'nature_mehandi_1', title: 'Garden Mehendi', image: `/designs/all/Nature/Mehandi/Wedding Illustrationa.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_SAGE, O.BUTTERFLY, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Quiet Mehendi', description: 'Sage and eucalyptus, butterflies in soft light.' },
        { id: 'nature_mehandi_2', title: 'Forest Mehendi', image: `/designs/all/Nature/Mehandi/download (1).jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.BUTTERFLY, O.GOLD_DUST],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Forest Mehendi', description: 'Quiet shade, drifting jasmine, slow afternoon.' },
        { id: 'nature_mehandi_3', title: 'Botanical Mehendi', image: `/designs/all/Nature/Mehandi/haldi ceremony templates printables.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.EUCALYPTUS, O.BUTTERFLY],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Botanical Mehendi', description: 'Marigold, eucalyptus and one drifting butterfly.' },
      ],
      Marriage: [
        { id: 'nature_marriage_1', title: 'Eco Wedding', image: `${b}/Marriage/IMG-20260518-WA0023.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.BUTTERFLY, O.GOLD_DUST, O.SACRED_FIRE],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'An Eco Wedding', description: 'Bamboo mandap, marigold, butterflies overhead.' },
        { id: 'nature_marriage_2', title: 'Banana-Leaf Wedding', image: `${b}/Marriage/wedding invitation.jpg`,
          overlays: [O.BANANA_LEAF, O.BRASS_BELLS, O.SACRED_FIRE, O.PETALS_WHITE, O.GOLD_SHIMMER],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'A Banana-Leaf Wedding', description: 'Banana leaves, brass bells and a small sacred fire.' },
        { id: 'nature_marriage_3', title: 'Garden Wedding', image: `${b}/Marriage/download.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_ROSE, O.BUTTERFLY, O.GOLD_DUST, O.SACRED_FIRE],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'A Garden Wedding', description: 'Eucalyptus, roses and quiet vows.' },
      ],
      Reception: [
        { id: 'nature_reception_1', title: 'Forest Reception', image: `${b}/Reception/Dark Forest Green Wedding Invitation, White Fern Floral Invite, Botanical Illustration Design, Moody Green Wedding, Earthy Invitation.jpg`,
          overlays: [O.EUCALYPTUS, O.FIREFLY, O.PETALS_WHITE, O.GOLD_DUST],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Forest Reception', description: 'Dark forest, white ferns and warm fireflies.' },
        { id: 'nature_reception_2', title: 'Garden Reception', image: `${b}/Reception/download.jpg`,
          overlays: [O.EUCALYPTUS, O.SKY_LANTERN, O.FIREFLY, O.PETALS_SAGE],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'A Garden Reception', description: 'Eucalyptus, sky lanterns and slow conversation.' },
        { id: 'nature_reception_3', title: 'Terrace Reception', image: `${b}/Reception/download (1).jpg`,
          overlays: [O.SKY_LANTERN, O.FIREFLY, O.PETALS_SAGE, O.BUTTERFLY],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Terrace Reception', description: 'Sky lanterns, butterflies and a long farm-table.' },
      ],
      Sangeeth: [
        { id: 'nature_sangeeth_1', title: 'Forest Sangeet', image: `/designs/all/Nature/Sangeeth/Editable Pink Mehndi Welcome Sign & Invitation _ 2 in 1 Sangeet Dholki Canva Template Bundle.jpg`,
          overlays: [O.SKY_LANTERN, O.FIREFLY, O.PETALS_SAGE, O.CONFETTI_GOLD],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'top',
          headline: 'A Forest Sangeet', description: 'Sky lanterns float, fireflies blink, music plays.' },
        { id: 'nature_sangeeth_2', title: 'Garden Sangeet', image: `/designs/all/Nature/Sangeeth/download.jpg`,
          overlays: [O.EUCALYPTUS, O.SKY_LANTERN, O.FIREFLY, O.PETALS_SAGE],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'center',
          headline: 'Garden Sangeet', description: 'Eucalyptus garlands and sky lanterns.' },
        { id: 'nature_sangeeth_3', title: 'Outdoor Sangeet', image: `/designs/all/Nature/Sangeeth/download (1).jpg`,
          overlays: [O.SKY_LANTERN, O.FIREFLY, O.PETALS_SAGE, O.BUTTERFLY],
          ...onLightText(t.accent, '#5A1228'), textPlacement: 'bottom',
          headline: 'Outdoor Sangeet', description: 'Butterflies and a thousand drifting lights.' },
      ],
    },
  };
})();

export default Nature;
