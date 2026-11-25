import type {
  AuthRole,
  Book,
  ReadingProgress,
  ShelfAccessSummary,
  ShelfGroup,
  ShelfRatingSummary,
} from '@/types';
import {
  computeBookProgressPercent,
  getBookSortTitle,
  getDisplayAuthor,
  isVolumeOrSubtitleSegment,
  titleEndsWithBareVolume,
} from '@/lib/bookMetadata';
import { splitNormalizedAuthors } from '@/lib/authorHeuristics';
import { extractSeriesName } from '@/lib/seriesShelfExtractor';
import { isKnownAuthor } from '@/lib/shelfPlacement';

export { computeBookProgressPercent };

export const UNKNOWN_AUTHOR_LABEL = 'Không rõ tác giả';
const UNKNOWN_AUTHOR = UNKNOWN_AUTHOR_LABEL;

function isUniqueSubtitleInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): boolean {
  const cleanAuth = book.author.trim();
  if (!cleanAuth || cleanAuth === UNKNOWN_AUTHOR_LABEL) return false;
  if (getDisplayAuthor(book.author, book.title) === UNKNOWN_AUTHOR_LABEL) return true;
  if (!shelf || shelf.books.length < 2 || shelf.key === 'kho chưa phân loại') return false;
  const matchesSeriesPrefix = book.title.trim().toLocaleLowerCase('vi').startsWith(shelf.key);
  const endsWithBareVol = titleEndsWithBareVolume(book.title.trim());
  if (!matchesSeriesPrefix && !endsWithBareVol) return false;
  const distinctCount = rawAuthorCounts.size;
  return distinctCount >= 2 && (rawAuthorCounts.get(cleanAuth.toLocaleLowerCase('vi')) ?? 0) === 1;
}

export function getEffectiveAuthorInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): string {
  return isUniqueSubtitleInShelf(book, shelf, rawAuthorCounts)
    ? UNKNOWN_AUTHOR_LABEL
    : getDisplayAuthor(book.author, book.title);
}

export function getHealedTitleInShelf(
  book: Book,
  shelf: ShelfGroup | null,
  rawAuthorCounts: ReadonlyMap<string, number>,
): string {
  const sorted = getBookSortTitle(book);
  if (sorted !== book.title.trim()) return sorted;
  if (isUniqueSubtitleInShelf(book, shelf, rawAuthorCounts)) {
    return `${book.title.trim()} - ${book.author.trim()}`;
  }
  return book.title;
}

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

// 1B: Từ khoá số tập phụ & ngoại truyện
const SECONDARY_VOLUME_KEYWORD_RE =
  /(?:^|[\s\-_:|([/])(?:phần|phan|part|ep(?:isode)?|ss|ex|sp|ova|oad|bonus|extra|special|ngoại\s+truyện|ngoai\s+truyen|side\s+stor(?:y|ies)|short\s+stor(?:y|ies))\.?\s*0*(\d{1,3}(?:\.\d+)?)(?:\s*[-–~]\s*\d{1,3})?(?=$|[\s\-_:|)\]/.,–~])/gi;

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
  /** Danh sách tác giả hợp lệ trên kệ (dùng để bấm lọc các bộ cùng tác giả) */
  authors: string[];
  /** Danh sách thể loại (tag) đã gắn cho bộ truyện */
  tags: string[];
  /** Danh sách tên gọi khác (Romaji / Anh / Nhật / viết tắt) */
  altTitles: string[];
  /** Người dùng hiện tại có đánh dấu Để dành đọc sau hay không */
  isPlanToRead: boolean;
  bookCount: number;
  completedCount: number;
  startedCount: number;
  readingStatus: ShelfReadingStatus;
  progressPercent: number | null;
  totalBytes: number;
  resumeBook: Book | null;
  resumeActionLabel: string;
  latestReadAt: number | null;
  isGuestLocked: boolean;
  accessSummary: ShelfAccessSummary | null;
  ratingAverage: number | null;
  ratingCount: number;
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

