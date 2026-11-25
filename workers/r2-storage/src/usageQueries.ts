import { toShelfAccessKey } from './shelfAccessDb';

export interface DailyStatRow {
  day_key: string;
  owner_logins: number;
  guest_logins: number;
  discord_keys_issued: number;
  login_failures: number;
  guest_chapter_reads: number;
  owner_progress_updates: number;
  guest_searches: number;
  rate_limit_hits: number;
  owner_reading_seconds: number;
  guest_reading_seconds: number;
}

export interface DailyReaderAggRow {
  day_key: string;
  unique_readers: number;
  guest_readers: number;
}

export interface TopBookRow {
  id: string;
  title: string;
  author: string;
  shelf: string;
  file_type: 'epub' | 'docx';
  has_guest_pack: number;
  readers_total: number;
  guest_readers: number;
  readers_window: number;
  completed_total: number;
  avg_percent: number;
  reading_seconds_total: number;
  last_read_at: number;
}

export interface TopShelfRow {
  shelf: string;
  book_count: number;
  active_readers: number;
  completed_reads: number;
  reading_seconds_total: number;
  last_read_at: number | null;
}

export interface GuestActivityRow {
  discord_user_id: string;
  discord_username: string;
  session_expires_at: number | null;
  rl_strikes: number | null;
  is_banned: number;
  ban_reason: string | null;
  updated_at: number;
  started_books: number;
  completed_books: number;
  bookmark_count: number;
  reading_seconds_total: number;
  reading_seconds_7d: number;
  reading_seconds_30d: number;
  reading_seconds_90d: number;
  last_read_at: number | null;
  last_book_title: string | null;
  last_book_shelf: string | null;
  last_chapter_title: string | null;
  last_chapter_index: number | null;
}

export interface GuestBookHistoryRow {
  book_id: string;
  title: string;
  author: string;
  shelf: string;
  file_type: 'epub' | 'docx';
  chapter_index: number;
  chapter_title: string | null;
  total_chapters: number | null;
  scroll_ratio: number;
  completed: number;
  book_percent?: number | null;
  reading_seconds: number;
  bookmark_count: number;
  updated_at: number;
}

export function queryGuestBookHistoryRows(db: D1Database, discordUserId: string) {
  const userScope = `guest:${discordUserId}`;
  return db
    .prepare(
      `SELECT
         gp.book_id,
         b.title,
         b.author,
         b.shelf,
         b.file_type,
         gp.chapter_index,
         gp.chapter_title,
         gp.total_chapters,
         gp.scroll_ratio,
         gp.completed,
         gp.book_percent,
         COALESCE(gp.reading_seconds, 0) AS reading_seconds,
         COALESCE(bm.bookmark_count, 0) AS bookmark_count,
         gp.updated_at
       FROM guest_reading_progress gp
       INNER JOIN books b ON b.id = gp.book_id
       LEFT JOIN (
         SELECT book_id, COUNT(*) AS bookmark_count
         FROM book_bookmarks
         WHERE user_scope = ?
         GROUP BY book_id
       ) bm ON bm.book_id = gp.book_id
       WHERE gp.discord_user_id = ?
       ORDER BY gp.updated_at DESC
       LIMIT 300`,
    )
    .bind(userScope, discordUserId)
    .all<GuestBookHistoryRow>()
    .catch(() => ({ results: [] as GuestBookHistoryRow[] }));
}

