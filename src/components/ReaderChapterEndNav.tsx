import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
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
}: ReaderChapterEndNavProps) {
  const isLastChapter = chapterIndex >= totalChapters - 1;

  return (
    <nav
      className={`mt-12 flex flex-wrap items-center justify-between gap-3 border-t pb-8 pt-6 ${palette.border}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={chapterIndex === 0}
        className={`flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${palette.border} ${palette.hover}`}
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Trước</span>
      </button>

      {isLastChapter ? (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCompleteAndClose}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Hoàn thành cuốn này!</span>
          </button>

          {nextBook && onCompleteAndOpenNext && (
            <button
              type="button"
              onClick={() => onCompleteAndOpenNext(nextBook)}
              title={`Chuyển sang đọc ${getBookSortTitle(nextBook)}`}
              className="inline-flex max-w-[19rem] items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
            >
              <span className="truncate">Đọc tiếp: {getBookSortTitle(nextBook)}</span>
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
