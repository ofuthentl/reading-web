import type JSZip from 'jszip';
import type { Book, ParsedBook } from '@/types';
import { compressCoverBlob } from '@/lib/coverImage';
import { type DocxBlock, buildDocxChapters } from '@/lib/docxChapters';
import {
  type DocxRel,
  type StyleMeta,
  RENDERABLE_IMAGE_EXT_RE,
  collectDocxCoverCandidates,
  escapeHtml,
  findDirectChild,
  findImageRelIds,
  getAttr,
  guessImageMimeType,
  isToggleFlagEnabled,
  parseDocxNotes,
  parseNumberingKinds,
  parseRelationships,
  parseStyles,
  resolveDocxPath,
  resolveHeadingFromStyle,
} from '@/lib/docxXml';
import { sanitizeSvgBlob } from '@/lib/sanitizeHtml';
import {
  LAZY_MEDIA_PLACEHOLDER_SRC,
  createLazyZipMediaController,
  resolveInitialChapterIndex,
} from '@/lib/zipMediaCache';

export interface ParseDocxOptions {
  skipMediaBlobs?: boolean;
  lazyMedia?: boolean;
  initialChapterId?: string;
  initialChapterIndex?: number;
}

interface DocxRenderContext {
  zip: JSZip;
  zipLowerLookup: Map<string, string>;
  rels: Map<string, DocxRel>;
  styles: Map<string, StyleMeta>;
  numberingKinds: Map<string, 'ul' | 'ol'>;
  footnotes: Map<string, string>;
  endnotes: Map<string, string>;
  imageCacheByKey: Map<string, { blobUrl: string; zipPath: string }>;
  placeholderToImage: Map<string, { blobUrl: string; zipPath: string }>;
  createdUrls: string[];
  placeholderSeq: number;
  skipMediaBlobs: boolean;
  lazyMedia: boolean;
}

async function resolveImagePlaceholder(ctx: DocxRenderContext, relId: string): Promise<string | null> {
  const rel = ctx.rels.get(relId);
  if (!rel || rel.external) return null;
  const zipPath = resolveDocxPath('word', rel.target);
  if (!RENDERABLE_IMAGE_EXT_RE.test(zipPath)) return null;

  const cacheKey = zipPath.toLowerCase();
  let cached = ctx.imageCacheByKey.get(cacheKey);
  if (!cached) {
    let resolvedZipPath = zipPath;
    let entry = ctx.zip.file(zipPath);
    if (!entry) {
      const ciKey = ctx.zipLowerLookup.get(cacheKey);
      if (ciKey) {
        entry = ctx.zip.file(ciKey);
        resolvedZipPath = ciKey;
      }
    }
    if (!entry) return null;
    let blobUrl: string;
    if (ctx.skipMediaBlobs) {
      blobUrl = 'data:,';
    } else if (ctx.lazyMedia) {
      blobUrl = LAZY_MEDIA_PLACEHOLDER_SRC;
    } else {
      const rawBlob = await entry.async('blob');
      const mime = guessImageMimeType(resolvedZipPath);
      const safeBlob =
        mime === 'image/svg+xml' ? await sanitizeSvgBlob(rawBlob) : new Blob([rawBlob], { type: mime });
      blobUrl = URL.createObjectURL(safeBlob);
      ctx.createdUrls.push(blobUrl);
    }
    cached = { blobUrl, zipPath: resolvedZipPath };
    ctx.imageCacheByKey.set(cacheKey, cached);
  }

  const token = `__docx-img__/${ctx.placeholderSeq++}`;
  ctx.placeholderToImage.set(token, cached);
  return token;
}

