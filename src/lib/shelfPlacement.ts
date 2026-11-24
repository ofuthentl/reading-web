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

const VOL_CORE_WORD =
  '(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|màn|man|hồi|hoi|book|part|act|arc|ep(?:isode)?)';

const SPECIAL_VOL_PREFIX =
  '(?:ss|ex|sp|ova|oad|extra|special|bonus|ngoại\\s+truyện|ngoai\\s+truyen|hậu\\s+truyện|hau\\s+truyen|tiền\\s+truyện|tien\\s+truyen|phiên\\s+ngoại|phien\\s+ngoai|side\\s+stor(?:y|ies)|short\\s+stor(?:y|ies)|after\\s+the\\s+end)';

const VOL_NUMBER_OR_PART =
  '(?:\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?|[ivxlcdm]{1,6}|thượng|thuong|trung|hạ|ha|đầu|dau|cuối|cuoi)';

const VOL_STD_UNIT = `${VOL_CORE_WORD}\\.?\\s*(?:${VOL_NUMBER_OR_PART}|[a-z]|ex|ss|sp|ova|oad|bonus|extra|special)(?:\\s+${SPECIAL_VOL_PREFIX}(?:\\s*\\d+(?:[.,]\\d+)?)?)?`;
const VOL_PREFIXED_UNIT = `${SPECIAL_VOL_PREFIX}\\.?\\s+${VOL_CORE_WORD}\\.?\\s*${VOL_NUMBER_OR_PART}`;
const VOL_SPECIAL_NUMBERED = `${SPECIAL_VOL_PREFIX}\\.?\\s*\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?`;
const VOL_SHORT_PREFIX = '(?:[chv]|#)\\.?\\s*\\d+(?:[.,]\\d+)?';

const VOL_UNIT = `(?:${VOL_PREFIXED_UNIT}|${VOL_STD_UNIT}|${VOL_SPECIAL_NUMBERED}|${VOL_SHORT_PREFIX})`;

const EXTRA_LABEL =
  '(?:ngoại\\s+truyện|ngoai\\s+truyen|hậu\\s+truyện|hau\\s+truyen|tiền\\s+truyện|tien\\s+truyen|phiên\\s+ngoại|phien\\s+ngoai|after\\s+the\\s+end(?:\\s*\\d+)?|side\\s+stor(?:y|ies)|short\\s+stor(?:y|ies)|extra|ova|oad|special|bonus|ss|ex|sp)';

export const VOLUME_SEGMENT_RE = new RegExp(
  `^(?:${VOL_UNIT}|${EXTRA_LABEL}|\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?|[IVX]{1,5})$`,
  'i',
);

export const VOLUME_WITH_SUBTITLE_RE = new RegExp(
  `^(?:${VOL_UNIT}|${EXTRA_LABEL})(?:$|[\\s\\-–—―−_:|：;/.,([（［【])`,
  'i',
);

export function isVolumeOrSubtitleSegment(segment: string): boolean {
  const clean = segment.trim();
  return Boolean(clean) && (VOLUME_SEGMENT_RE.test(clean) || VOLUME_WITH_SUBTITLE_RE.test(clean));
}

export const TITLE_ENDS_WITH_BARE_VOL_RE = new RegExp(
  `(?:(?:^|\\s*[-–—―−_:|：]\\s*|\\s+)${VOL_UNIT}|(?:^|\\s*[-–—―−_:|：]\\s*)${EXTRA_LABEL}|\\s+(?:II|III|IV|VI|VII|VIII|IX|XI|XII|I|V|X))\\s*$`,
  'i',
);

const VN_SUBTITLE_GRAMMAR_RE =
  /(?:^|\s)(?:là|và|của|những|các|chiếc|cuộc|chuyện|đằng|giữa|dưới|với|nếu|vì|dù|nhưng|hoặc|không|chẳng|chưa|đừng|hãy|được|bị|phải|sẽ|đã|đang|vừa|vẫn|rất|quá|lắm|này|kia|ấy|nào|kẻ|đứa|thằng)(?=$|\s|[?!.,:;…])/i;

const EN_SUBTITLE_GRAMMAR_RE =
  /(?:^|\s)(?:the|of|upon|without|within|beyond|after|before|under|over|between|through|behind|beneath|against|into|untold|unnamed|endless|eternal|cursed|forgotten|chronicle|chronicles|prologue|epilogue|interlude)(?=$|\s|[?!.,:;…])/i;

/**
 * Nhận diện một vế văn bản thực chất là tiêu đề phụ của tập (tiếng Việt hoặc tiếng Anh)
 * chứ không phải tên tác giả.
 */
export function isLikelyVolumeSubtitle(segment: string): boolean {
  const clean = segment.trim();
  if (!clean) return false;
  if (/[?!…“”"~：]/.test(clean)) return true;
  if (VN_SUBTITLE_GRAMMAR_RE.test(clean) || EN_SUBTITLE_GRAMMAR_RE.test(clean)) return true;
  if (!/[,&/]/.test(clean)) {
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 5) return true;
  }
  return false;
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
    .replace(
      new RegExp(
        `(?:\\s*[-–—―−_:|：]\\s*(?:[(（[［【]\\s*)?|\\s*[(（[［【]\\s*|\\s+)${VOL_UNIT}(?=$|[\\s\\-–—―−_:|：~.)\\]）］】]).*$`,
        'i',
      ),
      '',
    )
    .replace(
      new RegExp(
        `\\s*[-–—―−_:|：]\\s*${EXTRA_LABEL}(?=$|[\\s\\-–—―−_:|：~.)\\]）］】]).*$`,
        'i',
      ),
      '',
    )
    .replace(/\s+(?:II|III|IV|VI|VII|VIII|IX|XI|XII|I|V|X)(?:\s*[-–—―−_:|：].*)?$/, '')
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
    if (explicitSeries && normalizeKey(explicitSeries) !== best.key) {
      return null;
    }
  }

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
