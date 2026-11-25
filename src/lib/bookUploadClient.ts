import type { Book, BookFileType, StorageStats } from '@/types';
import { apiFetch, assertApiConfigured, isAuthError, isCloudMode } from '@/lib/authSession';
import { pickCoverColor } from '@/lib/bookMetadata';
import {
  getLocalBooks,
  putLocalBook,
  setCachedBookBlob,
  setCachedCoverBlob,
} from '@/lib/cache';
import { isChunkLoadError } from '@/lib/chunkReload';
import { parseFileMetadata } from '@/lib/seriesShelfExtractor';
import { isKnownAuthor } from '@/lib/shelfPlacement';

export const HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024;
export const MAX_SHELF_NAME_LENGTH = 120;

export async function computeLocalStorageStats(books: Book[]): Promise<StorageStats> {
  const usedBytes = books.reduce((sum, b) => sum + (b.file_size || 0) + (b.cover_size || 0), 0);
  return {
    usedBytes,
    limitBytes: HARD_LIMIT_BYTES,
    remainingBytes: Math.max(0, HARD_LIMIT_BYTES - usedBytes),
    bookCount: books.length,
  };
}

export interface UploadBookResult {
  book: Book;
  storage: StorageStats;
  warnings?: string[];
  quotaExceeded?: boolean;
}

