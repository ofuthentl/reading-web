import { Suspense, lazy, useEffect } from 'react';
import {
  BookMarked,
  BookOpen,
  Clock,
  FolderEdit,
  Library,
  Star,
  Upload,
} from 'lucide-react';
import type { AuthRole, Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import { BookCard } from '@/components/BookCard';
import { BulkSelectionBar } from '@/components/BulkSelectionBar';
import { EditorialBookStrip } from '@/components/EditorialBookStrip';
import { LibraryFilterBar } from '@/components/LibraryFilterBar';
import { LibraryHeader } from '@/components/LibraryHeader';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';
import type { ToastType } from '@/hooks/useToast';

const LazyLibraryCatalogView = lazy(() =>
  import('@/components/LibraryCatalogView').then((mod) => ({
    default: mod.LibraryCatalogView,
  })),
);

interface Library2DViewProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  shelfCovers?: Readonly<Record<string, string>>;
  favoriteShelfKeys?: ReadonlySet<string>;
  storage: StorageStats | null;
  loading: boolean;
  theme: AppTheme;
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
  onRenameShelf?: (shelfName: string) => void;
  onShelfCoverChanged?: (shelfName: string, bookId: string | null) => void;
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
            <div className="aspect-[3/4] w-full animate-pulse rounded-lg border border-line bg-subtle" />
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
  onRenameShelf,
  onShelfCoverChanged,
  onToggleFavoriteShelf,
  onMoveSelectedToShelf,
  onDeleteSelected,
  onApiError,
  onNotify,
}: Library2DViewProps) {
  const isDark = theme !== 'light';
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
    formatFilter,
    setFormatFilter,
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
  } = viewState;

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
    <div className="theme-canvas min-h-screen text-ink transition-colors duration-200">
      <LibraryHeader
        storage={storage}
        bookCount={books.length}
        loading={loading}
        theme={theme}
        selectionMode={selectionMode}
        selectedCount={selectedIds.size}
        showSelectionToggle={!isLibraryGridMode}
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

      <main className="mx-auto max-w-7xl space-y-9 px-4 py-6 sm:px-6 sm:py-8">
        {loading && books.length === 0 ? (
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
                ? 'Tải lên những cuốn EPUB, PDF hoặc DOCX yêu thích để bắt đầu xây dựng thư viện đồng bộ của riêng bạn.'
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
              allShelvesCount={allShelves.length}
              libraryShelves={libraryShelves}
              openedLibraryShelf={openedLibraryShelf}
              progress={progress}
              shelfCovers={shelfCovers}
              favoriteShelfKeys={favoriteShelfKeys}
              sessionRole={sessionRole}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              formatFilter={formatFilter}
              sortMode={sortMode}
              isFiltering={isFiltering}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSearchChange={setSearchQuery}
              onStatusChange={setStatusFilter}
              onFormatChange={setFormatFilter}
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
              onEditBook={onEditBook}
              onRenameShelf={onRenameShelf}
              onShelfCoverChanged={onShelfCoverChanged}
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
              statusFilter={statusFilter}
              formatFilter={formatFilter}
              sortMode={sortMode}
              isFiltering={isFiltering}
              filteredCount={filteredBooks.length}
              totalCount={books.length}
              unitLabel="cuốn"
              onSearchChange={setSearchQuery}
              onStatusChange={setStatusFilter}
              onFormatChange={setFormatFilter}
              onSortChange={setSortMode}
              onClearFilters={clearFilters}
            />

            {selectionMode && (
              <BulkSelectionBar
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
            {visibleShelves.length === 0 ? (
              <section className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm dark:border-line-strong/60">
                <BookMarked className="mb-3 h-8 w-8 text-ink-faint" />
                <h2 className="font-display text-base font-semibold text-ink">
                  Không tìm thấy cuốn sách nào
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Thử đổi từ khoá tìm kiếm hoặc xoá các bộ lọc trạng thái / định dạng hiện tại.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-xl border border-line-strong bg-canvas px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-subtle"
                >
                  Hiển thị toàn bộ thư viện
                </button>
              </section>
            ) : (
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
                      {visibleShelves.length} kệ · {books.length} cuốn
                    </span>
                  </div>
                )}

                <div className="space-y-9">
                  {visibleShelves.map((shelf) => {
                  const isFav = Boolean(favoriteShelfKeys?.has(shelf.key));
                  return (
                    <section key={shelf.key} aria-label={`Kệ ${shelf.name}`} className="space-y-4">
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
                              aria-label={isFav ? `Bỏ yêu thích kệ ${shelf.name}` : `Yêu thích kệ ${shelf.name}`}
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
                                  isFav ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : ''
                                }`}
                              />
                              <span className="hidden sm:inline">{isFav ? 'Đã yêu thích' : 'Yêu thích'}</span>
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
                            sessionRole={sessionRole}
                            selectionMode={selectionMode}
                            selected={selectedIds.has(book.id)}
                            onOpen={onOpenBook}
                            onToggleSelect={toggleSelectBook}
                            onEdit={onEditBook}
                            onInspect={onInspectBook}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
