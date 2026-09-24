import client from './client';

// Admin/photographer identity — backend/auth.py + backend/auth_sessions.py.
export const login = (username_or_email, password, totp_code) =>
  client.post('/api/auth/login', { username_or_email, password, ...(totp_code ? { totp_code } : {}) });

export const refresh = () => client.post('/api/auth/refresh', {}, { withCredentials: true });

export const me = () => client.get('/api/auth/me');

export const logout = () => client.post('/api/auth/logout');
