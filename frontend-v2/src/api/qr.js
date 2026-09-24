import client from './client';

export { client };

// Live-gallery lane: fire-and-forget scan ping (bumps gallery_privacy.stats.qr_scans
// server-side; also called implicitly by GET /privacy, this is the explicit one-shot
// version for the wall page). Never blocks the UI on failure.
export const scanPing = (slug) => client.post(`/api/public/qr-scan/${slug}`).catch(() => {});

// qr-couple lane — Studio "Wedding QR Codes" page (Bearer admin_token, auto-
// attached by client.js). Wraps the per-invitation QR admin routes in
// server.py (grep "regenerate-qr" / "event-invitations").
export const getProfile = (profileId) => client.get(`/api/admin/profiles/${profileId}`);

export const listEventInvitations = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/event-invitations`);

export const regenerateQr = (invitationId) =>
  client.post(`/api/admin/event-invitations/${invitationId}/regenerate-qr`);

export const regenerateAllQrs = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/regenerate-all-qrs`);

// The ONE face-match QR for a wedding — server-rendered, cached on the profile.
// Distinct from the per-ceremony invitation QRs above: those open an invitation
// page, this opens the guest "find my photos" gallery. One per wedding because
// the Rekognition collection is per wedding, so a per-ceremony code would be
// several QRs pointing at one identical search. 409 GALLERY_NOT_ENABLED when
// the AI gallery has not been switched on yet.
export const faceMatchQr = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/face-match-qr`);
