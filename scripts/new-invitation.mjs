#!/usr/bin/env node
/**
 * new-invitation.mjs — scaffold a generated invitation from a downloaded
 * fulfillment request.
 *
 *   node scripts/new-invitation.mjs MAJA-AB12CD.json
 *   node scripts/new-invitation.mjs MAJA-AB12CD.json --owner riya-aarav --event wedding
 *
 * Creates frontend/src/invitations/<owner>/<event>/{data.js,index.jsx} with the
 * couple's real details already filled in, then you hand the folder to Claude
 * to design index.jsx. Route becomes /invite/<owner>/<event>.
 *
 * Deliberately refuses to overwrite: re-running after a design pass must never
 * silently discard the work.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const jsonPath = args.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

if (!jsonPath) {
  console.error('usage: node scripts/new-invitation.mjs <request.json> [--owner slug] [--event slug]');
  process.exit(1);
}

const slugify = (s) => String(s || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const req = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
// The admin download nests the payload under `request` for the detail endpoint.
const r = req.request || req;
const info = r.info || r.details || {};

const bride = info.bride_name || r.bride_name || 'Bride';
const groom = info.groom_name || r.groom_name || 'Groom';
const owner = flag('owner') || slugify(`${bride}-${groom}`);
const event = flag('event') || slugify(info.event_type || r.event_type || 'wedding');

if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(owner) || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(event)) {
  console.error(`Invalid route segment: /invite/${owner}/${event}`);
  process.exit(1);
}

const dir = path.join('frontend', 'src', 'invitations', owner, event);
if (fs.existsSync(path.join(dir, 'index.jsx'))) {
  console.error(`Refusing to overwrite an existing invitation at ${dir}`);
  console.error('Delete it first if you really mean to start over.');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const data = {
  slug: r.slug || info.slug || r.profile_slug || null,
  fulfillment_code: r.fulfillment_code || r.code || null,
  bride,
  groom,
  event_label: info.event_label || 'The Wedding',
  event_date: info.event_date || r.event_date || null,
  expires_at: r.expires_at || null,
  venue: {
    name: info.venue || info.venue_name || '',
    city: info.city || '',
    map_link: info.map_link || '',
  },
  story: info.love_story || info.story || '',
  people: [
    { name: bride, role: 'The Bride', photo: info.bride_photo_url || '', about: info.bride_about || '' },
    { name: groom, role: 'The Groom', photo: info.groom_photo_url || '', about: info.groom_about || '' },
  ],
  gallery: (info.gallery || info.couple_photos || [])
    .filter(Boolean)
    .map((u) => (typeof u === 'string' ? { url: u, caption: '' } : u)),
  schedule: (info.events || []).map((e) => ({
    name: e.event_name || e.name || '',
    when: e.date || e.when || '',
    where: e.venue || e.where || '',
  })),
};

fs.writeFileSync(
  path.join(dir, 'data.js'),
  `/**\n * Generated from fulfillment request ${data.fulfillment_code || path.basename(jsonPath)}.\n`
  + ` * Content only — no markup. Edit copy here; design lives in index.jsx.\n */\n`
  + `const data = ${JSON.stringify(data, null, 2)};\n\nexport default data;\n`,
  'utf8',
);

fs.writeFileSync(
  path.join(dir, 'index.jsx'),
  `import React from 'react';
import { ScrollSection, PhotoMarquee, RSVPForm, WishForm, tokens, fluid, mediaUrl } from '@/invitations/kit';

/**
 * ${bride} & ${groom} — ${event}.  Request ${data.fulfillment_code || ''}.
 * SCAFFOLD — hand this file to Claude with INVITATION_AUTHORING.md to design.
 */
export default function Invitation({ data }) {
  return (
    <main data-testid="inv-${owner}-${event}">
      <section className="min-h-screen flex items-center justify-center px-6 text-center">
        <h1 className="font-display" style={{ color: tokens.ivory, fontSize: fluid(2.6, 10, 12, 4.4) }}>
          {data.bride} &amp; {data.groom}
        </h1>
      </section>

      <PhotoMarquee
        photos={(data.gallery || []).map((p) => ({ ...p, url: mediaUrl(p.url) }))}
        title={\`\${data.bride} & \${data.groom}\`}
      />

      {data.slug && (
        <>
          <ScrollSection className="px-6 py-16 max-w-2xl mx-auto"><RSVPForm slug={data.slug} /></ScrollSection>
          <ScrollSection className="px-6 py-16 max-w-2xl mx-auto"><WishForm slug={data.slug} /></ScrollSection>
        </>
      )}
    </main>
  );
}
`,
  'utf8',
);

console.log(`Scaffolded  ${dir}`);
console.log(`Route       /invite/${owner}/${event}`);
if (!data.slug) {
  console.log('\nNOTE: no `slug` in the request — RSVP and wishes will be hidden until you');
  console.log('set data.slug to the backing profile slug, or they would post into a void.');
}
console.log('\nNext: give Claude this folder + INVITATION_AUTHORING.md, then design index.jsx.');
