import type {
  Book,
  BookAccessSummary,
  CustomCollection,
  ShelfRatingSummary,
  ShelfRelation,
  StorageStats,
} from '@/types';
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

function makeUndirectedPairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

export function upsertShelfRelationItem(
  prev: readonly ShelfRelation[],
  incoming: ShelfRelation,
): ShelfRelation[] {
  const pairKey = makeUndirectedPairKey(incoming.sourceShelfKey, incoming.targetShelfKey);
  const filtered = prev.filter(
    (item) => makeUndirectedPairKey(item.sourceShelfKey, item.targetShelfKey) !== pairKey,
  );
  return [...filtered, incoming];
}

export function removeShelfRelationPair(
  prev: readonly ShelfRelation[],
  shelfAKey: string,
  shelfBKey: string,
): ShelfRelation[] {
  const pairKey = makeUndirectedPairKey(shelfAKey, shelfBKey);
  return prev.filter(
    (item) => makeUndirectedPairKey(item.sourceShelfKey, item.targetShelfKey) !== pairKey,
  );
}

export function mergeShelfRelationsOnRename(
  prev: readonly ShelfRelation[],
  oldKey: string,
  newKey: string,
): ShelfRelation[] {
  if (!oldKey || !newKey || oldKey === newKey || prev.length === 0) return [...prev];
  const byPair = new Map<string, ShelfRelation>();
  for (const item of prev) {
    const src = item.sourceShelfKey === oldKey ? newKey : item.sourceShelfKey;
    const dst = item.targetShelfKey === oldKey ? newKey : item.targetShelfKey;
    if (!src || !dst || src === dst) continue;
    const pk = makeUndirectedPairKey(src, dst);
    const existing = byPair.get(pk);
    const candidate: ShelfRelation = {
      sourceShelfKey: src,
      targetShelfKey: dst,
      relationType: item.relationType,
      createdAt: item.createdAt,
    };
    if (!existing || candidate.createdAt >= existing.createdAt) {
      byPair.set(pk, candidate);
    }
  }
  return Array.from(byPair.values());
}

export function pruneOrphanShelfRelations(
  prev: readonly ShelfRelation[],
  remainingBooks: readonly Book[],
): ShelfRelation[] {
  if (prev.length === 0) return [];
  const aliveShelfKeys = new Set(
    remainingBooks.map((b) => toShelfPrefKey(b.shelf || 'Kho chưa phân loại')),
  );
  return prev.filter(
    (item) => aliveShelfKeys.has(item.sourceShelfKey) && aliveShelfKeys.has(item.targetShelfKey),
  );
}

export function pruneDeletedBookAccess(
  prev: Record<string, BookAccessSummary>,
  deletedIds: ReadonlySet<string>,
): Record<string, BookAccessSummary> {
  let changed = false;
  const next: Record<string, BookAccessSummary> = {};
  for (const [id, summary] of Object.entries(prev)) {
    if (deletedIds.has(id)) changed = true;
    else next[id] = summary;
  }
  return changed ? next : prev;
}

export function mergeUploadStorageStats(
  prev: StorageStats | null,
  incoming: StorageStats,
): StorageStats {
  if (!prev) return incoming;
  const usedBytes = Math.max(prev.usedBytes, incoming.usedBytes);
  const limitBytes = incoming.limitBytes || prev.limitBytes;
  const bookCount = Math.max(prev.bookCount, incoming.bookCount);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    bookCount,
  };
}

export function getAliveShelfKeys(books: readonly Book[]): Set<string> {
  return new Set(books.map((b) => toShelfPrefKey(b.shelf || 'Kho chưa phân loại')));
}

export function pruneOrphanPlanToReadShelves(
  prev: Set<string>,
  aliveShelfKeys: ReadonlySet<string>,
): Set<string> {
  let changed = false;
  const next = new Set<string>();
  for (const k of prev) {
    if (aliveShelfKeys.has(k)) next.add(k);
    else changed = true;
  }
  return changed ? next : prev;
}

export function pruneOrphanCollectionShelves(
  prev: CustomCollection[],
  aliveShelfKeys: ReadonlySet<string>,
): CustomCollection[] {
  let changed = false;
  const next = prev.map((col) => {
    const filtered = col.shelfKeys.filter((k) => aliveShelfKeys.has(toShelfPrefKey(k)));
    if (filtered.length !== col.shelfKeys.length) {
      changed = true;
      return { ...col, shelfKeys: filtered };
    }
    return col;
  });
  return changed ? next : prev;
}
