import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthRole,
  Book,
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
  matchesBookStatus,
  matchesShelfStatus,
  matchesShelfTagFilters,
  normalizeSearchText,
  normalizeTagFilterKey,
  prioritizeGuestReadable,
  selectContinueReadingBooks,
  sortShelvesByMode,
} from '@/lib/libraryFiltering';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import { sortShelvesFavoriteFirst } from '@/lib/shelfPrefs';

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
): LibraryViewState {
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
    const oldKey = oldName.trim().toLocaleLowerCase('vi');
    const newKey = newName.trim().toLocaleLowerCase('vi');
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

  const weeklyPopularBooks = useMemo(() => {
    if (!weeklyPopularIds || weeklyPopularIds.length === 0) {
      return recentlyAddedBooks;
    }
    const bookMap = new Map(books.map((b) => [b.id, b]));
    const picked: Book[] = [];
    const seen = new Set<string>();
    for (const id of weeklyPopularIds) {
      const found = bookMap.get(id);
      if (found && !seen.has(found.id)) {
        seen.add(found.id);
        picked.push(found);
      }
    }
    for (const b of recentlyAddedBooks) {
      if (picked.length >= 10) break;
      if (!seen.has(b.id)) {
        seen.add(b.id);
        picked.push(b);
      }
    }
    return prioritizeGuestReadable(picked, sessionRole).slice(0, 10);
  }, [books, recentlyAddedBooks, sessionRole, weeklyPopularIds]);

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
    setExcludedTags([]);
    setIncludedTags([clean]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const libraryShelves = useMemo(() => {
    const matched = allShelves.filter((shelf) => {
      if (!matchesShelfStatus(shelf, progress, statusFilter)) return false;
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
      if (!normalizedQuery) return true;
      if (normalizeSearchText(shelf.name).includes(normalizedQuery)) return true;
      const tagsText = (shelfTags?.[shelf.key] || []).join(' ');
      if (tagsText && normalizeSearchText(tagsText).includes(normalizedQuery)) return true;
      return shelf.books.some((book) =>
        normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery),
      );
    });
    return sortShelvesByMode(matched, sortMode, progress, favoriteShelfKeys);
  }, [
    allShelves,
    excludedTagKeys,
    favoriteShelfKeys,
    includedTagKeys,
    normalizedAuthor,
    normalizedQuery,
    progress,
    shelfTags,
    sortMode,
    statusFilter,
    tagMatchMode,
  ]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const shelfKey = (book.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi');
      if (activeShelfKey && shelfKey !== activeShelfKey) return false;
      if (!matchesBookStatus(book, progress, statusFilter)) return false;
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
      if (!normalizedQuery) return true;
      const tagsText = (shelfTags?.[shelfKey] || []).join(' ');
      const haystack = normalizeSearchText(`${book.title} ${book.author} ${book.shelf} ${tagsText}`);
      return haystack.includes(normalizedQuery);
    });
  }, [
    activeShelfKey,
    books,
    excludedTagKeys,
    includedTagKeys,
    normalizedAuthor,
    normalizedQuery,
    progress,
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
