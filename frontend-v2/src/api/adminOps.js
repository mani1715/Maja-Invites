import client from './client';

// Super-admin operations surface. Everything the owner needs to actually RUN
// the platform: take an order through fulfillment, answer support, settle a
// dispute, moderate the community, unstick the face-match queue, and watch
// system health.
//
// Every path below was read off the router source, not guessed:
//   fulfillment_service.py  /api/admin/fulfillment/*      (require_super_admin)
//   store_features.py       /api/admin/build-queue*       (require_admin)
//   support_service         /api/admin/support/*
//   disputes                /api/admin/disputes*
//   moderation              /api/admin/moderation/*
//   face ops                /api/admin/face-ops/*
//   system                  /api/admin/system/health|metrics
//   super_admin_v2.py       /api/super-admin/*            (revenue, coupons,
//                                                          broadcast, refund,
//                                                          impersonate, settings)

// ---- fulfillment ---------------------------------------------------------
export const fulfillmentRequests = (params = {}) =>
  client.get('/api/admin/fulfillment/requests', { params });

export const fulfillmentRequest = (code) =>
  client.get(`/api/admin/fulfillment/requests/${code}`);

/** Attach the live link and mark delivered. `live_url` is required (400 without). */
export const fulfillmentDeliver = (code, { live_url, profile_id }) =>
  client.post(`/api/admin/fulfillment/requests/${code}/deliver`, { live_url, profile_id });

/** Build a DRAFT invitation from the buyer's filled details. Idempotent, and
 *  explicitly NOT a delivery — the buyer sees nothing until deliver runs. */
export const fulfillmentBuild = (code, payload = {}) =>
  client.post(`/api/admin/fulfillment/requests/${code}/build-invitation`, payload);

export const fulfillmentDrive = (code, payload = {}) =>
  client.post(`/api/admin/fulfillment/requests/${code}/drive`, payload);

export const fulfillmentEvents = () => client.get('/api/admin/fulfillment/events');
export const fulfillmentLinks = () => client.get('/api/admin/fulfillment/links');

// ---- build queue ---------------------------------------------------------
export const buildQueue = () => client.get('/api/admin/build-queue');

export const buildQueueDeliver = (orderId, profileId) =>
  client.post(`/api/admin/build-queue/${orderId}/deliver`, { profile_id: profileId });

export const buildQueueEditApplied = (orderId) =>
  client.post(`/api/admin/build-queue/${orderId}/edit-applied`);

// ---- support -------------------------------------------------------------
export const supportTickets = (params = {}) =>
  client.get('/api/admin/support/tickets', { params });

export const supportTicket = (id) => client.get(`/api/admin/support/tickets/${id}`);
export const supportStats = () => client.get('/api/admin/support/stats');

export const supportUpdate = (id, patch) =>
  client.patch(`/api/admin/support/tickets/${id}`, patch);

export const supportReply = (id, message) =>
  client.post(`/api/admin/support/tickets/${id}/messages`, { message });

export const supportReopen = (id) =>
  client.post(`/api/admin/support/tickets/${id}/reopen`);

export const supportMerge = (id, intoId) =>
  client.post(`/api/admin/support/tickets/${id}/merge`, { target_ticket_id: intoId });

// ---- disputes ------------------------------------------------------------
export const disputes = (params = {}) => client.get('/api/admin/disputes', { params });
export const dispute = (id) => client.get(`/api/admin/disputes/${id}`);
export const disputeStats = () => client.get('/api/admin/disputes/stats');
export const disputeUpdate = (id, patch) => client.patch(`/api/admin/disputes/${id}`, patch);
export const disputeEvidence = (id, payload) =>
  client.post(`/api/admin/disputes/${id}/evidence`, payload);

// ---- moderation ----------------------------------------------------------
export const moderationReports = (params = {}) =>
  client.get('/api/admin/moderation/reports', { params });

export const moderationAutoStatus = () => client.get('/api/admin/moderation/auto/status');
export const moderationRescreen = () => client.post('/api/admin/moderation/auto/rescreen');

export const moderationResolve = (reportIds, action) =>
  client.post('/api/admin/moderation/bulk-resolve-reports', { report_ids: reportIds, action });

export const moderationDelete = (ids, kind) =>
  client.post('/api/admin/moderation/bulk-delete', { ids, kind });

export const moderationAccountStatus = (adminIds, status) =>
  client.post('/api/admin/moderation/bulk-account-status', { admin_ids: adminIds, status });

