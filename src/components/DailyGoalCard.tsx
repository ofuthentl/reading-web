import { CheckCircle2, Flame, Sparkles, Target } from 'lucide-react';
import { formatReadingDuration } from '@/lib/readingStreak';

const GOAL_PRESET_MINUTES = [0, 15, 30, 45, 60, 90, 120] as const;

export interface DailyGoalCardProps {
  todaySeconds: number;
  dailyGoalMinutes: number;
  currentStreakDays: number;
  onChangeGoalMinutes?: (nextMinutes: number) => void;
  onOpenWrapped: () => void;
}

export function DailyGoalCard({
  todaySeconds,
  dailyGoalMinutes,
  currentStreakDays,
  onChangeGoalMinutes,
  onOpenWrapped,
}: DailyGoalCardProps) {
  const goalEnabled = dailyGoalMinutes >= 10;
  const goalSeconds = goalEnabled ? dailyGoalMinutes * 60 : 0;
  const ratio = goalEnabled && goalSeconds > 0 ? Math.min(1, todaySeconds / goalSeconds) : 0;
  const percent = Math.round(ratio * 100);
  const reached = goalEnabled && todaySeconds >= goalSeconds;

  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="5.5"
                className="text-subtle"
              />
              {goalEnabled && (
                <circle
                  cx="32"
                  cy="32"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className={
                    reached
                      ? 'text-emerald-500 transition-all duration-500'
                      : 'text-amber-500 transition-all duration-500'
                  }
                />
              )}
            </svg>
            <span className="absolute text-xs font-bold tabular-nums text-ink">
              {goalEnabled ? `${percent}%` : 'Tắt'}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              {reached ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Target className="h-4 w-4 text-amber-500" />
              )}
              <h3 className="font-display text-sm font-semibold text-ink">
                Mục tiêu đọc hôm nay
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {goalEnabled ? (
                <>
                  Đã đọc <strong className="text-ink">{formatReadingDuration(todaySeconds, true)}</strong>{' '}
                  / mục tiêu <strong className="text-ink">{dailyGoalMinutes} phút</strong>
                  {reached ? ' — Hoàn thành xuất sắc!' : ''}
                </>
              ) : (
                <>
                  Hôm nay đã đọc <strong className="text-ink">{formatReadingDuration(todaySeconds, true)}</strong>{' '}
                  (đang tắt mục tiêu ngày)
                </>
              )}
            </p>
            {currentStreakDays > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <Flame className="h-3 w-3" />
                <span>Chuỗi {currentStreakDays} ngày đọc liên tiếp</span>
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenWrapped}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground shadow-sm transition hover:bg-accent-hover"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Ofu&apos;s Library Wrapped</span>
        </button>
      </div>

      {onChangeGoalMinutes && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[11px] font-medium text-ink-muted">Chọn mục tiêu phút/ngày:</span>
          <div className="flex flex-wrap items-center gap-1">
            {GOAL_PRESET_MINUTES.map((mins) => {
              const active =
                mins === 0 ? !goalEnabled : goalEnabled && dailyGoalMinutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onChangeGoalMinutes(mins)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-medium tabular-nums transition ${
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {mins === 0 ? 'Tắt' : `${mins}p`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
