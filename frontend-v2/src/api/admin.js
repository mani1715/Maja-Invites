import client from './client';

// Super-admin console — Bearer admin_token identity, role must be super_admin.
export const listPhotographers = () => client.get('/api/super-admin/admins');

export const listUsers = (params = {}) => client.get('/api/super-admin/users', { params });
