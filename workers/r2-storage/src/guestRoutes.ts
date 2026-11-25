import { type AuthContext, HttpError } from './auth';
import type { Env } from './booksDb';
import { getGuestBookIllustrations } from './guestIllustrations';
import {
  getGuestBookToc,
  getGuestEncryptedChapter,
  getGuestEncryptedMediaResponse,
} from './guestPack';
import { searchGuestBookChapters } from './guestSearch';
import { scheduleUsageEvent } from './usageDb';

type JsonResponder = (
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: Record<string, string>,
) => Response;

export async function tryHandleGuestRoutes(
  request: Request,
  normalizedPath: string,
  url: URL,
  env: Env,
  auth: AuthContext,
  origin: string | null,
  ctx: ExecutionContext | undefined,
  applyCorsToHeaders: (headers: Headers) => void,
  jsonResponse: JsonResponder,
): Promise<Response | null> {
  if (request.method !== 'GET' || !normalizedPath.startsWith('/api/guest/books/')) {
    return null;
  }

  const guestTocMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/toc$/);
  if (guestTocMatch) {
    const rawIncludeIdx = url.searchParams.get('includeChapter');
    const includeChapterIndex =
      rawIncludeIdx !== null && /^\d+$/.test(rawIncludeIdx) ? Number(rawIncludeIdx) : undefined;
    const includeChapterId = url.searchParams.get('includeChapterId')?.trim() || undefined;
    const toc = await getGuestBookToc(
      env,
      auth,
      guestTocMatch[1],
      includeChapterIndex !== undefined || includeChapterId
        ? { includeChapterIndex, includeChapterId }
        : undefined,
    );
    if (toc.initialChapter) {
      scheduleUsageEvent(ctx, env.DB, {
        metric: 'guest_chapter_reads',
        readerScope: auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`,
        readerRole: auth.role,
      });
    }
    return jsonResponse(toc, 200, origin);
  }

  const guestIllustrationsMatch = normalizedPath.match(
    /^\/api\/guest\/books\/([^/]+)\/illustrations$/,
  );
  if (guestIllustrationsMatch) {
    try {
      const gallery = await getGuestBookIllustrations(env, auth, guestIllustrationsMatch[1]);
      return jsonResponse(gallery, 200, origin);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        scheduleUsageEvent(ctx, env.DB, { metric: 'rate_limit_hits' });
      }
      throw err;
    }
  }

  const guestChapterMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/chapters\/(\d+)$/);
  if (guestChapterMatch) {
    try {
      const chapter = await getGuestEncryptedChapter(
        env,
        auth,
        guestChapterMatch[1],
        Number(guestChapterMatch[2]),
      );
      scheduleUsageEvent(ctx, env.DB, {
        metric: 'guest_chapter_reads',
        readerScope: auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`,
        readerRole: auth.role,
      });
      return jsonResponse(chapter, 200, origin);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        scheduleUsageEvent(ctx, env.DB, { metric: 'rate_limit_hits' });
      }
      throw err;
    }
  }

  const guestMediaMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/media\/(\d+)$/);
  if (guestMediaMatch) {
    try {
      return await getGuestEncryptedMediaResponse(
        env,
        auth,
        guestMediaMatch[1],
        Number(guestMediaMatch[2]),
        applyCorsToHeaders,
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        scheduleUsageEvent(ctx, env.DB, { metric: 'rate_limit_hits' });
      }
      throw err;
    }
  }

  const guestSearchMatch = normalizedPath.match(/^\/api\/guest\/books\/([^/]+)\/search$/);
  if (guestSearchMatch) {
    try {
      const result = await searchGuestBookChapters(
        env,
        auth,
        guestSearchMatch[1],
        url.searchParams.get('q'),
      );
      scheduleUsageEvent(ctx, env.DB, {
        metric: 'guest_searches',
        readerScope: auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`,
        readerRole: auth.role,
      });
      return jsonResponse(result, 200, origin);
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        scheduleUsageEvent(ctx, env.DB, { metric: 'rate_limit_hits' });
      }
      throw err;
    }
  }

  return null;
}
