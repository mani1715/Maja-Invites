import client from './client';

// Guest list + RSVP, for one wedding.
//   guest_features.py  -> /api/admin/profiles/{id}/guests*
//   server.py          -> /api/admin/profiles/{id}/rsvps*
//
// These are two different collections and deliberately stay that way: a GUEST
// is someone the studio added to the list; an RSVP is a reply that arrived from
// the public invitation. A reply can exist with no matching guest row (anyone
// with the link can respond), so the Guests page shows them side by side rather
// than pretending they are one table.

// ---- guest list ----------------------------------------------------------
export const listGuests = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/guests`);

export const createGuest = (profileId, payload) =>
  client.post(`/api/admin/profiles/${profileId}/guests`, payload);

export const updateGuest = (profileId, guestId, payload) =>
  client.put(`/api/admin/profiles/${profileId}/guests/${guestId}`, payload);

export const deleteGuest = (profileId, guestId) =>
  client.delete(`/api/admin/profiles/${profileId}/guests/${guestId}`);

export const bulkDeleteGuests = (profileId, ids) =>
  client.post(`/api/admin/profiles/${profileId}/guests/bulk-delete`, { ids });

/** CSV template for the importer — returned as a file body, not JSON. */
export const guestTemplateUrl = (profileId) =>
  `/api/admin/profiles/${profileId}/guests/template`;

export const importGuests = (profileId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/api/admin/profiles/${profileId}/guests/import`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
};

/** Per-guest personalised WhatsApp share links (uses each guest's token). */
export const whatsappLinks = (profileId, guestIds) =>
  client.post(`/api/admin/profiles/${profileId}/guests/whatsapp-links`,
    guestIds?.length ? { guest_ids: guestIds } : {});

// ---- per-guest voice invitation (guest_features.py ~line 323) -------------
// Server re-encodes nothing — it writes the raw upload to <token>.webm and
// caps it at 5 MB (413 past that). No content-type allowlist server-side, so
// the client is the only gate; keep it honest rather than pretending there's
// a shared limit constant to import.
export const VOICE_MAX_BYTES = 5 * 1024 * 1024;

export const uploadGuestVoice = (profileId, guestId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/api/admin/profiles/${profileId}/guests/${guestId}/voice`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
};

export const deleteGuestVoice = (profileId, guestId) =>
  client.delete(`/api/admin/profiles/${profileId}/guests/${guestId}/voice`);

// ---- RSVP ----------------------------------------------------------------
export const listRsvps = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/rsvps`);

export const rsvpStats = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/rsvps/stats`);

/** CSV export. Returned as a blob so the browser can save it directly. */
export const exportRsvps = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/rsvps/export`, { responseType: 'blob' });
