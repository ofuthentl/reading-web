import { type AuthContext, type AuthRole, HttpError } from './auth';
import { isValidId } from './booksDb';
import {
  type CommunityTargetType,
  type ShelfRatingAggregate,
  ensureCommunityTables,
  loadAllShelfRatingsMap,
  loadRatingSummary,
  mergeCommunityRelationsOnShelfRename,
  resolveAndAuthorizeCommunityTarget,
  resolveCommunityAuthorName,
  resolveCommunityUserScope,
  upsertTargetRatingRecord,
} from './communityRatingsDb';
import {
  type CommunityReactionCounts,
  type CommunityReactionEmoji,
  authorizeExistingCommentAccess,
  buildDeleteCommentTreeStatements,
  loadReactionsForComments,
  toggleCommunityCommentReaction,
} from './communityReactionsDb';

export {
  type CommunityTargetType,
  type ShelfRatingAggregate,
  ensureCommunityTables,
  loadAllShelfRatingsMap,
  mergeCommunityRelationsOnShelfRename,
};

export interface CommunityCommentItem {
  id: string;
  parentId: string | null;
  chapterNumber: number | null;
  authorName: string;
  authorRole: AuthRole;
  content: string;
  createdAt: number;
  updatedAt: number;
  isEdited: boolean;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  reactions: CommunityReactionCounts;
  myReactions: CommunityReactionEmoji[];
}

export interface CommunitySummaryResponse {
  targetType: CommunityTargetType;
  targetKey: string;
  averageRating: number | null;
  ratingCount: number;
  myRating: number | null;
  comments: CommunityCommentItem[];
  totalComments: number;
}

interface RawCommentRow {
  id: string;
  user_scope: string;
  author_name: string;
  author_role: string;
  content: string;
  parent_id: string | null;
  chapter_number: number | null;
  created_at: number;
  updated_at: number;
}

const MAX_COMMENT_LENGTH = 1500;
const MAX_CHAPTER_NUMBER = 2000;
const COMMENT_COOLDOWN_MS = 10_000;
const MAX_COMMENTS_RETURNED = 100;

function parseChapterNumber(raw: unknown, targetType: CommunityTargetType): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (targetType !== 'book') {
    throw new HttpError('Chỉ bình luận cấp tập sách mới gắn được số chương.', 400);
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_CHAPTER_NUMBER) {
    return raw;
  }
  throw new HttpError(`Số chương phải là số nguyên từ 1 đến ${MAX_CHAPTER_NUMBER}.`, 400);
}

function mapRawRowToCommentItem(
  row: RawCommentRow,
  userScope: string,
  authRole: AuthRole,
  reactionSnapshot?: { reactions: CommunityReactionCounts; myReactions: CommunityReactionEmoji[] },
): CommunityCommentItem {
  const isMine = row.user_scope === userScope;
  return {
    id: row.id,
    parentId: row.parent_id || null,
    chapterNumber:
      typeof row.chapter_number === 'number' && row.chapter_number >= 1 ? row.chapter_number : null,
    authorName: row.author_name,
    authorRole: row.author_role === 'owner' ? 'owner' : 'guest',
    content: row.content,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    isEdited: Number(row.updated_at) > Number(row.created_at),
    isMine,
    canEdit: isMine,
    canDelete: authRole === 'owner' || isMine,
    reactions: reactionSnapshot?.reactions ?? {},
    myReactions: reactionSnapshot?.myReactions ?? [],
  };
}

