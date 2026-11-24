import { useCallback } from 'react';
import { ArrowDown, Minus, Pause, Play, Plus, SunDim, X } from 'lucide-react';
import type { ReaderSettings } from '@/types';
import {
  type ReaderImmersionState,
  useMobileLeftEdgeDimGesture,
  usePullToNextChapter,
} from '@/hooks/useReaderScrollGestures';
import type { ReaderThemePalette } from '@/lib/readerConfig';

/**
 * Các thành phần UI tương tác trình đọc (0 B ở entry chunk):
 * 1. `ReaderAutoScrollBar`: thanh điều khiển mini Tự động cuộn (tốc độ `1–10`).
 * 2. `MobileNightDimHud`: chỉ báo `%` độ tối dịu mắt khi vuốt mép trái `24px` trên Mobile.
 * 3. `PullNextChapterIndicator`: chỉ báo tiến trình kéo đáy chuyển sang chương kế tiếp.
 * 4. `ReaderImmersionChrome`: vỏ tổng hợp gắn gọn vào `ReaderView` & `GuestCanvasReader`.
 */

export interface ReaderAutoScrollBarProps {
  open: boolean;
  playing: boolean;
  speed: number;
  palette: ReaderThemePalette;
  onTogglePlay: () => void;
  onChangeSpeed: (next: number) => void;
  onClose: () => void;
}

export function ReaderAutoScrollBar({
  open,
  playing,
  speed,
  palette,
  onTogglePlay,
  onChangeSpeed,
  onClose,
}: ReaderAutoScrollBarProps) {
  if (!open) return null;
  return (
    <div
      role="region"
      aria-label="Điều khiển tự động cuộn"
      onClick={(e) => e.stopPropagation()}
      className={`fixed bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-xl backdrop-blur-md ${palette.panelBg} ${palette.border}`}
    >
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Tạm dừng tự cuộn' : 'Tiếp tục tự cuộn'}
        title="Phím Space hoặc chạm màn hình để Tạm dừng / Tiếp tục"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${palette.accentBg} ${palette.accentFg}`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[0.5px]" />}
      </button>

      <button
        type="button"
        disabled={speed <= 1}
        onClick={() => onChangeSpeed(speed - 1)}
        aria-label="Giảm tốc độ cuộn"
        className={`rounded-full p-1 disabled:opacity-35 ${palette.hover}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <span className="min-w-[4.2rem] text-center font-medium tabular-nums">
        Tốc độ <strong>{speed}</strong>/10
      </span>

      <button
        type="button"
        disabled={speed >= 10}
        onClick={() => onChangeSpeed(speed + 1)}
        aria-label="Tăng tốc độ cuộn"
        className={`rounded-full p-1 disabled:opacity-35 ${palette.hover}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onClose}
        aria-label="Tắt tự động cuộn"
        className={`ml-0.5 rounded-full p-1 ${palette.hover}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function MobileNightDimHud({
  hudPercent,
  palette,
}: {
  hudPercent: number | null;
  palette: ReaderThemePalette;
}) {
  if (hudPercent === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed left-4 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur-md ${palette.panelBg} ${palette.border}`}
    >
      <SunDim className={`h-4 w-4 ${palette.accentText}`} />
      <span>Dịu mắt: {hudPercent}%</span>
    </div>
  );
}

export function PullNextChapterIndicator({
  progress,
  nextChapterNumber,
  palette,
}: {
  progress: number;
  nextChapterNumber: number;
  palette: ReaderThemePalette;
}) {
  if (progress <= 0.04) return null;
  const ready = progress >= 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-11 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border px-3.5 py-2 text-xs font-medium shadow-xl backdrop-blur-md ${palette.panelBg} ${palette.border}`}
    >
      <div className="flex items-center gap-1.5">
        <ArrowDown
          className={`h-3.5 w-3.5 transition-transform duration-150 ${
            ready ? 'rotate-180' : ''
          } ${palette.accentText}`}
        />
        <span>
          {ready
            ? `Thả để sang Phần ${nextChapterNumber} →`
            : `Kéo thêm để sang Phần ${nextChapterNumber}...`}
        </span>
      </div>
      <div className="h-1 w-36 overflow-hidden rounded-full bg-black/15 dark:bg-white/15">
        <div
          className={`h-full transition-all duration-75 ${palette.progressBar}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function ReaderImmersionChrome({
  immersion,
  isPaginated,
  chapterIndex,
  totalChapters,
  nightDimPercent,
  palette,
  scrollContainerRef,
  onUpdateSettings,
  onAdvanceChapter,
}: {
  immersion: ReaderImmersionState;
  isPaginated: boolean;
  chapterIndex: number;
  totalChapters: number;
  nightDimPercent: number;
  palette: ReaderThemePalette;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onAdvanceChapter: () => void;
}) {
  const handleDimChange = useCallback(
    (nextPercent: number) => onUpdateSettings({ nightDimPercent: nextPercent }),
    [onUpdateSettings],
  );
  const dimHud = useMobileLeftEdgeDimGesture(nightDimPercent, handleDimChange);
  const pullProgress = usePullToNextChapter({
    enabled: !isPaginated && chapterIndex < totalChapters - 1,
    scrollContainerRef,
    onAdvanceChapter,
  });

  return (
    <>
      <MobileNightDimHud hudPercent={dimHud} palette={palette} />
      {!isPaginated && (
        <>
          <ReaderAutoScrollBar
            open={immersion.autoScrollOpen}
            playing={immersion.autoScrollPlaying}
            speed={immersion.autoScrollSpeed}
            palette={palette}
            onTogglePlay={() => immersion.setAutoScrollPlaying((v) => !v)}
            onChangeSpeed={immersion.setAutoScrollSpeed}
            onClose={() => {
              immersion.setAutoScrollPlaying(false);
              immersion.setAutoScrollOpen(false);
            }}
          />
          <PullNextChapterIndicator
            progress={pullProgress}
            nextChapterNumber={chapterIndex + 2}
            palette={palette}
          />
        </>
      )}
    </>
  );
}
