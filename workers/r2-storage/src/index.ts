import {
  HttpError,
  authenticatePasscodeOrKey,
  isAuthRequired,
  requireOwner,
  verifyAuth,
} from './auth';
import { tryHandleAdminRoutes } from './adminRoutes';
import {
  handleBookCoverUpload,
  handleBookFileUpload,
  handleBookMetadataPatch,
} from './bookUploadRoutes';
import { handleDiscordInteraction, isValidDiscordPublicKeyFormat } from './discord';
import {
  type Env,
  bulkDeleteBooks,
  bulkUpdateBooksShelf,
  deleteReadingProgress,
  deleteSingleBook,
  getLimitBytes,
  getStorageStats,
  listBooksAndProgress,
  renameShelfCaseInsensitive,
  upsertReadingProgress,
  upsertShelfCover,
  upsertShelfFavorite,
} from './booksDb';
import {
  createBookBookmark,
  deleteBookBookmark,
  listBookBookmarks,
} from './bookmarksDb';
import { tryHandleCatalogRoutes } from './catalogEnhancementsDb';
import { tryHandleCommunityRoutes } from './communityDb';
import { uploadBookGuestPack } from './guestPack';
import { tryHandleGuestRoutes } from './guestRoutes';
import {
  createHighlight,
  deleteHighlight,
  listHighlights,
  updateHighlight,
} from './highlightsDb';
import {
  assertLoginNotRateLimited,
  clearLoginFailures,
  recordLoginFailure,
} from './rateLimitDb';
import { getReaderActivityStats } from './readingActivityDb';
import { getUserReaderPrefs, putUserReaderPrefs } from './readerPrefsDb';
import { streamR2FileResponse } from './r2Files';
import { upsertShelfTags } from './shelfTagsDb';
import { scheduleUsageEvent } from './usageDb';

function extractGuestUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[0];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown };
    if (typeof parsed.sub !== 'string' || !parsed.sub) return null;
    return parsed.sub.replace(/^discord:/, '');
  } catch {
    return null;
  }
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
    'Authorization, Content-Type, Range, If-None-Match, If-Modified-Since, If-Match, If-Unmodified-Since, X-Book-Title, X-Book-Author, X-Book-Shelf, X-Cover-Color, X-File-Type, X-File-Size',
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

