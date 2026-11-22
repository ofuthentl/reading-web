import { useMemo, useState } from 'react';
import { BookMarked, Library } from 'lucide-react';
import type {
  AuthRole,
  Book,
  LibraryFormatFilter,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfGroup,
} from '@/types';
import { summarizeShelf, type ShelfSummary } from '@/lib/shelfSummary';
import { LibraryFilterBar } from '@/components/LibraryFilterBar';
import { ShelfCoverCard } from '@/components/ShelfCoverCard';
import { ShelfCoverPickerModal } from '@/components/ShelfCoverPickerModal';
import { ShelfDetailView } from '@/components/ShelfDetailView';
import type { ToastType } from '@/hooks/useToast';

export interface LibraryCatalogViewProps {
  allShelvesCount: number;
  libraryShelves: ShelfGroup[];
  openedLibraryShelf: ShelfGroup | null;
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  searchQuery: string;
  statusFilter: LibraryStatusFilter;
  formatFilter: LibraryFormatFilter;
  sortMode: LibrarySortMode;
  isFiltering: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
  onFormatChange: (value: LibraryFormatFilter) => void;
  onSortChange: (value: LibrarySortMode) => void;
  onClearFilters: () => void;
  onOpenShelf: (shelfKey: string) => void;
  onCloseShelf: () => void;
  onOpenBook: (book: Book) => void;
  onInspectBook?: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onSelectBookIds: (ids: string[]) => void;
  onClearSelection: () => void;
  onToggleSelectionMode: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onShelfCoverChanged?: (shelfName: string, bookId: string | null) => void;
  onToggleFavoriteShelf?: (shelfName: string, nextFavorite: boolean) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function LibraryCatalogView({
  allShelvesCount,
  libraryShelves,
  openedLibraryShelf,
  progress,
  shelfCovers,
  favoriteShelfKeys,
  sessionRole,
  searchQuery,
  statusFilter,
  formatFilter,
  sortMode,
  isFiltering,
  selectionMode,
  selectedIds,
  onSearchChange,
  onStatusChange,
  onFormatChange,
  onSortChange,
  onClearFilters,
  onOpenShelf,
  onCloseShelf,
  onOpenBook,
  onInspectBook,
  onToggleSelect,
  onSelectBookIds,
  onClearSelection,
  onToggleSelectionMode,
  onEditBook,
  onRenameShelf,
  onShelfCoverChanged,
  onToggleFavoriteShelf,
  onMoveSelectedToShelf,
  onDeleteSelected,
  onApiError,
  onNotify,
}: LibraryCatalogViewProps) {
  const [pickingShelfKey, setPickingShelfKey] = useState<string | null>(null);

  const librarySummaries = useMemo(
    () =>
      libraryShelves.map((shelf) =>
        summarizeShelf(shelf, progress, shelfCovers, favoriteShelfKeys),
      ),
    [libraryShelves, progress, shelfCovers, favoriteShelfKeys],
  );

  const openedShelfSummary = useMemo(
    () =>
      openedLibraryShelf
        ? summarizeShelf(openedLibraryShelf, progress, shelfCovers, favoriteShelfKeys)
        : null,
    [openedLibraryShelf, progress, shelfCovers, favoriteShelfKeys],
  );

  const pickingSummary: ShelfSummary | null = useMemo(() => {
    if (!pickingShelfKey) return null;
    if (openedShelfSummary?.shelf.key === pickingShelfKey) return openedShelfSummary;
    return librarySummaries.find((s) => s.shelf.key === pickingShelfKey) ?? null;
  }, [pickingShelfKey, openedShelfSummary, librarySummaries]);

  const handleOpenCoverPicker = onShelfCoverChanged
    ? (summary: ShelfSummary) => setPickingShelfKey(summary.shelf.key)
    : undefined;

  return (
    <>
      {openedShelfSummary ? (
        <ShelfDetailView
          summary={openedShelfSummary}
          progress={progress}
          sessionRole={sessionRole}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onBack={onCloseShelf}
          onOpenBook={onOpenBook}
          onInspectBook={onInspectBook}
          onToggleSelect={onToggleSelect}
          onSelectBookIds={onSelectBookIds}
          onClearSelection={onClearSelection}
          onToggleSelectionMode={onToggleSelectionMode}
          onEditBook={onEditBook}
          onRenameShelf={onRenameShelf}
          onChangeShelfCover={handleOpenCoverPicker}
          onToggleFavorite={onToggleFavoriteShelf}
          onMoveSelectedToShelf={onMoveSelectedToShelf}
          onDeleteSelected={onDeleteSelected}
        />
      ) : (
        <section aria-label="Thư viện theo kệ" className="space-y-6">
          <div className="flex items-center gap-2.5">
            <Library className="h-4 w-4 text-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">Thư viện bộ truyện</h2>
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
              {isFiltering
                ? `${librarySummaries.length} / ${allShelvesCount} kệ`
                : `${allShelvesCount} kệ`}
            </span>
          </div>

          <LibraryFilterBar
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            formatFilter={formatFilter}
            sortMode={sortMode}
            isFiltering={isFiltering}
            filteredCount={librarySummaries.length}
            totalCount={allShelvesCount}
            unitLabel="kệ"
            searchPlaceholder="Tìm bộ truyện, tác giả hoặc tên tập... (Nhấn /)"
            onSearchChange={onSearchChange}
            onStatusChange={onStatusChange}
            onFormatChange={onFormatChange}
            onSortChange={onSortChange}
            onClearFilters={onClearFilters}
          />

          {librarySummaries.length === 0 ? (
            <div className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm dark:border-line-strong/60">
              <BookMarked className="mb-3 h-8 w-8 text-ink-faint" />
              <h3 className="font-display text-base font-semibold text-ink">
                Không tìm thấy bộ truyện nào
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                Thử đổi từ khoá hoặc xoá các bộ lọc trạng thái / định dạng hiện tại.
              </p>
              <button
                type="button"
                onClick={onClearFilters}
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
                  onChangeShelfCover={handleOpenCoverPicker}
                  onToggleFavorite={onToggleFavoriteShelf}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {onShelfCoverChanged && (
        <ShelfCoverPickerModal
          shelf={pickingSummary?.shelf ?? null}
          customCoverBookId={pickingSummary?.customCoverBookId ?? null}
          onClose={() => setPickingShelfKey(null)}
          onCoverChanged={onShelfCoverChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
