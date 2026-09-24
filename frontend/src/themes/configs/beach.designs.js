/**
 * Beach design configuration — split from allDesigns.js (Phase 3).
 * Tokens (palette/fonts) + per-event design entries for the Beach theme.
 *
 * 2026-05-29 — full asset refresh: replaced placeholder clean-1/2/3 PNGs
 * with the 17 real Beach design files supplied by the studio (3 per event
 * for Marriage, Mehandi, Reception, Sangeeth; 2 for Engagement; 3 for
 * Haldi). Every entry points at a real, distinct artwork.
 *
 * 2026-05-29 b — overlay strip: the previous config layered 4–6 animated
 * overlays (WATER, PALM_FROND, SEASHELL, SUNSET_GRADIENT, GOLD_SHIMMER, …)
 * on every card. That flattened all 18 designs into a single "generic
 * beach" look and hid the distinctive artwork the studio provided.
 * Overlays are now stripped down to (at most) a single subtle ambient
 * element per card so the real images are the hero — exactly as
 * delivered in the source zip.
 */
import { O, BASE, onDarkText, onLightText } from './_shared';

const Beach = (() => {
  const b = BASE('Beach');
  const t = {
    background: '#005F69', accent: '#E9C46A', accentGold: '#F4D58D',
    text: '#FFF8F2', heading: '"Fraunces", serif',
    leaf: '#7BAE7F', particle: '#FFE2A8', waterHighlight: '#3FA9B3',
    // 2026-05-29 b: wash near-transparent so the studio art shows raw.
    wash: 'linear-gradient(180deg, rgba(0,40,55,0.08) 0%, rgba(0,40,55,0.00) 40%, rgba(0,40,55,0.18) 100%)',
    textBackdrop: 'rgba(0,40,55,0.42)',
    imageOpacity: 1,
  };
  return {
    tokens: t,
    events: {
      Engagement: [
        { id: 'beach_engagement_1', title: 'Ocean Engagement', image: `${b}/Engagement/354f1798d5b54c8741446bd238e6a918.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'center',
          headline: 'An Ocean Promise', description: 'A bottle washes ashore — inside, our invitation.' },
        { id: 'beach_engagement_2', title: 'Coastal Engagement', image: `${b}/Engagement/f8ce1f0efe9f0fff7fd0beb70a7eb60e.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'bottom',
          headline: 'A Coastal Promise', description: 'Coastal sunsets and palm-frond shadows.' },
        // 3rd engagement reuses Haldi/2dab to give three options (studio only delivered 2).
        { id: 'beach_engagement_3', title: 'Sunset Engagement', image: `${b}/Haldi/2dab3834060514adb28252a595357750.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'top',
          headline: 'Sunset Engagement', description: 'Warm sunset, palm fronds and seashells on the shore.' },
      ],
      Haldi: [
        { id: 'beach_haldi_1', title: 'Beach Haldi', image: `${b}/Haldi/2dab3834060514adb28252a595357750.jpg`,
          overlays: [],
          ...onDarkText(t.accent), textPlacement: 'top',
          headline: 'Haldi by the Sea', description: 'Sunset, palms and a sea of marigold.' },
        { id: 'beach_haldi_2', title: 'Sand Haldi', image: `${b}/Haldi/ff7e55d649691eba236abb58b559828d.jpg`,
          overlays: [],
          ...onDarkText(t.accent), textPlacement: 'center',
          headline: 'Haldi on the Sand', description: 'Yellow sand, yellow petals, yellow morning.' },
        { id: 'beach_haldi_3', title: 'Coastal Haldi', image: `${b}/Haldi/download.jpg`,
          overlays: [],
          ...onDarkText(t.accent), textPlacement: 'bottom',
          headline: 'Coastal Haldi Day', description: 'Palm fronds and warm coastal light.' },
      ],
      Mehandi: [
        { id: 'beach_mehandi_1', title: 'Beach Mehendi', image: `${b}/Mehandi/Gemini_Generated_Image_s3k9d5s3k9d5s3k9.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'top',
          headline: 'Mehendi by the Sea', description: 'Seashells, palm fronds and ocean breeze.' },
        { id: 'beach_mehandi_2', title: 'Beach Pavilion Mehendi', image: `${b}/Mehandi/Gemini_Generated_Image_tewctitewctitewc.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'center',
          headline: 'Pavilion Mehendi', description: 'Warm light, palm shadows, jasmine drifting.' },
        { id: 'beach_mehandi_3', title: 'Sunset Mehendi', image: `${b}/Mehandi/Wedding Template.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'bottom',
          headline: 'Sunset Mehendi', description: 'A coastal mehendi as the sun sets.' },
      ],
      Marriage: [
        { id: 'beach_marriage_1', title: 'Vows by the Sea', image: `${b}/Marriage/Gemini_Generated_Image_fs933ffs933ffs93.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'center',
          headline: 'Vows by the Sea', description: 'Ocean rolling, palms swaying, jasmine drifting.' },
        { id: 'beach_marriage_2', title: 'Coastal Mandap', image: `${b}/Marriage/Gemini_Generated_Image_st1hz5st1hz5st1h.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'top',
          headline: 'A Coastal Mandap', description: 'A floating mandap by the breaking waves.' },
        { id: 'beach_marriage_3', title: 'Destination Wedding', image: `${b}/Marriage/Gemini_Generated_Image_ut1248ut1248ut12.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'bottom',
          headline: 'A Destination Wedding', description: 'A bottle, a beach, a beginning.' },
      ],
      Reception: [
        { id: 'beach_reception_1', title: 'Beach Reception', image: `${b}/Reception/Gemini_Generated_Image_18dtlj18dtlj18dt.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'top',
          headline: 'A Beach Reception', description: 'Sky lanterns drift over the ocean.' },
        { id: 'beach_reception_2', title: 'Coastal Reception', image: `${b}/Reception/0e57ba744811bf65c9a07a363c9149d2.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'center',
          headline: 'Coastal Reception', description: 'Sunset glow and palms casting long shadows.' },
        { id: 'beach_reception_3', title: 'Beachfront Reception', image: `${b}/Reception/2631124c8450981707c1903a98de1bf0.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'bottom',
          headline: 'Beachfront Reception', description: 'Waves, palms and warm sky lanterns.' },
      ],
      Sangeeth: [
        { id: 'beach_sangeeth_1', title: 'Beach Sangeet', image: `${b}/Sangeeth/Gemini_Generated_Image_ctsyk1ctsyk1ctsy.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'top',
          headline: 'Beach Sangeet', description: 'Sky lanterns, golden confetti, ocean breeze.' },
        { id: 'beach_sangeeth_2', title: 'Sunset Sangeet', image: `${b}/Sangeeth/Gemini_Generated_Image_ya4k6jya4k6jya4k.png`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'center',
          headline: 'Sunset Sangeet', description: 'A coastal sangeet at golden hour.' },
        { id: 'beach_sangeeth_3', title: 'Sangeet on the Sand', image: `${b}/Sangeeth/a4a20fa4f1f6579c9ea12ae8d9f80661.jpg`,
          overlays: [],
          ...onLightText(t.accent, '#013A45'), textPlacement: 'bottom',
          headline: 'Sangeet on the Sand', description: 'Waves crashing, lanterns drifting.' },
      ],
    },
  };
})();

export default Beach;
