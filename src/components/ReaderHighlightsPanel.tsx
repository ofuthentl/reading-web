import { useMemo, useState } from 'react';
import { BookMarked, Highlighter, Plus, Trash2 } from 'lucide-react';
import type { BookHighlight, HighlightColor } from '@/types';
import { HIGHLIGHT_COLOR_OPTIONS } from '@/lib/highlightsApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderHighlightsPanelProps {
  highlights: readonly BookHighlight[];
  palette: ReaderThemePalette;
  protectCopy?: boolean;
  onJumpToHighlight: (chapterIndex: number, scrollRatio: number) => void;
  onDeleteHighlight: (id: string) => void;
  onOpenGuestAdd?: () => void;
  onOpenQuoteVault?: () => void;
}

export function ReaderHighlightsPanel({
  highlights,
  palette,
  protectCopy = false,
  onJumpToHighlight,
  onDeleteHighlight,
  onOpenGuestAdd,
  onOpenQuoteVault,
}: ReaderHighlightsPanelProps) {
  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all');

  const filtered = useMemo(
    () =>
      colorFilter === 'all'
        ? highlights
        : highlights.filter((item) => item.color === colorFilter),
    [colorFilter, highlights],
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${protectCopy ? 'select-none' : ''}`}
      onCopy={protectCopy ? (e) => e.preventDefault() : undefined}
      onContextMenu={protectCopy ? (e) => e.preventDefault() : undefined}
    >
      <div className={`space-y-2 border-b p-3 ${palette.border}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setColorFilter('all')}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                colorFilter === 'all' ? palette.active : `${palette.border} ${palette.hover}`
              }`}
            >
              Tất cả ({highlights.length})
            </button>
            {HIGHLIGHT_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setColorFilter((cur) => (cur === opt.id ? 'all' : opt.id))}
                title={`Lọc màu ${opt.label}`}
                className={`flex h-6 w-6 items-center justify-center rounded-lg border transition ${
                  colorFilter === opt.id ? palette.active : `${palette.border} ${palette.hover}`
                }`}
              >
                <span className={`h-3 w-3 rounded-full border ${opt.swatchClass}`} />
              </button>
            ))}
          </div>

          {onOpenQuoteVault && (
            <button
              type="button"
              onClick={onOpenQuoteVault}
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold text-accent transition ${palette.border} ${palette.hover}`}
            >
              <BookMarked className="h-3 w-3" />
              <span>Kho trích dẫn</span>
            </button>
          )}
        </div>

        {onOpenGuestAdd ? (
          <button
            type="button"
            onClick={onOpenGuestAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Lưu đoạn đang đọc trên trang</span>
          </button>
        ) : (
          <p className={`text-[11px] ${palette.textSecondary}`}>
            Mẹo: Bôi đen một câu bất kỳ trên trang sách để tô màu và lưu trích dẫn.
          </p>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-xs ${palette.textSecondary}`}>
            <Highlighter className="h-5 w-5 opacity-50" />
            <p>Chưa có đoạn trích dẫn nào trong cuốn sách này.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((hl) => {
              const colorMeta =
                HIGHLIGHT_COLOR_OPTIONS.find((c) => c.id === hl.color) || HIGHLIGHT_COLOR_OPTIONS[0];
              return (
                <li
                  key={hl.id}
                  className={`group flex items-start justify-between gap-2 rounded-xl border p-2.5 text-xs transition ${palette.border} ${palette.hover}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToHighlight(hl.chapterIndex, hl.locator?.scrollRatio ?? 0)
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${colorMeta.swatchClass}`} />
                      <span className={`truncate text-[10.5px] font-medium ${palette.textSecondary}`}>
                        {hl.chapterTitle || `Phần ${hl.chapterIndex + 1}`}
                      </span>
                    </div>
                    <p className="line-clamp-3 leading-relaxed">“{hl.quoteText}”</p>
                    {hl.note && (
                      <p className={`mt-1 line-clamp-2 italic ${palette.textSecondary}`}>
                        ✎ {hl.note}
                      </p>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteHighlight(hl.id)}
                    aria-label="Xoá trích dẫn"
                    className={`shrink-0 rounded-md p-1 opacity-75 transition hover:text-red-500 hover:opacity-100 ${palette.textSecondary}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
