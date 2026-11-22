import type {
  AuthRole, AuthSessionInfo, Book, BookFileType, ReadingProgress, ShelfAccessSummary, StorageStats,
} from '@/types';
import {
  DEFAULT_OWNER_SESSION, apiFetch, assertApiConfigured, checkHealth, getActiveAuthSession,
  getAuthToken, isAuthError, isCloudMode, isLocalDevMode, isMissingProductionApi,
  loginWithPasscode, setAuthToken,
} from '@/lib/authSession';
import {
  deleteCachedBookBlob, deleteCachedCoverBlob, deleteLocalBook, deleteLocalProgress,
  getAllLocalProgress, getCachedBookBlob, getCachedCoverBlob, getLocalBooks,
  putLocalBook, putLocalProgress, setCachedBookBlob, setCachedCoverBlob,
} from '@/lib/cache';
import {
  formatBytes, groupBooksIntoShelves, parseFileMetadata, pickCoverColor, sortBooksByTitle,
} from '@/lib/bookMetadata';
import { isChunkLoadError } from '@/lib/chunkReload';
import {
  type ShelfPrefsState, pruneDeletedBooksFromPrefs, readLocalShelfPrefs,
  renameShelfPrefs, writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

export {
  apiFetch, assertApiConfigured, checkHealth, formatBytes, getAuthToken, groupBooksIntoShelves,
  isAuthError, isCloudMode, isLocalDevMode, isMissingProductionApi, loginWithPasscode,
  setAuthToken, sortBooksByTitle,
};

export const HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GiB
export const MAX_SHELF_NAME_LENGTH = 120;

async function computeLocalStorageStats(books: Book[]): Promise<StorageStats> {
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

export async function fetchLibraryState(): Promise<{
  books: Book[];
  progress: Record<string, ReadingProgress>;
  weeklyPopularIds: string[];
  shelfPrefs: ShelfPrefsState;
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
    role: data.session?.role === 'guest' ? 'guest' : fallbackSession.role,
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
    storage: data.storage || {
      usedBytes: 0,
      limitBytes: HARD_LIMIT_BYTES,
      remainingBytes: HARD_LIMIT_BYTES,
      bookCount: 0,
    },
    session: resolvedSession,
  };
}

export async function uploadBook(
  file: File,
  overrides?: { title?: string; author?: string; shelf?: string },
): Promise<{ book: Book; storage: StorageStats }> {
  assertApiConfigured();
  const parsed = parseFileMetadata(file.name);
  if (!parsed.extension) {
    throw new Error(`${file.name}: chỉ hỗ trợ EPUB, PDF hoặc DOCX.`);
  }
  if (file.size > 350 * 1024 * 1024) {
    throw new Error(`${file.name}: vượt quá giới hạn 350 MB mỗi tệp.`);
  }

  const bookId = crypto.randomUUID().replace(/-/g, '');
  const title = overrides?.title?.trim() || parsed.title;
  const author = overrides?.author?.trim() || parsed.author;
  const shelf = (overrides?.shelf?.trim() || parsed.shelf).slice(0, MAX_SHELF_NAME_LENGTH);
  const coverColor = pickCoverColor(`${title}-${author}`);
  const fileType: BookFileType = parsed.extension;

  // Extract tiny compressed cover JPEG (~40KB) once at upload time
  let coverBlob: Blob | null = null;
  try {
    const { extractCoverAtUpload } = await import('@/lib/parsers');
    coverBlob = await extractCoverAtUpload(file, fileType);
  } catch (err) {
    if (isChunkLoadError(err)) {
      throw new Error(
        'Ứng dụng vừa được cập nhật hoặc mất kết nối. Vui lòng tải lại trang rồi thử lại.',
      );
    }
    coverBlob = null;
  }

  if (!isCloudMode) {
    const existingBooks = await getLocalBooks();
    const currentStats = await computeLocalStorageStats(existingBooks);
    const totalIncoming = file.size + (coverBlob?.size || 0);
    if (currentStats.usedBytes + totalIncoming > HARD_LIMIT_BYTES) {
      throw new Error('Kho đã chạm giới hạn an toàn 9.0 GB.');
    }

    const fileKey = `books/${bookId}.${fileType}`;
    const coverKey = coverBlob ? `covers/${bookId}-v2.jpg` : null;

    await setCachedBookBlob(fileKey, file);
    if (coverKey && coverBlob) {
      await setCachedCoverBlob(coverKey, coverBlob);
    }

    const newBook: Book = {
      id: bookId,
      title,
      author,
      shelf,
      description: null,
      cover_color: coverColor,
      cover_key: coverKey,
      file_key: fileKey,
      file_type: fileType,
      file_size: file.size,
      cover_size: coverBlob?.size || 0,
      created_at: new Date().toISOString(),
      guest_ready: fileType !== 'pdf',
    };
    await putLocalBook(newBook);
    const updatedBooks = await getLocalBooks();
    return { book: newBook, storage: await computeLocalStorageStats(updatedBooks) };
  }

  // Cloud Mode: Stream raw book bytes directly to Worker -> R2 with 9.0 GB hard-limit enforcement
  const uploadRes = await apiFetch(`/api/books/${bookId}/file`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Type': fileType,
      'X-File-Size': String(file.size),
      'X-Book-Title': encodeURIComponent(title),
      'X-Book-Author': encodeURIComponent(author),
      'X-Book-Shelf': encodeURIComponent(shelf),
      'X-Cover-Color': encodeURIComponent(coverColor),
    },
    body: file,
  });
  const uploadData = (await uploadRes.json().catch(() => ({}))) as {
    book?: Book;
    storage?: StorageStats;
    error?: string;
  };
  if (!uploadRes.ok || !uploadData.book) {
    throw new Error(uploadData.error || `Không thể tải ${file.name} lên R2.`);
  }

  let finalBook = uploadData.book;
  let finalStorage = uploadData.storage!;

  // Cache book locally immediately so first open is instant (0ms)
  await setCachedBookBlob(finalBook.file_key, file);

  if (coverBlob) {
    try {
      const coverRes = await apiFetch(`/api/books/${bookId}/cover`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg', 'X-File-Size': String(coverBlob.size) },
        body: coverBlob,
      });
      const coverData = (await coverRes.json().catch(() => ({}))) as {
        book?: Book;
        storage?: StorageStats;
      };
      if (coverRes.ok && coverData.book) {
        finalBook = coverData.book;
        if (coverData.storage) finalStorage = coverData.storage;
        if (finalBook.cover_key) await setCachedCoverBlob(finalBook.cover_key, coverBlob);
      }
    } catch {
      // Non-fatal: book is already uploaded safely
    }
  }

  if (fileType === 'epub' || fileType === 'docx') {
    try {
      const { buildAndUploadGuestPack } = await import('@/lib/guestPackBuilder');
      const packRes = await buildAndUploadGuestPack(file, finalBook);
      finalBook = { ...finalBook, guest_ready: true };
      if (packRes.storage) finalStorage = packRes.storage;
    } catch {
      // Không chặn upload chính nếu sinh gói bảo mật lỗi; Admin có thể bấm đồng bộ lại trong 1 chạm
      finalBook = { ...finalBook, guest_ready: false };
    }
  } else {
    finalBook = { ...finalBook, guest_ready: false };
  }

  return { book: finalBook, storage: finalStorage };
}

