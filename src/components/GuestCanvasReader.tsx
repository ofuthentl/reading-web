import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  Book, Chapter, GuestTocItem, ReaderSettings, ReadingProgress, SaveProgressOptions,
} from '@/types';
import { GuestCanvasPaginatedView } from '@/components/GuestCanvasPaginatedView';
import { GuestCanvasScrollStage } from '@/components/GuestCanvasScrollStage';
import { ReaderFooterStatusBar, ReaderNightDimOverlay } from '@/components/ReaderFooterStatusBar';
import { ReaderImmersionChrome } from '@/components/ReaderScrollEnhancements';
import { ReaderOverlaysHost } from '@/components/ReaderOverlaysHost';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import { useGuestChapterStream } from '@/hooks/useGuestChapterStream';
import { useReaderBookFeatures } from '@/hooks/useReaderBookFeatures';
import { useReaderCanvasFontVersion } from '@/hooks/useReaderCanvasFontVersion';
import { useReaderChapterProgress } from '@/hooks/useReaderChapterProgress';
import { useReaderImmersionTools } from '@/hooks/useReaderImmersionTools';
import { useReaderSoundBarModel } from '@/hooks/useReaderScrollGestures';
import { buildGuestChapterFootnoteMap } from '@/lib/epubFootnotes';
import { computeChapterCanvasLayout, getInitialGuestStageBox } from '@/lib/guestCanvasLayout';
import { paintGuestViewportCanvas } from '@/lib/guestCanvasPaint';
import { collectVisibleGuestParagraphOptions } from '@/lib/highlightsApi';
import { buildCanonicalChapterNumbering } from '@/lib/readerChapterNumbers';
import { READER_THEME_STYLES } from '@/lib/readerConfig';
import { countWordsInGuestBlocks, estimateGuestLaterBookWords } from '@/lib/readingEstimate';
import { findCanvasItemIndexForQuery } from '@/lib/readerSearchJump';

const VIEWPORT_OVERSCAN_PX = 280;

