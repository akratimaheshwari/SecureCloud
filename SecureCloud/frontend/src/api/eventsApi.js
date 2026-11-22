import api from './client';

export const listMyEvents = (params) => api.get('/events/mine', { params }).then((r) => r.data);
export const listAllEvents = (params) => api.get('/events', { params }).then((r) => r.data);
export const listAudit = (params) => api.get('/audit', { params }).then((r) => r.data);
