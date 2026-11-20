import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';
import { buildLibraryLayout3D } from './layout3d';
import { createCoverTextureCache } from './coverTextureCache';
import { LibraryCanvas } from './LibraryCanvas';
import { Library3DOverlay } from './Library3DOverlay';

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
 * Full 3D Grand Classical Library view connecting the demand-rendered WebGL scene
 * (`LibraryCanvas`) with the shared-state HTML HUD (`Library3DOverlay` + `BookInspectCard`).
 */
export function FantasyLibrary3D({
  books,
  progress,
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
  onRenameShelf,
  onMoveSelectedToShelf,
  onDeleteSelected,
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

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return layout.bookById.get(selectedBookId)?.book ?? null;
  }, [layout.bookById, selectedBookId]);

  useEffect(() => {
    if (selectedBookId && !layout.bookById.has(selectedBookId)) {
      setSelectedBookId(null);
    }
  }, [layout.bookById, selectedBookId]);

  // Clear hover if book disappears after filtering/deleting
  useEffect(() => {
    if (hoveredBook && !layout.bookById.has(hoveredBook.id)) {
      setHoveredBook(null);
    }
  }, [layout.bookById, hoveredBook]);

  // Fly camera to the first matching shelf when user types a search query or picks a shelf filter
  const firstVisibleShelfKey = layout.shelves[0]?.key ?? null;
  useEffect(() => {
    if (viewState.activeShelfKey) {
      setFocusState((prev) => ({ key: viewState.activeShelfKey, nonce: prev.nonce + 1 }));
    } else if (viewState.searchQuery.trim() && firstVisibleShelfKey) {
      setFocusState((prev) => ({ key: firstVisibleShelfKey, nonce: prev.nonce + 1 }));
    }
  }, [viewState.activeShelfKey, viewState.searchQuery, firstVisibleShelfKey]);

  // Close pinned BookInspectCard on Escape when not typing in an input
  useEffect(() => {
    if (!selectedBookId || paused) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      setSelectedBookId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBookId, paused]);

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

  const handleStepShelf = useCallback(
    (direction: -1 | 1) => {
      if (layout.shelves.length <= 1) return;
      const currentIndex = layout.shelves.findIndex((shelf) => shelf.key === centerShelfKey);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.min(
        layout.shelves.length - 1,
        Math.max(0, baseIndex + direction),
      );
      const target = layout.shelves[nextIndex];
      if (target) {
        setFocusState((prev) => ({ key: target.key, nonce: prev.nonce + 1 }));
      }
    },
    [layout.shelves, centerShelfKey],
  );

  const handleRefresh = useCallback(() => {
    coverTextureCache.clearFailedCache();
    onRefresh();
  }, [coverTextureCache, onRefresh]);

  return (
    <div className="theme-canvas relative h-screen w-screen overflow-hidden text-ink select-none">
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

      <Library3DOverlay
        books={books}
        progress={progress}
        storage={storage}
        loading={loading}
        theme={theme}
        viewState={viewState}
        canUse3D={canUse3D}
        viewMode={viewMode}
        paused={paused}
        centerShelfKey={centerShelfKey}
        selectedBook={selectedBook}
        hoveredBook={hoveredBook}
        onJumpToShelf={handleJumpToShelf}
        onStepShelf={handleStepShelf}
        onClearSelectedBook={handleClearSelection}
        onCycleTheme={onCycleTheme}
        onChangeViewMode={onChangeViewMode}
        onRefresh={handleRefresh}
        onLogout={onLogout}
        onOpenBook={onOpenBook}
        onUploadClick={onUploadClick}
        onEditBook={onEditBook}
        onRenameShelf={onRenameShelf}
        onMoveSelectedToShelf={onMoveSelectedToShelf}
        onDeleteSelected={onDeleteSelected}
      />
    </div>
  );
}
