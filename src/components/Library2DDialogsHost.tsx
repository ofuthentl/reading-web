import type { AuthRole, Book, ReadingProgress } from '@/types';
import { BookInfoModal } from '@/components/BookInfoModal';
import { ReadingStatsModal } from '@/components/ReadingStatsModal';

export interface Library2DDialogsHostProps {
  inspectedBook: Book | null;
  statsOpen: boolean;
  books: Book[];
  progress: Record<string, ReadingProgress>;
  sessionRole?: AuthRole;
  onCloseInspect: () => void;
  onCloseStats: () => void;
  onOpenBook: (book: Book) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSelectAuthor?: (authorName: string) => void;
  onMarkCompleted: (book: Book) => void;
  onResetProgress: (book: Book) => void;
  onEditBook?: (book: Book) => void;
}

export function Library2DDialogsHost({
  inspectedBook,
  statsOpen,
  books,
  progress,
  sessionRole,
  onCloseInspect,
  onCloseStats,
  onOpenBook,
  onJumpToShelf,
  onSelectAuthor,
  onMarkCompleted,
  onResetProgress,
  onEditBook,
}: Library2DDialogsHostProps) {
  return (
    <>
      <BookInfoModal
        book={inspectedBook}
        progress={inspectedBook ? progress[inspectedBook.id] : undefined}
        sessionRole={sessionRole}
        onClose={onCloseInspect}
        onOpenBook={onOpenBook}
        onJumpToShelf={onJumpToShelf}
        onSelectAuthor={onSelectAuthor}
        onMarkCompleted={onMarkCompleted}
        onResetProgress={onResetProgress}
        onEditBook={onEditBook}
      />

      <ReadingStatsModal
        open={statsOpen}
        books={books}
        progress={progress}
        sessionRole={sessionRole}
        onClose={onCloseStats}
        onOpenBook={onOpenBook}
      />
    </>
  );
}
