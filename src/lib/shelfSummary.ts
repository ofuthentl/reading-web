import type { Book, ReadingProgress, ShelfGroup } from '@/types';
import {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  computeBookProgressPercent,
  getBookSortTitle,
  getDisplayAuthor,
  isVolumeOrSubtitleSegment,
} from '@/lib/bookMetadata';
import { extractSeriesName, isKnownAuthor } from '@/lib/shelfPlacement';

export { computeBookProgressPercent };

const UNKNOWN_AUTHOR = 'Không rõ tác giả';

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

// 1A: Từ khoá số tập chuẩn (ưu tiên cao hơn `phần`/`part` để `Tập 1 - Phần 2` trả về 1)
const PRIMARY_VOLUME_KEYWORD_RE =
  /(?:^|[\s\-_:|([/])(?:vol(?:ume)?|tập|tap|quyển|quyen|book|v|#)\.?\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?(?=$|[\s\-_:|)\]/.,–~])/gi;

// 1B: Từ khoá số tập phụ
const SECONDARY_VOLUME_KEYWORD_RE =
  /(?:^|[\s\-_:|([/])(?:phần|phan|part|ep(?:isode)?)\.?\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?(?=$|[\s\-_:|)\]/.,–~])/gi;

// 2: Số đặt trong ngoặc tròn hoặc ngoặc vuông ở cuối (`SAO (01)`, `SAO [1]`, `SAO (1-3)`)
const TRAILING_BRACKET_NUM_RE =
  /(?:\(\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?\s*\)|\[\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?\s*\])\s*$/;

// 3: Dấu phân cách + số tập ở cuối (`Tên - 01`, `Tên_1`, `Tên - 01 (Full)`)
const TRAILING_DELIMITED_NUM_RE =
  /[-_:|]\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?(?:\s*(?:\([^)]*\)|\[[^\]]*\]))?\s*$/;

// 4: Số tập kẹp giữa 2 dấu phân cách (`Overlord - 01 - Quốc vương bất tử`)
const MIDDLE_DELIMITED_NUM_RE = /[-_:|]\s*0*(\d{1,2}(?:\.\d+)?)\s*[-_:|]/;

// 5: Số tập đứng cuối cách khoảng trắng (`SAO 01`, `SAO 1`, tránh số >= 3 chữ số không có 0 đầu như `Fahrenheit 451`)
const TRAILING_SPACE_NUM_RE =
  /\s+(0+\d{1,3}|[1-9]\d?(?:\.\d+)?)(?:\s*(?:\([^)]*\)|\[[^\]]*\]))?\s*$/;

// 6: Tiền tố đánh số rõ ràng ở đầu (`01 - Aincrad`, `01. Khởi đầu`, `[01] Khởi đầu`)
const LEADING_VOLUME_PREFIX_RE =
  /^(?:0+(\d{1,3})\s*[.\-_:|]\s+|\[\s*0*(\d{1,3})\s*\](?:\s*[.\-_:|])?\s+)\S/;

// 7: Số tập dính liền ngay sau gốc chữ cái (`SAO1`, `SAO01`, `SAOP1`)
const COMPACT_SUFFIX_NUM_RE = /^.+?[A-Za-zÀ-ỹ]{2,}(0+\d{1,3}|[1-9]\d?)$/;

export type ShelfReadingStatus = 'unread' | 'reading' | 'completed';

