import { Suspense, lazy, useState } from 'react';
import { ArrowUpDown, CheckSquare, HardDrive, Search, Shield, X } from 'lucide-react';
import type {
  LibrarySortMode,
  LibraryStatusFilter,
  ShelfGroup,
  StorageStats,
  TagMatchMode,
} from '@/types';
import { HARD_LIMIT_BYTES, formatBytes } from '@/lib/api';

const LazyAdvancedSearchPanel = lazy(() =>
  import('@/components/AdvancedSearchPanel').then((mod) => ({
    default: mod.AdvancedSearchPanel,
  })),
);

export interface LibraryAdvancedFilterProps {
  authorFilter: string;
  includedTags: readonly string[];
  excludedTags: readonly string[];
  tagMatchMode: TagMatchMode;
  availableAuthors: readonly string[];
  allShelves: readonly ShelfGroup[];
  shelfTags?: Readonly<Record<string, string[]>>;
  onAuthorFilterChange: (value: string) => void;
  onCycleTagFilter: (tag: string) => void;
  onRemoveIncludedTag: (tag: string) => void;
  onRemoveExcludedTag: (tag: string) => void;
  onClearTagFilters: () => void;
  onTagMatchModeChange: (mode: TagMatchMode) => void;
}

const STATUS_OPTIONS: ReadonlyArray<{ id: LibraryStatusFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'reading', label: 'Đang đọc' },
  { id: 'plan_to_read', label: 'Đọc sau' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'completed', label: 'Hoàn thành' },
];

const SORT_OPTIONS: ReadonlyArray<{ id: LibrarySortMode; label: string }> = [
  { id: 'title_asc', label: 'Tên A → Z' },
  { id: 'rating_desc', label: 'Đánh giá cao nhất' },
  { id: 'recent_upload', label: 'Mới tải lên' },
  { id: 'recent_read', label: 'Mới đọc gần đây' },
  { id: 'volume_desc', label: 'Nhiều tập nhất' },
];

export interface LibraryFilterBarProps {
  searchQuery: string;
  statusFilter: LibraryStatusFilter;
  sortMode?: LibrarySortMode;
  isFiltering: boolean;
  filteredCount: number;
  totalCount: number;
  unitLabel?: string;
  searchPlaceholder?: string;
  hideSort?: boolean;
  showStorage?: boolean;
  storage?: StorageStats | null;
  selectionMode?: boolean;
  selectedCount?: number;
  unprotectedBookCount?: number;
  onProtectionClick?: () => void;
  onToggleSelectionMode?: () => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
  onSortChange?: (value: LibrarySortMode) => void;
  onClearFilters: () => void;
  advanced?: LibraryAdvancedFilterProps;
}

export function LibraryFilterBar({
  searchQuery,
  statusFilter,
  sortMode = 'title_asc',
  isFiltering,
  filteredCount,
  totalCount,
  unitLabel = 'cuốn',
  searchPlaceholder = 'Tìm theo tên sách, tác giả hoặc tên kệ...',
  hideSort = false,
  showStorage = false,
  storage = null,
  selectionMode = false,
  selectedCount = 0,
  unprotectedBookCount = 0,
  onProtectionClick,
  onToggleSelectionMode,
  onSearchChange,
  onStatusChange,
  onSortChange,
  onClearFilters,
  advanced,
}: LibraryFilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeAdvancedCount = advanced
    ? (advanced.authorFilter.trim() ? 1 : 0) +
      advanced.includedTags.length +
      advanced.excludedTags.length
    : 0;

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
        {/* Hàng ô tìm kiếm + nút Bảo mật / Chọn nhiều cho Admin trên điện thoại */}
        <div className="flex items-center gap-2 lg:max-w-md lg:flex-1">
          <div className="relative min-w-0 flex-1">
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

          {onProtectionClick && (
            <button
              type="button"
              onClick={onProtectionClick}
              aria-label="Bảo mật chế độ khách và truy vết rò rỉ"
              title={
                unprotectedBookCount > 0
                  ? `Còn ${unprotectedBookCount} sách chưa đồng bộ gói bảo mật khách`
                  : 'Bảo mật nội dung & Truy vết rò rỉ'
              }
              className="inline-flex h-[42px] shrink-0 items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink sm:hidden"
            >
              <Shield className="h-4 w-4 text-accent" />
              {unprotectedBookCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold leading-none tabular-nums text-amber-700 dark:text-amber-300">
                  {unprotectedBookCount}
                </span>
              )}
            </button>
          )}

          {onToggleSelectionMode && (
            <button
              type="button"
              onClick={onToggleSelectionMode}
              aria-pressed={selectionMode}
              aria-label={selectionMode ? 'Thoát chế độ chọn nhiều' : 'Chọn nhiều sách'}
              title={selectionMode ? 'Thoát chế độ chọn' : 'Chọn nhiều sách'}
              className={`inline-flex h-[42px] shrink-0 items-center justify-center gap-1 rounded-xl border px-3 transition-colors sm:hidden ${
                selectionMode
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode && selectedCount > 0 && (
                <span className="text-xs font-semibold leading-none tabular-nums">
                  {selectedCount}
                </span>
              )}
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

      {/* Hàng chips trạng thái đọc + nút Tìm kiếm nâng cao */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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

        {advanced && (
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              advancedOpen || activeAdvancedCount > 0
                ? 'border-crimson-accent/45 bg-crimson-accent/10 text-crimson-accent hover:bg-crimson-accent/15'
                : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
            }`}
          >
            <span>Tìm kiếm nâng cao</span>
            {activeAdvancedCount > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-crimson-accent px-1.5 text-[10px] font-semibold leading-none tabular-nums text-white">
                {activeAdvancedCount}
              </span>
            )}
            <span aria-hidden="true" className="text-[10px] leading-none opacity-80">
              {advancedOpen ? '▲' : '▼'}
            </span>
          </button>
        )}
      </div>

      {/* Dải chip bộ lọc & Panel Tìm kiếm nâng cao nạp lười (0 B ở entry bundle) */}
      {advanced && (advancedOpen || activeAdvancedCount > 0) && (
        <Suspense
          fallback={
            advancedOpen ? (
              <div className="rounded-2xl border border-line bg-surface p-4 text-xs text-ink-muted">
                Đang tải bảng thể loại...
              </div>
            ) : null
          }
        >
          <LazyAdvancedSearchPanel
            open={advancedOpen}
            authorFilter={advanced.authorFilter}
            includedTags={advanced.includedTags}
            excludedTags={advanced.excludedTags}
            tagMatchMode={advanced.tagMatchMode}
            availableAuthors={advanced.availableAuthors}
            allShelves={advanced.allShelves}
            shelfTags={advanced.shelfTags}
            statusFilter={statusFilter}
            sortMode={sortMode}
            hideSort={hideSort}
            onAuthorFilterChange={advanced.onAuthorFilterChange}
            onCycleTagFilter={advanced.onCycleTagFilter}
            onRemoveIncludedTag={advanced.onRemoveIncludedTag}
            onRemoveExcludedTag={advanced.onRemoveExcludedTag}
            onClearTagFilters={advanced.onClearTagFilters}
            onTagMatchModeChange={advanced.onTagMatchModeChange}
            onStatusChange={onStatusChange}
            onSortChange={onSortChange}
          />
        </Suspense>
      )}
    </section>
  );
}
