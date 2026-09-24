/**
 * Generated from fulfillment request MAJA-DEMO01.
 * Content only — no markup. index.jsx reads everything from here, so copy can
 * be corrected without touching the design, and the design can be reworked
 * without risking the couple's details.
 */
const data = {
  // Identity — `slug` MUST match the backing profile, or RSVP/wishes/gallery
  // will post into a void. Leave it null only for a pure static preview.
  slug: 'meera-and-kabir-showcase',
  fulfillment_code: 'MAJA-DEMO01',

  bride: 'Meera',
  groom: 'Kabir',
  event_label: 'The Wedding',
  event_date: '2026-09-01T18:30:00+05:30',
  // Set to close the link after the event. Enforced by the route, not here.
  expires_at: null,

  venue: {
    name: 'Rambagh Palace',
    city: 'Jaipur, Rajasthan',
    map_link: 'https://maps.google.com/?q=Rambagh+Palace+Jaipur',
  },

  story:
    'They met in the queue for a sold-out concert neither of them got into. ' +
    'Kabir had a spare pair of earphones; Meera had a thermos of chai. They ' +
    'spent the evening on the pavement outside, listening to the bass leak ' +
    'through the wall, and decided that was the better show.',

  people: [
    {
      name: 'Meera',
      role: 'The Bride',
      photo: '/uploads/weddings/bac1c728-60c3-42be-94b3-fd9133656964/live/bride.jpg',
      about:
        'A textile designer who reads three books at once and remembers none ' +
        'of the endings. Meera grew up between Jaipur and Kochi, and still ' +
        'argues that both are home.',
    },
    {
      name: 'Kabir',
      role: 'The Groom',
      photo: '/uploads/weddings/bac1c728-60c3-42be-94b3-fd9133656964/live/groom.jpg',
      about:
        'A jazz drummer turned schoolteacher. Kabir makes terrible puns, ' +
        'excellent filter coffee, and has never once been on time.',
    },
  ],

  gallery: [
    { url: '/uploads/weddings/bac1c728-60c3-42be-94b3-fd9133656964/live/couple.jpg', caption: 'Meera & Kabir' },
    { url: '/uploads/weddings/bac1c728-60c3-42be-94b3-fd9133656964/live/bride.jpg', caption: 'Meera' },
    { url: '/uploads/weddings/bac1c728-60c3-42be-94b3-fd9133656964/live/groom.jpg', caption: 'Kabir' },
  ],

  schedule: [
    { name: 'Mehendi',   when: '30 August 2026 · 4:00 PM',  where: 'Palace Courtyard' },
    { name: 'Sangeet',   when: '31 August 2026 · 7:00 PM',  where: 'Durbar Hall' },
    { name: 'Wedding',   when: '1 September 2026 · 6:30 PM', where: 'Rambagh Palace Lawns' },
  ],
};

export default data;
