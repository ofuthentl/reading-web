import { searchAniListLightNovels } from './anilistProxy';
import { type AuthContext, HttpError, requireOwner } from './auth';
import type { Env } from './booksDb';
import {
  listDiscordGuests,
  runAdminForensicCheck,
  setDiscordGuestBan,
} from './guestPack';
import {
  getAdminShelfAccessOverview,
  putAdminShelfAccessConfig,
} from './shelfAccessDb';
import { getAdminGuestUsageDetail, getAdminUsageReport } from './usageDb';

export async function tryHandleAdminRoutes(
  request: Request,
  normalizedPath: string,
  url: URL,
  env: Env,
  auth: AuthContext,
  origin: string | null,
  jsonResponse: (
    body: unknown,
    status: number,
    origin: string | null,
    extraHeaders?: Record<string, string>,
  ) => Response,
): Promise<Response | null> {
  if (!normalizedPath.startsWith('/api/admin/')) return null;

  requireOwner(auth);

  if (normalizedPath === '/api/admin/usage' && request.method === 'GET') {
    const report = await getAdminUsageReport(env, url.searchParams.get('days'));
    return jsonResponse(report, 200, origin, {
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }

  const adminGuestUsageMatch = normalizedPath.match(/^\/api\/admin\/usage\/guests\/([^/]+)$/);
  if (adminGuestUsageMatch && request.method === 'GET') {
    const detail = await getAdminGuestUsageDetail(env, adminGuestUsageMatch[1]);
    return jsonResponse(detail, 200, origin, {
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  }

  if (normalizedPath === '/api/admin/discord-guests' && request.method === 'GET') {
    const list = await listDiscordGuests(env.DB);
    return jsonResponse(list, 200, origin);
  }

  const adminBanMatch = normalizedPath.match(/^\/api\/admin\/discord-guests\/([^/]+)\/ban$/);
  if (adminBanMatch && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      banned?: unknown;
      reason?: unknown;
    } | null;
    if (typeof body?.banned !== 'boolean') {
      throw new HttpError('Trạng thái khoá không hợp lệ.', 400);
    }
    const res = await setDiscordGuestBan(
      env.DB,
      adminBanMatch[1],
      body.banned,
      typeof body.reason === 'string' ? body.reason : null,
    );
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/admin/forensic-check' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    const report = await runAdminForensicCheck(env, body?.text);
    return jsonResponse(report, 200, origin);
  }

  if (normalizedPath === '/api/admin/shelves/access' && request.method === 'GET') {
    const overview = await getAdminShelfAccessOverview(env.DB);
    return jsonResponse(overview, 200, origin);
  }

  if (normalizedPath === '/api/admin/shelves/access' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const updated = await putAdminShelfAccessConfig(env.DB, body);
    return jsonResponse(updated, 200, origin);
  }

  if (normalizedPath === '/api/admin/anilist/search' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const result = await searchAniListLightNovels(body);
    return jsonResponse(result, 200, origin);
  }

  return null;
}
