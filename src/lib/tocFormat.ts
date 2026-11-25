import type { GuestBlock, GuestInlineSpan } from '@/types';

const TOC_CHAPTER_TITLE_RE =
  /^(?:mục\s+lục|table\s+of\s+contents|contents|toc|danh\s+mục(?:\s+chương)?)(?:\s*[:\-–—].*|\s+(?:tập|quyển|vol\.?)\s*\d+.*)?$/iu;

const LEADING_TOC_PREFIX_RE =
  /^(?:mục\s+lục|table\s+of\s+contents|contents|toc|danh\s+mục(?:\s+chương)?)(?:\s*[:\-–—])?\s+/iu;

const IGNORED_TOC_CANDIDATE_RE =
  /^(?:minh\s*h[ọo]a|hình\s*minh\s*h[ọo]a|ảnh\s*minh\s*h[ọo]a|bìa|ảnh\s*bìa|cover|illustration|illustrations|color|colour|insert|gallery|frontispiece)(?:\s*[-_:#]?\s*\d*)?$/iu;

/**
 * Nhận diện mốc tiêu đề chương nằm trong chuỗi mục lục gói `guest-pack` cũ bị dính thành 1 đoạn dài.
 * Cố ý yêu cầu chữ cái đầu VIẾT HOA (không dùng cờ `i` toàn cục) để tránh cắt nhầm các từ tiếng Việt
 * viết thường như "mở đầu", "kết thúc", "phần kết" nằm giữa tên chương.
 */
const SQUASHED_TOC_MARKER_RE = new RegExp(
  '(?:^|\\s+)(' +
    [
      'K[hH][úÚ][cC]\\s+[dDđĐ][ạẠ][oO]\\s+[đĐ][ầẦ][uU]',
      'L[ờỜ][iI]\\s+[mM][ởỞ]\\s+[đĐ][ầẦ][uU]',
      'L[ờỜ][iI]\\s+[nN][óÓ][iI]\\s+[đĐ][ầẦ][uU]',
      'M[ởỞ]\\s+[đĐ][ầẦ][uU]',
      'L[ờỜ][iI]\\s+[tT][ựỰ][aA]',
      'L[ờỜ][iI]\\s+[đĐ][ềỀ]\\s+[tT][ừỪ]',
      'D[ẫẪ][nN]\\s+[nN][hH][ậẬ][pP]',
      'G[iI][ớỚ][iI]\\s+[tT][hH][iI][ệỆ][uU](?:\\s+[nN][hH][âÂ][nN]\\s+[vV][ậẬ][tT])?',
      'C[hH][ưƯ][ơƠ][nN][gG]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}])|[mM][ởỞ]\\s+[đĐ][ầẦ][uU]|[kK][ếẾ][tT]|[cC][uU][ốỐ][iI])',
      'H[ồỒ][iI]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}]))',
      'T[iI][ếẾ][tT]\\s+\\d+',
      'Q[uU][yY][ểỂ][nN]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}]))',
      'P[hH][ầẦ][nN]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}])|[mM][ởỞ]\\s+[đĐ][ầẦ][uU]|[kK][ếẾ][tT])',
      'K[hH][úÚ][cC]\\s+[đĐ][ệỆ][mM](?:\\s+\\d+)?',
      'C[hH][uU][yY][ểỂ][nN]\\s+[tT][iI][ếẾ][pP](?:\\s+\\d+)?',
      'Đ[oO][ạẠ][nN]\\s+[cC][hH][uU][yY][ểỂ][nN](?:\\s+\\d+)?',
      'Đ[oO][ạẠ][nN]\\s+[kK][ếẾ][tT]',
      'K[ếẾ][tT]\\s+[tT][hH][úÚ][cC]',
      'L[ờỜ][iI]\\s+[kK][ếẾ][tT]',
      'L[ờỜ][iI]\\s+[bB][ạẠ][tT]',
      'H[ậẬ][uU]\\s+[kK][ýÝ]',
      'N[gG][oO][ạẠ][iI]\\s+[tT][rR][uU][yY][ệỆ][nN](?:\\s+\\d+)?',
      'T[rR][uU][yY][ệỆ][nN]\\s+[nN][gG][ắẮ][nN](?:\\s+[đĐ][ặẶ][cC]\\s+[bB][iI][ệỆ][tT])?(?:\\s+\\d+)?',
      'P[hH][ụỤ]\\s+[lL][ụỤ][cC](?:\\s+\\d+)?',
      'P[rR][oO][lL][oO][gG][uU][eE]',
      'I[nN][tT][eE][rR][lL][uU][dD][eE](?:\\s+\\d+)?',
      'C[hH][aA][pP][tT][eE][rR]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}]))',
      'P[aA][rR][tT]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}]))',
      'E[pP][iI][sS][oO][dD][eE]\\s+\\d+',
      'A[cC][tT]\\s+(?:\\d+|[IVXLCDM]+(?![\\p{L}\\p{N}]))',
      'E[pP][iI][lL][oO][gG][uU][eE]',
      'A[fF][tT][eE][rR][wW][oO][rR][dD]',
      'S[iI][dD][eE]\\s+[sS][tT][oO][rR][yY](?:\\s+\\d+)?',
      'B[oO][nN][uU][sS](?:\\s+[sS][tT][oO][rR][yY])?(?:\\s+\\d+)?',
      'S[hH][oO][rR][tT]\\s+[sS][tT][oO][rR][yY](?:\\s+\\d+)?',
      'E[xX][tT][rR][aA](?:\\s+\\d+)?',
    ].join('|') +
    ')(?![\\p{L}\\p{N}])',
  'gu',
);

const PURE_STRUCTURAL_LABEL_RE =
  /^(?:khúc\s+dạo\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|mở\s+đầu|lời\s+tựa|lời\s+đề\s+từ|dẫn\s+nhập|chương\s+(?:\d+|[ivxlcdm]+|mở\s+đầu|kết|cuối)|hồi\s+(?:\d+|[ivxlcdm]+)|tiết\s+\d+|quyển\s+(?:\d+|[ivxlcdm]+)|phần\s+(?:\d+|[ivxlcdm]+|mở\s+đầu|kết)|khúc\s+đệm(?:\s+\d+)?|chuyển\s+tiếp(?:\s+\d+)?|đoạn\s+chuyển(?:\s+\d+)?|đoạn\s+kết|kết\s+thúc|lời\s+kết|lời\s+bạt|hậu\s+ký|ngoại\s+truyện(?:\s+\d+)?|truyện\s+ngắn(?:\s+đặc\s+biệt)?(?:\s+\d+)?|phụ\s+lục(?:\s+\d+)?|prologue|interlude(?:\s+\d+)?|chapter\s+(?:\d+|[ivxlcdm]+)|part\s+(?:\d+|[ivxlcdm]+)|episode\s+\d+|act\s+(?:\d+|[ivxlcdm]+)|epilogue|afterword|side\s+story(?:\s+\d+)?|bonus(?:\s+story)?(?:\s+\d+)?|short\s+story(?:\s+\d+)?|extra(?:\s+\d+)?)$/iu;

const STARTS_WITH_STRUCTURAL_LABEL_RE =
  /^(?:khúc\s+dạo\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|mở\s+đầu|lời\s+tựa|lời\s+đề\s+từ|dẫn\s+nhập|giới\s+thiệu(?:\s+nhân\s+vật)?|chương\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}])|mở\s+đầu|kết|cuối)|hồi\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}]))|tiết\s+\d+|quyển\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}]))|phần\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}])|mở\s+đầu|kết)|khúc\s+đệm(?:\s+\d+)?|chuyển\s+tiếp(?:\s+\d+)?|đoạn\s+chuyển(?:\s+\d+)?|đoạn\s+kết|kết\s+thúc|lời\s+kết|lời\s+bạt|hậu\s+ký|ngoại\s+truyện(?:\s+\d+)?|truyện\s+ngắn(?:\s+đặc\s+biệt)?(?:\s+\d+)?|phụ\s+lục(?:\s+\d+)?|prologue|interlude(?:\s+\d+)?|chapter\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}]))|part\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}]))|episode\s+\d+|act\s+(?:\d+|[ivxlcdm]+(?![\p{L}\p{N}]))|epilogue|afterword|side\s+story(?:\s+\d+)?|bonus(?:\s+story)?(?:\s+\d+)?|short\s+story(?:\s+\d+)?|extra(?:\s+\d+)?)(?![\p{L}\p{N}])/iu;