export async function getCommunitySummary(
  db: D1Database,
  auth: AuthContext,
  rawType: string | null,
  rawKey: string | null,
): Promise<CommunitySummaryResponse> {
  await ensureCommunityTables(db);
  const { targetType, targetKey } = await resolveAndAuthorizeCommunityTarget(
    db,
    auth,
    rawType,
    rawKey,
  );
  const userScope = resolveCommunityUserScope(auth);

  const [ratingSummary, rootsRes, repliesRes, countRow] = await Promise.all([
    loadRatingSummary(db, targetType, targetKey, userScope),
    db
      .prepare(
        `SELECT id, user_scope, author_name, author_role, content, parent_id, chapter_number, created_at, updated_at
         FROM library_comments
         WHERE target_type = ? AND target_key = ? AND parent_id IS NULL
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(targetType, targetKey, MAX_COMMENTS_RETURNED)
      .all<RawCommentRow>(),
    db
      .prepare(
        `SELECT id, user_scope, author_name, author_role, content, parent_id, chapter_number, created_at, updated_at
         FROM library_comments
         WHERE target_type = ? AND target_key = ? AND parent_id IS NOT NULL
         ORDER BY created_at ASC`,
      )
      .bind(targetType, targetKey)
      .all<RawCommentRow>(),
    db
      .prepare('SELECT COUNT(*) AS cnt FROM library_comments WHERE target_type = ? AND target_key = ?')
      .bind(targetType, targetKey)
      .first<{ cnt: number }>(),
  ]);

  const rootRows = rootsRes.results || [];
  const rootIdSet = new Set(rootRows.map((r) => r.id));
  const replyRows = (repliesRes.results || []).filter(
    (r) => Boolean(r.parent_id && rootIdSet.has(r.parent_id)),
  );
  const combinedRows = [...rootRows, ...replyRows];
  const reactionMap = await loadReactionsForComments(
    db,
    combinedRows.map((r) => r.id),
    userScope,
  );

  const comments: CommunityCommentItem[] = combinedRows.map((row) =>
    mapRawRowToCommentItem(row, userScope, auth.role, reactionMap.get(row.id)),
  );

  return {
    targetType,
    targetKey,
    averageRating: ratingSummary.averageRating,
    ratingCount: ratingSummary.ratingCount,
    myRating: ratingSummary.myRating,
    comments,
    totalComments: Number(countRow?.cnt ?? comments.length),
  };
}

export async function upsertCommunityRating(
  db: D1Database,
  auth: AuthContext,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    targetType?: unknown;
    targetKey?: unknown;
    rating?: unknown;
  } | null;

  await ensureCommunityTables(db);
  const { targetType, targetKey } = await resolveAndAuthorizeCommunityTarget(
    db,
    auth,
    body?.targetType,
    body?.targetKey,
    true,
  );
  return upsertTargetRatingRecord(
    db,
    targetType,
    targetKey,
    resolveCommunityUserScope(auth),
    resolveCommunityAuthorName(auth),
    body?.rating,
  );
}

export async function createCommunityComment(
  db: D1Database,
  auth: AuthContext,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    targetType?: unknown;
    targetKey?: unknown;
    content?: unknown;
    parentId?: unknown;
    chapterNumber?: unknown;
  } | null;

  await ensureCommunityTables(db);
  const { targetType, targetKey } = await resolveAndAuthorizeCommunityTarget(
    db,
    auth,
    body?.targetType,
    body?.targetKey,
    true,
  );

  const rawContent = typeof body?.content === 'string' ? body.content : '';
  const content = rawContent.normalize('NFC').replace(/\r\n/g, '\n').trim();
  if (content.length < 1 || content.length > MAX_COMMENT_LENGTH) {
    throw new HttpError(`Nội dung bình luận phải từ 1 đến ${MAX_COMMENT_LENGTH} ký tự.`, 400);
  }

  let parentId: string | null = null;
  let inheritedChapter: number | null = null;
  if (body?.parentId !== null && body?.parentId !== undefined && body?.parentId !== '') {
    if (typeof body.parentId !== 'string' || !isValidId(body.parentId)) {
      throw new HttpError('ID bình luận gốc không hợp lệ.', 400);
    }
    const parentRow = await db
      .prepare(
        'SELECT id, target_type, target_key, parent_id, chapter_number FROM library_comments WHERE id = ?',
      )
      .bind(body.parentId)
      .first<{
        id: string;
        target_type: CommunityTargetType;
        target_key: string;
        parent_id: string | null;
        chapter_number: number | null;
      }>();

    if (!parentRow) throw new HttpError('Không tìm thấy bình luận gốc để trả lời.', 404);
    if (parentRow.target_type !== targetType || parentRow.target_key !== targetKey) {
      throw new HttpError('Phản hồi không khớp với mục tiêu bình luận gốc.', 400);
    }
    if (parentRow.parent_id !== null) {
      throw new HttpError('Chỉ hỗ trợ trả lời bình luận tối đa 1 cấp.', 400);
    }
    parentId = parentRow.id;
    inheritedChapter = parentRow.chapter_number;
  }

  const explicitChapter = parseChapterNumber(body?.chapterNumber, targetType);
  const chapterNumber =
    targetType === 'book' ? (explicitChapter ?? inheritedChapter ?? null) : null;

  const userScope = resolveCommunityUserScope(auth);
  const now = Date.now();
  const id = crypto.randomUUID().replace(/-/g, '');
  const authorName = resolveCommunityAuthorName(auth);
  const authorRole: AuthRole = auth.role;

  const insertRes = await db
    .prepare(
      `INSERT INTO library_comments (
         id, target_type, target_key, user_scope, author_name, author_role,
         content, parent_id, chapter_number, created_at, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM library_comments
         WHERE user_scope = ? AND created_at > ?
       )`,
    )
    .bind(
      id,
      targetType,
      targetKey,
      userScope,
      authorName,
      authorRole,
      content,
      parentId,
      chapterNumber,
      now,
      now,
      userScope,
      now - COMMENT_COOLDOWN_MS,
    )
    .run();

  if ((insertRes.meta?.changes ?? 0) !== 1) {
    const recentRow = await db
      .prepare(
        'SELECT created_at FROM library_comments WHERE user_scope = ? ORDER BY created_at DESC LIMIT 1',
      )
      .bind(userScope)
      .first<{ created_at: number }>();
    const waitSec = recentRow
      ? Math.max(1, Math.ceil((COMMENT_COOLDOWN_MS - (now - Number(recentRow.created_at))) / 1000))
      : Math.ceil(COMMENT_COOLDOWN_MS / 1000);
    throw new HttpError(
      `Bạn đang gửi bình luận quá nhanh. Vui lòng đợi ${waitSec} giây rồi thử lại.`,
      429,
      { 'Retry-After': String(waitSec) },
    );
  }

  const comment: CommunityCommentItem = {
    id,
    parentId,
    chapterNumber,
    authorName,
    authorRole,
    content,
    createdAt: now,
    updatedAt: now,
    isEdited: false,
    isMine: true,
    canEdit: true,
    canDelete: true,
    reactions: {},
    myReactions: [],
  };

  return { ok: true, comment };
}

export async function updateCommunityComment(
  db: D1Database,
  auth: AuthContext,
  commentId: string,
  rawBody: unknown,
) {
  if (!isValidId(commentId)) throw new HttpError('ID bình luận không hợp lệ.', 400);
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    content?: unknown;
    chapterNumber?: unknown;
  } | null;

  await ensureCommunityTables(db);
  const existing = await db
    .prepare(
      `SELECT id, target_type, target_key, user_scope, author_name, author_role,
              content, parent_id, chapter_number, created_at, updated_at
       FROM library_comments WHERE id = ?`,
    )
    .bind(commentId)
    .first<RawCommentRow & { target_type: CommunityTargetType; target_key: string }>();

  if (!existing) throw new HttpError('Không tìm thấy bình luận.', 404);
  await authorizeExistingCommentAccess(db, auth, existing.target_type, existing.target_key);

  const userScope = resolveCommunityUserScope(auth);
  if (existing.user_scope !== userScope) {
    throw new HttpError('Chỉ chính chủ mới có thể chỉnh sửa bình luận này.', 403);
  }

  const rawContent = typeof body?.content === 'string' ? body.content : '';
  const content = rawContent.normalize('NFC').replace(/\r\n/g, '\n').trim();
  if (content.length < 1 || content.length > MAX_COMMENT_LENGTH) {
    throw new HttpError(`Nội dung bình luận phải từ 1 đến ${MAX_COMMENT_LENGTH} ký tự.`, 400);
  }

  const nextChapterNumber =
    body && 'chapterNumber' in body
      ? parseChapterNumber(body.chapterNumber, existing.target_type)
      : existing.chapter_number;

  const updatedAt = Math.max(Date.now(), Number(existing.created_at) + 1);
  await db
    .prepare('UPDATE library_comments SET content = ?, chapter_number = ?, updated_at = ? WHERE id = ?')
    .bind(content, nextChapterNumber, updatedAt, commentId)
    .run();

  const reactionMap = await loadReactionsForComments(db, [commentId], userScope);
  const updatedRow: RawCommentRow = {
    ...existing,
    content,
    chapter_number: nextChapterNumber,
    updated_at: updatedAt,
  };

  return {
    ok: true,
    comment: mapRawRowToCommentItem(updatedRow, userScope, auth.role, reactionMap.get(commentId)),
  };
}

export async function deleteCommunityComment(
  db: D1Database,
  auth: AuthContext,
  commentId: string,
) {
  if (!isValidId(commentId)) throw new HttpError('ID bình luận không hợp lệ.', 400);
  await ensureCommunityTables(db);
  const existing = await db
    .prepare('SELECT id, target_type, target_key, user_scope FROM library_comments WHERE id = ?')
    .bind(commentId)
    .first<{
      id: string;
      target_type: CommunityTargetType;
      target_key: string;
      user_scope: string;
    }>();

  if (!existing) throw new HttpError('Không tìm thấy bình luận.', 404);
  await authorizeExistingCommentAccess(db, auth, existing.target_type, existing.target_key);

  if (auth.role !== 'owner' && existing.user_scope !== resolveCommunityUserScope(auth)) {
    throw new HttpError('Bạn chỉ có thể xoá bình luận của chính mình.', 403);
  }

  const replyCountRow = await db
    .prepare('SELECT COUNT(*) AS cnt FROM library_comments WHERE parent_id = ?')
    .bind(commentId)
    .first<{ cnt: number }>();

  await db.batch(buildDeleteCommentTreeStatements(db, commentId));
  return {
    ok: true,
    deletedId: commentId,
    deletedCount: 1 + Number(replyCountRow?.cnt ?? 0),
  };
}

export async function tryHandleCommunityRoutes(
  request: Request,
  normalizedPath: string,
  url: URL,
  db: D1Database,
  auth: AuthContext,
  origin: string | null,
  jsonResponse: (
    body: unknown,
    status: number,
    origin: string | null,
    extraHeaders?: Record<string, string>,
  ) => Response,
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
