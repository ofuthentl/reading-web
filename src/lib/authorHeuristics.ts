import type { Book } from '@/types';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';
const UNCLASSIFIED_SHELF = 'kho chưa phân loại';

const NAME_PARTICLES = new Set([
  'van', 'von', 'de', 'del', 'la', 'le', 'da', 'di', 'no', 'na', 'el', 'al', 'bin', 'ibn',
]);

const AUTHOR_PREFIX_RE =
  /^(?:tác\s*giả|tac\s*gia|author|written\s+by|story\s+by|by)\s*[:\-–—]?\s*/iu;

const AUTHOR_ROLE_SUFFIX_RE =
  /\s*(?:\((?:tác\s*giả|tac\s*gia|author|writer|story|minh\s*h[ọo]a|illustrator|art)\)|\[[^\]]*\])\s*$/giu;

const NON_AUTHOR_NOISE_EXACT_RE =
  /^(?:unknown|khong\s+ro(?:\s+tac\s+gia)?|chua\s+ro|anonymous|an\s+danh|n\/a|none|null|updating|dang\s+cap\s+nhat|raw|full|edit(?:ed)?|fix(?:ed)?|reup|final|complete(?:d)?|hoan\s+thanh|ban\s+(?:dich|dep|full)|tai\s+ban|bia\s+(?:cung|mem)|ln|wn|manga|ebook|truyen|tieu\s+thuyet|shin|dtv|amaks?|ipm|kim\s+dong|nxb\s+tre|thaiha|hikari|wings\s+books|skybooks|nha\s+nam|admin(?:istrator)?|user|owner|author|writer|translator|editor|nguoi\s+dich|dich\s+gia|nhom\s+dich|jobless\s+oblige|old\s+dragon'?s\s+tale|recollection|progressive|alternative|gaiden|spin-?off|extra|special|bonus|prologue|epilogue|interlude|afterword|preface|foreword|appendix|opening|ending|thuong|trung|ha)$/i;

const NON_AUTHOR_PREFIX_RE =
  /^(?:dich|trans|tl|edit(?:or)?|nguon|source|nhom\s+dich|convert|ebook|reup|scan|raw|full|ban\s+dich)\s*[:\-–—]/i;

const NON_AUTHOR_CONTAINS_RE =
  /(?:https?:\/\/|www\.|\.(?:com|net|org|vn|info|lol|io)\b|@|\b(?:calibre|sigil|docln|hako|sonako|valvrare\w*|tsukiln|tsuki\s+light\s+novel|cong\s+light\s+novel|wattpad|tangthuvien|truyenfull|webtruyen|wikidich|sangtacviet|metruyenchu|lnvn|shincms|(?:19|20)\d{2}|epub|docx|pdf|mobi|azw3|(?:light|web)\s+novel|after\s+the\s+end|redundancy|(?:ngoai|hau|tien)\s+truyen|phien\s+ngoai|(?:side|short)\s+stor(?:y|ies))\b)/i;

// Từ khoá tiêu đề tập VN/EN viết hoa đầu chữ (Title Case) hay bị cắt nhầm sang cột tác giả
const SUBTITLE_TITLECASE_KEYWORD_RE =
  /(?:^|\s)(?:(?:hoi|ky)\s+uc|vo\s+danh|bat\s+tu|that\s+nghiep|chuyen\s+sinh|di\s+gioi|phu\s+thuy|hoang\s+tu|cong\s+chua|ma\s+vuong|huyen\s+thoai|bien\s+nien\s+su|eighty\s+six|chronicles?|memor(?:y|ies)|princess|witch|kingdom|empire|oblige|progressive|recollection)(?=$|\s|[?!.,:;…])/i;

const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const VIETNAMESE_DIACRITIC_RE = /[àáâãèéêìíòóôõùúýăđĩũơưạ-ỹ]/i;

export function hasVietnameseDiacritics(input: string): boolean {
  return VIETNAMESE_DIACRITIC_RE.test(input.normalize('NFC'));
}

/**
 * Khi tên bộ/tập là tiếng Anh/Romaji (không dấu tiếng Việt, VD `Unnamed Memory - Tập 3`)
 * còn vế đi sau nhãn tập lại mang dấu tiếng Việt (VD `Ánh Trăng Xanh`, `Hoàng Hôn Đỏ`),
 * đó chắc chắn là tiêu đề phụ dịch tiếng Việt chứ không phải tên tác giả gốc.
 */
export function isTranslatedSubtitleForSeries(titleBeforeSegment: string, segment: string): boolean {
  const withoutVa = segment.normalize('NFC').replace(/(?:^|\s)và(?=\s|$)/giu, ' ').trim();
  if (!hasVietnameseDiacritics(withoutVa)) return false;
  // Loại bỏ chữ `Tập`/`Quyển`/`Phần` tiếng Việt khỏi `titleBeforeSegment` trước khi kiểm tra gốc tên bộ
  const strippedBase = titleBeforeSegment
    .normalize('NFC')
    .replace(/\b(?:tập|quyển|phần|chương|hồi|ngoại\s+truyện|hậu\s+truyện|tiền\s+truyện)\b/giu, '')
    .trim();
  return Boolean(strippedBase) && !hasVietnameseDiacritics(strippedBase);
}

export function stripDiacriticsLower(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanAuthorCandidate(raw: string): string {
  let clean = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  clean = clean.replace(AUTHOR_PREFIX_RE, '').trim();
  clean = clean.replace(AUTHOR_ROLE_SUFFIX_RE, '').trim();
  clean = clean.replace(/^[\s\-–—―−:;/,]+|[\s\-–—―−:;/,]+$/g, '').trim();
  return clean;
}

/**
 * Phát hiện chuỗi rác (nhóm dịch, trang web, định dạng, năm/số tập, ngoặc bọc toàn phần,
 * tên phần hậu truyện/ngoại truyện...) chắc chắn KHÔNG phải tên tác giả.
 */
export function isNonAuthorMetadataNoise(raw: string): boolean {
  const clean = cleanAuthorCandidate(raw);
  if (!clean || clean.length < 2 || clean.length > 90) return true;
  if (/^[[(【（{].*[\])】）}]$/.test(clean)) return true;
  if (/[?!…“”"~：;]/.test(clean) || clean.includes(':')) return true;
  if (/\d/.test(clean)) return true;

  const ascii = stripDiacriticsLower(clean);
  if (!ascii || ascii.length < 2) return true;
  if (NON_AUTHOR_NOISE_EXACT_RE.test(ascii)) return true;
  if (NON_AUTHOR_PREFIX_RE.test(ascii)) return true;
  if (NON_AUTHOR_CONTAINS_RE.test(ascii)) return true;
  return false;
}

export function isLikelySingleAuthorName(part: string, allowCjk = true): boolean {
  const clean = cleanAuthorCandidate(part);
  if (!clean || isNonAuthorMetadataNoise(clean)) return false;

  if (allowCjk && CJK_CHAR_RE.test(clean)) {
    return clean.length >= 2 && clean.length <= 24;
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;

  // Bút danh 1 từ kiểu ASCII hoặc viết hoa đầu (`abec`, `huke`, `Nisioisin`, `Fuse`)
  if (tokens.length === 1) {
    return (
      /^[\p{Lu}][\p{L}._-]{1,24}$/u.test(tokens[0]) ||
      /^[a-z][a-z._-]{1,20}$/.test(tokens[0])
    );
  }

  // Tên người thực viết hoa chữ cái đầu từng từ (trừ tiểu từ như `na`, `no`, `de`, `van`...);
  // bắt gọn 95% tiêu đề phụ tiếng Việt/Anh viết thường giữa câu (`Cô hầu gái cạn lời`, `Sự chia ly`, `Sư phụ`...)
  const allTokensPlausible = tokens.every(
    (tk) => /^[\p{Lu}]/u.test(tk) || NAME_PARTICLES.has(tk.toLowerCase()),
  );
  if (!allTokensPlausible) return false;

  const ascii = stripDiacriticsLower(clean);
  if (SUBTITLE_TITLECASE_KEYWORD_RE.test(ascii)) return false;
  return true;
}

/**
 * Tách chuỗi đồng tác giả hợp lệ (`"Furumiya Kuji, chibi"`, `"Reki Kawahara & abec"`, `"A và B"`).
 * Trả về mảng rỗng nếu chuỗi là rác hoặc tiêu đề phụ bị lưu nhầm.
 */
export function splitNormalizedAuthors(raw: string): string[] {
  const cleaned = cleanAuthorCandidate(raw);
  if (!cleaned || isNonAuthorMetadataNoise(cleaned)) return [];

  const parts = cleaned
    .split(/\s*(?:[,&/×]|(?:\s+và\s+)|(?:\s+and\s+))\s*/iu)
    .map((p) => cleanAuthorCandidate(p))
    .filter(Boolean);

  if (parts.length === 0 || parts.length > 5) return [];
  const validParts = parts.filter((p) => isLikelySingleAuthorName(p, true));
  if (validParts.length !== parts.length) return [];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of validParts) {
    const key = stripDiacriticsLower(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

export function isPlausibleAuthorValue(raw: string): boolean {
  return splitNormalizedAuthors(raw).length > 0;
}

/**
 * Dựng bảng ánh xạ `book.id -> tên tác giả hiệu lực` theo ngữ cảnh kệ dùng chung cho
 * `libraryFiltering.ts`, `shelfSummary.ts` và `libraryHealthAudit.ts`:
 * loại sạch nhãn rác/phụ đề và các chuỗi "tác giả" rời rạc khác nhau giữa từng tập trong cùng 1 kệ.
 */
export function buildShelfAuthorContext(
  books: readonly Book[],
  resolveDisplayAuthor: (author: string, title: string) => string,
  endsWithBareVolume: (title: string) => boolean,
): Map<string, string> {
  const byShelf = new Map<string, Book[]>();
  for (const book of books) {
    const shelfKey = (book.shelf || UNKNOWN_AUTHOR).normalize('NFC').trim().toLocaleLowerCase('vi');
    const list = byShelf.get(shelfKey);
    if (list) list.push(book);
    else byShelf.set(shelfKey, [book]);
  }

  const result = new Map<string, string>();
  for (const [shelfKey, shelfBooks] of byShelf.entries()) {
    const rawCounts = new Map<string, number>();
    const resolvedById = new Map<string, string>();

    for (const book of shelfBooks) {
      const display = resolveDisplayAuthor(book.author, book.title);
      const clean = isPlausibleAuthorValue(display) ? cleanAuthorCandidate(display) : UNKNOWN_AUTHOR;
      resolvedById.set(book.id, clean);
      if (clean !== UNKNOWN_AUTHOR) {
        const key = stripDiacriticsLower(clean);
        rawCounts.set(key, (rawCounts.get(key) ?? 0) + 1);
      }
    }

    const isMultiBookShelf = shelfBooks.length >= 2 && shelfKey !== UNCLASSIFIED_SHELF;
    const distinctAuthors = rawCounts.size;
    const shelfHasNonDiacriticAuthor = Array.from(resolvedById.values()).some(
      (a) => a !== UNKNOWN_AUTHOR && !hasVietnameseDiacritics(a),
    );

    for (const book of shelfBooks) {
      const clean = resolvedById.get(book.id) || UNKNOWN_AUTHOR;
      if (clean === UNKNOWN_AUTHOR) {
        result.set(book.id, UNKNOWN_AUTHOR);
        continue;
      }
      if (isMultiBookShelf && distinctAuthors >= 2) {
        const key = stripDiacriticsLower(clean);
        const count = rawCounts.get(key) ?? 0;
        const looksSeriesBook =
          book.title.normalize('NFC').trim().toLocaleLowerCase('vi').startsWith(shelfKey) ||
          endsWithBareVolume(book.title.trim());
        const isMultiAuthor = splitNormalizedAuthors(clean).length >= 2;
        const looksTranslatedSub =
          hasVietnameseDiacritics(clean) &&
          (isTranslatedSubtitleForSeries(book.title, clean) || shelfHasNonDiacriticAuthor);
        if (count === 1 && looksSeriesBook && !isMultiAuthor) {
          if (looksTranslatedSub || !shelfHasNonDiacriticAuthor) {
            result.set(book.id, UNKNOWN_AUTHOR);
            continue;
          }
        }
      }
      result.set(book.id, clean);
    }
  }

  return result;
}
