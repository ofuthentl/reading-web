import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, BookMarked, FolderInput, Search, Trash2, X } from 'lucide-react';
import type {
  AuthRole,
  Book,
  BookAccessSummary,
  ReadingProgress,
  ShelfRelation,
} from '@/types';
import {
  computeSimilarShelves,
  resolveShelfLinkedItems,
} from '@/lib/shelfRecommendations';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { BookCard } from '@/components/BookCard';
import { ShelfDetailHero } from '@/components/ShelfDetailHero';
import {
  ShelfLinkedUniverseStrip,
  ShelfSameTasteStrip,
} from '@/components/ShelfRelatedStrip';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type { ToastType } from '@/hooks/useToast';

const LazyCommunityReviewsSection = lazy(() =>
  import('@/components/CommunityReviewsSection').then((mod) => ({
    default: mod.CommunityReviewsSection,
  })),
);

interface ShelfDetailViewProps {
  summary: ShelfSummary;
  allSummaries?: readonly ShelfSummary[];
  shelfRelations?: readonly ShelfRelation[];
  bookAccess?: Readonly<Record<string, BookAccessSummary>>;
  progress: Record<string, ReadingProgress>;
  planToReadBookIds?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onBack: () => void;
  onOpenShelf?: (shelfKey: string) => void;
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
  onManageBookAccess?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onOpenBatchNotes?: () => void;
  onManageAccess?: () => void;
  onManageRelations?: () => void;
  onAnnounceDiscord?: () => Promise<void> | void;
  announcingDiscord?: boolean;
  onShelfRatingUpdated?: (shelfKey: string, average: number | null, count: number) => void;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToRead?: (shelfName: string, nextPlanToRead: boolean) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfDetailView({
  summary,
  allSummaries = [],
  shelfRelations = [],
  bookAccess,
  progress,
  planToReadBookIds,
  sessionRole,
  selectionMode,
  selectedIds,
  onBack,
  onOpenShelf,
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
  onManageBookAccess,
  onRenameShelf,
  onChangeShelfCover,
  onOpenBatchNotes,
  onManageAccess,
  onManageRelations,
  onAnnounceDiscord,
  announcingDiscord,
  onShelfRatingUpdated,
  onToggleFavorite,
  onTogglePlanToRead,
  onTogglePlanToReadBook,
  onMoveSelectedToShelf,
  onDeleteSelected,
  onApiError,
  onNotify,
}: ShelfDetailViewProps) {
  const { shelf, bookCount } = summary;
  const [volumeQuery, setVolumeQuery] = useState('');
  const [onlyPtrVolumes, setOnlyPtrVolumes] = useState(false);

  useEffect(() => {
    setVolumeQuery('');
    setOnlyPtrVolumes(false);
  }, [shelf.key]);

  const ptrVolumeCount = useMemo(
    () =>
      planToReadBookIds
        ? shelf.books.filter((book) => planToReadBookIds.has(book.id)).length
        : 0,
    [planToReadBookIds, shelf.books],
  );

  useEffect(() => {
    if (onlyPtrVolumes && ptrVolumeCount === 0) {
      setOnlyPtrVolumes(false);
    }
  }, [onlyPtrVolumes, ptrVolumeCount]);

  const normalizedQuery = useMemo(() => normalizeSearchText(volumeQuery), [volumeQuery]);

  const displayedBooks = useMemo(() => {
    return shelf.books.filter((book) => {
      if (onlyPtrVolumes && !planToReadBookIds?.has(book.id)) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery);
    });
  }, [shelf.books, normalizedQuery, onlyPtrVolumes, planToReadBookIds]);

  const selectedInShelf = useMemo(
    () => shelf.books.filter((book) => selectedIds.has(book.id)),
    [shelf.books, selectedIds],
  );

  const allDisplayedSelected =
    displayedBooks.length > 0 && displayedBooks.every((book) => selectedIds.has(book.id));

  const linkedItems = useMemo(
    () => resolveShelfLinkedItems(shelf.key, allSummaries, shelfRelations, sessionRole),
    [allSummaries, sessionRole, shelf.key, shelfRelations],
  );

  const similarItems = useMemo(
    () => computeSimilarShelves(summary, allSummaries, shelfRelations, sessionRole),
    [allSummaries, sessionRole, shelfRelations, summary],
  );

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
        relationCount={linkedItems.length}
        onOpenBook={onOpenBook}
        onSelectAuthor={onSelectAuthor}
        onSelectTag={onSelectTag}
        onEditTags={onEditTags}
        onRenameShelf={onRenameShelf}
        onChangeShelfCover={onChangeShelfCover}
        onOpenBatchNotes={onOpenBatchNotes}
        onManageAccess={onManageAccess}
        onManageRelations={onManageRelations}
        onAnnounceDiscord={onAnnounceDiscord}
        announcingDiscord={announcingDiscord}
        onToggleFavorite={onToggleFavorite}
        onTogglePlanToRead={onTogglePlanToRead}
      />

      {onOpenShelf && linkedItems.length > 0 && (
        <ShelfLinkedUniverseStrip
          items={linkedItems}
          onOpenShelf={onOpenShelf}
          onManageRelations={onManageRelations}
        />
      )}

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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink">Danh sách tập</h3>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">
              {normalizedQuery || onlyPtrVolumes
                ? `${displayedBooks.length} / ${bookCount}`
                : `${bookCount} tập`}
            </span>
            {ptrVolumeCount > 0 && (
              <button
                type="button"
                aria-pressed={onlyPtrVolumes}
                onClick={() => setOnlyPtrVolumes((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  onlyPtrVolumes
                    ? 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/45 dark:text-sky-300'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <Bookmark className={`h-3 w-3 ${onlyPtrVolumes ? 'fill-current' : 'text-sky-500'}`} />
                <span>Đọc sau ({ptrVolumeCount})</span>
              </button>
            )}
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
                bookAccessSummary={bookAccess?.[book.id] ?? null}
                isPlanToRead={Boolean(planToReadBookIds?.has(book.id))}
                sessionRole={sessionRole}
                selectionMode={selectionMode}
                selected={selectedIds.has(book.id)}
                onOpen={onOpenBook}
                onToggleSelect={onToggleSelect}
                onEdit={onEditBook}
                onManageBookAccess={onManageBookAccess}
                onInspect={onInspectBook}
                onTogglePlanToRead={onTogglePlanToReadBook}
              />
            ))}
          </div>
        )}
      </section>

      {onOpenShelf && similarItems.length > 0 && (
        <ShelfSameTasteStrip items={similarItems} onOpenShelf={onOpenShelf} />
      )}

      <Suspense
        fallback={
          <div className="moonlit-card rounded-2xl border border-line bg-surface p-5 text-center text-xs text-ink-muted">
            Đang tải mục đánh giá &amp; bình luận...
          </div>
        }
      >
        <LazyCommunityReviewsSection
          targetType="shelf"
          targetKey={shelf.key}
          targetLabel={shelf.name}
          variant="library"
          lockedMessage={
            summary.isGuestLocked
              ? '🔒 Bộ truyện này chỉ mở quyền đọc, chấm sao và bình luận cho thành viên Discord được chỉ định.'
              : null
          }
          onRatingUpdated={
            onShelfRatingUpdated
              ? (avg, cnt) => onShelfRatingUpdated(shelf.key, avg, cnt)
              : undefined
          }
          onApiError={onApiError}
          onNotify={onNotify}
        />
      </Suspense>
    </div>
  );
}
