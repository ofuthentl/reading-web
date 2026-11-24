import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSessionInfo, Book } from '@/types';
import { isAuthError, isCloudMode, setAuthToken } from '@/lib/api';
import {
  DEFAULT_GUEST_SESSION,
  DEFAULT_OWNER_SESSION,
  getActiveAuthSession,
} from '@/lib/authSession';
import {
  type GateRoute,
  getCurrentGateRoute,
  navigateGateRoute,
  replaceGateRoute,
  subscribeGateRoute,
  syncGateDocumentTitle,
} from '@/lib/gateRoutes';
import type { LibraryModalState } from '@/components/AdminModalsHost';
import { Library2DView } from '@/components/Library2DView';
import { ToastContainer } from '@/components/ToastContainer';
import { useBookReader } from '@/hooks/useBookReader';
import { useLibraryDataStore } from '@/hooks/useLibraryDataStore';
import { useLibraryViewState } from '@/hooks/useLibraryViewState';
import { useShelfDeepLink } from '@/hooks/useShelfDeepLink';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';

const LazyAuthGate = lazy(() => import('@/components/AuthGate').then((m) => ({ default: m.AuthGate })));
const LazyAdminModalsHost = lazy(() => import('@/components/AdminModalsHost').then((m) => ({ default: m.AdminModalsHost })));
const LazyLibrary2DDialogsHost = lazy(() => import('@/components/Library2DDialogsHost').then((m) => ({ default: m.Library2DDialogsHost })));
const LazyAdminUsageView = lazy(() => import('@/components/AdminUsageView').then((m) => ({ default: m.AdminUsageView })));
const LazyActiveReaderHost = lazy(() => import('@/components/ActiveReaderHost').then((m) => ({ default: m.ActiveReaderHost })));

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();

  const [authenticated, setAuthenticated] = useState(false);
  const [gateRoute, setGateRoute] = useState<GateRoute>(getCurrentGateRoute);
  const [session, setSession] = useState<AuthSessionInfo>(getActiveAuthSession);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [modal, setModal] = useState<LibraryModalState>({ kind: 'none' });
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => subscribeGateRoute(() => setGateRoute(getCurrentGateRoute())), []);

  useEffect(() => {
    if (!authenticated || gateRoute === 'usage') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authenticated, gateRoute]);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);
  const authResetCleanupRef = useRef<() => void>(() => undefined);

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (isAuthError(err)) {
        setAuthToken(null);
        setModal({ kind: 'none' });
        setInspectedBookId(null);
        setStatsOpen(false);
        setPaletteOpen(false);
        authResetCleanupRef.current();
        replaceGateRoute('locked');
        setAuthenticated(false);
        setSession(isCloudMode ? DEFAULT_GUEST_SESSION : DEFAULT_OWNER_SESSION);
        setAuthReason(message);
        addToast(message, 'warning');
        return;
      }
      addToast(message, 'error');
    },
    [addToast],
  );

  const store = useLibraryDataStore({
    session,
    setSession,
    onNonOwnerLoaded: closeModal,
    onApiError: handleApiError,
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
      store.collections, store.planToReadBookIds, store.planToReadShelfKeys,
      store.shelfPrefs.altTitles, store.shelfRatings,
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
    authenticated,
    onProgressUpdated: store.handleProgressUpdated,
    onApiError: handleApiError,
  });
  const { closeBook } = reader;
  const { loadLibrary, clearStoreOnLogout, applyShelfRenamed } = store;
  const { clearFilters, closeLibraryShelf } = libraryViewState;

  authResetCleanupRef.current = () => {
    closeBook();
    clearStoreOnLogout();
    clearFilters();
    closeLibraryShelf();
  };

  useEffect(() => {
    if (authenticated) {
      const current = getCurrentGateRoute();
      if (session.role === 'owner' && current === 'usage') {
        syncGateDocumentTitle('usage', true);
      } else {
        replaceGateRoute('root');
        syncGateDocumentTitle('root', true);
      }
      void loadLibrary();
    } else {
      closeBook();
    }
  }, [authenticated, closeBook, loadLibrary, session.role]);

  useEffect(() => {
    if (!authenticated) return;
    if (
      gateRoute === 'locked' ||
      gateRoute === 'entrance' ||
      (gateRoute === 'usage' && session.role !== 'owner')
    ) {
      replaceGateRoute('root');
      syncGateDocumentTitle('root', true);
      return;
    }
    syncGateDocumentTitle(gateRoute, true);
  }, [authenticated, gateRoute, session.role]);

  useEffect(() => {
    if (!authenticated || session.expiresAt === null) return;
    const expiresAt = session.expiresAt;
    const expireMessage =
      session.role === 'guest'
        ? 'Phiên truy cập 24 giờ đã hết hạn.'
        : 'Phiên đăng nhập đã hết hạn.';

    const closeExpiredDoor = () => {
      setAuthToken(null);
      authResetCleanupRef.current();
      setModal({ kind: 'none' });
      setInspectedBookId(null);
      setStatsOpen(false);
      setPaletteOpen(false);
      replaceGateRoute('locked');
      setAuthenticated(false);
      setSession(isCloudMode ? DEFAULT_GUEST_SESSION : DEFAULT_OWNER_SESSION);
      setAuthReason(expireMessage);
      addToast(expireMessage, 'warning');
    };

    const MAX_TIMEOUT_MS = 2_147_483_647;
    let timerId: number | null = null;
    const scheduleExpiry = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        closeExpiredDoor();
        return;
      }
      // Chia chặng hẹn giờ để phiên owner 30 ngày không vượt ngưỡng 24.85 ngày của setTimeout (vá L-06)
      timerId = window.setTimeout(scheduleExpiry, Math.min(remainingMs, MAX_TIMEOUT_MS));
    };
    scheduleExpiry();
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [addToast, authenticated, session.expiresAt, session.role]);

  const existingShelves = useMemo(
    () => libraryViewState.allShelves.map((shelf) => shelf.name),
    [libraryViewState.allShelves],
  );

  const handleAuthenticated = useCallback((nextSession: AuthSessionInfo) => {
    setSession(nextSession);
    setAuthReason(null);
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    authResetCleanupRef.current();
    setModal({ kind: 'none' });
    setInspectedBookId(null);
    setStatsOpen(false);
    setPaletteOpen(false);
    replaceGateRoute('locked');
    setAuthenticated(false);
    setSession(isCloudMode ? DEFAULT_GUEST_SESSION : DEFAULT_OWNER_SESSION);
    setAuthReason(null);
    addToast('Đã đóng cửa thư viện.', 'info');
  }, [addToast]);

  const { setActiveTab, openLibraryShelf, syncRenamedShelf } = libraryViewState;
  const handleJumpToShelf = useCallback(
    (shelfKey: string) => {
      setActiveTab('library');
      openLibraryShelf(shelfKey);
    },
    [openLibraryShelf, setActiveTab],
  );
  const handleSwitchToLibraryTab = useCallback(() => setActiveTab('library'), [setActiveTab]);

  useShelfDeepLink({
    authenticated,
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

  if (!authenticated) {
    return (
      <>
        <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
          <LazyAuthGate
            onAuthenticated={handleAuthenticated}
            authReason={authReason}
            theme={theme}
            onCycleTheme={cycleTheme}
          />
        </Suspense>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isOwner = session.role === 'owner';

  if (isOwner && gateRoute === 'usage') {
    return (
      <>
        <Suspense fallback={<div className="theme-canvas min-h-screen" />}>
          <LazyAdminUsageView
            theme={theme}
            onCycleTheme={cycleTheme}
            onBackToLibrary={() => navigateGateRoute('root')}
            onLogout={handleLogout}
            onApiError={handleApiError}
          />
        </Suspense>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isReaderOpen = Boolean(reader.activeBook && (reader.parsedBook || reader.guestSession));

  const renamingShelfName = modal.kind === 'rename-shelf' ? modal.shelfName : null;
  const renamingShelfKey = renamingShelfName?.trim().toLocaleLowerCase('vi') ?? null;
  const renamingShelfCount = renamingShelfKey
    ? store.books.filter(
        (book) =>
          (book.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi') === renamingShelfKey,
      ).length
    : 0;

  return (
    <>
      {!isReaderOpen && (
        <Library2DView
          books={store.books}
          progress={store.progress}
          storage={store.storage}
          loading={store.loading}
          theme={theme}
          viewState={libraryViewState}
          sessionRole={session.role}
          sessionExpiresAt={session.expiresAt}
          onCycleTheme={cycleTheme}
          onOpenStats={() => setStatsOpen(true)}
          onOpenUsage={isOwner ? () => navigateGateRoute('usage') : undefined}
          onOpenLibraryHealth={
            isOwner ? () => setModal({ kind: 'library-health' }) : undefined
          }
          onOpenCacheManager={
            isOwner ? () => setModal({ kind: 'cache-manager' }) : undefined
          }
          onRefresh={() => void loadLibrary()}
          onLogout={handleLogout}
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
            isOwner ? (shelfName: string) => setModal({ kind: 'rename-shelf', shelfName }) : undefined
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
          onApiError={handleApiError}
          onNotify={addToast}
        />
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
            onApiError={handleApiError}
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
            onOpenStats={() => { closeBook(); setStatsOpen(true); }}
            onOpenBook={(book, jumpTarget) => void reader.openBook(book, jumpTarget)}
            onJumpToShelf={(shelfKey) => { closeBook(); handleJumpToShelf(shelfKey); }}
            onSelectAuthor={(author) => { closeBook(); setActiveTab('home'); libraryViewState.filterByAuthor(author); }}
            onSelectCollection={(colId) => { closeBook(); setActiveTab('library'); libraryViewState.closeLibraryShelf(); libraryViewState.setActiveCollectionId(colId); }}
            onCycleTheme={cycleTheme}
            onUploadClick={isOwner ? () => { closeBook(); setModal({ kind: 'upload' }); } : undefined}
            onMarkCompleted={store.handleMarkBookCompleted}
            onStartReread={store.handleStartRereadBook}
            onResetProgress={store.handleResetBookProgress}
            onTogglePlanToReadBook={store.handleTogglePlanToReadBook}
            onEditBook={isOwner ? (book: Book) => setModal({ kind: 'edit', book }) : undefined}
            onManageBookAccess={
              isOwner ? (book: Book) => setModal({ kind: 'book-access', book }) : undefined
            }
            onOpenLibraryHealth={
              isOwner ? () => { closeBook(); setModal({ kind: 'library-health' }); } : undefined
            }
            onOpenCacheManager={
              isOwner ? () => { closeBook(); setModal({ kind: 'cache-manager' }); } : undefined
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
            onBookPackSynced={store.handleBookPackSynced}
            onBookAccessSaved={store.handleBookAccessChanged}
            onShelfRenamed={handleShelfRenamed}
            onBooksShelfMoved={store.handleBooksShelfMoved}
            onBooksDeleted={store.handleBooksDeleted}
            onApiError={handleApiError}
            onNotify={addToast}
          />
        </Suspense>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
