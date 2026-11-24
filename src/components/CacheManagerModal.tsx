import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BookOpen,
  Database,
  Image,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Book } from '@/types';
import { formatBytes, isCloudMode } from '@/lib/api';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { getBookSortTitle } from '@/lib/bookMetadata';
import {
  type IndexedDbCacheSummary,
  clearAllMediaCache,
  clearCachedBookBlobs,
  clearCachedCoverBlobs,
  deleteCachedBookBlob,
  inspectIndexedDbCache,
} from '@/lib/cache';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type { ToastType } from '@/hooks/useToast';

export interface CacheManagerModalProps {
  open: boolean;
  books: readonly Book[];
  onClose: () => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function CacheManagerModal({
  open,
  books,
  onClose,
  onNotify,
}: CacheManagerModalProps) {
  const [summary, setSummary] = useState<IndexedDbCacheSummary | null>(null);
  const [deviceQuotaBytes, setDeviceQuotaBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refreshStats = useCallback(async () => {
    setLoading(true);
    try {
      const [cacheReport, estimate] = await Promise.all([
        inspectIndexedDbCache(),
        typeof navigator !== 'undefined' && navigator.storage?.estimate
          ? navigator.storage.estimate().catch(() => null)
          : Promise.resolve(null),
      ]);
      setSummary(cacheReport);
      setDeviceQuotaBytes(
        estimate && typeof estimate.quota === 'number' && estimate.quota > 0
          ? estimate.quota
          : null,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    void refreshStats();
  }, [open, refreshStats]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyAction) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busyAction, onClose, open]);

  const bookByFileKey = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) {
      if (b.file_key) map.set(b.file_key, b);
    }
    return map;
  }, [books]);

  const coverSizeByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of summary?.coverEntries ?? []) {
      map.set(entry.key, entry.sizeBytes);
    }
    return map;
  }, [summary]);

  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);

  const visibleBookEntries = useMemo(() => {
    const list = summary?.bookEntries ?? [];
    if (!normalizedQuery) return list;
    return list.filter((entry) => {
      const matched = bookByFileKey.get(entry.key);
      const label = matched
        ? `${getBookSortTitle(matched)} ${matched.shelf} ${matched.author}`
        : entry.key;
      return normalizeSearchText(label).includes(normalizedQuery);
    });
  }, [bookByFileKey, normalizedQuery, summary]);

  if (!open) return null;

  const handleRemoveSingleBook = async (fileKey: string, titleLabel: string) => {
    if (busyAction) return;
    if (!isCloudMode && bookByFileKey.has(fileKey)) {
      onNotify?.(
        'Chế độ Local Dev: tệp trong IndexedDB là bản gốc duy nhất, hãy dùng nút Xoá sách trên kệ.',
        'warning',
      );
      return;
    }
    setBusyAction(fileKey);
    try {
      await deleteCachedBookBlob(fileKey);
      await refreshStats();
      onNotify?.(`Đã xoá tệp đệm của "${titleLabel}" khỏi thiết bị.`, 'info');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearBooksOnly = async () => {
    if (!isCloudMode) return;
    if (busyAction || !summary || summary.bookEntries.length === 0) return;
    setBusyAction('clear-books');
    try {
      const freed = summary.totalBookBytes;
      await clearCachedBookBlobs();
      await refreshStats();
      onNotify?.(`Đã giải phóng ${formatBytes(freed)} tệp sách đệm (giữ nguyên ảnh bìa).`, 'success');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearCoversOnly = async () => {
    if (!isCloudMode) return;
    if (busyAction || !summary || summary.coverEntries.length === 0) return;
    setBusyAction('clear-covers');
    try {
      const freed = summary.totalCoverBytes;
      await clearCachedCoverBlobs();
      await refreshStats();
      onNotify?.(`Đã dọn ${formatBytes(freed)} ảnh bìa trong bộ nhớ đệm.`, 'info');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearAllCache = async () => {
    if (!isCloudMode) return;
    if (busyAction || !summary || summary.totalBytes === 0) return;
    setBusyAction('clear-all');
    try {
      const freed = summary.totalBytes;
      await clearAllMediaCache();
      await refreshStats();
      onNotify?.(
        `Đã dọn sạch toàn bộ ${formatBytes(freed)} bộ nhớ đệm IndexedDB (không ảnh hưởng dữ liệu trên R2/D1).`,
        'success',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const totalBytes = summary?.totalBytes ?? 0;
  const totalBookBytes = summary?.totalBookBytes ?? 0;
  const totalCoverBytes = summary?.totalCoverBytes ?? 0;
  const bookEntryCount = summary?.bookEntries.length ?? 0;
  const coverEntryCount = summary?.coverEntries.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 !m-0 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cache-manager-modal-title"
      onClick={() => {
        if (!busyAction) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="cache-manager-modal-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Quản lý Bộ nhớ đệm Thiết bị (IndexedDB)
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Dọn tệp sách &amp; ảnh bìa đã lưu tạm trên trình duyệt này (an toàn 100%, không xoá
                sách gốc trên kho R2).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={loading || Boolean(busyAction)}
              onClick={() => void refreshStats()}
              aria-label="Làm mới thống kê bộ nhớ đệm"
              title="Quét lại IndexedDB"
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={onClose}
              aria-label="Đóng cửa sổ quản lý cache"
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Cảnh báo chế độ Local Dev */}
        {!isCloudMode && (
          <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Đang chạy chế độ <strong>Local Dev</strong>: tệp sách &amp; ảnh bìa trong IndexedDB là{' '}
              <strong>bản gốc duy nhất</strong> (không có R2). Nút dọn hàng loạt đã được khoá an toàn;
              chỉ cho phép xoá các tệp mồ côi.
            </p>
          </div>
        )}

        {/* Tổng quan 3 thẻ dung lượng */}
        <div className="grid grid-cols-3 gap-2.5 border-b border-line bg-canvas/50 px-5 py-3.5">
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-[11px] text-ink-muted">Tổng bộ nhớ đệm</p>
            <p className="mt-1 font-display text-base font-bold tabular-nums text-ink sm:text-lg">
              {formatBytes(totalBytes)}
            </p>
            {deviceQuotaBytes && (
              <p className="mt-0.5 truncate text-[10px] text-ink-faint">
                Hạn mức trình duyệt ~{formatBytes(deviceQuotaBytes)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
              <BookOpen className="h-3 w-3 text-accent" />
              <span>Tệp sách ({bookEntryCount})</span>
            </p>
            <p className="mt-1 font-display text-base font-bold tabular-nums text-ink sm:text-lg">
              {formatBytes(totalBookBytes)}
            </p>
            <button
              type="button"
              disabled={!isCloudMode || Boolean(busyAction) || bookEntryCount === 0}
              onClick={() => void handleClearBooksOnly()}
              className="mt-1 text-[11px] font-medium text-crimson-accent hover:underline disabled:opacity-40"
            >
              Dọn tệp sách
            </button>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
              <Image className="h-3 w-3 text-accent" />
              <span>Ảnh bìa ({coverEntryCount})</span>
            </p>
            <p className="mt-1 font-display text-base font-bold tabular-nums text-ink sm:text-lg">
              {formatBytes(totalCoverBytes)}
            </p>
            <button
              type="button"
              disabled={!isCloudMode || Boolean(busyAction) || coverEntryCount === 0}
              onClick={() => void handleClearCoversOnly()}
              className="mt-1 text-[11px] font-medium text-crimson-accent hover:underline disabled:opacity-40"
            >
              Dọn ảnh bìa
            </button>
          </div>
        </div>

        {/* Danh sách chi tiết từng cuốn sách trong cache */}
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {bookEntryCount >= 5 && (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm nhanh cuốn sách đang lưu trong bộ nhớ đệm..."
                className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-8 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Xoá lọc"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
            {loading && !summary ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>Đang thống kê dung lượng từng tệp trong IndexedDB...</span>
              </div>
            ) : bookEntryCount === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-canvas/60 px-4 py-8 text-center">
                <p className="text-sm font-medium text-ink">Chưa có tệp sách nào lưu đệm</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Khi bạn mở đọc một cuốn sách, tệp EPUB/DOCX sẽ tự lưu vào đây để lần mở sau đạt
                  tốc độ 0ms.
                </p>
              </div>
            ) : visibleBookEntries.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-muted">
                Không có tệp đệm nào khớp từ khoá &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                {visibleBookEntries.map((entry) => {
                  const matchedBook = bookByFileKey.get(entry.key) ?? null;
                  const titleLabel = matchedBook
                    ? getBookSortTitle(matchedBook)
                    : `Tệp cũ (${entry.key})`;
                  const coverBytes =
                    matchedBook?.cover_key ? (coverSizeByKey.get(matchedBook.cover_key) ?? 0) : 0;
                  const isDeleting = busyAction === entry.key;

                  return (
                    <li
                      key={entry.key}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{titleLabel}</p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {matchedBook ? (
                            <>
                              <span>{matchedBook.shelf}</span>
                              <span> · {matchedBook.file_type.toUpperCase()}</span>
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">
                              Tệp mồ côi (sách đã đổi hoặc xoá khỏi kệ)
                            </span>
                          )}
                          {coverBytes > 0 && (
                            <span className="text-ink-faint">
                              {' '}
                              · Bìa đệm {formatBytes(coverBytes)}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="font-semibold tabular-nums text-ink">
                          {formatBytes(entry.sizeBytes)}
                        </span>
                        <button
                          type="button"
                          disabled={Boolean(busyAction) || (!isCloudMode && Boolean(matchedBook))}
                          onClick={() => void handleRemoveSingleBook(entry.key, titleLabel)}
                          aria-label={`Xoá bộ nhớ đệm của ${titleLabel}`}
                          title={
                            !isCloudMode && matchedBook
                              ? 'Local Dev: tệp sách gốc đang gắn trên kệ'
                              : 'Xoá lẻ tệp sách này khỏi bộ nhớ đệm'
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-300"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          <span>Xoá</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <button
            type="button"
            disabled={!isCloudMode || Boolean(busyAction) || totalBytes === 0}
            onClick={() => void handleClearAllCache()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-600/35 bg-rose-600/10 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-600/20 disabled:opacity-40 dark:border-rose-400/35 dark:text-rose-300"
          >
            {busyAction === 'clear-all' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span>Dọn sạch cache 1 chạm ({formatBytes(totalBytes)})</span>
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-45"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
