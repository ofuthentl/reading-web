import type {
  AuthRole,
  AuthSessionInfo,
  Book,
  BookAccessSummary,
  CustomCollection,
  ReadingProgress,
  SaveProgressOptions,
  ShelfAccessSummary,
  ShelfRatingSummary,
  ShelfRelation,
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
  deleteCachedBookBlob,
  deleteLocalProgress,
  getAllLocalProgress,
  getBookCacheGeneration,
  getCachedBookBlob,
  getCachedCoverBlob,
  getCoverCacheGeneration,
  getLocalBooks,
  getLocalProgress,
  isConstrainedMobileDevice,
  isValidZipBookBlob,
  pruneMobileBookCache,
  putLocalProgress,
  setCachedBookBlob,
  setCachedCoverBlob,
} from '@/lib/cache';
import {
  deriveTokenScopeKey,
  readCachedBooksResponse,
  writeCachedBooksResponse,
} from '@/lib/libraryStateCache';
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
export const LOCAL_SHELF_RELATIONS_STORAGE_KEY = 'ofu-library-local-shelf-relations-v1';

function readLocalArraySafe<T>(storageKey: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readLocalShelfRatingsFallback(): Record<string, ShelfRatingSummary> {
  try {
    const raw = localStorage.getItem('ofu-library-local-community-v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      ratings?: Record<string, Record<string, { rating?: number }>>;
    };
    const out: Record<string, ShelfRatingSummary> = {};
    for (const [bucketKey, map] of Object.entries(parsed.ratings || {})) {
      if (!bucketKey.startsWith('shelf:') || !map || typeof map !== 'object') continue;
      const shelfKey = bucketKey.slice('shelf:'.length);
      const vals = Object.values(map)
        .map((r) => Number(r?.rating))
        .filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 5);
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        out[shelfKey] = {
          average: Math.round((sum / vals.length) * 10) / 10,
          count: vals.length,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchLibraryState(): Promise<{
  books: Book[];
  progress: Record<string, ReadingProgress>;
  weeklyPopularIds: string[];
  shelfPrefs: ShelfPrefsState;
  shelfRatings: Record<string, ShelfRatingSummary>;
  shelfRelations: ShelfRelation[];
  bookAccess?: Record<string, BookAccessSummary>;
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
      shelfRatings: readLocalShelfRatingsFallback(),
      shelfRelations: readLocalArraySafe<ShelfRelation>(LOCAL_SHELF_RELATIONS_STORAGE_KEY),
      planToReadShelves: readLocalArraySafe<string>(LOCAL_PTR_STORAGE_KEY),
      planToReadBooks: readLocalArraySafe<string>(LOCAL_PTR_BOOKS_STORAGE_KEY),
      collections: readLocalArraySafe<CustomCollection>(LOCAL_COLLECTIONS_STORAGE_KEY),
      storage,
      session: DEFAULT_OWNER_SESSION,
    };
  }

  type RawBooksApiPayload = {
    books?: Book[];
    progress?: Record<string, ReadingProgress>;
    weeklyPopular?: string[];
    shelfCovers?: Record<string, string>;
    favoriteShelves?: string[];
    shelfTags?: Record<string, string[]>;
    shelfAltTitles?: Record<string, string[]>;
    shelfRatings?: Record<string, ShelfRatingSummary>;
    shelfRelations?: ShelfRelation[];
    bookAccess?: Record<string, BookAccessSummary>;
    planToReadShelves?: string[];
    planToReadBooks?: string[];
    collections?: CustomCollection[];
    shelfAccess?: Record<string, ShelfAccessSummary>;
    storage?: StorageStats;
    session?: { role?: AuthRole; expiresAt?: number | null; watermarkLabel?: string | null };
    error?: string;
  };

  const scopeKey = deriveTokenScopeKey(getAuthToken());
  const cachedEntry = readCachedBooksResponse<RawBooksApiPayload>(scopeKey);
  const reqHeaders = new Headers();
  if (cachedEntry?.etag) {
    reqHeaders.set('If-None-Match', cachedEntry.etag);
  }

  let response = await apiFetch('/api/books', { headers: reqHeaders });
  let data: RawBooksApiPayload;

  if (response.status === 304) {
    if (cachedEntry?.payload) {
      data = cachedEntry.payload;
      const refreshedEtag = response.headers.get('ETag') || cachedEntry.etag;
      writeCachedBooksResponse(scopeKey, refreshedEtag, data);
    } else {
      // Dự phòng nếu nhận 304 mà không có bản nhớ cục bộ
      response = await apiFetch('/api/books', { cache: 'no-store' });
      data = (await response.json().catch(() => ({}))) as RawBooksApiPayload;
      if (!response.ok) {
        throw new Error(data.error || 'Không thể tải dữ liệu thư viện.');
      }
      const nextEtag = response.headers.get('ETag');
      if (nextEtag) writeCachedBooksResponse(scopeKey, nextEtag, data);
    }
  } else {
    data = (await response.json().catch(() => ({}))) as RawBooksApiPayload;
    if (!response.ok) {
      throw new Error(data.error || 'Không thể tải dữ liệu thư viện.');
    }
    const nextEtag = response.headers.get('ETag');
    if (nextEtag) writeCachedBooksResponse(scopeKey, nextEtag, data);
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
    shelfRatings:
      data.shelfRatings && typeof data.shelfRatings === 'object' ? data.shelfRatings : {},
    shelfRelations: Array.isArray(data.shelfRelations) ? data.shelfRelations : [],
    ...(data.bookAccess && typeof data.bookAccess === 'object'
      ? { bookAccess: data.bookAccess }
      : {}),
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

interface InFlightBookFetch {
  controller: AbortController;
  promise: Promise<Blob>;
  refCount: number;
}

const inFlightBookFetches = new Map<string, InFlightBookFetch>();

function createAbortError(): Error {
  return typeof DOMException !== 'undefined'
    ? new DOMException('The operation was aborted.', 'AbortError')
    : new Error('The operation was aborted.');
}

function downloadBookFromR2Deduped(fileKey: string, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(createAbortError());

  let entry = inFlightBookFetches.get(fileKey);
  if (!entry) {
    const controller = new AbortController();
    const promise = (async () => {
      try {
        const res = await apiFetch(`/api/files/${encodeURIComponent(fileKey)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `Không thể tải sách từ R2 (HTTP ${res.status}).`);
        }
        return await res.blob();
      } finally {
        if (inFlightBookFetches.get(fileKey)?.controller === controller) {
          inFlightBookFetches.delete(fileKey);
        }
      }
    })();
    entry = { controller, promise, refCount: 0 };
    inFlightBookFetches.set(fileKey, entry);
  }

  const activeEntry = entry;
  activeEntry.refCount += 1;

  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const detach = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      activeEntry.refCount = Math.max(0, activeEntry.refCount - 1);
      if (activeEntry.refCount === 0) {
        activeEntry.controller.abort();
        if (inFlightBookFetches.get(fileKey) === activeEntry) {
          inFlightBookFetches.delete(fileKey);
        }
      }
    };
    const onAbort = () => {
      detach();
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    activeEntry.promise.then(
      (blob) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        activeEntry.refCount = Math.max(0, activeEntry.refCount - 1);
        resolve(blob);
      },
      (err) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        activeEntry.refCount = Math.max(0, activeEntry.refCount - 1);
        reject(err);
      },
    );
  });
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
  if (cached) {
    if (await isValidZipBookBlob(cached)) {
      if (isCloudMode && isConstrainedMobileDevice()) {
        void pruneMobileBookCache(book.file_key).catch(() => undefined);
      }
      return { blob: cached, fromCache: true };
    }
    if (!isCloudMode) {
      throw new Error('Tệp sách trong bộ nhớ cục bộ bị hỏng hoặc không đọc được.');
    }
    // Tự phục hồi khi tệp đệm IndexedDB trên di động bị hỏng/cắt cụt: xoá mục lỗi và tải sạch lại từ R2
    await deleteCachedBookBlob(book.file_key);
  }

  if (!isCloudMode) {
    throw new Error('Không tìm thấy tệp sách trong bộ nhớ cục bộ.');
  }

  const cacheGen = getBookCacheGeneration();
  const blob = await downloadBookFromR2Deduped(book.file_key, options?.signal);
  if (!(await isValidZipBookBlob(blob))) {
    throw new Error('Tệp sách tải về bị hỏng hoặc không đúng định dạng EPUB/DOCX.');
  }
  if (options?.cacheOnFetch !== false && getBookCacheGeneration() === cacheGen) {
    // Ghi bộ nhớ đệm IndexedDB ở nền (tự áp hạn mức LRU trên di động để tránh phình RAM/bộ nhớ)
    const writeCache = isConstrainedMobileDevice()
      ? pruneMobileBookCache(book.file_key, blob.size).then(() => {
          if (getBookCacheGeneration() === cacheGen) {
            return setCachedBookBlob(book.file_key, blob);
          }
          return undefined;
        })
      : setCachedBookBlob(book.file_key, blob);
    void writeCache.catch(() => undefined);
  }
  return { blob, fromCache: false };
}

export async function fetchCoverBlobCached(coverKey: string): Promise<Blob | null> {
  assertApiConfigured();
  const cached = await getCachedCoverBlob(coverKey);
  if (cached) return cached;
  if (!isCloudMode) return null;

  try {
    const coverGen = getCoverCacheGeneration();
    const res = await apiFetch(`/api/files/${encodeURIComponent(coverKey)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (getCoverCacheGeneration() === coverGen) {
      await setCachedCoverBlob(coverKey, blob);
    }
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
  const shouldWriteLocal = !isCloudMode || getActiveAuthSession().role === 'owner';

  const persistLocalPreservingSeconds = async () => {
    const existing = await getLocalProgress(bookId);
    const baseSeconds = progress.readingSeconds ?? existing?.readingSeconds ?? 0;
    const totalSeconds = baseSeconds + deltaSec;
    const rereadCount = Math.max(existing?.rereadCount ?? 0, progress.rereadCount ?? 0);
    const mergedLocal: ReadingProgress = {
      ...progress,
      ...(totalSeconds > 0 ? { readingSeconds: totalSeconds } : {}),
      ...(rereadCount > 0 ? { rereadCount } : {}),
    };
    await putLocalProgress(bookId, mergedLocal);
  };

  // Vá H-01: khi pagehide (keepalive), phải khởi tạo fetch() ĐỒNG BỘ trước khi await IndexedDB
  if (isCloudMode && options?.keepalive) {
    const cloudPromise = apiFetch(`/api/progress/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deltaSec > 0 ? { ...progress, readingDeltaSec: deltaSec } : progress),
      keepalive: true,
    });
    if (shouldWriteLocal) {
      void persistLocalPreservingSeconds().catch(() => undefined);
    }
    const res = await cloudPromise;
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || 'Không thể đồng bộ tiến độ đọc.');
    }
    return;
  }

  if (shouldWriteLocal) {
    await persistLocalPreservingSeconds();
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
