import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GuestChapterPayload, HighlightColor, ReaderSettings } from '@/types';
import { useReaderCanvasFontVersion } from '@/hooks/useReaderCanvasFontVersion';
import {
  type ChapterCanvasLayout,
  computeChapterCanvasLayout,
  getInitialGuestStageBox,
} from '@/lib/guestCanvasLayout';
import { paintGuestViewportCanvas } from '@/lib/guestCanvasPaint';
import {
  type ReaderSearchJumpTarget,
  findCanvasItemIndexForQuery,
} from '@/lib/readerSearchJump';

const VIEWPORT_OVERSCAN_PX = 280;

export interface UseGuestCanvasViewportOptions {
  chapterData: GuestChapterPayload | null;
  chapterIndex: number;
  totalChapters: number;
  tocTitles?: readonly string[];
  settings: ReaderSettings;
  isPaginated: boolean;
  showScrollStage: boolean;
  chapterScrollRatio: number;
  effectiveWatermark: string;
  imageSizes: ReadonlyMap<number, { width: number; height: number }>;
  bitmapsRef: MutableRefObject<Map<number, ImageBitmap>>;
  blockHighlightColors: ReadonlyMap<number, HighlightColor>;
  footnoteKeys?: ReadonlySet<string>;
  searchTarget: ReaderSearchJumpTarget | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  restoreTargetRatioRef: MutableRefObject<number | null>;
  suppressSaveRef: MutableRefObject<boolean>;
  lastScrollTopRef: MutableRefObject<number>;
  paintSliceRef: MutableRefObject<() => void>;
  onSearchScrolled: () => void;
}

