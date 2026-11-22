import api from './client';

export const getStats = () => api.get('/admin/stats').then((r) => r.data.data);
export const listUsers = (params) => api.get('/admin/users', { params }).then((r) => r.data);
export const changeRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data.data);
