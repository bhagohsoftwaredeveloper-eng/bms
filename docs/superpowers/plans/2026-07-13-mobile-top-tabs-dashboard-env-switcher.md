# Beulah Field Mobile — Top Tabs, Shared Dashboard & Env Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the mobile app's navigation to a top tab bar, show a role-appropriate dashboard to installers as well as admins, and add a SUPER_ADMIN-only in-app backend switcher (Local ↔ Prod).

**Architecture:** Replace the `expo-router` bottom `Tabs` with Material Top Tabs wired via `withLayoutContext`, with the existing purple bar supplied by the parent Stack header. The dashboard screen branches on role. The axios base URL becomes runtime-mutable, backed by a per-device SecureStore selection that a Profile "Server" section (SUPER_ADMIN only) writes.

**Tech Stack:** Expo SDK 54, expo-router ~6, React Native 0.81, axios, expo-secure-store, `@react-navigation/material-top-tabs`, `react-native-pager-view`.

## Global Constraints

- All app source lives under `mobile/`. Run every command from `mobile/`.
- Do NOT change any backend endpoints. The app targets one backend at a time.
- Keep the existing visual language: primary `#4f46e5`, inactive `#9ca3af`, white cards, emoji tab icons.
- `isAdmin` everywhere means `role === 'SUPER_ADMIN' || role === 'ADMIN_STAFF'` (matches existing code). Installers are `role === 'INSTALLER'`.
- Default backend when nothing is stored MUST remain Prod (`PROD_API_URL`) — preserve current production behavior.
- Use `npx expo install <pkg>` (never bare `npm install`) for native deps so Expo picks SDK-compatible versions.
- Type-check gate for each task: from `mobile/`, `npx tsc --noEmit` must be clean.

---

### Task 1: Dynamic API base URL + backend-env persistence (`api.ts`)

Makes the axios base URL runtime-mutable and adds SecureStore-backed env selection. No behavior change yet (defaults to Prod).

**Files:**
- Modify (full rewrite): `mobile/src/api.ts`

**Interfaces:**
- Produces (consumed by Tasks 2 & 3):
  - `type ApiEnv = 'local' | 'prod'`
  - `PROD_API_URL: string`, `DEFAULT_LOCAL_API_URL: string`
  - `getApiUrl(): string`
  - `setApiBaseUrl(url: string): void`
  - `getApiEnv(): Promise<{ env: ApiEnv; localUrl: string }>`
  - `loadApiEnv(): Promise<void>` — apply persisted selection to axios (call once at boot)
  - `saveApiEnv(env: ApiEnv, localUrl: string): Promise<void>` — persist + activate
  - unchanged exports kept: `api`, `loadTokens`, `saveTokens`, `setAccessToken`, `clearTokens`, `setUnauthorizedHandler`, `fileUrl`
- Consumes: nothing new.

- [ ] **Step 1: Rewrite `mobile/src/api.ts`**

```ts
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
```

