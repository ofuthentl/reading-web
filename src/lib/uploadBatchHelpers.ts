import type { Book, StorageStats } from '@/types';
import { updateBookMetadata, uploadBook } from '@/lib/api';
import { announceDiscordReleasesApi } from '@/lib/apiAdminMutations';
import { isAuthError } from '@/lib/authSession';
import { bookDuplicateKey, parseFileMetadata } from '@/lib/bookMetadata';
import { resolveUploadShelfPlan } from '@/lib/shelfUploadPlanner';
import type { UploadQueueItem } from '@/components/UploadQueueList';
import type { ToastType } from '@/hooks/useToast';

export const MAX_SINGLE_FILE_BYTES = 350 * 1024 * 1024;
export const ACCEPTED_UPLOAD_EXTENSIONS = '.epub,.docx';

export function createUploadQueueItems(
  files: File[],
  libraryKeys: Set<string>,
  existingQueue: UploadQueueItem[],
): UploadQueueItem[] {
  const queuedKeys = new Set(
    existingQueue.filter((item) => item.status !== 'invalid').map((item) => item.duplicateKey),
  );

  return files.map((file) => {
    const parsed = parseFileMetadata(file.name);
    const duplicateKey = bookDuplicateKey(parsed.title, parsed.author);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const base = {
      id,
      file,
      ...parsed,
      duplicateKey,
      duplicateReason: null as 'library' | 'queue' | null,
    };

    if (!parsed.extension) {
      return { ...base, status: 'invalid', errorMessage: 'Chỉ hỗ trợ EPUB hoặc DOCX.' };
    }
    if (file.size > MAX_SINGLE_FILE_BYTES) {
      return { ...base, status: 'invalid', errorMessage: 'Tệp vượt quá giới hạn tối đa 350 MB.' };
    }

    const duplicateReason = libraryKeys.has(duplicateKey)
      ? 'library'
      : queuedKeys.has(duplicateKey)
        ? 'queue'
        : null;
    queuedKeys.add(duplicateKey);
    return { ...base, duplicateReason, status: duplicateReason ? 'skipped' : 'queued' };
  });
}

export function buildLibraryDuplicateKeys(books: readonly Book[]): Set<string> {
  return new Set(books.map((book) => bookDuplicateKey(book.title, book.author)));
}

const MAX_DISCORD_IDS_PER_CALL = 50;

export async function triggerDiscordReleaseAnnouncement(
  uploadedBookIds: string[],
  onNotify: (message: string, type?: ToastType) => void,
  onApiError: (err: unknown, fallbackMessage: string) => void,
): Promise<boolean> {
  const uniqueIds = Array.from(new Set(uploadedBookIds.filter(Boolean)));
  if (uniqueIds.length === 0) return false;
  try {
    let totalGroups = 0;
    let totalBooks = 0;
    let totalFailed = 0;
    let lastMessage = '';
    for (let i = 0; i < uniqueIds.length; i += MAX_DISCORD_IDS_PER_CALL) {
      const chunk = uniqueIds.slice(i, i + MAX_DISCORD_IDS_PER_CALL);
      const result = await announceDiscordReleasesApi(chunk);
      lastMessage = result.message;
      if (!result.configured) {
        onNotify(result.message, 'warning');
        return false;
      }
      totalGroups += result.announcedGroups;
      totalBooks += result.announcedBooks;
      totalFailed += result.failedGroups;
    }
    if (totalGroups > 0 && totalFailed === 0) {
      onNotify(
        uniqueIds.length > MAX_DISCORD_IDS_PER_CALL
          ? `Đã gửi thông báo Discord cho ${totalBooks} tập (${totalGroups} bộ).`
          : lastMessage,
        'success',
      );
      return true;
    }
    onNotify(
      totalGroups > 0
        ? `Đã gửi ${totalGroups} bộ lên Discord (${totalFailed} bộ lỗi).`
        : lastMessage || 'Chưa gửi được thông báo lên Discord.',
      'warning',
    );
    return totalGroups > 0;
  } catch (err) {
    if (isAuthError(err)) {
      onApiError(err, 'Phiên đăng nhập đã hết hạn.');
      return false;
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'Không thể gửi thông báo tập mới lên Discord.';
    onNotify(`Tải sách xong nhưng thông báo Discord gặp lỗi: ${msg}`, 'warning');
    return false;
  }
}

export interface ExecuteUploadBatchOptions {
  targets: UploadQueueItem[];
  existingBooks: Book[];
  batchShelfForRun: string | null;
  isStopped: () => boolean;
  isMounted: () => boolean;
  onProgress: (state: { completed: number; total: number; currentTitle: string }) => void;
  onItemPatch: (id: string, patch: Partial<UploadQueueItem>) => void;
  onBookUploaded: (book: Book, storage: StorageStats) => void;
  onBookUpdated: (book: Book, storage?: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export async function executeSequentialUploadBatch(
  options: ExecuteUploadBatchOptions,
): Promise<{
  successCount: number;
  failCount: number;
  authFailed: boolean;
  uploadedBookIds: string[];
}> {
  const {
    targets, existingBooks, batchShelfForRun, isStopped, isMounted,
    onProgress, onItemPatch, onBookUploaded, onBookUpdated, onApiError,
  } = options;

  let successCount = 0;
  let failCount = 0;
  let authFailed = false;
  const uploadedBookIds: string[] = [];
  const workingBooks = [...existingBooks];

  for (let index = 0; index < targets.length; index += 1) {
    if (isStopped() || !isMounted()) break;
    const current = targets[index];

    onProgress({ completed: index, total: targets.length, currentTitle: current.title });
    onItemPatch(current.id, { status: 'uploading', errorMessage: undefined });

    try {
      const autoPlan = resolveUploadShelfPlan(
        { title: current.title, author: current.author },
        workingBooks,
      );
      const plan = batchShelfForRun
        ? {
            shelf: batchShelfForRun,
            booksToRegroup:
              autoPlan.shelf.toLocaleLowerCase('vi') === batchShelfForRun.toLocaleLowerCase('vi')
                ? autoPlan.booksToRegroup
                : ([] as Book[]),
          }
        : autoPlan;
      const result = await uploadBook(current.file, {
        title: current.title,
        author: current.author,
        shelf: plan.shelf,
      });
      if (!isMounted()) break;
      successCount += 1;
      uploadedBookIds.push(result.book.id);
      workingBooks.push(result.book);
      onBookUploaded(result.book, result.storage);

      for (const peer of plan.booksToRegroup) {
        try {
          const moved = await updateBookMetadata(peer.id, { shelf: plan.shelf });
          const idx = workingBooks.findIndex((b) => b.id === moved.id);
          if (idx >= 0) workingBooks[idx] = moved;
          if (isMounted()) onBookUpdated(moved);
        } catch (regroupErr) {
          if (isAuthError(regroupErr)) throw regroupErr;
        }
      }

      onItemPatch(current.id, { status: 'done', shelf: result.book.shelf, errorMessage: undefined });
    } catch (err) {
      if (!isMounted()) break;
      if (isAuthError(err)) {
        authFailed = true;
        onApiError(err, 'Phiên đăng nhập đã hết hạn.');
        break;
      }
      failCount += 1;
      const message =
        err instanceof Error ? err.message : `Không thể tải "${current.title}" lên kho.`;
      onItemPatch(current.id, { status: 'error', errorMessage: message });
    }

    if (isMounted()) {
      onProgress({ completed: index + 1, total: targets.length, currentTitle: current.title });
    }
  }

  return { successCount, failCount, authFailed, uploadedBookIds };
}
