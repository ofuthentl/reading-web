import { useEffect, useMemo, useState } from 'react';
import { Lock, Navigation } from 'lucide-react';
import type { Chapter } from '@/types';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import {
  computeChapterStartPercents,
  resolveWeightedBookPercentTarget,
} from '@/lib/readingEstimate';

export interface ReaderKindlePercentBarProps {
  chapters: readonly Chapter[];
  chapterWeights?: readonly number[];
  overallPercent: number;
  palette: ReaderThemePalette;
  onPreviewChapterChange?: (chapterIndex: number | null) => void;
  onJumpToChapterRatio: (chapterIdx: number, scrollRatio: number) => void;
}

export function ReaderKindlePercentBar({
  chapters,
  chapterWeights,
  overallPercent,
  palette,
  onPreviewChapterChange,
  onJumpToChapterRatio,
}: ReaderKindlePercentBarProps) {
  const initialPct = Math.round(Math.min(100, Math.max(0, overallPercent)));
  const [draftPct, setDraftPct] = useState(initialPct);
  const [inputText, setInputText] = useState(String(initialPct));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const next = Math.round(Math.min(100, Math.max(0, overallPercent)));
    setDraftPct(next);
    setInputText(String(next));
    setDirty(false);
  }, [overallPercent]);

  const effectiveWeights = useMemo(
    () =>
      chapterWeights && chapterWeights.length === chapters.length
        ? chapterWeights
        : chapters.map(() => 1),
    [chapterWeights, chapters],
  );

  const chapterMarks = useMemo(() => {
    const starts = computeChapterStartPercents(effectiveWeights);
    // Bỏ mốc 0% đầu và gom các mốc quá sát nhau để thanh tiến độ sạch mắt
    const ticks: number[] = [];
    let last = 2;
    for (let i = 1; i < starts.length; i += 1) {
      const pct = starts[i];
      if (pct >= last + 2 && pct <= 98) {
        ticks.push(Math.round(pct * 10) / 10);
        last = pct;
      }
    }
    return ticks;
  }, [effectiveWeights]);

  const target = useMemo(
    () => resolveWeightedBookPercentTarget(effectiveWeights, draftPct),
    [draftPct, effectiveWeights],
  );

  const targetChapter = chapters[target.chapterIndex];
  const isTargetLocked = Boolean(targetChapter?.locked);
  const targetChapterPct = Math.round(target.scrollRatio * 100);

  useEffect(() => {
    onPreviewChapterChange?.(dirty ? target.chapterIndex : null);
    return () => onPreviewChapterChange?.(null);
  }, [dirty, onPreviewChapterChange, target.chapterIndex]);

  if (chapters.length === 0) return null;

  const commitJump = (pctValue: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(pctValue)));
    const resolved = resolveWeightedBookPercentTarget(effectiveWeights, clamped);
    if (chapters[resolved.chapterIndex]?.locked) return;
    onJumpToChapterRatio(resolved.chapterIndex, resolved.scrollRatio);
  };

  return (
    <div
      className={`shrink-0 border-t px-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 ${palette.border} ${palette.headerBg}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${palette.textSecondary}`}>
          Đi tới vị trí (% cuốn)
        </span>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            commitJump(draftPct);
          }}
        >
          <label className="sr-only" htmlFor="reader-kindle-pct-input">
            Nhập phần trăm cuốn sách
          </label>
          <div
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs tabular-nums ${palette.border} ${palette.panelBg}`}
          >
            <input
              id="reader-kindle-pct-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={inputText}
              onChange={(event) => {
                const raw = event.target.value;
                setInputText(raw);
                if (raw.trim() === '') return;
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                  const clamped = Math.min(100, Math.max(0, Math.round(parsed)));
                  setDraftPct(clamped);
                  setDirty(true);
                }
              }}
              onBlur={() => setInputText(String(draftPct))}
              className="w-9 bg-transparent text-right text-xs font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className={`ml-0.5 text-[11px] ${palette.textSecondary}`}>%</span>
          </div>

          <button
            type="submit"
            disabled={isTargetLocked}
            title={isTargetLocked ? 'Chương đích đang bị khoá riêng' : `Nhảy tới ${draftPct}% cuốn`}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${palette.accentBg} ${palette.accentFg}`}
          >
            <Navigation className="h-3 w-3" />
            <span>Đi tới</span>
          </button>
        </form>
      </div>

      {/* Thanh kéo toàn cuốn kiểu Kindle kèm vạch chia mốc chương */}
      <div className="relative flex items-center py-1">
        {chapterMarks.length > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-1.5 top-1/2 h-2 -translate-y-1/2"
          >
            {chapterMarks.map((pct) => (
              <span
                key={pct}
                className="absolute top-0 h-full w-px bg-current opacity-20"
                style={{ left: `${pct}%` }}
              />
            ))}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draftPct}
          aria-label="Thanh trượt phần trăm toàn cuốn"
          onChange={(event) => {
            const next = Number(event.target.value);
            setDraftPct(next);
            setInputText(String(next));
            setDirty(true);
          }}
          className={`relative z-10 h-1.5 w-full cursor-pointer ${palette.sliderAccent}`}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <p className={`min-w-0 truncate ${isTargetLocked ? 'text-rose-500' : palette.textSecondary}`}>
          {isTargetLocked && <Lock className="mr-1 inline h-3 w-3 align-[-2px]" />}
          <span className={`font-medium ${isTargetLocked ? 'text-rose-500' : palette.textPrimary}`}>
            {targetChapter?.title || `Chương ${target.chapterIndex + 1}`}
          </span>
          <span>
            {isTargetLocked ? ' · Chương bị khoá' : ` · ~${targetChapterPct}% chương`}
          </span>
        </p>
        <span className={`shrink-0 tabular-nums ${palette.textSecondary}`}>
          {target.chapterIndex + 1}/{chapters.length}
        </span>
      </div>
    </div>
  );
}
