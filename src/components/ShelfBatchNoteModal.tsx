import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Save, Sparkles, UserPen, X } from 'lucide-react';
import type { Book, ShelfGroup } from '@/types';
import {
  type ShelfBatchMode,
  ShelfBatchNoteFields,
} from '@/components/ShelfBatchNoteFields';
import { updateBookMetadata } from '@/lib/api';
import {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  getBookSortTitle,
  getDisplayAuthor,
} from '@/lib/bookMetadata';
import {
  extractBookAutoAuthor,
  extractBookAutoDescription,
} from '@/lib/epubSummaryExtractor';
import type { ToastType } from '@/hooks/useToast';

type BatchJob = {
  book: Book;
  patch: Partial<Pick<Book, 'title' | 'author' | 'description'>>;
};

const UNKNOWN_AUTHOR_LABEL = 'Không rõ tác giả';

function isUniqueSubtitleInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): boolean {
  const cleanAuth = book.author.trim();
  if (!cleanAuth || cleanAuth === UNKNOWN_AUTHOR_LABEL) return false;
  if (getDisplayAuthor(book.author, book.title) === UNKNOWN_AUTHOR_LABEL) return true;
  if (!shelf || shelf.books.length < 2) return false;
  if (!TITLE_ENDS_WITH_BARE_VOL_RE.test(book.title.trim())) return false;
  return (rawAuthorCounts.get(cleanAuth.toLocaleLowerCase('vi')) ?? 0) === 1;
}

function getEffectiveAuthorInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): string {
  return isUniqueSubtitleInShelf(book, shelf, rawAuthorCounts)
    ? UNKNOWN_AUTHOR_LABEL
    : getDisplayAuthor(book.author, book.title);
}

function getHealedTitleInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): string {
  const sorted = getBookSortTitle(book);
  if (sorted !== book.title.trim()) return sorted;
  if (isUniqueSubtitleInShelf(book, shelf, rawAuthorCounts)) {
    return `${book.title.trim()} - ${book.author.trim()}`;
  }
  return book.title;
}

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
  const [mode, setMode] = useState<ShelfBatchMode>('shared');
  const [sharedText, setSharedText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showAllVolumes, setShowAllVolumes] = useState(false);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [authorInput, setAuthorInput] = useState('');
  const [onlyMissingAuthor, setOnlyMissingAuthor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDoneCount, setSaveDoneCount] = useState(0);
  const [saveTotalCount, setSaveTotalCount] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const missingBooks = useMemo(
    () => (shelf ? shelf.books.filter((b) => !b.description?.trim()) : []),
    [shelf],
  );

  const rawAuthorCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!shelf) return map;
    for (const b of shelf.books) {
      const k = b.author.trim().toLocaleLowerCase('vi');
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [shelf]);

  const missingAuthorBooks = useMemo(
    () =>
      shelf
        ? shelf.books.filter(
            (b) => getEffectiveAuthorInShelf(b, shelf, rawAuthorCounts) === UNKNOWN_AUTHOR_LABEL,
          )
        : [],
    [shelf, rawAuthorCounts],
  );

  const knownAuthorsInShelf = useMemo(() => {
    if (!shelf) return [];
    const set = new Set<string>();
    for (const b of shelf.books) {
      const clean = getEffectiveAuthorInShelf(b, shelf, rawAuthorCounts);
      if (clean && clean !== UNKNOWN_AUTHOR_LABEL) set.add(clean);
    }
    return Array.from(set);
  }, [shelf, rawAuthorCounts]);

  useEffect(() => {
    if (!shelf) return;
    const firstExisting = shelf.books.find((b) => b.description?.trim())?.description?.trim() ?? '';
    const allHaveDesc = shelf.books.every((b) => Boolean(b.description?.trim()));
    setSharedText(firstExisting);
    setOverwriteExisting(allHaveDesc);
    setShowAllVolumes(allHaveDesc);

    const initialDrafts: Record<string, string> = {};
    for (const b of shelf.books) initialDrafts[b.id] = b.description?.trim() ?? '';
    setDraftById(initialDrafts);

    const firstKnownAuthor =
      shelf.books
        .map((b) => getEffectiveAuthorInShelf(b, shelf, rawAuthorCounts))
        .find((a) => a !== UNKNOWN_AUTHOR_LABEL) ?? '';
    setAuthorInput(firstKnownAuthor);
    setOnlyMissingAuthor(false);
    setMode('shared');
    setSaving(false);
    setExtracting(false);
  }, [shelf, rawAuthorCounts]);

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
  const targetAuthorBooks = onlyMissingAuthor ? missingAuthorBooks : shelf.books;
  const listedVolumes = showAllVolumes ? shelf.books : missingBooks;
  const hasEpubCandidates = shelf.books.some((b) => b.file_type === 'epub');

  const handleAutoExtract = async () => {
    if (extracting || saving) return;
    const epubBooks = shelf.books.filter((b) => b.file_type === 'epub');
    if (epubBooks.length === 0) {
      onNotify?.('Kệ này không có tệp EPUB để tự trích dữ liệu.', 'info');
      return;
    }

    setExtracting(true);
    try {
      if (mode === 'author') {
        for (const candidate of epubBooks.slice(0, 3)) {
          const creator = await extractBookAutoAuthor(candidate);
          if (creator) {
            setAuthorInput(creator);
            onNotify?.(`Đã trích tên tác giả "${creator}" từ tệp EPUB.`, 'success');
            return;
          }
        }
        onNotify?.('Tệp EPUB không nhúng sẵn thông tin tác giả trong thẻ <dc:creator>.', 'info');
        return;
      }

      if (mode === 'shared') {
        for (const candidate of epubBooks.slice(0, 3)) {
          const extracted = await extractBookAutoDescription(candidate);
          if (extracted) {
            setSharedText(extracted);
            onNotify?.(
              `Đã trích nội dung giới thiệu từ "${getBookSortTitle(candidate)}".`,
              'success',
            );
            return;
          }
        }
        onNotify?.('Không tìm thấy mục giới thiệu/tóm tắt tự động trong tệp EPUB đầu bộ.', 'info');
        return;
      }

      const candidates = listedVolumes.filter(
        (b) => b.file_type === 'epub' && !draftById[b.id]?.trim(),
      );
      if (candidates.length === 0) {
        onNotify?.('Không có tập EPUB trống nào cần trích tự động.', 'info');
        return;
      }
      let filled = 0;
      const nextDrafts = { ...draftById };
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
    } catch {
      onNotify?.('Không thể đọc tệp EPUB để trích xuất.', 'warning');
    } finally {
      setExtracting(false);
    }
  };

  const runBatchPatch = async (jobs: BatchJob[], successMessage: string) => {
    if (jobs.length === 0) {
      onNotify?.('Tất cả các tập mục tiêu đã khớp sẵn thông tin này.', 'info');
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
        slice.map((job) => updateBookMetadata(job.book.id, job.patch)),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') updatedBooks.push(res.value);
        else if (!firstError) firstError = res.reason;
      }
      setSaveDoneCount(Math.min(jobs.length, i + slice.length));
    }

    setSaving(false);
    if (updatedBooks.length > 0) onBooksUpdated(updatedBooks);

    if (firstError) {
      onApiError?.(firstError, 'Một số tập chưa lưu được thay đổi.');
      if (updatedBooks.length > 0) {
        onNotify?.(`Đã lưu ${updatedBooks.length}/${jobs.length} tập trước khi gặp lỗi.`, 'warning');
      }
      return;
    }

    onNotify?.(successMessage.replace('{count}', String(updatedBooks.length)), 'success');
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || extracting) return;

    if (mode === 'author') {
      const nextAuthor = authorInput.trim() || UNKNOWN_AUTHOR_LABEL;
      const jobs: BatchJob[] = [];
      for (const book of targetAuthorBooks) {
        const healedTitle = getHealedTitleInShelf(book, shelf, rawAuthorCounts);
        const titleNeedsHeal = healedTitle !== book.title;
        if (!titleNeedsHeal && book.author === nextAuthor) continue;
        jobs.push({
          book,
          patch: titleNeedsHeal
            ? { title: healedTitle, author: nextAuthor }
            : { author: nextAuthor },
        });
      }
      void runBatchPatch(
        jobs,
        `Đã đồng bộ tác giả "${nextAuthor}" cho {count} tập trong "${shelf.name}".`,
      );
      return;
    }

    if (mode === 'shared') {
      const trimmed = sharedText.trim();
      if (!trimmed) {
        onNotify?.('Vui lòng nhập nội dung ghi chú / giới thiệu trước khi lưu.', 'warning');
        return;
      }
      const jobs: BatchJob[] = targetSharedBooks
        .filter((b) => (b.description?.trim() ?? '') !== trimmed)
        .map((book) => ({ book, patch: { description: trimmed } }));
      void runBatchPatch(jobs, `Đã cập nhật ghi chú cho {count} tập trong "${shelf.name}".`);
      return;
    }

    const jobs: BatchJob[] = [];
    for (const book of listedVolumes) {
      const nextVal = (draftById[book.id] ?? '').trim();
      const prevVal = book.description?.trim() ?? '';
      if (nextVal !== prevVal) jobs.push({ book, patch: { description: nextVal || null } });
    }
    void runBatchPatch(jobs, `Đã lưu ghi chú cho {count} tập trong "${shelf.name}".`);
  };

  let healedTitleSample: { oldTitle: string; newTitle: string } | null = null;
  for (const book of targetAuthorBooks) {
    const healed = getHealedTitleInShelf(book, shelf, rawAuthorCounts);
    if (healed !== book.title) {
      healedTitleSample = { oldTitle: book.title, newTitle: healed };
      break;
    }
  }

  const submitLabel =
    mode === 'author'
      ? `Đồng bộ cho ${targetAuthorBooks.length} tập`
      : mode === 'shared'
        ? `Lưu cho ${targetSharedBooks.length} tập`
        : 'Lưu các tập đã nhập';

  const submitDisabled =
    saving ||
    extracting ||
    (mode === 'shared' && (!sharedText.trim() || targetSharedBooks.length === 0)) ||
    (mode === 'author' && (!authorInput.trim() || targetAuthorBooks.length === 0));

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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              {mode === 'author' ? <UserPen className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2
                id="shelf-batch-note-title"
                className="truncate font-display text-lg font-semibold text-ink"
              >
                Ghi chú &amp; Tác giả bộ truyện
              </h2>
              <p className="truncate text-xs text-ink-muted">
                {shelf.name} · Trống ghi chú:{' '}
                <strong className="text-ink">{missingBooks.length}</strong>/{shelf.books.length} ·
                Chưa rõ tác giả:{' '}
                <strong className="text-ink">{missingAuthorBooks.length}</strong>/
                {shelf.books.length}
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

        {/* Thanh chuyển 3 tab + nút Tự trích từ EPUB */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/50 px-5 py-2.5">
          <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-1 text-xs">
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
              Điền riêng từng tập ({missingBooks.length})
            </button>
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() => setMode('author')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                mode === 'author'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Tên tác giả
            </button>
          </div>

          {hasEpubCandidates && (
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() => void handleAutoExtract()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-accent" />
              )}
              <span>{extracting ? 'Đang đọc EPUB...' : 'Tự trích từ EPUB'}</span>
            </button>
          )}
        </div>

        {/* Nội dung form */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
            <ShelfBatchNoteFields
              mode={mode}
              shelfName={shelf.name}
              totalBooksCount={shelf.books.length}
              missingBooksCount={missingBooks.length}
              missingAuthorCount={missingAuthorBooks.length}
              targetAuthorCount={targetAuthorBooks.length}
              knownAuthorsInShelf={knownAuthorsInShelf}
              healedTitlePreview={healedTitleSample}
              listedVolumes={listedVolumes}
              sharedText={sharedText}
              overwriteExisting={overwriteExisting}
              showAllVolumes={showAllVolumes}
              draftById={draftById}
              authorInput={authorInput}
              onlyMissingAuthor={onlyMissingAuthor}
              disabled={saving || extracting}
              onChangeSharedText={setSharedText}
              onChangeOverwriteExisting={setOverwriteExisting}
              onChangeShowAllVolumes={setShowAllVolumes}
              onChangeVolumeDraft={(bookId, value) =>
                setDraftById((prev) => ({ ...prev, [bookId]: value }))
              }
              onChangeAuthorInput={setAuthorInput}
              onChangeOnlyMissingAuthor={setOnlyMissingAuthor}
            />

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
              disabled={submitDisabled}
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
                  <span>{submitLabel}</span>
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
