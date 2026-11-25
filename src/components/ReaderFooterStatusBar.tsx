import { Check, Clock, Eye } from 'lucide-react';
import type { ReaderEyeBreakMinutes } from '@/types';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderEyeBreakBannerProps {
  due?: boolean;
  minutes?: ReaderEyeBreakMinutes;
  palette: ReaderThemePalette;
  onAcknowledge?: () => void;
}

export function ReaderEyeBreakBanner({
  due = false,
  minutes = 0,
  palette,
  onAcknowledge,
}: ReaderEyeBreakBannerProps) {
  if (!due || !minutes || !onAcknowledge) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-2 border-t px-3.5 py-1.5 text-xs sm:px-6 ${palette.border} ${palette.accentSoftBg} ${palette.textPrimary}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Eye className={`h-3.5 w-3.5 shrink-0 ${palette.accentText}`} />
        <span>
          Bạn đã đọc liên tục <strong>{minutes} phút</strong> — hãy nhìn xa 20 giây cho dịu mắt nhé.
        </span>
      </span>
      <button
        type="button"
        onClick={onAcknowledge}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${palette.accentBg} ${palette.accentFg}`}
      >
        <Check className="h-3 w-3" />
        <span>Đã nghỉ mắt</span>
      </button>
    </div>
  );
}

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
        settingsOpen ? 'z-20' : 'z-[63]'
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
  eyeBreakDue?: boolean;
  eyeBreakMinutes?: ReaderEyeBreakMinutes;
  onAcknowledgeEyeBreak?: () => void;
  onOpenToc?: () => void;
}

export function ReaderFooterStatusBar({
  chapterIndex,
  totalChapters,
  overallPercent,
  remainingEstimate,
  immersiveHidden,
  palette,
  modeBadge,
  eyeBreakDue,
  eyeBreakMinutes,
  onAcknowledgeEyeBreak,
  onOpenToc,
}: ReaderFooterStatusBarProps) {
  return (
    <div className="relative z-20 w-full shrink-0">
      <ReaderEyeBreakBanner
        due={eyeBreakDue}
        minutes={eyeBreakMinutes}
        palette={palette}
        onAcknowledge={onAcknowledgeEyeBreak}
      />
      {!immersiveHidden &&
        (onOpenToc ? (
          <button
            type="button"
            onClick={onOpenToc}
            title="Mở mục lục & thanh tua % cuốn"
            className={`flex w-full items-center justify-between gap-3 border-t px-3.5 py-1 text-left text-[11px] tabular-nums transition sm:px-6 ${palette.border} ${palette.headerBg} ${palette.textSecondary} ${palette.hover}`}
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
          </button>
        ) : (
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
        ))}
      <div className="h-1 w-full bg-black/10">
        <div
          className={`h-full transition-all duration-150 ${palette.progressBar}`}
          style={{ width: `${overallPercent}%` }}
        />
      </div>
    </div>
  );
}
