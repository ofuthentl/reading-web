import { Suspense, lazy } from 'react';
import type { AuthRole, Book, Chapter } from '@/types';
import { ReaderFootnotePopover } from '@/components/ReaderFootnotePopover';
import type { ReaderLightboxTarget } from '@/components/ReaderImageLightbox';
import type { ReaderDrawerTab } from '@/components/ReaderTocDrawer';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import type { useReaderBookFeatures } from '@/hooks/useReaderBookFeatures';
import type { VisibleGuestParagraphOption } from '@/lib/highlightsApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const LazyReaderTocDrawer = lazy(() =>
  import('@/components/ReaderTocDrawer').then((mod) => ({ default: mod.ReaderTocDrawer })),
);

const LazyGuestParagraphHighlightModal = lazy(() =>
  import('@/components/ReaderHighlightPopover').then((mod) => ({
    default: mod.GuestParagraphHighlightModal,
  })),
);

const LazyReaderHighlightPopover = lazy(() =>
  import('@/components/ReaderHighlightPopover').then((mod) => ({
    default: mod.ReaderHighlightPopover,
  })),
);

const LazyReaderImageLightbox = lazy(() =>
  import('@/components/ReaderImageLightbox').then((mod) => ({ default: mod.ReaderImageLightbox })),
);

const LazyQuoteVaultModal = lazy(() =>
  import('@/components/QuoteVaultModal').then((mod) => ({ default: mod.QuoteVaultModal })),
);

