import { HttpError } from './auth';
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
  getStorageStats,
  isValidId,
  safeDecodeHeader,
} from './booksDb';
import { toShelfAccessKey } from './shelfAccessDb';

export async function handleBookFileUpload(request: Request, env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const fileType = (request.headers.get('X-File-Type') || '').toLowerCase();
  if (!ACCEPTED_FILE_TYPES.has(fileType)) {
    throw new HttpError('Chỉ hỗ trợ định dạng EPUB hoặc DOCX.', 400);
  }

  const existingBook = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (existingBook) {
    throw new HttpError('Sách với ID này đã tồn tại.', 409);
  }

  const declaredSize = Number(
    request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0,
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_SINGLE_FILE_BYTES) {
    throw new HttpError('Kích thước tệp phải nằm trong khoảng 1 byte đến 350 MB.', 400);
  }
  if (!request.body) throw new HttpError('Thiếu nội dung tệp.', 400);

  const storage = await getStorageStats(env);
  assertQuota(storage.usedBytes, declaredSize, storage.limitBytes);

  const title = safeDecodeHeader(
    request.headers.get('X-Book-Title'),
    'Sách chưa đặt tên',
  ).slice(0, MAX_TEXT_FIELD_LENGTH);
  const author = safeDecodeHeader(
    request.headers.get('X-Book-Author'),
    'Không rõ tác giả',
  ).slice(0, MAX_TEXT_FIELD_LENGTH);
  const shelf = safeDecodeHeader(
    request.headers.get('X-Book-Shelf'),
    'Kho chưa phân loại',
  ).slice(0, MAX_SHELF_NAME_LENGTH);
  const coverColor = safeDecodeHeader(request.headers.get('X-Cover-Color'), '#4f46e5').slice(0, 32);
  const fileKey = `books/${bookId}.${fileType}`;
  const contentType = CONTENT_TYPES[fileType] || 'application/octet-stream';

  const putResult = await env.BOOKS_BUCKET.put(fileKey, request.body, {
    httpMetadata: { contentType },
  });
  if (!putResult) throw new HttpError('Không thể ghi tệp vào R2.', 500);

  if (putResult.size <= 0 || putResult.size > MAX_SINGLE_FILE_BYTES) {
    await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    throw new HttpError('Kích thước tệp thực tế phải nằm trong khoảng 1 byte đến 350 MB.', 400);
  }

  const freshStorage = await getStorageStats(env);
  if (freshStorage.usedBytes + putResult.size > freshStorage.limitBytes) {
    await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    assertQuota(freshStorage.usedBytes, putResult.size, freshStorage.limitBytes);
  }

  const createdAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO books (id, title, author, shelf, cover_color, file_key, file_type, file_size, cover_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
      .bind(bookId, title, author, shelf, coverColor, fileKey, fileType, putResult.size, createdAt)
      .run();
  } catch (dbErr) {
    const committed = await env.DB.prepare('SELECT file_key FROM books WHERE id = ?')
      .bind(bookId)
      .first<{ file_key: string }>()
      .catch(() => null);
    if (!committed || committed.file_key !== fileKey) {
      await env.BOOKS_BUCKET.delete(fileKey).catch(() => undefined);
    }
    throw dbErr;
  }

  const createdBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
    .bind(bookId)
    .first<BookRow>();
  const updatedStorage = await getStorageStats(env);
  return { book: createdBook, storage: updatedStorage };
}

export async function handleBookCoverUpload(request: Request, env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const existing = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
    .bind(bookId)
    .first<BookRow>();
  if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

  const declaredSize = Number(
    request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0,
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_COVER_BYTES) {
    throw new HttpError('Ảnh bìa phải nhỏ hơn 5 MB.', 400);
  }
  if (!request.body) throw new HttpError('Thiếu dữ liệu ảnh bìa.', 400);

  const storage = await getStorageStats(env);
  assertQuota(storage.usedBytes - existing.cover_size, declaredSize, storage.limitBytes);

  const coverKey = `covers/${bookId}-${Date.now()}-v2.jpg`;
  const putResult = await env.BOOKS_BUCKET.put(coverKey, request.body, {
    httpMetadata: { contentType: 'image/jpeg' },
  });
  if (!putResult) throw new HttpError('Không thể lưu ảnh bìa vào R2.', 500);

  if (putResult.size <= 0 || putResult.size > MAX_COVER_BYTES) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    throw new HttpError('Ảnh bìa phải nằm trong khoảng 1 byte đến 5 MB.', 400);
  }

  const freshStorage = await getStorageStats(env);
  if (freshStorage.usedBytes - existing.cover_size + putResult.size > freshStorage.limitBytes) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    assertQuota(
      freshStorage.usedBytes - existing.cover_size,
      putResult.size,
      freshStorage.limitBytes,
    );
  }

  let changes = 0;
  try {
    const updateRes = await env.DB.prepare(
      'UPDATE books SET cover_key = ?, cover_size = ? WHERE id = ?',
    )
      .bind(coverKey, putResult.size, bookId)
      .run();
    changes = updateRes.meta?.changes ?? 0;
  } catch (dbErr) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    throw dbErr;
  }

  if (changes !== 1) {
    await env.BOOKS_BUCKET.delete(coverKey).catch(() => undefined);
    throw new HttpError('Không tìm thấy sách.', 404);
  }

  if (existing.cover_key && existing.cover_key !== coverKey) {
    await env.BOOKS_BUCKET.delete(existing.cover_key).catch(() => undefined);
  }

  const updatedBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
    .bind(bookId)
    .first<BookRow>();
  const updatedStorage = await getStorageStats(env);
  return { book: updatedBook, storage: updatedStorage };
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
    values.push(body.title.trim().slice(0, MAX_TEXT_FIELD_LENGTH));
  }
  if (typeof body.author === 'string' && body.author.trim()) {
    fields.push('author = ?');
    values.push(body.author.trim().slice(0, MAX_TEXT_FIELD_LENGTH));
  }
  if (typeof body.shelf === 'string' && body.shelf.trim()) {
    const cleanShelf = body.shelf.trim().slice(0, MAX_SHELF_NAME_LENGTH);
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
        ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null
        : null;
    fields.push('description = ?');
    values.push(normalizedDescription);
  }
  if (typeof body.cover_color === 'string' && body.cover_color.trim()) {
    fields.push('cover_color = ?');
    values.push(body.cover_color.trim().slice(0, 32));
  }
  if (fields.length === 0) throw new HttpError('Không có trường nào cần cập nhật.', 400);

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
  }

  return { book: updatedBook };
}
