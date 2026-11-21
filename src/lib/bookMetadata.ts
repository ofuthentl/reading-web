import type { Book, BookFileType, ReadingProgress } from '@/types';
import { inferSingleBookShelf } from '@/lib/shelfPlacement';

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

export const VOLUME_SEGMENT_RE =
  /^(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ch|c|v|#)\.?\s*)?\d+(?:[.,]\d+)?(?:\s*[-–~]\s*\d+(?:[.,]\d+)?)?$/i;

/**
 * Trích nhãn số tập lỡ bị tách sang trường `author` ở dữ liệu cũ
 * (VD `author = "Tập 6.5"` hoặc `"Tập 6.5 - Tác giả"` từ tệp `Tên - Tập 6.5.epub`).
 */
export function extractMisplacedVolumeFromAuthor(author: string): string | null {
  const clean = author.trim();
  if (!clean) return null;
  if (VOLUME_SEGMENT_RE.test(clean)) return clean;
  const firstSegment = clean.split(/\s+-\s+/)[0]?.trim();
  if (firstSegment && VOLUME_SEGMENT_RE.test(firstSegment)) {
    return firstSegment;
  }
  return null;
}

/**
 * Tiêu đề đầy đủ dùng để sắp xếp và nhận diện số tập, tự ghép lại nhãn tập
 * nếu sách cũ bị tách nhầm số tập thập phân (`Tập 6.5`, `Vol 10.5`...) sang trường tác giả.
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
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const titleParts = segments.length > 0 ? [segments[0]] : [baseLabel];
  let authorIndex = 1;
  while (authorIndex < segments.length && VOLUME_SEGMENT_RE.test(segments[authorIndex])) {
    titleParts.push(segments[authorIndex]);
    authorIndex += 1;
  }
  const title = titleParts.join(' - ').trim() || baseLabel;
  const author = segments.slice(authorIndex).join(' - ').trim() || 'Không rõ tác giả';
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