export interface ReaderOverlaysHostProps {
  role: AuthRole;
  book: Book;
  allBooks: readonly Book[];
  chapters: Chapter[];
  parsedChapters?: Chapter[];
  resolveOwnerMediaUrl?: (zipPath: string) => Promise<string | null>;
  chapterIndex: number;
  currentChapterId: string;
  currentChapterTitle: string;
  chapterScrollRatio: number;
  watermarkLabel?: string;
  tocOpen: boolean;
  drawerTab: ReaderDrawerTab;
  palette: ReaderThemePalette;
  features: ReturnType<typeof useReaderBookFeatures>;
  visibleGuestParagraphs?: readonly VisibleGuestParagraphOption[];
  lightboxTarget: ReaderLightboxTarget | null;
  onCloseToc: () => void;
  onSelectChapter: (idx: number) => void;
  onJumpToRatio: (chapterIdx: number, ratio: number) => void;
  onJumpToSearchResult: (target: {
    chapterIndex: number;
    query: string;
    occurrenceIndex: number;
    approximateRatio: number;
  }) => void;
  onSetLightboxTarget: (target: ReaderLightboxTarget | null) => void;
  onOpenOtherBook?: (targetBook: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderOverlaysHost({
  role,
  book,
  allBooks,
  chapters,
  parsedChapters,
  resolveOwnerMediaUrl,
  chapterIndex,
  currentChapterId,
  currentChapterTitle,
  chapterScrollRatio,
  watermarkLabel,
  tocOpen,
  drawerTab,
  palette,
  features,
  visibleGuestParagraphs = [],
  lightboxTarget,
  onCloseToc,
  onSelectChapter,
  onJumpToRatio,
  onJumpToSearchResult,
  onSetLightboxTarget,
  onOpenOtherBook,
  onApiError,
}: ReaderOverlaysHostProps) {
  const isGuest = role === 'guest';

  return (
    <>
      {tocOpen && (
        <Suspense fallback={null}>
          <LazyReaderTocDrawer
            book={book}
            chapters={chapters}
            parsedChapters={parsedChapters}
            resolveOwnerMediaUrl={resolveOwnerMediaUrl}
            activeIndex={chapterIndex}
            maxUnlockedChapterIndex={features.highestChapterReached}
            currentChapterId={currentChapterId}
            currentChapterTitle={currentChapterTitle}
            currentScrollRatio={chapterScrollRatio}
            watermarkLabel={watermarkLabel}
            highlights={features.highlights}
            protectCopy={isGuest}
            initialTab={drawerTab}
            palette={palette}
            onSelectChapter={onSelectChapter}
            onJumpToBookmark={onJumpToRatio}
            onJumpToSearchResult={onJumpToSearchResult}
            onOpenDomImage={
              !isGuest ? (src, alt) => onSetLightboxTarget({ kind: 'dom', src, alt }) : undefined
            }
            onOpenGuestImage={
              isGuest
                ? (bitmap, alt, ownedBitmap) =>
                    onSetLightboxTarget({
                      kind: 'guest-bitmap',
                      bitmap,
                      watermarkLabel: watermarkLabel || 'Guest',
                      alt,
                      ownedBitmap,
                    })
                : undefined
            }
            onDeleteHighlight={(id) => void features.removeExistingHighlight(id)}
            onOpenGuestAddHighlight={
              isGuest ? () => features.setGuestPickerOpen(true) : undefined
            }
            onOpenQuoteVault={() => features.setQuoteVaultOpen(true)}
            onApiError={onApiError}
            onClose={onCloseToc}
          />
        </Suspense>
      )}

      {isGuest
        ? features.guestPickerOpen && (
            <Suspense fallback={null}>
              <LazyGuestParagraphHighlightModal
                open={features.guestPickerOpen}
                options={visibleGuestParagraphs}
                palette={palette}
                saving={features.savingHighlight}
                onSaveParagraph={(blockIdx, quoteText, color, note) => {
                  const existing = features.chapterHighlights.find(
                    (hl) => hl.locator?.blockIndex === blockIdx,
                  );
                  if (existing) {
                    void features.editExistingHighlight(existing.id, color, note);
                  } else {
                    void features.createNewHighlight({
                      quoteText,
                      color,
                      note,
                      locator: {
                        blockIndex: blockIdx,
                        scrollRatio: Math.round(chapterScrollRatio * 1000) / 1000,
                      },
                    });
                  }
                }}
                onDeleteExisting={(id) => void features.removeExistingHighlight(id)}
                onClose={() => features.setGuestPickerOpen(false)}
              />
            </Suspense>
          )
        : (features.selectionDraft || features.editingHighlight) && (
            <Suspense fallback={null}>
              <LazyReaderHighlightPopover
                draft={features.selectionDraft}
                editing={features.editingHighlight}
                palette={palette}
                saving={features.savingHighlight}
                onSaveDraft={(color, note) => {
                  if (!features.selectionDraft) return;
                  void features.createNewHighlight({
                    quoteText: features.selectionDraft.quoteText,
                    color,
                    note,
                    locator: features.selectionDraft.locator,
                  });
                }}
                onUpdateExisting={(id, color, note) => void features.editExistingHighlight(id, color, note)}
                onDeleteExisting={(id) => void features.removeExistingHighlight(id)}
                onClose={() => {
                  features.setSelectionDraft(null);
                  features.setEditingHighlight(null);
                }}
              />
            </Suspense>
          )}

      <ReaderFootnotePopover
        footnote={features.activeFootnote}
        palette={palette}
        protectCopy={isGuest}
        onClose={() => features.setActiveFootnote(null)}
      />

      {features.quoteVaultOpen && (
        <Suspense fallback={null}>
          <LazyQuoteVaultModal
            open={features.quoteVaultOpen}
            books={allBooks.length > 0 ? allBooks : [book]}
            sessionRole={role}
            onClose={() => features.setQuoteVaultOpen(false)}
            onDeletedHighlight={(hlId, hlBookId) => {
              if (hlBookId === book.id) {
                features.removeHighlightLocal(hlId);
              }
            }}
            onOpenHighlightBook={(targetBook, chIdx, ratio) => {
              features.setQuoteVaultOpen(false);
              if (targetBook.id === book.id) {
                onJumpToRatio(chIdx, ratio);
              } else {
                onOpenOtherBook?.(targetBook, { chapterIndex: chIdx, scrollRatio: ratio });
              }
            }}
          />
        </Suspense>
      )}

      {lightboxTarget && (
        <Suspense fallback={null}>
          <LazyReaderImageLightbox
            target={lightboxTarget}
            onClose={() => onSetLightboxTarget(null)}
          />
        </Suspense>
      )}
    </>
  );
}
