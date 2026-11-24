import type {
  AuthRole,
  Book,
  CustomCollection,
  LibraryHighlightItem,
  ShelfGroup,
  ShelfRatingSummary,
} from '@/types';
import { getBookSortTitle, getDisplayAuthor } from '@/lib/bookMetadata';
import { normalizeSearchText } from '@/lib/libraryFiltering';

export type PaletteGroupKind =
  | 'shelves'
  | 'books'
  | 'authors'
  | 'collections'
  | 'quotes'
  | 'actions';

export interface PaletteActionSpec {
  id: string;
  title: string;
  subtitle: string;
  keywords: string;
  ownerOnly?: boolean;
  onTrigger: () => void;
}

export interface PaletteResultItem {
  id: string;
  group: PaletteGroupKind;
  title: string;
  subtitle: string;
  badge?: string;
  ratingText?: string;
  locked?: boolean;
  onSelect: () => void;
}

export const PALETTE_GROUP_LABELS: Record<PaletteGroupKind, string> = {
  shelves: 'Bộ truyện',
  books: 'Tập sách',
  authors: 'Tác giả',
  collections: 'Tuyển tập',
  quotes: 'Trích dẫn đã lưu',
  actions: 'Thao tác nhanh',
};

function scoreMatch(haystackNorm: string, queryNorm: string): number {
  if (!queryNorm) return 1;
  if (haystackNorm === queryNorm) return 100;
  if (haystackNorm.startsWith(queryNorm)) return 80;
  if (haystackNorm.includes(` ${queryNorm}`)) return 65;
  if (haystackNorm.includes(queryNorm)) return 45;
  const tokens = queryNorm.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => haystackNorm.includes(t))) return 30;
  return 0;
}

