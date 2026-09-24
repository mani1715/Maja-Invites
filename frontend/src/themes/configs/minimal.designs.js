/**
 * Minimal design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Minimal theme.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Minimal = (() => {
  const b = BASE('Minimal');
  const t = {
    background: '#FAFAFA', accent: '#B89B72', accentGold: '#D4A24C',
    text: '#111111', heading: '"Fraunces", serif',
    leaf: '#A1B89A', particle: '#E0C97A',
    wash: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.04) 50%, rgba(0,0,0,0.20) 100%)',
    textBackdrop: 'rgba(255,255,255,0.78)',
    imageOpacity: 0.96,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'minimal_engagement_1', title: 'Quiet Engagement', image: `${b}/Engagement/IMG-20260518-WA0013.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'A Quiet Promise', description: 'One eucalyptus branch, one white rose, one yes.' },
        { id: 'minimal_engagement_2', title: 'Minimal Engagement', image: `${b}/Engagement/IMG-20260518-WA0039.jpg`,
          overlays: [O.EUCALYPTUS, O.GOLD_SHIMMER],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'Save the Date', description: 'A single line. A single flower. A whole life ahead.' },
        { id: 'minimal_engagement_3', title: 'Architectural Engagement', image: `${b}/Engagement/download (1).jpg`,
          overlays: [O.GOLD_SHIMMER, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'An Architectural Promise', description: 'Whitespace and one thin gold line.' },
      ],
      Haldi: [
        { id: 'minimal_haldi_1', title: 'A Quiet Haldi', image: `${b}/Haldi/Haldi Theme for wedding Invitation.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.TURMERIC_STEAM, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'A Quiet Haldi', description: 'Restraint is the luxury — a single bowl, a single morning.' },
        { id: 'minimal_haldi_2', title: 'Soft Haldi', image: `${b}/Haldi/Haldi vibes Layout.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.EUCALYPTUS, O.TURMERIC_STEAM],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'A Soft Haldi', description: 'Marigold on linen, eucalyptus on tile.' },
        { id: 'minimal_haldi_3', title: 'Minimal Haldi', image: `${b}/Haldi/download.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'Minimal Haldi', description: 'One petal at a time.' },
      ],
      Mehandi: [
        { id: 'minimal_mehandi_1', title: 'Quiet Mehendi', image: `${b}/Mehandi/download.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'Quiet Mehendi', description: 'Eucalyptus and jasmine — the room nearly empty, the moment full.' },
        { id: 'minimal_mehandi_2', title: 'Soft Mehendi', image: `${b}/Mehandi/download (1).jpg`,
          overlays: [O.PETALS_WHITE, O.GOLD_SHIMMER],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'A Soft Mehendi', description: 'Whitespace. One bowl. One pattern. One bride.' },
        { id: 'minimal_mehandi_3', title: 'Bright Mehendi', image: `${b}/Mehandi/haldi ceremony templates printables.jpg`,
          overlays: [O.PETALS_MARIGOLD, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'Bright Mehendi', description: 'Marigold and white — nothing else.' },
      ],
      Marriage: [
        { id: 'minimal_marriage_1', title: 'Minimal Wedding', image: `${b}/Marriage/IMG-20260518-WA0030.jpg`,
          overlays: [O.EUCALYPTUS, O.PETALS_WHITE, O.GOLD_SHIMMER, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'I Do', description: 'Whitespace, one gold line, two names.' },
        { id: 'minimal_marriage_2', title: 'Modern Wedding', image: `${b}/Marriage/Wedding template.jpg`,
          overlays: [O.GOLD_SHIMMER, O.PETALS_WHITE, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'A Modern Wedding', description: 'Restraint is the luxury.' },
        { id: 'minimal_marriage_3', title: 'Eucalyptus Wedding', image: `${b}/Marriage/download (1).jpg`,
          overlays: [O.EUCALYPTUS, O.GOLD_DUST, O.PETALS_WHITE],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'A Quiet Vow', description: 'A single sage breath of nature on a white page.' },
      ],
      Reception: [
        { id: 'minimal_reception_1', title: 'Elegant Reception', image: `${b}/Reception/elegant-aesthetic-wedding-card.jpg`,
          overlays: [O.PETALS_ROSE, O.GOLD_SHIMMER, O.FIREFLY],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'An Elegant Reception', description: 'Rose petals on linen, a single gold rim.' },
        { id: 'minimal_reception_2', title: 'Soft Reception', image: `${b}/Reception/IMG-20260518-WA0021.jpg`,
          overlays: [O.PETALS_WHITE, O.GOLD_DUST, O.FIREFLY],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'A Soft Reception', description: 'Quiet music. Quiet laughter. Quiet luxury.' },
        { id: 'minimal_reception_3', title: 'Architectural Reception', image: `${b}/Reception/a06c92f27b432c728120cd59e9112a3e.jpg`,
          overlays: [O.GOLD_SHIMMER, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'An Architectural Reception', description: 'A long table. A single arrangement. A perfect evening.' },
      ],
      Sangeeth: [
        { id: 'minimal_sangeeth_1', title: 'Minimal Sangeet',
          image: `${b}/Sangeeth/Editable Pink Mehndi Welcome Sign & Invitation _ 2 in 1 Sangeet Dholki Canva Template Bundle.jpg`,
          overlays: [O.PETALS_ROSE, O.FIREFLY, O.GOLD_DUST],
          ...onLightText(t.accent, t.text), textPlacement: 'top',
          headline: 'Minimal Sangeet', description: 'Music, light, and almost nothing else.' },
        { id: 'minimal_sangeeth_2', title: 'Modern Sangeet', image: `${b}/Sangeeth/download.jpg`,
          overlays: [O.FIREFLY, O.GOLD_DUST, O.CONFETTI_GOLD],
          ...onLightText(t.accent, t.text), textPlacement: 'center',
          headline: 'A Modern Sangeet', description: 'A single spotlight. A single song.' },
        { id: 'minimal_sangeeth_3', title: 'Quiet Sangeet', image: `${b}/Sangeeth/download (1).jpg`,
          overlays: [O.SKY_LANTERN, O.FIREFLY, O.PETALS_WHITE],
          ...onLightText(t.accent, t.text), textPlacement: 'bottom',
          headline: 'A Quiet Sangeet', description: 'Sky lanterns and a slow waltz.' },
      ],
    },
  };
})();

export default Minimal;
