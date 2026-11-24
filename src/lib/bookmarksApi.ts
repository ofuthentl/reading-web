import type { BookBookmark, GuestBookSearchMatch } from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';

const LOCAL_BOOKMARKS_KEY = 'ofu-local-bookmarks-v1';

function readAllLocalBookmarks(): Record<string, BookBookmark[]> {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKMARKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BookBookmark[]>) : {};
  } catch {
    return {};
  }
}

function writeAllLocalBookmarks(next: Record<string, BookBookmark[]>): void {
  try {
    localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors in private mode
  }
}

export interface CreateBookmarkInput {
  chapterId: string;
  chapterIndex: number;
  chapterTitle?: string;
  scrollRatio: number;
  label?: string;
  note?: string | null;
}

export async function fetchBookBookmarks(
  bookId: string,
  signal?: AbortSignal,
): Promise<BookBookmark[]> {
  assertApiConfigured();
  if (!isCloudMode) {
    const all = readAllLocalBookmarks();
    return all[bookId] ?? [];
  }

  const res = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/bookmarks`, { signal });
  const data = (await res.json().catch(() => ({}))) as {
    bookmarks?: BookBookmark[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải danh sách dấu trang.');
  }
  return Array.isArray(data.bookmarks) ? data.bookmarks : [];
}

export async function addBookBookmark(
  bookId: string,
  input: CreateBookmarkInput,
): Promise<BookBookmark> {
  assertApiConfigured();
  if (!isCloudMode) {
    const all = readAllLocalBookmarks();
    const current = all[bookId] ?? [];
    if (current.length >= 30) {
      throw new Error('Mỗi cuốn sách lưu tối đa 30 dấu trang. Hãy xoá bớt dấu trang cũ.');
    }
    const defaultLabel = `${input.chapterTitle || `Phần ${input.chapterIndex + 1}`} · ${Math.round(
      input.scrollRatio * 100,
    )}%`;
    const created: BookBookmark = {
      id: `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      bookId,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      ...(input.chapterTitle ? { chapterTitle: input.chapterTitle } : {}),
      scrollRatio: input.scrollRatio,
      label: input.label?.trim() || defaultLabel,
      note: input.note?.trim() || null,
      createdAt: Date.now(),
    };
    all[bookId] = [created, ...current];
    writeAllLocalBookmarks(all);
    return created;
  }

  const res = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    bookmark?: BookBookmark;
    error?: string;
  };
  if (!res.ok || !data.bookmark) {
    throw new Error(data.error || 'Không thể lưu dấu trang.');
  }
  return data.bookmark;
}

export async function removeBookBookmark(bookId: string, bookmarkId: string): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode) {
    const all = readAllLocalBookmarks();
    all[bookId] = (all[bookId] ?? []).filter((item) => item.id !== bookmarkId);
    writeAllLocalBookmarks(all);
    return;
  }

  const res = await apiFetch(
    `/api/books/${encodeURIComponent(bookId)}/bookmarks/${encodeURIComponent(bookmarkId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xoá dấu trang.');
  }
}

export async function searchGuestBookChaptersApi(
  bookId: string,
  query: string,
  signal?: AbortSignal,
): Promise<GuestBookSearchMatch[]> {
  assertApiConfigured();
  const q = query.trim();
  if (q.length < 2 || !isCloudMode) return [];

  const res = await apiFetch(
    `/api/guest/books/${encodeURIComponent(bookId)}/search?q=${encodeURIComponent(q)}`,
    { signal },
  );
  const data = (await res.json().catch(() => ({}))) as {
    matches?: GuestBookSearchMatch[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tìm kiếm trong sách.');
  }
  return Array.isArray(data.matches) ? data.matches : [];
}
