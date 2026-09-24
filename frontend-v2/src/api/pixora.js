import client from './client';

// The complete Pixora community surface.
//
// Every path below was taken from the legacy implementation
// (old_wedding_36/frontend/src/pages/PixoraCommunity.jsx) rather than guessed —
// that file is the only authoritative record of which of the ~180 backend
// Pixora routes the product actually used, and in what shape.
//
// Organised by the same 8 groups the legacy IA used, because that grouping was
// the product's own answer to "what does a photographer come here to do".

// ───────────────────────────────── identity / me ─────────────────────────
export const me = () => client.get('/api/pixora/me');
/** Which features this studio's plan unlocks — used to label locked panels. */
export const capabilities = () => client.get('/api/pixora/capabilities');
export const settings = () => client.get('/api/pixora/settings');
export const saveSettings = (payload) => client.put('/api/pixora/settings', payload);
export const checkin = () => client.post('/api/pixora/checkin', {});
export const scoreHistory = () => client.get('/api/pixora/score-history');
export const report = (payload) => client.post('/api/pixora/report', payload);

// ───────────────────────────────── HOME ──────────────────────────────────
export const notifications = () => client.get('/api/pixora/notifications');
export const markNotificationsRead = () => client.post('/api/pixora/notifications/read', {});
export const unreadCount = () => client.get('/api/pixora/notifications/unread-count');

export const network = () => client.get('/api/pixora/network');
export const connections = () => client.get('/api/pixora/connections');
/** The server names the target `recipient`, and `type` is one of
 *  connect | collaborate | partnership | project. */
export const requestConnection = (recipient, type = 'connect', message = '') =>
  client.post('/api/pixora/connections/request', { recipient, type, message });
/** The server expects a verb, not a boolean: accept | decline. */
export const respondConnection = (cid, accept) =>
  client.post(`/api/pixora/connections/${cid}/respond`, { action: accept ? 'accept' : 'decline' });

export const featuredCreators = () => client.get('/api/pixora/creators/featured');
export const suggestedCreators = () => client.get('/api/pixora/creators/suggested');
export const follow = (studioId) => client.post(`/api/pixora/follow/${studioId}`, {});
export const following = () => client.get('/api/pixora/following');

export const events = (params = {}) => client.get('/api/pixora/events', { params });
export const createEvent = (payload) => client.post('/api/pixora/events', payload);
/** A toggle — the server flips your RSVP and returns the new state. */
export const rsvpEvent = (id) => client.post(`/api/pixora/events/${id}/rsvp`, {});

// ───────────────────────────────── SPOTLIGHT ─────────────────────────────
export const feed = (params = {}) => client.get('/api/pixora/feed', { params });
export const postMeta = () => client.get('/api/pixora/post-meta');
export const createPost = (payload) => client.post('/api/pixora/posts', payload);
export const updatePost = (id, payload) => client.put(`/api/pixora/posts/${id}`, payload);
export const deletePost = (id) => client.delete(`/api/pixora/posts/${id}`);
export const likePost = (id) => client.post(`/api/pixora/posts/${id}/like`, {});
export const savePost = (id) => client.post(`/api/pixora/posts/${id}/save`, {});
export const sharePost = (id) => client.post(`/api/pixora/posts/${id}/share`, {});
export const comments = (postId) => client.get(`/api/pixora/posts/${postId}/comments`);
export const addComment = (postId, body) => client.post(`/api/pixora/posts/${postId}/comment`, { body });
export const deleteComment = (id) => client.delete(`/api/pixora/comments/${id}`);
export const critiques = (postId) => client.get(`/api/pixora/posts/${postId}/critiques`);
export const addCritique = (postId, payload) =>
  client.post(`/api/pixora/posts/${postId}/critique`, payload);

export const discover = (params = {}) => client.get('/api/pixora/discover', { params });
/** `window` is one of 24h | 7d | 30d. Public — trending is a discovery surface. */
export const trending = (params = {}) => client.get('/api/pixora/trending', { params });
/** Optional `collection_id` narrows the Saved tab to one collection. */
export const saved = (params = {}) => client.get('/api/pixora/saved', { params });
export const collections = () => client.get('/api/pixora/collections');
export const createCollection = (name, isPrivate = true) =>
  client.post('/api/pixora/collections', { name, is_private: isPrivate });
export const deleteCollection = (id) => client.delete(`/api/pixora/collections/${id}`);

