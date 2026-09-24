import client from './client';

// Public invitation surface — backend invite routes. Lanes: add per-screen
// calls here (RSVP, wishes, live-gallery, etc.) rather than hand-rolling axios.
export const getFull = (slug) => client.get(`/api/invite/${slug}/full`);

// Per-ceremony invitation view — server.py:5332 `get_event_invitation`. Checks
// db.event_invitations FIRST (QR codes from StudioProfileQrCodes.jsx point at
// this exact URL), so the response carries the per-event design_id/deity_id
// override, that ceremony's own `enabled` toggle, and its independent
// expires_at — none of which the generic /full envelope's `invite` reflects
// (that one always uses the profile-level design_id/deity_id). Same
// InvitationPublicView shape as /full's `invite`, `events[]` pre-filtered to
// this event_type. Errors: 400 unknown event_type, 404 no event_invitations
// row + no matching legacy event ("not found in this invitation"), 404
// explicitly disabled/expired ("... is not available"), 410 profile-level
// link expired.
export const getEventInvitation = (slug, eventType) =>
  client.get(`/api/invite/${slug}/${eventType}`);

// ponytail: `passcode` is accepted here (recon §8's documented fallback shape)
// but the backend route takes no such param today and will ignore it — real
// passcode-gated access is a different endpoint keyed by event_id, not slug:
// POST /api/event/{event_id}/verify-access. Wire that separately when the
// private-invitation lane needs it; this stays a harmless no-op retry until then.
export const getBySlug = (slug, passcode) =>
  client.get(`/api/invite/${slug}`, passcode ? { params: { passcode } } : undefined);

export const submitGreeting = (slug, payload) => client.post(`/api/invite/${slug}/greetings`, payload);

export const getBlessings = (slug) => client.get(`/api/invite/${slug}/blessings`);

// guest-invite lane ----------------------------------------------------------

// Lightweight teaser payload for the save-the-date page (no view tracking).
export const getSaveTheDate = (slug) => client.get(`/api/save-the-date/${slug}`);

// Masked public gift-registry view (bank digits redacted server-side) — do
// NOT use the raw `gifts` field on the /full envelope for rendering; that's
// the unmasked admin doc (see recon §8 vs gift_registry.py:public_gifts).
export const getGifts = (slug) => client.get(`/api/invite/${slug}/gifts`);

// "Blessings for the couple" wall. Recon §5 shows two parallel systems —
// /greetings (db.greetings, pending-by-default) vs /wishes (db.guest_wishes,
// auto-approved). The `wishes[]` array on the /full envelope is sourced from
// db.guest_wishes (server.py:5009), so submissions must go through /wishes
// or a guest's blessing would land in a different, moderation-gated
// collection and never appear on the wall they just posted to.
export const submitWish = (slug, payload) => client.post(`/api/invite/${slug}/wishes`, payload);

// Public read of the blessings wall (db.guest_wishes): featured/top-3 first,
// then newest. Used by invitation pages that render their own wishes section.
export const getWishes = (slug) => client.get(`/api/public/invite/${slug}/wishes`);

// Resolve a public invite NUMBER (00001) → { slug, canonical_url, face_match_url,
// … }. Pages that only carry a number in the URL call this once, then use the
// returned legacy slug for everything else. 404 when the number is unknown /
// unpublished / expired.
export const resolveByNumber = (number) => client.get(`/api/invite/by-number/${number}`);

// RSVP — captchaId/captchaAnswer are query params alongside slug (see
// server.py submit_rsvp signature), not part of the RSVPCreate body.
export const submitRsvp = (slug, payload, captchaId, captchaAnswer) => {
  const params = { slug };
  if (captchaId) params.captcha_id = captchaId;
  if (captchaAnswer != null && captchaAnswer !== '') params.captcha_answer = captchaAnswer;
  return client.post('/api/rsvp', payload, { params });
};

export const generateCaptcha = () => client.post('/api/captcha/generate', {});

// Digital shagun — record (unverified, blessing-counter only) + Razorpay path.
export const recordShagun = (slug, payload) => client.post(`/api/invite/${slug}/shagun/record`, payload);
export const createShagunRazorpayOrder = (slug, payload) => client.post(`/api/invite/${slug}/shagun/razorpay/order`, payload);
export const verifyShagunRazorpay = (slug, payload) => client.post(`/api/invite/${slug}/shagun/razorpay/verify`, payload);

// qr-couple lane — Guest Arrival page.
export const checkIn = (slug, payload) => client.post(`/api/invite/${slug}/check-in`, payload);

export const roomLookup = (slug, name) =>
  client.get(`/api/invite/${slug}/room-lookup`, { params: { name } });

// Song requests — guest-submitted playlist. `/songs` is the public alias
// (avoids the catch-all `/invite/{slug}/{event_type}` route); POST is the
// same path both aliases share.
export const listSongRequests = (slug, limit = 30) =>
  client.get(`/api/invite/${slug}/songs`, { params: { limit } });
export const submitSongRequest = (slug, payload) =>
  client.post(`/api/invite/${slug}/song-requests`, payload);
