import type {
  Book,
  BookHighlight,
  GuestBlock,
  HighlightColor,
  HighlightLocator,
  LibraryHighlightItem,
} from '@/types';
import { apiFetch, isCloudMode } from '@/lib/authSession';
import type { CanvasLayoutItem } from '@/lib/guestCanvasLayout';

const LOCAL_HIGHLIGHTS_PREFIX = 'ofu-library-local-highlights:';

export const HIGHLIGHT_COLOR_OPTIONS: Array<{
  id: HighlightColor;
  label: string;
  shortLabel: string;
  swatchClass: string;
  badgeClass: string;
}> = [
  {
    id: 'amber',
    label: 'Vàng ấm',
    shortLabel: 'Vàng',
    swatchClass: 'bg-amber-400 border-amber-600/40',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    id: 'emerald',
    label: 'Xanh ngọc',
    shortLabel: 'Ngọc',
    swatchClass: 'bg-emerald-400 border-emerald-600/40',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'sky',
    label: 'Xanh sương',
    shortLabel: 'Lam',
    swatchClass: 'bg-sky-400 border-sky-600/40',
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  {
    id: 'rose',
    label: 'Hồng đào',
    shortLabel: 'Hồng',
    swatchClass: 'bg-rose-400 border-rose-600/40',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
];

function readLocalHighlights(bookId: string): BookHighlight[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_HIGHLIGHTS_PREFIX}${bookId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BookHighlight[]) : [];
  } catch {
    return [];
  }
}

