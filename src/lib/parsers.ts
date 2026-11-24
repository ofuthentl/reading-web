import type JSZip from 'jszip';
import type { Book, BookFileType, ParsedBook } from '@/types';
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkReload';
import { compressCoverBlob } from '@/lib/coverImage';
import { extractDocxCover, parseDocxZip } from '@/lib/docxParser';
import { buildEpubChapters, type RawEpubSection } from '@/lib/epubChapters';
import { extractTextExcludingRubyAnnotations } from '@/lib/rubyText';
import { sanitizeBookDocument, sanitizeSvgBlob } from '@/lib/sanitizeHtml';

type JSZipStatic = typeof JSZip;

let jszipPromise: Promise<JSZipStatic> | null = null;

function loadJSZip(): Promise<JSZipStatic> {
  if (!jszipPromise) {
    const pending: Promise<JSZipStatic> = import('jszip')
      .then((mod) => (mod.default ?? (mod as unknown as JSZipStatic)))
      .catch((err: unknown) => {
        jszipPromise = null;
        recoverFromChunkError(err);
        throw err;
      });
    jszipPromise = pending;
    return pending;
  }
  return jszipPromise;
}

export async function preloadCoreReaders(): Promise<void> {
  await loadJSZip().catch(() => undefined);
}

function resolveZipPath(basePath: string, relativePath: string): string {
  const raw = relativePath.startsWith('/') ? relativePath.slice(1) : `${basePath}/${relativePath}`;
  const parts = raw.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

function parseEpubXhtmlDocument(source: string): Document {
  // Chuẩn hoá thẻ tự đóng kiểu XHTML hay làm vỡ HTML5 parser (vd `<title/>`, `<a id="fn1"/>`)
  try {
    const xmlDoc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    if (!xmlDoc.querySelector('parsererror') && xmlDoc.body) {
      const htmlDoc = document.implementation.createHTMLDocument('');
      const serialized = new XMLSerializer().serializeToString(xmlDoc.body);
      const parsed = new DOMParser().parseFromString(serialized, 'text/html');
      if (parsed.body && htmlDoc.body) {
        htmlDoc.body.innerHTML = parsed.body.innerHTML;
        return htmlDoc;
      }
    }
  } catch {
    // Fallback to HTML5 parser below
  }
  const normalized = source
    .replace(/<title\s*\/>/gi, '<title></title>')
    .replace(/<(a|span|div|p|h[1-6])\b([^>]*?)\/>/gi, '<$1$2></$1>');
  return new DOMParser().parseFromString(normalized, 'text/html');
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildCaseInsensitiveZipLookup(zip: JSZip): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    const lower = name.toLowerCase();
    if (!map.has(lower)) map.set(lower, name);
  }
  return map;
}

