import type { Book } from '@/types';
import { announceDiscordReleasesApi } from '@/lib/apiAdminMutations';
import { isAuthError } from '@/lib/authSession';
import { bookDuplicateKey, parseFileMetadata } from '@/lib/bookMetadata';
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

export async function triggerDiscordReleaseAnnouncement(
  uploadedBookIds: string[],
  onNotify: (message: string, type?: ToastType) => void,
  onApiError: (err: unknown, fallbackMessage: string) => void,
): Promise<void> {
  if (uploadedBookIds.length === 0) return;
  try {
    const result = await announceDiscordReleasesApi(uploadedBookIds);
    if (result.ok && result.announcedGroups > 0) {
      onNotify(result.message, 'success');
    } else if (!result.configured) {
      onNotify(result.message, 'warning');
    } else {
      onNotify(result.message, 'warning');
    }
  } catch (err) {
    if (isAuthError(err)) {
      onApiError(err, 'Phiên đăng nhập đã hết hạn.');
      return;
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'Không thể gửi thông báo tập mới lên Discord.';
    onNotify(`Tải sách xong nhưng thông báo Discord gặp lỗi: ${msg}`, 'warning');
  }
}
