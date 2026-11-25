import type { AuthRole, Book, ReadingProgress, ShelfGroup } from '@/types';
import {
  cleanAuthorCandidate,
  isNonAuthorMetadataNoise,
  isPlausibleAuthorValue,
  isReleaseMetadataNoise,
  isTranslatedSubtitleForSeries,
} from '@/lib/authorHeuristics';
import {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  VOLUME_SEGMENT_RE,
  VOLUME_WITH_SUBTITLE_RE,
  isLikelyVolumeSubtitle,
  isVolumeOrSubtitleSegment,
  titleEndsWithBareVolume,
} from '@/lib/shelfPlacement';

export {
  TITLE_ENDS_WITH_BARE_VOL_RE,
  VOLUME_SEGMENT_RE,
  VOLUME_WITH_SUBTITLE_RE,
  isLikelyVolumeSubtitle,
  isVolumeOrSubtitleSegment,
  titleEndsWithBareVolume,
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
/**
 * Tách và khôi phục trọn vẹn phần nhãn tập + tiêu đề phụ lỡ bị cắt sang trường `author`
 * (VD: `author = "Quyển i - Sự Hình Thành Của Ký Ức Là Sự Ngụy Tạo"` hoặc
 * `title = "Unnamed Memory I"`, `author = "Phù Thủy Trăng Xanh Và Hoàng Tử Bị Nguyền Rủa"`).
 */
export function splitMisplacedTitleAndAuthor(
  title: string,
  author: string,
): { extraTitle: string | null; realAuthor: string } {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  if (!cleanAuthor || cleanAuthor === UNKNOWN_AUTHOR) {
    return { extraTitle: null, realAuthor: UNKNOWN_AUTHOR };
  }

  const parts = cleanAuthor
    .split(/\s+[-–—―−]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { extraTitle: null, realAuthor: UNKNOWN_AUTHOR };
  }

  // 1. Nếu còn nhãn tập nằm ở vế bất kỳ trong `author` (VD `Thất Nghiệp Chuyển Sinh - Tập 1`),
  // toàn bộ các vế từ đầu tới nhãn tập cuối cùng chắc chắn thuộc về tiêu đề sách.
  let lastVolIdx = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (isVolumeOrSubtitleSegment(parts[i]) || titleEndsWithBareVolume(parts[i])) {
      lastVolIdx = i;
    }
  }

  const moved: string[] = [];
  let cursor = 0;
  if (lastVolIdx >= 0) {
    for (let i = 0; i <= lastVolIdx; i += 1) {
      if (!isReleaseMetadataNoise(parts[i]) || isVolumeOrSubtitleSegment(parts[i])) {
        moved.push(parts[i]);
      }
    }
    cursor = lastVolIdx + 1;
  }

  const rest = parts.slice(cursor);
  // 2. Bỏ sạch rác nhóm dịch/định dạng ở phần còn lại; các vế tiêu đề phụ trả lại về `extraTitle`
  const remainingAuthorParts: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const seg = rest[i];
    if (isReleaseMetadataNoise(seg)) continue;
    const prevEnd = moved.length > 0 ? moved[moved.length - 1] : cleanTitle;
    const afterBareVol = Boolean(prevEnd && titleEndsWithBareVolume(prevEnd));
    const isLast = i === rest.length - 1;
    if (
      remainingAuthorParts.length === 0 &&
      ((afterBareVol &&
        (!isLast ||
          isNonAuthorMetadataNoise(seg) ||
          isLikelyVolumeSubtitle(seg) ||
          isTranslatedSubtitleForSeries(prevEnd, seg))) ||
        isNonAuthorMetadataNoise(seg) ||
        isLikelyVolumeSubtitle(seg) ||
        !isPlausibleAuthorValue(seg))
    ) {
      moved.push(seg);
    } else if (isPlausibleAuthorValue(seg)) {
      remainingAuthorParts.push(cleanAuthorCandidate(seg));
    }
  }

  const extraTitle = moved.length > 0 ? moved.join(' - ') : null;
  const remaining = remainingAuthorParts.join(' - ').trim();
  return {
    extraTitle,
    realAuthor: remaining || UNKNOWN_AUTHOR,
  };
}

export function extractMisplacedVolumeFromAuthor(author: string): string | null {
  return splitMisplacedTitleAndAuthor('', author).extraTitle;
}

export function extractMisplacedSubtitleFromAuthor(
  title: string,
  author: string,
): { subtitle: string; realAuthor: string | null } | null {
  const res = splitMisplacedTitleAndAuthor(title, author);
  if (!res.extraTitle) return null;
  return {
    subtitle: res.extraTitle,
    realAuthor: res.realAuthor === UNKNOWN_AUTHOR ? null : res.realAuthor,
  };
}

export function getDisplayAuthor(author: string, title = ''): string {
  return splitMisplacedTitleAndAuthor(title, author).realAuthor;
}

export function getBookSortTitle(book: Pick<Book, 'title' | 'author'>): string {
  const cleanTitle = book.title.trim();
  const { extraTitle } = splitMisplacedTitleAndAuthor(cleanTitle, book.author);
  if (
    extraTitle &&
    !cleanTitle.toLocaleLowerCase('vi').includes(extraTitle.toLocaleLowerCase('vi'))
  ) {
    return `${cleanTitle} - ${extraTitle}`;
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

export function computeBookProgressPercent(
  _book: Book,
  progress?: ReadingProgress,
): number | null {
  if (!progress) return null;
  if (progress.completed) return 100;
  if (typeof progress.bookPercent === 'number' && Number.isFinite(progress.bookPercent)) {
    return Math.min(100, Math.max(0, Math.round(progress.bookPercent)));
  }
  const clamped = Math.min(1, Math.max(0, progress.scrollRatio || 0));
  if (progress.totalChapters && progress.totalChapters > 0) {
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
    const shelfName = (book.shelf || 'Kho chưa phân loại').normalize('NFC').trim() || 'Kho chưa phân loại';
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
  if (book.guest_locked) return 'Giới hạn';
  if (book.guest_ready === false) return 'Chờ đồng bộ';
  return null;
}
