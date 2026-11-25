import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuthSessionInfo,
  Book,
  BookAccessSummary,
  CustomCollection,
  ReadingProgress,
  ShelfAccessSummary,
  ShelfRatingSummary,
  ShelfRelation,
  StorageStats,
} from '@/types';
import { fetchLibraryState, isCloudMode, sortBooksByTitle } from '@/lib/api';
import {
  type IdleWindow,
  canPreloadOnIdle,
  getAliveShelfKeys,
  mergeBookPreservingFlags,
  mergeShelfRatingsOnRename,
  mergeShelfRelationsOnRename,
  mergeUploadStorageStats,
  pruneDeletedBookAccess,
  pruneOrphanCollectionShelves,
  pruneOrphanPlanToReadShelves,
  pruneOrphanShelfRatings,
  pruneOrphanShelfRelations,
  removeShelfRelationPair,
  sortCollectionsList,
  upsertShelfRelationItem,
} from '@/lib/libraryStoreHelpers';
import {
  type ShelfPrefsState,
  clearLocalShelfPrefs,
  patchShelfAccessSummary,
  patchShelfAltTitles,
  patchShelfCover,
  patchShelfTags,
  pruneDeletedBooksFromPrefs,
  pruneMovedBooksFromShelfCovers,
  pruneOrphanShelfPrefs,
  readLocalShelfPrefs,
  renameShelfPrefs,
  toShelfPrefKey,
} from '@/lib/shelfPrefs';
import { useGuestLocalFavorites } from '@/hooks/useGuestLocalFavorites';
import { useLibraryUserActions } from '@/hooks/useLibraryUserActions';
import type { ToastType } from '@/hooks/useToast';

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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [weeklyPopularIds, setWeeklyPopularIds] = useState<string[]>([]);
  const [shelfPrefs, setShelfPrefs] = useState<ShelfPrefsState>(readLocalShelfPrefs);
  const [shelfRatings, setShelfRatings] = useState<Record<string, ShelfRatingSummary>>({});
  const [shelfRelations, setShelfRelations] = useState<ShelfRelation[]>([]);
  const [bookAccess, setBookAccess] = useState<Record<string, BookAccessSummary>>({});
  const [planToReadShelfKeys, setPlanToReadShelfKeys] = useState<Set<string>>(() => new Set());
  const [planToReadBookIds, setPlanToReadBookIds] = useState<Set<string>>(() => new Set());
  const [collections, setCollections] = useState<CustomCollection[]>([]);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const coreReadersPreloadedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const legacyCoverTimerRef = useRef<number | null>(null);
  const toggleVerRef = useRef<Map<string, number>>(new Map());
  const booksRef = useRef(books);
  booksRef.current = books;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    return () => {
      if (legacyCoverTimerRef.current !== null) {
        window.clearTimeout(legacyCoverTimerRef.current);
        legacyCoverTimerRef.current = null;
      }
    };
  }, []);

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
      setShelfRatings(state.shelfRatings || {});
      setShelfRelations(state.shelfRelations || []);
      setBookAccess(state.bookAccess || {});
      setPlanToReadShelfKeys(
        new Set((state.planToReadShelves || []).map(toShelfPrefKey).filter(Boolean)),
      );
      setPlanToReadBookIds(new Set((state.planToReadBooks || []).filter(Boolean)));
      setCollections(sortCollectionsList(state.collections || []));
      setStorage(state.storage);
      setSession(state.session);
      setHasLoadedOnce(true);
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
        if (state.books.some((b) => Boolean(b.file_key && b.cover_key && !b.cover_key.endsWith('-v2.jpg')))) {
          if (legacyCoverTimerRef.current !== null) {
            window.clearTimeout(legacyCoverTimerRef.current);
          }
          legacyCoverTimerRef.current = window.setTimeout(() => {
            legacyCoverTimerRef.current = null;
            if (requestId !== loadRequestIdRef.current) return;
            void import('@/lib/legacyCoverSync')
              .then((m) =>
                m.syncLegacyCoversInBackground(
                  state.books,
                  handleBooksBatchUpdated,
                  addToast,
                  onApiError,
                ),
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
    if (legacyCoverTimerRef.current !== null) {
      window.clearTimeout(legacyCoverTimerRef.current);
      legacyCoverTimerRef.current = null;
    }
    toggleVerRef.current.clear();
    if (isCloudMode) {
      clearLocalShelfPrefs();
    }
    setLoading(false);
    setHasLoadedOnce(false);
    setBooks([]);
    setProgress({});
    setWeeklyPopularIds([]);
    setShelfPrefs({ covers: {}, favorites: [] });
    setShelfRatings({});
    setShelfRelations([]);
    setBookAccess({});
    setPlanToReadShelfKeys(new Set());
    setPlanToReadBookIds(new Set());
    setCollections([]);
    setStorage(null);
  }, []);

  const userActions = useLibraryUserActions({
    sessionRole: session.role,
    progressRef,
    toggleVerRef,
    setProgress,
    setShelfPrefs,
    setPlanToReadShelfKeys,
    setPlanToReadBookIds,
    toggleGuestFavorite,
    onApiError,
    addToast,
  });

  const handleBookUploaded = useCallback((book: Book, nextStorage: StorageStats) => {
    setBooks((prev) => sortBooksByTitle([...prev.filter((item) => item.id !== book.id), book]));
    setStorage((prev) => mergeUploadStorageStats(prev, nextStorage));
  }, []);

  const handleStorageSynced = useCallback((nextStorage: StorageStats) => {
    setStorage(nextStorage);
  }, []);

  const handleBookUpdated = useCallback((updatedBook: Book, nextStorage?: StorageStats) => {
    const nextBooks = sortBooksByTitle(
      booksRef.current.map((item) =>
        item.id === updatedBook.id ? mergeBookPreservingFlags(item, updatedBook) : item,
      ),
    );
    const aliveShelfKeys = getAliveShelfKeys(nextBooks);
    setBooks(nextBooks);
    setShelfPrefs((prev) =>
      pruneOrphanShelfPrefs(
        pruneMovedBooksFromShelfCovers(prev, new Set([updatedBook.id]), updatedBook.shelf),
        aliveShelfKeys,
      ),
    );
    setShelfRatings((prev) => pruneOrphanShelfRatings(prev, nextBooks));
    setShelfRelations((prev) => pruneOrphanShelfRelations(prev, nextBooks));
    setPlanToReadShelfKeys((prev) => pruneOrphanPlanToReadShelves(prev, aliveShelfKeys));
    setCollections((prev) => pruneOrphanCollectionShelves(prev, aliveShelfKeys));
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
        setShelfRatings((prev) => mergeShelfRatingsOnRename(prev, oldKey, newKey));
        setShelfRelations((prev) => mergeShelfRelationsOnRename(prev, oldKey, newKey));
      }
    },
    [syncRenamedGuestFavorite],
  );

  const handleShelfRatingUpdated = useCallback(
    (shelfNameOrKey: string, average: number | null, count: number) => {
      const key = toShelfPrefKey(shelfNameOrKey);
      if (!key) return;
      setShelfRatings((prev) => {
        const next = { ...prev };
        if (average === null || count <= 0) delete next[key];
        else next[key] = { average, count };
        return next;
      });
    },
    [],
  );

  const handleShelfRelationSaved = useCallback((relation: ShelfRelation) => {
    setShelfRelations((prev) => upsertShelfRelationItem(prev, relation));
  }, []);

  const handleShelfRelationDeleted = useCallback((sourceKey: string, targetKey: string) => {
    setShelfRelations((prev) =>
      removeShelfRelationPair(prev, toShelfPrefKey(sourceKey), toShelfPrefKey(targetKey)),
    );
  }, []);

  const handleBookAccessChanged = useCallback(
    (bookId: string, summary: BookAccessSummary | null) => {
      setBookAccess((prev) => {
        const next = { ...prev };
        if (!summary || (summary.mode === 'inherit' && summary.lockedChapterCount <= 0)) {
          delete next[bookId];
        } else {
          next[bookId] = summary;
        }
        return next;
      });
    },
    [],
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

  const handleBooksShelfMoved = useCallback((bookIds: string[], targetShelf: string) => {
    const idSet = new Set(bookIds);
    const updatedBooks = booksRef.current.map((item) =>
      idSet.has(item.id) ? { ...item, shelf: targetShelf } : item,
    );
    const aliveShelfKeys = getAliveShelfKeys(updatedBooks);
    setBooks(updatedBooks);
    setShelfPrefs((prev) =>
      pruneOrphanShelfPrefs(
        pruneMovedBooksFromShelfCovers(prev, idSet, targetShelf),
        aliveShelfKeys,
      ),
    );
    setShelfRatings((prev) => pruneOrphanShelfRatings(prev, updatedBooks));
    setShelfRelations((prev) => pruneOrphanShelfRelations(prev, updatedBooks));
    setPlanToReadShelfKeys((prev) => pruneOrphanPlanToReadShelves(prev, aliveShelfKeys));
    setCollections((prev) => pruneOrphanCollectionShelves(prev, aliveShelfKeys));
    setSelectionResetKey((prev) => prev + 1);
  }, []);

  const handleBooksDeleted = useCallback((deletedIds: string[], nextStorage: StorageStats) => {
    const idSet = new Set(deletedIds);
    const remaining = booksRef.current.filter((item) => !idSet.has(item.id));
    const aliveShelfKeys = getAliveShelfKeys(remaining);
    setBooks((prev) => prev.filter((item) => !idSet.has(item.id)));
    setWeeklyPopularIds((prev) => prev.filter((id) => !idSet.has(id)));
    setShelfRatings((prevRatings) => pruneOrphanShelfRatings(prevRatings, remaining));
    setShelfRelations((prevRels) => pruneOrphanShelfRelations(prevRels, remaining));
    setBookAccess((prevAccess) => pruneDeletedBookAccess(prevAccess, idSet));
    setProgress((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => !idSet.has(id))),
    );
    setShelfPrefs((prev) =>
      pruneOrphanShelfPrefs(pruneDeletedBooksFromPrefs(prev, idSet), aliveShelfKeys),
    );
    setPlanToReadShelfKeys((prev) => pruneOrphanPlanToReadShelves(prev, aliveShelfKeys));
    setCollections((prev) => pruneOrphanCollectionShelves(prev, aliveShelfKeys));
    setPlanToReadBookIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => !idSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setStorage(nextStorage);
  }, []);

  return {
    loading,
    hasLoadedOnce,
    books,
    progress,
    weeklyPopularIds,
    shelfPrefs,
    shelfRatings,
    shelfRelations,
    bookAccess,
    planToReadShelfKeys,
    planToReadBookIds,
    collections,
    storage,
    selectionResetKey,
    effectiveFavoriteShelfKeys,
    unprotectedBookCount,
    loadLibrary,
    clearStoreOnLogout,
    ...userActions,
    handleBookUploaded,
    handleStorageSynced,
    handleBookUpdated,
    handleBooksBatchUpdated,
    handleBookPackSynced,
    applyShelfRenamed,
    handleShelfRatingUpdated,
    handleShelfRelationSaved,
    handleShelfRelationDeleted,
    handleBookAccessChanged,
    handleShelfCoverChanged,
    handleShelfAccessChanged,
    handleShelfTagsChanged,
    handleShelfAltTitlesChanged,
    handleCollectionSaved,
    handleCollectionDeleted,
    handleBooksShelfMoved,
    handleBooksDeleted,
  };
}
