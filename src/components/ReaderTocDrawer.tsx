import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Bookmark, Highlighter, Image as ImageIcon, List, Loader2, Search, X } from 'lucide-react';
import type { Book, BookHighlight, Chapter } from '@/types';
import { getDisplayAuthor } from '@/lib/bookMetadata';
import { ReaderHighlightsPanel } from '@/components/ReaderHighlightsPanel';
import {
  ReaderBookmarksPanel,
  ReaderSearchPanel,
} from '@/components/ReaderSearchAndBookmarks';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const LazyReaderIllustrationGallery = lazy(() =>
  import('@/components/ReaderIllustrationGallery').then((mod) => ({
    default: mod.ReaderIllustrationGallery,
  })),
);

export type ReaderDrawerTab = 'toc' | 'illustrations' | 'search' | 'bookmarks';

interface ReaderTocDrawerProps {
  book: Book;
  chapters: Chapter[];
  parsedChapters?: Chapter[];
  activeIndex: number;
  maxUnlockedChapterIndex?: number;
  currentChapterId?: string;
  currentChapterTitle?: string;
  currentScrollRatio?: number;
  watermarkLabel?: string;
  highlights?: readonly BookHighlight[];
  protectCopy?: boolean;
  initialTab?: ReaderDrawerTab;
  palette: ReaderThemePalette;
  onSelectChapter: (index: number) => void;
  onJumpToBookmark?: (chapterIndex: number, scrollRatio: number) => void;
  onJumpToSearchResult?: (target: {
    chapterIndex: number;
    query: string;
    occurrenceIndex: number;
    approximateRatio: number;
  }) => void;
  onOpenDomImage?: (src: string, alt: string) => void;
  onOpenGuestImage?: (bitmap: ImageBitmap, alt: string, ownedBitmap?: boolean) => void;
  onDeleteHighlight?: (id: string) => void;
  onOpenGuestAddHighlight?: () => void;
  onOpenQuoteVault?: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onClose: () => void;
}

