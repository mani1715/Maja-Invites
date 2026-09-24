import axios from 'axios';

// Single shared axios instance for the whole app. Ports the legacy auth
// contract faithfully — see frontend/src/context/AuthContext.js and
// docs/recon/recon-backend-core.md §2 / recon-frontend-logic.md §16.
//
//  - admin/studio identity: `Authorization: Bearer <admin_token>` from
//    localStorage, attached only when present.
//  - couple identity: httpOnly `user_session_token` cookie via
//    withCredentials — cookie-only requests never enter the refresh path
//    (there is no maja_rt cookie to refresh with).
//  - single-flight refresh on 401 with a `hadBearer` guard, retried once via
//    `_majaRetried`; on refresh failure the token is cleared and a
//    `maja:logout` event is emitted for AuthContext to react to.
const API_URL = import.meta.env.VITE_BACKEND_URL || '';

export const client = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

// Every read of localStorage is try/catch-wrapped — it THROWS in Safari
// private mode, and an unguarded read here would take the whole app down.
function getAdminToken() {
  try { return localStorage.getItem('admin_token'); } catch (_) { return null; }
}
function setAdminToken(token) {
  try {
    if (token) localStorage.setItem('admin_token', token);
    else localStorage.removeItem('admin_token');
  } catch (_) { /* private mode — ignore */ }
}

client.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = null;
function doRefresh() {
  if (!refreshing) {
    refreshing = client
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        const t = data?.access_token;
        if (t) setAdminToken(t);
        return t || null;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// FastAPI's 422 `detail` is an ARRAY of objects, not a string:
//   [{type, loc, msg, input, url}, …]
// Every error handler in this app does `e?.response?.data?.detail || 'fallback'`
// — 205 of them — and an array is truthy, so on a 422 the raw array is handed
// to React as a child. React throws "Objects are not valid as a React child"
// and the whole page goes to the error boundary. That is how /studio/calendar
// looked like a crashed page when the real fault was one wrong query param.
//
// Flattening it here fixes all 205 call sites at once and cannot regress them:
// a string `detail` is passed through untouched. The original array stays on
// `data.detail_raw` for anything that wants to map errors onto form fields.
function flattenValidationDetail(response) {
  const data = response && response.data;
  if (!data || !Array.isArray(data.detail)) return;
  const msgs = data.detail.map((d) => {
    if (typeof d === 'string') return d;
    const field = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
    const msg = d?.msg || 'is invalid';
    return field ? `${field}: ${msg}` : msg;
  });
  data.detail_raw = data.detail;
  data.detail = msgs.join(' · ') || 'That request was not valid.';
}

client.interceptors.response.use(
  (r) => r,
  async (error) => {
    flattenValidationDetail(error && error.response);
    const { config, response } = error || {};
    if (!config || !response || response.status !== 401) return Promise.reject(error);
    const url = config.url || '';
    if (config._majaRetried || url.includes('/api/auth/refresh') || url.includes('/api/auth/login')) {
      return Promise.reject(error);
    }
    // Only Bearer (admin/photographer) requests have a maja_rt refresh cookie.
    // Couple (cookie-only) requests never had a bearer header — skip refresh.
    const hadBearer = !!(config.headers && (config.headers.Authorization || config.headers.authorization));
    if (!hadBearer) return Promise.reject(error);
    config._majaRetried = true;
    try {
      const t = await doRefresh();
      if (!t) throw new Error('refresh returned no token');
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${t}`;
      return client(config);
    } catch (_e) {
      setAdminToken(null);
      window.dispatchEvent(new Event('maja:logout'));
      return Promise.reject(error);
    }
  },
);

export default client;
