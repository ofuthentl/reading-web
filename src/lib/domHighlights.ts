import type { BookHighlight, HighlightLocator } from '@/types';

export interface SelectionHighlightDraft {
  quoteText: string;
  locator: HighlightLocator;
  anchorX: number;
  anchorY: number;
}

const LEAF_BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, figcaption, pre';

function collectLeafBlocks(contentRoot: Element): HTMLElement[] {
  const all = Array.from(contentRoot.querySelectorAll<HTMLElement>(LEAF_BLOCK_SELECTOR));
  const filtered = all.filter((el) => !el.querySelector(LEAF_BLOCK_SELECTOR));
  return filtered.length > 0 ? filtered : [contentRoot as HTMLElement];
}

export function captureOwnerSelectionDraft(
  container: HTMLElement | null,
  currentScrollRatio = 0,
): SelectionHighlightDraft | null {
  if (!container || typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const contentRoot = container.querySelector('.reading-content');
  if (!contentRoot || !contentRoot.contains(range.commonAncestorContainer)) {
    return null;
  }

  const rawText = sel.toString().replace(/\s+/g, ' ').trim();
  if (rawText.length < 2) return null;
  const quoteText = rawText.slice(0, 600);

  const blocks = collectLeafBlocks(contentRoot);
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const hostBlock = startEl?.closest(LEAF_BLOCK_SELECTOR) as HTMLElement | null;
  const blockIndex = hostBlock ? Math.max(0, blocks.indexOf(hostBlock)) : 0;

  let startOffset: number | undefined;
  let endOffset: number | undefined;
  if (hostBlock && hostBlock.contains(range.endContainer)) {
    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(hostBlock);
      preRange.setEnd(range.startContainer, range.startOffset);
      startOffset = preRange.toString().length;
      endOffset = startOffset + range.toString().length;
    } catch {
      startOffset = undefined;
    }
  }

  const rect = range.getBoundingClientRect();
  const anchorX = Math.round(rect.left + rect.width / 2);
  const anchorY = Math.round(rect.top);

  return {
    quoteText,
    locator: {
      blockIndex,
      ...(startOffset !== undefined ? { startOffset } : {}),
      ...(endOffset !== undefined ? { endOffset } : {}),
      scrollRatio: Math.round(currentScrollRatio * 1000) / 1000,
    },
    anchorX,
    anchorY,
  };
}

interface TextNodeSlice {
  node: Text;
  normStart: number;
  normEnd: number;
  rawOffsets: number[];
}

function buildNormalizedTextMap(root: Element): {
  normalized: string;
  slices: TextNodeSlice[];
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const slices: TextNodeSlice[] = [];
  let normalized = '';
  let prevSpace = true;

  let current = walker.nextNode() as Text | null;
  while (current) {
    const val = current.nodeValue || '';
    if (val.length > 0) {
      const rawOffsets: number[] = [];
      const normStart = normalized.length;
      for (let i = 0; i < val.length; i += 1) {
        const ch = val[i];
        if (/\s/.test(ch)) {
          if (!prevSpace) {
            normalized += ' ';
            rawOffsets.push(i);
            prevSpace = true;
          }
        } else {
          normalized += ch;
          rawOffsets.push(i);
          prevSpace = false;
        }
      }
      const normEnd = normalized.length;
      if (normEnd > normStart) {
        slices.push({ node: current, normStart, normEnd, rawOffsets });
      }
    }
    current = walker.nextNode() as Text | null;
  }

  return { normalized, slices };
}

function wrapMatchedNormalizedSpan(
  root: Element,
  quoteText: string,
  highlight: BookHighlight,
): boolean {
  const needle = quoteText.replace(/\s+/g, ' ').trim();
  if (needle.length < 2) return false;

  const { normalized, slices } = buildNormalizedTextMap(root);
  if (!normalized) return false;

  const matchStart = normalized.indexOf(needle);
  if (matchStart < 0) return false;
  const matchEnd = matchStart + needle.length;

  const overlapping = slices.filter(
    (sl) => sl.normEnd > matchStart && sl.normStart < matchEnd,
  );
  if (overlapping.length === 0) return false;

  // Bọc ngược từ cuối về đầu để không làm xô lệch chỉ mục node phía trước
  for (let i = overlapping.length - 1; i >= 0; i -= 1) {
    const sl = overlapping[i];
    if (!sl.node.parentNode) continue;
    // Tránh bọc chồng lên cùng 1 highlight ID
    if ((sl.node.parentElement as HTMLElement | null)?.dataset?.hlId === highlight.id) continue;

    const localStartNorm = Math.max(0, matchStart - sl.normStart);
    const localEndNorm = Math.min(sl.rawOffsets.length - 1, matchEnd - sl.normStart - 1);
    const rawStart = sl.rawOffsets[localStartNorm] ?? 0;
    const rawLast = sl.rawOffsets[localEndNorm] ?? (sl.node.nodeValue?.length ?? 1) - 1;
    const rawEnd = Math.min(sl.node.nodeValue?.length ?? 0, rawLast + 1);
    if (rawEnd <= rawStart) continue;

    let targetNode = sl.node;
    if (rawEnd < (targetNode.nodeValue?.length ?? 0)) {
      targetNode.splitText(rawEnd);
    }
    if (rawStart > 0) {
      targetNode = targetNode.splitText(rawStart);
    }

    const mark = document.createElement('mark');
    mark.className = `reader-hl reader-hl-${highlight.color}`;
    mark.dataset.hlId = highlight.id;
    if (highlight.note) {
      mark.title = highlight.note;
    }
    targetNode.parentNode?.insertBefore(mark, targetNode);
    mark.appendChild(targetNode);
  }

  return true;
}

export function clearChapterDomHighlights(contentRoot: Element): void {
  const marks = Array.from(contentRoot.querySelectorAll<HTMLElement>('mark[data-hl-id]'));
  if (marks.length === 0) return;
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
  contentRoot.normalize();
}

export function applyChapterDomHighlights(
  container: HTMLElement | null,
  highlights: readonly BookHighlight[],
): void {
  if (!container) return;
  const contentRoot = container.querySelector('.reading-content');
  if (!contentRoot) return;

  clearChapterDomHighlights(contentRoot);
  if (highlights.length === 0) return;

  const blocks = collectLeafBlocks(contentRoot);
  for (const hl of highlights) {
    const preferredIdx = hl.locator?.blockIndex;
    if (
      typeof preferredIdx === 'number' &&
      preferredIdx >= 0 &&
      preferredIdx < blocks.length &&
      wrapMatchedNormalizedSpan(blocks[preferredIdx], hl.quoteText, hl)
    ) {
      continue;
    }
    wrapMatchedNormalizedSpan(contentRoot, hl.quoteText, hl);
  }
}
