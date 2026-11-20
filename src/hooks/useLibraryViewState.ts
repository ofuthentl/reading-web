import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, ReadingProgress, ShelfGroup } from '@/types';
import { groupBooksIntoShelves } from '@/lib/api';

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi')
    .trim();
}

export interface LibraryViewState {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeShelfKey: string | null;
  setActiveShelfKey: (key: string | null) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  allShelves: ShelfGroup[];
  continueReadingBooks: Book[];
  filteredBooks: Book[];
  visibleShelves: ShelfGroup[];
  selectedBooks: Book[];
  isFiltering: boolean;
  toggleSelectionMode: () => void;
  toggleSelectBook: (bookId: string) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  clearFilters: () => void;
}

export function useLibraryViewState(
  books: Book[],
  progress: Record<string, ReadingProgress>,
  selectionResetKey?: number,
): LibraryViewState {
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

  const continueReadingBooks = useMemo(() => {
    return books
      .filter((book) => Boolean(progress[book.id]))
      .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0))
      .slice(0, 8);
  }, [books, progress]);

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);

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
    searchQuery,
    setSearchQuery,
    activeShelfKey,
    setActiveShelfKey,
    selectionMode,
    selectedIds,
    allShelves,
    continueReadingBooks,
    filteredBooks,
    visibleShelves,
    selectedBooks,
    isFiltering,
    toggleSelectionMode,
    toggleSelectBook,
    selectAllVisible,
    clearSelection,
    clearFilters,
  };
}