export const reels = () => client.get('/api/pixora/reels');
export const createReel = (payload) => client.post('/api/pixora/reels', payload);
export const deleteReel = (id) => client.delete(`/api/pixora/reels/${id}`);
export const stories = () => client.get('/api/pixora/stories');
export const createStory = (payload) => client.post('/api/pixora/stories', payload);
export const deleteStory = (id) => client.delete(`/api/pixora/stories/${id}`);

// ---- story highlights ----------------------------------------------------
// A highlight is a SNAPSHOT of chosen stories, not a live reference: the
// server copies each story's url/caption into the highlight, so it survives
// the 24h story expiry. That is the whole point of the feature.
//
// Two traps the UI has to respect:
//   * GET /stories returns EVERY studio's active stories. The snapshot only
//     keeps ones whose studio_id is yours, silently dropping the rest — so
//     only offer your own stories to pick from.
//   * PATCH with an empty story_ids keeps the existing items rather than
//     clearing them (see update_highlight), so "remove all" is not expressible.
// ---- global search -------------------------------------------------------
/** {query, results:{photographers,posts,resources,vendors,learning}, counts, total}
 *  An empty q returns the empty shape rather than erroring, so the caller can
 *  render the same component before anything is typed. */
export const search = (q, limit = 10) =>
  client.get('/api/pixora/search', { params: { q, limit } });

export const highlights = () => client.get('/api/pixora/highlights');
/** {title (1-60 chars), story_ids[], cover_url?} */
export const createHighlight = (payload) => client.post('/api/pixora/highlights', payload);
export const updateHighlight = (id, payload) =>
  client.patch(`/api/pixora/highlights/${id}`, payload);

export const uploadMedia = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return client.post('/api/pixora/media/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
};

// ───────────────────────────────── CONNECT ───────────────────────────────
export const gigs = (params = {}) => client.get('/api/pixora/gigs', { params });
export const createGig = (payload) => client.post('/api/pixora/gigs', payload);
export const talent = (params = {}) => client.get('/api/pixora/talent', { params });
export const myTalent = () => client.get('/api/pixora/talent/me');
export const applyTalent = (payload) => client.post('/api/pixora/talent', payload);

export const mentors = () => client.get('/api/pixora/mentors');
/** { expertise, bio, rate_inr } — upserts your own mentor listing. */
export const becomeMentor = (payload) => client.post('/api/pixora/mentors', payload);
/** { mentor_id, message } */
export const requestMentor = (payload) => client.post('/api/pixora/mentors/request', payload);

export const vendors = (params = {}) => client.get('/api/pixora/vendors', { params });
export const vendorCategories = () => client.get('/api/pixora/vendor-categories');
export const myVendor = () => client.get('/api/pixora/vendor/me');
export const saveVendor = (payload) => client.post('/api/pixora/vendor', payload);
export const respondVendorReview = (rid, response) =>
  client.post(`/api/pixora/vendor-reviews/${rid}/respond`, { response });

export const teams = () => client.get('/api/pixora/team');
export const saveTeamMember = (payload) => client.post('/api/pixora/team', payload);
export const removeTeamMember = (id) => client.delete(`/api/pixora/team/${id}`);

// ───────────────────────────────── STUDIO TOOLS ──────────────────────────
export const crmClients = (params = {}) => client.get('/api/pixora/crm/clients', { params });
export const crmClient = (id) => client.get(`/api/pixora/crm/clients/${id}`);
export const createCrmClient = (payload) => client.post('/api/pixora/crm/clients', payload);
export const updateCrmClient = (id, payload) => client.put(`/api/pixora/crm/clients/${id}`, payload);
export const deleteCrmClient = (id) => client.delete(`/api/pixora/crm/clients/${id}`);
/** The timeline comes back inside `crmClient(id)`; only writes have own routes. */
export const addCrmTimeline = (id, payload) =>
  client.post(`/api/pixora/crm/clients/${id}/timeline`, payload);
export const deleteCrmTimeline = (id) => client.delete(`/api/pixora/crm/timeline/${id}`);
export const crmFollowups = () => client.get('/api/pixora/crm/followups');

export const portfolioReview = () => client.get('/api/pixora/portfolio-review');
export const generatePortfolioReview = () =>
  client.post('/api/pixora/portfolio-review/generate', {});

export const businessAssistant = () => client.get('/api/pixora/business-assistant');
/** Takes no body — the report is built from the studio's own signals. */
export const generateBusinessReport = () =>
  client.post('/api/pixora/business-assistant/generate', {});
