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

// On 401, clear session and bounce to login.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tenantId');
      location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('tenantId');
  location.href = '/login';
}

export const isAuthed = () => !!localStorage.getItem('accessToken');