export function useGuestCanvasViewport({
  chapterData,
  chapterIndex,
  totalChapters,
  tocTitles,
  settings,
  isPaginated,
  showScrollStage,
  chapterScrollRatio,
  effectiveWatermark,
  imageSizes,
  bitmapsRef,
  blockHighlightColors,
  footnoteKeys,
  searchTarget,
  scrollContainerRef,
  canvasRef,
  restoreTargetRatioRef,
  suppressSaveRef,
  lastScrollTopRef,
  paintSliceRef,
  onSearchScrolled,
}: UseGuestCanvasViewportOptions): {
  stageBox: { width: number; height: number };
  layout: ChapterCanvasLayout | null;
  pageHidden: boolean;
  paintVisibleSlice: () => void;
} {
  const [stageBox, setStageBox] = useState(getInitialGuestStageBox);
  const [highlightSourceY, setHighlightSourceY] = useState<number | null>(null);
  const fontVersion = useReaderCanvasFontVersion(settings.font, settings.fontWeight);
  const [pageHidden, setPageHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  const appliedSearchNonceRef = useRef(0);
  const chapterScrollRatioRef = useRef(chapterScrollRatio);
  chapterScrollRatioRef.current = chapterScrollRatio;
  const onSearchScrolledRef = useRef(onSearchScrolled);
  onSearchScrolledRef.current = onSearchScrolled;

  useLayoutEffect(() => {
    if (!showScrollStage) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => {
      const padX = window.innerWidth >= 640 ? 56 : 28;
      const nextWidth = Math.max(240, el.clientWidth - padX);
      const nextHeight = Math.max(280, el.clientHeight);
      setStageBox((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        if (prev.width !== nextWidth && restoreTargetRatioRef.current === null) {
          restoreTargetRatioRef.current = chapterScrollRatioRef.current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [restoreTargetRatioRef, scrollContainerRef, showScrollStage]);

  useEffect(() => {
    const onVisChange = () => setPageHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

  const layout = useMemo(() => {
    void fontVersion;
    if (!chapterData || isPaginated) return null;
    return computeChapterCanvasLayout({
      chapterTitle: chapterData.title,
      chapterIndex,
      totalChapters,
      blocks: chapterData.blocks,
      settings,
      containerWidth: stageBox.width,
      imageSizes,
      blockHighlightColors,
      tocTitles,
    });
  }, [
    blockHighlightColors,
    chapterData,
    chapterIndex,
    fontVersion,
    imageSizes,
    isPaginated,
    settings,
    stageBox.width,
    tocTitles,
    totalChapters,
  ]);

  const paintVisibleSlice = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas || !layout) return;

    const sliceHeight = Math.min(layout.totalHeight, stageBox.height + VIEWPORT_OVERSCAN_PX * 2);
    const maxSliceTop = Math.max(0, layout.totalHeight - sliceHeight);
    const sliceTop = Math.max(0, Math.min(maxSliceTop, Math.floor(scrollEl.scrollTop - VIEWPORT_OVERSCAN_PX)));

    canvas.style.transform = `translateY(${sliceTop}px)`;
    canvas.style.width = `${stageBox.width}px`;
    canvas.style.height = `${sliceHeight}px`;

    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const vTop = scrollEl.scrollTop;
    const vH = scrollEl.clientHeight;
    const focusBand = settings.readingRuler
      ? {
          minY: vTop <= 48 ? 0 : vTop + vH * 0.28,
          maxY: maxScroll <= 0 || vTop >= maxScroll - 64 ? layout.totalHeight : vTop + vH * 0.62,
        }
      : null;

    paintGuestViewportCanvas({
      canvas,
      layout,
      sliceTop,
      sliceHeight,
      canvasCssWidth: stageBox.width,
      theme: settings.theme,
      font: settings.font,
      fontWeight: settings.fontWeight,
      watermarkLabel: effectiveWatermark,
      bitmaps: bitmapsRef.current,
      highlightSourceY,
      footnoteKeys,
      focusBand,
    });
  }, [
    bitmapsRef,
    canvasRef,
    effectiveWatermark,
    footnoteKeys,
    highlightSourceY,
    layout,
    scrollContainerRef,
    settings.font,
    settings.fontWeight,
    settings.readingRuler,
    settings.theme,
    stageBox.height,
    stageBox.width,
  ]);

  paintSliceRef.current = paintVisibleSlice;

  useLayoutEffect(() => {
    if (!isPaginated) paintVisibleSlice();
  }, [isPaginated, paintVisibleSlice]);

  useLayoutEffect(() => {
    if (isPaginated || !layout || !scrollContainerRef.current || restoreTargetRatioRef.current === null) {
      return;
    }
    suppressSaveRef.current = true;
    const el = scrollContainerRef.current;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.round(maxScroll * restoreTargetRatioRef.current);
    lastScrollTopRef.current = el.scrollTop;
    restoreTargetRatioRef.current = null;
    suppressSaveRef.current = false;
    paintVisibleSlice();
  }, [isPaginated, lastScrollTopRef, layout, paintVisibleSlice, restoreTargetRatioRef, scrollContainerRef, suppressSaveRef]);

  useEffect(() => {
    if (isPaginated || !layout || !searchTarget || searchTarget.chapterIndex !== chapterIndex) return;
    if (appliedSearchNonceRef.current === searchTarget.nonce) return;

    const idx = findCanvasItemIndexForQuery(layout.items, searchTarget.query, searchTarget.occurrenceIndex);
    appliedSearchNonceRef.current = searchTarget.nonce;
    if (idx < 0) return;

    const matchedItem = layout.items[idx];
    const el = scrollContainerRef.current;
    if (el) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(maxScroll, Math.round(matchedItem.y - el.clientHeight * 0.28)));
      onSearchScrolledRef.current();
    }
    setHighlightSourceY(matchedItem.y);
    const timer = window.setTimeout(() => setHighlightSourceY(null), 2250);
    return () => window.clearTimeout(timer);
  }, [chapterIndex, isPaginated, layout, scrollContainerRef, searchTarget]);

  return {
    stageBox,
    layout,
    pageHidden,
    paintVisibleSlice,
  };
}
