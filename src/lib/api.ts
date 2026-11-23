import type {
  AuthRole,
  AuthSessionInfo,
  Book,
  CustomCollection,
  ReadingProgress,
  SaveProgressOptions,
  ShelfAccessSummary,
  StorageStats,
} from '@/types';
import {
  DEFAULT_OWNER_SESSION,
  apiFetch,
  assertApiConfigured,
  checkHealth,
  getActiveAuthSession,
  getAuthToken,
  isAuthError,
  isCloudMode,
  isLocalDevMode,
  isMissingProductionApi,
  loginWithPasscode,
  setAuthToken,
} from '@/lib/authSession';
import { formatBytes, groupBooksIntoShelves, sortBooksByTitle } from '@/lib/bookMetadata';
import {
  deleteLocalProgress,
  getAllLocalProgress,
  getCachedBookBlob,
  getCachedCoverBlob,
  getLocalBooks,
  putLocalProgress,
  setCachedBookBlob,
  setCachedCoverBlob,
} from '@/lib/cache';
import { type ShelfPrefsState, readLocalShelfPrefs, writeLocalShelfPrefs } from '@/lib/shelfPrefs';

export const HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GiB
export const MAX_SHELF_NAME_LENGTH = 120;

export {
  apiFetch,
  assertApiConfigured,
  checkHealth,
  formatBytes,
  getAuthToken,
  groupBooksIntoShelves,
  isAuthError,
  isCloudMode,
  isLocalDevMode,
  isMissingProductionApi,
  loginWithPasscode,
  setAuthToken,
  sortBooksByTitle,
};

export {
  bulkUpdateBooksShelf,
  deleteBooks,
  renameShelfAll,
  updateBookCover,
  updateBookMetadata,
  uploadBook,
} from '@/lib/apiAdminMutations';

export async function computeLocalStorageStats(books: Book[]): Promise<StorageStats> {
  const usedBytes = books.reduce((sum, b) => sum + (b.file_size || 0) + (b.cover_size || 0), 0);
  return {
    usedBytes,
    limitBytes: HARD_LIMIT_BYTES,
    remainingBytes: Math.max(0, HARD_LIMIT_BYTES - usedBytes),
    bookCount: books.length,
  };
}

function computeLocalWeeklyPopularIds(
  books: Book[],
  progress: Record<string, ReadingProgress>,
  limit = 10,
): string[] {
  const now = Date.now();
  const since7d = now - 7 * 86_400_000;
  const byCreatedDesc = [...books].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recent = books
    .filter((b) => (progress[b.id]?.updatedAt ?? 0) >= since7d)
    .sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of [...recent, ...byCreatedDesc]) {
    if (out.length >= limit) break;
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b.id);
  }
  return out;
}

export const LOCAL_PTR_STORAGE_KEY = 'ofu-library-local-ptr-v1';
export const LOCAL_PTR_BOOKS_STORAGE_KEY = 'ofu-library-local-ptr-books-v1';
export const LOCAL_COLLECTIONS_STORAGE_KEY = 'ofu-library-local-collections-v1';

