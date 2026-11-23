import type { MouseEvent } from 'react';
import type { Chapter, GuestBlock, ReaderFont } from '@/types';
import {
  type ChapterCanvasLayout,
  buildCanvasFontSpec,
  measureCanvasTextWidth,
} from '@/lib/guestCanvasLayout';

export interface ResolvedFootnoteItem {
  markerLabel: string;
  content: string;
  sourceChapterTitle?: string;
  anchorX: number;
  anchorY: number;
}

const FOOTNOTE_MARKER_LABEL_RE =
  /^(?:\[\s*(?:\d{1,3}|[a-z]|\*{1,3}|chú\s*thích\s*\d*|note\s*\d*|ct\s*\d*)\s*\]|\(\s*(?:\d{1,3}|\*{1,3}|chú\s*thích\s*\d*)\s*\)|(?:\*{1,3}|†|‡)|\d{1,3})$/i;

const FOOTNOTE_ID_HINT_RE = /(?:^|[-_])(?:fn|ftn|note|footnote|endnote|noteref|chuthich|ct)\d*/i;

const BACKLINK_STRIP_RE = /(?:\s*(?:↩︎?|↑|⇧|\[\s*(?:quay\s*lại|back|trở\s*lại)\s*\]))+\s*$/gi;

// Regex nhận diện dấu chú thích inline trong văn bản (ví dụ `[1]`, `[12]`, `[*]`, `(*)`)
export const INLINE_FOOTNOTE_TOKEN_RE = /(\[\d{1,3}\]|\[\*{1,3}\]|\(\*{1,3}\))/g;

export function normalizeFootnoteKey(rawMarker: string): string {
  return rawMarker
    .trim()
    .replace(/^[[(\s]+|[\])\s]+$/g, '')
    .replace(/^(?:chú\s*thích|note|ct)\s*/i, '')
    .trim()
    .toLowerCase();
}

function cleanFootnoteText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(BACKLINK_STRIP_RE, '')
    .trim()
    .normalize('NFC');
}

function extractNoteTextFromTargetElement(anchorEl: Element): string {
  const tag = anchorEl.tagName.toLowerCase();
  let container: Element = anchorEl;

  if (tag === 'a' || tag === 'span' || tag === 'sup') {
    const parentBlock = anchorEl.closest('aside, li, p, dd, div, tr');
    if (parentBlock) container = parentBlock;
  }

  const clone = container.cloneNode(true) as Element;
  clone
    .querySelectorAll('a[role="doc-backlink"], a[epub\\:type~="backlink"]')
    .forEach((el) => el.remove());

  const paragraphs = Array.from(clone.querySelectorAll('p'))
    .map((p) => cleanFootnoteText(p.textContent || ''))
    .filter(Boolean);

  const rawText =
    paragraphs.length > 0
      ? paragraphs.join('\n\n')
      : cleanFootnoteText(clone.textContent || '');

  return rawText.slice(0, 1800);
}

function findElementByFragment(root: ParentNode, fragment: string): Element | null {
  if (!fragment) return null;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fragment) : fragment;
  try {
    return (
      root.querySelector(`#${escaped}`) ||
      root.querySelector(`[name="${escaped}"]`)
    );
  } catch {
    return null;
  }
}

function isLikelyFootnoteLink(link: HTMLAnchorElement, fragment: string, label: string): boolean {
  const epubType = link.getAttribute('epub:type') || '';
  const role = link.getAttribute('role') || '';
  const cls = `${link.className || ''} ${link.parentElement?.className || ''}`;

  if (/\bnoteref\b/i.test(epubType) || role === 'doc-noteref') return true;
  if (/\b(?:footnote|endnote|noteref|fnref|ftnref)\b/i.test(cls)) return true;
  if (FOOTNOTE_ID_HINT_RE.test(fragment)) return true;
  if (link.closest('sup') && label.length <= 16) return true;
  if (FOOTNOTE_MARKER_LABEL_RE.test(label)) return true;
  return false;
}

const parsedChapterDocCache = new WeakMap<Chapter, Document>();

function getParsedChapterDocument(chapter: Chapter): Document | null {
  if (!chapter.content_html || typeof DOMParser === 'undefined') return null;
  const cached = parsedChapterDocCache.get(chapter);
  if (cached) return cached;
  const doc = new DOMParser().parseFromString(chapter.content_html, 'text/html');
  parsedChapterDocCache.set(chapter, doc);
  return doc;
}

/**
 * Xử lý bấm thẻ `<a href="...">` trong trình đọc Owner (`D-036` Mục 1):
 * - Nếu là chú thích dịch giả (cùng chương hoặc nằm ở chương Chú thích cuối sách) → trả về dữ liệu mở Popup ngay tại chỗ.
 * - Trả về `null` nếu là liên kết thường (để `handleReaderContentLinkClick` xử lý tiếp).
 */
