import { Box, LayoutGrid } from 'lucide-react';
import type { ViewMode } from '@/types';

interface ViewModeToggleProps {
  canUse3D: boolean;
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ canUse3D, viewMode, onChange }: ViewModeToggleProps) {
  if (!canUse3D) return null;

  return (
    <div
      role="group"
      aria-label="Chế độ hiển thị thư viện"
      className="inline-flex h-9 items-center rounded-xl border border-line bg-canvas p-0.5"
    >
      <button
        type="button"
        onClick={() => onChange('2d')}
        aria-pressed={viewMode === '2d'}
        aria-label="Chuyển sang thư viện 2D"
        title="Thư viện 2D"
        className={`inline-flex h-full items-center gap-1 rounded-[10px] px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          viewMode === '2d'
            ? 'bg-accent text-accent-foreground shadow-sm'
            : 'text-ink-muted hover:text-ink'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>2D</span>
      </button>

      <button
        type="button"
        onClick={() => onChange('3d')}
        aria-pressed={viewMode === '3d'}
        aria-label="Chuyển sang thư viện 3D"
        title="Thư viện 3D"
        className={`inline-flex h-full items-center gap-1 rounded-[10px] px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          viewMode === '3d'
            ? 'bg-accent text-accent-foreground shadow-sm'
            : 'text-ink-muted hover:text-ink'
        }`}
      >
        <Box className="h-3.5 w-3.5" />
        <span>3D</span>
      </button>
    </div>
  );
}
