import client from './client';

// Referral attribution (server.py + premium_features.py).
//
// A referral code belongs to a PROFILE (one wedding/invitation), not to the
// studio. Guests who see that invitation and start their own celebration can
// enter the code, and the row records who sent whom.
//
// There is no reward. The credit system that used to pay out on a completed
// referral is deleted, so anything here that promises the photographer a payout
// would be a lie — this is attribution only, and the UI says so.
//
// Codes are SINGLE USE: `referred_profile_id: null` marks the live one; once a
// guest redeems it, that row is stamped with their profile and the next read
// mints a fresh code. Every read below resolves the live code, so the studio
// panel and the public CTA cannot disagree.

/** Mint-or-fetch the live code. POST because it creates one if none exists.
 *  403 if the profile belongs to another studio (super-admin bypasses). */
export const ensureCode = (profileId) =>
  client.post(`/api/profiles/${profileId}/referral-code`);

/** {referral_code, referral_url, referral_link_short, total_referrals,
 *   completed_referrals, pending_referrals} — read-only. */
export const getCode = (profileId) =>
  client.get(`/api/profiles/${profileId}/referral-code`);

/** {total_referrals, completed_referrals, pending_referrals,
 *   recent_referrals[]} — up to 10, newest first. */
export const stats = (profileId) =>
  client.get(`/api/profiles/${profileId}/referrals`);

/** Approve one the abuse check held back, or reject one. No reward either way. */
export const override = (referral_id, action, reason) =>
  client.post('/api/admin/referrals/override', { referral_id, action, reason });

// ---- public (no auth) ----------------------------------------------------
// Two endpoints that differ only in the key they accept; the slug variant's
// resolver takes an id OR a slug, so it is a superset. Both MINT a code when
// the profile has none, which is why the cached /api/invite/{slug}/full render
// reads the collection directly instead of calling either.
export const publicCodeBySlug = (slug) =>
  client.get(`/api/public/referral-code-by-slug/${slug}`);

export const publicCodeByProfile = (profileId) =>
  client.get(`/api/public/referral-code/${profileId}`);

/** Redeem a code against a newly created profile. Rejects self-referral, a
 *  code already used, and same-IP/device bursts within 24h. */
export const apply = (referral_code, profile_id) =>
  client.post('/api/referrals/apply', { referral_code, profile_id });