function buildAuthorInfo(
  shelf: ShelfGroup,
  coverBook: Book | null,
): { authorLabel: string; authors: string[] } {
  const { books } = shelf;
  const isSeriesShelf =
    books.length >= 2 &&
    shelf.key !== 'kho chưa phân loại' &&
    books.filter((b) => normalizeKey(b.title).startsWith(shelf.key)).length >=
      Math.ceil(books.length * 0.6);

  const counts = new Map<string, { label: string; count: number; allBareVol: boolean }>();
  for (const book of books) {
    if (!isDisplayableAuthor(book.author, book.title)) continue;
    const clean = getDisplayAuthor(book.author, book.title);
    const key = normalizeKey(clean);
    const bareVol = isSeriesShelf || titleEndsWithBareVolume(book.title.trim());
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
    if (repeated.length === 0) return { authorLabel: UNKNOWN_AUTHOR, authors: [] };
    counts.clear();
    for (const [k, v] of repeated) counts.set(k, v);
  }

  if (counts.size === 0) return { authorLabel: UNKNOWN_AUTHOR, authors: [] };

  const coverResolved = coverBook ? getDisplayAuthor(coverBook.author, coverBook.title) : null;
  const coverKey = coverResolved ? normalizeKey(coverResolved) : null;
  const ordered = Array.from(counts.entries()).sort(([keyA, a], [keyB, b]) => {
    if (coverKey) {
      if (keyA === coverKey && keyB !== coverKey) return -1;
      if (keyB === coverKey && keyA !== coverKey) return 1;
    }
    return b.count - a.count;
  });

  const authorSet = new Map<string, string>();
  for (const [, entry] of ordered) {
    const parts = splitNormalizedAuthors(entry.label);
    const list = parts.length > 0 ? parts : [entry.label];
    for (const part of list) {
      const pKey = normalizeKey(part);
      if (pKey && !authorSet.has(pKey)) authorSet.set(pKey, part);
    }
  }
  const authors = Array.from(authorSet.values());
  const primary = authors[0] || UNKNOWN_AUTHOR;
  const authorLabel = authors.length > 1 ? `${primary} +${authors.length - 1}` : primary;
  return { authorLabel, authors };
}

function pickResumeAction(
  books: Book[],
  progress: Record<string, ReadingProgress>,
  coverBook: Book | null,
  sessionRole?: AuthRole,
): { resumeBook: Book | null; resumeActionLabel: string } {
  if (books.length === 0) {
    return { resumeBook: null, resumeActionLabel: 'Đọc sách' };
  }

  // Vá M-02: với khách Discord, ưu tiên tập đã mở khoá và sẵn sàng gói bảo mật
  const guestEligible =
    sessionRole === 'guest'
      ? books.filter((b) => !b.guest_locked && b.guest_ready !== false)
      : books;
  const pool = guestEligible.length > 0 ? guestEligible : books;
  const preferredStart =
    coverBook && pool.some((b) => b.id === coverBook.id) ? coverBook : pool[0];

  // 1. Ưu tiên cuốn đang đọc dở mới nhất
  let latestInProgress: { book: Book; updatedAt: number } | null = null;
  let latestCompleted: { book: Book; index: number; updatedAt: number } | null = null;

  for (let i = 0; i < pool.length; i += 1) {
    const book = pool[i];
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
    for (let i = latestCompleted.index + 1; i < pool.length; i += 1) {
      if (!progress[pool[i].id]?.completed) {
        return { resumeBook: pool[i], resumeActionLabel: 'Đọc tập tiếp' };
      }
    }
    const firstUnread = pool.find((book) => !progress[book.id]?.completed);
    if (firstUnread) {
      return { resumeBook: firstUnread, resumeActionLabel: 'Đọc tập tiếp' };
    }
    return {
      resumeBook: preferredStart,
      resumeActionLabel: pool.length > 1 ? 'Đọc lại từ tập 1' : 'Đọc lại',
    };
  }

  return {
    resumeBook: preferredStart,
    resumeActionLabel: pool.length > 1 ? 'Đọc từ tập 1' : 'Đọc sách',
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
  accessSummary?: ShelfAccessSummary | null,
  shelfTags?: Readonly<Record<string, string[]>>,
  sessionRole?: AuthRole,
  shelfAltTitles?: Readonly<Record<string, string[]>>,
  planToReadShelfKeys?: ReadonlySet<string>,
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>,
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
    sessionRole,
  );

  const isGuestLocked = bookCount > 0 && shelf.books.every((book) => Boolean(book.guest_locked));
  const { authorLabel, authors } = buildAuthorInfo(shelf, coverBook);
  const tags = shelfTags?.[shelf.key] ?? [];
  const altTitles = shelfAltTitles?.[shelf.key] ?? [];
  const isPlanToRead = Boolean(planToReadShelfKeys?.has(shelf.key));
  const ratingEntry = shelfRatings?.[shelf.key];
  const ratingCount = ratingEntry && ratingEntry.count > 0 ? ratingEntry.count : 0;
  const ratingAverage =
    ratingCount > 0 && typeof ratingEntry?.average === 'number' ? ratingEntry.average : null;

  return {
    shelf,
    coverBook,
    customCoverBookId,
    isFavorite,
    authorLabel,
    authors,
    tags,
    altTitles,
    isPlanToRead,
    bookCount,
    completedCount,
    startedCount,
    readingStatus,
    progressPercent,
    totalBytes,
    resumeBook,
    resumeActionLabel,
    latestReadAt,
    isGuestLocked,
    accessSummary: accessSummary ?? null,
    ratingAverage,
    ratingCount,
  };
}
