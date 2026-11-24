import { type AuthContext, type AuthRole, HttpError } from './auth';
import { MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import { assertGuestShelfAccess, shelfExistsInBooks, toShelfAccessKey } from './shelfAccessDb';

export type CommunityTargetType = 'shelf' | 'book';

export interface CommunityCommentItem {
  id: string;
  authorName: string;
  authorRole: AuthRole;
  content: string;
  createdAt: number;
  updatedAt: number;
  isMine: boolean;
  canDelete: boolean;
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

const MAX_COMMENT_LENGTH = 1500;
const COMMENT_COOLDOWN_MS = 10_000;
const MAX_COMMENTS_RETURNED = 100;

const ensuredCommunityDbs = new WeakSet<D1Database>();

export async function ensureCommunityTables(db: D1Database): Promise<void> {
  if (ensuredCommunityDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS library_ratings (
         target_type TEXT NOT NULL CHECK (target_type IN ('shelf', 'book')),
         target_key TEXT NOT NULL,
         user_scope TEXT NOT NULL,
         author_name TEXT NOT NULL,
         rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (target_type, target_key, user_scope)
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS library_comments (
         id TEXT PRIMARY KEY,
         target_type TEXT NOT NULL CHECK (target_type IN ('shelf', 'book')),
         target_key TEXT NOT NULL,
         user_scope TEXT NOT NULL,
         author_name TEXT NOT NULL,
         author_role TEXT NOT NULL,
         content TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_comments_target
       ON library_comments(target_type, target_key, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_comments_user_created
       ON library_comments(user_scope, created_at DESC)`,
    ),
  ]);
  ensuredCommunityDbs.add(db);
}

function resolveUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

function resolveAuthorName(auth: AuthContext): string {
  if (auth.role === 'owner') return 'Owner';
  const clean = (auth.discordUsername || '').trim();
  return (clean || 'Thành viên Discord').slice(0, 80);
}

function parseTargetType(raw: unknown): CommunityTargetType {
  if (raw === 'shelf' || raw === 'book') return raw;
  throw new HttpError('Loại mục tiêu bình luận/đánh giá không hợp lệ (chỉ nhận shelf hoặc book).', 400);
}

async function resolveAndAuthorizeTarget(
  db: D1Database,
  auth: AuthContext,
  rawType: unknown,
  rawKey: unknown,
  requireShelfExists = false,
): Promise<{ targetType: CommunityTargetType; targetKey: string }> {
  const targetType = parseTargetType(rawType);
  const keyText = typeof rawKey === 'string' ? rawKey.normalize('NFC').trim() : '';
  if (!keyText) {
    throw new HttpError('Thiếu mã bộ truyện hoặc mã tập sách.', 400);
  }

  if (targetType === 'shelf') {
    if (keyText.length > MAX_SHELF_NAME_LENGTH) {
      throw new HttpError(`Tên bộ truyện không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`, 400);
    }
    const shelfKey = toShelfAccessKey(keyText);
    await assertGuestShelfAccess(db, auth, shelfKey);
    if (requireShelfExists) {
      const exists = await shelfExistsInBooks(db, shelfKey);
      if (!exists) {
        throw new HttpError('Không tìm thấy bộ truyện này trong thư viện.', 404);
      }
    }
    return { targetType: 'shelf', targetKey: shelfKey };
  }

  if (!isValidId(keyText)) {
    throw new HttpError('ID tập sách không hợp lệ.', 400);
  }
  const bookRow = await db
    .prepare('SELECT id, shelf FROM books WHERE id = ?')
    .bind(keyText)
    .first<{ id: string; shelf: string }>();
  if (!bookRow) {
    throw new HttpError('Không tìm thấy tập sách.', 404);
  }
  await assertGuestShelfAccess(db, auth, bookRow.shelf);
  return { targetType: 'book', targetKey: bookRow.id };
}

async function loadRatingSummary(
  db: D1Database,
  targetType: CommunityTargetType,
  targetKey: string,
  userScope: string,
): Promise<{ averageRating: number | null; ratingCount: number; myRating: number | null }> {
  const [aggRow, mineRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, AVG(rating) AS avg_rating
         FROM library_ratings
         WHERE target_type = ? AND target_key = ?`,
      )
      .bind(targetType, targetKey)
      .first<{ cnt: number; avg_rating: number | null }>(),
    db
      .prepare(
        `SELECT rating
         FROM library_ratings
         WHERE target_type = ? AND target_key = ? AND user_scope = ?`,
      )
      .bind(targetType, targetKey, userScope)
      .first<{ rating: number }>(),
  ]);

  const ratingCount = Number(aggRow?.cnt ?? 0);
  const averageRating =
    ratingCount > 0 && typeof aggRow?.avg_rating === 'number' && Number.isFinite(aggRow.avg_rating)
      ? Math.round(aggRow.avg_rating * 10) / 10
      : null;
  const myRating =
    typeof mineRow?.rating === 'number' && mineRow.rating >= 1 && mineRow.rating <= 5
      ? mineRow.rating
      : null;

  return { averageRating, ratingCount, myRating };
}

export async function getCommunitySummary(
  db: D1Database,
  auth: AuthContext,
  rawType: string | null,
  rawKey: string | null,
): Promise<CommunitySummaryResponse> {
  await ensureCommunityTables(db);
  const { targetType, targetKey } = await resolveAndAuthorizeTarget(db, auth, rawType, rawKey);
  const userScope = resolveUserScope(auth);

  const [ratingSummary, commentsRes, countRow] = await Promise.all([
    loadRatingSummary(db, targetType, targetKey, userScope),
    db
      .prepare(
        `SELECT id, user_scope, author_name, author_role, content, created_at, updated_at
         FROM library_comments
         WHERE target_type = ? AND target_key = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(targetType, targetKey, MAX_COMMENTS_RETURNED)
      .all<{
        id: string;
        user_scope: string;
        author_name: string;
        author_role: string;
        content: string;
        created_at: number;
        updated_at: number;
      }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM library_comments
         WHERE target_type = ? AND target_key = ?`,
      )
      .bind(targetType, targetKey)
      .first<{ cnt: number }>(),
  ]);

  const comments: CommunityCommentItem[] = (commentsRes.results || []).map((row) => {
    const isMine = row.user_scope === userScope;
    return {
      id: row.id,
      authorName: row.author_name,
      authorRole: row.author_role === 'owner' ? 'owner' : 'guest',
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isMine,
      canDelete: auth.role === 'owner' || isMine,
    };
  });

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
  const { targetType, targetKey } = await resolveAndAuthorizeTarget(
    db,
    auth,
    body?.targetType,
    body?.targetKey,
    true,
  );
  const userScope = resolveUserScope(auth);

  const rawRating = body?.rating;
  if (rawRating === null || rawRating === 0) {
    await db
      .prepare(
        'DELETE FROM library_ratings WHERE target_type = ? AND target_key = ? AND user_scope = ?',
      )
      .bind(targetType, targetKey, userScope)
      .run();
  } else if (
    typeof rawRating === 'number' &&
    Number.isInteger(rawRating) &&
    rawRating >= 1 &&
    rawRating <= 5
  ) {
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO library_ratings (target_type, target_key, user_scope, author_name, rating, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_type, target_key, user_scope) DO UPDATE SET
           author_name = excluded.author_name,
           rating = excluded.rating,
           updated_at = excluded.updated_at`,
      )
      .bind(targetType, targetKey, userScope, resolveAuthorName(auth), rawRating, now)
      .run();
  } else {
    throw new HttpError('Điểm đánh giá phải là số nguyên từ 1 đến 5 sao.', 400);
  }

  const summary = await loadRatingSummary(db, targetType, targetKey, userScope);
  return {
    ok: true,
    targetType,
    targetKey,
    ...summary,
  };
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
  } | null;

  await ensureCommunityTables(db);
  const { targetType, targetKey } = await resolveAndAuthorizeTarget(
    db,
    auth,
    body?.targetType,
    body?.targetKey,
    true,
  );

  const rawContent = typeof body?.content === 'string' ? body.content : '';
  const content = rawContent.normalize('NFC').replace(/\r\n/g, '\n').trim();
  if (content.length < 1 || content.length > MAX_COMMENT_LENGTH) {
    throw new HttpError(
      `Nội dung bình luận phải từ 1 đến ${MAX_COMMENT_LENGTH} ký tự.`,
      400,
    );
  }

  const userScope = resolveUserScope(auth);
  const now = Date.now();
  const id = crypto.randomUUID().replace(/-/g, '');
  const authorName = resolveAuthorName(auth);
  const authorRole: AuthRole = auth.role;

  // Chống spam bình luận song song bằng INSERT có điều kiện nguyên tử trực tiếp trong SQLite
  const insertRes = await db
    .prepare(
      `INSERT INTO library_comments (
         id, target_type, target_key, user_scope, author_name, author_role, content, created_at, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
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
      now,
      now,
      userScope,
      now - COMMENT_COOLDOWN_MS,
    )
    .run();

  if ((insertRes.meta?.changes ?? 0) !== 1) {
    const recentRow = await db
      .prepare(
        `SELECT created_at
         FROM library_comments
         WHERE user_scope = ?
         ORDER BY created_at DESC
         LIMIT 1`,
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
    authorName,
    authorRole,
    content,
    createdAt: now,
    updatedAt: now,
    isMine: true,
    canDelete: true,
  };

  return { ok: true, comment };
}

export async function deleteCommunityComment(
  db: D1Database,
  auth: AuthContext,
  commentId: string,
) {
  if (!isValidId(commentId)) {
    throw new HttpError('ID bình luận không hợp lệ.', 400);
  }

  await ensureCommunityTables(db);
  const existing = await db
    .prepare(
      'SELECT id, target_type, target_key, user_scope FROM library_comments WHERE id = ?',
    )
    .bind(commentId)
    .first<{
      id: string;
      target_type: CommunityTargetType;
      target_key: string;
      user_scope: string;
    }>();

  if (!existing) {
    throw new HttpError('Không tìm thấy bình luận.', 404);
  }

  if (auth.role !== 'owner') {
    // Bảo vệ chặt D-030 trước cả kiểm tra chủ sở hữu
    if (existing.target_type === 'shelf') {
      await assertGuestShelfAccess(db, auth, existing.target_key);
    } else {
      const bookRow = await db
        .prepare('SELECT shelf FROM books WHERE id = ?')
        .bind(existing.target_key)
        .first<{ shelf: string }>();
      if (bookRow) {
        await assertGuestShelfAccess(db, auth, bookRow.shelf);
      }
    }

    if (existing.user_scope !== resolveUserScope(auth)) {
      throw new HttpError('Bạn chỉ có thể xoá bình luận của chính mình.', 403);
    }
  }

  await db.prepare('DELETE FROM library_comments WHERE id = ?').bind(commentId).run();
  return { ok: true, deletedId: commentId };
}

export async function mergeCommunityRelationsOnShelfRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  if (!oldKey || !newKey || oldKey === newKey) return;
  await ensureCommunityTables(db);

  await db.batch([
    db
      .prepare(
        `INSERT INTO library_ratings (target_type, target_key, user_scope, author_name, rating, updated_at)
         SELECT 'shelf', ?, user_scope, author_name, rating, updated_at
         FROM library_ratings
         WHERE target_type = 'shelf' AND target_key = ?
         ON CONFLICT(target_type, target_key, user_scope) DO UPDATE SET
           rating = CASE
             WHEN excluded.updated_at > library_ratings.updated_at THEN excluded.rating
             ELSE library_ratings.rating
           END,
           author_name = CASE
             WHEN excluded.updated_at > library_ratings.updated_at THEN excluded.author_name
             ELSE library_ratings.author_name
           END,
           updated_at = MAX(library_ratings.updated_at, excluded.updated_at)`,
      )
      .bind(newKey, oldKey),
    db
      .prepare("DELETE FROM library_ratings WHERE target_type = 'shelf' AND target_key = ?")
      .bind(oldKey),
    db
      .prepare(
        "UPDATE library_comments SET target_key = ? WHERE target_type = 'shelf' AND target_key = ?",
      )
      .bind(newKey, oldKey),
  ]);
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
    const res = await upsertCommunityRating(db, auth, body);
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/community/comments' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const res = await createCommunityComment(db, auth, body);
    return jsonResponse(res, 201, origin);
  }

  const deleteMatch = normalizedPath.match(/^\/api\/community\/comments\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const res = await deleteCommunityComment(db, auth, deleteMatch[1]);
    return jsonResponse(res, 200, origin);
  }

  return null;
}
