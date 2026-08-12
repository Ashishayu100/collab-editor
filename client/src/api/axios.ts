import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useLoadingStore } from '../stores/loadingStore';
import { useToastStore } from '../stores/toastStore';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const NO_REFRESH_PATHS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/signup'];

export const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  useLoadingStore.getState().increment();
  return config;
});

let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function flushPendingRequests(token: string | null, error: unknown) {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  pendingRequests = [];
}

api.interceptors.response.use(
  (response) => {
    useLoadingStore.getState().decrement();
    return response;
  },
  async (error: AxiosError) => {
    useLoadingStore.getState().decrement();

    if (error.response?.status === 429) {
      useToastStore.getState().addToast('Too many requests. Slow down.', 'warning');
    }

    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const url = originalRequest?.url ?? '';
    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !NO_REFRESH_PATHS.some((path) => url.includes(path));

    if (!shouldAttemptRefresh || !originalRequest) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const newAccessToken = await useAuthStore.getState().refreshTokens();
      flushPendingRequests(newAccessToken, null);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      flushPendingRequests(null, refreshError);
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
