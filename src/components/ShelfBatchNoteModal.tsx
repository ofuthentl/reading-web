import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Save, Sparkles, X } from 'lucide-react';
import type { Book, ShelfGroup } from '@/types';
import { updateBookMetadata } from '@/lib/api';
import { getBookSortTitle } from '@/lib/bookMetadata';
import { extractBookAutoDescription } from '@/lib/epubSummaryExtractor';
import type { ToastType } from '@/hooks/useToast';

type BatchMode = 'shared' | 'per-volume';

export interface ShelfBatchNoteModalProps {
  shelf: ShelfGroup | null;
  onClose: () => void;
  onBooksUpdated: (books: Book[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfBatchNoteModal({
  shelf,
  onClose,
  onBooksUpdated,
  onApiError,
  onNotify,
}: ShelfBatchNoteModalProps) {
  const [mode, setMode] = useState<BatchMode>('shared');
  const [sharedText, setSharedText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showAllVolumes, setShowAllVolumes] = useState(false);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveDoneCount, setSaveDoneCount] = useState(0);
  const [saveTotalCount, setSaveTotalCount] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const missingBooks = useMemo(
    () => (shelf ? shelf.books.filter((b) => !b.description?.trim()) : []),
    [shelf],
  );

  useEffect(() => {
    if (!shelf) return;
    const firstExisting = shelf.books.find((b) => b.description?.trim())?.description?.trim() ?? '';
    setSharedText(firstExisting);
    setOverwriteExisting(shelf.books.every((b) => Boolean(b.description?.trim())));
    setShowAllVolumes(shelf.books.every((b) => Boolean(b.description?.trim())));
    const initialDrafts: Record<string, string> = {};
    for (const b of shelf.books) {
      initialDrafts[b.id] = b.description?.trim() ?? '';
    }
    setDraftById(initialDrafts);
    setMode('shared');
    setSaving(false);
    setExtracting(false);
  }, [shelf]);

  useEffect(() => {
    if (!shelf) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !extracting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [extracting, onClose, saving, shelf]);

  if (!shelf) return null;

  const targetSharedBooks = overwriteExisting ? shelf.books : missingBooks;
  const listedVolumes = showAllVolumes ? shelf.books : missingBooks;
  const hasEpubCandidates = shelf.books.some((b) => b.file_type === 'epub');

  const handleAutoExtractShared = async () => {
    if (extracting || saving) return;
    const epubBooks = shelf.books.filter((b) => b.file_type === 'epub');
    if (epubBooks.length === 0) {
      onNotify?.('Kệ này không có tệp EPUB để tự trích giới thiệu.', 'info');
      return;
    }
    setExtracting(true);
    try {
      for (const candidate of epubBooks.slice(0, 3)) {
        const extracted = await extractBookAutoDescription(candidate);
        if (extracted) {
          setSharedText(extracted);
          onNotify?.(`Đã trích nội dung giới thiệu từ "${getBookSortTitle(candidate)}".`, 'success');
          return;
        }
      }
      onNotify?.('Không tìm thấy mục giới thiệu/tóm tắt tự động trong tệp EPUB đầu bộ.', 'info');
    } catch {
      onNotify?.('Không thể đọc tệp EPUB để trích tóm tắt.', 'warning');
    } finally {
      setExtracting(false);
    }
  };

  const handleAutoExtractPerVolume = async () => {
    if (extracting || saving) return;
    const candidates = listedVolumes.filter(
      (b) => b.file_type === 'epub' && !draftById[b.id]?.trim(),
    );
    if (candidates.length === 0) {
      onNotify?.('Không có tập EPUB trống nào cần trích tự động.', 'info');
      return;
    }
    setExtracting(true);
    let filled = 0;
    const nextDrafts = { ...draftById };
    try {
      for (const book of candidates) {
        try {
          const text = await extractBookAutoDescription(book);
          if (text) {
            nextDrafts[book.id] = text;
            filled += 1;
          }
        } catch {
          // Bỏ qua tập lỗi lẻ để tiếp tục các tập còn lại
        }
      }
      setDraftById(nextDrafts);
      onNotify?.(
        filled > 0
          ? `Đã tự trích giới thiệu cho ${filled}/${candidates.length} tập EPUB.`
          : 'Các tệp EPUB này không nhúng sẵn thẻ tóm tắt tự động.',
        filled > 0 ? 'success' : 'info',
      );
    } finally {
      setExtracting(false);
    }
  };

  const runBatchPatch = async (jobs: Array<{ book: Book; description: string | null }>) => {
    if (jobs.length === 0) {
      onNotify?.('Không có tập nào cần cập nhật.', 'info');
      return;
    }
    setSaving(true);
    setSaveDoneCount(0);
    setSaveTotalCount(jobs.length);

    const updatedBooks: Book[] = [];
    let firstError: unknown = null;
    const CONCURRENCY = 4;

    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const slice = jobs.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map((job) => updateBookMetadata(job.book.id, { description: job.description })),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') {
          updatedBooks.push(res.value);
        } else if (!firstError) {
          firstError = res.reason;
        }
      }
      setSaveDoneCount(Math.min(jobs.length, i + slice.length));
    }

    setSaving(false);

    if (updatedBooks.length > 0) {
      onBooksUpdated(updatedBooks);
    }
    if (firstError) {
      onApiError?.(firstError, 'Một số tập chưa lưu được ghi chú.');
      if (updatedBooks.length > 0) {
        onNotify?.(`Đã lưu ${updatedBooks.length}/${jobs.length} tập trước khi gặp lỗi.`, 'warning');
      }
      return;
    }

    onNotify?.(`Đã cập nhật ghi chú cho ${updatedBooks.length} tập trong "${shelf.name}".`, 'success');
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || extracting) return;

