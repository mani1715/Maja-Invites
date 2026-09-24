// portfolioDemoContent.js — fictional sample content for DEMO portfolios only.
//
// Ported from the Claude Design project's `maja-demo.js`
// (design/claude-design/maja-demo.js) as an ES module instead of a
// `window.MAJA_DEMO` IIFE.
//
// ⚠️ HONESTY BOUNDARY — read before using this anywhere new.
// Every value here is invented: the studio, the couples, the reviews, the
// recognitions, the numbers. It exists so the sample portfolios at
// /portfolio-samples can show a *finished* page to a photographer deciding
// which design to buy.
//
// It must NEVER render on a real studio's public page. That is the same rule
// that got DEFAULT_WORKS / DEFAULT_TESTIMONIALS deleted from
// portfolio_service.py, and it is written down in CLAUDE.md as "no fake
// hyping": a real photographer's page shows real uploads and real reviews, or
// it shows nothing. A prospective client reading an invented five-star review
// on a real studio's page is being lied to.
//
// The single gate is `profile.is_demo`. See `demoFallback` below — it is the
// only supported way to reach this data.

export const DEMO_STUDIO = {
  photographer: 'Aarav Mehta',
  studio: 'Aarav Mehta Weddings',
  short: 'AM WEDDINGS',
  mark: 'AM',
  positioning: 'Luxury wedding & destination photography',
  style: 'Candid · Editorial · Cinematic',
  founded: 2014,
  languages: 'English · Hindi · Telugu · Marathi',
  abroad: ['Bali', 'Tuscany', 'Dubai', 'Lisbon'],
};

export const DEMO_CONTACT = {
  phone: '+91 90000 12345',
  whatsapp: '+91 90000 12345',
  email: 'hello@aaravmehtaweddings.example',
  address: 'Road No. 12, Banjara Hills, Hyderabad, Telangana',
  hours: 'Studio visits Mon–Sat, by appointment',
};

export const DEMO_STATS = [
  { n: '12', l: 'Years' },
  { n: '320+', l: 'Weddings' },
  { n: '9', l: 'Countries' },
  { n: '20', l: 'A year, max' },
];

export const DEMO_PROJECTS = [
  {
    no: '01', couple: 'Rhea & Arjun', place: 'Udaipur', date: 'December 2026',
    days: '4 days', cover: 'Cover — palace at dusk',
    blurb: "The forecast said clear. It rained for three of four days, the baraat walked a colonnade instead of a courtyard, and the wedding became quieter and far more beautiful than anyone had planned.",
  },
  {
    no: '02', couple: 'Ananya & Karan', place: 'Goa', date: 'February 2026',
    days: '3 days', cover: 'Cover — ceremony on the sand',
    blurb: 'A sunset ceremony timed to the tide table and a reception that ran until sunrise. The first film we cut entirely on location.',
  },
  {
    no: '03', couple: 'Meera & Dev', place: 'Hyderabad', date: 'November 2025',
    days: '3 days', cover: 'Cover — the mandap at dawn',
    blurb: 'A 5am muhurtham, four hundred relatives and a grandmother who directed the family portraits better than we could have.',
  },
];

export const DEMO_FILMS = [
  { title: 'Rhea & Arjun — Udaipur Wedding Film', meta: 'Udaipur · Wedding film', len: '11:04', note: 'Four days at the lake, cut as one continuous evening.' },
  { title: 'Ananya & Karan — Goa Wedding', meta: 'Goa · Wedding film', len: '08:12', note: 'Ceremony at low tide, reception until sunrise.' },
  { title: 'Kiara & Rohan — Jaipur Highlights', meta: 'Jaipur · Highlight film', len: '07:31', note: 'A haveli, a fort, and six hundred guests.' },
];

