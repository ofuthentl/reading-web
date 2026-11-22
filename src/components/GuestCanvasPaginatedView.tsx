import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Book, GuestChapterPayload, ReaderSettings } from '@/types';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { getBookSortTitle } from '@/lib/bookMetadata';
import { computeChapterCanvasLayout } from '@/lib/guestCanvasLayout';
import {
  type CanvasImageHitRect,
  paginateCanvasLayoutItems,
  paintGuestPaginatedCanvas,
} from '@/lib/guestCanvasPages';
import type { ReaderThemePalette } from '@/lib/readerConfig';

interface GuestCanvasPaginatedViewProps {
  bookTitle: string;
  chapterData: GuestChapterPayload;
  chapterIndex: number;
  totalChapters: number;
  initialRatio: number;
  watermarkLabel: string;
  imageSizes: ReadonlyMap<number, { width: number; height: number }>;
  bitmapsRef: React.MutableRefObject<Map<number, ImageBitmap>>;
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  immersiveHidden: boolean;
  pageHidden: boolean;
  onToggleImmersive: () => void;
  onCloseSettings: () => void;
  onRatioChange: (ratio: number, isEndOfChapter: boolean) => void;
  onPrevChapterEnd: () => void;
  onNextChapterStart: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onOpenGuestImage: (bitmap: ImageBitmap, alt: string) => void;
}

const SPREAD_WIDTH_MAX_PX: Record<ReaderSettings['width'], number> = {
  narrow: 920,
  medium: 1120,
  wide: 1320,
};

