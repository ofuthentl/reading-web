import { Suspense, lazy } from 'react';
import type {
  AuthRole,
  Book,
  CustomCollection,
  ReadingProgress,
  ShelfGroup,
  ShelfRatingSummary,
} from '@/types';
import { BookInfoModal } from '@/components/BookInfoModal';
import { ReadingStatsModal } from '@/components/ReadingStatsModal';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';

const LazyCommandPaletteModal = lazy(() =>
  import('@/components/CommandPaletteModal').then((mod) => ({ default: mod.CommandPaletteModal })),
);

export interface Library2DDialogsHostProps {
  inspectedBook: Book | null;
  statsOpen: boolean;
  paletteOpen?: boolean;
  books: Book[];
  shelves?: readonly ShelfGroup[];
  authors?: readonly string[];
  collections?: readonly CustomCollection[];
  shelfCovers?: Readonly<Record<string, string>>;
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>;
  progress: Record<string, ReadingProgress>;
  planToReadBookIds?: ReadonlySet<string>;
  sessionRole?: AuthRole;
  dailyGoalMinutes?: number;
  onChangeDailyGoalMinutes?: (nextMinutes: number) => void;
  onCloseInspect: () => void;
  onCloseStats: () => void;
  onClosePalette?: () => void;
  onOpenStats?: () => void;
  onOpenBook: (book: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSelectAuthor?: (authorName: string) => void;
  onSelectCollection?: (collectionId: string) => void;
  onCycleTheme?: () => void;
  onUploadClick?: () => void;
  onMarkCompleted: (book: Book) => void;
  onResetProgress: (book: Book) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
  onEditBook?: (book: Book) => void;
  onOpenCacheManager?: () => void;
}

export function Library2DDialogsHost({
  inspectedBook,
  statsOpen,
  paletteOpen = false,
  books,
  shelves = [],
  authors = [],
  collections = [],
  shelfCovers,
  shelfAltTitles,
  shelfRatings,
  progress,
  planToReadBookIds,
  sessionRole = 'owner',
  dailyGoalMinutes,
  onChangeDailyGoalMinutes,
  onCloseInspect,
  onCloseStats,
  onClosePalette,
  onOpenStats,
  onOpenBook,
  onJumpToShelf,
  onSelectAuthor,
  onSelectCollection,
  onCycleTheme,
  onUploadClick,
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
        shelfCovers={shelfCovers}
        sessionRole={sessionRole}
        dailyGoalMinutes={dailyGoalMinutes}
        onChangeDailyGoalMinutes={onChangeDailyGoalMinutes}
        onClose={onCloseStats}
        onOpenBook={onOpenBook}
        onOpenCacheManager={onOpenCacheManager}
      />

      {paletteOpen && onClosePalette && (
        <Suspense fallback={null}>
          <LazyCommandPaletteModal
            open={paletteOpen}
            sessionRole={sessionRole}
            shelves={shelves}
            books={books}
            authors={authors}
            collections={collections}
            shelfAltTitles={shelfAltTitles}
            shelfRatings={shelfRatings}
            onClose={onClosePalette}
            onJumpToShelf={onJumpToShelf}
            onOpenBook={onOpenBook}
            onSelectAuthor={(author) => onSelectAuthor?.(author)}
            onSelectCollection={(colId) => onSelectCollection?.(colId)}
            onCycleTheme={() => onCycleTheme?.()}
            onOpenStats={() => onOpenStats?.()}
            onOpenCacheManager={onOpenCacheManager}
            onUploadClick={onUploadClick}
          />
        </Suspense>
      )}
    </>
  );
}
