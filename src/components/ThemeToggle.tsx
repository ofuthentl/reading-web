import type { MouseEvent } from 'react';
import { Moon, MoonStar, Sun, Sunrise } from 'lucide-react';
import { THEME_LABELS, type UiTheme, getNextTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  theme: UiTheme;
  onCycle: (origin?: { x: number; y: number }) => void;
  showLabel?: boolean;
}

const ICON_BY_THEME: Record<UiTheme, typeof Sun> = {
  light: Sunrise,
  noon: Sun,
  dim: Moon,
  midnight: MoonStar,
};

export function ThemeToggle({ theme, onCycle, showLabel = false }: ThemeToggleProps) {
  const Icon = ICON_BY_THEME[theme];
  const currentLabel = THEME_LABELS[theme];
  const nextLabel = THEME_LABELS[getNextTheme(theme)];

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCycle({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Giao diện ${currentLabel} — bấm để chuyển sang ${nextLabel}`}
      title={`${currentLabel} · Bấm để chuyển sang ${nextLabel}`}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-canvas text-ink transition-colors duration-200 hover:border-line-strong hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        showLabel ? 'h-9 px-3 text-xs font-medium' : 'h-9 w-9'
      }`}
    >
      <Icon key={theme} className="theme-icon-spin h-4 w-4 text-accent" />
      {showLabel && <span className="text-ink-muted">{currentLabel}</span>}
    </button>
  );
}
