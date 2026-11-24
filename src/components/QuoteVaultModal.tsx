import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  BookMarked,
  Highlighter,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { AuthRole, Book, HighlightColor, LibraryHighlightItem } from '@/types';
import {
  HIGHLIGHT_COLOR_OPTIONS,
  deleteBookHighlight,
  fetchAllLibraryHighlights,
} from '@/lib/highlightsApi';
import { normalizeSearchText } from '@/lib/libraryFiltering';

export interface QuoteVaultModalProps {
  open: boolean;
  books: readonly Book[];
  sessionRole?: AuthRole;
  onClose: () => void;
  onOpenHighlightBook?: (book: Book, chapterIndex: number, scrollRatio: number) => void;
  onDeletedHighlight?: (highlightId: string, bookId: string) => void;
}

export function QuoteVaultModal({
  open,
  books,
  sessionRole = 'owner',
  onClose,
  onOpenHighlightBook,
  onDeletedHighlight,
}: QuoteVaultModalProps) {
  const [items, setItems] = useState<LibraryHighlightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all');
  const protectCopy = sessionRole === 'guest';

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetchAllLibraryHighlights(books, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setItems(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [books, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  const booksById = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) map.set(b.id, b);
    return map;
  }, [books]);

  const groupedByShelf = useMemo(() => {
    const normQ = normalizeSearchText(query);
    const filtered = items.filter((item) => {
      if (colorFilter !== 'all' && item.color !== colorFilter) return false;
      if (!normQ) return true;
      const haystack = normalizeSearchText(
        `${item.quoteText} ${item.note || ''} ${item.bookTitle} ${item.shelf} ${item.chapterTitle || ''}`,
      );
      return haystack.includes(normQ);
    });

    const groups = new Map<string, LibraryHighlightItem[]>();
    for (const hl of filtered) {
      const shelfName = hl.shelf || 'Kho chưa phân loại';
      const arr = groups.get(shelfName) || [];
      arr.push(hl);
      groups.set(shelfName, arr);
    }
    return Array.from(groups.entries());
  }, [colorFilter, items, query]);

  const handleDelete = async (hl: LibraryHighlightItem) => {
    try {
      await deleteBookHighlight(hl.id, hl.bookId);
      setItems((prev) => prev.filter((it) => it.id !== hl.id));
      onDeletedHighlight?.(hl.id, hl.bookId);
    } catch {
      // Ignore transient delete errors
    }
  };

  if (!open || typeof document === 'undefined') return null;
  const allowInputClipboard = (target: EventTarget | null) =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
      onCopy={
        protectCopy
          ? (e) => {
              if (!allowInputClipboard(e.target)) e.preventDefault();
            }
          : undefined
      }
      onContextMenu={
        protectCopy
          ? (e) => {
              if (!allowInputClipboard(e.target)) e.preventDefault();
            }
          : undefined
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kho trích dẫn"
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl ${
          protectCopy ? 'select-none' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <BookMarked className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold">Kho trích dẫn cá nhân</h2>
              <p className="text-xs text-ink-muted">
                {items.length} đoạn tâm đắc đã lưu trên {groupedByShelf.length} bộ truyện
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Kho trích dẫn"
            className="rounded-xl p-1.5 text-ink-muted transition hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle/40 px-4 py-2.5 sm:px-5">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong trích dẫn, ghi chú hoặc tên bộ..."
              className="w-full select-text rounded-xl border border-line bg-surface py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setColorFilter('all')}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                colorFilter === 'all'
                  ? 'border-accent/40 bg-accent/12 font-semibold text-accent'
                  : 'border-line bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              Mọi màu
            </button>
            {HIGHLIGHT_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setColorFilter((cur) => (cur === opt.id ? 'all' : opt.id))}
                title={opt.label}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                  colorFilter === opt.id
                    ? 'border-accent bg-accent/15 ring-1 ring-accent/30'
                    : 'border-line bg-surface hover:bg-subtle'
                }`}
              >
                <span className={`h-3.5 w-3.5 rounded-full border ${opt.swatchClass}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-xs text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Đang mở Kho trích dẫn...</span>
            </div>
          ) : groupedByShelf.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-xs text-ink-muted">
              <Highlighter className="h-6 w-6 opacity-50" />
              <p>
                {items.length === 0
                  ? 'Kho trích dẫn đang trống. Hãy bôi màu câu tâm đắc trong lúc đọc sách!'
                  : 'Không tìm thấy trích dẫn nào khớp bộ lọc.'}
              </p>
            </div>
          ) : (
            groupedByShelf.map(([shelfName, shelfItems]) => (
              <section key={shelfName} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-ink">{shelfName}</h3>
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                    {shelfItems.length} trích dẫn
                  </span>
                </div>

                <div className="space-y-2">
                  {shelfItems.map((hl) => {
                    const colorMeta =
                      HIGHLIGHT_COLOR_OPTIONS.find((c) => c.id === hl.color) ||
                      HIGHLIGHT_COLOR_OPTIONS[0];
                    const targetBook = booksById.get(hl.bookId);

                    return (
                      <article
                        key={hl.id}
                        className="rounded-xl border border-line bg-subtle/35 p-3 transition hover:border-line-strong"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border ${colorMeta.swatchClass}`}
                            />
                            <span className="truncate font-semibold text-ink">{hl.bookTitle}</span>
                            <span>·</span>
                            <span className="truncate">
                              {hl.chapterTitle || `Phần ${hl.chapterIndex + 1}`}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {targetBook && onOpenHighlightBook && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenHighlightBook(
                                    targetBook,
                                    hl.chapterIndex,
                                    hl.locator?.scrollRatio ?? 0,
                                  );
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold text-accent transition hover:bg-accent/10"
                              >
                                <span>Mở đọc</span>
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDelete(hl)}
                              aria-label="Xoá trích dẫn"
                              className="rounded-lg p-1 text-ink-muted transition hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <blockquote className="text-xs leading-relaxed text-ink sm:text-[13px]">
                          “{hl.quoteText}”
                        </blockquote>

                        {hl.note && (
                          <p className="mt-1.5 rounded-lg bg-surface/80 px-2.5 py-1.5 text-xs italic text-ink-muted">
                            ✎ {hl.note}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
