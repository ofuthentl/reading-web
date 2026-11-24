import type { Book, Chapter } from '@/types';
import { escapeHtml } from '@/lib/docxXml';
import { sanitizeBookDocument } from '@/lib/sanitizeHtml';

const CHAPTER_HEADING_TEXT_RE =
  /^(?:(?:chương|hồi|phần|quyển|tập|ngoại\s+truyện|phụ\s+lục|chapter|part|act|extra)\s*(?:\d+|[ivxlcdm]+(?:$|[\s:.\-–—])|[:\-–—.])|(?:mở\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|khúc\s+dạo\s+đầu|lời\s+kết|vĩ\s+thanh|prologue|epilogue|interlude)(?:$|[\s:.\-–—]))/i;

const AUTO_SPLIT_CHAR_THRESHOLD = 18_000;
const AUTO_SPLIT_CHUNK_CHARS = 15_000;

export interface DocxBlock {
  html: string;
  text: string;
  headingLevel: number | null;
  isTitle: boolean;
  hasMedia: boolean;
  listKind: 'ul' | 'ol' | null;
  noteRefs?: Array<{ key: string; label: string; text: string }>;
}

function assembleBlocksHtml(blocks: DocxBlock[]): string {
  const parts: string[] = [];
  const chapterNotes = new Map<string, { label: string; text: string }>();
  let openList: 'ul' | 'ol' | null = null;
  for (const block of blocks) {
    if (block.listKind !== openList) {
      if (openList) parts.push(`</${openList}>`);
      if (block.listKind) parts.push(`<${block.listKind}>`);
      openList = block.listKind;
    }
    parts.push(block.html);
    if (block.noteRefs) {
      for (const ref of block.noteRefs) {
        if (!chapterNotes.has(ref.key)) chapterNotes.set(ref.key, { label: ref.label, text: ref.text });
      }
    }
  }
  if (openList) parts.push(`</${openList}>`);
  if (chapterNotes.size > 0) {
    parts.push('<hr />');
    for (const [key, note] of chapterNotes.entries()) {
      parts.push(`<p id="${escapeHtml(key)}">${escapeHtml(note.label)} ${escapeHtml(note.text)}</p>`);
    }
  }
  return parts.join('');
}

function sanitizeAndRestoreImages(
  rawHtml: string,
  placeholderToImage: Map<string, { blobUrl: string; zipPath: string }>,
): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  // Must sanitize BEFORE replacing placeholder src with blob: URLs (DOMPurify strips blob: by default)
  sanitizeBookDocument(doc);
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src]'))) {
    const src = img.getAttribute('src') || '';
    const resolved = placeholderToImage.get(src);
    if (resolved) {
      img.src = resolved.blobUrl;
      img.loading = 'lazy';
      img.setAttribute('data-zip-path', resolved.zipPath);
    } else {
      img.remove();
    }
  }
  return doc.body?.innerHTML?.trim() || '';
}

export function buildDocxChapters(
  blocks: DocxBlock[],
  book: Book,
  placeholderToImage: Map<string, { blobUrl: string; zipPath: string }>,
): Chapter[] {
  const h1Count = blocks.filter((b) => b.headingLevel === 1 && b.text).length;
  const h2Count = blocks.filter((b) => b.headingLevel === 2 && b.text).length;
  const textHeadingCount = blocks.filter(
    (b) =>
      b.headingLevel === null &&
      !b.listKind &&
      b.text.length > 0 &&
      b.text.length <= 120 &&
      CHAPTER_HEADING_TEXT_RE.test(b.text),
  ).length;

  let splitMode: 'h1' | 'h2' | 'text-heading' | 'chunk' = 'chunk';
  if (h1Count >= 2) splitMode = 'h1';
  else if (h2Count >= 2) splitMode = 'h2';
  else if (textHeadingCount >= 2) splitMode = 'text-heading';

  const isSplitBoundary = (block: DocxBlock): boolean => {
    if (!block.text) return false;
    if (splitMode === 'h1') return block.headingLevel === 1;
    if (splitMode === 'h2') return block.headingLevel === 2;
    if (splitMode === 'text-heading') {
      return !block.listKind && block.text.length <= 120 && CHAPTER_HEADING_TEXT_RE.test(block.text);
    }
    return false;
  };

  const groups: { title: string; blocks: DocxBlock[] }[] = [];

  if (splitMode !== 'chunk') {
    let currentTitle: string | null = null;
    let currentBlocks: DocxBlock[] = [];
    const flush = () => {
      if (currentBlocks.length === 0) return;
      const hasAnyText = currentBlocks.some((b) => b.text.length > 0);
      const fallbackTitle = !hasAnyText
        ? 'Minh họa'
        : groups.length === 0
          ? currentBlocks.find((b) => b.isTitle || b.headingLevel === 1)?.text || 'Mở đầu'
          : `Phần ${groups.length + 1}`;
      groups.push({ title: currentTitle || fallbackTitle, blocks: currentBlocks });
      currentBlocks = [];
    };

    for (const block of blocks) {
      if (isSplitBoundary(block)) {
        flush();
        currentTitle = block.text.slice(0, 140);
      } else {
        currentBlocks.push(block);
      }
    }
    flush();
  }

  if (groups.length === 0) {
    const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
    if (totalChars <= AUTO_SPLIT_CHAR_THRESHOLD) {
      groups.push({ title: book.title, blocks });
    } else {
      let currentBlocks: DocxBlock[] = [];
      let currentChars = 0;
      for (const block of blocks) {
        if (currentBlocks.length > 0 && currentChars + block.text.length > AUTO_SPLIT_CHUNK_CHARS) {
          groups.push({ title: `Phần ${groups.length + 1}`, blocks: currentBlocks });
          currentBlocks = [];
          currentChars = 0;
        }
        currentBlocks.push(block);
        currentChars += block.text.length;
      }
      if (currentBlocks.length > 0) {
        groups.push({ title: `Phần ${groups.length + 1}`, blocks: currentBlocks });
      }
    }
  }

  const chapters: Chapter[] = [];
  for (const group of groups) {
    const rawHtml = assembleBlocksHtml(group.blocks);
    const contentHtml = sanitizeAndRestoreImages(rawHtml, placeholderToImage);
    const plainText = group.blocks
      .map((b) => b.text)
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (!contentHtml && !plainText) continue;
    const index = chapters.length;
    chapters.push({
      id: `${book.id}-docx-${index}`,
      book_id: book.id,
      title: group.title,
      content: plainText,
      content_html: contentHtml,
      chapter_number: index + 1,
    });
  }
  return chapters;
}