export function buildCommandPaletteResults(options: {
  query: string;
  sessionRole: AuthRole;
  shelves: readonly ShelfGroup[];
  books: readonly Book[];
  authors: readonly string[];
  collections: readonly CustomCollection[];
  highlights: readonly LibraryHighlightItem[];
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  shelfRatings?: Readonly<Record<string, ShelfRatingSummary>>;
  actions: readonly PaletteActionSpec[];
  onSelectShelf: (shelfKey: string) => void;
  onSelectBook: (book: Book) => void;
  onSelectAuthor: (author: string) => void;
  onSelectCollection: (collectionId: string) => void;
  onSelectHighlight: (hl: LibraryHighlightItem) => void;
}): PaletteResultItem[] {
  const {
    query, sessionRole, shelves, books, authors, collections, highlights,
    shelfAltTitles, shelfRatings, actions,
    onSelectShelf, onSelectBook, onSelectAuthor, onSelectCollection, onSelectHighlight,
  } = options;

  const q = normalizeSearchText(query);
  const isOwner = sessionRole === 'owner';
  const results: PaletteResultItem[] = [];

  // 1. Bộ truyện (khớp cả alt_titles Romaji / Anh / Nhật)
  const scoredShelves: Array<{ score: number; item: PaletteResultItem }> = [];
  for (const shelf of shelves) {
    const alts = shelfAltTitles?.[shelf.key] ?? [];
    const authorText = getDisplayAuthor(shelf.books[0]?.author || '', shelf.books[0]?.title);
    const shelfLocked =
      !isOwner && shelf.books.length > 0 && shelf.books.every((b) => Boolean(b.guest_locked));
    const rating = shelfRatings?.[shelf.key];

    const nameScore = scoreMatch(normalizeSearchText(shelf.name), q);
    let altBest = 0;
    let matchedAlt: string | null = null;
    for (const alt of alts) {
      const s = scoreMatch(normalizeSearchText(alt), q);
      if (s > altBest) {
        altBest = s;
        matchedAlt = alt;
      }
    }
    const authorScore = q ? Math.min(25, scoreMatch(normalizeSearchText(authorText), q)) : 0;
    const best = Math.max(nameScore, altBest ? altBest - 4 : 0, authorScore);
    if (q && best <= 0) continue;

    scoredShelves.push({
      score: best,
      item: {
        id: `shelf:${shelf.key}`,
        group: 'shelves',
        title: shelf.name,
        subtitle: matchedAlt && q ? `${matchedAlt} · ${authorText}` : authorText,
        badge: `${shelf.books.length} tập`,
        ratingText: rating && rating.count > 0 ? `★ ${rating.average.toFixed(1)}` : undefined,
        locked: shelfLocked,
        onSelect: () => onSelectShelf(shelf.key),
      },
    });
  }
  scoredShelves
    .sort((a, b) => b.score - a.score)
    .slice(0, q ? 6 : 4)
    .forEach((entry) => results.push(entry.item));

  // 2. Tập sách
  if (q) {
    const scoredBooks: Array<{ score: number; item: PaletteResultItem }> = [];
    for (const book of books) {
      const displayTitle = getBookSortTitle(book);
      const author = getDisplayAuthor(book.author, book.title);
      const s = Math.max(
        scoreMatch(normalizeSearchText(displayTitle), q),
        scoreMatch(normalizeSearchText(book.shelf || ''), q) - 10,
        scoreMatch(normalizeSearchText(author), q) - 12,
      );
      if (s <= 0) continue;
      const locked = !isOwner && Boolean(book.guest_locked);
      scoredBooks.push({
        score: s,
        item: {
          id: `book:${book.id}`,
          group: 'books',
          title: displayTitle,
          subtitle: `${book.shelf || 'Kho chưa phân loại'} · ${author}`,
          badge: book.file_type.toUpperCase(),
          locked,
          onSelect: () => onSelectBook(book),
        },
      });
    }
    scoredBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .forEach((entry) => results.push(entry.item));
  }

  // 3. Tác giả
  if (q) {
    const matchedAuthors = authors
      .map((author) => ({ author, score: scoreMatch(normalizeSearchText(author), q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    for (const { author } of matchedAuthors) {
      results.push({
        id: `author:${author}`,
        group: 'authors',
        title: author,
        subtitle: 'Lọc toàn bộ tác phẩm của tác giả này',
        onSelect: () => onSelectAuthor(author),
      });
    }
  }

  // 4. Tuyển tập
  const matchedCollections = collections
    .map((col) => ({
      col,
      score: q
        ? Math.max(
            scoreMatch(normalizeSearchText(col.name), q),
            scoreMatch(normalizeSearchText(col.description || ''), q) - 10,
          )
        : 1,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, q ? 4 : 2);
  for (const { col } of matchedCollections) {
    results.push({
      id: `collection:${col.id}`,
      group: 'collections',
      title: col.name,
      subtitle: col.description || 'Tuyển tập bộ truyện chọn lọc',
      badge: `${col.shelfKeys.length} bộ`,
      onSelect: () => onSelectCollection(col.id),
    });
  }

  // 5. Trích dẫn đã lưu
  if (highlights.length > 0) {
    const matchedQuotes = highlights
      .map((hl) => ({
        hl,
        score: q
          ? Math.max(
              scoreMatch(normalizeSearchText(hl.quoteText), q),
              scoreMatch(normalizeSearchText(hl.note || ''), q),
              scoreMatch(normalizeSearchText(hl.bookTitle), q) - 8,
            )
          : 1,
      }))
      .filter((x) => (q ? x.score > 0 : true))
      .slice(0, q ? 4 : 2);

    for (const { hl } of matchedQuotes) {
      const snippet = hl.quoteText.length > 88 ? `${hl.quoteText.slice(0, 88)}…` : hl.quoteText;
      results.push({
        id: `quote:${hl.id}`,
        group: 'quotes',
        title: `“${snippet}”`,
        subtitle: `${hl.bookTitle}${hl.chapterTitle ? ` · ${hl.chapterTitle}` : ''}`,
        onSelect: () => onSelectHighlight(hl),
      });
    }
  }

  // 6. Thao tác nhanh (ẩn lệnh Admin với guest)
  for (const act of actions) {
    if (act.ownerOnly && !isOwner) continue;
    const s = q
      ? Math.max(
          scoreMatch(normalizeSearchText(act.title), q),
          scoreMatch(normalizeSearchText(act.keywords), q),
        )
      : 1;
    if (q && s <= 0) continue;
    results.push({
      id: `action:${act.id}`,
      group: 'actions',
      title: act.title,
      subtitle: act.subtitle,
      onSelect: act.onTrigger,
    });
  }

  return results;
}
