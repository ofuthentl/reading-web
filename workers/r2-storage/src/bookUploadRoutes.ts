import { HttpError, ensureDiscordAccessTable } from './auth';
import {
  ACCEPTED_FILE_TYPES,
  type BookRow,
  CONTENT_TYPES,
  type Env,
  MAX_COVER_BYTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_SHELF_NAME_LENGTH,
  MAX_SINGLE_FILE_BYTES,
  MAX_TEXT_FIELD_LENGTH,
  assertQuota,
  clearStaleShelfCoverForBook,
  getLimitBytes,
  isValidId,
  safeDecodeHeader,
} from './booksDb';
import { cleanupOrphanShelves } from './shelfMutationsDb';
import { toShelfAccessKey } from './shelfAccessDb';

export async function handleBookFileUpload(request: Request, env: Env, bookId: string) {
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
    env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(bookId),
    env.DB.prepare(
      'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
    ),
    env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
  ]);
  if (existingRes.results?.[0]) {
    throw new HttpError('Sách với ID này đã tồn tại.', 409);
  }

  const limitBytes = getLimitBytes(env);
  const preUsedBytes =
    Number((booksSumRes.results?.[0] as { used_bytes?: number } | undefined)?.used_bytes ?? 0) +
    Number((packsSumRes.results?.[0] as { pack_bytes?: number } | undefined)?.pack_bytes ?? 0);
  assertQuota(preUsedBytes, declaredSize, limitBytes);

  const title = safeDecodeHeader(
    request.headers.get('X-Book-Title'),
    'Sách chưa đặt tên',
  )
    .normalize('NFC')
    .slice(0, MAX_TEXT_FIELD_LENGTH);
  const author = safeDecodeHeader(
    request.headers.get('X-Book-Author'),
    'Không rõ tác giả',
  )
    .normalize('NFC')
    .slice(0, MAX_TEXT_FIELD_LENGTH);
  const shelf = safeDecodeHeader(
    request.headers.get('X-Book-Shelf'),
    'Kho chưa phân loại',
  )
    .normalize('NFC')
    .slice(0, MAX_SHELF_NAME_LENGTH);
  const coverColor = safeDecodeHeader(request.headers.get('X-Cover-Color'), '#4f46e5').slice(0, 32);
  const randSuffix = crypto.randomUUID().slice(0, 8);
  const fileKey = `books/${bookId}-${Date.now()}-${randSuffix}.${fileType}`;
  const contentType = CONTENT_TYPES[fileType] || 'application/octet-stream';

  const putResult = await env.BOOKS_BUCKET.put(fileKey, request.body, {
    httpMetadata: { contentType },
  });
  if (!putResult) throw new HttpError('Không thể ghi tệp vào R2.', 500);

  if (putResult.size <= 0 || putResult.size > MAX_SINGLE_FILE_BYTES) {
    await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    throw new HttpError('Kích thước tệp thực tế phải nằm trong khoảng 1 byte đến 350 MB.', 400);
  }

  const createdAt = new Date().toISOString();
  let insertedFileKey: string | null = null;
  let existingAfterId: string | null = null;
  let postBooksSum: { used_bytes?: number; book_count?: number } | undefined;
  let postPacksSum: { pack_bytes?: number } | undefined;
  try {
    const [insertRes, existingAfterRes, booksAfterRes, packsAfterRes] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO books (id, title, author, shelf, cover_color, file_key, file_type, file_size, cover_size, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
         WHERE NOT EXISTS (SELECT 1 FROM books WHERE id = ?)
           AND (
             (SELECT COALESCE(SUM(b2.file_size + b2.cover_size), 0) FROM books b2)
             + (SELECT COALESCE(SUM(p2.pack_size), 0) FROM book_guest_packs p2)
             + ?
           ) <= ?
         RETURNING file_key`,
      ).bind(
        bookId,
        title,
        author,
        shelf,
        coverColor,
        fileKey,
        fileType,
        putResult.size,
        createdAt,
        bookId,
        putResult.size,
        limitBytes,
      ),
      env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(bookId),
      env.DB.prepare(
        'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
      ),
      env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
    ]);
    insertedFileKey =
      (insertRes.results?.[0] as { file_key?: string } | undefined)?.file_key ?? null;
    existingAfterId =
      (existingAfterRes.results?.[0] as { id?: string } | undefined)?.id ?? null;
    postBooksSum = booksAfterRes.results?.[0] as
      | { used_bytes?: number; book_count?: number }
      | undefined;
    postPacksSum = packsAfterRes.results?.[0] as { pack_bytes?: number } | undefined;
  } catch (dbErr) {
    let shouldDeleteOrphan = false;
    try {
      const committed = await env.DB.prepare('SELECT file_key FROM books WHERE id = ?')
        .bind(bookId)
        .first<{ file_key: string }>();
      shouldDeleteOrphan = !committed || committed.file_key !== fileKey;
    } catch {
      shouldDeleteOrphan = false;
    }
    if (shouldDeleteOrphan) {
      await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    }
    throw dbErr;
  }

  const usedBytes = Number(postBooksSum?.used_bytes ?? 0) + Number(postPacksSum?.pack_bytes ?? 0);
  if (insertedFileKey !== fileKey) {
    await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    if (existingAfterId) {
      throw new HttpError('Sách với ID này đã tồn tại.', 409);
    }
    assertQuota(usedBytes, putResult.size, limitBytes);
    throw new HttpError('Không thể lưu thông tin sách vào cơ sở dữ liệu.', 500);
  }

  const createdBook: BookRow = {
    id: bookId,
    title,
    author,
    shelf,
    description: null,
    cover_color: coverColor,
    cover_key: null,
    file_key: fileKey,
    file_type: fileType as 'epub' | 'docx',
    file_size: putResult.size,
    cover_size: 0,
    created_at: createdAt,
  };
  return {
    book: createdBook,
    storage: {
      usedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      bookCount: Number(postBooksSum?.book_count ?? 0),
    },
  };
}

export async function handleBookCoverUpload(request: Request, env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const declaredSize = Number(
    request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0,
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_COVER_BYTES) {
    throw new HttpError('Ảnh bìa phải nhỏ hơn 5 MB.', 400);
  }
  if (!request.body) throw new HttpError('Thiếu dữ liệu ảnh bìa.', 400);

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
  assertQuota(preUsedBytes - existing.cover_size, declaredSize, limitBytes);

  const coverKey = `covers/${bookId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}-v2.jpg`;
  const putResult = await env.BOOKS_BUCKET.put(coverKey, request.body, {
    httpMetadata: { contentType: 'image/jpeg' },
  });
  if (!putResult) throw new HttpError('Không thể lưu ảnh bìa vào R2.', 500);

  if (putResult.size <= 0 || putResult.size > MAX_COVER_BYTES) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    throw new HttpError('Ảnh bìa phải nằm trong khoảng 1 byte đến 5 MB.', 400);
  }

  let actualPrev: { cover_key: string | null; cover_size: number } | null = null;
  let updatedCoverKey: string | null = null;
  let postBooksSum: { used_bytes?: number; book_count?: number } | undefined;
  let postPacksSum: { pack_bytes?: number } | undefined;
  try {
    const [prevRes, updateRes, booksAfterRes, packsAfterRes] = await env.DB.batch([
      env.DB.prepare('SELECT cover_key, cover_size FROM books WHERE id = ?').bind(bookId),
      env.DB.prepare(
        `UPDATE books
         SET cover_key = ?, cover_size = ?
         WHERE id = ?
           AND (
             (SELECT COALESCE(SUM(b2.file_size + b2.cover_size), 0) FROM books b2)
             + (SELECT COALESCE(SUM(p2.pack_size), 0) FROM book_guest_packs p2)
             - cover_size
             + ?
           ) <= ?
         RETURNING cover_key`,
      ).bind(coverKey, putResult.size, bookId, putResult.size, limitBytes),
      env.DB.prepare(
        'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
      ),
      env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
    ]);
    actualPrev =
      (prevRes.results?.[0] as { cover_key: string | null; cover_size: number } | undefined) ?? null;
    updatedCoverKey =
      (updateRes.results?.[0] as { cover_key?: string } | undefined)?.cover_key ?? null;
    postBooksSum = booksAfterRes.results?.[0] as
      | { used_bytes?: number; book_count?: number }
      | undefined;
    postPacksSum = packsAfterRes.results?.[0] as { pack_bytes?: number } | undefined;
  } catch (dbErr) {
    let shouldDeleteOrphan = false;
    try {
      const committed = await env.DB.prepare('SELECT cover_key FROM books WHERE id = ?')
        .bind(bookId)
        .first<{ cover_key: string | null }>();
      shouldDeleteOrphan = !committed || committed.cover_key !== coverKey;
    } catch {
      shouldDeleteOrphan = false;
    }
    if (shouldDeleteOrphan) {
      await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    }
    throw dbErr;
  }

  const usedBytes = Number(postBooksSum?.used_bytes ?? 0) + Number(postPacksSum?.pack_bytes ?? 0);
  if (updatedCoverKey !== coverKey) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    if (!actualPrev) {
      throw new HttpError('Không tìm thấy sách.', 404);
    }
    assertQuota(Math.max(0, usedBytes - actualPrev.cover_size), putResult.size, limitBytes);
    throw new HttpError('Không thể cập nhật ảnh bìa cho sách.', 500);
  }

  if (actualPrev?.cover_key && actualPrev.cover_key !== coverKey) {
    await env.BOOKS_BUCKET.delete(actualPrev.cover_key).catch(() => undefined);
  }

  const updatedBook: BookRow = {
    ...existing,
    cover_key: coverKey,
    cover_size: putResult.size,
  };
  return {
    book: updatedBook,
    storage: {
      usedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      bookCount: Number(postBooksSum?.book_count ?? 0),
    },
  };
}

export async function handleBookMetadataPatch(request: Request, env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const body = (await request.json().catch(() => null)) as Partial<{
    title: string;
    author: string;
    shelf: string;
    description: string | null;
    cover_color: string;
  }> | null;
  if (!body) throw new HttpError('Dữ liệu cập nhật không hợp lệ.', 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  let nextShelfKey: string | null = null;

  if (typeof body.title === 'string' && body.title.trim()) {
    fields.push('title = ?');
    values.push(body.title.normalize('NFC').trim().slice(0, MAX_TEXT_FIELD_LENGTH));
  }
  if (typeof body.author === 'string' && body.author.trim()) {
    fields.push('author = ?');
    values.push(body.author.normalize('NFC').trim().slice(0, MAX_TEXT_FIELD_LENGTH));
  }
  if (typeof body.shelf === 'string' && body.shelf.trim()) {
    const cleanShelf = body.shelf.normalize('NFC').trim().slice(0, MAX_SHELF_NAME_LENGTH);
    fields.push('shelf = ?');
    values.push(cleanShelf);
    nextShelfKey = toShelfAccessKey(cleanShelf);
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw new HttpError('Mô tả sách không hợp lệ.', 400);
    }
    const normalizedDescription =
      typeof body.description === 'string'
        ? body.description.normalize('NFC').trim().slice(0, MAX_DESCRIPTION_LENGTH) || null
        : null;
    fields.push('description = ?');
    values.push(normalizedDescription);
  }
  if (typeof body.cover_color === 'string' && body.cover_color.trim()) {
    fields.push('cover_color = ?');
    values.push(body.cover_color.trim().slice(0, 32));
  }
  if (fields.length === 0) throw new HttpError('Không có trường nào cần cập nhật.', 400);

  let prevShelfKey: string | null = null;
  if (nextShelfKey) {
    const prevRow = await env.DB.prepare('SELECT shelf FROM books WHERE id = ?')
      .bind(bookId)
      .first<{ shelf: string }>();
    if (prevRow?.shelf) {
      prevShelfKey = toShelfAccessKey(prevRow.shelf);
    }
  }

  values.push(bookId);
  await env.DB.prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updatedBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
    .bind(bookId)
    .first<BookRow>();
  if (!updatedBook) throw new HttpError('Không tìm thấy sách.', 404);

  if (nextShelfKey) {
    await clearStaleShelfCoverForBook(env.DB, bookId, nextShelfKey);
    if (prevShelfKey && prevShelfKey !== nextShelfKey) {
      await cleanupOrphanShelves(env.DB, [prevShelfKey]);
    }
  }

  return { book: updatedBook };
}
