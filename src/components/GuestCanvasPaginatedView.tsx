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
import type { Book, GuestChapterPayload, HighlightColor, ReaderSettings } from '@/types';
import { ReaderPaginatedFooter } from '@/components/ReaderPaginatedFooter';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { useCanvasPaginatedReadingRuler } from '@/hooks/usePaginatedReadingRuler';
import { useReaderCanvasFontVersion } from '@/hooks/useReaderCanvasFontVersion';
import type { ResolvedFootnoteItem } from '@/lib/epubFootnotes';
import { computeChapterCanvasLayout } from '@/lib/guestCanvasLayout';
import {
  type CanvasFootnoteHitRect,
  type CanvasImageHitRect,
  paginateCanvasLayoutItems,
  paintGuestPaginatedCanvas,
} from '@/lib/guestCanvasPages';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import {
  type ReaderThemePalette,
  resolvePaginatedSpreadWidth,
} from '@/lib/readerConfig';
import {
  type ReaderSearchJumpTarget,
  findCanvasItemIndexForQuery,
} from '@/lib/readerSearchJump';

interface GuestCanvasPaginatedViewProps {
  bookId: string;
  bookTitle: string;
  chapterData: GuestChapterPayload;
  expectedChapterId?: string;
  chapterIndex: number;
  totalChapters: number;
  tocTitles?: readonly string[];
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  initialRatio: number;
  watermarkLabel: string;
  imageSizes: ReadonlyMap<number, { width: number; height: number }>;
  bitmapsRef: React.MutableRefObject<Map<number, ImageBitmap>>;
  blockHighlightColors?: ReadonlyMap<number, HighlightColor>;
  footnoteMap?: ReadonlyMap<string, string>;
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  immersiveHidden: boolean;
  pageHidden: boolean;
  remainingEstimate?: string;
  searchTarget?: ReaderSearchJumpTarget | null;
  onToggleImmersive: () => void;
  onCloseSettings: () => boolean;
  onRatioChange: (ratio: number, isEndOfChapter: boolean) => void;
  onPrevChapterEnd: () => void;
  onNextChapterStart: () => void;
  onOpenToc?: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onOpenGuestImage: (bitmap: ImageBitmap, alt: string) => void;
  onOpenFootnote?: (footnote: ResolvedFootnoteItem) => void;
  onPageTurn?: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export const GuestCanvasPaginatedView = forwardRef<PaginatedStageHandle, GuestCanvasPaginatedViewProps>(
  function GuestCanvasPaginatedView(
    {
      bookId,
      bookTitle,
      chapterData,
      expectedChapterId,
      chapterIndex,
      totalChapters,
      tocTitles,
      currentChapterNumber,
      readerMaxChapterNumber,
      chapterOptions,
      initialRatio,
      watermarkLabel,
      imageSizes,
      bitmapsRef,
      blockHighlightColors,
      footnoteMap,
      nextBook,
      settings,
      palette,
      immersiveHidden,
      pageHidden,
      remainingEstimate,
      searchTarget = null,
      onToggleImmersive,
      onCloseSettings,
      onRatioChange,
      onPrevChapterEnd,
      onNextChapterStart,
      onOpenToc,
      onCompleteBook,
      onOpenGuestImage,
      onOpenFootnote,
      onPageTurn,
      onApiError,
    },
    ref,
  ) {
    const outerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const hitRectsRef = useRef<CanvasImageHitRect[]>([]);
    const footnoteRectsRef = useRef<CanvasFootnoteHitRect[]>([]);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const wheelCooldownRef = useRef(0);
    const anchorRatioRef = useRef(Math.min(1, Math.max(0, initialRatio)));

    const [stageSize, setStageSize] = useState(() => {
      if (typeof window === 'undefined') return { width: 1280, height: 720 };
      const padX = window.innerWidth >= 640 ? 56 : 28;
      return {
        width: Math.max(260, window.innerWidth - padX),
        height: Math.max(260, window.innerHeight - 116),
      };
    });
    const [spreadIndex, setSpreadIndex] = useState(0);
    const [flashSourceY, setFlashSourceY] = useState<number | null>(null);
    const appliedSearchNonceRef = useRef(0);
    const fontVersion = useReaderCanvasFontVersion(settings.font, settings.fontWeight);

    const footnoteKeys = useMemo(
      () => (footnoteMap && footnoteMap.size > 0 ? new Set(footnoteMap.keys()) : undefined),
      [footnoteMap],
    );

    const isChapterSynced = !expectedChapterId || chapterData.id === expectedChapterId;

    useLayoutEffect(() => {
      if (!isChapterSynced) return;
      anchorRatioRef.current = Math.min(1, Math.max(0, initialRatio));
    }, [chapterData.id, initialRatio, isChapterSynced]);

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
      const columns: 1 | 2 = usableW >= 820 ? 2 : 1;
      const columnGap = columns === 2 ? 48 : 0;
      const columnWidth = Math.max(220, Math.floor((usableW - columnGap) / columns));
      const pageHeight = Math.max(260, stageSize.height);
      return { columns, columnGap, columnWidth, pageHeight };
    }, [settings.width, stageSize.height, stageSize.width]);

