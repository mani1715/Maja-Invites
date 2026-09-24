import client from './client';

// Studio business surfaces — the photographer's own operations, as opposed to
// any one wedding. Every one of these routers already existed and had no UI.
//
//   /api/studio/earnings|insights          finance + analytics rollups
//   /api/studio/staff*                     team, invites, ownership transfer
//   /api/studio/white-label                branding
//   /api/admin/account/*                   password/email/phone/devices
//   /api/admin/audit-logs                  who changed what
//   /api/calendar/*                        occupancy + bookings
//   /api/cloud-backup/*                    studio file backup
//   /admin/studio-storage/*                paid storage plan + files

// ---- money + analytics ---------------------------------------------------
export const earnings = (days = 90) => client.get('/api/studio/earnings', { params: { days } });
export const insights = (days = 90) => client.get('/api/studio/insights', { params: { days } });

// ---- staff ---------------------------------------------------------------
export const staff = () => client.get('/api/studio/staff');
export const memberships = () => client.get('/api/studio/staff/memberships');
export const inviteStaff = (payload) => client.post('/api/studio/staff/invite', payload);
export const updateStaff = (id, patch) => client.patch(`/api/studio/staff/${id}`, patch);
export const removeStaff = (id) => client.delete(`/api/studio/staff/${id}`);
export const transferOwnership = (payload) =>
  client.post('/api/studio/staff/transfer-ownership', payload);

// ---- white label ---------------------------------------------------------
export const whiteLabel = () => client.get('/api/studio/white-label');
export const saveWhiteLabel = (payload) => client.put('/api/studio/white-label', payload);

// ---- account security ----------------------------------------------------
export const accountSummary = () => client.get('/api/admin/account/summary');
export const changePassword = (payload) => client.post('/api/admin/account/change-password', payload);
export const changeEmail = (payload) => client.post('/api/admin/account/change-email', payload);
export const changePhone = (payload) => client.post('/api/admin/account/change-phone', payload);
export const revokeDevice = (payload) => client.post('/api/admin/account/revoke-device', payload);

// ---- audit ---------------------------------------------------------------
export const auditLogs = (params = {}) => client.get('/api/admin/audit-logs', { params });

// ---- calendar ------------------------------------------------------------
/** The endpoint takes `year` and `month` as separate INTEGERS
 *  (calendar_service.month(year: int, month: int)). This was sending a single
 *  `month=YYYY-MM` string, so every load of /studio/calendar answered 422 and
 *  the page has never once shown a calendar. Takes "2026-08" and splits it, so
 *  the caller can keep working in month keys. */
export const calendarMonth = ({ month, ...rest } = {}) => {
  const [y, m] = String(month || '').split('-');
  return client.get('/api/calendar/month', {
    params: { year: Number(y), month: Number(m), ...rest },
  });
};
export const calendarBookings = (params = {}) => client.get('/api/calendar/bookings', { params });
export const calendarMeta = () => client.get('/api/calendar/meta');
export const createBooking = (payload) => client.post('/api/calendar/bookings', payload);
export const deleteBooking = (id) => client.delete(`/api/calendar/bookings/${id}`);
export const createBlock = (payload) => client.post('/api/calendar/blocks', payload);
export const deleteBlock = (id) => client.delete(`/api/calendar/blocks/${id}`);

// ---- cloud backup --------------------------------------------------------
export const backupStorage = () => client.get('/api/cloud-backup/storage');
export const backupFolders = (params = {}) => client.get('/api/cloud-backup/folders', { params });
export const backupFiles = (params = {}) => client.get('/api/cloud-backup/files', { params });
export const backupRecycleBin = () => client.get('/api/cloud-backup/recycle-bin');
export const backupRestore = (id) => client.post(`/api/cloud-backup/files/${id}/restore`);
export const backupDelete = (id) => client.delete(`/api/cloud-backup/files/${id}`);
export const backupPurge = (id) => client.delete(`/api/cloud-backup/files/${id}/purge`);

// The four that had no binding at all. `locked: true` from /storage means the
// studio has no paid storage plan, and every write below will refuse — the
// screen checks that first rather than letting each action fail separately.
export const backupHistory = () => client.get('/api/cloud-backup/history');
export const backupDeleteFolder = (fid) => client.delete(`/api/cloud-backup/folders/${fid}`);
export const backupCreateFolder = (payload) => client.post('/api/cloud-backup/folders', payload);
/** Direct link — the endpoint streams the file, so use it as an href. */
export const backupDownloadUrl = (fid) => `/api/cloud-backup/files/${fid}/download`;

// `POST /api/cloud-backup/files` (above, unused by this UI) is metadata-only —
// it records a FileIn payload whose `url` must already point at stored bytes.
// There was no route a browser could POST raw bytes to, so
// `/api/cloud-backup/upload` (multipart) was added alongside it in
// cloud_backup_service.py. Matches its server-side MAX_UPLOAD_BYTES cap.
export const BACKUP_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const backupUpload = (file, folderId, config = {}) => {
  const fd = new FormData();
  fd.append('file', file);
  if (folderId) fd.append('folder_id', folderId);
  return client.post('/api/cloud-backup/upload', fd, config);
};
/** Zips selected files (file_ids) or a whole folder (folder_id) server-side
 *  and streams the archive back — not a URL, so responseType must be 'blob'. */
