import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  api,
  clearTokens,
  loadTokens,
  saveTokens,
  setUnauthorizedHandler,
} from './api';
import { registerForPush, unregisterPush } from './push';
import type { AuthUser, LoginResponse } from './types';

const USER_KEY = 'beulah_user';

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  const signOut = useCallback(async () => {
    try {
      await unregisterPush();
      await api.post('/auth/logout').catch(() => undefined);
    } finally {
      await clearTokens();
      await SecureStore.deleteItemAsync(USER_KEY);
      setUser(null);
    }
  }, []);

  // Restore session on launch.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void SecureStore.deleteItemAsync(USER_KEY);
      setUser(null);
    });
    (async () => {
      try {
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
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    await saveTokens(data.accessToken, data.refreshToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    void registerForPush();
  }, []);

  const value = useMemo(
    () => ({ user, initializing, signIn, signOut }),
    [user, initializing, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
