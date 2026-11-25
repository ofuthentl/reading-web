import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchGuestMediaBitmap } from '@/lib/guestCrypto';
import { paintProtectedThumbnailCanvas } from '@/lib/guestCanvasPaint';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const MAX_CONCURRENT_THUMB_FETCHES = 3;
let activeThumbFetches = 0;
const thumbFetchQueue: Array<() => void> = [];

function drainThumbFetchQueue(): void {
  while (activeThumbFetches < MAX_CONCURRENT_THUMB_FETCHES && thumbFetchQueue.length > 0) {
    const next = thumbFetchQueue.shift();
    if (next) next();
  }
}

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
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeThumbFetches = Math.max(0, activeThumbFetches - 1);
          drainThumbFetchQueue();
        });
    };
    if (activeThumbFetches < MAX_CONCURRENT_THUMB_FETCHES) {
      run();
    } else {
      const onAbort = () => {
        const idx = thumbFetchQueue.indexOf(queuedEntry);
        if (idx >= 0) thumbFetchQueue.splice(idx, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const queuedEntry = () => {
        signal.removeEventListener('abort', onAbort);
        run();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      thumbFetchQueue.push(queuedEntry);
    }
  });
}

export function GuestWatermarkedThumb({
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
  const mountedRef = useRef(true);
  const watermarkRef = useRef(watermarkLabel);
  watermarkRef.current = watermarkLabel;
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
          .then((cloned) => {
            if (!mountedRef.current) {
              cloned.close();
              return;
            }
            onOpen(cloned, true);
          })
          .catch(() => {
            if (mountedRef.current && bitmapRef.current && bitmapRef.current.width > 0) {
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

export function OwnerLazyThumb({
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
