import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  List,
  Minus,
  Plus,
  Search,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import type {
  Book,
  ParsedBook,
  ReaderFont,
  ReaderSettings,
  ReaderTheme,
  ReaderWidth,
  ReadingProgress,
} from '@/types';
import { PdfReader } from '@/components/PdfReader';

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

const THEME_STYLES: Record<
  ReaderTheme,
  {
    label: string;
    swatch: string;
    pageBg: string;
    headerBg: string;
    panelBg: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    hover: string;
    active: string;
    isDark: boolean;
  }
> = {
  paper: {
    label: 'Sáng',
    swatch: 'bg-[#fcfbf8] border-stone-300',
    pageBg: 'bg-[#fcfbf8]',
    headerBg: 'bg-[#fcfbf8]/92',
    panelBg: 'bg-white',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-500',
    border: 'border-stone-200',
    hover: 'hover:bg-stone-100',
    active: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    isDark: false,
  },
  sepia: {
    label: 'Giấy cổ',
    swatch: 'bg-[#f4ecd8] border-amber-300',
    pageBg: 'bg-[#f4ecd8]',
    headerBg: 'bg-[#f4ecd8]/92',
    panelBg: 'bg-[#efe4ca]',
    textPrimary: 'text-[#3c2f1e]',
    textSecondary: 'text-[#7c664a]',
    border: 'border-[#dfd0b0]',
    hover: 'hover:bg-[#e6d6b4]',
    active: 'bg-amber-900/10 text-[#3c2f1e] border-amber-700/20',
    isDark: false,
  },
  dark: {
    label: 'Tối dịu',
    swatch: 'bg-[#191922] border-slate-600',
    pageBg: 'bg-[#191922]',
    headerBg: 'bg-[#191922]/92',
    panelBg: 'bg-[#21212e]',
    textPrimary: 'text-stone-200',
    textSecondary: 'text-stone-400',
    border: 'border-white/10',
    hover: 'hover:bg-white/10',
    active: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
    isDark: true,
  },
  midnight: {
    label: 'Đêm sâu',
    swatch: 'bg-[#090910] border-indigo-500/40',
    pageBg: 'bg-[#090910]',
    headerBg: 'bg-[#090910]/92',
    panelBg: 'bg-[#11111d]',
    textPrimary: 'text-stone-300',
    textSecondary: 'text-stone-500',
    border: 'border-white/10',
    hover: 'hover:bg-white/10',
    active: 'bg-violet-500/20 text-violet-200 border-violet-400/30',
    isDark: true,
  },
};

const FONT_CLASS: Record<ReaderFont, string> = {
  serif: 'font-reader-serif',
  sans: 'font-reader-sans',
  mono: 'font-reader-mono',
};

