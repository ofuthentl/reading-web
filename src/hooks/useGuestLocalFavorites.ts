import { useCallback, useMemo, useState } from 'react';
import { toShelfPrefKey } from '@/lib/shelfPrefs';

const GUEST_FAVORITES_STORAGE_KEY = 'ofu-guest-favorite-shelves-v1';

function readStoredGuestFavorites(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === 'string')
          .map(toShelfPrefKey)
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

function writeStoredGuestFavorites(keys: string[]): void {
  try {
    localStorage.setItem(GUEST_FAVORITES_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/**
 * Lưu trữ danh sách kệ yêu thích cục bộ trên trình duyệt cho phiên Bạn bè (`guest`, D-029),
 * không gọi API sửa bảng `shelf_prefs` dùng chung của Admin.
 */
export function useGuestLocalFavorites() {
  const [favoriteList, setFavoriteList] = useState<string[]>(readStoredGuestFavorites);

  const guestFavoriteKeys = useMemo(() => new Set(favoriteList), [favoriteList]);

  const toggleGuestFavorite = useCallback((shelfName: string, nextFavorite: boolean) => {
    const key = toShelfPrefKey(shelfName);
    if (!key) return;
    setFavoriteList((prev) => {
      const set = new Set(prev);
      if (nextFavorite) set.add(key);
      else set.delete(key);
      const next = Array.from(set);
      writeStoredGuestFavorites(next);
      return next;
    });
  }, []);

  const syncRenamedGuestFavorite = useCallback((oldName: string, newName: string) => {
    const oldKey = toShelfPrefKey(oldName);
    const newKey = toShelfPrefKey(newName);
    if (!oldKey || !newKey || oldKey === newKey) return;
    setFavoriteList((prev) => {
      if (!prev.includes(oldKey)) return prev;
      const next = Array.from(new Set(prev.map((k) => (k === oldKey ? newKey : k))));
      writeStoredGuestFavorites(next);
      return next;
    });
  }, []);

  return {
    guestFavoriteKeys,
    toggleGuestFavorite,
    syncRenamedGuestFavorite,
  };
}
