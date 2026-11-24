import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BookMarked, LayoutGrid, Library } from 'lucide-react';
import type {
  AuthRole,
  Book,
  BookAccessSummary,
  CustomCollection,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfAccessSummary,
  ShelfGroup,
  ShelfRatingSummary,
  ShelfRelation,
} from '@/types';
import { isCloudMode } from '@/lib/api';
import { summarizeShelf, type ShelfSummary } from '@/lib/shelfSummary';
import { CollectionFilterStrip } from '@/components/CollectionFilterStrip';
import { LibraryCatalogModals } from '@/components/LibraryCatalogModals';
import {
  type LibraryAdvancedFilterProps,
  LibraryFilterBar,
} from '@/components/LibraryFilterBar';
import { ShelfCoverCard } from '@/components/ShelfCoverCard';
import { ShelfDetailView } from '@/components/ShelfDetailView';
import type { ToastType } from '@/hooks/useToast';

const LazySpineBookshelfView = lazy(() =>
  import('@/components/SpineBookshelfView').then((mod) => ({
    default: mod.SpineBookshelfView,
  })),
);

type CatalogDisplayMode = 'grid' | 'spine';
const CATALOG_DISPLAY_MODE_KEY = 'ofu-library-catalog-mode';

function readInitialCatalogDisplayMode(): CatalogDisplayMode {
  try {
    return window.localStorage.getItem(CATALOG_DISPLAY_MODE_KEY) === 'spine' ? 'spine' : 'grid';
  } catch {
    return 'grid';
  }
}

export interface LibraryCatalogViewProps {
  allShelves: ShelfGroup[];
  libraryShelves: ShelfGroup[];
  openedLibraryShelf: ShelfGroup | null;
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  shelfAccess?: Readonly<Record<string, ShelfAccessSummary>>;
  shelfTags?: Readonly<Record<string, string[]>>;
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>;
  shelfRelations?: readonly ShelfRelation[];
  bookAccess?: Readonly<Record<string, BookAccessSummary>>;
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
  onManageBookAccess?: (book: Book) => void;
  onBooksUpdated?: (books: Book[]) => void;
  onRenameShelf?: (shelfName: string) => void;
  onShelfCoverChanged?: (shelfName: string, bookId: string | null) => void;
  onShelfAccessChanged?: (shelfName: string, summary: ShelfAccessSummary | null) => void;
  onShelfTagsChanged?: (shelfName: string, tags: string[]) => void;
  onShelfAltTitlesChanged?: (shelfName: string, altTitles: string[]) => void;
  onShelfRatingUpdated?: (shelfKey: string, average: number | null, count: number) => void;
  onShelfRelationSaved?: (relation: ShelfRelation) => void;
  onShelfRelationDeleted?: (sourceKey: string, targetKey: string) => void;
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
  shelfRatings,
  shelfRelations = [],
  bookAccess,
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
  onManageBookAccess,
  onBooksUpdated,
  onRenameShelf,
  onShelfCoverChanged,
  onShelfAccessChanged,
  onShelfTagsChanged,
  onShelfAltTitlesChanged,
  onShelfRatingUpdated,
  onShelfRelationSaved,
  onShelfRelationDeleted,
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
  const [relationsModalOpen, setRelationsModalOpen] = useState(false);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [announcingDiscord, setAnnouncingDiscord] = useState(false);
  const [displayMode, setDisplayMode] = useState<CatalogDisplayMode>(readInitialCatalogDisplayMode);

  const handleChangeDisplayMode = (nextMode: CatalogDisplayMode) => {
    setDisplayMode(nextMode);
    try {
      window.localStorage.setItem(CATALOG_DISPLAY_MODE_KEY, nextMode);
    } catch {
      // Ignore storage quota errors
    }
  };

  useEffect(() => {
    if (!openedLibraryShelf) {
      setBatchNoteOpen(false);
      setTagsModalOpen(false);
      setRelationsModalOpen(false);
    }
  }, [openedLibraryShelf]);

  const allShelvesCount = allShelves.length;
  const allShelfNames = useMemo(
    () => new Map(allShelves.map((s) => [s.key, s.name])),
    [allShelves],
  );

  const allShelfSummaries = useMemo(
    () =>
      allShelves.map((shelf) =>
        summarizeShelf(
          shelf, progress, shelfCovers, favoriteShelfKeys, shelfAccess?.[shelf.key] ?? null,
          shelfTags, sessionRole, shelfAltTitles, planToReadShelfKeys, shelfRatings,
        ),
      ),
    [
      allShelves, progress, shelfCovers, favoriteShelfKeys, shelfAccess,
      shelfTags, sessionRole, shelfAltTitles, planToReadShelfKeys, shelfRatings,
    ],
  );

  const summaryByKey = useMemo(
    () => new Map(allShelfSummaries.map((s) => [s.shelf.key, s])),
    [allShelfSummaries],
  );

  const librarySummaries = useMemo(
    () =>
      libraryShelves.map(
        (shelf) =>
          summaryByKey.get(shelf.key) ??
          summarizeShelf(
            shelf, progress, shelfCovers, favoriteShelfKeys, shelfAccess?.[shelf.key] ?? null,
            shelfTags, sessionRole, shelfAltTitles, planToReadShelfKeys, shelfRatings,
          ),
      ),
    [
      libraryShelves, summaryByKey, progress, shelfCovers, favoriteShelfKeys,
      shelfAccess, shelfTags, sessionRole, shelfAltTitles, planToReadShelfKeys, shelfRatings,
    ],
  );

