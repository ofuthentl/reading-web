import { useEffect, useRef, useState } from 'react';
import type { GuestChapterPayload } from '@/types';
import { isAuthError } from '@/lib/api';
import {
  fetchGuestChapterDecrypted,
  fetchGuestMediaBitmap,
} from '@/lib/guestCrypto';

const MAX_RAM_CHAPTERS = 12;
const MAX_RAM_BITMAPS = 24;

interface UseGuestChapterStreamOptions {
  bookId: string;
  chapterIndex: number;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useGuestChapterStream({
  bookId,
  chapterIndex,
  onApiError,
}: UseGuestChapterStreamOptions) {
  const [chapterData, setChapterData] = useState<GuestChapterPayload | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [imageSizes, setImageSizes] = useState<Map<number, { width: number; height: number }>>(
    () => new Map(),
  );

  const chapterCacheRef = useRef<Map<number, GuestChapterPayload>>(new Map());
  const bitmapsRef = useRef<Map<number, ImageBitmap>>(new Map());

  // Thu hồi toàn bộ chương RAM & đóng sạch mọi ImageBitmap khi đóng sách
  useEffect(() => {
    const cacheMap = chapterCacheRef.current;
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
    const cached = chapterCacheRef.current.get(chapterIndex);
    if (cached) {
      setChapterData(cached);
      setChapterError(null);
      setLoadingChapter(false);
      return;
    }

    const controller = new AbortController();
    setLoadingChapter(true);
    setChapterError(null);
    setChapterData(null);

    void fetchGuestChapterDecrypted(bookId, chapterIndex, controller.signal)
      .then((decrypted) => {
        if (controller.signal.aborted) return;
        const cache = chapterCacheRef.current;
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
        setLoadingChapter(false);
        setChapterError(
          err instanceof Error ? err.message : 'Không thể tải nội dung chương.',
        );
      });

    return () => controller.abort();
  }, [bookId, chapterIndex, onApiError, retryNonce]);

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
    const run = async () => {
      for (const mediaIndex of neededIndices) {
        if (controller.signal.aborted) return;
        try {
          const bmp = await fetchGuestMediaBitmap(bookId, mediaIndex, controller.signal);
          if (controller.signal.aborted) {
            bmp.close();
            return;
          }
          evictOldBitmaps();
          bitmapsRef.current.set(mediaIndex, bmp);
          setImageSizes((prev) => {
            const next = new Map(prev);
            next.set(mediaIndex, { width: bmp.width, height: bmp.height });
            return next;
          });
        } catch (err) {
          if (isAuthError(err)) {
            onApiError(err, 'Phiên truy cập đã hết hiệu lực.');
            return;
          }
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [bookId, chapterData, onApiError]);

  const retryChapter = () => setRetryNonce((n) => n + 1);

  return {
    chapterData,
    loadingChapter,
    chapterError,
    imageSizes,
    bitmapsRef,
    retryChapter,
  };
}