export interface PreparedGuestBlock {
  block: GuestBlock;
  blockIndex: number;
}

export function isTocChapterTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const clean = title.normalize('NFC').replace(/\s+/g, ' ').trim();
  return clean.length > 0 && clean.length <= 80 && TOC_CHAPTER_TITLE_RE.test(clean);
}

/**
 * Loại bỏ thẻ tiêu đề lặp lại ở đầu trang Mục lục DOM (VD `<h1>MỤC LỤC</h1>` trùng khít
 * tiêu đề trên header trình đọc), giúp hiển thị gọn đồng bộ với chế độ khách.
 */
export function stripDuplicateLeadingTocHeadingHtml(html: string, chapterTitle: string): string {
  if (!html || !isTocChapterTitle(chapterTitle) || typeof DOMParser === 'undefined') {
    return html;
  }
  const normalizedTitle = chapterTitle.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc.body) return html;

  const firstHeading = doc.body.querySelector('h1, h2, h3, h4');
  if (!firstHeading) return html;

  const headingText = (firstHeading.textContent || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
  if (headingText !== normalizedTitle) return html;

  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  range.setEndBefore(firstHeading);
  const beforeText = range.toString().replace(/\s+/g, '');
  if (beforeText.length > 0) return html;
  if (range.cloneContents().querySelector('img, svg, table, ul, ol')) return html;

  firstHeading.remove();
  return doc.body.innerHTML;
}

