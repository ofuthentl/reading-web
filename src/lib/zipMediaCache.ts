import type JSZip from 'jszip';
import type { Chapter } from '@/types';
import { guessImageMimeType } from '@/lib/docxXml';
import { sanitizeSvgBlob } from '@/lib/sanitizeHtml';

export const LAZY_MEDIA_PLACEHOLDER_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const MEDIA_HYDRATE_CONCURRENCY = 6;

export interface LazyZipMediaController {
  resolveMediaUrl: (zipPath: string) => Promise<string | null>;
  ensureChapterMedia: (chapters: Chapter[], chapterIndex: number) => Promise<Chapter | undefined>;
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
 * Quản lý giải nén ảnh minh hoạ lười theo chương cho trình đọc Owner (`QĐ-1A`):
 * - Giữ tham chiếu `JSZip` gọn trong phiên đọc và giải phóng hoàn toàn khi `dispose()`.
 * - Chống trùng lặp giải nén cho cùng 1 `zipPath` và thu hồi 100% `URL.revokeObjectURL`.
 */
export function createLazyZipMediaController(
  zip: JSZip,
  manifestMimeByLowerPath?: ReadonlyMap<string, { mediaType: string }>,
): LazyZipMediaController {
  let activeZip: JSZip | null = zip;
  let disposed = false;
  const urlByZipPath = new Map<string, string>();
  const inFlightByZipPath = new Map<string, Promise<string | null>>();
  const hydratedChapterIndices = new Set<number>();
  const inFlightChapters = new Map<number, Promise<Chapter | undefined>>();

  const resolveMediaUrl = (zipPath: string): Promise<string | null> => {
    if (disposed || !activeZip || !zipPath) return Promise.resolve(null);
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

  const ensureChapterMedia = (
    chapters: Chapter[],
    chapterIndex: number,
  ): Promise<Chapter | undefined> => {
    const chapter = chapters[chapterIndex];
    if (!chapter || disposed) return Promise.resolve(chapter);
    if (hydratedChapterIndices.has(chapterIndex)) return Promise.resolve(chapter);

    const html = chapter.content_html;
    if (!html || !html.includes('data-zip-path=')) {
      hydratedChapterIndices.add(chapterIndex);
      return Promise.resolve(chapter);
    }

    const pending = inFlightChapters.get(chapterIndex);
    if (pending) return pending;

    const job = (async (): Promise<Chapter | undefined> => {
      try {
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
          return chapters[chapterIndex];
        }

        const resolvedMap = new Map<string, string | null>();
        await runWithConcurrency(Array.from(uniquePaths), MEDIA_HYDRATE_CONCURRENCY, async (zp) => {
          const url = await resolveMediaUrl(zp);
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
    inFlightByZipPath.clear();
    inFlightChapters.clear();
    hydratedChapterIndices.clear();
  };

  return {
    resolveMediaUrl,
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
