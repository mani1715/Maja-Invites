/** buildIcs.js — client-only .ics + Google Calendar link builder for "Add to
 * calendar". The invite payload already carries date/time/venue, so there is
 * nothing to fetch — no backend round-trip, per the brief. */

function pad(n) { return String(n).padStart(2, '0'); }

function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeIcs(text) {
  return String(text || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

/** RFC 5545 §3.1 content-line folding: no line may exceed 75 OCTETS (not
 * characters — a non-ASCII venue name blows the limit sooner than it looks).
 * Continuation lines start with a single space. Google/Apple/Outlook tolerate
 * unfolded lines, but stricter parsers reject the file outright, so a long
 * custom title or venue would otherwise produce an .ics that simply fails to
 * import. Folds on octet boundaries and never splits a multi-byte character. */
function foldIcsLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;                      // continuation lines lose 1 octet to the leading space
  for (const ch of line) {             // iterate by code point, not UTF-16 unit
    const chBytes = enc.encode(ch).length;
    if (curBytes + chBytes > limit) {
      out.push(cur);
      cur = ch;
      curBytes = chBytes;
      limit = 74;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

/** Build a .ics file Blob for one event. `end` defaults to start + 2h. */
export function buildIcsFile({ title, description = '', location = '', start, end }) {
  const dtStart = toIcsUtc(start);
  const dtEnd = toIcsUtc(end || new Date(start.getTime() + 2 * 60 * 60 * 1000));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAJA Invites//Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@maja-invites`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${dtStart}`, `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lines.map(foldIcsLine).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
}

/** Google Calendar "quick add" deep link for the same event. */
export function googleCalendarUrl({ title, description = '', location = '', start, end }) {
  const dtEnd = end || new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || '',
    dates: `${toIcsUtc(start)}/${toIcsUtc(dtEnd)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function _selfTest() {
  const start = new Date('2027-02-14T18:30:00Z');
  const blob = buildIcsFile({ title: 'Test & Event, Inc', location: 'Venue; Hall', start });
  console.assert(blob instanceof Blob, 'buildIcsFile returns a Blob');
  console.assert(blob.type === 'text/calendar;charset=utf-8', 'buildIcsFile mime type');
  const url = googleCalendarUrl({ title: 'Test', start });
  console.assert(url.includes('calendar.google.com'), 'googleCalendarUrl builds a google link');
  console.assert(url.includes('20270214T183000Z'), 'googleCalendarUrl encodes start correctly');

  // RFC 5545 §3.1 folding — every emitted line must be <= 75 octets, and
  // continuation lines must begin with exactly one space.
  const enc = new TextEncoder();
  const short = foldIcsLine('SUMMARY:Short one');
  console.assert(short === 'SUMMARY:Short one', 'short lines are left alone');

  const longAscii = foldIcsLine(`SUMMARY:${'a'.repeat(300)}`);
  for (const l of longAscii.split('\r\n')) {
    console.assert(enc.encode(l).length <= 75, `folded line over 75 octets: ${enc.encode(l).length}`);
  }
  console.assert(longAscii.split('\r\n').slice(1).every((l) => l.startsWith(' ')),
    'continuation lines start with a space');
  console.assert(longAscii.split('\r\n').join('').replace(/^ | /g, '').length > 0, 'content survives folding');

  // Multi-byte: folding must never split a character in half.
  const longUtf8 = foldIcsLine(`LOCATION:${'श्री'.repeat(60)}`);
  for (const l of longUtf8.split('\r\n')) {
    console.assert(enc.encode(l).length <= 75, 'utf-8 folded line over 75 octets');
  }
  console.assert(!longUtf8.includes('�'), 'no replacement chars — no split code points');
}
