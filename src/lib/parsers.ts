import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { initMobiFile } from '@lingo-reader/mobi-parser';
import type { Book, BookFileType, Chapter, ParsedBook } from '@/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export const pdfWasmUrl = `${import.meta.env.BASE_URL}pdfjs-wasm/`;

const ARCANE_COVER_PALETTE = [
  '#4338ca', // Indigo
  '#6d28d9', // Arcane Violet
  '#0f766e', // Emerald Teal
  '#b45309', // Amber Gold
  '#9f1239', // Crimson Rose
  '#1d4ed8', // Sapphire Blue
  '#7e22ce', // Royal Purple
  '#15803d', // Forest Jade
  '#c2410c', // Ember Copper
  '#3730a3', // Deep Astral
];

export function pickCoverColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ARCANE_COVER_PALETTE[hash % ARCANE_COVER_PALETTE.length];
}

const VOLUME_SEGMENT_RE =
  /^(?:(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|ch|c|v|#)\.?\s*)?\d+(?:\s*[-–]\s*\d+)?$/i;

export function inferShelfName(title: string, author: string): string {
  const stripped = title
    .replace(/\s*[-_:|]\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|#)?\.?\s*\d+.*$/i, '')
    .replace(/\s*(?:\(|\[)?\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|#)\.?\s*\d+.*$/i, '')
    .trim();
  if (stripped && stripped !== 'Sách chưa đặt tên') return stripped;
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle !== 'Sách chưa đặt tên') return cleanTitle;
  if (author.trim() && author !== 'Không rõ tác giả') return author.trim();
  return 'Kho chưa phân loại';
}

export function parseFileMetadata(fileName: string): {
  title: string;
  author: string;
  shelf: string;
  extension: BookFileType | null;
} {
  const extMatch = fileName.match(/\.(epub|mobi|pdf|cbz)$/i);
  const extension = extMatch ? (extMatch[1].toLowerCase() as BookFileType) : null;
  const baseLabel = fileName.replace(/\.(epub|mobi|pdf|cbz)$/i, '').trim() || 'Sách chưa đặt tên';
  const segments = baseLabel.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const titleParts = segments.length > 0 ? [segments[0]] : [baseLabel];
  let authorIndex = 1;
  while (authorIndex < segments.length && VOLUME_SEGMENT_RE.test(segments[authorIndex])) {
    titleParts.push(segments[authorIndex]);
    authorIndex += 1;
  }
  const title = titleParts.join(' - ').trim() || baseLabel;
  const author = segments.slice(authorIndex).join(' - ').trim() || 'Không rõ tác giả';
  const shelf = inferShelfName(title, author);
  return { title, author, shelf, extension };
}

export function bookDuplicateKey(title: string, author: string): string {
  return `${title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')}::${author
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi')}`;
}

function resolveZipPath(basePath: string, relativePath: string): string {
  const parts = `${basePath}/${relativePath}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function compressCoverBlob(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const targetWidth = 480;
    const targetHeight = 720;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo canvas xử lý ảnh bìa.');

    const srcRatio = bitmap.width / bitmap.height;
    const dstRatio = targetWidth / targetHeight;
    const srcW = srcRatio > dstRatio ? bitmap.height * dstRatio : bitmap.width;
    const srcH = srcRatio > dstRatio ? bitmap.height : bitmap.width / dstRatio;
    const srcX = (bitmap.width - srcW) / 2;
    const srcY = (bitmap.height - srcH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('Không thể nén ảnh bìa.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Extracts and compresses a lightweight (~35-60KB) JPEG cover ONCE at upload time,
 * so the library view never has to download full book files just to show thumbnails.
 */
export async function extractCoverAtUpload(file: File, fileType: BookFileType): Promise<Blob | null> {
  try {
    if (fileType === 'epub') {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const containerXml = await zip.file('META-INF/container.xml')?.async('string');
      if (!containerXml) return null;
      const container = new DOMParser().parseFromString(containerXml, 'application/xml');
      const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
      if (!rootFile) return null;
      const packageXml = await zip.file(rootFile)?.async('string');
      if (!packageXml) return null;

      const pkg = new DOMParser().parseFromString(packageXml, 'application/xml');
      const pkgDir = rootFile.includes('/') ? rootFile.slice(0, rootFile.lastIndexOf('/')) : '';

      const coverMetaId = pkg.querySelector('metadata meta[name="cover"]')?.getAttribute('content');
      const candidates: string[] = [];
      pkg.querySelectorAll('manifest item').forEach((item) => {
        const id = item.getAttribute('id') || '';
        const props = item.getAttribute('properties') || '';
        const mediaType = item.getAttribute('media-type') || '';
        const href = item.getAttribute('href');
        if (!href || !mediaType.startsWith('image/')) return;
        if (props.split(/\s+/).includes('cover-image') || (coverMetaId && id === coverMetaId)) {
          candidates.unshift(href);
        } else if (/cover/i.test(id) || /cover/i.test(href)) {
          candidates.splice(Math.min(1, candidates.length), 0, href);
        } else {
          candidates.push(href);
        }
      });

      for (const href of candidates) {
        const imagePath = resolveZipPath(pkgDir, safeDecodeUri(href.split('#')[0]));
        const entry = zip.file(imagePath);
        if (entry) {
          return await compressCoverBlob(await entry.async('blob'));
        }
      }
      return null;
    }

    if (fileType === 'cbz') {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const firstImage = Object.values(zip.files)
        .filter((entry) => !entry.dir && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))[0];
      if (!firstImage) return null;
      return await compressCoverBlob(await firstImage.async('blob'));
    }

    if (fileType === 'mobi') {
      const mobi = await initMobiFile(new Uint8Array(await file.arrayBuffer()));
      try {
        const coverDataUrl = mobi.getCoverImage();
        if (!coverDataUrl) return null;
        const response = await fetch(coverDataUrl);
        return await compressCoverBlob(await response.blob());
      } finally {
        mobi.destroy();
      }
    }

    if (fileType === 'pdf') {
      const data = new Uint8Array(await file.arrayBuffer());
      const loadingTask = pdfjsLib.getDocument({ data, wasmUrl: pdfWasmUrl });
      try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.7 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const rawBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.85),
        );
        return rawBlob ? await compressCoverBlob(rawBlob) : null;
      } finally {
        await loadingTask.destroy();
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getFilenameChapterTitle(path: string): string | null {
  const filename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
  const normalized = filename.replace(/[\s_-]+/g, '').toLowerCase();
  const chapterMatch = filename.match(/^(?:chuong|ch|c)[-_ ]?(\d+)\b/i);
  if (chapterMatch) return `Chương ${Number(chapterMatch[1])}`;
  const sideStoryMatch = normalized.match(/^(?:nt|ngoaitruyen|extrachapter|sidestory)(\d*)$/i);
  if (sideStoryMatch) {
    return sideStoryMatch[1] ? `Ngoại truyện ${Number(sideStoryMatch[1])}` : 'Ngoại truyện';
  }
  if (/^(?:modau|opening|prologue|loinoidau)$/i.test(normalized)) return 'Mở đầu';
  if (/^(?:ketthuc|epilogue|loiket)$/i.test(normalized)) return 'Lời kết';
  if (/^(?:phuluc|appendix)(\d*)$/i.test(normalized)) return 'Phụ lục';
  return null;
}

async function parseEpubBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  const createdUrls: string[] = [];
  const dispose = () => {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    createdUrls.length = 0;
  };

  try {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('EPUB không có tệp container.');

    const container = new DOMParser().parseFromString(containerXml, 'application/xml');
    const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
    if (!rootFile) throw new Error('EPUB không có tệp package.');

    const packageXml = await zip.file(rootFile)?.async('string');
    if (!packageXml) throw new Error('EPUB bị thiếu tệp package.');

    const pkgDoc = new DOMParser().parseFromString(packageXml, 'application/xml');
    const pkgDir = rootFile.includes('/') ? rootFile.slice(0, rootFile.lastIndexOf('/')) : '';

    const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
    const manifestByPath = new Map<string, { mediaType: string }>();

    pkgDoc.querySelectorAll('manifest item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (id && href && mediaType) {
        const entry = { href, mediaType, properties: item.getAttribute('properties') || '' };
        manifest.set(id, entry);
        manifestByPath.set(resolveZipPath(pkgDir, safeDecodeUri(href.split('#')[0])), { mediaType });
      }
    });

    // Extract TOC labels from EPUB3 nav or EPUB2 toc.ncx so chapter names are accurate
    const tocTitlesByPath = new Map<string, string>();
    const navItem = Array.from(manifest.values()).find((item) =>
      item.properties.split(/\s+/).includes('nav'),
    );
    if (navItem) {
      const navPath = resolveZipPath(pkgDir, safeDecodeUri(navItem.href.split('#')[0]));
      const navXml = await zip.file(navPath)?.async('string');
      if (navXml) {
        const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')) : '';
        const navDoc = new DOMParser().parseFromString(navXml, 'text/html');
        navDoc.querySelectorAll('nav a[href]').forEach((link) => {
          const href = link.getAttribute('href') || '';
          const label = link.textContent?.replace(/\s+/g, ' ').trim();
          if (href && label) {
            const targetPath = resolveZipPath(navDir, safeDecodeUri(href.split('#')[0]));
            if (!tocTitlesByPath.has(targetPath)) tocTitlesByPath.set(targetPath, label);
          }
        });
      }
    }
    if (tocTitlesByPath.size === 0) {
      const ncxItem = Array.from(manifest.values()).find(
        (item) => item.mediaType === 'application/x-dtbncx+xml' || item.href.endsWith('.ncx'),
      );
      if (ncxItem) {
        const ncxPath = resolveZipPath(pkgDir, safeDecodeUri(ncxItem.href.split('#')[0]));
        const ncxXml = await zip.file(ncxPath)?.async('string');
        if (ncxXml) {
          const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')) : '';
          const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
          ncxDoc.querySelectorAll('navPoint').forEach((point) => {
            const label = point.querySelector('navLabel text')?.textContent?.replace(/\s+/g, ' ').trim();
            const src = point.querySelector('content')?.getAttribute('src') || '';
            if (label && src) {
              const targetPath = resolveZipPath(ncxDir, safeDecodeUri(src.split('#')[0]));
              if (!tocTitlesByPath.has(targetPath)) tocTitlesByPath.set(targetPath, label);
            }
          });
        }
      }
    }

    const spineItems = Array.from(pkgDoc.querySelectorAll('spine itemref'))
      .map((itemRef) => {
        const item = manifest.get(itemRef.getAttribute('idref') || '');
        if (!item) return null;
        if (!item.mediaType.includes('html') && !item.mediaType.includes('xml')) return null;
        return {
          item,
          path: resolveZipPath(pkgDir, safeDecodeUri(item.href.split('#')[0])),
        };
      })
      .filter((entry): entry is { item: { href: string; mediaType: string; properties: string }; path: string } =>
        Boolean(entry),
      );

    // Cache blob URLs by zip path so repeated images reuse the exact same URL instead of disappearing
    const imageUrlByZipPath = new Map<string, string>();

    async function getZipImageUrl(docPath: string, rawSrc: string): Promise<string | null> {
      const cleanSrc = safeDecodeUri(rawSrc.split('#')[0].split('?')[0]);
      const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
      const candidates = [
        resolveZipPath(docDir, cleanSrc),
        `${docDir}/${cleanSrc}`.replace(/^\/+/, ''),
        cleanSrc.replace(/^(\.\.\/)+/, ''),
      ];
      const matchedPath = candidates.find((candidate) => Boolean(zip.file(candidate)));
      if (!matchedPath) return null;

      const existingUrl = imageUrlByZipPath.get(matchedPath);
      if (existingUrl) return existingUrl;

      const zipFile = zip.file(matchedPath);
      if (!zipFile) return null;
      const imgBlob = await zipFile.async('blob');
      const mediaType = manifestByPath.get(matchedPath)?.mediaType || imgBlob.type || 'image/jpeg';
      const url = URL.createObjectURL(new Blob([imgBlob], { type: mediaType }));
      createdUrls.push(url);
      imageUrlByZipPath.set(matchedPath, url);
      return url;
    }

    const chapters: Chapter[] = [];

    for (const { path } of spineItems) {
      const source = await zip.file(path)?.async('string');
      if (!source) continue;

      const doc = new DOMParser().parseFromString(source, 'text/html');
      doc.querySelectorAll('script, style, iframe, object, embed, link[rel="stylesheet"]').forEach((el) => el.remove());
      doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.toLowerCase().startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        }
      });

      for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src]'))) {
        const src = img.getAttribute('src');
        if (!src) continue;
        img.removeAttribute('width');
        img.removeAttribute('height');
        img.style.removeProperty('width');
        img.style.removeProperty('height');
        if (src.startsWith('data:')) continue;
        const resolvedUrl = await getZipImageUrl(path, src);
        if (resolvedUrl) {
          img.src = resolvedUrl;
          img.loading = 'lazy';
        } else {
          img.remove();
        }
      }

      for (const svgImg of Array.from(doc.querySelectorAll<SVGImageElement>('svg image'))) {
        const src = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href');
        if (!src || src.startsWith('data:')) continue;
        const resolvedUrl = await getZipImageUrl(path, src);
        if (resolvedUrl) {
          svgImg.setAttribute('href', resolvedUrl);
          svgImg.removeAttribute('xlink:href');
        } else {
          svgImg.remove();
        }
      }

      const bodyHtml = doc.body?.innerHTML?.trim() || '';
      const plainText = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const hasMedia = doc.querySelectorAll('img, svg image').length > 0;
      if (!plainText && !hasMedia) continue;

      const headingText = doc.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim();
      const title =
        tocTitlesByPath.get(path) ||
        getFilenameChapterTitle(path) ||
        (headingText && headingText.length <= 90 ? headingText : null) ||
        (hasMedia && !plainText ? `Minh họa ${chapters.length + 1}` : `Chương ${chapters.length + 1}`);

      chapters.push({
        id: `${book.id}-epub-${chapters.length}`,
        book_id: book.id,
        title,
        content: plainText,
        content_html: `<section class="epub-file">${bodyHtml}</section>`,
        chapter_number: chapters.length + 1,
      });
    }

    if (chapters.length === 0) throw new Error('EPUB không có nội dung để đọc.');
    return { chapters, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

async function parsePdfBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  const pdfBlobUrl = URL.createObjectURL(blob);
  const dispose = () => URL.revokeObjectURL(pdfBlobUrl);

  const loadingTask = pdfjsLib.getDocument({ url: pdfBlobUrl, wasmUrl: pdfWasmUrl });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages === 0) throw new Error('PDF này không có trang để hiển thị.');

    const chapters: Chapter[] = Array.from({ length: pdf.numPages }, (_, index) => ({
      id: `${book.id}-pdf-${index + 1}`,
      book_id: book.id,
      title: `Trang ${index + 1}`,
      content: '',
      chapter_number: index + 1,
      pdf_page_number: index + 1,
    }));

    return { chapters, pdfBlobUrl, dispose };
  } catch (err) {
    dispose();
    throw err;
  } finally {
    await loadingTask.destroy();
  }
}

async function parseCbzBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  const createdUrls: string[] = [];
  const dispose = () => {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    createdUrls.length = 0;
  };

  try {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const imageFiles = Object.values(zip.files)
      .filter((file) => !file.dir && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageFiles.length === 0) throw new Error('CBZ không có ảnh để hiển thị.');

    // Group into comfortable chapters of 25 pages so large manga volumes stay super smooth
    const PAGES_PER_PART = 25;
    const partCount = Math.ceil(imageFiles.length / PAGES_PER_PART);
    const chapters: Chapter[] = [];

    for (let part = 0; part < partCount; part += 1) {
      const slice = imageFiles.slice(part * PAGES_PER_PART, (part + 1) * PAGES_PER_PART);
      const htmlParts: string[] = [];
      for (let i = 0; i < slice.length; i += 1) {
        const imgBlob = await slice[i].async('blob');
        const url = URL.createObjectURL(imgBlob);
        createdUrls.push(url);
        const pageNum = part * PAGES_PER_PART + i + 1;
        htmlParts.push(`<img src="${url}" alt="Trang ${pageNum}" loading="lazy" />`);
      }
      const startPage = part * PAGES_PER_PART + 1;
      const endPage = part * PAGES_PER_PART + slice.length;
      chapters.push({
        id: `${book.id}-cbz-${part}`,
        book_id: book.id,
        title: partCount === 1 ? book.title : `Trang ${startPage} – ${endPage}`,
        content: '',
        content_html: htmlParts.join(''),
        chapter_number: part + 1,
      });
    }

    return { chapters, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

async function parseMobiBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  const mobi = await initMobiFile(new Uint8Array(await blob.arrayBuffer()));
  try {
    const toc = mobi.getToc();
    const titlesByHref = new Map(toc.map((item) => [item.href, item.label]));
    const chapters: Chapter[] = [];

    for (const [index, spineItem] of mobi.getSpine().entries()) {
      const loaded = mobi.loadChapter(spineItem.id);
      if (!loaded?.html.trim()) continue;
      const cleanedHtml = loaded.html
        .replace(/^\s*(?:<\?xml\s*)?version\s*=\s*["'][^"']+["']\s+encoding\s*=\s*["'][^"']+["']\s*\?>/i, '')
        .replace(/^\s*<\?xml[^>]*\?>/i, '')
        .replace(/^\s*<!doctype[^>]*>/i, '');
      const doc = new DOMParser().parseFromString(cleanedHtml, 'text/html');
      doc.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove());
      doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
        }
      });

      const contentHtml = doc.body.innerHTML.trim();
      const plainText = doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!plainText && !doc.querySelector('img')) continue;

      chapters.push({
        id: `${book.id}-mobi-${index}`,
        book_id: book.id,
        title: titlesByHref.get(spineItem.id) || `Chương ${chapters.length + 1}`,
        content: plainText,
        content_html: contentHtml,
        chapter_number: chapters.length + 1,
      });
    }

    if (chapters.length === 0) throw new Error('MOBI không có nội dung để hiển thị.');
    return { chapters, dispose: () => {} };
  } finally {
    mobi.destroy();
  }
}

export async function parseBookBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  switch (book.file_type) {
    case 'epub':
      return parseEpubBlob(blob, book);
    case 'pdf':
      return parsePdfBlob(blob, book);
    case 'cbz':
      return parseCbzBlob(blob, book);
    case 'mobi':
      return parseMobiBlob(blob, book);
    default:
      throw new Error('Định dạng sách chưa được hỗ trợ.');
  }
}
