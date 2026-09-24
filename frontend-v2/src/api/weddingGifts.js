import client from './client';

// Gifting for one wedding — two independent features shown on one page:
//   gift_registry.py   -> the registry (what to give, and where)
//   premium_features.py-> Digital Shagun (cash blessings via UPI / Razorpay)

// ---- gift registry -------------------------------------------------------
export const getRegistry = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gifts`);

/** Partial update — GiftRegistryUpdate drops None, so only send what changed.
 *  Suggestions with a non-UUID id are re-issued server-side, so temporary
 *  client ids (tmp-…) are safe to send. */
export const updateRegistry = (profileId, patch) =>
  client.put(`/api/admin/profiles/${profileId}/gifts`, patch);

export const registryPresets = () => client.get('/api/gifts/presets');

// ---- digital shagun ------------------------------------------------------
export const getShagun = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/shagun`);

/** ShagunSettings is a FULL model (no Optional-drop), so always send the whole
 *  object back — a partial PUT here silently resets the omitted fields. */
export const setShagun = (profileId, settings) =>
  client.put(`/api/admin/profiles/${profileId}/shagun`, settings);

export const shagunDashboard = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/shagun/dashboard`);
