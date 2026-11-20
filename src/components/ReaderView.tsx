import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  List,
  Loader2,
  Sparkles,
  Type,
} from 'lucide-react';
import type { Book, ParsedBook, ReaderSettings, ReadingProgress } from '@/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PdfReaderFallback } from '@/components/PdfReaderFallback';
import { ReaderSettingsPopover } from '@/components/ReaderSettingsPopover';
import { ReaderTocDrawer } from '@/components/ReaderTocDrawer';
import {
  READER_FONT_CLASS,
  READER_THEME_STYLES,
  READER_WIDTH_MAX,
} from '@/lib/readerConfig';

const LazyPdfReader = lazy(() =>
  import('@/components/PdfReader').then((mod) => ({ default: mod.PdfReader })),
);

type ReaderViewProps = {
  book: Book;
  parsedBook: ParsedBook;
  loadedFromCache: boolean;
  initialProgress?: ReadingProgress;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  onClose: () => void;
};

export function ReaderView({
  book,
  parsedBook,
  loadedFromCache,
  initialProgress,
  settings,
  onUpdateSettings,
  onSaveProgress,
  onClose,
}: ReaderViewProps) {
  const { chapters, pdfBlobUrl } = parsedBook;
  const isPdf = book.file_type === 'pdf' && Boolean(pdfBlobUrl);

  const initialIdx = useMemo(() => {
    if (!initialProgress) return 0;
    const byId = chapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, chapters.length - 1));
  }, [chapters, initialProgress]);

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterScrollPercent, setChapterScrollPercent] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress && initialProgress.chapterId === chapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : null,
  );
  const suppressSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<ReadingProgress | null>(null);
  const completedRef = useRef(Boolean(initialProgress?.completed));

  const currentChapter = chapters[chapterIndex];
  const palette = READER_THEME_STYLES[settings.theme];

  const flushProgress = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingProgressRef.current) {
      onSaveProgress(pendingProgressRef.current);
      pendingProgressRef.current = null;
    }
  }, [onSaveProgress]);

  const queueProgressSave = useCallback(
    (progress: ReadingProgress, immediate = false) => {
      pendingProgressRef.current = progress;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (immediate) {
        flushProgress();
      } else {
        saveTimerRef.current = setTimeout(flushProgress, 600);
      }
    },
    [flushProgress],
  );

  useEffect(() => () => flushProgress(), [flushProgress]);

  const goToChapter = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, chapters.length - 1));
      const target = chapters[clamped];
      if (!target) return;

      suppressSaveRef.current = true;
      restoreTargetRatioRef.current = 0;
      setChapterIndex(clamped);
      setTocOpen(false);

      const isCompleted = completedRef.current || (isPdf && clamped === chapters.length - 1);
      completedRef.current = isCompleted;
      const pdfRatio = isPdf && chapters.length > 0 ? (clamped + 1) / chapters.length : 0;

      queueProgressSave(
        {
          chapterId: target.id,
          chapterIndex: clamped,
          chapterTitle: target.title,
          totalChapters: chapters.length,
          scrollRatio: pdfRatio,
          scrollTop: 0,
          completed: isCompleted,
          updatedAt: Date.now(),
        },
        true,
      );
    },
    [chapters, isPdf, queueProgressSave],
  );

  const goPrev = useCallback(() => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1);
  }, [chapterIndex, goToChapter]);

  const goNext = useCallback(() => {
    if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1);
  }, [chapterIndex, chapters.length, goToChapter]);

  // Safe keyboard navigation: ignores inputs/textareas and Escape closes panels
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        if (tocOpen) setTocOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        return;
      }

      if (isTyping || !settings.sideTapNavigation) return;
      if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, settings.sideTapNavigation, settingsOpen, tocOpen]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !currentChapter || isPdf) return;

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollTop / maxScroll)) : 1;
    setChapterScrollPercent(Math.round(ratio * 100));

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
        scrollTop: el.scrollTop,
        completed: completedRef.current,
        updatedAt: Date.now(),
      },
      reachedEndOfBook,
    );
  }, [chapterIndex, chapters.length, currentChapter, isPdf, queueProgressSave]);

  // Restore scroll position smoothly by ratio (survives font size & screen width changes)
  useLayoutEffect(() => {
    if (isPdf || !currentChapter || !scrollContainerRef.current) return;
    suppressSaveRef.current = true;
    const targetRatio = restoreTargetRatioRef.current ?? 0;

    let frame = 0;
    let tries = 0;
    const apply = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.round(maxScroll * targetRatio);
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
  }, [currentChapter, handleScroll, isPdf]);

  const overallPercent = useMemo(() => {
    if (chapters.length === 0) return 0;
    if (isPdf) return Math.round(((chapterIndex + 1) / chapters.length) * 100);
    const base = chapterIndex / chapters.length;
    const intra = chapterScrollPercent / 100 / chapters.length;
    return Math.min(100, Math.round((base + intra) * 100));
  }, [chapterIndex, chapterScrollPercent, chapters.length, isPdf]);

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden transition-colors duration-200 ${
        isPdf ? 'bg-canvas text-ink' : `${palette.pageBg} ${palette.textPrimary}`
      }`}
    >
      {/* Slim Reader Header */}
      <header
        className={`relative z-30 flex h-[3.25rem] shrink-0 items-center justify-between border-b px-3 backdrop-blur-md sm:px-5 ${
          isPdf ? 'border-line bg-surface/95' : `${palette.headerBg} ${palette.border}`
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              flushProgress();
              onClose();
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${palette.hover}`}
            title="Quay lại Thư viện"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Thư viện</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setTocOpen(true);
            }}
            className={`rounded-lg p-2 transition ${palette.hover}`}
            aria-label="Mở mục lục"
            title="Mục lục chương"
          >
            <List className="h-4 w-4" />
          </button>

          <div className="min-w-0 pl-1">
            <p className="truncate font-display text-sm font-semibold leading-tight">
              {book.title}
            </p>
            <p className={`truncate text-[11px] ${palette.textSecondary}`}>
              {currentChapter?.title} · {overallPercent}%
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
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

          {!isPdf && (
            <button
              type="button"
              onClick={() => {
                setTocOpen(false);
                setSettingsOpen((v) => !v);
              }}
              className={`rounded-lg p-2 transition ${settingsOpen ? palette.active : palette.hover}`}
              aria-label="Tùy chỉnh trình đọc"
              title="Cài đặt đọc sách"
            >
              <Type className="h-4 w-4" />
            </button>
          )}
        </div>

        {settingsOpen && !isPdf && (
          <ReaderSettingsPopover
            settings={settings}
            palette={palette}
            onUpdateSettings={onUpdateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </header>

      {tocOpen && (
        <ReaderTocDrawer
          book={book}
          chapters={chapters}
          activeIndex={chapterIndex}
          isPdf={isPdf}
          palette={palette}
          onSelectChapter={goToChapter}
          onClose={() => setTocOpen(false)}
        />
      )}

      {/* Main Content Area */}
      {isPdf && pdfBlobUrl ? (
        <ErrorBoundary
          fallback={(errorMessage) => (
            <PdfReaderFallback
              errorMessage={errorMessage}
              onClose={() => {
                flushProgress();
                onClose();
              }}
            />
          )}
        >
          <Suspense
            fallback={
              <div className="theme-canvas flex h-[calc(100vh-3.25rem)] flex-col items-center justify-center gap-3 p-8 text-ink-muted">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                <p className="text-sm">Đang tải trình đọc PDF...</p>
              </div>
            }
          >
            <LazyPdfReader
              url={pdfBlobUrl}
              fileName={book.title}
              pageNumber={chapterIndex + 1}
              pageCount={chapters.length}
              onPageChange={(page) => goToChapter(page - 1)}
            />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onClick={(event) => {
            if (settingsOpen) {
              setSettingsOpen(false);
              return;
            }
            if (!settings.sideTapNavigation) return;
            const selection = window.getSelection()?.toString();
            if (selection) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('button, a, input, select, textarea')) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            if (ratio < 0.16) goPrev();
            else if (ratio > 0.84) goNext();
          }}
          className="scrollbar-thin flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-12"
        >
          {currentChapter && (
            <article
              key={currentChapter.id}
              className="fade-in mx-auto w-full"
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

              <nav
                className={`mt-14 flex items-center justify-between gap-3 border-t pb-8 pt-6 ${palette.border}`}
              >
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={chapterIndex === 0}
                  className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Trước</span>
                </button>

                {chapterIndex === chapters.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
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
                      onClose();
                    }}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-500"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Hoàn thành cuốn này!</span>
                  </button>
                ) : (
                  <span className={`text-xs tabular-nums ${palette.textSecondary}`}>
                    {chapterIndex + 1} / {chapters.length}
                  </span>
                )}

                <button
                  type="button"
                  onClick={goNext}
                  disabled={chapterIndex === chapters.length - 1}
                  className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
                >
                  <span>Sau</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </article>
          )}
        </main>
      )}

      {!isPdf && (
        <div className="h-1 w-full shrink-0 bg-black/10">
          <div
            className={`h-full transition-all duration-150 ${palette.progressBar}`}
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
