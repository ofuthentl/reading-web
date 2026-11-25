import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Navigation, X } from 'lucide-react';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface QuickScrubberChapterItem {
  id: string;
  title: string;
  locked?: boolean;
}

export interface ReaderQuickScrubberPopoverProps {
  open: boolean;
  chapterIndex: number;
  totalChapters: number;
  chapterScrollRatio: number;
  overallPercent: number;
  chapters?: readonly QuickScrubberChapterItem[];
  palette: ReaderThemePalette;
  onJumpToChapterRatio: (chapterIdx: number, ratio: number) => void;
  onClose: () => void;
}

export function ReaderQuickScrubberPopover({
  open,
  chapterIndex,
  totalChapters,
  chapterScrollRatio,
  overallPercent,
  chapters,
  palette,
  onJumpToChapterRatio,
  onClose,
}: ReaderQuickScrubberPopoverProps) {
  const safeTotal = Math.max(1, totalChapters);
  const [draftChapterIdx, setDraftChapterIdx] = useState(chapterIndex);
  const [draftRatioPct, setDraftRatioPct] = useState(Math.round(chapterScrollRatio * 100));
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftChapterIdx(chapterIndex);
    setDraftRatioPct(Math.round(Math.min(1, Math.max(0, chapterScrollRatio)) * 100));
  }, [chapterIndex, chapterScrollRatio, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !popoverRef.current) return;
      if (!popoverRef.current.contains(target)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const clampedDraftIdx = Math.max(0, Math.min(draftChapterIdx, safeTotal - 1));
  const targetChapter = chapters?.[clampedDraftIdx];
  const isTargetLocked = Boolean(targetChapter?.locked);
  const isSameChapter = clampedDraftIdx === chapterIndex;

  const commitChapterJump = (nextIdx: number, nextRatioPct: number) => {
    const safeIdx = Math.max(0, Math.min(nextIdx, safeTotal - 1));
    if (chapters?.[safeIdx]?.locked) return;
    const ratio = Math.min(1, Math.max(0, nextRatioPct / 100));
    onJumpToChapterRatio(safeIdx, ratio);
  };

  const stepChapter = (delta: -1 | 1) => {
    let candidate = clampedDraftIdx + delta;
    while (candidate >= 0 && candidate < safeTotal && chapters?.[candidate]?.locked) {
      candidate += delta;
    }
    if (candidate < 0 || candidate >= safeTotal) return;
    setDraftChapterIdx(candidate);
    setDraftRatioPct(0);
    commitChapterJump(candidate, 0);
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Tua nhanh chương và vị trí đọc"
      data-reader-chrome-dialog="true"
      className={`absolute bottom-full left-1/2 z-30 mb-2 w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border p-3.5 shadow-2xl ${palette.border} ${palette.panelBg} ${palette.textPrimary}`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${palette.textSecondary}`}>
            Tua nhanh · {overallPercent}% cuốn
          </p>
          <p className="truncate text-xs font-semibold">
            {isTargetLocked && <Lock className="mr-1 inline h-3 w-3 text-rose-500" />}
            Chương {clampedDraftIdx + 1}/{safeTotal}
            {targetChapter?.title ? ` · ${targetChapter.title}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thanh tua nhanh"
          className={`shrink-0 rounded-lg p-1 transition ${palette.textSecondary} ${palette.hover}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {safeTotal > 1 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className={palette.textSecondary}>Chọn chương</span>
              <span className="font-medium tabular-nums">
                {clampedDraftIdx + 1} / {safeTotal}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={clampedDraftIdx <= 0}
                onClick={() => stepChapter(-1)}
                aria-label="Chương trước"
                className={`rounded-lg border p-1 transition disabled:opacity-35 ${palette.border} ${palette.hover}`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                min={0}
                max={safeTotal - 1}
                step={1}
                value={clampedDraftIdx}
                aria-label="Thanh trượt chọn chương"
                onChange={(e) => {
                  const nextIdx = Number(e.target.value);
                  setDraftChapterIdx(nextIdx);
                  if (nextIdx !== chapterIndex) setDraftRatioPct(0);
                  else setDraftRatioPct(Math.round(chapterScrollRatio * 100));
                }}
                onPointerUp={() => {
                  if (!isTargetLocked && clampedDraftIdx !== chapterIndex) {
                    commitChapterJump(clampedDraftIdx, draftRatioPct);
                  }
                }}
                onTouchEnd={() => {
                  if (!isTargetLocked && clampedDraftIdx !== chapterIndex) {
                    commitChapterJump(clampedDraftIdx, draftRatioPct);
                  }
                }}
                className={`h-1.5 flex-1 cursor-pointer ${palette.sliderAccent}`}
              />
              <button
                type="button"
                disabled={clampedDraftIdx >= safeTotal - 1}
                onClick={() => stepChapter(1)}
                aria-label="Chương kế tiếp"
                className={`rounded-lg border p-1 transition disabled:opacity-35 ${palette.border} ${palette.hover}`}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {isTargetLocked && (
              <p className="text-[11px] text-rose-500">
                Chương này đang bị khoá riêng — hãy chọn chương mở khác.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={palette.textSecondary}>Vị trí trong chương</span>
            <span className="font-medium tabular-nums">{draftRatioPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draftRatioPct}
            aria-label="Thanh trượt vị trí trong chương"
            onChange={(e) => {
              const pct = Number(e.target.value);
              setDraftRatioPct(pct);
              if (isSameChapter && !isTargetLocked) {
                onJumpToChapterRatio(chapterIndex, pct / 100);
              }
            }}
            className={`h-1.5 w-full cursor-pointer ${palette.sliderAccent}`}
          />
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-1.5">
              {[0, 50, 100].map((mark) => (
                <button
                  key={mark}
                  type="button"
                  disabled={isTargetLocked}
                  onClick={() => {
                    setDraftRatioPct(mark);
                    commitChapterJump(clampedDraftIdx, mark);
                  }}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-40 ${palette.border} ${palette.hover}`}
                >
                  {mark === 0 ? 'Đầu' : mark === 50 ? 'Giữa' : 'Cuối'}
                </button>
              ))}
            </div>

            {!isSameChapter && (
              <button
                type="button"
                disabled={isTargetLocked}
                onClick={() => {
                  commitChapterJump(clampedDraftIdx, draftRatioPct);
                  onClose();
                }}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${palette.accentBg} ${palette.accentFg}`}
              >
                <Navigation className="h-3 w-3" />
                <span>Đi tới</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
