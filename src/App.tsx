import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthSessionInfo, Book } from '@/types';
import { isAuthError, setAuthToken } from '@/lib/api';
import { DEFAULT_OWNER_SESSION, getActiveAuthSession } from '@/lib/authSession';
import { replaceGateRoute, syncGateDocumentTitle } from '@/lib/gateRoutes';
import { ActiveReaderHost } from '@/components/ActiveReaderHost';
import type { LibraryModalState } from '@/components/AdminModalsHost';
import { AuthGate } from '@/components/AuthGate';
import { Library2DView } from '@/components/Library2DView';
import { Library3DHost } from '@/components/Library3DHost';
import { ToastContainer } from '@/components/ToastContainer';
import { useBookReader } from '@/hooks/useBookReader';
import { useCanUse3D } from '@/hooks/useCanUse3D';
import { useLibraryDataStore } from '@/hooks/useLibraryDataStore';
import { useLibraryViewState } from '@/hooks/useLibraryViewState';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';

const LazyAdminModalsHost = lazy(() =>
  import('@/components/AdminModalsHost').then((mod) => ({ default: mod.AdminModalsHost })),
);

const LazyLibrary2DDialogsHost = lazy(() =>
  import('@/components/Library2DDialogsHost').then((mod) => ({
    default: mod.Library2DDialogsHost,
  })),
);

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();
  const {
    canUse3D,
    effectiveMode,
    prefersReducedMotion,
    retryKey,
    setViewMode,
    mark3DFailed,
  } = useCanUse3D();

  const [authenticated, setAuthenticated] = useState(false);
  const [session, setSession] = useState<AuthSessionInfo>(getActiveAuthSession);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [modal, setModal] = useState<LibraryModalState>({ kind: 'none' });
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  const handleFallbackTo2D = useCallback(
    (reason: string) => {
      mark3DFailed();
      addToast(reason, 'warning');
    },
    [addToast, mark3DFailed],
  );

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (isAuthError(err)) {
        setAuthToken(null);
        setModal({ kind: 'none' });
        setInspectedBookId(null);
        setStatsOpen(false);
        replaceGateRoute('locked');
        setAuthenticated(false);
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

  const libraryViewState = useLibraryViewState(
    store.books,
    store.progress,
    store.selectionResetKey,
    store.effectiveFavoriteShelfKeys,
    store.weeklyPopularIds,
    session.role,
  );

  const inspectedBook = useMemo(
    () => (inspectedBookId ? store.books.find((b) => b.id === inspectedBookId) ?? null : null),
    [inspectedBookId, store.books],
  );

  const reader = useBookReader({
    appTheme: theme,
    sessionRole: session.role,
    onProgressUpdated: store.handleProgressUpdated,
    onApiError: handleApiError,
  });
  const { closeBook } = reader;
  const { loadLibrary, clearStoreOnLogout, applyShelfRenamed } = store;

  useEffect(() => {
    if (authenticated) {
      replaceGateRoute('root');
      syncGateDocumentTitle('root', true);
      void loadLibrary();
    } else {
      closeBook();
    }
  }, [authenticated, closeBook, loadLibrary]);

  useEffect(() => {
    if (!authenticated || session.expiresAt === null) return;
    const expireMessage =
      session.role === 'guest'
        ? 'Phiên truy cập 24 giờ đã hết hạn.'
        : 'Phiên đăng nhập đã hết hạn.';

    const closeExpiredDoor = () => {
      setAuthToken(null);
      closeBook();
      setModal({ kind: 'none' });
      setInspectedBookId(null);
      setStatsOpen(false);
      replaceGateRoute('locked');
      setAuthenticated(false);
      setSession(DEFAULT_OWNER_SESSION);
      setAuthReason(expireMessage);
      addToast(expireMessage, 'warning');
    };

    const remainingMs = session.expiresAt - Date.now();
    if (remainingMs <= 0) {
      closeExpiredDoor();
      return;
    }

    const MAX_TIMEOUT_MS = 2_147_483_647;
    if (remainingMs > MAX_TIMEOUT_MS) return;

    const timerId = window.setTimeout(closeExpiredDoor, remainingMs);
    return () => window.clearTimeout(timerId);
  }, [addToast, authenticated, closeBook, session.expiresAt, session.role]);

  const existingShelves = useMemo(
    () => libraryViewState.allShelves.map((shelf) => shelf.name),
    [libraryViewState.allShelves],
  );

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    closeBook();
    setModal({ kind: 'none' });
    setInspectedBookId(null);
    setStatsOpen(false);
    clearStoreOnLogout();
    replaceGateRoute('locked');
    setAuthenticated(false);
    setSession(DEFAULT_OWNER_SESSION);
    setAuthReason(null);
    addToast('Đã đóng cửa thư viện.', 'info');
  }, [addToast, clearStoreOnLogout, closeBook]);

  const { setActiveTab, openLibraryShelf, syncRenamedShelf } = libraryViewState;
  const handleJumpToShelf = useCallback(
    (shelfKey: string) => {
      setActiveTab('library');
      openLibraryShelf(shelfKey);
    },
    [openLibraryShelf, setActiveTab],
  );

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
        <AuthGate
          onAuthenticated={(nextSession) => {
            setSession(nextSession);
            setAuthReason(null);
            setAuthenticated(true);
          }}
          authReason={authReason}
          theme={theme}
          onCycleTheme={cycleTheme}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isOwner = session.role === 'owner';
  const effectiveCanUse3D = isOwner && canUse3D;
  const render3D = isOwner && effectiveMode === '3d';
  const isReaderOpen = Boolean(reader.activeBook && (reader.parsedBook || reader.guestSession));
  const anyDialogOpen = modal.kind !== 'none' || Boolean(inspectedBook) || statsOpen;
  const is3DPaused = Boolean(reader.openingBook || isReaderOpen || anyDialogOpen);
  const is3DDimmed = Boolean(reader.openingBook || isReaderOpen);

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
      {render3D ? (
        <Library3DHost
          books={store.books}
          progress={store.progress}
          storage={store.storage}
          loading={store.loading}
          theme={theme}
          viewState={libraryViewState}
          canUse3D={effectiveCanUse3D}
          viewMode={effectiveMode}
          onChangeViewMode={setViewMode}
          onCycleTheme={cycleTheme}
          onRefresh={() => void loadLibrary()}
          onLogout={handleLogout}
          onOpenBook={(book: Book) => void reader.openBook(book)}
          onUploadClick={() => setModal({ kind: 'upload' })}
          onEditBook={(book: Book) => setModal({ kind: 'edit', book })}
          onRenameShelf={(shelfName: string) => setModal({ kind: 'rename-shelf', shelfName })}
          onMoveSelectedToShelf={(selectedBooks: Book[]) =>
            setModal({ kind: 'bulk-shelf', books: selectedBooks })
          }
          onDeleteSelected={(selectedBooks: Book[]) =>
            setModal({ kind: 'delete', books: selectedBooks })
          }
          retryKey={retryKey}
          prefersReducedMotion={prefersReducedMotion}
          paused={is3DPaused}
          dimmed={is3DDimmed}
          onFallbackTo2D={handleFallbackTo2D}
        />
      ) : (
        !isReaderOpen && (
          <Library2DView
            books={store.books}
            progress={store.progress}
            storage={store.storage}
            loading={store.loading}
            theme={theme}
            viewState={libraryViewState}
            sessionRole={session.role}
            sessionExpiresAt={session.expiresAt}
            canUse3D={effectiveCanUse3D}
            viewMode="2d"
            onChangeViewMode={isOwner ? setViewMode : undefined}
            onCycleTheme={cycleTheme}
            onOpenStats={() => setStatsOpen(true)}
            onRefresh={() => void loadLibrary()}
            onLogout={handleLogout}
            onOpenBook={(book: Book) => void reader.openBook(book)}
            onInspectBook={(book: Book) => setInspectedBookId(book.id)}
            onDismissContinue={store.handleResetBookProgress}
            onUploadClick={isOwner ? () => setModal({ kind: 'upload' }) : undefined}
            onProtectionClick={isOwner ? () => setModal({ kind: 'protection' }) : undefined}
            unprotectedBookCount={isOwner ? store.unprotectedBookCount : 0}
            onEditBook={isOwner ? (book: Book) => setModal({ kind: 'edit', book }) : undefined}
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
            favoriteShelfKeys={store.effectiveFavoriteShelfKeys}
            onShelfCoverChanged={isOwner ? store.handleShelfCoverChanged : undefined}
            onToggleFavoriteShelf={store.handleToggleFavoriteShelf}
            onApiError={handleApiError}
            onNotify={addToast}
          />
        )
      )}

      <ActiveReaderHost
        activeBook={reader.activeBook}
        openingBook={reader.openingBook}
        parsedBook={reader.parsedBook}
        guestSession={reader.guestSession}
        loadedFromCache={reader.loadedFromCache}
        settings={reader.settings}
        session={session}
        books={store.books}
        progress={store.progress}
        onUpdateSettings={reader.updateSettings}
        onSaveProgress={reader.handleSaveProgress}
        onOpenBook={(book: Book) => void reader.openBook(book)}
        onApiError={handleApiError}
        onClose={reader.closeBook}
      />

      {(inspectedBook || statsOpen) && (
        <Suspense fallback={null}>
          <LazyLibrary2DDialogsHost
            inspectedBook={inspectedBook}
            statsOpen={statsOpen}
            books={store.books}
            progress={store.progress}
            sessionRole={session.role}
            onCloseInspect={() => setInspectedBookId(null)}
            onCloseStats={() => setStatsOpen(false)}
            onOpenBook={(book: Book) => void reader.openBook(book)}
            onJumpToShelf={handleJumpToShelf}
            onMarkCompleted={store.handleMarkBookCompleted}
            onResetProgress={store.handleResetBookProgress}
            onEditBook={isOwner ? (book: Book) => setModal({ kind: 'edit', book }) : undefined}
          />
        </Suspense>
      )}

      {isOwner && modal.kind !== 'none' && (
        <Suspense fallback={null}>
          <LazyAdminModalsHost
            modal={modal}
            books={store.books}
            storage={store.storage}
            existingShelves={existingShelves}
            renamingShelfName={renamingShelfName}
            renamingShelfCount={renamingShelfCount}
            onClose={closeModal}
            onRequestDelete={(book) => setModal({ kind: 'delete', books: [book] })}
            onBookUploaded={store.handleBookUploaded}
            onBookUpdated={store.handleBookUpdated}
            onBookPackSynced={store.handleBookPackSynced}
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