const WIDTH_MAX: Record<ReaderWidth, string> = {
  narrow: '42rem',
  medium: '52rem',
  wide: '64rem',
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
  const [tocQuery, setTocQuery] = useState('');
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
  const palette = THEME_STYLES[settings.theme];

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

  // Flush pending progress on unmount
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
      queueProgressSave(
        {
          chapterId: target.id,
          chapterIndex: clamped,
          scrollRatio: 0,
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
        scrollRatio: ratio,
        scrollTop: el.scrollTop,
        completed: completedRef.current,
        updatedAt: Date.now(),
      },
      reachedEndOfBook,
    );
  }, [chapterIndex, chapters.length, currentChapter, isPdf, queueProgressSave]);

  // Restore scroll position smoothly by ratio (survives font size & screen width changes!)
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

  const filteredChapters = useMemo(() => {
    const q = tocQuery.trim().toLocaleLowerCase('vi');
    if (!q) return chapters.map((ch, idx) => ({ ch, idx }));
    return chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => ch.title.toLocaleLowerCase('vi').includes(q));
  }, [chapters, tocQuery]);

  const overallPercent = useMemo(() => {
    if (chapters.length === 0) return 0;
    if (isPdf) return Math.round(((chapterIndex + 1) / chapters.length) * 100);
    const base = chapterIndex / chapters.length;
    const intra = (chapterScrollPercent / 100) / chapters.length;
    return Math.min(100, Math.round((base + intra) * 100));
  }, [chapterIndex, chapterScrollPercent, chapters.length, isPdf]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden transition-colors duration-200 ${palette.pageBg} ${palette.textPrimary}`}>
      {/* Slim Reader Header */}
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
            <p className="truncate text-sm font-semibold leading-tight">{book.title}</p>
            <p className={`truncate text-[11px] ${palette.textSecondary}`}>
              {currentChapter?.title} · {overallPercent}%
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] md:inline-flex ${palette.border} ${palette.textSecondary}`}
            title={loadedFromCache ? 'Đọc tức thì từ bộ nhớ đệm IndexedDB (0ms)' : 'Đã tải từ Cloudflare R2 & lưu vào cache'}
          >
            {loadedFromCache ? <HardDrive className="h-3 w-3 text-emerald-500" /> : <Sparkles className="h-3 w-3 text-indigo-400" />}
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

        {/* Typography & Theme Popover */}
        {settingsOpen && !isPdf && (
          <div
            className={`fade-in absolute right-3 top-[3.5rem] z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border p-4 shadow-2xl ${palette.panelBg} ${palette.border}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                Tối ưu giao diện đọc
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className={`rounded-lg p-1 ${palette.hover}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Theme Swatches */}
            <div className="mb-4">
              <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Chế độ màu</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(THEME_STYLES) as ReaderTheme[]).map((themeKey) => (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: themeKey })}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition ${
                      settings.theme === themeKey
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                        : `${palette.border} ${palette.hover}`
                    }`}
                  >
                    <span className={`h-5 w-5 rounded-full border ${THEME_STYLES[themeKey].swatch}`} />
                    {THEME_STYLES[themeKey].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family */}
            <div className="mb-4">
              <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Kiểu chữ</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['serif', 'Văn học'],
                    ['sans', 'Hiện đại'],
                    ['mono', 'Mono'],
                  ] as const
                ).map(([fontKey, label]) => (
                  <button
                    key={fontKey}
                    type="button"
                    onClick={() => onUpdateSettings({ font: fontKey })}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      settings.font === fontKey
                        ? palette.active
                        : `${palette.border} ${palette.hover}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${palette.textSecondary}`}>
                Cỡ chữ ({settings.fontSizePx}px)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ fontSizePx: Math.max(14, settings.fontSizePx - 1) })}
                  className={`rounded-lg border p-1.5 ${palette.border} ${palette.hover}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ fontSizePx: 19 })}
                  className={`rounded-lg border px-2 py-1 text-xs ${palette.border} ${palette.hover}`}
                >
                  Mặc định
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ fontSizePx: Math.min(28, settings.fontSizePx + 1) })}
                  className={`rounded-lg border p-1.5 ${palette.border} ${palette.hover}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs font-medium ${palette.textSecondary}`}>Giãn dòng</span>
                <span className="text-xs tabular-nums">{settings.lineHeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={2.3}
                step={0.1}
                value={settings.lineHeight}
                onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            {/* Column Width */}
            <div className="mb-4">
              <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Độ rộng trang đọc</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['narrow', 'Gọn'],
                    ['medium', 'Vừa'],
                    ['wide', 'Rộng'],
                  ] as const
                ).map(([wKey, label]) => (
                  <button
                    key={wKey}
                    type="button"
                    onClick={() => onUpdateSettings({ width: wKey })}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      settings.width === wKey ? palette.active : `${palette.border} ${palette.hover}`
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Side Tap Switch */}
            <label className={`flex cursor-pointer items-center justify-between border-t pt-3 text-xs ${palette.border}`}>
              <span>Chạm lề trái/phải & phím mũi tên</span>
              <input
                type="checkbox"
                checked={settings.sideTapNavigation}
                onChange={(e) => onUpdateSettings({ sideTapNavigation: e.target.checked })}
                className="h-4 w-4 accent-indigo-500"
              />
            </label>
          </div>
        )}
      </header>

      {/* TOC Slide-over Drawer */}
      {tocOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setTocOpen(false)}
          />
          <aside
            className={`slide-in fixed bottom-0 left-0 top-0 z-50 flex w-80 max-w-[88vw] flex-col border-r shadow-2xl ${palette.panelBg} ${palette.border}`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-3.5 ${palette.border}`}>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">{book.title}</h2>
                <p className={`truncate text-xs ${palette.textSecondary}`}>
                  {book.author} · {chapters.length} {isPdf ? 'trang' : 'chương'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className={`rounded-lg p-1.5 ${palette.hover}`}
                aria-label="Đóng mục lục"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`border-b p-3 ${palette.border}`}>
              <div className="relative">
                <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${palette.textSecondary}`} />
                <input
                  value={tocQuery}
                  onChange={(e) => setTocQuery(e.target.value)}
                  placeholder="Lọc chương nhanh..."
                  className={`w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-500 ${palette.border} bg-transparent`}
                />
              </div>
            </div>

            <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-2">
              {filteredChapters.map(({ ch, idx }) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => goToChapter(idx)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                      idx === chapterIndex
                        ? `border font-semibold ${palette.active}`
                        : `border border-transparent ${palette.hover}`
                    }`}
                  >
                    <span className={`w-6 shrink-0 tabular-nums ${palette.textSecondary}`}>
                      {String(ch.chapter_number).padStart(2, '0')}
                    </span>
                    <span className="truncate">{ch.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </>
      )}

      {/* Main Content Area */}
      {isPdf && pdfBlobUrl ? (
        <PdfReader
          url={pdfBlobUrl}
          fileName={book.title}
          pageNumber={chapterIndex + 1}
          pageCount={chapters.length}
          onPageChange={(page) => goToChapter(page - 1)}
          isDark={palette.isDark}
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
              style={{ maxWidth: WIDTH_MAX[settings.width] }}
            >
              <header className={`mb-8 border-b pb-5 text-center ${palette.border}`}>
                <p className={`mb-1.5 text-xs uppercase tracking-[0.2em] ${palette.textSecondary}`}>
                  {book.file_type === 'cbz' ? 'Tập ảnh' : `Phần ${chapterIndex + 1} / ${chapters.length}`}
                </p>
                <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
                  {currentChapter.title}
                </h1>
              </header>

              <div
                className={`reading-content ${FONT_CLASS[settings.font]}`}
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

              {/* Bottom Chapter Nav */}
              <nav className={`mt-14 flex items-center justify-between gap-3 border-t pt-6 pb-8 ${palette.border}`}>
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
                    <span>Hoàn thành vol này!</span>
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

      {/* Thin Overall Progress Bar */}
      {!isPdf && (
        <div className="h-1 w-full shrink-0 bg-black/10">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-amber-400 transition-all duration-150"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
