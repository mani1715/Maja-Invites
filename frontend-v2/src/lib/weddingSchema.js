// Shared vocabulary + validation for the wedding wizard.
//
// Every list here mirrors a server-side allowlist. Where the backend rejects a
// value, the wizard must reject it FIRST with a readable message — a 422 from
// pydantic is unreadable in a form. Keep these in sync with:
//   backend/models.py        EventType, SectionsEnabled, ProfileCreate
//   backend/theme_constants.py  THEME_IDS

/** backend/theme_constants.py THEME_IDS — the only valid design_id values for
 *  invitation_category "wedding". A value outside this set fails ProfileCreate's
 *  validate_design_id model validator with a 422. */
export const THEMES = [
  { id: 'royal_heritage', label: 'Royal Heritage', hint: 'Deep maroon and gold, classic North Indian' },
  { id: 'south_indian_temple', label: 'South Indian Temple', hint: 'Temple gold, kolam motifs' },
  { id: 'temple_gold', label: 'Temple Gold', hint: 'Warm gold on ivory' },
  { id: 'royal_mughal', label: 'Royal Mughal', hint: 'Jali arches, emerald and gold' },
  { id: 'modern_minimal', label: 'Modern Minimal', hint: 'Type-led, lots of white space' },
  { id: 'modern_lotus', label: 'Modern Lotus', hint: 'Soft lotus line-art' },
  { id: 'modern_pastel', label: 'Modern Pastel', hint: 'Blush, sage and cream' },
  { id: 'ivory_elegance', label: 'Ivory Elegance', hint: 'Ivory, script, understated' },
  { id: 'peacock_dream', label: 'Peacock Dream', hint: 'Teal and gold plumage' },
  { id: 'bollywood_luxury', label: 'Bollywood Luxury', hint: 'High-contrast, cinematic' },
  { id: 'punjabi_sangeet', label: 'Punjabi Sangeet', hint: 'Bright, festive, phulkari' },
  { id: 'midnight_sangeet', label: 'Midnight Sangeet', hint: 'Night palette, neon accents' },
  { id: 'bengali_traditional', label: 'Bengali Traditional', hint: 'Red and white, alpona' },
  { id: 'kerala_backwaters', label: 'Kerala Backwaters', hint: 'Green, gold, kasavu' },
  { id: 'beach_destination', label: 'Beach Destination', hint: 'Sand, surf, airy' },
  { id: 'nature_eco_wedding', label: 'Nature / Eco', hint: 'Botanical, earthy, recycled paper' },
  { id: 'christian_elegant', label: 'Christian Elegant', hint: 'Chapel florals, script' },
  { id: 'muslim_nikah', label: 'Muslim Nikah', hint: 'Geometric, emerald and gold' },
  { id: 'dark_royal', label: 'Dark Royal', hint: 'Near-black with gilt' },
];
export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'royal_heritage';

/** backend/models.py EventType — marriage events only, max 7 per profile,
 *  no duplicates (both enforced by ProfileCreate.validate_events). */
export const EVENT_TYPES = [
  { id: 'engagement', label: 'Engagement' },
  { id: 'haldi', label: 'Haldi' },
  { id: 'mehendi', label: 'Mehendi' },
  { id: 'sangeet', label: 'Sangeet' },
  { id: 'marriage', label: 'Marriage' },
  { id: 'reception', label: 'Reception' },
];
export const MAX_EVENTS = 7;

export const LANGUAGES = [
  { id: 'english', label: 'English' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'telugu', label: 'Telugu' },
  { id: 'tamil', label: 'Tamil' },
  { id: 'kannada', label: 'Kannada' },
  { id: 'malayalam', label: 'Malayalam' },
  { id: 'marathi', label: 'Marathi' },
  { id: 'bengali', label: 'Bengali' },
  { id: 'gujarati', label: 'Gujarati' },
  { id: 'punjabi', label: 'Punjabi' },
];

/** backend/models.py SectionsEnabled — grouped for the toggles step. The
 *  defaults here match the pydantic defaults exactly so an untouched wizard
 *  produces the same document the API would have defaulted to. */
