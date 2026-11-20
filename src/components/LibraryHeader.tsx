import {
  BookOpen,
  CheckSquare,
  HardDrive,
  LogOut,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { StorageStats } from '@/types';
import { HARD_LIMIT_BYTES, formatBytes, isCloudMode } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AppTheme } from '@/hooks/useTheme';

interface LibraryHeaderProps {
  storage: StorageStats | null;
  bookCount: number;
  loading: boolean;
  theme: AppTheme;
  selectionMode: boolean;
  selectedCount: number;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onUploadClick: () => void;
  onToggleSelectionMode: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export function LibraryHeader({
  storage,
  bookCount,
  loading,
  theme,
  selectionMode,
  selectedCount,
  onCycleTheme,
  onUploadClick,
  onToggleSelectionMode,
  onRefresh,
  onLogout,
}: LibraryHeaderProps) {
  const usedBytes = storage?.usedBytes ?? 0;
  const limitBytes = storage?.limitBytes || HARD_LIMIT_BYTES;
  const usagePercent = Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));

  const barToneClass =
    usagePercent >= 90
      ? 'bg-red-700 dark:bg-red-500'
      : usagePercent >= 75
        ? 'bg-amber-700 dark:bg-amber-500'
        : 'bg-accent';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm transition-colors duration-200 dark:shadow-[0_1px_0_rgba(241,241,241,0.04)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Thương hiệu */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
                Ofu&apos;s Library
              </h1>
              {!isCloudMode && (
                <span className="shrink-0 rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                  Local Dev
                </span>
              )}
            </div>
            <p className="hidden text-xs text-ink-muted sm:block">
              {bookCount} cuốn sách trong kho
            </p>
          </div>
        </div>

        {/* Thanh dung lượng (Desktop) */}
        <div
          className="hidden min-w-[210px] max-w-xs flex-1 flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 lg:flex"
          title={`Đã dùng ${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <HardDrive className="h-3.5 w-3.5 text-accent" />
              Dung lượng
            </span>
            <span className="font-medium text-ink">
              {formatBytes(usedBytes)}{' '}
              <span className="font-normal text-ink-muted">/ {formatBytes(limitBytes)}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barToneClass}`}
              style={{ width: `${usedBytes > 0 ? Math.max(usagePercent, 1.5) : 0}%` }}
            />
          </div>
        </div>

        {/* Cụm nút hành động */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onUploadClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Tải sách</span>
          </button>

          <button
            type="button"
            onClick={onToggleSelectionMode}
            aria-pressed={selectionMode}
            aria-label={selectionMode ? 'Thoát chế độ chọn nhiều' : 'Chọn nhiều sách'}
            title={selectionMode ? 'Thoát chế độ chọn' : 'Chọn nhiều sách'}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition-colors ${
              selectionMode
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="hidden md:inline">
              {selectionMode
                ? selectedCount > 0
                  ? `Đang chọn (${selectedCount})`
                  : 'Đang chọn'
                : 'Chọn'}
            </span>
          </button>

          <ThemeToggle theme={theme} onCycle={onCycleTheme} />

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Làm mới thư viện"
            title="Làm mới thư viện"
            className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-red-700/35 hover:bg-subtle hover:text-red-700 dark:hover:border-red-400/35 dark:hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Thanh dung lượng gọn cho Mobile / Tablet */}
      <div className="border-t border-line/70 bg-canvas/60 px-4 py-2 lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-ink-muted">
            <HardDrive className="h-3.5 w-3.5 text-accent" />
            <span>{bookCount} sách</span>
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barToneClass}`}
              style={{ width: `${usedBytes > 0 ? Math.max(usagePercent, 1.5) : 0}%` }}
            />
          </div>
          <span className="shrink-0 font-medium text-ink">
            {formatBytes(usedBytes)}{' '}
            <span className="font-normal text-ink-muted">/ {formatBytes(limitBytes)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
