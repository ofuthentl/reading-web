import type { Book, BookFileType, StorageStats } from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';
import { parseFileMetadata, pickCoverColor } from '@/lib/bookMetadata';
import {
  deleteCachedBookBlob,
  deleteCachedCoverBlob,
  deleteLocalBook,
  deleteLocalProgress,
  getLocalBooks,
  putLocalBook,
  setCachedBookBlob,
  setCachedCoverBlob,
} from '@/lib/cache';
import { isChunkLoadError } from '@/lib/chunkReload';
import {
  pruneDeletedBooksFromPrefs,
  readLocalShelfPrefs,
  renameShelfPrefs,
  writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

const HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024;
const MAX_SHELF_NAME_LENGTH = 120;

async function computeLocalStorageStats(books: Book[]): Promise<StorageStats> {
  const usedBytes = books.reduce((sum, b) => sum + (b.file_size || 0) + (b.cover_size || 0), 0);
  return {
    usedBytes,
    limitBytes: HARD_LIMIT_BYTES,
    remainingBytes: Math.max(0, HARD_LIMIT_BYTES - usedBytes),
    bookCount: books.length,
  };
}

export async function uploadBook(
  file: File,
  overrides?: { title?: string; author?: string; shelf?: string },
): Promise<{ book: Book; storage: StorageStats }> {
  assertApiConfigured();
  const parsed = parseFileMetadata(file.name);
  if (!parsed.extension) {
    throw new Error(`${file.name}: chỉ hỗ trợ EPUB hoặc DOCX.`);
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

    await setCachedBookBlob(fileKey, file, true);
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
      guest_ready: true,
    };
    await putLocalBook(newBook);
    const updatedBooks = await getLocalBooks();
    return { book: newBook, storage: await computeLocalStorageStats(updatedBooks) };
  }

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
    if (!isCloudMode) {
      return computeLocalStorageStats(await getLocalBooks());
    }
    const res = await apiFetch('/api/storage');
    if (res.ok) return (await res.json()) as StorageStats;
    return { usedBytes: 0, limitBytes: HARD_LIMIT_BYTES, remainingBytes: HARD_LIMIT_BYTES, bookCount: 0 };
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
