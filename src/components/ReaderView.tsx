import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { HardDrive, Sparkles } from 'lucide-react';
import type {
  Book,
  ParsedBook,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import { ReaderBookCommunityBlock } from '@/components/ReaderBookCommunityBlock';
import { ReaderChapterEndNav } from '@/components/ReaderChapterEndNav';
import {
  ReaderFooterStatusBar,
  ReaderNightDimOverlay,
} from '@/components/ReaderFooterStatusBar';
import { ReaderOverlaysHost } from '@/components/ReaderOverlaysHost';
import { type PaginatedStageHandle, ReaderPaginatedView } from '@/components/ReaderPaginatedView';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import { useReaderBookFeatures } from '@/hooks/useReaderBookFeatures';
import { useReaderChapterProgress } from '@/hooks/useReaderChapterProgress';
import {
  applyChapterDomHighlights,
  captureOwnerSelectionDraft,
} from '@/lib/domHighlights';
import { resolveOwnerFootnoteClick } from '@/lib/epubFootnotes';
import {
  READER_FONT_CLASS,
  READER_THEME_STYLES,
  READER_WIDTH_MAX,
  handleReaderContentLinkClick,
} from '@/lib/readerConfig';
import {
  buildReaderTypographyStyle,
  countWordsInPlainText,
} from '@/lib/readingEstimate';
import {
  findDomBlockForSearchQuery,
  flashDomSearchElement,
} from '@/lib/readerSearchJump';

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
  onOpenNextBook?: (nextBook: Book) => void;
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
    paginatedStartRatio, setPaginatedStartRatio, searchTarget,
    restoreTargetRatioRef, suppressSaveRef, overallPercent, computeRemainingEstimate,
    goToChapter, goPrevChapter, goNextChapter,
    handlePaginatedRatioChange, handleJumpToSearchResult, completeBook,
  } = useReaderChapterProgress({
    chapters,
    initialProgress,
    settings,
    isPaginated,
    scrollContainerRef,
    paginatedRef,
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

  const currentChapter = chapters[chapterIndex];

  const features = useReaderBookFeatures({
    bookId: book.id,
    chapterIndex,
    currentChapterId: currentChapter?.id || '',
    currentChapterTitle: currentChapter?.title || '',
    initialChapterIndex: initialProgress?.chapterIndex ?? 0,
    initialCompleted: Boolean(initialProgress?.completed),
    totalChapters: chapters.length,
    onApiError,
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

  const handleUpdateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (patch.layoutMode && patch.layoutMode !== settings.layoutMode) {
        if (patch.layoutMode === 'paginated') setPaginatedStartRatio(chapterScrollRatio);
        else restoreTargetRatioRef.current = chapterScrollRatio;
      }
      onUpdateSettings(patch);
    },
    [chapterScrollRatio, onUpdateSettings, restoreTargetRatioRef, setPaginatedStartRatio, settings.layoutMode],
  );

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

  useLayoutEffect(() => {
    if (isPaginated || !currentChapter || !scrollContainerRef.current) return;
    suppressSaveRef.current = true;
    const targetRatio = restoreTargetRatioRef.current ?? 0;

    let frame = 0;
    let tries = 0;
    const apply = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.round(maxScroll * targetRatio);
      lastScrollTopRef.current = el.scrollTop;
      tries += 1;
      if (tries < 4) {
        frame = requestAnimationFrame(apply);
      } else {
        restoreTargetRatioRef.current = null;
        suppressSaveRef.current = false;
        handleScroll();
      }
    };
    frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [currentChapter, handleScroll, isPaginated, lastScrollTopRef, restoreTargetRatioRef, suppressSaveRef]);

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
      <ReaderNightDimOverlay nightDimPercent={settings.nightDimPercent} settingsOpen={settingsOpen} />

      <ReaderTopBar
        bookTitle={book.title}
        chapterTitle={currentChapter?.title}
        overallPercent={overallPercent}
        immersiveHidden={immersiveHidden}
        settingsOpen={settingsOpen}
        settings={settings}
        palette={palette}
        statusBadge={cacheBadge}
        onBack={() => { flushProgress({ forceTimeFlush: true, keepalive: true }); onClose(); }}
        onOpenDrawerTab={openDrawerTab}
        onHideToolbar={() => { setSettingsOpen(false); setImmersiveHidden(true); }}
        onToggleSettings={() => { setTocOpen(false); setSettingsOpen((v) => !v); }}
        onCloseSettings={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
      />

      {isPaginated && currentChapter ? (
        <>
          <ReaderPaginatedView
            ref={paginatedRef}
            bookId={book.id}
            bookTitle={book.title}
            chapter={currentChapter}
            chapterIndex={chapterIndex}
            totalChapters={chapters.length}
            initialRatio={paginatedStartRatio}
            nextBook={nextBook}
            settings={settings}
            palette={palette}
            immersiveHidden={immersiveHidden}
            remainingEstimate={remainingEstimate}
            searchTarget={searchTarget}
            chapterHighlights={features.chapterHighlights}
            onContentInteractionClick={handleContentInteractionClick}
            onSelectionEnd={handleContentSelectionEnd}
            onToggleImmersive={() => setImmersiveHidden((prev) => !prev)}
            onCloseSettings={() => {
              if (!settingsOpen) return false;
              setSettingsOpen(false);
              return true;
            }}
            onRatioChange={handlePaginatedRatioChange}
            onPrevChapterEnd={() => { if (chapterIndex > 0) goToChapter(chapterIndex - 1, 1); }}
            onNextChapterStart={() => { if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1, 0); }}
            onCompleteBook={completeBook}
            onOpenImage={(src, alt) => setLightboxTarget({ kind: 'dom', src, alt })}
            onApiError={onApiError}
          />
          <div className="h-1 w-full shrink-0 bg-black/10">
            <div className={`h-full transition-all duration-150 ${palette.progressBar}`} style={{ width: `${overallPercent}%` }} />
          </div>
        </>
      ) : (
        <>
          <main
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onMouseUp={() => handleContentSelectionEnd(scrollContainerRef.current)}
            onTouchEnd={() => handleContentSelectionEnd(scrollContainerRef.current)}
            onClick={(event) => {
              if (settingsOpen) { setSettingsOpen(false); return; }
              if (handleContentInteractionClick(event, scrollContainerRef.current)) return;
              if (handleReaderContentLinkClick(event, scrollContainerRef.current)) return;
              if (window.getSelection()?.toString()) return;

              const target = event.target as HTMLElement | null;
              const clickedImg = target?.closest('.reading-content img') as HTMLImageElement | null;
              if (clickedImg?.src) {
                setLightboxTarget({ kind: 'dom', src: clickedImg.src, alt: clickedImg.alt || book.title });
                return;
              }

              if (target?.closest('button, a, input, select, textarea, [data-community-section]')) {
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              if (settings.sideTapNavigation && ratio < 0.16) goPrevChapter();
              else if (settings.sideTapNavigation && ratio > 0.84) goNextChapter();
              else if (immersiveHidden && ratio >= 0.22 && ratio <= 0.78) setImmersiveHidden(false);
            }}
            className="scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[4.75rem] sm:px-8 sm:pb-[calc(3rem+env(safe-area-inset-bottom))] sm:pt-20"
          >
            {currentChapter && (
              <article
                key={currentChapter.id}
                className="fade-in mx-auto w-full min-w-0"
                style={{ maxWidth: READER_WIDTH_MAX[settings.width] }}
              >
                <header className={`mb-8 border-b pb-5 text-center ${palette.border}`}>
                  <p className={`mb-1.5 text-xs uppercase tracking-[0.2em] ${palette.textSecondary}`}>
                    {`Phần ${chapterIndex + 1} / ${chapters.length}`}
                  </p>
                  <h1 className="font-display text-2xl font-bold leading-snug sm:text-3xl">
                    {currentChapter.title}
                  </h1>
                </header>

                <div
                  className={`reading-content ${READER_FONT_CLASS[settings.font]}`}
                  style={buildReaderTypographyStyle(settings)}
                >
                  {currentChapter.content_html ? (
                    <div dangerouslySetInnerHTML={{ __html: currentChapter.content_html }} />
                  ) : (
                    currentChapter.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)
                  )}
                </div>

                <ReaderChapterEndNav
                  chapterIndex={chapterIndex}
                  totalChapters={chapters.length}
                  palette={palette}
                  nextBook={nextBook}
                  onPrev={goPrevChapter}
                  onNext={goNextChapter}
                  onCompleteAndClose={() => completeBook()}
                  onCompleteAndOpenNext={(nb) => completeBook(nb)}
                />

                {chapterIndex >= chapters.length - 1 && (
                  <ReaderBookCommunityBlock
                    bookId={book.id}
                    bookTitle={book.title}
                    palette={palette}
                    onApiError={onApiError}
                  />
                )}
              </article>
            )}
          </main>

          <ReaderFooterStatusBar
            chapterIndex={chapterIndex}
            totalChapters={chapters.length}
            overallPercent={overallPercent}
            remainingEstimate={remainingEstimate}
            immersiveHidden={immersiveHidden}
            palette={palette}
          />
        </>
      )}

      <ReaderOverlaysHost
        role="owner"
        book={book}
        allBooks={allBooks}
        chapters={chapters}
        parsedChapters={chapters}
        chapterIndex={chapterIndex}
        currentChapterId={currentChapter?.id || ''}
        currentChapterTitle={currentChapter?.title || ''}
        chapterScrollRatio={chapterScrollRatio}
        tocOpen={tocOpen}
        drawerTab={drawerTab}
        palette={palette}
        features={features}
        lightboxTarget={lightboxTarget}
        onCloseToc={() => setTocOpen(false)}
        onSelectChapter={(idx) => goToChapter(idx, 0)}
        onJumpToRatio={goToChapter}
        onJumpToSearchResult={handleJumpToSearchResult}
        onSetLightboxTarget={setLightboxTarget}
        onOpenOtherBook={(targetBook) => {
          flushProgress({ forceTimeFlush: true, keepalive: true });
          onOpenNextBook?.(targetBook);
        }}
        onApiError={onApiError}
      />
    </div>
  );
}
