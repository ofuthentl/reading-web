import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookMarked,
  BookOpen,
  CornerDownLeft,
  FolderKanban,
  Library,
  Lock,
  Search,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type {
  AuthRole,
  Book,
  CustomCollection,
  LibraryHighlightItem,
  ShelfGroup,
  ShelfRatingSummary,
} from '@/types';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  PALETTE_GROUP_LABELS,
  type PaletteActionSpec,
  type PaletteGroupKind,
  type PaletteResultItem,
  buildCommandPaletteResults,
} from '@/lib/commandPaletteSearch';
import { fetchAllLibraryHighlights } from '@/lib/highlightsApi';

export interface CommandPaletteModalProps {
  open: boolean;
  sessionRole: AuthRole;
  shelves: readonly ShelfGroup[];
  books: readonly Book[];
  authors: readonly string[];
  collections: readonly CustomCollection[];
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>;
  onClose: () => void;
  onJumpToShelf: (shelfKey: string) => void;
  onOpenBook: (book: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onSelectAuthor: (author: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onCycleTheme: () => void;
  onOpenStats: () => void;
  onOpenCacheManager?: () => void;
  onUploadClick?: () => void;
}

const GROUP_ICONS: Record<PaletteGroupKind, typeof Library> = {
  shelves: Library,
  books: BookOpen,
  authors: UserRound,
  collections: FolderKanban,
  quotes: BookMarked,
  actions: Sparkles,
};

export function CommandPaletteModal({
  open,
  sessionRole,
  shelves,
  books,
  authors,
  collections,
  shelfAltTitles,
  shelfRatings,
  onClose,
  onJumpToShelf,
  onOpenBook,
  onSelectAuthor,
  onSelectCollection,
  onCycleTheme,
  onOpenStats,
  onOpenCacheManager,
  onUploadClick,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [highlights, setHighlights] = useState<LibraryHighlightItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const focusRaf = window.requestAnimationFrame(() => inputRef.current?.focus());

    const controller = new AbortController();
    void fetchAllLibraryHighlights(books, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setHighlights(items);
      })
      .catch(() => undefined);

    return () => {
      window.cancelAnimationFrame(focusRaf);
      controller.abort();
    };
  }, [books, open]);

  const actions = useMemo<PaletteActionSpec[]>(() => {
    const list: PaletteActionSpec[] = [
      {
        id: 'cycle-theme',
        title: 'Đổi chế độ nền Sáng / Trưa / Chiều / Đêm',
        subtitle: 'Chuyển giao diện đọc ngay lập tức',
        keywords: 'theme sang toi dem nen giao dien',
        onTrigger: () => {
          onCycleTheme();
          onClose();
        },
      },
      {
        id: 'open-stats',
        title: "Mở Hồ sơ, Mục tiêu ngày & Ofu's Library Wrapped",
        subtitle: 'Xem lịch nhiệt, Streak, mục tiêu phút đọc & xuất ảnh tổng kết',
        keywords: 'thong ke ho so streak wrapped muc tieu',
        onTrigger: () => {
          onClose();
          onOpenStats();
        },
      },
    ];
    if (onOpenCacheManager) {
      list.push({
        id: 'cache-manager',
        title: 'Quản lý Bộ nhớ đệm thiết bị (IndexedDB)',
        subtitle: 'Kiểm tra dung lượng sách & ảnh bìa ngoại tuyến',
        keywords: 'cache bo nho dem indexeddb offline',
        ownerOnly: true,
        onTrigger: () => {
          onClose();
          onOpenCacheManager();
        },
      });
    }
    if (onUploadClick) {
      list.push({
        id: 'upload-books',
        title: 'Tải sách mới lên kho (.epub / .docx)',
        subtitle: 'Thêm tập truyện mới và tự phân kệ thông minh',
        keywords: 'upload tai sach them truyen epub docx',
        ownerOnly: true,
        onTrigger: () => {
          onClose();
          onUploadClick();
        },
      });
    }
    return list;
  }, [onClose, onCycleTheme, onOpenCacheManager, onOpenStats, onUploadClick]);

