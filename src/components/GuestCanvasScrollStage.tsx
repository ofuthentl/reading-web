import { useRef } from 'react';
import type { Book, ReaderSettings } from '@/types';
import { ReaderBookCommunityBlock, ReaderBookCommunityModalButton } from '@/components/ReaderBookCommunityBlock';
import { ReaderChapterEndNav } from '@/components/ReaderChapterEndNav';
import {
  type ResolvedFootnoteItem,
  findCanvasFootnoteAtPoint,
} from '@/lib/epubFootnotes';
import {
  type ChapterCanvasLayout,
  findCanvasLayoutImageAtPoint,
} from '@/lib/guestCanvasLayout';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface GuestCanvasScrollStageProps {
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  totalChapters: number;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  stageWidth: number;
  layout: ChapterCanvasLayout | null;
  footnoteMap: ReadonlyMap<string, string>;
  bitmapsRef: React.MutableRefObject<Map<number, ImageBitmap>>;
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  settingsOpen: boolean;
  immersiveHidden: boolean;
  pageHidden: boolean;
  autoScrollOpen?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onScroll: () => void;
  onCloseSettings: () => void;
  onToggleAutoScrollPlay?: () => void;
  onRevealToolbar: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onStartReread?: () => void;
  onOpenFootnote: (fn: ResolvedFootnoteItem) => void;
  onOpenGuestImage: (bitmap: ImageBitmap, alt: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function GuestCanvasScrollStage({
  bookId,
  bookTitle,
  chapterIndex,
  totalChapters,
  currentChapterNumber,
  readerMaxChapterNumber,
  chapterOptions,
  stageWidth,
  layout,
  footnoteMap,
  bitmapsRef,
  nextBook,
  settings,
  palette,
  settingsOpen,
  immersiveHidden,
  pageHidden,
  autoScrollOpen = false,
  scrollContainerRef,
  canvasRef,
  onScroll,
  onCloseSettings,
  onToggleAutoScrollPlay,
  onRevealToolbar,
  onPrevChapter,
  onNextChapter,
  onCompleteBook,
  onStartReread,
  onOpenFootnote,
  onOpenGuestImage,
  onApiError,
}: GuestCanvasScrollStageProps) {
  const stageWrapRef = useRef<HTMLDivElement>(null);

  return (
    <main
      ref={scrollContainerRef}
      onScroll={onScroll}
      onClick={(event) => {
        if (settingsOpen) {
          onCloseSettings();
          return;
        }
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, select, textarea, [data-community-section]')) return;

        if (layout && stageWrapRef.current) {
          const stageRect = stageWrapRef.current.getBoundingClientRect();
          const stageX = event.clientX - stageRect.left;
          const stageY = event.clientY - stageRect.top;

          const hitFn = findCanvasFootnoteAtPoint({
            layout,
            stageWidth,
            stageX,
            stageY,
            font: settings.font,
            fontWeight: settings.fontWeight,
            footnoteMap,
          });
          if (hitFn) {
            onOpenFootnote({
              markerLabel: hitFn.markerLabel,
              content: hitFn.content,
              anchorX: event.clientX,
              anchorY: event.clientY,
            });
            return;
          }

          const hitImg = findCanvasLayoutImageAtPoint(layout, stageWidth, stageX, stageY);
          const bitmap = hitImg ? bitmapsRef.current.get(hitImg.mediaIndex) : undefined;
          if (hitImg && bitmap) {
            onOpenGuestImage(bitmap, hitImg.alt || bookTitle);
            return;
          }
        }

        if (autoScrollOpen && onToggleAutoScrollPlay) {
          onToggleAutoScrollPlay();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        if (settings.sideTapNavigation && ratio < 0.16) onPrevChapter();
        else if (settings.sideTapNavigation && ratio > 0.84) onNextChapter();
        else if (immersiveHidden && ratio >= 0.22 && ratio <= 0.78) onRevealToolbar();
      }}
      className={`scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3.5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-16 transition-all sm:px-7 sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:pt-[4.5rem] ${
        pageHidden ? 'blur-lg' : ''
      }`}
    >
      {layout && (
        <div className="mx-auto max-w-full" style={{ width: `${stageWidth}px` }}>
          <div
            ref={stageWrapRef}
            className="relative w-full overflow-hidden rounded-lg"
            style={{ height: `${layout.totalHeight}px` }}
          >
            <canvas
              ref={canvasRef}
              aria-label="Trang đọc sách"
              className="pointer-events-none absolute left-0 top-0 block"
            />
          </div>
          <ReaderChapterEndNav
            chapterIndex={chapterIndex}
            totalChapters={totalChapters}
            palette={palette}
            nextBook={nextBook}
            onPrev={onPrevChapter}
            onNext={onNextChapter}
            onCompleteAndClose={() => onCompleteBook()}
            onCompleteAndOpenNext={(nb) => onCompleteBook(nb)}
            onStartReread={onStartReread}
          />
          {chapterIndex >= totalChapters - 1 ? (
            <ReaderBookCommunityBlock
              bookId={bookId} bookTitle={bookTitle} palette={palette}
              currentChapterNumber={currentChapterNumber}
              readerMaxChapterNumber={readerMaxChapterNumber ?? chapterOptions?.length ?? totalChapters}
              totalChapters={chapterOptions?.length || totalChapters}
              chapterOptions={chapterOptions} onApiError={onApiError}
            />
          ) : (
            <div className="mt-4 flex justify-center">
              <ReaderBookCommunityModalButton
                bookId={bookId} bookTitle={bookTitle} palette={palette}
                currentChapterNumber={currentChapterNumber}
                readerMaxChapterNumber={readerMaxChapterNumber ?? currentChapterNumber ?? 0}
                totalChapters={chapterOptions?.length || totalChapters}
                chapterOptions={chapterOptions} onApiError={onApiError}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
