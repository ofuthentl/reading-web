import type { ReaderSettings } from '@/types';
import { apiFetch, isCloudMode } from '@/lib/authSession';
import { normalizeReaderSettings, saveReaderSettings } from '@/lib/readerConfig';

const SYNC_DEBOUNCE_MS = 1200;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSettings: ReaderSettings | null = null;

export async function fetchRemoteReaderSettings(
  fallbackTheme?: ReaderSettings['theme'],
): Promise<ReaderSettings | null> {
  if (!isCloudMode) return null;
  const res = await apiFetch('/api/reader-settings');
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    settings?: Partial<ReaderSettings> | null;
  };
  if (!data.settings || typeof data.settings !== 'object') return null;
  return normalizeReaderSettings(data.settings, fallbackTheme);
}

async function flushRemoteReaderSettings(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  const snapshot = pendingSettings;
  pendingSettings = null;
  if (!snapshot || !isCloudMode) return;
  try {
    const res = await apiFetch('/api/reader-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: snapshot }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        settings?: Partial<ReaderSettings>;
      };
      if (data.settings) {
        saveReaderSettings(normalizeReaderSettings(data.settings, snapshot.theme));
      }
    }
  } catch {
    // Non-fatal: localStorage đã lưu tức thì trên thiết bị hiện tại
  }
}

export function scheduleRemoteReaderSettingsSync(next: ReaderSettings): void {
  if (!isCloudMode) return;
  pendingSettings = next;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void flushRemoteReaderSettings();
  }, SYNC_DEBOUNCE_MS);
}
