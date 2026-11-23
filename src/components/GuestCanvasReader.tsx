import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Book, Chapter, GuestTocItem, ReaderSettings, ReadingProgress } from '@/types';
import { GuestCanvasPaginatedView } from '@/components/GuestCanvasPaginatedView';
import { ReaderChapterEndNav } from '@/components/ReaderChapterEndNav';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { ReaderTocDrawer } from '@/components/ReaderTocDrawer';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import { useGuestChapterStream } from '@/hooks/useGuestChapterStream';
import { useReaderController } from '@/hooks/useReaderController';
import {
  computeChapterCanvasLayout,
  findCanvasLayoutImageAtPoint,
  getInitialGuestStageBox,
} from '@/lib/guestCanvasLayout';
import { paintGuestViewportCanvas } from '@/lib/guestCanvasPaint';
import { READER_THEME_STYLES } from '@/lib/readerConfig';

const LazyReaderImageLightbox = lazy(() =>
  import('@/components/ReaderImageLightbox').then((mod) => ({ default: mod.ReaderImageLightbox })),
);

const VIEWPORT_OVERSCAN_PX = 280;

export interface GuestCanvasReaderProps {
  book: Book;
  tocChapters: GuestTocItem[];
  watermarkLabel: string;
  initialProgress?: ReadingProgress;
  nextBook?: Book | null;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  onOpenNextBook?: (nextBook: Book) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
}

