import client from './client';

// Photographer Portfolio editor -- Bearer admin_token identity.
// Curl-verified 2026-08-11 against the live backend (see StudioPortfolio.jsx
// header notes for the shape surprises found).

export const getMeta = () => client.get('/api/portfolio/meta');

export const getProfile = () => client.get('/api/portfolio/profile');

// Backend does a real partial merge server-side, but the page always sends
// its whole local `profile` object -- same contract the legacy page uses.
export const saveProfile = (profile) => client.put('/api/portfolio/profile', profile);

export const getAlbums = () => client.get('/api/portfolio/albums');
export const createAlbum = (payload) => client.post('/api/portfolio/albums', payload);
/** Backend added alongside this UI — create/list/delete existed, rename did not. */
export const renameAlbum = (id, payload) => client.put(`/api/portfolio/albums/${id}`, payload);
export const deleteAlbum = (id) => client.delete(`/api/portfolio/albums/${id}`);

export const getWorks = () => client.get('/api/portfolio/works');
export const createWork = (payload) => client.post('/api/portfolio/works', payload);
/** update_work does a FULL replace (no exclude_unset) — the whole WorkIn shape
 *  must be sent every time or unsent fields (image_url, tags, gallery…) get
 *  wiped to their defaults. Never call this with a partial patch. */
export const updateWork = (id, payload) => client.put(`/api/portfolio/works/${id}`, payload);
export const deleteWork = (id) => client.delete(`/api/portfolio/works/${id}`);

export const getTestimonials = () => client.get('/api/portfolio/testimonials');

export const addTestimonial = (payload) => client.post('/api/portfolio/testimonials', payload);

export const deleteTestimonial = (id) => client.delete(`/api/portfolio/testimonials/${id}`);

export const getTier = () => client.get('/api/portfolio/tier');

export const saveDesign = (designId) => client.post('/api/portfolio/design', { design_id: designId });

export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return client.post('/api/portfolio/upload', fd);
};

// Product pricing for the Plan strip -- never hardcode amounts client-side.
export const getPortfolioPlans = () => client.get('/api/subscriptions/plans', { params: { product: 'portfolio' } });

// ---- studio-built portfolio (done-for-you) -------------------------------
// Gated: the endpoint 402s unless the studio has unlocked build help or is on
// a premium portfolio plan. Surface that message rather than a generic error.
export const buildRequest = () => client.get('/api/portfolio/build-request');
export const submitBuildRequest = (details, notes = '') =>
  client.post('/api/portfolio/build-request', { details, notes });

export const portfolioTeam = () => client.get('/api/portfolio/team');
export const savePortfolioTeam = (teamMembers) =>
  client.put('/api/portfolio/team', { team_members: teamMembers });

// Build help is gated: premium portfolio plans get it, everyone else pays a
// one-off fee. Status tells the panel which of those applies before it offers
// anything, so a studio never sees a "pay" button for something it already has.
export const buildHelpStatus = () => client.get('/api/portfolio/build-help');
export const buildHelpOrder = () => client.post('/api/portfolio/build-help/order', {});
export const buildHelpVerify = (payload) =>
  client.post('/api/portfolio/build-help/verify', payload);