export const SECTION_GROUPS = [
  {
    title: 'The invitation',
    items: [
      ['opening', 'Opening animation', true],
      ['welcome', 'Welcome message', true],
      ['couple', 'Couple introduction', true],
      ['about', 'About the couple', false],
      ['family', 'Family details', false],
      ['love_story', 'Love story', false],
      ['footer', 'Footer', true],
    ],
  },
  {
    title: 'Media',
    items: [
      ['photos', 'Photo gallery', true],
      ['video', 'Video', false],
      ['pre_wedding', 'Pre-wedding shoot links', true],
      ['decorative_effects', 'Decorative effects', true],
    ],
  },
  {
    title: 'Ceremonies & logistics',
    items: [
      ['events', 'Ceremony schedule', true],
      ['calendar', 'Add to calendar', false],
      ['countdown', 'Countdown timer', false],
      ['contact', 'Contact information', false],
      ['guest_rooms', 'Find my room', true],
      ['dress_code', 'Dress code', false],
    ],
  },
  {
    title: 'Guest interaction',
    items: [
      ['rsvp', 'RSVP form', false],
      ['greetings', 'Wishes wall', true],
      ['check_in', 'Guest check-in', false],
      ['song_requests', 'Song requests', false],
      ['qr', 'Gallery QR code', false],
      ['live_stream', 'Live stream', false],
      ['live_timeline', 'Live timeline', false],
    ],
  },
];

export function defaultSections() {
  const out = {};
  SECTION_GROUPS.forEach((g) => g.items.forEach(([key, , def]) => { out[key] = def; }));
  return out;
}

export const EXPIRY_TYPES = [
  { id: 'days', label: 'Days after creation' },
  { id: 'date', label: 'A fixed date' },
  { id: 'never', label: 'Never expires' },
];

/** A blank ceremony row. `event_id` is left to the server. */
export function blankEvent(usedTypes = []) {
  const free = EVENT_TYPES.find((t) => !usedTypes.includes(t.id)) || EVENT_TYPES[0];
  return {
    event_type: free.id,
    name: free.label,
    date: '',
    start_time: '',
    end_time: '',
    venue_name: '',
    venue_address: '',
    map_link: '',
    description: '',
    visible: true,
    enabled: true,
    order: 0,
  };
}

export function emptyWedding() {
  return {
    groom_name: '',
    bride_name: '',
    event_type: 'marriage',
    event_date: '',
    venue: '',
    city: '',
    invitation_message: '',
    design_id: DEFAULT_THEME,
    enabled_languages: ['english'],
    language: ['english'],
    whatsapp_groom: '',
    whatsapp_bride: '',
    about_couple: '',
    family_details: '',
    love_story: '',
    bride_about: '',
    groom_about: '',
    bride_photo_url: '',
    groom_photo_url: '',
    couple_photo_url: '',
    parking_info: '',
    youtube_live_url: '',
    events: [],
    sections_enabled: defaultSections(),
    link_expiry_type: 'days',
    link_expiry_value: 30,
    invitation_category: 'wedding',
  };
}

// ---------------------------------------------------------------- validation

const E164 = /^\+[1-9]\d{1,14}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Mirrors ProfileCreate.validate_whatsapp_number. Empty is allowed. */
export function whatsappError(v) {
  if (!v || !v.trim()) return null;
  return E164.test(v.trim())
    ? null
    : 'Use the international format, e.g. +919876543210';
}

/** Per-step validation. Returns { field: message } — empty object means valid.
 *  Step keys match WIZARD_STEPS ids in StudioWeddingWizard.jsx. */
export function validateStep(step, w) {
  const e = {};
  if (step === 'couple') {
    if (!w.groom_name.trim()) e.groom_name = "The groom's name is required.";
    if (!w.bride_name.trim()) e.bride_name = "The bride's name is required.";
    if (!w.event_date) e.event_date = 'Pick the main wedding date.';
    if (!w.venue.trim()) e.venue = 'The main venue is required.';
    const g = whatsappError(w.whatsapp_groom);
    if (g) e.whatsapp_groom = g;
    const b = whatsappError(w.whatsapp_bride);
    if (b) e.whatsapp_bride = b;
  }

  if (step === 'ceremonies') {
    // ProfileCreate.validate_events: <=7, no duplicate types, >=1 visible.
    if (w.events.length > MAX_EVENTS) {
      e._events = `A maximum of ${MAX_EVENTS} ceremonies is allowed.`;
    }
    const seen = new Set();
    w.events.forEach((ev, i) => {
      if (seen.has(ev.event_type)) {
        e[`event_${i}_type`] = 'Each ceremony type can only be used once.';
      }
      seen.add(ev.event_type);
      if (!ev.name.trim()) e[`event_${i}_name`] = 'Give this ceremony a name.';
      if (!ev.date) e[`event_${i}_date`] = 'Pick a date.';
      else if (!YMD.test(ev.date)) e[`event_${i}_date`] = 'Use YYYY-MM-DD.';
      if (!ev.start_time) e[`event_${i}_start_time`] = 'Pick a start time.';
      else if (!HHMM.test(ev.start_time)) e[`event_${i}_start_time`] = 'Use HH:MM.';
      if (ev.end_time && !HHMM.test(ev.end_time)) e[`event_${i}_end_time`] = 'Use HH:MM.';
      if (!ev.venue_name.trim()) e[`event_${i}_venue_name`] = 'Venue name is required.';
      if (!ev.venue_address.trim()) e[`event_${i}_venue_address`] = 'Venue address is required.';
      if (ev.description && ev.description.length > 500) {
        e[`event_${i}_description`] = 'Keep this under 500 characters.';
      }
    });
    if (w.events.length > 0 && !w.events.some((ev) => ev.visible)) {
      e._events = 'At least one ceremony must be visible.';
    }
  }

  if (step === 'design') {
    if (!THEME_IDS.includes(w.design_id)) e.design_id = 'Pick a design.';
    if (!w.enabled_languages.length) e.enabled_languages = 'Pick at least one language.';
  }

  if (step === 'settings') {
    if (w.link_expiry_type === 'days') {
      const n = Number(w.link_expiry_value);
      if (!Number.isFinite(n) || n < 1) e.link_expiry_value = 'Enter a number of days (1 or more).';
    }
  }

  return e;
}