async function renderRunElement(
  runEl: Element,
  ctx: DocxRenderContext,
  noteRefs: Array<{ key: string; label: string; text: string }>,
): Promise<{ html: string; text: string; hasMedia: boolean }> {
  const rPr = findDirectChild(runEl, 'rPr');
  let html = '';
  let text = '';
  let hasMedia = false;

  const walkRunChild = async (child: Element): Promise<void> => {
    switch (child.localName) {
      case 't': {
        const value = (child.textContent || '').normalize('NFC');
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
      case 'footnoteReference':
      case 'endnoteReference': {
        const id = getAttr(child, 'id');
        const isEnd = child.localName === 'endnoteReference';
        const noteText = id ? (isEnd ? ctx.endnotes.get(id) : ctx.footnotes.get(id)) : undefined;
        if (id && noteText) {
          const key = `docx-${isEnd ? 'en' : 'fn'}-${id}`;
          noteRefs.push({ key, label: `[${id}]`, text: noteText });
          html += `<sup><a href="#${escapeHtml(key)}" role="doc-noteref">[${escapeHtml(id)}]</a></sup>`;
          text += `[${id}]`;
        }
        break;
      }
      case 'drawing':
      case 'pict': {
        for (const relId of findImageRelIds(child)) {
          const token = await resolveImagePlaceholder(ctx, relId);
          if (token) {
            html += `<img src="${token}" alt="Minh họa" />`;
            hasMedia = true;
          }
        }
        for (const txbx of Array.from(child.getElementsByTagName('*'))) {
          if (txbx.localName !== 'txbxContent') continue;
          for (const p of Array.from(txbx.children)) {
            if (p.localName !== 'p') continue;
            const inner = await renderParagraphContent(p, ctx, noteRefs);
            if (inner.html) {
              html += `<br />${inner.html}`;
              text += inner.text ? ` ${inner.text}` : '';
              if (inner.hasMedia) hasMedia = true;
            }
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
  noteRefs: Array<{ key: string; label: string; text: string }> = [],
): Promise<{ html: string; text: string; hasMedia: boolean }> {
  let html = '';
  let text = '';
  let hasMedia = false;

  const walkNode = async (node: Element): Promise<void> => {
    switch (node.localName) {
      case 'r': {
        const rendered = await renderRunElement(node, ctx, noteRefs);
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
            const rendered = await renderRunElement(child, ctx, noteRefs);
            linkHtml += rendered.html;
            linkText += rendered.text;
            if (rendered.hasMedia) hasMedia = true;
          }
        }
        const relId = getAttr(node, 'id');
        const rel = relId ? ctx.rels.get(relId) : undefined;
        const safeHref =
          rel?.external && /^(?:https?:|mailto:)/i.test(rel.target) ? escapeHtml(rel.target) : null;
        html += safeHref
          ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${linkHtml}</a>`
          : linkHtml;
        text += linkText;
        break;
      }
      case 'ruby': {
        const rubyBase = findDirectChild(node, 'rubyBase');
        const rtNode = findDirectChild(node, 'rt');
        let baseHtml = '';
        let baseText = '';
        let rtText = '';
        if (rubyBase) {
          for (const child of Array.from(rubyBase.children)) {
            if (child.localName === 'r') {
              const rendered = await renderRunElement(child, ctx, noteRefs);
              baseHtml += rendered.html;
              baseText += rendered.text;
              if (rendered.hasMedia) hasMedia = true;
            }
          }
        }
        if (rtNode) {
          rtText = (rtNode.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (baseHtml) {
          html += rtText
            ? `<ruby>${baseHtml}<rp>(</rp><rt>${escapeHtml(rtText)}</rt><rp>)</rp></ruby>`
            : baseHtml;
          text += baseText;
        }
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
  const noteRefs: Array<{ key: string; label: string; text: string }> = [];
  const { html, text, hasMedia } = await renderParagraphContent(pEl, ctx, noteRefs);
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

  const notesProp = noteRefs.length > 0 ? { noteRefs } : {};
  if (headingLevel !== null) {
    const tag = `h${Math.min(4, Math.max(1, headingLevel))}`;
    return { html: `<${tag}>${html}</${tag}>`, text, headingLevel, isTitle, hasMedia, listKind: null, ...notesProp };
  }
  if (listKind) {
    return { html: `<li>${html}</li>`, text, headingLevel: null, isTitle: false, hasMedia, listKind, ...notesProp };
  }
  return { html: `<p>${html}</p>`, text, headingLevel: null, isTitle, hasMedia, listKind: null, ...notesProp };
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
      const tcPr = findDirectChild(tc, 'tcPr');
      const gridSpanEl = tcPr ? findDirectChild(tcPr, 'gridSpan') : null;
      const colSpan = Math.max(1, Number(gridSpanEl ? getAttr(gridSpanEl, 'val') : 1) || 1);
      const cellParts: string[] = [];
      for (const child of Array.from(tc.children)) {
        if (child.localName === 'p') {
          const rendered = await renderParagraphContent(child, ctx);
          if (rendered.html) cellParts.push(rendered.html);
          if (rendered.text) textParts.push(rendered.text);
          if (rendered.hasMedia) hasMedia = true;
        } else if (child.localName === 'tbl') {
          const nested = await renderTableBlock(child, ctx);
          if (nested) {
            cellParts.push(nested.html);
            if (nested.text) textParts.push(nested.text);
            if (nested.hasMedia) hasMedia = true;
          }
        }
      }
      const spanAttr = colSpan > 1 ? ` colspan="${colSpan}"` : '';
      cellHtmls.push(`<td${spanAttr}>${cellParts.join('<br />')}</td>`);
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

export async function extractDocxCover(zip: JSZip): Promise<Blob | null> {
  const candidates = await collectDocxCoverCandidates(zip);
  for (const zipPath of candidates) {
    const entry = zip.file(zipPath);
    if (!entry) continue;
    try {
      const raw = await entry.async('blob');
      const typedBlob = new Blob([raw], { type: guessImageMimeType(zipPath) });
      return await compressCoverBlob(typedBlob, { rejectBlankOrTiny: true });
    } catch {
      // Skip blank thumbnails, tiny dividers, or undecodable images and try next candidate
    }
  }
  return null;
}

export async function parseDocxZip(
  zip: JSZip,
  book: Book,
  options?: ParseDocxOptions,
): Promise<ParsedBook> {
  const createdUrls: string[] = [];
  const disposeEager = () => {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    createdUrls.length = 0;
  };
  const useLazyMedia = Boolean(options?.lazyMedia && !options?.skipMediaBlobs);

  try {
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) throw new Error('Tệp DOCX không hợp lệ hoặc bị thiếu word/document.xml.');

    const [rels, styles, numberingKinds, footnotes, endnotes] = await Promise.all([
      parseRelationships(zip, 'word/_rels/document.xml.rels'),
      parseStyles(zip),
      parseNumberingKinds(zip),
      parseDocxNotes(zip, 'word/footnotes.xml', 'footnote'),
      parseDocxNotes(zip, 'word/endnotes.xml', 'endnote'),
    ]);

    const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
    const bodyEl = Array.from(doc.getElementsByTagName('*')).find((el) => el.localName === 'body');
    if (!bodyEl) throw new Error('Tệp DOCX không có nội dung văn bản.');

    const zipLowerLookup = new Map<string, string>();
    for (const name of Object.keys(zip.files)) {
      const lower = name.toLowerCase();
      if (!zipLowerLookup.has(lower)) zipLowerLookup.set(lower, name);
    }

    const ctx: DocxRenderContext = {
      zip,
      zipLowerLookup,
      rels,
      styles,
      numberingKinds,
      footnotes,
      endnotes,
      imageCacheByKey: new Map(),
      placeholderToImage: new Map(),
      createdUrls,
      placeholderSeq: 0,
      skipMediaBlobs: Boolean(options?.skipMediaBlobs),
      lazyMedia: useLazyMedia,
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

    const chapters = buildDocxChapters(blocks, book, ctx.placeholderToImage);
    if (chapters.length === 0) throw new Error('DOCX không có nội dung để đọc.');

    if (useLazyMedia) {
      const mediaCtrl = createLazyZipMediaController(zip);
      try {
        const initialIdx = resolveInitialChapterIndex(
          chapters,
          options?.initialChapterId,
          options?.initialChapterIndex,
        );
        await mediaCtrl.ensureChapterMedia(chapters, initialIdx);
        return {
          chapters,
          ensureChapterMedia: (idx, opts) => mediaCtrl.ensureChapterMedia(chapters, idx, opts),
          resolveMediaUrl: mediaCtrl.resolveMediaUrl,
          dispose: mediaCtrl.dispose,
        };
      } catch (err) {
        mediaCtrl.dispose();
        throw err;
      }
    }

    return { chapters, dispose: disposeEager };
  } catch (err) {
    disposeEager();
    throw err;
  }
}
