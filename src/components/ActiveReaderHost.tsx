import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  AuthSessionInfo,
  Book,
  ParsedBook,
  ReaderSettings,
  ReadingProgress,
} from '@/types';
import type { GuestReaderSessionState } from '@/hooks/useBookReader';

const LazyReaderView = lazy(() =>
  import('@/components/ReaderView').then((mod) => ({ default: mod.ReaderView })),
);

const LazyGuestCanvasReader = lazy(() =>
  import('@/components/GuestCanvasReader').then((mod) => ({ default: mod.GuestCanvasReader })),
);

export interface ActiveReaderHostProps {
  activeBook: Book | null;
  openingBook: Book | null;
  parsedBook: ParsedBook | null;
  guestSession: GuestReaderSessionState | null;
  loadedFromCache: boolean;
  settings: ReaderSettings;
  session: AuthSessionInfo;
  progress: Record<string, ReadingProgress>;
  nextBook?: Book | null;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  onOpenNextBook?: (book: Book) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
}

export function ActiveReaderHost({
  activeBook,
  openingBook,
  parsedBook,
  guestSession,
  loadedFromCache,
  settings,
  session,
  progress,
  onUpdateSettings,
  onSaveProgress,
  onApiError,
  onClose,
}: ActiveReaderHostProps) {
  return (
    <>
      {activeBook && parsedBook && (
        <div className="fixed inset-0 z-40">
          <Suspense fallback={null}>
            <LazyReaderView
              key={activeBook.id}
              book={activeBook}
              parsedBook={parsedBook}
              loadedFromCache={loadedFromCache}
              initialProgress={progress[activeBook.id]}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onSaveProgress={onSaveProgress}
              onClose={onClose}
            />
          </Suspense>
        </div>
      )}

      {activeBook && guestSession && (
        <div className="fixed inset-0 z-40">
          <Suspense fallback={null}>
            <LazyGuestCanvasReader
              key={activeBook.id}
              book={activeBook}
              tocChapters={guestSession.chapters}
              watermarkLabel={
                session.watermarkLabel || guestSession.watermarkLabel || 'Guest'
              }
              initialProgress={progress[activeBook.id]}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onSaveProgress={onSaveProgress}
              onApiError={onApiError}
              onClose={onClose}
            />
          </Suspense>
        </div>
      )}

      {openingBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="moonlit-card fade-in flex w-full max-w-sm flex-col items-center rounded-2xl border border-line bg-surface px-6 py-7 text-center shadow-2xl dark:border-line-strong/70">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
            <p className="mt-3 font-display text-base font-semibold text-ink">Đang mở sách...</p>
            <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{openingBook.title}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl border border-line bg-canvas px-4 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