Note: `setApiBaseUrl` references `api`, which is declared lower in the module. This is safe — the function only runs at call time, after the module has fully initialized.

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors. (Confirms no remaining references to the removed `API_URL` export; `fileUrl` in `app/job/[id].tsx` still imports `fileUrl`, which is unchanged.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/api.ts
git commit -m "feat(mobile): runtime-mutable API base URL + backend env persistence"
```

---

### Task 2: Apply persisted backend env at app boot (`auth.tsx`)

Ensures the stored Local/Prod choice is active before the first authenticated request.

**Files:**
- Modify: `mobile/src/auth.tsx` (import list + boot effect)

**Interfaces:**
- Consumes: `loadApiEnv` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add `loadApiEnv` to the api import**

In `mobile/src/auth.tsx`, change the import block:

```tsx
import {
  api,
  clearTokens,
  loadApiEnv,
  loadTokens,
  saveTokens,
  setUnauthorizedHandler,
} from './api';
```

- [ ] **Step 2: Call `loadApiEnv()` first in the restore-session effect**

In the boot `useEffect`, update the async IIFE so the env is applied before tokens load:

```tsx
    (async () => {
      try {
        await loadApiEnv();
        const { accessToken } = await loadTokens();
        const stored = await SecureStore.getItemAsync(USER_KEY);
        if (accessToken && stored) {
          setUser(JSON.parse(stored) as AuthUser);
          void registerForPush();
        }
      } finally {
        setInitializing(false);
      }
    })();
```

- [ ] **Step 3: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/auth.tsx
git commit -m "feat(mobile): apply persisted backend env on app boot"
```

---

### Task 3: SUPER_ADMIN Server switcher in Profile (`profile.tsx`)

Adds a "Server" section (visible only to SUPER_ADMIN) to toggle Local ↔ Prod, edit the Local URL, and apply with a forced re-login.

**Files:**
- Modify (full rewrite): `mobile/app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `getApiEnv`, `saveApiEnv`, `DEFAULT_LOCAL_API_URL`, `ApiEnv` from Task 1; `useAuth().signOut` (existing).
- Produces: nothing new.

- [ ] **Step 1: Rewrite `mobile/app/(tabs)/profile.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth';
import { DEFAULT_LOCAL_API_URL, getApiEnv, saveApiEnv, type ApiEnv } from '@/api';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [env, setEnv] = useState<ApiEnv>('prod');
  const [localUrl, setLocalUrl] = useState(DEFAULT_LOCAL_API_URL);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void getApiEnv().then((stored) => {
      setEnv(stored.env);
      setLocalUrl(stored.localUrl);
    });
  }, [isSuperAdmin]);

  const applySwitch = async () => {
    if (env === 'local' && !/^https?:\/\/.+/.test(localUrl.trim())) {
      Alert.alert('Invalid URL', 'Enter a valid Local URL, e.g. http://192.168.1.246:3001/api');
      return;
    }
    setApplying(true);
    try {
      await saveApiEnv(env, localUrl.trim());
      await signOut();
      router.replace('/login');
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.fullName?.charAt(0).toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={styles.name}>{user?.fullName}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{user ? formatRole(user.role) : ''}</Text>
      </View>

      {isSuperAdmin && (
        <View style={styles.serverCard}>
          <Text style={styles.serverTitle}>Server</Text>
          <Text style={styles.serverActive}>
            Active: {env === 'local' ? localUrl : 'Production (deployed)'}
          </Text>
          <View style={styles.segment}>
            {(['local', 'prod'] as ApiEnv[]).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.segmentBtn, env === opt && styles.segmentBtnActive]}
                onPress={() => setEnv(opt)}
              >
                <Text style={[styles.segmentText, env === opt && styles.segmentTextActive]}>
                  {opt === 'local' ? 'Local' : 'Prod'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {env === 'local' && (
            <TextInput
              style={styles.input}
              placeholder={DEFAULT_LOCAL_API_URL}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={localUrl}
              onChangeText={setLocalUrl}
            />
          )}

          <Text style={styles.serverWarn}>Switching signs you out — log in again on the selected backend.</Text>
          <TouchableOpacity
            style={[styles.applyBtn, applying && styles.applyBtnDisabled]}
            disabled={applying}
            onPress={() => void applySwitch()}
          >
            <Text style={styles.applyBtnText}>{applying ? 'Applying…' : 'Apply & re-login'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.signOut} onPress={() => void signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 32, gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 8 },
  email: { fontSize: 14, color: '#6b7280' },
  roleBadge: { backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 6 },
  roleText: { color: '#4f46e5', fontWeight: '700', fontSize: 13 },
  serverCard: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef0f4',
    backgroundColor: '#fff',
    gap: 10,
  },
  serverTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  serverActive: { fontSize: 12, color: '#6b7280' },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  segmentBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  segmentTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  serverWarn: { fontSize: 11, color: '#d97706' },
  applyBtn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  signOut: {
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  signOutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/(tabs)/profile.tsx
git commit -m "feat(mobile): SUPER_ADMIN Server switcher (local/prod) in Profile"
```

---

### Task 4: Installer-specific dashboard (`dashboard.tsx`)

Branch the dashboard by role: keep admin stats; add installer stats from scoped endpoints. (Installers can't reach this screen until Task 5 makes the tab visible to them.)

**Files:**
- Modify (full rewrite): `mobile/app/(tabs)/dashboard.tsx`

**Interfaces:**
- Consumes: `api` (existing); `useAuth` (existing); types `Client`, `License`, `Job`, `JobStatus`, `Withdrawal`.
- Produces: nothing new.

- [ ] **Step 1: Rewrite `mobile/app/(tabs)/dashboard.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/api';
import { useAuth } from '@/auth';
import type { Client, License, Job, JobStatus, Withdrawal } from '@/types';

interface Stat {
  label: string;
  value: string;
  color: string;
}

const ACTIVE_STATUSES: JobStatus[] = ['ASSIGNED', 'ON_GOING', 'WAITING_ACTIVATION'];
const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function DashboardScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isAdmin) {
        const [clients, licenses, jobs, withdrawals] = await Promise.all([
          api.get<Client[]>('/clients'),
          api.get<License[]>('/licenses'),
          api.get<Job[]>('/jobs'),
          api.get<Withdrawal[]>('/withdrawals'),
        ]);
        const activeClients = clients.data.filter((c) => c.status === 'ACTIVE').length;
        const activeLicenses = licenses.data.filter((l) => l.status === 'ACTIVATED').length;
        const openJobs = jobs.data.filter((j) => j.jobStatus !== 'COMPLETED' && j.jobStatus !== 'CANCELLED').length;
        const pendingWd = withdrawals.data.filter((w) => w.status === 'PENDING').length;
        setStats([
          { label: 'Clients', value: String(clients.data.length), color: '#4f46e5' },
          { label: 'Active Clients', value: String(activeClients), color: '#16a34a' },
          { label: 'Licenses', value: String(licenses.data.length), color: '#7c3aed' },
          { label: 'Active Licenses', value: String(activeLicenses), color: '#0891b2' },
          { label: 'Open Jobs', value: String(openJobs), color: '#d97706' },
          { label: 'Pending Withdrawals', value: String(pendingWd), color: '#dc2626' },
        ]);
      } else {
        const [balance, jobs, withdrawals] = await Promise.all([
          api.get<{ availableBalance: number }>('/withdrawals/balance'),
          api.get<Job[]>('/jobs', { params: { mine: 'true' } }),
          api.get<Withdrawal[]>('/withdrawals', { params: { mine: 'true' } }),
        ]);
        const openJobs = jobs.data.filter((j) => ACTIVE_STATUSES.includes(j.jobStatus)).length;
        const doneJobs = jobs.data.filter((j) => !ACTIVE_STATUSES.includes(j.jobStatus)).length;
        const pendingWd = withdrawals.data.filter((w) => w.status === 'PENDING').length;
        setStats([
          { label: 'Available Balance', value: peso(balance.data.availableBalance), color: '#16a34a' },
          { label: 'Open Jobs', value: String(openJobs), color: '#d97706' },
          { label: 'Completed Jobs', value: String(doneJobs), color: '#4f46e5' },
          { label: 'Pending Withdrawals', value: String(pendingWd), color: '#dc2626' },
        ]);
      }
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      }
    >
      <Text style={styles.greeting}>Welcome, {user?.fullName?.split(' ')[0]} 👋</Text>
      <Text style={styles.sub}>{isAdmin ? 'System overview' : 'Your overview'}</Text>

      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    width: '47.5%',
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
```

(`statValue` reduced 30 → 26 so the peso balance string fits within the card.)

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/(tabs)/dashboard.tsx
git commit -m "feat(mobile): installer-specific dashboard stats"
```

---

### Task 5: Top tab bar + dashboard visible to all (`_layout.tsx` files, deps)

Swap the bottom tab bar for Material Top Tabs, supply the purple bar from the parent Stack header, and make Dashboard visible to both roles.

**Files:**
- Modify: `mobile/package.json` (via `expo install`)
- Modify: `mobile/app/_layout.tsx` (show header for `(tabs)`)
- Modify (full rewrite): `mobile/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `useAuth` (existing).
- Produces: nothing new.

- [ ] **Step 1: Install the native tab deps**

Run (from `mobile/`):
```bash
npx expo install @react-navigation/material-top-tabs react-native-pager-view
```
Expected: both added to `mobile/package.json` `dependencies` at SDK-54-compatible versions.

- [ ] **Step 2: Show the purple header for the `(tabs)` group**

In `mobile/app/_layout.tsx`, replace the bare `(tabs)` screen line:

```tsx
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: true,
              title: 'Beulah Field',
              headerStyle: { backgroundColor: '#4f46e5' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '700' },
            }}
          />
          <Stack.Screen name="admin" />
