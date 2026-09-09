import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '@/store/auth.store';

// Web 上跑在同一台机器，localhost 能直接连后端；真机/模拟器要换成开发机的局域网 IP，见 mobile/.env.example
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshPromise: Promise<string> | null = null;

// access token 15分钟过期，过期后用 refresh token 换新重试一次原请求，对调用方完全透明；
// refresh 本身失败（refresh token 也过期了）才清空登录态，交给根布局的 auth-gate 跳回登录页
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = originalRequest?.url?.startsWith('/auth/');

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry || isAuthEndpoint) {
      throw error;
    }
    originalRequest._retry = true;

    const { refreshToken, setAccessToken, clearSession } = useAuthStore.getState();
    if (!refreshToken) {
      await clearSession();
      throw error;
    }

    try {
      refreshPromise ??= apiClient
        .post('/auth/refresh', { refreshToken })
        .then((res) => res.data.data.accessToken as string);
      const newAccessToken = await refreshPromise;
      await setAccessToken(newAccessToken);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      await clearSession();
      throw refreshError;
    } finally {
      refreshPromise = null;
    }
  },
);