function isWordBoundaryChar(ch: string | undefined): boolean {
  if (!ch) return true;
  return !/[\p{L}\p{N}]/u.test(ch);
}

function isPrecededBySubtitleSeparator(text: string, pos: number): boolean {
  const before = text.slice(0, pos).trimEnd();
  if (!before) return false;
  return /[:\-–—/]$/.test(before);
}

function sliceInlineSpans(
  spans: readonly GuestInlineSpan[],
  start: number,
  end: number,
): GuestInlineSpan[] {
  if (end <= start) return [];
  const out: GuestInlineSpan[] = [];
  let cursor = 0;

  for (const span of spans) {
    const len = span.t.length;
    const spanEnd = cursor + len;
    if (spanEnd > start && cursor < end) {
      const localStart = Math.max(0, start - cursor);
      const localEnd = Math.min(len, end - cursor);
      const piece = span.rt ? span.t : span.t.slice(localStart, localEnd);
      if (piece) {
        out.push({
          t: piece,
          ...(span.b ? { b: 1 } : {}),
          ...(span.i ? { i: 1 } : {}),
          ...(span.rt ? { rt: span.rt } : {}),
        });
      }
    }
    cursor = spanEnd;
    if (cursor >= end) break;
  }

  while (out.length > 0) {
    const trimmed = out[0].t.replace(/^\s+/, '');
    if (!trimmed) {
      out.shift();
    } else {
      out[0] = { ...out[0], t: trimmed };
      break;
    }
  }
  while (out.length > 0) {
    const lastIdx = out.length - 1;
    const trimmed = out[lastIdx].t.replace(/\s+$/, '');
    if (!trimmed) {
      out.pop();
    } else {
      out[lastIdx] = { ...out[lastIdx], t: trimmed };
      break;
    }
  }
  return out;
}

