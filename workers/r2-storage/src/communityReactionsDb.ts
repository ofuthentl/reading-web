import { type AuthContext, HttpError } from './auth';
import { BULK_D1_CHUNK_SIZE, isValidId } from './booksDb';
import { assertGuestShelfAccess } from './shelfAccessDb';

export type CommunityReactionEmoji = 'fire' | 'cry' | 'laugh' | 'heart' | 'mindblown';

export const VALID_REACTION_EMOJIS: readonly CommunityReactionEmoji[] = [
  'fire',
  'cry',
  'laugh',
  'heart',
  'mindblown',
];

const VALID_EMOJI_SET = new Set<string>(VALID_REACTION_EMOJIS);

export type CommunityReactionCounts = Partial<Record<CommunityReactionEmoji, number>>;

export interface CommentReactionSnapshot {
  reactions: CommunityReactionCounts;
  myReactions: CommunityReactionEmoji[];
}

function chunkStrings(items: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function parseReactionEmoji(raw: unknown): CommunityReactionEmoji {
  if (typeof raw === 'string' && VALID_EMOJI_SET.has(raw)) {
    return raw as CommunityReactionEmoji;
  }
  throw new HttpError(
    'Biểu cảm không hợp lệ (chỉ chấp nhận fire, cry, laugh, heart, mindblown).',
    400,
  );
}

export async function authorizeExistingCommentAccess(
  db: D1Database,
  auth: AuthContext,
  targetType: 'shelf' | 'book',
  targetKey: string,
): Promise<void> {
  if (auth.role === 'owner') return;
  if (targetType === 'shelf') {
    await assertGuestShelfAccess(db, auth, targetKey);
    return;
  }
  const bookRow = await db
    .prepare('SELECT shelf FROM books WHERE id = ?')
    .bind(targetKey)
    .first<{ shelf: string }>();
  if (!bookRow) {
    throw new HttpError('Không tìm thấy tập sách.', 404);
  }
  await assertGuestShelfAccess(db, auth, bookRow.shelf);
}

export async function loadReactionsForComments(
  db: D1Database,
  commentIds: readonly string[],
  userScope: string,
): Promise<Map<string, CommentReactionSnapshot>> {
  const map = new Map<string, CommentReactionSnapshot>();
  if (commentIds.length === 0) return map;

  const uniqueIds = Array.from(new Set(commentIds.filter(Boolean)));
  for (const chunk of chunkStrings(uniqueIds, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(
        `SELECT
           comment_id,
           emoji,
           COUNT(*) AS cnt,
           MAX(CASE WHEN user_scope = ? THEN 1 ELSE 0 END) AS mine
         FROM library_comment_reactions
         WHERE comment_id IN (${placeholders})
         GROUP BY comment_id, emoji`,
      )
      .bind(userScope, ...chunk)
      .all<{ comment_id: string; emoji: string; cnt: number; mine: number }>()
      .catch(() => ({
        results: [] as Array<{ comment_id: string; emoji: string; cnt: number; mine: number }>,
      }));

    for (const row of res.results || []) {
      if (!VALID_EMOJI_SET.has(row.emoji)) continue;
      const emoji = row.emoji as CommunityReactionEmoji;
      const count = Number(row.cnt ?? 0);
      if (count <= 0) continue;

      let entry = map.get(row.comment_id);
      if (!entry) {
        entry = { reactions: {}, myReactions: [] };
        map.set(row.comment_id, entry);
      }
      entry.reactions[emoji] = count;
      if (Number(row.mine) === 1 && !entry.myReactions.includes(emoji)) {
        entry.myReactions.push(emoji);
      }
    }
  }

  return map;
}

export async function toggleCommunityCommentReaction(
  db: D1Database,
  auth: AuthContext,
  commentId: string,
  userScope: string,
  rawBody: unknown,
  ensureSchema: (db: D1Database) => Promise<void>,
) {
  if (!isValidId(commentId)) {
    throw new HttpError('ID bình luận không hợp lệ.', 400);
  }
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    emoji?: unknown;
  } | null;
  const emoji = parseReactionEmoji(body?.emoji);

  await ensureSchema(db);
  const existing = await db
    .prepare('SELECT id, target_type, target_key FROM library_comments WHERE id = ?')
    .bind(commentId)
    .first<{ id: string; target_type: 'shelf' | 'book'; target_key: string }>();

  if (!existing) {
    throw new HttpError('Không tìm thấy bình luận.', 404);
  }

  await authorizeExistingCommentAccess(db, auth, existing.target_type, existing.target_key);

  const deleteRes = await db
    .prepare(
      'DELETE FROM library_comment_reactions WHERE comment_id = ? AND user_scope = ? AND emoji = ?',
    )
    .bind(commentId, userScope, emoji)
    .run();

  let active = false;
  if ((deleteRes.meta?.changes ?? 0) === 0) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO library_comment_reactions (comment_id, user_scope, emoji, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(commentId, userScope, emoji, Date.now())
      .run();
    active = true;
  }

  const reactionMap = await loadReactionsForComments(db, [commentId], userScope);
  const snapshot = reactionMap.get(commentId) ?? { reactions: {}, myReactions: [] };

  return {
    ok: true,
    commentId,
    emoji,
    active,
    reactions: snapshot.reactions,
    myReactions: snapshot.myReactions,
  };
}

/**
 * Sinh cặp câu lệnh xoá nguyên tử toàn bộ reaction + bình luận con 1 cấp + bình luận gốc.
 * Phải chạy tuần tự trong `db.batch(...)` để subquery còn thấy các bình luận con trước khi xoá.
 */
export function buildDeleteCommentTreeStatements(
  db: D1Database,
  commentId: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `DELETE FROM library_comment_reactions
         WHERE comment_id = ?
            OR comment_id IN (SELECT id FROM library_comments WHERE parent_id = ?)`,
      )
      .bind(commentId, commentId),
    db
      .prepare('DELETE FROM library_comments WHERE id = ? OR parent_id = ?')
      .bind(commentId, commentId),
  ];
}

