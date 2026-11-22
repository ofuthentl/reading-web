import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuthSessionInfo, Book, ReadingProgress, StorageStats } from '@/types';
import { fetchLibraryState, isAuthError, setAuthToken, sortBooksByTitle } from '@/lib/api';
import { DEFAULT_OWNER_SESSION, getActiveAuthSession } from '@/lib/authSession';
import { replaceGateRoute, syncGateDocumentTitle } from '@/lib/gateRoutes';
import {
  type ShelfPrefsState,
  patchShelfCover,
  patchShelfFavorite,
  pruneDeletedBooksFromPrefs,
  readLocalShelfPrefs,
  renameShelfPrefs,
  setShelfFavorite,
} from '@/lib/shelfPrefs';
import type { LibraryModalState } from '@/components/AdminModalsHost';
import { AuthGate } from '@/components/AuthGate';
import { Library2DView } from '@/components/Library2DView';
import { Library3DHost } from '@/components/Library3DHost';
import { ToastContainer } from '@/components/ToastContainer';
import { useBookReader } from '@/hooks/useBookReader';
import { useCanUse3D } from '@/hooks/useCanUse3D';
import { useLibraryViewState } from '@/hooks/useLibraryViewState';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';

const LazyAdminModalsHost = lazy(() =>
  import('@/components/AdminModalsHost').then((mod) => ({ default: mod.AdminModalsHost })),
);

const LazyReaderView = lazy(() =>
  import('@/components/ReaderView').then((mod) => ({ default: mod.ReaderView })),
);

const LazyGuestCanvasReader = lazy(() =>
  import('@/components/GuestCanvasReader').then((mod) => ({ default: mod.GuestCanvasReader })),
);

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number };
type NetworkNavigator = Navigator & { connection?: { saveData?: boolean } };

