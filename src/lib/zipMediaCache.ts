import type JSZip from 'jszip';
import type { Chapter } from '@/types';
import { isConstrainedMobileDevice } from '@/lib/cache';
import { guessImageMimeType } from '@/lib/docxXml';
import { sanitizeSvgBlob } from '@/lib/sanitizeHtml';

export const LAZY_MEDIA_PLACEHOLDER_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const DESKTOP_MEDIA_HYDRATE_CONCURRENCY = 6;
const MOBILE_MEDIA_HYDRATE_CONCURRENCY = 2;
const MOBILE_HYDRATED_WINDOW_RADIUS = 1; // Giữ tối đa [active - 1, active, active + 1]

export interface EnsureChapterMediaOptions {
  prefetch?: boolean;
}

export interface LazyZipMediaController {
  resolveMediaUrl: (zipPath: string) => Promise<string | null>;
  ensureChapterMedia: (
    chapters: Chapter[],
    chapterIndex: number,
    options?: EnsureChapterMediaOptions,
  ) => Promise<Chapter | undefined>;
  dispose: () => void;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const count = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor < items.length) {
        const current = items[cursor];
        cursor += 1;
        await worker(current);
      }
    }),
  );
}

/**
 * Quản lý giải nén ảnh minh hoạ lười theo chương cho trình đọc Owner (`D-045` & `D-046`):
 * - Giữ tham chiếu `JSZip` gọn trong phiên đọc và giải phóng hoàn toàn khi `dispose()`.
 * - Chống trùng lặp giải nén cho cùng 1 `zipPath` và thu hồi 100% `URL.revokeObjectURL`.
 * - Trên thiết bị di động: hạ concurrency xuống 2 và tự thu hồi ObjectURL của các chương nằm ngoài cửa sổ `[active-1, active, active+1]`.
 */
