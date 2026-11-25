import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthSessionInfo, Book } from '@/types';
import type { LibraryModalState } from '@/components/AdminModalsHost';
import { useBookReader } from '@/hooks/useBookReader';
import { useLibraryDataStore } from '@/hooks/useLibraryDataStore';
import { useLibraryViewState } from '@/hooks/useLibraryViewState';
import { useShelfDeepLink } from '@/hooks/useShelfDeepLink';
import type { UiTheme } from '@/hooks/useTheme';
import type { ToastAction, ToastType } from '@/hooks/useToast';

const LazyLibrary2DView = lazy(() =>
  import('@/components/Library2DView').then((m) => ({ default: m.Library2DView })),
);
const LazyAdminModalsHost = lazy(() =>
  import('@/components/AdminModalsHost').then((m) => ({ default: m.AdminModalsHost })),
);
const LazyLibrary2DDialogsHost = lazy(() =>
  import('@/components/Library2DDialogsHost').then((m) => ({ default: m.Library2DDialogsHost })),
);
const LazyActiveReaderHost = lazy(() =>
  import('@/components/ActiveReaderHost').then((m) => ({ default: m.ActiveReaderHost })),
);

export interface AuthenticatedLibraryShellProps {
  session: AuthSessionInfo;
  setSession: (next: AuthSessionInfo) => void;
  theme: UiTheme;
  onCycleTheme: () => void;
  onOpenUsage?: () => void;
  onLogout: () => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  addToast: (
    message: string,
    type?: ToastType,
    durationMs?: number,
    action?: ToastAction,
  ) => void;
  onRegisterCleanup: (fn: (() => void) | null) => void;
}

