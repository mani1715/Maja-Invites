/**
 * Sample payload for the live invitation preview.
 *
 * Shaped exactly like `GET /api/invite/{slug}/full` so `GuestInvitationReady`
 * can render it without knowing it is a sample. If that response ever changes
 * shape, the preview breaks in the same way the real page does — which is the
 * point. A preview with its own private data model quietly stops matching the
 * product.
 *
 * The names, dates and venues here are obviously fictional and stay that way.
 * The one thing this file must never do is imply a real couple, a real studio,
 * or a real review.
 */

const IN_A_YEAR = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  d.setMonth(1, 14);           // 14 February next year — reads as a date, not "today"
  d.setHours(18, 30, 0, 0);
  return d.toISOString();
};

/** Non-wedding categories the legacy app had a dedicated preview for. */
export const CATEGORY_SAMPLES = {
  baby_birthday: {
    label: 'Baby birthday',
    celebrant: 'Kiaan',
    kicker: 'Turning one',
    headline: ['Kiaan', 'turns one'],
    story: 'One year of tiny socks, big yawns and a laugh that fills the house. '
      + 'Come eat cake with us.',
    venueName: 'The Garden Room',
  },
  half_saree: {
    label: 'Half saree',
    celebrant: 'Ananya',
    kicker: 'Langa Voni',
    headline: ['Ananya’s', 'half saree'],
    story: 'A morning of silk, turmeric and blessings as Ananya steps into a new '
      + 'chapter, surrounded by everyone who raised her.',
    venueName: 'Sri Kalyana Mandapam',
  },
  puberty: {
    label: 'Manjal Neerattu Vizha',
    celebrant: 'Meera',
    kicker: 'Manjal Neerattu Vizha',
    headline: ['Meera’s', 'coming of age'],
    story: 'Turmeric water, new silks and the women of the family singing — the '
      + 'oldest welcome our house knows.',
    venueName: 'Thirumana Nilayam',
  },
  dhoti: {
    label: 'Vetti Kattum Vizha',
    celebrant: 'Aarav',
    kicker: 'Vetti Kattum Vizha',
    headline: ['Aarav’s', 'dhoti ceremony'],
    story: 'The first veshti, tied by his grandfather, in front of everyone who '
      + 'will teach him how to wear it.',
    venueName: 'Sri Sabha Hall',
  },
};

const WEDDING_SAMPLE = {
  label: 'Wedding',
  headline: ['Aarav', 'Riya'],
  story: 'Two families, one long monsoon evening in Goa, and a yes that took '
    + 'four years and eleven cities to arrive at.',
  venueName: 'Sangam Gardens',
};

export function sampleInviteEnv({ themeId = 'royal_mughal', category = null } = {}) {
  const cat = CATEGORY_SAMPLES[category] || null;
  const s = cat || WEDDING_SAMPLE;
  const eventDate = IN_A_YEAR();

  return {
    invite: {
      // The field the whole theme resolves from — this is what was never read.
      design_id: themeId,
      invitation_category: category || 'wedding',
      event_type: category || 'wedding',

      groom_name: cat ? s.celebrant : 'Aarav',
      bride_name: cat ? '' : 'Riya',
      celebrant_info: cat ? { celebrant_name: s.celebrant } : null,

      event_date: eventDate,
      venue: s.venueName,
      city: 'Goa',

      couple_about: s.story,
      about_couple: s.story,

      sections_enabled: {
        opening: true, welcome: true, couple: true, about: true, family: false,
        love_story: true, photos: false, video: false, events: true, rsvp: true,
        greetings: true, footer: true, contact: false, calendar: true,
        countdown: true, qr: false, decorative_effects: true,
        guest_rooms: false, pre_wedding: false, live_stream: false,
        live_timeline: false, song_requests: false, dress_code: false,
        check_in: false,
      },
      decorative_effects: true,

      events: cat ? [
        { event_id: 'main', name: s.kicker, date: eventDate, time: '18:30',
          venue: s.venueName, enabled: true },
      ] : [
        { event_id: 'mehendi', name: 'Mehendi', date: eventDate, time: '16:00',
          venue: 'Courtyard Lawn', enabled: true },
        { event_id: 'sangeet', name: 'Sangeet', date: eventDate, time: '19:30',
          venue: 'Banquet Hall', enabled: true },
        { event_id: 'wedding', name: 'Wedding', date: eventDate, time: '10:00',
          venue: s.venueName, enabled: true },
      ],

      media: [],
      greetings: [],
      rsvp_settings: {
        dietary_enabled: false, dietary_show_veg: true, dietary_show_nonveg: true,
        dietary_show_vegan: true, dietary_show_jain: true,
        allergies_enabled: true, plus_one_enabled: true, kids_enabled: false,
      },
      requires_watermark: false,
      custom_text: {},
    },

    venues: {
      main_venue: {
        kind: 'main',
        name: s.venueName,
        address: 'Goa',
        links: { google_maps: 'https://maps.google.com/?q=Goa', whatsapp_share: '#' },
      },
      events: [],
    },

    wishes: [
      { id: 'sample-1', status: 'approved', guest_name: 'Aanya',
        message: 'Two souls, one journey. Sending you all the love.',
        is_featured: true },
      { id: 'sample-2', status: 'approved', guest_name: 'Rohan',
        message: 'Front row for every single moment. Congratulations!',
        is_featured: false },
    ],
    blessings: [],
    gifts: null,
    gallery_info: null,
    travel: null,
    referral_code: null,
    shagun: {},
    shagun_enabled: false,
  };
}
