import client from './client';

// super_admin_v2.py — platform settings / homepage CMS / theme rollout /
// coupons / broadcast / login-history. All previously had zero frontend
// callers. VERIFIED real prefix: the router is built with
// prefix="/api/super-admin/v2" (build_super_admin_v2_router in server.py)
// — NOT bare "/api/super-admin/*" as its own module docstring implies.

export const platformSettings = () => client.get('/api/super-admin/v2/settings');
/** PUT replaces the whole settings doc — always send every field back. */
export const savePlatformSettings = (payload) => client.put('/api/super-admin/v2/settings', payload);

export const homepageCms = () => client.get('/api/super-admin/v2/cms/homepage');
/** PUT replaces the whole CMS doc — always send every field back. */
export const saveHomepageCms = (payload) => client.put('/api/super-admin/v2/cms/homepage', payload);

export const themeRollout = () => client.get('/api/super-admin/v2/themes/rollout');
/** Body is the raw array itself (not wrapped). Upserts by theme_id — rows not
 *  included are left untouched, so a single-item array safely edits one row. */
export const saveThemeRollout = (items) => client.put('/api/super-admin/v2/themes/rollout', items);

export const coupons = () => client.get('/api/super-admin/v2/coupons');
export const createCoupon = (payload) => client.post('/api/super-admin/v2/coupons', payload);
export const updateCoupon = (id, patch) => client.patch(`/api/super-admin/v2/coupons/${id}`, patch);
export const deleteCoupon = (id) => client.delete(`/api/super-admin/v2/coupons/${id}`);

export const broadcasts = () => client.get('/api/super-admin/v2/broadcast');
export const createBroadcast = (payload) => client.post('/api/super-admin/v2/broadcast', payload);
export const deleteBroadcast = (id) => client.delete(`/api/super-admin/v2/broadcast/${id}`);

/** Rows are raw db.login_history documents — no writer currently inserts into
 *  this collection anywhere in the backend, so this is expected to come back
 *  empty for every admin_id until a login handler starts populating it. */
export const loginHistory = (adminId) => client.get(`/api/super-admin/v2/login-history/${adminId}`);
