import { useEffect } from 'react';
import { BookOpenText, X } from 'lucide-react';
import type { ResolvedFootnoteItem } from '@/lib/epubFootnotes';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderFootnotePopoverProps {
  footnote: ResolvedFootnoteItem | null;
  palette: ReaderThemePalette;
  protectCopy?: boolean;
  onClose: () => void;
}

export function ReaderFootnotePopover({
  footnote,
  palette,
  protectCopy = false,
  onClose,
}: ReaderFootnotePopoverProps) {
  useEffect(() => {
    if (!footnote) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [footnote, onClose]);

  if (!footnote) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const isMobile = vw < 640;
  const mobilePlaceTop = isMobile && footnote.anchorY > vh * 0.5;

  const cardWidth = Math.min(380, vw - 24);
  const clampedLeft = Math.max(12, Math.min(vw - cardWidth - 12, footnote.anchorX - cardWidth / 2));
  const showAbove = footnote.anchorY > vh * 0.62;
  const desktopTop = showAbove
    ? Math.max(56, footnote.anchorY - 14)
    : Math.min(vh - 220, footnote.anchorY + 10);

  return (
    <div
      className="fixed inset-0 z-[60]"
      onClick={onClose}
      onContextMenu={protectCopy ? (e) => e.preventDefault() : undefined}
      onCopy={protectCopy ? (e) => e.preventDefault() : undefined}
    >
      <div
        role="dialog"
        aria-label={`Chú thích ${footnote.markerLabel}`}
        onClick={(e) => e.stopPropagation()}
        style={
          isMobile
            ? undefined
            : {
                left: `${clampedLeft}px`,
                top: `${desktopTop}px`,
                width: `${cardWidth}px`,
                transform: showAbove ? 'translateY(-100%)' : undefined,
              }
        }
        className={`fade-in border shadow-2xl ${palette.panelBg} ${palette.border} ${
          protectCopy ? 'select-none' : ''
        } ${
          isMobile
            ? mobilePlaceTop
              ? ' fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-2xl p-4'
              : ' fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl p-4'
            : ' fixed rounded-2xl p-3.5'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${palette.accentSoftBg} ${palette.accentText}`}>
              <BookOpenText className="h-3.5 w-3.5" />
              <span>Chú thích {footnote.markerLabel}</span>
            </span>
            {footnote.sourceChapterTitle && (
              <span className={`truncate text-[11px] ${palette.textSecondary}`}>
                · {footnote.sourceChapterTitle}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chú thích"
            className={`shrink-0 rounded-lg p-1 transition ${palette.hover}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className={`scrollbar-thin max-h-52 space-y-2 overflow-y-auto pr-1 text-[13.5px] leading-relaxed ${palette.textPrimary}`}
        >
          {footnote.content.split(/\n{2,}/).map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
