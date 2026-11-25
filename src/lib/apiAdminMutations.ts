import type { Book, StorageStats } from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';
import {
  type ReplaceBookFileOptions,
  type ReplaceBookFileResult,
  replaceBookFile,
} from '@/lib/bookReplaceClient';
import {
  HARD_LIMIT_BYTES,
  MAX_SHELF_NAME_LENGTH,
  type UploadBookResult,
  computeLocalStorageStats,
  uploadBook,
} from '@/lib/bookUploadClient';
import {
  deleteCachedBookBlob,
  deleteCachedCoverBlob,
  deleteLocalBook,
  deleteLocalProgress,
  getLocalBooks,
  putLocalBook,
  setCachedCoverBlob,
} from '@/lib/cache';
import {
  pruneDeletedBooksFromPrefs,
  pruneMovedBooksFromShelfCovers,
  readLocalShelfPrefs,
  renameShelfPrefs,
  toShelfPrefKey,
  writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

export {
  replaceBookFile,
  uploadBook,
  type ReplaceBookFileOptions,
  type ReplaceBookFileResult,
  type UploadBookResult,
};

export async function fetchLatestStorageStats(): Promise<StorageStats | null> {
  assertApiConfigured();
  if (!isCloudMode) return computeLocalStorageStats(await getLocalBooks());
  const res = await apiFetch('/api/storage');
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as StorageStats | null;
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
    if (patch.shelf && toShelfPrefKey(patch.shelf) !== toShelfPrefKey(target.shelf)) {
      writeLocalShelfPrefs(
        pruneMovedBooksFromShelfCovers(readLocalShelfPrefs(), new Set([bookId]), patch.shelf),
      );
    }
    return updated;
  }

  const res = await apiFetch(`/api/books/${bookId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as { book?: Book; error?: string };
  if (!res.ok || !data.book) throw new Error(data.error || 'Không thể cập nhật thông tin sách.');
  if (patch.shelf) {
    writeLocalShelfPrefs(
      pruneMovedBooksFromShelfCovers(readLocalShelfPrefs(), new Set([bookId]), data.book.shelf),
    );
  }
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
    const oldKey = toShelfPrefKey(oldName);
    const books = await getLocalBooks();
    for (const b of books) {
      if (toShelfPrefKey(b.shelf || 'Kho chưa phân loại') === oldKey) {
        await putLocalBook({ ...b, shelf: trimmedNew });
      }
    }
    writeLocalShelfPrefs(renameShelfPrefs(readLocalShelfPrefs(), oldName, trimmedNew));
    const [{ syncLocalCatalogOnShelfRenamed }, { syncLocalCommunityOnShelfRenamed }] =
      await Promise.all([import('@/lib/catalogApi'), import('@/lib/communityApi')]);
    syncLocalCatalogOnShelfRenamed(oldName, trimmedNew);
    syncLocalCommunityOnShelfRenamed(oldName, trimmedNew);
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
    writeLocalShelfPrefs(pruneMovedBooksFromShelfCovers(readLocalShelfPrefs(), idSet, shelf));
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
  writeLocalShelfPrefs(pruneMovedBooksFromShelfCovers(readLocalShelfPrefs(), new Set(bookIds), shelf));
}

export async function deleteBooks(booksToDelete: Book[]): Promise<StorageStats> {
  assertApiConfigured();
  if (booksToDelete.length === 0) {
    return (
      (await fetchLatestStorageStats()) ?? {
        usedBytes: 0,
        limitBytes: HARD_LIMIT_BYTES,
        remainingBytes: HARD_LIMIT_BYTES,
        bookCount: 0,
      }
    );
  }

  let nextStorage: StorageStats;
  if (!isCloudMode) {
    const deletedIdSet = new Set(booksToDelete.map((b) => b.id));
    const [
      { deleteAllLocalHighlightsForBook },
      { syncLocalCatalogOnBooksDeleted },
      { syncLocalCommunityOnBooksDeleted },
    ] = await Promise.all([
      import('@/lib/highlightsApi'),
      import('@/lib/catalogApi'),
      import('@/lib/communityApi'),
    ]);
    for (const b of booksToDelete) {
      await deleteLocalBook(b.id);
      await deleteLocalProgress(b.id);
      deleteAllLocalHighlightsForBook(b.id);
    }
    const remaining = await getLocalBooks();
    const remainingShelfKeys = new Set(
      remaining.map((b) => toShelfPrefKey(b.shelf || 'Kho chưa phân loại')),
    );
    syncLocalCatalogOnBooksDeleted(deletedIdSet, remainingShelfKeys);
    syncLocalCommunityOnBooksDeleted(deletedIdSet, remainingShelfKeys);
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

export interface DiscordReleaseAnnounceResult {
  ok: boolean;
  configured: boolean;
  mode: 'bot_channel' | 'webhook' | null;
  announcedGroups: number;
  announcedBooks: number;
  failedGroups: number;
  message: string;
  errors?: string[];
}

export async function announceDiscordReleasesApi(
  bookIds: string[],
): Promise<DiscordReleaseAnnounceResult> {
  assertApiConfigured();
  const uniqueIds = Array.from(new Set(bookIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      ok: false,
      configured: true,
      mode: null,
      announcedGroups: 0,
      announcedBooks: 0,
      failedGroups: 0,
      message: 'Không có tập sách nào để thông báo.',
    };
  }

  if (!isCloudMode) {
    return {
      ok: false,
      configured: false,
      mode: null,
      announcedGroups: 0,
      announcedBooks: 0,
      failedGroups: 0,
      message: 'Chế độ Local Dev chưa kết nối Worker Discord nên không gửi thông báo thật.',
    };
  }

  const res = await apiFetch('/api/admin/discord/announce-release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookIds: uniqueIds }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<DiscordReleaseAnnounceResult> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể gửi thông báo tập mới lên Discord.');
  }
  return {
    ok: Boolean(data.ok),
    configured: Boolean(data.configured),
    mode: data.mode === 'bot_channel' || data.mode === 'webhook' ? data.mode : null,
    announcedGroups: Number(data.announcedGroups ?? 0),
    announcedBooks: Number(data.announcedBooks ?? 0),
    failedGroups: Number(data.failedGroups ?? 0),
    message: data.message || 'Đã xử lý yêu cầu thông báo Discord.',
    ...(Array.isArray(data.errors) ? { errors: data.errors } : {}),
  };
}