export const GuestCanvasPaginatedView = forwardRef<PaginatedStageHandle, GuestCanvasPaginatedViewProps>(
  function GuestCanvasPaginatedView(
    {
      bookTitle,
      chapterData,
      chapterIndex,
      totalChapters,
      initialRatio,
      watermarkLabel,
      imageSizes,
      bitmapsRef,
      nextBook,
      settings,
      palette,
      immersiveHidden,
      pageHidden,
      onToggleImmersive,
      onCloseSettings,
      onRatioChange,
      onPrevChapterEnd,
      onNextChapterStart,
      onCompleteBook,
      onOpenGuestImage,
    },
    ref,
  ) {
    const outerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hitRectsRef = useRef<CanvasImageHitRect[]>([]);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const wheelCooldownRef = useRef(0);
    const anchorRatioRef = useRef(Math.min(1, Math.max(0, initialRatio)));

    const [stageSize, setStageSize] = useState({ width: 960, height: 600 });
    const [spreadIndex, setSpreadIndex] = useState(0);

    useEffect(() => {
      anchorRatioRef.current = Math.min(1, Math.max(0, initialRatio));
    }, [chapterData.id, initialRatio]);

    useEffect(() => {
      const el = outerRef.current;
      if (!el) return;
      const measure = () => {
        setStageSize({
          width: Math.max(260, Math.floor(el.clientWidth)),
          height: Math.max(260, Math.floor(el.clientHeight)),
        });
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const geometry = useMemo(() => {
      const usableW = Math.min(stageSize.width, SPREAD_WIDTH_MAX_PX[settings.width]);
      const columns: 1 | 2 = usableW >= 820 ? 2 : 1;
      const columnGap = columns === 2 ? 48 : 0;
      const columnWidth = Math.max(220, Math.floor((usableW - columnGap) / columns));
      const pageHeight = Math.max(260, stageSize.height);
      return { columns, columnGap, columnWidth, pageHeight };
    }, [settings.width, stageSize.height, stageSize.width]);

    const columnPages = useMemo(() => {
      const layout = computeChapterCanvasLayout({
        chapterTitle: chapterData.title,
        chapterIndex,
        totalChapters,
        blocks: chapterData.blocks,
        settings: { ...settings, width: 'wide' },
        containerWidth: geometry.columnWidth,
        imageSizes,
      });
      return paginateCanvasLayoutItems(layout.items, geometry.pageHeight - 18);
    }, [
      chapterData,
      chapterIndex,
      geometry.columnWidth,
      geometry.pageHeight,
      imageSizes,
      settings,
      totalChapters,
    ]);

    const totalSpreads = Math.max(1, Math.ceil(columnPages.length / geometry.columns));

    useEffect(() => {
      const target = Math.min(
        totalSpreads - 1,
        Math.max(0, Math.round(anchorRatioRef.current * (totalSpreads - 1))),
      );
      setSpreadIndex(target);
    }, [chapterData.id, totalSpreads]);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const leftIdx = spreadIndex * geometry.columns;
      const leftPage = columnPages[leftIdx] ?? null;
      const rightPage = geometry.columns === 2 ? columnPages[leftIdx + 1] ?? null : null;

      hitRectsRef.current = paintGuestPaginatedCanvas({
        canvas,
        leftPage,
        rightPage,
        columnWidth: geometry.columnWidth,
        columnGap: geometry.columnGap,
        pageHeight: geometry.pageHeight,
        columns: geometry.columns,
        theme: settings.theme,
        font: settings.font,
        watermarkLabel,
        bitmaps: bitmapsRef.current,
      });
    }, [
      bitmapsRef,
      columnPages,
      geometry.columnGap,
      geometry.columnWidth,
      geometry.columns,
      geometry.pageHeight,
      imageSizes,
      settings.font,
      settings.theme,
      spreadIndex,
      watermarkLabel,
    ]);

    const commitSpread = useCallback(
      (nextSpread: number) => {
        const clamped = Math.max(0, Math.min(totalSpreads - 1, nextSpread));
        const ratio = totalSpreads > 1 ? clamped / (totalSpreads - 1) : 1;
        anchorRatioRef.current = ratio;
        setSpreadIndex(clamped);
        onRatioChange(ratio, clamped >= totalSpreads - 1);
      },
      [onRatioChange, totalSpreads],
    );

    const stepPrev = useCallback(() => {
      if (spreadIndex > 0) commitSpread(spreadIndex - 1);
      else if (chapterIndex > 0) onPrevChapterEnd();
    }, [chapterIndex, commitSpread, onPrevChapterEnd, spreadIndex]);

    const stepNext = useCallback(() => {
      if (spreadIndex < totalSpreads - 1) commitSpread(spreadIndex + 1);
      else if (chapterIndex < totalChapters - 1) onNextChapterStart();
    }, [chapterIndex, commitSpread, onNextChapterStart, spreadIndex, totalChapters, totalSpreads]);

    const jumpToRatio = useCallback(
      (ratio: number) => {
        const clampedRatio = Math.min(1, Math.max(0, ratio));
        anchorRatioRef.current = clampedRatio;
        const target = Math.min(
          totalSpreads - 1,
          Math.max(0, Math.round(clampedRatio * (totalSpreads - 1))),
        );
        commitSpread(target);
      },
      [commitSpread, totalSpreads],
    );

    useImperativeHandle(
      ref,
      () => ({ stepPrev, stepNext, jumpToRatio }),
      [jumpToRatio, stepNext, stepPrev],
    );

    const isLastChapter = chapterIndex >= totalChapters - 1;
    const isLastSpread = spreadIndex >= totalSpreads - 1;
    const isFirstSpread = spreadIndex === 0 && chapterIndex === 0;

    return (
      <div className={`flex flex-1 flex-col overflow-hidden transition-all ${pageHidden ? 'blur-lg' : ''}`}>
        <div
          className={`relative flex flex-1 items-center justify-center overflow-hidden px-3.5 pb-2 transition-all duration-200 sm:px-7 ${
            immersiveHidden ? 'pt-5 sm:pt-6' : 'pt-[4.25rem] sm:pt-[4.5rem]'
          }`}
          onClick={(event) => {
            onCloseSettings();
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, select, textarea')) return;

            if (canvasRef.current) {
              const cRect = canvasRef.current.getBoundingClientRect();
              const cx = event.clientX - cRect.left;
              const cy = event.clientY - cRect.top;
              for (const hit of hitRectsRef.current) {
                if (cx >= hit.x && cx <= hit.x + hit.width && cy >= hit.y && cy <= hit.y + hit.height) {
                  const bmp = bitmapsRef.current.get(hit.mediaIndex);
                  if (bmp) {
                    onOpenGuestImage(bmp, hit.alt || bookTitle);
                    return;
                  }
                }
              }
            }

            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            if (settings.sideTapNavigation && ratio < 0.18) {
              stepPrev();
              return;
            }
            if (settings.sideTapNavigation && ratio > 0.82) {
              stepNext();
              return;
            }
            if (ratio >= 0.25 && ratio <= 0.75) {
              onToggleImmersive();
            }
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            const end = event.changedTouches[0];
            if (!start || !end) return;
            const dx = end.clientX - start.x;
            const dy = end.clientY - start.y;
            if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.35) {
              if (dx < 0) stepNext();
              else stepPrev();
            }
          }}
          onWheel={(event) => {
            const now = Date.now();
            if (now - wheelCooldownRef.current < 240) return;
            const primaryDelta =
              Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (Math.abs(primaryDelta) < 28) return;
            wheelCooldownRef.current = now;
            if (primaryDelta > 0) stepNext();
            else stepPrev();
          }}
        >
          <div ref={outerRef} className="flex h-full w-full max-w-[1320px] items-center justify-center">
            <canvas
              ref={canvasRef}
              aria-label="Trang đọc sách bảo mật"
              className="pointer-events-none block rounded-lg"
            />
          </div>
        </div>

        <footer
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs sm:px-6 ${palette.border} ${palette.headerBg}`}
        >
          <button
            type="button"
            onClick={stepPrev}
            disabled={isFirstSpread}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Trang trước</span>
          </button>

          {isLastChapter && isLastSpread ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onCompleteBook()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Hoàn thành cuốn này!</span>
              </button>
              {nextBook && (
                <button
                  type="button"
                  onClick={() => onCompleteBook(nextBook)}
                  className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground transition hover:bg-accent-hover"
                >
                  <span className="truncate">Đọc tiếp: {getBookSortTitle(nextBook)}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-2 tabular-nums ${palette.textSecondary}`}>
              <span>
                Trang <strong className={palette.textPrimary}>{spreadIndex + 1}</strong> / {totalSpreads}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Chương {chapterIndex + 1}/{totalChapters}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={stepNext}
            disabled={isLastChapter && isLastSpread}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
          >
            <span>Trang sau</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    );
  },
);
