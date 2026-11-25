import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HardDrive, Sparkles } from 'lucide-react';
import type { Book, ParsedBook, ReaderSettings, ReadingProgress, SaveProgressOptions } from '@/types';
import { ReaderDomScrollStage } from '@/components/ReaderDomScrollStage';
import {
  ReaderEyeBreakBanner,
  ReaderFooterStatusBar,
  ReaderNightDimOverlay,
} from '@/components/ReaderFooterStatusBar';
import { ReaderOverlaysHost } from '@/components/ReaderOverlaysHost';
import { type PaginatedStageHandle, ReaderPaginatedView } from '@/components/ReaderPaginatedView';
import { ReaderImmersionChrome } from '@/components/ReaderScrollEnhancements';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import { useDomReadingRuler } from '@/hooks/useDomReadingRuler';
import { useReaderBookFeatures } from '@/hooks/useReaderBookFeatures';
import { useReaderChapterProgress } from '@/hooks/useReaderChapterProgress';
import { useReaderImmersionTools } from '@/hooks/useReaderImmersionTools';
import { useReaderSoundBarModel } from '@/hooks/useReaderScrollGestures';
import { applyChapterDomHighlights, captureOwnerSelectionDraft } from '@/lib/domHighlights';
import { resolveOwnerFootnoteClick } from '@/lib/epubFootnotes';
import { buildCanonicalChapterNumbering } from '@/lib/readerChapterNumbers';
import { READER_THEME_STYLES } from '@/lib/readerConfig';
import { countWordsInPlainText } from '@/lib/readingEstimate';
import { findDomBlockForSearchQuery, flashDomSearchElement } from '@/lib/readerSearchJump';