async function handleApi(
  request: Request,
  env: Env,
  origin: string | null,
  ctx?: ExecutionContext,
): Promise<Response> {
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
    return handleDiscordInteraction(request, env, ctx);
  }

  // Passcode (owner 30d) or Discord 12-char key (guest 24h) login + chống brute-force theo IP (M-8)
  if (normalizedPath === '/api/auth/login' && request.method === 'POST') {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      await assertLoginNotRateLimited(env.DB, clientIp);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        scheduleUsageEvent(ctx, env.DB, { metric: 'rate_limit_hits' });
      }
      throw err;
    }
    const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
    const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
    const userAgent = request.headers.get('User-Agent') || '';
    try {
      const session = await authenticatePasscodeOrKey(passcode, env, env.DB, userAgent);
      await clearLoginFailures(env.DB, clientIp);
      const guestUserId = extractGuestUserIdFromToken(session.token);
      scheduleUsageEvent(ctx, env.DB, {
        metric: session.role === 'owner' ? 'owner_logins' : 'guest_logins',
        readerScope:
          session.role === 'owner' ? 'owner' : guestUserId ? `guest:${guestUserId}` : undefined,
        readerRole: session.role,
      });
      return jsonResponse(session, 200, origin);
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        await recordLoginFailure(env.DB, clientIp).catch(() => undefined);
        scheduleUsageEvent(ctx, env.DB, { metric: 'login_failures' });
      }
      throw err;
    }
  }

  // All routes below require valid auth token (fail-closed unless ALLOW_INSECURE_DEV_NO_AUTH="true")
  const auth = await verifyAuth(request, env, env.DB);

  if (normalizedPath === '/api/auth/session' && request.method === 'GET') {
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
  if (normalizedPath === '/api/storage' && request.method === 'GET') {
    requireOwner(auth);
    const storage = await getStorageStats(env);
    return jsonResponse(storage, 200, origin);
  }

  // List books + isolated user progress + storage
  if (normalizedPath === '/api/books' && request.method === 'GET') {
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

  // Guest-safe TOC, Illustrations Index, AES-GCM chapter/media & search (D-028/D-029/D-036)
  const guestRes = await tryHandleGuestRoutes(
    request,
    normalizedPath,
    url,
    env,
    auth,
    origin,
    ctx,
    (h) => applyCors(h, origin),
    jsonResponse,
  );
  if (guestRes) return guestRes;

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

  // Highlights & Quote Vault CRUD isolated by user_scope (D-036 Mục 5)
  if (normalizedPath === '/api/highlights' && request.method === 'GET') {
    const res = await listHighlights(env, auth, url.searchParams.get('bookId'));
    return jsonResponse(res, 200, origin);
  }
  if (normalizedPath === '/api/highlights' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const res = await createHighlight(env, auth, body);
    return jsonResponse(res, 201, origin);
  }
  const highlightItemMatch = normalizedPath.match(/^\/api\/highlights\/([^/]+)$/);
  if (highlightItemMatch && request.method === 'PATCH') {
    const body = await request.json().catch(() => null);
    const res = await updateHighlight(env, auth, highlightItemMatch[1], body);
    return jsonResponse(res, 200, origin);
  }
  if (highlightItemMatch && request.method === 'DELETE') {
    const res = await deleteHighlight(env, auth, highlightItemMatch[1]);
    return jsonResponse(res, 200, origin);
  }

  // Admin Discord Guest Management, Forensic Leak Check, Shelf Access & Usage Stats (Owner only, D-028/D-030/D-035)
  const adminRes = await tryHandleAdminRoutes(
    request,
    normalizedPath,
    url,
    env,
    auth,
    origin,
    jsonResponse,
  );
  if (adminRes) return adminRes;

  // Stream upload a book file directly into R2 with 9.0 GB hard limit guard (Owner only)
  const fileUploadMatch = normalizedPath.match(/^\/api\/books\/([^/]+)\/file$/);
  if (fileUploadMatch && request.method === 'PUT') {
    requireOwner(auth);
    const result = await handleBookFileUpload(request, env, fileUploadMatch[1]);
    return jsonResponse(result, 201, origin);
  }

  // Stream upload/replace a compressed cover JPEG (Owner only)
  const coverUploadMatch = normalizedPath.match(/^\/api\/books\/([^/]+)\/cover$/);
  if (coverUploadMatch && request.method === 'PUT') {
    requireOwner(auth);
    const result = await handleBookCoverUpload(request, env, coverUploadMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Update book metadata (Owner only)
  const bookItemMatch = normalizedPath.match(/^\/api\/books\/([^/]+)$/);
  if (bookItemMatch && request.method === 'PATCH') {
    requireOwner(auth);
    const result = await handleBookMetadataPatch(request, env, bookItemMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Delete a single book + cleanly delete R2 file, cover & guest-pack (Owner only)
  if (bookItemMatch && request.method === 'DELETE') {
    requireOwner(auth);
    const result = await deleteSingleBook(env, bookItemMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Bulk delete books + cleanly delete all R2 objects (Owner only)
  if (normalizedPath === '/api/books/bulk-delete' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const result = await bulkDeleteBooks(env, body?.ids);
    return jsonResponse(result, 200, origin);
  }

  // Bulk move books to target shelf (Owner only)
  if (normalizedPath === '/api/books/bulk-shelf' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
      shelf?: unknown;
    } | null;
    const result = await bulkUpdateBooksShelf(env, body?.ids, body?.shelf);
    return jsonResponse(result, 200, origin);
  }

  // Bulk rename shelf (Owner only)
  if (normalizedPath === '/api/shelves/rename' && request.method === 'POST') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      oldName?: unknown;
      newName?: unknown;
    } | null;
    const result = await renameShelfCaseInsensitive(env, body?.oldName, body?.newName);
    return jsonResponse(result, 200, origin);
  }

  // Upsert or reset representative shelf cover book ID (Owner only, D-025)
  if (normalizedPath === '/api/shelves/cover' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      bookId?: unknown;
    } | null;
    const result = await upsertShelfCover(env, body?.shelfName, body?.bookId);
    return jsonResponse(result, 200, origin);
  }

  // Pin / unpin favorite shelf at top of Home & Library tabs (Owner only, D-025)
  if (normalizedPath === '/api/shelves/favorite' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      favorite?: unknown;
    } | null;
    const result = await upsertShelfFavorite(env, body?.shelfName, body?.favorite);
    return jsonResponse(result, 200, origin);
  }

  // Upsert tags for a shelf / series (Owner only, D-032)
  if (normalizedPath === '/api/shelves/tags' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      tags?: unknown;
    } | null;
    const result = await upsertShelfTags(env.DB, body?.shelfName, body?.tags);
    return jsonResponse(result, 200, origin);
  }

  // Catalog Enhancements: alt-titles (Owner), plan-to-read (Owner + Guest) & collections CRUD (D-036 Wave 3)
  const catalogRes = await tryHandleCatalogRoutes(
    request,
    normalizedPath,
    url,
    env.DB,
    auth,
    origin,
    jsonResponse,
  );
  if (catalogRes) return catalogRes;

  // Community Ratings & Spoiler Comments isolated/protected by D-030 (D-036 Wave 4)
  const communityRes = await tryHandleCommunityRoutes(
    request,
    normalizedPath,
    url,
    env.DB,
    auth,
    origin,
    jsonResponse,
  );
  if (communityRes) return communityRes;

  // Personal 90-day reading streak & heatmap activity isolated per reader_scope (D-036 Wave 1)
  if (normalizedPath === '/api/reading-stats/activity' && request.method === 'GET') {
    const activity = await getReaderActivityStats(env, auth);
    return jsonResponse(activity, 200, origin);
  }

  // Synced ReaderSettings isolated per user_scope (Owner & Discord Guest, D-036 Mục 7)
  if (normalizedPath === '/api/reader-settings' && request.method === 'GET') {
    const prefs = await getUserReaderPrefs(env.DB, auth);
    return jsonResponse(prefs, 200, origin);
  }
  if (normalizedPath === '/api/reader-settings' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const updated = await putUserReaderPrefs(env.DB, auth, body);
    return jsonResponse(updated, 200, origin);
  }

  // Upsert / delete reading progress (isolated per Owner vs Discord Guest, D-026 + PA-1 readingDeltaSec)
  const progressMatch = normalizedPath.match(/^\/api\/progress\/([^/]+)$/);
  if (progressMatch && request.method === 'PUT') {
    const body = (await request.json().catch(() => null)) as Parameters<
      typeof upsertReadingProgress
    >[3];
    const result = await upsertReadingProgress(env, auth, progressMatch[1], body);
    scheduleUsageEvent(ctx, env.DB, {
      ...(auth.role === 'owner' ? { metric: 'owner_progress_updates' as const } : {}),
      readerScope: auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`,
      readerRole: auth.role,
      readingSeconds: result.readingDeltaAccepted,
    });
    return jsonResponse(result, 200, origin);
  }

  if (progressMatch && request.method === 'DELETE') {
    const result = await deleteReadingProgress(env, auth, progressMatch[1]);
    return jsonResponse(result, 200, origin);
  }

  // Stream R2 file (Owner ONLY, D-028) or cover thumbnail (Owner + Guest)
  if (normalizedPath.startsWith('/api/files/') && (request.method === 'GET' || request.method === 'HEAD')) {
    return streamR2FileResponse(request, normalizedPath, env, auth, (h) => applyCors(h, origin));
  }

  throw new HttpError('Không tìm thấy endpoint.', 404);
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const origin = resolveAllowedOrigin(request, env);
    try {
      return await handleApi(request, env, origin, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status, origin, error.extraHeaders);
      }
      console.error('Arcane Library Worker error:', error);
      return jsonResponse({ error: 'Máy chủ thư viện gặp sự cố. Vui lòng thử lại sau.' }, 500, origin);
    }
  },
};
