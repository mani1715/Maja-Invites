import client from './client';

// Studio-panel store calls: design browse (live pricing) + the build queue.
// Bearer admin_token identity (client auto-attaches). Kept separate from
// api/store.js (the couple/public store surface) so this lane doesn't touch
// a file another lane owns.

export const designPrice = (designId, themeId = '') =>
  client.get(`/api/store/design/${encodeURIComponent(designId)}/price`, {
    params: themeId ? { theme_id: themeId } : {},
  });

export const buildQueue = () => client.get('/api/admin/build-queue');

export const deliverOrder = (orderId, profileId) =>
  client.post(`/api/admin/build-queue/${orderId}/deliver`, { profile_id: profileId });

export const markEditApplied = (orderId) =>
  client.post(`/api/admin/build-queue/${orderId}/edit-applied`);
