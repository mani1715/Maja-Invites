import client from './client';

// Dynamic Event Engine — the non-wedding celebration product (Ganesh
// Chaturthi first, other festivals from the same registry). Entirely separate
// from the wedding profile: its own collection, its own public route
// (/e/:slug), and a community money model rather than a single buyer.
//
// VERIFIED against backend/event_lifecycle_service.py, event_money_service.py
// and event_finance_service.py. Field names below are the ones the backend
// actually uses, which are NOT the obvious ones:
//   • the identifier is `event_id`, not `id`
//   • the display name is `title`, not `name`
//   • the public slug is `publish_slug`, not `slug`
//   • edits go through PATCH /autosave with a patch body, not PUT
//
// The whole module is behind a server-side gate (`_gate()`): when it is off
// EVERY route 404s, including the registry. Callers must treat a 404 on
// registry() as "engine disabled", not "error".

// ---- registry / catalogue ------------------------------------------------
export const registry = () => client.get('/api/events/registry');
export const registryFor = (eventType) => client.get(`/api/events/registry/${eventType}`);
export const templates = (eventType) => client.get(`/api/events/templates/${eventType}`);
export const starterContent = (eventType) => client.get(`/api/events/starter-content/${eventType}`);
export const pricing = (eventType) => client.get(`/api/events/pricing/${eventType}`);
export const plans = (eventType) => client.get(`/api/events/plans/${eventType}`);

// ---- owner CRUD ----------------------------------------------------------
export const list = () => client.get('/api/events');
export const get = (eventId) => client.get(`/api/events/${eventId}`);

/** Creates a DRAFT. Only event_type is accepted; everything else is autosaved
 *  afterwards. Returns {event_id, status, event_type}. */
export const create = (eventType) => client.post('/api/events', { event_type: eventType });

/** The only write path for event content. Body is the patch itself. */
export const autosave = (eventId, patch) =>
  client.patch(`/api/events/${eventId}/autosave`, patch);

/** Server-side publish readiness. Returns {ok, errors[]}. */
export const validate = (eventId) => client.post(`/api/events/${eventId}/validate`);

export const publish = (eventId, opts = {}) =>
  client.post(`/api/events/${eventId}/publish`, opts);

export const archive = (eventId) => client.post(`/api/events/${eventId}/archive`);
export const restore = (eventId) => client.post(`/api/events/${eventId}/restore`);
export const remove = (eventId) => client.delete(`/api/events/${eventId}`);

// ---- committee / money members ------------------------------------------
export const members = (eventId) => client.get(`/api/events/${eventId}/members`);
export const addMember = (eventId, payload) => client.post(`/api/events/${eventId}/members`, payload);
export const removeMember = (eventId, memberId) =>
  client.delete(`/api/events/${eventId}/members/${memberId}`);

export const moneyMembers = (eventId) => client.get(`/api/events/${eventId}/money-members`);
export const addMoneyMember = (eventId, payload) =>
  client.post(`/api/events/${eventId}/money-members`, payload);
export const removeMoneyMember = (eventId, memberId) =>
  client.delete(`/api/events/${eventId}/money-members/${memberId}`);

// ---- owner finance -------------------------------------------------------
export const financeDashboard = (eventId) => client.get(`/api/events/${eventId}/finance/dashboard`);
export const financeConfig = (eventId) => client.get(`/api/events/${eventId}/finance/config`);
export const financeBudget = (eventId) => client.get(`/api/events/${eventId}/finance/budget`);
export const saveBudget = (eventId, payload) =>
  client.put(`/api/events/${eventId}/finance/budget`, payload);
export const moneyReportCsv = (eventId) => `/api/events/${eventId}/money-report.csv`;

// ---- PUBLIC (no auth) ----------------------------------------------------
/** Returns the event doc itself — not wrapped. Includes venue, organizer,
 *  schedule, gallery, sponsors, journey, highlights, prasadam, template and
 *  granted_features. 404 = not found, unpublished, suspended, or engine off. */
export const publicEvent = (slug) => client.get(`/api/public/events/${slug}`);

/** {donors[], top[], upi_id, qr_image_url, causes[], spending?} */
export const publicLeaderboard = (slug) =>
  client.get(`/api/public/events/${slug}/leaderboard`);

export const publicBlessings = (slug, limit = 100) =>
  client.get(`/api/public/events/${slug}/blessings`, { params: { limit } });

export const submitBlessing = (slug, guest_name, message) =>
  client.post(`/api/public/events/${slug}/blessings`, { guest_name, message });

export const publicRsvp = (slug, payload) =>
  client.post(`/api/public/events/${slug}/rsvp`, payload);

// ---- public donations (event_finance_service.py) --------------------------
// Three endpoints, two paths through them.
//
//   OFFLINE  donate            -> {pledged, donation_id, status:"pending"}
//            The guest pays by UPI/cash and a treasurer confirms it later.
//
//   ONLINE   donate/order      -> {configured:true, order_id, amount, currency,
//                                  key_id, donation_id}   amount is in PAISE,
//                                  already multiplied — do not multiply again.
//            donate/verify     -> {verified, receipt_number, amount}
//
// donate/order RECORDS THE PLEDGE FIRST and only then tries Razorpay, so when
// no keys are configured it answers {configured:false, donation_id, status}
// rather than failing — the guest's intent is never lost. Handle that branch.
export const publicDonate = (slug, payload) =>
  client.post(`/api/public/events/${slug}/donate`, payload);

export const publicDonateOrder = (slug, payload) =>
  client.post(`/api/public/events/${slug}/donate/order`, payload);

/** Server-side signature check. Field names are Razorpay's, verbatim. */
export const publicDonateVerify = (payload) =>
  client.post('/api/public/events/donate/verify', payload);

// ---- super-admin: event platform operations ------------------------------
// event_admin_service.py, prefix /api/admin/events, require_super_admin.
// These are NOT gated by the module flag — you can moderate events even with
// the engine switched off, which is deliberate: turning the module off should
// not strand whatever is already live.
export const adminDashboard = () => client.get('/api/admin/events/dashboard');
export const adminSearch = (params = {}) => client.get('/api/admin/events/search', { params });
export const adminAuditLogs = (params = {}) => client.get('/api/admin/events/audit-logs', { params });

/** action: approve|reject|suspend|restore|feature|unfeature|hide|unhide|flag|unflag|verify */
export const adminModerate = (eventId, action, reason = '') =>
  client.post(`/api/admin/events/${eventId}/moderate`, { action, reason });

export const adminTransfer = (eventId, newOwnerId) =>
  client.post(`/api/admin/events/${eventId}/transfer`, { new_owner_id: newOwnerId });
export const adminClone = (eventId, newOwnerId = null) =>
  client.post(`/api/admin/events/${eventId}/clone`, { new_owner_id: newOwnerId });

/** `reason` is a QUERY parameter on this route, not a body field. */
export const adminSoftDelete = (eventId, reason = '') =>
  client.delete(`/api/admin/events/${eventId}`, { params: { reason } });
export const adminRestoreDeleted = (eventId) =>
  client.post(`/api/admin/events/${eventId}/restore-deleted`, {});
