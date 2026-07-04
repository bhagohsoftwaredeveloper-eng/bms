import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './auth-store';
import type { LoginResponse } from './types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setAccessToken, clear } = useAuthStore.getState();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${api.defaults.baseURL}/auth/refresh`,
      { refreshToken },
    );
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch (err) {
    clear();
    throw err;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      try {
        const accessToken = await refreshPromise;
        original.headers.set('Authorization', `Bearer ${accessToken}`);
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
