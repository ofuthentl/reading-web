import { Headphones, Timer, Volume2, X } from 'lucide-react';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import {
  type ReaderSoundscapeId,
  SOUNDSCAPE_OPTIONS,
  type SleepTimerMinutes,
} from '@/lib/readerSoundscapes';

const SLEEP_OPTIONS: ReadonlyArray<{ minutes: SleepTimerMinutes; label: string }> = [
  { minutes: 0, label: 'Không' },
  { minutes: 15, label: '15p' },
  { minutes: 30, label: '30p' },
  { minutes: 60, label: '60p' },
];

export interface ReaderSoundscapePopoverProps {
  preset: ReaderSoundscapeId;
  volume: number;
  pageTurnSound: boolean;
  sleepMinutes: SleepTimerMinutes;
  sleepRemainingSec: number | null;
  palette: ReaderThemePalette;
  onSelectPreset: (preset: ReaderSoundscapeId) => void;
  onChangeVolume: (volume: number) => void;
  onTogglePageTurnSound: (enabled: boolean) => void;
  onSelectSleepMinutes: (minutes: SleepTimerMinutes) => void;
  onClose: () => void;
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ReaderSoundscapePopover({
  preset,
  volume,
  pageTurnSound,
  sleepMinutes,
  sleepRemainingSec,
  palette,
  onSelectPreset,
  onChangeVolume,
  onTogglePageTurnSound,
  onSelectSleepMinutes,
  onClose,
}: ReaderSoundscapePopoverProps) {
  return (
    <div
      role="dialog"
      aria-label="Âm thanh môi trường đọc sách"
      className={`fade-in scrollbar-thin absolute right-3 top-[3.5rem] z-40 max-h-[calc(100dvh-4.5rem)] w-[20.5rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-y-contain rounded-2xl border p-4 shadow-2xl ${palette.panelBg} ${palette.border}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Headphones className={`h-3.5 w-3.5 ${palette.accentText}`} />
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Âm thanh đọc sách
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng âm thanh"
          className={`rounded-lg p-1 ${palette.hover}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        {SOUNDSCAPE_OPTIONS.map((opt) => {
          const active = preset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectPreset(opt.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                active ? palette.accentRing : `${palette.border} ${palette.hover}`
              }`}
            >
              <div>
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className={`text-[11px] ${palette.textSecondary}`}>{opt.subtitle}</p>
              </div>
              {active && opt.id !== 'off' && (
                <span className={`text-[10px] font-semibold ${palette.accentText}`}>Đang phát</span>
              )}
            </button>
          );
        })}
      </div>

      <div className={`mt-3.5 border-t pt-3 ${palette.border}`}>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className={`inline-flex items-center gap-1.5 font-medium ${palette.textSecondary}`}>
            <Volume2 className="h-3.5 w-3.5" />
            <span>Âm lượng</span>
          </span>
          <span className="tabular-nums">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
          aria-label="Điều chỉnh âm lượng môi trường"
          className={`w-full ${palette.sliderAccent}`}
        />
      </div>

      <div className={`mt-3 border-t pt-3 ${palette.border}`}>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className={`inline-flex items-center gap-1.5 font-medium ${palette.textSecondary}`}>
            <Timer className="h-3.5 w-3.5" />
            <span>Hẹn giờ tắt nhạc</span>
          </span>
          {sleepRemainingSec !== null && preset !== 'off' && (
            <span className={`text-[11px] font-semibold tabular-nums ${palette.accentText}`}>
              Còn {formatCountdown(sleepRemainingSec)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {SLEEP_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => onSelectSleepMinutes(opt.minutes)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                sleepMinutes === opt.minutes
                  ? palette.active
                  : `${palette.border} ${palette.hover}`
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label
        className={`mt-3 flex cursor-pointer items-center justify-between gap-2 border-t pt-3 text-xs ${palette.border}`}
      >
        <span>Âm giấy sột soạt nhẹ khi lật trang</span>
        <input
          type="checkbox"
          checked={pageTurnSound}
          onChange={(e) => onTogglePageTurnSound(e.target.checked)}
          className={`h-4 w-4 shrink-0 ${palette.sliderAccent}`}
        />
      </label>
    </div>
  );
}
