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
export const GUEST_PREFETCH_RATIO_THRESHOLD = 0.78;
export const GUEST_PREFETCH_RATE_LIMIT_COOLDOWN_MS = 60_000;

export interface GuestPrefetchGuardInput {
  chapterIndex: number;
  scrollRatio: number;
  tocChapters: readonly GuestTocItem[];
  isCurrentChapterLocked: boolean;
  isLoadingCurrentChapter: boolean;
  hasCurrentChapterError: boolean;
  hasCurrentChapterData: boolean;
  isNextChapterCached: boolean;
  nowMs: number;
  rateLimitCooldownUntilMs: number;
  alreadyAttemptedForTarget: boolean;
}

/**
 * Xác định chỉ số chương kế tiếp đủ điều kiện tải trước ngầm cho Khách Discord (Phase 3.1):
 * - Khách đã đọc qua >= 78% chương hiện tại (cả cuộn dọc lẫn lật trang).
 * - Chỉ tải đúng 1 chương kế (`chapterIndex + 1`), bỏ qua chương bị khoá (`D-042`),
 *   bỏ qua nếu đã nằm trong RAM cache hoặc vừa chạm `429` gần đây để giữ trọn Token Bucket (`D-028`).
 */
export function shouldPrefetchNextGuestChapter(input: GuestPrefetchGuardInput): number | null {
  if (
    input.isCurrentChapterLocked ||
    input.isLoadingCurrentChapter ||
    input.hasCurrentChapterError ||
    !input.hasCurrentChapterData
  ) {
    return null;
  }
  if (!Number.isFinite(input.scrollRatio) || input.scrollRatio < GUEST_PREFETCH_RATIO_THRESHOLD) {
    return null;
  }
  const nextIndex = input.chapterIndex + 1;
  if (nextIndex <= 0 || nextIndex >= input.tocChapters.length) {
    return null;
  }
  const nextChapter = input.tocChapters[nextIndex];
  if (!nextChapter || nextChapter.locked) {
    return null;
  }
  if (input.isNextChapterCached || input.alreadyAttemptedForTarget) {
    return null;
  }
  if (input.nowMs < input.rateLimitCooldownUntilMs) {
    return null;
  }
  return nextIndex;
}

function putChapterInRamCache(
  cache: Map<number, GuestChapterPayload>,
  index: number,
  payload: GuestChapterPayload,
  protectedIndex?: number,
): void {
  if (cache.has(index)) {
    cache.delete(index);
  }
  while (cache.size >= MAX_RAM_CHAPTERS) {
    let evicted = false;
    for (const key of cache.keys()) {
      if (key !== protectedIndex) {
        cache.delete(key);
        evicted = true;
        break;
      }
    }
    if (!evicted) break;
  }
  cache.set(index, payload);
}

function computeRateLimitCooldownUntil(err: unknown, nowMs: number): number {
  const retryAfterSec = (err as { retryAfterSec?: number } | null)?.retryAfterSec;
  const retryMs =
    typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : 0;
  return nowMs + Math.max(GUEST_PREFETCH_RATE_LIMIT_COOLDOWN_MS, retryMs);
}

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
  tocChapters?: readonly GuestTocItem[];
  scrollRatio?: number;
  isChapterLocked?: boolean;
  initialChapter?: { chapterIndex: number; data: GuestChapterPayload };
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useGuestChapterStream({
  bookId,
  chapterIndex,
  tocChapters = [],
  scrollRatio = 0,
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
  const rateLimitCooldownUntilRef = useRef(0);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const attemptedPrefetchKeyRef = useRef<string | null>(null);

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
      putChapterInRamCache(cache, chapterIndex, cached, chapterIndex);
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
        putChapterInRamCache(cache, chapterIndex, decrypted, chapterIndex);
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
        if (status === 429) {
          rateLimitCooldownUntilRef.current = Math.max(
            rateLimitCooldownUntilRef.current,
            computeRateLimitCooldownUntil(err, Date.now()),
          );
        }
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

  // Huỷ ngay tải trước chương kế khi đổi chương, đổi sách hoặc đóng trình đọc (Phase 3.1)
  useEffect(() => {
    attemptedPrefetchKeyRef.current = null;
    return () => {
      prefetchAbortRef.current?.abort();
      prefetchAbortRef.current = null;
    };
  }, [bookId, chapterIndex]);

  // Tải trước ngầm đúng 1 chương kế tiếp khi khách đọc qua >= 78% chương hiện tại (giữ trọn D-028 & thuỷ vân)
  useEffect(() => {
    const cache = chapterCacheRef.current;
    if (!cache || cacheBookIdRef.current !== bookId) return;
    const candidateNextIndex = chapterIndex + 1;
    const targetKey = `${bookId}:${chapterIndex}->${candidateNextIndex}`;

    const nextIndex = shouldPrefetchNextGuestChapter({
      chapterIndex,
      scrollRatio,
      tocChapters,
      isCurrentChapterLocked: effectiveChapterLocked,
      isLoadingCurrentChapter: effectiveLoadingChapter,
      hasCurrentChapterError: Boolean(effectiveChapterError),
      hasCurrentChapterData: Boolean(effectiveChapterData),
      isNextChapterCached: cache.has(candidateNextIndex),
      nowMs: Date.now(),
      rateLimitCooldownUntilMs: rateLimitCooldownUntilRef.current,
      alreadyAttemptedForTarget: attemptedPrefetchKeyRef.current === targetKey,
    });
    if (nextIndex === null) return;

    attemptedPrefetchKeyRef.current = targetKey;
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    void fetchGuestChapterDecrypted(bookId, nextIndex, controller.signal)
      .then((decrypted) => {
        if (controller.signal.aborted || cacheBookIdRef.current !== bookId) return;
        putChapterInRamCache(cache, nextIndex, decrypted, chapterIndex);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onApiError(err, 'Phiên truy cập đã hết hiệu lực.');
          return;
        }
        const status = (err as { status?: number } | null)?.status;
        if (status === 429) {
          rateLimitCooldownUntilRef.current = Math.max(
            rateLimitCooldownUntilRef.current,
            computeRateLimitCooldownUntil(err, Date.now()),
          );
        }
      })
      .finally(() => {
        if (prefetchAbortRef.current === controller) {
          prefetchAbortRef.current = null;
        }
      });
  }, [
    bookId,
    chapterIndex,
    effectiveChapterData,
    effectiveChapterError,
    effectiveChapterLocked,
    effectiveLoadingChapter,
    onApiError,
    scrollRatio,
    tocChapters,
  ]);

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
          const status = (err as { status?: number } | null)?.status;
          if (status === 429) {
            rateLimitCooldownUntilRef.current = Math.max(
              rateLimitCooldownUntilRef.current,
              computeRateLimitCooldownUntil(err, Date.now()),
            );
          }
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
