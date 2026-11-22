import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthRole,
  Book,
  LibraryFormatFilter,
  LibrarySortMode,
  LibraryStatusFilter,
  LibraryTab,
  ReadingProgress,
  ShelfGroup,
} from '@/types';
import { groupBooksIntoShelves } from '@/lib/api';
import { computeBookProgressPercent } from '@/lib/bookMetadata';
import { sortShelvesFavoriteFirst } from '@/lib/shelfPrefs';

export { computeBookProgressPercent };

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

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi')
    .trim();
}

export function selectContinueReadingBooks(
  books: readonly Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
  limit = 8,
): Book[] {
  return books
    .filter((book) => {
      const itemProgress = progress[book.id];
      return Boolean(itemProgress) && !itemProgress.completed;
    })
    .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0))
    .slice(0, limit);
}

function matchesBookStatus(
  book: Book,
  progress: Readonly<Record<string, ReadingProgress>>,
  filter: LibraryStatusFilter,
): boolean {
  if (filter === 'all') return true;
  const item = progress[book.id];
  if (filter === 'unread') return !item;
  if (filter === 'completed') return Boolean(item?.completed);
  return Boolean(item && !item.completed);
}

function matchesShelfStatus(
  shelf: ShelfGroup,
  progress: Readonly<Record<string, ReadingProgress>>,
  filter: LibraryStatusFilter,
): boolean {
  if (filter === 'all') return true;
  const total = shelf.books.length;
  if (total === 0) return false;
  let started = 0;
  let completed = 0;
  for (const b of shelf.books) {
    const p = progress[b.id];
    if (p) {
      started += 1;
      if (p.completed) completed += 1;
    }
  }
  if (filter === 'unread') return started === 0;
  if (filter === 'completed') return completed === total;
  return started > 0 && completed < total;
}

function sortShelvesByMode(
  shelves: ShelfGroup[],
  sortMode: LibrarySortMode,
  progress: Readonly<Record<string, ReadingProgress>>,
  favoriteShelfKeys?: ReadonlySet<string>,
): ShelfGroup[] {
  if (sortMode === 'title_asc') {
    return sortShelvesFavoriteFirst(shelves, favoriteShelfKeys);
  }

  const getMetric = (shelf: ShelfGroup): number => {
    if (sortMode === 'volume_desc') return shelf.books.length;
    if (sortMode === 'recent_upload') {
      let maxTs = 0;
      for (const b of shelf.books) {
        const ts = Date.parse(b.created_at);
        if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
      }
      return maxTs;
    }
    let maxRead = 0;
    for (const b of shelf.books) {
      const ts = progress[b.id]?.updatedAt ?? 0;
      if (ts > maxRead) maxRead = ts;
    }
    return maxRead;
  };

  const sortedByMetric = [...shelves].sort((a, b) => getMetric(b) - getMetric(a));
  return sortShelvesFavoriteFirst(sortedByMetric, favoriteShelfKeys);
}

function prioritizeGuestReadable(books: Book[], sessionRole?: AuthRole): Book[] {
  if (sessionRole !== 'guest') return books;
  const ready: Book[] = [];
  const locked: Book[] = [];
  for (const b of books) {
    if (b.file_type !== 'pdf' && b.guest_ready !== false) ready.push(b);
    else locked.push(b);
  }
  return [...ready, ...locked];
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
  statusFilter: LibraryStatusFilter;
  setStatusFilter: (value: LibraryStatusFilter) => void;
  formatFilter: LibraryFormatFilter;
  setFormatFilter: (value: LibraryFormatFilter) => void;
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
): LibraryViewState {
  const [activeTab, setActiveTabState] = useState<LibraryTab>(readStoredLibraryTab);
  const [openedLibraryShelfKey, setOpenedLibraryShelfKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<LibraryFormatFilter>('all');
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

  const libraryShelves = useMemo(() => {
    const matched = allShelves.filter((shelf) => {
      if (!matchesShelfStatus(shelf, progress, statusFilter)) return false;
      if (formatFilter !== 'all' && !shelf.books.some((b) => b.file_type === formatFilter)) {
        return false;
      }
      if (!normalizedQuery) return true;
      if (normalizeSearchText(shelf.name).includes(normalizedQuery)) return true;
      return shelf.books.some((book) =>
        normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery),
      );
    });
    return sortShelvesByMode(matched, sortMode, progress, favoriteShelfKeys);
  }, [allShelves, favoriteShelfKeys, formatFilter, normalizedQuery, progress, sortMode, statusFilter]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      if (activeShelfKey) {
        const shelfKey = (book.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi');
        if (shelfKey !== activeShelfKey) return false;
      }
      if (formatFilter !== 'all' && book.file_type !== formatFilter) return false;
      if (!matchesBookStatus(book, progress, statusFilter)) return false;
      if (!normalizedQuery) return true;
      const haystack = normalizeSearchText(`${book.title} ${book.author} ${book.shelf}`);
      return haystack.includes(normalizedQuery);
    });
  }, [activeShelfKey, books, formatFilter, normalizedQuery, progress, statusFilter]);

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
    setStatusFilter('all');
    setFormatFilter('all');
    setActiveShelfKey(null);
  }, []);

  const selectedBooks = useMemo(
    () => books.filter((book) => selectedIds.has(book.id)),
    [books, selectedIds],
  );

  const isFiltering = Boolean(
    normalizedQuery || activeShelfKey || statusFilter !== 'all' || formatFilter !== 'all',
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
    statusFilter,
    setStatusFilter,
    formatFilter,
    setFormatFilter,
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
