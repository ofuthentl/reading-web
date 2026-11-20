import {
  HttpError,
  authenticatePasscode,
  isAuthRequired,
  verifyAuth,
} from './auth';
import {
  ACCEPTED_FILE_TYPES,
  type BookRow,
  CONTENT_TYPES,
  type Env,
  MAX_COVER_BYTES,
  MAX_SHELF_NAME_LENGTH,
  MAX_SINGLE_FILE_BYTES,
  assertQuota,
  bulkDeleteBooks,
  bulkUpdateBooksShelf,
  deleteSingleBook,
  getLimitBytes,
  getStorageStats,
  isValidId,
  listBooksAndProgress,
  safeDecodeHeader,
  upsertReadingProgress,
} from './booksDb';

function resolveAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const list = (env.APP_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.includes('*') || list.includes(origin)) return origin;
  return null;
}

function applyCors(headers: Headers, origin: string | null) {
  if (!origin) return;
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Range, X-Book-Title, X-Book-Author, X-Book-Shelf, X-Cover-Color, X-File-Type, X-File-Size',
  );
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  applyCors(headers, origin);
  return new Response(JSON.stringify(body), { status, headers });
}

async function handleApi(request: Request, env: Env, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    applyCors(headers, origin);
    return new Response(null, { status: 204, headers });
  }

  // Public health check
  if (pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse(
      { ok: true, authRequired: isAuthRequired(env), limitBytes: getLimitBytes(env) },
      200,
      origin,
    );
  }

  // Passcode login
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
    const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
    const session = await authenticatePasscode(passcode, env);
    return jsonResponse(session, 200, origin);
  }

  // All routes below require valid auth token (fail-closed unless ALLOW_INSECURE_DEV_NO_AUTH="true")
  await verifyAuth(request, env);

  // Storage usage
  if (pathname === '/api/storage' && request.method === 'GET') {
    const storage = await getStorageStats(env);
    return jsonResponse(storage, 200, origin);
  }

  // List books + progress + storage
  if (pathname === '/api/books' && request.method === 'GET') {
    const state = await listBooksAndProgress(env);
    return jsonResponse(state, 200, origin);
  }

  // Stream upload a book file directly into R2 with 9.0 GB hard limit guard
  const fileUploadMatch = pathname.match(/^\/api\/books\/([^/]+)\/file$/);
  if (fileUploadMatch && request.method === 'PUT') {
    const bookId = fileUploadMatch[1];
    if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

    const fileType = (request.headers.get('X-File-Type') || '').toLowerCase();
    if (!ACCEPTED_FILE_TYPES.has(fileType)) {
      throw new HttpError('Chỉ hỗ trợ định dạng EPUB, MOBI, PDF hoặc CBZ.', 400);
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

    const title = safeDecodeHeader(request.headers.get('X-Book-Title'), 'Sách chưa đặt tên');
    const author = safeDecodeHeader(request.headers.get('X-Book-Author'), 'Không rõ tác giả');
    const shelf = safeDecodeHeader(
      request.headers.get('X-Book-Shelf'),
      'Kho chưa phân loại',
    ).slice(0, MAX_SHELF_NAME_LENGTH);
    const coverColor = safeDecodeHeader(request.headers.get('X-Cover-Color'), '#4f46e5');
    const fileKey = `books/${bookId}.${fileType}`;
    const contentType = CONTENT_TYPES[fileType] || 'application/octet-stream';

    const putResult = await env.BOOKS_BUCKET.put(fileKey, request.body, {
      httpMetadata: { contentType },
    });
    if (!putResult) throw new HttpError('Không thể ghi tệp vào R2.', 500);

    // Double-check actual stored size against hard limit (blocks spoofed headers)
    const freshStorage = await getStorageStats(env);
    if (freshStorage.usedBytes + putResult.size > freshStorage.limitBytes) {
      await env.BOOKS_BUCKET.delete(fileKey);
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
      await env.BOOKS_BUCKET.delete(fileKey);
      throw dbErr;
    }

    const createdBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first<BookRow>();
    const updatedStorage = await getStorageStats(env);
    return jsonResponse({ book: createdBook, storage: updatedStorage }, 201, origin);
  }

  // Stream upload/replace a compressed cover JPEG
  const coverUploadMatch = pathname.match(/^\/api\/books\/([^/]+)\/cover$/);
  if (coverUploadMatch && request.method === 'PUT') {
    const bookId = coverUploadMatch[1];
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

    const coverKey = `covers/${bookId}-${Date.now()}.jpg`;
    const putResult = await env.BOOKS_BUCKET.put(coverKey, request.body, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    if (!putResult) throw new HttpError('Không thể lưu ảnh bìa vào R2.', 500);

    if (existing.cover_key && existing.cover_key !== coverKey) {
      await env.BOOKS_BUCKET.delete(existing.cover_key);
    }

    await env.DB.prepare('UPDATE books SET cover_key = ?, cover_size = ? WHERE id = ?')
      .bind(coverKey, putResult.size, bookId)
      .run();

    const updatedBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first<BookRow>();
    const updatedStorage = await getStorageStats(env);
    return jsonResponse({ book: updatedBook, storage: updatedStorage }, 200, origin);
  }

  // Update book metadata (rename, change author/shelf/description)
  const bookItemMatch = pathname.match(/^\/api\/books\/([^/]+)$/);
  if (bookItemMatch && request.method === 'PATCH') {
    const bookId = bookItemMatch[1];
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
    if (typeof body.title === 'string' && body.title.trim()) {
      fields.push('title = ?');
      values.push(body.title.trim());
    }
    if (typeof body.author === 'string' && body.author.trim()) {
      fields.push('author = ?');
      values.push(body.author.trim());
    }
    if (typeof body.shelf === 'string' && body.shelf.trim()) {
      fields.push('shelf = ?');
      values.push(body.shelf.trim().slice(0, MAX_SHELF_NAME_LENGTH));
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (typeof body.cover_color === 'string' && body.cover_color.trim()) {
      fields.push('cover_color = ?');
      values.push(body.cover_color.trim());
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
    return jsonResponse({ book: updatedBook }, 200, origin);
  }

  // Delete a single book + cleanly delete R2 file & cover
  if (bookItemMatch && request.method === 'DELETE') {
    const result = await deleteSingleBook(env, bookItemMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Bulk delete books + cleanly delete all R2 objects
  if (pathname === '/api/books/bulk-delete' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const result = await bulkDeleteBooks(env, body?.ids);
    return jsonResponse(result, 200, origin);
  }

  // Bulk move books to target shelf (chunked <= 50 IDs per statement in D1 batch)
  if (pathname === '/api/books/bulk-shelf' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
      shelf?: unknown;
    } | null;
    const result = await bulkUpdateBooksShelf(env, body?.ids, body?.shelf);
    return jsonResponse(result, 200, origin);
  }

  // Bulk rename shelf
  if (pathname === '/api/shelves/rename' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      oldName?: unknown;
      newName?: unknown;
    } | null;
    const oldName = typeof body?.oldName === 'string' ? body.oldName.trim() : '';
    const newName = typeof body?.newName === 'string' ? body.newName.trim() : '';
    if (!oldName || !newName || newName.length > MAX_SHELF_NAME_LENGTH) {
      throw new HttpError('Tên kệ sách không hợp lệ.', 400);
    }

    await env.DB.prepare('UPDATE books SET shelf = ? WHERE shelf = ?').bind(newName, oldName).run();
    return jsonResponse({ ok: true }, 200, origin);
  }

  // Upsert / delete reading progress
  const progressMatch = pathname.match(/^\/api\/progress\/([^/]+)$/);
  if (progressMatch && request.method === 'PUT') {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof upsertReadingProgress
    >[2];
    const result = await upsertReadingProgress(env, progressMatch[1], body);
    return jsonResponse(result, 200, origin);
  }

  if (progressMatch && request.method === 'DELETE') {
    const bookId = progressMatch[1];
    if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
    await env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId).run();
    return jsonResponse({ ok: true }, 200, origin);
  }

  // Stream R2 file or cover with HTTP Range support
  if (pathname.startsWith('/api/files/') && (request.method === 'GET' || request.method === 'HEAD')) {
    const key = decodeURIComponent(pathname.slice('/api/files/'.length));
    if (!key || key.includes('..') || (!key.startsWith('books/') && !key.startsWith('covers/'))) {
      throw new HttpError('Đường dẫn tệp không hợp lệ.', 400);
    }

    const rangeHeader = request.headers.get('Range');
    const object = await env.BOOKS_BUCKET.get(key, {
      range: request.headers,
      onlyIf: request.headers,
    });
    if (!object) throw new HttpError('Không tìm thấy tệp trong R2.', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    applyCors(headers, origin);

    if (!('body' in object) || !object.body) {
      return new Response(null, { status: 304, headers });
    }

    if (rangeHeader && object.range && 'offset' in object.range && 'length' in object.range) {
      const start = object.range.offset ?? 0;
      const length = object.range.length ?? object.size;
      const end = start + length - 1;
      headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
      headers.set('Content-Length', String(length));
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
    }

    headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  }

  throw new HttpError('Không tìm thấy endpoint.', 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveAllowedOrigin(request, env);
    try {
      return await handleApi(request, env, origin);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status, origin);
      }
      console.error('Arcane Library Worker error:', error);
      return jsonResponse({ error: 'Máy chủ thư viện gặp sự cố. Vui lòng thử lại sau.' }, 500, origin);
    }
  },
};
