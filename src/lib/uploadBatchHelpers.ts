import type { Book, StorageStats } from '@/types';
import { updateBookMetadata, uploadBook } from '@/lib/api';
import { announceDiscordReleasesApi, fetchLatestStorageStats } from '@/lib/apiAdminMutations';
import { isAuthError, isCloudMode } from '@/lib/authSession';
import { stripDiacriticsLower } from '@/lib/authorHeuristics';
import { getBookSortTitle } from '@/lib/bookMetadata';
import {
  bookDuplicateKey,
  extractSeriesName,
  normalizeBookTitleDuplicateKey,
  parseFileMetadata,
} from '@/lib/seriesShelfExtractor';
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
const UNCLASSIFIED_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK_NORM = 'sách chưa đặt tên';
const TITLE_DUP_PREFIX = '__title__::';

function toTitleDuplicateKey(title: string): string | null {
  const norm = normalizeBookTitleDuplicateKey(title);
  return norm && norm !== UNTITLED_BOOK_NORM ? `${TITLE_DUP_PREFIX}${norm}` : null;
}

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
  const queuedKeys = new Set<string>();
  for (const item of existingQueue) {
    if (item.status === 'invalid') continue;
    queuedKeys.add(item.duplicateKey);
    const titleKey = toTitleDuplicateKey(item.title);
    if (titleKey) queuedKeys.add(titleKey);
  }

  const parsedEntries = files.map((file) => ({ file, ...parseFileMetadata(file.name) }));
  healBatchParsedMetadata(parsedEntries);

  return parsedEntries.map(({ file, ...parsed }) => {
    const duplicateKey = bookDuplicateKey(parsed.title, parsed.author);
    const titleKey = toTitleDuplicateKey(parsed.title);
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

    const isLibraryDup =
      libraryKeys.has(duplicateKey) || Boolean(titleKey && libraryKeys.has(titleKey));
    const isQueueDup =
      queuedKeys.has(duplicateKey) || Boolean(titleKey && queuedKeys.has(titleKey));
    const duplicateReason = isLibraryDup ? 'library' : isQueueDup ? 'queue' : null;
    queuedKeys.add(duplicateKey);
    if (titleKey) queuedKeys.add(titleKey);
    return { ...base, duplicateReason, status: duplicateReason ? 'skipped' : 'queued' };
  });
}

