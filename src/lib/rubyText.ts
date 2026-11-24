/**
 * Tiện ích DOM dùng chung cho thẻ Furigana (`<ruby>`, `<rt>`, `<rp>`):
 * - Bỏ qua chú thích `<rt>` / `<rp>` khi trích chữ thuần, tìm kiếm DOM và tạo Highlight.
 * - Tách cặp `(base, rt)` an toàn cho `GuestPack` ngay cả khi 1 thẻ `<ruby>` chứa nhiều `<rb>/<rt>`.
 */

export interface RubyTextPair {
  base: string;
  rt?: string;
}

export function isInsideRubyAnnotation(node: Node | null | undefined, stopAt?: Node | null): boolean {
  let cur: Node | null | undefined = node;
  while (cur && cur !== stopAt) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const tag = (cur as Element).tagName.toUpperCase();
      if (tag === 'RT' || tag === 'RP') return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

export function extractTextExcludingRubyAnnotations(root: Node | null | undefined): string {
  if (!root) return '';
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (!el.querySelector('rt, rp')) {
      return el.textContent || '';
    }
  } else if (root.nodeType === Node.TEXT_NODE) {
    return isInsideRubyAnnotation(root) ? '' : root.nodeValue || '';
  }

  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return root.textContent || '';

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = '';
  let current = walker.nextNode();
  while (current) {
    if (!isInsideRubyAnnotation(current, root)) {
      out += current.nodeValue || '';
    }
    current = walker.nextNode();
  }
  return out;
}

export function extractRangeTextExcludingRuby(range: Range): string {
  if (isInsideRubyAnnotation(range.commonAncestorContainer)) return '';
  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    return range.toString();
  }
  const frag = range.cloneContents();
  const annotations = frag.querySelectorAll('rt, rp');
  if (annotations.length > 0) {
    annotations.forEach((node) => node.remove());
  }
  return frag.textContent || '';
}

function joinRtSegment(prevRt: string, nextRt: string): string {
  if (!prevRt) return nextRt;
  if (!nextRt) return prevRt;
  const needsSpace = /[A-Za-zÀ-ỹ0-9]$/.test(prevRt) && /^[A-Za-zÀ-ỹ0-9]/.test(nextRt);
  return needsSpace ? `${prevRt} ${nextRt}` : `${prevRt}${nextRt}`;
}

export function extractRubyElementPairs(rubyEl: Element): RubyTextPair[] {
  const pairs: RubyTextPair[] = [];
  const pendingBases: string[] = [];
  const pendingRts: string[] = [];
  let currentBase = '';

  const flushTabular = () => {
    if (pendingBases.length === 0 && pendingRts.length === 0) return;
    if (pendingBases.length > 0 && pendingRts.length > 0) {
      if (pendingBases.length === pendingRts.length) {
        for (let k = 0; k < pendingBases.length; k += 1) {
          pairs.push({ base: pendingBases[k], rt: pendingRts[k] });
        }
      } else {
        pairs.push({
          base: pendingBases.join(''),
          rt: pendingRts.reduce((acc, part) => joinRtSegment(acc, part), ''),
        });
      }
    } else {
      for (const b of pendingBases) pairs.push({ base: b });
    }
    pendingBases.length = 0;
    pendingRts.length = 0;
  };

  for (const child of Array.from(rubyEl.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const val = child.nodeValue || '';
      if (pendingRts.length > 0 && val.trim()) flushTabular();
      currentBase += val;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const cTag = (child as Element).tagName.toLowerCase();
    if (cTag === 'rp') continue;
    if (cTag === 'rt') {
      const rtPart = (child.textContent || '').replace(/\s+/g, ' ').trim();
      if (currentBase) {
        pendingBases.push(currentBase);
        currentBase = '';
      }
      if (rtPart) pendingRts.push(rtPart);
    } else if (cTag === 'rb') {
      if (pendingRts.length > 0) flushTabular();
      if (currentBase) {
        pendingBases.push(currentBase);
        currentBase = '';
      }
      pendingBases.push(child.textContent || '');
    } else {
      if (pendingRts.length > 0) flushTabular();
      currentBase += child.textContent || '';
    }
  }
  flushTabular();
  if (currentBase) pairs.push({ base: currentBase });
  return pairs;
}
