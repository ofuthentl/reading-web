import type { BookFileType } from '@/types';
import {
  cleanAuthorCandidate,
  isNonAuthorMetadataNoise,
  isPlausibleAuthorValue,
  isReleaseMetadataNoise,
  isTranslatedSubtitleForSeries,
} from '@/lib/authorHeuristics';
import {
  EXTRA_LABEL,
  VALID_ROMAN_NUMERAL,
  VOL_UNIT,
  isKnownAuthor,
  isLikelyVolumeSubtitle,
  isVolumeOrSubtitleSegment,
  normalizeShelfPlacementKey,
  titleEndsWithBareVolume,
} from '@/lib/shelfPlacement';

/**
 * Bộ trích tên bộ truyện, tên kệ và phân tích tên tệp khi tải lên (chỉ nạp ở các chunk lười:
 * UploadDropzone, shelfUploadPlanner, shelfSummary, apiAdminMutations — không phình entry bundle).
 */

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

const EXTRACT_TRAILING_UPPER_ROMAN_RE = new RegExp(
  `\\s+${VALID_ROMAN_NUMERAL}(?:\\s*[-–—―−_:|：].*)?$`,
);

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

export function hasMeaningfulShelfLetters(value: string): boolean {
  const letters = (value.match(/[A-Za-zÀ-ỹ]/g) || []).length;
  return letters >= 2;
}

export function isIgnoredShelfPrefix(normalizedKey: string): boolean {
  return STOPWORD_PREFIXES.has(normalizedKey) || TECHNICAL_SHORT_TOKENS.has(normalizedKey);
}

/**
 * Tách tên bộ truyện nếu tiêu đề có hậu tố số tập/vol/quyển/phần/chương,
 * giữ nguyên phần phụ tên bộ kế/ngoại truyện nhiều tập (VD `Unnamed Memory -after the end-`).
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
    .replace(EXTRACT_TRAILING_UPPER_ROMAN_RE, '')
    .replace(
      /\s*[-–—―−_:|：]\s*(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*[-–—~.]\s*\d+(?:\.\d+)?|\s*\([^)]*\)|\s*\[[^\]]*\])*\s*$/i,
      '',
    )
    .replace(
      /\s*(?:\(\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\)|\[\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\])\s*$/i,
      '',
    )
    .replace(
      /\s+(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i,
      '',
    );

  stripped = cleanShelfLabel(stripped);

  if (!stripped || normalizeShelfPlacementKey(stripped) === normalizeShelfPlacementKey(clean)) {
    const compactMatch = clean.match(/^(.+?[A-Za-zÀ-ỹ]{2,})(0+\d{1,3}|[1-9]\d?)$/);
    if (compactMatch && !TECHNICAL_SHORT_TOKENS.has(normalizeShelfPlacementKey(clean))) {
      const candidate = cleanShelfLabel(compactMatch[1]);
      if (
        hasMeaningfulShelfLetters(candidate) &&
        !STOPWORD_PREFIXES.has(normalizeShelfPlacementKey(candidate))
      ) {
        stripped = candidate;
      }
    }
  }

  if (
    stripped &&
    hasMeaningfulShelfLetters(stripped) &&
    !STOPWORD_PREFIXES.has(normalizeShelfPlacementKey(stripped)) &&
    normalizeShelfPlacementKey(stripped) !== normalizeShelfPlacementKey(clean)
  ) {
    return stripped;
  }
  return null;
}

export function inferSingleBookShelf(title: string, author: string): string {
  const series = extractSeriesName(title);
  if (series) return series;
  const cleanTitle = cleanShelfLabel(title);
  if (cleanTitle && cleanTitle !== UNTITLED_BOOK) return cleanTitle;
  if (isKnownAuthor(author)) return cleanShelfLabel(author) || author.trim();
  return DEFAULT_SHELF;
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
  const extMatch = fileName.match(/\.(epub|docx)$/i);
  const extension = extMatch ? (extMatch[1].toLowerCase() as BookFileType) : null;
  const baseLabel = fileName.replace(/\.(epub|docx)$/i, '').trim() || UNTITLED_BOOK;
  const segments = baseLabel
    .split(/\s+[-–—―−]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const title = cleanShelfLabel(segments[0] || baseLabel) || baseLabel;
    return { title, author: UNKNOWN_AUTHOR, shelf: inferShelfName(title, UNKNOWN_AUTHOR), extension };
  }

  // 1. Mọi vế đứng trước và bao gồm vế nhãn tập cuối cùng đều chắc chắn thuộc tiêu đề sách
  let lastVolIdx = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (isVolumeOrSubtitleSegment(segments[i]) || titleEndsWithBareVolume(segments[i])) {
      lastVolIdx = i;
    }
  }

  const titleParts = [cleanShelfLabel(segments[0]) || segments[0], ...segments.slice(1, lastVolIdx + 1)];
  // Chỉ loại bỏ vế rác nhóm dịch/định dạng đứng cuối (VD `[Hako]`, `Sonako`, `Calibre`, `Full`, URL);
  // tuyệt đối giữ lại phụ đề tập hợp lệ (chứa `?!…:`, chữ số, `after the end`...) vào `titleParts`.
  const trailingSegments = segments.slice(lastVolIdx + 1);
  while (
    trailingSegments.length > 0 &&
    isReleaseMetadataNoise(trailingSegments[trailingSegments.length - 1])
  ) {
    trailingSegments.pop();
  }

  let authorIndex = 0;
  while (authorIndex < trailingSegments.length) {
    const seg = trailingSegments[authorIndex];
    const isLast = authorIndex === trailingSegments.length - 1;
    if (isReleaseMetadataNoise(seg)) {
      authorIndex += 1;
      continue;
    }
    const currentTitleStr = titleParts.join(' - ');
    const afterBareVol = lastVolIdx > 0 || titleEndsWithBareVolume(titleParts[titleParts.length - 1] || '');
    if (
      !isLast ||
      isNonAuthorMetadataNoise(seg) ||
      isLikelyVolumeSubtitle(seg) ||
      !isPlausibleAuthorValue(seg) ||
      (afterBareVol && isTranslatedSubtitleForSeries(currentTitleStr, seg))
    ) {
      titleParts.push(seg);
      authorIndex += 1;
      continue;
    }
    break;
  }

  const rawAuthorParts = trailingSegments
    .slice(authorIndex)
    .filter((seg) => !isNonAuthorMetadataNoise(seg) && isPlausibleAuthorValue(seg))
    .map((seg) => cleanAuthorCandidate(seg));
  const title = titleParts.join(' - ').trim() || baseLabel;
  const author = rawAuthorParts.join(' - ').trim() || UNKNOWN_AUTHOR;
  const shelf = inferShelfName(title, author);
  return { title, author, shelf, extension };
}

export function normalizeBookTitleDuplicateKey(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function bookDuplicateKey(title: string, author: string): string {
  return `${normalizeBookTitleDuplicateKey(title)}::${author
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi')}`;
}
