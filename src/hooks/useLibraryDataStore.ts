import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  AuthSessionInfo,
  Book,
  CustomCollection,
  ReadingProgress,
  ShelfAccessSummary,
  StorageStats,
} from '@/types';
import {
  clearReadingProgress,
  fetchLibraryState,
  saveReadingProgress,
  sortBooksByTitle,
} from '@/lib/api';
import {
  type ShelfPrefsState,
  patchShelfAccessSummary,
  patchShelfAltTitles,
  patchShelfCover,
  patchShelfFavorite,
  patchShelfTags,
  pruneDeletedBooksFromPrefs,
  readLocalShelfPrefs,
  renameShelfPrefs,
  setShelfFavorite,
  toShelfPrefKey,
} from '@/lib/shelfPrefs';
import { useGuestLocalFavorites } from '@/hooks/useGuestLocalFavorites';
import type { ToastType } from '@/hooks/useToast';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number };
type NetworkNavigator = Navigator & { connection?: { saveData?: boolean } };

function canPreloadOnIdle(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as NetworkNavigator) : undefined;
  return nav?.onLine !== false && nav?.connection?.saveData !== true;
}

function sortCollectionsList(items: CustomCollection[]): CustomCollection[] {
  return [...items].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.createdAt - b.createdAt,
  );
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
  const [planToReadShelfKeys, setPlanToReadShelfKeys] = useState<Set<string>>(() => new Set());
  const [planToReadBookIds, setPlanToReadBookIds] = useState<Set<string>>(() => new Set());
  const [collections, setCollections] = useState<CustomCollection[]>([]);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const coreReadersPreloadedRef = useRef(false);
  const loadRequestIdRef = useRef(0);

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

  const mergeBookPreservingFlags = (prev: Book, updated: Book): Book => ({
    ...updated,
    ...(typeof updated.guest_ready === 'boolean'
      ? {}
      : typeof prev.guest_ready === 'boolean'
        ? { guest_ready: prev.guest_ready }
        : {}),
    ...(typeof updated.guest_locked === 'boolean'
      ? {}
      : typeof prev.guest_locked === 'boolean'
        ? { guest_locked: prev.guest_locked }
        : {}),
  });

  const handleBooksBatchUpdated = useCallback(
    (updatedBooks: Book[], nextStorage?: StorageStats) => {
      const byId = new Map(updatedBooks.map((item) => [item.id, item]));
      setBooks((prev) =>
        sortBooksByTitle(
          prev.map((item) => {
            const incoming = byId.get(item.id);
            return incoming ? mergeBookPreservingFlags(item, incoming) : item;
          }),
        ),
      );
      if (nextStorage) setStorage(nextStorage);
    },
    [],
  );

  const loadLibrary = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const state = await fetchLibraryState();
      if (requestId !== loadRequestIdRef.current) return;
      setBooks(state.books);
      setProgress(state.progress);
      setWeeklyPopularIds(state.weeklyPopularIds);
      setShelfPrefs(state.shelfPrefs);
      setPlanToReadShelfKeys(
        new Set((state.planToReadShelves || []).map(toShelfPrefKey).filter(Boolean)),
      );
      setPlanToReadBookIds(new Set((state.planToReadBooks || []).filter(Boolean)));
      setCollections(sortCollectionsList(state.collections || []));
      setStorage(state.storage);
      setSession(state.session);
      if (state.session.role !== 'owner') {
        onNonOwnerLoaded();
        setSelectionResetKey((prev) => prev + 1);
      }

      if (canPreloadOnIdle() && state.session.role === 'owner') {
        const schedule =
          (window as IdleWindow).requestIdleCallback ??
          ((cb: () => void) => window.setTimeout(cb, 1500));
        if (!coreReadersPreloadedRef.current) {
          coreReadersPreloadedRef.current = true;
          schedule(() => {
            if (canPreloadOnIdle()) {
              void import('@/lib/parsers').then((m) => m.preloadCoreReaders()).catch(() => undefined);
            }
          });
        }
        if (state.books.some((b) => Boolean(b.file_key) && !b.cover_key?.endsWith('-v2.jpg'))) {
          window.setTimeout(() => {
            void import('@/lib/legacyCoverSync')
              .then((m) =>
                m.syncLegacyCoversInBackground(state.books, handleBooksBatchUpdated, addToast),
              )
              .catch(() => undefined);
          }, 1200);
        }
      }
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      onApiError(err, 'Không thể tải dữ liệu thư viện.');
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [addToast, handleBooksBatchUpdated, onApiError, onNonOwnerLoaded, setSession]);

  const clearStoreOnLogout = useCallback(() => {
    loadRequestIdRef.current += 1;
    setLoading(false);
    setBooks([]);
    setProgress({});
    setWeeklyPopularIds([]);
    setShelfPrefs({ covers: {}, favorites: [] });
    setPlanToReadShelfKeys(new Set());
    setPlanToReadBookIds(new Set());
    setCollections([]);
    setStorage(null);
  }, []);

  const handleProgressUpdated = useCallback(
    (bookId: string, nextProgress: ReadingProgress, readingDeltaSec = 0) => {
      setProgress((prev) => {
        const prevSec = prev[bookId]?.readingSeconds ?? 0;
        const baseSec = Math.max(prevSec, nextProgress.readingSeconds ?? 0);
        const totalSec = baseSec + Math.max(0, Math.floor(readingDeltaSec));
        return {
          ...prev,
          [bookId]: totalSec > 0 ? { ...nextProgress, readingSeconds: totalSec } : nextProgress,
        };
      });
    },
    [],
  );

  const handleBookUploaded = useCallback((book: Book, nextStorage: StorageStats) => {
    setBooks((prev) => sortBooksByTitle([...prev.filter((item) => item.id !== book.id), book]));
    setStorage(nextStorage);
  }, []);

  const handleBookUpdated = useCallback((updatedBook: Book, nextStorage?: StorageStats) => {
    setBooks((prev) =>
      sortBooksByTitle(
        prev.map((item) =>
          item.id === updatedBook.id ? mergeBookPreservingFlags(item, updatedBook) : item,
        ),
      ),
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
      const oldKey = toShelfPrefKey(oldName);
      const newKey = toShelfPrefKey(newName);
      setBooks((prev) =>
        prev.map((item) =>
          toShelfPrefKey(item.shelf || 'Kho chưa phân loại') === oldKey
            ? { ...item, shelf: newName }
            : item,
        ),
      );
      setShelfPrefs((prev) => renameShelfPrefs(prev, oldName, newName));
      syncRenamedGuestFavorite(oldName, newName);
      if (oldKey && newKey && oldKey !== newKey) {
        setPlanToReadShelfKeys((prev) => {
          if (!prev.has(oldKey)) return prev;
          const next = new Set(prev);
          next.delete(oldKey);
          next.add(newKey);
          return next;
        });
        setCollections((prev) =>
          prev.map((col) => {
            if (!col.shelfKeys.includes(oldKey)) return col;
            const merged = Array.from(
              new Set(col.shelfKeys.map((k) => (k === oldKey ? newKey : k))),
            );
            return { ...col, shelfKeys: merged };
          }),
        );
      }
    },
    [syncRenamedGuestFavorite],
  );

  const handleShelfCoverChanged = useCallback((shelfName: string, bookId: string | null) => {
    setShelfPrefs((prev) => patchShelfCover(prev, shelfName, bookId));
  }, []);

  const handleShelfAccessChanged = useCallback(
    (shelfName: string, summary: ShelfAccessSummary | null) => {
      setShelfPrefs((prev) => patchShelfAccessSummary(prev, shelfName, summary));
    },
    [],
  );

  const handleShelfTagsChanged = useCallback((shelfName: string, tags: string[]) => {
    setShelfPrefs((prev) => patchShelfTags(prev, shelfName, tags));
  }, []);

  const handleShelfAltTitlesChanged = useCallback((shelfName: string, altTitles: string[]) => {
    setShelfPrefs((prev) => patchShelfAltTitles(prev, shelfName, altTitles));
  }, []);

  const handleTogglePlanToRead = useCallback(
    (shelfName: string, nextPlanToRead: boolean) => {
      const key = toShelfPrefKey(shelfName);
      if (!key) return;
      setPlanToReadShelfKeys((prev) => {
        const next = new Set(prev);
        if (nextPlanToRead) next.add(key);
        else next.delete(key);
        return next;
      });
      addToast(
        nextPlanToRead
          ? `Đã thêm "${shelfName}" vào danh sách Đọc sau.`
          : `Đã gỡ "${shelfName}" khỏi danh sách Đọc sau.`,
        'info',
      );
      void import('@/lib/catalogApi')
        .then((m) => m.setPlanToReadShelf(shelfName, nextPlanToRead))
        .catch((err) => {
          setPlanToReadShelfKeys((prev) => {
            const reverted = new Set(prev);
            if (nextPlanToRead) reverted.delete(key);
            else reverted.add(key);
            return reverted;
          });
          onApiError(err, 'Không thể cập nhật danh sách Đọc sau.');
        });
    },
    [addToast, onApiError],
  );

  const handleTogglePlanToReadBook = useCallback(
    (book: Book, nextPlanToRead: boolean) => {
      const bookId = book.id;
      if (!bookId) return;
      setPlanToReadBookIds((prev) => {
        const next = new Set(prev);
        if (nextPlanToRead) next.add(bookId);
        else next.delete(bookId);
        return next;
      });
      addToast(
        nextPlanToRead
          ? `Đã thêm "${book.title}" vào danh sách Đọc sau.`
          : `Đã gỡ "${book.title}" khỏi danh sách Đọc sau.`,
        'info',
      );
      void import('@/lib/catalogApi')
        .then((m) => m.setPlanToReadBook(bookId, nextPlanToRead))
        .catch((err) => {
          setPlanToReadBookIds((prev) => {
            const reverted = new Set(prev);
            if (nextPlanToRead) reverted.delete(bookId);
            else reverted.add(bookId);
            return reverted;
          });
          onApiError(err, 'Không thể cập nhật Đọc sau cho tập sách.');
        });
    },
    [addToast, onApiError],
  );

  const handleCollectionSaved = useCallback((collection: CustomCollection) => {
    setCollections((prev) => {
      const exists = prev.some((c) => c.id === collection.id);
      const next = exists
        ? prev.map((c) => (c.id === collection.id ? collection : c))
        : [...prev, collection];
      return sortCollectionsList(next);
    });
  }, []);

  const handleCollectionDeleted = useCallback((collectionId: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
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
        ...(existing?.readingSeconds ? { readingSeconds: existing.readingSeconds } : {}),
        updatedAt: Date.now(),
      };
      setProgress((prev) => ({ ...prev, [book.id]: nextProgress }));
      addToast(`Đã đánh dấu hoàn thành "${book.title}".`, 'success');
      void saveReadingProgress(book.id, nextProgress).catch((err) => {
        setProgress((prev) => {
          const restored = { ...prev };
          if (existing) restored[book.id] = existing;
          else delete restored[book.id];
          return restored;
        });
        onApiError(err, 'Không thể lưu trạng thái hoàn thành.');
      });
    },
    [addToast, onApiError, progress],
  );

  const handleResetBookProgress = useCallback(
    (book: Book) => {
      const previous = progress[book.id];
      setProgress((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
      addToast(`Đã đặt lại tiến độ đọc "${book.title}".`, 'info');
      void clearReadingProgress(book.id).catch((err) => {
        if (previous) {
          setProgress((prev) => ({ ...prev, [book.id]: previous }));
        }
        onApiError(err, 'Không thể xoá tiến độ đọc.');
      });
    },
    [addToast, onApiError, progress],
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
    setPlanToReadBookIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (idSet.has(id)) changed = true;
        else next.add(id);
      }
      return changed ? next : prev;
    });
    setStorage(nextStorage);
  }, []);

  return {
    loading,
    books,
    progress,
    weeklyPopularIds,
    shelfPrefs,
    planToReadShelfKeys,
    planToReadBookIds,
    collections,
    storage,
    selectionResetKey,
    effectiveFavoriteShelfKeys,
    unprotectedBookCount,
    loadLibrary,
    clearStoreOnLogout,
    handleProgressUpdated,
    handleBookUploaded,
    handleBookUpdated,
    handleBooksBatchUpdated,
    handleBookPackSynced,
    applyShelfRenamed,
    handleShelfCoverChanged,
    handleShelfAccessChanged,
    handleShelfTagsChanged,
    handleShelfAltTitlesChanged,
    handleTogglePlanToRead,
    handleTogglePlanToReadBook,
    handleCollectionSaved,
    handleCollectionDeleted,
    handleToggleFavoriteShelf,
    handleMarkBookCompleted,
    handleResetBookProgress,
    handleBooksShelfMoved,
    handleBooksDeleted,
  };
}
