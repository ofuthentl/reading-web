import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { Book } from '@/types';
import { getBookSortTitle } from '@/lib/bookMetadata';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderChapterEndNavProps {
  chapterIndex: number;
  totalChapters: number;
  palette: ReaderThemePalette;
  nextBook?: Book | null;
  onPrev: () => void;
  onNext: () => void;
  onCompleteAndClose: () => void;
  onCompleteAndOpenNext?: (nextBook: Book) => void;
  onStartReread?: () => void;
}

export function ReaderChapterEndNav({
  chapterIndex,
  totalChapters,
  palette,
  nextBook,
  onPrev,
  onNext,
  onCompleteAndClose,
  onCompleteAndOpenNext,
  onStartReread,
}: ReaderChapterEndNavProps) {
  const isLastChapter = chapterIndex >= totalChapters - 1;

  return (
    <nav
      className={`mt-12 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 border-t pb-8 pt-6 ${palette.border}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={chapterIndex === 0}
        className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Trước</span>
      </button>

      {isLastChapter ? (
        <div className="contents sm:flex sm:min-w-0 sm:max-w-full sm:flex-wrap sm:items-center sm:justify-end sm:gap-2.5">
          {onStartReread && (
            <button
              type="button"
              onClick={onStartReread}
              title="Đọc lại cuốn sách này từ chương đầu và cộng 1 lượt đọc lại"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${palette.border} ${palette.hover}`}
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span>Đọc lại từ đầu</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCompleteAndClose}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Hoàn thành cuốn này!</span>
          </button>

          {nextBook && onCompleteAndOpenNext && (
            <button
              type="button"
              onClick={() => onCompleteAndOpenNext(nextBook)}
              title={`Chuyển sang đọc ${getBookSortTitle(nextBook)}`}
              className={`inline-flex w-full min-w-0 max-w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow transition sm:w-auto sm:max-w-[19rem] ${palette.accentBg} ${palette.accentFg}`}
            >
              <span className="min-w-0 truncate">Đọc tiếp: {getBookSortTitle(nextBook)}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      ) : (
        <>
          <span className={`text-xs tabular-nums ${palette.textSecondary}`}>
            {chapterIndex + 1} / {totalChapters}
          </span>

          <button
            type="button"
            onClick={onNext}
            disabled={isLastChapter}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
          >
            <span>Sau</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </nav>
  );
}
