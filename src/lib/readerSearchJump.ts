import type { CanvasLayoutItem } from '@/lib/guestCanvasLayout';
import { extractTextExcludingRubyAnnotations } from '@/lib/rubyText';

export interface ReaderSearchJumpTarget {
  chapterIndex: number;
  query: string;
  occurrenceIndex: number;
  approximateRatio: number;
  nonce: number;
}

export function stripSearchDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

function countExactMatches(rawText: string, needleLower: string): number {
  if (!rawText || !needleLower) return 0;
  const hayLower = rawText.normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  let count = 0;
  let cursor = 0;
  while (cursor <= hayLower.length - needleLower.length) {
    const idx = hayLower.indexOf(needleLower, cursor);
    if (idx === -1) break;
    count += 1;
    cursor = idx + needleLower.length;
  }
  return count;
}

function countAsciiMatches(rawText: string, needleAscii: string): number {
  if (!rawText || needleAscii.length < 2) return 0;
  const hayAscii = stripSearchDiacritics(
    rawText.normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('vi'),
  );
  let count = 0;
  let cursor = 0;
  while (cursor <= hayAscii.length - needleAscii.length) {
    const idx = hayAscii.indexOf(needleAscii, cursor);
    if (idx === -1) break;
    count += 1;
    cursor = idx + needleAscii.length;
  }
  return count;
}

const SEARCH_BLOCK_SELECTOR =
  '.reading-content p, .reading-content li, .reading-content blockquote, .reading-content h1, .reading-content h2, .reading-content h3, .reading-content h4, .reading-content h5, .reading-content h6, .reading-content td, .reading-content th, .reading-content figcaption, .reading-content pre, .reading-content div';

const NESTED_LEAF_SELECTOR =
  'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, figcaption, pre';

/**
 * Tìm phần tử văn bản lá trong `.reading-content` chứa lần khớp thứ `occurrenceIndex`
 * (chỉ fallback bỏ dấu khi toàn chương không có khớp chính xác, đồng bộ `ReaderSearchAndBookmarks`).
 */
export function findDomBlockForSearchQuery(
  root: HTMLElement,
  rawQuery: string,
  occurrenceIndex = 0,
): HTMLElement | null {
  const q = rawQuery.trim().normalize('NFC');
  if (q.length < 2) return null;
  const needleLower = q.toLocaleLowerCase('vi');
  const queryHasDiacritics = stripSearchDiacritics(needleLower) !== needleLower;
  const needleAscii = stripSearchDiacritics(needleLower);

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(SEARCH_BLOCK_SELECTOR)).filter(
    (el) => {
      if ((el.tagName === 'DIV' || el.tagName === 'BLOCKQUOTE') && el.querySelector(NESTED_LEAF_SELECTOR)) {
        return false;
      }
      if (el.tagName === 'DIV' && el.querySelector('div')) return false;
      return true;
    },
  );

  const scanPass = (matcher: (text: string) => number): HTMLElement | null => {
    let seen = 0;
    let firstMatchedEl: HTMLElement | null = null;
    for (const el of candidates) {
      const hits = matcher(extractTextExcludingRubyAnnotations(el));
      if (hits <= 0) continue;
      if (!firstMatchedEl) firstMatchedEl = el;
      if (seen + hits > occurrenceIndex) return el;
      seen += hits;
    }
    return firstMatchedEl;
  };

  const exactHit = scanPass((text) => countExactMatches(text, needleLower));
  if (exactHit || queryHasDiacritics || needleAscii.length < 2) return exactHit;

  return scanPass((text) => countAsciiMatches(text, needleAscii));
}

export function flashDomSearchElement(element: HTMLElement, durationMs = 2250): () => void {
  element.classList.remove('reader-search-flash');
  void element.offsetWidth;
  element.classList.add('reader-search-flash');
  const timer = window.setTimeout(() => {
    element.classList.remove('reader-search-flash');
  }, durationMs);
  return () => {
    window.clearTimeout(timer);
    element.classList.remove('reader-search-flash');
  };
}

/**
 * Tìm chỉ số dòng `CanvasLayoutItem` khớp với từ khoá tìm kiếm trên `GuestCanvasReader`
 * (bảo toàn 100% D-028: xử lý trên mảng layout trong RAM, 0 node văn bản DOM).
 */
export function findCanvasItemIndexForQuery(
  items: readonly CanvasLayoutItem[],
  rawQuery: string,
  occurrenceIndex = 0,
): number {
  const q = rawQuery.trim().normalize('NFC');
  if (q.length < 2 || items.length === 0) return -1;
  const needleLower = q.toLocaleLowerCase('vi');
  const queryHasDiacritics = stripSearchDiacritics(needleLower) !== needleLower;
  const needleAscii = stripSearchDiacritics(needleLower);

  const scanCanvasPass = (matcher: (text: string) => number): number => {
    let seen = 0;
    let firstMatchIdx = -1;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== 'text-line') continue;
      const lineText = item.fragments.map((f) => f.text).join('');
      const hits = matcher(lineText);
      if (hits > 0) {
        if (firstMatchIdx === -1) firstMatchIdx = i;
        if (seen + hits > occurrenceIndex) return i;
        seen += hits;
      }
    }
    if (firstMatchIdx !== -1) return firstMatchIdx;

    // Dự phòng khi cụm từ khoá nhiều chữ bị ngắt xuống dòng giữa chừng trên Canvas
    for (let i = 0; i < items.length - 1; i += 1) {
      const cur = items[i];
      const nxt = items[i + 1];
      if (cur.kind !== 'text-line' || nxt.kind !== 'text-line') continue;
      const pairText = `${cur.fragments.map((f) => f.text).join('')} ${nxt.fragments.map((f) => f.text).join('')}`;
      if (matcher(pairText) > 0) return i;
    }
    return -1;
  };

  const exactIdx = scanCanvasPass((text) => countExactMatches(text, needleLower));
  if (exactIdx !== -1 || queryHasDiacritics || needleAscii.length < 2) return exactIdx;

  return scanCanvasPass((text) => countAsciiMatches(text, needleAscii));
}
