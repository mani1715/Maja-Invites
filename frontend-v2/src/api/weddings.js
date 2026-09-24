import client from './client';

// Wedding (profile) lifecycle — the studio's core entity.
//
// Backend map (all verified against backend/server.py + admin_dashboard_v2.py):
//   POST   /api/admin/profiles                    create  (ProfileCreate)
//   GET    /api/admin/profiles/{id}               read    (ProfileResponse)
//   PUT    /api/admin/profiles/{id}               update  (ProfileUpdate, partial)
//   DELETE /api/admin/profiles/{id}               soft delete (is_active=false)
//   POST   /api/weddings/{id}/publish             publish (lifecycle service;
//                                                 credits retired -> cost 0)
//   PATCH  /api/admin/profiles/{id}/quick         unpublish / rename / tags
//   POST   /api/admin/profiles/bulk-action        archive / unarchive / delete
//   POST   /api/weddings/{id}/slug/validate       slug uniqueness
//   POST   /api/admin/profiles/{id}/upload-photo  multipart, WebP variants
//   GET    /api/admin/profiles/{id}/media         gallery/media records
//
// NOTE ON PUBLISH: quick-edit deliberately REFUSES status=PUBLISHED on a
// not-yet-published profile (server-side guard in admin_dashboard_v2.py). The
// only publish path is /api/weddings/{id}/publish — do not "optimise" this by
// PATCHing status directly, it will 400.

export const create = (payload) => client.post('/api/admin/profiles', payload);

// Canonical wedding-profile list. A super-admin sees EVERY studio's events here
// (server filters by admin_id only for non-super callers), so this is the admin
// Events page's single source of truth — NOT the festival engine (db.events).
// params: page, page_size, status(all|draft|published|expiring|archived|trash),
//         sort, q, tag
export const listPaginated = (params = {}) =>
  client.get('/api/admin/profiles/paginated', { params });

// Super-admin: create a wedding invitation owned by a specific photographer.
// Uses the server's ?on_behalf_of=<photographerId> branch in create_profile
// (server.py) — the new profile's admin_id is set to that photographer, so it
// shows up under their studio dashboard, not the admin's.
export const createFor = (onBehalfOf, payload) =>
  client.post('/api/admin/profiles', payload, {
    params: onBehalfOf ? { on_behalf_of: onBehalfOf } : undefined,
  });

export const get = (profileId) => client.get(`/api/admin/profiles/${profileId}`);

export const update = (profileId, payload) =>
  client.put(`/api/admin/profiles/${profileId}`, payload);

export const remove = (profileId) => client.delete(`/api/admin/profiles/${profileId}`);

export const publish = (profileId) => client.post(`/api/weddings/${profileId}/publish`);

export const unpublish = (profileId) =>
  client.patch(`/api/admin/profiles/${profileId}/quick`, { status: 'DRAFT' });

export const quickEdit = (profileId, payload) =>
  client.patch(`/api/admin/profiles/${profileId}/quick`, payload);

export const setTags = (profileId, tags) =>
  client.patch(`/api/admin/profiles/${profileId}/tags`, { tags });

export const bulkAction = (ids, action) =>
  client.post('/api/admin/profiles/bulk-action', { ids, action });

export const archive = (profileId) => bulkAction([profileId], 'archive');
export const unarchive = (profileId) => bulkAction([profileId], 'unarchive');

export const validateSlug = (profileId, slug) =>
  client.post(`/api/weddings/${profileId}/slug/validate`, { slug });

export const listMedia = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/media`);

/** Multipart photo upload. Server converts to responsive WebP variants and
 *  returns a ProfileMedia whose `media_url` is the original variant. */
export const uploadPhoto = (profileId, file, caption = '') => {
  const form = new FormData();
  form.append('file', file);
  form.append('caption', caption);
  return client.post(`/api/admin/profiles/${profileId}/upload-photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Image conversion on the server outruns the 10s client default.
    timeout: 60000,
  });
};

// ---- final wedding album (Phase 27) --------------------------------------
// Distinct from the guest gallery: this is the finished, curated set the
// studio delivers. Max 50 items per profile, server-enforced.
// Media rows: { id, profile_id, media_type: photo|video, media_url,
//               thumbnail_url, caption, order, file_size, created_at }
export const albumMedia = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/album-media`);

export const deleteAlbumMedia = (profileId, mediaId) =>
  client.delete(`/api/admin/profiles/${profileId}/album-media/${mediaId}`);

/** `captions` is a JSON string, positionally matched to `files`. */
export const uploadAlbumMedia = (profileId, files, captions = []) => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  if (captions.length) form.append('captions', JSON.stringify(captions));
  return client.post(`/api/admin/profiles/${profileId}/upload-album-media`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
};

// ---- post-wedding thank-you message (Phase 27, server.py ~line 9484) -----
// Model: ThankYouMessageCreate/Response in backend/models.py — enabled,
// message_type (text|video), message_text (<=1000 chars), video_url,
// video_thumbnail, scheduled_date, is_published (server-computed: enabled AND
// (no scheduled_date OR scheduled_date has passed)).
export const getThankYou = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/thank-you`);

export const saveThankYou = (profileId, payload) =>
  client.put(`/api/admin/profiles/${profileId}/thank-you`, payload);

/** Generic admin video upload (server.py ~line 4691) — MP4/WebM/MOV, max 200MB.
 *  Returns { url, file_size }; the thank-you note stores `url` as video_url. */
export const uploadThankYouVideo = (profileId, file) => {
  const form = new FormData();
  form.append('file', file);
  form.append('profile_id', profileId);
  form.append('type', 'thank_you_video');
  return client.post('/api/admin/upload-video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
};
