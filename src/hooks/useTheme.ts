import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dim' | 'midnight';

export const THEME_ORDER: readonly AppTheme[] = ['light', 'dim', 'midnight'];

export const THEME_LABELS: Record<AppTheme, string> = {
  light: 'Ban ngày',
  dim: 'Chiều tối',
  midnight: 'Đêm khuya',
};

const THEME_STORAGE_KEY = 'ofu-library-theme';

const THEME_META_COLORS: Record<AppTheme, string> = {
  light: '#f6f1e7',
  dim: '#0d1117',
  midnight: '#060608',
};

function parseStoredTheme(value: string | null): AppTheme | null {
  if (value === 'light' || value === 'dim' || value === 'midnight') return value;
  if (value === 'dark') return 'dim';
  return null;
}

function readInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Ignore storage read errors
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dim';
  }
  return 'light';
}

function applyThemeToDocument(theme: AppTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme !== 'light');

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = THEME_META_COLORS[theme];
  }
}

export function getNextTheme(current: AppTheme): AppTheme {
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>(readInitialTheme);

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const parsed = parseStoredTheme(event.newValue);
      if (parsed) setThemeState(parsed);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
  }, []);

  const cycleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      const next = getNextTheme(theme);
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      if (typeof document.startViewTransition !== 'function' || prefersReducedMotion || !origin) {
        setThemeState(next);
        return;
      }

      const root = document.documentElement;
      const maxRadius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      );
      root.style.setProperty('--theme-reveal-x', `${origin.x}px`);
      root.style.setProperty('--theme-reveal-y', `${origin.y}px`);
      root.style.setProperty('--theme-reveal-r', `${maxRadius}px`);
      root.dataset.themeSwitch = 'true';

      const transition = document.startViewTransition(() => {
        applyThemeToDocument(next);
        setThemeState(next);
      });
      transition.finished.finally(() => {
        delete root.dataset.themeSwitch;
      });
    },
    [theme],
  );

  return {
    theme,
    isDark: theme !== 'light',
    setTheme,
    cycleTheme,
  };
}
