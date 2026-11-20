import type { BookFileType } from '@/types';
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

const VOLUME_SEGMENT_RE =
  /^(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ch|c|v|#)\.?\s*)?\d+(?:\s*[-–]\s*\d+)?$/i;

export function pickCoverColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ARCANE_COVER_PALETTE[hash % ARCANE_COVER_PALETTE.length];
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
