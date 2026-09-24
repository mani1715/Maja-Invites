/**
 * SectionsSwitchboard — Feb 2026
 * ────────────────────────────────────────────────────────────────────────
 * One luxe switchboard that surfaces EVERY backend `SectionsEnabled` field
 * as an on/off toggle, grouped into 4 categories for scannability:
 *   1. Core Story            (opening, welcome, couple, photos, events, footer)
 *   2. Couple Details        (about, family, love_story, pre_wedding, video)
 *   3. Guest Engagement      (rsvp, greetings, song_requests, live_timeline,
 *                              live_stream, dress_code, check_in)
 *   4. Logistics             (contact, calendar, countdown, qr, guest_rooms,
 *                              decorative_effects)
 *
 * Every toggle maps 1:1 to a backend SectionsEnabled key. The component is
 * stateless — pass `value` (the full sections_enabled dict) and `onChange`
 * (key, boolean) and the consumer mutates upstream state.
 *
 * Each toggle row has a `data-testid="section-toggle-{key}"` so the testing
 * agent can drive specific UI flows without ambiguous selectors.
 */
import React from 'react';

const GROUPS = [
  {
    title: 'Core Story',
    description: 'The spine of the invitation. Disabling these is rare.',
    items: [
      { key: 'opening',    label: 'Opening animation',    hint: '2.5 s cinematic zoom-in over the couple photo.' },
      { key: 'welcome',    label: 'Welcome line',         hint: 'The "Together with their families…" intro line.' },
      { key: 'couple',     label: 'Couple showcase',      hint: 'Bride + Groom 3D reveal panels.' },
      { key: 'photos',     label: 'Photo gallery',        hint: 'Cover photo, photo strip, hero portrait.' },
      { key: 'footer',     label: 'Footer',               hint: '"Made with love by MAJA" branding.' },
    ],
  },
  {
    title: 'Couple Details',
    description: 'Optional storytelling beats — best paired with marriage / reception.',
    items: [
      { key: 'about',       label: 'About the couple',    hint: 'Mini-bios for bride + groom side-by-side.' },
      { key: 'family',      label: 'Family details',      hint: 'Parents, siblings, blessings.' },
      { key: 'love_story',  label: 'Love story',          hint: 'How they met, milestones, the proposal.' },
      { key: 'pre_wedding', label: 'Pre-wedding shoot',   hint: 'YouTube / Vimeo / image-strip embed.' },
      { key: 'video',       label: 'Save-the-date video', hint: 'Embedded hero video below the cover.' },
    ],
  },
  {
    title: 'Guest Engagement',
    description: 'Two-way features that invite guests to participate.',
    items: [
      { key: 'rsvp',          label: 'RSVP form',          hint: 'Capture attendance + dietary preferences.' },
      { key: 'greetings',     label: 'Greetings / Wishes', hint: 'Live wishes wall from guests.' },
      { key: 'song_requests', label: 'Song requests',      hint: 'Guests suggest the playlist.' },
      { key: 'live_timeline', label: 'Live timeline',      hint: 'Real-time "NOW / NEXT" badges on event day.' },
      { key: 'live_stream',   label: 'Live stream',        hint: 'Watch the ceremony remotely (YouTube / Vimeo).' },
      { key: 'dress_code',    label: 'Dress code',         hint: 'Per-event attire carousel.' },
      { key: 'check_in',      label: 'Guest check-in',     hint: 'Scan-and-mark presence on event day.' },
    ],
  },
  {
    title: 'Logistics & Decoration',
    description: 'Practical add-ons — parking, calendar reminders, ambient flourish.',
    items: [
      { key: 'contact',            label: 'Contact info',           hint: 'Phone numbers + email for the family.' },
      { key: 'calendar',           label: '"Add to calendar"',      hint: 'One-tap Google/Apple/Outlook calendar.' },
      { key: 'countdown',          label: 'Countdown timer',        hint: 'Live ticker until the main event.' },
      { key: 'qr',                 label: 'QR code',                hint: 'Printable QR that opens the invite.' },
      { key: 'decorative_effects', label: 'Decorative effects',     hint: 'Petal shower, marigolds, lamps, bells.' },
    ],
  },
];

const Toggle = ({ enabled, onChange, label, hint, testid }) => (
  <label
    className="flex items-start gap-3 p-3 rounded-md cursor-pointer transition-colors"
    style={{
      background: enabled ? 'rgba(212,175,55,0.06)' : 'rgba(255,248,220,0.025)',
      border: `1px solid ${enabled ? 'rgba(212,175,55,0.32)' : 'rgba(255,248,220,0.1)'}`,
    }}
  >
    <input
      type="checkbox"
      checked={!!enabled}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
      data-testid={testid}
    />
    <span
      role="switch"
      aria-checked={!!enabled}
      className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
      style={{ background: enabled ? '#D4AF37' : 'rgba(255,248,220,0.15)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{ left: 2, transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium" style={{ color: enabled ? '#FFF8DC' : 'rgba(255,248,220,0.85)' }}>
        {label}
      </span>
      <span className="block text-[11px] mt-0.5" style={{ color: 'rgba(255,248,220,0.48)' }}>
        {hint}
      </span>
    </span>
  </label>
);

const SectionsSwitchboard = ({ value = {}, onChange }) => {
  return (
    <div className="space-y-8" data-testid="sections-switchboard">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="font-display text-lg" style={{ color: '#FFF8DC' }}>{g.title}</h4>
            <span className="text-[10px] tracking-[0.18em] uppercase" style={{ color: 'rgba(255,248,220,0.4)' }}>
              {g.items.filter((it) => value[it.key] !== false).length} / {g.items.length} on
            </span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'rgba(255,248,220,0.7)' }}>{g.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {g.items.map((it) => (
              <Toggle
                key={it.key}
                enabled={value[it.key] !== false}
                onChange={(v) => onChange(it.key, v)}
                label={it.label}
                hint={it.hint}
                testid={`section-toggle-${it.key}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SectionsSwitchboard;
