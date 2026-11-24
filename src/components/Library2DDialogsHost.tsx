import type { AuthRole, Book, ReadingProgress } from '@/types';
import { BookInfoModal } from '@/components/BookInfoModal';
import { ReadingStatsModal } from '@/components/ReadingStatsModal';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';

export interface Library2DDialogsHostProps {
  inspectedBook: Book | null;
  statsOpen: boolean;
  books: Book[];
  progress: Record<string, ReadingProgress>;
  planToReadBookIds?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  onCloseInspect: () => void;
  onCloseStats: () => void;
  onOpenBook: (book: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSelectAuthor?: (authorName: string) => void;
  onMarkCompleted: (book: Book) => void;
  onResetProgress: (book: Book) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
  onEditBook?: (book: Book) => void;
  onOpenCacheManager?: () => void;
}

export function Library2DDialogsHost({
  inspectedBook,
  statsOpen,
  books,
  progress,
  planToReadBookIds,
  sessionRole,
  onCloseInspect,
  onCloseStats,
  onOpenBook,
  onJumpToShelf,
  onSelectAuthor,
  onMarkCompleted,
  onResetProgress,
  onTogglePlanToReadBook,
  onEditBook,
  onOpenCacheManager,
}: Library2DDialogsHostProps) {
  return (
    <>
      <BookInfoModal
        book={inspectedBook}
        progress={inspectedBook ? progress[inspectedBook.id] : undefined}
        isPlanToRead={Boolean(inspectedBook && planToReadBookIds?.has(inspectedBook.id))}
        sessionRole={sessionRole}
        onClose={onCloseInspect}
        onOpenBook={onOpenBook}
        onJumpToShelf={onJumpToShelf}
        onSelectAuthor={onSelectAuthor}
        onMarkCompleted={onMarkCompleted}
        onResetProgress={onResetProgress}
        onTogglePlanToRead={onTogglePlanToReadBook}
        onEditBook={onEditBook}
      />

      <ReadingStatsModal
        open={statsOpen}
        books={books}
        progress={progress}
        sessionRole={sessionRole}
        onClose={onCloseStats}
        onOpenBook={onOpenBook}
        onOpenCacheManager={onOpenCacheManager}
      />
    </>
  );
}
