import client from './client';

// Public pricing + feature flags. Both unauthenticated (recon-frontend-logic.md
// F5/F6 — trust these paths over API_SURFACE.md's stale guard column).
export const effective = (audience = 'normal_user') =>
  client.get('/api/public/pricing/effective', { params: { audience } });

export const featureFlags = () => client.get('/api/feature-flags');