    const { layoutItems, columnPages } = useMemo(() => {
      void fontVersion;
      const layout = computeChapterCanvasLayout({
        chapterTitle: chapterData.title,
        chapterIndex,
        totalChapters,
        blocks: chapterData.blocks,
        settings: { ...settings, width: 'wide' },
        containerWidth: geometry.columnWidth,
        imageSizes,
        blockHighlightColors,
        tocTitles,
      });
      return {
        layoutItems: layout.items,
        columnPages: paginateCanvasLayoutItems(layout.items, geometry.pageHeight - 18),
      };
    }, [
      blockHighlightColors,
      chapterData,
      chapterIndex,
      fontVersion,
      geometry.columnWidth,
      geometry.pageHeight,
      imageSizes,
      settings,
      tocTitles,
      totalChapters,
    ]);

    const totalSpreads = Math.max(1, Math.ceil(columnPages.length / geometry.columns));
    const safeSpreadIndex = Math.max(0, Math.min(spreadIndex, totalSpreads - 1));
    const singleSpreadEndReportedRef = useRef<string | null>(null);

    useEffect(() => {
      if (isChapterSynced && chapterIndex === totalChapters - 1 && totalSpreads === 1) {
        if (singleSpreadEndReportedRef.current !== chapterData.id) {
          singleSpreadEndReportedRef.current = chapterData.id;
          onRatioChange(1, true);
        }
      } else {
        singleSpreadEndReportedRef.current = null;
      }
    }, [chapterData.id, chapterIndex, isChapterSynced, onRatioChange, totalChapters, totalSpreads]);

    useLayoutEffect(() => {
      const target = Math.min(
        totalSpreads - 1,
        Math.max(0, Math.round(anchorRatioRef.current * (totalSpreads - 1))),
      );
      setSpreadIndex(target);
    }, [chapterData.id, totalSpreads]);

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

