import type JSZip from 'jszip';
import type { Book, Chapter, ParsedBook } from '@/types';
import { compressCoverBlob } from '@/lib/coverImage';
import {
  type DocxRel,
  type StyleMeta,
  escapeHtml,
  findDirectChild,
  findImageRelIds,
  getAttr,
  guessImageMimeType,
  isToggleFlagEnabled,
  parseNumberingKinds,
  parseRelationships,
  parseStyles,
  resolveDocxPath,
  resolveHeadingFromStyle,
} from '@/lib/docxXml';
import { sanitizeBookDocument } from '@/lib/sanitizeHtml';

const RASTER_IMAGE_EXT_RE = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
const RENDERABLE_IMAGE_EXT_RE = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const CHAPTER_HEADING_TEXT_RE =
  /^(?:chương|hồi|phần|quyển|tập|mở\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|khúc\s+dạo\s+đầu|ngoại\s+truyện|phụ\s+lục|lời\s+kết|vĩ\s+thanh|chapter|prologue|epilogue|interlude|part|act|extra)\b/i;

const AUTO_SPLIT_CHAR_THRESHOLD = 18_000;
const AUTO_SPLIT_CHUNK_CHARS = 15_000;

interface DocxBlock {
  html: string;
  text: string;
  headingLevel: number | null;
  isTitle: boolean;
  hasMedia: boolean;
  listKind: 'ul' | 'ol' | null;
}

interface DocxRenderContext {
  zip: JSZip;
  rels: Map<string, DocxRel>;
  styles: Map<string, StyleMeta>;
  numberingKinds: Map<string, 'ul' | 'ol'>;
  imageUrlByZipPath: Map<string, string>;
  placeholderToBlobUrl: Map<string, string>;
  createdUrls: string[];
  placeholderSeq: number;
}

async function resolveImagePlaceholder(ctx: DocxRenderContext, relId: string): Promise<string | null> {
  const rel = ctx.rels.get(relId);
  if (!rel || rel.external) return null;
  const zipPath = resolveDocxPath('word', rel.target);
  if (!RENDERABLE_IMAGE_EXT_RE.test(zipPath)) return null;

  let blobUrl = ctx.imageUrlByZipPath.get(zipPath);
  if (!blobUrl) {
    const entry = ctx.zip.file(zipPath);
    if (!entry) return null;
    const rawBlob = await entry.async('blob');
    blobUrl = URL.createObjectURL(new Blob([rawBlob], { type: guessImageMimeType(zipPath) }));
    ctx.createdUrls.push(blobUrl);
    ctx.imageUrlByZipPath.set(zipPath, blobUrl);
  }

  const token = `__docx-img__/${ctx.placeholderSeq++}`;
  ctx.placeholderToBlobUrl.set(token, blobUrl);
  return token;
}

async function renderRunElement(
  runEl: Element,
  ctx: DocxRenderContext,
): Promise<{ html: string; text: string; hasMedia: boolean }> {
  const rPr = findDirectChild(runEl, 'rPr');
  let html = '';
  let text = '';
  let hasMedia = false;

  const walkRunChild = async (child: Element): Promise<void> => {
    switch (child.localName) {
      case 't': {
        const value = child.textContent || '';
        html += escapeHtml(value);
        text += value;
        break;
      }
      case 'tab':
        html += '&emsp;';
        text += ' ';
        break;
      case 'br':
      case 'cr':
        html += '<br />';
        text += '\n';
        break;
      case 'drawing':
      case 'pict': {
        for (const relId of findImageRelIds(child)) {
          const token = await resolveImagePlaceholder(ctx, relId);
          if (token) {
            html += `<img src="${token}" alt="Minh họa" />`;
            hasMedia = true;
          }
        }
        break;
      }
      case 'AlternateContent': {
        const branch = findDirectChild(child, 'Choice') || findDirectChild(child, 'Fallback');
        if (branch) {
          for (const nested of Array.from(branch.children)) await walkRunChild(nested);
        }
        break;
      }
      default:
        break;
    }
  };

  for (const child of Array.from(runEl.children)) {
    if (child.localName !== 'rPr') await walkRunChild(child);
  }

  if (!html) return { html: '', text: '', hasMedia: false };

  if (rPr && text.trim()) {
    const vertAlign = findDirectChild(rPr, 'vertAlign');
    const alignVal = vertAlign ? getAttr(vertAlign, 'val')?.toLowerCase() : null;
    if (alignVal === 'superscript') html = `<sup>${html}</sup>`;
    else if (alignVal === 'subscript') html = `<sub>${html}</sub>`;
    if (isToggleFlagEnabled(rPr, 'strike') || isToggleFlagEnabled(rPr, 'dstrike')) {
      html = `<s>${html}</s>`;
    }
    if (isToggleFlagEnabled(rPr, 'u')) html = `<u>${html}</u>`;
    if (isToggleFlagEnabled(rPr, 'i')) html = `<em>${html}</em>`;
    if (isToggleFlagEnabled(rPr, 'b')) html = `<strong>${html}</strong>`;
  }

  return { html, text, hasMedia };
}

