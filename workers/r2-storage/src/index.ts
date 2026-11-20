interface Env {
  APP_ORIGINS: string;
  STORAGE_LIMIT_BYTES?: string;
  ACCESS_PASSCODE?: string;
  AUTH_SECRET?: string;
  BOOKS_BUCKET: R2Bucket;
  DB: D1Database;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  shelf: string;
  description: string | null;
  cover_color: string;
  cover_key: string | null;
  file_key: string;
  file_type: 'epub' | 'mobi' | 'pdf' | 'cbz';
  file_size: number;
  cover_size: number;
  created_at: string;
}

interface ProgressRow {
  book_id: string;
  chapter_id: string;
  chapter_index: number;
  scroll_ratio: number;
  scroll_top: number;
  completed: number;
  updated_at: number;
}

const DEFAULT_HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GiB safety cap under 10 GB Free Tier
const MAX_SINGLE_FILE_BYTES = 350 * 1024 * 1024; // 350 MiB
const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MiB
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ACCEPTED_FILE_TYPES = new Set(['epub', 'mobi', 'pdf', 'cbz']);
const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  pdf: 'application/pdf',
  cbz: 'application/vnd.comicbook+zip',
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getLimitBytes(env: Env): number {
  const parsed = Number(env.STORAGE_LIMIT_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HARD_LIMIT_BYTES;
}

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

function safeDecodeHeader(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value).trim() || fallback;
  } catch {
    return value.trim() || fallback;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createAuthToken(env: Env): Promise<{ token: string; expiresAt: number }> {
  const secret = env.AUTH_SECRET || env.ACCESS_PASSCODE || 'local-dev-secret';
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = btoa(JSON.stringify({ sub: 'owner', exp: expiresAt }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const sig = await signPayload(payload, secret);
  return { token: `${payload}.${sig}`, expiresAt };
}

async function verifyAuth(request: Request, env: Env): Promise<void> {
  if (!env.ACCESS_PASSCODE) return; // Auth disabled if no passcode secret configured

  const url = new URL(request.url);
  const headerToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const queryToken = url.searchParams.get('token')?.trim();
  const token = headerToken || queryToken;
  if (!token) throw new HttpError('Vui lòng đăng nhập để truy cập thư viện.', 401);

  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new HttpError('Phiên đăng nhập không hợp lệ.', 401);

  const secret = env.AUTH_SECRET || env.ACCESS_PASSCODE;
  const expectedSig = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSig)) {
    throw new HttpError('Phiên đăng nhập không hợp lệ.', 401);
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    if (!decoded.exp || decoded.exp < Date.now()) {
      throw new HttpError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError('Phiên đăng nhập bị lỗi.', 401);
  }
}

async function getStorageStats(env: Env) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
  ).first<{ used_bytes: number; book_count: number }>();
  const usedBytes = Number(row?.used_bytes ?? 0);
  const bookCount = Number(row?.book_count ?? 0);
  const limitBytes = getLimitBytes(env);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    bookCount,
  };
}

