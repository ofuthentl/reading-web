import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  showLabel?: boolean;
}

export function ThemeToggle({ isDark, onToggle, showLabel = false }: ThemeToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={onToggle}
      aria-label={isDark ? 'Chuyển sang chế độ Mặt Trời (Sáng)' : 'Chuyển sang chế độ Mặt Trăng (Tối)'}
      title={isDark ? 'Chế độ Đêm Trăng — bấm để chuyển sang Ban Ngày' : 'Chế độ Ban Ngày — bấm để chuyển sang Đêm Trăng'}
      className="group inline-flex items-center gap-2 rounded-full border border-line bg-canvas p-1 text-xs font-medium text-ink-muted transition-colors duration-200 hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="relative grid h-7 w-14 grid-cols-2 items-center rounded-full bg-subtle/80 p-0.5">
        {/* Viên Mặt Trời / Mặt Trăng trượt mượt */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-accent transition-all duration-300 ease-out ${
            isDark
              ? 'translate-x-7 shadow-[0_0_14px_rgba(241,241,241,0.35)]'
              : 'translate-x-0 shadow-sm'
          }`}
        />
        <span
          className={`relative z-10 flex items-center justify-center transition-colors duration-200 ${
            !isDark ? 'text-accent-foreground' : 'text-ink-faint group-hover:text-ink-muted'
          }`}
        >
          <Sun className="h-3.5 w-3.5" />
        </span>
        <span
          className={`relative z-10 flex items-center justify-center transition-colors duration-200 ${
            isDark ? 'text-accent-foreground' : 'text-ink-faint group-hover:text-ink-muted'
          }`}
        >
          <Moon className="h-3.5 w-3.5" />
        </span>
      </span>

      {showLabel && (
        <span className="hidden pr-2 text-ink-muted transition-colors group-hover:text-ink sm:inline">
          {isDark ? 'Đêm trăng' : 'Ban ngày'}
        </span>
      )}
    </button>
  );
}
