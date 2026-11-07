import client from './client';

// Public guest gallery. Privacy/unlock live in @/lib/galleryAccess (a hook,
// not a plain fetcher, because the device-token persistence is stateful).
export const getPrivacy = (slug) => client.get(`/api/public/gallery/${slug}/privacy`);

export const unlock = (slug, code, remember = true) =>
  client.post(`/api/public/gallery/${slug}/unlock`, { code, remember });

// ---- Live gallery wall (merged photographer + guest feed) ----------------
// deviceToken forwards the gallery unlock token so a PIN-protected wall's feed
// is authorized server-side (the backend now gates this route). Omit it for
// unprotected galleries — the backend gate no-ops there.
export const getWall = (slug, { since, limit = 24, skip = 0, deviceToken } = {}) =>
  client.get(`/api/invite/${slug}/live-gallery`, {
    params: { since, limit, skip },
    headers: deviceToken ? { 'X-Gallery-Device-Token': deviceToken } : {},
  });

// Multipart guest upload — one file per call (backend accepts a single `file`).
export const guestUpload = (slug, file, guestName, caption) => {
  const form = new FormData();
  form.append('file', file);
  form.append('guest_name', guestName || 'Guest');
  if (caption) form.append('caption', caption);
  return client.post(`/api/invite/${slug}/gallery/guest-upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const favoritePhoto = (slug, photoId, deviceId) =>
  client.post(`/api/invite/${slug}/live-gallery/favorite`, { photo_id: photoId, device_id: deviceId });

// ---- Admin/studio moderation (WeddingLiveGallery page) --------------------
export const adminGetPhotos = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/live-gallery`);

export const moderatePhoto = (photoId, approved) =>
  client.put(`/api/admin/live-gallery/${photoId}/moderate`, null, { params: { approved } });

export const getLiveGallerySettings = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/live-gallery/settings`);

export const updateLiveGallerySettings = (profileId, settings) =>
  client.put(`/api/admin/profiles/${profileId}/live-gallery/settings`, settings);

// ---- Admin gallery privacy / access-code gate (gallery_privacy.py) --------
// The public read side (getPrivacy/unlock, above) only covers what a guest
// needs. This is the photographer-facing admin surface: set/change the code,
// reset it, force-logout every trusted device, and view unlock analytics.
export const adminGetPrivacy = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/privacy`);

export const adminUpdatePrivacy = (profileId, payload) =>
  client.put(`/api/admin/profiles/${profileId}/gallery/privacy`, payload);

export const adminResetPrivacyCode = (profileId, code) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/privacy/reset-code`, { code });

export const adminLogoutAllDevices = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/privacy/logout-all`);

export const adminPrivacyAnalytics = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/privacy/analytics`);

// ---- QR "all photos" whole-album browse + capped downloads ----------------
// Thumbnails only; full-res comes from grantDownload (server counts the cap).
export const getAllPhotos = (slug, { limit = 200, offset = 0, deviceToken } = {}) =>
  client.get(`/api/public/gallery/${slug}/all-photos`, {
    params: { limit, offset },
    headers: deviceToken ? { 'X-Gallery-Device-Token': deviceToken } : {},
  });

// One capped full-res download. scope 'all' → { photo_id, device_id }; scope
// 'face' → { photo_id, mobile, session_id }. Returns { url, remaining, cap }.
export const grantDownload = (slug, payload, deviceHeader = {}) =>
  client.post(`/api/public/gallery/${slug}/download`, payload, { headers: deviceHeader });

// ---- Standalone & Integrated Gallery Management ----------------
export const getCommercialOptions = () =>
  client.get('/api/subscriptions/commercial-options');

export const createGallery = (payload) =>
  client.post('/api/admin/galleries', payload);

export const listGalleries = (params) =>
  client.get('/api/admin/galleries', { params });

export const getGallery = (galleryId) =>
  client.get(`/api/admin/galleries/${galleryId}`);

export const updateGallery = (galleryId, payload) =>
  client.patch(`/api/admin/galleries/${galleryId}`, payload);

export const attachInvitation = (galleryId, invitationId) =>
  client.post(`/api/admin/galleries/${galleryId}/attach-invitation`, { invitation_id: invitationId });

export const detachInvitation = (galleryId) =>
  client.post(`/api/admin/galleries/${galleryId}/detach-invitation`);

export const publishGallery = (galleryId) =>
  client.post(`/api/admin/galleries/${galleryId}/publish`);

export const unpublishGallery = (galleryId) =>
  client.post(`/api/admin/galleries/${galleryId}/unpublish`);

export const setGalleryCover = (galleryId, photoId, positionY = 50) =>
  client.post(`/api/admin/galleries/${galleryId}/cover`, { photo_id: photoId, position_y: positionY });

export const getPublicGalleryView = (slug, preview = false) =>
  client.get(`/api/public/gallery/${slug}/view`, { params: preview ? { preview: 1 } : {} });

// ---- Album Management ----------------
export const listAlbums = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/albums`);

export const createAlbum = (profileId, payload) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/albums`, payload);

export const updateAlbum = (profileId, albumId, payload) =>
  client.patch(`/api/admin/profiles/${profileId}/gallery/albums/${albumId}`, payload);

export const deleteAlbum = (profileId, albumId) =>
  client.delete(`/api/admin/profiles/${profileId}/gallery/albums/${albumId}`);

export const movePhotos = (profileId, photoIds, targetAlbumId) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/photos/move-album`, {
    photo_ids: photoIds,
    target_album_id: targetAlbumId,
  });

export const listPhotos = (profileId, params) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/photos`, { params });

export const deletePhoto = (profileId, photoId) =>
  client.delete(`/api/admin/profiles/${profileId}/gallery/photos/${photoId}`);

export const bulkUploadPhotos = (profileId, formData, onProgress) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/bulk-upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  });