export function GuestCanvasReader({
  book,
  tocChapters,
  watermarkLabel,
  initialProgress,
  nextBook,
  settings,
  onUpdateSettings,
  onSaveProgress,
  onOpenNextBook,
  onApiError,
  onClose,
}: GuestCanvasReaderProps) {
  const isPaginated = settings.layoutMode === 'paginated';
  const initialIdx = useMemo(() => {
    if (!initialProgress || tocChapters.length === 0) return 0;
    const byId = tocChapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, tocChapters.length - 1));
  }, [initialProgress, tocChapters]);

  const initialStartRatio =
    initialProgress && initialProgress.chapterId === tocChapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : 0;

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [chapterScrollRatio, setChapterScrollRatio] = useState(initialStartRatio);
  const [paginatedStartRatio, setPaginatedStartRatio] = useState(initialStartRatio);
  const [stageBox, setStageBox] = useState(getInitialGuestStageBox);
  const [pageHidden, setPageHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  const {
    chapterData, loadingChapter, chapterError, imageSizes, bitmapsRef, retryChapter,
  } = useGuestChapterStream({ bookId: book.id, chapterIndex, onApiError });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paginatedRef = useRef<PaginatedStageHandle>(null);
  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress && initialProgress.chapterId === tocChapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : null,
  );
  const suppressSaveRef = useRef(false);
  const goPrevRef = useRef<() => void>(() => undefined);
  const goNextRef = useRef<() => void>(() => undefined);

  const ctrl = useReaderController({
    initialCompleted: Boolean(initialProgress?.completed),
    isPdf: false,
    settings,
    blockCopyShortcuts: true,
    onSaveProgress,
    onPrev: () => goPrevRef.current(),
    onNext: () => goNextRef.current(),
  });
  const {
    tocOpen, setTocOpen, drawerTab, settingsOpen, setSettingsOpen,
    immersiveHidden, setImmersiveHidden, lightboxTarget, setLightboxTarget,
    lastScrollTopRef, completedRef, flushProgress, queueProgressSave,
    openDrawerTab, updateImmersiveOnScroll,
  } = ctrl;

  const palette = READER_THEME_STYLES[settings.theme];
  const currentTocItem = tocChapters[chapterIndex];

  const tocDrawerChapters = useMemo<Chapter[]>(
    () =>
      tocChapters.map((item) => ({
        id: item.id, book_id: book.id, title: item.title, content: '', chapter_number: item.chapterNumber,
      })),
    [book.id, tocChapters],
  );

  const showScrollStage = !loadingChapter && !chapterError && !isPaginated;

  useLayoutEffect(() => {
    if (!showScrollStage) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => {
      const padX = el.clientWidth >= 640 ? 56 : 28;
      const nextWidth = Math.max(240, el.clientWidth - padX);
      const nextHeight = Math.max(280, el.clientHeight);
      setStageBox((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [showScrollStage]);

  useEffect(() => {
    const onVisChange = () => setPageHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

  const layout = useMemo(() => {
    if (!chapterData || isPaginated) return null;
    return computeChapterCanvasLayout({
      chapterTitle: chapterData.title,
      chapterIndex,
      totalChapters: tocChapters.length,
      blocks: chapterData.blocks,
      settings,
      containerWidth: stageBox.width,
      imageSizes,
    });
  }, [chapterData, chapterIndex, imageSizes, isPaginated, settings, stageBox.width, tocChapters.length]);

  const effectiveWatermark = chapterData?.watermarkLabel || watermarkLabel || 'Guest';

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

    paintGuestViewportCanvas({
      canvas, layout, sliceTop, sliceHeight,
      canvasCssWidth: stageBox.width,
      theme: settings.theme,
      font: settings.font,
      watermarkLabel: effectiveWatermark,
      bitmaps: bitmapsRef.current,
    });
  }, [bitmapsRef, effectiveWatermark, layout, settings.font, settings.theme, stageBox.height, stageBox.width]);

  useLayoutEffect(() => {
    if (!isPaginated) paintVisibleSlice();
  }, [isPaginated, paintVisibleSlice]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (patch.layoutMode && patch.layoutMode !== settings.layoutMode) {
        if (patch.layoutMode === 'paginated') setPaginatedStartRatio(chapterScrollRatio);
        else restoreTargetRatioRef.current = chapterScrollRatio;
      } else if (!isPaginated && (patch.width || patch.fontSizePx || patch.lineHeight || patch.font)) {
        restoreTargetRatioRef.current = chapterScrollRatio;
      }
      onUpdateSettings(patch);
    },
    [chapterScrollRatio, isPaginated, onUpdateSettings, settings.layoutMode],
  );

  const goToChapter = useCallback(
    (nextIndex: number, targetRatio = 0) => {
      const clamped = Math.max(0, Math.min(nextIndex, tocChapters.length - 1));
      const target = tocChapters[clamped];
      if (!target) return;

      const safeRatio = Math.min(1, Math.max(0, targetRatio));
      setTocOpen(false);
      setImmersiveHidden(false);

      if (clamped === chapterIndex) {
        setChapterScrollRatio(safeRatio);
        if (isPaginated) {
          paginatedRef.current?.jumpToRatio(safeRatio);
        } else if (scrollContainerRef.current) {
          const el = scrollContainerRef.current;
          const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = Math.round(maxScroll * safeRatio);
          paintVisibleSlice();
        }
        return;
      }

      suppressSaveRef.current = true;
      restoreTargetRatioRef.current = safeRatio;
      lastScrollTopRef.current = 0;
      setPaginatedStartRatio(safeRatio);
      setChapterScrollRatio(safeRatio);
      setChapterIndex(clamped);

      queueProgressSave(
        {
          chapterId: target.id, chapterIndex: clamped, chapterTitle: target.title,
          totalChapters: tocChapters.length, scrollRatio: safeRatio, scrollTop: 0,
          completed: completedRef.current, updatedAt: Date.now(),
        },
        true,
      );
    },
    [
      chapterIndex, completedRef, isPaginated, lastScrollTopRef, paintVisibleSlice,
      queueProgressSave, setImmersiveHidden, setTocOpen, tocChapters,
    ],
  );

  const goPrevChapter = useCallback(() => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1, 0);
  }, [chapterIndex, goToChapter]);

  const goNextChapter = useCallback(() => {
    if (chapterIndex < tocChapters.length - 1) goToChapter(chapterIndex + 1, 0);
  }, [chapterIndex, goToChapter, tocChapters.length]);

  goPrevRef.current = isPaginated ? () => paginatedRef.current?.stepPrev() : goPrevChapter;
  goNextRef.current = isPaginated ? () => paginatedRef.current?.stepNext() : goNextChapter;

  const handlePaginatedRatioChange = useCallback(
    (ratio: number, isEndOfChapter: boolean) => {
      if (!currentTocItem) return;
      setChapterScrollRatio(ratio);
      const reachedEnd = chapterIndex === tocChapters.length - 1 && isEndOfChapter;
      if (reachedEnd) completedRef.current = true;
      queueProgressSave(
        {
          chapterId: currentTocItem.id, chapterIndex, chapterTitle: currentTocItem.title,
          totalChapters: tocChapters.length, scrollRatio: ratio, scrollTop: 0,
          completed: completedRef.current, updatedAt: Date.now(),
        },
        reachedEnd,
      );
    },
    [chapterIndex, completedRef, currentTocItem, queueProgressSave, tocChapters.length],
  );

  const handleScroll = useCallback(() => {
    if (isPaginated) return;
    paintVisibleSlice();
    const el = scrollContainerRef.current;
    if (!el || !currentTocItem || !layout) return;

    const currentTop = el.scrollTop;
    updateImmersiveOnScroll(currentTop, suppressSaveRef.current);

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, currentTop / maxScroll)) : 1;
    setChapterScrollRatio(ratio);
    if (suppressSaveRef.current) return;

    const reachedEndOfBook =
      chapterIndex === tocChapters.length - 1 && (maxScroll === 0 || ratio >= 0.97);
    if (reachedEndOfBook) completedRef.current = true;

    queueProgressSave(
      {
        chapterId: currentTocItem.id, chapterIndex, chapterTitle: currentTocItem.title,
        totalChapters: tocChapters.length, scrollRatio: ratio, scrollTop: currentTop,
        completed: completedRef.current, updatedAt: Date.now(),
      },
      reachedEndOfBook,
    );
  }, [
    chapterIndex, completedRef, currentTocItem, isPaginated, layout,
    paintVisibleSlice, queueProgressSave, tocChapters.length, updateImmersiveOnScroll,
  ]);

  useLayoutEffect(() => {
    if (isPaginated || !layout || !scrollContainerRef.current || restoreTargetRatioRef.current === null) return;
    suppressSaveRef.current = true;
    const el = scrollContainerRef.current;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.round(maxScroll * restoreTargetRatioRef.current);
    lastScrollTopRef.current = el.scrollTop;
    restoreTargetRatioRef.current = null;
    suppressSaveRef.current = false;
    paintVisibleSlice();
  }, [isPaginated, lastScrollTopRef, layout, paintVisibleSlice]);

  const completeBook = useCallback(
    (targetNextBook?: Book) => {
      completedRef.current = true;
      if (currentTocItem) {
        queueProgressSave(
          {
            chapterId: currentTocItem.id, chapterIndex, chapterTitle: currentTocItem.title,
            totalChapters: tocChapters.length, scrollRatio: 1,
            scrollTop: scrollContainerRef.current?.scrollTop || 0,
            completed: true, updatedAt: Date.now(),
          },
          true,
        );
      }
      if (targetNextBook && onOpenNextBook) onOpenNextBook(targetNextBook);
      else onClose();
    },
    [chapterIndex, completedRef, currentTocItem, onClose, onOpenNextBook, queueProgressSave, tocChapters.length],
  );

  const overallPercent = useMemo(() => {
    if (tocChapters.length === 0) return 0;
    return Math.min(100, Math.round(((chapterIndex + chapterScrollRatio) / tocChapters.length) * 100));
  }, [chapterIndex, chapterScrollRatio, tocChapters.length]);

  const watermarkBadge = (
    <span
      className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:inline-flex ${palette.border} ${palette.textSecondary}`}
      title="Chế độ đọc bảo vệ bản quyền — gắn thuỷ vân định danh phiên Discord"
    >
      <ShieldCheck className="h-3 w-3 text-emerald-500" />
      {effectiveWatermark}
    </span>
  );

  return (
    <div
      className={`guest-protected-reader relative flex h-full min-h-0 flex-1 select-none flex-col overflow-hidden transition-colors duration-200 ${palette.pageBg} ${palette.textPrimary}`}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <ReaderTopBar
        bookTitle={book.title}
        chapterTitle={currentTocItem?.title}
        overallPercent={overallPercent}
        immersiveHidden={immersiveHidden}
        settingsOpen={settingsOpen}
        settings={settings}
        palette={palette}
        statusBadge={watermarkBadge}
        onBack={() => { flushProgress(); onClose(); }}
        onOpenDrawerTab={openDrawerTab}
        onHideToolbar={() => { setSettingsOpen(false); setImmersiveHidden(true); }}
        onToggleSettings={() => { setTocOpen(false); setSettingsOpen((v) => !v); }}
        onCloseSettings={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
      />

      {tocOpen && (
        <ReaderTocDrawer
          book={book}
          chapters={tocDrawerChapters}
          activeIndex={chapterIndex}
          currentChapterId={currentTocItem?.id || ''}
          currentChapterTitle={currentTocItem?.title || ''}
          currentScrollRatio={chapterScrollRatio}
          initialTab={drawerTab}
          isPdf={false}
          palette={palette}
          onSelectChapter={(idx) => goToChapter(idx, 0)}
          onJumpToBookmark={goToChapter}
          onClose={() => setTocOpen(false)}
        />
      )}

      {loadingChapter ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin opacity-70" />
          <p className={`text-sm ${palette.textSecondary}`}>Đang mở trang sách...</p>
        </div>
      ) : chapterError ? (
        <div className="mx-auto flex flex-1 max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertCircle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium">{chapterError}</p>
          <button
            type="button"
            onClick={retryChapter}
            className={`mt-1 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition ${palette.border} ${palette.hover}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử tải lại chương
          </button>
        </div>
      ) : isPaginated && chapterData ? (
        <GuestCanvasPaginatedView
          ref={paginatedRef}
          bookTitle={book.title}
          chapterData={chapterData}
          chapterIndex={chapterIndex}
          totalChapters={tocChapters.length}
          initialRatio={paginatedStartRatio}
          watermarkLabel={effectiveWatermark}
          imageSizes={imageSizes}
          bitmapsRef={bitmapsRef}
          nextBook={nextBook}
          settings={settings}
          palette={palette}
          immersiveHidden={immersiveHidden}
          pageHidden={pageHidden}
          onToggleImmersive={() => setImmersiveHidden((prev) => !prev)}
          onCloseSettings={() => {
            if (settingsOpen) setSettingsOpen(false);
          }}
          onRatioChange={handlePaginatedRatioChange}
          onPrevChapterEnd={() => {
            if (chapterIndex > 0) goToChapter(chapterIndex - 1, 1);
          }}
          onNextChapterStart={() => {
            if (chapterIndex < tocChapters.length - 1) goToChapter(chapterIndex + 1, 0);
          }}
          onCompleteBook={completeBook}
          onOpenGuestImage={(bitmap, alt) =>
            setLightboxTarget({ kind: 'guest-bitmap', bitmap, watermarkLabel: effectiveWatermark, alt })
          }
        />
      ) : (
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onClick={(event) => {
            if (settingsOpen) {
              setSettingsOpen(false);
              return;
            }
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, select, textarea')) return;

            if (layout && stageWrapRef.current) {
              const stageRect = stageWrapRef.current.getBoundingClientRect();
              const hitImg = findCanvasLayoutImageAtPoint(
                layout,
                stageBox.width,
                event.clientX - stageRect.left,
                event.clientY - stageRect.top,
              );
              const bitmap = hitImg ? bitmapsRef.current.get(hitImg.mediaIndex) : undefined;
              if (hitImg && bitmap) {
                setLightboxTarget({
                  kind: 'guest-bitmap',
                  bitmap,
                  watermarkLabel: effectiveWatermark,
                  alt: hitImg.alt || book.title,
                });
                return;
              }
            }

            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            if (settings.sideTapNavigation && ratio < 0.16) goPrevChapter();
            else if (settings.sideTapNavigation && ratio > 0.84) goNextChapter();
            else if (immersiveHidden && ratio >= 0.22 && ratio <= 0.78) setImmersiveHidden(false);
          }}
          className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3.5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-16 transition-all sm:px-7 sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:pt-[4.5rem] ${
            pageHidden ? 'blur-lg' : ''
          }`}
        >
          {layout && (
            <div className="mx-auto" style={{ width: `${stageBox.width}px` }}>
              <div
                ref={stageWrapRef}
                className="relative w-full overflow-hidden rounded-lg"
                style={{ height: `${layout.totalHeight}px` }}
              >
                <canvas
                  ref={canvasRef}
                  aria-label="Trang đọc sách"
                  className="pointer-events-none absolute left-0 top-0 block"
                />
              </div>
              <ReaderChapterEndNav
                chapterIndex={chapterIndex}
                totalChapters={tocChapters.length}
                palette={palette}
                nextBook={nextBook}
                onPrev={goPrevChapter}
                onNext={goNextChapter}
                onCompleteAndClose={() => completeBook()}
                onCompleteAndOpenNext={(nb) => completeBook(nb)}
              />
            </div>
          )}
        </main>
      )}

      <div className="h-1 w-full shrink-0 bg-black/10">
        <div
          className={`h-full transition-all duration-150 ${palette.progressBar}`}
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      {lightboxTarget && (
        <Suspense fallback={null}>
          <LazyReaderImageLightbox
            target={lightboxTarget}
            onClose={() => setLightboxTarget(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