/** Shape the wizard state into a ProfileCreate/ProfileUpdate body.
 *  Empty strings become null/omitted so we never overwrite a server value
 *  with "" on a partial PUT. */
export function toPayload(w, { forCreate }) {
  const trimmed = (v) => (typeof v === 'string' ? v.trim() : v);
  const orNull = (v) => {
    const t = trimmed(v);
    return t === '' || t === undefined ? null : t;
  };

  const body = {
    groom_name: trimmed(w.groom_name),
    bride_name: trimmed(w.bride_name),
    event_type: w.event_type || 'marriage',
    // Backend expects a datetime; a bare date input gives YYYY-MM-DD.
    event_date: w.event_date ? `${w.event_date}T00:00:00` : null,
    venue: trimmed(w.venue),
    city: orNull(w.city),
    invitation_message: orNull(w.invitation_message),
    design_id: w.design_id,
    enabled_languages: w.enabled_languages,
    language: w.enabled_languages,
    whatsapp_groom: orNull(w.whatsapp_groom),
    whatsapp_bride: orNull(w.whatsapp_bride),
    about_couple: orNull(w.about_couple),
    family_details: orNull(w.family_details),
    love_story: orNull(w.love_story),
    bride_about: orNull(w.bride_about),
    groom_about: orNull(w.groom_about),
    bride_photo_url: orNull(w.bride_photo_url),
    groom_photo_url: orNull(w.groom_photo_url),
    couple_photo_url: orNull(w.couple_photo_url),
    parking_info: orNull(w.parking_info),
    youtube_live_url: orNull(w.youtube_live_url),
    sections_enabled: w.sections_enabled,
    events: w.events.map((ev, i) => ({
      ...ev,
      order: i,
      name: trimmed(ev.name),
      venue_name: trimmed(ev.venue_name),
      venue_address: trimmed(ev.venue_address),
      map_link: trimmed(ev.map_link) || '',
      end_time: ev.end_time || null,
      description: orNull(ev.description),
    })),
    link_expiry_type: w.link_expiry_type,
    link_expiry_value:
      w.link_expiry_type === 'days' ? Number(w.link_expiry_value) || 30 : null,
    invitation_category: 'wedding',
  };

  if (forCreate) {
    // ProfileCreate has no Optional[] on these — send the model defaults.
    body.custom_text = {};
    body.design_selections = {};
  }
  return body;
}

/** Server state -> wizard state. Tolerates missing/legacy fields. */
export function fromProfile(p) {
  const base = emptyWedding();
  const iso = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : '');
  return {
    ...base,
    ...Object.fromEntries(
      Object.keys(base)
        .filter((k) => !['events', 'sections_enabled', 'event_date', 'enabled_languages', 'language'].includes(k))
        .map((k) => [k, p[k] ?? base[k]]),
    ),
    event_date: iso(p.event_date),
    enabled_languages: p.enabled_languages?.length ? p.enabled_languages : ['english'],
    language: p.language?.length ? p.language : ['english'],
    sections_enabled: { ...base.sections_enabled, ...(p.sections_enabled || {}) },
    events: (p.events || []).map((ev) => ({
      event_id: ev.event_id,
      event_type: ev.event_type,
      name: ev.name || '',
      date: iso(ev.date),
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      venue_name: ev.venue_name || '',
      venue_address: ev.venue_address || '',
      map_link: ev.map_link || '',
      description: ev.description || '',
      visible: ev.visible !== false,
      enabled: ev.enabled !== false,
      order: typeof ev.order === 'number' ? ev.order : 0,
    })),
  };
}
