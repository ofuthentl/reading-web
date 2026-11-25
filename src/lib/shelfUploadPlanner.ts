import type { Book } from '@/types';
import { buildShelfAuthorContext, stripDiacriticsLower } from '@/lib/authorHeuristics';
import { getDisplayAuthor } from '@/lib/bookMetadata';
import {
  cleanShelfLabel,
  extractSeriesName,
  hasMeaningfulShelfLetters,
  inferSingleBookShelf,
  isIgnoredShelfPrefix,
} from '@/lib/seriesShelfExtractor';
import {
  isKnownAuthor,
  normalizeShelfPlacementKey,
  titleEndsWithBareVolume,
} from '@/lib/shelfPlacement';

/**
 * Bộ lập kế hoạch phân kệ & gom lô cho luồng Tải sách / Di chuyển hàng loạt (Admin-only, tách khỏi entry chunk).
 */

const DEFAULT_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK = 'Sách chưa đặt tên';
const UNKNOWN_AUTHOR = 'Không rõ tác giả';

// Hậu tố biểu thị phần kế / hậu truyện / ngoại truyện / nhánh spinoff riêng biệt (không gộp vào bộ chính)
const SUB_SERIES_MODIFIER_RE =
  /(?:^|[\s\-–—―−_:|：/([（])(?:after\s+the\s+end|redundancy|jobless\s+oblige|old\s+dragon'?s\s+tale|recollection|journey\s+of\s+two\s+lifetimes|progressive|alternative|another|gaiden|spin-?off|(?:ngoai|hau|tien)\s+truyen|phien\s+ngoai|(?:side|short)\s+stor(?:y|ies)|extra|special|bonus|ss|ex|sp|zero|season\s*\d+|s\d+|(?:part|phan)\s*[2-9])(?=$|[\s\-–—―−_:|：/)\]]|$)/i;

/**
 * Khoá so khớp tên kệ không nhạy dấu gạch/hai chấm thừa ở hai đầu hoặc giữa các từ
 * (VD `"Unnamed Memory - After the End"` khớp chuẩn kệ `"Unnamed Memory -after the end-"`
 * mà tuyệt đối không trùng với `"Unnamed Memory"`).
 */
export function normalizeShelfMatchKey(value: string): string {
  return cleanShelfLabel(value)
    .normalize('NFC')
    .replace(/[-–—―−_:|：]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

export function hasSubSeriesModifier(value: string): boolean {
  const ascii = stripDiacriticsLower(value);
  return Boolean(ascii) && SUB_SERIES_MODIFIER_RE.test(ascii);
}

function isValidCommonShelfCandidate(candidate: string): boolean {
  const clean = cleanShelfLabel(candidate);
  if (!clean || clean === UNTITLED_BOOK) return false;
  const key = normalizeShelfPlacementKey(clean);
  if (isIgnoredShelfPrefix(key)) return false;
  if (!hasMeaningfulShelfLetters(clean)) return false;
  return clean.replace(/\s+/g, '').length >= 2;
}

interface DirectCandidateEntry {
  label: string;
  isExplicitSeries: boolean;
}

function collectDirectCandidatesForTitle(rawTitle: string): Map<string, DirectCandidateEntry> {
  const candidates = new Map<string, DirectCandidateEntry>();
  const addCandidate = (value: string | null | undefined, isExplicitSeries = false) => {
    if (!value) return;
    const cleaned = cleanShelfLabel(value);
    if (!isValidCommonShelfCandidate(cleaned)) return;
    const key = normalizeShelfMatchKey(cleaned);
    if (!key) return;
    const existing = candidates.get(key);
    if (!existing) {
      candidates.set(key, { label: cleaned, isExplicitSeries });
    } else if (isExplicitSeries && !existing.isExplicitSeries) {
      candidates.set(key, { label: cleaned, isExplicitSeries: true });
    }
  };

  const cleanTitle = rawTitle.trim();
  if (!cleanTitle || cleanTitle === UNTITLED_BOOK) return candidates;

  const series = extractSeriesName(cleanTitle);
  addCandidate(series, true);

  const baseForSplit = series || cleanShelfLabel(cleanTitle);
  addCandidate(baseForSplit, Boolean(series));

  const delimRe = /\s*[_:\-–—―−|：/(（[［【]+\s*/g;
  let match = delimRe.exec(baseForSplit);
  while (match !== null) {
    const rawPrefix = baseForSplit.slice(0, match.index);
    addCandidate(rawPrefix, false);
    addCandidate(extractSeriesName(rawPrefix), false);
    match = delimRe.exec(baseForSplit);
  }

  const words = baseForSplit
    .split(/\s+/)
    .filter((token) => Boolean(token) && !/^[-–—―−_:|：;/~]+$/.test(token));
  for (let count = 1; count <= Math.min(words.length, 24); count += 1) {
    const wordPrefix = words.slice(0, count).join(' ');
    addCandidate(wordPrefix, false);
    addCandidate(extractSeriesName(wordPrefix), false);
  }

  return candidates;
}

function buildExistingShelfLookups(existingBooks: readonly Book[]): {
  byPlacementKey: Map<string, string>;
  byMatchKey: Map<string, string>;
  allShelves: string[];
} {
  const byPlacementKey = new Map<string, string>();
  const byMatchKey = new Map<string, string>();
  const allShelves: string[] = [];
  const defaultKey = normalizeShelfPlacementKey(DEFAULT_SHELF);

  for (const book of existingBooks) {
    const shelf = book.shelf?.trim();
    if (!shelf) continue;
    const pKey = normalizeShelfPlacementKey(shelf);
    if (!pKey || pKey === defaultKey) continue;
    if (!byPlacementKey.has(pKey)) {
      byPlacementKey.set(pKey, shelf);
      allShelves.push(shelf);
    }
    const mKey = normalizeShelfMatchKey(shelf);
    if (mKey && !byMatchKey.has(mKey)) {
      byMatchKey.set(mKey, shelf);
    }
  }
  return { byPlacementKey, byMatchKey, allShelves };
}

function resolveExistingSeriesShelf(
  seriesName: string,
  existingBooks: Book[],
): { shelf: string; booksToRegroup: Book[] } {
  const cleanedSeries = cleanShelfLabel(seriesName) || seriesName.trim();
  const seriesKey = normalizeShelfPlacementKey(cleanedSeries);
  const seriesMatchKey = normalizeShelfMatchKey(cleanedSeries);
  const { byPlacementKey, byMatchKey, allShelves } = buildExistingShelfLookups(existingBooks);

  // 1. Ưu tiên TUYỆT ĐỐI khớp chính xác tên kệ (kể cả kệ có dấu gạch cuối như `Unnamed Memory -after the end-`)
  // → tuyệt đối không để kệ phụ/đổi tên đè lên kệ khớp chính xác hay kéo sách sang kệ khác.
  const exactMatch = byPlacementKey.get(seriesKey) ?? byMatchKey.get(seriesMatchKey);
  if (exactMatch) {
    return { shelf: exactMatch, booksToRegroup: [] };
  }

  const incomingHasModifier = hasSubSeriesModifier(cleanedSeries);
  const defaultKey = normalizeShelfPlacementKey(DEFAULT_SHELF);

  // 2. Nếu chưa có kệ khớp chính xác: tìm kệ đã đổi tên của ĐÚNG bộ này (VD `Mushoku Tensei - Thất Nghiệp Chuyển Sinh`),
  // loại trừ hoàn toàn các kệ hậu truyện/ngoại truyện/spinoff khi sách mới thuộc bộ chính.
  const peerSeriesBooks = existingBooks.filter((book) => {
    const bookSeries = extractSeriesName(book.title);
    return Boolean(bookSeries) && normalizeShelfMatchKey(bookSeries!) === seriesMatchKey;
  });

  if (peerSeriesBooks.length > 0) {
    const shelfGroups = new Map<string, { shelf: string; count: number }>();
    for (const book of peerSeriesBooks) {
      const rawShelf = book.shelf?.trim() || '';
      const shelf = cleanShelfLabel(rawShelf);
      if (!shelf || normalizeShelfPlacementKey(shelf) === defaultKey) continue;
      if (
        isKnownAuthor(book.author) &&
        normalizeShelfPlacementKey(shelf) === normalizeShelfPlacementKey(book.author)
      ) {
        continue;
      }
      if (!incomingHasModifier && hasSubSeriesModifier(rawShelf)) {
        continue;
      }

      const sKey = normalizeShelfMatchKey(rawShelf);
      const existing = shelfGroups.get(sKey);
      if (existing) existing.count += 1;
      else shelfGroups.set(sKey, { shelf: rawShelf, count: 1 });
    }

    let chosen: { shelf: string; count: number } | null = null;
    for (const group of shelfGroups.values()) {
      if (!chosen || group.count > chosen.count) {
        chosen = group;
      }
    }
    if (chosen) {
      return { shelf: chosen.shelf, booksToRegroup: [] };
    }
  }

  // 3. Khớp tiền tố an toàn (chỉ cho kệ đổi tên song ngữ kiểu `Mushoku Tensei - Thất Nghiệp Chuyển Sinh`):
  // cấm khớp vào kệ mang hậu tố hậu truyện/ngoại truyện/spinoff và chỉ chọn khi có DUY NHẤT 1 ứng viên không mơ hồ.
  if (!incomingHasModifier && seriesMatchKey.length >= 4) {
    const safePrefixMatches = allShelves.filter((shelf) => {
      const sMatchKey = normalizeShelfMatchKey(shelf);
      if (!sMatchKey.startsWith(`${seriesMatchKey} `)) return false;
      const suffix = sMatchKey.slice(seriesMatchKey.length).trim();
      return Boolean(suffix) && !hasSubSeriesModifier(suffix);
    });
    if (safePrefixMatches.length === 1) {
      return { shelf: safePrefixMatches[0], booksToRegroup: [] };
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

  const { byMatchKey: existingShelfMap } = buildExistingShelfLookups(existingBooks);
  const itemDirectMaps = validItems.map((item) => collectDirectCandidatesForTitle(item.title));
  const knownDirectRoots = new Map<string, string>();

  for (const [key, shelfName] of existingShelfMap.entries()) {
    if (isValidCommonShelfCandidate(shelfName)) {
      knownDirectRoots.set(key, shelfName);
    }
  }
  for (const map of itemDirectMaps) {
    for (const [key, entry] of map.entries()) {
      if (!knownDirectRoots.has(key)) {
        knownDirectRoots.set(key, entry.label);
      }
    }
  }

  for (let idx = 0; idx < validItems.length; idx += 1) {
    const map = itemDirectMaps[idx];
    const currentEntries = Array.from(map.values());
    for (const { label } of currentEntries) {
      if (/^[A-Za-z]{4,8}$/.test(label)) {
        for (let len = 3; len < label.length; len += 1) {
          const shortPrefix = label.slice(0, len);
          const shortKey = normalizeShelfMatchKey(shortPrefix);
          const knownLabel = knownDirectRoots.get(shortKey);
          if (knownLabel && !map.has(shortKey)) {
            map.set(shortKey, { label: knownLabel, isExplicitSeries: false });
          }
        }
      }
    }
  }

  const stats = new Map<string, { label: string; count: number; explicitCount: number }>();
  for (const map of itemDirectMaps) {
    for (const [key, entry] of map.entries()) {
      const prev = stats.get(key);
      if (prev) {
        prev.count += 1;
        if (entry.isExplicitSeries) prev.explicitCount += 1;
      } else {
        stats.set(key, {
          label: existingShelfMap.get(key) || entry.label,
          count: 1,
          explicitCount: entry.isExplicitSeries ? 1 : 0,
        });
      }
    }
  }

  // Yêu cầu >= 80% lô khớp chung tên kệ (tránh kéo 1 cuốn Bộ B vào kệ Bộ A khi tải lẫn 2A + 1B)
  const minRequiredCount = Math.max(2, Math.ceil(validItems.length * 0.8));
  let best: { key: string; label: string; count: number; explicitCount: number } | null = null;

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
      // Ưu tiên tên bộ trích tường minh (`Unnamed Memory -after the end`) hơn tiền tố chung (`Unnamed Memory`)
      const entryExplicit = entry.explicitCount >= minRequiredCount;
      const bestExplicit = best.explicitCount >= minRequiredCount;
      if (entryExplicit !== bestExplicit) {
        if (entryExplicit) best = { key, ...entry };
        continue;
      }
      const entryInLibrary = existingShelfMap.has(key);
      const bestInLibrary = existingShelfMap.has(best.key);
      if (entryInLibrary !== bestInLibrary) {
        if (entryInLibrary && !hasSubSeriesModifier(best.label)) {
          best = { key, ...entry };
        } else if (
          !entryInLibrary &&
          hasSubSeriesModifier(entry.label) &&
          entry.label.length > best.label.length
        ) {
          best = { key, ...entry };
        }
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
    if (explicitSeries && normalizeShelfMatchKey(explicitSeries) !== best.key) {
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

/**
 * Tra tác giả thống nhất sẵn có của kệ đích trong kho (QĐ-1A) để tập mới tải lên cùng bộ
 * tự động kế thừa đúng tên tác giả đã chuẩn hoá (tránh tập mới lệch sang tiếng Nhật / đảo họ tên).
 */
export function resolveShelfConsistentAuthor(
  shelfName: string,
  existingBooks: readonly Book[],
): string | null {
  const targetMatchKey = normalizeShelfMatchKey(shelfName);
  if (!targetMatchKey || targetMatchKey === normalizeShelfMatchKey(DEFAULT_SHELF)) return null;

  const shelfBooks = existingBooks.filter(
    (b) => normalizeShelfMatchKey(b.shelf || '') === targetMatchKey,
  );
  if (shelfBooks.length === 0) return null;

  const effectiveMap = buildShelfAuthorContext(shelfBooks, getDisplayAuthor, titleEndsWithBareVolume);
  const counts = new Map<string, { label: string; count: number }>();
  let totalValid = 0;

  for (const b of shelfBooks) {
    const auth = effectiveMap.get(b.id) || UNKNOWN_AUTHOR;
    if (!auth || auth === UNKNOWN_AUTHOR) continue;
    totalValid += 1;
    const key = stripDiacriticsLower(auth);
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { label: auth, count: 1 });
  }

  if (totalValid === 0 || counts.size === 0) return null;
  let top: { label: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!top || entry.count > top.count) top = entry;
  }
  if (!top) return null;
  return counts.size === 1 || top.count / totalValid >= 0.7 ? top.label : null;
}