export function resolveOwnerFootnoteClick(
  event: MouseEvent,
  container: HTMLElement | null,
  chapters: readonly Chapter[],
  currentChapterIndex: number,
): ResolvedFootnoteItem | null {
  const target = event.target as HTMLElement | null;
  const link = target?.closest('.reading-content a[href]') as HTMLAnchorElement | null;
  if (!link) return null;

  const rawHref = (link.getAttribute('href') || '').trim();
  if (!rawHref || /^(?:https?:|mailto:)/i.test(rawHref)) return null;

  const hashIdx = rawHref.indexOf('#');
  if (hashIdx < 0) return null;

  let fragment = rawHref.slice(hashIdx + 1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // Keep raw fragment
  }
  if (!fragment) return null;

  // Bỏ qua nếu chính người dùng đang bấm nút quay lại (`backlink`) ở cuối trang chú thích
  const role = link.getAttribute('role') || '';
  const epubType = link.getAttribute('epub:type') || '';
  const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
  if (role === 'doc-backlink' || /\bbacklink\b/i.test(epubType) || /^(?:↩︎?|↑|quay lại|back)$/i.test(label)) {
    return null;
  }

  if (!isLikelyFootnoteLink(link, fragment, label)) {
    return null;
  }

  const rect = link.getBoundingClientRect();
  const anchorX = Math.round(rect.left + rect.width / 2);
  const anchorY = Math.round(rect.bottom);
  const markerLabel = label || `[${fragment}]`;

  // 1. Tìm ngay trong DOM chương hiện tại
  if (container) {
    const localTarget = findElementByFragment(container, fragment);
    if (localTarget && localTarget !== link && !link.contains(localTarget)) {
      const content = extractNoteTextFromTargetElement(localTarget);
      if (content && content.length >= 2) {
        event.preventDefault();
        event.stopPropagation();
        return { markerLabel, content, anchorX, anchorY };
      }
    }
  }

  // 2. Quét sang các chương khác (ưu tiên từ cuối sách ngược lên vì chương Chú thích thường nằm cuối)
  const searchOrder: number[] = [];
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    if (i !== currentChapterIndex) searchOrder.push(i);
  }

  for (const idx of searchOrder) {
    const chap = chapters[idx];
    if (!chap?.content_html || !chap.content_html.includes(fragment)) continue;
    const doc = getParsedChapterDocument(chap);
    if (!doc) continue;
    const found = findElementByFragment(doc, fragment);
    if (found) {
      const content = extractNoteTextFromTargetElement(found);
      if (content && content.length >= 2) {
        event.preventDefault();
        event.stopPropagation();
        return {
          markerLabel,
          content,
          sourceChapterTitle: chap.title,
          anchorX,
          anchorY,
        };
      }
    }
  }

  return null;
}

const DEFINITION_LINE_PATTERNS: RegExp[] = [
  /^\[\s*(\d{1,3}|\*{1,3})\s*\]\s*[:.\-–—]?\s+(.{3,})$/s,
  /^\(\s*(\d{1,3}|\*{1,3})\s*\)\s*[:.\-–—]\s*(.{3,})$/s,
  /^(?:chú\s*thích|note|ct)\s*(\d{1,3})\s*[:.\-–—]\s*(.{3,})$/is,
  /^(\*{1,3})\s+(.{4,})$/s,
];

function parseFootnoteDefinitionLine(text: string): { key: string; body: string } | null {
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 1600) return null;
  for (const re of DEFINITION_LINE_PATTERNS) {
    const m = trimmed.match(re);
    if (m && m[1] && m[2]) {
      const key = normalizeFootnoteKey(m[1]);
      const body = cleanFootnoteText(m[2]);
      if (key && body) return { key, body };
    }
  }
  return null;
}

/**
 * Tự động nhận diện bảng chú thích cho chế độ `guest` ngay trên 263 `guest-packs` sẵn có
 * (kết hợp `chapterData.footnotes` nếu gói mới có nhúng sẵn).
 */
