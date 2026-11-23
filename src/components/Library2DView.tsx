import { Suspense, lazy, useEffect, useMemo } from 'react';
import { BookOpen, Clock, Upload } from 'lucide-react';
import type {
  AuthRole, Book, ReadingProgress, ShelfAccessSummary, StorageStats, ViewMode,
} from '@/types';
import { BookCard } from '@/components/BookCard';
import { EditorialBookStrip } from '@/components/EditorialBookStrip';
import { type LibraryAdvancedFilterProps, LibraryFilterBar } from '@/components/LibraryFilterBar';
import { LibraryHeader } from '@/components/LibraryHeader';
import { LibraryHomeShelvesSection } from '@/components/LibraryHomeShelvesSection';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import { type UiTheme, isDarkTheme } from '@/hooks/useTheme';
import type { ToastType } from '@/hooks/useToast';

const LazyBulkSelectionBar = lazy(() =>
  import('@/components/BulkSelectionBar').then((mod) => ({ default: mod.BulkSelectionBar })),
);

const LazyLibraryCatalogView = lazy(() =>
  import('@/components/LibraryCatalogView').then((mod) => ({ default: mod.LibraryCatalogView })),
);

const LazySupportView = lazy(() =>
  import('@/components/SupportView').then((mod) => ({ default: mod.SupportView })),
);

interface Library2DViewProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  shelfAccess?: Readonly<Record<string, ShelfAccessSummary>>;
  shelfTags?: Readonly<Record<string, string[]>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  storage: StorageStats | null;
  loading: boolean;
  theme: UiTheme;
  viewState: LibraryViewState;
  sessionRole?: AuthRole;
  sessionExpiresAt?: number | null;
  canUse3D?: boolean;
  viewMode?: ViewMode;
  onChangeViewMode?: (mode: ViewMode) => void;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenBook: (book: Book) => void;
  onInspectBook?: (book: Book) => void;
  onDismissContinue?: (book: Book) => void;
  onOpenStats?: () => void;
  onUploadClick?: () => void;
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

