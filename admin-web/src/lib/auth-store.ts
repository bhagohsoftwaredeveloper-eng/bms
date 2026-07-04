import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthenticatedUser } from './types';

interface AuthState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (session: { user: AuthenticatedUser; accessToken: string; refreshToken: string }) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: AuthenticatedUser) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, accessToken, refreshToken }) => set({ user, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'sdlmp-admin-auth' },
  ),
);