export async function uploadBook(
  file: File,
  overrides?: { title?: string; author?: string; shelf?: string; preferredShelfAuthor?: string | null },
): Promise<UploadBookResult> {
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
  const shelf = (overrides?.shelf?.trim() || parsed.shelf).slice(0, MAX_SHELF_NAME_LENGTH);
  const fileType: BookFileType = parsed.extension;

  let coverBlob: Blob | null = null;
  let extractedAuthor: string | null = null;
  let preloadedArrayBuffer: ArrayBuffer | undefined;
  let preloadedZip: Awaited<ReturnType<typeof import('@/lib/parsers')['extractUploadMetadata']>>['zip'];
  try {
    const { extractUploadMetadata } = await import('@/lib/parsers');
    const extracted = await extractUploadMetadata(file, fileType, { keepZip: isCloudMode });
    coverBlob = extracted.coverBlob;
    extractedAuthor = extracted.author;
    preloadedArrayBuffer = extracted.arrayBuffer;
    preloadedZip = extracted.zip;
  } catch (err) {
    if (isChunkLoadError(err)) {
      throw new Error(
        'Ứng dụng vừa được cập nhật hoặc mất kết nối. Vui lòng tải lại trang rồi thử lại.',
      );
    }
    coverBlob = null;
    extractedAuthor = null;
  }

  // QĐ-1A: ưu tiên (1) tác giả thống nhất của kệ đích → (2) <dc:creator> sạch trong EPUB/DOCX
  // → (3) tác giả hợp lệ tách từ tên file → (4) Không rõ tác giả
  const preferredShelfAuthor = overrides?.preferredShelfAuthor?.trim() || '';
  const fallbackFileAuthor = overrides?.author?.trim() || parsed.author;
  const author =
    (preferredShelfAuthor && isKnownAuthor(preferredShelfAuthor) ? preferredShelfAuthor : '') ||
    (extractedAuthor && isKnownAuthor(extractedAuthor) ? extractedAuthor : '') ||
    (isKnownAuthor(fallbackFileAuthor) ? fallbackFileAuthor : 'Không rõ tác giả');
  const coverColor = pickCoverColor(`${title}-${author}`);

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

  const supportsGuestPack = fileType === 'epub' || fileType === 'docx';
  const draftBookForPack: Book = {
    id: bookId,
    title,
    author,
    shelf,
    description: null,
    cover_color: coverColor,
    cover_key: null,
    file_key: `books/${bookId}.${fileType}`,
    file_type: fileType,
    file_size: file.size,
    cover_size: 0,
    created_at: new Date().toISOString(),
  };

  // QĐ-2A: dựng gói khách trên CPU (tái sử dụng ZIP đã mở) song song với tải tệp gốc lên R2
  const packAbortController = new AbortController();
  let packBuildError: unknown = null;
  const packBuilderModPromise = supportsGuestPack
    ? import('@/lib/guestPackBuilder').catch((err) => {
        packBuildError = err;
        return null;
      })
    : Promise.resolve(null);
  const prebuiltPackPromise: Promise<Uint8Array | null> = supportsGuestPack
    ? packBuilderModPromise
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
        })
    : Promise.resolve(null);

  let uploadData: { book?: Book; storage?: StorageStats; error?: string };
  try {
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
    uploadData = (await uploadRes.json().catch(() => ({}))) as {
      book?: Book;
      storage?: StorageStats;
      error?: string;
    };
    if (!uploadRes.ok || !uploadData.book) {
      throw new Error(uploadData.error || `Không thể tải ${file.name} lên R2.`);
    }
  } catch (err) {
    // Huỷ dựng gói khách ngay & giải phóng tham chiếu ZIP/ArrayBuffer khi tải tệp gốc thất bại
    packAbortController.abort();
    preloadedArrayBuffer = undefined;
    preloadedZip = undefined;
    void prebuiltPackPromise.catch(() => null);
    throw err;
  }

  let finalBook = uploadData.book;
  let finalStorage = uploadData.storage!;

  // Ghi cache IndexedDB ở nền để không chặn lượt tải ảnh bìa & gói khách kế tiếp
  void setCachedBookBlob(finalBook.file_key, file).catch(() => undefined);

  // QĐ-2A: tải song song ảnh bìa VÀ gói bảo mật khách (cả hai đều độc lập trên Worker)
  type PostUploadStepResult = {
    book?: Book;
    storage?: StorageStats;
    ready?: boolean;
    warning?: string;
    quotaExceeded?: boolean;
    authError?: unknown;
  };

  const coverTask: Promise<PostUploadStepResult | null> = coverBlob
    ? (async () => {
        try {
          const coverRes = await apiFetch(`/api/books/${bookId}/cover`, {
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
            if (coverData.book.cover_key) {
              void setCachedCoverBlob(coverData.book.cover_key, coverBlob).catch(() => undefined);
            }
            return coverData;
          }
          const reason = coverData.error || `HTTP ${coverRes.status}`;
          return {
            warning: `chưa lưu được ảnh bìa (${reason})`,
            quotaExceeded: coverRes.status === 413,
          };
        } catch (err) {
          if (isAuthError(err)) return { authError: err };
          const reason = err instanceof Error ? err.message : 'lỗi mạng';
          return { warning: `chưa lưu được ảnh bìa (${reason})` };
        }
      })()
    : Promise.resolve(null);

  const packTask: Promise<PostUploadStepResult> = supportsGuestPack
    ? (async () => {
        try {
          const [mod, envelope] = await Promise.all([packBuilderModPromise, prebuiltPackPromise]);
          preloadedArrayBuffer = undefined;
          preloadedZip = undefined;
          if (!mod || !envelope) {
            const reason =
              packBuildError instanceof Error ? packBuildError.message : 'không dựng được gói';
            return { ready: false, warning: `chưa tạo được gói khách (${reason})` };
          }
          const packRes = await mod.uploadGuestPackEnvelope(bookId, envelope);
          return { ready: true, storage: packRes.storage };
        } catch (err) {
          preloadedArrayBuffer = undefined;
          preloadedZip = undefined;
          if (isAuthError(err)) return { ready: false, authError: err };
          const status = (err as { status?: number } | null)?.status;
          const reason = err instanceof Error ? err.message : 'lỗi máy chủ';
          return {
            ready: false,
            warning: `chưa tải được gói khách (${reason})`,
            quotaExceeded: status === 413,
          };
        }
      })()
    : Promise.resolve({ ready: false });

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

  const warnings: string[] = [];
  if (coverResult?.warning) warnings.push(coverResult.warning);
  if (packResult.warning) warnings.push(packResult.warning);
  const quotaExceeded = Boolean(coverResult?.quotaExceeded || packResult.quotaExceeded);

  for (const candidate of [coverResult?.storage, packResult.storage]) {
    if (
      candidate &&
      (candidate.bookCount > finalStorage.bookCount ||
        (candidate.bookCount === finalStorage.bookCount &&
          candidate.usedBytes >= finalStorage.usedBytes))
    ) {
      finalStorage = candidate;
    }
  }

  return {
    book: finalBook,
    storage: finalStorage,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(quotaExceeded ? { quotaExceeded: true } : {}),
  };
}