function readLocalArraySafe<T>(storageKey: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function fetchLibraryState(): Promise<{
  books: Book[];
  progress: Record<string, ReadingProgress>;
  weeklyPopularIds: string[];
  shelfPrefs: ShelfPrefsState;
  planToReadShelves: string[];
  planToReadBooks: string[];
  collections: CustomCollection[];
  storage: StorageStats;
  session: AuthSessionInfo;
}> {
  assertApiConfigured();
  const localPrefs = readLocalShelfPrefs();
  if (!isCloudMode) {
    const [books, progress] = await Promise.all([getLocalBooks(), getAllLocalProgress()]);
    const sorted = sortBooksByTitle(books);
    const storage = await computeLocalStorageStats(sorted);
    return {
      books: sorted,
      progress,
      weeklyPopularIds: computeLocalWeeklyPopularIds(sorted, progress),
      shelfPrefs: localPrefs,
      planToReadShelves: readLocalArraySafe<string>(LOCAL_PTR_STORAGE_KEY),
      planToReadBooks: readLocalArraySafe<string>(LOCAL_PTR_BOOKS_STORAGE_KEY),
      collections: readLocalArraySafe<CustomCollection>(LOCAL_COLLECTIONS_STORAGE_KEY),
      storage,
      session: DEFAULT_OWNER_SESSION,
    };
  }

  const response = await apiFetch('/api/books');
  const data = (await response.json().catch(() => ({}))) as {
    books?: Book[];
    progress?: Record<string, ReadingProgress>;
    weeklyPopular?: string[];
    shelfCovers?: Record<string, string>;
    favoriteShelves?: string[];
    shelfTags?: Record<string, string[]>;
    shelfAltTitles?: Record<string, string[]>;
    planToReadShelves?: string[];
    planToReadBooks?: string[];
    collections?: CustomCollection[];
    shelfAccess?: Record<string, ShelfAccessSummary>;
    storage?: StorageStats;
    session?: { role?: AuthRole; expiresAt?: number | null; watermarkLabel?: string | null };
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || 'Không thể tải dữ liệu thư viện.');
  }
  const fallbackSession = getActiveAuthSession();
  const resolvedSession: AuthSessionInfo = {
    role:
      data.session?.role === 'owner'
        ? 'owner'
        : data.session?.role === 'guest'
          ? 'guest'
          : fallbackSession.role,
    expiresAt:
      typeof data.session?.expiresAt === 'number'
        ? data.session.expiresAt
        : fallbackSession.expiresAt,
    watermarkLabel:
      typeof data.session?.watermarkLabel === 'string'
        ? data.session.watermarkLabel
        : (fallbackSession.watermarkLabel ?? null),
  };
  const nextPrefs: ShelfPrefsState = {
    covers: data.shelfCovers ?? localPrefs.covers,
    favorites: data.favoriteShelves ?? localPrefs.favorites,
    tags: data.shelfTags ?? localPrefs.tags ?? {},
    altTitles: data.shelfAltTitles ?? localPrefs.altTitles ?? {},
    ...(data.shelfAccess ? { access: data.shelfAccess } : {}),
  };
  if (resolvedSession.role === 'owner') {
    writeLocalShelfPrefs(nextPrefs);
  }
  const sortedBooks = sortBooksByTitle(data.books || []);
  const progressMap = data.progress || {};
  const weeklyPopularIds = Array.isArray(data.weeklyPopular)
    ? data.weeklyPopular
    : computeLocalWeeklyPopularIds(sortedBooks, progressMap);
  return {
    books: sortedBooks,
    progress: progressMap,
    weeklyPopularIds,
    shelfPrefs: nextPrefs,
    planToReadShelves: Array.isArray(data.planToReadShelves) ? data.planToReadShelves : [],
    planToReadBooks: Array.isArray(data.planToReadBooks) ? data.planToReadBooks : [],
    collections: Array.isArray(data.collections) ? data.collections : [],
    storage: data.storage || {
      usedBytes: 0,
      limitBytes: HARD_LIMIT_BYTES,
      remainingBytes: HARD_LIMIT_BYTES,
      bookCount: 0,
    },
    session: resolvedSession,
  };
}

export async function fetchBookBlobCached(
  book: Book,
  options?: { cacheOnFetch?: boolean; signal?: AbortSignal },
): Promise<{ blob: Blob; fromCache: boolean }> {
  assertApiConfigured();
  if (isCloudMode && getActiveAuthSession().role !== 'owner') {
    throw new Error('Phiên khách không được phép tải tệp sách gốc.');
  }
  if (!book.file_key) {
    throw new Error('Đường dẫn tệp sách không khả dụng.');
  }
  const cached = await getCachedBookBlob(book.file_key);
  if (cached) return { blob: cached, fromCache: true };

  if (!isCloudMode) {
    throw new Error('Không tìm thấy tệp sách trong bộ nhớ cục bộ.');
  }

  const res = await apiFetch(`/api/files/${encodeURIComponent(book.file_key)}`, {
    signal: options?.signal,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Không thể tải sách từ R2 (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  if (options?.cacheOnFetch !== false) {
    await setCachedBookBlob(book.file_key, blob);
  }
  return { blob, fromCache: false };
}

export async function fetchCoverBlobCached(coverKey: string): Promise<Blob | null> {
  assertApiConfigured();
  const cached = await getCachedCoverBlob(coverKey);
  if (cached) return cached;
  if (!isCloudMode) return null;

  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(coverKey)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    await setCachedCoverBlob(coverKey, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function saveReadingProgress(
  bookId: string,
  progress: ReadingProgress,
  options?: SaveProgressOptions,
): Promise<void> {
  assertApiConfigured();
  const deltaSec =
    options?.readingDeltaSec && options.readingDeltaSec > 0
      ? Math.min(300, Math.floor(options.readingDeltaSec))
      : 0;
  const mergedLocal: ReadingProgress =
    deltaSec > 0
      ? { ...progress, readingSeconds: (progress.readingSeconds ?? 0) + deltaSec }
      : progress;

  if (!isCloudMode || getActiveAuthSession().role === 'owner') {
    await putLocalProgress(bookId, mergedLocal);
  }
  if (!isCloudMode) {
    if (deltaSec > 0) {
      void import('@/lib/readingStreak')
        .then((m) => m.recordLocalDailyReadingSeconds(deltaSec))
        .catch(() => undefined);
    }
    return;
  }

  const res = await apiFetch(`/api/progress/${bookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deltaSec > 0 ? { ...progress, readingDeltaSec: deltaSec } : progress),
    ...(options?.keepalive ? { keepalive: true } : {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể đồng bộ tiến độ đọc.');
  }
}

export async function clearReadingProgress(bookId: string): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode || getActiveAuthSession().role === 'owner') {
    await deleteLocalProgress(bookId);
  }
  if (!isCloudMode) return;
  const res = await apiFetch(`/api/progress/${bookId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xóa tiến độ đọc.');
  }
}
