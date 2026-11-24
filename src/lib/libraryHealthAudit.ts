import type { Book, ShelfGroup } from '@/types';
import { isCloudMode } from '@/lib/api';
import { getDisplayAuthor, groupBooksIntoShelves, isVolumeOrSubtitleSegment } from '@/lib/bookMetadata';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import { isKnownAuthor } from '@/lib/shelfPlacement';

const UNCLASSIFIED_KEY = 'kho chưa phân loại';

export interface IncompleteBookAuditItem {
  book: Book;
  missingAuthor: boolean;
  missingDescription: boolean;
}

export interface DuplicateShelfPairItem {
  shelfA: ShelfGroup;
  shelfB: ShelfGroup;
  reason: string;
}

export interface LibraryHealthReport {
  totalIssues: number;
  healthScore: number;
  missingGuestPack: Book[];
  missingCover: Book[];
  incompleteMetadata: IncompleteBookAuditItem[];
  untaggedShelves: ShelfGroup[];
  duplicateShelfPairs: DuplicateShelfPairItem[];
}

function toCompactShelfFingerprint(name: string): string {
  return normalizeSearchText(name)
    .replace(/\b(light novel|ln|web novel|wn|manga|tap|vol|volume)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function auditLibraryHealth(
  books: readonly Book[],
  shelfTags?: Readonly<Record<string, string[]>>,
): LibraryHealthReport {
  const missingGuestPack: Book[] = [];
  const missingCover: Book[] = [];
  const incompleteMetadata: IncompleteBookAuditItem[] = [];

  for (const book of books) {
    if (
      isCloudMode &&
      (book.file_type === 'epub' || book.file_type === 'docx') &&
      !book.guest_ready
    ) {
      missingGuestPack.push(book);
    }
    if (!book.cover_key) {
      missingCover.push(book);
    }

    const displayAuthor = getDisplayAuthor(book.author, book.title);
    const missingAuthor =
      !isKnownAuthor(displayAuthor) || isVolumeOrSubtitleSegment(displayAuthor);
    const missingDescription = !book.description?.trim();
    if (missingAuthor || missingDescription) {
      incompleteMetadata.push({ book, missingAuthor, missingDescription });
    }
  }

  const shelves = groupBooksIntoShelves([...books]);
  const untaggedShelves = shelves.filter(
    (shelf) =>
      shelf.key !== UNCLASSIFIED_KEY && (shelfTags?.[shelf.key]?.length ?? 0) === 0,
  );

  const duplicateShelfPairs: DuplicateShelfPairItem[] = [];
  const byFingerprint = new Map<string, ShelfGroup[]>();
  for (const shelf of shelves) {
    if (shelf.key === UNCLASSIFIED_KEY) continue;
    const fp = toCompactShelfFingerprint(shelf.name);
    if (fp.length < 4) continue;
    const arr = byFingerprint.get(fp) ?? [];
    arr.push(shelf);
    byFingerprint.set(fp, arr);
  }
  for (const group of byFingerprint.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i += 1) {
      duplicateShelfPairs.push({
        shelfA: group[i],
        shelfB: group[i + 1],
        reason: 'Trùng tên gốc không dấu / khác dấu câu hoặc hậu tố',
      });
    }
  }

  const totalIssues =
    missingGuestPack.length +
    missingCover.length +
    incompleteMetadata.length +
    untaggedShelves.length +
    duplicateShelfPairs.length;

  const denominator = Math.max(1, books.length * 3 + shelves.length);
  const weightedPenalty =
    missingGuestPack.length * 2 +
    missingCover.length * 1.5 +
    incompleteMetadata.length +
    untaggedShelves.length +
    duplicateShelfPairs.length * 2;
  const healthScore = Math.max(
    0,
    Math.min(100, Math.round((1 - weightedPenalty / denominator) * 100)),
  );

  return {
    totalIssues,
    healthScore,
    missingGuestPack,
    missingCover,
    incompleteMetadata,
    untaggedShelves,
    duplicateShelfPairs,
  };
}