export const DEMO_REELS = [
  { title: 'Bridal Morning', len: '00:27', meta: 'Rhea & Arjun · Udaipur', slot: 'Reel — getting ready, 9:16' },
  { title: 'Behind the Baraat', len: '00:31', meta: 'Kiara & Rohan · Jaipur', slot: 'Reel — baraat, 9:16' },
  { title: 'Golden Hour Portraits', len: '00:19', meta: 'Ananya & Karan · Goa', slot: 'Reel — portraits, 9:16' },
  { title: 'Mandap at Dawn', len: '00:42', meta: 'Meera & Dev · Hyderabad', slot: 'Reel — ceremony, 9:16' },
];

export const DEMO_TESTIMONIALS = [
  { t: 'Every moment felt effortless.', by: 'Meera & Dev', meta: 'Hyderabad wedding · Demo review' },
  { t: 'We barely noticed the team during the ceremony. Then the gallery arrived and every single moment we were worried about missing was there.', by: 'Ananya & Karan', meta: 'Goa wedding · Demo review' },
  { t: 'They handed us an object, not a folder. Both families have read the book cover to cover, and my father — who does not cry — cried at the film.', by: 'Rhea & Arjun', meta: 'Udaipur wedding · Demo review' },
];

export const DEMO_RECOGNITION = [
  'Featured Story — Demo feature · 2026',
  'Editorial Feature — Sample publication · 2025',
  'International Wedding Feature — Demo feature · 2025',
  'Studio Recognition — Sample listing · 2024',
];

export const DEMO_PACKAGES = [
  { no: '01', name: 'Essential', line: 'Photography', detail: '8 hours · 1 photographer', inc: ['400+ edited images', 'Online gallery for 2 years', 'Preview within 7 days'], price: 'Sample package — from ₹1,85,000' },
  { no: '02', name: 'Signature', line: 'Photography + Film', detail: '10 hours · 2 photographers', inc: ['800+ edited images', '6–8 minute wedding film', '60-second social reel'], price: 'Sample package — from ₹4,40,000' },
  { no: '03', name: 'Destination', line: 'Full wedding coverage', detail: 'Up to 5 days · creative team', inc: ['Scout day included', 'Wedding film + reels', 'Hand-bound album'], price: 'Sample package — from ₹6,80,000' },
  { no: '04', name: 'Editorial Portraits', line: 'Styled sitting', detail: '2 hours · one location', inc: ['25 retouched frames', 'Art direction included', 'Add-on to any package'], price: 'Sample package — from ₹85,000' },
];

const A = 'Available', L = 'Limited', F = 'Booked';
export const DEMO_AVAILABILITY = {
  2026: [['January', A], ['February', L], ['March', F], ['April', A], ['May', L], ['June', A], ['July', A], ['August', A], ['September', L], ['October', F], ['November', F], ['December', L]],
  2027: [['January', L], ['February', L], ['March', A], ['April', A], ['May', A], ['June', A], ['July', A], ['August', A], ['September', A], ['October', L], ['November', L], ['December', A]],
};

export const DEMO_SOCIAL = [
  { label: 'Instagram', handle: '@aaravmehtaweddings' },
  { label: 'YouTube', handle: 'Aarav Mehta Films' },
  { label: 'Pinterest', handle: 'AM Weddings' },
];

/**
 * The ONLY supported way to reach the demo content.
 *
 * Returns `fallback` for a demo portfolio and `undefined` for a real one, so a
 * caller written as `demoFallback(profile, DEMO_TESTIMONIALS) ?? realTestimonials`
 * degrades to "render nothing" rather than to invented content.
 *
 * NOT named `use...`. It is a plain function with no React state in it, but the
 * `use` prefix made eslint enforce the Rules of Hooks on it: calling it inside a
 * ternary is perfectly fine for a pure function and a build-breaking error for a
 * hook. That failed the production build (`react-hooks/rules-of-hooks`) while
 * dev and the local static preview stayed happy.
 */
export function demoFallback(profile, fallback) {
  return profile && profile.is_demo ? fallback : undefined;
}
