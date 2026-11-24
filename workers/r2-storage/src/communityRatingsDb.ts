import { type AuthContext, HttpError } from './auth';
import { MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import {
  assertGuestBookAccess,
  assertGuestShelfAccess,
  shelfExistsInBooks,
  toShelfAccessKey,
} from './shelfAccessDb';

export type CommunityTargetType = 'shelf' | 'book';

export interface ShelfRatingAggregate {
  average: number;
  count: number;
}

const ensuredCommunityDbs = new WeakSet<D1Database>();

async function addCommentColumnIfMissing(
  db: D1Database,
  existingCols: ReadonlySet<string>,
  columnName: string,
  columnType: 'TEXT' | 'INTEGER',
): Promise<void> {
  if (existingCols.has(columnName)) return;
  try {
    await db.prepare(`ALTER TABLE library_comments ADD COLUMN ${columnName} ${columnType}`).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('duplicate column')) throw err;
  }
}

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
         rating_half INTEGER CHECK (rating_half BETWEEN 1 AND 10),
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
         parent_id TEXT,
         chapter_number INTEGER,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS library_comment_reactions (
         comment_id TEXT NOT NULL,
         user_scope TEXT NOT NULL,
         emoji TEXT NOT NULL CHECK (emoji IN ('fire', 'cry', 'laugh', 'heart', 'mindblown')),
         created_at INTEGER NOT NULL,
         PRIMARY KEY (comment_id, user_scope, emoji)
       )`,
    ),
  ]);

  const [commentCols, ratingCols] = await Promise.all([
    db.prepare('PRAGMA table_info(library_comments)').all<{ name: string }>(),
    db.prepare('PRAGMA table_info(library_ratings)').all<{ name: string }>(),
  ]);
  const existingCols = new Set((commentCols.results || []).map((c) => c.name));
  await addCommentColumnIfMissing(db, existingCols, 'parent_id', 'TEXT');
  await addCommentColumnIfMissing(db, existingCols, 'chapter_number', 'INTEGER');

  const existingRatingCols = new Set((ratingCols.results || []).map((c) => c.name));
  if (!existingRatingCols.has('rating_half')) {
    try {
      await db
        .prepare(
          'ALTER TABLE library_ratings ADD COLUMN rating_half INTEGER CHECK (rating_half BETWEEN 1 AND 10)',
        )
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('duplicate column')) throw err;
    }
  }

  await db.batch([
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_comments_target
       ON library_comments(target_type, target_key, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_comments_user_created
       ON library_comments(user_scope, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_library_comments_parent
       ON library_comments(parent_id) WHERE parent_id IS NOT NULL`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
       ON library_comment_reactions(comment_id)`,
    ),
  ]);

  ensuredCommunityDbs.add(db);
}

export function resolveCommunityUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

export function resolveCommunityAuthorName(auth: AuthContext): string {
  if (auth.role === 'owner') return 'Owner';
  const clean = (auth.discordUsername || '').trim();
  return (clean || 'Thành viên Discord').slice(0, 80);
}

export async function resolveAndAuthorizeCommunityTarget(
  db: D1Database,
  auth: AuthContext,
  rawType: unknown,
  rawKey: unknown,
  requireShelfExists = false,
): Promise<{ targetType: CommunityTargetType; targetKey: string }> {
  if (rawType !== 'shelf' && rawType !== 'book') {
    throw new HttpError('Loại mục tiêu bình luận/đánh giá không hợp lệ (chỉ nhận shelf hoặc book).', 400);
  }
  const keyText = typeof rawKey === 'string' ? rawKey.normalize('NFC').trim() : '';
  if (!keyText) {
    throw new HttpError('Thiếu mã bộ truyện hoặc mã tập sách.', 400);
  }

  if (rawType === 'shelf') {
    if (keyText.length > MAX_SHELF_NAME_LENGTH) {
      throw new HttpError(`Tên bộ truyện không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`, 400);
    }
    const shelfKey = toShelfAccessKey(keyText);
    await assertGuestShelfAccess(db, auth, shelfKey);
    if (requireShelfExists && !(await shelfExistsInBooks(db, shelfKey))) {
      throw new HttpError('Không tìm thấy bộ truyện này trong thư viện.', 404);
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
  await assertGuestBookAccess(db, auth, bookRow.id);
  return { targetType: 'book', targetKey: bookRow.id };
}

/**
 * Trả điểm sao trung bình & số lượt chấm của toàn bộ các bộ truyện cho `GET /api/books`
 * (QĐ-3 = 3B: bao gồm cả bộ `restricted`, tương tự `weeklyPopular`; giữ nguyên chặn 403 ở D-030).
 */
export async function loadAllShelfRatingsMap(
  db: D1Database,
): Promise<Record<string, ShelfRatingAggregate>> {
  await ensureCommunityTables(db);
  const res = await db
    .prepare(
      `SELECT target_key, COUNT(*) AS cnt, SUM(COALESCE(rating_half / 2.0, rating)) AS sum_rating
       FROM library_ratings
       WHERE target_type = 'shelf'
       GROUP BY target_key`,
    )
    .all<{ target_key: string; cnt: number; sum_rating: number }>();

  const acc = new Map<string, { sum: number; count: number }>();
  for (const row of res.results || []) {
    const key = toShelfAccessKey(row.target_key || '');
    const cnt = Number(row.cnt ?? 0);
    const sum = Number(row.sum_rating ?? 0);
    if (!key || cnt <= 0 || !Number.isFinite(sum)) continue;
    const prev = acc.get(key);
    if (prev) {
      prev.sum += sum;
      prev.count += cnt;
    } else {
      acc.set(key, { sum, count: cnt });
    }
  }

  const out: Record<string, ShelfRatingAggregate> = {};
  for (const [key, item] of acc.entries()) {
    if (item.count > 0) {
      out[key] = {
        average: Math.round((item.sum / item.count) * 10) / 10,
        count: item.count,
      };
    }
  }
  return out;
}

export async function loadRatingSummary(
  db: D1Database,
  targetType: CommunityTargetType,
  targetKey: string,
  userScope: string,
): Promise<{ averageRating: number | null; ratingCount: number; myRating: number | null }> {
  const [aggRow, mineRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS cnt, AVG(COALESCE(rating_half / 2.0, rating)) AS avg_rating
         FROM library_ratings
         WHERE target_type = ? AND target_key = ?`,
      )
      .bind(targetType, targetKey)
      .first<{ cnt: number; avg_rating: number | null }>(),
    db
      .prepare(
        `SELECT COALESCE(rating_half / 2.0, rating) AS effective_rating
         FROM library_ratings
         WHERE target_type = ? AND target_key = ? AND user_scope = ?`,
      )
      .bind(targetType, targetKey, userScope)
      .first<{ effective_rating: number }>(),
  ]);

  const ratingCount = Number(aggRow?.cnt ?? 0);
  const averageRating =
    ratingCount > 0 && typeof aggRow?.avg_rating === 'number' && Number.isFinite(aggRow.avg_rating)
      ? Math.round(aggRow.avg_rating * 10) / 10
      : null;
  const rawMine = mineRow?.effective_rating;
  const myRating =
    typeof rawMine === 'number' && Number.isFinite(rawMine) && rawMine >= 0.5 && rawMine <= 5
      ? Math.round(rawMine * 10) / 10
      : null;

  return { averageRating, ratingCount, myRating };
}

