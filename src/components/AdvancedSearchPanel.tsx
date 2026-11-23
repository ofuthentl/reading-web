import { useId, useMemo, useState } from 'react';
import { Check, Minus, Search, UserRound, X } from 'lucide-react';
import type {
  LibrarySortMode,
  LibraryStatusFilter,
  ShelfGroup,
  TagFilterState,
  TagMatchMode,
} from '@/types';
import { buildTagCatalogWithCounts, toTagLookupKey } from '@/lib/shelfTagPresets';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';

const STATUS_OPTIONS: ReadonlyArray<{ id: LibraryStatusFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'reading', label: 'Đang đọc' },
  { id: 'plan_to_read', label: 'Đọc sau' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'completed', label: 'Hoàn thành' },
];

const SORT_OPTIONS: ReadonlyArray<{ id: LibrarySortMode; label: string }> = [
  { id: 'title_asc', label: 'Tên A → Z' },
  { id: 'recent_upload', label: 'Mới tải lên' },
  { id: 'recent_read', label: 'Mới đọc gần đây' },
  { id: 'volume_desc', label: 'Nhiều tập nhất' },
];

export interface AdvancedSearchPanelProps {
  open: boolean;
  authorFilter: string;
  includedTags: readonly string[];
  excludedTags: readonly string[];
  tagMatchMode: TagMatchMode;
  availableAuthors: readonly string[];
  allShelves: readonly ShelfGroup[];
  shelfTags?: Readonly<Record<string, string[]>>;
  statusFilter: LibraryStatusFilter;
  sortMode?: LibrarySortMode;
  hideSort?: boolean;
  onAuthorFilterChange: (value: string) => void;
  onCycleTagFilter: (tag: string) => void;
  onRemoveIncludedTag: (tag: string) => void;
  onRemoveExcludedTag: (tag: string) => void;
  onClearTagFilters: () => void;
  onTagMatchModeChange: (mode: TagMatchMode) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
  onSortChange?: (value: LibrarySortMode) => void;
}