export async function updateBookMetadata(
  bookId: string,
  patch: Partial<Pick<Book, 'title' | 'author' | 'shelf' | 'description' | 'cover_color'>>,
): Promise<Book> {
  assertApiConfigured();
  if (!isCloudMode) {
    const books = await getLocalBooks();
    const target = books.find((b) => b.id === bookId);
    if (!target) throw new Error('Không tìm thấy sách.');
    const updated: Book = { ...target, ...patch };
    await putLocalBook(updated);
    return updated;
  }

  const res = await apiFetch(`/api/books/${bookId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as { book?: Book; error?: string };
  if (!res.ok || !data.book) throw new Error(data.error || 'Không thể cập nhật thông tin sách.');
  return data.book;
}

export async function updateBookCover(
  book: Book,
  imageFile: File,
): Promise<{ book: Book; coverBlob: Blob; storage?: StorageStats }> {
  assertApiConfigured();
  const { compressCoverBlob } = await import('@/lib/coverImage');
  const compressed = await compressCoverBlob(imageFile);

  if (!isCloudMode) {
    if (book.cover_key) await deleteCachedCoverBlob(book.cover_key);
    const nextCoverKey = `covers/${book.id}-${Date.now()}-v2.jpg`;
    await setCachedCoverBlob(nextCoverKey, compressed);
    const updated: Book = { ...book, cover_key: nextCoverKey, cover_size: compressed.size };
    await putLocalBook(updated);
    const all = await getLocalBooks();
    return { book: updated, coverBlob: compressed, storage: await computeLocalStorageStats(all) };
  }

  const res = await apiFetch(`/api/books/${book.id}/cover`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Size': String(compressed.size) },
    body: compressed,
  });
  const data = (await res.json().catch(() => ({}))) as {
    book?: Book;
    storage?: StorageStats;
    error?: string;
  };
  if (!res.ok || !data.book) throw new Error(data.error || 'Không thể cập nhật ảnh bìa.');
  if (book.cover_key) await deleteCachedCoverBlob(book.cover_key);
  if (data.book.cover_key) await setCachedCoverBlob(data.book.cover_key, compressed);
  const mergedBook: Book = {
    ...data.book,
    ...(typeof book.guest_ready === 'boolean' ? { guest_ready: book.guest_ready } : {}),
  };
  return { book: mergedBook, coverBlob: compressed, storage: data.storage };
}

export async function renameShelfAll(oldName: string, newName: string): Promise<void> {
  assertApiConfigured();
  const trimmedNew = newName.trim();
  if (!trimmedNew || trimmedNew.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  if (!isCloudMode) {
    const oldKey = oldName.trim().toLocaleLowerCase('vi');
    const books = await getLocalBooks();
    for (const b of books) {
      if ((b.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi') === oldKey) {
        await putLocalBook({ ...b, shelf: trimmedNew });
      }
    }
    writeLocalShelfPrefs(renameShelfPrefs(readLocalShelfPrefs(), oldName, trimmedNew));
    return;
  }

  const res = await apiFetch('/api/shelves/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldName, newName: trimmedNew }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể đổi tên kệ sách.');
  }
  writeLocalShelfPrefs(renameShelfPrefs(readLocalShelfPrefs(), oldName, trimmedNew));
}

export async function bulkUpdateBooksShelf(bookIds: string[], targetShelf: string): Promise<void> {
  assertApiConfigured();
  if (bookIds.length === 0) return;
  const shelf = targetShelf.trim();
  if (!shelf || shelf.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }

  if (!isCloudMode) {
    const books = await getLocalBooks();
    const idSet = new Set(bookIds);
    for (const b of books) {
      if (idSet.has(b.id)) {
        await putLocalBook({ ...b, shelf });
      }
    }
    return;
  }

  const res = await apiFetch('/api/books/bulk-shelf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: bookIds, shelf }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể chuyển kệ cho các sách đã chọn.');
  }
}

export async function deleteBooks(booksToDelete: Book[]): Promise<StorageStats> {
  assertApiConfigured();
  if (booksToDelete.length === 0) {
    const state = await fetchLibraryState();
    return state.storage;
  }

  let nextStorage: StorageStats;
  if (!isCloudMode) {
    for (const b of booksToDelete) {
      await deleteLocalBook(b.id);
      await deleteLocalProgress(b.id);
    }
    const remaining = await getLocalBooks();
    nextStorage = await computeLocalStorageStats(remaining);
  } else if (booksToDelete.length === 1) {
    const res = await apiFetch(`/api/books/${booksToDelete[0].id}`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { storage?: StorageStats; error?: string };
    if (!res.ok || !data.storage) throw new Error(data.error || 'Không thể xóa sách.');
    nextStorage = data.storage;
  } else {
    const res = await apiFetch('/api/books/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: booksToDelete.map((b) => b.id) }),
    });
    const data = (await res.json().catch(() => ({}))) as { storage?: StorageStats; error?: string };
    if (!res.ok || !data.storage) throw new Error(data.error || 'Không thể xóa các sách đã chọn.');
    nextStorage = data.storage;
  }

  for (const b of booksToDelete) {
    await deleteCachedBookBlob(b.file_key);
    if (b.cover_key) await deleteCachedCoverBlob(b.cover_key);
  }
  writeLocalShelfPrefs(
    pruneDeletedBooksFromPrefs(readLocalShelfPrefs(), new Set(booksToDelete.map((b) => b.id))),
  );
  return nextStorage;
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
): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode || getActiveAuthSession().role === 'owner') {
    await putLocalProgress(bookId, progress);
  }
  if (!isCloudMode) return;

  const res = await apiFetch(`/api/progress/${bookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
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