export async function queryTopBooksAndShelves(db: D1Database, windowCutoffMs: number) {
  const topBooksPromise = db
    .prepare(
      `SELECT
         b.id,
         b.title,
         b.author,
         b.shelf,
         b.file_type,
         CASE WHEN gp.book_id IS NOT NULL THEN 1 ELSE 0 END AS has_guest_pack,
         COUNT(p.book_id) AS readers_total,
         SUM(CASE WHEN p.is_guest = 1 THEN 1 ELSE 0 END) AS guest_readers,
         SUM(CASE WHEN p.updated_at >= ? THEN 1 ELSE 0 END) AS readers_window,
         SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) AS completed_total,
         ROUND(AVG(
           CASE
             WHEN p.completed = 1 THEN 100
             WHEN p.book_percent IS NOT NULL THEN MIN(100, MAX(0, p.book_percent))
             WHEN COALESCE(p.total_chapters, 0) > 0 THEN MIN(100, MAX(0, ((p.chapter_index + p.scroll_ratio) * 100.0) / p.total_chapters))
             ELSE MIN(100, MAX(0, p.scroll_ratio * 100.0))
           END
         )) AS avg_percent,
         COALESCE(SUM(p.reading_seconds), 0) AS reading_seconds_total,
         MAX(p.updated_at) AS last_read_at
       FROM (
         SELECT book_id, chapter_index, total_chapters, scroll_ratio, completed, book_percent, COALESCE(reading_seconds, 0) AS reading_seconds, updated_at, 0 AS is_guest
         FROM reading_progress
         UNION ALL
         SELECT book_id, chapter_index, total_chapters, scroll_ratio, completed, book_percent, COALESCE(reading_seconds, 0) AS reading_seconds, updated_at, 1 AS is_guest
         FROM guest_reading_progress
       ) p
       INNER JOIN books b ON b.id = p.book_id
       LEFT JOIN book_guest_packs gp ON gp.book_id = b.id
       GROUP BY b.id
       ORDER BY readers_window DESC, reading_seconds_total DESC, readers_total DESC, completed_total DESC, last_read_at DESC
       LIMIT 12`,
    )
    .bind(windowCutoffMs)
    .all<TopBookRow>()
    .catch(() => ({ results: [] as TopBookRow[] }));

  const shelfBooksPromise = db
    .prepare('SELECT id, shelf FROM books')
    .all<{ id: string; shelf: string }>()
    .catch(() => ({ results: [] as Array<{ id: string; shelf: string }> }));

  const shelfProgressPromise = db
    .prepare(
      `SELECT book_id, 'owner' AS reader_key, completed, COALESCE(reading_seconds, 0) AS reading_seconds, updated_at FROM reading_progress
       UNION ALL
       SELECT book_id, 'guest:' || discord_user_id AS reader_key, completed, COALESCE(reading_seconds, 0) AS reading_seconds, updated_at FROM guest_reading_progress`,
    )
    .all<{
      book_id: string;
      reader_key: string;
      completed: number;
      reading_seconds: number;
      updated_at: number;
    }>()
    .catch(() => ({
      results: [] as Array<{
        book_id: string;
        reader_key: string;
        completed: number;
        reading_seconds: number;
        updated_at: number;
      }>,
    }));

  const [topBooksRes, shelfBooksRes, shelfProgressRes] = await Promise.all([
    topBooksPromise,
    shelfBooksPromise,
    shelfProgressPromise,
  ]);

  // Nhóm kệ bằng toShelfAccessKey (NFC + tiếng Việt) thay vì SQLite LOWER() chỉ hỗ trợ ASCII
  const bookToShelfKey = new Map<string, string>();
  const shelfAgg = new Map<
    string,
    {
      shelf: string;
      bookCount: number;
      readers: Set<string>;
      completedReads: number;
      readingSecondsTotal: number;
      lastReadAt: number | null;
    }
  >();

  for (const row of shelfBooksRes.results || []) {
    const cleanName = (row.shelf || 'Kho chưa phân loại').normalize('NFC').trim() || 'Kho chưa phân loại';
    const key = toShelfAccessKey(cleanName);
    bookToShelfKey.set(row.id, key);
    const entry = shelfAgg.get(key);
    if (entry) {
      entry.bookCount += 1;
    } else {
      shelfAgg.set(key, {
        shelf: cleanName,
        bookCount: 1,
        readers: new Set<string>(),
        completedReads: 0,
        readingSecondsTotal: 0,
        lastReadAt: null,
      });
    }
  }

  for (const p of shelfProgressRes.results || []) {
    const key = bookToShelfKey.get(p.book_id);
    if (!key) continue;
    const entry = shelfAgg.get(key);
    if (!entry) continue;
    entry.readers.add(p.reader_key);
    if (Number(p.completed) === 1) entry.completedReads += 1;
    entry.readingSecondsTotal += Math.max(0, Number(p.reading_seconds ?? 0));
    const ts = Number(p.updated_at ?? 0);
    if (ts > 0 && (entry.lastReadAt === null || ts > entry.lastReadAt)) {
      entry.lastReadAt = ts;
    }
  }

  const topShelfRows: TopShelfRow[] = Array.from(shelfAgg.values())
    .filter((entry) => entry.readers.size > 0)
    .map((entry) => ({
      shelf: entry.shelf,
      book_count: entry.bookCount,
      active_readers: entry.readers.size,
      completed_reads: entry.completedReads,
      reading_seconds_total: entry.readingSecondsTotal,
      last_read_at: entry.lastReadAt,
    }))
    .sort(
      (a, b) =>
        b.active_readers - a.active_readers ||
        b.reading_seconds_total - a.reading_seconds_total ||
        b.completed_reads - a.completed_reads ||
        (b.last_read_at ?? 0) - (a.last_read_at ?? 0),
    )
    .slice(0, 10);

  return [topBooksRes, { results: topShelfRows }, shelfAgg.size] as const;
}