export const businessQuote = (payload) => client.post('/api/pixora/business/quote', payload);

export const analytics = () => client.get('/api/pixora/analytics');
/** `window` is one of 7d | 30d | 90d | all. */
export const contentAnalytics = (params = {}) =>
  client.get('/api/pixora/content-analytics', { params });
export const insights = () => client.get('/api/pixora/insights');
export const weddingBi = () => client.get('/api/pixora/wedding-bi');
export const revenue = () => client.get('/api/pixora/revenue');

export const pricingIntelligence = () => client.get('/api/pixora/pricing-intelligence');

export const workspaces = () => client.get('/api/pixora/workspaces');
export const workspace = (id) => client.get(`/api/pixora/workspaces/${id}`);
export const createWorkspace = (payload) => client.post('/api/pixora/workspaces', payload);
/** Tasks and bookings come back inside `workspace(id)`. */
export const addWorkspaceTask = (id, payload) =>
  client.post(`/api/pixora/workspaces/${id}/tasks`, payload);
export const updateTask = (taskId, payload) => client.put(`/api/pixora/tasks/${taskId}`, payload);
export const workspaceMilestones = (id) => client.get(`/api/pixora/workspaces/${id}/milestones`);
export const addWorkspaceMilestone = (id, payload) =>
  client.post(`/api/pixora/workspaces/${id}/milestones`, payload);
export const updateMilestone = (mid, payload) =>
  client.put(`/api/pixora/milestones/${mid}`, payload);
export const workspaceGuests = (id) => client.get(`/api/pixora/workspaces/${id}/guests`);
export const addWorkspaceGuest = (id, payload) =>
  client.post(`/api/pixora/workspaces/${id}/guests`, payload);
export const workspaceActivity = (id) => client.get(`/api/pixora/workspaces/${id}/activity`);
export const workspaceComment = (id, text) =>
  client.post(`/api/pixora/workspaces/${id}/comment`, { text });
export const workspaceAnalytics = (id) => client.get(`/api/pixora/workspaces/${id}/analytics`);
export const bookWorkspaceVendor = (id, vendorId) =>
  client.post(`/api/pixora/workspaces/${id}/bookings`, { vendor_id: vendorId });
export const setBookingStatus = (bookingId, status) =>
  client.post(`/api/pixora/bookings/${bookingId}/status`, { status });

export const finance = () => client.get('/api/pixora/finance');
export const saveFinance = (payload) => client.post('/api/pixora/finance', payload);
export const deleteFinance = (id) => client.delete(`/api/pixora/finance/${id}`);
/** Returns `{ items, summary }` — there is no separate items reader. */
export const budget = () => client.get('/api/pixora/budget');
export const addBudgetItem = (payload) => client.post('/api/pixora/budget/items', payload);
export const updateBudgetItem = (id, payload) => client.put(`/api/pixora/budget/items/${id}`, payload);
export const deleteBudgetItem = (id) => client.delete(`/api/pixora/budget/items/${id}`);

/** Public — powers the multi-currency price display on studio packages. */
export const currencyRates = () => client.get('/api/currency/rates');

export const careerEngine = () => client.get('/api/pixora/career');
export const generateCareer = () => client.post('/api/pixora/career/generate', {});

// ───────────────────────────────── GROWTH ────────────────────────────────
export const challenges = () => client.get('/api/pixora/challenges');
export const submitChallenge = (payload) => client.post('/api/pixora/challenges/submit', payload);
export const voteSubmission = (id) => client.post(`/api/pixora/submissions/${id}/vote`, {});
export const deleteSubmission = (id) => client.delete(`/api/pixora/submissions/${id}`);

export const awards = () => client.get('/api/pixora/awards');
export const nominateAward = (payload) => client.post('/api/pixora/awards/nominate', payload);

export const myVerification = () => client.get('/api/pixora/verification/me');
export const applyVerification = (payload) => client.post('/api/pixora/verification/apply', payload);

export const certifications = () => client.get('/api/pixora/certifications');
export const leaderboard = (params = {}) => client.get('/api/pixora/leaderboard', { params });
export const benefits = () => client.get('/api/pixora/benefits');
export const chapters = () => client.get('/api/pixora/chapters');
export const joinChapter = (name) =>
  client.post(`/api/pixora/chapters/${encodeURIComponent(name)}/join`, {});

