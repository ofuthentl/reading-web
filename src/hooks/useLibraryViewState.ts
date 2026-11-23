import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthRole,
  Book,
  CustomCollection,
  LibrarySortMode,
  LibraryStatusFilter,
  LibraryTab,
  ReadingProgress,
  ShelfGroup,
  TagMatchMode,
} from '@/types';
import { groupBooksIntoShelves } from '@/lib/api';
import { computeBookProgressPercent } from '@/lib/bookMetadata';
import {
  collectAvailableAuthors,
  matchesBookAuthor,
  matchesBookSearchQuery,
  matchesBookStatus,
  matchesShelfSearchQuery,
  matchesShelfStatus,
  matchesShelfTagFilters,
  normalizeSearchText,
  normalizeTagFilterKey,
  prioritizeGuestReadable,
  selectContinueReadingBooks,
  selectWeeklyPopularBooks,
  sortShelvesByMode,
} from '@/lib/libraryFiltering';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import { sortShelvesFavoriteFirst, toShelfPrefKey } from '@/lib/shelfPrefs';

export { computeBookProgressPercent, normalizeSearchText, selectContinueReadingBooks };

export const LIBRARY_TAB_STORAGE_KEY = 'ofu-library-active-tab';

function readStoredLibraryTab(): LibraryTab {
  try {
    const raw = localStorage.getItem(LIBRARY_TAB_STORAGE_KEY);
    if (raw === 'library' || raw === 'support') return raw;
    return 'home';
  } catch {
    return 'home';
  }
}