    const animateCanvasSlide = useCallback((direction: -1 | 1) => {
      const canvas = canvasRef.current;
      if (!canvas || typeof canvas.animate !== 'function') return;
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      canvas.animate(
        [
          { opacity: 0.72, transform: `translate3d(${direction * 22}px, 0, 0)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }, []);

    const stepPrev = useCallback(() => {
      if (safeSpreadIndex > 0) {
        onPageTurn?.(); commitSpread(safeSpreadIndex - 1); animateCanvasSlide(-1);
      } else if (chapterIndex > 0) {
        onPageTurn?.(); onPrevChapterEnd();
      }
    }, [animateCanvasSlide, chapterIndex, commitSpread, onPageTurn, onPrevChapterEnd, safeSpreadIndex]);

    const stepNext = useCallback(() => {
      if (safeSpreadIndex < totalSpreads - 1) {
        onPageTurn?.(); commitSpread(safeSpreadIndex + 1); animateCanvasSlide(1);
      } else if (chapterIndex < totalChapters - 1) {
        onPageTurn?.(); onNextChapterStart();
      }
    }, [animateCanvasSlide, chapterIndex, commitSpread, onNextChapterStart, onPageTurn, safeSpreadIndex, totalChapters, totalSpreads]);

    const leftIdx = safeSpreadIndex * geometry.columns;
    const leftPage = columnPages[leftIdx] ?? null;
    const rightPage = geometry.columns === 2 ? columnPages[leftIdx + 1] ?? null : null;
    const { focusedTarget, updateFromClientPoint } = useCanvasPaginatedReadingRuler({
      enabled: settings.readingRuler, columns: geometry.columns, spreadIndex: safeSpreadIndex,
      chapterId: chapterData.id, leftPage, rightPage, canvasRef,
      onStepPrevSpread: stepPrev, onStepNextSpread: stepNext,
    });

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      hitRectsRef.current = paintGuestPaginatedCanvas({
        canvas, leftPage, rightPage, columnWidth: geometry.columnWidth, columnGap: geometry.columnGap,
        pageHeight: geometry.pageHeight, columns: geometry.columns, theme: settings.theme,
        font: settings.font, fontWeight: settings.fontWeight,
        watermarkLabel, bitmaps: bitmapsRef.current, highlightSourceY: flashSourceY, footnoteKeys,
        footnoteHitRectsOut: footnoteRectsRef.current, focusedTarget,
      });
    }, [
      bitmapsRef, flashSourceY, focusedTarget, footnoteKeys, geometry.columnGap, geometry.columnWidth,
      geometry.columns, geometry.pageHeight, imageSizes, leftPage, rightPage,
      settings.font, settings.fontWeight, settings.theme, watermarkLabel,
    ]);

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

    const getVisibleCanvasSlice = useCallback(() => {
      const leftIdx = safeSpreadIndex * geometry.columns;
      const leftPage = columnPages[leftIdx] ?? null;
      const rightPage = geometry.columns === 2 ? columnPages[leftIdx + 1] ?? null : null;
      const combined = [...(leftPage?.items ?? []), ...(rightPage?.items ?? [])];
      if (combined.length === 0) return null;
      return {
        items: combined,
        minY: leftPage?.startY ?? 0,
        maxY: rightPage?.endY ?? leftPage?.endY ?? 999_999,
      };
    }, [columnPages, geometry.columns, safeSpreadIndex]);

    useImperativeHandle(
      ref,
      () => ({ stepPrev, stepNext, jumpToRatio, getVisibleCanvasSlice }),
      [getVisibleCanvasSlice, jumpToRatio, stepNext, stepPrev],
    );

    useEffect(() => {
      if (!isChapterSynced || !searchTarget || searchTarget.chapterIndex !== chapterIndex) return;
      if (appliedSearchNonceRef.current === searchTarget.nonce) return;
      appliedSearchNonceRef.current = searchTarget.nonce;

      const idx = findCanvasItemIndexForQuery(
        layoutItems,
        searchTarget.query,
        searchTarget.occurrenceIndex,
      );
      if (idx < 0) return;
      const matched = layoutItems[idx];
      const colIdx = columnPages.findIndex(
        (p) => matched.y >= p.startY - 2 && matched.y <= p.endY + 2,
      );
      if (colIdx >= 0) {
        commitSpread(Math.floor(colIdx / geometry.columns));
      }
      setFlashSourceY(matched.y);
      const timer = window.setTimeout(() => setFlashSourceY(null), 2250);
      return () => window.clearTimeout(timer);
    }, [
      chapterData.id, chapterIndex, columnPages, commitSpread,
      geometry.columns, isChapterSynced, layoutItems, searchTarget,
    ]);

    const isLastChapter = chapterIndex >= totalChapters - 1;
    const isLastSpread = safeSpreadIndex >= totalSpreads - 1;
    const isFirstSpread = safeSpreadIndex === 0 && chapterIndex === 0;

    return (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden transition-all ${pageHidden ? 'blur-lg' : ''}`}>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3.5 pb-2 pt-[3.75rem] sm:px-7 sm:pt-[4rem]"
          onMouseMove={(event) => updateFromClientPoint(event.clientX, event.clientY)}
          onClick={(event) => {
            if (onCloseSettings()) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, select, textarea')) return;

            if (canvasRef.current) {
              const cRect = canvasRef.current.getBoundingClientRect();
              const cx = event.clientX - cRect.left;
              const cy = event.clientY - cRect.top;

              if (footnoteMap && onOpenFootnote) {
                for (const fnHit of footnoteRectsRef.current) {
                  if (cx >= fnHit.x && cx <= fnHit.x + fnHit.width && cy >= fnHit.y && cy <= fnHit.y + fnHit.height) {
                    const content = footnoteMap.get(fnHit.key);
                    if (content) {
                      onOpenFootnote({
                        markerLabel: fnHit.markerLabel,
                        content,
                        anchorX: event.clientX,
                        anchorY: event.clientY,
                      });
                      return;
                    }
                  }
                }
              }

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
              className={`reader-spine-gutter pointer-events-none absolute bottom-0 left-1/2 z-10 w-10 -translate-x-1/2 transition-[top] duration-200 ${
                immersiveHidden ? 'top-0' : 'top-[3.25rem]'
              }`}
            />
          )}

          <div ref={outerRef} className="flex h-full w-full items-center justify-center">
            <canvas
              ref={canvasRef}
              aria-label="Trang đọc sách bảo mật"
              className="pointer-events-none block"
            />
          </div>
        </div>

        <ReaderPaginatedFooter
          bookId={bookId} bookTitle={bookTitle} chapterIndex={chapterIndex} totalChapters={totalChapters}
          currentChapterNumber={currentChapterNumber} readerMaxChapterNumber={readerMaxChapterNumber}
          chapterOptions={chapterOptions} currentPage={safeSpreadIndex + 1} totalPages={totalSpreads}
          isFirstSpread={isFirstSpread} isLastChapter={isLastChapter} isLastSpread={isLastSpread}
          remainingEstimate={remainingEstimate} nextBook={nextBook} palette={palette}
          onStepPrev={stepPrev} onStepNext={stepNext} onOpenToc={onOpenToc} onCompleteBook={onCompleteBook} onApiError={onApiError}
        />
      </div>
    );
  },
);
