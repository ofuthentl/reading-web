import type { Book } from '@/types';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';
const DEFAULT_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK = 'Sách chưa đặt tên';

const TECHNICAL_SHORT_TOKENS = new Set([
  '2d',
  '3d',
  '4d',
  '4k',
  '8k',
  'a4',
  'a5',
  'b5',
  'f1',
  'mp3',
  'mp4',
  'ps4',
  'ps5',
  'pc',
  'tv',
  'vr',
  'ai',
]);

const STOPWORD_PREFIXES = new Set([
  'the',
  'a',
  'an',
  'in',
  'on',
  'of',
  'to',
  'at',
  'by',
  'for',
  'and',
  'tập',
  'tap',
  'quyển',
  'quyen',
  'vol',
  'volume',
  'chương',
  'chuong',
  'phần',
  'phan',
  'book',
  'part',
  'ep',
  'episode',
  'ch',
  'v',
  'sách',
  'sach',
  'truyện',
  'truyen',
  'tiểu thuyết',
  'tieu thuyet',
  'light novel',
  'novel',
  'anthology',
  'chronicle',
  'collection',
  'tuyển tập',
  'tuyen tap',
  'ngoại truyện',
  'ngoai truyen',
  'la',
  'và',
  'va',
  'bộ',
  'bo',
  'về',
  've',
  'số',
  'so',
]);

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function cleanSeriesCandidate(raw: string): string {
  return raw
    .replace(/[\s\-_:|/.,([#]+$/g, '')
    .replace(/^[\s\-_:|/.,)\]#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMeaningfulLetters(value: string): boolean {
  const letters = (value.match(/[A-Za-zÀ-ỹ]/g) || []).length;
  return letters >= 2;
}

/**
 * Tách tên bộ truyện nếu tiêu đề có hậu tố số tập/vol/quyển/phần/chương,
 * bao gồm số tập trong ngoặc `(01)`, `[01]`, viết tắt `v01`, `vol.1`, `Tên - 01`,
 * khoảng trắng `SAO 01` hoặc dính liền chữ `SAO1`, `SAO2`, `SAOP1`.
 * Trả về tên bộ (khác tiêu đề gốc) nếu là truyện nhiều tập, ngược lại trả về null.
 */
export function extractSeriesName(title: string): string | null {
  const clean = title.trim();
  if (!clean || clean === UNTITLED_BOOK) return null;

  let stripped = clean
    // 1. Hậu tố có dấu phân cách + từ khoá tập/vol/quyển hoặc số tập (`Tên - Tập 1`, `Tên - 01`, `Tên_01`)
    .replace(
      /\s*[-_:|]\s*(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ep(?:isode)?|ch|v|#)\.?\s*)?(?:0+\d{1,3}|[1-9]\d?)(?:\b|\s*[-–~.]\s*\d+|\s*\([^)]*\)|\s*\[[^\]]*\])*$/i,
      '',
    )
    // 2. Hậu tố từ khoá tập/vol/v01 có hoặc không có ngoặc (`SAO Vol.1`, `SAO (Tập 2)`, `SAO v01`, `SAO [v1]`)
    .replace(
      /\s*(?:\(|\[)?\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ep(?:isode)?|v|#)\.?\s*0*\d{1,3}(?:\s*[-–~.]\s*\d{1,3})?(?:\)|\])?.*$/i,
      '',
    )
    // 3. Số tập đặt trong ngoặc tròn hoặc ngoặc vuông ở cuối (`SAO (01)`, `SAO [01]`, `SAO (1-3)`)
    .replace(
      /\s*(?:\(\s*0*\d{1,3}(?:\s*[-–~.]\s*\d{1,3})?\s*\)|\[\s*0*\d{1,3}(?:\s*[-–~.]\s*\d{1,3})?\s*\])\s*$/i,
      '',
    )
    // 4. Số tập đứng cuối cách khoảng trắng (`SAO 01`, `SAO 1`, `SAO 6.5`, tránh cắt số >= 3 chữ số không có 0 đầu như `Fahrenheit 451`)
    .replace(
      /\s+(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i,
      '',
    );

  stripped = cleanSeriesCandidate(stripped);

  // 5. Số tập dính liền ngay sau gốc chữ cái (`SAO1`, `SAO2`, `SAOP1`, `SAO01`)
  if (!stripped || normalizeKey(stripped) === normalizeKey(clean)) {
    const compactMatch = clean.match(/^(.+?[A-Za-zÀ-ỹ]{2,})(0+\d{1,3}|[1-9]\d?)$/);
    if (compactMatch && !TECHNICAL_SHORT_TOKENS.has(normalizeKey(clean))) {
      const candidate = cleanSeriesCandidate(compactMatch[1]);
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
  return Boolean(clean) && normalizeKey(clean) !== normalizeKey(UNKNOWN_AUTHOR);
}

function isValidCommonShelfCandidate(candidate: string): boolean {
  const clean = cleanSeriesCandidate(candidate);
  if (!clean || clean === UNTITLED_BOOK) return false;
  const key = normalizeKey(clean);
  if (STOPWORD_PREFIXES.has(key) || TECHNICAL_SHORT_TOKENS.has(key)) return false;
  if (!hasMeaningfulLetters(clean)) return false;

  const compactLen = clean.replace(/\s+/g, '').length;
  return compactLen >= 2;
}

function collectDirectCandidatesForTitle(rawTitle: string): Map<string, string> {
  const candidates = new Map<string, string>();
  const addCandidate = (value: string | null | undefined) => {
    if (!value) return;
    const cleaned = cleanSeriesCandidate(value);
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

  const baseForSplit = series || cleanTitle;
  const delimiterSegments = baseForSplit.split(/\s*[_:\-|/([]+\s*/).filter(Boolean);
  if (delimiterSegments.length > 1) {
    for (let i = 0; i < delimiterSegments.length; i += 1) {
      const rawPrefix =
        i === 0
          ? delimiterSegments[0]
          : baseForSplit.slice(
              0,
              baseForSplit.indexOf(delimiterSegments[i]) + delimiterSegments[i].length,
            );
      addCandidate(rawPrefix);
      addCandidate(extractSeriesName(rawPrefix));
    }
  }

  const words = baseForSplit.split(/\s+/).filter(Boolean);
  for (let count = 1; count <= Math.min(words.length, 6); count += 1) {
    const wordPrefix = words.slice(0, count).join(' ');
    addCandidate(wordPrefix);
    addCandidate(extractSeriesName(wordPrefix));
  }

  return candidates;
}

/**
 * Tìm kệ đã có trong thư viện ứng với tên bộ `seriesName`:
 * 1. Nếu trong kho đã có các tập cùng bộ (`extractSeriesName(book.title)` trùng `seriesName`)
 *    nhưng người dùng đã đổi tên kệ sang tên đầy đủ hơn (VD: sách `Mushoku Vol 1` đang nằm ở kệ `Mushoku Tensei`),
 *    ưu tiên trả về kệ đã đổi tên (`Mushoku Tensei`) và gom luôn các tập cùng bộ còn sót ở kệ gốc (`Mushoku`).
 * 2. Nếu có kệ trùng khít `seriesName` (không phân biệt hoa/thường), trả về kệ đó.
 * 3. Nếu `seriesName` (>= 4 ký tự) là tiền tố từ của một kệ đang có (VD: `Mushoku` -> `Mushoku Tensei`),
 *    ưu tiên khớp vào kệ đầy đủ đã có.
 */
function resolveExistingSeriesShelf(
  seriesName: string,
  existingBooks: Book[],
): { shelf: string; booksToRegroup: Book[] } {
  const seriesKey = normalizeKey(seriesName);
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
      const shelf = (book.shelf || '').trim();
      if (!shelf || normalizeKey(shelf) === normalizeKey(DEFAULT_SHELF)) continue;
      // Bỏ qua trường hợp sách đang nằm ở kệ trùng tên tác giả
      if (isKnownAuthor(book.author) && normalizeKey(shelf) === normalizeKey(book.author)) continue;

      const sKey = normalizeKey(shelf);
      const isRenamed = sKey !== seriesKey;
      const existing = shelfGroups.get(sKey);
      if (existing) {
        existing.count += 1;
        existing.books.push(book);
      } else {
        shelfGroups.set(sKey, { shelf, count: 1, isRenamed, books: [book] });
      }
    }

    let chosen: { shelf: string; count: number; isRenamed: boolean } | null = null;
    for (const group of shelfGroups.values()) {
      if (!chosen) {
        chosen = group;
        continue;
      }
      // Ưu tiên kệ do người dùng chủ động đặt/đổi tên (VD: `Mushoku Tensei` thay vì `Mushoku` gốc)
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

  // Nếu tên bộ ngắn (>= 4 ký tự, VD `Mushoku`) là tiền tố theo ranh giới từ của một kệ đã có (`Mushoku Tensei`)
  if (seriesKey.length >= 4) {
    const prefixShelf = existingBooks.find((book) => {
      const sKey = normalizeKey(book.shelf);
      return sKey.startsWith(`${seriesKey} `);
    })?.shelf;
    if (prefixShelf) {
      return { shelf: prefixShelf, booksToRegroup: [] };
    }
  }

  return { shelf: seriesName, booksToRegroup: [] };
}

/**
 * Tìm tên kệ / bộ truyện chung cho một lô từ 2 sách trở lên:
 * - Yêu cầu tiền tố gốc hợp lệ (không phải từ mở đầu vô nghĩa như `The`, `A`, `Tập`, `Vol`...),
 *   xuất hiện ở đa số (>= 50% và tối thiểu 2 tệp) trong lô.
 * - Tiền tố rút gọn từ mã viết tắt (như `SAOP` -> `SAO`) chỉ dùng để khớp với gốc/kệ
 *   đã tồn tại trực tiếp trong lô hoặc trong `existingBooks` (tránh `REMAKE1` + `REMAIN1` -> `REM`).
 * - Nếu khớp với kệ đã có (hoặc kệ đã được đổi tên của cùng bộ truyện như `Mushoku` -> `Mushoku Tensei`),
 *   ưu tiên trả về đúng tên kệ hiện có trong thư viện.
 */
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

  // Bước 1: Thu thập ứng viên trực tiếp từ từng tệp
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

  // Bước 2: Cho phép mã viết tắt mở rộng (VD `SAOP` từ `SAOP1`) khớp vào gốc đã biết (`SAO`)
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

  // Bước 3: Thống kê độ phủ của từng ứng viên trên toàn bộ lô
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
  return resolved.shelf || existingShelfMap.get(best.key) || best.label;
}

/**
 * Suy luận tên kệ đơn lẻ (chưa xét ngữ cảnh thư viện):
 * - Truyện nhiều tập (có Vol/Tập/Quyển...): ưu tiên tên bộ truyện (VD: "Mushoku").
 * - Tác phẩm lẻ: lấy tên tác phẩm (VD: "Bạch Dạ Hành").
 * - Fallback về tác giả hoặc "Kho chưa phân loại" khi thiếu tiêu đề.
 */
export function inferSingleBookShelf(title: string, author: string): string {
  const series = extractSeriesName(title);
  if (series) return series;
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle !== UNTITLED_BOOK) return cleanTitle;
  if (isKnownAuthor(author)) return author.trim();
  return DEFAULT_SHELF;
}

function isStandaloneInTitleShelf(book: Book): boolean {
  if (extractSeriesName(book.title) !== null) return false;
  return normalizeKey(book.shelf) === normalizeKey(book.title);
}

/**
 * Quyết định kệ mục tiêu cho 1 sách sắp tải lên dựa trên các sách hiện có:
 * 1. Truyện nhiều tập (có Vol/Tập...): ưu tiên kệ đã có của cùng bộ truyện (kể cả khi kệ đó đã được
 *    người dùng đổi tên như `Mushoku` -> `Mushoku Tensei`) và tự gom các tập còn sót ở kệ tên gốc cũ.
 * 2. Tác phẩm lẻ có tác giả rõ ràng:
 *    - Nếu chưa có sách lẻ nào khác cùng tác giả → kệ = tên tác phẩm (VD: "Bạch Dạ Hành").
 *    - Nếu đã có sách lẻ khác cùng tác giả (hoặc đã có kệ tên tác giả) → gom vào kệ tên tác giả
 *      và trả về `booksToRegroup` (các sách lẻ cũ đang đứng riêng ở kệ tên tác phẩm) để tự động chuyển cùng.
 */
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

/**
 * Dự đoán tên kệ hiển thị trong danh sách hàng đợi UploadDropzone
 * (tính gộp cả sách đã có trong kho và các tệp cùng nằm trong hàng đợi).
 */
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
