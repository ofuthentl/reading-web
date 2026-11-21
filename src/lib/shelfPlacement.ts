import type { Book } from '@/types';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';
const DEFAULT_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK = 'Sách chưa đặt tên';

const TECHNICAL_SHORT_TOKENS = new Set([
  '2d', '3d', '4d', '4k', '8k', 'a4', 'a5', 'b5', 'f1', 'mp3', 'mp4', 'ps4', 'ps5', 'pc', 'tv', 'vr', 'ai',
]);

const STOPWORD_PREFIXES = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'at', 'by', 'for', 'and',
  'tập', 'tap', 'quyển', 'quyen', 'vol', 'volume', 'chương', 'chuong', 'phần', 'phan',
  'book', 'part', 'ep', 'episode', 'ch', 'v', 'sách', 'sach', 'truyện', 'truyen',
  'tiểu thuyết', 'tieu thuyet', 'light novel', 'novel', 'anthology', 'chronicle', 'collection',
  'tuyển tập', 'tuyen tap', 'ngoại truyện', 'ngoai truyen', 'la', 'và', 'va', 'bộ', 'bo', 'về', 've', 'số', 'so',
]);

/** Nhãn số tập thuần (`Tập 1`, `Tập 6.5`, `Vol. 02`, `01`, `1-3`). */
export const VOLUME_SEGMENT_RE =
  /^(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ep(?:isode)?|ch|c|v|#)\.?\s*)?\d+(?:[.,]\d+)?(?:\s*[-–—~]\s*\d+(?:[.,]\d+)?)?$/i;

/**
 * Nhãn số tập hoặc ngoại truyện đi kèm tiêu đề phụ ở cùng vế
 * (VD: `Tập 1：Những Kẻ Khao Khát...`, `Tập 2: Đối Đầu...`, `Vol.01 (Full)`, `Ngoại truyện：...`).
 * Không đưa chữ đơn `v`/`c` vào đây để không nhận nhầm tên tác giả viết tắt như `V. Hugo`, `C. S. Lewis`.
 */
export const VOLUME_WITH_SUBTITLE_RE =
  /^(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ep(?:isode)?)\.?\s*\d+(?:[.,]\d+)?(?:\s*[-–—~]\s*\d+(?:[.,]\d+)?)?|(?:ngoại\s+truyện|ngoai\s+truyen|side\s+story|extra|ova|special)\b)(?:$|[\s\-–—―−_:|：;/.,([（［【])/i;

export function isVolumeOrSubtitleSegment(segment: string): boolean {
  const clean = segment.trim();
  return Boolean(clean) && (VOLUME_SEGMENT_RE.test(clean) || VOLUME_WITH_SUBTITLE_RE.test(clean));
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

/**
 * Làm sạch mọi dấu gạch ngang ASCII/Unicode (`-`, `–`, `—`, `―`, `−`), hai chấm (`:`, `：`)
 * và ngoặc mở/đóng lẻ ở hai đầu tên bộ/kệ sách (chặn triệt để lỗi kiểu `"Chitose -"`).
 */
export function cleanShelfLabel(raw: string): string {
  return raw
    .replace(/[\s\-–—―−_:|：;/.,~([（［【#]+$/g, '')
    .replace(/^[\s\-–—―−_:|：;/.,~)\]）］】#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMeaningfulLetters(value: string): boolean {
  const letters = (value.match(/[A-Za-zÀ-ỹ]/g) || []).length;
  return letters >= 2;
}

/**
 * Tách tên bộ truyện nếu tiêu đề có hậu tố số tập/vol/quyển/phần/chương/ngoại truyện,
 * bao gồm cả tiêu đề phụ sau dấu `:`/`：` (`Black Bullet：New World Order - Tập 1：Những Kẻ...`),
 * dấu gạch ngang Unicode (`Chitose – Tập 1`), số trong ngoặc `(01)`, `SAO 01` hoặc `SAO1`.
 */
export function extractSeriesName(title: string): string | null {
  const clean = title.trim();
  if (!clean || clean === UNTITLED_BOOK) return null;

  let stripped = clean
    // 1a. Từ khoá tập/vol/quyển/phần + số tập + mọi tiêu đề phụ phía sau (`Tên - Tập 1：...`, `Tên – Vol.1`, `SAO (Tập 2)`)
    .replace(
      /\s*(?:[-–—―−_:|：]\s*)?(?:\(|\[|（|［|【)?\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ep(?:isode)?|ch|v|#)\.?\s*(?:0+\d{1,3}|[1-9]\d?)(?:[.,]\d+)?(?:\b|[\s\-–—―−_:|：~.)\]）］】].*)?$/i,
      '',
    )
    // 1b. Hậu tố ngoại truyện / side story đứng sau dấu phân cách (`Tên - Ngoại truyện：...`)
    .replace(
      /\s*[-–—―−_:|：]\s*(?:ngoại\s+truyện|ngoai\s+truyen|side\s+story|extra|ova|special)\b.*$/i,
      '',
    )
    // 2. Dấu phân cách + số tập thuần (`Tên - 01`, `Tên – 1`, không cắt nhầm `Tên - 7 Người`)
    .replace(
      /\s*[-–—―−_:|：]\s*(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*[-–—~.]\s*\d+(?:\.\d+)?|\s*\([^)]*\)|\s*\[[^\]]*\])*\s*$/i,
      '',
    )
    // 3. Số tập đặt trong ngoặc tròn hoặc ngoặc vuông ở cuối (`SAO (01)`, `SAO [01]`, `SAO (1-3)`)
    .replace(
      /\s*(?:\(\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\)|\[\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\])\s*$/i,
      '',
    )
    // 4. Số tập đứng cuối cách khoảng trắng (`SAO 01`, `SAO 1`, `SAO 6.5`, tránh `Fahrenheit 451`)
    .replace(
      /\s+(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i,
      '',
    );

  stripped = cleanShelfLabel(stripped);

  // 5. Số tập dính liền ngay sau gốc chữ cái (`SAO1`, `SAO2`, `SAOP1`, `SAO01`)
  if (!stripped || normalizeKey(stripped) === normalizeKey(clean)) {
    const compactMatch = clean.match(/^(.+?[A-Za-zÀ-ỹ]{2,})(0+\d{1,3}|[1-9]\d?)$/);
    if (compactMatch && !TECHNICAL_SHORT_TOKENS.has(normalizeKey(clean))) {
      const candidate = cleanShelfLabel(compactMatch[1]);
      if (hasMeaningfulLetters(candidate) && !STOPWORD_PREFIXES.has(normalizeKey(candidate))) {
        stripped = candidate;
      }
    }
  }

  if (
    stripped &&
    hasMeaningfulLetters(stripped) &&
    !STOPWORD_PREFIXES.has(normalizeKey(stripped)) &&
    normalizeKey(stripped) !== normalizeKey(clean)
  ) {
    return stripped;
  }
  return null;
}

export function isKnownAuthor(author: string): boolean {
  const clean = author.trim();
  if (!clean || normalizeKey(clean) === normalizeKey(UNKNOWN_AUTHOR)) return false;
  // Chặn trường hợp dữ liệu cũ bị tách nhầm `Tập 1` hoặc `Tập 1：...` vào cột tác giả
  return !isVolumeOrSubtitleSegment(clean);
}

function isValidCommonShelfCandidate(candidate: string): boolean {
  const clean = cleanShelfLabel(candidate);
  if (!clean || clean === UNTITLED_BOOK) return false;
  const key = normalizeKey(clean);
  if (STOPWORD_PREFIXES.has(key) || TECHNICAL_SHORT_TOKENS.has(key)) return false;
  if (!hasMeaningfulLetters(clean)) return false;
  return clean.replace(/\s+/g, '').length >= 2;
}

function collectDirectCandidatesForTitle(rawTitle: string): Map<string, string> {
  const candidates = new Map<string, string>();
  const addCandidate = (value: string | null | undefined) => {
    if (!value) return;
    const cleaned = cleanShelfLabel(value);
    if (!isValidCommonShelfCandidate(cleaned)) return;
    const key = normalizeKey(cleaned);
    if (!candidates.has(key)) {
      candidates.set(key, cleaned);
    }
  };

  const cleanTitle = rawTitle.trim();
  if (!cleanTitle || cleanTitle === UNTITLED_BOOK) return candidates;

  const series = extractSeriesName(cleanTitle);
  addCandidate(series);

  const baseForSplit = series || cleanShelfLabel(cleanTitle);
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
  for (let count = 1; count <= Math.min(words.length, 6); count += 1) {
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
  const seriesKey = normalizeKey(cleanedSeries);
  const peerSeriesBooks = existingBooks.filter((book) => {
    const bookSeries = extractSeriesName(book.title);
    return Boolean(bookSeries) && normalizeKey(bookSeries!) === seriesKey;
  });

  if (peerSeriesBooks.length > 0) {
    const shelfGroups = new Map<
      string,
      { shelf: string; count: number; isRenamed: boolean; books: Book[] }
    >();
    for (const book of peerSeriesBooks) {
      const shelf = cleanShelfLabel(book.shelf || '');
      if (!shelf || normalizeKey(shelf) === normalizeKey(DEFAULT_SHELF)) continue;
      if (isKnownAuthor(book.author) && normalizeKey(shelf) === normalizeKey(book.author)) continue;

      const sKey = normalizeKey(shelf);
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
        ? peerSeriesBooks.filter((b) => normalizeKey(b.shelf) === seriesKey)
        : [];
      return { shelf: chosen.shelf, booksToRegroup };
    }
  }

  const exactMatch = existingBooks.find((book) => normalizeKey(book.shelf) === seriesKey)?.shelf;
  if (exactMatch) {
    return { shelf: exactMatch, booksToRegroup: [] };
  }

  if (seriesKey.length >= 4) {
    const prefixShelf = existingBooks.find((book) => {
      const sKey = normalizeKey(book.shelf);
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
      const key = normalizeKey(shelf);
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
          const shortKey = normalizeKey(shortPrefix);
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

  const minRequiredCount = Math.max(2, Math.ceil(validItems.length * 0.5));
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
  const resolved = resolveExistingSeriesShelf(best.label, existingBooks);
  return resolved.shelf || existingShelfMap.get(best.key) || cleanShelfLabel(best.label);
}

export function inferSingleBookShelf(title: string, author: string): string {
  const series = extractSeriesName(title);
  if (series) return series;
  const cleanTitle = cleanShelfLabel(title);
  if (cleanTitle && cleanTitle !== UNTITLED_BOOK) return cleanTitle;
  if (isKnownAuthor(author)) return cleanShelfLabel(author) || author.trim();
  return DEFAULT_SHELF;
}

function isStandaloneInTitleShelf(book: Book): boolean {
  if (extractSeriesName(book.title) !== null) return false;
  return normalizeKey(book.shelf) === normalizeKey(book.title);
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
    const authorKey = normalizeKey(cleanAuthor);
    const titleKey = normalizeKey(cleanTitle);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === authorKey,
    )?.shelf;

    const standalonePeers = existingBooks.filter((book) => {
      if (normalizeKey(book.author) !== authorKey) return false;
      if (extractSeriesName(book.title) !== null) return false;
      return normalizeKey(book.title) !== titleKey;
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
    const authorKey = normalizeKey(cleanAuthor);
    const titleKey = normalizeKey(item.title);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === authorKey,
    )?.shelf;
    if (existingAuthorShelf) return existingAuthorShelf;

    const hasExistingStandalonePeer = existingBooks.some(
      (book) =>
        normalizeKey(book.author) === authorKey &&
        extractSeriesName(book.title) === null &&
        normalizeKey(book.title) !== titleKey,
    );
    if (hasExistingStandalonePeer) return cleanAuthor;

    const hasQueuedStandalonePeer = activeQueue.some(
      (other) =>
        other.id !== item.id &&
        normalizeKey(other.author) === authorKey &&
        extractSeriesName(other.title) === null &&
        normalizeKey(other.title) !== titleKey,
    );
    if (hasQueuedStandalonePeer) return cleanAuthor;
  }

  return inferSingleBookShelf(item.title, item.author);
}
