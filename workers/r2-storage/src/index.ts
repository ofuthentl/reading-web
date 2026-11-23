import {
  HttpError,
  authenticatePasscodeOrKey,
  isAuthRequired,
  requireOwner,
  verifyAuth,
} from './auth';
import { tryHandleAdminRoutes } from './adminRoutes';
import { handleDiscordInteraction, isValidDiscordPublicKeyFormat } from './discord';
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
  bulkDeleteBooks,
  bulkUpdateBooksShelf,
  deleteReadingProgress,
  deleteSingleBook,
  getLimitBytes,
  getStorageStats,
  isValidId,
  listBooksAndProgress,
  renameShelfCaseInsensitive,
  safeDecodeHeader,
  upsertReadingProgress,
  upsertShelfCover,
  upsertShelfFavorite,
} from './booksDb';
import {
  createBookBookmark,
  deleteBookBookmark,
  listBookBookmarks,
} from './bookmarksDb';
import {
  getGuestBookToc,
  getGuestEncryptedChapter,
  getGuestEncryptedMediaResponse,
  uploadBookGuestPack,
} from './guestPack';
import { searchGuestBookChapters } from './guestSearch';
import { streamR2FileResponse } from './r2Files';
import { upsertShelfTags } from './shelfTagsDb';

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
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, ETag, X-Guest-Iv, X-Guest-Nonce, X-Guest-Mime, Retry-After',
  );
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
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

  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // Public health check
  if (normalizedPath === '/api/health' && request.method === 'GET') {
    return jsonResponse(
      {
        ok: true,
        authRequired: isAuthRequired(env),
        discordReady: isValidDiscordPublicKeyFormat(env.DISCORD_PUBLIC_KEY),
        guestProtectionReady: true,
        limitBytes: getLimitBytes(env),
      },
      200,
      origin,
    );
  }

  // Discord HTTP Interactions webhook (verified via Ed25519 signature)
  if (normalizedPath === '/api/discord/interactions' && request.method === 'POST') {
    return handleDiscordInteraction(request, env);
  }

  // Passcode (owner 30d) or Discord 12-char key (guest 24h) login
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
    const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
    const userAgent = request.headers.get('User-Agent') || '';
    const session = await authenticatePasscodeOrKey(passcode, env, env.DB, userAgent);
    return jsonResponse(session, 200, origin);
  }

  // All routes below require valid auth token (fail-closed unless ALLOW_INSECURE_DEV_NO_AUTH="true")
  const auth = await verifyAuth(request, env, env.DB);

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    return jsonResponse(
      {
        ok: true,
        role: auth.role,
        expiresAt: auth.expiresAt,
        ...(auth.watermarkLabel ? { watermarkLabel: auth.watermarkLabel } : {}),
      },
      200,
      origin,
    );
  }

  // Storage usage (Owner only)
  if (pathname === '/api/storage' && request.method === 'GET') {
    requireOwner(auth);
    const storage = await getStorageStats(env);
    return jsonResponse(storage, 200, origin);
  }

  // List books + isolated user progress + storage
  if (pathname === '/api/books' && request.method === 'GET') {
    const state = await listBooksAndProgress(env, auth);
    return jsonResponse(state, 200, origin);
  }

  // Upload indexed Guest Chapter Pack for EPUB/DOCX (Owner only, D-028)
  const guestPackUploadMatch = normalizedPath.match(/^\/api\/books\/([^/]+)\/guest-pack$/);
  if (guestPackUploadMatch && request.method === 'PUT') {
    requireOwner(auth);
    const result = await uploadBookGuestPack(request, env, guestPackUploadMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Guest-safe TOC, per-chapter AES-GCM encrypted payload & sliced R2 media (D-028)
  const guestTocMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/toc$/);
  if (guestTocMatch && request.method === 'GET') {
    const toc = await getGuestBookToc(env, auth, guestTocMatch[1]);
    return jsonResponse(toc, 200, origin);
  }

  const guestChapterMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/chapters\/(\d+)$/);
  if (guestChapterMatch && request.method === 'GET') {
    const chapter = await getGuestEncryptedChapter(
      env,
      auth,
      guestChapterMatch[1],
      Number(guestChapterMatch[2]),
    );
    return jsonResponse(chapter, 200, origin);
  }

  const guestMediaMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/media\/(\d+)$/);
  if (guestMediaMatch && request.method === 'GET') {
    return getGuestEncryptedMediaResponse(
      env,
      auth,
      guestMediaMatch[1],
      Number(guestMediaMatch[2]),
      (h) => applyCors(h, origin),
    );
  }

  const guestSearchMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/search$/);
  if (guestSearchMatch && request.method === 'GET') {
    const result = await searchGuestBookChapters(
      env,
      auth,
      guestSearchMatch[1],
      url.searchParams.get('q'),
    );
    return jsonResponse(result, 200, origin);
  }

  // Bookmarks CRUD isolated by role/userId (D-029 PA-2A)
  const bookmarksListMatch = normalizedPath.match(/^\/api\/books\/([^/]+)\/bookmarks$/);
  if (bookmarksListMatch && request.method === 'GET') {
    const res = await listBookBookmarks(env, auth, bookmarksListMatch[1]);
    return jsonResponse(res, 200, origin);
  }
  if (bookmarksListMatch && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const res = await createBookBookmark(env, auth, bookmarksListMatch[1], body);
    return jsonResponse(res, 201, origin);
  }
  const bookmarkDeleteMatch = normalizedPath.match(/^\/api\/books\/([^/]+)\/bookmarks\/([^/]+)$/);
  if (bookmarkDeleteMatch && request.method === 'DELETE') {
    const res = await deleteBookBookmark(env, auth, bookmarkDeleteMatch[1], bookmarkDeleteMatch[2]);
    return jsonResponse(res, 200, origin);
  }

  // Admin Discord Guest Management, Forensic Leak Check & Shelf Access Control (Owner only, D-028/D-030)
  const adminRes = await tryHandleAdminRoutes(
    request,
    normalizedPath,
    env,
    auth,
    origin,
    jsonResponse,
  );
  if (adminRes) return adminRes;

  // Stream upload a book file directly into R2 with 9.0 GB hard limit guard (Owner only)
  const fileUploadMatch = pathname.match(/^\/api\/books\/([^/]+)\/file$/);
  if (fileUploadMatch && request.method === 'PUT') {
    requireOwner(auth);
    const bookId = fileUploadMatch[1];
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
      const committed = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
        .bind(bookId)
        .first<{ id: string }>()
        .catch(() => null);
      if (!committed) {
        await env.BOOKS_BUCKET.delete(fileKey);
      }
      throw dbErr;
    }

    const createdBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first<BookRow>();
    const updatedStorage = await getStorageStats(env);
    return jsonResponse({ book: createdBook, storage: updatedStorage }, 201, origin);
  }

  // Stream upload/replace a compressed cover JPEG (Owner only)
  const coverUploadMatch = pathname.match(/^\/api\/books\/([^/]+)\/cover$/);
  if (coverUploadMatch && request.method === 'PUT') {
    requireOwner(auth);
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

    const coverKey = `covers/${bookId}-${Date.now()}-v2.jpg`;
    const putResult = await env.BOOKS_BUCKET.put(coverKey, request.body, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    if (!putResult) throw new HttpError('Không thể lưu ảnh bìa vào R2.', 500);

    const freshStorage = await getStorageStats(env);
    if (
      putResult.size > MAX_COVER_BYTES ||
      freshStorage.usedBytes - existing.cover_size + putResult.size > freshStorage.limitBytes
    ) {
      await env.BOOKS_BUCKET.delete(coverKey);
      if (putResult.size > MAX_COVER_BYTES) {
        throw new HttpError('Ảnh bìa phải nhỏ hơn 5 MB.', 400);
      }
      assertQuota(freshStorage.usedBytes - existing.cover_size, putResult.size, freshStorage.limitBytes);
    }

    try {
      await env.DB.prepare('UPDATE books SET cover_key = ?, cover_size = ? WHERE id = ?')
        .bind(coverKey, putResult.size, bookId)
        .run();
    } catch (dbErr) {
      await env.BOOKS_BUCKET.delete(coverKey);
      throw dbErr;
    }

    if (existing.cover_key && existing.cover_key !== coverKey) {
      await env.BOOKS_BUCKET.delete(existing.cover_key).catch(() => undefined);
    }

    const updatedBook = await env.DB.prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first<BookRow>();
    const updatedStorage = await getStorageStats(env);
    return jsonResponse({ book: updatedBook, storage: updatedStorage }, 200, origin);
  }

  // Update book metadata (Owner only)
  const bookItemMatch = pathname.match(/^\/api\/books\/([^/]+)$/);
  if (bookItemMatch && request.method === 'PATCH') {
    requireOwner(auth);
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
      values.push(body.title.trim().slice(0, MAX_TEXT_FIELD_LENGTH));
    }
    if (typeof body.author === 'string' && body.author.trim()) {
      fields.push('author = ?');
      values.push(body.author.trim().slice(0, MAX_TEXT_FIELD_LENGTH));
    }
    if (typeof body.shelf === 'string' && body.shelf.trim()) {
      fields.push('shelf = ?');
      values.push(body.shelf.trim().slice(0, MAX_SHELF_NAME_LENGTH));
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
    return jsonResponse({ book: updatedBook }, 200, origin);
  }

  // Delete a single book + cleanly delete R2 file, cover & guest-pack (Owner only)
  if (bookItemMatch && request.method === 'DELETE') {
    requireOwner(auth);
    const result = await deleteSingleBook(env, bookItemMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Bulk delete books + cleanly delete all R2 objects (Owner only)
  if (pathname === '/api/books/bulk-delete' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const result = await bulkDeleteBooks(env, body?.ids);
    return jsonResponse(result, 200, origin);
  }

  // Bulk move books to target shelf (Owner only)
  if (pathname === '/api/books/bulk-shelf' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
      shelf?: unknown;
    } | null;
    const result = await bulkUpdateBooksShelf(env, body?.ids, body?.shelf);
    return jsonResponse(result, 200, origin);
  }

  // Bulk rename shelf (Owner only)
  if (pathname === '/api/shelves/rename' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      oldName?: unknown;
      newName?: unknown;
    } | null;
    const result = await renameShelfCaseInsensitive(env, body?.oldName, body?.newName);
    return jsonResponse(result, 200, origin);
  }

  // Upsert or reset representative shelf cover book ID (Owner only, D-025)
  if (pathname === '/api/shelves/cover' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      bookId?: unknown;
    } | null;
    const result = await upsertShelfCover(env, body?.shelfName, body?.bookId);
    return jsonResponse(result, 200, origin);
  }

  // Pin / unpin favorite shelf at top of Home & Library tabs (Owner only, D-025)
  if (pathname === '/api/shelves/favorite' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      favorite?: unknown;
    } | null;
    const result = await upsertShelfFavorite(env, body?.shelfName, body?.favorite);
    return jsonResponse(result, 200, origin);
  }

  // Upsert tags for a shelf / series (Owner only, D-032)
  if (pathname === '/api/shelves/tags' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      tags?: unknown;
    } | null;
    const result = await upsertShelfTags(env.DB, body?.shelfName, body?.tags);
    return jsonResponse(result, 200, origin);
  }

  // Upsert / delete reading progress (isolated per Owner vs Discord Guest, D-026)
  const progressMatch = pathname.match(/^\/api\/progress\/([^/]+)$/);
  if (progressMatch && request.method === 'PUT') {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof upsertReadingProgress
    >[3];
    const result = await upsertReadingProgress(env, auth, progressMatch[1], body);
    return jsonResponse(result, 200, origin);
  }

  if (progressMatch && request.method === 'DELETE') {
    const result = await deleteReadingProgress(env, auth, progressMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Stream R2 file (Owner ONLY, D-028) or cover thumbnail (Owner + Guest)
  if (pathname.startsWith('/api/files/') && (request.method === 'GET' || request.method === 'HEAD')) {
    return streamR2FileResponse(request, pathname, env, auth, (h) => applyCors(h, origin));
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
        return jsonResponse({ error: error.message }, error.status, origin, error.extraHeaders);
      }
      console.error('Arcane Library Worker error:', error);
      return jsonResponse({ error: 'Máy chủ thư viện gặp sự cố. Vui lòng thử lại sau.' }, 500, origin);
    }
  },
};
