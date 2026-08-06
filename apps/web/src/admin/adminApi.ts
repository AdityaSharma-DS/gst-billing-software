import axios from 'axios';

/** Axios instance for the master admin panel — separate token from tenant sessions. */
export const adminApi = axios.create({ baseURL: '/api/admin' });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401 && !location.pathname.startsWith('/admin/login')) {
      localStorage.removeItem('adminToken');
      location.href = '/admin/login';
    }
    return Promise.reject(error);
  },
);

export const isAdminAuthed = () => !!localStorage.getItem('adminToken');
export function adminLogout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminName');
  location.href = '/admin/login';
}
