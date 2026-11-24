/**
 * Tự học tốc độ đọc cá nhân (C13 Adaptive WPM — chỉ import trong chunk trình đọc, 0 B entry).
 * Dùng trung bình trượt hàm mũ (EMA alpha = 0.25), khởi tạo 220 WPM, kẹp trong [120, 450] WPM.
 */

export const READING_WPM_STORAGE_KEY = 'ofu-library-reading-wpm-v1';
export const DEFAULT_ADAPTIVE_WPM = 220;
export const MIN_ADAPTIVE_WPM = 120;
export const MAX_ADAPTIVE_WPM = 450;

const EMA_ALPHA = 0.25;
const MIN_SAMPLE_WORDS = 80;
const MIN_SAMPLE_SECONDS = 15;
const MIN_VALID_SAMPLE_WPM = 60;
const MAX_VALID_SAMPLE_WPM = 600;

export interface LearnedWpmSnapshot {
  wpm: number;
  sampleCount: number;
}

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const fn of listeners) {
    fn();
  }
}

function clampAdaptiveWpm(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_ADAPTIVE_WPM;
  return Math.min(MAX_ADAPTIVE_WPM, Math.max(MIN_ADAPTIVE_WPM, Math.round(raw)));
}

export function readLearnedWpm(): LearnedWpmSnapshot {
  try {
    const raw = localStorage.getItem(READING_WPM_STORAGE_KEY);
    if (!raw) return { wpm: DEFAULT_ADAPTIVE_WPM, sampleCount: 0 };
    const parsed = JSON.parse(raw) as { wpm?: unknown; sampleCount?: unknown };
    const wpm =
      typeof parsed?.wpm === 'number' ? clampAdaptiveWpm(parsed.wpm) : DEFAULT_ADAPTIVE_WPM;
    const sampleCount =
      typeof parsed?.sampleCount === 'number' &&
      Number.isFinite(parsed.sampleCount) &&
      parsed.sampleCount > 0
        ? Math.floor(parsed.sampleCount)
        : 0;
    return { wpm, sampleCount };
  } catch {
    return { wpm: DEFAULT_ADAPTIVE_WPM, sampleCount: 0 };
  }
}

export function recordReadingSpeedSample(wordsRead: number, activeSec: number): number | null {
  if (!Number.isFinite(wordsRead) || !Number.isFinite(activeSec)) return null;
  if (wordsRead < MIN_SAMPLE_WORDS || activeSec < MIN_SAMPLE_SECONDS) return null;

  const sampleWpm = (wordsRead / activeSec) * 60;
  if (sampleWpm < MIN_VALID_SAMPLE_WPM || sampleWpm > MAX_VALID_SAMPLE_WPM) return null;

  const current = readLearnedWpm();
  const nextWpm = clampAdaptiveWpm(current.wpm * (1 - EMA_ALPHA) + sampleWpm * EMA_ALPHA);
  const nextSnapshot: LearnedWpmSnapshot = {
    wpm: nextWpm,
    sampleCount: current.sampleCount + 1,
  };

  try {
    localStorage.setItem(READING_WPM_STORAGE_KEY, JSON.stringify(nextSnapshot));
  } catch {
    // Ignore storage quota / private browsing errors
  }
  notifyListeners();
  return nextWpm;
}

export function resetLearnedWpm(): number {
  try {
    localStorage.removeItem(READING_WPM_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  notifyListeners();
  return DEFAULT_ADAPTIVE_WPM;
}

export function subscribeLearnedWpm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