/**
 * Xoá sạch reaction & toàn bộ bình luận thuộc tập sách hoặc kệ sách một cách an toàn:
 * tách riêng 2 câu lệnh (và cho phép gọi `ensureSchema` trước) để lỗi thiếu bảng
 * `library_comment_reactions` trên DB cũ không bao giờ làm rollback mất `DELETE FROM library_comments`.
 */
export async function deleteTargetCommentsSafely(
  db: D1Database,
  targetType: 'shelf' | 'book',
  targetKeys: readonly string[],
  ensureSchema?: (db: D1Database) => Promise<void>,
): Promise<void> {
  if (targetKeys.length === 0) return;
  if (ensureSchema) {
    await ensureSchema(db).catch(() => undefined);
  }
  const placeholders = targetKeys.map(() => '?').join(', ');
  await db
    .prepare(
      `DELETE FROM library_comment_reactions
       WHERE comment_id IN (
         SELECT id FROM library_comments
         WHERE target_type = ? AND target_key IN (${placeholders})
       )`,
    )
    .bind(targetType, ...targetKeys)
    .run()
    .catch(() => undefined);
  await db
    .prepare(
      `DELETE FROM library_comments
       WHERE target_type = ? AND target_key IN (${placeholders})`,
    )
    .bind(targetType, ...targetKeys)
    .run()
    .catch(() => undefined);
}

/**
 * Tải phản hồi con 1 cấp cho tập bình luận gốc đã lấy (giới hạn chặt `maxReplies` chống phình truy vấn).
 */
export async function loadRepliesForRootComments<T>(
  db: D1Database,
  targetType: 'shelf' | 'book',
  targetKey: string,
  rootIds: readonly string[],
  maxReplies = 500,
): Promise<T[]> {
  if (rootIds.length === 0) return [];
  const collected: T[] = [];
  for (const chunk of chunkStrings(rootIds, BULK_D1_CHUNK_SIZE)) {
    const remaining = maxReplies - collected.length;
    if (remaining <= 0) break;
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(
        `SELECT id, user_scope, author_name, author_role, content, parent_id, chapter_number, created_at, updated_at
         FROM library_comments
         WHERE target_type = ? AND target_key = ? AND parent_id IN (${placeholders})
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(targetType, targetKey, ...chunk, remaining)
      .all<T>();
    if (res.results?.length) {
      collected.push(...res.results);
    }
  }
  return collected;
}
