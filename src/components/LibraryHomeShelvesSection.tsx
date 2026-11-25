import { useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, ChevronDown, FolderEdit, Library, Star } from 'lucide-react';
import type { AuthRole, Book, BookAccessSummary, ReadingProgress, ShelfGroup } from '@/types';
import { BookCard } from '@/components/BookCard';

const INITIAL_HOME_BOOK_BUDGET = 36;
const NEXT_HOME_BOOK_BUDGET = 48;
const MAX_SHELVES_PER_BATCH = 6;
const MIN_SHELVES_PER_BATCH = 2;

function computeNextHomeShelfCount(
  shelves: readonly ShelfGroup[],
  currentCount: number,
  bookBudget: number,
): number {
  if (currentCount >= shelves.length) return shelves.length;
  let next = currentCount;
  let addedShelves = 0;
  let addedBooks = 0;
  while (next < shelves.length) {
    addedBooks += shelves[next].books.length;
    addedShelves += 1;
    next += 1;
    if (addedShelves >= MAX_SHELVES_PER_BATCH) break;
    if (addedShelves >= MIN_SHELVES_PER_BATCH && addedBooks >= bookBudget) break;
  }
  return next;
}

export interface LibraryHomeShelvesSectionProps {
  visibleShelves: ShelfGroup[];
  totalBooksCount: number;
  progress: Record<string, ReadingProgress>;
  bookAccess?: Readonly<Record<string, BookAccessSummary>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  planToReadBookIds?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  isFiltering: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onOpenBook: (book: Book) => void;
  onInspectBook?: (book: Book) => void;
  onToggleSelectBook: (bookId: string) => void;
  onEditBook?: (book: Book) => void;
  onManageBookAccess?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onToggleFavoriteShelf?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
  onClearFilters: () => void;
}

