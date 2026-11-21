import type { ShelfGroup } from '@/types';
import { MAX_SHELF_NAME_LENGTH, apiFetch, assertApiConfigured, isCloudMode } from '@/lib/api';

const SHELF_PREFS_STORAGE_KEY = 'ofu-library-shelf-prefs-v1';

export interface ShelfPrefsState {
  covers: Record<string, string>;
  favorites: string[];
}

export function toShelfPrefKey(shelfName: string): string {
  return shelfName.trim().toLocaleLowerCase('vi');
}

export function readLocalShelfPrefs(): ShelfPrefsState {
  try {
    const raw = localStorage.getItem(SHELF_PREFS_STORAGE_KEY);
    if (!raw) return { covers: {}, favorites: [] };
    const parsed = JSON.parse(raw) as { covers?: unknown; favorites?: unknown };
    const covers: Record<string, string> = {};
    if (parsed?.covers && typeof parsed.covers === 'object' && !Array.isArray(parsed.covers)) {
      for (const [k, v] of Object.entries(parsed.covers as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string' && k && v) covers[k] = v;
      }
    }
    const favorites = Array.isArray(parsed?.favorites)
      ? Array.from(
          new Set(
            parsed.favorites
              .filter((k): k is string => typeof k === 'string' && Boolean(k.trim()))
              .map(toShelfPrefKey),
          ),
        )
      : [];
    return { covers, favorites };
  } catch {
    return { covers: {}, favorites: [] };
  }
}

export function writeLocalShelfPrefs(prefs: ShelfPrefsState): void {
  try {
    localStorage.setItem(SHELF_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore private-mode / quota errors
  }
}

export function patchShelfCover(
  prev: ShelfPrefsState,
  shelfName: string,
  bookId: string | null,
): ShelfPrefsState {
  const key = toShelfPrefKey(shelfName);
  if (!key) return prev;
  const covers = { ...prev.covers };
  if (bookId) covers[key] = bookId;
  else delete covers[key];
  return { ...prev, covers };
}

export function patchShelfFavorite(
  prev: ShelfPrefsState,
  shelfName: string,
  favorite: boolean,
): ShelfPrefsState {
  const key = toShelfPrefKey(shelfName);
  if (!key) return prev;
  const set = new Set(prev.favorites);
  if (favorite) set.add(key);
  else set.delete(key);
  return { ...prev, favorites: Array.from(set) };
}

export function renameShelfPrefs(
  prev: ShelfPrefsState,
  oldName: string,
  newName: string,
): ShelfPrefsState {
  const oldKey = toShelfPrefKey(oldName);
  const newKey = toShelfPrefKey(newName);
  if (!oldKey || !newKey || oldKey === newKey) return prev;

  const covers = { ...prev.covers };
  if (oldKey in covers) {
    if (!(newKey in covers)) covers[newKey] = covers[oldKey];
    delete covers[oldKey];
  }

  const favSet = new Set(prev.favorites);
  if (favSet.has(oldKey)) {
    favSet.delete(oldKey);
    favSet.add(newKey);
  }
  return { covers, favorites: Array.from(favSet) };
}

export function pruneDeletedBooksFromPrefs(
  prev: ShelfPrefsState,
  deletedBookIds: ReadonlySet<string>,
): ShelfPrefsState {
  let changed = false;
  const covers: Record<string, string> = {};
  for (const [k, bookId] of Object.entries(prev.covers)) {
    if (deletedBookIds.has(bookId)) changed = true;
    else covers[k] = bookId;
  }
  return changed ? { ...prev, covers } : prev;
}

export function sortShelvesFavoriteFirst(
  shelves: ShelfGroup[],
  favoriteKeys?: ReadonlySet<string>,
): ShelfGroup[] {
  if (!favoriteKeys || favoriteKeys.size === 0) return shelves;
  const favs: ShelfGroup[] = [];
  const rest: ShelfGroup[] = [];
  for (const shelf of shelves) {
    if (favoriteKeys.has(shelf.key)) favs.push(shelf);
    else rest.push(shelf);
  }
  return favs.length > 0 ? [...favs, ...rest] : shelves;
}

export async function setShelfCoverBook(
  shelfName: string,
  bookId: string | null,
): Promise<void> {
  assertApiConfigured();
  const trimmed = shelfName.trim();
  if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  writeLocalShelfPrefs(patchShelfCover(readLocalShelfPrefs(), trimmed, bookId));
  if (!isCloudMode) return;

  const res = await apiFetch('/api/shelves/cover', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, bookId }),
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể lưu ảnh bìa kệ.');
  }
}

export async function setShelfFavorite(
  shelfName: string,
  favorite: boolean,
): Promise<void> {
  assertApiConfigured();
  const trimmed = shelfName.trim();
  if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  writeLocalShelfPrefs(patchShelfFavorite(readLocalShelfPrefs(), trimmed, favorite));
  if (!isCloudMode) return;

  const res = await apiFetch('/api/shelves/favorite', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, favorite }),
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật trạng thái yêu thích của kệ.');
  }
}
