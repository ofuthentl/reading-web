import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Compass, Pencil, Upload, X } from 'lucide-react';
import type { Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import { LibraryHeader } from '@/components/LibraryHeader';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';
import { buildLibraryLayout3D } from './layout3d';
import { createCoverTextureCache } from './coverTextureCache';
import { LibraryCanvas } from './LibraryCanvas';

export interface FantasyLibrary3DProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  storage: StorageStats | null;
  loading: boolean;
  theme: AppTheme;
  viewState: LibraryViewState;
  canUse3D: boolean;
  viewMode: ViewMode;
  prefersReducedMotion: boolean;
  paused?: boolean;
  dimmed?: boolean;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onFallbackTo2D: (reason: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenBook: (book: Book) => void;
  onUploadClick: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

/**
 * Demand-rendered 3D Grand Classical Library view (Sub-phase 4A.3).
 * Full HTML overlay (search, filters, multi-select bar, BookInspectCard) arrives in 4A.4.
 */
export function FantasyLibrary3D({
  books,
  storage,
  loading,
  theme,
  viewState,
  canUse3D,
  viewMode,
  prefersReducedMotion,
  paused = false,
  dimmed = false,
  onCycleTheme,
  onChangeViewMode,
  onFallbackTo2D,
  onRefresh,
  onLogout,
  onOpenBook,
  onUploadClick,
  onEditBook,
}: FantasyLibrary3DProps) {
  const [hoveredBook, setHoveredBook] = useState<Book | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [centerShelfKey, setCenterShelfKey] = useState<string | null>(null);
  const [focusState, setFocusState] = useState<{ key: string | null; nonce: number }>({
    key: null,
    nonce: 0,
  });

  const coverTextureCache = useMemo(() => createCoverTextureCache(), []);
  const prevCoverKeysRef = useRef<Map<string, string | null>>(new Map());

  // Guarantee complete GPU/ImageBitmap cleanup on unmount
  useEffect(() => {
    return () => {
      coverTextureCache.disposeAll();
    };
  }, [coverTextureCache]);

  // Evict stale cover textures if a book's cover_key was updated via BookEditModal
  useEffect(() => {
    const prevMap = prevCoverKeysRef.current;
    const nextMap = new Map<string, string | null>();
    for (let i = 0; i < books.length; i += 1) {
      const book = books[i];
      nextMap.set(book.id, book.cover_key);
      const prevKey = prevMap.get(book.id);
      if (prevKey && prevKey !== book.cover_key) {
        coverTextureCache.evict(prevKey);
      }
    }
    prevCoverKeysRef.current = nextMap;
  }, [books, coverTextureCache]);

  const layout = useMemo(
    () => buildLibraryLayout3D(viewState.visibleShelves),
    [viewState.visibleShelves],
  );

  // Drop selectedBookId if book was deleted or filtered out
  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return layout.bookById.get(selectedBookId)?.book ?? null;
  }, [layout.bookById, selectedBookId]);

  useEffect(() => {
    if (selectedBookId && !layout.bookById.has(selectedBookId)) {
      setSelectedBookId(null);
    }
  }, [layout.bookById, selectedBookId]);

  const handleSelectBook = useCallback(
    (book: Book) => {
      if (viewState.selectionMode) {
        viewState.toggleSelectBook(book.id);
        return;
      }
      setSelectedBookId(book.id);
    },
    [viewState],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedBookId(null);
  }, []);

  const handleJumpToShelf = useCallback((shelfKey: string) => {
    setFocusState((prev) => ({ key: shelfKey, nonce: prev.nonce + 1 }));
  }, []);

  const handleRefresh = useCallback(() => {
    coverTextureCache.clearFailedCache();
    onRefresh();
  }, [coverTextureCache, onRefresh]);

  const activeFocusBook = selectedBook ?? hoveredBook;

  return (
    <div className="theme-canvas relative h-screen w-screen overflow-hidden text-ink select-none">
      <LibraryHeader
        storage={storage}
        bookCount={books.length}
        loading={loading}
        theme={theme}
        selectionMode={viewState.selectionMode}
        selectedCount={viewState.selectedIds.size}
        canUse3D={canUse3D}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        onCycleTheme={onCycleTheme}
        onUploadClick={onUploadClick}
        onToggleSelectionMode={viewState.toggleSelectionMode}
        onRefresh={handleRefresh}
        onLogout={onLogout}
      />

      <LibraryCanvas
        layout={layout}
        theme={theme}
        coverTextureCache={coverTextureCache}
        focusShelfKey={focusState.key}
        focusNonce={focusState.nonce}
        hoveredBookId={hoveredBook?.id ?? null}
        selectedBookId={selectedBook?.id ?? null}
        selectionMode={viewState.selectionMode}
        selectedIds={viewState.selectedIds}
        prefersReducedMotion={prefersReducedMotion}
        paused={paused}
        dimmed={dimmed}
        onHoverBook={setHoveredBook}
        onSelectBook={handleSelectBook}
        onClearSelection={handleClearSelection}
        onVisibleShelfChange={setCenterShelfKey}
        onFallbackTo2D={onFallbackTo2D}
      />

      {/* Lightweight Sub-phase 4A.3 HUD (strictly <= z-20 so modals z-40 & toasts z-50 sit above) */}
      {layout.shelves.length > 0 && !paused && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-4xl items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface/85 px-2.5 py-1.5 shadow-sm backdrop-blur-md">
            <Compass className="ml-1 h-3.5 w-3.5 shrink-0 text-accent" />
            {layout.shelves.map((shelf) => {
              const isCurrent = shelf.key === centerShelfKey;
              return (
                <button
                  key={shelf.key}
                  type="button"
                  onClick={() => handleJumpToShelf(shelf.key)}
                  className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-accent text-accent-foreground'
                      : 'text-ink-muted hover:bg-subtle hover:text-ink'
                  }`}
                >
                  {shelf.name} ({shelf.bookCount})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {layout.shelves.length === 0 && !loading && !paused && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="pointer-events-auto rounded-2xl border border-line bg-surface/90 px-6 py-5 text-center shadow-lg backdrop-blur-md">
            <p className="font-display text-base font-semibold text-ink">
              {viewState.isFiltering ? 'Không tìm thấy sách khớp bộ lọc' : 'Thư viện chưa có sách'}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {viewState.isFiltering ? (
                <button
                  type="button"
                  onClick={viewState.clearFilters}
                  className="rounded-xl bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
                >
                  Xoá bộ lọc
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onUploadClick}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Tải sách lên
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!paused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2 px-4">
          {activeFocusBook && (
            <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface/92 px-4 py-2.5 shadow-lg backdrop-blur-md">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-ink">
                  {activeFocusBook.title}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {activeFocusBook.author} · {activeFocusBook.shelf}
                </p>
              </div>
              {selectedBook && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenBook(selectedBook)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Đọc ngay
                  </button>
                  {onEditBook && (
                    <button
                      type="button"
                      onClick={() => onEditBook(selectedBook)}
                      className="rounded-xl border border-line bg-canvas p-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                      title="Sửa thông tin sách"
                      aria-label="Sửa thông tin sách"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="rounded-xl border border-line bg-canvas p-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    title="Bỏ chọn"
                    aria-label="Bỏ chọn"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="rounded-full border border-line/70 bg-surface/75 px-3 py-1 text-[11px] text-ink-muted backdrop-blur-sm">
            Kéo chuột · Lăn con lăn · Phím ← / → để lướt đại sảnh · Nhấn sách để mở
          </p>
        </div>
      )}
    </div>
  );
}
