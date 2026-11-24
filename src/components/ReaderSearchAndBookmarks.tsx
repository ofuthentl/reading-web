import { useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkPlus, Loader2, Search, Trash2, X } from 'lucide-react';
import type { Book, BookBookmark, Chapter, GuestBookSearchMatch } from '@/types';
import { isAuthError } from '@/lib/api';
import {
  addBookBookmark,
  fetchBookBookmarks,
  removeBookBookmark,
  searchGuestBookChaptersApi,
} from '@/lib/bookmarksApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

interface LocalSearchHit {
  id: string;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  occurrenceIndex: number;
  totalInChapter: number;
  approximateRatio: number;
  before: string;
  matched: string;
  after: string;
}

function searchParsedChaptersLocally(chapters: Chapter[], rawQuery: string): LocalSearchHit[] {
  const q = rawQuery.trim().normalize('NFC');
  if (q.length < 2) return [];
  const needleLower = q.toLocaleLowerCase('vi');
  const queryHasDiacritics = stripDiacritics(needleLower) !== needleLower;
  const needleAscii = stripDiacritics(needleLower);

  const results: LocalSearchHit[] = [];
  for (let idx = 0; idx < chapters.length; idx += 1) {
    const ch = chapters[idx];
    const cleanText = (ch.content || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    const hayLower = cleanText.toLocaleLowerCase('vi');
    const positions: number[] = [];

    let cursor = 0;
    while (cursor <= hayLower.length - needleLower.length) {
      const found = hayLower.indexOf(needleLower, cursor);
      if (found === -1) break;
      positions.push(found);
      cursor = found + needleLower.length;
    }

    if (positions.length === 0 && !queryHasDiacritics && needleAscii.length >= 2) {
      const hayAscii = stripDiacritics(hayLower);
      cursor = 0;
      while (cursor <= hayAscii.length - needleAscii.length) {
        const found = hayAscii.indexOf(needleAscii, cursor);
        if (found === -1) break;
        positions.push(found);
        cursor = found + needleAscii.length;
      }
    }

    if (positions.length > 0) {
      const shownPositions = positions.slice(0, 3);
      for (let occIdx = 0; occIdx < shownPositions.length; occIdx += 1) {
        const pos = shownPositions[occIdx];
        const start = Math.max(0, pos - 36);
        const end = Math.min(cleanText.length, pos + q.length + 46);
        results.push({
          id: `${idx}-${occIdx}`,
          chapterIndex: idx,
          chapterNumber: ch.chapter_number || idx + 1,
          chapterTitle: ch.title,
          occurrenceIndex: occIdx,
          totalInChapter: positions.length,
          approximateRatio: Math.min(1, Math.max(0, pos / Math.max(1, cleanText.length))),
          before: (start > 0 ? '…' : '') + cleanText.slice(start, pos),
          matched: cleanText.slice(pos, pos + q.length),
          after: cleanText.slice(pos + q.length, end) + (end < cleanText.length ? '…' : ''),
        });
        if (results.length >= 50) break;
      }
      if (results.length >= 50) break;
    }
  }
  return results;
}

export interface ReaderSearchPanelProps {
  book: Book;
  parsedChapters?: Chapter[];
  palette: ReaderThemePalette;
  onSelectChapter: (chapterIndex: number) => void;
  onJumpToSearchResult?: (target: {
    chapterIndex: number;
    query: string;
    occurrenceIndex: number;
    approximateRatio: number;
  }) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderSearchPanel({
  book,
  parsedChapters,
  palette,
  onSelectChapter,
  onJumpToSearchResult,
  onApiError,
}: ReaderSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [guestMatches, setGuestMatches] = useState<GuestBookSearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isLocalMode = Boolean(parsedChapters);
  const trimmed = query.trim();

  const localHits = useMemo(
    () => (parsedChapters && trimmed.length >= 2 ? searchParsedChaptersLocally(parsedChapters, trimmed) : []),
    [parsedChapters, trimmed],
  );

  useEffect(() => {
    if (isLocalMode) return;
    if (trimmed.length < 2) {
      setGuestMatches([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void searchGuestBookChaptersApi(book.id, trimmed, controller.signal)
        .then((list) => {
          if (!controller.signal.aborted) setGuestMatches(list);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (isAuthError(err)) {
            onApiError?.(err, 'Phiên truy cập đã hết hiệu lực.');
            return;
          }
          setSearchError(err instanceof Error ? err.message : 'Không thể tìm kiếm.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [book.id, isLocalMode, onApiError, trimmed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`border-b p-3 ${palette.border}`}>
        <div className="relative">
          <Search
            className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${palette.textSecondary}`}
          />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập từ khoá cần tìm (>= 2 ký tự)..."
            aria-label="Tìm nội dung trong cuốn sách"
            className={`w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-7 text-xs outline-none ${palette.border} ${palette.focusBorder}`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Xoá từ khoá"
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 ${palette.hover}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        {trimmed.length < 2 ? (
          <p className={`px-3 py-8 text-center text-xs ${palette.textSecondary}`}>
            Nhập tên nhân vật, địa danh hoặc cụm từ bất kỳ để tìm nhanh chương xuất hiện.
          </p>
        ) : searching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs opacity-75">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Đang dò các chương...</span>
          </div>
        ) : searchError ? (
          <p className="px-3 py-6 text-center text-xs text-amber-500">{searchError}</p>
        ) : isLocalMode ? (
          localHits.length === 0 ? (
            <p className={`px-3 py-8 text-center text-xs ${palette.textSecondary}`}>
              Không tìm thấy đoạn nào chứa &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {localHits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onJumpToSearchResult) {
                        onJumpToSearchResult({
                          chapterIndex: hit.chapterIndex,
                          query: trimmed,
                          occurrenceIndex: hit.occurrenceIndex,
                          approximateRatio: hit.approximateRatio,
                        });
                      } else {
                        onSelectChapter(hit.chapterIndex);
                      }
                    }}
                    className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${palette.border} ${palette.hover}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">
                        {String(hit.chapterNumber).padStart(2, '0')}. {hit.chapterTitle}
                      </span>
                      <span className={`shrink-0 text-[10px] ${palette.textSecondary}`}>
                        {hit.totalInChapter > 1
                          ? `#${hit.occurrenceIndex + 1} / ${hit.totalInChapter}`
                          : '1 lần'}
                      </span>
                    </div>
                    <p className={`mt-1 line-clamp-2 text-[11px] leading-relaxed ${palette.textSecondary}`}>
                      {hit.before}
                      <mark className="rounded bg-amber-400/35 px-0.5 font-semibold text-current">
                        {hit.matched}
                      </mark>
                      {hit.after}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : guestMatches.length === 0 ? (
          <p className={`px-3 py-8 text-center text-xs ${palette.textSecondary}`}>
            Không có chương nào khớp &ldquo;{trimmed}&rdquo;.
          </p>
        ) : (
          <ul className="space-y-1">
            {guestMatches.map((item) => (
              <li key={item.chapterIndex}>
                <button
                  type="button"
                  onClick={() => {
                    if (onJumpToSearchResult) {
                      onJumpToSearchResult({
                        chapterIndex: item.chapterIndex,
                        query: trimmed,
                        occurrenceIndex: 0,
                        approximateRatio: 0,
                      });
                    } else {
                      onSelectChapter(item.chapterIndex);
                    }
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${palette.border} ${palette.hover}`}
                >
                  <span className="truncate font-medium">
                    {String(item.chapterNumber).padStart(2, '0')}. {item.chapterTitle}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${palette.border}`}>
                    {item.matchCount} khớp
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface ReaderBookmarksPanelProps {
  book: Book;
  activeIndex: number;
  currentChapterId: string;
  currentChapterTitle: string;
  currentScrollRatio: number;
  palette: ReaderThemePalette;
  onJumpToBookmark: (chapterIndex: number, scrollRatio: number) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function ReaderBookmarksPanel({
  book,
  activeIndex,
  currentChapterId,
  currentChapterTitle,
  currentScrollRatio,
  palette,
  onJumpToBookmark,
  onApiError,
}: ReaderBookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorMsg(null);
    void fetchBookBookmarks(book.id, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setBookmarks(list);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onApiError?.(err, 'Phiên truy cập đã hết hiệu lực.');
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dấu trang.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [book.id, onApiError]);

  const positionLabel = `${currentChapterTitle || `Phần ${activeIndex + 1}`} · ${Math.round(currentScrollRatio * 100)}%`;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const created = await addBookBookmark(book.id, {
        chapterId: currentChapterId || `ch-${activeIndex}`,
        chapterIndex: activeIndex,
        chapterTitle: currentChapterTitle,
        scrollRatio: currentScrollRatio,
        label: positionLabel,
        note: note.trim() || null,
      });
      setBookmarks((prev) => [created, ...prev]);
      setNote('');
    } catch (err) {
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên truy cập đã hết hiệu lực.');
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu dấu trang.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const prev = bookmarks;
    setBookmarks((list) => list.filter((b) => b.id !== id));
    try {
      await removeBookBookmark(book.id, id);
    } catch (err) {
      setBookmarks(prev);
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên truy cập đã hết hiệu lực.');
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xoá dấu trang.');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={(e) => void handleAdd(e)} className={`space-y-2 border-b p-3 ${palette.border}`}>
        <p className={`truncate text-[11px] font-medium ${palette.textSecondary}`}>
          Đang ở: {positionLabel}
        </p>
        <input
          type="text"
          maxLength={240}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi chú ngắn cho đoạn này (tuỳ chọn)..."
          aria-label="Ghi chú dấu trang"
          className={`w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-xs outline-none ${palette.border} ${palette.focusBorder}`}
        />
        <button
          type="submit"
          disabled={saving}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${palette.active}`}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
          <span>Kẹp dấu trang vị trí này</span>
        </button>
        {errorMsg && <p className="text-[11px] text-amber-500">{errorMsg}</p>}
      </form>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs opacity-75">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Đang tải dấu trang...</span>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className={`px-3 py-8 text-center text-xs ${palette.textSecondary}`}>
            <Bookmark className="mx-auto mb-2 h-6 w-6 opacity-45" />
            <p>Chưa có dấu trang nào trong cuốn sách này.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {bookmarks.map((bm) => (
              <li
                key={bm.id}
                className={`group flex items-start justify-between gap-1.5 rounded-xl border p-2.5 text-xs transition ${palette.border} ${palette.hover}`}
              >
                <button
                  type="button"
                  onClick={() => onJumpToBookmark(bm.chapterIndex, bm.scrollRatio)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-semibold">{bm.label}</p>
                  {bm.note && (
                    <p className={`mt-1 line-clamp-2 text-[11px] leading-snug ${palette.textSecondary}`}>
                      &ldquo;{bm.note}&rdquo;
                    </p>
                  )}
                  <p className={`mt-1 text-[10px] opacity-65 ${palette.textSecondary}`}>
                    {new Date(bm.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(bm.id)}
                  aria-label="Xoá dấu trang"
                  title="Xoá dấu trang"
                  className="shrink-0 rounded-md p-1 opacity-60 transition hover:text-red-500 hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