export interface ShelfSummary {
  shelf: ShelfGroup;
  coverBook: Book | null;
  /** ID tập được người dùng ghim thủ công làm bìa kệ (null nếu đang dùng mặc định Tập 1) */
  customCoverBookId: string | null;
  isFavorite: boolean;
  authorLabel: string;
  bookCount: number;
  completedCount: number;
  startedCount: number;
  readingStatus: ShelfReadingStatus;
  progressPercent: number | null;
  totalBytes: number;
  resumeBook: Book | null;
  resumeActionLabel: string;
  latestReadAt: number | null;
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function parseNumberMatch(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function matchLastNumber(input: string, regex: RegExp): number | null {
  regex.lastIndex = 0;
  let last: number | null = null;
  let match = regex.exec(input);
  while (match !== null) {
    const candidate = parseNumberMatch(match[1]);
    if (candidate !== null) last = candidate;
    match = regex.exec(input);
  }
  return last;
}

/**
 * Trích số tập từ tiêu đề sách theo các quy ước phổ biến (`Tập 1`, `Vol.01`, `v01`, `(01)`, `SAO1`...).
 * Trả về `null` nếu tiêu đề không mang số tập rõ ràng.
 */
export function extractVolumeNumber(title: string): number | null {
  const clean = title.trim();
  if (!clean) return null;

  const primary = matchLastNumber(clean, PRIMARY_VOLUME_KEYWORD_RE);
  if (primary !== null) return primary;

  const secondary = matchLastNumber(clean, SECONDARY_VOLUME_KEYWORD_RE);
  if (secondary !== null) return secondary;

  const bracket = clean.match(TRAILING_BRACKET_NUM_RE);
  if (bracket) return parseNumberMatch(bracket[1] ?? bracket[2]);

  const trailingDelim = clean.match(TRAILING_DELIMITED_NUM_RE);
  if (trailingDelim) return parseNumberMatch(trailingDelim[1]);

  const middleDelim = clean.match(MIDDLE_DELIMITED_NUM_RE);
  if (middleDelim) return parseNumberMatch(middleDelim[1]);

  const trailingSpace = clean.match(TRAILING_SPACE_NUM_RE);
  if (trailingSpace) return parseNumberMatch(trailingSpace[1]);

  const leadingPrefix = clean.match(LEADING_VOLUME_PREFIX_RE);
  if (leadingPrefix) return parseNumberMatch(leadingPrefix[1] ?? leadingPrefix[2]);

  if (!TECHNICAL_SHORT_TOKENS.has(normalizeKey(clean))) {
    const compact = clean.match(COMPACT_SUFFIX_NUM_RE);
    if (compact) return parseNumberMatch(compact[1]);
  }

  return null;
}

interface CoverCandidate {
  book: Book;
  index: number;
  tier: number;
  volume: number;
  matchesShelf: boolean;
  titleLength: number;
}

/**
 * Chọn sách đại diện lấy ảnh bìa cho 1 kệ trong Tab Thư viện:
 * 1. Tập 1 (`volume === 1`) có ảnh bìa (`cover_key`) — ưu tiên bản chính có tên bộ khớp tên kệ.
 * 2. Tập dương nhỏ nhất có ảnh bìa (khi kệ thiếu tập 1 hoặc tập 1 chưa có ảnh bìa).
 * 3. Cuốn đầu tiên có ảnh bìa (kể cả tập 0 hoặc tác phẩm lẻ không đánh số).
 * 4. Fallback về Tập 1 / tập nhỏ nhất / cuốn đầu tiên để vẽ bìa vải cổ điển.
 */
export function pickShelfCoverBook(
  shelf: ShelfGroup,
  preferredBookId?: string | null,
): Book | null {
  if (shelf.books.length === 0) return null;
  if (preferredBookId) {
    const preferred = shelf.books.find((book) => book.id === preferredBookId && Boolean(book.cover_key));
    if (preferred) return preferred;
  }
  if (shelf.books.length === 1) return shelf.books[0];

  const shelfKey = normalizeKey(shelf.name);
  let best: CoverCandidate | null = null;

  for (let index = 0; index < shelf.books.length; index += 1) {
    const book = shelf.books[index];
    const effectiveTitle = getBookSortTitle(book);
    const volume = extractVolumeNumber(effectiveTitle);
    const hasCover = Boolean(book.cover_key);
    const isVol1 = volume === 1;
    const isPositiveVol = volume !== null && volume > 0;
    const seriesName = extractSeriesName(effectiveTitle);
    const matchesShelf = Boolean(seriesName && normalizeKey(seriesName) === shelfKey);

    let tier = 5;
    if (isVol1 && hasCover) tier = 0;
    else if (isPositiveVol && hasCover) tier = 1;
    else if (hasCover) tier = 2;
    else if (isVol1) tier = 3;
    else if (isPositiveVol) tier = 4;

    const candidate: CoverCandidate = {
      book,
      index,
      tier,
      volume: isPositiveVol ? volume : Number.POSITIVE_INFINITY,
      matchesShelf,
      titleLength: book.title.trim().length,
    };

    if (!best || compareCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best?.book ?? shelf.books[0];
}

function compareCandidates(a: CoverCandidate, b: CoverCandidate): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if ((a.tier === 1 || a.tier === 4) && a.volume !== b.volume) {
    return a.volume - b.volume;
  }
  if (a.matchesShelf !== b.matchesShelf) return a.matchesShelf ? -1 : 1;
  if (a.titleLength !== b.titleLength) return a.titleLength - b.titleLength;
  return a.index - b.index;
}

function isDisplayableAuthor(author: string, title?: string): boolean {
  const resolved = getDisplayAuthor(author, title);
  return isKnownAuthor(resolved) && !isVolumeOrSubtitleSegment(resolved);
}

function buildAuthorLabel(books: Book[], coverBook: Book | null): string {
  const counts = new Map<string, { label: string; count: number; allBareVol: boolean }>();
  for (const book of books) {
    if (!isDisplayableAuthor(book.author, book.title)) continue;
    const clean = getDisplayAuthor(book.author, book.title);
    const key = normalizeKey(clean);
    const bareVol = TITLE_ENDS_WITH_BARE_VOL_RE.test(book.title.trim());
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
      prev.allBareVol = prev.allBareVol && bareVol;
    } else {
      counts.set(key, { label: clean, count: 1, allBareVol: bareVol });
    }
  }

  // Nếu kệ nhiều tập mà mỗi tập `- Quyển X` lại mang 1 chuỗi "tác giả" rời rạc duy nhất (count === 1),
  // đó là các tiêu đề phụ ngắn của từng tập chứ không phải đồng tác giả.
  if (books.length >= 2 && counts.size >= 2) {
    const repeated = Array.from(counts.entries()).filter(([, v]) => v.count >= 2 || !v.allBareVol);
    if (repeated.length === 0) return UNKNOWN_AUTHOR;
    counts.clear();
    for (const [k, v] of repeated) counts.set(k, v);
  }

  if (counts.size === 0) return UNKNOWN_AUTHOR;

  const coverResolved = coverBook ? getDisplayAuthor(coverBook.author, coverBook.title) : null;
  const coverAuthor = coverResolved && counts.has(normalizeKey(coverResolved)) ? coverResolved : null;
  let primary = coverAuthor;
  if (!primary) {
    let bestCount = -1;
    for (const entry of counts.values()) {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        primary = entry.label;
      }
    }
  }

  const label = primary || UNKNOWN_AUTHOR;
  return counts.size > 1 ? `${label} +${counts.size - 1}` : label;
}

function pickResumeAction(
  books: Book[],
  progress: Record<string, ReadingProgress>,
  coverBook: Book | null,
): { resumeBook: Book | null; resumeActionLabel: string } {
  if (books.length === 0) {
    return { resumeBook: null, resumeActionLabel: 'Đọc sách' };
  }

  // 1. Ưu tiên cuốn đang đọc dở mới nhất
  let latestInProgress: { book: Book; updatedAt: number } | null = null;
  let latestCompleted: { book: Book; index: number; updatedAt: number } | null = null;

  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    const itemProgress = progress[book.id];
    if (!itemProgress) continue;
    if (!itemProgress.completed) {
      if (!latestInProgress || itemProgress.updatedAt > latestInProgress.updatedAt) {
        latestInProgress = { book, updatedAt: itemProgress.updatedAt };
      }
    } else if (!latestCompleted || itemProgress.updatedAt > latestCompleted.updatedAt) {
      latestCompleted = { book, index: i, updatedAt: itemProgress.updatedAt };
    }
  }