function writeStoredLibraryTab(tab: LibraryTab) {
  try {
    localStorage.setItem(LIBRARY_TAB_STORAGE_KEY, tab);
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export interface LibraryCatalogStateOptions {
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  planToReadShelfKeys?: ReadonlySet<string>;
  collections?: readonly CustomCollection[];
}

export interface LibraryViewState {
  activeTab: LibraryTab;
  setActiveTab: (tab: LibraryTab) => void;
  openedLibraryShelfKey: string | null;
  openedLibraryShelf: ShelfGroup | null;
  openLibraryShelf: (shelfKey: string) => void;
  closeLibraryShelf: () => void;
  syncRenamedShelf: (oldName: string, newName: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  authorFilter: string;
  setAuthorFilter: (value: string) => void;
  includedTags: string[];
  excludedTags: string[];
  tagMatchMode: TagMatchMode;
  setTagMatchMode: (mode: TagMatchMode) => void;
  cycleTagFilter: (tag: string) => void;
  removeIncludedTag: (tag: string) => void;
  removeExcludedTag: (tag: string) => void;
  clearTagFilters: () => void;
  filterByAuthor: (authorName: string) => void;
  filterByTag: (tagName: string) => void;
  availableAuthors: string[];
  statusFilter: LibraryStatusFilter;
  setStatusFilter: (value: LibraryStatusFilter) => void;
  sortMode: LibrarySortMode;
  setSortMode: (value: LibrarySortMode) => void;
  activeShelfKey: string | null;
  setActiveShelfKey: (key: string | null) => void;
  activeCollectionId: string | null;
  setActiveCollectionId: (id: string | null) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  allShelves: ShelfGroup[];
  libraryShelves: ShelfGroup[];
  continueReadingBooks: Book[];
  weeklyPopularBooks: Book[];
  recentlyAddedBooks: Book[];
  filteredBooks: Book[];
  visibleShelves: ShelfGroup[];
  selectedBooks: Book[];
  isFiltering: boolean;
  toggleSelectionMode: () => void;
  toggleSelectBook: (bookId: string) => void;
  selectAllVisible: () => void;
  selectBookIds: (ids: string[]) => void;
  clearSelection: () => void;
  clearFilters: () => void;
}

export function useLibraryViewState(
  books: Book[],
  progress: Record<string, ReadingProgress>,
  selectionResetKey?: number,
  favoriteShelfKeys?: ReadonlySet<string>,
  weeklyPopularIds?: readonly string[],
  sessionRole?: AuthRole,
  shelfTags?: Readonly<Record<string, string[]>>,
  catalogOptions?: LibraryCatalogStateOptions,
): LibraryViewState {
  const shelfAltTitles = catalogOptions?.shelfAltTitles;
  const planToReadShelfKeys = catalogOptions?.planToReadShelfKeys;
  const collections = catalogOptions?.collections;

  const [activeTab, setActiveTabState] = useState<LibraryTab>(readStoredLibraryTab);
  const [openedLibraryShelfKey, setOpenedLibraryShelfKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [includedTags, setIncludedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>('all');
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all');
  const [sortMode, setSortMode] = useState<LibrarySortMode>('title_asc');
  const [activeShelfKey, setActiveShelfKey] = useState<string | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (selectionResetKey) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [selectionResetKey]);

  useEffect(() => {
    if (books.length === 0) setSelectionMode(false);
    const validIds = new Set(books.map((book) => book.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [books]);

  useEffect(() => {
    if (activeCollectionId && collections && !collections.some((c) => c.id === activeCollectionId)) {
      setActiveCollectionId(null);
    }
  }, [activeCollectionId, collections]);

  const activeCollectionShelfSet = useMemo(() => {
    if (!activeCollectionId || !collections) return null;
    const found = collections.find((c) => c.id === activeCollectionId);
    if (!found) return null;
    return new Set(found.shelfKeys.map(toShelfPrefKey));
  }, [activeCollectionId, collections]);

  const allShelves = useMemo(
    () => sortShelvesFavoriteFirst(groupBooksIntoShelves(books), favoriteShelfKeys),
    [books, favoriteShelfKeys],
  );

  useEffect(() => {
    if (activeShelfKey && !allShelves.some((shelf) => shelf.key === activeShelfKey)) {
      setActiveShelfKey(null);
    }
  }, [activeShelfKey, allShelves]);

  useEffect(() => {
    if (
      openedLibraryShelfKey &&
      !allShelves.some((shelf) => shelf.key === openedLibraryShelfKey)
    ) {
      setOpenedLibraryShelfKey(null);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [openedLibraryShelfKey, allShelves]);

  const openedLibraryShelf = useMemo(() => {
    if (!openedLibraryShelfKey) return null;
    return allShelves.find((shelf) => shelf.key === openedLibraryShelfKey) ?? null;
  }, [allShelves, openedLibraryShelfKey]);

  const setActiveTab = useCallback((tab: LibraryTab) => {
    setActiveTabState(tab);
    writeStoredLibraryTab(tab);
    setOpenedLibraryShelfKey(null);
    if (tab !== 'home') {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, []);

  const openLibraryShelf = useCallback((shelfKey: string) => {
    setOpenedLibraryShelfKey(shelfKey);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const closeLibraryShelf = useCallback(() => {
    setOpenedLibraryShelfKey(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const syncRenamedShelf = useCallback((oldName: string, newName: string) => {
    const oldKey = toShelfPrefKey(oldName);
    const newKey = toShelfPrefKey(newName);
    if (!oldKey || !newKey || oldKey === newKey) return;
    setOpenedLibraryShelfKey((prev) => (prev === oldKey ? newKey : prev));
    setActiveShelfKey((prev) => (prev === oldKey ? newKey : prev));
  }, []);

  const continueReadingBooks = useMemo(
    () => selectContinueReadingBooks(books, progress),
    [books, progress],
  );

  const recentlyAddedBooks = useMemo(() => {
    const sorted = [...books].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return prioritizeGuestReadable(sorted, sessionRole).slice(0, 10);
  }, [books, sessionRole]);

  const weeklyPopularBooks = useMemo(
    () => selectWeeklyPopularBooks(books, recentlyAddedBooks, weeklyPopularIds, sessionRole),
    [books, recentlyAddedBooks, sessionRole, weeklyPopularIds],
  );

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);
  const normalizedAuthor = useMemo(() => normalizeSearchText(authorFilter), [authorFilter]);
  const includedTagKeys = useMemo(() => includedTags.map(normalizeTagFilterKey), [includedTags]);
  const excludedTagKeys = useMemo(() => excludedTags.map(normalizeTagFilterKey), [excludedTags]);
  const availableAuthors = useMemo(() => collectAvailableAuthors(books), [books]);

  const cycleTagFilter = useCallback((rawTag: string) => {
    const clean = rawTag.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const key = normalizeTagFilterKey(clean);
    if (includedTags.some((t) => normalizeTagFilterKey(t) === key)) {
      setIncludedTags((prev) => prev.filter((t) => normalizeTagFilterKey(t) !== key));
      setExcludedTags((prev) =>
        prev.some((t) => normalizeTagFilterKey(t) === key) ? prev : [...prev, clean],
      );
    } else if (excludedTags.some((t) => normalizeTagFilterKey(t) === key)) {
      setExcludedTags((prev) => prev.filter((t) => normalizeTagFilterKey(t) !== key));
    } else {
      setIncludedTags((prev) => [...prev, clean]);
    }
  }, [excludedTags, includedTags]);

  const removeIncludedTag = useCallback((rawTag: string) => {
    const key = normalizeTagFilterKey(rawTag);
    setIncludedTags((prev) => prev.filter((t) => normalizeTagFilterKey(t) !== key));
  }, []);

  const removeExcludedTag = useCallback((rawTag: string) => {
    const key = normalizeTagFilterKey(rawTag);
    setExcludedTags((prev) => prev.filter((t) => normalizeTagFilterKey(t) !== key));
  }, []);

  const clearTagFilters = useCallback(() => {
    setIncludedTags([]);
    setExcludedTags([]);
  }, []);

  const filterByAuthor = useCallback((rawAuthor: string) => {
    const clean = rawAuthor.trim();
    if (!clean || !isKnownAuthor(clean)) return;
    setActiveTabState('library');
    writeStoredLibraryTab('library');
    setOpenedLibraryShelfKey(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSearchQuery('');
    setStatusFilter('all');
    setActiveShelfKey(null);
    setActiveCollectionId(null);
    setIncludedTags([]);
    setExcludedTags([]);
    setAuthorFilter(clean);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const filterByTag = useCallback((rawTag: string) => {
    const clean = rawTag.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    setActiveTabState('library');
    writeStoredLibraryTab('library');
    setOpenedLibraryShelfKey(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSearchQuery('');
    setAuthorFilter('');
    setStatusFilter('all');
    setActiveShelfKey(null);
    setActiveCollectionId(null);
    setExcludedTags([]);
    setIncludedTags([clean]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const libraryShelves = useMemo(() => {
    const matched = allShelves.filter((shelf) => {
      if (activeCollectionShelfSet && !activeCollectionShelfSet.has(shelf.key)) return false;
      if (!matchesShelfStatus(shelf, progress, statusFilter, planToReadShelfKeys)) return false;
      if (
        !matchesShelfTagFilters(
          shelf.key,
          shelfTags,
          includedTagKeys,
          excludedTagKeys,
          tagMatchMode,
        )
      ) {
        return false;
      }
      if (normalizedAuthor && !shelf.books.some((b) => matchesBookAuthor(b, normalizedAuthor))) {
        return false;
      }
      return matchesShelfSearchQuery(shelf, normalizedQuery, shelfTags, shelfAltTitles);
    });
    return sortShelvesByMode(matched, sortMode, progress, favoriteShelfKeys);
  }, [
    activeCollectionShelfSet,
    allShelves,
    excludedTagKeys,
    favoriteShelfKeys,
    includedTagKeys,
    normalizedAuthor,
    normalizedQuery,
    planToReadShelfKeys,
    progress,
    shelfAltTitles,
    shelfTags,
    sortMode,
    statusFilter,
    tagMatchMode,
  ]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const shelfKey = toShelfPrefKey(book.shelf || 'Kho chưa phân loại');
      if (activeShelfKey && shelfKey !== activeShelfKey) return false;
      if (!matchesBookStatus(book, progress, statusFilter, planToReadShelfKeys)) return false;
      if (
        !matchesShelfTagFilters(
          shelfKey,
          shelfTags,
          includedTagKeys,
          excludedTagKeys,
          tagMatchMode,
        )
      ) {
        return false;
      }
      if (!matchesBookAuthor(book, normalizedAuthor)) return false;
      return matchesBookSearchQuery(book, shelfKey, normalizedQuery, shelfTags, shelfAltTitles);
    });
  }, [
    activeShelfKey,
    books,
    excludedTagKeys,
    includedTagKeys,
    normalizedAuthor,
    normalizedQuery,
    planToReadShelfKeys,
    progress,
    shelfAltTitles,
    shelfTags,
    statusFilter,
    tagMatchMode,
  ]);

  const visibleShelves = useMemo(
    () => sortShelvesFavoriteFirst(groupBooksIntoShelves(filteredBooks), favoriteShelfKeys),
    [favoriteShelfKeys, filteredBooks],
  );

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelectBook = useCallback((bookId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filteredBooks.map((book) => book.id)));
  }, [filteredBooks]);

  const selectBookIds = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setAuthorFilter('');
    setIncludedTags([]);
    setExcludedTags([]);
    setStatusFilter('all');
    setActiveShelfKey(null);
    setActiveCollectionId(null);
  }, []);

  const selectedBooks = useMemo(
    () => books.filter((book) => selectedIds.has(book.id)),
    [books, selectedIds],
  );

  const isFiltering = Boolean(
    normalizedQuery ||
      normalizedAuthor ||
      includedTagKeys.length > 0 ||
      excludedTagKeys.length > 0 ||
      activeShelfKey ||
      activeCollectionId ||
      statusFilter !== 'all',
  );

  return {
    activeTab,
    setActiveTab,
    openedLibraryShelfKey,
    openedLibraryShelf,
    openLibraryShelf,
    closeLibraryShelf,
    syncRenamedShelf,
    searchQuery,
    setSearchQuery,
    authorFilter,
    setAuthorFilter,
    includedTags,
    excludedTags,
    tagMatchMode,
    setTagMatchMode,
    cycleTagFilter,
    removeIncludedTag,
    removeExcludedTag,
    clearTagFilters,
    filterByAuthor,
    filterByTag,
    availableAuthors,
    statusFilter,
    setStatusFilter,
    sortMode,
    setSortMode,
    activeShelfKey,
    setActiveShelfKey,
    activeCollectionId,
    setActiveCollectionId,
    selectionMode,
    selectedIds,
    allShelves,
    libraryShelves,
    continueReadingBooks,
    weeklyPopularBooks,
    recentlyAddedBooks,
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
  };
}
