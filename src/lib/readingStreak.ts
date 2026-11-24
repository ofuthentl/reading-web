import type { ReadingProgress } from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';

const LOCAL_DAILY_READING_KEY = 'ofu-local-daily-reading-v1';
const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;

export interface ReadingActivityDay {
  dayKey: string;
  readingSeconds: number;
  active: boolean;
}

export interface MonthlyReadingPoint {
  monthKey: string;
  readingSeconds: number;
  activeDays: number;
}

export interface ReaderActivityReport {
  generatedAt: number;
  timezone: string;
  windowDays: number;
  totalReadingSeconds: number;
  readingSeconds90d: number;
  activeDays90d: number;
  monthReadingSeconds?: number;
  monthActiveDays?: number;
  monthLongestStreakDays?: number;
  yearReadingSeconds?: number;
  yearActiveDays?: number;
  yearLongestStreakDays?: number;
  monthlyBreakdown?: MonthlyReadingPoint[];
  currentStreakDays: number;
  longestStreakDays: number;
  days: ReadingActivityDay[];
}

export function toVnDayKey(timestampMs: number): string {
  return new Date(timestampMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatReadingDuration(totalSeconds: number, compact = false): string {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  if (sec <= 0) return compact ? '0p' : 'Chưa ghi nhận';
  if (sec < 60) return compact ? '<1p' : '< 1 phút';
  const mins = Math.floor(sec / 60);
  if (mins < 60) return compact ? `${mins}p` : `${mins} phút`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (compact) return remMins > 0 ? `${hours}g ${remMins}p` : `${hours}g`;
  return remMins > 0 ? `${hours} giờ ${remMins} phút` : `${hours} giờ`;
}

export function getHeatmapIntensityLevel(day: ReadingActivityDay): 0 | 1 | 2 | 3 | 4 {
  if (!day.active && day.readingSeconds <= 0) return 0;
  if (day.readingSeconds >= 5400) return 4; // >= 90 phút
  if (day.readingSeconds >= 2700) return 3; // >= 45 phút
  if (day.readingSeconds >= 900) return 2; // >= 15 phút
  return 1; // < 15 phút hoặc có hoạt động đọc
}

function readLocalDailyMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_DAILY_READING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
        out[k] = Math.floor(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function recordLocalDailyReadingSeconds(deltaSec: number): void {
  if (!Number.isFinite(deltaSec) || deltaSec <= 0) return;
  try {
    const now = Date.now();
    const today = toVnDayKey(now);
    const cutoff = toVnDayKey(now - 95 * DAY_MS);
    const map = readLocalDailyMap();
    map[today] = (map[today] || 0) + Math.min(300, Math.floor(deltaSec));
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      if (k >= cutoff) pruned[k] = v;
    }
    localStorage.setItem(LOCAL_DAILY_READING_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage errors
  }
}

export function computeStreakFromDays(days: readonly ReadingActivityDay[]): {
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
  let current = 0;
  let idx = days.length - 1;
  if (idx >= 0 && !days[idx].active) idx -= 1;
  while (idx >= 0 && days[idx].active) {
    current += 1;
    idx -= 1;
  }
  return { currentStreakDays: current, longestStreakDays: longest };
}

export function buildLocalReaderActivityFallback(
  progress: Readonly<Record<string, ReadingProgress>>,
): ReaderActivityReport {
  const now = Date.now();
  const dailyMap = readLocalDailyMap();
  const activeDaySet = new Set<string>(Object.keys(dailyMap));
  let totalProgressSeconds = 0;

  for (const p of Object.values(progress)) {
    totalProgressSeconds += Math.max(0, Math.floor(p.readingSeconds ?? 0));
    if (p.updatedAt > 0) activeDaySet.add(toVnDayKey(p.updatedAt));
  }

  let readingSeconds90d = 0;
  let activeDays90d = 0;
  const days: ReadingActivityDay[] = [];

  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const dayKey = toVnDayKey(now - offset * DAY_MS);
    const readingSeconds = dailyMap[dayKey] || 0;
    const active = readingSeconds > 0 || activeDaySet.has(dayKey);
    readingSeconds90d += readingSeconds;
    if (active) activeDays90d += 1;
    days.push({ dayKey, readingSeconds, active });
  }

  const { currentStreakDays, longestStreakDays } = computeStreakFromDays(days);
  const currentMonth = toVnDayKey(now).slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);
  const monthDays = days.filter((d) => d.dayKey.startsWith(currentMonth));
  const yearDays = days.filter((d) => d.dayKey.startsWith(currentYear));
  const { longestStreakDays: monthLongestStreakDays } = computeStreakFromDays(monthDays);
  const { longestStreakDays: yearLongestStreakDays } = computeStreakFromDays(yearDays);
  let monthReadingSeconds = 0;
  let monthActiveDays = 0;
  for (const d of monthDays) {
    monthReadingSeconds += d.readingSeconds;
    if (d.active) monthActiveDays += 1;
  }
  const monthlyBreakdown: MonthlyReadingPoint[] = Array.from({ length: 12 }, (_, i) => {
    const mk = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
    let sec = 0;
    let act = 0;
    for (const d of days) {
      if (d.dayKey.startsWith(mk)) {
        sec += d.readingSeconds;
        if (d.active) act += 1;
      }
    }
    return { monthKey: mk, readingSeconds: sec, activeDays: act };
  });

  return {
    generatedAt: now,
    timezone: 'UTC+7',
    windowDays: WINDOW_DAYS,
    totalReadingSeconds: Math.max(totalProgressSeconds, readingSeconds90d),
    readingSeconds90d,
    activeDays90d,
    monthReadingSeconds,
    monthActiveDays,
    monthLongestStreakDays,
    yearReadingSeconds: readingSeconds90d,
    yearActiveDays: activeDays90d,
    yearLongestStreakDays,
    monthlyBreakdown,
    currentStreakDays,
    longestStreakDays,
    days,
  };
}

export async function fetchReaderActivityStats(
  progressFallback: Readonly<Record<string, ReadingProgress>>,
  signal?: AbortSignal,
): Promise<ReaderActivityReport> {
  assertApiConfigured();
  if (!isCloudMode) {
    return buildLocalReaderActivityFallback(progressFallback);
  }
  const res = await apiFetch('/api/reading-stats/activity', { signal });
  const data = (await res.json().catch(() => ({}))) as Partial<ReaderActivityReport>;
  if (!res.ok || !Array.isArray(data.days)) {
    return buildLocalReaderActivityFallback(progressFallback);
  }
  return data as ReaderActivityReport;
}
