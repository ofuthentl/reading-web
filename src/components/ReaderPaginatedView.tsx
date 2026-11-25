import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Book, BookHighlight, Chapter, ReaderSettings } from '@/types';
import { ReaderPaginatedFooter } from '@/components/ReaderPaginatedFooter';
import { useDomPaginatedReadingRuler } from '@/hooks/usePaginatedReadingRuler';
import { applyChapterDomHighlights } from '@/lib/domHighlights';
import type { CanvasLayoutItem } from '@/lib/guestCanvasLayout';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import {
  READER_FONT_CLASS, type ReaderThemePalette,
  findClickedReaderImage, handleReaderContentLinkClick, resolvePaginatedSpreadWidth,
} from '@/lib/readerConfig';
import { buildReaderTypographyStyle } from '@/lib/readingEstimate';
import { type ReaderSearchJumpTarget, findDomBlockForSearchQuery, flashDomSearchElement } from '@/lib/readerSearchJump';
import { isTocChapterTitle, stripDuplicateLeadingTocHeadingHtml } from '@/lib/tocFormat';

export interface PaginatedStageHandle {
  stepPrev: () => void;
  stepNext: () => void;
  jumpToRatio: (ratio: number) => void;
  getVisibleCanvasSlice?: () => { items: CanvasLayoutItem[]; minY: number; maxY: number } | null;
}

