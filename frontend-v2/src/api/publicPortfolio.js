import client from './client';

// Public (no-auth) photographer directory + portfolio viewer.
// Endpoints live in backend/photographer_directory.py (`directory`) and
// backend/portfolio_service.py (`portfolio` — {studio_id} resolves an id OR a
// slug, see _resolve_studio). Curl-verified against localhost:8001.

export const directory = (params = {}) =>
  client.get('/api/public/photographers', { params });

export const portfolio = (slug) =>
  client.get(`/api/public/photographer/${encodeURIComponent(slug)}/portfolio`);