function canPreloadOnIdle(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as NetworkNavigator) : undefined;
  return nav?.onLine !== false && nav?.connection?.saveData !== true;
}

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
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [shelfPrefs, setShelfPrefs] = useState<ShelfPrefsState>(readLocalShelfPrefs);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [modal, setModal] = useState<LibraryModalState>({ kind: 'none' });
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const coreReadersPreloadedRef = useRef(false);

  const favoriteShelfKeys = useMemo(
    () => new Set(shelfPrefs.favorites),
    [shelfPrefs.favorites],
  );
  const libraryViewState = useLibraryViewState(
    books,
    progress,
    selectionResetKey,
    favoriteShelfKeys,
  );

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

  const handleProgressUpdated = useCallback((bookId: string, nextProgress: ReadingProgress) => {
    setProgress((prev) => ({ ...prev, [bookId]: nextProgress }));
  }, []);

  const reader = useBookReader({
    appTheme: theme,
    sessionRole: session.role,
    onProgressUpdated: handleProgressUpdated,
    onApiError: handleApiError,
  });
  const { closeBook } = reader;

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const state = await fetchLibraryState();
      setBooks(state.books);
      setProgress(state.progress);
      setShelfPrefs(state.shelfPrefs);
      setStorage(state.storage);
      setSession(state.session);
      if (state.session.role !== 'owner') {
        setModal({ kind: 'none' });
        setSelectionResetKey((prev) => prev + 1);
      }

      if (!coreReadersPreloadedRef.current && canPreloadOnIdle() && state.session.role === 'owner') {
        coreReadersPreloadedRef.current = true;
        const schedule =
          (window as IdleWindow).requestIdleCallback ??
          ((cb: () => void) => window.setTimeout(cb, 1500));
        schedule(() => {
          if (canPreloadOnIdle()) {
            void import('@/lib/parsers').then((m) => m.preloadCoreReaders()).catch(() => undefined);
          }
        });
      }
    } catch (err) {
      handleApiError(err, 'Không thể tải dữ liệu thư viện.');
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (authenticated) {
      replaceGateRoute('root');
      syncGateDocumentTitle('root', true);
      void loadLibrary();
    } else {
      closeBook();
    }
  }, [authenticated, closeBook, loadLibrary]);

  // Tự động đóng cửa ngay khi chạm mốc hết hạn phiên (vd: hết 24 giờ của khách Discord)
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

  const unprotectedBookCount = useMemo(
    () =>
      books.filter((b) => (b.file_type === 'epub' || b.file_type === 'docx') && !b.guest_ready)
        .length,
    [books],
  );

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    closeBook();
    setModal({ kind: 'none' });
    setBooks([]);
    setProgress({});
    setStorage(null);
    replaceGateRoute('locked');
    setAuthenticated(false);
    setSession(DEFAULT_OWNER_SESSION);
    setAuthReason(null);
    addToast('Đã đóng cửa thư viện.', 'info');
  }, [addToast, closeBook]);

  const handleBookUploaded = useCallback((book: Book, nextStorage: StorageStats) => {
    setBooks((prev) => sortBooksByTitle([...prev.filter((item) => item.id !== book.id), book]));
    setStorage(nextStorage);
  }, []);

  const handleBookUpdated = useCallback((updatedBook: Book, nextStorage?: StorageStats) => {
    setBooks((prev) =>
      sortBooksByTitle(prev.map((item) => (item.id === updatedBook.id ? updatedBook : item))),
    );
    if (nextStorage) setStorage(nextStorage);
  }, []);

  const handleBookPackSynced = useCallback((bookId: string, nextStorage?: StorageStats) => {
    setBooks((prev) =>
      prev.map((item) => (item.id === bookId ? { ...item, guest_ready: true } : item)),
    );
    if (nextStorage) setStorage(nextStorage);
  }, []);

  const { syncRenamedShelf } = libraryViewState;
  const handleShelfRenamed = useCallback(
    (oldName: string, newName: string) => {
      const oldKey = oldName.trim().toLocaleLowerCase('vi');
      setBooks((prev) =>
        prev.map((item) =>
          (item.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi') === oldKey
            ? { ...item, shelf: newName }
            : item,
        ),
      );
      setShelfPrefs((prev) => renameShelfPrefs(prev, oldName, newName));
      syncRenamedShelf(oldName, newName);
    },
    [syncRenamedShelf],
  );

  const handleShelfCoverChanged = useCallback((shelfName: string, bookId: string | null) => {
    setShelfPrefs((prev) => patchShelfCover(prev, shelfName, bookId));
  }, []);

  const handleToggleFavoriteShelf = useCallback(
    (shelfName: string, nextFavorite: boolean) => {
      setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, nextFavorite));
      addToast(
        nextFavorite
          ? `Đã ghim kệ "${shelfName}" lên đầu danh sách.`
          : `Đã bỏ yêu thích kệ "${shelfName}".`,
        'info',
      );
      void setShelfFavorite(shelfName, nextFavorite).catch((err) => {
        setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, !nextFavorite));
        handleApiError(err, 'Không thể cập nhật kệ yêu thích.');
      });
    },
    [addToast, handleApiError],
  );

  const handleBooksShelfMoved = useCallback((bookIds: string[], targetShelf: string) => {
    const idSet = new Set(bookIds);
    setBooks((prev) =>
      prev.map((item) => (idSet.has(item.id) ? { ...item, shelf: targetShelf } : item)),
    );
    setSelectionResetKey((prev) => prev + 1);
  }, []);

  const handleBooksDeleted = useCallback((deletedIds: string[], nextStorage: StorageStats) => {
    const idSet = new Set(deletedIds);
    setBooks((prev) => prev.filter((item) => !idSet.has(item.id)));
    setProgress((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => !idSet.has(id))),
    );
    setShelfPrefs((prev) => pruneDeletedBooksFromPrefs(prev, idSet));
    setStorage(nextStorage);
  }, []);

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
  const isReaderOpen = Boolean(
    reader.activeBook && (reader.parsedBook || reader.guestSession),
  );
  const is3DPaused = Boolean(reader.openingBook || isReaderOpen || modal.kind !== 'none');
  const is3DDimmed = Boolean(reader.openingBook || isReaderOpen);

  const renamingShelfName = modal.kind === 'rename-shelf' ? modal.shelfName : null;
  const renamingShelfKey = renamingShelfName?.trim().toLocaleLowerCase('vi') ?? null;
  const renamingShelfCount = renamingShelfKey
    ? books.filter(
        (book) =>
          (book.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi') === renamingShelfKey,
      ).length
    : 0;

  return (
    <>
      {render3D ? (
        <Library3DHost
          books={books}
          progress={progress}
          storage={storage}
          loading={loading}
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
            books={books}
            progress={progress}
            storage={storage}
            loading={loading}
            theme={theme}
            viewState={libraryViewState}
            sessionRole={session.role}
            sessionExpiresAt={session.expiresAt}
            canUse3D={effectiveCanUse3D}
            viewMode="2d"
            onChangeViewMode={isOwner ? setViewMode : undefined}
            onCycleTheme={cycleTheme}
            onRefresh={() => void loadLibrary()}
            onLogout={handleLogout}
            onOpenBook={(book: Book) => void reader.openBook(book)}
            onUploadClick={isOwner ? () => setModal({ kind: 'upload' }) : undefined}
            onProtectionClick={isOwner ? () => setModal({ kind: 'protection' }) : undefined}
            unprotectedBookCount={isOwner ? unprotectedBookCount : 0}
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
            shelfCovers={shelfPrefs.covers}
            favoriteShelfKeys={favoriteShelfKeys}
            onShelfCoverChanged={isOwner ? handleShelfCoverChanged : undefined}
            onToggleFavoriteShelf={isOwner ? handleToggleFavoriteShelf : undefined}
            onApiError={handleApiError}
            onNotify={addToast}
          />
        )
      )}
      {reader.activeBook && reader.parsedBook && (
        <div className="fixed inset-0 z-40">
          <Suspense fallback={null}>
            <LazyReaderView
              key={reader.activeBook.id}
              book={reader.activeBook}
              parsedBook={reader.parsedBook}
              loadedFromCache={reader.loadedFromCache}
              initialProgress={progress[reader.activeBook.id]}
              settings={reader.settings}
              onUpdateSettings={reader.updateSettings}
              onSaveProgress={reader.handleSaveProgress}
              onClose={reader.closeBook}
            />
          </Suspense>
        </div>
      )}
      {reader.activeBook && reader.guestSession && (
        <div className="fixed inset-0 z-40">
          <Suspense fallback={null}>
            <LazyGuestCanvasReader
              key={reader.activeBook.id}
              book={reader.activeBook}
              tocChapters={reader.guestSession.chapters}
              watermarkLabel={
                session.watermarkLabel || reader.guestSession.watermarkLabel || 'Guest'
              }
              initialProgress={progress[reader.activeBook.id]}
              settings={reader.settings}
              onUpdateSettings={reader.updateSettings}
              onSaveProgress={reader.handleSaveProgress}
              onApiError={handleApiError}
              onClose={reader.closeBook}
            />
          </Suspense>
        </div>
      )}
      {isOwner && modal.kind !== 'none' && (
        <Suspense fallback={null}>
          <LazyAdminModalsHost
            modal={modal}
            books={books}
            storage={storage}
            existingShelves={existingShelves}
            renamingShelfName={renamingShelfName}
            renamingShelfCount={renamingShelfCount}
            onClose={closeModal}
            onRequestDelete={(book) => setModal({ kind: 'delete', books: [book] })}
            onBookUploaded={handleBookUploaded}
            onBookUpdated={handleBookUpdated}
            onBookPackSynced={handleBookPackSynced}
            onShelfRenamed={handleShelfRenamed}
            onBooksShelfMoved={handleBooksShelfMoved}
            onBooksDeleted={handleBooksDeleted}
            onApiError={handleApiError}
            onNotify={addToast}
          />
        </Suspense>
      )}
      {reader.openingBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="moonlit-card fade-in flex w-full max-w-sm flex-col items-center rounded-2xl border border-line bg-surface px-6 py-7 text-center shadow-2xl dark:border-line-strong/70">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
            <p className="mt-3 font-display text-base font-semibold text-ink">Đang mở sách...</p>
            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{reader.openingBook.title}</p>
            <button
              type="button"
              onClick={reader.closeBook}
              className="mt-4 rounded-xl border border-line bg-canvas px-4 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
