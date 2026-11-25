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

  const [streamState, setStreamState] = useState<{
    key: string;
    chapterData: GuestChapterPayload | null;
    loadingChapter: boolean;
    chapterError: string | null;
    chapterLocked: boolean;
  }>(() => ({
    key: `${bookId}:${chapterIndex}`,
    chapterData: preseededForCurrent,
    loadingChapter: !isChapterLocked && !preseededForCurrent,
    chapterError: null,
    chapterLocked: isChapterLocked,
  }));
  const [retryNonce, setRetryNonce] = useState(0);
  const [imageSizes, setImageSizes] = useState<Map<number, { width: number; height: number }>>(
    () => new Map(),
  );

  const cacheBookIdRef = useRef(bookId);
  const chapterCacheRef = useRef<Map<number, GuestChapterPayload> | null>(null);
  if (!chapterCacheRef.current) {
    const initialMap = new Map<number, GuestChapterPayload>();
    if (initialChapter) {
      initialMap.set(initialChapter.chapterIndex, initialChapter.data);
    }
    chapterCacheRef.current = initialMap;
  }
  const bitmapsRef = useRef<Map<number, ImageBitmap>>(new Map());

  const currentKey = `${bookId}:${chapterIndex}`;
  const isSameCacheBook = cacheBookIdRef.current === bookId;
  const isStaleState = streamState.key !== currentKey;
  const cachedForCurrent =
    !isChapterLocked && isSameCacheBook
      ? (chapterCacheRef.current.get(chapterIndex) ?? preseededForCurrent)
      : preseededForCurrent;
  const effectiveChapterData = isChapterLocked
    ? null
    : isStaleState
      ? cachedForCurrent
      : streamState.chapterData;
  const effectiveLoadingChapter = isChapterLocked
    ? false
    : isStaleState
      ? !cachedForCurrent
      : streamState.loadingChapter;
  const effectiveChapterError = isChapterLocked || isStaleState ? null : streamState.chapterError;
  const effectiveChapterLocked = isChapterLocked || (!isStaleState && streamState.chapterLocked);

  // Thu hồi toàn bộ chương RAM & đóng sạch mọi ImageBitmap khi đóng sách
  useEffect(() => {
    cacheBookIdRef.current = bookId;
    const cacheMap = chapterCacheRef.current!;
    const bitmapMap = bitmapsRef.current;
    setImageSizes(new Map());
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
    const reqKey = `${bookId}:${chapterIndex}`;
    if (isChapterLocked) {
      setStreamState({
        key: reqKey,
        chapterData: null,
        loadingChapter: false,
        chapterError: null,
        chapterLocked: true,
      });
      return;
    }

    const cache = chapterCacheRef.current!;
    if (initialChapter && !cache.has(initialChapter.chapterIndex)) {
      cache.set(initialChapter.chapterIndex, initialChapter.data);
    }

    const cached = cache.get(chapterIndex);
    if (cached) {
      setStreamState({
        key: reqKey,
        chapterData: cached,
        loadingChapter: false,
        chapterError: null,
        chapterLocked: false,
      });
      return;
    }

    const controller = new AbortController();
    setStreamState({
      key: reqKey,
      chapterData: null,
      loadingChapter: true,
      chapterError: null,
      chapterLocked: false,
    });

    void fetchGuestChapterDecrypted(bookId, chapterIndex, controller.signal)
      .then((decrypted) => {
        if (controller.signal.aborted) return;
        if (cache.size >= MAX_RAM_CHAPTERS) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) cache.delete(oldestKey);
        }
        cache.set(chapterIndex, decrypted);
        setStreamState({
          key: reqKey,
          chapterData: decrypted,
          loadingChapter: false,
          chapterError: null,
          chapterLocked: false,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onApiError(err, 'Phiên truy cập đã hết hiệu lực.');
          return;
        }
        const status = (err as { status?: number } | null)?.status;
        if (status === 403) {
          setStreamState({
            key: reqKey,
            chapterData: null,
            loadingChapter: false,
            chapterError: null,
            chapterLocked: true,
          });
          return;
        }
        setStreamState({
          key: reqKey,
          chapterData: null,
          loadingChapter: false,
          chapterError: err instanceof Error ? err.message : 'Không thể tải nội dung chương.',
          chapterLocked: false,
        });
      });

    return () => controller.abort();
  }, [bookId, chapterIndex, initialChapter, isChapterLocked, onApiError, retryNonce]);

  // Nạp & giải mã trực tiếp các ảnh minh hoạ trong chương sang ImageBitmap (0 blob: URL, giới hạn LRU GPU H-04)
  useEffect(() => {
    if (!effectiveChapterData) return;
    const activeMediaIndices = Array.from(
      new Set(
        effectiveChapterData.blocks
          .filter((b): b is Extract<typeof b, { kind: 'img' }> => b.kind === 'img')
          .map((b) => b.mediaIndex),
      ),
    );
    const activeMediaSet = new Set(activeMediaIndices);

    // Làm mới thứ tự LRU cho ảnh đã nằm sẵn trong RAM thuộc chương hiện tại và đồng bộ lại kích thước nếu rAF trước bị huỷ
    const cachedSizes: Array<[number, { width: number; height: number }]> = [];
    for (const idx of activeMediaIndices) {
      const existing = bitmapsRef.current.get(idx);
      if (existing) {
        bitmapsRef.current.delete(idx);
        bitmapsRef.current.set(idx, existing);
        if (existing.width > 0 && existing.height > 0) {
          cachedSizes.push([idx, { width: existing.width, height: existing.height }]);
        }
      }
    }

    if (cachedSizes.length > 0) {
      setImageSizes((prev) => {
        let changed = false;
        for (const [idx, dims] of cachedSizes) {
          const cur = prev.get(idx);
          if (!cur || cur.width !== dims.width || cur.height !== dims.height) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const next = new Map(prev);
        for (const [idx, dims] of cachedSizes) {
          next.set(idx, dims);
        }
        return next;
      });
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
  }, [bookId, effectiveChapterData, onApiError]);

  const retryChapter = () => setRetryNonce((n) => n + 1);

  return {
    chapterData: effectiveChapterData,
    loadingChapter: effectiveLoadingChapter,
    chapterError: effectiveChapterError,
    chapterLocked: effectiveChapterLocked,
    imageSizes,
    bitmapsRef,
    retryChapter,
  };
}