```

- [ ] **Step 3: Rewrite `mobile/app/(tabs)/_layout.tsx` as Material Top Tabs**

```tsx
import { Redirect, withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@/auth';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 16, color }}>{label}</Text>;
}

export default function TabsLayout() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF';

  return (
    <MaterialTopTabs
      screenOptions={{
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', textTransform: 'none' },
        tabBarIndicatorStyle: { backgroundColor: '#4f46e5', height: 3 },
        tabBarStyle: { backgroundColor: '#fff' },
        tabBarShowIcon: true,
        tabBarScrollEnabled: false,
      }}
    >
      {/* Everyone */}
      <MaterialTopTabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <TabIcon label="📊" color={color} /> }}
      />
      {/* Installer-only */}
      <MaterialTopTabs.Screen
        name="index"
        options={{ title: 'My Jobs', href: isAdmin ? null : undefined, tabBarIcon: ({ color }) => <TabIcon label="🧰" color={color} /> }}
      />
      <MaterialTopTabs.Screen
        name="earnings"
        options={{ title: 'Earnings', href: isAdmin ? null : undefined, tabBarIcon: ({ color }) => <TabIcon label="💰" color={color} /> }}
      />
      {/* Admin-only */}
      <MaterialTopTabs.Screen
        name="menu"
        options={{ title: 'Menu', href: isAdmin ? undefined : null, tabBarIcon: ({ color }) => <TabIcon label="🗂️" color={color} /> }}
      />
      {/* Everyone */}
      <MaterialTopTabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} /> }}
      />
    </MaterialTopTabs>
  );
}
```

Note: if `npx tsc --noEmit` flags `href` as not assignable on a Screen's `options`, cast just that object, e.g. `options={{ ... } as never}`. `href` is honored by expo-router at runtime regardless of the navigator; this only quiets the type.

- [ ] **Step 4: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors (apply the `href` cast from the note if needed).

- [ ] **Step 5: Manual verification (dev)**

Run (from `mobile/`): `npx expo start` and open on an emulator/device (Expo Go bundles `react-native-pager-view`, so no custom rebuild is needed for dev).
Verify:
- The purple "Beulah Field" header shows, with a swipeable tab strip directly beneath it.
- Log in as an **installer**: tabs are Dashboard · My Jobs · Earnings · Profile. Dashboard shows Available Balance, Open Jobs, Completed Jobs, Pending Withdrawals. No "Server" section in Profile.
- Log in as a **SUPER_ADMIN**: tabs are Dashboard · Menu · Profile. Dashboard shows the admin stats. Profile shows the "Server" section.
- In Profile as SUPER_ADMIN, switch to **Local**, confirm the URL, tap **Apply & re-login** → app returns to Login. Log in against the local backend, submit a withdrawal from Earnings, and confirm the row is created in the **local** DB (not prod). Switch back to **Prod** and confirm targeting returns to the deployed backend.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app/_layout.tsx "mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): top tab bar via material-top-tabs; dashboard visible to all roles"
```

---

## Post-implementation note (production build)

The new native module (`react-native-pager-view`) requires a fresh EAS build before the top tabs appear in an installed APK. After merging, run the usual `production-apk` build. Dev/Expo Go needs no rebuild.

## Self-Review

- **Spec coverage:** Top tabs (Task 5) ✓; purple header retained via Stack header (Task 5) ✓; role-filtered tab sets (Task 5) ✓; dashboard for both roles with installer stats (Task 4 + Task 5 href) ✓; dynamic base URL (Task 1) ✓; boot load (Task 2) ✓; SUPER_ADMIN-only switcher, device-wide, forced re-login (Task 3) ✓; default Prod (Task 1 `getApiEnv`) ✓; build-rebuild note ✓.
- **Placeholder scan:** none — every step has full code or an exact command.
- **Type consistency:** `getApiEnv`/`loadApiEnv`/`saveApiEnv`/`setApiBaseUrl`/`getApiUrl`/`ApiEnv`/`DEFAULT_LOCAL_API_URL`/`PROD_API_URL` are defined in Task 1 and consumed with identical names/signatures in Tasks 2–3; `isAdmin` predicate identical in Tasks 4 & 5; `ACTIVE_STATUSES` matches `mobile/app/(tabs)/index.tsx`.
