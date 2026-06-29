import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

// Attach JWT + tenant on each request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  const tenantId = localStorage.getItem('tenantId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (tenantId) config.headers['x-tenant-id'] = tenantId;
  return config;
});
