import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight,
  List, Loader2, RefreshCw, ShieldCheck, Type,
} from 'lucide-react';
import type { Book, Chapter, GuestTocItem, ReaderSettings, ReadingProgress } from '@/types';
import { ReaderSettingsPopover } from '@/components/ReaderSettingsPopover';
import { ReaderTocDrawer } from '@/components/ReaderTocDrawer';
import { useGuestChapterStream } from '@/hooks/useGuestChapterStream';
import { computeChapterCanvasLayout } from '@/lib/guestCanvasLayout';
import { paintGuestViewportCanvas } from '@/lib/guestCanvasPaint';
import { READER_THEME_STYLES } from '@/lib/readerConfig';

const VIEWPORT_OVERSCAN_PX = 280;

export interface GuestCanvasReaderProps {
  book: Book;
  tocChapters: GuestTocItem[];
  watermarkLabel: string;
  initialProgress?: ReadingProgress;
  settings: ReaderSettings;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
}

export function GuestCanvasReader({
  book, tocChapters, watermarkLabel, initialProgress,
  settings, onUpdateSettings, onSaveProgress, onApiError, onClose,
}: GuestCanvasReaderProps) {
  const initialIdx = useMemo(() => {
    if (!initialProgress || tocChapters.length === 0) return 0;
    const byId = tocChapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, tocChapters.length - 1));
  }, [initialProgress, tocChapters]);

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterScrollPercent, setChapterScrollPercent] = useState(0);
  const [stageBox, setStageBox] = useState({ width: 760, height: 720 });
  const [pageHidden, setPageHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );

  const {
    chapterData, loadingChapter, chapterError, imageSizes, bitmapsRef, retryChapter,
  } = useGuestChapterStream({ bookId: book.id, chapterIndex, onApiError });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress && initialProgress.chapterId === tocChapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : null,
  );
  const suppressSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<ReadingProgress | null>(null);
  const completedRef = useRef(Boolean(initialProgress?.completed));

  const palette = READER_THEME_STYLES[settings.theme];
  const currentTocItem = tocChapters[chapterIndex];

  const tocDrawerChapters = useMemo<Chapter[]>(
    () =>
      tocChapters.map((item) => ({
        id: item.id,
        book_id: book.id,
        title: item.title,
        content: '',
        chapter_number: item.chapterNumber,
      })),
    [book.id, tocChapters],
  );

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => {
      const padX = el.clientWidth >= 640 ? 56 : 28;
      setStageBox({
        width: Math.max(240, el.clientWidth - padX),
        height: Math.max(280, el.clientHeight),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisChange = () => setPageHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

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
      if (immediate) flushProgress();
      else saveTimerRef.current = setTimeout(flushProgress, 600);
    },
    [flushProgress],
  );

  useEffect(() => () => flushProgress(), [flushProgress]);

  const layout = useMemo(() => {
    if (!chapterData) return null;
    return computeChapterCanvasLayout({
      chapterTitle: chapterData.title,
      chapterIndex,
      totalChapters: tocChapters.length,
      blocks: chapterData.blocks,
      settings,
      containerWidth: stageBox.width,
      imageSizes,
    });
  }, [chapterData, chapterIndex, imageSizes, settings, stageBox.width, tocChapters.length]);

  const effectiveWatermark = chapterData?.watermarkLabel || watermarkLabel || 'Guest';

  const paintVisibleSlice = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const canvas = canvasRef.current;
    if (!scrollEl || !canvas || !layout) return;

    const sliceHeight = Math.min(layout.totalHeight, stageBox.height + VIEWPORT_OVERSCAN_PX * 2);
    const maxSliceTop = Math.max(0, layout.totalHeight - sliceHeight);
    const sliceTop = Math.max(
      0,
      Math.min(maxSliceTop, Math.floor(scrollEl.scrollTop - VIEWPORT_OVERSCAN_PX)),
    );

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
    paintVisibleSlice();
  }, [paintVisibleSlice]);

  const goToChapter = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, tocChapters.length - 1));
      const target = tocChapters[clamped];
      if (!target) return;

      suppressSaveRef.current = true;
      restoreTargetRatioRef.current = 0;
      setChapterIndex(clamped);
      setTocOpen(false);
      setChapterScrollPercent(0);

      queueProgressSave(
        {
          chapterId: target.id,
          chapterIndex: clamped,
          chapterTitle: target.title,
          totalChapters: tocChapters.length,
          scrollRatio: 0,
          scrollTop: 0,
          completed: completedRef.current,
          updatedAt: Date.now(),
        },
        true,
      );
    },
    [queueProgressSave, tocChapters],
  );

  const goPrev = useCallback(() => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1);
  }, [chapterIndex, goToChapter]);

  const goNext = useCallback(() => {
    if (chapterIndex < tocChapters.length - 1) goToChapter(chapterIndex + 1);
  }, [chapterIndex, goToChapter, tocChapters.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['s', 'p', 'c', 'u'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        return;
      }

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
    paintVisibleSlice();
    const el = scrollContainerRef.current;
    if (!el || !currentTocItem || !layout) return;

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollTop / maxScroll)) : 1;
    const nextPct = Math.round(ratio * 100);
    setChapterScrollPercent((prev) => (prev === nextPct ? prev : nextPct));

    if (suppressSaveRef.current) return;

    const reachedEndOfBook =
      chapterIndex === tocChapters.length - 1 && (maxScroll === 0 || ratio >= 0.97);
    if (reachedEndOfBook) completedRef.current = true;

    queueProgressSave(
      {
        chapterId: currentTocItem.id,
        chapterIndex,
        chapterTitle: currentTocItem.title,
        totalChapters: tocChapters.length,
        scrollRatio: ratio,
        scrollTop: el.scrollTop,
        completed: completedRef.current,
        updatedAt: Date.now(),
      },
      reachedEndOfBook,
    );
  }, [
    chapterIndex,
    currentTocItem,
    layout,
    paintVisibleSlice,
    queueProgressSave,
    tocChapters.length,
  ]);

  useLayoutEffect(() => {
    if (!layout || !scrollContainerRef.current) return;
    if (restoreTargetRatioRef.current === null) return;

    suppressSaveRef.current = true;
    const targetRatio = restoreTargetRatioRef.current;
    const el = scrollContainerRef.current;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.round(maxScroll * targetRatio);
    restoreTargetRatioRef.current = null;
    suppressSaveRef.current = false;
    paintVisibleSlice();
  }, [layout, paintVisibleSlice]);

  const overallPercent = useMemo(() => {
    if (tocChapters.length === 0) return 0;
    const base = chapterIndex / tocChapters.length;
    const intra = chapterScrollPercent / 100 / tocChapters.length;
    return Math.min(100, Math.round((base + intra) * 100));
  }, [chapterIndex, chapterScrollPercent, tocChapters.length]);

  return (
    <div
      className={`guest-protected-reader flex h-screen select-none flex-col overflow-hidden transition-colors duration-200 ${palette.pageBg} ${palette.textPrimary}`}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <header
        className={`relative z-30 flex h-[3.25rem] shrink-0 items-center justify-between border-b px-3 backdrop-blur-md sm:px-5 ${palette.headerBg} ${palette.border}`}
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
              {currentTocItem?.title} · {overallPercent}%
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:inline-flex ${palette.border} ${palette.textSecondary}`}
            title="Chế độ đọc bảo vệ bản quyền — gắn thuỷ vân định danh phiên Discord"
          >
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            {effectiveWatermark}
          </span>

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
        </div>

        {settingsOpen && (
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
          chapters={tocDrawerChapters}
          activeIndex={chapterIndex}
          isPdf={false}
          palette={palette}
          onSelectChapter={goToChapter}
          onClose={() => setTocOpen(false)}
        />
      )}

      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={(event) => {
          if (settingsOpen) {
            setSettingsOpen(false);
            return;
          }
          if (!settings.sideTapNavigation) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest('button, a, input, select, textarea')) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          if (ratio < 0.16) goPrev();
          else if (ratio > 0.84) goNext();
        }}
        className={`scrollbar-thin flex-1 overflow-y-auto px-3.5 py-6 transition-all sm:px-7 sm:py-10 ${
          pageHidden ? 'blur-lg' : ''
        }`}
      >
        {loadingChapter ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin opacity-70" />
            <p className={`text-sm ${palette.textSecondary}`}>Đang mở trang sách...</p>
          </div>
        ) : chapterError ? (
          <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center gap-3 text-center">
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
        ) : (
          layout && (
            <div className="mx-auto" style={{ width: `${stageBox.width}px` }}>
              <div
                className="relative w-full overflow-hidden rounded-lg"
                style={{ height: `${layout.totalHeight}px` }}
              >
                <canvas
                  ref={canvasRef}
                  aria-label="Trang đọc sách"
                  className="pointer-events-none absolute left-0 top-0 block"
                />
              </div>

              <nav
                className={`mt-10 flex items-center justify-between gap-3 border-t pb-8 pt-6 ${palette.border}`}
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

                {chapterIndex === tocChapters.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      completedRef.current = true;
                      if (currentTocItem) {
                        queueProgressSave(
                          {
                            chapterId: currentTocItem.id,
                            chapterIndex,
                            chapterTitle: currentTocItem.title,
                            totalChapters: tocChapters.length,
                            scrollRatio: 1,
                            scrollTop: scrollContainerRef.current?.scrollTop || 0,
                            completed: true,
                            updatedAt: Date.now(),
                          },
                          true,
                        );
                      }
                      onClose();
                    }}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-500"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Hoàn thành cuốn này!</span>
                  </button>
                ) : (
                  <span className={`text-xs tabular-nums ${palette.textSecondary}`}>
                    {chapterIndex + 1} / {tocChapters.length}
                  </span>
                )}

                <button
                  type="button"
                  onClick={goNext}
                  disabled={chapterIndex === tocChapters.length - 1}
                  className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
                >
                  <span>Sau</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          )
        )}
      </main>

      <div className="h-1 w-full shrink-0 bg-black/10">
        <div
          className={`h-full transition-all duration-150 ${palette.progressBar}`}
          style={{ width: `${overallPercent}%` }}
        />
      </div>
    </div>
  );
}
