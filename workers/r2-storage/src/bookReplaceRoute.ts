import { HttpError, ensureDiscordAccessTable } from './auth';
import {
  ACCEPTED_FILE_TYPES,
  type BookRow,
  CONTENT_TYPES,
  type Env,
  MAX_SINGLE_FILE_BYTES,
  assertQuota,
  getLimitBytes,
  getStorageStats,
  isValidId,
} from './booksDb';

export async function handleBookFileReplace(request: Request, env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const fileType = (request.headers.get('X-File-Type') || '').toLowerCase();
  if (!ACCEPTED_FILE_TYPES.has(fileType)) {
    throw new HttpError('Chỉ hỗ trợ định dạng EPUB hoặc DOCX.', 400);
  }

  const declaredSize = Number(
    request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0,
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_SINGLE_FILE_BYTES) {
    throw new HttpError('Kích thước tệp phải nằm trong khoảng 1 byte đến 350 MB.', 400);
  }
  if (!request.body) throw new HttpError('Thiếu nội dung tệp.', 400);

  await ensureDiscordAccessTable(env.DB);
  const [existingRes, booksSumRes, packsSumRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(bookId),
    env.DB.prepare(
      'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
    ),
    env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
  ]);

  const existing = (existingRes.results?.[0] as BookRow | undefined) ?? null;
  if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

  const limitBytes = getLimitBytes(env);
  const preUsedBytes =
    Number((booksSumRes.results?.[0] as { used_bytes?: number } | undefined)?.used_bytes ?? 0) +
    Number((packsSumRes.results?.[0] as { pack_bytes?: number } | undefined)?.pack_bytes ?? 0);
  assertQuota(Math.max(0, preUsedBytes - existing.file_size), declaredSize, limitBytes);

  // QĐ-4A: ghi sang R2 key mới mang version timestamp + hậu tố ngẫu nhiên, giữ nguyên tệp cũ trong suốt lúc tải
  const randSuffix = crypto.randomUUID().slice(0, 8);
  const newFileKey = `books/${bookId}-${Date.now()}-${randSuffix}.${fileType}`;
  const contentType = CONTENT_TYPES[fileType] || 'application/octet-stream';

  const putResult = await env.BOOKS_BUCKET.put(newFileKey, request.body, {
    httpMetadata: { contentType },
  });
  if (!putResult) throw new HttpError('Không thể ghi tệp mới vào R2.', 500);

  if (putResult.size <= 0 || putResult.size > MAX_SINGLE_FILE_BYTES) {
    await env.BOOKS_BUCKET.delete(newFileKey).catch(() => undefined);
    throw new HttpError('Kích thước tệp thực tế phải nằm trong khoảng 1 byte đến 350 MB.', 400);
  }

  let actualPrev: { file_key: string; file_size: number } | null = null;
  let updatedFileKey: string | null = null;
  let postBooksSum: { used_bytes?: number; book_count?: number } | undefined;
  let postPacksSum: { pack_bytes?: number } | undefined;

  try {
    const [prevRes, updateRes, booksAfterRes, packsAfterRes] = await env.DB.batch([
      env.DB.prepare('SELECT file_key, file_size FROM books WHERE id = ?').bind(bookId),
      env.DB.prepare(
        `UPDATE books
         SET file_key = ?, file_type = ?, file_size = ?
         WHERE id = ?
           AND (
             (SELECT COALESCE(SUM(b2.file_size + b2.cover_size), 0) FROM books b2)
             + (SELECT COALESCE(SUM(p2.pack_size), 0) FROM book_guest_packs p2)
             - file_size
             + ?
           ) <= ?
         RETURNING file_key`,
      ).bind(newFileKey, fileType, putResult.size, bookId, putResult.size, limitBytes),
      env.DB.prepare(
        'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
      ),
      env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
    ]);
    actualPrev =
      (prevRes.results?.[0] as { file_key: string; file_size: number } | undefined) ?? null;
    updatedFileKey =
      (updateRes.results?.[0] as { file_key?: string } | undefined)?.file_key ?? null;
    postBooksSum = booksAfterRes.results?.[0] as
      | { used_bytes?: number; book_count?: number }
      | undefined;
    postPacksSum = packsAfterRes.results?.[0] as { pack_bytes?: number } | undefined;
  } catch (dbErr) {
    let shouldDeleteNewKey = false;
    try {
      const committed = await env.DB.prepare('SELECT file_key FROM books WHERE id = ?')
        .bind(bookId)
        .first<{ file_key: string }>();
      shouldDeleteNewKey = !committed || committed.file_key !== newFileKey;
    } catch {
      shouldDeleteNewKey = false;
    }
    if (shouldDeleteNewKey) {
      await env.BOOKS_BUCKET.delete(newFileKey).catch(() => undefined);
    }
    throw dbErr;
  }

  const usedBytesAfterUpdate =
    Number(postBooksSum?.used_bytes ?? 0) + Number(postPacksSum?.pack_bytes ?? 0);
  if (updatedFileKey !== newFileKey) {
    await env.BOOKS_BUCKET.delete(newFileKey).catch(() => undefined);
    if (!actualPrev) {
      throw new HttpError('Không tìm thấy sách.', 404);
    }
    assertQuota(
      Math.max(0, usedBytesAfterUpdate - actualPrev.file_size),
      putResult.size,
      limitBytes,
    );
    throw new HttpError('Không thể cập nhật tệp sách trong cơ sở dữ liệu.', 500);
  }

  // Chỉ xoá tệp R2 cũ & gói guest-pack cũ (vì byte-offset ảnh trỏ vào tệp cũ) sau khi D1 commit thành công
  let stalePackKey: string | null = null;
  try {
    const stalePackRow = await env.DB.prepare(
      'SELECT pack_key FROM book_guest_packs WHERE book_id = ?',
    )
      .bind(bookId)
      .first<{ pack_key: string }>();
    if (stalePackRow?.pack_key) {
      stalePackKey = stalePackRow.pack_key;
      await env.DB.prepare('DELETE FROM book_guest_packs WHERE book_id = ?').bind(bookId).run();
    }
  } catch {
    stalePackKey = null;
  }

  const keysToDelete = [
    actualPrev?.file_key && actualPrev.file_key !== newFileKey ? actualPrev.file_key : null,
    stalePackKey,
  ].filter((key): key is string => Boolean(key));
  if (keysToDelete.length > 0) {
    await env.BOOKS_BUCKET.delete(keysToDelete).catch(() => undefined);
  }

  const storage = stalePackKey
    ? await getStorageStats(env)
    : {
        usedBytes: usedBytesAfterUpdate,
        limitBytes,
        remainingBytes: Math.max(0, limitBytes - usedBytesAfterUpdate),
        bookCount: Number(postBooksSum?.book_count ?? 0),
      };

  const updatedBook: BookRow & { guest_ready: boolean } = {
    ...existing,
    file_key: newFileKey,
    file_type: fileType as 'epub' | 'docx',
    file_size: putResult.size,
    guest_ready: false,
  };

  return {
    book: updatedBook,
    previousFileKey: actualPrev?.file_key ?? existing.file_key,
    storage,
  };
}
