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

const VOL_CORE_WORD =
  '(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|màn|man|hồi|hoi|book|part|act|arc|ep(?:isode)?)';

const SPECIAL_VOL_PREFIX =
  '(?:ss|ex|sp|ova|oad|extra|special|bonus|ngoại\\s+truyện|ngoai\\s+truyen|hậu\\s+truyện|hau\\s+truyen|tiền\\s+truyện|tien\\s+truyen|phiên\\s+ngoại|phien\\s+ngoai|side\\s+stor(?:y|ies)|short\\s+stor(?:y|ies)|after\\s+the\\s+end)';

// Số La Mã hợp lệ 1..20 (tránh khớp nhầm từ tiếng Anh như `mid`, `vivid`, `civil` hoặc tên Việt `Tử Vi`)
const VALID_ROMAN_NUMERAL =
  '(?:XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)';

const VOL_NUMBER_OR_PART =
  `(?:\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?|${VALID_ROMAN_NUMERAL}|thượng|thuong|trung|hạ|ha|đầu|dau|cuối|cuoi)`;

const VOL_STD_UNIT = `${VOL_CORE_WORD}\\.?\\s*(?:${VOL_NUMBER_OR_PART}|[a-z]|ex|ss|sp|ova|oad|bonus|extra|special)(?:\\s+${SPECIAL_VOL_PREFIX}(?:\\s*\\d+(?:[.,]\\d+)?)?)?`;
const VOL_PREFIXED_UNIT = `${SPECIAL_VOL_PREFIX}\\.?\\s+${VOL_CORE_WORD}\\.?\\s*${VOL_NUMBER_OR_PART}`;
const VOL_SPECIAL_NUMBERED = `${SPECIAL_VOL_PREFIX}\\.?\\s*\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?`;
const VOL_SHORT_PREFIX = '(?:[chv]|#)\\.?\\s*\\d+(?:[.,]\\d+)?';

const VOL_UNIT = `(?:${VOL_PREFIXED_UNIT}|${VOL_STD_UNIT}|${VOL_SPECIAL_NUMBERED}|${VOL_SHORT_PREFIX})`;

const EXTRA_LABEL =
  '(?:ngoại\\s+truyện|ngoai\\s+truyen|hậu\\s+truyện|hau\\s+truyen|tiền\\s+truyện|tien\\s+truyen|phiên\\s+ngoại|phien\\s+ngoai|after\\s+the\\s+end(?:\\s*\\d+)?|side\\s+stor(?:y|ies)|short\\s+stor(?:y|ies)|extra|ova|oad|special|bonus|ss|ex|sp)';

// Chỉ nhận số La Mã đứng riêng khi VIẾT HOA hoàn toàn để không cắt nhầm `"Tử Vi"`, `"Huyền Vi"`, `"Vi"`
const STANDALONE_UPPER_ROMAN_RE = new RegExp(`^${VALID_ROMAN_NUMERAL}$`);
const TRAILING_UPPER_ROMAN_VOL_RE = new RegExp(`\\s+${VALID_ROMAN_NUMERAL}\\s*$`);
const EXTRACT_TRAILING_UPPER_ROMAN_RE = new RegExp(
  `\\s+${VALID_ROMAN_NUMERAL}(?:\\s*[-–—―−_:|：].*)?$`,
);

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
const NAME_PARTICLES = new Set(['van', 'von', 'de', 'del', 'la', 'le', 'da', 'di', 'no', 'el', 'al']);

function isLikelyAuthorNamePart(part: string): boolean {
  const tokens = part.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  // Bút danh 1 từ kiểu ASCII (`abec`, `huke`, `necomi`, `Nisioisin`)
  if (tokens.length === 1) {
    return /^[\p{Lu}][\p{L}\p{N}._-]*$/u.test(tokens[0]) || /^[a-z][a-z0-9._-]{1,20}$/.test(tokens[0]);
  }
  return tokens.every(
    (tk) => /^[\p{Lu}]/u.test(tk) || NAME_PARTICLES.has(tk.toLowerCase()),
  );
}