export interface GuestCanvasReaderProps {
  book: Book;
  allBooks?: Book[];
  tocChapters: GuestTocItem[];
  watermarkLabel: string;
  initialProgress?: ReadingProgress;
  nextBook?: Book | null;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onOpenNextBook?: (nextBook: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
}

export function GuestCanvasReader({
  book,
  allBooks = [],
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
  const palette = READER_THEME_STYLES[settings.theme];

  const [stageBox, setStageBox] = useState(getInitialGuestStageBox);
  const [highlightSourceY, setHighlightSourceY] = useState<number | null>(null);
  const fontVersion = useReaderCanvasFontVersion(settings.font);
  const [pageHidden, setPageHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paginatedRef = useRef<PaginatedStageHandle>(null);
  const appliedSearchNonceRef = useRef(0);
  const paintSliceRef = useRef<() => void>(() => undefined);

  const [activeStreamIdx, setActiveStreamIdx] = useState(() => {
    if (!initialProgress || tocChapters.length === 0) return 0;
    const byId = tocChapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, tocChapters.length - 1));
  });

  const {
    chapterData, loadingChapter, chapterError, imageSizes, bitmapsRef, retryChapter,
  } = useGuestChapterStream({ bookId: book.id, chapterIndex: activeStreamIdx, onApiError });

  const {
    ctrl, chapterIndex, chapterScrollRatio, setChapterScrollRatio,
    paginatedStartRatio, setPaginatedStartRatio, searchTarget,
    restoreTargetRatioRef, suppressSaveRef, overallPercent, computeRemainingEstimate,
    goToChapter, goPrevChapter, goNextChapter,
    handlePaginatedRatioChange, handleJumpToSearchResult, completeBook,
  } = useReaderChapterProgress({
    chapters: tocChapters,
    initialProgress,
    settings,
    isPaginated,
    blockCopyShortcuts: true,
    timerEnabled: !loadingChapter && !chapterError,
    scrollContainerRef,
    paginatedRef,
    onSaveProgress,
    onSameChapterJump: () => paintSliceRef.current(),
    onOpenNextBook,
    onClose,
  });

  useEffect(() => {
    setActiveStreamIdx(chapterIndex);
  }, [chapterIndex]);

  const {
    tocOpen, setTocOpen, drawerTab, settingsOpen, setSettingsOpen,
    immersiveHidden, setImmersiveHidden, lightboxTarget, setLightboxTarget,
    lastScrollTopRef, completedRef, flushProgress, queueProgressSave,
    openDrawerTab, updateImmersiveOnScroll,
  } = ctrl;

  const currentTocItem = tocChapters[chapterIndex];
  const chapterNumbering = useMemo(() => buildCanonicalChapterNumbering(tocChapters), [tocChapters]);
  const features = useReaderBookFeatures({
    bookId: book.id, chapterIndex, currentChapterId: currentTocItem?.id || '',
    currentChapterTitle: currentTocItem?.title || '', initialChapterIndex: initialProgress?.chapterIndex ?? 0,
    initialCompleted: Boolean(initialProgress?.completed), totalChapters: tocChapters.length, onApiError,
  });
  const currentChapterNumber = chapterNumbering.chapterNumberByIndex[chapterIndex] ?? undefined;
  const readerMaxChapterNumber = chapterNumbering.resolveReaderMaxChapterNumber(
    features.highestChapterReached,
    Boolean(initialProgress?.completed),
  );

  const anyOverlayOpen =
    tocOpen || settingsOpen || Boolean(lightboxTarget) || Boolean(features.activeFootnote) ||
    features.guestPickerOpen || Boolean(features.editingHighlight);
  const immersion = useReaderImmersionTools({
    isPaginated, scrollContainerRef, overlayOpen: anyOverlayOpen, immersiveHidden, chapterId: currentTocItem?.id || '',
  });
  const closePopoversForSound = useCallback(() => {
    setTocOpen(false);
    setSettingsOpen(false);
  }, [setSettingsOpen, setTocOpen]);
  const soundBarModel = useReaderSoundBarModel(immersion, closePopoversForSound);

  const tocDrawerChapters = useMemo<Chapter[]>(
    () =>
      tocChapters.map((item) => ({
        id: item.id, book_id: book.id, title: item.title, content: '', chapter_number: item.chapterNumber,
      })),
    [book.id, tocChapters],
  );

  const footnoteMap = useMemo(
    () => buildGuestChapterFootnoteMap(chapterData?.blocks, chapterData?.footnotes),
    [chapterData?.blocks, chapterData?.footnotes],
  );
  const footnoteKeys = useMemo(
    () => (footnoteMap.size > 0 ? new Set(footnoteMap.keys()) : undefined),
    [footnoteMap],
  );

  const showScrollStage = !loadingChapter && !chapterError && !isPaginated;
  const chapterScrollRatioRef = useRef(chapterScrollRatio);
  chapterScrollRatioRef.current = chapterScrollRatio;

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
  }, [restoreTargetRatioRef, showScrollStage]);

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
      totalChapters: tocChapters.length,
      blocks: chapterData.blocks,
      settings,
      containerWidth: stageBox.width,
      imageSizes,
      blockHighlightColors: features.blockHighlightColors,
    });
  }, [
    chapterData, chapterIndex, features.blockHighlightColors, fontVersion,
    imageSizes, isPaginated, settings, stageBox.width, tocChapters.length,
  ]);

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
      canvas, layout, sliceTop, sliceHeight, canvasCssWidth: stageBox.width,
      theme: settings.theme, font: settings.font, watermarkLabel: effectiveWatermark,
      bitmaps: bitmapsRef.current, highlightSourceY, footnoteKeys, focusBand,
    });
  }, [
    bitmapsRef, effectiveWatermark, footnoteKeys, highlightSourceY,
    layout, settings.font, settings.readingRuler, settings.theme, stageBox.height, stageBox.width,
  ]);

  paintSliceRef.current = paintVisibleSlice;

  useLayoutEffect(() => {
    if (!isPaginated) paintVisibleSlice();
  }, [isPaginated, paintVisibleSlice]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (patch.layoutMode && patch.layoutMode !== settings.layoutMode) {
        if (patch.layoutMode === 'paginated') setPaginatedStartRatio(chapterScrollRatioRef.current);
        else restoreTargetRatioRef.current = chapterScrollRatioRef.current;
      } else if (
        !isPaginated &&
        (patch.width || patch.fontSizePx || patch.lineHeight || patch.font ||
          patch.textAlign || patch.paragraphIndent !== undefined || patch.paragraphSpacing)
      ) {
        restoreTargetRatioRef.current = chapterScrollRatioRef.current;
      }
      onUpdateSettings(patch);
    },
    [isPaginated, onUpdateSettings, restoreTargetRatioRef, setPaginatedStartRatio, settings.layoutMode],
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
    chapterIndex, completedRef, currentTocItem, isPaginated, layout, paintVisibleSlice,
    queueProgressSave, setChapterScrollRatio, suppressSaveRef, tocChapters.length, updateImmersiveOnScroll,
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
  }, [isPaginated, lastScrollTopRef, layout, paintVisibleSlice, restoreTargetRatioRef, suppressSaveRef]);

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
      handleScroll();
    }
    setHighlightSourceY(matchedItem.y);
    const timer = window.setTimeout(() => setHighlightSourceY(null), 2250);
    return () => window.clearTimeout(timer);
  }, [chapterIndex, handleScroll, isPaginated, layout, searchTarget]);

  const chapterWords = useMemo(() => countWordsInGuestBlocks(chapterData?.blocks), [chapterData?.blocks]);
  const laterBookWords = useMemo(
    () => estimateGuestLaterBookWords(tocChapters, chapterIndex, chapterWords),
    [chapterIndex, chapterWords, tocChapters],
  );
  const remainingEstimate = computeRemainingEstimate(chapterWords, laterBookWords);

  const visibleGuestParagraphs = useMemo(() => {
    if (!features.guestPickerOpen || !chapterData?.blocks) return [];
    if (isPaginated) {
      const slice = paginatedRef.current?.getVisibleCanvasSlice?.();
      return collectVisibleGuestParagraphOptions({
        blocks: chapterData.blocks,
        visibleItems: slice?.items ?? [],
        minY: slice?.minY ?? 0,
        maxY: slice?.maxY ?? 999_999,
        chapterHighlights: features.chapterHighlights,
      });
    }
    const el = scrollContainerRef.current;
    const minY = Math.max(0, (el?.scrollTop ?? 0) - 40);
    const maxY = minY + Math.max(360, el?.clientHeight ?? 680);
    return collectVisibleGuestParagraphOptions({
      blocks: chapterData.blocks,
      visibleItems: layout?.items ?? [],
      minY,
      maxY,
      chapterHighlights: features.chapterHighlights,
    });
  }, [chapterData?.blocks, features.chapterHighlights, features.guestPickerOpen, isPaginated, layout]);

  const watermarkBadge = (
    <span
      className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:inline-flex ${palette.border} ${palette.textSecondary}`}
      title="Chế độ đọc bảo vệ bản quyền — gắn thuỷ vân định danh phiên Discord"
    >
      <ShieldCheck className="h-3 w-3 text-emerald-500" />
      {effectiveWatermark}
    </span>
  );

  const allowEditableTarget = (target: EventTarget | null) =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  return (
    <div
      className={`guest-protected-reader relative flex h-full min-h-0 flex-1 select-none flex-col overflow-hidden transition-colors duration-200 ${palette.pageBg} ${palette.textPrimary}`}
      onContextMenu={(e) => {
        if (!allowEditableTarget(e.target)) e.preventDefault();
      }}
      onCopy={(e) => {
        if (!allowEditableTarget(e.target)) e.preventDefault();
      }}
      onCut={(e) => {
        if (!allowEditableTarget(e.target)) e.preventDefault();
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <ReaderNightDimOverlay
        nightDimPercent={settings.nightDimPercent}
        settingsOpen={settingsOpen || immersion.soundOpen}
      />

      <ReaderTopBar
        bookTitle={book.title}
        chapterTitle={currentTocItem?.title}
        overallPercent={overallPercent}
        immersiveHidden={immersiveHidden}
        settingsOpen={settingsOpen}
        settings={settings}
        palette={palette}
        statusBadge={watermarkBadge}
        soundModel={soundBarModel}
        autoScrollActive={immersion.autoScrollOpen}
        onToggleAutoScroll={immersion.toggleAutoScrollBar}
        onBack={() => { flushProgress({ forceTimeFlush: true, keepalive: true }); onClose(); }}
        onOpenDrawerTab={(tab) => { immersion.setSoundOpen(false); openDrawerTab(tab); }}
        onQuickGuestHighlight={() => features.setGuestPickerOpen(true)}
        onHideToolbar={() => { setSettingsOpen(false); immersion.setSoundOpen(false); setImmersiveHidden(true); }}
        onToggleSettings={() => { setTocOpen(false); immersion.setSoundOpen(false); setSettingsOpen((v) => !v); }}
        onCloseSettings={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
      />

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
        <>
          <GuestCanvasPaginatedView
            ref={paginatedRef}
            bookId={book.id} bookTitle={book.title} chapterData={chapterData}
            chapterIndex={chapterIndex} totalChapters={tocChapters.length}
            currentChapterNumber={currentChapterNumber} readerMaxChapterNumber={readerMaxChapterNumber}
            chapterOptions={chapterNumbering.options} initialRatio={paginatedStartRatio} watermarkLabel={effectiveWatermark}
            imageSizes={imageSizes} bitmapsRef={bitmapsRef}
            blockHighlightColors={features.blockHighlightColors} footnoteMap={footnoteMap}
            nextBook={nextBook} settings={settings} palette={palette}
            immersiveHidden={immersiveHidden} pageHidden={pageHidden}
            remainingEstimate={remainingEstimate} searchTarget={searchTarget}
            onToggleImmersive={() => setImmersiveHidden((prev) => !prev)}
            onCloseSettings={() => {
              if (!settingsOpen && !immersion.soundOpen) return false;
              setSettingsOpen(false); immersion.setSoundOpen(false); return true;
            }}
            onRatioChange={handlePaginatedRatioChange}
            onPrevChapterEnd={() => { if (chapterIndex > 0) goToChapter(chapterIndex - 1, 1); }}
            onNextChapterStart={() => { if (chapterIndex < tocChapters.length - 1) goToChapter(chapterIndex + 1, 0); }}
            onCompleteBook={completeBook}
            onOpenGuestImage={(bitmap, alt) =>
              setLightboxTarget({ kind: 'guest-bitmap', bitmap, watermarkLabel: effectiveWatermark, alt })
            }
            onOpenFootnote={(fn) => features.setActiveFootnote(fn)}
            onPageTurn={immersion.triggerPageTurnSound}
            onApiError={onApiError}
          />
          <div className="h-1 w-full shrink-0 bg-black/10">
            <div className={`h-full transition-all duration-150 ${palette.progressBar}`} style={{ width: `${overallPercent}%` }} />
          </div>
        </>
      ) : (
        <>
          <GuestCanvasScrollStage
            bookId={book.id} bookTitle={book.title} chapterIndex={chapterIndex}
            totalChapters={tocChapters.length} currentChapterNumber={currentChapterNumber}
            readerMaxChapterNumber={readerMaxChapterNumber} chapterOptions={chapterNumbering.options}
            stageWidth={stageBox.width}
            layout={layout} footnoteMap={footnoteMap} bitmapsRef={bitmapsRef}
            nextBook={nextBook} settings={settings} palette={palette}
            settingsOpen={settingsOpen || immersion.soundOpen} immersiveHidden={immersiveHidden}
            pageHidden={pageHidden} autoScrollOpen={immersion.autoScrollOpen}
            scrollContainerRef={scrollContainerRef} canvasRef={canvasRef}
            onScroll={handleScroll}
            onCloseSettings={() => { setSettingsOpen(false); immersion.setSoundOpen(false); }}
            onToggleAutoScrollPlay={() => immersion.setAutoScrollPlaying((v) => !v)}
            onRevealToolbar={() => setImmersiveHidden(false)}
            onPrevChapter={() => { immersion.triggerPageTurnSound(); goPrevChapter(); }}
            onNextChapter={() => { immersion.triggerPageTurnSound(); goNextChapter(); }}
            onCompleteBook={completeBook}
            onOpenFootnote={(fn) => features.setActiveFootnote(fn)}
            onOpenGuestImage={(bitmap, alt) =>
              setLightboxTarget({ kind: 'guest-bitmap', bitmap, watermarkLabel: effectiveWatermark, alt })
            }
            onApiError={onApiError}
          />

          <ReaderFooterStatusBar
            chapterIndex={chapterIndex} totalChapters={tocChapters.length}
            overallPercent={overallPercent} remainingEstimate={remainingEstimate}
            immersiveHidden={immersiveHidden} palette={palette}
          />
        </>
      )}

      <ReaderImmersionChrome
        immersion={immersion} isPaginated={isPaginated} scrollStageReady={showScrollStage}
        chapterIndex={chapterIndex} totalChapters={tocChapters.length}
        nextChapterLabel={chapterNumbering.getChapterShortLabel(chapterIndex + 1)}
        nightDimPercent={settings.nightDimPercent} palette={palette}
        scrollContainerRef={scrollContainerRef} onUpdateSettings={handleUpdateSettings}
        onAdvanceChapter={() => { immersion.triggerPageTurnSound(); goNextChapter(); }}
      />

      <ReaderOverlaysHost
        role="guest"
        book={book} allBooks={allBooks} chapters={tocDrawerChapters}
        chapterIndex={chapterIndex} currentChapterId={currentTocItem?.id || ''}
        currentChapterTitle={currentTocItem?.title || ''} chapterScrollRatio={chapterScrollRatio}
        watermarkLabel={effectiveWatermark} tocOpen={tocOpen} drawerTab={drawerTab}
        palette={palette} features={features} visibleGuestParagraphs={visibleGuestParagraphs}
        lightboxTarget={lightboxTarget} onCloseToc={() => setTocOpen(false)}
        onSelectChapter={(idx) => goToChapter(idx, 0)} onJumpToRatio={goToChapter}
        onJumpToSearchResult={handleJumpToSearchResult} onSetLightboxTarget={setLightboxTarget}
        onOpenOtherBook={(targetBook, jumpTarget) => {
          flushProgress({ forceTimeFlush: true, keepalive: true });
          onOpenNextBook?.(targetBook, jumpTarget);
        }}
        onApiError={onApiError}
      />
    </div>
  );
}
