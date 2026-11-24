import type { Book } from '@/types';
import {
  cleanShelfLabel,
  extractSeriesName,
  hasMeaningfulShelfLetters,
  inferSingleBookShelf,
  isIgnoredShelfPrefix,
  isKnownAuthor,
  normalizeShelfPlacementKey,
} from '@/lib/shelfPlacement';

/**
 * Bộ lập kế hoạch phân kệ & gom lô cho luồng Tải sách / Di chuyển hàng loạt (Admin-only, tách khỏi entry chunk).
 */

const DEFAULT_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK = 'Sách chưa đặt tên';

function isValidCommonShelfCandidate(candidate: string): boolean {
  const clean = cleanShelfLabel(candidate);
  if (!clean || clean === UNTITLED_BOOK) return false;
  const key = normalizeShelfPlacementKey(clean);
  if (isIgnoredShelfPrefix(key)) return false;
  if (!hasMeaningfulShelfLetters(clean)) return false;
  return clean.replace(/\s+/g, '').length >= 2;
}

function collectDirectCandidatesForTitle(rawTitle: string): Map<string, string> {
  const candidates = new Map<string, string>();
  const addCandidate = (value: string | null | undefined) => {
    if (!value) return;
    const cleaned = cleanShelfLabel(value);
    if (!isValidCommonShelfCandidate(cleaned)) return;
    const key = normalizeShelfPlacementKey(cleaned);
    if (!candidates.has(key)) {
      candidates.set(key, cleaned);
    }
  };

  const cleanTitle = rawTitle.trim();
  if (!cleanTitle || cleanTitle === UNTITLED_BOOK) return candidates;

  const series = extractSeriesName(cleanTitle);
  addCandidate(series);

  const baseForSplit = series || cleanShelfLabel(cleanTitle);
  addCandidate(baseForSplit);

  const delimRe = /\s*[_:\-–—―−|：/(（[［【]+\s*/g;
  let match = delimRe.exec(baseForSplit);
  while (match !== null) {
    const rawPrefix = baseForSplit.slice(0, match.index);
    addCandidate(rawPrefix);
    addCandidate(extractSeriesName(rawPrefix));
    match = delimRe.exec(baseForSplit);
  }

  const words = baseForSplit
    .split(/\s+/)
    .filter((token) => Boolean(token) && !/^[-–—―−_:|：;/~]+$/.test(token));
  for (let count = 1; count <= Math.min(words.length, 24); count += 1) {
    const wordPrefix = words.slice(0, count).join(' ');
    addCandidate(wordPrefix);
    addCandidate(extractSeriesName(wordPrefix));
  }

  return candidates;
}

function resolveExistingSeriesShelf(
  seriesName: string,
  existingBooks: Book[],
): { shelf: string; booksToRegroup: Book[] } {
  const cleanedSeries = cleanShelfLabel(seriesName) || seriesName.trim();
  const seriesKey = normalizeShelfPlacementKey(cleanedSeries);
  const peerSeriesBooks = existingBooks.filter((book) => {
    const bookSeries = extractSeriesName(book.title);
    return Boolean(bookSeries) && normalizeShelfPlacementKey(bookSeries!) === seriesKey;
  });

  if (peerSeriesBooks.length > 0) {
    const shelfGroups = new Map<
      string,
      { shelf: string; count: number; isRenamed: boolean; books: Book[] }
    >();
    for (const book of peerSeriesBooks) {
      const shelf = cleanShelfLabel(book.shelf || '');
      if (!shelf || normalizeShelfPlacementKey(shelf) === normalizeShelfPlacementKey(DEFAULT_SHELF)) {
        continue;
      }
      if (
        isKnownAuthor(book.author) &&
        normalizeShelfPlacementKey(shelf) === normalizeShelfPlacementKey(book.author)
      ) {
        continue;
      }

      const sKey = normalizeShelfPlacementKey(shelf);
      const isRenamed = sKey !== seriesKey;
      const existing = shelfGroups.get(sKey);
      if (existing) {
        existing.count += 1;
        existing.books.push(book);
      } else {
        shelfGroups.set(sKey, { shelf: book.shelf.trim(), count: 1, isRenamed, books: [book] });
      }
    }

    let chosen: { shelf: string; count: number; isRenamed: boolean } | null = null;
    for (const group of shelfGroups.values()) {
      if (!chosen) {
        chosen = group;
        continue;
      }
      if (group.isRenamed !== chosen.isRenamed) {
        if (group.isRenamed) chosen = group;
        continue;
      }
      if (group.count > chosen.count) {
        chosen = group;
      }
    }

    if (chosen) {
      const booksToRegroup = chosen.isRenamed
        ? peerSeriesBooks.filter((b) => normalizeShelfPlacementKey(b.shelf) === seriesKey)
        : [];
      return { shelf: chosen.shelf, booksToRegroup };
    }
  }

  const exactMatch = existingBooks.find(
    (book) => normalizeShelfPlacementKey(book.shelf) === seriesKey,
  )?.shelf;
  if (exactMatch) {
    return { shelf: exactMatch, booksToRegroup: [] };
  }

  if (seriesKey.length >= 4) {
    const prefixShelf = existingBooks.find((book) => {
      const sKey = normalizeShelfPlacementKey(book.shelf);
      return sKey.startsWith(`${seriesKey} `);
    })?.shelf;
    if (prefixShelf) {
      return { shelf: prefixShelf, booksToRegroup: [] };
    }
  }

  return { shelf: cleanedSeries, booksToRegroup: [] };
}

export function inferBatchCommonShelf(
  items: Array<{ title: string; author: string }>,
  existingBooks: Book[],
): string | null {
  const validItems = items.filter(
    (item) => Boolean(item.title?.trim()) && item.title.trim() !== UNTITLED_BOOK,
  );
  if (validItems.length < 2) return null;

  const existingShelfMap = new Map<string, string>();
  for (const book of existingBooks) {
    const shelf = book.shelf?.trim();
    if (shelf && shelf !== DEFAULT_SHELF) {
      const key = normalizeShelfPlacementKey(shelf);
      if (!existingShelfMap.has(key)) {
        existingShelfMap.set(key, shelf);
      }
    }
  }

  const itemDirectMaps = validItems.map((item) => collectDirectCandidatesForTitle(item.title));
  const knownDirectRoots = new Map<string, string>();

  for (const [key, shelfName] of existingShelfMap.entries()) {
    if (isValidCommonShelfCandidate(shelfName)) {
      knownDirectRoots.set(key, shelfName);
    }
  }
  for (const map of itemDirectMaps) {
    for (const [key, label] of map.entries()) {
      if (!knownDirectRoots.has(key)) {
        knownDirectRoots.set(key, label);
      }
    }
  }

  for (let idx = 0; idx < validItems.length; idx += 1) {
    const map = itemDirectMaps[idx];
    const currentEntries = Array.from(map.values());
    for (const label of currentEntries) {
      if (/^[A-Za-z]{4,8}$/.test(label)) {
        for (let len = 3; len < label.length; len += 1) {
          const shortPrefix = label.slice(0, len);
          const shortKey = normalizeShelfPlacementKey(shortPrefix);
          const knownLabel = knownDirectRoots.get(shortKey);
          if (knownLabel && !map.has(shortKey)) {
            map.set(shortKey, knownLabel);
          }
        }
      }
    }
  }

  const stats = new Map<string, { label: string; count: number }>();
  for (const map of itemDirectMaps) {
    for (const [key, label] of map.entries()) {
      const prev = stats.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        stats.set(key, { label: existingShelfMap.get(key) || label, count: 1 });
      }
    }
  }

  // Yêu cầu >= 80% lô khớp chung tên kệ (tránh kéo 1 cuốn Bộ B vào kệ Bộ A khi tải lẫn 2A + 1B)
  const minRequiredCount = Math.max(2, Math.ceil(validItems.length * 0.8));
  let best: { key: string; label: string; count: number } | null = null;

  for (const [key, entry] of stats.entries()) {
    if (entry.count < minRequiredCount) continue;
    if (!best) {
      best = { key, ...entry };
      continue;
    }
    if (entry.count > best.count) {
      best = { key, ...entry };
      continue;
    }
    if (entry.count === best.count) {
      const entryInLibrary = existingShelfMap.has(key);
      const bestInLibrary = existingShelfMap.has(best.key);
      if (entryInLibrary !== bestInLibrary) {
        if (entryInLibrary) best = { key, ...entry };
        continue;
      }
      if (entry.label.length > best.label.length) {
        best = { key, ...entry };
      }
    }
  }

  if (!best) return null;

  // Nếu có tập trong lô thuộc 1 bộ truyện rõ ràng khác hẳn best.key → không tự bật gom lô
  for (let idx = 0; idx < validItems.length; idx += 1) {
    if (itemDirectMaps[idx].has(best.key)) continue;
    const explicitSeries = extractSeriesName(validItems[idx].title);
    if (explicitSeries && normalizeShelfPlacementKey(explicitSeries) !== best.key) {
      return null;
    }
  }

  const resolved = resolveExistingSeriesShelf(best.label, existingBooks);
  return resolved.shelf || existingShelfMap.get(best.key) || cleanShelfLabel(best.label);
}

function isStandaloneInTitleShelf(book: Book): boolean {
  if (extractSeriesName(book.title) !== null) return false;
  return normalizeShelfPlacementKey(book.shelf) === normalizeShelfPlacementKey(book.title);
}

export function resolveUploadShelfPlan(
  incoming: { title: string; author: string },
  existingBooks: Book[],
): { shelf: string; booksToRegroup: Book[] } {
  const series = extractSeriesName(incoming.title);
  if (series) {
    return resolveExistingSeriesShelf(series, existingBooks);
  }

  const cleanTitle = incoming.title.trim();
  const cleanAuthor = incoming.author.trim();

  if (isKnownAuthor(cleanAuthor)) {
    const authorKey = normalizeShelfPlacementKey(cleanAuthor);
    const titleKey = normalizeShelfPlacementKey(cleanTitle);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeShelfPlacementKey(book.shelf) === authorKey,
    )?.shelf;

    const standalonePeers = existingBooks.filter((book) => {
      if (normalizeShelfPlacementKey(book.author) !== authorKey) return false;
      if (extractSeriesName(book.title) !== null) return false;
      return normalizeShelfPlacementKey(book.title) !== titleKey;
    });

    if (existingAuthorShelf || standalonePeers.length > 0) {
      const targetAuthorShelf = existingAuthorShelf || cleanAuthor;
      const booksToRegroup = standalonePeers.filter((book) => isStandaloneInTitleShelf(book));
      return { shelf: targetAuthorShelf, booksToRegroup };
    }
  }

  return { shelf: inferSingleBookShelf(cleanTitle, cleanAuthor), booksToRegroup: [] };
}