    if (mode === 'shared') {
      const trimmed = sharedText.trim();
      if (!trimmed) {
        onNotify?.('Vui lòng nhập nội dung ghi chú / giới thiệu trước khi lưu.', 'warning');
        return;
      }
      const jobs = targetSharedBooks
        .filter((b) => (b.description?.trim() ?? '') !== trimmed)
        .map((book) => ({ book, description: trimmed }));
      void runBatchPatch(jobs);
      return;
    }

    const jobs = listedVolumes
      .map((book) => {
        const nextVal = (draftById[book.id] ?? '').trim();
        const prevVal = book.description?.trim() ?? '';
        if (nextVal === prevVal) return null;
        return { book, description: nextVal || null };
      })
      .filter((item): item is { book: Book; description: string | null } => item !== null);

    void runBatchPatch(jobs);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 !m-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-batch-note-title"
      onClick={() => {
        if (!saving && !extracting) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-crimson-accent">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="shelf-batch-note-title"
                className="truncate font-display text-lg font-semibold text-ink"
              >
                Thêm ghi chú cho bộ truyện
              </h2>
              <p className="truncate text-xs text-ink-muted">
                {shelf.name} · Còn{' '}
                <strong className="text-crimson-accent">{missingBooks.length}</strong> /{' '}
                {shelf.books.length} tập chưa có ghi chú
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || extracting}
            aria-label="Đóng cửa sổ"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chuyển chế độ */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/50 px-5 py-2.5">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1 text-xs">
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() => setMode('shared')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                mode === 'shared'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Ghi chú chung cả bộ
            </button>
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() => setMode('per-volume')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                mode === 'per-volume'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Điền riêng từng tập ({missingBooks.length} trống)
            </button>
          </div>

          {hasEpubCandidates && (
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() =>
                void (mode === 'shared' ? handleAutoExtractShared() : handleAutoExtractPerVolume())
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-crimson-accent" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-crimson-accent" />
              )}
              <span>{extracting ? 'Đang đọc EPUB...' : 'Tự trích từ EPUB'}</span>
            </button>
          )}
        </div>

        {/* Nội dung form */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
            {mode === 'shared' ? (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="shared-shelf-note"
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Nội dung giới thiệu / ghi chú áp dụng cho bộ truyện
                  </label>
                  <textarea
                    id="shared-shelf-note"
                    rows={6}
                    value={sharedText}
                    onChange={(e) => setSharedText(e.target.value)}
                    disabled={saving || extracting}
                    placeholder="Dán tóm tắt cốt truyện hoặc ghi chú chung cho các tập chưa có trong bộ này..."
                    className="w-full resize-y rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-canvas/70 px-3.5 py-2.5 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={!overwriteExisting}
                    disabled={saving || missingBooks.length === 0}
                    onChange={(e) => setOverwriteExisting(!e.target.checked)}
                    className="h-4 w-4 rounded accent-[#B22222]"
                  />
                  <span>
                    Chỉ điền vào <strong>{missingBooks.length} tập chưa có ghi chú</strong> (giữ
                    nguyên các tập đã viết riêng)
                  </span>
                </label>
              </>
            ) : (
              <div className="space-y-3.5">
                {missingBooks.length < shelf.books.length && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={showAllVolumes}
                      disabled={saving}
                      onChange={(e) => setShowAllVolumes(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-[#B22222]"
                    />
                    <span>Hiện cả các tập đã có ghi chú ({shelf.books.length} tập)</span>
                  </label>
                )}

                {listedVolumes.length === 0 ? (
                  <p className="rounded-xl border border-line bg-canvas px-4 py-6 text-center text-xs text-ink-muted">
                    Tất cả các tập trong kệ này đều đã có ghi chú. Tick tuỳ chọn bên trên nếu bạn
                    muốn chỉnh sửa lại.
                  </p>
                ) : (
                  listedVolumes.map((book) => (
                    <div
                      key={book.id}
                      className="space-y-1.5 rounded-xl border border-line bg-canvas/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`vol-note-${book.id}`}
                          className="truncate text-xs font-semibold text-ink"
                        >
                          {getBookSortTitle(book)}
                        </label>
                        <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] uppercase text-ink-muted">
                          {book.file_type}
                        </span>
                      </div>
                      <textarea
                        id={`vol-note-${book.id}`}
                        rows={2}
                        value={draftById[book.id] ?? ''}
                        onChange={(e) =>
                          setDraftById((prev) => ({ ...prev, [book.id]: e.target.value }))
                        }
                        disabled={saving || extracting}
                        placeholder="Nhập ghi chú / tóm tắt cho tập này..."
                        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {saving && saveTotalCount > 0 && (
              <div className="space-y-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Đang lưu đồng bộ lên thư viện...</span>
                  <span className="font-medium tabular-nums text-ink">
                    {saveDoneCount} / {saveTotalCount} tập
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-crimson-accent transition-all duration-200"
                    style={{ width: `${Math.round((saveDoneCount / saveTotalCount) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || extracting}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                extracting ||
                (mode === 'shared' && (!sharedText.trim() || targetSharedBooks.length === 0))
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>
                    {mode === 'shared'
                      ? `Lưu cho ${targetSharedBooks.length} tập`
                      : 'Lưu các tập đã nhập'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
