import { Sun, Moon, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';
import { useThemeStore, type Theme } from '../lib/theme-store';

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const THEMES: Theme[] = ['light', 'dark', 'system'];

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="theme-seg" role="group" aria-label="Theme">
      {THEMES.map((t) => {
        const Icon = THEME_ICONS[t];
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            className={`theme-seg-btn${active ? ' active' : ''}`}
            onClick={() => setTheme(t)}
            title={`${THEME_LABELS[t]} mode`}
            aria-label={`${THEME_LABELS[t]} mode`}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId="theme-active-indicator"
                className="theme-seg-ind"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
