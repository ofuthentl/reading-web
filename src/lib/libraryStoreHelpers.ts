import type { Book, CustomCollection, ShelfRatingSummary } from '@/types';
import { toShelfPrefKey } from '@/lib/shelfPrefs';

export type IdleWindow = Window & { requestIdleCallback?: (cb: () => void) => number };
type NetworkNavigator = Navigator & { connection?: { saveData?: boolean } };

export function canPreloadOnIdle(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as NetworkNavigator) : undefined;
  return nav?.onLine !== false && nav?.connection?.saveData !== true;
}

export function sortCollectionsList(items: CustomCollection[]): CustomCollection[] {
  return [...items].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.createdAt - b.createdAt,
  );
}

export function toggleSetValue(prev: Set<string>, value: string, include: boolean): Set<string> {
  const next = new Set(prev);
  if (include) next.add(value);
  else next.delete(value);
  return next;
}

export function bumpKeyVersion(map: Map<string, number>, key: string): number {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

export function mergeBookPreservingFlags(prev: Book, updated: Book): Book {
  return {
    ...updated,
    ...(typeof updated.guest_ready === 'boolean'
      ? {}
      : typeof prev.guest_ready === 'boolean'
        ? { guest_ready: prev.guest_ready }
        : {}),
    ...(typeof updated.guest_locked === 'boolean'
      ? {}
      : typeof prev.guest_locked === 'boolean'
        ? { guest_locked: prev.guest_locked }
        : {}),
  };
}

export function mergeShelfRatingsOnRename(
  prev: Record<string, ShelfRatingSummary>,
  oldKey: string,
  newKey: string,
): Record<string, ShelfRatingSummary> {
  if (!oldKey || !newKey || oldKey === newKey || !prev[oldKey]) return prev;
  const next = { ...prev };
  if (!next[newKey]) {
    next[newKey] = next[oldKey];
  } else {
    const total = next[oldKey].count + next[newKey].count;
    next[newKey] = {
      average:
        Math.round(
          ((next[oldKey].average * next[oldKey].count +
            next[newKey].average * next[newKey].count) /
            total) *
            10,
        ) / 10,
      count: total,
    };
  }
  delete next[oldKey];
  return next;
}

export function pruneOrphanShelfRatings(
  prevRatings: Record<string, ShelfRatingSummary>,
  remainingBooks: readonly Book[],
): Record<string, ShelfRatingSummary> {
  const aliveShelfKeys = new Set(
    remainingBooks.map((b) => toShelfPrefKey(b.shelf || 'Kho chưa phân loại')),
  );
  let changed = false;
  const nextRatings: Record<string, ShelfRatingSummary> = {};
  for (const [k, v] of Object.entries(prevRatings)) {
    if (aliveShelfKeys.has(k)) nextRatings[k] = v;
    else changed = true;
  }
  return changed ? nextRatings : prevRatings;
}
