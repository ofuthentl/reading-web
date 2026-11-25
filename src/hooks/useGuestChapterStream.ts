import { useEffect, useRef, useState } from 'react';
import type { GuestChapterPayload, GuestTocItem, ReadingProgress } from '@/types';
import { isAuthError } from '@/lib/api';
import {
  fetchGuestChapterDecrypted,
  fetchGuestMediaBitmap,
} from '@/lib/guestCrypto';

const MAX_RAM_CHAPTERS = 12;
const MAX_RAM_BITMAPS = 24;
const GUEST_MEDIA_FETCH_CONCURRENCY = 3;

export function resolveGuestUnlockedInitialProgress(
  tocChapters: readonly GuestTocItem[],
  initialProgress?: ReadingProgress,
): ReadingProgress | undefined {
  if (tocChapters.length === 0) return initialProgress;
  let targetIdx = 0;
  if (initialProgress) {
    const byId = tocChapters.findIndex((c) => c.id === initialProgress.chapterId);
    targetIdx =
      byId >= 0
        ? byId
        : Math.max(0, Math.min(initialProgress.chapterIndex || 0, tocChapters.length - 1));
  }
  if (!tocChapters[targetIdx]?.locked) return initialProgress;

  const firstOpenIdx = tocChapters.findIndex((c) => !c.locked);
  if (firstOpenIdx < 0) return initialProgress;
  const openMeta = tocChapters[firstOpenIdx];
  return {
    chapterId: openMeta.id,
    chapterIndex: firstOpenIdx,
    chapterTitle: openMeta.title,
    totalChapters: tocChapters.length,
    scrollRatio: 0,
    scrollTop: 0,
    completed: Boolean(initialProgress?.completed),
    readingSeconds: initialProgress?.readingSeconds,
    rereadCount: initialProgress?.rereadCount,
    updatedAt: initialProgress?.updatedAt ?? Date.now(),
  };
}

