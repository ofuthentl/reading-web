import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  AuthSessionInfo,
  Book,
  ParsedBook,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import { findNextBookInShelf } from '@/lib/nextVolume';
import type { BookOpenJumpTarget, GuestReaderSessionState } from '@/hooks/useBookReader';

const loadReaderView = () =>
  import('@/components/ReaderView').then((mod) => ({ default: mod.ReaderView }));

const loadGuestCanvasReader = () =>
  import('@/components/GuestCanvasReader').then((mod) => ({ default: mod.GuestCanvasReader }));

const LazyReaderView = lazy(loadReaderView);
const LazyGuestCanvasReader = lazy(loadGuestCanvasReader);

export interface ActiveReaderHostProps {
  activeBook: Book | null;
  openingBook: Book | null;
  parsedBook: ParsedBook | null;
  guestSession: GuestReaderSessionState | null;
  loadedFromCache: boolean;
  initialJump?: (BookOpenJumpTarget & { bookId: string }) | null;
  settings: ReaderSettings;
  session: AuthSessionInfo;
  books: Book[];
  progress: Record<string, ReadingProgress>;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onOpenBook: (book: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onCancelOpening: () => void;
  onClose: () => void;
}

export function ActiveReaderHost({
  activeBook,
  openingBook,
  parsedBook,
  guestSession,
  loadedFromCache,
  initialJump = null,
  settings,
  session,
  books,
  progress,
  onUpdateSettings,
  onSaveProgress,
  onOpenBook,
  onApiError,
  onCancelOpening,
  onClose,
}: ActiveReaderHostProps) {
  useEffect(() => {
    if (!openingBook) return;
    void (session.role === 'guest' ? loadGuestCanvasReader() : loadReaderView()).catch(
      () => undefined,
    );
  }, [openingBook, session.role]);

  const nextBook = useMemo(
    () => findNextBookInShelf(activeBook, books, session.role),
    [activeBook, books, session.role],
  );

  const activeInitialProgress = useMemo<ReadingProgress | undefined>(() => {
    if (!activeBook) return undefined;
    const saved = progress[activeBook.id];
    if (initialJump && initialJump.bookId === activeBook.id) {
      return {
        chapterId: '',
        chapterIndex: initialJump.chapterIndex,
        totalChapters: saved?.totalChapters ?? 1,
        scrollRatio: initialJump.scrollRatio,
        scrollTop: 0,
        completed: Boolean(saved?.completed),
        ...(saved?.readingSeconds ? { readingSeconds: saved.readingSeconds } : {}),
        ...(saved?.rereadCount ? { rereadCount: saved.rereadCount } : {}),
        updatedAt: Date.now(),
      };
    }
    return saved;
  }, [activeBook, initialJump, progress]);

  const readerKey = activeBook
    ? initialJump && initialJump.bookId === activeBook.id
      ? `${activeBook.id}:${initialJump.chapterIndex}:${initialJump.scrollRatio}`
      : activeBook.id
    : 'none';

  return (
    <>
      {activeBook && parsedBook && (
        <div className="fixed inset-0 z-40 flex max-h-dvh flex-col overflow-hidden">
          <Suspense fallback={null}>
            <LazyReaderView
              key={readerKey}
              book={activeBook}
              allBooks={books}
              parsedBook={parsedBook}
              loadedFromCache={loadedFromCache}
              initialProgress={activeInitialProgress}
              nextBook={nextBook}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onSaveProgress={onSaveProgress}
              onOpenNextBook={onOpenBook}
              onApiError={onApiError}
              onClose={onClose}
            />
          </Suspense>
        </div>
      )}

      {activeBook && guestSession && (
        <div className="fixed inset-0 z-40 flex max-h-dvh flex-col overflow-hidden">
          <Suspense fallback={null}>
            <LazyGuestCanvasReader
              key={readerKey}
              book={activeBook}
              allBooks={books}
              tocChapters={guestSession.chapters}
              initialChapter={guestSession.initialChapter}
              watermarkLabel={
                session.watermarkLabel || guestSession.watermarkLabel || 'Guest'
              }
              initialProgress={activeInitialProgress}
              nextBook={nextBook}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onSaveProgress={onSaveProgress}
              onOpenNextBook={onOpenBook}
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
              onClick={onCancelOpening}
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