  const results = useMemo(
    () =>
      open
        ? buildCommandPaletteResults({
            query,
            sessionRole,
            shelves,
            books,
            authors,
            collections,
            highlights,
            shelfAltTitles,
            shelfRatings,
            actions,
            onSelectShelf: (shelfKey) => {
              onClose();
              onJumpToShelf(shelfKey);
            },
            onSelectBook: (book) => {
              onClose();
              onOpenBook(book);
            },
            onSelectAuthor: (author) => {
              onClose();
              onSelectAuthor(author);
            },
            onSelectCollection: (colId) => {
              onClose();
              onSelectCollection(colId);
            },
            onSelectHighlight: (hl) => {
              const targetBook = books.find((b) => b.id === hl.bookId);
              if (!targetBook) return;
              onClose();
              onOpenBook(targetBook, {
                chapterIndex: hl.chapterIndex,
                scrollRatio: hl.locator?.scrollRatio ?? 0,
              });
            },
          })
        : [],
    [
      actions, authors, books, collections, highlights, onClose, onJumpToShelf,
      onOpenBook, onSelectAuthor, onSelectCollection, open, query, sessionRole,
      shelfAltTitles, shelfRatings, shelves,
    ],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>(`[data-palette-idx="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const groupedSections = useMemo(() => {
    const order: PaletteGroupKind[] = ['shelves', 'books', 'authors', 'collections', 'quotes', 'actions'];
    const sections: Array<{ group: PaletteGroupKind; entries: Array<{ item: PaletteResultItem; flatIdx: number }> }> = [];
    let cursor = 0;
    for (const g of order) {
      const matching = results.filter((r) => r.group === g);
      if (matching.length === 0) continue;
      sections.push({
        group: g,
        entries: matching.map((item) => ({ item, flatIdx: cursor++ })),
      });
    }
    return sections;
  }, [results]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm và điều khiển nhanh (Ctrl+K)"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key === 'ArrowDown' && results.length > 0) {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % results.length);
          return;
        }
        if (event.key === 'ArrowUp' && results.length > 0) {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
          return;
        }
        if (event.key === 'Enter' && results.length > 0) {
          event.preventDefault();
          results[Math.min(activeIndex, results.length - 1)]?.onSelect();
        }
      }}
      className="fixed inset-0 z-[75] flex items-start justify-center bg-black/60 px-3 pb-4 pt-[8vh] backdrop-blur-sm sm:px-4 sm:pt-[12vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="moonlit-card fade-in flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl dark:border-line-strong/80"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-accent" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm bộ truyện (Việt / Romaji), tập sách, tác giả, trích dẫn, lệnh nhanh..."
            aria-label="Ô tìm kiếm nhanh toàn cục"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Xoá từ khoá"
              className="rounded-md p-1 text-ink-muted hover:bg-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:inline-block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {groupedSections.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-ink-muted">
              Không tìm thấy kết quả nào khớp với <strong className="text-ink">“{query}”</strong>.
            </div>
          ) : (
            groupedSections.map(({ group, entries }) => {
              const Icon = GROUP_ICONS[group];
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    {PALETTE_GROUP_LABELS[group]}
                  </div>
                  <div className="space-y-0.5">
                    {entries.map(({ item, flatIdx }) => {
                      const active = flatIdx === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-palette-idx={flatIdx}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={item.onSelect}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                            active
                              ? 'bg-accent/12 text-ink ring-1 ring-accent/35'
                              : 'text-ink hover:bg-subtle/70'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                                active
                                  ? 'border-accent/40 bg-accent/15 text-accent'
                                  : 'border-line bg-canvas text-ink-muted'
                              }`}
                            >
                              {item.locked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Icon className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{item.title}</p>
                              <p className="truncate text-xs text-ink-muted">{item.subtitle}</p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.ratingText && (
                              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-300">
                                {item.ratingText}
                              </span>
                            )}
                            {item.badge && (
                              <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">
                                {item.badge}
                              </span>
                            )}
                            {active && <CornerDownLeft className="h-3.5 w-3.5 text-accent" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-canvas/60 px-4 py-2 text-[11px] text-ink-muted">
          <span>↑↓ di chuyển · Enter mở · Esc đóng</span>
          <span className="hidden sm:inline">Hỗ trợ tiếng Việt không dấu &amp; tên Romaji/Nhật</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
