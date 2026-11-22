import { useCallback, useMemo, useRef, useState } from 'react';
import type { AuthSessionInfo, Book, ReadingProgress, StorageStats } from '@/types';
import {
  clearReadingProgress,
  fetchLibraryState,
  saveReadingProgress,
  sortBooksByTitle,
} from '@/lib/api';
import {
  type ShelfPrefsState,
  patchShelfCover,
  patchShelfFavorite,
  pruneDeletedBooksFromPrefs,
  readLocalShelfPrefs,
  renameShelfPrefs,
  setShelfFavorite,
} from '@/lib/shelfPrefs';
import { useGuestLocalFavorites } from '@/hooks/useGuestLocalFavorites';
import type { ToastType } from '@/hooks/useToast';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number };
type NetworkNavigator = Navigator & { connection?: { saveData?: boolean } };

function canPreloadOnIdle(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as NetworkNavigator) : undefined;
  return nav?.onLine !== false && nav?.connection?.saveData !== true;
}

interface UseLibraryDataStoreOptions {
  session: AuthSessionInfo;
  setSession: (next: AuthSessionInfo) => void;
  onNonOwnerLoaded: () => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  addToast: (message: string, type?: ToastType) => void;
}

export function useLibraryDataStore({
  session,
  setSession,
  onNonOwnerLoaded,
  onApiError,
  addToast,
}: UseLibraryDataStoreOptions) {
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [weeklyPopularIds, setWeeklyPopularIds] = useState<string[]>([]);
  const [shelfPrefs, setShelfPrefs] = useState<ShelfPrefsState>(readLocalShelfPrefs);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const coreReadersPreloadedRef = useRef(false);

  const { guestFavoriteKeys, toggleGuestFavorite, syncRenamedGuestFavorite } =
    useGuestLocalFavorites();

  const adminFavoriteShelfKeys = useMemo(
    () => new Set(shelfPrefs.favorites),
    [shelfPrefs.favorites],
  );
  const effectiveFavoriteShelfKeys =
    session.role === 'owner' ? adminFavoriteShelfKeys : guestFavoriteKeys;

  const unprotectedBookCount = useMemo(
    () =>
      books.filter((b) => (b.file_type === 'epub' || b.file_type === 'docx') && !b.guest_ready)
        .length,
    [books],
  );

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const state = await fetchLibraryState();
      setBooks(state.books);
      setProgress(state.progress);
      setWeeklyPopularIds(state.weeklyPopularIds);
      setShelfPrefs(state.shelfPrefs);
      setStorage(state.storage);
      setSession(state.session);
      if (state.session.role !== 'owner') {
        onNonOwnerLoaded();
        setSelectionResetKey((prev) => prev + 1);
      }

      if (
        !coreReadersPreloadedRef.current &&
        canPreloadOnIdle() &&
        state.session.role === 'owner'
      ) {
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
      onApiError(err, 'Không thể tải dữ liệu thư viện.');
    } finally {
      setLoading(false);
    }
  }, [onApiError, onNonOwnerLoaded, setSession]);

  const clearStoreOnLogout = useCallback(() => {
    setBooks([]);
    setProgress({});
    setWeeklyPopularIds([]);
    setStorage(null);
  }, []);

  const handleProgressUpdated = useCallback((bookId: string, nextProgress: ReadingProgress) => {
    setProgress((prev) => ({ ...prev, [bookId]: nextProgress }));
  }, []);

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

  const applyShelfRenamed = useCallback(
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
      syncRenamedGuestFavorite(oldName, newName);
    },
    [syncRenamedGuestFavorite],
  );

  const handleShelfCoverChanged = useCallback((shelfName: string, bookId: string | null) => {
    setShelfPrefs((prev) => patchShelfCover(prev, shelfName, bookId));
  }, []);

  const handleToggleFavoriteShelf = useCallback(
    (shelfName: string, nextFavorite: boolean) => {
      if (session.role !== 'owner') {
        toggleGuestFavorite(shelfName, nextFavorite);
        addToast(
          nextFavorite
            ? `Đã ghim kệ "${shelfName}" lên đầu trên thiết bị này.`
            : `Đã bỏ ghim kệ "${shelfName}".`,
          'info',
        );
        return;
      }
      setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, nextFavorite));
      addToast(
        nextFavorite
          ? `Đã ghim kệ "${shelfName}" lên đầu danh sách.`
          : `Đã bỏ yêu thích kệ "${shelfName}".`,
        'info',
      );
      void setShelfFavorite(shelfName, nextFavorite).catch((err) => {
        setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, !nextFavorite));
        onApiError(err, 'Không thể cập nhật kệ yêu thích.');
      });
    },
    [addToast, onApiError, session.role, toggleGuestFavorite],
  );

  const handleMarkBookCompleted = useCallback(
    (book: Book) => {
      const existing = progress[book.id];
      const nextProgress: ReadingProgress = {
        chapterId: existing?.chapterId || 'manual-complete',
        chapterIndex: Math.max(0, (existing?.totalChapters ?? 1) - 1),
        ...(existing?.chapterTitle ? { chapterTitle: existing.chapterTitle } : {}),
        ...(existing?.totalChapters ? { totalChapters: existing.totalChapters } : {}),
        scrollRatio: 1,
        scrollTop: existing?.scrollTop ?? 0,
        completed: true,
        updatedAt: Date.now(),
      };
      setProgress((prev) => ({ ...prev, [book.id]: nextProgress }));
      addToast(`Đã đánh dấu hoàn thành "${book.title}".`, 'success');
      void saveReadingProgress(book.id, nextProgress).catch((err) => {
        onApiError(err, 'Không thể lưu trạng thái hoàn thành.');
      });
    },
    [addToast, onApiError, progress],
  );

  const handleResetBookProgress = useCallback(
    (book: Book) => {
      setProgress((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
      addToast(`Đã đặt lại tiến độ đọc "${book.title}".`, 'info');
      void clearReadingProgress(book.id).catch((err) => {
        onApiError(err, 'Không thể xoá tiến độ đọc.');
      });
    },
    [addToast, onApiError],
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

  return {
    loading,
    books,
    progress,
    weeklyPopularIds,
    shelfPrefs,
    storage,
    selectionResetKey,
    effectiveFavoriteShelfKeys,
    unprotectedBookCount,
    loadLibrary,
    clearStoreOnLogout,
    handleProgressUpdated,
    handleBookUploaded,
    handleBookUpdated,
    handleBookPackSynced,
    applyShelfRenamed,
    handleShelfCoverChanged,
    handleToggleFavoriteShelf,
    handleMarkBookCompleted,
    handleResetBookProgress,
    handleBooksShelfMoved,
    handleBooksDeleted,
  };
}