export function resolvePreviewShelfName(
  item: { id: string; title: string; author: string },
  activeQueue: Array<{ id: string; title: string; author: string }>,
  existingBooks: Book[],
): string {
  const series = extractSeriesName(item.title);
  if (series) {
    return resolveExistingSeriesShelf(series, existingBooks).shelf;
  }

  const cleanAuthor = item.author.trim();
  if (isKnownAuthor(cleanAuthor)) {
    const authorKey = normalizeShelfPlacementKey(cleanAuthor);
    const titleKey = normalizeShelfPlacementKey(item.title);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeShelfPlacementKey(book.shelf) === authorKey,
    )?.shelf;
    if (existingAuthorShelf) return existingAuthorShelf;

    const hasExistingStandalonePeer = existingBooks.some(
      (book) =>
        normalizeShelfPlacementKey(book.author) === authorKey &&
        extractSeriesName(book.title) === null &&
        normalizeShelfPlacementKey(book.title) !== titleKey,
    );
    if (hasExistingStandalonePeer) return cleanAuthor;

    const hasQueuedStandalonePeer = activeQueue.some(
      (other) =>
        other.id !== item.id &&
        normalizeShelfPlacementKey(other.author) === authorKey &&
        extractSeriesName(other.title) === null &&
        normalizeShelfPlacementKey(other.title) !== titleKey,
    );
    if (hasQueuedStandalonePeer) return cleanAuthor;
  }

  return inferSingleBookShelf(item.title, item.author);
}
