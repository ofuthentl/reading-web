import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { Book, Chapter, ReaderSettings } from '@/types';
import {
  ReaderBookCommunityBlock,
  ReaderBookCommunityModalButton,
} from '@/components/ReaderBookCommunityBlock';
import { ReaderChapterEndNav } from '@/components/ReaderChapterEndNav';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import {
  READER_FONT_CLASS,
  type ReaderThemePalette,
  READER_WIDTH_MAX,
  findClickedReaderImage,
  handleReaderContentLinkClick,
} from '@/lib/readerConfig';
import { buildReaderTypographyStyle } from '@/lib/readingEstimate';

export interface ReaderDomScrollStageProps {
  bookId: string;
  bookTitle: string;
  currentChapter?: Chapter;
  chapterIndex: number;
  totalChapters: number;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  maxCanonicalChapterNumber: number;
  chapterOptions: readonly CanonicalChapterOption[];
  nextBook?: Book | null;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  settingsOpen: boolean;
  immersiveHidden: boolean;
  autoScrollOpen: boolean;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  onSelectionEnd: (container: HTMLElement | null) => void;
  onContentInteractionClick: (event: ReactMouseEvent, container: HTMLElement | null) => boolean;
  onClosePopovers: () => void;
  onToggleAutoScrollPlay: () => void;
  onRevealToolbar: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onCompleteBook: (nextBook?: Book) => void;
  onOpenDomImage: (src: string, alt: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderDomScrollStage({
  bookId,
  bookTitle,
  currentChapter,
  chapterIndex,
  totalChapters,
  currentChapterNumber,
  readerMaxChapterNumber,
  maxCanonicalChapterNumber,
  chapterOptions,
  nextBook,
  settings,
  palette,
  settingsOpen,
  immersiveHidden,
  autoScrollOpen,
  scrollContainerRef,
  onScroll,
  onSelectionEnd,
  onContentInteractionClick,
  onClosePopovers,
  onToggleAutoScrollPlay,
  onRevealToolbar,
  onPrevChapter,
  onNextChapter,
  onCompleteBook,
  onOpenDomImage,
  onApiError,
}: ReaderDomScrollStageProps) {
  return (
    <main
      ref={scrollContainerRef}
      onScroll={onScroll}
      onMouseUp={() => onSelectionEnd(scrollContainerRef.current)}
      onTouchEnd={() => onSelectionEnd(scrollContainerRef.current)}
      onClick={(event) => {
        if (settingsOpen) {
          onClosePopovers();
          return;
        }
        if (onContentInteractionClick(event, scrollContainerRef.current)) return;
        if (handleReaderContentLinkClick(event, scrollContainerRef.current)) return;
        if (window.getSelection()?.toString()) return;

        const clickedImg = findClickedReaderImage(event.target, bookTitle);
        if (clickedImg) {
          onOpenDomImage(clickedImg.src, clickedImg.alt);
          return;
        }
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, select, textarea, [data-community-section]')) {
          return;
        }
        if (autoScrollOpen) {
          onToggleAutoScrollPlay();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        if (settings.sideTapNavigation && ratio < 0.16) onPrevChapter();
        else if (settings.sideTapNavigation && ratio > 0.84) onNextChapter();
        else if (immersiveHidden && ratio >= 0.22 && ratio <= 0.78) onRevealToolbar();
      }}
      className="scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[4.75rem] sm:px-8 sm:pb-[calc(3rem+env(safe-area-inset-bottom))] sm:pt-20"
    >
      {currentChapter && (
        <article
          key={currentChapter.id}
          className="fade-in mx-auto w-full min-w-0"
          style={{ maxWidth: READER_WIDTH_MAX[settings.width] }}
        >
          <header className={`mb-8 border-b pb-5 text-center ${palette.border}`}>
            <p className={`mb-1.5 text-xs uppercase tracking-[0.2em] ${palette.textSecondary}`}>
              {`Phần ${chapterIndex + 1} / ${totalChapters}`}
            </p>
            <h1 className="font-display text-2xl font-bold leading-snug sm:text-3xl">
              {currentChapter.title}
            </h1>
          </header>

          <div
            className={`reading-content ${READER_FONT_CLASS[settings.font]}`}
            style={buildReaderTypographyStyle(settings)}
          >
            {currentChapter.content_html ? (
              <div dangerouslySetInnerHTML={{ __html: currentChapter.content_html }} />
            ) : (
              currentChapter.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)
            )}
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
          />

          {chapterIndex >= totalChapters - 1 ? (
            <ReaderBookCommunityBlock
              bookId={bookId}
              bookTitle={bookTitle}
              palette={palette}
              currentChapterNumber={currentChapterNumber}
              readerMaxChapterNumber={readerMaxChapterNumber}
              totalChapters={maxCanonicalChapterNumber || totalChapters}
              chapterOptions={chapterOptions}
              onApiError={onApiError}
            />
          ) : (
            <div className="mt-4 flex justify-center">
              <ReaderBookCommunityModalButton
                bookId={bookId}
                bookTitle={bookTitle}
                palette={palette}
                currentChapterNumber={currentChapterNumber}
                readerMaxChapterNumber={readerMaxChapterNumber}
                totalChapters={maxCanonicalChapterNumber || totalChapters}
                chapterOptions={chapterOptions}
                onApiError={onApiError}
              />
            </div>
          )}
        </article>
      )}
    </main>
  );
}