// ───────────────────────────────── MARKETPLACE ───────────────────────────
export const marketplace = (params = {}) => client.get('/api/pixora/marketplace', { params });
/** { title, kind: preset|template|overlay|guide, price_inr, description, file_url, preview_url } */
export const createListing = (payload) => client.post('/api/pixora/marketplace', payload);
export const buyListing = (id) => client.post(`/api/pixora/marketplace/${id}/buy`, {});
export const listingReviews = (id) => client.get(`/api/pixora/marketplace/${id}/reviews`);
export const reviewListing = (id, payload) =>
  client.post(`/api/pixora/marketplace/${id}/review`, payload);
export const myPurchases = () => client.get('/api/pixora/marketplace/purchases');
export const creatorStorefront = (studioId) =>
  client.get(`/api/pixora/marketplace/creator/${studioId}`);

// Paid upgrades (storage, featured placement, verification) — a separate
// service from the peer-to-peer marketplace above.
export const monetizationCatalog = () => client.get('/api/monetization/catalog');
export const myUpgrades = () => client.get('/api/monetization/my');
export const purchaseUpgrade = (sku, targetId = null) =>
  client.post('/api/monetization/purchase', { sku, target_id: targetId });
export const packages = () => client.get('/api/pixora/packages');
export const savePackage = (payload) => client.post('/api/pixora/packages', payload);
export const deletePackage = (id) => client.delete(`/api/pixora/packages/${id}`);

export const campaigns = (params = {}) => client.get('/api/pixora/campaigns', { params });
/** { as_brand: [], as_creator: [] } */
export const myCampaigns = () => client.get('/api/pixora/campaigns/mine');
export const campaign = (id) => client.get(`/api/pixora/campaigns/${id}`);
export const createCampaign = (payload) => client.post('/api/pixora/campaigns', payload);
/** { pitch, quote_amount, quote_currency } */
export const applyToCampaign = (id, payload) => client.post(`/api/pixora/campaigns/${id}/apply`, payload);
export const campaignApplications = (id) => client.get(`/api/pixora/campaigns/${id}/applications`);
/** decision is 'accepted' or 'rejected'. */
export const decideApplication = (aid, decision) =>
  client.post(`/api/pixora/applications/${aid}/decision`, { decision });
export const campaignReport = (id) => client.get(`/api/pixora/campaigns/${id}/report`);
/** Deliverables are submitted against an accepted application, but listed and
 *  reviewed against the campaign — the two sides use different keys. */
export const submitDeliverable = (applicationId, payload) =>
  client.post(`/api/pixora/applications/${applicationId}/deliverables`, payload);
export const campaignDeliverables = (campaignId) =>
  client.get(`/api/pixora/campaigns/${campaignId}/deliverables`);
export const reviewDeliverable = (did, payload) =>
  client.post(`/api/pixora/deliverables/${did}/review`, payload);
export const closeCampaign = (id) => client.post(`/api/pixora/campaigns/${id}/close`, {});

export const brands = () => client.get('/api/pixora/brands');
export const myBrand = () => client.get('/api/pixora/brands/me');
export const saveBrand = (payload) => client.post('/api/pixora/brands', payload);

// ───────────────────────────────── LEARNING ──────────────────────────────
/** The certifiable course track. Curated external resources are static data
 *  (see src/data/learningResources.js) and have no endpoint. */
export const learn = () => client.get('/api/pixora/learn');
export const completeCourse = (contentId) =>
  client.post(`/api/pixora/learn/${contentId}/complete`, {});

// ───────────────────────────────── PROFILE ───────────────────────────────
export const testimonialVideos = () => client.get('/api/pixora/testimonial-videos');
export const addTestimonialVideo = (payload) =>
  client.post('/api/pixora/testimonial-videos', payload);
export const storage = () => client.get('/api/pixora/storage');

// ── public profile (/p/:slug) ────────────────────────────────────────────
// Every public post's byline links here (`_author_card` builds /p/{slug}), and
// PixoraProfile called `publicProfile` / `toggleFollow` — neither of which
// existed on this module. A namespace import turns that into a runtime
// TypeError rather than a build error, so the page hit the error boundary on
// every visit while `yarn build` stayed green.
/** { studio, posts[], counts, viewer } — resolves a studio id OR a slug. */
export const publicProfile = (studioIdOrSlug, params = {}) =>
  client.get(`/api/public/pixora/profile/${encodeURIComponent(studioIdOrSlug)}`, { params });

/** Follow/unfollow a studio. Auth required — 401 means "sign in first". */
export const toggleFollow = (studioId) =>
  client.post(`/api/pixora/follow/${encodeURIComponent(studioId)}`, {});
