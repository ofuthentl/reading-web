import type { Chapter, GuestBlock, GuestInlineSpan } from '@/types';
import { guessImageMimeType } from '@/lib/docxXml';
import { extractRubyElementPairs } from '@/lib/rubyText';
import { isTocChapterTitle } from '@/lib/tocFormat';
import type { ZipSliceInfo } from '@/lib/zipDirectory';

export interface PackManifestMedia {
  offset: number;
  length: number;
  compression: 0 | 8;
  mime: string;
}

const CONTAINER_BLOCK_TAGS = new Set([
  'body',
  'section',
  'article',
  'main',
  'nav',
  'aside',
  'header',
  'footer',
  'div',
  'figure',
  'center',
  'dl',
  'dd',
  'details',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
]);

const LEAF_BLOCK_TAGS = new Set([
  'p',
  'figcaption',
  'pre',
  'td',
  'th',
  'dt',
  'caption',
  'summary',
]);

function appendMergedSpan(
  target: GuestInlineSpan[],
  text: string,
  bold: boolean,
  italic: boolean,
  rt?: string,
) {
  if (!text) return;
  const b = bold ? (1 as const) : undefined;
  const i = italic ? (1 as const) : undefined;
  const cleanRt = rt?.trim() || undefined;
  const prev = target[target.length - 1];
  if (prev && !prev.rt && !cleanRt && prev.b === b && prev.i === i) {
    prev.t += text;
  } else {
    target.push({
      t: text,
      ...(b ? { b } : {}),
      ...(i ? { i } : {}),
      ...(cleanRt ? { rt: cleanRt } : {}),
    });
  }
}

function normalizeParagraphSpans(spans: GuestInlineSpan[]): GuestInlineSpan[] {
  if (spans.length === 0) return [];
  const cleaned: GuestInlineSpan[] = [];
  for (const span of spans) {
    const normalizedText = span.t.replace(/[ \t\r\n]+/g, ' ');
    appendMergedSpan(cleaned, normalizedText, span.b === 1, span.i === 1, span.rt);
  }
  if (cleaned.length > 0) {
    cleaned[0] = { ...cleaned[0], t: cleaned[0].t.replace(/^\s+/, '') };
    const lastIdx = cleaned.length - 1;
    cleaned[lastIdx] = { ...cleaned[lastIdx], t: cleaned[lastIdx].t.replace(/\s+$/, '') };
  }
  return cleaned.filter((s) => s.t.length > 0);
}

function hasNestedBlockElement(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (
      CONTAINER_BLOCK_TAGS.has(tag) ||
      LEAF_BLOCK_TAGS.has(tag) ||
      tag === 'blockquote' ||
      tag === 'ul' ||
      tag === 'ol' ||
      tag === 'hr' ||
      /^h[1-6]$/.test(tag)
    ) {
      return true;
    }
  }
  return false;
}

