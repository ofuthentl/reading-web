import { Clock } from 'lucide-react';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderNightDimOverlayProps {
  nightDimPercent: number;
  settingsOpen?: boolean;
}

export function ReaderNightDimOverlay({
  nightDimPercent,
  settingsOpen = false,
}: ReaderNightDimOverlayProps) {
  const clamped = Math.min(50, Math.max(0, Math.round(nightDimPercent || 0)));
  if (clamped <= 0) return null;
  const opacity = Math.round((clamped / 100) * 72) / 100;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-[#080604] transition-opacity duration-150 ${
        settingsOpen ? 'z-20' : 'z-[35]'
      }`}
      style={{ opacity }}
    />
  );
}

export interface ReaderFooterStatusBarProps {
  chapterIndex: number;
  totalChapters: number;
  overallPercent: number;
  remainingEstimate: string;
  immersiveHidden: boolean;
  palette: ReaderThemePalette;
  modeBadge?: string;
}

export function ReaderFooterStatusBar({
  chapterIndex,
  totalChapters,
  overallPercent,
  remainingEstimate,
  immersiveHidden,
  palette,
  modeBadge,
}: ReaderFooterStatusBarProps) {
  return (
    <div className="z-20 w-full shrink-0">
      {!immersiveHidden && (
        <div
          className={`flex items-center justify-between gap-3 border-t px-3.5 py-1 text-[11px] tabular-nums sm:px-6 ${palette.border} ${palette.headerBg} ${palette.textSecondary}`}
        >
          <span className="truncate">
            Chương {chapterIndex + 1}/{Math.max(1, totalChapters)} · {overallPercent}% cuốn
            {modeBadge ? ` · ${modeBadge}` : ''}
          </span>
          {remainingEstimate && (
            <span className="inline-flex shrink-0 items-center gap-1 font-medium">
              <Clock className="h-3 w-3 opacity-75" />
              <span>{remainingEstimate}</span>
            </span>
          )}
        </div>
      )}
      <div className="h-1 w-full bg-black/10">
        <div
          className={`h-full transition-all duration-150 ${palette.progressBar}`}
          style={{ width: `${overallPercent}%` }}
        />
      </div>
    </div>
  );
}
