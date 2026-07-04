import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  getEffectiveTheme: () => 'light' | 'dark';
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },
      getEffectiveTheme: () => {
        const state = get();
        if (state.theme === 'system') {
          return getSystemTheme();
        }
        return state.theme;
      },
    }),
    { name: 'sdlmp-admin-theme' },
  ),
);

export function applyTheme(theme: Theme) {
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
  const html = document.documentElement;
  
  html.style.colorScheme = effectiveTheme;
  
  if (effectiveTheme === 'dark') {
    html.classList.add('dark-mode');
    html.classList.remove('light-mode');
  } else {
    html.classList.add('light-mode');
    html.classList.remove('dark-mode');
  }
  
  // Update CSS custom properties
  const vars = effectiveTheme === 'dark' 
    ? DARK_THEME_VARS
    : LIGHT_THEME_VARS;
  
  Object.entries(vars).forEach(([key, value]) => {
    html.style.setProperty(`--${key}`, value);
  });
}

const LIGHT_THEME_VARS = {
  'bg': '#f5f6fa',
  'surface': '#ffffff',
  'surface-secondary': '#f9fafb',
  'border': '#e2e4ea',
  'text': '#1f2430',
  'text-muted': '#6b7280',
  'accent': '#4f46e5',
  'accent-contrast': '#ffffff',
  'danger': '#dc2626',
  'success': '#16a34a',
  'warning': '#d97706',
  'info': '#0ea5e9',
};

const DARK_THEME_VARS = {
  'bg': '#0f1419',
  'surface': '#1a202c',
  'surface-secondary': '#2d3748',
  'border': '#2d3748',
  'text': '#f5f6fa',
  'text-muted': '#a0aec0',
  'accent': '#6366f1',
  'accent-contrast': '#ffffff',
  'danger': '#ef4444',
  'success': '#22c55e',
  'warning': '#f59e0b',
  'info': '#06b6d4',
};

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState();
    if (theme === 'system') {
      applyTheme('system');
    }
  });
}
