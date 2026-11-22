import api from './client';

export const createShare = (body) => api.post('/shares', body).then((r) => r.data.data);
export const listMyShares = (params) => api.get('/shares/mine', { params }).then((r) => r.data);
export const listSharedWithMe = (params) => api.get('/shares/with-me', { params }).then((r) => r.data);
export const revokeShare = (id) => api.post(`/shares/${id}/revoke`).then((r) => r.data.data);
export const listPendingApprovals = (params) => api.get('/shares/pending-approval', { params }).then((r) => r.data);
export const approveShare = (id) => api.post(`/shares/${id}/approve`).then((r) => r.data.data);
export const rejectShare = (id, reason) => api.post(`/shares/${id}/reject`, reason ? { reason } : {}).then((r) => r.data.data);

// Public endpoint. The token (if any) is attached automatically so links addressed to a registered user work.
export const accessShare = (token) =>
  api.get(`/shares/access/${encodeURIComponent(token)}`, { skipAuthRedirect: true }).then((r) => r.data.data);
