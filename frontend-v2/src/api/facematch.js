import client from './client';

// "Find my photos" — selfie face-search against a gallery. See gallery_features.py
// + face_consent.py on the backend. Every call is gated by gallery privacy (device
// token, when the gallery is protected) — pass it via `deviceHeader`.
export const faceSearch = (slug, file, deviceHeader = {}) => {
  const form = new FormData();
  form.append('selfie', file);
  return client.post(`/api/public/gallery/${slug}/face-search`, form, {
    headers: { 'Content-Type': 'multipart/form-data', ...deviceHeader },
  });
};

export const faceConsent = (slug, agreed = true) =>
  client.post(`/api/public/gallery/${slug}/face-consent`, { agreed });

export const faceResults = (slug, sessionId, deviceHeader = {}) =>
  client.get(`/api/public/gallery/${slug}/face-results`, {
    params: { session_id: sessionId },
    headers: deviceHeader,
  });

export const downloadZip = (slug, sessionId, deviceHeader = {}) =>
  client.get(`/api/public/gallery/${slug}/download-zip`, {
    params: { session_id: sessionId },
    headers: deviceHeader,
  });

// Manual fallback when face-search finds nothing / fails — studio sorts by hand.
export const photoRequest = (slug, { selfie, email, whatsapp, name }, deviceHeader = {}) => {
  const form = new FormData();
  form.append('selfie', selfie);
  form.append('email', email);
  form.append('whatsapp', whatsapp);
  if (name) form.append('name', name);
  return client.post(`/api/public/gallery/${slug}/photo-request`, form, {
    headers: { 'Content-Type': 'multipart/form-data', ...deviceHeader },
  });
};