export function createLazyZipMediaController(
  zip: JSZip,
  manifestMimeByLowerPath?: ReadonlyMap<string, { mediaType: string }>,
): LazyZipMediaController {
  const mobileMode = isConstrainedMobileDevice();
  const hydrateConcurrency = mobileMode
    ? MOBILE_MEDIA_HYDRATE_CONCURRENCY
    : DESKTOP_MEDIA_HYDRATE_CONCURRENCY;

  let activeZip: JSZip | null = zip;
  let disposed = false;
  const urlByZipPath = new Map<string, string>();
  const pinnedZipPaths = new Set<string>();
  const inFlightByZipPath = new Map<string, Promise<string | null>>();
  const hydratedChapterIndices = new Set<number>();
  const inFlightChapters = new Map<number, Promise<Chapter | undefined>>();
  const templateHtmlByChapter = new Map<number, string>();
  const zipPathsByChapter = new Map<number, Set<string>>();

  const resolveMediaUrlInternal = (zipPath: string, pinForGallery: boolean): Promise<string | null> => {
    if (disposed || !activeZip || !zipPath) return Promise.resolve(null);
    if (pinForGallery) pinnedZipPaths.add(zipPath);

    const cached = urlByZipPath.get(zipPath);
    if (cached) return Promise.resolve(cached);

    const existingPromise = inFlightByZipPath.get(zipPath);
    if (existingPromise) return existingPromise;

    const job = (async (): Promise<string | null> => {
      try {
        const entry = activeZip?.file(zipPath);
        if (!entry || disposed) return null;
        const rawBlob = await entry.async('blob');
        if (disposed) return null;

        const mediaType =
          manifestMimeByLowerPath?.get(zipPath.toLowerCase())?.mediaType ||
          rawBlob.type ||
          guessImageMimeType(zipPath);
        const isSvg = mediaType === 'image/svg+xml' || /\.svg$/i.test(zipPath);
        const safeBlob = isSvg
          ? await sanitizeSvgBlob(rawBlob)
          : new Blob([rawBlob], { type: mediaType });
        if (disposed) return null;

        const url = URL.createObjectURL(safeBlob);
        if (disposed) {
          URL.revokeObjectURL(url);
          return null;
        }
        urlByZipPath.set(zipPath, url);
        return url;
      } catch {
        return null;
      } finally {
        inFlightByZipPath.delete(zipPath);
      }
    })();

    inFlightByZipPath.set(zipPath, job);
    return job;
  };

  const evictDistantChaptersOnMobile = (chapters: Chapter[], centerIndex: number): void => {
    if (!mobileMode || disposed) return;
    const toEvict: number[] = [];
    for (const idx of hydratedChapterIndices) {
      if (Math.abs(idx - centerIndex) > MOBILE_HYDRATED_WINDOW_RADIUS && !inFlightChapters.has(idx)) {
        toEvict.push(idx);
      }
    }
    if (toEvict.length === 0) return;

    const evictedPaths = new Set<string>();
    for (const idx of toEvict) {
      hydratedChapterIndices.delete(idx);
      const templateHtml = templateHtmlByChapter.get(idx);
      if (templateHtml !== undefined && chapters[idx]) {
        chapters[idx] = { ...chapters[idx], content_html: templateHtml };
      }
      const paths = zipPathsByChapter.get(idx);
      if (paths) {
        for (const p of paths) evictedPaths.add(p);
      }
    }

    if (evictedPaths.size === 0) return;

    const stillReferenced = new Set<string>(pinnedZipPaths);
    for (const idx of hydratedChapterIndices) {
      const paths = zipPathsByChapter.get(idx);
      if (paths) {
        for (const p of paths) stillReferenced.add(p);
      }
    }
    for (const idx of inFlightChapters.keys()) {
      const paths = zipPathsByChapter.get(idx);
      if (paths) {
        for (const p of paths) stillReferenced.add(p);
      }
    }

    for (const path of evictedPaths) {
      if (stillReferenced.has(path)) continue;
      const url = urlByZipPath.get(path);
      if (url) {
        URL.revokeObjectURL(url);
        urlByZipPath.delete(path);
      }
    }
  };

  const ensureChapterMedia = (
    chapters: Chapter[],
    chapterIndex: number,
    options?: EnsureChapterMediaOptions,
  ): Promise<Chapter | undefined> => {
    const chapter = chapters[chapterIndex];
    if (!chapter || disposed) return Promise.resolve(chapter);

    if (hydratedChapterIndices.has(chapterIndex)) {
      if (!options?.prefetch) evictDistantChaptersOnMobile(chapters, chapterIndex);
      return Promise.resolve(chapter);
    }

    const html = chapter.content_html;
    if (!html || !html.includes('data-zip-path=')) {
      hydratedChapterIndices.add(chapterIndex);
      if (!options?.prefetch) evictDistantChaptersOnMobile(chapters, chapterIndex);
      return Promise.resolve(chapter);
    }

    const pending = inFlightChapters.get(chapterIndex);
    if (pending) return pending;

    const job = (async (): Promise<Chapter | undefined> => {
      try {
        if (mobileMode && !templateHtmlByChapter.has(chapterIndex)) {
          templateHtmlByChapter.set(chapterIndex, html);
        }
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const imgNodes = Array.from(doc.querySelectorAll<HTMLImageElement>('img[data-zip-path]'));
        const svgNodes = Array.from(doc.querySelectorAll<SVGImageElement>('svg image[data-zip-path]'));

        const uniquePaths = new Set<string>();
        for (const el of imgNodes) {
          const zp = el.getAttribute('data-zip-path');
          if (zp) uniquePaths.add(zp);
        }
        for (const el of svgNodes) {
          const zp = el.getAttribute('data-zip-path');
          if (zp) uniquePaths.add(zp);
        }

        if (uniquePaths.size === 0) {
          hydratedChapterIndices.add(chapterIndex);
          if (!options?.prefetch) evictDistantChaptersOnMobile(chapters, chapterIndex);
          return chapters[chapterIndex];
        }

        if (mobileMode) {
          zipPathsByChapter.set(chapterIndex, uniquePaths);
        }

        const resolvedMap = new Map<string, string | null>();
        await runWithConcurrency(Array.from(uniquePaths), hydrateConcurrency, async (zp) => {
          const url = await resolveMediaUrlInternal(zp, false);
          resolvedMap.set(zp, url);
        });
        if (disposed) return undefined;

        for (const img of imgNodes) {
          const zp = img.getAttribute('data-zip-path') || '';
          const url = resolvedMap.get(zp);
          if (url) {
            img.src = url;
          } else {
            img.remove();
          }
        }
        for (const svgImg of svgNodes) {
          const zp = svgImg.getAttribute('data-zip-path') || '';
          const url = resolvedMap.get(zp);
          if (url) {
            svgImg.setAttribute('href', url);
            svgImg.removeAttribute('xlink:href');
          } else {
            svgImg.remove();
          }
        }

        const hydrated: Chapter = {
          ...chapter,
          content_html: doc.body?.innerHTML?.trim() || html,
        };
        chapters[chapterIndex] = hydrated;
        hydratedChapterIndices.add(chapterIndex);
        if (!options?.prefetch) {
          evictDistantChaptersOnMobile(chapters, chapterIndex);
        }
        return hydrated;
      } finally {
        inFlightChapters.delete(chapterIndex);
      }
    })();

    inFlightChapters.set(chapterIndex, job);
    return job;
  };

  const dispose = () => {
    disposed = true;
    activeZip = null;
    for (const url of urlByZipPath.values()) {
      URL.revokeObjectURL(url);
    }
    urlByZipPath.clear();
    pinnedZipPaths.clear();
    inFlightByZipPath.clear();
    inFlightChapters.clear();
    hydratedChapterIndices.clear();
    templateHtmlByChapter.clear();
    zipPathsByChapter.clear();
  };

  return {
    resolveMediaUrl: (zipPath) => resolveMediaUrlInternal(zipPath, true),
    ensureChapterMedia,
    dispose,
  };
}

export function resolveInitialChapterIndex(
  chapters: readonly Chapter[],
  initialChapterId?: string,
  initialChapterIndex?: number,
): number {
  if (chapters.length === 0) return 0;
  if (initialChapterId) {
    const byId = chapters.findIndex((c) => c.id === initialChapterId);
    if (byId >= 0) return byId;
  }
  if (typeof initialChapterIndex === 'number' && Number.isFinite(initialChapterIndex)) {
    return Math.max(0, Math.min(Math.floor(initialChapterIndex), chapters.length - 1));
  }
  return 0;
}
