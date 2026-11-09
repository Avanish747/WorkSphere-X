import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
});

let accessToken = null;
let refreshRequest = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthEndpoint = request?.url?.startsWith('/auth/');
    if (error.response?.status !== 401 || !request || request._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    request._retry = true;
    try {
      refreshRequest ||= axios.post('/api/auth/refresh', {}, { withCredentials: true, timeout: 20000 });
      const { data } = await refreshRequest;
      setAccessToken(data.accessToken);
      request.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(request);
    } catch (refreshError) {
      setAccessToken(null);
      return Promise.reject(refreshError);
    } finally {
      refreshRequest = null;
    }
  },
);

export default api;
