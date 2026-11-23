import type JSZip from 'jszip';
import type { Book, BookFileType, ParsedBook } from '@/types';
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkReload';
import { compressCoverBlob } from '@/lib/coverImage';
import { extractDocxCover, parseDocxZip } from '@/lib/docxParser';
import { buildEpubChapters, type RawEpubSection } from '@/lib/epubChapters';
import { sanitizeBookDocument } from '@/lib/sanitizeHtml';

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

/**
 * Extracts and compresses a lightweight (~35-60KB) JPEG cover ONCE at upload time,
 * so the library view never has to download full book files just to show thumbnails.
 */
export async function extractCoverAtUpload(file: File, fileType: BookFileType): Promise<Blob | null> {
  try {
    if (fileType === 'epub') {
      const JSZip = await loadJSZip();
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

    const imageUrlByZipPath = new Map<string, string>();

    async function getZipImageEntry(
      docPath: string,
      rawSrc: string,
    ): Promise<{ url: string; zipPath: string } | null> {
      const cleanSrc = safeDecodeUri(rawSrc.split('#')[0].split('?')[0]);
      const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
      const candidates = [
        resolveZipPath(docDir, cleanSrc),
        `${docDir}/${cleanSrc}`.replace(/^\/+/, ''),
        cleanSrc.replace(/^(\.\.\/)+/, ''),
      ];
      const matchedPath = candidates.find((candidate) => Boolean(zip.file(candidate)));
      if (!matchedPath) return null;

      if (options?.skipMediaBlobs) {
        return { url: 'data:,', zipPath: matchedPath };
      }

      const existingUrl = imageUrlByZipPath.get(matchedPath);
      if (existingUrl) return { url: existingUrl, zipPath: matchedPath };

      const zipFile = zip.file(matchedPath);
      if (!zipFile) return null;
      const imgBlob = await zipFile.async('blob');
      const mediaType = manifestByPath.get(matchedPath)?.mediaType || imgBlob.type || 'image/jpeg';
      const url = URL.createObjectURL(new Blob([imgBlob], { type: mediaType }));
      createdUrls.push(url);
      imageUrlByZipPath.set(matchedPath, url);
      return { url, zipPath: matchedPath };
    }

    const rawSections: RawEpubSection[] = [];

    for (const { path } of spineItems) {
      const source = await zip.file(path)?.async('string');
      if (!source) continue;

      const doc = new DOMParser().parseFromString(source, 'text/html');
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

      const bodyHtml = doc.body?.innerHTML?.trim() || '';
      const plainText = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const hasMedia = doc.querySelectorAll('img, svg image').length > 0;
      if (!plainText && !hasMedia) continue;

      const headingText = doc.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim();
      rawSections.push({
        tocTitle: tocTitlesByPath.get(path) ?? null,
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

async function parseDocxBlob(blob: Blob, book: Book): Promise<ParsedBook> {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return parseDocxZip(zip, book);
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
      return parseDocxBlob(blob, book);
    default:
      throw new Error('Định dạng sách chưa được hỗ trợ.');
  }
}
