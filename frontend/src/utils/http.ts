/**
 * HTTP client for making API requests using axios
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import router from '@/router';

/** Create axios instance */
const axiosInstance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

/** Track whether a token refresh is in progress to avoid concurrent refreshes */
let refreshPromise: Promise<boolean> | null = null;

/** Request interceptor: attach auth header */
axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`;
  }
  return config;
});

/** Response interceptor: handle error responses and 401 token refresh */
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { message?: string; code?: string }; message?: string }>) => {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const originalConfig = error.config;

    // Handle MUST_CHANGE_PASSWORD
    if (status === 403 && errorCode === 'E00047') {
      if (router.currentRoute.value.name !== 'changePassword') {
        await router.push({ name: 'changePassword' });
      }
      return Promise.reject(new Error('Password change required'));
    }

    // Handle 401 — try to refresh token and retry (skip for refresh endpoint itself)
    if (status === 401 && originalConfig && !originalConfig.url?.includes('/auth/refresh')) {
      const retryKey = '_retried';
      const configWithRetry = originalConfig as unknown as Record<string, unknown>;
      if (!configWithRetry[retryKey]) {
        configWithRetry[retryKey] = true;

        const authStore = useAuthStore();

        // Coalesce concurrent refresh attempts
        if (!refreshPromise) {
          refreshPromise = authStore.refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }

        const refreshed = await refreshPromise;
        if (refreshed) {
          // Retry with new token
          if (originalConfig.headers) {
            originalConfig.headers.Authorization = `Bearer ${authStore.accessToken}`;
          }
          return axiosInstance(originalConfig);
        }

        // Refresh failed — redirect to login
        authStore.clearAuth();
        await router.push({ name: 'login' });
        return Promise.reject(new Error('Session expired'));
      }
    }

    // Default error handling
    const responseData = error.response?.data;
    if (responseData?.error?.message) {
      return Promise.reject(new Error(responseData.error.message));
    }
    if (responseData?.message) {
      return Promise.reject(new Error(responseData.message));
    }
    if (error.message) {
      return Promise.reject(new Error(error.message));
    }
    return Promise.reject(new Error('Request failed'));
  }
);

/** HTTP client interface providing common HTTP methods */
interface HttpClientInterface {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data: unknown): Promise<T>;
  delete(url: string): Promise<void>;
  upload<T>(url: string, file: File, fieldName?: string): Promise<T>;
  uploadMultiple<T>(url: string, files: File[], fieldName?: string): Promise<T>;
}

/** HTTP client implementation using axios */
const httpClient: HttpClientInterface = {
  async get<T>(url: string): Promise<T> {
    const response = await axiosInstance.get<T>(url);
    return response.data;
  },

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.post<T>(url, data);
    return response.data;
  },

  async put<T>(url: string, data: unknown): Promise<T> {
    const response = await axiosInstance.put<T>(url, data);
    return response.data;
  },

  async delete(url: string): Promise<void> {
    await axiosInstance.delete(url);
  },

  async upload<T>(url: string, file: File, fieldName: string = 'file'): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const response = await axiosInstance.post<T>(url, formData);

    return response.data;
  },

  async uploadMultiple<T>(url: string, files: File[], fieldName: string = 'files'): Promise<T> {
    const formData = new FormData();
    for (const file of files) {
      formData.append(fieldName, file);
    }

    const response = await axiosInstance.post<T>(url, formData);

    return response.data;
  },
};

/** Default HTTP client instance */
export const http = httpClient;

/** Export axios instance for adding custom interceptors */
export { axiosInstance };