export function buildLibraryDuplicateKeys(books: readonly Book[]): Set<string> {
  const keys = new Set<string>();
  for (const book of books) {
    keys.add(bookDuplicateKey(book.title, book.author));
    const rawTitleKey = toTitleDuplicateKey(book.title);
    if (rawTitleKey) keys.add(rawTitleKey);
    const sortTitleKey = toTitleDuplicateKey(getBookSortTitle(book));
    if (sortTitleKey) keys.add(sortTitleKey);
  }
  return keys;
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
  onStorageSynced?: (storage: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

const MAX_BATCH_UPLOAD_CONCURRENCY = 2;
const HEAVY_UPLOAD_THRESHOLD_BYTES = 40 * 1024 * 1024; // > 40 MB hạ về 1 luồng để kiểm soát RAM (QĐ-2A)

export async function executeSequentialUploadBatch(
  options: ExecuteUploadBatchOptions,
): Promise<{
  successCount: number;
  failCount: number;
  warningCount: number;
  quotaExceeded: boolean;
  authFailed: boolean;
  uploadedBookIds: string[];
}> {
  const {
    targets, existingBooks, batchShelfForRun, isStopped, isMounted,
    onProgress, onItemPatch, onBookUploaded, onBookUpdated, onStorageSynced, onApiError,
  } = options;

  let successCount = 0;
  let failCount = 0;
  let warningCount = 0;
  let completedCount = 0;
  let authFailed = false;
  let quotaExceeded = false;
  const uploadedBookIds: string[] = [];
  const workingBooks = [...existingBooks];
  const activePromises = new Set<Promise<void>>();
  const activeStandalonePromises = new Set<Promise<void>>();
  const activeStandaloneAuthorPromises = new Map<string, Promise<void>>();
  const activeNewShelfPromises = new Map<string, Promise<void>>();
  let activeAuthorlessStandalone: Promise<void> | null = null;
  let heavyInFlight: Promise<void> | null = null;
  const unclassifiedMatchKey = normalizeShelfMatchKey(UNCLASSIFIED_SHELF);

  const computePlanFor = (item: UploadQueueItem) => {
    const autoPlan = resolveUploadShelfPlan(
      { title: item.title, author: item.author },
      workingBooks,
    );
    return batchShelfForRun
      ? {
          shelf: batchShelfForRun,
          booksToRegroup:
            autoPlan.shelf.toLocaleLowerCase('vi') === batchShelfForRun.toLocaleLowerCase('vi')
              ? autoPlan.booksToRegroup
              : ([] as Book[]),
        }
      : autoPlan;
  };

  for (let index = 0; index < targets.length; index += 1) {
    if (isStopped() || !isMounted() || authFailed || quotaExceeded) break;
    const current = targets[index];
    const isHeavy = current.file.size > HEAVY_UPLOAD_THRESHOLD_BYTES;
    const isStandalone = !batchShelfForRun && extractSeriesName(current.title) === null;
    const standaloneAuthorKey =
      isStandalone && isKnownAuthor(current.author)
        ? normalizeShelfPlacementKey(current.author) || null
        : null;
    const isAuthorlessStandalone = isStandalone && !standaloneAuthorKey;

    // Chờ các rào cản đồng bộ: tệp nặng (> 40 MB), tập lẻ chưa rõ tác giả/cùng tác giả,
    // hoặc cuốn thứ 2 thuộc cùng 1 bộ MỚI chưa có trên kệ (để kế thừa đúng <dc:creator> từ cuốn đầu).
    while (!isStopped() && isMounted() && !authFailed && !quotaExceeded) {
      if (heavyInFlight) {
        await heavyInFlight;
        continue;
      }
      if (isHeavy && activePromises.size > 0) {
        await Promise.race(activePromises);
        continue;
      }
      if (isAuthorlessStandalone && activeStandalonePromises.size > 0) {
        await Promise.race(activeStandalonePromises);
        continue;
      }
      if (isStandalone && activeAuthorlessStandalone) {
        await activeAuthorlessStandalone;
        continue;
      }
      if (standaloneAuthorKey && activeStandaloneAuthorPromises.has(standaloneAuthorKey)) {
        await activeStandaloneAuthorPromises.get(standaloneAuthorKey);
        continue;
      }
      const prelimShelfKey = normalizeShelfMatchKey(computePlanFor(current).shelf);
      if (prelimShelfKey && activeNewShelfPromises.has(prelimShelfKey)) {
        await activeNewShelfPromises.get(prelimShelfKey);
        continue;
      }
      if (!isHeavy && activePromises.size >= MAX_BATCH_UPLOAD_CONCURRENCY) {
        await Promise.race(activePromises);
        continue;
      }
      break;
    }

    if (isStopped() || !isMounted() || authFailed || quotaExceeded) break;

    onProgress({ completed: completedCount, total: targets.length, currentTitle: current.title });
    onItemPatch(current.id, { status: 'uploading', errorMessage: undefined, warningMessage: undefined });

    const plan = computePlanFor(current);
    const planShelfKey = normalizeShelfMatchKey(plan.shelf);
    const isNewShelf = Boolean(
      planShelfKey &&
        planShelfKey !== unclassifiedMatchKey &&
        !workingBooks.some((b) => normalizeShelfMatchKey(b.shelf || '') === planShelfKey),
    );
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

        const booksBeforeSelf = workingBooks.slice();
        let savedBook = result.book;
        workingBooks.push(savedBook);
        onBookUploaded(savedBook, result.storage);

        const peersToRegroup = [...plan.booksToRegroup];
        let finalShelf = plan.shelf;
        // Nếu tập lẻ ban đầu không có tác giả trên tên file nhưng đã trích được <dc:creator>,
        // tính lại kế hoạch gom kệ lẻ cùng tác giả để gom nhóm nhất quán (D-044).
        if (isAuthorlessStandalone && isKnownAuthor(savedBook.author)) {
          const postPlan = resolveUploadShelfPlan(
            { title: savedBook.title, author: savedBook.author },
            booksBeforeSelf,
          );
          if (normalizeShelfMatchKey(postPlan.shelf) !== normalizeShelfMatchKey(savedBook.shelf)) {
            finalShelf = postPlan.shelf;
            try {
              const movedSelf = await updateBookMetadata(savedBook.id, { shelf: postPlan.shelf });
              savedBook = movedSelf;
              const selfIdx = workingBooks.findIndex((b) => b.id === movedSelf.id);
              if (selfIdx >= 0) workingBooks[selfIdx] = movedSelf;
              if (isMounted()) onBookUpdated(movedSelf);
              peersToRegroup.push(...postPlan.booksToRegroup);
            } catch (selfMoveErr) {
              if (isAuthError(selfMoveErr)) throw selfMoveErr;
            }
          }
        }

        for (const peer of peersToRegroup) {
          try {
            const moved = await updateBookMetadata(peer.id, { shelf: finalShelf });
            const idx = workingBooks.findIndex((b) => b.id === moved.id);
            if (idx >= 0) workingBooks[idx] = moved;
            if (isMounted()) onBookUpdated(moved);
          } catch (regroupErr) {
            if (isAuthError(regroupErr)) throw regroupErr;
          }
        }

        const warningMessage =
          result.warnings && result.warnings.length > 0 ? result.warnings.join(' · ') : undefined;
        if (warningMessage) warningCount += 1;
        if (result.quotaExceeded) quotaExceeded = true;

        onItemPatch(current.id, {
          status: 'done',
          author: savedBook.author,
          shelf: savedBook.shelf,
          errorMessage: undefined,
          warningMessage,
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
    if (isStandalone) activeStandalonePromises.add(task);
    if (isAuthorlessStandalone) activeAuthorlessStandalone = task;
    if (standaloneAuthorKey) activeStandaloneAuthorPromises.set(standaloneAuthorKey, task);
    if (isNewShelf && planShelfKey) activeNewShelfPromises.set(planShelfKey, task);

    void task.finally(() => {
      activePromises.delete(task);
      activeStandalonePromises.delete(task);
      if (heavyInFlight === task) heavyInFlight = null;
      if (activeAuthorlessStandalone === task) activeAuthorlessStandalone = null;
      if (standaloneAuthorKey && activeStandaloneAuthorPromises.get(standaloneAuthorKey) === task) {
        activeStandaloneAuthorPromises.delete(standaloneAuthorKey);
      }
      if (isNewShelf && planShelfKey && activeNewShelfPromises.get(planShelfKey) === task) {
        activeNewShelfPromises.delete(planShelfKey);
      }
    });
  }

  if (activePromises.size > 0) {
    await Promise.allSettled(activePromises);
  }

  // Đồng bộ lại dung lượng chuẩn từ máy chủ sau lô song song nhiều cuốn (tránh sai số nhỏ giữa cover/pack)
  if (successCount > 1 && isCloudMode && !authFailed && isMounted() && onStorageSynced) {
    try {
      const latest = await fetchLatestStorageStats();
      if (latest && isMounted()) onStorageSynced(latest);
    } catch (err) {
      if (isAuthError(err)) {
        authFailed = true;
        onApiError(err, 'Phiên đăng nhập đã hết hạn.');
      }
    }
  }

  return { successCount, failCount, warningCount, quotaExceeded, authFailed, uploadedBookIds };
}
