import client from './client';

// Public design catalogue + discovery. All unauthenticated.
//   /api/themes                 server.py get_all_themes   (19 themes)
//   /api/themes/{id}            one theme, with its designs
//   /api/event-categories       non-wedding celebration categories
//   /api/public/discovery/*     SEO landing data for /photographers/:a[/:b]
//   /api/public/photographers   directory
//   /api/public/pixora/*        community feed + hashtags
//   /api/support/tickets        public ticket creation

export const themes = (params = {}) => client.get('/api/themes', { params });
export const theme = (themeId) => client.get(`/api/themes/${themeId}`);

export const eventCategories = () => client.get('/api/event-categories');
export const categoryDesigns = (categoryId) =>
  client.get(`/api/event-categories/${categoryId}/designs`);

/** SEO discovery landing pages. One segment = city OR service; two = both. */
export const discovery = (a, b) =>
  client.get(b ? `/api/public/discovery/${a}/${b}` : `/api/public/discovery/${a}`);

export const vendors = (params = {}) => client.get('/api/pixora/vendors', { params });
export const vendor = (id) => client.get(`/api/pixora/vendors/${id}`);

/** Posts for one hashtag, with its counts.
 *
 *  NOT /api/public/pixora/search: that endpoint returns `results` as an OBJECT
 *  of grouped matches, so a caller reading `results` as a list crashed on
 *  `.map`. This is the purpose-built route and it returns
 *  { tag, posts[], post_count, total_views, studio_count }. */
export const hashtagFeed = (tag, params = {}) =>
  client.get(`/api/public/pixora/hashtag/${encodeURIComponent(tag)}`, { params });

/** Grouped search across the community. `results` is an object keyed by kind —
 *  do not treat it as a list. */
export const communitySearch = (q, params = {}) =>
  client.get('/api/public/pixora/search', { params: { q, ...params } });

export const trendingHashtags = () => client.get('/api/public/pixora/hashtags/trending');

// ---- public support ------------------------------------------------------
export const createTicket = (payload) => client.post('/api/support/tickets', payload);
export const myTickets = () => client.get('/api/support/tickets/mine');
export const ticket = (id) => client.get(`/api/support/tickets/${id}`);
export const replyToTicket = (id, message) =>
  client.post(`/api/support/tickets/${id}/messages`, { message });

// ---- feature wishes (public) ---------------------------------------------
// Buyers describe a feature they'd pay for; the team calls them back. The
// consent wording is SERVED rather than duplicated here on purpose: the text
// stored with each request and the text the buyer read must be the same
// string, or the consent record is worthless.
export const wishConsent = () => client.get('/api/feature-wishes/consent');
/** { text, phone, name, email, source, design_id, order_id, consent_call } */
export const submitWish = (payload) => client.post('/api/feature-wishes', payload);

// ---- public community discovery -----------------------------------------
// backend/pixora_service.py. These five served real data to nobody: the
// community page fetched only the flat feed, so the personalised and
// city-scoped rankings and every studio's stories were computed and dropped.

/** Story groups, one per studio, newest first. Each group carries the studio's
 *  name/avatar/slug and its unexpired stories. */
export const stories = () => client.get('/api/public/pixora/stories');

/** Ranked for this viewer. Works signed-out — the server falls back to
 *  engagement ranking when it has no interest vector to personalise with. */
export const forYou = (params = {}) => client.get('/api/public/pixora/foryou', { params });

/** Same feed, filtered to one city. */
export const nearby = (city, params = {}) =>
  client.get('/api/public/pixora/nearby', { params: { city, ...params } });

/** A studio's highlight reels (saved story collections), and one by id. */
export const studioHighlights = (studioId) =>
  client.get(`/api/public/pixora/highlights/${encodeURIComponent(studioId)}`);
export const highlight = (id) =>
  client.get(`/api/public/pixora/highlight/${encodeURIComponent(id)}`);

/** A studio's public package list (what they sell, with prices). */
export const studioPackages = (studioId) =>
  client.get(`/api/public/pixora/packages/${encodeURIComponent(studioId)}`);

// ---- other public reads --------------------------------------------------
/** Per-studio white-label branding. `entitled:false` means the studio's plan
 *  does not include it, and the caller must fall back to MAJA branding. */
export const whiteLabel = (studioId) =>
  client.get(`/api/public/studio/${encodeURIComponent(studioId)}/white-label`);

/** Platform counts for the directory header. */
export const photographerStats = () => client.get('/api/public/photographer-stats');

/** Food-donation partners. `national` is the CHILDLINE 1098 entry, which is a
 *  REAL helpline — never render a substitute or an example number here. */
export const foodDonation = (city = '') =>
  client.get('/api/public/food-donation', { params: city ? { city } : {} });
