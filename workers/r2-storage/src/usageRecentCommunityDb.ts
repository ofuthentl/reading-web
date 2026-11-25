import { ensureCommunityTables } from './communityDb';
import { toShelfAccessKey } from './shelfAccessDb';

export interface AdminRecentCommentItem {
  id: string;
  targetType: 'shelf' | 'book';
  targetKey: string;
  targetLabel: string;
  shelfName: string | null;
  authorName: string;
  authorRole: 'owner' | 'guest';
  content: string;
  parentId: string | null;
  chapterNumber: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminRecentRatingItem {
  targetType: 'shelf' | 'book';
  targetKey: string;
  targetLabel: string;
  shelfName: string | null;
  authorName: string;
  userScope: string;
  rating: number;
  updatedAt: number;
}

export interface AdminRecentCommunityReport {
  generatedAt: number;
  comments: AdminRecentCommentItem[];
  ratings: AdminRecentRatingItem[];
}

export async function getAdminRecentCommunity(
  db: D1Database,
  rawLimit?: string | null,
): Promise<AdminRecentCommunityReport> {
  await ensureCommunityTables(db);
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 30;
  const limit = Number.isFinite(parsedLimit) ? Math.max(5, Math.min(60, parsedLimit)) : 30;

  const [commentsRes, ratingsRes, booksRes] = await db.batch([
    db
      .prepare(
        `SELECT id, target_type, target_key, author_name, author_role, content, parent_id, chapter_number, created_at, updated_at
         FROM library_comments
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(limit),
    db
      .prepare(
        `SELECT target_type, target_key, user_scope, author_name,
                COALESCE(rating_half / 2.0, rating) AS effective_rating, updated_at
         FROM library_ratings
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .bind(limit),
    db.prepare('SELECT id, title, shelf FROM books'),
  ]);

  const bookMap = new Map<string, { title: string; shelf: string }>();
  const shelfDisplayByKey = new Map<string, string>();
  for (const b of (booksRes.results || []) as Array<{ id: string; title: string; shelf: string }>) {
    bookMap.set(b.id, { title: b.title, shelf: b.shelf });
    const sk = toShelfAccessKey(b.shelf);
    if (sk && !shelfDisplayByKey.has(sk)) {
      shelfDisplayByKey.set(sk, b.shelf);
    }
  }

  const resolveTarget = (
    targetType: 'shelf' | 'book',
    targetKey: string,
  ): { targetLabel: string; shelfName: string | null } => {
    if (targetType === 'book') {
      const found = bookMap.get(targetKey);
      return {
        targetLabel: found?.title || targetKey,
        shelfName: found?.shelf || null,
      };
    }
    const label = shelfDisplayByKey.get(toShelfAccessKey(targetKey)) || targetKey;
    return { targetLabel: label, shelfName: label };
  };

  const comments: AdminRecentCommentItem[] = (
    (commentsRes.results || []) as Array<{
      id: string;
      target_type: 'shelf' | 'book';
      target_key: string;
      author_name: string;
      author_role: string;
      content: string;
      parent_id: string | null;
      chapter_number: number | null;
      created_at: number;
      updated_at: number;
    }>
  ).map((row) => {
    const resolved = resolveTarget(row.target_type, row.target_key);
    return {
      id: row.id,
      targetType: row.target_type,
      targetKey: row.target_key,
      targetLabel: resolved.targetLabel,
      shelfName: resolved.shelfName,
      authorName: row.author_name,
      authorRole: row.author_role === 'owner' ? 'owner' : 'guest',
      content: row.content,
      parentId: row.parent_id ?? null,
      chapterNumber:
        typeof row.chapter_number === 'number' && Number.isFinite(row.chapter_number)
          ? row.chapter_number
          : null,
      createdAt: Number(row.created_at) || 0,
      updatedAt: Number(row.updated_at) || 0,
    };
  });

  const ratings: AdminRecentRatingItem[] = (
    (ratingsRes.results || []) as Array<{
      target_type: 'shelf' | 'book';
      target_key: string;
      user_scope: string;
      author_name: string;
      effective_rating: number;
      updated_at: number;
    }>
  ).map((row) => {
    const resolved = resolveTarget(row.target_type, row.target_key);
    return {
      targetType: row.target_type,
      targetKey: row.target_key,
      targetLabel: resolved.targetLabel,
      shelfName: resolved.shelfName,
      authorName: row.author_name,
      userScope: row.user_scope,
      rating: Math.round((Number(row.effective_rating) || 0) * 2) / 2,
      updatedAt: Number(row.updated_at) || 0,
    };
  });

  return {
    generatedAt: Date.now(),
    comments,
    ratings,
  };
}
