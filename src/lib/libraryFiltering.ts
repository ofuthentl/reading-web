import type {
  AuthRole,
  Book,
  LibrarySortMode,
  LibraryStatusFilter,
  ReadingProgress,
  ShelfGroup,
  ShelfRatingSummary,
  TagMatchMode,
} from '@/types';
import {
  buildShelfAuthorContext,
  splitNormalizedAuthors,
  stripDiacriticsLower,
} from '@/lib/authorHeuristics';
import { getDisplayAuthor, isVolumeOrSubtitleSegment, titleEndsWithBareVolume } from '@/lib/bookMetadata';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import { sortShelvesFavoriteFirst, toShelfPrefKey } from '@/lib/shelfPrefs';

export function normalizeSearchText(input: string): string {
  return stripDiacriticsLower(input);
}

export function normalizeTagFilterKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function matchesBookAuthor(
  book: Book,
  normalizedAuthor: string,
  effectiveAuthorByBookId?: ReadonlyMap<string, string>,
): boolean {
  if (!normalizedAuthor) return true;
  const displayAuthor = effectiveAuthorByBookId?.get(book.id) ?? getDisplayAuthor(book.author, book.title);
  if (!isKnownAuthor(displayAuthor) || isVolumeOrSubtitleSegment(displayAuthor)) return false;
  if (normalizeSearchText(displayAuthor).includes(normalizedAuthor)) return true;
  return splitNormalizedAuthors(displayAuthor).some((part) =>
    normalizeSearchText(part).includes(normalizedAuthor),
  );
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

export function matchesShelfSearchQuery(
  shelf: ShelfGroup,
  normalizedQuery: string,
  shelfTags?: Readonly<Record<string, string[]>>,
  shelfAltTitles?: Readonly<Record<string, string[]>>,
): boolean {
  if (!normalizedQuery) return true;
  if (normalizeSearchText(shelf.name).includes(normalizedQuery)) return true;
  const altList = shelfAltTitles?.[shelf.key];
  if (altList && altList.some((alt) => normalizeSearchText(alt).includes(normalizedQuery))) {
    return true;
  }
  const tagsText = (shelfTags?.[shelf.key] || []).join(' ');
  if (tagsText && normalizeSearchText(tagsText).includes(normalizedQuery)) return true;
  return shelf.books.some((book) =>
    normalizeSearchText(`${book.title} ${book.author}`).includes(normalizedQuery),
  );
}

export function matchesBookSearchQuery(
  book: Book,
  shelfKey: string,
  normalizedQuery: string,
  shelfTags?: Readonly<Record<string, string[]>>,
  shelfAltTitles?: Readonly<Record<string, string[]>>,
): boolean {
  if (!normalizedQuery) return true;
  const altText = (shelfAltTitles?.[shelfKey] || []).join(' ');
  const tagsText = (shelfTags?.[shelfKey] || []).join(' ');
  const haystack = normalizeSearchText(
    `${book.title} ${book.author} ${book.shelf} ${altText} ${tagsText}`,
  );
  return haystack.includes(normalizedQuery);
}

export function collectAvailableAuthors(
  books: readonly Book[],
  effectiveAuthorByBookId?: ReadonlyMap<string, string>,
): string[] {
  const authorMap =
    effectiveAuthorByBookId ??
    buildShelfAuthorContext(books, getDisplayAuthor, titleEndsWithBareVolume);
  const byKey = new Map<string, { label: string; count: number }>();

  for (const book of books) {
    const resolved = authorMap.get(book.id) ?? getDisplayAuthor(book.author, book.title);
    if (!isKnownAuthor(resolved) || isVolumeOrSubtitleSegment(resolved)) continue;
    const parts = splitNormalizedAuthors(resolved);
    const names = parts.length > 0 ? parts : [resolved];
    for (const name of names) {
      const key = normalizeSearchText(name);
      if (!key) continue;
      const prev = byKey.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        byKey.set(key, { label: name, count: 1 });
      }
    }
  }
  return Array.from(byKey.values())
    .map((entry) => entry.label)
    .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
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

export function selectWeeklyPopularBooks(
  books: readonly Book[],
  recentlyAddedBooks: readonly Book[],
  weeklyPopularIds?: readonly string[],
  sessionRole?: AuthRole,
): Book[] {
  if (!weeklyPopularIds || weeklyPopularIds.length === 0) {
    return [...recentlyAddedBooks];
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
}

export function matchesBookStatus(
  book: Book,
  progress: Readonly<Record<string, ReadingProgress>>,
  filter: LibraryStatusFilter,
  planToReadShelfKeys?: ReadonlySet<string>,
  planToReadBookIds?: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'plan_to_read') {
    if (planToReadBookIds?.has(book.id)) return true;
    const shelfKey = toShelfPrefKey(book.shelf || 'Kho chưa phân loại');
    return Boolean(planToReadShelfKeys?.has(shelfKey));
  }
  const item = progress[book.id];
  if (filter === 'unread') return !item;
  if (filter === 'completed') return Boolean(item?.completed);
  return Boolean(item && !item.completed);
}

export function matchesShelfStatus(
  shelf: ShelfGroup,
  progress: Readonly<Record<string, ReadingProgress>>,
  filter: LibraryStatusFilter,
  planToReadShelfKeys?: ReadonlySet<string>,
  planToReadBookIds?: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'plan_to_read') {
    if (planToReadShelfKeys?.has(shelf.key)) return true;
    return Boolean(planToReadBookIds && shelf.books.some((b) => planToReadBookIds.has(b.id)));
  }
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
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>,
): ShelfGroup[] {
  if (sortMode === 'title_asc') {
    return sortShelvesFavoriteFirst(shelves, favoriteShelfKeys);
  }

  if (sortMode === 'rating_desc') {
    const byRating = [...shelves].sort((a, b) => {
      const ra = shelfRatings?.[a.key];
      const rb = shelfRatings?.[b.key];
      const avgDiff = (rb?.average ?? 0) - (ra?.average ?? 0);
      if (avgDiff !== 0) return avgDiff;
      const cntDiff = (rb?.count ?? 0) - (ra?.count ?? 0);
      if (cntDiff !== 0) return cntDiff;
      return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base', numeric: true });
    });
    return sortShelvesFavoriteFirst(byRating, favoriteShelfKeys);
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
