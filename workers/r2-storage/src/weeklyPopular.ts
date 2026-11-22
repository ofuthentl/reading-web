const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface PopularityAggregateRow {
  book_id: string;
  readers_7d: number;
  completed_7d: number;
  depth_7d: number;
  readers_30d: number;
  last_read_at: number;
}

/**
 * Xếp hạng trực tiếp các Tập sách (Book) thịnh hành nhất trong 7 ngày qua (D-029 PA-1A).
 * Tổng hợp ẩn danh hoạt động đọc của cả Owner + Guest trên D1; nếu chưa đủ `limit` tập
 * có lượt đọc trong 7 ngày thì tự bù mượt bằng tập đọc trong 30 ngày -> tập mới tải lên.
 */
export async function computeWeeklyPopularBookIds(
  db: D1Database,
  booksOrderedByCreatedDesc: ReadonlyArray<{ id: string }>,
  limit = 10,
): Promise<string[]> {
  if (booksOrderedByCreatedDesc.length === 0) return [];

  const validIds = new Set(booksOrderedByCreatedDesc.map((b) => b.id));
  const now = Date.now();
  const since7d = now - SEVEN_DAYS_MS;
  const since30d = now - THIRTY_DAYS_MS;

  let rows: PopularityAggregateRow[] = [];
  try {
    const res = await db
      .prepare(
        `SELECT
           book_id,
           SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS readers_7d,
           SUM(CASE WHEN updated_at >= ? AND completed = 1 THEN 1 ELSE 0 END) AS completed_7d,
           SUM(CASE WHEN updated_at >= ? THEN (chapter_index + scroll_ratio) ELSE 0 END) AS depth_7d,
           COUNT(*) AS readers_30d,
           MAX(updated_at) AS last_read_at
         FROM (
           SELECT book_id, chapter_index, scroll_ratio, completed, updated_at
           FROM reading_progress
           WHERE updated_at >= ?
           UNION ALL
           SELECT book_id, chapter_index, scroll_ratio, completed, updated_at
           FROM guest_reading_progress
           WHERE updated_at >= ?
         )
         GROUP BY book_id`,
      )
      .bind(since7d, since7d, since7d, since30d, since30d)
      .all<PopularityAggregateRow>();
    rows = res.results || [];
  } catch {
    try {
      const fallbackRes = await db
        .prepare(
          `SELECT
             book_id,
             SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS readers_7d,
             SUM(CASE WHEN updated_at >= ? AND completed = 1 THEN 1 ELSE 0 END) AS completed_7d,
             SUM(CASE WHEN updated_at >= ? THEN (chapter_index + scroll_ratio) ELSE 0 END) AS depth_7d,
             COUNT(*) AS readers_30d,
             MAX(updated_at) AS last_read_at
           FROM reading_progress
           WHERE updated_at >= ?
           GROUP BY book_id`,
        )
        .bind(since7d, since7d, since7d, since30d)
        .all<PopularityAggregateRow>();
      rows = fallbackRes.results || [];
    } catch {
      rows = [];
    }
  }

  const validRows = rows.filter((r) => validIds.has(r.book_id));

  const tier7d = validRows
    .filter((r) => Number(r.readers_7d) > 0)
    .map((r) => ({
      id: r.book_id,
      score:
        Number(r.readers_7d) * 100 +
        Number(r.completed_7d) * 25 +
        Math.min(40, Number(r.depth_7d || 0) * 2),
      lastReadAt: Number(r.last_read_at || 0),
    }))
    .sort((a, b) => b.score - a.score || b.lastReadAt - a.lastReadAt);

  const tier30d = validRows
    .filter((r) => Number(r.readers_7d) <= 0 && Number(r.readers_30d) > 0)
    .sort(
      (a, b) =>
        Number(b.readers_30d) - Number(a.readers_30d) ||
        Number(b.last_read_at || 0) - Number(a.last_read_at || 0),
    );

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of tier7d) {
    if (result.length >= limit) break;
    seen.add(item.id);
    result.push(item.id);
  }

  for (const item of tier30d) {
    if (result.length >= limit) break;
    if (seen.has(item.book_id)) continue;
    seen.add(item.book_id);
    result.push(item.book_id);
  }

  for (const book of booksOrderedByCreatedDesc) {
    if (result.length >= limit) break;
    if (seen.has(book.id)) continue;
    seen.add(book.id);
    result.push(book.id);
  }

  return result;
}