// ---- face ops ------------------------------------------------------------
export const faceOverview = () => client.get('/api/admin/face-ops/overview');
export const faceDeadLetters = (params = {}) =>
  client.get('/api/admin/face-ops/dead-letters', { params });
export const faceRequeue = (dlId) =>
  client.post(`/api/admin/face-ops/dead-letters/${dlId}/requeue`);
export const faceRetryPhoto = (photoId) =>
  client.post(`/api/admin/face-ops/retry-photo/${photoId}`);
export const faceReindex = (profileId) =>
  client.post(`/api/admin/face-ops/reindex/${profileId}`);

// ---- system --------------------------------------------------------------
export const systemHealth = () => client.get('/api/admin/system/health');
export const systemMetrics = () => client.get('/api/admin/system/metrics');
export const providers = () => client.get('/api/admin/providers');

// ---- feature flags -------------------------------------------------------
export const featureFlags = () => client.get('/api/admin/feature-flags');
export const setFeatureFlag = (payload) => client.post('/api/admin/feature-flags', payload);
export const deleteFeatureFlag = (key) => client.delete(`/api/admin/feature-flags/${key}`);

// ---- module rollout flags -------------------------------------------------
// A SEPARATE STORE, not a duplicate of the three calls above. The flags above
// live in `db.feature_flags`; these live in `db.app_settings`, which is what
// event_registry.module_enabled() and the storage-pool gate actually read.
// Creating `ganesh_module_enabled` through the generic flag API therefore does
// nothing at all — the gate never looks there. Only these two routes move it.
// Managed keys: ganesh_module_enabled, storage_pool_enabled, new_pricing_enabled.
export const moduleFlags = () => client.get('/api/admin/events/config/flags');
export const setModuleFlag = (key, value) =>
  client.put(`/api/admin/events/config/flags/${key}`, { value });

// ---- delivery ------------------------------------------------------------
export const deliveryStats = () => client.get('/api/admin/delivery/stats');
export const deliveryRecent = (params = {}) =>
  client.get('/api/admin/delivery/recent', { params });

// ---- business intelligence ----------------------------------------------
export const revenueSummary = (params = {}) =>
  client.get('/api/super-admin/revenue/summary', { params });
export const revenueTimeseries = (params = {}) =>
  client.get('/api/super-admin/revenue/timeseries', { params });
export const photographerLeaderboard = (params = {}) =>
  client.get('/api/super-admin/leaderboard/photographers', { params });
export const profitability = (params = {}) =>
  client.get('/api/admin/profitability', { params });
// storage_analytics.py exposes exactly one route, and it is /overview —
// not /analytics, which does not exist.
export const storageOverview = (params = {}) =>
  client.get('/api/admin/storage/overview', { params });

// ---- user investigation --------------------------------------------------
// Cross-references devices, logins, IPs, payments, subscriptions, reports and
// moderation history for one subject. `kind` is photographer | user — the
// `user` side only ever returns legacy rows, since normal accounts are retired.
export const investigationSearch = (q, limit = 20) =>
  client.get('/api/admin/investigation/search', { params: { q, limit } });
export const investigationSubject = (kind, subjectId) =>
  client.get(`/api/admin/investigation/subject/${kind}/${subjectId}`);

// ---- QR analytics --------------------------------------------------------
// Scan-to-upload funnel for guest QR galleries. Takes no params.
export const qrAnalytics = () => client.get('/api/admin/qr-analytics');

// ---- RBAC ----------------------------------------------------------------
export const rbacCatalogue = () => client.get('/api/admin/rbac/catalogue');
export const rbacMe = () => client.get('/api/admin/rbac/me');
/** Super-admin only. */
export const rbacAssign = (adminId, role) =>
  client.post('/api/admin/rbac/assign', { admin_id: adminId, role });

// ---- MFA (admin_security.py ~175) -----------------------------------------
export const mfaStatus = () => client.get('/api/admin/mfa/status');
export const mfaEnrollStart = () => client.post('/api/admin/mfa/enroll/start');
/** Returns { enabled, backup_codes[] } — backup codes are shown ONCE by the
 *  backend and never retrievable again. Caller must display-then-discard,
 *  never log. */
export const mfaEnrollVerify = (code) => client.post('/api/admin/mfa/enroll/verify', { code });
export const mfaDisable = (code) => client.post('/api/admin/mfa/disable', { code });

