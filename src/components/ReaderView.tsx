import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HardDrive, Sparkles } from 'lucide-react';
import type { Book, ParsedBook, ReaderSettings, ReadingProgress } from '@/types';
import { ReaderChapterEndNav } from '@/components/ReaderChapterEndNav';
import { type PaginatedStageHandle, ReaderPaginatedView } from '@/components/ReaderPaginatedView';
import { ReaderTocDrawer } from '@/components/ReaderTocDrawer';
import { ReaderTopBar } from '@/components/ReaderTopBar';
import { useReaderController } from '@/hooks/useReaderController';
import {
  READER_FONT_CLASS,
  READER_THEME_STYLES,
  READER_WIDTH_MAX,
} from '@/lib/readerConfig';

const LazyReaderImageLightbox = lazy(() =>
  import('@/components/ReaderImageLightbox').then((mod) => ({
    default: mod.ReaderImageLightbox,
  })),
);

type ReaderViewProps = {
  book: Book;
  parsedBook: ParsedBook;
  loadedFromCache: boolean;
  initialProgress?: ReadingProgress;
  nextBook?: Book | null;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  onOpenNextBook?: (nextBook: Book) => void;
  onClose: () => void;
};

export function ReaderView({
  book,
  parsedBook,
  loadedFromCache,
  initialProgress,
  nextBook,
  settings,
  onUpdateSettings,
  onSaveProgress,
  onOpenNextBook,
  onClose,
}: ReaderViewProps) {
  const { chapters } = parsedBook;
  const isPaginated = settings.layoutMode === 'paginated';

  const initialIdx = useMemo(() => {
    if (!initialProgress) return 0;
    const byId = chapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, chapters.length - 1));
  }, [chapters, initialProgress]);

  const initialStartRatio =
    initialProgress && initialProgress.chapterId === chapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : 0;

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [chapterScrollRatio, setChapterScrollRatio] = useState(initialStartRatio);
  const [paginatedStartRatio, setPaginatedStartRatio] = useState(initialStartRatio);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const paginatedRef = useRef<PaginatedStageHandle>(null);
  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress && initialProgress.chapterId === chapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : null,
  );
  const suppressSaveRef = useRef(false);
  const goPrevRef = useRef<() => void>(() => undefined);
  const goNextRef = useRef<() => void>(() => undefined);

  const ctrl = useReaderController({
    initialCompleted: Boolean(initialProgress?.completed),
    settings,
    onSaveProgress,
    onPrev: () => goPrevRef.current(),
    onNext: () => goNextRef.current(),
  });
  const {
    tocOpen,
    setTocOpen,
    drawerTab,
    settingsOpen,
    setSettingsOpen,
    immersiveHidden,
    setImmersiveHidden,
    lightboxTarget,
    setLightboxTarget,
    lastScrollTopRef,
    completedRef,
    flushProgress,
    queueProgressSave,
    openDrawerTab,
    updateImmersiveOnScroll,
  } = ctrl;

  const currentChapter = chapters[chapterIndex];
  const palette = READER_THEME_STYLES[settings.theme];

  const handleUpdateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (patch.layoutMode && patch.layoutMode !== settings.layoutMode) {
        if (patch.layoutMode === 'paginated') {
          setPaginatedStartRatio(chapterScrollRatio);
        } else {
          restoreTargetRatioRef.current = chapterScrollRatio;
        }
      }
      onUpdateSettings(patch);
    },
    [chapterScrollRatio, onUpdateSettings, settings.layoutMode],
  );

  const goToChapter = useCallback(
    (nextIndex: number, targetRatio = 0) => {
      const clamped = Math.max(0, Math.min(nextIndex, chapters.length - 1));
      const target = chapters[clamped];
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
          chapterId: target.id,
          chapterIndex: clamped,
          chapterTitle: target.title,
          totalChapters: chapters.length,
          scrollRatio: safeRatio,
          scrollTop: 0,
          completed: completedRef.current,
          updatedAt: Date.now(),
        },
        true,
      );
    },
    [
      chapterIndex,
      chapters,
      completedRef,
      isPaginated,
      lastScrollTopRef,
      queueProgressSave,
      setImmersiveHidden,
      setTocOpen,
    ],
  );

  const goPrevChapter = useCallback(() => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1, 0);
  }, [chapterIndex, goToChapter]);

  const goNextChapter = useCallback(() => {
    if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1, 0);
  }, [chapterIndex, chapters.length, goToChapter]);

  goPrevRef.current = isPaginated ? () => paginatedRef.current?.stepPrev() : goPrevChapter;
  goNextRef.current = isPaginated ? () => paginatedRef.current?.stepNext() : goNextChapter;

  const handlePaginatedRatioChange = useCallback(
    (ratio: number, isEndOfChapter: boolean) => {
      if (!currentChapter) return;
      setChapterScrollRatio(ratio);
      const reachedEnd = chapterIndex === chapters.length - 1 && isEndOfChapter;
      if (reachedEnd) completedRef.current = true;

      queueProgressSave(
        {
          chapterId: currentChapter.id,
          chapterIndex,
          chapterTitle: currentChapter.title,
          totalChapters: chapters.length,
          scrollRatio: ratio,
          scrollTop: 0,
          completed: completedRef.current,
          updatedAt: Date.now(),
        },
        reachedEnd,
      );
    },
    [chapterIndex, chapters.length, completedRef, currentChapter, queueProgressSave],
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
    chapterIndex,
    chapters.length,
    completedRef,
    currentChapter,
    isPaginated,
    queueProgressSave,
    updateImmersiveOnScroll,
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
  }, [currentChapter, handleScroll, isPaginated, lastScrollTopRef]);

  const completeBook = useCallback(
    (targetNextBook?: Book) => {
      if (currentChapter) {
        completedRef.current = true;
        queueProgressSave(
          {
            chapterId: currentChapter.id,
            chapterIndex,
            chapterTitle: currentChapter.title,
            totalChapters: chapters.length,
            scrollRatio: 1,
            scrollTop: scrollContainerRef.current?.scrollTop || 0,
            completed: true,
            updatedAt: Date.now(),
          },
          true,
        );
      }
      if (targetNextBook && onOpenNextBook) onOpenNextBook(targetNextBook);
      else onClose();
    },
    [chapterIndex, chapters.length, completedRef, currentChapter, onClose, onOpenNextBook, queueProgressSave],
  );

  const overallPercent = useMemo(() => {
    if (chapters.length === 0) return 0;
    const base = chapterIndex / chapters.length;
    const intra = chapterScrollRatio / chapters.length;
    return Math.min(100, Math.round((base + intra) * 100));
  }, [chapterIndex, chapterScrollRatio, chapters.length]);

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
      <ReaderTopBar
        bookTitle={book.title}
        chapterTitle={currentChapter?.title}
        overallPercent={overallPercent}
        immersiveHidden={immersiveHidden}
        settingsOpen={settingsOpen}
        settings={settings}
        palette={palette}
        statusBadge={cacheBadge}
        onBack={() => {
          flushProgress();
          onClose();
        }}
        onOpenDrawerTab={openDrawerTab}
        onHideToolbar={() => {
          setSettingsOpen(false);
          setImmersiveHidden(true);
        }}
        onToggleSettings={() => {
          setTocOpen(false);
          setSettingsOpen((v) => !v);
        }}
        onCloseSettings={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
      />

      {tocOpen && (
        <ReaderTocDrawer
          book={book}
          chapters={chapters}
          parsedChapters={chapters}
          activeIndex={chapterIndex}
          currentChapterId={currentChapter?.id || ''}
          currentChapterTitle={currentChapter?.title || ''}
          currentScrollRatio={chapterScrollRatio}
          initialTab={drawerTab}
          palette={palette}
          onSelectChapter={(idx) => goToChapter(idx, 0)}
          onJumpToBookmark={goToChapter}
          onClose={() => setTocOpen(false)}
        />
      )}

      {isPaginated && currentChapter ? (
        <ReaderPaginatedView
          ref={paginatedRef}
          bookTitle={book.title}
          chapter={currentChapter}
          chapterIndex={chapterIndex}
          totalChapters={chapters.length}
          initialRatio={paginatedStartRatio}
          nextBook={nextBook}
          settings={settings}
          palette={palette}
          immersiveHidden={immersiveHidden}
          onToggleImmersive={() => setImmersiveHidden((prev) => !prev)}
          onCloseSettings={() => {
            if (settingsOpen) setSettingsOpen(false);
          }}
          onRatioChange={handlePaginatedRatioChange}
          onPrevChapterEnd={() => {
            if (chapterIndex > 0) goToChapter(chapterIndex - 1, 1);
          }}
          onNextChapterStart={() => {
            if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1, 0);
          }}
          onCompleteBook={completeBook}
          onOpenImage={(src, alt) => setLightboxTarget({ kind: 'dom', src, alt })}
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
            const selection = window.getSelection()?.toString();
            if (selection) return;

            const target = event.target as HTMLElement | null;
            const clickedImg = target?.closest('.reading-content img') as HTMLImageElement | null;
            if (clickedImg?.src) {
              setLightboxTarget({
                kind: 'dom',
                src: clickedImg.src,
                alt: clickedImg.alt || book.title,
              });
              return;
            }

            if (target?.closest('button, a, input, select, textarea')) return;
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
                style={{
                  fontSize: `${settings.fontSizePx}px`,
                  lineHeight: settings.lineHeight,
                }}
              >
                {currentChapter.content_html ? (
                  <div dangerouslySetInnerHTML={{ __html: currentChapter.content_html }} />
                ) : (
                  currentChapter.content
                    .split('\n\n')
                    .map((para, i) => <p key={i}>{para}</p>)
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
            </article>
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
