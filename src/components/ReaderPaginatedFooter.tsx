import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Book } from '@/types';
import { ReaderBookCommunityModalButton } from '@/components/ReaderBookCommunityBlock';
import { getBookSortTitle } from '@/lib/bookMetadata';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderPaginatedFooterProps {
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  totalChapters: number;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  currentPage: number;
  totalPages: number;
  isFirstSpread: boolean;
  isLastChapter: boolean;
  isLastSpread: boolean;
  remainingEstimate?: string;
  nextBook?: Book | null;
  palette: ReaderThemePalette;
  onStepPrev: () => void;
  onStepNext: () => void;
  onOpenToc?: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderPaginatedFooter({
  bookId,
  bookTitle,
  chapterIndex,
  totalChapters,
  currentChapterNumber,
  readerMaxChapterNumber,
  chapterOptions,
  currentPage,
  totalPages,
  isFirstSpread,
  isLastChapter,
  isLastSpread,
  remainingEstimate,
  nextBook,
  palette,
  onStepPrev,
  onStepNext,
  onOpenToc,
  onCompleteBook,
  onApiError,
}: ReaderPaginatedFooterProps) {
  const showCompletionActions = isLastChapter && isLastSpread;
  const effectiveCurrentChapter = currentChapterNumber;
  const effectiveMaxChapter = readerMaxChapterNumber ?? currentChapterNumber ?? chapterIndex + 1;
  const effectiveTotalChapters = chapterOptions?.length || totalChapters;

  const progressText = (
    <>
      <span className="truncate">
        <span className="hidden sm:inline">Trang </span>
        <strong className={palette.textPrimary}>{currentPage}</strong>
        <span className="sm:hidden">/{totalPages}</span>
        <span className="hidden sm:inline"> / {totalPages}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span className="truncate">
        <span className="sm:hidden">Ch.{chapterIndex + 1}/{totalChapters}</span>
        <span className="hidden sm:inline">Chương {chapterIndex + 1}/{totalChapters}</span>
      </span>
      {remainingEstimate && (
        <>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{remainingEstimate}</span>
        </>
      )}
    </>
  );

  return (
    <footer
      className={`relative flex shrink-0 items-center justify-between gap-1.5 border-t px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-xs sm:gap-2 sm:px-6 ${
        showCompletionActions ? 'flex-wrap' : 'flex-nowrap'
      } ${palette.border} ${palette.headerBg}`}
    >
      <button
        type="button"
        onClick={onStepPrev}
        disabled={isFirstSpread}
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 ${palette.border} ${palette.hover}`}
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="sm:hidden">Trước</span>
        <span className="hidden sm:inline">Trang trước</span>
      </button>

      {showCompletionActions ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onCompleteBook()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-500"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Hoàn thành cuốn này!</span>
          </button>
          <ReaderBookCommunityModalButton
            bookId={bookId}
            bookTitle={bookTitle}
            palette={palette}
            currentChapterNumber={effectiveCurrentChapter}
            readerMaxChapterNumber={effectiveMaxChapter}
            totalChapters={effectiveTotalChapters}
            chapterOptions={chapterOptions}
            onApiError={onApiError}
          />
          {nextBook && (
            <button
              type="button"
              onClick={() => onCompleteBook(nextBook)}
              className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition sm:max-w-[16rem] ${palette.accentBg} ${palette.accentFg}`}
            >
              <span className="min-w-0 truncate">Đọc tiếp: {getBookSortTitle(nextBook)}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>
      ) : (
        <div
          className={`flex min-w-0 items-center justify-center gap-x-1.5 whitespace-nowrap tabular-nums sm:gap-x-2 ${palette.textSecondary}`}
        >
          {onOpenToc ? (
            <button
              type="button"
              onClick={onOpenToc}
              title="Mở mục lục & thanh tua % cuốn"
              className={`inline-flex min-w-0 items-center gap-x-1.5 rounded-lg px-2 py-1 transition sm:gap-x-2 ${palette.hover}`}
            >
              {progressText}
            </button>
          ) : (
            progressText
          )}
          <ReaderBookCommunityModalButton
            compact
            bookId={bookId}
            bookTitle={bookTitle}
            palette={palette}
            currentChapterNumber={effectiveCurrentChapter}
            readerMaxChapterNumber={effectiveMaxChapter}
            totalChapters={effectiveTotalChapters}
            chapterOptions={chapterOptions}
            onApiError={onApiError}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onStepNext}
        disabled={showCompletionActions}
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 ${palette.border} ${palette.hover}`}
      >
        <span className="sm:hidden">Sau</span>
        <span className="hidden sm:inline">Trang sau</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </button>
    </footer>
  );
}
