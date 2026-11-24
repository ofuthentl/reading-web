import type { AuthRole, ShelfRelation, ShelfRelationType } from '@/types';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import type { ShelfSummary } from '@/lib/shelfSummary';

const UNCLASSIFIED_SHELF_KEY = 'kho chưa phân loại';

export interface LinkedShelfDisplayItem {
  summary: ShelfSummary;
  relationType: ShelfRelationType;
  badgeLabel: string;
}

export interface RecommendedShelfItem {
  summary: ShelfSummary;
  score: number;
  reasonLabel: string;
}

export function getBidirectionalRelationLabel(
  relation: ShelfRelation,
  perspectiveShelfKey: string,
): string {
  const isOutgoing = relation.sourceShelfKey === perspectiveShelfKey;
  if (relation.relationType === 'sequel') {
    return isOutgoing ? 'Phần tiếp theo' : 'Phần trước';
  }
  if (relation.relationType === 'spinoff') {
    return isOutgoing ? 'Ngoại truyện / Spin-off' : 'Tuyến chính';
  }
  return 'Cùng vũ trụ';
}

export function resolveShelfLinkedItems(
  currentShelfKey: string,
  allSummaries: readonly ShelfSummary[],
  shelfRelations: readonly ShelfRelation[],
  sessionRole: AuthRole = 'owner',
): LinkedShelfDisplayItem[] {
  if (!currentShelfKey || shelfRelations.length === 0) return [];
  const byKey = new Map(allSummaries.map((s) => [s.shelf.key, s]));
  const items: LinkedShelfDisplayItem[] = [];

  for (const rel of shelfRelations) {
    if (rel.sourceShelfKey !== currentShelfKey && rel.targetShelfKey !== currentShelfKey) {
      continue;
    }
    const otherKey =
      rel.sourceShelfKey === currentShelfKey ? rel.targetShelfKey : rel.sourceShelfKey;
    const otherSummary = byKey.get(otherKey);
    if (!otherSummary) continue;
    // Tuân thủ D-030: khách không được thấy liên kết trỏ sang bộ đang bị khoá hoàn toàn
    if (sessionRole === 'guest' && otherSummary.isGuestLocked) continue;

    items.push({
      summary: otherSummary,
      relationType: rel.relationType,
      badgeLabel: getBidirectionalRelationLabel(rel, currentShelfKey),
    });
  }

  const orderWeight = (label: string): number => {
    if (label === 'Phần trước') return 1;
    if (label === 'Tuyến chính') return 2;
    if (label === 'Phần tiếp theo') return 3;
    if (label === 'Ngoại truyện / Spin-off') return 4;
    return 5;
  };

  return items.sort(
    (a, b) =>
      orderWeight(a.badgeLabel) - orderWeight(b.badgeLabel) ||
      a.summary.shelf.name.localeCompare(b.summary.shelf.name, 'vi'),
  );
}

export function computeSimilarShelves(
  currentSummary: ShelfSummary,
  allSummaries: readonly ShelfSummary[],
  shelfRelations: readonly ShelfRelation[],
  sessionRole: AuthRole = 'owner',
  limit = 6,
): RecommendedShelfItem[] {
  const currentKey = currentSummary.shelf.key;
  if (!currentKey || currentKey === UNCLASSIFIED_SHELF_KEY) return [];

  const linkedKeys = new Set<string>();
  for (const rel of shelfRelations) {
    if (rel.sourceShelfKey === currentKey) linkedKeys.add(rel.targetShelfKey);
    if (rel.targetShelfKey === currentKey) linkedKeys.add(rel.sourceShelfKey);
  }

  const authorNormMap = new Map<string, string>();
  for (const author of currentSummary.authors) {
    const norm = normalizeSearchText(author);
    if (norm) authorNormMap.set(norm, author);
  }

  const tagNormMap = new Map<string, string>();
  for (const tag of currentSummary.tags) {
    const norm = normalizeSearchText(tag);
    if (norm) tagNormMap.set(norm, tag);
  }

  if (authorNormMap.size === 0 && tagNormMap.size === 0) return [];

  const scored: RecommendedShelfItem[] = [];
  for (const candidate of allSummaries) {
    const candKey = candidate.shelf.key;
    if (
      candKey === currentKey ||
      candKey === UNCLASSIFIED_SHELF_KEY ||
      linkedKeys.has(candKey)
    ) {
      continue;
    }
    if (sessionRole === 'guest' && candidate.isGuestLocked) {
      continue;
    }

    const sharedAuthors: string[] = [];
    for (const author of candidate.authors) {
      const norm = normalizeSearchText(author);
      if (norm && authorNormMap.has(norm)) sharedAuthors.push(author);
    }

    const sharedTags: string[] = [];
    for (const tag of candidate.tags) {
      const norm = normalizeSearchText(tag);
      if (norm && tagNormMap.has(norm)) sharedTags.push(tag);
    }

    if (sharedAuthors.length === 0 && sharedTags.length === 0) continue;

    const baseScore = sharedAuthors.length * 6 + sharedTags.length * 3;
    const ratingTie = (candidate.ratingAverage ?? 0) * 0.25;
    const volumeTie = Math.min(1, candidate.bookCount * 0.04);
    const score = baseScore + ratingTie + volumeTie;

    let reasonLabel = '';
    if (sharedAuthors.length > 0 && sharedTags.length > 0) {
      reasonLabel = `Cùng tác giả · ${sharedTags.slice(0, 2).join(', ')}`;
    } else if (sharedAuthors.length > 0) {
      reasonLabel = `Cùng tác giả ${sharedAuthors[0]}`;
    } else {
      reasonLabel = `Chung gu: ${sharedTags.slice(0, 2).join(' · ')}`;
    }

    scored.push({ summary: candidate, score, reasonLabel });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.summary.shelf.name.localeCompare(b.summary.shelf.name, 'vi'),
    )
    .slice(0, limit);
}
