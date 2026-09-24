import client from './client';

// Cart/checkout — money is always server-quoted. Post back selections/IDs
// only, never client-computed amounts (recon-frontend-logic.md §7).
export const quote = (payload) => client.post('/api/store/quote', payload);

export const createOrder = (payload) => client.post('/api/store/order/create', payload);

export const verifyOrder = (payload) => client.post('/api/store/order/verify', payload);

export const myOrders = () => client.get('/api/store/my-orders');

export const catalog = (params = {}) => client.get('/api/store/catalog', { params });

// Ceremony-tier packages + add-ons catalogue (admin-priced). Informational on
// the Pricing page — order/create takes design_id + features, not a package key.
export const packages = () => client.get('/api/store/packages');

export const designPrice = (designId) => client.get(`/api/store/design/${designId}/price`);

export const getOrder = (orderId) => client.get(`/api/store/order/${orderId}`);

export const submitOrderInfo = (orderId, payload) => client.post(`/api/store/order/${orderId}/info`, payload);

export const saveOrderInfoDraft = (orderId, payload) => client.put(`/api/store/order/${orderId}/info-draft`, payload);
