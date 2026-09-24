import client from './client';

// Photographer studio panel — Bearer admin_token identity.
export const myWeddings = () => client.get('/api/studio/my-weddings');
export const getWeddings = () => client.get('/api/studio/my-weddings');
export const createWedding = (payload) => client.post('/api/admin/profiles', payload);
export const updateWedding = (id, payload) => client.put(`/api/admin/profiles/${id}`, payload);


export const earnings = (days = 90) => client.get('/api/studio/earnings', { params: { days } });

export const insights = (days = 90) => client.get('/api/studio/insights', { params: { days } });

// ---- Dashboard: profile listing (admin_dashboard_v2.py) ----
export const listProfiles = ({ page = 1, page_size = 12, status, sort, q, tag } = {}) =>
  client.get('/api/admin/profiles/paginated', { params: { page, page_size, status, sort, q, tag } });

// ---- Wedding detail ----
export const getProfile = (profileId) => client.get(`/api/admin/profiles/${profileId}`);

export const quickStats = (profileId) => client.get(`/api/admin/profiles/${profileId}/quick-stats`);

export const listRsvps = (profileId) => client.get(`/api/admin/profiles/${profileId}/rsvps`);

export const listWishes = (profileId) => client.get(`/api/admin/profiles/${profileId}/wishes`);

// ---- Studio (AI) gallery — gallery_features.py ----
export const galleryStats = (profileId) => client.get(`/api/admin/profiles/${profileId}/gallery/stats`);

export const galleryPhotos = (profileId, params = {}) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/photos`, { params });

export const galleryEnable = (profileId, payload = { enabled: true }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/enable`, payload);

export const galleryDeletePhoto = (profileId, photoId) =>
  client.delete(`/api/admin/profiles/${profileId}/gallery/photos/${photoId}`);

// Multi-select delete — one call for the whole selection (photographer panel).
export const galleryBulkDeletePhotos = (profileId, ids) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/photos/bulk-delete`, { ids });

export const galleryDownloadAll = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/download-all`);

// L1 -- direct-to-S3 presign upload (large media never transits FastAPI).
// `reservation_id` ties each file to the batch hold taken by galleryReserveQuota
// below. It is optional on the wire so an older client still works — the server
// then takes a one-slot hold inline rather than letting the upload through.
export const galleryPresignUpload = (profileId, { filename, content_type, size_bytes, reservation_id }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/presign-upload`,
    { filename, content_type, size_bytes, reservation_id });

export const galleryCommitUpload = (profileId, { s3_key, original_name, reservation_id }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/commit-upload`,
    { s3_key, original_name, reservation_id });

// L1b -- multipart direct-to-S3 for big originals (parallel parts fill the pipe
// on a high-latency link; bytes go browser -> S3, control-plane only here).
export const galleryMultipartCreate = (profileId, { filename, content_type, size_bytes, reservation_id }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/multipart/create`,
    { filename, content_type, size_bytes, reservation_id });

export const galleryMultipartPresign = (profileId, { s3_key, upload_id, part_numbers }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/multipart/presign`,
    { s3_key, upload_id, part_numbers });

export const galleryMultipartComplete = (profileId, { s3_key, upload_id, parts, original_name, reservation_id }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/multipart/complete`,
    { s3_key, upload_id, parts, original_name, reservation_id });

export const galleryMultipartAbort = (profileId, { s3_key, upload_id }) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/multipart/abort`,
    { s3_key, upload_id });

// ---- AI face-match photo quota (backend/face_quota.py) -------------------
// The browser NEVER computes any of these numbers, and never decides whether a
// batch fits: it asks, and renders the answer. `reserve` is the gate in front
// of every upload — a 409 carries the full QUOTA_EXCEEDED breakdown plus the
// real top-up SKUs from the canonical price book.
export const galleryQuota = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/quota`);

export const galleryReserveQuota = (profileId, photoCount) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/quota/reserve`,
    { photo_count: photoCount });

export const galleryReleaseQuota = (profileId, reservationId) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/quota/reservations/${reservationId}/release`);

export const galleryRetryPhoto = (photoId) =>
  client.post(`/api/admin/face-ops/retry-photo/${photoId}`);

// ---- Studio gallery — upload-method config (gallery_features.py) ----------
export const galleryCredentials = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/gallery/credentials`);

export const galleryUpdateUploadMethods = (profileId, uploadMethods) =>
  client.patch(`/api/admin/profiles/${profileId}/gallery/upload-methods`, { upload_methods: uploadMethods });

export const galleryRegenerateToken = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/gallery/regenerate-token`);

// Not per-profile -- one global AWS reachability check for the settings panel.
export const galleryAwsHealth = () => client.get('/api/admin/gallery/aws/health');

// ---- Camera SFTP transfer (camera_router.py) -----------------------------
// Status/config only — image bytes go camera -> SFTP -> S3, never through here.
export const cameraProfiles = () => client.get('/api/admin/camera/profiles');
export const cameraStatus = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/camera/status`);
export const cameraConfig = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/camera/config`);
// Returns the ONE-TIME plaintext password inside `credentials` — show once.
// username/password optional (blank -> auto-generated). Re-calling on an enabled
// event updates the login.
export const cameraEnable = (profileId, { cameraKey, username, password } = {}) =>
  client.post(`/api/admin/profiles/${profileId}/camera/enable`,
    { camera_key: cameraKey, username: username || undefined, password: password || undefined });
export const cameraRotate = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/camera/rotate`);
export const cameraDisable = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/camera/disable`);
export const cameraEvents = (profileId, limit = 50) =>
  client.get(`/api/admin/profiles/${profileId}/camera/events`, { params: { limit } });

// Single-image upload for anything that needs a URL before a parent record
// exists (verification documents, challenge entries, wizard drafts). Converts
// to WebP server-side and answers with { url }. `slot` only tags the filename.
export const adminUploadImage = (file, slot = 'misc') => {
  const form = new FormData();
  form.append('file', file);
  form.append('slot', slot);
  return client.post('/api/admin/upload-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
};

// Fallback path when direct-to-S3 presign fails — multipart straight to the app server.
export const galleryBulkUploadMultipart = (profileId, files) => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return client.post(`/api/admin/profiles/${profileId}/gallery/bulk-upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
