/**
 * Theme-specific sample (placeholder) data for the preview page.
 * Each theme gets culturally-resonant couple names, story, ceremonies,
 * venue, gifts and digital-shagun details so the preview always feels
 * like a finished invitation — not a skeleton.
 */

export const THEME_SAMPLE_DATA = {
  royal_mughal: {
    bride: 'Anaya', groom: 'Rohan',
    bride_initial: 'A', groom_initial: 'R',
    weddingDateISO: '2026-02-14T18:30:00+05:30',
    weddingDate: 'Saturday, 14 February 2026',
    weddingTime: '6:30 PM',
    venue: 'Falaknuma Palace',
    city: 'Hyderabad, Telangana',
    mapsLink: 'https://maps.google.com/?q=Falaknuma+Palace+Hyderabad',
    story:
      'They met one monsoon evening in Bombay — two architects, one shared umbrella, and a quiet promise that the city would never feel ordinary again. Three years and a thousand letters later, the families gather for four days of music, mehndi and the joy that turns strangers into kin.',
    events: [
      { title: 'Sangeet',       date: '12 Feb 2026 · 7:00 PM', venue: 'Mughal Hall',       desc: 'A night of music, mehndi and laughter.' },
      { title: 'Mehndi',        date: '13 Feb 2026 · 11:00 AM', venue: 'Garden Pavilion',  desc: 'Bride’s mehndi & traditional rituals.' },
      { title: 'Wedding',       date: '14 Feb 2026 · 6:30 PM', venue: 'Falaknuma Palace',  desc: 'The pheras — our forever begins.' },
      { title: 'Reception',     date: '15 Feb 2026 · 8:00 PM', venue: 'Crystal Ballroom',  desc: 'Dinner, dance and our first toast.' },
    ],
    travel: [
      { name: 'Taj Falaknuma',      type: 'Stay',     note: '5 min from venue · ₹18,000/night' },
      { name: 'Hyatt Gachibowli',   type: 'Stay',     note: '12 km · group rate available' },
      { name: 'RGIA Hyderabad',     type: 'Airport',  note: '45 min · shuttle on 14 Feb' },
    ],
    gifts:  { headline: 'With grace, a few gift ideas',         message: 'Your blessings mean the world. If you wish to send love, our humble registry is below.' },
    shagun: { upi: 'anaya.rohan@okhdfcbank',  payee: 'Anaya & Rohan',          msg: 'Your blessings mean more than any gift.' },
    wishes: [
      { from: 'Priya Aunty', text: 'May your love be like the Bombay rains — endless, beautiful, and always welcome.' },
      { from: 'Vivek',       text: 'Three years of letters, and now a lifetime. Couldn’t happen to two finer people.' },
      { from: 'Meera & Arun',text: 'Wishing you music, mehndi, and many monsoon evenings together.' },
    ],
  },
  south_indian_temple: {
    bride: 'Lakshmi', groom: 'Karthik',
    bride_initial: 'L', groom_initial: 'K',
    weddingDateISO: '2026-03-08T05:30:00+05:30',
    weddingDate: 'Sunday, 8 March 2026',
    weddingTime: 'Muhurtham 5:30 AM',
    venue: 'Sri Meenakshi Mandapam', city: 'Madurai, Tamil Nadu',
    mapsLink: 'https://maps.google.com/?q=Meenakshi+Temple+Madurai',
    story:
      'At a Carnatic concert in Chennai, a violinist and a software engineer noticed each other through the crowd. Two years of quiet courtship later, both families said yes on the very first phone call — and so the muhurtham was set with the temple priest the same week.',
    events: [
      { title: 'Mehendi & Pellikuthuru', date: '6 Mar 2026 · 10:00 AM', venue: 'Family Home',          desc: 'Turmeric, mehendi and blessings from the elders.' },
      { title: 'Sangeet',                 date: '7 Mar 2026 · 7:00 PM', venue: 'Temple Hall',          desc: 'Carnatic music and an evening of joy.' },
      { title: 'Muhurtham',               date: '8 Mar 2026 · 5:30 AM', venue: 'Sri Meenakshi Mandapam', desc: 'The sacred hour — tying of the thaali.' },
      { title: 'Reception',               date: '9 Mar 2026 · 7:30 PM', venue: 'Hotel Heritage Madurai',desc: 'Banana-leaf feast and family blessings.' },
    ],
    travel: [
      { name: 'Heritage Madurai',  type: 'Stay',    note: '10 min from temple · group rate' },
      { name: 'Madurai Airport',   type: 'Airport', note: '15 min · pickup arranged' },
    ],
    gifts:  { headline: 'With love, not gifts',                 message: 'Your presence at the muhurtham is the only blessing we seek.' },
    shagun: { upi: 'lakshmi.karthik@okaxis',  payee: 'Lakshmi & Karthik', msg: 'Aashirvad welcome — UPI ki ek tap se.' },
    wishes: [
      { from: 'Subha Mami',  text: 'May Goddess Meenakshi bless your bond with kindness and music forever.' },
      { from: 'Ravi Anna',   text: 'Lakshmi, Karthik — your families are gaining so much. Congratulations da!' },
      { from: 'Ananya & Vikram', text: 'See you at the muhurtham. Bringing extra jasmine flowers.' },
    ],
  },
  modern_minimal: {
    bride: 'Anika', groom: 'Aarav',
    bride_initial: 'A', groom_initial: 'A',
    weddingDateISO: '2026-11-22T17:00:00+05:30',
    weddingDate: 'Sunday, 22 November 2026',
    weddingTime: '5:00 PM',
    venue: 'The Leela Mumbai · Banyan Garden', city: 'Mumbai, Maharashtra',
    mapsLink: 'https://maps.google.com/?q=Leela+Mumbai',
    story:
      'They met on a quiet Sunday at a Bandra bookstore — both reaching for the same Murakami. He bought her chai instead of the book. Two years later, they’ve traded chai for coffee, and a single ring for forever.',
    events: [
      { title: 'Mehndi Brunch',  date: '20 Nov · 11:00 AM', venue: 'Garden Lawn',     desc: 'Brunch, henna, soft jazz.' },
      { title: 'Cocktail',       date: '21 Nov · 7:00 PM', venue: 'Sky Terrace',     desc: 'Champagne, canapés, Mumbai skyline.' },
      { title: 'Wedding',        date: '22 Nov · 5:00 PM', venue: 'Banyan Garden',   desc: 'Sunset vows under the banyan tree.' },
    ],
    travel: [{ name: 'The Leela Mumbai', type: 'Stay', note: 'Negotiated rate · book by 30 Sep' }],
    gifts:  { headline: 'Honeymoon Registry',                   message: 'We’re heading to the Maldives — a coffee for us at sunrise would mean the world.' },
    shagun: { upi: 'anika.aarav@okicici', payee: 'Anika & Aarav', msg: 'Your blessing in any form is treasured.' },
    wishes: [
      { from: 'Tara',       text: 'From a chai date to forever — couldn’t have scripted a better story.' },
      { from: 'Sahil & Diya', text: 'Excited to celebrate the most minimalist Bombay couple we know!' },
    ],
  },
  beach_destination: {
    bride: 'Mira', groom: 'Ishaan',
    bride_initial: 'M', groom_initial: 'I',
    weddingDateISO: '2026-04-18T17:30:00+05:30',
    weddingDate: 'Saturday, 18 April 2026',
    weddingTime: '5:30 PM (Sunset)',
    venue: 'Taj Exotica Goa · Calwaddo Beach', city: 'Benaulim, South Goa',
    mapsLink: 'https://maps.google.com/?q=Taj+Exotica+Goa',
    story:
      'They met on a scuba dive in Lakshadweep. He fixed her regulator. She fixed his life. After 18 months and four coastlines, the only place that made sense for vows was the sea.',
    events: [
      { title: 'Welcome Beach Bonfire', date: '17 Apr · 7:00 PM', venue: 'Calwaddo Beach',       desc: 'Bonfire, sangria, sea breeze.' },
      { title: 'Haldi by the Pool',     date: '18 Apr · 10:00 AM', venue: 'Poolside Garden',     desc: 'Turmeric, breakfast buffet, swim.' },
      { title: 'Sunset Wedding',        date: '18 Apr · 5:30 PM', venue: 'Beach Mandap',         desc: 'Vows as the sun meets the Arabian Sea.' },
      { title: 'After-party',           date: '18 Apr · 10:30 PM', venue: 'Bonsai Beach Club',   desc: 'Live band, fire dancers, cocktails.' },
    ],
    travel: [
      { name: 'Taj Exotica Goa',    type: 'Stay',    note: 'Block rate · 17–19 Apr' },
      { name: 'Goa Dabolim Airport',type: 'Airport', note: '40 min · shuttle service' },
    ],
    gifts:  { headline: 'Sail-away Registry', message: 'A starter fund for our honeymoon catamaran trip across the Andamans.' },
    shagun: { upi: 'mira.ishaan@okkotak', payee: 'Mira & Ishaan', msg: 'Your blessing — UPI in one tap.' },
    wishes: [
      { from: 'Rhea',  text: 'Two divers, one ocean, infinite love. Couldn’t be happier for you both!' },
      { from: 'Dad',   text: 'Mira beti, may every tide bring you closer.' },
    ],
  },
  punjabi_sangeet: {
    bride: 'Simran', groom: 'Arjun',
    bride_initial: 'S', groom_initial: 'A',
    weddingDateISO: '2026-12-12T11:30:00+05:30',
    weddingDate: 'Saturday, 12 December 2026',
    weddingTime: '11:30 AM',
    venue: 'Leela Ambience Gurugram', city: 'Gurugram, Haryana',
    mapsLink: 'https://maps.google.com/?q=Leela+Ambience+Gurugram',
    story:
      'They met at a sangeet practice in Chandigarh. He was the worst dancer in the group. She was the choreographer. Six months later, he had a routine. A year later, a ring. Today — a whole baraat.',
    events: [
      { title: 'Roka',              date: '8 Dec · 12:00 PM', venue: 'Family Farmhouse',     desc: 'Family ceremony · close friends only.' },
      { title: 'Sangeet & Cocktail',date: '10 Dec · 7:30 PM', venue: 'Crystal Ballroom',     desc: 'Choreographed performances, dhol, cocktails.' },
      { title: 'Mehndi & Chooda',   date: '11 Dec · 10:00 AM', venue: 'Garden Lawn',          desc: 'Bridal chooda ceremony with the kalireh.' },
      { title: 'Baraat & Anand Karaj', date: '12 Dec · 11:30 AM', venue: 'Gurudwara + Banquet', desc: 'Dholki, baraat and the four pheras.' },
    ],
    travel: [
      { name: 'Leela Ambience',   type: 'Stay',    note: 'Block of 80 rooms · 10–13 Dec' },
      { name: 'IGI T3 Delhi',     type: 'Airport', note: '30 min · taxis arranged' },
    ],
    gifts:  { headline: 'With love, no gifts please',          message: 'Bas duayein dena. That’s the only gift we want.' },
    shagun: { upi: 'simran.arjun@okibl', payee: 'Simran & Arjun', msg: 'Aashirvaad UPI ke through bhi welcome.' },
    wishes: [
      { from: 'Veerji', text: 'Soni puttar, may your sangeet never end. Naachenge saari raat!' },
      { from: 'Manpreet', text: 'Best wishes Simmi. Bhangra ready for the baraat!' },
    ],
  },
  bengali_traditional: {
    bride: 'Ria', groom: 'Aditya',
    bride_initial: 'R', groom_initial: 'A',
    weddingDateISO: '2026-01-29T19:00:00+05:30',
    weddingDate: 'Thursday, 29 January 2026',
    weddingTime: '7:00 PM',
    venue: 'Tollygunge Club', city: 'Kolkata, West Bengal',
    mapsLink: 'https://maps.google.com/?q=Tollygunge+Club+Kolkata',
    story:
      'A Bengali poet and a Bombay banker meet at a Tagore recital in Shantiniketan. He spoke about Rabindranath; she spoke about real estate. Somewhere between Geetanjali and a balance sheet, they fell in love.',
    events: [
      { title: 'Ashirbaad',  date: '27 Jan · 6:00 PM', venue: 'Family Home',     desc: 'Elders bless the bride with rice and durba grass.' },
      { title: 'Gaye Holud', date: '28 Jan · 11:00 AM', venue: 'Garden Pavilion', desc: 'Turmeric, sweets and song.' },
      { title: 'Biye',       date: '29 Jan · 7:00 PM', venue: 'Tollygunge Club', desc: 'The seven steps. Sankha, shidur, the sealing of saat janam.' },
      { title: 'Bou Bhaat',  date: '30 Jan · 1:00 PM', venue: 'Tollygunge Club', desc: 'The first meal as Mr & Mrs.' },
    ],
    travel: [{ name: 'Tollygunge Club Suites', type: 'Stay', note: 'On-property rooms for family' }],
    gifts:  { headline: 'A few thoughtful gift ideas',         message: 'A bookshelf is being built for two avid readers — books always welcome.' },
    shagun: { upi: 'ria.aditya@okhdfcbank', payee: 'Ria & Aditya', msg: 'Saat janamer aashirbaad — UPI te o welcome.' },
    wishes: [
      { from: 'Mashima', text: 'Aamader Ria moni — may you have all the joy of a Tagore poem.' },
      { from: 'Sourav',  text: 'From rice to real estate — bhalo theko, dujone.' },
    ],
  },
  christian_elegant: {
    bride: 'Naomi', groom: 'Daniel',
    bride_initial: 'N', groom_initial: 'D',
    weddingDateISO: '2026-06-06T16:00:00+05:30',
    weddingDate: 'Saturday, 6 June 2026',
    weddingTime: '4:00 PM',
    venue: 'St Mary’s Cathedral', city: 'Kochi, Kerala',
    mapsLink: 'https://maps.google.com/?q=St+Marys+Cathedral+Kochi',
    story:
      'They sang in the same Christmas choir for three years before he found the courage to ask her for coffee. She said yes — and made him sing the song he chose for the ring.',
    events: [
      { title: 'Engagement',   date: '4 Jun · 6:00 PM', venue: 'Cathedral Hall',     desc: 'Family blessing & exchange of rings.' },
      { title: 'Rehearsal Dinner', date: '5 Jun · 7:00 PM', venue: 'Marine Drive Hotel', desc: 'Close family & wedding party.' },
      { title: 'Holy Matrimony',date: '6 Jun · 4:00 PM', venue: 'St Mary’s Cathedral', desc: 'Nuptial Mass and the exchange of vows.' },
      { title: 'Reception',    date: '6 Jun · 7:30 PM', venue: 'Banquet Ballroom',    desc: 'Dinner, toasts and the first dance.' },
    ],
    travel: [{ name: 'Taj Malabar', type: 'Stay', note: 'Group rate · book before May 20' }],
    gifts:  { headline: 'No gifts please — your love is the gift', message: 'If you wish, donate to the parish’s children’s fund in our name.' },
    shagun: { upi: 'naomi.daniel@okfederal', payee: 'Naomi & Daniel', msg: 'Donations in our name very welcome.' },
    wishes: [
      { from: 'Pastor Joseph', text: 'May the Lord bless your union with grace and music, always.' },
      { from: 'Sarah',          text: 'From the choir loft to the altar — what a beautiful song this has been.' },
    ],
  },
  muslim_nikah: {
    bride: 'Aisha', groom: 'Zayn',
    bride_initial: 'A', groom_initial: 'Z',
    weddingDateISO: '2026-09-19T19:30:00+05:30',
    weddingDate: 'Saturday, 19 September 2026',
    weddingTime: '7:30 PM',
    venue: 'ITC Grand Bharat · Nikah Hall', city: 'Manesar, Haryana',
    mapsLink: 'https://maps.google.com/?q=ITC+Grand+Bharat',
    story:
      'Two cousins of cousins met at a Ramzan iftar. She was a documentary filmmaker; he, a doctor. The dates ran out, the conversation didn’t. By the next Eid, the families had spoken to a Maulana.',
    events: [
      { title: 'Mehndi',     date: '17 Sep · 7:00 PM',  venue: 'Garden Courtyard',   desc: 'Mehndi, qawwali and family stories.' },
      { title: 'Sangeet',    date: '18 Sep · 8:00 PM',  venue: 'Crystal Ballroom',   desc: 'Music, dance and a friendly mehndi competition.' },
      { title: 'Nikah',      date: '19 Sep · 7:30 PM',  venue: 'Nikah Hall',         desc: 'The blessed contract — read by the Maulana.' },
      { title: 'Walima',     date: '20 Sep · 8:00 PM',  venue: 'Banquet Hall',       desc: 'The groom’s family welcomes everyone for the feast.' },
    ],
    travel: [
      { name: 'ITC Grand Bharat',  type: 'Stay',    note: 'Wedding block · 17–21 Sep' },
      { name: 'IGI Airport',        type: 'Airport', note: '60 min · shuttle daily' },
    ],
    gifts:  { headline: 'Duas in place of gifts',              message: 'Your duas at the nikah are the only gift we seek.' },
    shagun: { upi: 'aisha.zayn@okibl', payee: 'Aisha & Zayn', msg: 'Your duas welcome — UPI ke saath bhi.' },
    wishes: [
      { from: 'Khala-jaan', text: 'May Allah grant you a love that is gentle and a life that is generous.' },
      { from: 'Faraz',      text: 'From iftar to nikah — Mashallah. So much joy for both of you.' },
    ],
  },
  nature_eco_wedding: {
    bride: 'Tara', groom: 'Kabir',
    bride_initial: 'T', groom_initial: 'K',
    weddingDateISO: '2026-10-10T16:30:00+05:30',
    weddingDate: 'Saturday, 10 October 2026',
    weddingTime: '4:30 PM',
    venue: 'Tijara Heritage Fort · Eco Mandap', city: 'Alwar, Rajasthan',
    mapsLink: 'https://maps.google.com/?q=Tijara+Fort+Palace',
    story:
      'A conservation biologist and an organic farmer met at a tiger census in Sariska. Two years of trail cameras, herb gardens and slow Sundays later — a wedding that gives back more than it takes.',
    events: [
      { title: 'Tree Planting',   date: '9 Oct · 10:00 AM', venue: 'Fort Garden',    desc: 'Every guest plants a sapling — your forest of blessings.' },
      { title: 'Mehndi & Music',  date: '9 Oct · 6:00 PM',  venue: 'Open Courtyard', desc: 'Folk musicians, no plastic, all candlelight.' },
      { title: 'Phera Wedding',   date: '10 Oct · 4:30 PM', venue: 'Eco Mandap',     desc: 'Mandap built of bamboo and marigold — zero waste.' },
      { title: 'Farm-to-table Feast', date: '10 Oct · 7:30 PM', venue: 'Terrace Garden', desc: 'Local, seasonal, served on banana leaves.' },
    ],
    travel: [{ name: 'Tijara Fort', type: 'Stay', note: 'On-property heritage rooms' }],
    gifts:  { headline: 'A forest in our name', message: 'In lieu of gifts, please plant a tree or donate to Sariska Tiger Foundation.' },
    shagun: { upi: 'tara.kabir@okhdfcbank', payee: 'Tara & Kabir', msg: 'Trees are the only gift we ask — UPI bhi welcome.' },
    wishes: [
      { from: 'Nani',     text: 'May your love grow like a banyan — wide, deep, and shelter for many.' },
      { from: 'Rangers of Sariska', text: 'From all of us at the reserve — a wedding the wild will remember.' },
    ],
  },
  kerala_backwaters: {
    bride: 'Meera', groom: 'Arjun',
    bride_initial: 'M', groom_initial: 'A',
    weddingDateISO: '2026-09-12T17:30:00+05:30',
    weddingDate: 'Saturday, 12 September 2026',
    weddingTime: '5:30 PM',
    venue: 'Kumarakom Lake Resort', city: 'Kumarakom, Kerala',
    mapsLink: 'https://maps.google.com/?q=Kumarakom+Lake+Resort',
    story:
      'A boat ride at sunset on the Vembanad backwaters. A girl from Alleppey reading Tagore at the bow, a boy from Bangalore convinced by his cousin to take the kettuvallam tour. By the time the lamps were lit, two strangers had become one quiet promise.',
    events: [
      { title: 'Engagement at the Houseboat', date: '10 Sep · 6:30 PM', venue: 'Kettuvallam Deck', desc: 'Lotus garlands, oil lamps, and the slow lap of water.' },
      { title: 'Haldi by the Backwaters',    date: '11 Sep · 11:00 AM', venue: 'Lake Pavilion',    desc: 'Banana leaves, turmeric and a long, golden morning.' },
      { title: 'Mehandi in the Garden',      date: '11 Sep · 4:00 PM',  venue: 'Coconut Grove',    desc: 'Traditional henna while the egrets fly home.' },
      { title: 'Sangeeth on the Boat',       date: '11 Sep · 8:00 PM',  venue: 'Floating Stage',   desc: 'Veena, dholak, and the family\u2019s favourite songs.' },
      { title: 'Marriage Ceremony',          date: '12 Sep · 5:30 PM',  venue: 'Lakeside Mandap',  desc: 'Pheras under hanging brass lamps and jasmine.' },
      { title: 'Reception',                  date: '12 Sep · 8:30 PM',  venue: 'Banyan Courtyard', desc: 'A feast on banana leaves under fairy lights.' },
    ],
    travel: [
      { name: 'Kumarakom Lake Resort', type: 'Stay',    note: '10 – 13 Sep' },
      { name: 'Cochin Airport',        type: 'Airport', note: '1.5 hr · boat transfer arranged' },
    ],
    gifts:  { headline: 'A backwater honeymoon', message: 'Your presence is our gift. If you wish, a contribution to our Alleppey houseboat tour fund.' },
    shagun: { upi: 'meera.arjun@okhdfcbank', payee: 'Meera & Arjun', msg: 'Send your shagun on the water — UPI in one tap.' },
    wishes: [
      { from: 'Achamma',  text: 'May your love be as endless as the Vembanad and as warm as Onam sadhya.' },
      { from: 'Ravi & Lakshmi', text: 'Two backwater souls, one tide — wishing you a lifetime of calm.' },
    ],
  },
};

export const getThemeSampleData = (themeId) =>
  THEME_SAMPLE_DATA[themeId] || THEME_SAMPLE_DATA.royal_mughal;