async function renderParagraphContent(
  pEl: Element,
  ctx: DocxRenderContext,
): Promise<{ html: string; text: string; hasMedia: boolean }> {
  let html = '';
  let text = '';
  let hasMedia = false;

  const walkNode = async (node: Element): Promise<void> => {
    switch (node.localName) {
      case 'r': {
        const rendered = await renderRunElement(node, ctx);
        html += rendered.html;
        text += rendered.text;
        if (rendered.hasMedia) hasMedia = true;
        break;
      }
      case 'hyperlink': {
        let linkHtml = '';
        let linkText = '';
        for (const child of Array.from(node.children)) {
          if (child.localName === 'r') {
            const rendered = await renderRunElement(child, ctx);
            linkHtml += rendered.html;
            linkText += rendered.text;
            if (rendered.hasMedia) hasMedia = true;
          }
        }
        const relId = getAttr(node, 'id');
        const rel = relId ? ctx.rels.get(relId) : undefined;
        const safeHref =
          rel?.external && /^(?:https?:|mailto:)/i.test(rel.target) ? escapeHtml(rel.target) : null;
        html += safeHref ? `<a href="${safeHref}">${linkHtml}</a>` : linkHtml;
        text += linkText;
        break;
      }
      case 'ins':
      case 'smartTag': {
        for (const child of Array.from(node.children)) await walkNode(child);
        break;
      }
      case 'sdt': {
        const content = findDirectChild(node, 'sdtContent');
        if (content) {
          for (const child of Array.from(content.children)) await walkNode(child);
        }
        break;
      }
      case 'AlternateContent': {
        const branch = findDirectChild(node, 'Choice') || findDirectChild(node, 'Fallback');
        if (branch) {
          for (const child of Array.from(branch.children)) await walkNode(child);
        }
        break;
      }
      default:
        break;
    }
  };

  for (const child of Array.from(pEl.children)) {
    if (child.localName !== 'pPr') await walkNode(child);
  }
  return { html, text: text.replace(/\s+/g, ' ').trim(), hasMedia };
}

async function renderParagraphBlock(pEl: Element, ctx: DocxRenderContext): Promise<DocxBlock | null> {
  const { html, text, hasMedia } = await renderParagraphContent(pEl, ctx);
  if (!text && !hasMedia) return null;

  const pPr = findDirectChild(pEl, 'pPr');
  const pStyleEl = pPr ? findDirectChild(pPr, 'pStyle') : null;
  const styleId = pStyleEl ? getAttr(pStyleEl, 'val') : null;
  const outlineEl = pPr ? findDirectChild(pPr, 'outlineLvl') : null;
  const rawOutline = outlineEl ? Number(getAttr(outlineEl, 'val')) : NaN;

  const resolvedStyle = resolveHeadingFromStyle(styleId, ctx.styles);
  let headingLevel = resolvedStyle.headingLevel;
  const { isTitle } = resolvedStyle;
  if (headingLevel === null && Number.isInteger(rawOutline) && rawOutline >= 0 && rawOutline <= 5) {
    headingLevel = rawOutline + 1;
  }

  const numPr = pPr ? findDirectChild(pPr, 'numPr') : null;
  let listKind: 'ul' | 'ol' | null = null;
  if (numPr && headingLevel === null) {
    const numIdEl = findDirectChild(numPr, 'numId');
    const numId = numIdEl ? getAttr(numIdEl, 'val') : null;
    if (numId && numId !== '0') listKind = ctx.numberingKinds.get(numId) ?? 'ul';
  }

  if (headingLevel !== null) {
    const tag = `h${Math.min(4, Math.max(1, headingLevel))}`;
    return { html: `<${tag}>${html}</${tag}>`, text, headingLevel, isTitle, hasMedia, listKind: null };
  }
  if (listKind) {
    return { html: `<li>${html}</li>`, text, headingLevel: null, isTitle: false, hasMedia, listKind };
  }
  return { html: `<p>${html}</p>`, text, headingLevel: null, isTitle, hasMedia, listKind: null };
}

