import type { AuthRole, Book, BookFileType, ReadingProgress, ShelfGroup } from '@/types';
import {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  VOLUME_SEGMENT_RE,
  VOLUME_WITH_SUBTITLE_RE,
  cleanShelfLabel,
  inferSingleBookShelf,
  isLikelyVolumeSubtitle,
  isVolumeOrSubtitleSegment,
} from '@/lib/shelfPlacement';

export {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  VOLUME_SEGMENT_RE,
  VOLUME_WITH_SUBTITLE_RE,
  isLikelyVolumeSubtitle,
  isVolumeOrSubtitleSegment,
};

const UNKNOWN_AUTHOR = 'Không rõ tác giả';

const ARCANE_COVER_PALETTE = [
  '#4338ca', // Indigo
  '#6d28d9', // Arcane Violet
  '#0f766e', // Emerald Teal
  '#b45309', // Amber Gold
  '#9f1239', // Crimson Rose
  '#1d4ed8', // Sapphire Blue
  '#7e22ce', // Royal Purple
  '#15803d', // Forest Jade
  '#c2410c', // Ember Copper
  '#3730a3', // Deep Astral
];

const CLOTH_COVER_PALETTE = [
  '#5a2b27', // Oxblood
  '#2d4337', // Forest Pine
  '#6b492a', // Saddle Bronze
  '#333d45', // Prussian Slate
  '#4f3829', // Walnut Leather
  '#56323c', // Antique Plum
  '#70532c', // Ochre Cloth
  '#3a473d', // Sage Moss
];

/**
 * Trích nhãn số tập (kể cả kèm tiêu đề phụ như `Tập 1：Những Kẻ...`) lỡ bị tách sang trường `author`
 * ở dữ liệu cũ để hiển thị, sắp xếp và nhận diện số tập chính xác mà không cần xoá sách tải lại.
 */
export function extractMisplacedVolumeFromAuthor(author: string): string | null {
  const clean = author.trim();
  if (!clean) return null;
  if (isVolumeOrSubtitleSegment(clean)) return clean;
  const firstSegment = clean.split(/\s+[-–—―−]\s+/)[0]?.trim();
  if (firstSegment && isVolumeOrSubtitleSegment(firstSegment)) {
    return firstSegment;
  }
  return null;
}

/**
 * Phát hiện tiêu đề phụ của tập bị tách nhầm sang cột `author` khi `title` kết thúc bằng nhãn số tập trơn
 * (VD: `title = "Mii-kun... - Quyển 1"`, `author = "Đằng Sau Hạnh Phúc Là Bất Hạnh"`).
 */
export function extractMisplacedSubtitleFromAuthor(
  title: string,
  author: string,
): { subtitle: string; realAuthor: string | null } | null {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  if (!cleanTitle || !cleanAuthor || cleanAuthor === UNKNOWN_AUTHOR) return null;
  if (!TITLE_ENDS_WITH_BARE_VOL_RE.test(cleanTitle)) return null;

  const parts = cleanAuthor
    .split(/\s+[-–—―−]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length >= 2) {
    return {
      subtitle: parts[0],
      realAuthor: parts.slice(1).join(' - ').trim() || null,
    };
  }

  if (isLikelyVolumeSubtitle(parts[0])) {
    return { subtitle: parts[0], realAuthor: null };
  }
  return null;
}

/**
 * Chuẩn hoá tên tác giả khi hiển thị lên thẻ sách / chi tiết sách:
 * nếu trường `author` chứa nhầm tên tập (`Tập 1`, `Tập 1：...`) hoặc tiêu đề phụ của tập
 * (`Đằng Sau Hạnh Phúc Là Bất Hạnh`), trả về `Không rõ tác giả` hoặc phần tên tác giả thật đứng sau.
 */
export function getDisplayAuthor(author: string, title?: string): string {
  const clean = author.trim();
  if (!clean) return UNKNOWN_AUTHOR;
  if (isVolumeOrSubtitleSegment(clean)) return UNKNOWN_AUTHOR;
  const segments = clean
    .split(/\s+[-–—―−]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1 && isVolumeOrSubtitleSegment(segments[0])) {
    const rest = segments.slice(1).filter((s) => !isVolumeOrSubtitleSegment(s));
    return rest.join(' - ').trim() || UNKNOWN_AUTHOR;
  }
  if (title) {
    const misplacedSub = extractMisplacedSubtitleFromAuthor(title, clean);
    if (misplacedSub) {
      return misplacedSub.realAuthor || UNKNOWN_AUTHOR;
    }
  }
  return clean;
}

/**
 * Tiêu đề đầy đủ dùng để sắp xếp, hiển thị và nhận diện số tập; tự ghép lại nhãn tập hoặc
 * tiêu đề phụ của tập nếu dữ liệu cũ bị tách nhầm sang trường tác giả.
 */