export function LibraryHomeShelvesSection({
  visibleShelves,
  totalBooksCount,
  progress,
  bookAccess,
  favoriteShelfKeys,
  planToReadBookIds,
  sessionRole,
  isFiltering,
  selectionMode,
  selectedIds,
  onOpenBook,
  onInspectBook,
  onToggleSelectBook,
  onEditBook,
  onManageBookAccess,
  onRenameShelf,
  onToggleFavoriteShelf,
  onTogglePlanToReadBook,
  onClearFilters,
}: LibraryHomeShelvesSectionProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const shelvesSignature = useMemo(() => {
    const first = visibleShelves[0]?.key ?? '';
    const last = visibleShelves[visibleShelves.length - 1]?.key ?? '';
    return `${isFiltering ? 'f' : 'a'}:${visibleShelves.length}:${first}:${last}`;
  }, [isFiltering, visibleShelves]);

  const [renderedShelfCount, setRenderedShelfCount] = useState(() =>
    computeNextHomeShelfCount(visibleShelves, 0, INITIAL_HOME_BOOK_BUDGET),
  );

  useEffect(() => {
    setRenderedShelfCount(computeNextHomeShelfCount(visibleShelves, 0, INITIAL_HOME_BOOK_BUDGET));
  }, [shelvesSignature, visibleShelves]);

  const effectiveShelfCount = Math.min(renderedShelfCount, visibleShelves.length);
  const hasMoreShelves = effectiveShelfCount < visibleShelves.length;

  useEffect(() => {
    if (!hasMoreShelves) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setRenderedShelfCount((prev) =>
          computeNextHomeShelfCount(visibleShelves, prev, NEXT_HOME_BOOK_BUDGET),
        );
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreShelves, visibleShelves]);

  const displayedShelves = useMemo(
    () => visibleShelves.slice(0, effectiveShelfCount),
    [effectiveShelfCount, visibleShelves],
  );
  const displayedBookCount = useMemo(
    () => displayedShelves.reduce((sum, s) => sum + s.books.length, 0),
    [displayedShelves],
  );

  if (visibleShelves.length === 0) {
    return (
      <section className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm dark:border-line-strong/60">
        <BookMarked className="mb-3 h-8 w-8 text-ink-faint" />
        <h2 className="font-display text-base font-semibold text-ink">
          Không tìm thấy cuốn sách nào
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Thử đổi từ khoá tìm kiếm hoặc xoá các bộ lọc tác giả / thể loại / trạng thái hiện tại.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-xl border border-line-strong bg-canvas px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-subtle"
        >
          Hiển thị toàn bộ thư viện
        </button>
      </section>
    );
  }

  return (
    <section aria-label="03 Thư viện truyện" className="space-y-7">
      {!isFiltering && (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong/70 pb-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-crimson-accent">
              03 · TOÀN BỘ KHO TRUYỆN
            </p>
            <h2 className="font-display text-[1.75rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.15rem]">
              <span>Thư viện </span>
              <span className="italic text-crimson-accent">truyện</span>
            </h2>
          </div>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted">
            {visibleShelves.length} kệ · {totalBooksCount} cuốn
          </span>
        </div>
      )}

      <div className="space-y-9">
        {displayedShelves.map((shelf) => {
          const isFav = Boolean(favoriteShelfKeys?.has(shelf.key));
          return (
            <section key={shelf.key} aria-label={`Kệ ${shelf.name}`} className="shelf-cv-auto space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {isFav ? (
                    <Star className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
                  ) : (
                    <Library className="h-4 w-4 shrink-0 text-accent" />
                  )}
                  <h2 className="truncate font-display text-lg font-semibold text-ink">
                    {shelf.name}
                  </h2>
                  <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">
                    {shelf.books.length} cuốn
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {onToggleFavoriteShelf && (
                    <button
                      type="button"
                      onClick={() => onToggleFavoriteShelf(shelf.name, !isFav)}
                      aria-label={
                        isFav ? `Bỏ yêu thích kệ ${shelf.name}` : `Yêu thích kệ ${shelf.name}`
                      }
                      aria-pressed={isFav}
                      title={isFav ? 'Bỏ yêu thích kệ' : 'Ghim kệ yêu thích lên đầu'}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isFav
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:border-amber-400/40 dark:text-amber-300'
                          : 'border-transparent text-ink-muted hover:border-line hover:bg-surface hover:text-ink'
                      }`}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          isFav
                            ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400'
                            : ''
                        }`}
                      />
                      <span className="hidden sm:inline">
                        {isFav ? 'Đã yêu thích' : 'Yêu thích'}
                      </span>
                    </button>
                  )}

                  {onRenameShelf && (
                    <button
                      type="button"
                      onClick={() => onRenameShelf(shelf.name)}
                      aria-label={`Đổi tên kệ ${shelf.name}`}
                      title="Đổi tên kệ"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line hover:bg-surface hover:text-ink"
                    >
                      <FolderEdit className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Đổi tên kệ</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {shelf.books.map((book, index) => (
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
                    onToggleSelect={onToggleSelectBook}
                    onEdit={onEditBook}
                    onManageBookAccess={onManageBookAccess}
                    onInspect={onInspectBook}
                    onTogglePlanToRead={onTogglePlanToReadBook}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {hasMoreShelves && (
        <div
          ref={sentinelRef}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 text-xs text-ink-muted"
        >
          <span>
            Đang hiển thị <strong className="text-ink">{effectiveShelfCount}</strong>/{visibleShelves.length} kệ (
            <strong className="text-ink">{displayedBookCount}</strong>/{totalBooksCount} cuốn)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setRenderedShelfCount((prev) =>
                  computeNextHomeShelfCount(visibleShelves, prev, NEXT_HOME_BOOK_BUDGET),
                )
              }
              className="inline-flex items-center gap-1 rounded-xl border border-line-strong bg-canvas px-3 py-1.5 font-medium text-ink transition-colors hover:bg-subtle"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Tải thêm kệ</span>
            </button>
            <button
              type="button"
              onClick={() => setRenderedShelfCount(visibleShelves.length)}
              className="rounded-xl border border-transparent px-2.5 py-1.5 font-medium text-ink-muted transition-colors hover:border-line hover:bg-subtle hover:text-ink"
            >
              Hiện tất cả
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