export async function upsertTargetRatingRecord(
  db: D1Database,
  targetType: CommunityTargetType,
  targetKey: string,
  userScope: string,
  authorName: string,
  rawRating: unknown,
) {
  if (rawRating === null || rawRating === 0) {
    await db
      .prepare(
        'DELETE FROM library_ratings WHERE target_type = ? AND target_key = ? AND user_scope = ?',
      )
      .bind(targetType, targetKey, userScope)
      .run();
  } else if (typeof rawRating === 'number' && Number.isFinite(rawRating)) {
    const half = Math.round(rawRating * 2);
    if (Math.abs(rawRating * 2 - half) > 1e-6 || half < 1 || half > 10) {
      throw new HttpError('Điểm đánh giá phải từ 0.5 đến 5.0 sao (bước 0.5).', 400);
    }
    const compatRating = Math.max(1, Math.min(5, Math.round(half / 2)));
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO library_ratings (target_type, target_key, user_scope, author_name, rating, rating_half, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_type, target_key, user_scope) DO UPDATE SET
           author_name = excluded.author_name,
           rating = excluded.rating,
           rating_half = excluded.rating_half,
           updated_at = excluded.updated_at`,
      )
      .bind(targetType, targetKey, userScope, authorName, compatRating, half, now)
      .run();
  } else {
    throw new HttpError('Điểm đánh giá phải từ 0.5 đến 5.0 sao (bước 0.5).', 400);
  }

  const summary = await loadRatingSummary(db, targetType, targetKey, userScope);
  return { ok: true, targetType, targetKey, ...summary };
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
        `INSERT INTO library_ratings (target_type, target_key, user_scope, author_name, rating, rating_half, updated_at)
         SELECT 'shelf', ?, user_scope, author_name, rating, rating_half, updated_at
         FROM library_ratings
         WHERE target_type = 'shelf' AND target_key = ?
         ON CONFLICT(target_type, target_key, user_scope) DO UPDATE SET
           rating = CASE
             WHEN excluded.updated_at > library_ratings.updated_at THEN excluded.rating
             ELSE library_ratings.rating
           END,
           rating_half = CASE
             WHEN excluded.updated_at > library_ratings.updated_at THEN excluded.rating_half
             ELSE library_ratings.rating_half
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