export function queryGuestActivityRows(db: D1Database, day7Key: string, day30Key: string) {
  return db
    .prepare(
      `SELECT
         d.discord_user_id,
         d.discord_username,
         d.session_expires_at,
         d.rl_strikes,
         d.is_banned,
         d.ban_reason,
         d.updated_at,
         COALESCE(gp.started_books, 0) AS started_books,
         COALESCE(gp.completed_books, 0) AS completed_books,
         COALESCE(bm.bookmark_count, 0) AS bookmark_count,
         COALESCE(gp.reading_seconds_total, 0) AS reading_seconds_total,
         COALESCE(gr.reading_seconds_7d, 0) AS reading_seconds_7d,
         COALESCE(gr.reading_seconds_30d, 0) AS reading_seconds_30d,
         COALESCE(gr.reading_seconds_90d, 0) AS reading_seconds_90d,
         gp.last_read_at,
         lb.title AS last_book_title,
         lb.shelf AS last_book_shelf,
         lgp.chapter_title AS last_chapter_title,
         lgp.chapter_index AS last_chapter_index
       FROM discord_access d
       LEFT JOIN (
         SELECT
           discord_user_id,
           COUNT(*) AS started_books,
           SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_books,
           COALESCE(SUM(reading_seconds), 0) AS reading_seconds_total,
           MAX(updated_at) AS last_read_at
         FROM guest_reading_progress
         GROUP BY discord_user_id
       ) gp ON gp.discord_user_id = d.discord_user_id
       LEFT JOIN guest_reading_progress lgp
         ON lgp.discord_user_id = d.discord_user_id
        AND lgp.updated_at = gp.last_read_at
       LEFT JOIN books lb ON lb.id = lgp.book_id
       LEFT JOIN (
         SELECT substr(user_scope, 7) AS discord_user_id, COUNT(*) AS bookmark_count
         FROM book_bookmarks
         WHERE user_scope LIKE 'guest:%'
         GROUP BY user_scope
       ) bm ON bm.discord_user_id = d.discord_user_id
       LEFT JOIN (
         SELECT
           substr(reader_scope, 7) AS discord_user_id,
           COALESCE(SUM(CASE WHEN day_key >= ? THEN reading_seconds ELSE 0 END), 0) AS reading_seconds_7d,
           COALESCE(SUM(CASE WHEN day_key >= ? THEN reading_seconds ELSE 0 END), 0) AS reading_seconds_30d,
           COALESCE(SUM(reading_seconds), 0) AS reading_seconds_90d
         FROM usage_daily_readers
         WHERE reader_scope LIKE 'guest:%'
         GROUP BY reader_scope
       ) gr ON gr.discord_user_id = d.discord_user_id
       GROUP BY d.discord_user_id
       ORDER BY COALESCE(gp.last_read_at, d.updated_at) DESC
       LIMIT 60`,
    )
    .bind(day7Key, day30Key)
    .all<GuestActivityRow>()
    .catch(() => ({ results: [] as GuestActivityRow[] }));
}
