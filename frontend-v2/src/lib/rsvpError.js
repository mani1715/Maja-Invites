/* rsvpError.js — pure classifier for POST /api/rsvp responses. Extracted from
   useRsvpSubmit so the branching (rate limit / captcha-required / captcha-wrong
   / generic) can be asserted without mocking axios or React. */
export function classifyRsvpError(status, detail) {
  const text = typeof detail === 'string'
    ? detail
    : Array.isArray(detail) ? detail.map((d) => d?.msg || d).join(' · ') : '';

  if (status === 429) {
    return { kind: 'rate_limited', message: text || 'Too many submissions from you today. Please try again tomorrow.' };
  }
  if (status === 400 && /captcha/i.test(text)) {
    return { kind: 'captcha', message: /incorrect/i.test(text) ? "That wasn't quite right — here's another one." : '' };
  }
  if (status === 410) return { kind: 'expired', message: 'This invitation link has expired.' };
  if (status === 404) return { kind: 'not_found', message: 'Invitation not found.' };
  return { kind: 'error', message: text || 'Something went wrong. Please try again.' };
}

export function _selfTest() {
  console.assert(classifyRsvpError(429, 'x').kind === 'rate_limited', 'rate limit');
  console.assert(classifyRsvpError(400, 'CAPTCHA verification is required. Please complete the CAPTCHA challenge.').kind === 'captcha', 'captcha required');
  const wrong = classifyRsvpError(400, 'Incorrect CAPTCHA answer. Please try again.');
  console.assert(wrong.kind === 'captcha' && /another/i.test(wrong.message), 'captcha wrong');
  console.assert(classifyRsvpError(410, 'expired').kind === 'expired', 'expired');
  console.assert(classifyRsvpError(500, 'boom').kind === 'error', 'generic');
  console.assert(classifyRsvpError(422, [{ msg: 'guest_phone: bad format' }]).message.includes('bad format'), 'array detail');
}