function resolveZipFilePath(
  zip: JSZip,
  lowerLookup: ReadonlyMap<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    if (zip.file(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    const ci = lowerLookup.get(candidate.toLowerCase());
    if (ci && zip.file(ci)) return ci;
  }
  return null;
}

/**
 * Extracts and compresses a lightweight (~35-60KB) JPEG cover ONCE at upload time,
 * so the library view never has to download full book files just to show thumbnails.
 */
export async function extractCoverAtUpload(file: File, fileType: BookFileType): Promise<Blob | null> {
  try {
    if (fileType === 'epub') {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const zipLowerLookup = buildCaseInsensitiveZipLookup(zip);
      const containerPath = resolveZipFilePath(zip, zipLowerLookup, ['META-INF/container.xml']);
      const containerXml = containerPath ? await zip.file(containerPath)?.async('string') : null;
      if (!containerXml) return null;
      const container = new DOMParser().parseFromString(containerXml, 'application/xml');
      const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
      if (!rootFile) return null;
      const resolvedRoot = resolveZipFilePath(zip, zipLowerLookup, [rootFile, safeDecodeUri(rootFile)]);
      const packageXml = resolvedRoot ? await zip.file(resolvedRoot)?.async('string') : null;
      if (!packageXml || !resolvedRoot) return null;

      const pkg = new DOMParser().parseFromString(packageXml, 'application/xml');
      const pkgDir = resolvedRoot.includes('/') ? resolvedRoot.slice(0, resolvedRoot.lastIndexOf('/')) : '';

      const coverMetaId = pkg.querySelector('metadata meta[name="cover"]')?.getAttribute('content');
      const candidates: Array<{ href: string; mediaType: string }> = [];
      pkg.querySelectorAll('manifest item').forEach((item) => {
        const id = item.getAttribute('id') || '';
        const props = item.getAttribute('properties') || '';
        const mediaType = item.getAttribute('media-type') || '';
        const href = item.getAttribute('href');
        if (!href || !mediaType.startsWith('image/')) return;
        const entry = { href, mediaType };
        if (props.split(/\s+/).includes('cover-image') || (coverMetaId && id === coverMetaId)) {
          candidates.unshift(entry);
        } else if (/cover/i.test(id) || /cover/i.test(href)) {
          candidates.splice(Math.min(1, candidates.length), 0, entry);
        } else {
          candidates.push(entry);
        }
      });

      for (const { href, mediaType } of candidates) {
        if (mediaType === 'image/svg+xml' || /\.svg$/i.test(href.split('#')[0])) continue;
        const rawHref = href.split('#')[0];
        const matched = resolveZipFilePath(zip, zipLowerLookup, [
          resolveZipPath(pkgDir, safeDecodeUri(rawHref)),
          resolveZipPath(pkgDir, rawHref),
        ]);
        const entry = matched ? zip.file(matched) : null;
        if (!entry) continue;
        try {
          const rawBlob = await entry.async('blob');
          return await compressCoverBlob(new Blob([rawBlob], { type: mediaType || rawBlob.type || 'image/jpeg' }));
        } catch {
          // Bỏ qua ứng viên bìa hỏng/không decode được để thử ứng viên tiếp theo
        }
      }
      return null;
    }

    if (fileType === 'docx') {
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      return await extractDocxCover(zip);
    }
  } catch (err) {
    if (isChunkLoadError(err)) throw err;
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

export interface ParseBookOptions {
  /** Bỏ qua giải nén nhị phân ảnh sang Blob URL khi chỉ cần đọc chữ & đường dẫn `data-zip-path` */
  skipMediaBlobs?: boolean;
  /** Truyền sẵn ArrayBuffer nếu caller đã đọc để tránh nhân đôi RAM (vá M-12) */
  arrayBuffer?: ArrayBuffer;
}

async function parseEpubBlob(
  blob: Blob,
  book: Book,
  options?: ParseBookOptions,
): Promise<ParsedBook> {
  const createdUrls: string[] = [];
  const dispose = () => {
    for (const url of createdUrls) URL.revokeObjectURL(url);
    createdUrls.length = 0;
  };

  try {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(options?.arrayBuffer ?? (await blob.arrayBuffer()));
    const zipLowerLookup = buildCaseInsensitiveZipLookup(zip);
    const containerPath = resolveZipFilePath(zip, zipLowerLookup, ['META-INF/container.xml']);
    const containerXml = containerPath ? await zip.file(containerPath)?.async('string') : null;
    if (!containerXml) throw new Error('EPUB không có tệp container.');

    const container = new DOMParser().parseFromString(containerXml, 'application/xml');
    const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
    if (!rootFile) throw new Error('EPUB không có tệp package.');

    const resolvedRoot = resolveZipFilePath(zip, zipLowerLookup, [rootFile, safeDecodeUri(rootFile)]);
    const packageXml = resolvedRoot ? await zip.file(resolvedRoot)?.async('string') : null;
    if (!packageXml || !resolvedRoot) throw new Error('EPUB bị thiếu tệp package.');

    const pkgDoc = new DOMParser().parseFromString(packageXml, 'application/xml');
    const pkgDir = resolvedRoot.includes('/') ? resolvedRoot.slice(0, resolvedRoot.lastIndexOf('/')) : '';

    const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
    const manifestByPath = new Map<string, { mediaType: string }>();

    pkgDoc.querySelectorAll('manifest item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (id && href && mediaType) {
        const entry = { href, mediaType, properties: item.getAttribute('properties') || '' };
        manifest.set(id, entry);
        const decoded = resolveZipPath(pkgDir, safeDecodeUri(href.split('#')[0]));
        manifestByPath.set(decoded.toLowerCase(), { mediaType });
      }
    });

    const tocTitlesByPath = new Map<string, string>();
    const navItem = Array.from(manifest.values()).find((item) =>
      item.properties.split(/\s+/).includes('nav'),
    );
    if (navItem) {
      const rawNavHref = navItem.href.split('#')[0];
      const navPath = resolveZipFilePath(zip, zipLowerLookup, [
        resolveZipPath(pkgDir, safeDecodeUri(rawNavHref)),
        resolveZipPath(pkgDir, rawNavHref),
      ]);
      const navXml = navPath ? await zip.file(navPath)?.async('string') : null;
      if (navXml && navPath) {
        const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')) : '';
        const navDoc = new DOMParser().parseFromString(navXml, 'text/html');
        const tocLinks = navDoc.querySelectorAll('nav[epub\\:type~="toc"] a[href], nav[role="doc-toc"] a[href]');
        const activeLinks = tocLinks.length > 0 ? tocLinks : navDoc.querySelectorAll('nav a[href]');
        activeLinks.forEach((link) => {
          const href = link.getAttribute('href') || '';
          const label = link.textContent?.replace(/\s+/g, ' ').trim().normalize('NFC');
          if (href && label) {
            const targetPath = resolveZipPath(navDir, safeDecodeUri(href.split('#')[0])).toLowerCase();
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
        const rawNcxHref = ncxItem.href.split('#')[0];
        const ncxPath = resolveZipFilePath(zip, zipLowerLookup, [
          resolveZipPath(pkgDir, safeDecodeUri(rawNcxHref)),
          resolveZipPath(pkgDir, rawNcxHref),
        ]);
        const ncxXml = ncxPath ? await zip.file(ncxPath)?.async('string') : null;
        if (ncxXml && ncxPath) {
          const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')) : '';
          const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml');
          ncxDoc.querySelectorAll('navPoint').forEach((point) => {
            const label = point
              .querySelector('navLabel text')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim()
              .normalize('NFC');
            const src = point.querySelector('content')?.getAttribute('src') || '';
            if (label && src) {
              const targetPath = resolveZipPath(ncxDir, safeDecodeUri(src.split('#')[0])).toLowerCase();
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
        const rawHref = item.href.split('#')[0];
        const resolved = resolveZipFilePath(zip, zipLowerLookup, [
          resolveZipPath(pkgDir, safeDecodeUri(rawHref)),
          resolveZipPath(pkgDir, rawHref),
        ]);
        if (!resolved) return null;
        return {
          item,
          path: resolved,
          tocKey: resolveZipPath(pkgDir, safeDecodeUri(rawHref)).toLowerCase(),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          item: { href: string; mediaType: string; properties: string };
          path: string;
          tocKey: string;
        } => Boolean(entry),
      );

    const imageUrlByZipPath = new Map<string, string>();

    async function getZipImageEntry(
      docPath: string,
      rawSrc: string,
    ): Promise<{ url: string; zipPath: string } | null> {
      const rawNoQuery = rawSrc.split('#')[0].split('?')[0];
      const cleanSrc = safeDecodeUri(rawNoQuery);
      const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
      const candidates = [
        resolveZipPath(docDir, cleanSrc),
        resolveZipPath(docDir, rawNoQuery),
        `${docDir}/${cleanSrc}`.replace(/^\/+/, ''),
        cleanSrc.replace(/^(\.\.\/)+/, ''),
      ];
      const matchedPath = resolveZipFilePath(zip, zipLowerLookup, candidates);
      if (!matchedPath) return null;

      if (options?.skipMediaBlobs) {
        return { url: 'data:,', zipPath: matchedPath };
      }

      const existingUrl = imageUrlByZipPath.get(matchedPath);
      if (existingUrl) return { url: existingUrl, zipPath: matchedPath };

      const zipFile = zip.file(matchedPath);
      if (!zipFile) return null;
      const imgBlob = await zipFile.async('blob');
      const mediaType =
        manifestByPath.get(matchedPath.toLowerCase())?.mediaType || imgBlob.type || 'image/jpeg';
      const isSvg = mediaType === 'image/svg+xml' || /\.svg$/i.test(matchedPath);
      const safeBlob = isSvg
        ? await sanitizeSvgBlob(imgBlob)
        : new Blob([imgBlob], { type: mediaType });
      const url = URL.createObjectURL(safeBlob);
      createdUrls.push(url);
      imageUrlByZipPath.set(matchedPath, url);
      return { url, zipPath: matchedPath };
    }

    const rawSections: RawEpubSection[] = [];

    for (const { path, tocKey } of spineItems) {
      const source = await zip.file(path)?.async('string');
      if (!source) continue;

      const doc = parseEpubXhtmlDocument(source);
      // Must sanitize BEFORE replacing image paths with blob: URLs (DOMPurify strips blob: by default)
      sanitizeBookDocument(doc);

      for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[src]'))) {
        const src = img.getAttribute('src');
        if (!src) continue;
        img.removeAttribute('width');
        img.removeAttribute('height');
        img.style.removeProperty('width');
        img.style.removeProperty('height');
        if (src.startsWith('data:')) continue;
        const resolved = await getZipImageEntry(path, src);
        if (resolved) {
          img.src = resolved.url;
          img.loading = 'lazy';
          img.setAttribute('data-zip-path', resolved.zipPath);
        } else {
          img.remove();
        }
      }

      for (const svgImg of Array.from(doc.querySelectorAll<SVGImageElement>('svg image'))) {
        const src = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href');
        if (!src || src.startsWith('data:')) continue;
        const resolved = await getZipImageEntry(path, src);
        if (resolved) {
          svgImg.setAttribute('href', resolved.url);
          svgImg.setAttribute('data-zip-path', resolved.zipPath);
          svgImg.removeAttribute('xlink:href');
        } else {
          svgImg.remove();
        }
      }

      const bodyHtml = (doc.body?.innerHTML?.trim() || '').normalize('NFC');
      const plainText = extractTextExcludingRubyAnnotations(doc.body)
        .replace(/\s+/g, ' ')
        .trim()
        .normalize('NFC');
      const hasMedia = doc.querySelectorAll('img, svg image').length > 0;
      if (!plainText && !hasMedia) continue;

      const headingText = extractTextExcludingRubyAnnotations(doc.querySelector('h1, h2, h3'))
        .replace(/\s+/g, ' ')
        .trim()
        .normalize('NFC');
      rawSections.push({
        tocTitle: tocTitlesByPath.get(tocKey) ?? tocTitlesByPath.get(path.toLowerCase()) ?? null,
        filenameTitle: getFilenameChapterTitle(path),
        headingTitle: headingText && headingText.length <= 90 ? headingText : null,
        bodyHtml,
        plainText,
        hasMedia,
      });
    }

    const chapters = buildEpubChapters(rawSections, book.id);
    if (chapters.length === 0) throw new Error('EPUB không có nội dung để đọc.');
    return { chapters, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

async function parseDocxBlob(
  blob: Blob,
  book: Book,
  options?: ParseBookOptions,
): Promise<ParsedBook> {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(options?.arrayBuffer ?? (await blob.arrayBuffer()));
  return parseDocxZip(zip, book, options);
}

export async function parseBookBlob(
  blob: Blob,
  book: Book,
  options?: ParseBookOptions,
): Promise<ParsedBook> {
  switch (book.file_type) {
    case 'epub':
      return parseEpubBlob(blob, book, options);
    case 'docx':
      return parseDocxBlob(blob, book, options);
    default:
      throw new Error('Định dạng sách chưa được hỗ trợ.');
  }
}