  const openedShelfSummary = useMemo(
    () =>
      openedLibraryShelf
        ? summaryByKey.get(openedLibraryShelf.key) ??
          summarizeShelf(
            openedLibraryShelf, progress, shelfCovers, favoriteShelfKeys,
            shelfAccess?.[openedLibraryShelf.key] ?? null, shelfTags, sessionRole,
            shelfAltTitles, planToReadShelfKeys, shelfRatings,
          )
        : null,
    [
      openedLibraryShelf, summaryByKey, progress, shelfCovers, favoriteShelfKeys,
      shelfAccess, shelfTags, sessionRole, shelfAltTitles, planToReadShelfKeys, shelfRatings,
    ],
  );

  const pickingSummary: ShelfSummary | null = useMemo(
    () => (pickingShelfKey ? summaryByKey.get(pickingShelfKey) ?? null : null),
    [pickingShelfKey, summaryByKey],
  );

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

  const handleAnnounceOpenedShelf =
    sessionRole === 'owner' && isCloudMode && openedShelfSummary && onNotify && onApiError
      ? async () => {
          if (announcingDiscord) return;
          setAnnouncingDiscord(true);
          try {
            const { triggerDiscordReleaseAnnouncement } = await import('@/lib/uploadBatchHelpers');
            await triggerDiscordReleaseAnnouncement(
              openedShelfSummary.shelf.books.map((b) => b.id),
              onNotify,
              onApiError,
            );
          } finally {
            setAnnouncingDiscord(false);
          }
        }
      : undefined;

  return (
    <>
      {openedShelfSummary ? (
        <ShelfDetailView
          summary={openedShelfSummary}
          allSummaries={allShelfSummaries}
          shelfRelations={shelfRelations}
          bookAccess={bookAccess}
          progress={progress}
          planToReadBookIds={planToReadBookIds}
          sessionRole={sessionRole}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onBack={onCloseShelf}
          onOpenShelf={onOpenShelf}
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
          onManageBookAccess={onManageBookAccess}
          onRenameShelf={onRenameShelf}
          onChangeShelfCover={handleOpenCoverPicker}
          onOpenBatchNotes={onBooksUpdated ? () => setBatchNoteOpen(true) : undefined}
          onManageAccess={
            onShelfAccessChanged
              ? () => setAccessShelfKey(openedShelfSummary.shelf.key)
              : undefined
          }
          onManageRelations={
            onShelfRelationSaved && onShelfRelationDeleted
              ? () => setRelationsModalOpen(true)
              : undefined
          }
          onAnnounceDiscord={handleAnnounceOpenedShelf}
          announcingDiscord={announcingDiscord}
          onShelfRatingUpdated={onShelfRatingUpdated}
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
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Chế độ hiển thị thư viện"
                className="inline-flex items-center rounded-xl border border-line bg-surface p-0.5 text-xs shadow-sm"
              >
                <button
                  type="button"
                  aria-pressed={displayMode === 'grid'}
                  onClick={() => handleChangeDisplayMode('grid')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                    displayMode === 'grid'
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Lưới Bìa</span>
                </button>
                <button
                  type="button"
                  aria-pressed={displayMode === 'spine'}
                  onClick={() => handleChangeDisplayMode('spine')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                    displayMode === 'spine'
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Library className="h-3.5 w-3.5" />
                  <span>Tủ Gáy Sách</span>
                </button>
              </div>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted">
                {isFiltering
                  ? `${librarySummaries.length} / ${allShelvesCount} kệ`
                  : `${allShelvesCount} kệ`}
              </span>
            </div>
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
          ) : displayMode === 'spine' ? (
            <Suspense
              fallback={
                <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center text-xs text-ink-muted">
                  Đang dựng tủ gáy sách...
                </div>
              }
            >
              <LazySpineBookshelfView summaries={librarySummaries} onOpenShelf={onOpenShelf} />
            </Suspense>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 pr-3 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-7 sm:pr-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-9 xl:grid-cols-6">
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

      <LibraryCatalogModals
        allShelves={allShelves}
        allShelfNames={allShelfNames}
        collections={collections}
        shelfTags={shelfTags}
        shelfRelations={shelfRelations}
        pickingSummary={pickingSummary}
        accessTargetShelf={accessTargetShelf}
        openedShelfSummary={openedShelfSummary}
        batchNoteOpen={batchNoteOpen}
        tagsModalOpen={tagsModalOpen}
        relationsModalOpen={relationsModalOpen}
        collectionManagerOpen={collectionManagerOpen}
        onCloseCoverPicker={() => setPickingShelfKey(null)}
        onCloseAccessModal={() => setAccessShelfKey(null)}
        onCloseBatchNotes={() => setBatchNoteOpen(false)}
        onCloseTagsModal={() => setTagsModalOpen(false)}
        onCloseRelationsModal={() => setRelationsModalOpen(false)}
        onCloseCollectionManager={() => setCollectionManagerOpen(false)}
        onBooksUpdated={onBooksUpdated}
        onShelfCoverChanged={onShelfCoverChanged}
        onShelfAccessChanged={onShelfAccessChanged}
        onShelfTagsChanged={onShelfTagsChanged}
        onShelfAltTitlesChanged={onShelfAltTitlesChanged}
        onShelfRelationSaved={onShelfRelationSaved}
        onShelfRelationDeleted={onShelfRelationDeleted}
        onCollectionSaved={onCollectionSaved}
        onCollectionDeleted={onCollectionDeleted}
        onApiError={onApiError}
        onNotify={onNotify}
      />
    </>
  );
}