interface ReaderPaginatedViewProps {
  bookId: string;
  bookTitle: string;
  chapter: Chapter;
  chapterIndex: number;
  totalChapters: number;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  initialRatio: number;
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  immersiveHidden: boolean;
  remainingEstimate?: string;
  searchTarget?: ReaderSearchJumpTarget | null;
  chapterHighlights?: readonly BookHighlight[];
  onContentInteractionClick?: (event: ReactMouseEvent, container: HTMLElement | null) => boolean;
  onSelectionEnd?: (container: HTMLElement | null) => void;
  onToggleImmersive: () => void;
  onCloseSettings: () => boolean;
  onRatioChange: (ratio: number, isEndOfChapter: boolean) => void;
  onPrevChapterEnd: () => void;
  onNextChapterStart: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onOpenImage: (src: string, alt: string) => void;
  onPageTurn?: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export const ReaderPaginatedView = forwardRef<PaginatedStageHandle, ReaderPaginatedViewProps>(
  function ReaderPaginatedView(
    {
      bookId,
      bookTitle,
      chapter,
      chapterIndex,
      totalChapters,
      currentChapterNumber,
      readerMaxChapterNumber,
      chapterOptions,
      initialRatio,
      nextBook,
      settings,
      palette,
      immersiveHidden,
      remainingEstimate,
      searchTarget = null,
      chapterHighlights = [],
      onContentInteractionClick,
      onSelectionEnd,
      onToggleImmersive,
      onCloseSettings,
      onRatioChange,
      onPrevChapterEnd,
      onNextChapterStart,
      onCompleteBook,
      onOpenImage,
      onPageTurn,
      onApiError,
    },
    ref,
  ) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const outerRef = useRef<HTMLDivElement | null>(null);
    const clipRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLElement | null>(null);
    const rulerIndicatorRef = useRef<HTMLSpanElement | null>(null);
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
    const [imagesSettled, setImagesSettled] = useState(false);

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
      if (clipRef.current) clipRef.current.scrollLeft = 0;
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

    useLayoutEffect(() => {
      applyChapterDomHighlights(trackRef.current, chapterHighlights);
    }, [chapter.id, chapter.content_html, chapterHighlights]);

    // Chuyển ảnh sang eager và đo ngay lập tức trước khi paint để 0 lệch trang khi đổi độ rộng/cỡ chữ
    useLayoutEffect(() => {
      const track = trackRef.current;
      if (!track) return;

      const imgs = Array.from(track.querySelectorAll('img'));
      let pendingImgs = 0;
      let imgRaf = 0;
      let settleTimer = 0;
      const markSettledIfDone = () => {
        if (pendingImgs <= 0) setImagesSettled(true);
      };
      const onImgDone = () => {
        pendingImgs = Math.max(0, pendingImgs - 1);
        if (imgRaf) cancelAnimationFrame(imgRaf);
        imgRaf = requestAnimationFrame(() => {
          measurePages();
          markSettledIfDone();
        });
      };
      for (const img of imgs) {
        img.loading = 'eager';
        if (!img.complete) {
          pendingImgs += 1;
          img.addEventListener('load', onImgDone);
          img.addEventListener('error', onImgDone);
        }
      }

      setImagesSettled(pendingImgs === 0);
      if (pendingImgs > 0) {
        settleTimer = window.setTimeout(() => setImagesSettled(true), 1600);
      }

      measurePages();
      const raf1 = requestAnimationFrame(measurePages);
      return () => {
        cancelAnimationFrame(raf1);
        if (imgRaf) cancelAnimationFrame(imgRaf);
        if (settleTimer) window.clearTimeout(settleTimer);
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
      settings.fontWeight,
      settings.fontSizePx,
      settings.lineHeight,
      settings.paragraphIndent,
      settings.paragraphSpacing,
      settings.textAlign,
    ]);

    const safePageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const singlePageEndReportedRef = useRef<string | null>(null);

    // Tự động ghi nhận hoàn thành khi chương cuối chỉ có đúng 1 trang sau khi ảnh đã ổn định
    useEffect(() => {
      if (chapterIndex === totalChapters - 1 && totalPages === 1 && imagesSettled) {
        if (singlePageEndReportedRef.current !== chapter.id) {
          singlePageEndReportedRef.current = chapter.id;
          onRatioChange(1, true);
        }
      } else {
        singlePageEndReportedRef.current = null;
      }
    }, [chapter.id, chapterIndex, imagesSettled, onRatioChange, totalChapters, totalPages]);

    const commitPage = useCallback(
      (nextPage: number, animate = true) => {
        if (clipRef.current) clipRef.current.scrollLeft = 0;
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
        onPageTurn?.();
        commitPage(safePageIndex - 1, true);
      } else if (chapterIndex > 0) {
        onPageTurn?.();
        onPrevChapterEnd();
      }
    }, [chapterIndex, commitPage, onPageTurn, onPrevChapterEnd, safePageIndex]);

    const stepNext = useCallback(() => {
      if (safePageIndex < totalPages - 1) {
        onPageTurn?.();
        commitPage(safePageIndex + 1, true);
      } else if (chapterIndex < totalChapters - 1) {
        onPageTurn?.();
        onNextChapterStart();
      }
    }, [chapterIndex, commitPage, onNextChapterStart, onPageTurn, safePageIndex, totalChapters, totalPages]);

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

    const flashCleanupRef = useRef<(() => void) | null>(null);
    const appliedSearchNonceRef = useRef(0);

    useEffect(() => {
      return () => {
        flashCleanupRef.current?.();
        flashCleanupRef.current = null;
      };
    }, []);

    const jumpToElementInTrack = useCallback(
      (el: HTMLElement) => {
        const track = trackRef.current;
        if (!track) return;
        if (clipRef.current) clipRef.current.scrollLeft = 0;
        const trackRect = track.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const relLeft = Math.max(0, elRect.left - trackRect.left);
        const step = Math.max(1, geometry.colWidth + geometry.gap);
        const colIdx = Math.floor((relLeft + 4) / step);
        const targetPage = Math.min(
          totalPages - 1,
          Math.max(0, Math.floor(colIdx / geometry.columns)),
        );
        commitPage(targetPage, false);
        flashCleanupRef.current?.();
        flashCleanupRef.current = flashDomSearchElement(el);
      },
      [commitPage, geometry.colWidth, geometry.columns, geometry.gap, totalPages],
    );

    useEffect(() => {
      if (!searchTarget || searchTarget.chapterIndex !== chapterIndex) return;
      if (appliedSearchNonceRef.current === searchTarget.nonce) return;
      const timer = window.setTimeout(() => {
        const track = trackRef.current;
        if (!track) return;
        const matched = findDomBlockForSearchQuery(
          track,
          searchTarget.query,
          searchTarget.occurrenceIndex,
        );
        appliedSearchNonceRef.current = searchTarget.nonce;
        if (!matched) return;
        jumpToElementInTrack(matched);
      }, 60);
      return () => window.clearTimeout(timer);
    }, [chapter.id, chapterIndex, jumpToElementInTrack, searchTarget]);

    const isLastChapter = chapterIndex >= totalChapters - 1;
    const isLastSpread = safePageIndex >= totalPages - 1;
    const isFirstSpread = safePageIndex === 0 && chapterIndex === 0;
    const isTocChapter = isTocChapterTitle(chapter.title);
    const chapterHtml = useMemo(
      () => (chapter.content_html && isTocChapter ? stripDuplicateLeadingTocHeadingHtml(chapter.content_html, chapter.title) : chapter.content_html),
      [chapter.content_html, chapter.title, isTocChapter],
    );
    const rulerDepsKey = `${chapter.id}:${safePageIndex}:${totalPages}:${geometry.columns}:${geometry.colWidth}:${geometry.pageHeight}:${settings.fontSizePx}:${settings.lineHeight}:${imagesSettled}`;
    const { updateFromClientPoint } = useDomPaginatedReadingRuler({
      enabled: settings.readingRuler, columns: geometry.columns, pageIndex: safePageIndex,
      chapterId: chapter.id, layoutDepsKey: rulerDepsKey, stageRef, clipRef, trackRef,
      headerRef, indicatorRef: rulerIndicatorRef, onStepPrevPage: stepPrev, onStepNextPage: stepNext,
    });

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const trackStyle: CSSProperties = {
      width: `${geometry.innerWidth}px`,
      height: `${geometry.pageHeight}px`,
      columnWidth: `${geometry.colWidth}px`,
      columnGap: `${geometry.gap}px`,
      columnFill: 'auto',
      transform: `translate3d(-${safePageIndex * geometry.stride}px, 0, 0)`,
      transition:
        animateTurn && !reducedMotion ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      ['--paginated-img-max-h' as string]: `${Math.max(180, geometry.pageHeight - 36)}px`,
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Vùng trang sách lật ngang (CSS Multi-column 1–2 cột, D-011) — giữ padding cố định tránh ResizeObserver thrashing */}
        <div
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-2 pt-[3.75rem] sm:px-8 sm:pt-[4rem]"
          onMouseMove={(event) => updateFromClientPoint(event.clientX, event.clientY)}
          onMouseUp={() => onSelectionEnd?.(trackRef.current)}
          onClick={(event) => {
            if (onCloseSettings()) return;
            if (onContentInteractionClick?.(event, trackRef.current)) return;
            if (handleReaderContentLinkClick(event, trackRef.current, jumpToElementInTrack)) return;
            const selection = window.getSelection()?.toString();
            if (selection) return;

            const clickedImg = findClickedReaderImage(event.target, bookTitle);
            if (clickedImg) {
              onOpenImage(clickedImg.src, clickedImg.alt);
              return;
            }
            const target = event.target as HTMLElement | null;
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
            if (event.touches.length !== 1) {
              touchStartRef.current = null;
              return;
            }
            const touch = event.touches[0];
            if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchMove={(event) => {
            if (event.touches.length > 1) {
              touchStartRef.current = null;
              return;
            }
            const touch = event.touches[0];
            const start = touchStartRef.current;
            if (settings.readingRuler && touch && start && touch.clientX > 28) {
              const dx = Math.abs(touch.clientX - start.x);
              const dy = Math.abs(touch.clientY - start.y);
              if (dy > 10 && dy > dx * 1.2) updateFromClientPoint(touch.clientX, touch.clientY);
            }
          }}
          onTouchEnd={(event) => {
            onSelectionEnd?.(trackRef.current);
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (window.getSelection()?.toString()) return;
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
              className={`reader-spine-gutter pointer-events-none absolute bottom-0 left-1/2 z-10 w-10 -translate-x-1/2 transition-[top] duration-200 ${
                immersiveHidden ? 'top-0' : 'top-[3.25rem]'
              }`}
            />
          )}
          {settings.readingRuler && (
            <span
              ref={rulerIndicatorRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 z-20 w-[2.5px] rounded-full bg-amber-500/75 transition-[transform,height,opacity] duration-150 ease-out"
              style={{ opacity: 0, height: '24px' }}
            />
          )}

          <div ref={outerRef} className="relative h-full w-full">
            <div
              ref={clipRef}
              className="relative mx-auto h-full overflow-hidden"
              style={{ width: `${geometry.innerWidth}px` }}
            >
              <div ref={trackRef} style={trackStyle} className="reading-paginated-content">
                <header
                  ref={headerRef}
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
                  className={`reading-content ${isTocChapter ? 'reading-content-toc ' : ''}${READER_FONT_CLASS[settings.font]}`}
                  style={buildReaderTypographyStyle(settings)}
                >
                  {chapterHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: chapterHtml }} />
                  ) : (
                    chapter.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ReaderPaginatedFooter
          bookId={bookId} bookTitle={bookTitle} chapterIndex={chapterIndex} totalChapters={totalChapters}
          currentChapterNumber={currentChapterNumber} readerMaxChapterNumber={readerMaxChapterNumber}
          chapterOptions={chapterOptions} currentPage={safePageIndex + 1} totalPages={totalPages}
          isFirstSpread={isFirstSpread} isLastChapter={isLastChapter} isLastSpread={isLastSpread}
          remainingEstimate={remainingEstimate} nextBook={nextBook} palette={palette}
          onStepPrev={stepPrev} onStepNext={stepNext} onCompleteBook={onCompleteBook} onApiError={onApiError}
        />
      </div>
    );
  },
);
