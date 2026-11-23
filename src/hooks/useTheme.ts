import { useCallback, useEffect, useState } from 'react';

/** 3 khung giờ ánh sáng của không gian 3D (giữ nguyên 100%, không sửa library3d/) */
export type AppTheme = 'light' | 'dim' | 'midnight';

/** 4 chế độ nền của App 2D & Trình đọc (Cách 1, D-034) */
export type UiTheme = AppTheme | 'noon';

export const THEME_ORDER: readonly UiTheme[] = ['light', 'noon', 'dim', 'midnight'];

export const THEME_LABELS: Record<UiTheme, string> = {
  light: 'Ban ngày',
  noon: 'Giữa trưa',
  dim: 'Chiều tối',
  midnight: 'Đêm khuya',
};

const THEME_STORAGE_KEY = 'ofu-library-theme';

const THEME_META_COLORS: Record<UiTheme, string> = {
  light: '#f6f1e7',
  noon: '#fcfbf8',
  dim: '#0d1117',
  midnight: '#060608',
};

export function isDarkTheme(theme: UiTheme): boolean {
  return theme === 'dim' || theme === 'midnight';
}

export function toScene3DTheme(theme: UiTheme): AppTheme {
  return theme === 'noon' ? 'light' : theme;
}

function parseStoredTheme(value: string | null): UiTheme | null {
  if (value === 'light' || value === 'noon' || value === 'dim' || value === 'midnight') return value;
  if (value === 'dark') return 'dim';
  return null;
}

function readInitialTheme(): UiTheme {
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

function applyThemeToDocument(theme: UiTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', isDarkTheme(theme));

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = THEME_META_COLORS[theme];
  }
}

export function getNextTheme(current: UiTheme): UiTheme {
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

function getNext3DTheme(current: UiTheme): AppTheme {
  if (current === 'light' || current === 'noon') return 'dim';
  if (current === 'dim') return 'midnight';
  return 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<UiTheme>(readInitialTheme);

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

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
  }, []);

  const transitionToTheme = useCallback(
    (next: UiTheme, origin?: { x: number; y: number }) => {
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
    [],
  );

  const cycleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      transitionToTheme(getNextTheme(theme), origin);
    },
    [theme, transitionToTheme],
  );

  const cycle3DTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      transitionToTheme(getNext3DTheme(theme), origin);
    },
    [theme, transitionToTheme],
  );

  return {
    theme,
    isDark: isDarkTheme(theme),
    setTheme,
    cycleTheme,
    cycle3DTheme,
  };
}