export function AuthenticatedLibraryShell({
  session,
  setSession,
  theme,
  onCycleTheme,
  onOpenUsage,
  onLogout,
  onApiError,
  addToast,
  onRegisterCleanup,
}: AuthenticatedLibraryShellProps) {
  const [modal, setModal] = useState<LibraryModalState>({ kind: 'none' });
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  const store = useLibraryDataStore({
    session,
    setSession,
    onNonOwnerLoaded: closeModal,
    onApiError,
    addToast,
  });

  const catalogViewOptions = useMemo(
    () => ({
      shelfAltTitles: store.shelfPrefs.altTitles,
      shelfRatings: store.shelfRatings,
      planToReadShelfKeys: store.planToReadShelfKeys,
      planToReadBookIds: store.planToReadBookIds,
      collections: store.collections,
    }),
    [
      store.collections,
      store.planToReadBookIds,
      store.planToReadShelfKeys,
      store.shelfPrefs.altTitles,
      store.shelfRatings,
    ],
  );

  const libraryViewState = useLibraryViewState(
    store.books,
    store.progress,
    store.selectionResetKey,
    store.effectiveFavoriteShelfKeys,
    store.weeklyPopularIds,
    session.role,
    store.shelfPrefs.tags,
    catalogViewOptions,
  );

  const inspectedBook = useMemo(
    () => (inspectedBookId ? store.books.find((b) => b.id === inspectedBookId) ?? null : null),
    [inspectedBookId, store.books],
  );

  const reader = useBookReader({
    appTheme: theme,
    sessionRole: session.role,
    authenticated: true,
    progressMap: store.progress,
    onProgressUpdated: store.handleProgressUpdated,
    onApiError,
  });

  const { closeBook } = reader;
  const { loadLibrary, clearStoreOnLogout, applyShelfRenamed } = store;
  const { clearFilters, closeLibraryShelf, setActiveTab, openLibraryShelf, syncRenamedShelf } =
    libraryViewState;

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    onRegisterCleanup(() => {
      closeBook();
      clearStoreOnLogout();
      clearFilters();
      closeLibraryShelf();
      setModal({ kind: 'none' });
      setInspectedBookId(null);
      setStatsOpen(false);
      setPaletteOpen(false);
    });
    return () => onRegisterCleanup(null);
  }, [clearFilters, clearStoreOnLogout, closeBook, closeLibraryShelf, onRegisterCleanup]);

  const existingShelves = useMemo(
    () => libraryViewState.allShelves.map((shelf) => shelf.name),
    [libraryViewState.allShelves],
  );

  const handleJumpToShelf = useCallback(
    (shelfKey: string) => {
      setActiveTab('library');
      openLibraryShelf(shelfKey);
    },
    [openLibraryShelf, setActiveTab],
  );
  const handleSwitchToLibraryTab = useCallback(() => setActiveTab('library'), [setActiveTab]);

  useShelfDeepLink({
    authenticated: true,
    hasLoadedOnce: store.hasLoadedOnce,
    allShelves: libraryViewState.allShelves,
    sessionRole: session.role,
    onJumpToShelf: handleJumpToShelf,
    onSwitchToLibraryTab: handleSwitchToLibraryTab,
    addToast,
  });

  const handleShelfRenamed = useCallback(
    (oldName: string, newName: string) => {
      applyShelfRenamed(oldName, newName);
      syncRenamedShelf(oldName, newName);
    },
    [applyShelfRenamed, syncRenamedShelf],
  );

  const isOwner = session.role === 'owner';
  const isReaderOpen = Boolean(reader.activeBook && (reader.parsedBook || reader.guestSession));

  const renamingShelfName = modal.kind === 'rename-shelf' ? modal.shelfName : null;
  const renamingShelfKey = renamingShelfName
    ? renamingShelfName.normalize('NFC').trim().toLocaleLowerCase('vi')
    : null;
  const renamingShelfCount = renamingShelfKey
    ? store.books.filter(
        (book) =>
          (book.shelf || 'Kho chưa phân loại')
            .normalize('NFC')
            .trim()
            .toLocaleLowerCase('vi') === renamingShelfKey,
      ).length
    : 0;

  return (
    <>
      {!isReaderOpen && (
        <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
          <LazyLibrary2DView
            books={store.books}
            progress={store.progress}
            storage={store.storage}
            loading={store.loading}
            theme={theme}
            viewState={libraryViewState}
            sessionRole={session.role}
            sessionExpiresAt={session.expiresAt}
            onCycleTheme={onCycleTheme}
            onOpenStats={() => setStatsOpen(true)}
            onOpenUsage={isOwner ? onOpenUsage : undefined}
            onOpenLibraryHealth={
              isOwner ? () => setModal({ kind: 'library-health' }) : undefined
            }
            onOpenCacheManager={
              isOwner ? () => setModal({ kind: 'cache-manager' }) : undefined
            }
            onRefresh={() => void loadLibrary()}
            onLogout={onLogout}
            onOpenBook={(book: Book) => void reader.openBook(book)}
            onInspectBook={(book: Book) => setInspectedBookId(book.id)}
            onDismissContinue={store.handleResetBookProgress}
            onUploadClick={isOwner ? () => setModal({ kind: 'upload' }) : undefined}
            onProtectionClick={isOwner ? () => setModal({ kind: 'protection' }) : undefined}
            unprotectedBookCount={isOwner ? store.unprotectedBookCount : 0}
            onEditBook={isOwner ? (book: Book) => setModal({ kind: 'edit', book }) : undefined}
            onManageBookAccess={
              isOwner ? (book: Book) => setModal({ kind: 'book-access', book }) : undefined
            }
            onBooksUpdated={isOwner ? store.handleBooksBatchUpdated : undefined}
            onRenameShelf={
              isOwner
                ? (shelfName: string) => setModal({ kind: 'rename-shelf', shelfName })
                : undefined
            }
            onMoveSelectedToShelf={
              isOwner
                ? (selectedBooks: Book[]) => setModal({ kind: 'bulk-shelf', books: selectedBooks })
                : undefined
            }
            onDeleteSelected={
              isOwner
                ? (selectedBooks: Book[]) => setModal({ kind: 'delete', books: selectedBooks })
                : undefined
            }
            shelfCovers={store.shelfPrefs.covers}
            shelfAccess={isOwner ? store.shelfPrefs.access : undefined}
            shelfTags={store.shelfPrefs.tags}
            shelfAltTitles={store.shelfPrefs.altTitles}
            shelfRatings={store.shelfRatings}
            shelfRelations={store.shelfRelations}
            bookAccess={isOwner ? store.bookAccess : undefined}
            favoriteShelfKeys={store.effectiveFavoriteShelfKeys}
            planToReadShelfKeys={store.planToReadShelfKeys}
            planToReadBookIds={store.planToReadBookIds}
            collections={store.collections}
            onShelfCoverChanged={isOwner ? store.handleShelfCoverChanged : undefined}
            onShelfAccessChanged={isOwner ? store.handleShelfAccessChanged : undefined}
            onShelfTagsChanged={isOwner ? store.handleShelfTagsChanged : undefined}
            onShelfAltTitlesChanged={isOwner ? store.handleShelfAltTitlesChanged : undefined}
            onShelfRatingUpdated={store.handleShelfRatingUpdated}
            onShelfRelationSaved={isOwner ? store.handleShelfRelationSaved : undefined}
            onShelfRelationDeleted={isOwner ? store.handleShelfRelationDeleted : undefined}
            onToggleFavoriteShelf={store.handleToggleFavoriteShelf}
            onTogglePlanToRead={store.handleTogglePlanToRead}
            onTogglePlanToReadBook={store.handleTogglePlanToReadBook}
            onCollectionSaved={isOwner ? store.handleCollectionSaved : undefined}
            onCollectionDeleted={isOwner ? store.handleCollectionDeleted : undefined}
            onApiError={onApiError}
            onNotify={addToast}
          />
        </Suspense>
      )}

      {(reader.activeBook || reader.openingBook) && (
        <Suspense fallback={null}>
          <LazyActiveReaderHost
            activeBook={reader.activeBook}
            openingBook={reader.openingBook}
            parsedBook={reader.parsedBook}
            guestSession={reader.guestSession}
            loadedFromCache={reader.loadedFromCache}
            initialJump={reader.initialJump}
            settings={reader.settings}
            session={session}
            books={store.books}
            progress={store.progress}
            onUpdateSettings={reader.updateSettings}
            onSaveProgress={reader.handleSaveProgress}
            onOpenBook={(book, jumpTarget) => void reader.openBook(book, jumpTarget)}
            onApiError={onApiError}
            onCancelOpening={reader.cancelOpeningBook}
            onClose={reader.closeBook}
          />
        </Suspense>
      )}

      {(inspectedBook || statsOpen || paletteOpen) && (
        <Suspense fallback={null}>
          <LazyLibrary2DDialogsHost
            inspectedBook={inspectedBook}
            statsOpen={statsOpen}
            paletteOpen={paletteOpen}
            books={store.books}
            shelves={libraryViewState.allShelves}
            authors={libraryViewState.availableAuthors}
            collections={store.collections}
            shelfCovers={store.shelfPrefs.covers}
            shelfAltTitles={store.shelfPrefs.altTitles}
            shelfRatings={store.shelfRatings}
            progress={store.progress}
            planToReadBookIds={store.planToReadBookIds}
            sessionRole={session.role}
            dailyGoalMinutes={reader.settings.dailyGoalMinutes}
            onChangeDailyGoalMinutes={(mins) => reader.updateSettings({ dailyGoalMinutes: mins })}
            onCloseInspect={() => setInspectedBookId(null)}
            onCloseStats={() => setStatsOpen(false)}
            onClosePalette={() => setPaletteOpen(false)}
            onOpenStats={() => {
              closeBook();
              setStatsOpen(true);
            }}
            onOpenBook={(book, jumpTarget) => void reader.openBook(book, jumpTarget)}
            onJumpToShelf={(shelfKey) => {
              closeBook();
              handleJumpToShelf(shelfKey);
            }}
            onSelectAuthor={(author) => {
              closeBook();
              libraryViewState.filterByAuthor(author);
            }}
            onSelectCollection={(colId) => {
              closeBook();
              setActiveTab('library');
              libraryViewState.closeLibraryShelf();
              libraryViewState.setActiveCollectionId(colId);
            }}
            onApiError={onApiError}
            onCycleTheme={onCycleTheme}
            onUploadClick={
              isOwner
                ? () => {
                    closeBook();
                    setModal({ kind: 'upload' });
                  }
                : undefined
            }
            onMarkCompleted={store.handleMarkBookCompleted}
            onStartReread={store.handleStartRereadBook}
            onResetProgress={store.handleResetBookProgress}
            onTogglePlanToReadBook={store.handleTogglePlanToReadBook}
            onEditBook={isOwner ? (book: Book) => setModal({ kind: 'edit', book }) : undefined}
            onManageBookAccess={
              isOwner ? (book: Book) => setModal({ kind: 'book-access', book }) : undefined
            }
            onOpenLibraryHealth={
              isOwner
                ? () => {
                    closeBook();
                    setModal({ kind: 'library-health' });
                  }
                : undefined
            }
            onOpenCacheManager={
              isOwner
                ? () => {
                    closeBook();
                    setModal({ kind: 'cache-manager' });
                  }
                : undefined
            }
          />
        </Suspense>
      )}

      {isOwner && modal.kind !== 'none' && (
        <Suspense fallback={null}>
          <LazyAdminModalsHost
            modal={modal}
            books={store.books}
            shelves={libraryViewState.allShelves}
            shelfTags={store.shelfPrefs.tags}
            shelfAltTitles={store.shelfPrefs.altTitles}
            storage={store.storage}
            existingShelves={existingShelves}
            renamingShelfName={renamingShelfName}
            renamingShelfCount={renamingShelfCount}
            onClose={closeModal}
            onSwitchModal={setModal}
            onJumpToShelf={handleJumpToShelf}
            onRequestDelete={(book) => setModal({ kind: 'delete', books: [book] })}
            onBookUploaded={store.handleBookUploaded}
            onBookUpdated={store.handleBookUpdated}
            onBooksUpdated={store.handleBooksBatchUpdated}
            onShelfAltTitlesChanged={store.handleShelfAltTitlesChanged}
            onShelfTagsChanged={store.handleShelfTagsChanged}
            onStorageSynced={store.handleStorageSynced}
            onBookPackSynced={store.handleBookPackSynced}
            onBookAccessSaved={store.handleBookAccessChanged}
            onShelfRenamed={handleShelfRenamed}
            onBooksShelfMoved={store.handleBooksShelfMoved}
            onBooksDeleted={store.handleBooksDeleted}
            onApiError={onApiError}
            onNotify={addToast}
          />
        </Suspense>
      )}
    </>
  );
}
