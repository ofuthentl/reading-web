import { useMemo, useState } from 'react';
import { CalendarDays, Clock, Flame, Trophy } from 'lucide-react';
import {
  type ReaderActivityReport,
  type ReadingActivityDay,
  formatReadingDuration,
  getHeatmapIntensityLevel,
} from '@/lib/readingStreak';

export interface ReadingHeatmapSectionProps {
  activity: ReaderActivityReport | null;
  loading: boolean;
  liveProgressSeconds: number;
}

const WEEKDAY_LABELS: Array<[number, string]> = [
  [0, 'T2'],
  [2, 'T4'],
  [4, 'T6'],
  [6, 'CN'],
];

function formatViFullDate(dayKey: string): string {
  const parts = dayKey.split('-');
  if (parts.length !== 3) return dayKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getMondayWeekdayIndex(dayKey: string): number {
  const dt = new Date(`${dayKey}T00:00:00Z`);
  return (dt.getUTCDay() + 6) % 7;
}

function levelFillStyle(level: 0 | 1 | 2 | 3 | 4): string | undefined {
  if (level === 0) return undefined;
  if (level === 1) return 'rgb(var(--color-accent) / 0.28)';
  if (level === 2) return 'rgb(var(--color-accent) / 0.52)';
  if (level === 3) return 'rgb(var(--color-accent) / 0.8)';
  return 'rgb(var(--color-crimson))';
}

export function ReadingHeatmapSection({
  activity,
  loading,
  liveProgressSeconds,
}: ReadingHeatmapSectionProps) {
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const days = useMemo(() => activity?.days ?? [], [activity?.days]);
  const totalSeconds = Math.max(activity?.totalReadingSeconds ?? 0, liveProgressSeconds);

  const grid = useMemo(() => {
    if (days.length === 0) return { cells: [], monthLabels: [], colCount: 13 };
    const cells: Array<{ day: ReadingActivityDay; col: number; row: number }> = [];
    const monthLabels: Array<{ col: number; label: string }> = [];
    let col = 0;
    let lastMonth = '';

    for (let i = 0; i < days.length; i += 1) {
      const day = days[i];
      const row = getMondayWeekdayIndex(day.dayKey);
      if (i > 0 && row === 0) col += 1;
      cells.push({ day, col, row });

      const monthStr = day.dayKey.slice(5, 7);
      if (monthStr !== lastMonth && (i === 0 || day.dayKey.endsWith('-01') || row === 0)) {
        const lastPlacedCol = monthLabels[monthLabels.length - 1]?.col ?? -99;
        if (col - lastPlacedCol >= 2) {
          monthLabels.push({ col, label: `Thg ${Number(monthStr)}` });
        }
        lastMonth = monthStr;
      }
    }
    return { cells, monthLabels, colCount: col + 1 };
  }, [days]);

  const selectedDay = useMemo(() => {
    if (days.length === 0) return null;
    if (selectedDayKey) {
      const found = days.find((d) => d.dayKey === selectedDayKey);
      if (found) return found;
    }
    return days[days.length - 1];
  }, [days, selectedDayKey]);

  const cellSize = 12;
  const cellGap = 3;
  const step = cellSize + cellGap;
  const padLeft = 24;
  const padTop = 18;
  const svgW = padLeft + grid.colCount * step + 4;
  const svgH = padTop + 7 * step + 2;

  return (
    <div className="space-y-3">
      {/* 3 thẻ Thời gian đọc & Streak */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5 text-accent" />
            <span>Tổng thời gian đọc</span>
          </div>
          <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-ink">
            {formatReadingDuration(totalSeconds)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            90 ngày qua: {formatReadingDuration(activity?.readingSeconds90d ?? 0, true)}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Flame className="h-3.5 w-3.5 text-crimson-accent" />
            <span>Chuỗi đọc hiện tại</span>
          </div>
          <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-ink">
            {activity?.currentStreakDays ?? 0}
            <span className="ml-1 font-sans text-xs font-normal text-ink-muted">ngày liên tiếp</span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Hoạt động {activity?.activeDays90d ?? 0} / 90 ngày
          </p>
        </div>

        <div className="rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Kỷ lục Streak</span>
          </div>
          <p className="mt-1.5 font-display text-lg font-bold tabular-nums text-ink">
            {activity?.longestStreakDays ?? 0}
            <span className="ml-1 font-sans text-xs font-normal text-ink-muted">ngày</span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">Múi giờ chuẩn UTC+7</p>
        </div>
      </div>

      {/* Lịch nhiệt 90 ngày SVG thuần 0 CDN */}
      <div className="rounded-2xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <CalendarDays className="h-3.5 w-3.5 text-accent" />
            <span>Lịch nhiệt đọc sách 90 ngày</span>
          </div>
          {selectedDay && (
            <span className="text-[11px] tabular-nums text-ink-muted">
              <strong className="text-ink">{formatViFullDate(selectedDay.dayKey)}</strong> ·{' '}
              {selectedDay.readingSeconds > 0
                ? `Đã đọc ${formatReadingDuration(selectedDay.readingSeconds)}`
                : selectedDay.active
                  ? 'Có mở sách đọc'
                  : 'Chưa đọc'}
            </span>
          )}
        </div>

        {loading && !activity ? (
          <div className="mt-3 h-28 animate-pulse rounded-xl bg-subtle/70" />
        ) : (
          <div className="mt-3 overflow-x-auto scrollbar-thin">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="h-[132px] min-w-[260px] w-full select-none"
              role="img"
              aria-label="Lịch nhiệt hoạt động đọc sách 90 ngày gần nhất"
            >
              {grid.monthLabels.map((m) => (
                <text
                  key={`${m.col}-${m.label}`}
                  x={padLeft + m.col * step}
                  y={11}
                  className="fill-ink-faint text-[9px]"
                >
                  {m.label}
                </text>
              ))}

              {WEEKDAY_LABELS.map(([rowIdx, label]) => (
                <text
                  key={label}
                  x={0}
                  y={padTop + rowIdx * step + 9.5}
                  className="fill-ink-faint text-[9px]"
                >
                  {label}
                </text>
              ))}

              {grid.cells.map(({ day, col, row }) => {
                const level = getHeatmapIntensityLevel(day);
                const isSelected = selectedDay?.dayKey === day.dayKey;
                return (
                  <rect
                    key={day.dayKey}
                    x={padLeft + col * step}
                    y={padTop + row * step}
                    width={cellSize}
                    height={cellSize}
                    rx={3}
                    style={level > 0 ? { fill: levelFillStyle(level) } : undefined}
                    className={`cursor-pointer transition-opacity ${
                      level === 0 ? 'fill-subtle' : ''
                    }`}
                    stroke={isSelected ? 'currentColor' : 'rgb(128 128 128 / 0.16)'}
                    strokeWidth={isSelected ? 1.4 : 0.7}
                    onMouseEnter={() => setSelectedDayKey(day.dayKey)}
                    onClick={() => setSelectedDayKey(day.dayKey)}
                  />
                );
              })}
            </svg>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-faint">
          <span>Chạm hoặc di chuột vào từng ô để xem thời lượng đọc theo ngày</span>
          <div className="inline-flex items-center gap-1">
            <span>Ít</span>
            {([0, 1, 2, 3, 4] as const).map((lv) => (
              <span
                key={lv}
                className={`inline-block h-2.5 w-2.5 rounded-[3px] border border-line/60 ${
                  lv === 0 ? 'bg-subtle' : ''
                }`}
                style={lv > 0 ? { backgroundColor: levelFillStyle(lv) } : undefined}
              />
            ))}
            <span>Nhiều (90p+)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
