import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Point to your LAN IP when testing on a device (localhost won't resolve on phone).
export const API_BASE_URL = 'http://10.0.2.2:4000/api';

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  const tenantId = await AsyncStorage.getItem('tenantId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (tenantId) config.headers['x-tenant-id'] = tenantId;
  return config;
});
