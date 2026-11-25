import type { Book, StorageStats } from '@/types';
import { updateBookMetadata, uploadBook } from '@/lib/api';
import { announceDiscordReleasesApi } from '@/lib/apiAdminMutations';
import { isAuthError } from '@/lib/authSession';
import { stripDiacriticsLower } from '@/lib/authorHeuristics';
import { bookDuplicateKey, extractSeriesName, parseFileMetadata } from '@/lib/seriesShelfExtractor';
import { isKnownAuthor, normalizeShelfPlacementKey } from '@/lib/shelfPlacement';
import {
  normalizeShelfMatchKey,
  resolveShelfConsistentAuthor,
  resolveUploadShelfPlan,
} from '@/lib/shelfUploadPlanner';
import type { UploadQueueItem } from '@/components/UploadQueueList';
import type { ToastType } from '@/hooks/useToast';

export const MAX_SINGLE_FILE_BYTES = 350 * 1024 * 1024;
export const ACCEPTED_UPLOAD_EXTENSIONS = '.epub,.docx';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';

/**
 * Trong cùng 1 lô tải lên nhiều tập cùng bộ, nếu mỗi tập mang 1 chuỗi hậu tố `author` khác nhau
 * (count === 1 trên >= 2 chuỗi khác nhau) thì đó là tiêu đề phụ từng tập → nối trả lại về `title`.
 */
export function healBatchParsedMetadata(
  entries: Array<{
    file: File;
    title: string;
    author: string;
    shelf: string;
    extension: ReturnType<typeof parseFileMetadata>['extension'];
  }>,
): void {
  const bySeries = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (!entry.extension) continue;
    const series = extractSeriesName(entry.title);
    if (!series) continue;
    const key = normalizeShelfMatchKey(series);
    const list = bySeries.get(key);
    if (list) list.push(entry);
    else bySeries.set(key, [entry]);
  }

  for (const group of bySeries.values()) {
    if (group.length < 2) continue;
    const authorCounts = new Map<string, number>();
    for (const item of group) {
      if (!isKnownAuthor(item.author)) continue;
      const aKey = stripDiacriticsLower(item.author);
      authorCounts.set(aKey, (authorCounts.get(aKey) ?? 0) + 1);
    }
    if (authorCounts.size < 2) continue;

    for (const item of group) {
      if (!isKnownAuthor(item.author)) continue;
      const aKey = stripDiacriticsLower(item.author);
      if ((authorCounts.get(aKey) ?? 0) === 1) {
        item.title = `${item.title} - ${item.author}`;
        item.author = UNKNOWN_AUTHOR;
      }
    }
  }
}

export function createUploadQueueItems(
  files: File[],
  libraryKeys: Set<string>,
  existingQueue: UploadQueueItem[],
): UploadQueueItem[] {
  const queuedKeys = new Set(
    existingQueue.filter((item) => item.status !== 'invalid').map((item) => item.duplicateKey),
  );

  const parsedEntries = files.map((file) => ({ file, ...parseFileMetadata(file.name) }));
  healBatchParsedMetadata(parsedEntries);

  return parsedEntries.map(({ file, ...parsed }) => {
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

const MAX_BATCH_UPLOAD_CONCURRENCY = 2;
const HEAVY_UPLOAD_THRESHOLD_BYTES = 40 * 1024 * 1024; // > 40 MB hạ về 1 luồng để kiểm soát RAM (QĐ-2A)

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
  let completedCount = 0;
  let authFailed = false;
  const uploadedBookIds: string[] = [];
  const workingBooks = [...existingBooks];
  const activePromises = new Set<Promise<void>>();
  const activeStandaloneAuthorPromises = new Map<string, Promise<void>>();
  let heavyInFlight: Promise<void> | null = null;

  const getStandaloneAuthorKey = (item: UploadQueueItem): string | null => {
    if (extractSeriesName(item.title) !== null) return null;
    if (!isKnownAuthor(item.author)) return null;
    return normalizeShelfPlacementKey(item.author) || null;
  };

  for (let index = 0; index < targets.length; index += 1) {
    if (isStopped() || !isMounted() || authFailed) break;
    const current = targets[index];
    const isHeavy = current.file.size > HEAVY_UPLOAD_THRESHOLD_BYTES;
    const standaloneAuthorKey = getStandaloneAuthorKey(current);

    // Chờ luồng nặng hoàn tất trước khi khởi chạy tệp mới; nếu chính tệp hiện tại nặng (> 40 MB) thì xả sạch các luồng đang chạy
    if (heavyInFlight) {
      await heavyInFlight;
    }
    if (isHeavy) {
      while (activePromises.size > 0) {
        await Promise.race(activePromises);
      }
    } else {
      // Tránh race condition gom kệ lẻ cùng tác giả (D-044): nếu đang tải 1 cuốn lẻ cùng tác giả thì chờ cuốn đó xong trước
      if (standaloneAuthorKey && activeStandaloneAuthorPromises.has(standaloneAuthorKey)) {
        await activeStandaloneAuthorPromises.get(standaloneAuthorKey);
      }
      while (activePromises.size >= MAX_BATCH_UPLOAD_CONCURRENCY) {
        await Promise.race(activePromises);
      }
    }

    if (isStopped() || !isMounted() || authFailed) break;

    onProgress({ completed: completedCount, total: targets.length, currentTitle: current.title });
    onItemPatch(current.id, { status: 'uploading', errorMessage: undefined });

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
    const preferredShelfAuthor = resolveShelfConsistentAuthor(plan.shelf, workingBooks);

    const task: Promise<void> = (async () => {
      try {
        const result = await uploadBook(current.file, {
          title: current.title,
          author: current.author,
          shelf: plan.shelf,
          preferredShelfAuthor,
        });
        if (!isMounted()) return;
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

        onItemPatch(current.id, {
          status: 'done',
          author: result.book.author,
          shelf: result.book.shelf,
          errorMessage: undefined,
        });
      } catch (err) {
        if (!isMounted()) return;
        if (isAuthError(err)) {
          if (!authFailed) {
            authFailed = true;
            onApiError(err, 'Phiên đăng nhập đã hết hạn.');
          }
          return;
        }
        failCount += 1;
        const message =
          err instanceof Error ? err.message : `Không thể tải "${current.title}" lên kho.`;
        onItemPatch(current.id, { status: 'error', errorMessage: message });
      } finally {
        completedCount += 1;
        if (isMounted()) {
          onProgress({ completed: completedCount, total: targets.length, currentTitle: current.title });
        }
      }
    })();

    activePromises.add(task);
    if (isHeavy) heavyInFlight = task;
    if (standaloneAuthorKey) activeStandaloneAuthorPromises.set(standaloneAuthorKey, task);

    void task.finally(() => {
      activePromises.delete(task);
      if (heavyInFlight === task) heavyInFlight = null;
      if (standaloneAuthorKey && activeStandaloneAuthorPromises.get(standaloneAuthorKey) === task) {
        activeStandaloneAuthorPromises.delete(standaloneAuthorKey);
      }
    });
  }

  if (activePromises.size > 0) {
    await Promise.allSettled(activePromises);
  }

  return { successCount, failCount, authFailed, uploadedBookIds };
}