interface UseGuestChapterStreamOptions {
  bookId: string;
  chapterIndex: number;
  isChapterLocked?: boolean;
  initialChapter?: { chapterIndex: number; data: GuestChapterPayload };
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useGuestChapterStream({
  bookId,
  chapterIndex,
  isChapterLocked = false,
  initialChapter,
  onApiError,
}: UseGuestChapterStreamOptions) {
  const preseededForCurrent =
    !isChapterLocked && initialChapter && initialChapter.chapterIndex === chapterIndex
      ? initialChapter.data
      : null;

  const [chapterData, setChapterData] = useState<GuestChapterPayload | null>(preseededForCurrent);
  const [loadingChapter, setLoadingChapter] = useState(!isChapterLocked && !preseededForCurrent);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [chapterLocked, setChapterLocked] = useState(isChapterLocked);
  const [retryNonce, setRetryNonce] = useState(0);
  const [imageSizes, setImageSizes] = useState<Map<number, { width: number; height: number }>>(
    () => new Map(),
  );

  const chapterCacheRef = useRef<Map<number, GuestChapterPayload> | null>(null);
  if (!chapterCacheRef.current) {
    const initialMap = new Map<number, GuestChapterPayload>();
    if (initialChapter) {
      initialMap.set(initialChapter.chapterIndex, initialChapter.data);
    }
    chapterCacheRef.current = initialMap;
  }
  const bitmapsRef = useRef<Map<number, ImageBitmap>>(new Map());

  // Thu hồi toàn bộ chương RAM & đóng sạch mọi ImageBitmap khi đóng sách
  useEffect(() => {
    const cacheMap = chapterCacheRef.current!;
    const bitmapMap = bitmapsRef.current;
    return () => {
      cacheMap.clear();
      for (const bmp of bitmapMap.values()) {
        bmp.close();
      }
      bitmapMap.clear();
    };
  }, [bookId]);

  // Nạp & giải mã chương hiện tại (ưu tiên cache RAM phiên 0ms không tốn lượt Token Bucket)
  useEffect(() => {
    if (isChapterLocked) {
      setChapterData(null);
      setChapterError(null);
      setChapterLocked(true);
      setLoadingChapter(false);
      return;
    }

    const cache = chapterCacheRef.current!;
    if (initialChapter && !cache.has(initialChapter.chapterIndex)) {
      cache.set(initialChapter.chapterIndex, initialChapter.data);
    }

    const cached = cache.get(chapterIndex);
    if (cached) {
      setChapterData(cached);
      setChapterError(null);
      setChapterLocked(false);
      setLoadingChapter(false);
      return;
    }

    const controller = new AbortController();
    setLoadingChapter(true);
    setChapterError(null);
    setChapterLocked(false);
    setChapterData(null);

    void fetchGuestChapterDecrypted(bookId, chapterIndex, controller.signal)
      .then((decrypted) => {
        if (controller.signal.aborted) return;
        if (cache.size >= MAX_RAM_CHAPTERS) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) cache.delete(oldestKey);
        }
        cache.set(chapterIndex, decrypted);
        setChapterData(decrypted);
        setLoadingChapter(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onApiError(err, 'Phiên truy cập đã hết hiệu lực.');
          return;
        }
        const status = (err as { status?: number } | null)?.status;
        setLoadingChapter(false);
        if (status === 403) {
          setChapterLocked(true);
          setChapterError(null);
          return;
        }
        setChapterError(
          err instanceof Error ? err.message : 'Không thể tải nội dung chương.',
        );
      });

    return () => controller.abort();
  }, [bookId, chapterIndex, initialChapter, isChapterLocked, onApiError, retryNonce]);

  // Nạp & giải mã trực tiếp các ảnh minh hoạ trong chương sang ImageBitmap (0 blob: URL, giới hạn LRU GPU H-04)
  useEffect(() => {
    if (!chapterData) return;
    const activeMediaIndices = Array.from(
      new Set(
        chapterData.blocks
          .filter((b): b is Extract<typeof b, { kind: 'img' }> => b.kind === 'img')
          .map((b) => b.mediaIndex),
      ),
    );
    const activeMediaSet = new Set(activeMediaIndices);

    // Làm mới thứ tự LRU cho ảnh đã nằm sẵn trong RAM thuộc chương hiện tại
    for (const idx of activeMediaIndices) {
      const existing = bitmapsRef.current.get(idx);
      if (existing) {
        bitmapsRef.current.delete(idx);
        bitmapsRef.current.set(idx, existing);
      }
    }

    const neededIndices = activeMediaIndices.filter((idx) => !bitmapsRef.current.has(idx));
    if (neededIndices.length === 0) return;

    const evictOldBitmaps = () => {
      const map = bitmapsRef.current;
      while (map.size >= MAX_RAM_BITMAPS) {
        let evicted = false;
        for (const [key, bmp] of map.entries()) {
          if (!activeMediaSet.has(key)) {
            bmp.close();
            map.delete(key);
            evicted = true;
            break;
          }
        }
        if (!evicted) break;
      }
    };

    const controller = new AbortController();
    const pendingSizes = new Map<number, { width: number; height: number }>();
    let flushRaf = 0;
    let authErrorReported = false;

    const flushPendingSizes = () => {
      flushRaf = 0;
      if (pendingSizes.size === 0 || controller.signal.aborted) return;
      const batch = Array.from(pendingSizes.entries());
      pendingSizes.clear();
      setImageSizes((prev) => {
        const next = new Map(prev);
        for (const [idx, dims] of batch) {
          next.set(idx, dims);
        }
        return next;
      });
    };

    const scheduleFlushSizes = () => {
      if (flushRaf) return;
      flushRaf = requestAnimationFrame(flushPendingSizes);
    };

    // QĐ-3A: tải song song tối đa 3 ảnh minh hoạ (khớp D-038) và gom batch cập nhật kích thước theo khung hình
    let cursor = 0;
    const workerCount = Math.min(GUEST_MEDIA_FETCH_CONCURRENCY, neededIndices.length);
    const runWorker = async () => {
      while (cursor < neededIndices.length && !controller.signal.aborted) {
        const mediaIndex = neededIndices[cursor];
        cursor += 1;
        try {
          const bmp = await fetchGuestMediaBitmap(bookId, mediaIndex, controller.signal);
          if (controller.signal.aborted) {
            bmp.close();
            return;
          }
          evictOldBitmaps();
          bitmapsRef.current.set(mediaIndex, bmp);
          pendingSizes.set(mediaIndex, { width: bmp.width, height: bmp.height });
          scheduleFlushSizes();
        } catch (err) {
          if (isAuthError(err)) {
            if (!authErrorReported) {
              authErrorReported = true;
              controller.abort();
              onApiError(err, 'Phiên truy cập đã hết hiệu lực.');
            }
            return;
          }
        }
      }
    };
    void Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return () => {
      controller.abort();
      if (flushRaf) cancelAnimationFrame(flushRaf);
    };
  }, [bookId, chapterData, onApiError]);

  const retryChapter = () => setRetryNonce((n) => n + 1);

  return {
    chapterData,
    loadingChapter,
    chapterError,
    chapterLocked,
    imageSizes,
    bitmapsRef,
    retryChapter,
  };
}
