import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, LibraryTab, ReadingProgress, ShelfGroup } from '@/types';
import { groupBooksIntoShelves } from '@/lib/api';
import { computeBookProgressPercent } from '@/lib/bookMetadata';

export { computeBookProgressPercent };

export const LIBRARY_TAB_STORAGE_KEY = 'ofu-library-active-tab';

function readStoredLibraryTab(): LibraryTab {
  try {
    const raw = localStorage.getItem(LIBRARY_TAB_STORAGE_KEY);
    return raw === 'library' ? 'library' : 'home';
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
  activeShelfKey: string | null;
  setActiveShelfKey: (key: string | null) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  allShelves: ShelfGroup[];
  libraryShelves: ShelfGroup[];
  continueReadingBooks: Book[];
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
): LibraryViewState {
  const [activeTab, setActiveTabState] = useState<LibraryTab>(readStoredLibraryTab);
  const [openedLibraryShelfKey, setOpenedLibraryShelfKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
    if (books.length === 0) {
      setSelectionMode(false);
    }
    const validIds = new Set(books.map((book) => book.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [books]);

  const allShelves = useMemo(() => groupBooksIntoShelves(books), [books]);

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
    if (tab === 'library') {
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

  const continueReadingBooks = useMemo(() => {
    return books
      .filter((book) => Boolean(progress[book.id]))
      .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0))
      .slice(0, 8);
  }, [books, progress]);

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);

  // Lọc kệ cho Tab Thư viện: giữ nguyên đủ tập & ảnh bìa Tập 1 ngay cả khi từ khoá khớp tên 1 tập
  const libraryShelves = useMemo(() => {
    if (!normalizedQuery) return allShelves;
    return allShelves.filter((shelf) => {
      if (normalizeSearchText(shelf.name).includes(normalizedQuery)) return true;
      return shelf.books.some((book) =>
        normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery),
      );
    });
  }, [allShelves, normalizedQuery]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      if (activeShelfKey) {
        const shelfKey = (book.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi');
        if (shelfKey !== activeShelfKey) return false;
      }
      if (!normalizedQuery) return true;
      const haystack = normalizeSearchText(`${book.title} ${book.author} ${book.shelf}`);
      return haystack.includes(normalizedQuery);
    });
  }, [books, activeShelfKey, normalizedQuery]);

  const visibleShelves = useMemo(() => groupBooksIntoShelves(filteredBooks), [filteredBooks]);

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
    setActiveShelfKey(null);
  }, []);

  const selectedBooks = useMemo(
    () => books.filter((book) => selectedIds.has(book.id)),
    [books, selectedIds],
  );

  const isFiltering = Boolean(normalizedQuery || activeShelfKey);

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
    activeShelfKey,
    setActiveShelfKey,
    selectionMode,
    selectedIds,
    allShelves,
    libraryShelves,
    continueReadingBooks,
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
