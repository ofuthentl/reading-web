import type { Book, BookFileType, ReadingProgress } from '@/types';
import { computeBookProgressPercent, groupBooksIntoShelves } from '@/lib/bookMetadata';

export const EPUB_PAGES_PER_CHAPTER = 20;

export interface LibraryReadingTotals {
  completedBooks: number;
  readPages: number;
}

export interface ReaderRpgStats {
  level: number;
  totalXp: number;
  xpInLevel: number;
  xpForNextLevel: number;
  xpPercent: number;
  completedBooks: number;
  inProgressBooks: number;
  readPages: number;
}

export interface DetailedLibraryInsights {
  rpg: ReaderRpgStats;
  totalBooks: number;
  unreadBooks: number;
  totalRereads: number;
  completionPercent: number;
  totalShelves: number;
  completedShelves: number;
  activeShelves: number;
  formatCounts: Record<BookFileType, number>;
  recentBooks: Array<{
    book: Book;
    progress: ReadingProgress;
    percent: number;
  }>;
}

export function computeLibraryReadingTotals(
  books: readonly Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
): LibraryReadingTotals {
  let completedBooks = 0;
  let readPages = 0;

  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    const p = progress[book.id];
    if (!p) continue;

    const percent = computeBookProgressPercent(book, p);
    const isDone = p.completed || percent === 100;
    if (isDone) {
      completedBooks += 1;
    }

    if (isDone) {
      const totalCh = Math.max(1, p.totalChapters ?? p.chapterIndex + 1);
      readPages += totalCh * EPUB_PAGES_PER_CHAPTER;
    } else {
      const clampedRatio = Math.max(0, Math.min(1, p.scrollRatio));
      readPages += Math.round((Math.max(0, p.chapterIndex) + clampedRatio) * EPUB_PAGES_PER_CHAPTER);
    }
  }

  return { completedBooks, readPages };
}

export function computeReaderRpgStats(
  books: readonly Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
): ReaderRpgStats {
  const { completedBooks, readPages } = computeLibraryReadingTotals(books, progress);
  let inProgressBooks = 0;
  for (let i = 0; i < books.length; i += 1) {
    const p = progress[books[i].id];
    if (!p) continue;
    const pct = computeBookProgressPercent(books[i], p);
    if (!p.completed && pct !== 100 && (p.chapterIndex > 0 || p.scrollRatio > 0.01)) {
      inProgressBooks += 1;
    }
  }

  const totalXp = completedBooks * 250 + readPages * 4 + inProgressBooks * 25;

  let level = 1;
  let remainingXp = totalXp;
  let xpForNextLevel = 250;
  while (remainingXp >= xpForNextLevel) {
    remainingXp -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 150 + level * 100;
  }

  const xpPercent = Math.min(100, Math.round((remainingXp / Math.max(1, xpForNextLevel)) * 100));

  return {
    level,
    totalXp,
    xpInLevel: remainingXp,
    xpForNextLevel,
    xpPercent,
    completedBooks,
    inProgressBooks,
    readPages,
  };
}

export function computeDetailedLibraryInsights(
  books: Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
): DetailedLibraryInsights {
  const rpg = computeReaderRpgStats(books, progress);
  const totalBooks = books.length;
  let startedCount = 0;
  let totalRereads = 0;
  const formatCounts: Record<BookFileType, number> = { epub: 0, docx: 0 };

  for (const b of books) {
    formatCounts[b.file_type] = (formatCounts[b.file_type] ?? 0) + 1;
    const p = progress[b.id];
    if (p) {
      startedCount += 1;
      totalRereads += Math.max(0, Math.floor(p.rereadCount ?? 0));
    }
  }

  const unreadBooks = Math.max(0, totalBooks - startedCount);
  const completionPercent =
    totalBooks > 0 ? Math.round((rpg.completedBooks / totalBooks) * 100) : 0;

  const shelves = groupBooksIntoShelves(books);
  let completedShelves = 0;
  let activeShelves = 0;
  for (const shelf of shelves) {
    const doneInShelf = shelf.books.filter((b) => progress[b.id]?.completed).length;
    const anyStarted = shelf.books.some((b) => Boolean(progress[b.id]));
    if (shelf.books.length > 0 && doneInShelf === shelf.books.length) {
      completedShelves += 1;
    } else if (anyStarted) {
      activeShelves += 1;
    }
  }

  const recentBooks = books
    .filter((b) => Boolean(progress[b.id]))
    .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0))
    .slice(0, 8)
    .map((book) => ({
      book,
      progress: progress[book.id]!,
      percent: computeBookProgressPercent(book, progress[book.id]) ?? 0,
    }));

  return {
    rpg,
    totalBooks,
    unreadBooks,
    totalRereads,
    completionPercent,
    totalShelves: shelves.length,
    completedShelves,
    activeShelves,
    formatCounts,
    recentBooks,
  };
}
