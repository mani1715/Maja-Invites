import client from './client';

// Guest messages for one wedding. Two separate backends, one page:
//   wishes_features.py -> /api/admin/profiles/{id}/wishes*   (moderated wall)
//   server.py          -> /api/admin/profiles/{id}/greetings (older greetings)
//
// Note the asymmetry, it is real and not a typo: wish moderation is scoped by
// profile, greeting moderation is NOT — greeting routes take only the greeting
// id (/api/admin/greetings/{id}/approve).

// ---- wishes (moderated wall) --------------------------------------------
export const listWishes = (profileId, params = {}) =>
  client.get(`/api/admin/profiles/${profileId}/wishes`, { params });

export const approveWish = (profileId, wishId) =>
  client.post(`/api/admin/profiles/${profileId}/wishes/${wishId}/approve`);

export const rejectWish = (profileId, wishId) =>
  client.post(`/api/admin/profiles/${profileId}/wishes/${wishId}/reject`);

export const featureWish = (profileId, wishId) =>
  client.post(`/api/admin/profiles/${profileId}/wishes/${wishId}/feature`);

export const bulkApproveWishes = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/wishes/bulk-approve`);

export const deleteWish = (profileId, wishId) =>
  client.delete(`/api/admin/profiles/${profileId}/wishes/${wishId}`);

// ---- greetings -----------------------------------------------------------
export const listGreetings = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/greetings`);

export const approveGreeting = (greetingId) =>
  client.put(`/api/admin/greetings/${greetingId}/approve`);

export const rejectGreeting = (greetingId) =>
  client.put(`/api/admin/greetings/${greetingId}/reject`);

export const deleteGreeting = (greetingId) =>
  client.delete(`/api/admin/greetings/${greetingId}`);
