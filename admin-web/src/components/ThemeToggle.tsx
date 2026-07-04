import { Sun, Moon, Monitor } from 'lucide-react';
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

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const themes: Theme[] = ['light', 'dark', 'system'];
  const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
  const Icon = THEME_ICONS[theme];

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      title={`Theme: ${theme} — click to switch`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.45rem 0.85rem',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: 'var(--text-muted)',
        fontFamily: 'inherit',
        transition: 'all 0.18s ease',
        letterSpacing: '0.01em',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.color = 'var(--accent)';
        e.currentTarget.style.background = 'var(--accent-light)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-muted)';
        e.currentTarget.style.background = 'var(--surface-secondary)';
      }}
    >
      <Icon size={14} strokeWidth={2} />
      <span>{THEME_LABELS[theme]}</span>
    </button>
  );
}
