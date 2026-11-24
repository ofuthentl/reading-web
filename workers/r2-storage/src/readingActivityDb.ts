import type { AuthContext } from './auth';
import type { Env } from './booksDb';
import { ensureGuestProgressTable, ensureProgressReadingTimeColumns } from './progressDb';
import { DAY_MS, buildDayKeys, ensureUsageTables, toVietnamDayKey } from './usageRecorder';

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
  const first90DayKey = dayKeys[0];
  const todayDayKey = dayKeys[dayKeys.length - 1];
  const currentYear = todayDayKey.slice(0, 4);
  const currentMonth = todayDayKey.slice(0, 7);
  const yearStartKey = `${currentYear}-01-01`;
  const queryStartKey = yearStartKey < first90DayKey ? yearStartKey : first90DayKey;

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
      .bind(readerScope, queryStartKey)
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
  let monthReadingSeconds = 0;
  let monthActiveDays = 0;
  let yearReadingSeconds = 0;
  let yearActiveDays = 0;
  const monthlyMap = new Map<string, { readingSeconds: number; activeDays: number }>();

  for (let m = 1; m <= 12; m += 1) {
    const mk = `${currentYear}-${String(m).padStart(2, '0')}`;
    monthlyMap.set(mk, { readingSeconds: 0, activeDays: 0 });
  }

  for (const row of dailyRowsRes.results || []) {
    byDay.set(row.day_key, row);
    const sec = Math.max(0, Number(row.reading_seconds ?? 0));
    const active = sec > 0 || Number(row.last_seen_at ?? 0) > 0;
    if (row.day_key.startsWith(currentYear)) {
      yearReadingSeconds += sec;
      if (active) yearActiveDays += 1;
      const monthBucket = monthlyMap.get(row.day_key.slice(0, 7));
      if (monthBucket) {
        monthBucket.readingSeconds += sec;
        if (active) monthBucket.activeDays += 1;
      }
    }
    if (row.day_key.startsWith(currentMonth)) {
      monthReadingSeconds += sec;
      if (active) monthActiveDays += 1;
    }
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

  // Tính chuỗi kỷ lục riêng theo dương lịch UTC+7 cho Tháng này & Năm nay (QĐ-3 = 3A, 0 thêm query D1)
  const computeRangeLongestStreak = (startKey: string, endKey: string): number => {
    const startMs = Date.parse(`${startKey}T00:00:00+07:00`);
    const endMs = Date.parse(`${endKey}T00:00:00+07:00`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return 0;
    const spanDays: Array<{ active: boolean }> = [];
    for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
      const k = toVietnamDayKey(cursor);
      const r = byDay.get(k);
      const active = Boolean(r && (Number(r.reading_seconds ?? 0) > 0 || Number(r.last_seen_at ?? 0) > 0));
      spanDays.push({ active });
    }
    return computeStreaks(spanDays).longestStreakDays;
  };
  const monthLongestStreakDays = computeRangeLongestStreak(`${currentMonth}-01`, todayDayKey);
  const yearLongestStreakDays = computeRangeLongestStreak(yearStartKey, todayDayKey);

  const totalBookSeconds = Math.max(0, Number(progressSumRow?.total_seconds ?? 0));
  const totalDailySeconds = Math.max(0, Number(allDailySumRow?.total_seconds ?? 0));
  const totalReadingSeconds = Math.max(
    totalBookSeconds,
    totalDailySeconds,
    readingSeconds90d,
    yearReadingSeconds,
  );

  const monthlyBreakdown = Array.from(monthlyMap.entries()).map(([monthKey, val]) => ({
    monthKey,
    readingSeconds: val.readingSeconds,
    activeDays: val.activeDays,
  }));

  return {
    generatedAt: now,
    timezone: 'UTC+7',
    windowDays: ACTIVITY_WINDOW_DAYS,
    totalReadingSeconds,
    readingSeconds90d,
    activeDays90d,
    monthReadingSeconds,
    monthActiveDays,
    monthLongestStreakDays,
    yearReadingSeconds,
    yearActiveDays,
    yearLongestStreakDays,
    monthlyBreakdown,
    currentStreakDays,
    longestStreakDays,
    days,
  };
}