export const backupDownloadZip = (payload) =>
  client.post('/api/cloud-backup/download-zip', payload, { responseType: 'blob' });

export const presignUpload = (payload) => client.post('/api/uploads/presign', payload);
export const commitUpload = (payload) => client.post('/api/uploads/commit', payload);

// ---- paid studio storage -------------------------------------------------
export const storageStatus = () => client.get('/api/admin/studio-storage/status');
export const storagePlans = () => client.get('/api/admin/studio-storage/plans');
export const storageMyPlan = () => client.get('/api/admin/studio-storage/my-plan');
export const storageFiles = (params = {}) => client.get('/api/admin/studio-storage/files', { params });
/** Creates the Razorpay order server-side (server decides the price —
 *  studio_storage.py:595-676). Response: {order_id, amount (paise), currency,
 *  key_id, plan}. */
export const storageSubscribe = (planId) =>
  client.post('/api/admin/studio-storage/subscribe', { plan_id: planId });
/** VerifyPaymentRequest requires plan_id alongside the three Razorpay fields
 *  (studio_storage.py:159-163) — it re-derives the order from `order_id`
 *  server-side, plan_id is just part of the request schema. */
export const storageVerifyPayment = (payload) =>
  client.post('/api/admin/studio-storage/verify-payment', payload);

// ---- active sessions + MFA ----------------------------------------------
// device_sessions rows for the signed-in admin. Revoked rows are returned too,
// so filter on `revoked` rather than assuming the list is all-active.
export const authSessions = () => client.get('/api/auth/sessions');
export const logoutAllSessions = () => client.post('/api/auth/logout-all', {});

export const mfaStatus = () => client.get('/api/admin/mfa/status');
export const mfaEnrollStart = () => client.post('/api/admin/mfa/enroll/start', {});
export const mfaEnrollVerify = (code) => client.post('/api/admin/mfa/enroll/verify', { code });
export const mfaDisable = (code) => client.post('/api/admin/mfa/disable', { code });

// ---- AI writing tools -----------------------------------------------------
// premium_features.py. These are AUTHORING aids, not automation: each returns
// text for a human to read, edit and paste. Available to any admin (the
// photographer included), not just super-admins.
//
// They need GEMINI_API_KEY on the server. Without it every call answers 503
// with the "AI muse is resting" wording, which is a real, readable message —
// so the UI shows the server's own text rather than inventing one.

/** {guest_name, relation?, tone: formal|warm|playful|royal,
 *   language: en|te|hi|ta|kn|mr|bn, couple?} -> {greeting} */
export const aiGreeting = (payload) => client.post('/api/admin/ai/greeting-personalize', payload);

/** {items: {key: text}, target_language} -> {translations, target_language}.
 *  Keys and JSON shape are preserved; only the values are translated. */
export const aiTranslateBulk = (payload) => client.post('/api/admin/ai/translate-bulk', payload);

/** {bride, groom, how_we_met?, proposal_story?, wedding_journey?,
 *   tone: royal|emotional|poetic|cinematic|traditional|modern,
 *   language, cultural_region?} -> {story} (3 paragraphs of prose) */
export const aiStory = (payload) => client.post('/api/admin/ai/story-v2', payload);

// ---- public directory listing --------------------------------------------
// photographer_directory.py — how this studio appears in the public
// photographer directory and discovery pages.
//
// `available_now` is NOT a persistent toggle. The server stores a timestamp
// and _is_available() only returns true while it is inside a TTL window, so
// it is a heartbeat: switch it on today and it lapses on its own. The screen
// has to say that, or a studio will believe it is still advertised.
export const directoryProfile = () => client.get('/api/admin/photographer/profile');
/** {directory_listed, bio, service_cities[], portfolio_images[],
 *   portfolio_videos[], starting_price?} */
export const saveDirectoryProfile = (payload) =>
  client.post('/api/admin/photographer/profile', payload);
export const setAvailability = (availableNow) =>
  client.post('/api/admin/photographer/availability', { available_now: availableNow });

// ---- storage dashboard, folders & compression --------------------------------
export const storageDashboard = () => client.get('/api/admin/studio-storage/dashboard');
export const storageCompress = (payload) => client.post('/api/admin/studio-storage/compress', payload);
export const createStorageFolder = (name) => client.post('/api/admin/studio-storage/folders', { name });
export const deleteStorageFolder = (folderId) => client.delete(`/api/admin/studio-storage/folders/${folderId}`);

// ---- studio notifications ----------------------------------------------------
export const studioNotifications = (params = {}) => client.get('/api/studio/notifications', { params });
export const markNotificationRead = (id) => client.post('/api/studio/notifications/read', { notification_id: id });
export const markAllNotificationsRead = () => client.post('/api/studio/notifications/read-all');

// ---- client selected photos --------------------------------------------------
export const getSelectedPhotos = (profileId) => client.get(`/api/admin/profiles/${profileId}/selected-photos`);

