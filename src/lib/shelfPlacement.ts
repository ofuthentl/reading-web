import {
  isNonAuthorMetadataNoise,
  isPlausibleAuthorValue,
} from '@/lib/authorHeuristics';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';

const VOL_CORE_WORD =
  '(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|màn|man|hồi|hoi|book|part|act|arc|ep(?:isode)?)';

const SPECIAL_VOL_PREFIX =
  '(?:ss|ex|sp|ova|oad|extra|special|bonus)';

// Số La Mã hợp lệ 1..20 (tránh khớp nhầm từ tiếng Anh như `mid`, `vivid`, `civil` hoặc tên Việt `Tử Vi`)
export const VALID_ROMAN_NUMERAL =
  '(?:XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)';

const VOL_NUMBER_OR_PART =
  `(?:\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?|${VALID_ROMAN_NUMERAL}|thượng|thuong|trung|hạ|ha|đầu|dau|cuối|cuoi)`;

const VOL_STD_UNIT = `${VOL_CORE_WORD}\\.?\\s*(?:${VOL_NUMBER_OR_PART}|[a-z]|ex|ss|sp|ova|oad|bonus|extra|special)(?:\\s+${SPECIAL_VOL_PREFIX}(?:\\s*\\d+(?:[.,]\\d+)?)?)?`;
const VOL_PREFIXED_UNIT = `${SPECIAL_VOL_PREFIX}\\.?\\s+${VOL_CORE_WORD}\\.?\\s*${VOL_NUMBER_OR_PART}`;
const VOL_SPECIAL_NUMBERED = `${SPECIAL_VOL_PREFIX}\\.?\\s*\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?`;
const VOL_SHORT_PREFIX = '(?:[chv]|#)\\.?\\s*\\d+(?:[.,]\\d+)?';

export const VOL_UNIT = `(?:${VOL_PREFIXED_UNIT}|${VOL_STD_UNIT}|${VOL_SPECIAL_NUMBERED}|${VOL_SHORT_PREFIX})`;

export const EXTRA_LABEL = '(?:extra|ova|oad|special|bonus|ss|ex|sp)';

// Chỉ nhận số La Mã đứng riêng khi VIẾT HOA hoàn toàn để không cắt nhầm `"Tử Vi"`, `"Huyền Vi"`, `"Vi"`
const STANDALONE_UPPER_ROMAN_RE = new RegExp(`^${VALID_ROMAN_NUMERAL}$`);
const TRAILING_UPPER_ROMAN_VOL_RE = new RegExp(`\\s+${VALID_ROMAN_NUMERAL}\\s*$`);

export const VOLUME_SEGMENT_RE = new RegExp(
  `^(?:${VOL_UNIT}|${EXTRA_LABEL}|\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?)$`,
  'i',
);

export const VOLUME_WITH_SUBTITLE_RE = new RegExp(
  `^(?:${VOL_UNIT}|${EXTRA_LABEL})(?:$|[\\s\\-–—―−_:|：;/.,([（［【])`,
  'i',
);

export function isVolumeOrSubtitleSegment(segment: string): boolean {
  const clean = segment.trim();
  return (
    Boolean(clean) &&
    (VOLUME_SEGMENT_RE.test(clean) ||
      VOLUME_WITH_SUBTITLE_RE.test(clean) ||
      STANDALONE_UPPER_ROMAN_RE.test(clean))
  );
}

export const TITLE_ENDS_WITH_BARE_VOL_RE = new RegExp(
  `(?:(?:^|\\s*[-–—―−_:|：]\\s*|\\s+)${VOL_UNIT}|(?:^|\\s*[-–—―−_:|：]\\s*)${EXTRA_LABEL})\\s*$`,
  'i',
);

export function titleEndsWithBareVolume(title: string): boolean {
  const clean = title.trim();
  return (
    Boolean(clean) &&
    (TITLE_ENDS_WITH_BARE_VOL_RE.test(clean) || TRAILING_UPPER_ROMAN_VOL_RE.test(clean))
  );
}

const VN_SUBTITLE_GRAMMAR_RE =
  /(?:^|\s)(?:là|của|những|các|chiếc|cuộc|chuyện|đằng|giữa|dưới|với|nếu|vì|dù|nhưng|hoặc|không|chẳng|chưa|đừng|hãy|được|bị|phải|sẽ|đã|đang|vừa|vẫn|rất|quá|lắm|này|kia|ấy|nào|kẻ|đứa|thằng)(?=$|\s|[?!.,:;…])/i;

const EN_SUBTITLE_GRAMMAR_RE =
  /(?:^|\s)(?:the|of|upon|without|within|beyond|after|before|under|over|between|through|behind|beneath|against|into|untold|unnamed|endless|eternal|cursed|forgotten|chronicle|chronicles|prologue|epilogue|interlude)(?=$|\s|[?!.,:;…])/i;

const VA_WORD_RE = /(?:^|\s)và(?=$|\s|[?!.,:;…])/i;

/**
 * Nhận diện một vế văn bản thực chất là tiêu đề phụ của tập (tiếng Việt hoặc tiếng Anh)
 * chứ không phải tên tác giả hoặc nhóm đồng tác giả (`Nguyễn A và Trần B`, `Reki Kawahara và abec`).
 */
export function isLikelyVolumeSubtitle(segment: string): boolean {
  const clean = segment.trim();
  if (!clean) return false;
  if (/[?!…“”"~：]/.test(clean)) return true;
  if (VN_SUBTITLE_GRAMMAR_RE.test(clean) || EN_SUBTITLE_GRAMMAR_RE.test(clean)) return true;
  if (!/[,&/]/.test(clean) && !VA_WORD_RE.test(clean)) {
    if (clean.split(/\s+/).filter(Boolean).length >= 5) return true;
  }
  return !isPlausibleAuthorValue(clean);
}

export function normalizeShelfPlacementKey(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function isKnownAuthor(author: string): boolean {
  const clean = author.trim();
  if (!clean || normalizeShelfPlacementKey(clean) === normalizeShelfPlacementKey(UNKNOWN_AUTHOR)) {
    return false;
  }
  if (isVolumeOrSubtitleSegment(clean) || isNonAuthorMetadataNoise(clean)) {
    return false;
  }
  return isPlausibleAuthorValue(clean);
}
