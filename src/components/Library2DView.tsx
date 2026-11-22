import { Suspense, lazy } from 'react';
import {
  BookMarked,
  BookOpen,
  Clock,
  FolderEdit,
  FolderInput,
  Library,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AuthRole, Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import { BookCard } from '@/components/BookCard';
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
    selectionMode,
    selectedIds,
    allShelves,
    libraryShelves,
    continueReadingBooks,
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
        onUploadClick={onUploadClick}
        onProtectionClick={onProtectionClick}
        unprotectedBookCount={unprotectedBookCount}
        onToggleSelectionMode={toggleSelectionMode}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        {/* Trạng thái đang tải lần đầu */}
        {loading && books.length === 0 ? (
          <LibraryGridSkeleton />
        ) : books.length === 0 ? (
          /* Trạng thái thư viện trống */
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
          /* Tab Thư viện (nạp lười giữ nhẹ bundle khởi đầu) */
          <Suspense fallback={<LibraryGridSkeleton />}>
            <LazyLibraryCatalogView
              allShelvesCount={allShelves.length}
              libraryShelves={libraryShelves}
              openedLibraryShelf={openedLibraryShelf}
              progress={progress}
              shelfCovers={shelfCovers}
              favoriteShelfKeys={favoriteShelfKeys}
              searchQuery={searchQuery}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSearchChange={setSearchQuery}
              onOpenShelf={openLibraryShelf}
              onCloseShelf={closeLibraryShelf}
              onOpenBook={onOpenBook}
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
          /* Tab Trang chủ */
          <>
            {/* Thanh tìm kiếm */}
            <section aria-label="Tìm kiếm thư viện" className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="text"
                    inputMode="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Tìm theo tên sách, tác giả hoặc tên kệ..."
                    aria-label="Tìm theo tên sách, tác giả hoặc tên kệ"
                    className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-9 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Xoá từ khoá tìm kiếm"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {isFiltering && (
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span>
                      Hiển thị <strong className="text-ink">{filteredBooks.length}</strong> /{' '}
                      {books.length} cuốn
                    </span>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-accent transition-colors hover:border-line-strong hover:bg-subtle"
                    >
                      Xoá lọc
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Thanh thao tác khi bật chế độ chọn nhiều */}
            {selectionMode && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-sm">
                <p className="text-sm text-ink">
                  Đã chọn <strong className="text-accent">{selectedIds.size}</strong> /{' '}
                  {filteredBooks.length} cuốn sách
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={
                      selectedIds.size === filteredBooks.length && filteredBooks.length > 0
                        ? clearSelection
                        : selectAllVisible
                    }
                    disabled={filteredBooks.length === 0}
                    className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
                  >
                    {selectedIds.size === filteredBooks.length && filteredBooks.length > 0
                      ? 'Bỏ chọn tất cả'
                      : 'Chọn tất cả'}
                  </button>
                  {onMoveSelectedToShelf && (
                    <button
                      type="button"
                      disabled={selectedBooks.length === 0}
                      onClick={() => onMoveSelectedToShelf(selectedBooks)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
                    >
                      <FolderInput className="h-3.5 w-3.5" />
                      Chuyển kệ ({selectedBooks.length})
                    </button>
                  )}
                  {onDeleteSelected && (
                    <button
                      type="button"
                      disabled={selectedBooks.length === 0}
                      onClick={() => onDeleteSelected(selectedBooks)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-600/20 disabled:opacity-45 dark:border-red-400/30 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xoá đã chọn ({selectedBooks.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleSelectionMode}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                  >
                    Xong
                  </button>
                </div>
              </div>
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
                      selectionMode={selectionMode}
                      selected={selectedIds.has(book.id)}
                      layout="horizontal"
                      onOpen={onOpenBook}
                      onToggleSelect={toggleSelectBook}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Danh sách kệ sách */}
            {visibleShelves.length === 0 ? (
              <section className="moonlit-card mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm dark:border-line-strong/60">
                <BookMarked className="mb-3 h-8 w-8 text-ink-faint" />
                <h2 className="font-display text-base font-semibold text-ink">
                  Không tìm thấy cuốn sách nào
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Thử đổi từ khoá tìm kiếm hoặc xoá bộ lọc kệ hiện tại.
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
                        {shelf.books.map((book) => (
                          <BookCard
                            key={book.id}
                            book={book}
                            progress={progress[book.id]}
                            selectionMode={selectionMode}
                            selected={selectedIds.has(book.id)}
                            onOpen={onOpenBook}
                            onToggleSelect={toggleSelectBook}
                            onEdit={onEditBook}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
