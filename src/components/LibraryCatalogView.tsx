import { useMemo } from 'react';
import { BookMarked, Library, Search, X } from 'lucide-react';
import type { Book, ReadingProgress, ShelfGroup } from '@/types';
import { summarizeShelf } from '@/lib/shelfSummary';
import { ShelfCoverCard } from '@/components/ShelfCoverCard';
import { ShelfDetailView } from '@/components/ShelfDetailView';

export interface LibraryCatalogViewProps {
  allShelvesCount: number;
  libraryShelves: ShelfGroup[];
  openedLibraryShelf: ShelfGroup | null;
  progress: Record<string, ReadingProgress>;
  searchQuery: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onSearchChange: (value: string) => void;
  onOpenShelf: (shelfKey: string) => void;
  onCloseShelf: () => void;
  onOpenBook: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onSelectBookIds: (ids: string[]) => void;
  onClearSelection: () => void;
  onToggleSelectionMode: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

export function LibraryCatalogView({
  allShelvesCount,
  libraryShelves,
  openedLibraryShelf,
  progress,
  searchQuery,
  selectionMode,
  selectedIds,
  onSearchChange,
  onOpenShelf,
  onCloseShelf,
  onOpenBook,
  onToggleSelect,
  onSelectBookIds,
  onClearSelection,
  onToggleSelectionMode,
  onEditBook,
  onRenameShelf,
  onMoveSelectedToShelf,
  onDeleteSelected,
}: LibraryCatalogViewProps) {
  const librarySummaries = useMemo(
    () => libraryShelves.map((shelf) => summarizeShelf(shelf, progress)),
    [libraryShelves, progress],
  );

  const openedShelfSummary = useMemo(
    () => (openedLibraryShelf ? summarizeShelf(openedLibraryShelf, progress) : null),
    [openedLibraryShelf, progress],
  );

  if (openedShelfSummary) {
    return (
      <ShelfDetailView
        summary={openedShelfSummary}
        progress={progress}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onBack={onCloseShelf}
        onOpenBook={onOpenBook}
        onToggleSelect={onToggleSelect}
        onSelectBookIds={onSelectBookIds}
        onClearSelection={onClearSelection}
        onToggleSelectionMode={onToggleSelectionMode}
        onEditBook={onEditBook}
        onRenameShelf={onRenameShelf}
        onMoveSelectedToShelf={onMoveSelectedToShelf}
        onDeleteSelected={onDeleteSelected}
      />
    );
  }

  const isFiltering = Boolean(searchQuery.trim());

  return (
    <section aria-label="Thư viện theo kệ" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Library className="h-4 w-4 text-accent" />
          <h2 className="font-display text-lg font-semibold text-ink">Thư viện</h2>
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
            {isFiltering
              ? `${librarySummaries.length} / ${allShelvesCount} kệ`
              : `${allShelvesCount} kệ`}
          </span>
        </div>

        <div className="flex flex-1 items-center gap-2 sm:max-w-md sm:justify-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              inputMode="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tìm bộ truyện, tác giả hoặc tên tập..."
              aria-label="Tìm bộ truyện, tác giả hoặc tên tập"
              className="w-full rounded-xl border border-line bg-surface py-2 pl-10 pr-9 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
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
        </div>
      </div>

      {librarySummaries.length === 0 ? (
        <div className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm dark:border-line-strong/60">
          <BookMarked className="mb-3 h-8 w-8 text-ink-faint" />
          <h3 className="font-display text-base font-semibold text-ink">
            Không tìm thấy bộ truyện nào
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Thử đổi từ khoá tìm kiếm hoặc xem lại toàn bộ thư viện.
          </p>
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="mt-4 rounded-xl border border-line-strong bg-canvas px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-subtle"
          >
            Hiển thị tất cả kệ
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {librarySummaries.map((summary) => (
            <ShelfCoverCard
              key={summary.shelf.key}
              summary={summary}
              onOpenShelf={onOpenShelf}
              onRenameShelf={onRenameShelf}
            />
          ))}
        </div>
      )}
    </section>
  );
}