export function ReaderTocDrawer({
  book,
  chapters,
  parsedChapters,
  activeIndex,
  maxUnlockedChapterIndex = activeIndex,
  currentChapterId = '',
  currentChapterTitle = '',
  currentScrollRatio = 0,
  watermarkLabel,
  highlights = [],
  protectCopy = false,
  initialTab = 'toc',
  palette,
  onSelectChapter,
  onJumpToBookmark,
  onJumpToSearchResult,
  onOpenDomImage,
  onOpenGuestImage,
  onDeleteHighlight,
  onOpenGuestAddHighlight,
  onOpenQuoteVault,
  onApiError,
  onClose,
}: ReaderTocDrawerProps) {
  const [activeTab, setActiveTab] = useState<ReaderDrawerTab>(initialTab);
  const [savedSubTab, setSavedSubTab] = useState<'bookmarks' | 'highlights'>('bookmarks');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const filteredChapters = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi');
    if (!q) return chapters.map((ch, idx) => ({ ch, idx }));
    return chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) => ch.title.toLocaleLowerCase('vi').includes(q));
  }, [chapters, query]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Mục lục, minh họa, tìm kiếm và trích dẫn"
        className={`slide-in fixed bottom-0 left-0 top-0 z-50 flex max-h-dvh w-[23rem] max-w-[92vw] flex-col border-r shadow-2xl ${palette.panelBg} ${palette.border}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${palette.border}`}>
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-bold">{book.title}</h2>
            <p className={`truncate text-xs ${palette.textSecondary}`}>
              {getDisplayAuthor(book.author, book.title)} · {chapters.length} chương
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-1.5 ${palette.hover}`}
            aria-label="Đóng ngăn kéo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thanh chuyển 4 tab: Mục lục · Minh họa · Tìm chữ · Ghi dấu */}
        <div className={`grid grid-cols-4 gap-1 border-b p-1.5 ${palette.border}`}>
          <button
            type="button"
            onClick={() => setActiveTab('toc')}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'toc' ? `border font-semibold ${palette.active}` : `border border-transparent ${palette.hover}`
            }`}
          >
            <List className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Mục lục</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('illustrations')}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'illustrations'
                ? `border font-semibold ${palette.active}`
                : `border border-transparent ${palette.hover}`
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Minh họa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'search'
                ? `border font-semibold ${palette.active}`
                : `border border-transparent ${palette.hover}`
            }`}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Tìm chữ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bookmarks')}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
              activeTab === 'bookmarks'
                ? `border font-semibold ${palette.active}`
                : `border border-transparent ${palette.hover}`
            }`}
          >
            <Bookmark className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Ghi dấu</span>
          </button>
        </div>

        {activeTab === 'illustrations' ? (
          <Suspense
            fallback={
              <div className={`flex flex-1 items-center justify-center gap-2 text-xs ${palette.textSecondary}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang mở phòng tranh...</span>
              </div>
            }
          >
            <LazyReaderIllustrationGallery
              book={book}
              parsedChapters={parsedChapters}
              activeIndex={activeIndex}
              maxUnlockedChapterIndex={maxUnlockedChapterIndex}
              watermarkLabel={watermarkLabel}
              palette={palette}
              onSelectChapter={onSelectChapter}
              onOpenDomImage={onOpenDomImage}
              onOpenGuestImage={onOpenGuestImage}
              onApiError={onApiError}
              onCloseDrawer={onClose}
            />
          </Suspense>
        ) : activeTab === 'search' ? (
          <ReaderSearchPanel
            book={book}
            parsedChapters={parsedChapters}
            palette={palette}
            onSelectChapter={onSelectChapter}
            onJumpToSearchResult={(target) => {
              if (onJumpToSearchResult) {
                onJumpToSearchResult(target);
              } else {
                onSelectChapter(target.chapterIndex);
              }
              onClose();
            }}
            onApiError={onApiError}
          />
        ) : activeTab === 'bookmarks' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={`grid grid-cols-2 gap-1 border-b px-3 py-2 ${palette.border}`}>
              <button
                type="button"
                onClick={() => setSavedSubTab('bookmarks')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition ${
                  savedSubTab === 'bookmarks'
                    ? `border font-semibold ${palette.active}`
                    : `border border-transparent ${palette.hover}`
                }`}
              >
                <Bookmark className="h-3 w-3" />
                <span>Dấu trang</span>
              </button>
              <button
                type="button"
                onClick={() => setSavedSubTab('highlights')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition ${
                  savedSubTab === 'highlights'
                    ? `border font-semibold ${palette.active}`
                    : `border border-transparent ${palette.hover}`
                }`}
              >
                <Highlighter className="h-3 w-3" />
                <span>Trích dẫn ({highlights.length})</span>
              </button>
            </div>

            {savedSubTab === 'highlights' ? (
              <ReaderHighlightsPanel
                highlights={highlights}
                palette={palette}
                protectCopy={protectCopy}
                onJumpToHighlight={(chapterIdx, ratio) => {
                  if (onJumpToBookmark) onJumpToBookmark(chapterIdx, ratio);
                  else onSelectChapter(chapterIdx);
                  onClose();
                }}
                onDeleteHighlight={(id) => onDeleteHighlight?.(id)}
                onOpenGuestAdd={
                  onOpenGuestAddHighlight
                    ? () => {
                        onClose();
                        onOpenGuestAddHighlight();
                      }
                    : undefined
                }
                onOpenQuoteVault={
                  onOpenQuoteVault
                    ? () => {
                        onClose();
                        onOpenQuoteVault();
                      }
                    : undefined
                }
              />
            ) : (
              <ReaderBookmarksPanel
                book={book}
                activeIndex={activeIndex}
                currentChapterId={currentChapterId}
                currentChapterTitle={currentChapterTitle}
                currentScrollRatio={currentScrollRatio}
                palette={palette}
                onApiError={onApiError}
                onJumpToBookmark={(chapterIdx, ratio) => {
                  if (onJumpToBookmark) onJumpToBookmark(chapterIdx, ratio);
                  else onSelectChapter(chapterIdx);
                  onClose();
                }}
              />
            )}
          </div>
        ) : (
          <>
            <div className={`border-b p-3 ${palette.border}`}>
              <div className="relative">
                <Search
                  className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${palette.textSecondary}`}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Lọc tên chương nhanh..."
                  aria-label="Lọc chương nhanh"
                  className={`w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-3 text-xs outline-none ${palette.border} ${palette.focusBorder}`}
                />
              </div>
            </div>

            <ul className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
              {filteredChapters.length === 0 ? (
                <li className={`px-3 py-6 text-center text-xs ${palette.textSecondary}`}>
                  Không tìm thấy mục nào phù hợp.
                </li>
              ) : (
                filteredChapters.map(({ ch, idx }) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => onSelectChapter(idx)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
                        idx === activeIndex
                          ? `border font-semibold ${palette.active}`
                          : `border border-transparent ${palette.hover}`
                      }`}
                    >
                      <span className={`w-6 shrink-0 tabular-nums ${palette.textSecondary}`}>
                        {String(ch.chapter_number).padStart(2, '0')}
                      </span>
                      <span className="truncate">{ch.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </aside>
    </>
  );
}
