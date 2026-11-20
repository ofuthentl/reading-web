import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Book, Chapter } from '@/types';
import type { ReaderThemePalette } from '@/lib/readerConfig';

interface ReaderTocDrawerProps {
  book: Book;
  chapters: Chapter[];
  activeIndex: number;
  isPdf: boolean;
  palette: ReaderThemePalette;
  onSelectChapter: (index: number) => void;
  onClose: () => void;
}

export function ReaderTocDrawer({
  book,
  chapters,
  activeIndex,
  isPdf,
  palette,
  onSelectChapter,
  onClose,
}: ReaderTocDrawerProps) {
  const [query, setQuery] = useState('');

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
        aria-label="Mục lục chương"
        className={`slide-in fixed bottom-0 left-0 top-0 z-50 flex w-80 max-w-[88vw] flex-col border-r shadow-2xl ${palette.panelBg} ${palette.border}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3.5 ${palette.border}`}>
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-bold">{book.title}</h2>
            <p className={`truncate text-xs ${palette.textSecondary}`}>
              {book.author} · {chapters.length} {isPdf ? 'trang' : 'chương'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-1.5 ${palette.hover}`}
            aria-label="Đóng mục lục"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`border-b p-3 ${palette.border}`}>
          <div className="relative">
            <Search
              className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${palette.textSecondary}`}
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Lọc chương nhanh..."
              aria-label="Lọc chương nhanh"
              className={`w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent ${palette.border}`}
            />
          </div>
        </div>

        <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-2">
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
      </aside>
    </>
  );
}