export function convertChapterToGuestBlocks(
  chapter: Chapter,
  zipMap: Map<string, ZipSliceInfo>,
  mediaByZipPath: Map<string, number>,
  mediaList: PackManifestMedia[],
): GuestBlock[] {
  const blocks: GuestBlock[] = [];
  const isTocChapter = isTocChapterTitle(chapter.title);

  const registerMedia = (rawZipPath: string | null): number | null => {
    if (!rawZipPath) return null;
    const cleanPath = rawZipPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const existing = mediaByZipPath.get(cleanPath);
    if (existing !== undefined) return existing;

    const slice = zipMap.get(cleanPath);
    if (!slice) return null;
    const idx = mediaList.length;
    mediaList.push({
      offset: slice.dataOffset,
      length: slice.compressedSize,
      compression: slice.compression,
      mime: guessImageMimeType(cleanPath),
    });
    mediaByZipPath.set(cleanPath, idx);
    return idx;
  };

  if (!chapter.content_html) {
    for (const para of chapter.content.split(/\n{2,}/)) {
      const trimmed = para.replace(/\s+/g, ' ').trim();
      if (trimmed) blocks.push({ kind: 'p', spans: [{ t: trimmed }] });
    }
    return blocks;
  }

  const doc = new DOMParser().parseFromString(chapter.content_html, 'text/html');
  let pendingSpans: GuestInlineSpan[] = [];

  const flushParagraph = (kind: 'p' | 'quote' = 'p') => {
    const normalized = normalizeParagraphSpans(pendingSpans);
    pendingSpans = [];
    if (normalized.length === 0) return;
    if (kind === 'p' && normalized.length === 1) {
      const mdHeading = normalized[0].t.match(/^(#{1,3})\s+(.{1,130})$/);
      if (mdHeading) {
        const level = Math.min(3, mdHeading[1].length) as 1 | 2 | 3;
        blocks.push({ kind: 'h', level, spans: [{ t: mdHeading[2].trim(), b: 1 }] });
        return;
      }
    }
    blocks.push({ kind, spans: normalized });
  };

  const pushImageElement = (el: Element) => {
    const mediaIndex = registerMedia(el.getAttribute('data-zip-path'));
    if (mediaIndex !== null) {
      const alt = el.getAttribute('alt')?.trim();
      blocks.push({ kind: 'img', mediaIndex, ...(alt ? { alt: alt.slice(0, 120) } : {}) });
    }
  };

  const collectInlineInto = (
    node: Node,
    target: GuestInlineSpan[],
    bold: boolean,
    italic: boolean,
    onBreak: () => void,
    onImage: (imgEl: Element) => void,
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendMergedSpan(target, node.nodeValue || '', bold, italic);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      onBreak();
      return;
    }
    if (tag === 'img' || tag === 'image') {
      onImage(el);
      return;
    }
    if (tag === 'rp') return;
    if (tag === 'ruby') {
      for (const pair of extractRubyElementPairs(el)) {
        const normalized = pair.base.replace(/[ \t\r\n]+/g, ' ');
        const cleanRt = pair.rt?.replace(/\s+/g, ' ').trim() || undefined;
        if (!normalized.trim()) {
          if (normalized) appendMergedSpan(target, normalized, bold, italic);
          continue;
        }
        if (/^\s/.test(normalized)) appendMergedSpan(target, ' ', bold, italic);
        appendMergedSpan(target, normalized.trim(), bold, italic, cleanRt);
        if (/\s$/.test(normalized)) appendMergedSpan(target, ' ', bold, italic);
      }
      return;
    }

    if (tag === 'a' && (el.getAttribute('href') || '').includes('#')) {
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^\d{1,3}$|^\*{1,3}$/.test(label)) {
        appendMergedSpan(target, `[${label}]`, bold, italic);
        return;
      }
    }

    const nextBold = bold || tag === 'strong' || tag === 'b';
    const nextItalic = italic || tag === 'em' || tag === 'i';
    for (const child of Array.from(el.childNodes)) {
      collectInlineInto(child, target, nextBold, nextItalic, onBreak, onImage);
    }
  };

  const collectInlineNode = (
    node: Node,
    bold: boolean,
    italic: boolean,
    quoteContext: boolean,
  ) => {
    collectInlineInto(
      node,
      pendingSpans,
      bold,
      italic,
      () => flushParagraph(quoteContext ? 'quote' : 'p'),
      (imgEl) => {
        flushParagraph(quoteContext ? 'quote' : 'p');
        pushImageElement(imgEl);
      },
    );
  };

  const collectListEntries = (
    listEl: Element,
    depth: number,
    isPlainList: boolean,
    outItems: GuestInlineSpan[][],
    outDepths: number[],
  ) => {
    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      let liSpans: GuestInlineSpan[] = [];
      const flushLiSpans = () => {
        const normalized = normalizeParagraphSpans(liSpans);
        liSpans = [];
        if (normalized.length > 0) {
          outItems.push(normalized);
          outDepths.push(depth);
        }
      };

      const walkLiChild = (child: Node) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          const childTag = childEl.tagName.toLowerCase();
          if (childTag === 'ul' || childTag === 'ol') {
            flushLiSpans();
            collectListEntries(childEl, Math.min(4, depth + 1), isPlainList, outItems, outDepths);
            return;
          }
          if (
            (childTag === 'div' || childTag === 'p' || childTag === 'section' || childTag === 'nav') &&
            childEl.querySelector('ul, ol')
          ) {
            for (const nested of Array.from(childEl.childNodes)) walkLiChild(nested);
            flushLiSpans();
            return;
          }
          if (childTag === 'p' || childTag === 'div') {
            flushLiSpans();
            collectInlineInto(
              childEl,
              liSpans,
              false,
              false,
              () => {
                if (isPlainList) flushLiSpans();
                else appendMergedSpan(liSpans, ' ', false, false);
              },
              (imgEl) => pushImageElement(imgEl),
            );
            flushLiSpans();
            return;
          }
        }
        collectInlineInto(
          child,
          liSpans,
          false,
          false,
          () => {
            if (isPlainList) flushLiSpans();
            else appendMergedSpan(liSpans, ' ', false, false);
          },
          (imgEl) => pushImageElement(imgEl),
        );
      };

      for (const child of Array.from(li.childNodes)) {
        walkLiChild(child);
      }
      flushLiSpans();
    }
  };

  const emitListBlock = (items: GuestInlineSpan[][], depths: number[], ordered: boolean, plain: boolean) => {
    if (items.length === 0) return;
    const hasNestedDepth = depths.some((d) => d > 0);
    blocks.push({
      kind: 'list',
      ...(plain ? { plain: 1 as const } : ordered ? { ordered: 1 as const } : {}),
      ...(hasNestedDepth ? { depths } : {}),
      items,
    });
  };

  const walkBlockNode = (node: Node, quoteContext = false, navContext = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.nodeValue || '').trim()) {
        appendMergedSpan(pendingSpans, node.nodeValue || '', false, false);
        flushParagraph(quoteContext ? 'quote' : 'p');
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'hr') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      blocks.push({ kind: 'hr' });
      return;
    }
    if (tag === 'img' || tag === 'image') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      pushImageElement(el);
      return;
    }
    if (tag === 'svg') {
      for (const svgImg of Array.from(el.querySelectorAll('image[data-zip-path]'))) {
        flushParagraph(quoteContext ? 'quote' : 'p');
        const mediaIndex = registerMedia(svgImg.getAttribute('data-zip-path'));
        if (mediaIndex !== null) blocks.push({ kind: 'img', mediaIndex });
      }
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      flushParagraph(quoteContext ? 'quote' : 'p');
      for (const child of Array.from(el.childNodes)) {
        collectInlineNode(child, true, false, false);
      }
      const spans = normalizeParagraphSpans(pendingSpans);
      pendingSpans = [];
      if (spans.length > 0) {
        const headingText = spans.map((s) => s.t).join('').trim();
        // Tránh lặp lại tiêu đề chương ngay dòng đầu nếu trùng khít tiêu đề trên header trình đọc
        if (
          blocks.length === 0 &&
          headingText.toLocaleLowerCase('vi') === chapter.title.trim().toLocaleLowerCase('vi')
        ) {
          return;
        }
        const levelNum = Math.min(3, Math.max(1, Number(tag[1]))) as 1 | 2 | 3;
        blocks.push({ kind: 'h', level: levelNum, spans });
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      const isPlainList = navContext || isTocChapter;
      const items: GuestInlineSpan[][] = [];
      const depths: number[] = [];
      collectListEntries(el, 0, isPlainList, items, depths);
      emitListBlock(items, depths, tag === 'ol', isPlainList);
      return;
    }

    if (tag === 'dl' && (navContext || isTocChapter)) {
      flushParagraph(quoteContext ? 'quote' : 'p');
      const items: GuestInlineSpan[][] = [];
      const depths: number[] = [];
      for (const child of Array.from(el.children)) {
        const childTag = child.tagName.toLowerCase();
        if (childTag !== 'dt' && childTag !== 'dd') continue;
        const entrySpans: GuestInlineSpan[] = [];
        collectInlineInto(
          child,
          entrySpans,
          false,
          false,
          () => appendMergedSpan(entrySpans, ' ', false, false),
          (imgEl) => pushImageElement(imgEl),
        );
        const norm = normalizeParagraphSpans(entrySpans);
        if (norm.length > 0) {
          items.push(norm);
          depths.push(childTag === 'dd' ? 1 : 0);
        }
      }
      emitListBlock(items, depths, false, true);
      return;
    }

    if (tag === 'blockquote') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      if (hasNestedBlockElement(el)) {
        for (const child of Array.from(el.childNodes)) walkBlockNode(child, true, navContext);
      } else {
        for (const child of Array.from(el.childNodes)) {
          collectInlineNode(child, false, true, true);
        }
        flushParagraph('quote');
      }
      return;
    }

    const nextNavContext = navContext || tag === 'nav';

    if (CONTAINER_BLOCK_TAGS.has(tag) && hasNestedBlockElement(el)) {
      flushParagraph(quoteContext ? 'quote' : 'p');
      for (const child of Array.from(el.childNodes)) {
        walkBlockNode(child, quoteContext, nextNavContext);
      }
      flushParagraph(quoteContext ? 'quote' : 'p');
      return;
    }

    // EPUB2 Mục lục đặt nhiều thẻ <a> nối tiếp trực tiếp trong <div>/<nav> (CSS gốc `a { display: block }`)
    if ((nextNavContext || isTocChapter) && CONTAINER_BLOCK_TAGS.has(tag)) {
      const directLinks = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'a');
      if (directLinks.length >= 2) {
        const outsideText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.nodeValue || '').trim())
          .join('');
        if (outsideText.length <= directLinks.length * 2) {
          flushParagraph(quoteContext ? 'quote' : 'p');
          const items: GuestInlineSpan[][] = [];
          for (const linkEl of directLinks) {
            const linkSpans: GuestInlineSpan[] = [];
            collectInlineInto(
              linkEl,
              linkSpans,
              false,
              false,
              () => appendMergedSpan(linkSpans, ' ', false, false),
              (imgEl) => pushImageElement(imgEl),
            );
            const norm = normalizeParagraphSpans(linkSpans);
            if (norm.length > 0) items.push(norm);
          }
          emitListBlock(items, items.map(() => 0), false, true);
          return;
        }
      }
    }

    for (const child of Array.from(el.childNodes)) {
      collectInlineNode(child, false, quoteContext, quoteContext);
    }
    flushParagraph(quoteContext ? 'quote' : 'p');
  };

  if (doc.body) {
    for (const child of Array.from(doc.body.childNodes)) {
      walkBlockNode(child, false, false);
    }
    flushParagraph('p');
  }

  if (blocks.length === 0 && chapter.content.trim()) {
    blocks.push({ kind: 'p', spans: [{ t: chapter.content.trim() }] });
  }
  return blocks;
}
