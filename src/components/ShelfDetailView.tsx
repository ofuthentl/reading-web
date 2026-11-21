import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  FolderEdit,
  FolderInput,
  Image,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { Book, ReadingProgress } from '@/types';
import { formatBytes } from '@/lib/api';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { BookCard } from '@/components/BookCard';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';

interface ShelfDetailViewProps {
  summary: ShelfSummary;
  progress: Record<string, ReadingProgress>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onSelectBookIds: (ids: string[]) => void;
  onClearSelection: () => void;
  onToggleSelectionMode: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

export function ShelfDetailView({
  summary,
  progress,
  selectionMode,
  selectedIds,
  onBack,
  onOpenBook,
  onToggleSelect,
  onSelectBookIds,
  onClearSelection,
  onToggleSelectionMode,
  onEditBook,
  onRenameShelf,
  onChangeShelfCover,
  onToggleFavorite,
  onMoveSelectedToShelf,
  onDeleteSelected,
}: ShelfDetailViewProps) {
  const {
    shelf,
    coverBook,
    isFavorite,
    authorLabel,
    bookCount,
    completedCount,
    readingStatus,
    progressPercent,
    totalBytes,
    resumeBook,
    resumeActionLabel,
  } = summary;

  const [volumeQuery, setVolumeQuery] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  const coverKey = coverBook?.cover_key ?? null;
  const coverUrl = useCoverUrl(coverKey, true);
  const showImage = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${shelf.key}-${shelf.name}`);

  useEffect(() => {
    setVolumeQuery('');
  }, [shelf.key]);

  useEffect(() => {
    setImgFailed(false);
  }, [coverKey]);

  const normalizedQuery = useMemo(() => normalizeSearchText(volumeQuery), [volumeQuery]);

  const displayedBooks = useMemo(() => {
    if (!normalizedQuery) return shelf.books;
    return shelf.books.filter((book) =>
      normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery),
    );
  }, [shelf.books, normalizedQuery]);

  const selectedInShelf = useMemo(
    () => shelf.books.filter((book) => selectedIds.has(book.id)),
    [shelf.books, selectedIds],
  );

  const allDisplayedSelected =
    displayedBooks.length > 0 && displayedBooks.every((book) => selectedIds.has(book.id));

  const statusBadge =
    readingStatus === 'completed'
      ? {
          className:
            'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300',
          label: `Hoàn thành (${completedCount}/${bookCount})`,
        }
      : readingStatus === 'reading'
        ? {
            className: 'border-accent/35 bg-accent/10 text-accent',
            label:
              bookCount > 1
                ? `Đang đọc · ${completedCount}/${bookCount} tập (${progressPercent ?? 0}%)`
                : `Đang đọc · ${progressPercent ?? 0}%`,
          }
        : {
            className: 'border-line bg-canvas text-ink-muted',
            label: 'Chưa đọc',
          };

  return (
    <div className="space-y-6">
      {/* Thanh quay lại & breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại Thư viện
        </button>
        <span aria-hidden="true" className="text-ink-faint">
          /
        </span>
        <span className="truncate font-medium text-ink">{shelf.name}</span>
      </div>

      {/* Hero thông tin kệ */}
      <section className="moonlit-card flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-start sm:p-5 dark:border-line-strong/60">
        <div className="group relative aspect-[3/4] w-28 shrink-0 self-center overflow-hidden rounded-xl border border-line bg-subtle shadow-sm sm:w-32 sm:self-start">
          {showImage ? (
            <img
              src={coverUrl!}
              alt={shelf.name}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              style={{ backgroundColor: clothColor }}
              className="relative flex h-full w-full flex-col justify-between p-2.5 text-[#f6efe2]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
              />
              <p className="line-clamp-4 pl-2 pt-1 font-display text-xs font-semibold leading-snug">
                {shelf.name}
              </p>
              <p className="truncate pl-2 text-[10px] text-[#e6d5b8]/85">{authorLabel}</p>
            </div>
          )}

          {onChangeShelfCover && shelf.books.some((b) => Boolean(b.cover_key)) && (
            <button
              type="button"
              onClick={() => onChangeShelfCover(summary)}
              aria-label="Chọn ảnh bìa kệ"
              title="Chọn ảnh bìa từ một tập trong kệ"
              className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 bg-black/75 px-2 py-1 text-[11px] font-medium text-white opacity-90 backdrop-blur-sm transition-opacity hover:bg-black/90 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            >
              <Image className="h-3 w-3 shrink-0" />
              <span>Đổi bìa</span>
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
              <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted">
                {bookCount} tập · {formatBytes(totalBytes)}
              </span>
            </div>

            <h2 className="font-display text-xl font-semibold leading-tight text-ink sm:text-2xl">
              {shelf.name}
            </h2>
            <p className="text-sm text-ink-muted">{authorLabel}</p>

            {progressPercent !== null && (
              <div className="max-w-md pt-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.max(progressPercent, readingStatus === 'completed' ? 100 : 6)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {resumeBook && (
              <button
                type="button"
                onClick={() => onOpenBook(resumeBook)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
              >
                <BookOpen className="h-4 w-4" />
                <span>{resumeActionLabel}</span>
              </button>
            )}

            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(shelf.name, !isFavorite)}
                aria-pressed={isFavorite}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                  isFavorite
                    ? 'border-amber-500/45 bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 dark:border-amber-400/40 dark:text-amber-300'
                    : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
                }`}
              >
                <Star
                  className={`h-4 w-4 ${
                    isFavorite ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : 'text-ink-muted'
                  }`}
                />
                <span>{isFavorite ? 'Đã yêu thích' : 'Yêu thích'}</span>
              </button>
            )}

            {onRenameShelf && (
              <button
                type="button"
                onClick={() => onRenameShelf(shelf.name)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <FolderEdit className="h-4 w-4 text-ink-muted" />
                <span>Đổi tên kệ</span>
              </button>
            )}

            {onChangeShelfCover && shelf.books.some((b) => Boolean(b.cover_key)) && (
              <button
                type="button"
                onClick={() => onChangeShelfCover(summary)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <Image className="h-4 w-4 text-ink-muted" />
                <span>Đổi ảnh bìa kệ</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Thanh chọn nhiều trong phạm vi kệ đang mở */}
      {selectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-sm">
          <p className="text-sm text-ink">
            Đã chọn <strong className="text-accent">{selectedInShelf.length}</strong> /{' '}
            {displayedBooks.length} tập trong kệ này
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                allDisplayedSelected
                  ? onClearSelection()
                  : onSelectBookIds(displayedBooks.map((book) => book.id))
              }
              disabled={displayedBooks.length === 0}
              className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
            >
              {allDisplayedSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
            {onMoveSelectedToShelf && (
              <button
                type="button"
                disabled={selectedInShelf.length === 0}
                onClick={() => onMoveSelectedToShelf(selectedInShelf)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
              >
                <FolderInput className="h-3.5 w-3.5" />
                Chuyển kệ ({selectedInShelf.length})
              </button>
            )}
            {onDeleteSelected && (
              <button
                type="button"
                disabled={selectedInShelf.length === 0}
                onClick={() => onDeleteSelected(selectedInShelf)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-600/20 disabled:opacity-45 dark:border-red-400/30 dark:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá đã chọn ({selectedInShelf.length})
              </button>
            )}
            <button
              type="button"
              onClick={onToggleSelectionMode}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Xong
            </button>
          </div>
        </div>
      )}

      {/* Tiêu đề danh sách tập & ô tìm nhanh khi kệ dài */}
      <section aria-label={`Danh sách tập của ${shelf.name}`} className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink">Danh sách tập</h3>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">
              {normalizedQuery ? `${displayedBooks.length} / ${bookCount}` : `${bookCount} tập`}
            </span>
          </div>

          {bookCount >= 8 && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                inputMode="search"
                value={volumeQuery}
                onChange={(event) => setVolumeQuery(event.target.value)}
                placeholder="Lọc nhanh tập trong kệ này..."
                aria-label="Lọc nhanh tập trong kệ này"
                className="w-full rounded-xl border border-line bg-surface py-1.5 pl-9 pr-8 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
              />
              {volumeQuery && (
                <button
                  type="button"
                  onClick={() => setVolumeQuery('')}
                  aria-label="Xoá từ khoá lọc tập"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {displayedBooks.length === 0 ? (
          <div className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm dark:border-line-strong/60">
            <BookMarked className="mb-2.5 h-7 w-7 text-ink-faint" />
            <p className="font-display text-sm font-semibold text-ink">
              Không có tập nào khớp &ldquo;{volumeQuery}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setVolumeQuery('')}
              className="mt-3 rounded-xl border border-line-strong bg-canvas px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-subtle"
            >
              Xem đủ {bookCount} tập
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {displayedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={progress[book.id]}
                selectionMode={selectionMode}
                selected={selectedIds.has(book.id)}
                onOpen={onOpenBook}
                onToggleSelect={onToggleSelect}
                onEdit={onEditBook}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
