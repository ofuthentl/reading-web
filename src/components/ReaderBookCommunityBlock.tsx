import { Suspense, lazy, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const LazyCommunityReviewsSection = lazy(() =>
  import('@/components/CommunityReviewsSection').then((mod) => ({
    default: mod.CommunityReviewsSection,
  })),
);

interface ReaderBookCommunityBlockProps {
  bookId: string;
  bookTitle: string;
  palette: ReaderThemePalette;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  totalChapters?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  compact?: boolean;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderBookCommunityBlock({
  bookId,
  bookTitle,
  palette,
  currentChapterNumber,
  readerMaxChapterNumber,
  totalChapters,
  chapterOptions,
  onApiError,
}: ReaderBookCommunityBlockProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`mt-6 rounded-2xl border p-4 text-center text-xs ${palette.border} ${palette.textSecondary}`}
        >
          Đang mở mục bình luận...
        </div>
      }
    >
      <LazyCommunityReviewsSection
        targetType="book"
        targetKey={bookId}
        targetLabel={bookTitle}
        variant="reader"
        palette={palette}
        currentChapterNumber={currentChapterNumber}
        readerMaxChapterNumber={readerMaxChapterNumber}
        totalChapters={totalChapters}
        chapterOptions={chapterOptions}
        onApiError={onApiError}
      />
    </Suspense>
  );
}

export function ReaderBookCommunityModalButton({
  bookId,
  bookTitle,
  palette,
  currentChapterNumber,
  readerMaxChapterNumber,
  totalChapters,
  chapterOptions,
  compact = false,
  onApiError,
}: ReaderBookCommunityBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở bình luận tập này"
        title="Mở bình luận tập này"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border font-medium transition ${
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'
        } ${palette.border} ${palette.hover}`}
      >
        <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
        <span className={compact ? 'hidden md:inline' : ''}>Bình luận</span>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={`Bình luận — ${bookTitle}`}
        zIndexClass="z-[64]"
        backdropClassName="items-end justify-center p-3 sm:items-center sm:p-4"
        panelClassName={`max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-3 shadow-2xl scrollbar-thin sm:p-4 ${palette.pageBg} ${palette.textPrimary} ${palette.border}`}
      >
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <span className={`truncate text-xs font-medium ${palette.textSecondary}`}>
            {bookTitle}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng khung bình luận"
            className={`rounded-lg p-1.5 transition ${palette.textSecondary} ${palette.hover}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Suspense
          fallback={
            <div className={`p-6 text-center text-xs ${palette.textSecondary}`}>
              Đang mở mục bình luận...
            </div>
          }
        >
          <LazyCommunityReviewsSection
            targetType="book"
            targetKey={bookId}
            targetLabel={bookTitle}
            variant="reader"
            palette={palette}
            currentChapterNumber={currentChapterNumber}
            readerMaxChapterNumber={readerMaxChapterNumber}
            totalChapters={totalChapters}
            chapterOptions={chapterOptions}
            onApiError={onApiError}
          />
        </Suspense>
      </ModalShell>
    </>
  );
}
