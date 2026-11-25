import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import type {
  Book,
  Chapter,
  GuestChapterPayload,
  GuestTocItem,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import { GuestCanvasPaginatedView } from '@/components/GuestCanvasPaginatedView';
import { GuestCanvasScrollStage } from '@/components/GuestCanvasScrollStage';
import { GuestChapterFallbackState } from '@/components/GuestLockedChapterCard';
import {
  ReaderEyeBreakBanner,
  ReaderFooterStatusBar,
  ReaderNightDimOverlay,
} from '@/components/ReaderFooterStatusBar';
import { ReaderOverlaysHost } from '@/components/ReaderOverlaysHost';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { ReaderImmersionChrome } from '@/components/ReaderScrollEnhancements';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import {
  resolveGuestUnlockedInitialProgress,
  useGuestChapterStream,
} from '@/hooks/useGuestChapterStream';
import { useGuestCanvasViewport } from '@/hooks/useGuestCanvasViewport';
import { useReaderBookFeatures } from '@/hooks/useReaderBookFeatures';
import { useReaderChapterProgress } from '@/hooks/useReaderChapterProgress';
import { useReaderImmersionTools } from '@/hooks/useReaderImmersionTools';
import { useReaderSoundBarModel } from '@/hooks/useReaderScrollGestures';
import { buildGuestChapterFootnoteMap } from '@/lib/epubFootnotes';
import { collectVisibleGuestParagraphOptions } from '@/lib/highlightsApi';
import { buildCanonicalChapterNumbering } from '@/lib/readerChapterNumbers';
import { READER_THEME_STYLES } from '@/lib/readerConfig';
import { countWordsInGuestBlocks, estimateGuestLaterBookWords } from '@/lib/readingEstimate';

export interface GuestCanvasReaderProps {
  book: Book;
  allBooks?: Book[];
  tocChapters: GuestTocItem[];
  initialChapter?: { chapterIndex: number; data: GuestChapterPayload };
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
  initialChapter,
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paginatedRef = useRef<PaginatedStageHandle>(null);
  const paintSliceRef = useRef<() => void>(() => undefined);

  const effectiveInitialProgress = useMemo(
    () => resolveGuestUnlockedInitialProgress(tocChapters, initialProgress),
    [initialProgress, tocChapters],
  );

  const [activeStreamIdx, setActiveStreamIdx] = useState(() => {
    if (!effectiveInitialProgress || tocChapters.length === 0) return 0;
    const byId = tocChapters.findIndex((c) => c.id === effectiveInitialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(effectiveInitialProgress.chapterIndex || 0, tocChapters.length - 1));
  });

  const {
    chapterData, loadingChapter, chapterError, chapterLocked, imageSizes, bitmapsRef, retryChapter,
  } = useGuestChapterStream({
    bookId: book.id,
    chapterIndex: activeStreamIdx,
    isChapterLocked: Boolean(tocChapters[activeStreamIdx]?.locked),
    initialChapter,
    onApiError,
  });

  const {
    ctrl, chapterIndex, chapterScrollRatio, setChapterScrollRatio,
    paginatedStartRatio, searchTarget,
    restoreTargetRatioRef, suppressSaveRef, overallPercent, syncChapterWords,
    computeRemainingEstimate, handleUpdateSettings,
    goToChapter, goPrevChapter, goNextChapter,
    handlePaginatedRatioChange, handleJumpToSearchResult, completeBook, restartBookReread,
  } = useReaderChapterProgress({
    chapters: tocChapters,
    initialProgress: effectiveInitialProgress,
    settings,
    isPaginated,
    blockCopyShortcuts: true,
    timerEnabled: !loadingChapter && !chapterError && !chapterLocked,
    scrollContainerRef,
    paginatedRef,
    onUpdateSettings,
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

  const tocTitles = useMemo(() => tocChapters.map((item) => item.title), [tocChapters]);

  const tocDrawerChapters = useMemo<Chapter[]>(
    () =>
      tocChapters.map((item) => ({
        id: item.id,
        book_id: book.id,
        title: item.title,
        content: '',
        chapter_number: item.chapterNumber,
        ...(item.locked ? { locked: true } : {}),
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

  const isCurrentChapterLocked = Boolean(currentTocItem?.locked || chapterLocked);
  const showScrollStage = !loadingChapter && !chapterError && !isCurrentChapterLocked && !isPaginated;
  const effectiveWatermark = chapterData?.watermarkLabel || watermarkLabel || 'Guest';
  const handleScrollRef = useRef<() => void>(() => undefined);

  const { stageBox, layout, pageHidden, paintVisibleSlice } = useGuestCanvasViewport({
    chapterData,
    chapterIndex,
    totalChapters: tocChapters.length,
    tocTitles,
    settings,
    isPaginated,
    showScrollStage,
    chapterScrollRatio,
    effectiveWatermark,
    imageSizes,
    bitmapsRef,
    blockHighlightColors: features.blockHighlightColors,
    footnoteKeys,
    searchTarget,
    scrollContainerRef,
    canvasRef,
    restoreTargetRatioRef,
    suppressSaveRef,
    lastScrollTopRef,
    paintSliceRef,
    onSearchScrolled: () => handleScrollRef.current(),
  });

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
  handleScrollRef.current = handleScroll;

  const chapterWords = useMemo(() => countWordsInGuestBlocks(chapterData?.blocks), [chapterData?.blocks]);
  useEffect(() => {
    syncChapterWords(chapterWords);
  }, [chapterWords, syncChapterWords]);
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
      onContextMenu={(e) => { if (!allowEditableTarget(e.target)) e.preventDefault(); }}
      onCopy={(e) => { if (!allowEditableTarget(e.target)) e.preventDefault(); }}
      onCut={(e) => { if (!allowEditableTarget(e.target)) e.preventDefault(); }}
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
      ) : isCurrentChapterLocked || chapterError ? (
        <GuestChapterFallbackState
          locked={isCurrentChapterLocked}
          chapterTitle={currentTocItem?.title}
          errorMessage={chapterError}
          tocChapters={tocChapters}
          currentIndex={chapterIndex}
          palette={palette}
          onJumpToChapter={(idx) => goToChapter(idx, 0)}
          onOpenToc={() => openDrawerTab('toc')}
          onRetry={retryChapter}
          onCloseReader={() => {
            flushProgress({ forceTimeFlush: true, keepalive: true });
            onClose();
          }}
        />
      ) : isPaginated && chapterData ? (
        <>
          <GuestCanvasPaginatedView
            ref={paginatedRef}
            bookId={book.id} bookTitle={book.title} chapterData={chapterData}
            chapterIndex={chapterIndex} totalChapters={tocChapters.length} tocTitles={tocTitles}
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
          <ReaderEyeBreakBanner
            due={ctrl.eyeBreakDue} minutes={settings.eyeBreakMinutes}
            palette={palette} onAcknowledge={ctrl.acknowledgeEyeBreak}
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
            onStartReread={restartBookReread}
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
            eyeBreakDue={ctrl.eyeBreakDue} eyeBreakMinutes={settings.eyeBreakMinutes}
            onAcknowledgeEyeBreak={ctrl.acknowledgeEyeBreak}
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
