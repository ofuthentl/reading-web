import type JSZip from 'jszip';
import type { Book, BookFileType, ParsedBook } from '@/types';
import { splitNormalizedAuthors } from '@/lib/authorHeuristics';
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkReload';
import { compressCoverBlob } from '@/lib/coverImage';
import { extractDocxCover, parseDocxZip } from '@/lib/docxParser';
import { buildEpubChapters, type RawEpubSection } from '@/lib/epubChapters';
import { extractTextExcludingRubyAnnotations } from '@/lib/rubyText';
import { parseAndSanitizeEpubBody } from '@/lib/sanitizeHtml';
import {
  LAZY_MEDIA_PLACEHOLDER_SRC,
  createLazyZipMediaController,
  resolveInitialChapterIndex,
} from '@/lib/zipMediaCache';

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

function extractCleanCreatorsFromXmlDoc(xmlDoc: Document): string | null {
  const nodes = [
    ...Array.from(xmlDoc.getElementsByTagName('dc:creator')),
    ...Array.from(xmlDoc.getElementsByTagName('creator')),
  ];
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    for (const part of splitNormalizedAuthors(raw)) {
      const key = part.toLocaleLowerCase('vi');
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(part);
      }
    }
  }
  return collected.length > 0 ? collected.join(', ') : null;
}

export interface UploadMetadataResult {
  coverBlob: Blob | null;
  author: string | null;
  arrayBuffer?: ArrayBuffer;
  zip?: JSZip;
}

/**
 * Trích ảnh bìa nhẹ (~35–60KB JPEG) VÀ tên tác giả sạch (`<dc:creator>`) trong CÙNG 1 lần mở ZIP
 * lúc tải lên; tuỳ chọn `keepZip: true` giữ lại `arrayBuffer` & `zip` để bước tạo `guest-pack` tái sử dụng (0 lần mở ZIP thứ 2).
 */
export async function extractUploadMetadata(
  file: File,
  fileType: BookFileType,
  options?: { keepZip?: boolean },
): Promise<UploadMetadataResult> {
  let coverBlob: Blob | null = null;
  let author: string | null = null;
  let arrayBuffer: ArrayBuffer | undefined;
  let zip: JSZip | undefined;
  const keepZip = Boolean(options?.keepZip);

  const packResult = (): UploadMetadataResult => ({
    coverBlob,
    author,
    ...(keepZip && arrayBuffer ? { arrayBuffer } : {}),
    ...(keepZip && zip ? { zip } : {}),
  });

  try {
    if (fileType === 'epub') {
      const JSZip = await loadJSZip();
      arrayBuffer = await file.arrayBuffer();
      zip = await JSZip.loadAsync(arrayBuffer);
      const zipLowerLookup = buildCaseInsensitiveZipLookup(zip);
      const containerPath = resolveZipFilePath(zip, zipLowerLookup, ['META-INF/container.xml']);
      const containerXml = containerPath ? await zip.file(containerPath)?.async('string') : null;
      if (!containerXml) return packResult();
      const container = new DOMParser().parseFromString(containerXml, 'application/xml');
      const rootFile = container.querySelector('rootfile')?.getAttribute('full-path');
      if (!rootFile) return packResult();
      const resolvedRoot = resolveZipFilePath(zip, zipLowerLookup, [rootFile, safeDecodeUri(rootFile)]);
      const packageXml = resolvedRoot ? await zip.file(resolvedRoot)?.async('string') : null;
      if (!packageXml || !resolvedRoot) return packResult();

      const pkg = new DOMParser().parseFromString(packageXml, 'application/xml');
      author = extractCleanCreatorsFromXmlDoc(pkg);
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
          coverBlob = await compressCoverBlob(
            new Blob([rawBlob], { type: mediaType || rawBlob.type || 'image/jpeg' }),
          );
          break;
        } catch {
          // Bỏ qua ứng viên bìa hỏng/không decode được để thử ứng viên tiếp theo
        }
      }
      return packResult();
    }

    if (fileType === 'docx') {
      const JSZip = await loadJSZip();
      arrayBuffer = await file.arrayBuffer();
      zip = await JSZip.loadAsync(arrayBuffer);
      const zipLowerLookup = buildCaseInsensitiveZipLookup(zip);
      const corePath = resolveZipFilePath(zip, zipLowerLookup, ['docProps/core.xml']);
      const coreXml = corePath ? await zip.file(corePath)?.async('string') : null;
      if (coreXml) {
        const coreDoc = new DOMParser().parseFromString(coreXml, 'application/xml');
        author = extractCleanCreatorsFromXmlDoc(coreDoc);
      }
      coverBlob = await extractDocxCover(zip);
      return packResult();
    }
  } catch (err) {
    if (isChunkLoadError(err)) throw err;
    return packResult();
  }
  return { coverBlob: null, author: null };
}

