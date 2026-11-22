import api from './client';

export const login = (email, password) =>
  api.post('/auth/login', { email, password }, { skipAuthRedirect: true }).then((r) => r.data.data);

export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password }, { skipAuthRedirect: true }).then((r) => r.data.data);

export const me = () => api.get('/auth/me', { skipAuthRedirect: true }).then((r) => r.data.data.user);
