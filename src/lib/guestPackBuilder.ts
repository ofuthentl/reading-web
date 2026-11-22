import type {
  Book,
  Chapter,
  GuestBlock,
  GuestInlineSpan,
  StorageStats,
} from '@/types';
import { apiFetch } from '@/lib/authSession';
import { guessImageMimeType } from '@/lib/docxXml';
import { parseBookBlob } from '@/lib/parsers';
import { type ZipSliceInfo, parseZipEntryOffsets } from '@/lib/zipDirectory';

const GUEST_PACK_MAGIC_BYTES = [0x4f, 0x46, 0x47, 0x50]; // "OFGP"

interface PackManifestChapter {
  id: string;
  title: string;
  offset: number;
  length: number;
}

interface PackManifestMedia {
  offset: number;
  length: number;
  compression: 0 | 8;
  mime: string;
}

interface PackManifest {
  v: 1;
  chapters: PackManifestChapter[];
  media: PackManifestMedia[];
}

const CONTAINER_BLOCK_TAGS = new Set([
  'body',
  'section',
  'article',
  'main',
  'div',
  'figure',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
]);

const LEAF_BLOCK_TAGS = new Set(['p', 'figcaption', 'pre', 'td', 'th']);

function appendMergedSpan(target: GuestInlineSpan[], text: string, bold: boolean, italic: boolean) {
  if (!text) return;
  const b = bold ? (1 as const) : undefined;
  const i = italic ? (1 as const) : undefined;
  const prev = target[target.length - 1];
  if (prev && prev.b === b && prev.i === i) {
    prev.t += text;
  } else {
    target.push({ t: text, ...(b ? { b } : {}), ...(i ? { i } : {}) });
  }
}

function normalizeParagraphSpans(spans: GuestInlineSpan[]): GuestInlineSpan[] {
  if (spans.length === 0) return [];
  const cleaned: GuestInlineSpan[] = [];
  for (const span of spans) {
    const normalizedText = span.t.replace(/[ \t\r\n]+/g, ' ');
    appendMergedSpan(cleaned, normalizedText, span.b === 1, span.i === 1);
  }
  if (cleaned.length > 0) {
    cleaned[0] = { ...cleaned[0], t: cleaned[0].t.replace(/^\s+/, '') };
    const lastIdx = cleaned.length - 1;
    cleaned[lastIdx] = { ...cleaned[lastIdx], t: cleaned[lastIdx].t.replace(/\s+$/, '') };
  }
  return cleaned.filter((s) => s.t.length > 0);
}

function convertChapterToGuestBlocks(
  chapter: Chapter,
  zipMap: Map<string, ZipSliceInfo>,
  mediaByZipPath: Map<string, number>,
  mediaList: PackManifestMedia[],
): GuestBlock[] {
  const blocks: GuestBlock[] = [];

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
    if (normalized.length > 0) {
      blocks.push({ kind, spans: normalized });
    }
  };

  const collectInlineNode = (
    node: Node,
    bold: boolean,
    italic: boolean,
    quoteContext: boolean,
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendMergedSpan(pendingSpans, node.nodeValue || '', bold, italic);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      return;
    }
    if (tag === 'img' || tag === 'image') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      const mediaIndex = registerMedia(el.getAttribute('data-zip-path'));
      if (mediaIndex !== null) {
        const alt = el.getAttribute('alt')?.trim();
        blocks.push({ kind: 'img', mediaIndex, ...(alt ? { alt: alt.slice(0, 120) } : {}) });
      }
      return;
    }

    const nextBold = bold || tag === 'strong' || tag === 'b';
    const nextItalic = italic || tag === 'em' || tag === 'i';
    for (const child of Array.from(el.childNodes)) {
      collectInlineNode(child, nextBold, nextItalic, quoteContext);
    }
  };

  const hasNestedBlockElement = (el: Element): boolean => {
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
  };

  const walkBlockNode = (node: Node, quoteContext = false) => {
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
      const mediaIndex = registerMedia(el.getAttribute('data-zip-path'));
      if (mediaIndex !== null) {
        const alt = el.getAttribute('alt')?.trim();
        blocks.push({ kind: 'img', mediaIndex, ...(alt ? { alt: alt.slice(0, 120) } : {}) });
      }
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
      const items: GuestInlineSpan[][] = [];
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        for (const child of Array.from(li.childNodes)) {
          collectInlineNode(child, false, false, false);
        }
        const itemSpans = normalizeParagraphSpans(pendingSpans);
        pendingSpans = [];
        if (itemSpans.length > 0) items.push(itemSpans);
      }
      if (items.length > 0) {
        blocks.push({ kind: 'list', ...(tag === 'ol' ? { ordered: 1 } : {}), items });
      }
      return;
    }

    if (tag === 'blockquote') {
      flushParagraph(quoteContext ? 'quote' : 'p');
      if (hasNestedBlockElement(el)) {
        for (const child of Array.from(el.childNodes)) walkBlockNode(child, true);
      } else {
        for (const child of Array.from(el.childNodes)) {
          collectInlineNode(child, false, true, true);
        }
        flushParagraph('quote');
      }
      return;
    }

    if (CONTAINER_BLOCK_TAGS.has(tag) && hasNestedBlockElement(el)) {
      flushParagraph(quoteContext ? 'quote' : 'p');
      for (const child of Array.from(el.childNodes)) {
        walkBlockNode(child, quoteContext);
      }
      flushParagraph(quoteContext ? 'quote' : 'p');
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      collectInlineNode(child, false, quoteContext, quoteContext);
    }
    flushParagraph(quoteContext ? 'quote' : 'p');
  };

  if (doc.body) {
    for (const child of Array.from(doc.body.childNodes)) {
      walkBlockNode(child, false);
    }
    flushParagraph('p');
  }

  if (blocks.length === 0 && chapter.content.trim()) {
    blocks.push({ kind: 'p', spans: [{ t: chapter.content.trim() }] });
  }
  return blocks;
}