function LibraryGridSkeleton() {
  return (
    <section aria-label="Đang tải thư viện" className="space-y-4">
      <div className="h-5 w-44 animate-pulse rounded bg-subtle" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2.5">
            <div className="aspect-[7/10] w-full animate-pulse rounded-lg border border-line bg-subtle" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-subtle" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-subtle" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function Library2DView({
  books,
  progress,
  shelfCovers,
  shelfAccess,
  shelfTags,
  favoriteShelfKeys,
  storage,
  loading,
  theme,
  viewState,
  sessionRole = 'owner',
  sessionExpiresAt = null,
  canUse3D = false,
  viewMode = '2d',
  onChangeViewMode,
  onCycleTheme,
  onRefresh,
  onLogout,
  onOpenBook,
  onInspectBook,
  onDismissContinue,
  onOpenStats,
  onUploadClick,
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
}: Library2DViewProps) {
  const isDark = isDarkTheme(theme);
  const {
    activeTab,
    setActiveTab,
    openedLibraryShelf,
    openLibraryShelf,
    closeLibraryShelf,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortMode,
    setSortMode,
    selectionMode,
    selectedIds,
    allShelves,
    libraryShelves,
    continueReadingBooks,
    weeklyPopularBooks,
    recentlyAddedBooks,
    filteredBooks,
    visibleShelves,
    selectedBooks,
    isFiltering,
    toggleSelectionMode,
    toggleSelectBook,
    selectAllVisible,
    selectBookIds,
    clearSelection,
    clearFilters,
    authorFilter,
    setAuthorFilter,
    includedTags,
    excludedTags,
    tagMatchMode,
    setTagMatchMode,
    cycleTagFilter,
    removeIncludedTag,
    removeExcludedTag,
    clearTagFilters,
    filterByAuthor,
    filterByTag,
    availableAuthors,
  } = viewState;

  const advancedFilter = useMemo<LibraryAdvancedFilterProps>(
    () => ({
      authorFilter,
      includedTags,
      excludedTags,
      tagMatchMode,
      availableAuthors,
      allShelves,
      shelfTags,
      onAuthorFilterChange: setAuthorFilter,
      onCycleTagFilter: cycleTagFilter,
      onRemoveIncludedTag: removeIncludedTag,
      onRemoveExcludedTag: removeExcludedTag,
      onClearTagFilters: clearTagFilters,
      onTagMatchModeChange: setTagMatchMode,
    }),
    [
      allShelves, authorFilter, availableAuthors, clearTagFilters, cycleTagFilter,
      excludedTags, includedTags, removeExcludedTag, removeIncludedTag,
      setAuthorFilter, setTagMatchMode, shelfTags, tagMatchMode,
    ],
  );

  const isLibraryGridMode = activeTab === 'library' && !openedLibraryShelf;

  // Phím tắt `/` hoặc `Ctrl+K` nhảy nhanh vào ô tìm kiếm thư viện 2D (D-029)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      const isModK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (isModK || (!isTyping && event.key === '/')) {
        const input = document.querySelector<HTMLInputElement>('[data-library-search-input="true"]');
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="theme-canvas min-h-screen overflow-x-clip text-ink transition-colors duration-200">
      <LibraryHeader
        storage={storage}
        hideStorage
        bookCount={books.length}
        loading={loading}
        theme={theme}
        selectionMode={selectionMode}
        selectedCount={selectedIds.size}
        showSelectionToggle={!isLibraryGridMode && activeTab !== 'support'}
        sessionRole={sessionRole}
        sessionExpiresAt={sessionExpiresAt}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        canUse3D={canUse3D}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        onCycleTheme={onCycleTheme}
        onOpenStats={onOpenStats}
        onUploadClick={onUploadClick}
        onProtectionClick={onProtectionClick}
        unprotectedBookCount={unprotectedBookCount}
        onToggleSelectionMode={toggleSelectionMode}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-9 px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'support' ? (
          <Suspense fallback={<LibraryGridSkeleton />}>
            <LazySupportView onNotify={onNotify} />
          </Suspense>
        ) : loading && books.length === 0 ? (
          <LibraryGridSkeleton />
        ) : books.length === 0 ? (
          <section className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-sm dark:border-line-strong/60">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-subtle text-accent">
              <BookOpen className="h-7 w-7" />
            </div>
            <h2 className="font-display text-xl font-semibold text-ink">
              Kệ sách hiện còn trống
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {onUploadClick
                ? 'Tải lên những cuốn EPUB hoặc DOCX yêu thích để bắt đầu xây dựng thư viện đồng bộ của riêng bạn.'
                : 'Thư viện hiện chưa có cuốn sách nào được đưa lên kệ.'}
            </p>
            {onUploadClick && (
              <button
                type="button"
                onClick={onUploadClick}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
              >
                <Upload className="h-4 w-4" />
                Tải sách đầu tiên
              </button>
            )}
          </section>
        ) : activeTab === 'library' ? (
          <Suspense fallback={<LibraryGridSkeleton />}>
            <LazyLibraryCatalogView
              allShelves={allShelves}
              libraryShelves={libraryShelves}
              openedLibraryShelf={openedLibraryShelf}
              progress={progress}
              shelfCovers={shelfCovers}
              shelfAccess={shelfAccess}
              shelfTags={shelfTags}
              favoriteShelfKeys={favoriteShelfKeys}
              sessionRole={sessionRole}
              searchQuery={searchQuery}
              advancedFilter={advancedFilter}
              statusFilter={statusFilter}
              sortMode={sortMode}
              isFiltering={isFiltering}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSearchChange={setSearchQuery}
              onSelectAuthor={filterByAuthor}
              onSelectTag={filterByTag}
              onStatusChange={setStatusFilter}
              onSortChange={setSortMode}
              onClearFilters={clearFilters}
              onOpenShelf={openLibraryShelf}
              onCloseShelf={closeLibraryShelf}
              onOpenBook={onOpenBook}
              onInspectBook={onInspectBook}
              onToggleSelect={toggleSelectBook}
              onSelectBookIds={selectBookIds}
              onClearSelection={clearSelection}
              onToggleSelectionMode={toggleSelectionMode}
              onProtectionClick={onProtectionClick}
              unprotectedBookCount={unprotectedBookCount}
              onEditBook={onEditBook}
              onBooksUpdated={onBooksUpdated}
              onRenameShelf={onRenameShelf}
              onShelfCoverChanged={onShelfCoverChanged}
              onShelfAccessChanged={onShelfAccessChanged}
              onShelfTagsChanged={onShelfTagsChanged}
              onToggleFavoriteShelf={onToggleFavoriteShelf}
              onMoveSelectedToShelf={onMoveSelectedToShelf}
              onDeleteSelected={onDeleteSelected}
              onApiError={onApiError}
              onNotify={onNotify}
            />
          </Suspense>
        ) : (
          <>
            <LibraryFilterBar
              searchQuery={searchQuery}
              advanced={advancedFilter}
              statusFilter={statusFilter}
              hideSort
              showStorage={sessionRole === 'owner'}
              storage={storage}
              selectionMode={selectionMode}
              selectedCount={selectedIds.size}
              unprotectedBookCount={unprotectedBookCount}
              onProtectionClick={sessionRole === 'owner' ? onProtectionClick : undefined}
              onToggleSelectionMode={sessionRole === 'owner' ? toggleSelectionMode : undefined}
              isFiltering={isFiltering}
              filteredCount={filteredBooks.length}
              totalCount={books.length}
              unitLabel="cuốn"
              onSearchChange={setSearchQuery}
              onStatusChange={setStatusFilter}
              onClearFilters={clearFilters}
            />

            {selectionMode && (
              <Suspense fallback={null}>
                <LazyBulkSelectionBar
                  selectedCount={selectedIds.size}
                  totalVisibleCount={filteredBooks.length}
                  unitLabel="cuốn sách"
                  allSelected={selectedIds.size === filteredBooks.length && filteredBooks.length > 0}
                  selectedBooks={selectedBooks}
                  onToggleSelectAll={
                    selectedIds.size === filteredBooks.length && filteredBooks.length > 0
                      ? clearSelection
                      : selectAllVisible
                  }
                  onMoveSelected={onMoveSelectedToShelf}
                  onDeleteSelected={onDeleteSelected}
                  onDone={toggleSelectionMode}
                />
              </Suspense>
            )}

            {/* Khối Tiếp tục đọc */}
            {!isFiltering && continueReadingBooks.length > 0 && (
              <section aria-labelledby="continue-reading-heading" className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" />
                  <h2
                    id="continue-reading-heading"
                    className="font-display text-lg font-semibold text-ink"
                  >
                    Tiếp tục đọc
                  </h2>
                  <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted">
                    {continueReadingBooks.length}
                  </span>
                </div>

                <div
                  className={`flex gap-3.5 overflow-x-auto pb-2 scrollbar-hover ${
                    isDark ? 'scrollbar-hover-dark' : ''
                  }`}
                >
                  {continueReadingBooks.map((book) => (
                    <BookCard
                      key={`continue-${book.id}`}
                      book={book}
                      progress={progress[book.id]}
                      sessionRole={sessionRole}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(book.id)}
                      layout="horizontal"
                      onOpen={onOpenBook}
                      onToggleSelect={toggleSelectBook}
                      onInspect={onInspectBook}
                      onDismissContinue={onDismissContinue}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Cặp 2 dải biên tập: 01 Thịnh hành tuần này & 02 Mới cập nhật gần đây */}
            {!isFiltering && (
              <>
                <EditorialBookStrip
                  eyebrow="01 · ĐỌC NHIỀU TRONG 7 NGÀY"
                  leadTitle="Thịnh hành"
                  accentTitle="tuần này"
                  books={weeklyPopularBooks}
                  progress={progress}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  sessionRole={sessionRole}
                  isDark={isDark}
                  onOpenBook={onOpenBook}
                  onToggleSelect={toggleSelectBook}
                  onInspectBook={onInspectBook}
                />

                <EditorialBookStrip
                  eyebrow="02 · VỪA ĐƯA LÊN KỆ"
                  leadTitle="Mới cập nhật"
                  accentTitle="gần đây"
                  books={recentlyAddedBooks}
                  progress={progress}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  sessionRole={sessionRole}
                  isDark={isDark}
                  onOpenBook={onOpenBook}
                  onToggleSelect={toggleSelectBook}
                  onInspectBook={onInspectBook}
                />
              </>
            )}

            {/* Danh sách kệ sách */}
            <LibraryHomeShelvesSection
              visibleShelves={visibleShelves}
              totalBooksCount={books.length}
              progress={progress}
              favoriteShelfKeys={favoriteShelfKeys}
              sessionRole={sessionRole}
              isFiltering={isFiltering}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onOpenBook={onOpenBook}
              onInspectBook={onInspectBook}
              onToggleSelectBook={toggleSelectBook}
              onEditBook={onEditBook}
              onRenameShelf={onRenameShelf}
              onToggleFavoriteShelf={onToggleFavoriteShelf}
              onClearFilters={clearFilters}
            />
          </>
        )}
      </main>
    </div>
  );
}
