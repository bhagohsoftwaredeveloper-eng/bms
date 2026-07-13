import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'beulah_access';
const REFRESH_KEY = 'beulah_refresh';
const ENV_KEY = 'beulah_api_env';
const LOCAL_URL_KEY = 'beulah_local_url';

export type ApiEnv = 'local' | 'prod';

/** Deployed backend, pinned at build time (EXPO_PUBLIC_API_URL / app.json extra). */
export const PROD_API_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://10.0.2.2:3001/api';

/** Default local backend; editable at runtime via Profile → Server. */
export const DEFAULT_LOCAL_API_URL = 'http://192.168.1.246:3001/api';

let currentApiUrl = PROD_API_URL;

export function getApiUrl(): string {
  return currentApiUrl;
}

export function setApiBaseUrl(url: string): void {
  currentApiUrl = url;
  api.defaults.baseURL = url;
}

// ── token storage ────────────────────────────────────────────────────────────
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return { accessToken, refreshToken };
}

export async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function setAccessToken(access: string) {
  accessToken = access;
  await SecureStore.setItemAsync(ACCESS_KEY, access);
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

// ── backend environment (local ↔ prod) ───────────────────────────────────────
/** Read the persisted backend selection. Defaults to prod when nothing is stored. */
export async function getApiEnv(): Promise<{ env: ApiEnv; localUrl: string }> {
  const env = ((await SecureStore.getItemAsync(ENV_KEY)) as ApiEnv | null) ?? 'prod';
  const localUrl = (await SecureStore.getItemAsync(LOCAL_URL_KEY)) ?? DEFAULT_LOCAL_API_URL;
  return { env, localUrl };
}

/** Apply the persisted backend selection to the axios instance. Call once at boot. */
export async function loadApiEnv(): Promise<void> {
  const { env, localUrl } = await getApiEnv();
  setApiBaseUrl(env === 'local' ? localUrl : PROD_API_URL);
}

/** Persist a backend selection and activate it immediately. */
export async function saveApiEnv(env: ApiEnv, localUrl: string): Promise<void> {
  await SecureStore.setItemAsync(ENV_KEY, env);
  await SecureStore.setItemAsync(LOCAL_URL_KEY, localUrl);
  setApiBaseUrl(env === 'local' ? localUrl : PROD_API_URL);
}

/** Resolve a server-relative upload path to an absolute URL against the active backend. */
export function fileUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return getApiUrl().replace(/\/api\/?$/, '') + path;
}

export const api = axios.create({ baseURL: currentApiUrl });

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${getApiUrl()}/auth/refresh`,
    { refreshToken },
  );
  await saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const token = await refreshPromise;
        original.headers.set('Authorization', `Bearer ${token}`);
        return api(original);
      } catch (err) {
        await clearTokens();
        onUnauthorized?.();
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  },
);