// ---- studio lifecycle (server.py ~1862 create, ~1967 status) -------------
// list already wired via api/admin.js listPhotographers(). Only role="admin"
// (photographer) rows are listed/actionable — super_admin rows are excluded
// server-side, and the status route 403s if you target one anyway.
/** No temp password comes back — the super-admin sets it here, so there is
 *  nothing to reveal-once. `initial_credits` still exists on the wire but
 *  credits are retired, so we never send one. */
export const createStudio = ({ name, email, password }) =>
  client.post('/api/super-admin/admins', { name, email, password });

/** status: 'active' | 'suspended' | 'inactive'. Blocks LOGIN only — an
 *  already-issued browser session keeps working until it expires (a few
 *  hours), and published invitation links are never gated on admin status
 *  (check_profile_active only looks at the profile's own is_active/expiry). */
export const setStudioStatus = (adminId, nextStatus) =>
  client.put(`/api/super-admin/admins/${adminId}/status`, { status: nextStatus });

// ---- platform audit log (server.py ~4549) ---------------------------------
// No server-side filters exist — it always returns the latest 1000 rows for
// the WHOLE platform (there is no per-studio scoping despite
// StudioAuditLogs.jsx being the only current consumer). actor/action/date
// filtering happens client-side over that same fixed window.
export const auditLogs = () => client.get('/api/admin/audit-logs');

// ---- feature wish board --------------------------------------------------
// Buyers ask for features they'd pay for; the board is how those get triaged.
export const featureWishSummary = () => client.get('/api/admin/feature-wishes/summary');
export const featureWishes = (params = {}) =>
  client.get('/api/admin/feature-wishes', { params });
/** PATCH, not POST. Body keys: status, admin_note, quoted_price_inr, is_new. */
export const patchFeatureWish = (id, payload) =>
  client.patch(`/api/admin/feature-wishes/${id}`, payload);

// ---- approval queues -----------------------------------------------------
// Pixora lets studios apply for verification and list themselves as talent or
// vendors; every one of those is moderated and sits at status "pending" until
// somebody acts. The v2 console had no screen for any of them, so those
// submissions went nowhere. /admin/moderation/* is a different system (content
// reports) and does not cover these.
export const adminVerifications = (params = {}) =>
  client.get('/api/admin/pixora/verifications', { params });
/** decision: approve | reject. `level` only matters on approve. */
export const reviewVerification = (studioId, decision, level, reason = '') =>
  client.post(`/api/admin/pixora/verifications/${studioId}/review`,
    { decision, level, reason });

export const adminTalent = () => client.get('/api/admin/talent');
/** approve | reject | feature | unfeature | delete */
export const talentAction = (talentId, action) =>
  client.post(`/api/admin/talent/${talentId}/action`, { action });

export const adminVendors = (params = {}) => client.get('/api/admin/vendors', { params });
/** approve | reject | suspend | verify | feature | unfeature | hide | unhide | delete */
export const vendorAction = (vendorId, action) =>
  client.post(`/api/admin/vendors/${vendorId}/action`, { action });

export const verifyBrand = (brandId) => client.post(`/api/admin/brands/${brandId}/verify`, {});

// The other half of "Build my portfolio" — studios submit briefs from
// /studio/portfolio/build and this is the queue that fulfils them.
export const adminBuildRequests = () => client.get('/api/admin/portfolio-build-requests');
/** `status` is a query parameter on this route, not a JSON body. */
export const setBuildRequestStatus = (reqId, status) =>
  client.post(`/api/admin/portfolio-build-requests/${reqId}/status`, null, { params: { status } });

// ---- marketplace operations ----------------------------------------------
// The Pixora economy: who is advertising, what the platform earns from
// bookings, what currency the storefront quotes in, and whether push can
// actually reach anyone. All verified against pixora_service.py.

/** {campaigns[], brands[], totals:{campaigns,brands,open}} */
export const adminCampaigns = () => client.get('/api/admin/campaigns');
/** feature | unfeature | remove | reopen */
export const campaignAction = (campaignId, action) =>
  client.post(`/api/admin/campaigns/${campaignId}/action`, { action });

/** {workspaces, vendors, bookings, revenue, by_status, by_category[{k,v}],
 *   by_region[{k,v}], monthly[{month,count}]} */
export const industryAnalytics = () => client.get('/api/admin/industry-analytics');

/** {rates, currencies[], symbols{}} — INR is the base and is forced to 1.0
 *  server-side, so it is shown read-only. */
