import type { ShelfAccessSummary, ShelfGroup } from '@/types';
import { MAX_SHELF_NAME_LENGTH, apiFetch, assertApiConfigured, isCloudMode } from '@/lib/api';

const SHELF_PREFS_STORAGE_KEY = 'ofu-library-shelf-prefs-v1';

export interface ShelfPrefsState {
  covers: Record<string, string>;
  favorites: string[];
  tags?: Record<string, string[]>;
  altTitles?: Record<string, string[]>;
  access?: Record<string, ShelfAccessSummary>;
}

export function normalizeClientShelfTags(rawTags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawTags) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().replace(/\s+/g, ' ').slice(0, 40).trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeClientAltTitles(rawTitles: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawTitles) {
    if (typeof raw !== 'string') continue;
    const clean = raw.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 180).trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 15) break;
  }
  return out;
}

export function toShelfPrefKey(shelfName: string): string {
  return shelfName.normalize('NFC').trim().toLocaleLowerCase('vi');
}

export function readLocalShelfPrefs(): ShelfPrefsState {
  try {
    const raw = localStorage.getItem(SHELF_PREFS_STORAGE_KEY);
    if (!raw) return { covers: {}, favorites: [] };
    const parsed = JSON.parse(raw) as {
      covers?: unknown;
      favorites?: unknown;
      tags?: unknown;
      altTitles?: unknown;
      access?: unknown;
    };
    const covers: Record<string, string> = {};
    if (parsed?.covers && typeof parsed.covers === 'object' && !Array.isArray(parsed.covers)) {
      for (const [k, v] of Object.entries(parsed.covers as Record<string, unknown>)) {
        const normKey = typeof k === 'string' ? toShelfPrefKey(k) : '';
        if (normKey && typeof v === 'string' && v) covers[normKey] = v;
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
    const tags: Record<string, string[]> = {};
    if (parsed?.tags && typeof parsed.tags === 'object' && !Array.isArray(parsed.tags)) {
      for (const [k, v] of Object.entries(parsed.tags as Record<string, unknown>)) {
        if (typeof k !== 'string' || !k.trim() || !Array.isArray(v)) continue;
        const normalized = normalizeClientShelfTags(
          v.filter((item): item is string => typeof item === 'string'),
        );
        if (normalized.length > 0) tags[toShelfPrefKey(k)] = normalized;
      }
    }
    const altTitles: Record<string, string[]> = {};
    if (
      parsed?.altTitles &&
      typeof parsed.altTitles === 'object' &&
      !Array.isArray(parsed.altTitles)
    ) {
      for (const [k, v] of Object.entries(parsed.altTitles as Record<string, unknown>)) {
        if (typeof k !== 'string' || !k.trim() || !Array.isArray(v)) continue;
        const normalized = normalizeClientAltTitles(
          v.filter((item): item is string => typeof item === 'string'),
        );
        if (normalized.length > 0) altTitles[toShelfPrefKey(k)] = normalized;
      }
    }
    const access: Record<string, ShelfAccessSummary> = {};
    if (parsed?.access && typeof parsed.access === 'object' && !Array.isArray(parsed.access)) {
      for (const [k, v] of Object.entries(parsed.access as Record<string, unknown>)) {
        const normKey = typeof k === 'string' ? toShelfPrefKey(k) : '';
        if (!normKey || !v || typeof v !== 'object') continue;
        const entry = v as { mode?: unknown; allowedCount?: unknown };
        if (entry.mode === 'restricted') {
          access[normKey] = {
            mode: 'restricted',
            allowedCount: Math.max(0, Number(entry.allowedCount) || 0),
          };
        }
      }
    }
    return {
      covers,
      favorites,
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
      ...(Object.keys(altTitles).length > 0 ? { altTitles } : {}),
      ...(Object.keys(access).length > 0 ? { access } : {}),
    };
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

  let tags = prev.tags;
  if (tags && oldKey in tags) {
    const nextTags = { ...tags };
    const merged = normalizeClientShelfTags([...(nextTags[newKey] || []), ...(nextTags[oldKey] || [])]);
    if (merged.length > 0) nextTags[newKey] = merged;
    delete nextTags[oldKey];
    tags = nextTags;
  }

  let altTitles = prev.altTitles;
  if (altTitles && oldKey in altTitles) {
    const nextAlt = { ...altTitles };
    const merged = normalizeClientAltTitles([
      ...(nextAlt[newKey] || []),
      ...(nextAlt[oldKey] || []),
    ]);
    if (merged.length > 0) nextAlt[newKey] = merged;
    else delete nextAlt[newKey];
    delete nextAlt[oldKey];
    altTitles = nextAlt;
  }

  let access = prev.access;
  if (access && oldKey in access) {
    const nextAccess = { ...access };
    const prevDest = nextAccess[newKey];
    const src = nextAccess[oldKey];
    nextAccess[newKey] = {
      mode: 'restricted',
      allowedCount: Math.max(prevDest?.allowedCount ?? 0, src.allowedCount),
    };
    delete nextAccess[oldKey];
    access = nextAccess;
  }

  return {
    covers,
    favorites: Array.from(favSet),
    ...(tags ? { tags } : {}),
    ...(altTitles ? { altTitles } : {}),
    ...(access ? { access } : {}),
  };
}

export function patchShelfTags(
  prev: ShelfPrefsState,
  shelfName: string,
  rawTags: readonly string[],
): ShelfPrefsState {
  const key = toShelfPrefKey(shelfName);
  if (!key) return prev;
  const normalized = normalizeClientShelfTags(rawTags);
  const nextTags = { ...(prev.tags || {}) };
  if (normalized.length > 0) nextTags[key] = normalized;
  else delete nextTags[key];
  return { ...prev, tags: nextTags };
}

export function patchShelfAltTitles(
  prev: ShelfPrefsState,
  shelfName: string,
  rawAltTitles: readonly string[],
): ShelfPrefsState {
  const key = toShelfPrefKey(shelfName);
  if (!key) return prev;
  const normalized = normalizeClientAltTitles(rawAltTitles);
  const nextAlt = { ...(prev.altTitles || {}) };
  if (normalized.length > 0) nextAlt[key] = normalized;
  else delete nextAlt[key];
  return { ...prev, altTitles: nextAlt };
}

export function patchShelfAccessSummary(
  prev: ShelfPrefsState,
  shelfName: string,
  summary: ShelfAccessSummary | null,
): ShelfPrefsState {
  const key = toShelfPrefKey(shelfName);
  if (!key) return prev;
  const nextAccess = { ...(prev.access || {}) };
  if (summary) nextAccess[key] = summary;
  else delete nextAccess[key];
  return { ...prev, access: nextAccess };
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

export function pruneMovedBooksFromShelfCovers(
  prev: ShelfPrefsState,
  movedBookIds: ReadonlySet<string>,
  targetShelfName: string,
): ShelfPrefsState {
  const targetKey = toShelfPrefKey(targetShelfName);
  let changed = false;
  const covers: Record<string, string> = {};
  for (const [shelfKey, bookId] of Object.entries(prev.covers)) {
    if (movedBookIds.has(bookId) && shelfKey !== targetKey) {
      changed = true;
    } else {
      covers[shelfKey] = bookId;
    }
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
  if (!isCloudMode) {
    writeLocalShelfPrefs(patchShelfCover(readLocalShelfPrefs(), trimmed, bookId));
    return;
  }

  const res = await apiFetch('/api/shelves/cover', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, bookId }),
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể lưu ảnh bìa kệ.');
  }
  writeLocalShelfPrefs(patchShelfCover(readLocalShelfPrefs(), trimmed, bookId));
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
  if (!isCloudMode) {
    writeLocalShelfPrefs(patchShelfFavorite(readLocalShelfPrefs(), trimmed, favorite));
    return;
  }

  const res = await apiFetch('/api/shelves/favorite', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, favorite }),
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật trạng thái yêu thích của kệ.');
  }
  writeLocalShelfPrefs(patchShelfFavorite(readLocalShelfPrefs(), trimmed, favorite));
}