export function buildGuestChapterFootnoteMap(
  blocks: readonly GuestBlock[] | undefined,
  embeddedFootnotes?: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();

  if (embeddedFootnotes) {
    for (const [k, v] of Object.entries(embeddedFootnotes)) {
      const normKey = normalizeFootnoteKey(k);
      const body = cleanFootnoteText(v);
      if (normKey && body) map.set(normKey, body);
    }
  }

  if (!blocks || blocks.length === 0) return map;

  // Quét ngược từ cuối chương để ưu tiên phần Chú thích cuối chương (tránh nhầm hội thoại đầu chương)
  const scanStart = Math.max(0, blocks.length - 80);
  for (let i = blocks.length - 1; i >= scanStart; i -= 1) {
    const block = blocks[i];
    if (block.kind === 'p' || block.kind === 'quote') {
      const joined = block.spans.map((s) => s.t).join('');
      const parsed = parseFootnoteDefinitionLine(joined);
      if (parsed && !map.has(parsed.key)) {
        map.set(parsed.key, parsed.body);
      }
    } else if (block.kind === 'list') {
      for (let li = 0; li < block.items.length; li += 1) {
        const itemText = block.items[li].map((s) => s.t).join('');
        const parsed = parseFootnoteDefinitionLine(itemText);
        if (parsed && !map.has(parsed.key)) {
          map.set(parsed.key, parsed.body);
        } else if (block.ordered && i >= blocks.length - 5) {
          // Danh sách có thứ tự nằm ngay cuối chương (dưới tiêu đề "Chú thích")
          const prevBlock = blocks[i - 1];
          const prevTitle =
            prevBlock && (prevBlock.kind === 'h' || prevBlock.kind === 'p')
              ? prevBlock.spans.map((s) => s.t).join('').trim()
              : '';
          if (/^(?:chú\s*thích|ghi\s*chú|footnotes?|notes?)$/i.test(prevTitle)) {
            const ordKey = String(li + 1);
            const cleanItem = cleanFootnoteText(itemText);
            if (cleanItem && !map.has(ordKey)) map.set(ordKey, cleanItem);
          }
        }
      }
    }
  }

  return map;
}

/**
 * Dùng trong `guestPackBuilder.ts` cho các gói mới: trích bảng chú thích từ HTML chương/sách
 * để kể cả chú thích nằm ở chương cuối EPUB cũng bật được Popup ở chế độ Guest.
 */
export function extractChapterFootnotesForGuestPack(
  chapter: Chapter,
  allChapters: readonly Chapter[],
): Record<string, string> | undefined {
  if (!chapter.content_html || typeof DOMParser === 'undefined') return undefined;
  const doc = new DOMParser().parseFromString(chapter.content_html, 'text/html');
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="#"]'));
  if (links.length === 0) return undefined;

  const out: Record<string, string> = {};
  let count = 0;

  for (const link of links) {
    if (count >= 60) break;
    const rawHref = (link.getAttribute('href') || '').trim();
    const hashIdx = rawHref.indexOf('#');
    if (hashIdx < 0) continue;
    const fragment = rawHref.slice(hashIdx + 1);
    const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
    if (!fragment || !isLikelyFootnoteLink(link, fragment, label)) continue;

    const normKey = normalizeFootnoteKey(label || fragment);
    if (!normKey || out[normKey]) continue;

    let targetEl = findElementByFragment(doc, fragment);
    if (!targetEl) {
      for (let i = allChapters.length - 1; i >= 0; i -= 1) {
        const other = allChapters[i];
        if (other.id === chapter.id || !other.content_html?.includes(fragment)) continue;
        const otherDoc = getParsedChapterDocument(other);
        targetEl = otherDoc ? findElementByFragment(otherDoc, fragment) : null;
        if (targetEl) break;
      }
    }

    if (targetEl && targetEl !== link) {
      const noteText = extractNoteTextFromTargetElement(targetEl);
      if (noteText && noteText.length >= 2) {
        out[normKey] = noteText;
        count += 1;
      }
    }
  }

  return count > 0 ? out : undefined;
}

export function findCanvasFootnoteAtPoint(options: {
  layout: ChapterCanvasLayout;
  stageWidth: number;
  stageX: number;
  stageY: number;
  font: ReaderFont;
  footnoteMap: ReadonlyMap<string, string>;
}): { markerLabel: string; content: string } | null {
  const { layout, stageWidth, stageX, stageY, font, footnoteMap } = options;
  if (footnoteMap.size === 0 || stageY < 0 || stageY > layout.totalHeight) return null;

  const offsetX = Math.max(0, Math.floor((stageWidth - layout.contentWidth) / 2));
  for (const item of layout.items) {
    if (item.kind !== 'text-line') continue;
    if (stageY < item.y - 3 || stageY > item.y + item.height + 3) continue;

    for (const frag of item.fragments) {
      if (!frag.text.includes('[') && !frag.text.includes('(')) continue;
      const spec = buildCanvasFontSpec(
        item.isHeading ? 'serif' : font,
        item.fontSize,
        item.isHeading || frag.bold,
        frag.italic,
      );
      INLINE_FOOTNOTE_TOKEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INLINE_FOOTNOTE_TOKEN_RE.exec(frag.text)) !== null) {
        const key = normalizeFootnoteKey(m[0]);
        const content = footnoteMap.get(key);
        if (!content) continue;
        const prefixW = m.index > 0 ? measureCanvasTextWidth(frag.text.slice(0, m.index), spec) : 0;
        const tokenW = measureCanvasTextWidth(m[0], spec);
        const minX = offsetX + frag.x + prefixW - 6;
        const maxX = offsetX + frag.x + prefixW + tokenW + 6;
        if (stageX >= minX && stageX <= maxX) {
          return { markerLabel: m[0], content };
        }
      }
    }
  }
  return null;
}
