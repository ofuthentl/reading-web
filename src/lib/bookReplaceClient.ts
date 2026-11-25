import type { Book, BookFileType, StorageStats } from '@/types';
import { apiFetch, assertApiConfigured, isAuthError, isCloudMode } from '@/lib/authSession';
import { HARD_LIMIT_BYTES, computeLocalStorageStats } from '@/lib/bookUploadClient';
import {
  deleteCachedBookBlob,
  deleteCachedCoverBlob,
  getLocalBooks,
  isConstrainedMobileDevice,
  isValidZipBookBlob,
  pruneMobileBookCache,
  putLocalBook,
  setCachedBookBlob,
  setCachedCoverBlob,
} from '@/lib/cache';
import { isChunkLoadError } from '@/lib/chunkReload';
import { parseFileMetadata } from '@/lib/seriesShelfExtractor';

export interface ReplaceBookFileOptions {
  updateCoverFromFile?: boolean;
  onStageChange?: (stageLabel: string) => void;
}

export interface ReplaceBookFileResult {
  book: Book;
  storage: StorageStats;
  warnings?: string[];
  quotaExceeded?: boolean;
}

const MAX_REPLACE_FILE_BYTES = 350 * 1024 * 1024;

export async function replaceBookFile(
  book: Book,
  file: File,
  options?: ReplaceBookFileOptions,
): Promise<ReplaceBookFileResult> {
  assertApiConfigured();

  const parsed = parseFileMetadata(file.name);
  if (!parsed.extension) {
    throw new Error(`${file.name}: chỉ hỗ trợ EPUB hoặc DOCX.`);
  }
  if (file.size <= 0 || file.size > MAX_REPLACE_FILE_BYTES) {
    throw new Error(`${file.name}: kích thước tệp phải nằm trong khoảng 1 byte đến 350 MB.`);
  }
  if (!(await isValidZipBookBlob(file))) {
    throw new Error(`${file.name}: tệp bị hỏng hoặc không đúng chuẩn nén ZIP của EPUB/DOCX.`);
  }

  const fileType: BookFileType = parsed.extension;
  const updateCover = Boolean(options?.updateCoverFromFile);
  const setStage = options?.onStageChange;

  let coverBlob: Blob | null = null;
  let preloadedArrayBuffer: ArrayBuffer | undefined;
  let preloadedZip:
    | Awaited<ReturnType<typeof import('@/lib/parsers')['extractUploadMetadata']>>['zip']
    | undefined;

  if (updateCover || isCloudMode) {
    setStage?.('Đang đọc cấu trúc tệp sách mới...');
    try {
      const { extractUploadMetadata } = await import('@/lib/parsers');
      const extracted = await extractUploadMetadata(file, fileType, { keepZip: isCloudMode });
      coverBlob = updateCover ? extracted.coverBlob : null;
      preloadedArrayBuffer = extracted.arrayBuffer;
      preloadedZip = extracted.zip;
    } catch (err) {
      if (isChunkLoadError(err)) {
        throw new Error(
          'Ứng dụng vừa được cập nhật hoặc mất kết nối. Vui lòng tải lại trang rồi thử lại.',
        );
      }
      coverBlob = null;
    }
  }

  if (!isCloudMode) {
    const existingBooks = await getLocalBooks();
    const currentStats = await computeLocalStorageStats(existingBooks);
    const nextCoverSize = updateCover && coverBlob ? coverBlob.size : book.cover_size || 0;
    const projectedBytes =
      Math.max(0, currentStats.usedBytes - (book.file_size || 0) - (book.cover_size || 0)) +
      file.size +
      nextCoverSize;
    if (projectedBytes > HARD_LIMIT_BYTES) {
      throw new Error('Kho đã chạm giới hạn an toàn 9.0 GB.');
    }

    const nextFileKey = `books/${book.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${fileType}`;
    await setCachedBookBlob(nextFileKey, file, true);
    if (book.file_key && book.file_key !== nextFileKey) {
      await deleteCachedBookBlob(book.file_key);
    }

    let nextCoverKey = book.cover_key;
    const warnings: string[] = [];
    if (updateCover) {
      if (coverBlob) {
        const candidateCoverKey = `covers/${book.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-v2.jpg`;
        await setCachedCoverBlob(candidateCoverKey, coverBlob);
        if (book.cover_key && book.cover_key !== candidateCoverKey) {
          await deleteCachedCoverBlob(book.cover_key);
        }
        nextCoverKey = candidateCoverKey;
      } else {
        warnings.push('tệp mới không có ảnh bìa nhúng — giữ nguyên ảnh bìa cũ');
      }
    }

    const updatedBook: Book = {
      ...book,
      file_key: nextFileKey,
      file_type: fileType,
      file_size: file.size,
      cover_key: nextCoverKey,
      cover_size: nextCoverSize,
      guest_ready: true,
    };
    await putLocalBook(updatedBook);
    const updatedBooks = await getLocalBooks();
    return {
      book: updatedBook,
      storage: await computeLocalStorageStats(updatedBooks),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // Dựng trước gói khách OFGP song song với lúc đẩy tệp mới lên R2 (giữ tệp cũ sống suốt lúc tải)
  const packAbortController = new AbortController();
  let packBuildError: unknown = null;
  const draftBookForPack: Book = {
    ...book,
    file_type: fileType,
    file_size: file.size,
  };
  const packBuilderModPromise = import('@/lib/guestPackBuilder').catch((err) => {
    packBuildError = err;
    return null;
  });
  const prebuiltPackPromise: Promise<Uint8Array | null> = packBuilderModPromise
    .then((mod) =>
      mod
        ? mod.buildGuestPackEnvelope(file, draftBookForPack, {
            arrayBuffer: preloadedArrayBuffer,
            zip: preloadedZip,
            signal: packAbortController.signal,
          })
        : null,
    )
    .catch((err) => {
      packBuildError = err;
      return null;
    });

  setStage?.('Đang tải tệp mới lên R2 (giữ nguyên dữ liệu sách)...');
  let replaceData: {
    book?: Book;
    previousFileKey?: string;
    storage?: StorageStats;
    error?: string;
  };
  try {
    const replaceRes = await apiFetch(`/api/books/${book.id}/replace-file`, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Type': fileType,
        'X-File-Size': String(file.size),
      },
      body: file,
    });
    replaceData = (await replaceRes.json().catch(() => ({}))) as typeof replaceData;
    if (!replaceRes.ok || !replaceData.book) {
      throw new Error(replaceData.error || `Không thể thay tệp mới cho "${book.title}".`);
    }
  } catch (err) {
    packAbortController.abort();
    preloadedArrayBuffer = undefined;
    preloadedZip = undefined;
    void prebuiltPackPromise.catch(() => null);
    throw err;
  }

  let finalBook: Book = replaceData.book;
  let finalStorage: StorageStats = replaceData.storage ?? {
    usedBytes: 0,
    limitBytes: HARD_LIMIT_BYTES,
    remainingBytes: HARD_LIMIT_BYTES,
    bookCount: 0,
  };

  // Xoá cache IndexedDB của file_key cũ và ghi nền file_key mới
  const oldFileKey = replaceData.previousFileKey || book.file_key;
  if (oldFileKey && oldFileKey !== finalBook.file_key) {
    await deleteCachedBookBlob(oldFileKey).catch(() => undefined);
  }
  const cacheNewBlob = isConstrainedMobileDevice()
    ? pruneMobileBookCache(finalBook.file_key, file.size).then(() =>
        setCachedBookBlob(finalBook.file_key, file),
      )
    : setCachedBookBlob(finalBook.file_key, file);
  void cacheNewBlob.catch(() => undefined);

  setStage?.(
    updateCover && coverBlob
      ? 'Đang cập nhật ảnh bìa & gói bảo mật khách...'
      : 'Đang dựng & cập nhật gói bảo mật khách...',
  );

  type PostStepResult = {
    book?: Book;
    storage?: StorageStats;
    ready?: boolean;
    warning?: string;
    quotaExceeded?: boolean;
    authError?: unknown;
  };

  const warnings: string[] = [];
  if (updateCover && !coverBlob) {
    warnings.push('tệp mới không có ảnh bìa nhúng — giữ nguyên ảnh bìa cũ');
  }

  const coverTask: Promise<PostStepResult | null> =
    updateCover && coverBlob
      ? (async () => {
          try {
            const coverRes = await apiFetch(`/api/books/${book.id}/cover`, {
              method: 'PUT',
              headers: { 'Content-Type': 'image/jpeg', 'X-File-Size': String(coverBlob.size) },
              body: coverBlob,
            });
            const coverData = (await coverRes.json().catch(() => ({}))) as {
              book?: Book;
              storage?: StorageStats;
              error?: string;
            };
            if (coverRes.ok && coverData.book) {
              if (book.cover_key && book.cover_key !== coverData.book.cover_key) {
                void deleteCachedCoverBlob(book.cover_key).catch(() => undefined);
              }
              if (coverData.book.cover_key) {
                void setCachedCoverBlob(coverData.book.cover_key, coverBlob).catch(() => undefined);
              }
              return coverData;
            }
            const reason = coverData.error || `HTTP ${coverRes.status}`;
            return {
              warning: `chưa cập nhật được ảnh bìa từ tệp mới (${reason})`,
              quotaExceeded: coverRes.status === 413,
            };
          } catch (err) {
            if (isAuthError(err)) return { authError: err };
            const reason = err instanceof Error ? err.message : 'lỗi mạng';
            return { warning: `chưa cập nhật được ảnh bìa từ tệp mới (${reason})` };
          }
        })()
      : Promise.resolve(null);

  const packTask: Promise<PostStepResult> = (async () => {
    try {
      const [mod, envelope] = await Promise.all([packBuilderModPromise, prebuiltPackPromise]);
      preloadedArrayBuffer = undefined;
      preloadedZip = undefined;
      if (!mod || !envelope) {
        const reason =
          packBuildError instanceof Error ? packBuildError.message : 'không dựng được gói';
        return { ready: false, warning: `chưa tạo lại được gói khách (${reason})` };
      }
      const packRes = await mod.uploadGuestPackEnvelope(book.id, envelope);
      return { ready: true, storage: packRes.storage };
    } catch (err) {
      preloadedArrayBuffer = undefined;
      preloadedZip = undefined;
      if (isAuthError(err)) return { ready: false, authError: err };
      const status = (err as { status?: number } | null)?.status;
      const reason = err instanceof Error ? err.message : 'lỗi máy chủ';
      return {
        ready: false,
        warning: `chưa tải lại được gói khách (${reason})`,
        quotaExceeded: status === 413,
      };
    }
  })();

  const [coverResult, packResult] = await Promise.all([coverTask, packTask]);
  if (coverResult?.authError) throw coverResult.authError;
  if (packResult.authError) throw packResult.authError;

  if (coverResult?.book) {
    finalBook = {
      ...finalBook,
      cover_key: coverResult.book.cover_key,
      cover_size: coverResult.book.cover_size,
    };
  }
  finalBook = { ...finalBook, guest_ready: Boolean(packResult.ready) };

  if (coverResult?.warning) warnings.push(coverResult.warning);
  if (packResult.warning) warnings.push(packResult.warning);
  const quotaExceeded = Boolean(coverResult?.quotaExceeded || packResult.quotaExceeded);

  if (coverResult?.storage && packResult.storage) {
    // Cả cover & pack chạy song song nên kéo lại snapshot /api/storage để tổng dung lượng chính xác tuyệt đối
    const latestRes = await apiFetch('/api/storage').catch(() => null);
    const latestStorage = latestRes?.ok
      ? ((await latestRes.json().catch(() => null)) as StorageStats | null)
      : null;
    finalStorage = latestStorage ?? packResult.storage;
  } else if (packResult.storage) {
    finalStorage = packResult.storage;
  } else if (coverResult?.storage) {
    finalStorage = coverResult.storage;
  }

  return {
    book: finalBook,
    storage: finalStorage,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(quotaExceeded ? { quotaExceeded: true } : {}),
  };
}
