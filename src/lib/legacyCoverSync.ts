import type { Book, StorageStats } from '@/types';
import { HARD_LIMIT_BYTES, fetchBookBlobCached, isCloudMode } from '@/lib/api';
import { apiFetch, getActiveAuthSession } from '@/lib/authSession';
import {
  deleteCachedCoverBlob,
  getLocalBooks,
  putLocalBook,
  setCachedCoverBlob,
} from '@/lib/cache';
import { extractCoverAtUpload } from '@/lib/parsers';
import type { ToastType } from '@/hooks/useToast';

const SKIPPED_COVERS_STORAGE_KEY = 'ofu-cover-v2-skipped';
const SYNC_CONCURRENCY = 2;

let syncInFlight = false;

function readSkippedBookIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SKIPPED_COVERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveSkippedBookIds(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(SKIPPED_COVERS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota errors
  }
}

export function needsLegacyCoverSync(book: Book): boolean {
  return Boolean(book.file_key) && !book.cover_key?.endsWith('-v2.jpg');
}

async function uploadPrecompressedCover(
  book: Book,
  coverBlob: Blob,
): Promise<{ book: Book; storage?: StorageStats } | null> {
  if (!isCloudMode) {
    if (book.cover_key) await deleteCachedCoverBlob(book.cover_key);
    const nextCoverKey = `covers/${book.id}-${Date.now()}-v2.jpg`;
    await setCachedCoverBlob(nextCoverKey, coverBlob);
    const updated: Book = { ...book, cover_key: nextCoverKey, cover_size: coverBlob.size };
    await putLocalBook(updated);
    const all = await getLocalBooks();
    const usedBytes = all.reduce((sum, b) => sum + (b.file_size || 0) + (b.cover_size || 0), 0);
    return {
      book: updated,
      storage: {
        usedBytes,
        limitBytes: HARD_LIMIT_BYTES,
        remainingBytes: Math.max(0, HARD_LIMIT_BYTES - usedBytes),
        bookCount: all.length,
      },
    };
  }

  const res = await apiFetch(`/api/books/${book.id}/cover`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Size': String(coverBlob.size) },
    body: coverBlob,
  });
  const data = (await res.json().catch(() => ({}))) as {
    book?: Book;
    storage?: StorageStats;
  };
  if (!res.ok || !data.book) return null;

  if (book.cover_key) await deleteCachedCoverBlob(book.cover_key);
  if (data.book.cover_key) await setCachedCoverBlob(data.book.cover_key, coverBlob);

  const mergedBook: Book = {
    ...data.book,
    ...(typeof book.guest_ready === 'boolean' ? { guest_ready: book.guest_ready } : {}),
  };
  return { book: mergedBook, storage: data.storage };
}

export async function syncLegacyCoversInBackground(
  books: Book[],
  onBooksBatchUpdated: (books: Book[], latestStorage?: StorageStats) => void,
  onNotify?: (message: string, type?: ToastType) => void,
): Promise<void> {
  if (syncInFlight) return;
  if (isCloudMode && getActiveAuthSession().role !== 'owner') return;

  const skippedIds = readSkippedBookIds();
  const targets = books.filter((b) => needsLegacyCoverSync(b) && !skippedIds.has(b.id));
  if (targets.length === 0) return;

  syncInFlight = true;
  let updatedCount = 0;
  let workerOutdated = false;
  let pendingBooks: Book[] = [];
  let latestStorage: StorageStats | undefined;

  const flushBatch = () => {
    if (pendingBooks.length === 0) return;
    const batch = pendingBooks;
    pendingBooks = [];
    onBooksBatchUpdated(batch, latestStorage);
  };

  try {
    onNotify?.(
      `Đang tự động chuẩn hoá tỉ lệ ảnh bìa gốc (${targets.length} cuốn)...`,
      'info',
    );

    let cursor = 0;
    const runWorker = async () => {
      while (cursor < targets.length && !workerOutdated) {
        if (isCloudMode && getActiveAuthSession().role !== 'owner') return;
        const book = targets[cursor++];
        try {
          const { blob } = await fetchBookBlobCached(book, { cacheOnFetch: false });
          const virtualFile = new File([blob], `${book.id}.${book.file_type}`, {
            type: blob.type || 'application/octet-stream',
          });
          const freshCover = await extractCoverAtUpload(virtualFile, book.file_type);
          if (!freshCover) {
            skippedIds.add(book.id);
            saveSkippedBookIds(skippedIds);
          } else {
            const saved = await uploadPrecompressedCover(book, freshCover);
            if (saved) {
              pendingBooks.push(saved.book);
              if (saved.storage) latestStorage = saved.storage;
              updatedCount += 1;
              if (pendingBooks.length >= 12) flushBatch();
              if (!saved.book.cover_key?.endsWith('-v2.jpg')) {
                workerOutdated = true;
                return;
              }
            }
          }
        } catch {
          // Bỏ qua cuốn lỗi mạng/tệp lẻ để tiếp tục các cuốn còn lại
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
      }
    };

    const workers = Array.from(
      { length: Math.min(SYNC_CONCURRENCY, targets.length) },
      () => runWorker(),
    );
    await Promise.all(workers);
    flushBatch();

    if (updatedCount > 0) {
      onNotify?.(`Đã tự động chuẩn hoá ảnh bìa gốc cho ${updatedCount} cuốn sách.`, 'success');
    }
  } finally {
    syncInFlight = false;
  }
}