function tryRecoverSquashedTocParagraph(
  spans: readonly GuestInlineSpan[],
  chapterTitle: string,
  tocTitles?: readonly string[],
): Extract<GuestBlock, { kind: 'list' }> | null {
  const fullText = spans.map((s) => s.t).join('');
  if (fullText.trim().length < 40) return null;

  let startOffset = 0;
  const leadingMatch = LEADING_TOC_PREFIX_RE.exec(fullText);
  if (leadingMatch && fullText.length - leadingMatch[0].length >= 20) {
    startOffset = leadingMatch[0].length;
  } else {
    const cleanTitle = chapterTitle.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (
      cleanTitle.length >= 3 &&
      fullText.slice(0, cleanTitle.length).toLowerCase() === cleanTitle.toLowerCase() &&
      /\s/.test(fullText[cleanTitle.length] || '') &&
      fullText.length - cleanTitle.length >= 20
    ) {
      startOffset = cleanTitle.length;
      while (startOffset < fullText.length && /[\s:\-–—]/.test(fullText[startOffset])) {
        startOffset += 1;
      }
    }
  }

  const splitPoints = new Set<number>([startOffset]);
  const lowerText = fullText.toLowerCase();

  // Nguồn 1: đối chiếu tuần tự theo danh sách tiêu đề chương thật của sách (`tocChapters`)
  if (tocTitles && tocTitles.length > 0) {
    let cursor = startOffset;
    const seenNeedles = new Set<string>();
    for (const rawTitle of tocTitles) {
      const cleaned = rawTitle
        .normalize('NFC')
        .replace(/\s*\(\d+\/\d+\)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length < 3) continue;
      if (isTocChapterTitle(cleaned) || IGNORED_TOC_CANDIDATE_RE.test(cleaned)) continue;
      const needle = cleaned.toLowerCase();
      if (seenNeedles.has(needle)) continue;
      seenNeedles.add(needle);

      let searchFrom = cursor;
      while (searchFrom < lowerText.length) {
        const found = lowerText.indexOf(needle, searchFrom);
        if (found < 0) break;
        const afterIdx = found + needle.length;
        const okBefore = found === startOffset || isWordBoundaryChar(fullText[found - 1]);
        const okAfter = isWordBoundaryChar(fullText[afterIdx]);
        if (okBefore && okAfter && !isPrecededBySubtitleSeparator(fullText, found)) {
          splitPoints.add(found);
          cursor = afterIdx;
          break;
        }
        searchFrom = found + 1;
      }
    }
  }

  // Nguồn 2: mốc tiêu đề cấu trúc viết hoa đầu từ (Mở đầu, Chương N, Khúc đệm N, Phần kết, Lời bạt...)
  SQUASHED_TOC_MARKER_RE.lastIndex = startOffset;
  let match: RegExpExecArray | null;
  while ((match = SQUASHED_TOC_MARKER_RE.exec(fullText)) !== null) {
    const tokenOffset = match.index + (match[0].length - match[1].length);
    if (tokenOffset > startOffset && !isPrecededBySubtitleSeparator(fullText, tokenOffset)) {
      splitPoints.add(tokenOffset);
    }
  }

  const orderedPoints = Array.from(splitPoints).sort((a, b) => a - b);
  if (orderedPoints.length < 2) return null;

  const items: GuestInlineSpan[][] = [];
  const itemTexts: string[] = [];
  for (let i = 0; i < orderedPoints.length; i += 1) {
    const segStart = orderedPoints[i];
    const segEnd = i + 1 < orderedPoints.length ? orderedPoints[i + 1] : fullText.length;
    const sliced = sliceInlineSpans(spans, segStart, segEnd);
    if (sliced.length === 0) continue;
    const segText = sliced.map((s) => s.t).join('').trim();
    if (!segText) continue;
    items.push(sliced);
    itemTexts.push(segText);
  }

  if (items.length < 2) return null;

  // Chỉ suy diễn thụt lề cấp 1 khi mục lục thực sự dùng kiểu 2 dòng (`CHƯƠNG 1` -> tiêu đề phụ không bắt đầu bằng nhãn chương)
  const depths: number[] = [];
  let subItemCount = 0;
  let prevWasPureHeader = false;
  for (const text of itemTexts) {
    const isPure = PURE_STRUCTURAL_LABEL_RE.test(text);
    const startsWithMarker = isPure || STARTS_WITH_STRUCTURAL_LABEL_RE.test(text);
    if (!startsWithMarker && prevWasPureHeader) {
      depths.push(1);
      subItemCount += 1;
      prevWasPureHeader = false;
    } else {
      depths.push(0);
      prevWasPureHeader = isPure;
    }
  }

  return {
    kind: 'list',
    plain: 1,
    ...(subItemCount >= 2 ? { depths } : {}),
    items,
  };
}

/**
 * Chuẩn hoá khối nội dung cho chương Mục lục trên `GuestCanvasReader` (QĐ-1A, 0 B re-pack R2):
 * - Bỏ đánh số thứ tự `1., 2., 3.` trên mọi khối `list` trong chương Mục lục (kể cả gói cũ `ordered: 1`).
 * - Tự phục hồi tách dòng gọn gàng nếu gói cũ bị dính trọn `<nav>` vào 1 đoạn văn dài.
 * - Bảo toàn nguyên vẹn `blockIndex` gốc cho Highlight, Tìm chữ và Thuỷ vân 32-bit.
 */
export function prepareGuestTocBlocks(
  blocks: readonly GuestBlock[],
  chapterTitle: string,
  tocTitles?: readonly string[],
): PreparedGuestBlock[] {
  const isToc = isTocChapterTitle(chapterTitle);
  if (!isToc) {
    return blocks.map((block, blockIndex) => ({ block, blockIndex }));
  }

  const normalizedTitle = chapterTitle.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  const hasListOrMedia = blocks.some((b) => b.kind === 'list' || b.kind === 'img');
  const canAttemptRecovery = !hasListOrMedia && blocks.length <= 3;

  const out: PreparedGuestBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    // Bỏ tiêu đề lặp lại ngay đầu chương Mục lục (VD `MỤC LỤC` bên dưới header `MỤC LỤC`)
    if (out.length === 0 && (block.kind === 'h' || block.kind === 'p') && blocks.length >= 2) {
      const text = block.spans.map((s) => s.t).join('').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
      if (text === normalizedTitle) continue;
    }

    if (block.kind === 'list') {
      const { ordered: _dropOrdered, ...rest } = block;
      void _dropOrdered;
      out.push({ block: { ...rest, plain: 1 }, blockIndex: i });
      continue;
    }

    if (canAttemptRecovery && block.kind === 'p') {
      const recovered = tryRecoverSquashedTocParagraph(block.spans, chapterTitle, tocTitles);
      if (recovered) {
        out.push({ block: recovered, blockIndex: i });
        continue;
      }
    }

    out.push({ block, blockIndex: i });
  }

  return out;
}