/**
 * Extracts and compresses a lightweight (~35-60KB) JPEG cover ONCE at upload time,
 * so the library view never has to download full book files just to show thumbnails.
 */
export async function extractCoverAtUpload(file: File, fileType: BookFileType): Promise<Blob | null> {
  const { coverBlob } = await extractUploadMetadata(file, fileType);
  return coverBlob;
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
  /** Chỉ giải nén ảnh cho chương mở đầu; các chương còn lại nạp lười khi lật tới (`QĐ-1A`) */
  lazyMedia?: boolean;
  initialChapterId?: string;
  initialChapterIndex?: number;
  /** Truyền sẵn ArrayBuffer nếu caller đã đọc để tránh nhân đôi RAM (vá M-12) */
  arrayBuffer?: ArrayBuffer;
  /** Truyền sẵn JSZip đã giải nén để tránh mở ZIP 2 lần lúc tải sách lên */
  preloadedZip?: JSZip;
}

async function parseEpubBlob(
  blob: Blob,
  book: Book,
  options?: ParseBookOptions,
): Promise<ParsedBook> {
  const skipMedia = Boolean(options?.skipMediaBlobs);
  const useLazyMedia = Boolean(options?.lazyMedia && !skipMedia);
  let mediaCtrl: ReturnType<typeof createLazyZipMediaController> | null = null;
  const dispose = () => {
    mediaCtrl?.dispose();
    mediaCtrl = null;
  };

  try {
    const zip =
      options?.preloadedZip ??
      (await (await loadJSZip()).loadAsync(options?.arrayBuffer ?? (await blob.arrayBuffer())));
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
        manifest.set(id, { href, mediaType, properties: item.getAttribute('properties') || '' });
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
        if (!item || (!item.mediaType.includes('html') && !item.mediaType.includes('xml'))) {
          return null;
        }
        const rawHref = item.href.split('#')[0];
        const resolved = resolveZipFilePath(zip, zipLowerLookup, [
          resolveZipPath(pkgDir, safeDecodeUri(rawHref)),
          resolveZipPath(pkgDir, rawHref),
        ]);
        if (!resolved) return null;
        return {
          path: resolved,
          tocKey: resolveZipPath(pkgDir, safeDecodeUri(rawHref)).toLowerCase(),
        };
      })
      .filter((entry): entry is { path: string; tocKey: string } => Boolean(entry));

    const resolveMatchedImageZipPath = (docPath: string, rawSrc: string): string | null => {
      const rawNoQuery = rawSrc.split('#')[0].split('?')[0];
      const cleanSrc = safeDecodeUri(rawNoQuery);
      const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/')) : '';
      return resolveZipFilePath(zip, zipLowerLookup, [
        resolveZipPath(docDir, cleanSrc),
        resolveZipPath(docDir, rawNoQuery),
        `${docDir}/${cleanSrc}`.replace(/^\/+/, ''),
        cleanSrc.replace(/^(\.\.\/)+/, ''),
      ]);
    };

    if (!skipMedia) {
      mediaCtrl = createLazyZipMediaController(zip, manifestByPath);
    }

    // Giải nén theo lô nhỏ 4 tệp/lô và xả chuỗi nguồn ngay sau khi parse để cắt đỉnh RAM trên iOS WebKit
    const SPINE_DECOMPRESS_BATCH_SIZE = 4;
    const placeholderSrc = skipMedia ? 'data:,' : LAZY_MEDIA_PLACEHOLDER_SRC;
    const rawSections: RawEpubSection[] = [];

    for (
      let batchStart = 0;
      batchStart < spineItems.length;
      batchStart += SPINE_DECOMPRESS_BATCH_SIZE
    ) {
      const batch = spineItems.slice(batchStart, batchStart + SPINE_DECOMPRESS_BATCH_SIZE);
      const batchSources = await Promise.all(
        batch.map(({ path }) => zip.file(path)?.async('string') ?? Promise.resolve(null)),
      );

      for (let j = 0; j < batch.length; j += 1) {
        const source = batchSources[j];
        batchSources[j] = null;
        if (!source) continue;
        const { path, tocKey } = batch[j];

        const body = parseAndSanitizeEpubBody(source);

        for (const img of Array.from(body.querySelectorAll<HTMLImageElement>('img[src]'))) {
          const src = img.getAttribute('src');
          if (!src) continue;
          img.removeAttribute('width');
          img.removeAttribute('height');
          img.style.removeProperty('width');
          img.style.removeProperty('height');
          if (src.startsWith('data:')) continue;
          const matchedPath = resolveMatchedImageZipPath(path, src);
          if (matchedPath) {
            img.src = placeholderSrc;
            img.loading = 'lazy';
            img.setAttribute('data-zip-path', matchedPath);
          } else {
            img.remove();
          }
        }

        for (const svgImg of Array.from(body.querySelectorAll<SVGImageElement>('svg image'))) {
          const src = svgImg.getAttribute('href') || svgImg.getAttribute('xlink:href');
          if (!src || src.startsWith('data:')) continue;
          const matchedPath = resolveMatchedImageZipPath(path, src);
          if (matchedPath) {
            svgImg.setAttribute('href', placeholderSrc);
            svgImg.setAttribute('data-zip-path', matchedPath);
            svgImg.removeAttribute('xlink:href');
          } else {
            svgImg.remove();
          }
        }

        const bodyHtml = body.innerHTML.trim().normalize('NFC');
        const plainText = extractTextExcludingRubyAnnotations(body)
          .replace(/\s+/g, ' ')
          .trim()
          .normalize('NFC');
        const hasMedia = body.querySelector('img, svg image') !== null;
        if (!plainText && !hasMedia) continue;

        const headingText = extractTextExcludingRubyAnnotations(body.querySelector('h1, h2, h3'))
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
    }

    const chapters = buildEpubChapters(rawSections, book.id);
    if (chapters.length === 0) throw new Error('EPUB không có nội dung để đọc.');

    if (mediaCtrl) {
      if (useLazyMedia) {
        const initialIdx = resolveInitialChapterIndex(
          chapters,
          options?.initialChapterId,
          options?.initialChapterIndex,
        );
        await mediaCtrl.ensureChapterMedia(chapters, initialIdx);
        const ctrl = mediaCtrl;
        return {
          chapters,
          ensureChapterMedia: (idx, opts) => ctrl.ensureChapterMedia(chapters, idx, opts),
          resolveMediaUrl: ctrl.resolveMediaUrl,
          dispose,
        };
      }
      for (let idx = 0; idx < chapters.length; idx += 1) {
        await mediaCtrl.ensureChapterMedia(chapters, idx);
      }
    }

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
  const zip =
    options?.preloadedZip ??
    (await (await loadJSZip()).loadAsync(options?.arrayBuffer ?? (await blob.arrayBuffer())));
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