async function renderTableBlock(tblEl: Element, ctx: DocxRenderContext): Promise<DocxBlock | null> {
  const rowHtmls: string[] = [];
  const textParts: string[] = [];
  let hasMedia = false;

  for (const tr of Array.from(tblEl.children)) {
    if (tr.localName !== 'tr') continue;
    const cellHtmls: string[] = [];
    for (const tc of Array.from(tr.children)) {
      if (tc.localName !== 'tc') continue;
      const cellParts: string[] = [];
      for (const child of Array.from(tc.children)) {
        if (child.localName === 'p') {
          const rendered = await renderParagraphContent(child, ctx);
          if (rendered.html) cellParts.push(rendered.html);
          if (rendered.text) textParts.push(rendered.text);
          if (rendered.hasMedia) hasMedia = true;
        }
      }
      cellHtmls.push(`<td>${cellParts.join('<br />')}</td>`);
    }
    if (cellHtmls.length > 0) rowHtmls.push(`<tr>${cellHtmls.join('')}</tr>`);
  }

  const text = textParts.join(' ').trim();
  if (rowHtmls.length === 0 || (!text && !hasMedia)) return null;
  return {
    html: `<table><tbody>${rowHtmls.join('')}</tbody></table>`,
    text,
    headingLevel: null,
    isTitle: false,
    hasMedia,
    listKind: null,
  };
}

function assembleBlocksHtml(blocks: DocxBlock[]): string {
  const parts: string[] = [];
  let openList: 'ul' | 'ol' | null = null;
  for (const block of blocks) {
    if (block.listKind !== openList) {
      if (openList) parts.push(`</${openList}>`);
      if (block.listKind) parts.push(`<${block.listKind}>`);
      openList = block.listKind;
    }
    parts.push(block.html);
  }
  if (openList) parts.push(`</${openList}>`);
  return parts.join('');
}

function sanitizeAndRestoreImages(rawHtml: string, placeholderToBlobUrl: Map<string, string>): string {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  // Must sanitize BEFORE replacing placeholder src with blob: URLs (DOMPurify strips blob: by default)
  sanitizeBookDocument(doc);
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src]'))) {
    const src = img.getAttribute('src') || '';
    const blobUrl = placeholderToBlobUrl.get(src);
    if (blobUrl) {
      img.src = blobUrl;
      img.loading = 'lazy';
    } else {
      img.remove();
    }
  }
  return doc.body?.innerHTML?.trim() || '';
}

function buildDocxChapters(
  blocks: DocxBlock[],
  book: Book,
  placeholderToBlobUrl: Map<string, string>,
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
    const contentHtml = sanitizeAndRestoreImages(rawHtml, placeholderToBlobUrl);
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

export async function extractDocxCover(zip: JSZip): Promise<Blob | null> {
  const thumbEntry = Object.values(zip.files).find(
    (entry) =>
      !entry.dir &&
      /^docProps\/thumbnail\.[^.]+$/i.test(entry.name) &&
      RASTER_IMAGE_EXT_RE.test(entry.name),
  );
  if (thumbEntry) return compressCoverBlob(await thumbEntry.async('blob'));

  const mediaEntry = Object.values(zip.files)
    .filter(
      (entry) =>
        !entry.dir && /^word\/media\//i.test(entry.name) && RASTER_IMAGE_EXT_RE.test(entry.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))[0];
  if (!mediaEntry) return null;
  return compressCoverBlob(await mediaEntry.async('blob'));
}

export async function parseDocxZip(zip: JSZip, book: Book): Promise<ParsedBook> {
  const createdUrls: string[] = [];
  const dispose = () => {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    createdUrls.length = 0;
  };

  try {
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) throw new Error('Tệp DOCX không hợp lệ hoặc bị thiếu word/document.xml.');

    const [rels, styles, numberingKinds] = await Promise.all([
      parseRelationships(zip, 'word/_rels/document.xml.rels'),
      parseStyles(zip),
      parseNumberingKinds(zip),
    ]);

    const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
    const bodyEl = Array.from(doc.getElementsByTagName('*')).find((el) => el.localName === 'body');
    if (!bodyEl) throw new Error('Tệp DOCX không có nội dung văn bản.');

    const ctx: DocxRenderContext = {
      zip,
      rels,
      styles,
      numberingKinds,
      imageUrlByZipPath: new Map(),
      placeholderToBlobUrl: new Map(),
      createdUrls,
      placeholderSeq: 0,
    };

    const blocks: DocxBlock[] = [];
    const walkBodyChildren = async (container: Element): Promise<void> => {
      for (const child of Array.from(container.children)) {
        if (child.localName === 'p') {
          const block = await renderParagraphBlock(child, ctx);
          if (block) blocks.push(block);
        } else if (child.localName === 'tbl') {
          const block = await renderTableBlock(child, ctx);
          if (block) blocks.push(block);
        } else if (child.localName === 'sdt') {
          const content = findDirectChild(child, 'sdtContent');
          if (content) await walkBodyChildren(content);
        }
      }
    };

    await walkBodyChildren(bodyEl);
    if (blocks.length === 0) throw new Error('DOCX không có nội dung để đọc.');

    const chapters = buildDocxChapters(blocks, book, ctx.placeholderToBlobUrl);
    if (chapters.length === 0) throw new Error('DOCX không có nội dung để đọc.');

    return { chapters, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}