export function AdvancedSearchPanel({
  open,
  authorFilter,
  includedTags,
  excludedTags,
  tagMatchMode,
  availableAuthors,
  allShelves,
  shelfTags,
  statusFilter,
  sortMode = 'title_asc',
  hideSort = false,
  onAuthorFilterChange,
  onCycleTagFilter,
  onRemoveIncludedTag,
  onRemoveExcludedTag,
  onClearTagFilters,
  onTagMatchModeChange,
  onStatusChange,
  onSortChange,
}: AdvancedSearchPanelProps) {
  const authorDatalistId = useId();
  const [genreSearch, setGenreSearch] = useState('');

  const includedKeys = useMemo(
    () => new Set(includedTags.map(toTagLookupKey)),
    [includedTags],
  );
  const excludedKeys = useMemo(
    () => new Set(excludedTags.map(toTagLookupKey)),
    [excludedTags],
  );

  const catalog = useMemo(
    () => buildTagCatalogWithCounts(allShelves, shelfTags),
    [allShelves, shelfTags],
  );

  const normalizedGenreQuery = useMemo(() => normalizeSearchText(genreSearch), [genreSearch]);
  const visibleGenres = useMemo(() => {
    if (!normalizedGenreQuery) return catalog;
    return catalog.filter((item) => normalizeSearchText(item.label).includes(normalizedGenreQuery));
  }, [catalog, normalizedGenreQuery]);

  const activeTagCount = includedTags.length + excludedTags.length;
  const hasActiveChips = Boolean(authorFilter.trim()) || activeTagCount > 0;

  return (
    <div className="space-y-3">
      {/* Dải chip bộ lọc nâng cao đang bật (Tác giả, ✓ Thể loại, − Loại trừ) */}
      {hasActiveChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {authorFilter.trim() && (
            <button
              type="button"
              onClick={() => onAuthorFilterChange('')}
              title="Bỏ lọc theo tác giả này"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-accent/20"
            >
              <UserRound className="h-3 w-3 text-accent" />
              <span>Tác giả: {authorFilter.trim()}</span>
              <X className="h-3 w-3 text-ink-muted" />
            </button>
          )}

          {includedTags.map((tag) => (
            <button
              key={`inc-${tag}`}
              type="button"
              onClick={() => onRemoveIncludedTag(tag)}
              title={`Bỏ lọc thể loại ${tag}`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-600/20 dark:border-emerald-400/40 dark:text-emerald-300"
            >
              <Check className="h-3 w-3" />
              <span>{tag}</span>
              <X className="h-3 w-3 opacity-75" />
            </button>
          ))}

          {excludedTags.map((tag) => (
            <button
              key={`exc-${tag}`}
              type="button"
              onClick={() => onRemoveExcludedTag(tag)}
              title={`Bỏ loại trừ thể loại ${tag}`}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-600/40 bg-rose-600/10 px-2.5 py-1 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-600/20 dark:border-rose-400/40 dark:text-rose-300"
            >
              <Minus className="h-3 w-3" />
              <span>Loại trừ: {tag}</span>
              <X className="h-3 w-3 opacity-75" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="moonlit-card fade-in space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/70">
      {/* Hàng 1: Tác giả, Trạng thái đọc, Sắp xếp (không có Loại truyện) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <label
            htmlFor={`${authorDatalistId}-input`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink"
          >
            <UserRound className="h-3.5 w-3.5 text-accent" />
            <span>Tác giả</span>
          </label>
          <div className="relative">
            <input
              id={`${authorDatalistId}-input`}
              type="text"
              list={authorDatalistId}
              value={authorFilter}
              onChange={(event) => onAuthorFilterChange(event.target.value)}
              placeholder="Có thể bỏ trống..."
              className="w-full rounded-xl border border-line bg-canvas py-2 pl-3 pr-8 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
            />
            {authorFilter && (
              <button
                type="button"
                onClick={() => onAuthorFilterChange('')}
                aria-label="Xoá lọc tác giả"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <datalist id={authorDatalistId}>
              {availableAuthors.map((author) => (
                <option key={author} value={author} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`${authorDatalistId}-status`}
            className="block text-xs font-semibold text-ink"
          >
            Trạng thái đọc
          </label>
          <select
            id={`${authorDatalistId}-status`}
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value as LibraryStatusFilter)}
            className="w-full cursor-pointer rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-surface text-ink">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {!hideSort && onSortChange && (
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <label
              htmlFor={`${authorDatalistId}-sort`}
              className="block text-xs font-semibold text-ink"
            >
              Sắp xếp
            </label>
            <select
              id={`${authorDatalistId}-sort`}
              value={sortMode}
              onChange={(event) => onSortChange(event.target.value as LibrarySortMode)}
              className="w-full cursor-pointer rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-surface text-ink">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Hàng 2: Lưới Thể loại 3 trạng thái (Bỏ qua / Phải có ✓ / Loại trừ ✕) */}
      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">Thể loại</h3>
              {activeTagCount > 0 && (
                <button
                  type="button"
                  onClick={onClearTagFilters}
                  className="rounded-lg border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-crimson-accent transition-colors hover:border-line-strong hover:bg-subtle"
                >
                  Xoá chọn ({activeTagCount})
                </button>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border border-line-strong bg-canvas" />
                Bỏ qua
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <span className="inline-flex h-3 w-3 items-center justify-center rounded bg-emerald-600 text-white">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </span>
                Bấm 1 lần: Phải có
              </span>
              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                <span className="inline-flex h-3 w-3 items-center justify-center rounded bg-rose-600 text-white">
                  <Minus className="h-2.5 w-2.5 stroke-[3]" />
                </span>
                Bấm 2 lần: Loại trừ
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chuyển chế độ khớp AND / OR cho các thể loại Phải có */}
            <div
              role="group"
              aria-label="Chế độ khớp nhiều thể loại"
              className="inline-flex rounded-xl border border-line bg-canvas p-0.5 text-[11px]"
            >
              <button
                type="button"
                aria-pressed={tagMatchMode === 'all'}
                onClick={() => onTagMatchModeChange('all')}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  tagMatchMode === 'all'
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Đủ tất cả
              </button>
              <button
                type="button"
                aria-pressed={tagMatchMode === 'any'}
                onClick={() => onTagMatchModeChange('any')}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  tagMatchMode === 'any'
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Bất kỳ
              </button>
            </div>

            <div className="relative min-w-[175px] flex-1 sm:w-48 sm:flex-initial">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={genreSearch}
                onChange={(event) => setGenreSearch(event.target.value)}
                placeholder="Lọc tên thể loại..."
                aria-label="Lọc nhanh tên thể loại"
                className="w-full rounded-xl border border-line bg-canvas py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
              />
              {genreSearch && (
                <button
                  type="button"
                  onClick={() => setGenreSearch('')}
                  aria-label="Xoá từ khoá lọc tên thể loại"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lưới checkbox responsive: 2 cột trên mobile chống cắt chữ, 3 cột tablet, 4 cột PC */}
        {visibleGenres.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-muted">
            Không có thể loại nào khớp &ldquo;{genreSearch}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
            {visibleGenres.map((item) => {
              const state: TagFilterState = includedKeys.has(item.key)
                ? 'include'
                : excludedKeys.has(item.key)
                  ? 'exclude'
                  : 'none';
              const isDimmed = state === 'none' && item.count === 0;

              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={state !== 'none'}
                  onClick={() => onCycleTagFilter(item.label)}
                  title={
                    state === 'include'
                      ? `${item.label}: Phải có (bấm để chuyển sang Loại trừ)`
                      : state === 'exclude'
                        ? `${item.label}: Loại trừ (bấm để bỏ chọn)`
                        : `${item.label}${item.count > 0 ? ` (${item.count} bộ)` : ' (chưa có bộ nào)'}`
                  }
                  className={`flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs leading-snug transition-colors ${
                    state === 'include'
                      ? 'border-emerald-600/50 bg-emerald-600/10 font-medium text-ink dark:border-emerald-400/50'
                      : state === 'exclude'
                        ? 'border-rose-600/50 bg-rose-600/10 font-medium text-rose-800 line-through decoration-rose-500/70 dark:border-rose-400/50 dark:text-rose-200'
                        : isDimmed
                          ? 'border-line/80 bg-canvas/45 text-ink-muted opacity-75 hover:border-line-strong hover:opacity-100'
                          : 'border-line bg-canvas/80 text-ink hover:border-line-strong hover:bg-subtle'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      state === 'include'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : state === 'exclude'
                          ? 'border-rose-600 bg-rose-600 text-white'
                          : 'border-line-strong bg-surface'
                    }`}
                  >
                    {state === 'include' && <Check className="h-3 w-3 stroke-[2.75]" />}
                    {state === 'exclude' && <Minus className="h-3 w-3 stroke-[2.75]" />}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {item.label}
                    {item.count > 0 && (
                      <span className="ml-1 text-[11px] font-normal tabular-nums text-ink-faint">
                        ({item.count})
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