async function gzipCompressBytes(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  void writer.write(raw as BufferSource);
  void writer.close();
  const ab = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(ab);
}

export async function buildGuestPackEnvelope(blob: Blob, book: Book): Promise<Uint8Array> {
  if (book.file_type !== 'epub' && book.file_type !== 'docx') {
    throw new Error('Chỉ hỗ trợ tạo gói bảo mật khách cho EPUB và DOCX.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const zipMap = parseZipEntryOffsets(arrayBuffer);
  const parsed = await parseBookBlob(new Blob([arrayBuffer], { type: blob.type }), book);

  try {
    const mediaByZipPath = new Map<string, number>();
    const mediaList: PackManifestMedia[] = [];
    const manifestChapters: PackManifestChapter[] = [];
    const compressedChunks: Uint8Array[] = [];
    let currentOffset = 0;

    for (const chapter of parsed.chapters) {
      const blocks = convertChapterToGuestBlocks(chapter, zipMap, mediaByZipPath, mediaList);
      const chapterJsonBytes = new TextEncoder().encode(
        JSON.stringify({ title: chapter.title, blocks }),
      );
      const compressed = await gzipCompressBytes(chapterJsonBytes);
      manifestChapters.push({
        id: chapter.id,
        title: chapter.title,
        offset: currentOffset,
        length: compressed.byteLength,
      });
      compressedChunks.push(compressed);
      currentOffset += compressed.byteLength;
    }

    const manifest: PackManifest = {
      v: 1,
      chapters: manifestChapters,
      media: mediaList,
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

    const totalEnvelopeSize = 8 + manifestBytes.byteLength + currentOffset;
    const envelope = new Uint8Array(totalEnvelopeSize);
    envelope.set(GUEST_PACK_MAGIC_BYTES, 0);
    new DataView(envelope.buffer).setUint32(4, manifestBytes.byteLength, true);
    envelope.set(manifestBytes, 8);

    let writePos = 8 + manifestBytes.byteLength;
    for (const chunk of compressedChunks) {
      envelope.set(chunk, writePos);
      writePos += chunk.byteLength;
    }
    return envelope;
  } finally {
    parsed.dispose();
  }
}

export async function buildAndUploadGuestPack(
  blob: Blob,
  book: Book,
): Promise<{ chapterCount: number; packSize: number; storage?: StorageStats }> {
  const envelope = await buildGuestPackEnvelope(blob, book);
  const res = await apiFetch(`/api/books/${book.id}/guest-pack`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: envelope as BodyInit,
  });
  const data = (await res.json().catch(() => ({}))) as {
    chapterCount?: number;
    packSize?: number;
    storage?: StorageStats;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải gói bảo mật chế độ khách lên máy chủ.');
  }
  return {
    chapterCount: data.chapterCount ?? 0,
    packSize: data.packSize ?? envelope.byteLength,
    storage: data.storage,
  };
}
