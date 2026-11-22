import type { AuthRole, Book, BookFileType, ReadingProgress, ShelfGroup } from '@/types';
import {
  VOLUME_SEGMENT_RE,
  VOLUME_WITH_SUBTITLE_RE,
  cleanShelfLabel,
  inferSingleBookShelf,
  isVolumeOrSubtitleSegment,
} from '@/lib/shelfPlacement';

export { VOLUME_SEGMENT_RE, VOLUME_WITH_SUBTITLE_RE, isVolumeOrSubtitleSegment };

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
 * Chuẩn hoá tên tác giả khi hiển thị lên thẻ sách / chi tiết sách:
 * nếu trường `author` chứa nhầm tên tập (`Tập 1`, `Tập 1：...`), trả về `Không rõ tác giả`
 * hoặc chỉ giữ phần tên tác giả thật đứng sau (nếu có).
 */
export function getDisplayAuthor(author: string): string {
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
  return clean;
}

/**
 * Tiêu đề đầy đủ dùng để sắp xếp và nhận diện số tập, tự ghép lại nhãn tập
 * nếu sách cũ bị tách nhầm số tập (`Tập 6.5`, `Tập 1：...`) sang trường tác giả.
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
