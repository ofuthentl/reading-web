import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Eye, EyeOff, Image as ImageIcon, Loader2, Lock, RefreshCw } from 'lucide-react';
import type { Book, Chapter, GuestBookIllustrationItem } from '@/types';
import {
  fetchGuestBookIllustrations,
  fetchGuestMediaBitmap,
} from '@/lib/guestCrypto';
import { paintProtectedThumbnailCanvas } from '@/lib/guestCanvasPaint';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const LAZY_PLACEHOLDER_PREFIX = 'data:image/gif;base64,R0lGODlhAQAB';

const MAX_CONCURRENT_THUMB_FETCHES = 3;
let activeThumbFetches = 0;
const thumbFetchQueue: Array<() => void> = [];

function scheduleThumbFetch<T>(
  task: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const run = () => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      activeThumbFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeThumbFetches = Math.max(0, activeThumbFetches - 1);
          const next = thumbFetchQueue.shift();
          if (next) next();
        });
    };
    if (activeThumbFetches < MAX_CONCURRENT_THUMB_FETCHES) {
      run();
    } else {
      const onAbort = () => {
        const idx = thumbFetchQueue.indexOf(run);
        if (idx >= 0) thumbFetchQueue.splice(idx, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      thumbFetchQueue.push(() => {
        signal.removeEventListener('abort', onAbort);
        run();
      });
    }
  });
}

interface GalleryItem {
  key: string;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  alt: string | null;
  domSrc?: string;
  zipPath?: string;
  mediaIndex?: number;
}

export interface ReaderIllustrationGalleryProps {
  book: Book;
  parsedChapters?: Chapter[];
  resolveOwnerMediaUrl?: (zipPath: string) => Promise<string | null>;
  activeIndex: number;
  maxUnlockedChapterIndex: number;
  watermarkLabel?: string;
  palette: ReaderThemePalette;
  onSelectChapter: (chapterIndex: number) => void;
  onOpenDomImage?: (src: string, alt: string) => void;
  onOpenGuestImage?: (bitmap: ImageBitmap, alt: string, ownedBitmap?: boolean) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onCloseDrawer: () => void;
}

function GuestWatermarkedThumb({
  bookId,
  mediaIndex,
  watermarkLabel,
  alt,
  palette,
  onOpen,
}: {
  bookId: string;
  mediaIndex: number;
  watermarkLabel: string;
  alt: string;
  palette: ReaderThemePalette;
  onOpen: (bitmap: ImageBitmap, ownedBitmap?: boolean) => void;
}) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const watermarkRef = useRef(watermarkLabel);
  watermarkRef.current = watermarkLabel;
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '140px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let cancelled = false;
    setFailed(false);
    setReady(false);

    scheduleThumbFetch(
      () => fetchGuestMediaBitmap(bookId, mediaIndex, controller.signal),
      controller.signal,
    )
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmapRef.current = bmp;
        if (canvasRef.current) {
          paintProtectedThumbnailCanvas({
            canvas: canvasRef.current,
            bitmap: bmp,
            watermarkLabel: watermarkRef.current,
          });
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [bookId, mediaIndex, retryCount, visible]);

  useEffect(() => {
    if (ready && bitmapRef.current && canvasRef.current) {
      paintProtectedThumbnailCanvas({
        canvas: canvasRef.current,
        bitmap: bitmapRef.current,
        watermarkLabel,
      });
    }
  }, [ready, watermarkLabel]);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={() => {
        if (failed) {
          setRetryCount((n) => n + 1);
          return;
        }
        const bmp = bitmapRef.current;
        if (!bmp || bmp.width <= 0 || bmp.height <= 0) return;
        // Nhân bản ImageBitmap độc lập để khi đóng ngăn kéo (unmount & close bmp gốc) Lightbox vẫn an toàn
        void createImageBitmap(bmp)
          .then((cloned) => onOpen(cloned, true))
          .catch(() => {
            if (bitmapRef.current && bitmapRef.current.width > 0) {
              onOpen(bitmapRef.current, false);
            }
          });
      }}
      aria-label={failed ? `Thử tải lại ${alt}` : alt}
      className="relative aspect-[3/4] w-full overflow-hidden bg-black/10 text-left"
    >
      <canvas
        ref={canvasRef}
        className={`pointer-events-none h-full w-full transition-opacity duration-200 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {!ready && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-[11px] ${palette.textSecondary}`}
        >
          {failed ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 opacity-75" />
              <span>Chạm để thử lại</span>
            </>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin opacity-60" />
          )}
        </div>
      )}
    </button>
  );
}

