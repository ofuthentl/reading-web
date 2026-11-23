import { useEffect, useMemo, useState } from 'react';
import { BookMarked } from 'lucide-react';
import type {
  AuthRole,
  Book,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfAccessSummary,
  ShelfGroup,
} from '@/types';
import { isCloudMode } from '@/lib/api';
import { summarizeShelf, type ShelfSummary } from '@/lib/shelfSummary';
import {
  type LibraryAdvancedFilterProps,
  LibraryFilterBar,
} from '@/components/LibraryFilterBar';
import { ShelfAccessModal } from '@/components/ShelfAccessModal';
import { ShelfBatchNoteModal } from '@/components/ShelfBatchNoteModal';
import { ShelfCoverCard } from '@/components/ShelfCoverCard';
import { ShelfCoverPickerModal } from '@/components/ShelfCoverPickerModal';
import { ShelfDetailView } from '@/components/ShelfDetailView';
import { ShelfTagsModal } from '@/components/ShelfTagsModal';
import type { ToastType } from '@/hooks/useToast';

export interface LibraryCatalogViewProps {
  allShelves: ShelfGroup[];
  libraryShelves: ShelfGroup[];
  openedLibraryShelf: ShelfGroup | null;
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  shelfAccess?: Readonly<Record<string, ShelfAccessSummary>>;
  shelfTags?: Readonly<Record<string, string[]>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  searchQuery: string;
  advancedFilter: LibraryAdvancedFilterProps;
  statusFilter: LibraryStatusFilter;
  sortMode: LibrarySortMode;
  isFiltering: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onSearchChange: (value: string) => void;
  onSelectAuthor: (authorName: string) => void;
  onSelectTag: (tagName: string) => void;
  onStatusChange: (value: LibraryStatusFilter) => void;
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
  onProtectionClick?: () => void;
  unprotectedBookCount?: number;
  onEditBook?: (book: Book) => void;
  onBooksUpdated?: (books: Book[]) => void;
  onRenameShelf?: (shelfName: string) => void;
  onShelfCoverChanged?: (shelfName: string, bookId: string | null) => void;
  onShelfAccessChanged?: (shelfName: string, summary: ShelfAccessSummary | null) => void;
  onShelfTagsChanged?: (shelfName: string, tags: string[]) => void;
  onToggleFavoriteShelf?: (shelfName: string, nextFavorite: boolean) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function LibraryCatalogView({
  allShelves,
  libraryShelves,
  openedLibraryShelf,
  progress,
  shelfCovers,
  shelfAccess,
  shelfTags,
  favoriteShelfKeys,
  sessionRole,
  searchQuery,
  advancedFilter,
  statusFilter,
  sortMode,
  isFiltering,
  selectionMode,
  selectedIds,
  onSearchChange,
  onSelectAuthor,
  onSelectTag,
  onStatusChange,
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
  onProtectionClick,
  unprotectedBookCount = 0,
  onEditBook,
  onBooksUpdated,
  onRenameShelf,
  onShelfCoverChanged,
  onShelfAccessChanged,
  onShelfTagsChanged,
  onToggleFavoriteShelf,
  onMoveSelectedToShelf,
  onDeleteSelected,
  onApiError,
  onNotify,
}: LibraryCatalogViewProps) {
  const [pickingShelfKey, setPickingShelfKey] = useState<string | null>(null);
  const [accessShelfKey, setAccessShelfKey] = useState<string | null>(null);
  const [batchNoteOpen, setBatchNoteOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);

  useEffect(() => {
    if (!openedLibraryShelf) {
      setBatchNoteOpen(false);
      setTagsModalOpen(false);
    }
  }, [openedLibraryShelf]);

  const allShelvesCount = allShelves.length;
  const allShelfNames = useMemo(
    () => new Map(allShelves.map((s) => [s.key, s.name])),
    [allShelves],
  );

  const librarySummaries = useMemo(
    () =>
      libraryShelves.map((shelf) =>
        summarizeShelf(
          shelf,
          progress,
          shelfCovers,
          favoriteShelfKeys,
          shelfAccess?.[shelf.key] ?? null,
          shelfTags,
          sessionRole,
        ),
      ),
    [libraryShelves, progress, shelfCovers, favoriteShelfKeys, shelfAccess, shelfTags, sessionRole],
  );

  const openedShelfSummary = useMemo(
    () =>
      openedLibraryShelf
        ? summarizeShelf(
            openedLibraryShelf,
            progress,
            shelfCovers,
            favoriteShelfKeys,
            shelfAccess?.[openedLibraryShelf.key] ?? null,
            shelfTags,
            sessionRole,
          )
        : null,
    [openedLibraryShelf, progress, shelfCovers, favoriteShelfKeys, shelfAccess, shelfTags, sessionRole],
  );

  const pickingSummary: ShelfSummary | null = useMemo(() => {
    if (!pickingShelfKey) return null;
    if (openedShelfSummary?.shelf.key === pickingShelfKey) return openedShelfSummary;
    return librarySummaries.find((s) => s.shelf.key === pickingShelfKey) ?? null;
  }, [pickingShelfKey, openedShelfSummary, librarySummaries]);

  const accessTargetShelf: ShelfGroup | null = useMemo(() => {
    if (!accessShelfKey) return null;
    if (openedLibraryShelf?.key === accessShelfKey) return openedLibraryShelf;
    return allShelves.find((s) => s.key === accessShelfKey) ?? null;
  }, [accessShelfKey, allShelves, openedLibraryShelf]);

  const handleOpenCoverPicker = onShelfCoverChanged
    ? (summary: ShelfSummary) => setPickingShelfKey(summary.shelf.key)
    : undefined;

  const handleOpenAccessModal = onShelfAccessChanged
    ? (summary: ShelfSummary) => setAccessShelfKey(summary.shelf.key)
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
          onSelectAuthor={onSelectAuthor}
          onSelectTag={onSelectTag}
          onEditTags={onShelfTagsChanged ? () => setTagsModalOpen(true) : undefined}
          onToggleSelect={onToggleSelect}
          onSelectBookIds={onSelectBookIds}
          onClearSelection={onClearSelection}
          onToggleSelectionMode={onToggleSelectionMode}
          onEditBook={onEditBook}
          onRenameShelf={onRenameShelf}
          onChangeShelfCover={handleOpenCoverPicker}
          onOpenBatchNotes={
            onBooksUpdated ? () => setBatchNoteOpen(true) : undefined
          }
          onManageAccess={
            onShelfAccessChanged
              ? () => setAccessShelfKey(openedShelfSummary.shelf.key)
              : undefined
          }
          onToggleFavorite={onToggleFavoriteShelf}
          onMoveSelectedToShelf={onMoveSelectedToShelf}
          onDeleteSelected={onDeleteSelected}
        />
      ) : (
        <section aria-label="Thư viện theo kệ" className="fade-in space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong/70 pb-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-crimson-accent">
                DANH MỤC KỆ SÁCH
              </p>
              <h2 className="font-display text-[1.75rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.15rem]">
                <span>Thư viện </span>
                <span className="italic text-crimson-accent">bộ truyện</span>
              </h2>
            </div>
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted">
              {isFiltering
                ? `${librarySummaries.length} / ${allShelvesCount} kệ`
                : `${allShelvesCount} kệ`}
            </span>
          </div>

          <LibraryFilterBar
            searchQuery={searchQuery}
            advanced={advancedFilter}
            statusFilter={statusFilter}
            sortMode={sortMode}
            isFiltering={isFiltering}
            filteredCount={librarySummaries.length}
            totalCount={allShelvesCount}
            unitLabel="kệ"
            searchPlaceholder="Tìm bộ truyện, tác giả, thể loại hoặc tên tập..."
            unprotectedBookCount={unprotectedBookCount}
            onProtectionClick={sessionRole === 'owner' && isCloudMode ? onProtectionClick : undefined}
            onSearchChange={onSearchChange}
            onStatusChange={onStatusChange}
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
                Thử đổi từ khoá hoặc xoá các bộ lọc tác giả / thể loại / trạng thái hiện tại.
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
              {librarySummaries.map((summary, index) => (
                <ShelfCoverCard
                  key={summary.shelf.key}
                  summary={summary}
                  staggerIndex={index}
                  onOpenShelf={onOpenShelf}
                  onRenameShelf={onRenameShelf}
                  onChangeShelfCover={handleOpenCoverPicker}
                  onManageAccess={handleOpenAccessModal}
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

      {onBooksUpdated && batchNoteOpen && (
        <ShelfBatchNoteModal
          shelf={openedShelfSummary?.shelf ?? null}
          onClose={() => setBatchNoteOpen(false)}
          onBooksUpdated={onBooksUpdated}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onShelfAccessChanged && accessTargetShelf && (
        <ShelfAccessModal
          shelf={accessTargetShelf}
          allShelfNames={allShelfNames}
          onClose={() => setAccessShelfKey(null)}
          onAccessSaved={onShelfAccessChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onShelfTagsChanged && tagsModalOpen && openedShelfSummary && (
        <ShelfTagsModal
          shelf={openedShelfSummary.shelf}
          currentTags={openedShelfSummary.tags}
          allShelfTags={shelfTags}
          onClose={() => setTagsModalOpen(false)}
          onTagsSaved={onShelfTagsChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
