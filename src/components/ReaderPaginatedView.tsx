import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Book, Chapter, ReaderSettings } from '@/types';
import { getBookSortTitle } from '@/lib/bookMetadata';
import {
  READER_FONT_CLASS,
  type ReaderThemePalette,
  handleReaderContentLinkClick,
  resolvePaginatedSpreadWidth,
} from '@/lib/readerConfig';

export interface PaginatedStageHandle {
  stepPrev: () => void;
  stepNext: () => void;
  jumpToRatio: (ratio: number) => void;
}

interface ReaderPaginatedViewProps {
  bookTitle: string;
  chapter: Chapter;
  chapterIndex: number;
  totalChapters: number;
  initialRatio: number;
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  immersiveHidden: boolean;
  onToggleImmersive: () => void;
  onCloseSettings: () => void;
  onRatioChange: (ratio: number, isEndOfChapter: boolean) => void;
  onPrevChapterEnd: () => void;
  onNextChapterStart: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onOpenImage: (src: string, alt: string) => void;
}

export const ReaderPaginatedView = forwardRef<PaginatedStageHandle, ReaderPaginatedViewProps>(
  function ReaderPaginatedView(
    {
      bookTitle,
      chapter,
      chapterIndex,
      totalChapters,
      initialRatio,
      nextBook,
      settings,
      palette,
      immersiveHidden,
      onToggleImmersive,
      onCloseSettings,
      onRatioChange,
      onPrevChapterEnd,
      onNextChapterStart,
      onCompleteBook,
      onOpenImage,
    },
    ref,
  ) {
    const outerRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const wheelCooldownRef = useRef(0);
    const anchorRatioRef = useRef(Math.min(1, Math.max(0, initialRatio)));

    const [stageSize, setStageSize] = useState(() => {
      if (typeof window === 'undefined') return { width: 1280, height: 720 };
      const padX = window.innerWidth >= 640 ? 64 : 32;
      return {
        width: Math.max(260, window.innerWidth - padX),
        height: Math.max(260, window.innerHeight - 116),
      };
    });
    const [totalPages, setTotalPages] = useState(1);
    const [pageIndex, setPageIndex] = useState(0);
    const [animateTurn, setAnimateTurn] = useState(false);

    // Khi đổi chương mới, cập nhật neo ratio ban đầu (0 khi sang chương sau, 1 khi lùi chương trước)
    useLayoutEffect(() => {
      anchorRatioRef.current = Math.min(1, Math.max(0, initialRatio));
    }, [chapter.id, initialRatio]);

    // Đo kích thước khung hiển thị thực tế qua ResizeObserver (D-011)
    useLayoutEffect(() => {
      const el = outerRef.current;
      if (!el) return;
      const measure = () => {
        const nextW = Math.max(260, Math.floor(el.clientWidth));
        const nextH = Math.max(260, Math.floor(el.clientHeight));
        setStageSize((prev) =>
          prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH },
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const geometry = useMemo(() => {
      const usableW = resolvePaginatedSpreadWidth(stageSize.width, settings.width);
      const columns = usableW >= 820 ? 2 : 1;
      const gap = columns === 2 ? 56 : 28;
      const colWidth = Math.max(220, Math.floor((usableW - (columns - 1) * gap) / columns));
      const innerWidth = columns === 2 ? colWidth * 2 + gap : colWidth;
      const stride = (colWidth + gap) * columns;
      const pageHeight = Math.max(240, stageSize.height);
      return { columns, gap, colWidth, innerWidth, stride, pageHeight };
    }, [settings.width, stageSize.height, stageSize.width]);

    const measurePages = useCallback(() => {
      const track = trackRef.current;
      if (!track) return;
      const step = geometry.colWidth + geometry.gap;
      if (step <= 0) return;
      const rawCols = Math.max(1, Math.round((track.scrollWidth + geometry.gap) / step));
      const nextTotal = Math.max(1, Math.ceil(rawCols / geometry.columns));
      setAnimateTurn(false);
      setTotalPages(nextTotal);
      const targetPage = Math.min(
        nextTotal - 1,
        Math.max(0, Math.round(anchorRatioRef.current * (nextTotal - 1))),
      );
      setPageIndex(targetPage);
    }, [geometry.colWidth, geometry.columns, geometry.gap]);

    // Chuyển ảnh sang eager và đo ngay lập tức trước khi paint để 0 lệch trang khi đổi độ rộng/cỡ chữ
    useLayoutEffect(() => {
      const track = trackRef.current;
      if (!track) return;

      const imgs = Array.from(track.querySelectorAll('img'));
      const onImgDone = () => requestAnimationFrame(measurePages);
      for (const img of imgs) {
        img.loading = 'eager';
        if (!img.complete) {
          img.addEventListener('load', onImgDone);
          img.addEventListener('error', onImgDone);
        }
      }

      measurePages();
      const raf1 = requestAnimationFrame(measurePages);
      return () => {
        cancelAnimationFrame(raf1);
        for (const img of imgs) {
          img.removeEventListener('load', onImgDone);
          img.removeEventListener('error', onImgDone);
        }
      };
    }, [
      chapter.id,
      chapter.content_html,
      geometry.colWidth,
      geometry.pageHeight,
      measurePages,
      settings.font,
      settings.fontSizePx,
      settings.lineHeight,
    ]);

    const safePageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

    const commitPage = useCallback(
      (nextPage: number, animate = true) => {
        const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
        const ratio = totalPages > 1 ? clamped / (totalPages - 1) : 1;
        anchorRatioRef.current = ratio;
        setAnimateTurn(animate);
        setPageIndex(clamped);
        onRatioChange(ratio, clamped >= totalPages - 1);
      },
      [onRatioChange, totalPages],
    );

    const stepPrev = useCallback(() => {
      if (safePageIndex > 0) {
        commitPage(safePageIndex - 1, true);
      } else if (chapterIndex > 0) {
        onPrevChapterEnd();
      }
    }, [chapterIndex, commitPage, onPrevChapterEnd, safePageIndex]);

    const stepNext = useCallback(() => {
      if (safePageIndex < totalPages - 1) {
        commitPage(safePageIndex + 1, true);
      } else if (chapterIndex < totalChapters - 1) {
        onNextChapterStart();
      }
    }, [chapterIndex, commitPage, onNextChapterStart, safePageIndex, totalChapters, totalPages]);

    const jumpToRatio = useCallback(
      (ratio: number) => {
        const clampedRatio = Math.min(1, Math.max(0, ratio));
        anchorRatioRef.current = clampedRatio;
        const target = Math.min(
          totalPages - 1,
          Math.max(0, Math.round(clampedRatio * (totalPages - 1))),
        );
        commitPage(target, false);
      },
      [commitPage, totalPages],
    );

    useImperativeHandle(
      ref,
      () => ({ stepPrev, stepNext, jumpToRatio }),
      [jumpToRatio, stepNext, stepPrev],
    );

    const isLastChapter = chapterIndex >= totalChapters - 1;
    const isLastSpread = safePageIndex >= totalPages - 1;
    const isFirstSpread = safePageIndex === 0 && chapterIndex === 0;

    const trackStyle: CSSProperties = {
      width: `${geometry.innerWidth}px`,
      height: `${geometry.pageHeight}px`,
      columnWidth: `${geometry.colWidth}px`,
      columnGap: `${geometry.gap}px`,
      columnFill: 'auto',
      transform: `translate3d(-${safePageIndex * geometry.stride}px, 0, 0)`,
      transition: animateTurn ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      ['--paginated-img-max-h' as string]: `${Math.max(180, geometry.pageHeight - 36)}px`,
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Vùng trang sách lật ngang (CSS Multi-column 1–2 cột, D-011) */}
        <div
          className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2 transition-all duration-200 sm:px-8 ${
            immersiveHidden ? 'pt-5 sm:pt-6' : 'pt-[4.25rem] sm:pt-[4.5rem]'
          }`}
          onClick={(event) => {
            if (handleReaderContentLinkClick(event, trackRef.current)) return;
            onCloseSettings();
            const selection = window.getSelection()?.toString();
            if (selection) return;

            const target = event.target as HTMLElement | null;
            const clickedImg = target?.closest('.reading-content img') as HTMLImageElement | null;
            if (clickedImg?.src) {
              onOpenImage(clickedImg.src, clickedImg.alt || bookTitle);
              return;
            }
            if (target?.closest('button, a, input, select, textarea')) return;

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
          {geometry.columns === 2 && (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0 left-1/2 z-10 border-l transition-[top] duration-200 ${palette.border} ${
                immersiveHidden ? 'top-0' : 'top-[3.25rem]'
              }`}
            />
          )}

          <div ref={outerRef} className="relative h-full w-full">
            <div
              className="relative mx-auto h-full overflow-hidden"
              style={{ width: `${geometry.innerWidth}px` }}
            >
              <div ref={trackRef} style={trackStyle} className="reading-paginated-content">
                <header
                  className={`mb-5 border-b pb-4 text-center ${palette.border}`}
                  style={{ breakInside: 'avoid' }}
                >
                  <p className={`mb-1 text-[11px] uppercase tracking-[0.2em] ${palette.textSecondary}`}>
                    {`Phần ${chapterIndex + 1} / ${totalChapters}`}
                  </p>
                  <h1 className="font-display text-xl font-bold leading-snug sm:text-2xl">
                    {chapter.title}
                  </h1>
                </header>

                <div
                  className={`reading-content ${READER_FONT_CLASS[settings.font]}`}
                  style={{
                    fontSize: `${settings.fontSizePx}px`,
                    lineHeight: settings.lineHeight,
                  }}
                >
                  {chapter.content_html ? (
                    <div dangerouslySetInnerHTML={{ __html: chapter.content_html }} />
                  ) : (
                    chapter.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Thanh chân trang số trang & nút lật trang / hoàn thành */}
        <footer
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-xs sm:px-6 ${palette.border} ${palette.headerBg}`}
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
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onCompleteBook()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Hoàn thành cuốn này!</span>
              </button>
              {nextBook && (
                <button
                  type="button"
                  onClick={() => onCompleteBook(nextBook)}
                  className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground transition hover:bg-accent-hover sm:max-w-[16rem]"
                >
                  <span className="min-w-0 truncate">Đọc tiếp: {getBookSortTitle(nextBook)}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-2 tabular-nums ${palette.textSecondary}`}>
              <span>
                Trang <strong className={palette.textPrimary}>{safePageIndex + 1}</strong> / {totalPages}
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
