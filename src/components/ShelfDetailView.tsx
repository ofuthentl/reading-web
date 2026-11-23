import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookMarked, FolderInput, Search, Trash2, X } from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { BookCard } from '@/components/BookCard';
import { ShelfDetailHero } from '@/components/ShelfDetailHero';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';

interface ShelfDetailViewProps {
  summary: ShelfSummary;
  progress: Record<string, ReadingProgress>;
  sessionRole?: AuthRole;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onInspectBook?: (book: Book) => void;
  onSelectAuthor?: (authorName: string) => void;
  onSelectTag?: (tagName: string) => void;
  onEditTags?: () => void;
  onToggleSelect: (bookId: string) => void;
  onSelectBookIds: (ids: string[]) => void;
  onClearSelection: () => void;
  onToggleSelectionMode: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onOpenBatchNotes?: () => void;
  onManageAccess?: () => void;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

export function ShelfDetailView({
  summary,
  progress,
  sessionRole,
  selectionMode,
  selectedIds,
  onBack,
  onOpenBook,
  onInspectBook,
  onSelectAuthor,
  onSelectTag,
  onEditTags,
  onToggleSelect,
  onSelectBookIds,
  onClearSelection,
  onToggleSelectionMode,
  onEditBook,
  onRenameShelf,
  onChangeShelfCover,
  onOpenBatchNotes,
  onManageAccess,
  onToggleFavorite,
  onMoveSelectedToShelf,
  onDeleteSelected,
}: ShelfDetailViewProps) {
  const { shelf, bookCount } = summary;
  const [volumeQuery, setVolumeQuery] = useState('');

  useEffect(() => {
    setVolumeQuery('');
  }, [shelf.key]);

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

      <ShelfDetailHero
        summary={summary}
        onOpenBook={onOpenBook}
        onSelectAuthor={onSelectAuthor}
        onSelectTag={onSelectTag}
        onEditTags={onEditTags}
        onRenameShelf={onRenameShelf}
        onChangeShelfCover={onChangeShelfCover}
        onOpenBatchNotes={onOpenBatchNotes}
        onManageAccess={onManageAccess}
        onToggleFavorite={onToggleFavorite}
      />

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
            {displayedBooks.map((book, index) => (
              <BookCard
                key={book.id}
                book={book}
                staggerIndex={index}
                progress={progress[book.id]}
                sessionRole={sessionRole}
                selectionMode={selectionMode}
                selected={selectedIds.has(book.id)}
                onOpen={onOpenBook}
                onToggleSelect={onToggleSelect}
                onEdit={onEditBook}
                onInspect={onInspectBook}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