function writeLocalHighlights(bookId: string, items: BookHighlight[]): void {
  try {
    const trimmed = items.length > 100 ? items.slice(items.length - 100) : items;
    localStorage.setItem(`${LOCAL_HIGHLIGHTS_PREFIX}${bookId}`, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

export function deleteAllLocalHighlightsForBook(bookId: string): void {
  try {
    localStorage.removeItem(`${LOCAL_HIGHLIGHTS_PREFIX}${bookId}`);
  } catch {
    // Ignore storage errors
  }
}

export async function fetchBookHighlights(
  bookId: string,
  signal?: AbortSignal,
): Promise<BookHighlight[]> {
  if (!isCloudMode) {
    return readLocalHighlights(bookId);
  }
  const res = await apiFetch(`/api/highlights?bookId=${encodeURIComponent(bookId)}`, { signal });
  const data = (await res.json().catch(() => ({}))) as {
    highlights?: BookHighlight[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải danh sách bôi màu của cuốn sách.');
  }
  return Array.isArray(data.highlights) ? data.highlights : [];
}

export async function fetchAllLibraryHighlights(
  books: readonly Book[],
  signal?: AbortSignal,
): Promise<LibraryHighlightItem[]> {
  if (!isCloudMode) {
    const all: LibraryHighlightItem[] = [];
    for (const b of books) {
      const list = readLocalHighlights(b.id);
      for (const hl of list) {
        all.push({
          ...hl,
          bookTitle: b.title,
          bookAuthor: b.author,
          shelf: b.shelf,
          coverKey: b.cover_key,
          coverColor: b.cover_color,
        });
      }
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  const res = await apiFetch('/api/highlights', { signal });
  const data = (await res.json().catch(() => ({}))) as {
    highlights?: LibraryHighlightItem[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải Kho trích dẫn.');
  }
  return Array.isArray(data.highlights) ? data.highlights : [];
}

export async function createBookHighlight(input: {
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle?: string;
  quoteText: string;
  note?: string | null;
  color: HighlightColor;
  locator?: HighlightLocator | null;
}): Promise<BookHighlight> {
  const cleanQuote = input.quoteText.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!isCloudMode) {
    const existing = readLocalHighlights(input.bookId);
    const created: BookHighlight = {
      id: `local_hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      bookId: input.bookId,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      chapterTitle: input.chapterTitle,
      quoteText: cleanQuote,
      note: input.note?.trim() || null,
      color: input.color,
      locator: input.locator ?? null,
      createdAt: Date.now(),
    };
    writeLocalHighlights(input.bookId, [...existing, created]);
    return created;
  }

  const res = await apiFetch('/api/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookId: input.bookId,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      chapterTitle: input.chapterTitle,
      quoteText: cleanQuote,
      note: input.note?.trim() || null,
      color: input.color,
      locator: input.locator ?? null,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    highlight?: BookHighlight;
    error?: string;
  };
  if (!res.ok || !data.highlight) {
    throw new Error(data.error || 'Không thể lưu đoạn trích dẫn.');
  }
  return data.highlight;
}

export async function updateBookHighlight(
  highlightId: string,
  bookId: string,
  patch: { color?: HighlightColor; note?: string | null },
): Promise<BookHighlight | null> {
  if (!isCloudMode) {
    const list = readLocalHighlights(bookId);
    let updatedItem: BookHighlight | null = null;
    const next = list.map((item) => {
      if (item.id !== highlightId) return item;
      updatedItem = {
        ...item,
        ...(patch.color ? { color: patch.color } : {}),
        ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      };
      return updatedItem;
    });
    writeLocalHighlights(bookId, next);
    return updatedItem;
  }

  const res = await apiFetch(`/api/highlights/${encodeURIComponent(highlightId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as {
    highlight?: BookHighlight;
    error?: string;
  };
  if (!res.ok || !data.highlight) {
    throw new Error(data.error || 'Không thể cập nhật trích dẫn.');
  }
  return data.highlight;
}

export async function deleteBookHighlight(highlightId: string, bookId: string): Promise<void> {
  if (!isCloudMode) {
    const next = readLocalHighlights(bookId).filter((item) => item.id !== highlightId);
    writeLocalHighlights(bookId, next);
    return;
  }
  const res = await apiFetch(`/api/highlights/${encodeURIComponent(highlightId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xoá trích dẫn.');
  }
}

export interface VisibleGuestParagraphOption {
  blockIndex: number;
  text: string;
  existingHighlight?: BookHighlight;
}

export function extractGuestBlockText(block: GuestBlock): string {
  if (block.kind === 'h' || block.kind === 'p' || block.kind === 'quote') {
    return block.spans.map((s) => s.t).join('').replace(/\s+/g, ' ').trim();
  }
  if (block.kind === 'list') {
    return block.items
      .map((it) => it.map((s) => s.t).join(''))
      .join(' · ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

export function collectVisibleGuestParagraphOptions(params: {
  blocks: readonly GuestBlock[] | undefined;
  visibleItems: readonly CanvasLayoutItem[];
  minY: number;
  maxY: number;
  chapterHighlights: readonly BookHighlight[];
}): VisibleGuestParagraphOption[] {
  const { blocks, visibleItems, minY, maxY, chapterHighlights } = params;
  if (!blocks || blocks.length === 0) return [];

  const seenBlockIndices = new Set<number>();
  for (const item of visibleItems) {
    if (item.kind !== 'text-line' || item.blockIndex === undefined) continue;
    if (item.y + item.height < minY || item.y > maxY) continue;
    seenBlockIndices.add(item.blockIndex);
  }

  if (seenBlockIndices.size === 0) {
    for (let i = 0; i < Math.min(8, blocks.length); i += 1) {
      seenBlockIndices.add(i);
    }
  }

  const options: VisibleGuestParagraphOption[] = [];
  for (const bIdx of Array.from(seenBlockIndices).sort((a, b) => a - b)) {
    const block = blocks[bIdx];
    if (!block) continue;
    const text = extractGuestBlockText(block);
    if (text.length < 4) continue;
    const existingHighlight = chapterHighlights.find((hl) => hl.locator?.blockIndex === bIdx);
    options.push({ blockIndex: bIdx, text: text.slice(0, 480), existingHighlight });
    if (options.length >= 12) break;
  }
  return options;
}