type ReaderViewProps = {
  book: Book;
  allBooks?: Book[];
  parsedBook: ParsedBook;
  loadedFromCache: boolean;
  initialProgress?: ReadingProgress;
  nextBook?: Book | null;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onOpenNextBook?: (nextBook: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
};

export function ReaderView({
  book,
  allBooks = [],
  parsedBook,
  loadedFromCache,
  initialProgress,
  nextBook,
  settings,
  onUpdateSettings,
  onSaveProgress,
  onOpenNextBook,
  onApiError,
  onClose,
}: ReaderViewProps) {
  const { chapters } = parsedBook;
  const isPaginated = settings.layoutMode === 'paginated';
  const palette = READER_THEME_STYLES[settings.theme];

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const paginatedRef = useRef<PaginatedStageHandle>(null);
  const flashCleanupRef = useRef<(() => void) | null>(null);
  const appliedSearchNonceRef = useRef(0);

  const {
    ctrl, chapterIndex, chapterScrollRatio, setChapterScrollRatio,
    paginatedStartRatio, searchTarget,
    restoreTargetRatioRef, suppressSaveRef, overallPercent, syncChapterWords,
    computeRemainingEstimate, handleUpdateSettings,
    goToChapter, goPrevChapter, goNextChapter,
    handlePaginatedRatioChange, handleJumpToSearchResult, completeBook, restartBookReread,
  } = useReaderChapterProgress({
    chapters,
    initialProgress,
    settings,
    isPaginated,
    scrollContainerRef,
    paginatedRef,
    onUpdateSettings,
    onSaveProgress,
    onOpenNextBook,
    onClose,
  });

  const {
    tocOpen, setTocOpen, drawerTab, settingsOpen, setSettingsOpen,
    immersiveHidden, setImmersiveHidden, lightboxTarget, setLightboxTarget,
    lastScrollTopRef, completedRef, flushProgress, queueProgressSave,
    openDrawerTab, updateImmersiveOnScroll,
  } = ctrl;

  const [mediaRev, setMediaRev] = useState(0);
  void mediaRev;
  const currentChapter = chapters[chapterIndex];
  const currentChapterId = currentChapter?.id || '';
  const chapterNumbering = useMemo(() => buildCanonicalChapterNumbering(chapters), [chapters]);

  // Giải nén lười ảnh của chương hiện tại (nếu chưa hydrate) và nạp sẵn chương kế tiếp lúc rảnh (QĐ-1A)
  useEffect(() => {
    if (!parsedBook.ensureChapterMedia) return;
    let cancelled = false;
    const before = parsedBook.chapters[chapterIndex];
    void parsedBook.ensureChapterMedia(chapterIndex).then((hydrated) => {
      if (!cancelled && hydrated && hydrated !== before) {
        setMediaRev((v) => v + 1);
      }
    });

    const nextIndex = chapterIndex + 1;
    if (nextIndex >= parsedBook.chapters.length) {
      return () => {
        cancelled = true;
      };
    }

    const runPrefetch = () => {
      if (!cancelled) void parsedBook.ensureChapterMedia?.(nextIndex);
    };
    const idleWin = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | null = null;
    let timerId: number | null = null;
    if (typeof idleWin.requestIdleCallback === 'function') {
      idleId = idleWin.requestIdleCallback(runPrefetch, { timeout: 500 });
    } else {
      timerId = window.setTimeout(runPrefetch, 150);
    }
    return () => {
      cancelled = true;
      if (idleId !== null) idleWin.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [chapterIndex, parsedBook]);

  const features = useReaderBookFeatures({
    bookId: book.id, chapterIndex, currentChapterId: currentChapter?.id || '',
    currentChapterTitle: currentChapter?.title || '', initialChapterIndex: initialProgress?.chapterIndex ?? 0,
    initialCompleted: Boolean(initialProgress?.completed), totalChapters: chapters.length, onApiError,
  });
  const currentChapterNumber = chapterNumbering.chapterNumberByIndex[chapterIndex] ?? undefined;
  const readerMaxChapterNumber = chapterNumbering.resolveReaderMaxChapterNumber(
    features.highestChapterReached,
    Boolean(initialProgress?.completed),
  );

  const anyOverlayOpen =
    tocOpen || settingsOpen || Boolean(lightboxTarget) || Boolean(features.activeFootnote) ||
    Boolean(features.selectionDraft) || Boolean(features.editingHighlight);
  const immersion = useReaderImmersionTools({
    isPaginated, scrollContainerRef, overlayOpen: anyOverlayOpen, immersiveHidden, chapterId: currentChapter?.id || '',
  });
  const closePopoversForSound = useCallback(() => {
    setTocOpen(false);
    setSettingsOpen(false);
  }, [setSettingsOpen, setTocOpen]);
  const soundBarModel = useReaderSoundBarModel(immersion, closePopoversForSound);
  useDomReadingRuler({
    enabled: settings.readingRuler, isPaginated, scrollContainerRef, chapterId: currentChapter?.id,
  });

  useEffect(() => {
    return () => {
      flashCleanupRef.current?.();
      flashCleanupRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (isPaginated) return;
    applyChapterDomHighlights(scrollContainerRef.current, features.chapterHighlights);
  }, [currentChapter?.content_html, currentChapter?.id, features.chapterHighlights, isPaginated]);

  const chapterScrollRatioRef = useRef(chapterScrollRatio);
  chapterScrollRatioRef.current = chapterScrollRatio;
  const handleScrollRef = useRef<() => void>(() => undefined);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !currentChapter || isPaginated) return;

    const currentTop = el.scrollTop;
    updateImmersiveOnScroll(currentTop, suppressSaveRef.current);

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, currentTop / maxScroll)) : 1;
    setChapterScrollRatio(ratio);
    if (suppressSaveRef.current) return;

    const reachedEndOfBook =
      chapterIndex === chapters.length - 1 && (maxScroll === 0 || ratio >= 0.97);
    if (reachedEndOfBook) completedRef.current = true;

    queueProgressSave(
      {
        chapterId: currentChapter.id,
        chapterIndex,
        chapterTitle: currentChapter.title,
        totalChapters: chapters.length,
        scrollRatio: ratio,
        scrollTop: currentTop,
        completed: completedRef.current,
        updatedAt: Date.now(),
      },
      reachedEndOfBook,
    );
  }, [
    chapterIndex, chapters.length, completedRef, currentChapter, isPaginated,
    queueProgressSave, setChapterScrollRatio, suppressSaveRef, updateImmersiveOnScroll,
  ]);
  handleScrollRef.current = handleScroll;

  const typographyKey = `${settings.width}:${settings.font}:${settings.fontWeight}:${settings.fontSizePx}:${settings.lineHeight}:${settings.textAlign}:${settings.paragraphIndent}:${settings.paragraphSpacing}`;

  useLayoutEffect(() => {
    if (isPaginated || !currentChapterId || !scrollContainerRef.current) return;
    if (searchTarget && searchTarget.chapterIndex === chapterIndex && appliedSearchNonceRef.current !== searchTarget.nonce) {
      restoreTargetRatioRef.current = null;
      suppressSaveRef.current = false;
      return;
    }
    const targetRatio = restoreTargetRatioRef.current ?? 0;
    suppressSaveRef.current = true;

    let frame = 0;
    let tries = 0;
    const apply = () => {
      const el = scrollContainerRef.current;
      if (!el) {
        suppressSaveRef.current = false;
        return;
      }
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.round(maxScroll * targetRatio);
      lastScrollTopRef.current = el.scrollTop;
      tries += 1;
      if (tries < 4) {
        frame = requestAnimationFrame(apply);
      } else {
        restoreTargetRatioRef.current = null;
        suppressSaveRef.current = false;
        handleScrollRef.current();
      }
    };
    frame = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(frame);
      suppressSaveRef.current = false;
    };
  }, [chapterIndex, currentChapterId, isPaginated, lastScrollTopRef, restoreTargetRatioRef, searchTarget, suppressSaveRef, typographyKey]);

  // Bảo toàn tỷ lệ đọc khi xoay màn hình hoặc đổi kích thước cửa sổ ở chế độ cuộn dọc
  useEffect(() => {
    if (isPaginated) return;
    let lastW = typeof window !== 'undefined' ? window.innerWidth : 0;
    let raf = 0;
    const onResize = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      const savedRatio = chapterScrollRatioRef.current;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = Math.round(maxScroll * savedRatio);
        lastScrollTopRef.current = el.scrollTop;
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isPaginated, lastScrollTopRef]);

  useEffect(() => {
    if (isPaginated || !searchTarget || searchTarget.chapterIndex !== chapterIndex) return;
    if (appliedSearchNonceRef.current === searchTarget.nonce) return;

    const timer = window.setTimeout(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const matched = findDomBlockForSearchQuery(el, searchTarget.query, searchTarget.occurrenceIndex);
      appliedSearchNonceRef.current = searchTarget.nonce;
      if (!matched) return;
      const cRect = el.getBoundingClientRect();
      const mRect = matched.getBoundingClientRect();
      const targetTop = el.scrollTop + (mRect.top - cRect.top) - el.clientHeight * 0.28;
      el.scrollTop = Math.max(0, Math.round(targetTop));
      flashCleanupRef.current?.();
      flashCleanupRef.current = flashDomSearchElement(matched);
      handleScroll();
    }, 90);
    return () => window.clearTimeout(timer);
  }, [chapterIndex, currentChapter?.id, handleScroll, isPaginated, searchTarget]);

  const handleContentSelectionEnd = useCallback(
    (container: HTMLElement | null) => {
      window.setTimeout(() => {
        const draft = captureOwnerSelectionDraft(container, chapterScrollRatio);
        if (draft) {
          features.setEditingHighlight(null);
          features.setSelectionDraft(draft);
        }
      }, 20);
    },
    [chapterScrollRatio, features],
  );

  const handleContentInteractionClick = useCallback(
    (event: ReactMouseEvent, container: HTMLElement | null): boolean => {
      const fn = resolveOwnerFootnoteClick(event, container, chapters, chapterIndex);
      if (fn) {
        features.setActiveFootnote(fn);
        return true;
      }

      const target = event.target as HTMLElement | null;
      const mark = target?.closest('mark[data-hl-id]') as HTMLElement | null;
      if (mark?.dataset.hlId) {
        const hl = features.chapterHighlights.find((item) => item.id === mark.dataset.hlId);
        if (hl) {
          event.preventDefault();
          event.stopPropagation();
          const rect = mark.getBoundingClientRect();
          features.setSelectionDraft(null);
          features.setEditingHighlight({
            highlight: hl,
            anchorX: Math.round(rect.left + rect.width / 2),
            anchorY: Math.round(rect.top),
          });
          return true;
        }
      }
      return false;
    },
    [chapterIndex, chapters, features],
  );

  const chapterWordCounts = useMemo(
    () => chapters.map((ch) => countWordsInPlainText(ch.content)),
    [chapters],
  );
  const chapterWords = chapterWordCounts[chapterIndex] ?? 0;
  useEffect(() => {
    syncChapterWords(chapterWords);
  }, [chapterWords, syncChapterWords]);
  const laterBookWords = useMemo(() => {
    let sum = 0;
    for (let i = chapterIndex + 1; i < chapterWordCounts.length; i += 1) {
      sum += chapterWordCounts[i];
    }
    return sum;
  }, [chapterIndex, chapterWordCounts]);
  const remainingEstimate = computeRemainingEstimate(chapterWords, laterBookWords);

  const cacheBadge = (
    <span
      className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:inline-flex ${palette.border} ${palette.textSecondary}`}
      title={
        loadedFromCache
          ? 'Đọc tức thì từ bộ nhớ đệm IndexedDB (0ms)'
          : 'Đã tải từ Cloudflare R2 & lưu vào cache'
      }
    >
      {loadedFromCache ? (
        <HardDrive className="h-3 w-3 text-emerald-500" />
      ) : (
        <Sparkles className="h-3 w-3 text-amber-500" />
      )}
      {loadedFromCache ? 'Cache 0ms' : 'R2 Ready'}
    </span>
  );

  return (
    <div
      className={`relative flex h-full min-h-0 flex-1 flex-col overflow-hidden transition-colors duration-200 ${palette.pageBg} ${palette.textPrimary}`}
    >
      <ReaderNightDimOverlay
        nightDimPercent={settings.nightDimPercent}
        settingsOpen={settingsOpen || immersion.soundOpen}
      />

      <ReaderTopBar
        bookTitle={book.title}
        chapterTitle={currentChapter?.title}
        overallPercent={overallPercent}
        immersiveHidden={immersiveHidden}
        settingsOpen={settingsOpen}
        settings={settings}
        palette={palette}
        statusBadge={cacheBadge}
        soundModel={soundBarModel}
        autoScrollActive={immersion.autoScrollOpen}
        onToggleAutoScroll={immersion.toggleAutoScrollBar}
        onBack={() => { flushProgress({ forceTimeFlush: true, keepalive: true }); onClose(); }}
        onOpenDrawerTab={(tab) => { immersion.setSoundOpen(false); openDrawerTab(tab); }}
        onHideToolbar={() => { setSettingsOpen(false); immersion.setSoundOpen(false); setImmersiveHidden(true); }}
        onToggleSettings={() => { setTocOpen(false); immersion.setSoundOpen(false); setSettingsOpen((v) => !v); }}
        onCloseSettings={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
      />

      {isPaginated && currentChapter ? (
        <>
          <ReaderPaginatedView
            ref={paginatedRef}
            bookId={book.id} bookTitle={book.title} chapter={currentChapter}
            chapterIndex={chapterIndex} totalChapters={chapters.length}
            currentChapterNumber={currentChapterNumber} readerMaxChapterNumber={readerMaxChapterNumber}
            chapterOptions={chapterNumbering.options} initialRatio={paginatedStartRatio} nextBook={nextBook}
            settings={settings} palette={palette} immersiveHidden={immersiveHidden}
            remainingEstimate={remainingEstimate} searchTarget={searchTarget}
            chapterHighlights={features.chapterHighlights}
            onContentInteractionClick={handleContentInteractionClick}
            onSelectionEnd={handleContentSelectionEnd}
            onToggleImmersive={() => setImmersiveHidden((prev) => !prev)}
            onCloseSettings={() => {
              if (!settingsOpen && !immersion.soundOpen) return false;
              setSettingsOpen(false); immersion.setSoundOpen(false); return true;
            }}
            onRatioChange={handlePaginatedRatioChange}
            onPrevChapterEnd={() => { if (chapterIndex > 0) goToChapter(chapterIndex - 1, 1); }}
            onNextChapterStart={() => { if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1, 0); }}
            onCompleteBook={completeBook}
            onOpenImage={(src, alt) => setLightboxTarget({ kind: 'dom', src, alt })}
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
          <ReaderDomScrollStage
            bookId={book.id}
            bookTitle={book.title}
            currentChapter={currentChapter}
            chapterIndex={chapterIndex}
            totalChapters={chapters.length}
            currentChapterNumber={currentChapterNumber}
            readerMaxChapterNumber={readerMaxChapterNumber}
            maxCanonicalChapterNumber={chapterNumbering.maxChapterNumber}
            chapterOptions={chapterNumbering.options}
            nextBook={nextBook}
            settings={settings}
            palette={palette}
            settingsOpen={settingsOpen || immersion.soundOpen}
            immersiveHidden={immersiveHidden}
            autoScrollOpen={immersion.autoScrollOpen}
            scrollContainerRef={scrollContainerRef}
            onScroll={handleScroll}
            onSelectionEnd={handleContentSelectionEnd}
            onContentInteractionClick={handleContentInteractionClick}
            onClosePopovers={() => { setSettingsOpen(false); immersion.setSoundOpen(false); }}
            onToggleAutoScrollPlay={() => immersion.setAutoScrollPlaying((v) => !v)}
            onRevealToolbar={() => setImmersiveHidden(false)}
            onPrevChapter={() => { immersion.triggerPageTurnSound(); goPrevChapter(); }}
            onNextChapter={() => { immersion.triggerPageTurnSound(); goNextChapter(); }}
            onCompleteBook={completeBook}
            onStartReread={restartBookReread}
            onOpenDomImage={(src, alt) => setLightboxTarget({ kind: 'dom', src, alt })}
            onApiError={onApiError}
          />

          <ReaderFooterStatusBar
            chapterIndex={chapterIndex}
            totalChapters={chapters.length}
            overallPercent={overallPercent}
            remainingEstimate={remainingEstimate}
            immersiveHidden={immersiveHidden}
            palette={palette}
            eyeBreakDue={ctrl.eyeBreakDue}
            eyeBreakMinutes={settings.eyeBreakMinutes}
            onAcknowledgeEyeBreak={ctrl.acknowledgeEyeBreak}
          />
        </>
      )}

      <ReaderImmersionChrome
        immersion={immersion} isPaginated={isPaginated} chapterIndex={chapterIndex}
        totalChapters={chapters.length} nextChapterLabel={chapterNumbering.getChapterShortLabel(chapterIndex + 1)}
        nightDimPercent={settings.nightDimPercent} palette={palette}
        scrollContainerRef={scrollContainerRef} onUpdateSettings={handleUpdateSettings}
        onAdvanceChapter={() => { immersion.triggerPageTurnSound(); goNextChapter(); }}
      />

      <ReaderOverlaysHost
        role="owner"
        book={book} allBooks={allBooks} chapters={chapters} parsedChapters={chapters}
        resolveOwnerMediaUrl={parsedBook.resolveMediaUrl}
        chapterIndex={chapterIndex} currentChapterId={currentChapter?.id || ''}
        currentChapterTitle={currentChapter?.title || ''} chapterScrollRatio={chapterScrollRatio}
        tocOpen={tocOpen} drawerTab={drawerTab} palette={palette} features={features}
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
