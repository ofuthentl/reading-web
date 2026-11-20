import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  PanelLeft,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { pdfWasmUrl } from '@/lib/parsers';

type PdfReaderProps = {
  url: string;
  fileName: string;
  pageNumber: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function PdfReader({
  url,
  fileName,
  pageNumber,
  pageCount,
  onPageChange,
}: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeRenderRef = useRef<pdfjsLib.RenderTask | null>(null);
  const thumbRefs = useRef<Record<number, HTMLCanvasElement | null>>({});

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.35);
  const [showThumbs, setShowThumbs] = useState(() => window.innerWidth >= 768);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Load PDF document cleanly & reset error on URL change
  useEffect(() => {
    let cancelled = false;
    setRenderError(null);
    setPdf(null);

    const loadingTask = pdfjsLib.getDocument({ url, wasmUrl: pdfWasmUrl });
    void loadingTask.promise
      .then((doc) => {
        if (!cancelled) setPdf(doc);
      })
      .catch(() => {
        if (!cancelled) setRenderError('Không thể hiển thị tệp PDF này.');
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [url]);

  // Render active page with crisp HiDPI scaling & proper RenderTask cancellation
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    const run = async () => {
      try {
        setRendering(true);
        if (activeRenderRef.current) {
          activeRenderRef.current.cancel();
          activeRenderRef.current = null;
        }

        const safePage = Math.max(1, Math.min(pageNumber, pdf.numPages));
        const page = await pdf.getPage(safePage);
        if (cancelled || !canvasRef.current) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        activeRenderRef.current = task;
        await task.promise;
        if (!cancelled) {
          activeRenderRef.current = null;
          setRendering(false);
          if (stageRef.current) stageRef.current.scrollTop = 0;
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (!cancelled && name !== 'RenderingCancelledException') {
          setRenderError('Lỗi khi hiển thị trang PDF.');
          setRendering(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (activeRenderRef.current) {
        activeRenderRef.current.cancel();
        activeRenderRef.current = null;
      }
    };
  }, [pdf, pageNumber, scale]);

  // Render first 40 thumbnails lazily when sidebar is open
  useEffect(() => {
    if (!pdf || !showThumbs) return;
    let cancelled = false;
    const limit = Math.min(pdf.numPages, 40);

    const renderThumbs = async () => {
      for (let i = 1; i <= limit; i += 1) {
        if (cancelled) return;
        const canvas = thumbRefs.current[i];
        if (!canvas || canvas.dataset.rendered === '1') continue;
        try {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 0.18 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          canvas.dataset.rendered = '1';
        } catch {
          // Skip thumbnail failure
        }
      }
    };

    void renderThumbs();
    return () => {
      cancelled = true;
    };
  }, [pdf, showThumbs]);

  if (renderError) {
    return (
      <div className="flex h-[calc(100vh-3.25rem)] items-center justify-center bg-canvas p-8 text-center text-ink-muted">
        <p className="text-sm">{renderError}</p>
      </div>
    );
  }

  return (
    <div className="theme-canvas flex h-[calc(100vh-3.25rem)] flex-col text-ink transition-colors duration-200">
      {/* PDF Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowThumbs((v) => !v)}
            aria-pressed={showThumbs}
            className={`rounded-xl border p-1.5 transition-colors ${
              showThumbs
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
            }`}
            title="Hiện/ẩn danh sách trang"
            aria-label="Hiện hoặc ẩn danh sách trang"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span
            className="hidden max-w-[14rem] truncate text-xs font-medium text-ink-muted sm:inline"
            title={fileName}
          >
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas px-1 py-0.5">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-35"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4.5rem] text-center text-xs font-medium tabular-nums text-ink">
            {pageNumber} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount, pageNumber + 1))}
            disabled={pageNumber >= pageCount}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-35"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-xl border border-line bg-canvas px-1 py-0.5">
            <button
              type="button"
              onClick={() => setScale((v) => Math.max(0.6, Number((v - 0.15).toFixed(2))))}
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              title="Thu nhỏ"
              aria-label="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[3.2rem] text-center text-xs font-medium tabular-nums text-ink">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((v) => Math.min(2.5, Number((v + 0.15).toFixed(2))))}
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              title="Phóng to"
              aria-label="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setScale(1.35)}
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              title="Đặt lại tỉ lệ"
              aria-label="Đặt lại tỉ lệ"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>

          <a
            href={url}
            download={`${fileName}.pdf`}
            className="rounded-xl border border-line bg-canvas p-1.5 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
            title="Tải PDF xuống"
            aria-label="Tải PDF xuống"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* PDF Stage */}
      <div className="flex min-h-0 flex-1">
        {showThumbs && (
          <aside className="scrollbar-thin w-28 shrink-0 overflow-y-auto border-r border-line bg-surface p-2.5 sm:w-36">
            {Array.from({ length: Math.min(pageCount, 40) }, (_, idx) => idx + 1).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onPageChange(num)}
                className={`mb-2.5 block w-full rounded-xl border p-1.5 text-center transition-all ${
                  num === pageNumber
                    ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30'
                    : 'border-line/70 bg-canvas/60 hover:border-line-strong hover:bg-subtle'
                }`}
              >
                <canvas
                  ref={(el) => {
                    thumbRefs.current[num] = el;
                  }}
                  className="mx-auto block w-full rounded-md border border-line/50 bg-white"
                />
                <span
                  className={`mt-1.5 block text-[11px] tabular-nums ${
                    num === pageNumber ? 'font-semibold text-accent' : 'text-ink-muted'
                  }`}
                >
                  {num}
                </span>
              </button>
            ))}
            {pageCount > 40 && (
              <p className="py-2 text-center text-[11px] text-ink-faint">
                ... và {pageCount - 40} trang nữa
              </p>
            )}
          </aside>
        )}

        <div
          ref={stageRef}
          className="scrollbar-thin relative flex-1 overflow-auto p-4 text-center sm:p-8"
          onClick={(event) => {
            if (event.target !== event.currentTarget && event.target !== canvasRef.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            if (ratio < 0.25) onPageChange(Math.max(1, pageNumber - 1));
            else if (ratio > 0.75) onPageChange(Math.min(pageCount, pageNumber + 1));
          }}
        >
          <div className="inline-block overflow-hidden rounded-xl border border-line bg-white shadow-lg dark:border-line-strong/40 dark:shadow-[0_24px_48px_-16px_rgba(0,0,0,0.88)]">
            <canvas
              ref={canvasRef}
              className={`block max-w-full transition-opacity duration-150 ${
                rendering ? 'opacity-70' : 'opacity-100'
              }`}
              aria-label={`Trang ${pageNumber}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
