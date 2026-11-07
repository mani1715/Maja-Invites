import client from './client';

/**
 * Custom design requests and revision history API client.
 */

export const createRequest = (payload) =>
  client.post('/api/admin/custom-design-requests', payload);

export const listRequests = (params = {}) =>
  client.get('/api/admin/custom-design-requests', { params });

export const updateRequest = (id, payload) =>
  client.patch(`/api/admin/custom-design-requests/${id}`, payload);

export const listRevisions = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/revisions`);

export const restoreRevision = (profileId, revisionId) =>
  client.post(`/api/admin/profiles/${profileId}/revisions/${revisionId}/restore`);
