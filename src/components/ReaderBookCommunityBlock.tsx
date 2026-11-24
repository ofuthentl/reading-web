import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, X } from 'lucide-react';
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
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderBookCommunityBlock({
  bookId,
  bookTitle,
  palette,
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
        onApiError={onApiError}
      />
    </Suspense>
  );
}

export function ReaderBookCommunityModalButton({
  bookId,
  bookTitle,
  palette,
  onApiError,
}: ReaderBookCommunityBlockProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium transition ${palette.border} ${palette.hover}`}
      >
        <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
        <span>Bình luận</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Bình luận — ${bookTitle}`}
            onClick={() => setOpen(false)}
            onKeyDown={(event) => event.stopPropagation()}
            className="fixed inset-0 z-[64] flex items-end justify-center bg-black/60 p-3 outline-none backdrop-blur-sm sm:items-center sm:p-4"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className={`max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-3 shadow-2xl scrollbar-thin sm:p-4 ${palette.pageBg} ${palette.textPrimary} ${palette.border}`}
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
                  onApiError={onApiError}
                />
              </Suspense>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
