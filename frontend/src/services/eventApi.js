/**
 * eventApi.js — MAJA Dynamic Event Engine: the frontend API layer (Doc 06 §API Layer).
 * ====================================================================================
 *
 * Purpose
 *   The ONE place the event module talks to the backend. Doc 06 is explicit:
 *   "Never call fetch() directly inside components" — every builder screen, the
 *   dashboard, and the public renderer go through these services. Thin wrappers
 *   over the app's shared axios (which already carries the photographer/admin
 *   Bearer token via AuthContext), so they inherit auth, base URL and interceptors.
 *
 * Design (Doc 06 §Reusability): NOT event-specific. `EventService` covers the
 *   lifecycle; `childService(collection)` returns a generic CRUD client for ANY
 *   child collection (committee/schedule/gallery/albums/donations/sponsors/
 *   expenses/rsvp) — a new collection needs no new code here.
 *
 * The whole surface is gated server-side by `ganesh_module_enabled`; when OFF
 *   every call 404s, which callers treat as "module unavailable".
 */
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const base = `${API_URL}/api/events`;

// Event endpoints accept BOTH personas via get_current_buyer: a photographer (Bearer
// admin_token) and a signed-in family/host (httpOnly user cookie). `evax` sends the
// cookie (withCredentials) and adds the admin Bearer when present — without clobbering an
// explicit Authorization (the money-member portal passes its own scoped token).
const evax = axios.create({ withCredentials: true });
evax.interceptors.request.use((config) => {
  try {
    if (!(config.headers && config.headers.Authorization)) {
      const t = typeof localStorage !== 'undefined' && localStorage.getItem('admin_token');
      if (t) config.headers = { ...(config.headers || {}), Authorization: `Bearer ${t}` };
    }
  } catch (_) { /* ignore */ }
  return config;
});

const data = (p) => p.then((r) => r.data);