export const currencyRates = () => client.get('/api/admin/currency/rates');
export const saveCurrencyRates = (rates) =>
  client.put('/api/admin/currency/rates', { rates });

/** {tokens, by_platform{}, outbox_pending} */
export const pushStats = () => client.get('/api/admin/push/stats');

/** {details[]} — what buyers told us when they bought a plan. */
export const planPurchaseDetails = () => client.get('/api/admin/plan-purchase-details');

// ---- multi-drive storage pool --------------------------------------------
// storage_pool_service.py. Google Drive accounts pooled into one logical store,
// with a recycle bin, a retry pipeline and capacity alerting.
//
// Two behaviours worth knowing before wiring a control to these:
//   * PUT /settings REFUSES to enable the pool when no account is active —
//     uploads would just log failures. The 400 it returns explains that, so
//     show it rather than replacing it.
//   * The pool is flag-gated and default OFF. Everything here still answers
//     while it is off; the flag governs whether UPLOADS route through the pool.
export const poolDashboard = () => client.get('/api/super-admin/storage/dashboard');
export const poolAccounts = () => client.get('/api/super-admin/storage/accounts');
export const poolByPhotographer = (params = {}) =>
  client.get('/api/super-admin/storage/by-photographer', { params });
export const poolByEvent = (params = {}) =>
  client.get('/api/super-admin/storage/by-event', { params });

/** {items[], retention_days} — soft-deleted events, recoverable until purge. */
export const poolDeletedEvents = () => client.get('/api/super-admin/storage/deleted-events');
export const poolRestoreEvent = (eventId) =>
  client.post(`/api/super-admin/storage/deleted-events/${eventId}/restore`, {});
export const poolPurgeEvent = (eventId) =>
  client.post(`/api/super-admin/storage/deleted-events/${eventId}/purge-now`, {});

export const poolFailures = (params = {}) =>
  client.get('/api/super-admin/storage/failures', { params });
/** Runs the retry pipeline now; it also runs hourly on its own. */
export const poolRetryFailures = () => client.post('/api/super-admin/storage/failures/retry', {});

export const poolAlerts = (includeAcked = false) =>
  client.get('/api/super-admin/storage/alerts', { params: { include_acked: includeAcked } });
export const poolAckAlert = (alertId) =>
  client.post(`/api/super-admin/storage/alerts/${alertId}/ack`, {});

export const poolSettings = () => client.get('/api/super-admin/storage/settings');
export const poolSetEnabled = (enabled) =>
  client.put('/api/super-admin/storage/settings', { enabled });

export const poolDisableAccount = (accountId) =>
  client.post(`/api/super-admin/storage/accounts/${accountId}/disable`, {});
export const poolEnableAccount = (accountId) =>
  client.post(`/api/super-admin/storage/accounts/${accountId}/enable`, {});

// ---- camera SFTP transfers (camera_router.py) ----------------------------
// Fleet view + revoke + global audit. Credentials are never returned here.
export const cameraTransfers = () => client.get('/api/admin/camera/transfers');
export const cameraRevoke = (profileId) =>
  client.post(`/api/admin/camera/${profileId}/revoke`, {});
export const cameraEventsGlobal = (limit = 100) =>
  client.get('/api/admin/camera/events', { params: { limit } });

// ---- platform activity analytics -----------------------------------------
// Distinct from the revenue calls above: these count ACTIVITY, not money.
// pixora_service.py.

/** {total_events, by_type[{type,count}], by_day[{day,events}], studios, posts,
 *   portfolios_published, verified, connections, crm_clients} */
export const analyticsOverview = () => client.get('/api/admin/analytics/overview');

/** Creator geography + 30-day growth curves. */
export const analyticsGlobal = () => client.get('/api/admin/analytics/global');

// ---- food donation centres -----------------------------------------------
// food_features.py. Surplus wedding food -> a real place that will take it.
// The national Childline entry is seeded and idempotent.
//
// RULE (CLAUDE.md, non-negotiable): only ever display what this API returns.
// Never hard-code, guess or "helpfully" complete a charity phone number — a
// wrong number here sends food, or a caller, nowhere.
export const foodCenters = () => client.get('/api/admin/food-donation');
/** {name, phone, address?, city?, state?, verified?} — city "" means national. */
export const addFoodCenter = (payload) => client.post('/api/admin/food-donation', payload);
export const deleteFoodCenter = (id) => client.delete(`/api/admin/food-donation/${id}`);
