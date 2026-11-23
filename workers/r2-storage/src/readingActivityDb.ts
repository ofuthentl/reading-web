import type { AuthContext } from './auth';
import type { Env } from './booksDb';
import { ensureGuestProgressTable, ensureProgressReadingTimeColumns } from './progressDb';
import { buildDayKeys, ensureUsageTables } from './usageRecorder';

const ACTIVITY_WINDOW_DAYS = 90;

interface ReaderDayRow {
  day_key: string;
  reading_seconds: number;
  last_seen_at: number;
}

function computeStreaks(days: Array<{ active: boolean }>): {
  currentStreakDays: number;
  longestStreakDays: number;
} {
  let longest = 0;
  let running = 0;
  for (const d of days) {
    if (d.active) {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  // Nếu hôm nay chưa kịp đọc nhưng hôm qua có đọc thì chuỗi hiện tại vẫn còn sống trong ngày hôm nay
  let current = 0;
  let idx = days.length - 1;
  if (idx >= 0 && !days[idx].active) {
    idx -= 1;
  }
  while (idx >= 0 && days[idx].active) {
    current += 1;
    idx -= 1;
  }

  return { currentStreakDays: current, longestStreakDays: longest };
}

export async function getReaderActivityStats(env: Env, auth: AuthContext) {
  const now = Date.now();
  const readerScope = auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
  const dayKeys = buildDayKeys(ACTIVITY_WINDOW_DAYS, now);
  const firstDayKey = dayKeys[0];

  await Promise.all([
    ensureUsageTables(env.DB),
    auth.role === 'owner'
      ? ensureProgressReadingTimeColumns(env).catch(() => undefined)
      : ensureGuestProgressTable(env).catch(() => undefined),
  ]);

  const progressSumQuery =
    auth.role === 'owner'
      ? env.DB.prepare(
          'SELECT COALESCE(SUM(reading_seconds), 0) AS total_seconds FROM reading_progress',
        ).first<{ total_seconds: number }>()
      : env.DB.prepare(
          `SELECT COALESCE(SUM(reading_seconds), 0) AS total_seconds
           FROM guest_reading_progress
           WHERE discord_user_id = ?`,
        )
          .bind(auth.userId)
          .first<{ total_seconds: number }>();

  const [dailyRowsRes, progressSumRow, allDailySumRow] = await Promise.all([
    env.DB.prepare(
      `SELECT day_key, reading_seconds, last_seen_at
       FROM usage_daily_readers
       WHERE reader_scope = ? AND day_key >= ?
       ORDER BY day_key ASC`,
    )
      .bind(readerScope, firstDayKey)
      .all<ReaderDayRow>()
      .catch(() => ({ results: [] as ReaderDayRow[] })),
    progressSumQuery.catch(() => ({ total_seconds: 0 })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(reading_seconds), 0) AS total_seconds
       FROM usage_daily_readers
       WHERE reader_scope = ?`,
    )
      .bind(readerScope)
      .first<{ total_seconds: number }>()
      .catch(() => ({ total_seconds: 0 })),
  ]);

  const byDay = new Map<string, ReaderDayRow>();
  for (const row of dailyRowsRes.results || []) {
    byDay.set(row.day_key, row);
  }

  let readingSeconds90d = 0;
  let activeDays90d = 0;

  const days = dayKeys.map((dayKey) => {
    const row = byDay.get(dayKey);
    const readingSeconds = Math.max(0, Number(row?.reading_seconds ?? 0));
    const active = Boolean(row && (readingSeconds > 0 || Number(row.last_seen_at ?? 0) > 0));
    readingSeconds90d += readingSeconds;
    if (active) activeDays90d += 1;
    return { dayKey, readingSeconds, active };
  });

  const { currentStreakDays, longestStreakDays } = computeStreaks(days);
  const totalBookSeconds = Math.max(0, Number(progressSumRow?.total_seconds ?? 0));
  const totalDailySeconds = Math.max(0, Number(allDailySumRow?.total_seconds ?? 0));
  const totalReadingSeconds = Math.max(totalBookSeconds, totalDailySeconds, readingSeconds90d);

  return {
    generatedAt: now,
    timezone: 'UTC+7',
    windowDays: ACTIVITY_WINDOW_DAYS,
    totalReadingSeconds,
    readingSeconds90d,
    activeDays90d,
    currentStreakDays,
    longestStreakDays,
    days,
  };
}
