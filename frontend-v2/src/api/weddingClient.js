import client from './client';

// The client-facing half of one wedding: the couple's scoped login, the
// booking budget, the per-ceremony invitation links, and WhatsApp sending.
//   photographer_clients.py  /api/admin/profiles/{id}/client-access
//   client_budget.py         /api/admin/profiles/{id}/budget
//   server.py                /api/admin/profiles/{id}/event-invitations
//   whatsapp                 /api/admin/whatsapp/*

// ---- couple access -------------------------------------------------------
export const getAccess = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/client-access`);

export const createAccess = (profileId, payload) =>
  client.post(`/api/admin/profiles/${profileId}/client-access`, payload);

export const updateAccess = (profileId, patch) =>
  client.patch(`/api/admin/profiles/${profileId}/client-access`, patch);

export const regenerateAccess = (profileId) =>
  client.post(`/api/admin/profiles/${profileId}/client-access/regenerate`);

export const revokeAccess = (profileId) =>
  client.delete(`/api/admin/profiles/${profileId}/client-access`);

// ---- budget --------------------------------------------------------------
export const getBudget = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/budget`);

export const saveBudget = (profileId, payload) =>
  client.put(`/api/admin/profiles/${profileId}/budget`, payload);

export const addPayment = (profileId, payload) =>
  client.post(`/api/admin/profiles/${profileId}/budget/payments`, payload);

export const deletePayment = (profileId, paymentId) =>
  client.delete(`/api/admin/profiles/${profileId}/budget/payments/${paymentId}`);

// ---- per-ceremony invitation links --------------------------------------
export const eventInvitations = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/event-invitations`);

export const createEventInvitation = (profileId, payload) =>
  client.post(`/api/admin/profiles/${profileId}/event-invitations`, payload);

export const updateEventInvitation = (invitationId, payload) =>
  client.put(`/api/admin/event-invitations/${invitationId}`, payload);

export const deleteEventInvitation = (invitationId) =>
  client.delete(`/api/admin/event-invitations/${invitationId}`);

export const regenerateQr = (invitationId) =>
  client.post(`/api/admin/event-invitations/${invitationId}/regenerate-qr`);

export const setInvitationSecurity = (invitationId, payload) =>
  client.put(`/api/admin/event-invitations/${invitationId}/security`, payload);

// ---- whatsapp ------------------------------------------------------------
export const whatsappStatus = () => client.get('/api/admin/whatsapp/status');

export const whatsappLogs = (profileId) =>
  client.get(`/api/admin/profiles/${profileId}/whatsapp/logs`);

export const sendInvitation = (payload) =>
  client.post('/api/admin/whatsapp/send-invitation', payload);

export const sendReminder = (payload) =>
  client.post('/api/admin/whatsapp/send-reminder', payload);