function assertQuota(usedBytes: number, incomingBytes: number, limitBytes: number) {
  if (usedBytes + incomingBytes > limitBytes) {
    const usedGb = (usedBytes / (1024 ** 3)).toFixed(2);
    const limitGb = (limitBytes / (1024 ** 3)).toFixed(1);
    throw new HttpError(
      `Đã chạm giới hạn an toàn Free Tier (${usedGb} / ${limitGb} GB). Hãy xóa bớt sách cũ trước khi tải thêm để luôn giữ chi phí $0.`,
      413,
    );
  }
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id);
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
      { ok: true, authRequired: Boolean(env.ACCESS_PASSCODE), limitBytes: getLimitBytes(env) },
      200,
      origin,
    );
  }

  // Passcode login
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
    const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
    if (env.ACCESS_PASSCODE && !timingSafeEqual(passcode, env.ACCESS_PASSCODE)) {
      throw new HttpError('Mật mã thư viện không đúng.', 401);
    }
    const session = await createAuthToken(env);
    return jsonResponse(session, 200, origin);
  }

  // All routes below require valid auth token (when ACCESS_PASSCODE is set)
  await verifyAuth(request, env);

  // Storage usage
  if (pathname === '/api/storage' && request.method === 'GET') {
    const storage = await getStorageStats(env);
    return jsonResponse(storage, 200, origin);
  }

  // List books + progress + storage
  if (pathname === '/api/books' && request.method === 'GET') {
    const [booksRes, progressRes, storage] = await Promise.all([
      env.DB.prepare('SELECT * FROM books ORDER BY created_at DESC').all<BookRow>(),
      env.DB.prepare('SELECT * FROM reading_progress').all<ProgressRow>(),
      getStorageStats(env),
    ]);

    const progressMap: Record<string, {
      chapterId: string;
      chapterIndex: number;
      scrollRatio: number;
      scrollTop: number;
      completed: boolean;
      updatedAt: number;
    }> = {};
    for (const row of progressRes.results || []) {
      progressMap[row.book_id] = {
        chapterId: row.chapter_id,
        chapterIndex: row.chapter_index,
        scrollRatio: row.scroll_ratio,
        scrollTop: row.scroll_top,
        completed: row.completed === 1,
        updatedAt: row.updated_at,
      };
    }

    return jsonResponse(
      { books: booksRes.results || [], progress: progressMap, storage },
      200,
      origin,
    );
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

    const declaredSize = Number(request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0);
    if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_SINGLE_FILE_BYTES) {
      throw new HttpError('Kích thước tệp phải nằm trong khoảng 1 byte đến 350 MB.', 400);
    }
    if (!request.body) throw new HttpError('Thiếu nội dung tệp.', 400);

    const storage = await getStorageStats(env);
    assertQuota(storage.usedBytes, declaredSize, storage.limitBytes);

    const title = safeDecodeHeader(request.headers.get('X-Book-Title'), 'Sách chưa đặt tên');
    const author = safeDecodeHeader(request.headers.get('X-Book-Author'), 'Không rõ tác giả');
    const shelf = safeDecodeHeader(request.headers.get('X-Book-Shelf'), 'Kho chưa phân loại');
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

    const declaredSize = Number(request.headers.get('X-File-Size') || request.headers.get('Content-Length') || 0);
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
      values.push(body.shelf.trim());
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
    const bookId = bookItemMatch[1];
    if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

    const existing = await env.DB.prepare('SELECT file_key, cover_key FROM books WHERE id = ?')
      .bind(bookId)
      .first<{ file_key: string; cover_key: string | null }>();
    if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

    const keysToDelete = [existing.file_key, existing.cover_key].filter((k): k is string => Boolean(k));
    if (keysToDelete.length > 0) {
      await env.BOOKS_BUCKET.delete(keysToDelete);
    }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId),
      env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId),
    ]);

    const storage = await getStorageStats(env);
    return jsonResponse({ deletedId: bookId, storage }, 200, origin);
  }

  // Bulk delete books + cleanly delete all R2 objects
  if (pathname === '/api/books/bulk-delete' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && isValidId(id))
      : [];
    if (ids.length === 0) throw new HttpError('Danh sách sách cần xóa trống.', 400);

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await env.DB.prepare(`SELECT id, file_key, cover_key FROM books WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: string; file_key: string; cover_key: string | null }>();

    const keysToDelete: string[] = [];
    for (const row of rows.results || []) {
      if (row.file_key) keysToDelete.push(row.file_key);
      if (row.cover_key) keysToDelete.push(row.cover_key);
    }
    if (keysToDelete.length > 0) {
      await env.BOOKS_BUCKET.delete(keysToDelete);
    }
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM reading_progress WHERE book_id IN (${placeholders})`).bind(...ids),
      env.DB.prepare(`DELETE FROM books WHERE id IN (${placeholders})`).bind(...ids),
    ]);

    const storage = await getStorageStats(env);
    return jsonResponse({ deletedIds: ids, storage }, 200, origin);
  }

  // Bulk rename shelf
  if (pathname === '/api/shelves/rename' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { oldName?: unknown; newName?: unknown } | null;
    const oldName = typeof body?.oldName === 'string' ? body.oldName.trim() : '';
    const newName = typeof body?.newName === 'string' ? body.newName.trim() : '';
    if (!oldName || !newName) throw new HttpError('Tên kệ sách không hợp lệ.', 400);

    await env.DB.prepare('UPDATE books SET shelf = ? WHERE shelf = ?').bind(newName, oldName).run();
    return jsonResponse({ ok: true }, 200, origin);
  }

  // Upsert / delete reading progress
  const progressMatch = pathname.match(/^\/api\/progress\/([^/]+)$/);
  if (progressMatch && request.method === 'PUT') {
    const bookId = progressMatch[1];
    if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
    const body = (await request.json().catch(() => null)) as {
      chapterId?: string;
      chapterIndex?: number;
      scrollRatio?: number;
      scrollTop?: number;
      completed?: boolean;
      updatedAt?: number;
    } | null;
    if (!body?.chapterId) throw new HttpError('Thiếu thông tin chương đang đọc.', 400);

    const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
    await env.DB.prepare(
      `INSERT INTO reading_progress (book_id, chapter_id, chapter_index, scroll_ratio, scroll_top, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         chapter_index = excluded.chapter_index,
         scroll_ratio = excluded.scroll_ratio,
         scroll_top = excluded.scroll_top,
         completed = excluded.completed,
         updated_at = excluded.updated_at`,
    )
      .bind(
        bookId,
        body.chapterId,
        Number(body.chapterIndex ?? 0),
        Number(body.scrollRatio ?? 0),
        Number(body.scrollTop ?? 0),
        body.completed ? 1 : 0,
        updatedAt,
      )
      .run();
    return jsonResponse({ ok: true, updatedAt }, 200, origin);
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