function OwnerLazyThumb({
  zipPath,
  alt,
  palette,
  resolveMediaUrl,
  onOpen,
}: {
  zipPath: string;
  alt: string;
  palette: ReaderThemePalette;
  resolveMediaUrl: (zipPath: string) => Promise<string | null>;
  onOpen: (src: string) => void;
}) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '140px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setFailed(false);
    void resolveMediaUrl(zipPath)
      .then((url) => {
        if (cancelled) return;
        if (url) setSrc(url);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resolveMediaUrl, retryCount, visible, zipPath]);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={() => {
        if (failed) {
          setRetryCount((n) => n + 1);
          return;
        }
        if (src) onOpen(src);
      }}
      aria-label={failed ? `Thử tải lại ${alt}` : alt}
      className="group relative aspect-[3/4] w-full overflow-hidden bg-black/5"
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className={`flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] ${palette.textSecondary}`}
        >
          {failed ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 opacity-75" />
              <span>Chạm để thử lại</span>
            </>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin opacity-60" />
          )}
        </div>
      )}
    </button>
  );
}

export function ReaderIllustrationGallery({
  book,
  parsedChapters,
  resolveOwnerMediaUrl,
  activeIndex,
  maxUnlockedChapterIndex,
  watermarkLabel = 'Ofu Library',
  palette,
  onSelectChapter,
  onOpenDomImage,
  onOpenGuestImage,
  onApiError,
  onCloseDrawer,
}: ReaderIllustrationGalleryProps) {
  const isOwnerMode = Boolean(parsedChapters);
  const [hideSpoilers, setHideSpoilers] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());
  const [guestItems, setGuestItems] = useState<GuestBookIllustrationItem[] | null>(null);
  const [loadingGuest, setLoadingGuest] = useState(!isOwnerMode);

  useEffect(() => {
    if (isOwnerMode) return;
    const controller = new AbortController();
    setLoadingGuest(true);
    fetchGuestBookIllustrations(book.id, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setGuestItems(list);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setGuestItems([]);
        onApiError?.(err, 'Không thể tải danh sách minh hoạ.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGuest(false);
      });
    return () => controller.abort();
  }, [book.id, isOwnerMode, onApiError]);

  const items = useMemo<GalleryItem[]>(() => {
    if (parsedChapters) {
      const out: GalleryItem[] = [];
      const seenKey = new Set<string>();
      for (let idx = 0; idx < parsedChapters.length; idx += 1) {
        const ch = parsedChapters[idx];
        if (!ch.content_html) continue;
        const doc = new DOMParser().parseFromString(ch.content_html, 'text/html');
        for (const img of Array.from(
          doc.querySelectorAll('img[src], img[data-zip-path], svg image[href], svg image[data-zip-path]'),
        )) {
          const rawSrc = img.getAttribute('src') || img.getAttribute('href') || '';
          const zipPath = img.getAttribute('data-zip-path') || undefined;
          const readyDomSrc =
            rawSrc && rawSrc !== 'data:,' && !rawSrc.startsWith(LAZY_PLACEHOLDER_PREFIX)
              ? rawSrc
              : undefined;
          const dedupKey = zipPath || readyDomSrc;
          if (!dedupKey || seenKey.has(dedupKey)) continue;
          seenKey.add(dedupKey);
          const alt = img.getAttribute('alt')?.trim() || null;
          out.push({
            key: `dom_${idx}_${out.length}`,
            chapterIndex: idx,
            chapterNumber: ch.chapter_number || idx + 1,
            chapterTitle: ch.title,
            alt,
            ...(readyDomSrc ? { domSrc: readyDomSrc } : {}),
            ...(zipPath ? { zipPath } : {}),
          });
        }
      }
      return out;
    }

    return (guestItems || []).map((it) => ({
      key: `guest_${it.mediaIndex}`,
      chapterIndex: it.chapterIndex,
      chapterNumber: it.chapterNumber,
      chapterTitle: it.chapterTitle,
      alt: it.alt,
      mediaIndex: it.mediaIndex,
    }));
  }, [guestItems, parsedChapters]);

  const unlockedLimit = Math.max(activeIndex, maxUnlockedChapterIndex);
  const spoilerCount = useMemo(
    () => items.filter((it) => it.chapterIndex > unlockedLimit).length,
    [items, unlockedLimit],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2.5 ${palette.border}`}>
        <span className={`text-[11px] font-medium ${palette.textSecondary}`}>
          {loadingGuest ? 'Đang quét ảnh...' : `${items.length} minh hoạ trong tập`}
        </span>

        {spoilerCount > 0 && (
          <button
            type="button"
            onClick={() => setHideSpoilers((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              hideSpoilers ? palette.active : `${palette.border} ${palette.hover}`
            }`}
          >
            {hideSpoilers ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>Che chưa đọc ({spoilerCount})</span>
          </button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {loadingGuest ? (
          <div className={`flex flex-col items-center justify-center gap-2 py-12 text-xs ${palette.textSecondary}`}>
            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
            <span>Đang tải chỉ mục minh hoạ...</span>
          </div>
        ) : items.length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-xs ${palette.textSecondary}`}>
            <ImageIcon className="h-6 w-6 opacity-50" />
            <p>Tập sách này không có trang minh hoạ đi kèm.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item, idx) => {
              const isLockedSpoiler =
                hideSpoilers &&
                item.chapterIndex > unlockedLimit &&
                !revealedKeys.has(item.key);
              const altText = item.alt || `${book.title} — Minh hoạ #${idx + 1}`;

              return (
                <div
                  key={item.key}
                  className={`flex flex-col overflow-hidden rounded-xl border ${palette.border}`}
                >
                  {isLockedSpoiler ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedKeys((prev) => {
                          const next = new Set(prev);
                          next.add(item.key);
                          return next;
                        })
                      }
                      className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 px-2 text-center transition ${palette.hover}`}
                    >
                      <Lock className="h-4 w-4 text-amber-500" />
                      <span className="text-[11px] font-semibold">Chưa đọc tới</span>
                      <span className={`line-clamp-1 text-[10px] ${palette.textSecondary}`}>
                        Phần {item.chapterNumber}
                      </span>
                      <span className="mt-0.5 rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] font-medium">
                        Bấm để hé mở
                      </span>
                    </button>
                  ) : item.domSrc ? (
                    <button
                      type="button"
                      onClick={() => onOpenDomImage?.(item.domSrc!, altText)}
                      className="group relative aspect-[3/4] w-full overflow-hidden bg-black/5"
                    >
                      <img
                        src={item.domSrc}
                        alt={altText}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </button>
                  ) : item.zipPath && resolveOwnerMediaUrl ? (
                    <OwnerLazyThumb
                      zipPath={item.zipPath}
                      alt={altText}
                      palette={palette}
                      resolveMediaUrl={resolveOwnerMediaUrl}
                      onOpen={(src) => onOpenDomImage?.(src, altText)}
                    />
                  ) : item.mediaIndex !== undefined ? (
                    <GuestWatermarkedThumb
                      bookId={book.id}
                      mediaIndex={item.mediaIndex}
                      watermarkLabel={watermarkLabel}
                      alt={altText}
                      palette={palette}
                      onOpen={(bmp, owned) => onOpenGuestImage?.(bmp, altText, owned)}
                    />
                  ) : null}

                  <div className={`flex items-center justify-between gap-1 border-t px-2 py-1.5 ${palette.border}`}>
                    <span className={`min-w-0 truncate text-[10.5px] ${palette.textSecondary}`}>
                      #{idx + 1} · Phần {item.chapterNumber}
                    </span>
                    <button
                      type="button"
                      disabled={isLockedSpoiler}
                      onClick={() => {
                        onSelectChapter(item.chapterIndex);
                        onCloseDrawer();
                      }}
                      title={isLockedSpoiler ? 'Hé mở ảnh trước khi nhảy tới chương chưa đọc' : `Tới ${item.chapterTitle}`}
                      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${palette.accentText} ${palette.hover}`}
                    >
                      <span>Tới</span>
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
