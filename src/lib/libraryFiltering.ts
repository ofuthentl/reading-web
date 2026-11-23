import type {
  AuthRole,
  Book,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfGroup,
  TagMatchMode,
} from '@/types';
import { getDisplayAuthor, isVolumeOrSubtitleSegment } from '@/lib/bookMetadata';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import { sortShelvesFavoriteFirst } from '@/lib/shelfPrefs';

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi')
    .trim();
}

export function normalizeTagFilterKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function matchesBookAuthor(book: Book, normalizedAuthor: string): boolean {
  if (!normalizedAuthor) return true;
  const displayAuthor = getDisplayAuthor(book.author, book.title);
  if (!isKnownAuthor(displayAuthor) || isVolumeOrSubtitleSegment(displayAuthor)) return false;
  return normalizeSearchText(displayAuthor).includes(normalizedAuthor);
}

export function matchesShelfTagFilters(
  shelfKey: string,
  shelfTags: Readonly<Record<string, string[]>> | undefined,
  includedKeys: readonly string[],
  excludedKeys: readonly string[],
  matchMode: TagMatchMode,
): boolean {
  if (includedKeys.length === 0 && excludedKeys.length === 0) return true;
  const rawTags = shelfTags?.[shelfKey];
  const tagSet = new Set((rawTags || []).map(normalizeTagFilterKey));
  for (const ex of excludedKeys) {
    if (tagSet.has(ex)) return false;
  }
  if (includedKeys.length === 0) return true;
  return matchMode === 'any'
    ? includedKeys.some((inc) => tagSet.has(inc))
    : includedKeys.every((inc) => tagSet.has(inc));
}

export function collectAvailableAuthors(books: readonly Book[]): string[] {
  const byKey = new Map<string, string>();
  for (const book of books) {
    const resolved = getDisplayAuthor(book.author, book.title);
    if (!isKnownAuthor(resolved) || isVolumeOrSubtitleSegment(resolved)) continue;
    const key = normalizeSearchText(resolved);
    if (key && !byKey.has(key)) byKey.set(key, resolved);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.localeCompare(b, 'vi', { sensitivity: 'base' }),
  );
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

export function matchesBookStatus(
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

export function matchesShelfStatus(
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

export function sortShelvesByMode(
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

export function prioritizeGuestReadable(books: Book[], sessionRole?: AuthRole): Book[] {
  if (sessionRole !== 'guest') return books;
  const ready: Book[] = [];
  const locked: Book[] = [];
  for (const b of books) {
    if (!b.guest_locked && b.guest_ready !== false) ready.push(b);
    else locked.push(b);
  }
  return [...ready, ...locked];
}
