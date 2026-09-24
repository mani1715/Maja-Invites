import axios from 'axios';

/**
 * clientAuth.js — auth for a "photographer's client" (the couple/family given
 * a per-invitation login on the Couple Access portal). Ported from legacy
 * frontend/src/context/ClientAuthContext.js, kept as a plain module (single
 * consumer: CoupleAccess.jsx) instead of a React context.
 *
 * Deliberately ISOLATED from the admin axios instance in api/client.js:
 *   - token lives in localStorage.client_token (NOT admin_token)
 *   - its own axios instance always sends the CURRENT client token, and never
 *     touches the admin Authorization header or the admin refresh flow.
 */
const API_URL = import.meta.env.VITE_BACKEND_URL || '';

export const clientApi = axios.create({ baseURL: API_URL, timeout: 10000 });

clientApi.interceptors.request.use((config) => {
  let t = null;
  try { t = localStorage.getItem('client_token'); } catch (_e) { /* private mode */ }
  config.headers = config.headers || {};
  if (t) config.headers.Authorization = `Bearer ${t}`;
  else delete config.headers.Authorization;
  return config;
});

export function getClientToken() {
  try { return localStorage.getItem('client_token'); } catch (_e) { return null; }
}

export function clientLogout() {
  try { localStorage.removeItem('client_token'); } catch (_e) { /* private mode */ }
}

export async function clientLogin(username, password) {
  const { data } = await clientApi.post('/api/client/login', { username, password });
  if (data?.token) {
    try { localStorage.setItem('client_token', data.token); } catch (_e) { /* private mode */ }
  }
  return data; // { token, event: { profile_id, slug, couple, event_date } }
}

// The 7-day event_client token just stops validating on the backend (expiry,
// or the photographer disabled/regenerated the login) — every client/* route
// then 401s. There is no refresh flow for this persona (unlike the admin
// axios instance in api/client.js), so the only correct move is: drop the
// dead token and tell CoupleAccess.jsx to show the gate again. Listen for
// CLIENT_LOGOUT_EVENT to react (see CoupleAccess.jsx).
export const CLIENT_LOGOUT_EVENT = 'maja:client-logout';

clientApi.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    if (status === 401 && !url.includes('/api/client/login')) {
      clientLogout();
      window.dispatchEvent(new Event(CLIENT_LOGOUT_EVENT));
    }
    return Promise.reject(error);
  },
);

export const clientOverview = () => clientApi.get('/api/client/overview');
export const clientWishes = () => clientApi.get('/api/client/wishes');
export const clientAnalytics = () => clientApi.get('/api/client/analytics');
export const clientRsvps = (status) => clientApi.get('/api/client/rsvps', { params: status ? { status } : {} });
export const clientRsvpStats = () => clientApi.get('/api/client/rsvps/stats');
export const clientRsvpExport = () => clientApi.get('/api/client/rsvps/export', { responseType: 'blob' });
export const clientContracts = () => clientApi.get('/api/client/contracts');
export const clientSignContract = (contractId, signerName) =>
  clientApi.post(`/api/client/contracts/${contractId}/sign`, { signer_name: signerName });
export const clientProofing = () => clientApi.get('/api/client/proofing');
export const clientSelectPhoto = (photoId, selected, note = '') =>
  clientApi.post(`/api/client/proofing/photos/${photoId}/select`, { selected, note });
export const clientPrintOrder = (galleryId, kind, note = '') =>
  clientApi.post('/api/client/print-orders', { gallery_id: galleryId, kind, note });
export const clientApproveWish = (wishId) => clientApi.post(`/api/client/wishes/${wishId}/approve`);
export const clientFeatureWish = (wishId) => clientApi.post(`/api/client/wishes/${wishId}/feature`);
export const clientDeleteWish = (wishId) => clientApi.delete(`/api/client/wishes/${wishId}`);
