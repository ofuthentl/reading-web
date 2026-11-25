import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Filter,
  RefreshCw,
  Search,
  Square,
  X,
} from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import { formatBytes, isCloudMode } from '@/lib/api';
import { getBookSortTitle } from '@/lib/bookMetadata';
import {
  type GuestPackBatchProgress,
  createGuestPackSyncController,
  runAdaptiveGuestPackSync,
} from '@/lib/guestPackBatchSync';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import { toShelfPrefKey } from '@/lib/shelfPrefs';
import type { ToastType } from '@/hooks/useToast';

type PackFilterMode = 'all' | 'missing' | 'ready';
const LIST_PAGE_SIZE = 30;

export interface AdminProtectionSyncTabProps {
  eligibleBooks: Book[];
  missingBooks: Book[];
  readyCount: number;
  initialShelfKey?: string;
  initialBookId?: string;
  syncing: boolean;
  onSyncingChange: (syncing: boolean) => void;
  onBookPackSynced: (bookId: string, storage?: StorageStats) => void;
  onStorageSynced?: (storage: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function AdminProtectionSyncTab({
  eligibleBooks,
  missingBooks,
  readyCount,
  initialShelfKey,
  initialBookId,
  syncing,
  onSyncingChange,
  onBookPackSynced,
  onStorageSynced,
  onApiError,
  onNotify,
}: AdminProtectionSyncTabProps) {
  const [shelfFilter, setShelfFilter] = useState<string>(initialShelfKey || 'all');
  const [statusFilter, setStatusFilter] = useState<PackFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialBookId ? new Set([initialBookId]) : new Set(),
  );
  const [visibleLimit, setVisibleLimit] = useState(LIST_PAGE_SIZE);
  const [syncProgress, setSyncProgress] = useState<GuestPackBatchProgress | null>(null);

  const mountedRef = useRef(true);
  const controllerRef = useRef<ReturnType<typeof createGuestPackSyncController> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (initialBookId) {
      const target = eligibleBooks.find((b) => b.id === initialBookId);
      setShelfFilter(target ? toShelfPrefKey(target.shelf) : initialShelfKey || 'all');
      setStatusFilter('all');
      setSelectedIds(new Set([initialBookId]));
    } else if (initialShelfKey) {
      setShelfFilter(initialShelfKey);
      setStatusFilter('all');
      setSelectedIds(new Set());
    }
  }, [eligibleBooks, initialBookId, initialShelfKey]);

  const shelfOptions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; total: number; missing: number }>();
    for (const book of eligibleBooks) {
      const name = book.shelf?.trim() || 'Kho chưa phân loại';
      const key = toShelfPrefKey(name);
      const entry = map.get(key) ?? { key, name, total: 0, missing: 0 };
      entry.total += 1;
      if (!book.guest_ready) entry.missing += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [eligibleBooks]);

  const filteredBooks = useMemo(() => {
    const normQuery = normalizeSearchText(searchQuery);
    return eligibleBooks.filter((book) => {
      if (shelfFilter !== 'all' && toShelfPrefKey(book.shelf) !== shelfFilter) return false;
      if (statusFilter === 'missing' && book.guest_ready) return false;
      if (statusFilter === 'ready' && !book.guest_ready) return false;
      if (!normQuery) return true;
      const haystack = normalizeSearchText(`${getBookSortTitle(book)} ${book.shelf} ${book.author}`);
      return haystack.includes(normQuery);
    });
  }, [eligibleBooks, searchQuery, shelfFilter, statusFilter]);

  const selectedBooks = useMemo(
    () => eligibleBooks.filter((b) => selectedIds.has(b.id)),
    [eligibleBooks, selectedIds],
  );

  const filteredSelectedCount = useMemo(
    () => filteredBooks.reduce((acc, b) => acc + (selectedIds.has(b.id) ? 1 : 0), 0),
    [filteredBooks, selectedIds],
  );

  const toggleBookSelection = (bookId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filteredSelectedCount === filteredBooks.length) {
        for (const b of filteredBooks) next.delete(b.id);
      } else {
        for (const b of filteredBooks) next.add(b.id);
      }
      return next;
    });
  };

  const handleRunSync = async (targets: Book[]) => {
    if (targets.length === 0 || syncing) return;
    if (!isCloudMode) {
      onNotify('Đồng bộ gói bảo mật chỉ hoạt động khi kết nối Cloudflare Worker.', 'info');
      return;
    }

    const syncController = createGuestPackSyncController();
    controllerRef.current = syncController;
    onSyncingChange(true);
    setSyncProgress({
      done: 0,
      total: targets.length,
      successCount: 0,
      failCount: 0,
      activeTitles: [targets[0].title],
    });

    try {
      const result = await runAdaptiveGuestPackSync({
        targets,
        controller: syncController,
        onProgress: (progress) => {
          if (mountedRef.current) setSyncProgress(progress);
        },
        onBookSynced: (bookId, storage) => {
          onBookPackSynced(bookId, storage);
          if (mountedRef.current) {
            setSelectedIds((prev) => {
              if (!prev.has(bookId)) return prev;
              const next = new Set(prev);
              next.delete(bookId);
              return next;
            });
          }
        },
        onStorageSynced,
      });

      if (result.authError) {
        onApiError(result.authError, 'Phiên quản trị đã hết hạn.');
        return;
      }
      if (!mountedRef.current) return;

      if (result.stopped) {
        onNotify(
          result.successCount > 0
            ? `Đã dừng đồng bộ — đã lưu thành công ${result.successCount}/${targets.length} sách vào kho.`
            : 'Đã dừng đồng bộ gói bảo mật.',
          result.successCount > 0 ? 'info' : 'info',
        );
      } else if (result.successCount > 0) {
        onNotify(
          result.failCount > 0
            ? `Đã đồng bộ gói khách cho ${result.successCount} sách (${result.failCount} sách lỗi).`
            : `Đã đồng bộ gói bảo mật khách cho ${result.successCount} sách!`,
          result.failCount > 0 ? 'warning' : 'success',
        );
      } else if (result.failCount > 0) {
        onNotify('Không thể đồng bộ gói bảo mật. Vui lòng thử lại.', 'error');
      }
    } finally {
      if (controllerRef.current === syncController) controllerRef.current = null;
      if (mountedRef.current) {
        onSyncingChange(false);
        setSyncProgress(null);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-canvas p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              Đã chuẩn hoá {readyCount} / {eligibleBooks.length} sách EPUB &amp; DOCX
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Hỗ trợ đồng bộ chọn lọc theo bộ truyện hoặc từng cuốn (chạy song song 2 luồng cho tệp
              &le; 40 MB, tự hạ 1 luồng cho tệp lớn).
            </p>
          </div>
          {missingBooks.length === 0 && eligibleBooks.length > 0 && (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
          )}
        </div>

        {syncProgress && (
          <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {syncProgress.activeTitles.join(' · ') || 'Đang hoàn tất...'}
                {syncProgress.stepLabel ? ` — ${syncProgress.stepLabel}` : ''}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                {syncProgress.done} / {syncProgress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${Math.round((syncProgress.done / Math.max(1, syncProgress.total)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {syncing ? (
            <button
              type="button"
              onClick={() => controllerRef.current?.stop()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-300"
            >
              <Square className="h-3.5 w-3.5" />
              Dừng đồng bộ
            </button>
          ) : (
            <>
              {selectedBooks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRunSync(selectedBooks)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Đồng bộ {selectedBooks.length} sách đã chọn
                </button>
              )}
              {missingBooks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRunSync(missingBooks)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                    selectedBooks.length > 0
                      ? 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle'
                      : 'bg-accent text-accent-foreground hover:bg-accent-hover'
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Đồng bộ {missingBooks.length} sách chưa có gói
                </button>
              )}
              {shelfFilter !== 'all' && filteredBooks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRunSync(filteredBooks)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-line-strong hover:bg-subtle"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-accent" />
                  Tạo lại cả bộ đang lọc ({filteredBooks.length})
                </button>
              )}
              {eligibleBooks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRunSync(eligibleBooks)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tạo lại toàn bộ ({eligibleBooks.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bộ lọc chọn lọc theo Bộ truyện hoặc từng cuốn */}
      {eligibleBooks.length > 0 && (
        <div className="space-y-2.5 rounded-xl border border-line bg-canvas/70 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                disabled={syncing}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLimit(LIST_PAGE_SIZE);
                }}
                placeholder="Tìm bộ truyện hoặc tập cần đồng bộ..."
                className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent disabled:opacity-50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xoá từ khoá tìm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-ink-muted" />
              <select
                aria-label="Lọc theo bộ truyện"
                value={shelfFilter}
                disabled={syncing}
                onChange={(e) => {
                  setShelfFilter(e.target.value);
                  setVisibleLimit(LIST_PAGE_SIZE);
                }}
                className="max-w-[210px] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
              >
                <option value="all">Tất cả bộ truyện ({shelfOptions.length})</option>
                {shelfOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name} ({s.total}{s.missing > 0 ? ` · thiếu ${s.missing}` : ''})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              {(
                [
                  ['all', 'Tất cả'],
                  ['missing', `Thiếu gói (${missingBooks.length})`],
                  ['ready', `Đã có gói (${readyCount})`],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={syncing}
                  onClick={() => {
                    setStatusFilter(mode);
                    setVisibleLimit(LIST_PAGE_SIZE);
                  }}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    statusFilter === mode
                      ? 'bg-accent text-accent-foreground'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncing || filteredBooks.length === 0}
                onClick={toggleAllFiltered}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 font-medium text-ink transition hover:bg-subtle disabled:opacity-45"
              >
                <CheckSquare className="h-3 w-3 text-accent" />
                <span>
                  {filteredSelectedCount === filteredBooks.length && filteredBooks.length > 0
                    ? `Bỏ chọn (${filteredBooks.length})`
                    : `Chọn danh sách lọc (${filteredBooks.length})`}
                </span>
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => setSelectedIds(new Set())}
                  className="text-ink-muted hover:text-ink disabled:opacity-45"
                >
                  Xoá chọn ({selectedIds.size})
                </button>
              )}
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <p className="py-5 text-center text-xs text-ink-muted">
              Không có cuốn sách nào khớp bộ lọc hiện tại.
            </p>
          ) : (
            <>
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface text-xs scrollbar-thin">
                {filteredBooks.slice(0, visibleLimit).map((book) => {
                  const checked = selectedIds.has(book.id);
                  return (
                    <li key={book.id} className="px-3 py-2">
                      <label className="flex cursor-pointer items-center justify-between gap-2.5">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={syncing}
                            onChange={() => toggleBookSelection(book.id)}
                            className="h-3.5 w-3.5 shrink-0 rounded border-line accent-accent"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {getBookSortTitle(book)}
                            </p>
                            <p className="truncate text-[10px] text-ink-muted">
                              {book.shelf || 'Kho chưa phân loại'} · {book.file_type.toUpperCase()}{' '}
                              · {formatBytes(book.file_size || 0)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            book.guest_ready
                              ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {book.guest_ready ? 'Đã có gói' : 'Chưa có gói'}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {filteredBooks.length > visibleLimit && (
                <div className="flex justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + LIST_PAGE_SIZE)}
                    className="rounded-lg border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink hover:bg-subtle"
                  >
                    Xem thêm ({filteredBooks.length - visibleLimit} cuốn còn lại)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(filteredBooks.length)}
                    className="rounded-lg border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink-muted hover:text-ink"
                  >
                    Hiện tất cả ({filteredBooks.length})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
