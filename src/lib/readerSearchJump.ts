import type { CanvasLayoutItem } from '@/lib/guestCanvasLayout';

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

function countQueryMatchesInText(
  rawText: string,
  needleLower: string,
  queryHasDiacritics: boolean,
  needleAscii: string,
): number {
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
  if (count > 0 || queryHasDiacritics || needleAscii.length < 2) return count;

  const hayAscii = stripSearchDiacritics(hayLower);
  cursor = 0;
  while (cursor <= hayAscii.length - needleAscii.length) {
    const idx = hayAscii.indexOf(needleAscii, cursor);
    if (idx === -1) break;
    count += 1;
    cursor = idx + needleAscii.length;
  }
  return count;
}

/**
 * Tìm phần tử văn bản lá (`p, li, blockquote, h1..h4, td`) trong `.reading-content`
 * chứa lần khớp thứ `occurrenceIndex` của từ khoá (D-036 Mục 3).
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

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.reading-content p, .reading-content li, .reading-content blockquote, .reading-content h1, .reading-content h2, .reading-content h3, .reading-content h4, .reading-content td',
    ),
  );

  let seenOccurrences = 0;
  let firstMatchedEl: HTMLElement | null = null;

  for (const el of candidates) {
    // Bỏ qua blockquote bọc ngoài nếu bên trong nó đã có thẻ <p> con nằm trong danh sách
    if (el.tagName === 'BLOCKQUOTE' && el.querySelector('p')) continue;
    const text = el.textContent || '';
    const hits = countQueryMatchesInText(text, needleLower, queryHasDiacritics, needleAscii);
    if (hits <= 0) continue;
    if (!firstMatchedEl) firstMatchedEl = el;
    if (seenOccurrences + hits > occurrenceIndex) {
      return el;
    }
    seenOccurrences += hits;
  }

  return firstMatchedEl;
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

  let seen = 0;
  let firstMatchIdx = -1;

  // Dò theo từng dòng trước; nếu cụm từ vắt qua 2 dòng liên tiếp thì dò cửa sổ 2 dòng kề nhau
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== 'text-line') continue;
    const lineText = item.fragments.map((f) => f.text).join('');
    const hits = countQueryMatchesInText(lineText, needleLower, queryHasDiacritics, needleAscii);
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
    if (countQueryMatchesInText(pairText, needleLower, queryHasDiacritics, needleAscii) > 0) {
      return i;
    }
  }

  return -1;
}
