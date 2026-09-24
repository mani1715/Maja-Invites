/* inviteFormat.js — small pure formatters shared by the guest-invite lane
   (GuestInvitation, CeremonyInvitation, SaveTheDate). Kept dependency-free
   (no date-fns/dayjs — none installed, and this is a handful of lines). */

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** "2027-02-14T00:00:00" -> "FEBRUARY 14, 2027". Returns '' on bad/missing input. */
export function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** venue + city -> "TAJ LAKE PALACE, UDAIPUR" (uppercase, city optional). */
export function formatVenueLine(venue, city) {
  const parts = [venue, city].filter(Boolean);
  return parts.join(', ').toUpperCase();
}

/** granted_features gate — null/undefined means ungated (legacy/flag-off),
   show everything. A list means only show features it contains. Sections
   are already pre-baked into sections_enabled at profile-build time
   (order_to_invitation._FEATURE_SECTIONS), so this is a secondary check for
   the few features that aren't. */
export function hasFeature(invite, key) {
  const gf = invite?.granted_features;
  if (gf == null) return true;
  return gf.includes(key);
}

/** "2027-02-12" -> "12 FEB". Returns '' on bad/missing input. */
export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "19:30" -> "7:30 PM". Returns '' on bad/missing input. */
export function formatTime12h(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

export function _selfTest() {
  console.assert(formatEventDate('2027-02-14T00:00:00') === 'FEBRUARY 14, 2027', 'formatEventDate');
  console.assert(formatEventDate('') === '', 'formatEventDate empty');
  console.assert(formatVenueLine('Taj Lake Palace', 'Udaipur') === 'TAJ LAKE PALACE, UDAIPUR', 'formatVenueLine');
  console.assert(formatVenueLine('Taj Lake Palace', '') === 'TAJ LAKE PALACE', 'formatVenueLine no city');
  console.assert(hasFeature({ granted_features: null }, 'x') === true, 'hasFeature ungated');
  console.assert(hasFeature({ granted_features: ['a'] }, 'a') === true, 'hasFeature present');
  console.assert(hasFeature({ granted_features: ['a'] }, 'b') === false, 'hasFeature absent');
  console.assert(formatShortDate('2027-02-12') === '12 FEB', 'formatShortDate');
  console.assert(formatTime12h('19:30') === '7:30 PM', 'formatTime12h pm');
  console.assert(formatTime12h('00:05') === '12:05 AM', 'formatTime12h midnight');
  console.assert(formatTime12h('') === '', 'formatTime12h empty');
}
