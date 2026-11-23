import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BookMarked } from 'lucide-react';
import type {
  AuthRole,
  Book,
  CustomCollection,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfAccessSummary,
  ShelfGroup,
} from '@/types';
import { isCloudMode } from '@/lib/api';
import { summarizeShelf, type ShelfSummary } from '@/lib/shelfSummary';
import { CollectionFilterStrip } from '@/components/CollectionFilterStrip';
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

const LazyCollectionManagerModal = lazy(() =>
  import('@/components/CollectionManagerModal').then((mod) => ({
    default: mod.CollectionManagerModal,
  })),
);

export interface LibraryCatalogViewProps {
  allShelves: ShelfGroup[];
  libraryShelves: ShelfGroup[];
  openedLibraryShelf: ShelfGroup | null;
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  shelfAccess?: Readonly<Record<string, ShelfAccessSummary>>;
  shelfTags?: Readonly<Record<string, string[]>>;
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  planToReadShelfKeys?: ReadonlySet<string>;
  planToReadBookIds?: ReadonlySet<string>;
  collections?: readonly CustomCollection[];
  activeCollectionId?: string | null;
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
  onSelectCollection: (collectionId: string | null) => void;
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
  onShelfAltTitlesChanged?: (shelfName: string, altTitles: string[]) => void;
  onToggleFavoriteShelf?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToRead?: (shelfName: string, nextPlanToRead: boolean) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
  onCollectionSaved?: (collection: CustomCollection) => void;
  onCollectionDeleted?: (collectionId: string) => void;
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
  shelfAltTitles,
  favoriteShelfKeys,
  planToReadShelfKeys,
  planToReadBookIds,
  collections = [],
  activeCollectionId = null,
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
  onSelectCollection,
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
  onShelfAltTitlesChanged,
  onToggleFavoriteShelf,
  onTogglePlanToRead,
  onTogglePlanToReadBook,
  onCollectionSaved,
  onCollectionDeleted,
  onMoveSelectedToShelf,
  onDeleteSelected,
  onApiError,
  onNotify,
}: LibraryCatalogViewProps) {
  const [pickingShelfKey, setPickingShelfKey] = useState<string | null>(null);
  const [accessShelfKey, setAccessShelfKey] = useState<string | null>(null);
  const [batchNoteOpen, setBatchNoteOpen] = useState(false);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);

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
          shelfAltTitles,
          planToReadShelfKeys,
        ),
      ),
    [
      libraryShelves,
      progress,
      shelfCovers,
      favoriteShelfKeys,
      shelfAccess,
      shelfTags,
      sessionRole,
      shelfAltTitles,
      planToReadShelfKeys,
    ],
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
            shelfAltTitles,
            planToReadShelfKeys,
          )
        : null,
    [
      openedLibraryShelf,
      progress,
      shelfCovers,
      favoriteShelfKeys,
      shelfAccess,
      shelfTags,
      sessionRole,
      shelfAltTitles,
      planToReadShelfKeys,
    ],
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
          planToReadBookIds={planToReadBookIds}
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
          onOpenBatchNotes={onBooksUpdated ? () => setBatchNoteOpen(true) : undefined}
          onManageAccess={
            onShelfAccessChanged
              ? () => setAccessShelfKey(openedShelfSummary.shelf.key)
              : undefined
          }
          onToggleFavorite={onToggleFavoriteShelf}
          onTogglePlanToRead={onTogglePlanToRead}
          onTogglePlanToReadBook={onTogglePlanToReadBook}
          onMoveSelectedToShelf={onMoveSelectedToShelf}
          onDeleteSelected={onDeleteSelected}
          onApiError={onApiError}
          onNotify={onNotify}
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

          <CollectionFilterStrip
            collections={collections}
            allShelves={allShelves}
            activeCollectionId={activeCollectionId}
            onSelectCollection={onSelectCollection}
            onOpenManager={
              onCollectionSaved && onCollectionDeleted
                ? () => setCollectionManagerOpen(true)
                : undefined
            }
          />

          <LibraryFilterBar
            searchQuery={searchQuery}
            advanced={advancedFilter}
            statusFilter={statusFilter}
            sortMode={sortMode}
            isFiltering={isFiltering}
            filteredCount={librarySummaries.length}
            totalCount={allShelvesCount}
            unitLabel="kệ"
            searchPlaceholder="Tìm bộ truyện, tên khác (Romaji/Nhật), tác giả hoặc thể loại..."
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
                Thử đổi từ khoá hoặc xoá các bộ lọc tác giả / thể loại / tuyển tập / trạng thái hiện
                tại.
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
                  onTogglePlanToRead={onTogglePlanToRead}
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
          currentAltTitles={openedShelfSummary?.altTitles ?? []}
          currentTags={openedShelfSummary?.tags ?? []}
          onClose={() => setBatchNoteOpen(false)}
          onBooksUpdated={onBooksUpdated}
          onAltTitlesSaved={onShelfAltTitlesChanged}
          onTagsSaved={onShelfTagsChanged}
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
          currentAltTitles={openedShelfSummary.altTitles}
          allShelfTags={shelfTags}
          onClose={() => setTagsModalOpen(false)}
          onTagsSaved={onShelfTagsChanged}
          onAltTitlesSaved={onShelfAltTitlesChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onCollectionSaved && onCollectionDeleted && collectionManagerOpen && (
        <Suspense fallback={null}>
          <LazyCollectionManagerModal
            open={collectionManagerOpen}
            collections={collections}
            allShelves={allShelves}
            onClose={() => setCollectionManagerOpen(false)}
            onCollectionSaved={onCollectionSaved}
            onCollectionDeleted={onCollectionDeleted}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
    </>
  );
}
