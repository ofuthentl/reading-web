import type { AuthContext } from './auth';
import {
  createCommunityComment,
  deleteCommunityComment,
  ensureCommunityTables,
  getCommunitySummary,
  updateCommunityComment,
  upsertCommunityRating,
} from './communityDb';
import { resolveCommunityUserScope } from './communityRatingsDb';
import { toggleCommunityCommentReaction } from './communityReactionsDb';

type JsonResponder = (
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: Record<string, string>,
) => Response;

export async function tryHandleCommunityRoutes(
  request: Request,
  normalizedPath: string,
  url: URL,
  db: D1Database,
  auth: AuthContext,
  origin: string | null,
  jsonResponse: JsonResponder,
): Promise<Response | null> {
  if (normalizedPath === '/api/community' && request.method === 'GET') {
    const res = await getCommunitySummary(
      db,
      auth,
      url.searchParams.get('type'),
      url.searchParams.get('key'),
    );
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/community/rating' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    return jsonResponse(await upsertCommunityRating(db, auth, body), 200, origin);
  }

  if (normalizedPath === '/api/community/comments' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    return jsonResponse(await createCommunityComment(db, auth, body), 201, origin);
  }

  const reactionMatch = normalizedPath.match(/^\/api\/community\/comments\/([^/]+)\/reaction$/);
  if (reactionMatch && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const res = await toggleCommunityCommentReaction(
      db,
      auth,
      reactionMatch[1],
      resolveCommunityUserScope(auth),
      body,
      ensureCommunityTables,
    );
    return jsonResponse(res, 200, origin);
  }

  const itemMatch = normalizedPath.match(/^\/api\/community\/comments\/([^/]+)$/);
  if (itemMatch && request.method === 'PATCH') {
    const body = await request.json().catch(() => null);
    return jsonResponse(await updateCommunityComment(db, auth, itemMatch[1], body), 200, origin);
  }

  if (itemMatch && request.method === 'DELETE') {
    return jsonResponse(await deleteCommunityComment(db, auth, itemMatch[1]), 200, origin);
  }

  return null;
}
