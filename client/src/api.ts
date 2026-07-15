import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token on requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ampm_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle expired access token by refreshing
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 unauthorized and request hasn't been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('ampm_refresh_token');
      if (!refreshToken) {
        handleLogout();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = response.data;
        localStorage.setItem('ampm_access_token', accessToken);
        if (newRefreshToken) localStorage.setItem('ampm_refresh_token', newRefreshToken);
        processQueue(null, accessToken);
        isRefreshing = false;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        handleLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

function handleLogout() {
  // Best-effort server-side revocation (rotates the token version); ignore failures.
  if (localStorage.getItem('ampm_refresh_token')) {
    axios.post(`${API_BASE_URL}/auth/logout`, {}).catch(() => undefined);
  }
  localStorage.removeItem('ampm_access_token');
  localStorage.removeItem('ampm_refresh_token');
  if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
    window.location.href = '/login';
  }
}

export default api;
