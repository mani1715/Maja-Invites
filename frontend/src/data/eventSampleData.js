/**
 * eventSampleData.js — the sample invitation shown in every EVENT preview surface.
 * ================================================================================
 *
 * Why: a browse visitor (home page, /browse/religious/ganesh, the photographer panel)
 * must see the design as a FINISHED, personalized invitation — exactly like the wedding
 * previews — not a blank template. This is the single source of that sample content, so
 * all three surfaces stay identical and a copy change happens in one place.
 *
 * Shape: identical to the published payload from GET /api/public/events/:slug, so the
 * SAME renderer (EventInvitationView) draws the preview and the real invitation.
 * Not Ganesh-specific — add a key per event type; `sampleEventFor()` falls back to a
 * generic version for any type that has none yet.
 */

/* The sample always points at the NEXT celebration, so the countdown in the preview
   is alive instead of frozen at zero. (Illustrative dates — the buyer sets real ones.) */
const _now = new Date();
const _thisYear = _now.getFullYear();
const YEAR = _now > new Date(`${_thisYear}-08-27T00:00:00`) ? _thisYear + 1 : _thisYear;
const FIRST_YEAR = 2015;

export const GANESH_SAMPLE = {
  event_type: 'ganesh_chaturthi',
  event_name: 'Ganesh Chaturthi',
  title: `Ganesh Chaturthi ${YEAR}`,
  start_date: `${YEAR}-08-27`,
  end_date: `${YEAR}-09-06`,
  festival_edition: YEAR - FIRST_YEAR + 1,      // → "11th Year Celebration" on the hero
  since_year: FIRST_YEAR,
  organizer: { name: 'The Sharma Family', phone: '' },
  venue: {
    venue_name: 'Sharma Residence',
    address: 'Road No. 12, Jubilee Hills, Hyderabad',
    google_map_url: 'https://www.google.com/maps/search/?api=1&query=Jubilee+Hills+Hyderabad',
    parking_available: true,
    entry_gate: 'Entry from the east gate',
  },
  content: {
    heading: 'Ganesh Chaturthi',
    subheading: 'You are cordially invited',
    welcome_message:
      'Join us as we welcome Lord Ganesha into our home with prayers, prasadam and joyful celebration. Your presence will make the festivities complete.',
    invitation_note: 'Ganapathi Bappa Morya! May Bappa bless your home with wisdom, health and happiness.',
  },
  about: {
    about_text:
      'Ganesh Chaturthi marks the birth of Lord Ganesha — the remover of obstacles and the god of new beginnings. For eleven days our home becomes his, filled with bhajans, prasadam and the warmth of everyone who visits.',
    meaning_text:
      'Every morning begins with the Sthapana aarti and ends with prasadam shared by all — because a blessing grows when it is shared.',
  },
  journey: [
    { id: 'j1', year: FIRST_YEAR, label: 'Our first Ganesha at home — one small idol, one big promise.' },
    { id: 'j2', year: FIRST_YEAR + 3, label: 'The street joined in; the first Annadanam for 200 guests.' },
    { id: 'j3', year: FIRST_YEAR + 7, label: 'Eco-friendly clay idol and a visarjan procession with dhol.' },
    { id: 'j4', year: YEAR, label: `${YEAR - FIRST_YEAR + 1}th year — eleven days, every family on the street invited.` },
  ],
  schedule: [
    {
      id: 'd1', festival_day: 1, day_label: 'Day 1 · Sthapana', date: `${YEAR}-08-27`,
      is_special: true, special_kind: 'first', special_note: 'Idol installation and the first aarti.',
      items: [
        { time: '06:30 AM', title: 'Sthapana & Pran Pratishtha', note: 'Priest-led' },
        { time: '11:00 AM', title: 'Morning aarti & prasadam' },
        { time: '07:30 PM', title: 'Evening aarti', note: 'Bhajans by the family' },
      ],
    },
    {
      id: 'd2', festival_day: 2, day_label: 'Day 2', date: `${YEAR}-08-28`,
      items: [
        { time: '08:00 AM', title: 'Morning puja' },
        { time: '01:00 PM', title: 'Mahaprasadam lunch' },
        { time: '07:30 PM', title: 'Evening aarti & bhajans' },
      ],
    },
    {
      id: 'd5', festival_day: 5, day_label: 'Day 5 · Annadanam', date: `${YEAR}-08-31`,
      is_special: true, special_kind: 'annadanam', special_note: 'Community meal — everyone is welcome.',
      items: [
        { time: '08:00 AM', title: 'Morning puja' },
        { time: '12:00 PM', title: 'Annadanam', note: 'Lunch served for all' },
        { time: '07:30 PM', title: 'Cultural evening', note: 'Children’s performances' },
      ],
    },
    {
      id: 'd11', festival_day: 11, day_label: 'Day 11 · Visarjan', date: `${YEAR}-09-06`,
      is_special: true, special_kind: 'last', special_note: 'Farewell procession — Ganapathi Bappa Morya!',
      items: [
        { time: '09:00 AM', title: 'Final aarti' },
        { time: '04:00 PM', title: 'Visarjan procession', note: 'Dhol · from the residence' },
      ],
    },
  ],
  highlights: [
    { id: 'h1', title: 'Daily aarti at 7:30 PM' },
    { id: 'h2', title: 'Annadanam on Day 5' },
    { id: 'h3', title: 'Children’s cultural evening' },
    { id: 'h4', title: 'Eco-friendly clay idol' },
    { id: 'h5', title: 'Dhol procession at visarjan' },
  ],
  prasadam: [
    { id: 'p1', item: 'Modak' }, { id: 'p2', item: 'Laddu' }, { id: 'p3', item: 'Puliyogare' },
    { id: 'p4', item: 'Sundal' }, { id: 'p5', item: 'Payasam' },
  ],
  dress_code: { enabled: true, attire: 'Traditional Indian', colors: 'Saffron · cream · gold' },
  countdown: { enabled: true, label: 'Countdown to Sthapana' },
  gallery: [],
  sponsors: [],
  languages: { enabled_languages: ['en', 'te', 'hi'], main_language: 'en' },
  // sample social proof rendered only in preview mode (never fetched)
  _sample_donors: {
    count: 24, total: 148500,
    donors: [
      { id: 's1', name: 'Ramesh & Family', amount: 25000 },
      { id: 's2', name: 'Anitha Reddy', amount: 15000 },
      { id: 's3', name: 'Sai Krishna', amount: 11000 },
      { id: 's4', name: 'Well-wisher', amount: 5100 },
    ],
    causes: ['Mandap', 'Annadanam', 'Decoration'],
    // "where the money went" — the same shape the live leaderboard returns when the
    // host turns on `show_spending`, so the preview shows the real feature.
    spending: {
      spent_total: 96500,
      entries: 18,
      folders: [
        { category: 'Mandap & decoration', amount: 38000 },
        { category: 'Annadanam (food)', amount: 31500 },
        { category: 'Idol & puja items', amount: 14000 },
        { category: 'Sound & lighting', amount: 9000 },
        { category: 'Dhol & procession', amount: 4000 },
      ],
    },
  },
  _sample_blessings: [
    { guest_name: 'Priya', message: 'Ganapathi Bappa Morya! Wishing your family a joyful eleven days.', is_featured: true },
    { guest_name: 'Venkat', message: 'The Annadanam last year was beautiful. See you on Day 5!' },
  ],
  /* Sample gallery for the preview. Uses artwork WE own and ship (our own Ganesh
     template art), each tile framed on a different part of the piece so the grid reads
     as six distinct festival photos. Captioned as samples — never passed off as a real
     customer's photos, and never an external URL that could 404 in a preview.

     NOTE: do NOT use /assets/deities/* here. Those files are 400-byte SVG placeholders
     saved with .webp/.jpg extensions (verified live: Content-Type image/webp, body
     "<svg ...>"), so a browser cannot decode them and the tile renders broken. Only the
     /assets/designs/ganesh/*_preview.webp files are real artwork. */
  _sample_gallery: [
    { label: 'Day 1 · Sthapana', src: '/assets/designs/ganesh/golden_serenity_preview.webp', pos: 'center 20%' },
    { label: 'Morning aarti', src: '/assets/designs/ganesh/royal_autumn_preview.webp', pos: 'center 18%' },
    { label: 'Annadanam', src: '/assets/designs/ganesh/emerald_darbar_preview.webp', pos: 'center 78%' },
    { label: 'Cultural evening', src: '/assets/designs/ganesh/celestial_night_preview.webp', pos: 'center 30%' },
    { label: 'Decoration', src: '/assets/designs/ganesh/blush_blossom_preview.webp', pos: 'center 22%' },
    { label: 'Visarjan', src: '/assets/designs/ganesh/peacock_darbar_preview.webp', pos: 'center 80%' },
  ],
};

const SAMPLES = { ganesh_chaturthi: GANESH_SAMPLE };

/** A finished-looking sample invitation for any event type (generic fallback). */
export function sampleEventFor(eventType, label = '') {
  const s = SAMPLES[eventType];
  if (s) return s;
  const name = label || eventType;
  return {
    event_type: eventType, event_name: name, title: name,
    start_date: `${YEAR}-08-27`, end_date: `${YEAR}-08-27`,
    organizer: { name: 'The Sharma Family' },
    venue: { venue_name: 'Sharma Residence', address: 'Hyderabad' },
    content: {
      heading: name, subheading: 'You are cordially invited',
      welcome_message: `Join us as we celebrate ${name} with prayers and festivities. Your presence will bless the occasion.`,
    },
  };
}

export default GANESH_SAMPLE;