function isCoAuthorListWithVa(clean: string): boolean {
  if (!VA_WORD_RE.test(clean)) return false;
  const parts = clean
    .split(/\s*(?:,|(?:\s+và\s+))\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => isLikelyAuthorNamePart(p));
}

/**
 * Nhận diện một vế văn bản thực chất là tiêu đề phụ của tập (tiếng Việt hoặc tiếng Anh)
 * chứ không phải tên tác giả hoặc nhóm đồng tác giả (`Nguyễn A và Trần B`, `Reki Kawahara và abec`).
 */
export function isLikelyVolumeSubtitle(segment: string): boolean {
  const clean = segment.trim();
  if (!clean) return false;
  if (/[?!…“”"~：]/.test(clean)) return true;
  if (VN_SUBTITLE_GRAMMAR_RE.test(clean) || EN_SUBTITLE_GRAMMAR_RE.test(clean)) return true;
  if (VA_WORD_RE.test(clean)) {
    return !isCoAuthorListWithVa(clean);
  }
  if (!/[,&/]/.test(clean)) {
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 5) return true;
  }
  return false;
}

export function normalizeShelfPlacementKey(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

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
 * Tách tên bộ truyện nếu tiêu đề có hậu tố số tập/vol/quyển/phần/chương/ngoại truyện,
 * bao gồm cả tiêu đề phụ sau dấu `:`/`：` (`Black Bullet：New World Order - Tập 1：Những Kẻ...`),
 * dấu gạch ngang Unicode (`Chitose – Tập 1`), số trong ngoặc `(01)`, `SAO 01` hoặc `SAO1`.
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
    // 2. Dấu phân cách + số tập thuần (`Tên - 01`, `Tên – 1`, không cắt nhầm `Tên - 7 Người`)
    .replace(
      /\s*[-–—―−_:|：]\s*(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*[-–—~.]\s*\d+(?:\.\d+)?|\s*\([^)]*\)|\s*\[[^\]]*\])*\s*$/i,
      '',
    )
    // 3. Số tập đặt trong ngoặc tròn hoặc ngoặc vuông ở cuối (`SAO (01)`, `SAO [01]`, `SAO (1-3)`)
    .replace(
      /\s*(?:\(\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\)|\[\s*0*\d{1,3}(?:\s*[-–—~.]\s*\d{1,3})?\s*\])\s*$/i,
      '',
    )
    // 4. Số tập đứng cuối cách khoảng trắng (`SAO 01`, `SAO 1`, `SAO 6.5`, tránh `Fahrenheit 451`)
    .replace(
      /\s+(?:0+\d{1,3}|[1-9]\d?)(?:\.\d+)?(?:\s*\([^)]*\)|\s*\[[^\]]*\])?\s*$/i,
      '',
    );

  stripped = cleanShelfLabel(stripped);

  // 5. Số tập dính liền ngay sau gốc chữ cái (`SAO1`, `SAO2`, `SAOP1`, `SAO01`)
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

export function isKnownAuthor(author: string): boolean {
  const clean = author.trim();
  if (!clean || normalizeShelfPlacementKey(clean) === normalizeShelfPlacementKey(UNKNOWN_AUTHOR)) {
    return false;
  }
  // Chặn trường hợp dữ liệu cũ bị tách nhầm `Tập 1` hoặc `Tập 1：...` vào cột tác giả
  return !isVolumeOrSubtitleSegment(clean);
}

export function inferSingleBookShelf(title: string, author: string): string {
  const series = extractSeriesName(title);
  if (series) return series;
  const cleanTitle = cleanShelfLabel(title);
  if (cleanTitle && cleanTitle !== UNTITLED_BOOK) return cleanTitle;
  if (isKnownAuthor(author)) return cleanShelfLabel(author) || author.trim();
  return DEFAULT_SHELF;
}
