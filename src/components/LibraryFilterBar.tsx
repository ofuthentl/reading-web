import { ArrowUpDown, HardDrive, Search, X } from 'lucide-react';
import type {
  LibraryFormatFilter,
  LibrarySortMode,
  LibraryStatusFilter,
  StorageStats,
} from '@/types';
import { HARD_LIMIT_BYTES, formatBytes } from '@/lib/api';

const STATUS_OPTIONS: ReadonlyArray<{ id: LibraryStatusFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'reading', label: 'Đang đọc' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'completed', label: 'Hoàn thành' },
];

const FORMAT_OPTIONS: ReadonlyArray<{ id: LibraryFormatFilter; label: string }> = [
  { id: 'all', label: 'Mọi tệp' },
  { id: 'epub', label: 'EPUB' },
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'DOCX' },
];

const SORT_OPTIONS: ReadonlyArray<{ id: LibrarySortMode; label: string }> = [
  { id: 'title_asc', label: 'Tên A → Z' },
  { id: 'recent_upload', label: 'Mới tải lên' },
  { id: 'recent_read', label: 'Mới đọc gần đây' },
  { id: 'volume_desc', label: 'Nhiều tập nhất' },
];

export interface LibraryFilterBarProps {
  searchQuery: string;
  statusFilter: LibraryStatusFilter;
  formatFilter: LibraryFormatFilter;
  sortMode?: LibrarySortMode;
  isFiltering: boolean;
  filteredCount: number;
  totalCount: number;
  unitLabel?: string;
  searchPlaceholder?: string;
  hideFormatFilter?: boolean;
  hideSort?: boolean;
  showStorage?: boolean;
  storage?: StorageStats | null;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
  onFormatChange: (value: LibraryFormatFilter) => void;
  onSortChange?: (value: LibrarySortMode) => void;
  onClearFilters: () => void;
}

export function LibraryFilterBar({
  searchQuery,
  statusFilter,
  formatFilter,
  sortMode = 'title_asc',
  isFiltering,
  filteredCount,
  totalCount,
  unitLabel = 'cuốn',
  searchPlaceholder = 'Tìm theo tên sách, tác giả hoặc tên kệ... (Nhấn /)',
  hideFormatFilter = false,
  hideSort = false,
  showStorage = false,
  storage = null,
  onSearchChange,
  onStatusChange,
  onFormatChange,
  onSortChange,
  onClearFilters,
}: LibraryFilterBarProps) {
  const usedBytes = storage?.usedBytes ?? 0;
  const limitBytes = storage?.limitBytes || HARD_LIMIT_BYTES;
  const usagePercent = Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));
  const barToneClass =
    usagePercent >= 90
      ? 'bg-red-700 dark:bg-red-500'
      : usagePercent >= 75
        ? 'bg-amber-700 dark:bg-amber-500'
        : 'bg-crimson-accent';
  return (
    <section aria-label="Tìm kiếm và lọc thư viện" className="space-y-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Ô tìm kiếm */}
        <div className="relative flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            inputMode="search"
            data-library-search-input="true"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-9 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Xoá từ khoá tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Cụm bên phải: thông tin lọc + Sắp xếp (Tab Thư viện) hoặc Dung lượng (Trang chủ) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 lg:justify-end">
          {isFiltering && (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span>
                Hiển thị <strong className="text-ink">{filteredCount}</strong> / {totalCount}{' '}
                {unitLabel}
              </span>
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-medium text-accent transition-colors hover:border-line-strong hover:bg-subtle"
              >
                Xoá lọc
              </button>
            </div>
          )}

          {!hideSort && onSortChange && (
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="hidden sm:inline">Sắp xếp:</span>
              <select
                value={sortMode}
                onChange={(event) => onSortChange(event.target.value as LibrarySortMode)}
                aria-label="Sắp xếp thư viện"
                className="cursor-pointer bg-transparent font-medium text-ink outline-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-surface text-ink">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showStorage && (
            <div
              className="flex min-w-[215px] flex-1 flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 sm:min-w-[245px] sm:flex-initial"
              title={`Đã dùng ${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`}
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <HardDrive className="h-3.5 w-3.5 text-accent" />
                  Dung lượng
                </span>
                <span className="font-medium tabular-nums text-ink">
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
          )}
        </div>
      </div>

      {/* Hàng chips trạng thái đọc + định dạng */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Lọc theo trạng thái đọc"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusChange(opt.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-ink-muted hover:bg-subtle hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {!hideFormatFilter && (
          <div
            role="group"
            aria-label="Lọc theo định dạng tệp"
            className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1"
          >
            {FORMAT_OPTIONS.map((opt) => {
              const active = formatFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFormatChange(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-subtle font-semibold text-ink ring-1 ring-line-strong'
                      : 'text-ink-muted hover:bg-subtle/70 hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