  if (latestInProgress) {
    return { resumeBook: latestInProgress.book, resumeActionLabel: 'Đọc tiếp' };
  }

  // 2. Nếu đã đọc xong 1 tập, gợi ý tập chưa đọc kế tiếp
  if (latestCompleted) {
    for (let i = latestCompleted.index + 1; i < books.length; i += 1) {
      if (!progress[books[i].id]?.completed) {
        return { resumeBook: books[i], resumeActionLabel: 'Đọc tập tiếp' };
      }
    }
    const firstUnread = books.find((book) => !progress[book.id]?.completed);
    if (firstUnread) {
      return { resumeBook: firstUnread, resumeActionLabel: 'Đọc tập tiếp' };
    }
    return {
      resumeBook: coverBook ?? books[0],
      resumeActionLabel: books.length > 1 ? 'Đọc lại từ tập 1' : 'Đọc lại',
    };
  }

  return {
    resumeBook: coverBook ?? books[0],
    resumeActionLabel: books.length > 1 ? 'Đọc từ tập 1' : 'Đọc sách',
  };
}

/**
 * Tổng hợp thông tin hiển thị cho 1 kệ trong Tab Thư viện và màn hình chi tiết kệ.
 */
export function summarizeShelf(
  shelf: ShelfGroup,
  progress: Record<string, ReadingProgress>,
  shelfCovers?: Readonly<Record<string, string>>,
  favoriteShelfKeys?: ReadonlySet<string>,
): ShelfSummary {
  const rawPreferredId = shelfCovers?.[shelf.key] ?? null;
  const validCustomBook = rawPreferredId
    ? shelf.books.find((b) => b.id === rawPreferredId && Boolean(b.cover_key)) ?? null
    : null;
  const customCoverBookId = validCustomBook?.id ?? null;
  const isFavorite = Boolean(favoriteShelfKeys?.has(shelf.key));
  const coverBook = validCustomBook ?? pickShelfCoverBook(shelf);
  const autoStartBook = pickShelfCoverBook(shelf);
  const bookCount = shelf.books.length;
  let completedCount = 0;
  let startedCount = 0;
  let totalPercent = 0;
  let totalBytes = 0;
  let latestReadAt: number | null = null;

  for (const book of shelf.books) {
    totalBytes += (book.file_size || 0) + (book.cover_size || 0);
    const itemProgress = progress[book.id];
    if (!itemProgress) continue;
    startedCount += 1;
    if (itemProgress.completed) completedCount += 1;
    totalPercent += computeBookProgressPercent(book, itemProgress) ?? 0;
    if (latestReadAt === null || itemProgress.updatedAt > latestReadAt) {
      latestReadAt = itemProgress.updatedAt;
    }
  }

  const readingStatus: ShelfReadingStatus =
    bookCount > 0 && completedCount === bookCount
      ? 'completed'
      : startedCount > 0
        ? 'reading'
        : 'unread';

  const progressPercent =
    readingStatus === 'unread' || bookCount === 0
      ? null
      : readingStatus === 'completed'
        ? 100
        : Math.round(totalPercent / bookCount);

  const { resumeBook, resumeActionLabel } = pickResumeAction(
    shelf.books,
    progress,
    autoStartBook,
  );

  return {
    shelf,
    coverBook,
    customCoverBookId,
    isFavorite,
    authorLabel: buildAuthorLabel(shelf.books, coverBook),
    bookCount,
    completedCount,
    startedCount,
    readingStatus,
    progressPercent,
    totalBytes,
    resumeBook,
    resumeActionLabel,
    latestReadAt,
  };
}
