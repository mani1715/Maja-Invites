import client from './client';

// Studio subscription engine (subscription_service.py). Bearer admin identity.
// Money is always server-quoted (subtotal/gst/total) — the frontend only
// posts product/tier/cycle selections, never a computed amount.
export const plans = (product) => client.get('/api/subscriptions/plans', { params: product ? { product } : {} });

export const mine = () => client.get('/api/subscriptions/mine');

export const quote = (payload) => client.post('/api/subscriptions/quote', payload);

export const create = (payload) => client.post('/api/subscriptions/create', payload);

export const verify = (payload) => client.post('/api/subscriptions/verify', payload);

export const cancel = (subscriptionId) => client.post(`/api/subscriptions/${subscriptionId}/cancel`);

// Buyer contact details, recorded for fulfillment — non-blocking on the caller.
export const savePurchaseDetails = (payload) => client.post('/api/plan-purchase-details', payload);