export function getBookSortTitle(book: Pick<Book, 'title' | 'author'>): string {
  const cleanTitle = book.title.trim();
  const misplacedVol = extractMisplacedVolumeFromAuthor(book.author);
  if (
    misplacedVol &&
    !cleanTitle.toLocaleLowerCase('vi').includes(misplacedVol.toLocaleLowerCase('vi'))
  ) {
    return `${cleanTitle} - ${misplacedVol}`;
  }
  const misplacedSub = extractMisplacedSubtitleFromAuthor(cleanTitle, book.author);
  if (
    misplacedSub &&
    !cleanTitle.toLocaleLowerCase('vi').includes(misplacedSub.subtitle.toLocaleLowerCase('vi'))
  ) {
    return `${cleanTitle} - ${misplacedSub.subtitle}`;
  }
  return cleanTitle;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickCoverColor(seed: string): string {
  return ARCANE_COVER_PALETTE[hashSeed(seed) % ARCANE_COVER_PALETTE.length];
}

export function pickClothCoverColor(seed: string): string {
  return CLOTH_COVER_PALETTE[hashSeed(seed) % CLOTH_COVER_PALETTE.length];
}

export function inferShelfName(title: string, author: string): string {
  return inferSingleBookShelf(title, author);
}

export function parseFileMetadata(fileName: string): {
  title: string;
  author: string;
  shelf: string;
  extension: BookFileType | null;
} {
  const extMatch = fileName.match(/\.(epub|pdf|docx)$/i);
  const extension = extMatch ? (extMatch[1].toLowerCase() as BookFileType) : null;
  const baseLabel = fileName.replace(/\.(epub|pdf|docx)$/i, '').trim() || 'Sách chưa đặt tên';
  const segments = baseLabel
    .split(/\s+[-–—―−]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const titleParts = segments.length > 0 ? [cleanShelfLabel(segments[0]) || segments[0]] : [baseLabel];
  let authorIndex = 1;
  while (authorIndex < segments.length && isVolumeOrSubtitleSegment(segments[authorIndex])) {
    titleParts.push(segments[authorIndex]);
    authorIndex += 1;
  }
  const lastTitlePart = titleParts[titleParts.length - 1] || '';
  if (
    authorIndex < segments.length &&
    TITLE_ENDS_WITH_BARE_VOL_RE.test(lastTitlePart) &&
    (authorIndex < segments.length - 1 || isLikelyVolumeSubtitle(segments[authorIndex]))
  ) {
    titleParts.push(segments[authorIndex]);
    authorIndex += 1;
  }
  const title = titleParts.join(' - ').trim() || baseLabel;
  const author = segments.slice(authorIndex).join(' - ').trim() || UNKNOWN_AUTHOR;
  const shelf = inferShelfName(title, author);
  return { title, author, shelf, extension };
}

export function bookDuplicateKey(title: string, author: string): string {
  return `${title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')}::${author
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi')}`;
}

export function computeBookProgressPercent(
  book: Book,
  progress?: ReadingProgress,
): number | null {
  if (!progress) return null;
  if (progress.completed) return 100;
  const clamped = Math.min(1, Math.max(0, progress.scrollRatio || 0));
  if (progress.totalChapters && progress.totalChapters > 0) {
    if (book.file_type === 'pdf') {
      return Math.min(100, Math.round(((progress.chapterIndex + 1) / progress.totalChapters) * 100));
    }
    return Math.min(
      100,
      Math.round(((progress.chapterIndex + clamped) / progress.totalChapters) * 100),
    );
  }
  return Math.round(clamped * 100);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx >= 2 ? 2 : 0)} ${units[idx]}`;
}

function normalizeSortKey(value: string): string {
  return value
    .trim()
    .replace(/\s*[-–—_:|]+\s*/g, ' ')
    .replace(/\s+/g, ' ');
}

function compareVietnameseText(a: string, b: string): number {
  const keyA = normalizeSortKey(a);
  const keyB = normalizeSortKey(b);
  const primary = keyA.localeCompare(keyB, 'vi', { numeric: true, sensitivity: 'base' });
  if (primary !== 0) return primary;
  return keyA.localeCompare(keyB, 'vi', { numeric: true, sensitivity: 'variant' });
}

export function sortBooksByTitle(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const byTitle = compareVietnameseText(getBookSortTitle(a), getBookSortTitle(b));
    if (byTitle !== 0) return byTitle;
    return compareVietnameseText(a.author, b.author);
  });
}

export function groupBooksIntoShelves(books: Book[]): ShelfGroup[] {
  const map = new Map<string, ShelfGroup>();
  for (const book of sortBooksByTitle(books)) {
    const shelfName = (book.shelf || 'Kho chưa phân loại').trim();
    const key = shelfName.toLocaleLowerCase('vi');
    const existing = map.get(key);
    if (existing) {
      existing.books.push(book);
    } else {
      map.set(key, { key, name: shelfName, books: [book] });
    }
  }
  return Array.from(map.values()).sort((a, b) => compareVietnameseText(a.name, b.name));
}

const RECENT_UPLOAD_WINDOW_DAYS = 7;

export function isRecentBookUpload(createdAt: string, withinDays = RECENT_UPLOAD_WINDOW_DAYS): boolean {
  if (!createdAt) return false;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= -60_000 && ageMs <= withinDays * 86_400_000;
}

export function getGuestLockLabel(book: Book, sessionRole?: AuthRole): string | null {
  if (sessionRole !== 'guest') return null;
  if (book.file_type === 'pdf') return 'Chỉ Admin';
  if (book.guest_ready === false) return 'Chờ đồng bộ';
  return null;
}