// --------------------------------------------------------------------------- //
// lifecycle + registry
// --------------------------------------------------------------------------- //
export const EventService = {
  // registry (which event types exist + a type's builder config/sections)
  listTypes: () => data(evax.get(`${base}/registry`)),
  getConfig: (eventType) => data(evax.get(`${base}/registry/${eventType}`)),
  // child-collection field metadata (drives config-driven add/edit forms)
  childCollectionsMeta: () => data(evax.get(`${API_URL}/api/event-meta/child-collections`)),
  // approved invitation designs for an event type (the template catalog)
  templates: (eventType) => data(evax.get(`${base}/templates/${eventType}`)),

  // dashboard
  list: () => data(evax.get(base)),
  create: (eventType) => data(evax.post(base, { event_type: eventType })),
  get: (eventId) => data(evax.get(`${base}/${eventId}`)),

  // builder
  autosave: (eventId, patch) => data(evax.patch(`${base}/${eventId}/autosave`, { patch })),
  validate: (eventId) => data(evax.post(`${base}/${eventId}/validate`)),

  // lifecycle transitions
  publish: (eventId, { editPaid = false } = {}) =>
    data(evax.post(`${base}/${eventId}/publish`, { edit_paid: editPaid })),
  archive: (eventId) => data(evax.post(`${base}/${eventId}/archive`)),
  restore: (eventId) => data(evax.post(`${base}/${eventId}/restore`)),
  remove: (eventId) => data(evax.delete(`${base}/${eventId}`)),

  // public renderer + guest actions (no auth)
  publicBySlug: (slug) => data(evax.get(`${API_URL}/api/public/events/${slug}`)),
  publicRsvp: (slug, body) => data(evax.post(`${API_URL}/api/public/events/${slug}/rsvp`, body)),
  publicDonate: (slug, body) => data(evax.post(`${API_URL}/api/public/events/${slug}/donate`, body)),
  // online donation (Razorpay): create an order, then verify after checkout
  publicDonateOrder: (slug, body) => data(evax.post(`${API_URL}/api/public/events/${slug}/donate/order`, body)),
  publicDonateVerify: (body) => data(evax.post(`${API_URL}/api/public/events/donate/verify`, body)),
  // v2 — donor leaderboard + blessings wall (no auth)
  publicLeaderboard: (slug) => data(evax.get(`${API_URL}/api/public/events/${slug}/leaderboard`)),
  publicBlessings: (slug) => data(evax.get(`${API_URL}/api/public/events/${slug}/blessings`)),
  publicSubmitBlessing: (slug, body) => data(evax.post(`${API_URL}/api/public/events/${slug}/blessings`, body)),
  // v2 — money-collection member portal (scoped token in localStorage.event_money_token)
  moneyLogin: (body) => data(evax.post(`${API_URL}/api/event-money/login`, body)),
  moneyHeaders: () => {
    const t = (typeof localStorage !== 'undefined') && localStorage.getItem('event_money_token');
    return t ? { headers: { Authorization: `Bearer ${t}` } } : {};
  },
  moneyOverview: () => data(evax.get(`${API_URL}/api/event-money/overview`, EventService.moneyHeaders())),
  moneyBoard: () => data(evax.get(`${API_URL}/api/event-money/donations`, EventService.moneyHeaders())),
  moneyAddDonation: (body) => data(evax.post(`${API_URL}/api/event-money/donations`, body, EventService.moneyHeaders())),
  moneyAddExpense: (body) => data(evax.post(`${API_URL}/api/event-money/expenses`, body, EventService.moneyHeaders())),
  moneyReportUrl: () => `${API_URL}/api/event-money/report.csv`,
  // owner — manage member logins
  moneyMembers: (eventId) => data(evax.get(`${base}/${eventId}/money-members`)),
  moneyCreateMember: (eventId, body) => data(evax.post(`${base}/${eventId}/money-members`, body)),
  moneyRevokeMember: (eventId, memberId) => data(evax.delete(`${base}/${eventId}/money-members/${memberId}`)),

  // gallery media upload (multipart) — authed owner/gallery-manager
  uploadGalleryMedia: (eventId, file, { album_id, caption, on_duplicate, festival_day } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (album_id) fd.append('album_id', album_id);
    if (caption) fd.append('caption', caption);
    if (festival_day != null && festival_day !== '') fd.append('festival_day', String(festival_day));
    fd.append('on_duplicate', on_duplicate || 'keep');
    return data(evax.post(`${base}/${eventId}/gallery/upload`, fd));
  },
  dayPhotoStatus: (eventId, day) => data(evax.get(`${base}/${eventId}/days/${day}/photo-status`)),
  // v2 — owner-set prices (design + plans + feature add-ons)
  eventDesignOffer: (eventType, templateId) =>
    data(evax.get(`${base}/design-offer/${eventType}/${templateId}`)),
  eventPricing: (eventType) => data(evax.get(`${base}/pricing/${eventType}`)),
  eventQuote: (body) => data(evax.post(`${base}/pricing/quote`, body)),
  // v2 — self-serve buy → auto-create
  eventPlans: (eventType, templateId = '') =>
    data(evax.get(`${base}/plans/${eventType}`, { params: templateId ? { template_id: templateId } : {} })),
  eventPurchase: (body) => data(evax.post(`${base}/purchase`, body)),
  eventPurchaseVerify: (body) => data(evax.post(`${base}/purchase/verify`, body)),
  starterContent: (eventType, lang, option) =>
    data(evax.get(`${base}/starter-content/${eventType}`, { params: { lang, option } })),
  // v2 — "I need an extra feature on my link" (owner reviews + grants)
  requestCatalog: (eventType) => data(evax.get(`${API_URL}/api/event-requests/catalog/${eventType}`)),
  listRequests: (eventId) => data(evax.get(`${API_URL}/api/event-requests/${eventId}`)),
  createRequest: (eventId, body) => data(evax.post(`${API_URL}/api/event-requests/${eventId}`, body)),
};

// --------------------------------------------------------------------------- //
// generic child-collection client (Doc 05 §10-17) — one factory for all of them
// --------------------------------------------------------------------------- //
export function childService(collection) {
  const root = (eventId) => `${base}/${eventId}/${collection}`;
  return {
    collection,
    list: (eventId, params = {}) => data(evax.get(root(eventId), { params })),
    get: (eventId, childId) => data(evax.get(`${root(eventId)}/${childId}`)),
    create: (eventId, payload) => data(evax.post(root(eventId), payload)),
    update: (eventId, childId, payload) => data(evax.patch(`${root(eventId)}/${childId}`, payload)),
    remove: (eventId, childId) => data(evax.delete(`${root(eventId)}/${childId}`)),
    reorder: (eventId, orderedIds) =>
      data(evax.post(`${root(eventId)}/reorder`, { ordered_ids: orderedIds })),
    action: (eventId, childId, name) =>
      data(evax.post(`${root(eventId)}/${childId}/${name}`)),
  };
}

// convenience singletons for the collections the builder uses today
export const CommitteeService = childService('committee_members');
export const ScheduleService = childService('festival_schedule');
export const GalleryService = childService('gallery');
export const AlbumService = childService('albums');
export const DonationService = childService('donations');
export const SponsorService = childService('sponsors');
export const ExpenseService = childService('expenses');
export const RsvpService = childService('event_rsvp');

export default EventService;
