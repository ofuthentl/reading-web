import { ensureDiscordAccessTable } from './auth';
import { type Env, getLimitBytes } from './booksDb';
import { ensureBookmarksTable } from './bookmarksDb';
import { ensureGuestProgressTable } from './progressDb';
import { ensureShelfAccessTables } from './shelfAccessDb';
import { ensureShelfTagsSchema } from './shelfTagsDb';
import {
  DAY_MS,
  buildDayKeys,
  ensureUsageTables,
  recordUsageEvent,
  scheduleUsageEvent,
  toVietnamDayKey,
} from './usageRecorder';

export { ensureUsageTables, recordUsageEvent, scheduleUsageEvent, toVietnamDayKey };

const READER_RETENTION_DAYS = 90;

interface DailyStatRow {
  day_key: string;
  owner_logins: number;
  guest_logins: number;
  discord_keys_issued: number;
  login_failures: number;
  guest_chapter_reads: number;
  owner_progress_updates: number;
  guest_searches: number;
  rate_limit_hits: number;
}

interface DailyReaderAggRow {
  day_key: string;
  unique_readers: number;
  guest_readers: number;
}

interface TopBookRow {
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
  last_read_at: number;
}

interface TopShelfRow {
  shelf: string;
  book_count: number;
  active_readers: number;
  completed_reads: number;
  last_read_at: number | null;
}

interface GuestActivityRow {
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
  last_read_at: number | null;
  last_book_title: string | null;
  last_book_shelf: string | null;
  last_chapter_title: string | null;
  last_chapter_index: number | null;
}

function resolveWindowDays(raw: string | null): 7 | 14 | 30 {
  if (raw === '7') return 7;
  if (raw === '30') return 30;
  return 14;
}

export async function getAdminUsageReport(env: Env, rawDays: string | null) {
  const days = resolveWindowDays(rawDays);
  const now = Date.now();
  const windowCutoffMs = now - days * DAY_MS;
  const dayKeys = buildDayKeys(days, now);
  const firstDayKey = dayKeys[0];
  const day7Key = toVietnamDayKey(now - 6 * DAY_MS);
  const day30Key = toVietnamDayKey(now - 29 * DAY_MS);
  const pruneCutoffDayKey = toVietnamDayKey(now - READER_RETENTION_DAYS * DAY_MS);

  await Promise.all([
    ensureUsageTables(env.DB),
    ensureDiscordAccessTable(env.DB).catch(() => undefined),
    ensureGuestProgressTable(env).catch(() => undefined),
    ensureBookmarksTable(env.DB).catch(() => undefined),
    ensureShelfAccessTables(env.DB).catch(() => undefined),
    ensureShelfTagsSchema(env.DB).catch(() => undefined),
  ]);

  // Dọn nhẹ dữ liệu reader cũ quá 90 ngày chỉ khi Admin mở /usage (0 ảnh hưởng tốc độ độc giả)
  await env.DB.prepare('DELETE FROM usage_daily_readers WHERE day_key < ?')
    .bind(pruneCutoffDayKey)
    .run()
    .catch(() => undefined);

  const [
    booksSummary,
    packsSummary,
    shelfSummary,
    bookmarksSummary,
    discordSummary,
    loginLockSummary,
    engagementSummary,
    uniqueReadersRow,
    dailyStatsRes,
    dailyReadersRes,
    topBooksRes,
    topShelvesRes,
    guestActivityRes,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_books,
         COUNT(DISTINCT LOWER(TRIM(shelf))) AS total_shelves,
         SUM(CASE WHEN file_type = 'epub' THEN 1 ELSE 0 END) AS epub_count,
         SUM(CASE WHEN file_type = 'docx' THEN 1 ELSE 0 END) AS docx_count,
         COALESCE(SUM(file_size), 0) AS file_bytes,
         COALESCE(SUM(cover_size), 0) AS cover_bytes
       FROM books`,
    ).first<{
      total_books: number;
      total_shelves: number;
      epub_count: number;
      docx_count: number;
      file_bytes: number;
      cover_bytes: number;
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS pack_count, COALESCE(SUM(pack_size), 0) AS pack_bytes
       FROM book_guest_packs`,
    )
      .first<{ pack_count: number; pack_bytes: number }>()
      .catch(() => ({ pack_count: 0, pack_bytes: 0 })),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM shelf_access_rules WHERE access_mode = 'restricted') AS restricted_shelves,
         (SELECT COUNT(*) FROM shelf_prefs WHERE is_favorite = 1) AS favorite_shelves,
         (SELECT COUNT(*) FROM shelf_prefs WHERE tags_json IS NOT NULL AND tags_json != '[]') AS tagged_shelves`,
    )
      .first<{ restricted_shelves: number; favorite_shelves: number; tagged_shelves: number }>()
      .catch(() => ({ restricted_shelves: 0, favorite_shelves: 0, tagged_shelves: 0 })),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_bookmarks,
         SUM(CASE WHEN user_scope = 'owner' THEN 1 ELSE 0 END) AS owner_bookmarks,
         SUM(CASE WHEN user_scope != 'owner' THEN 1 ELSE 0 END) AS guest_bookmarks
       FROM book_bookmarks`,
    )
      .first<{ total_bookmarks: number; owner_bookmarks: number; guest_bookmarks: number }>()
      .catch(() => ({ total_bookmarks: 0, owner_bookmarks: 0, guest_bookmarks: 0 })),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_guests,
         SUM(CASE WHEN session_expires_at > ? AND COALESCE(is_banned, 0) = 0 THEN 1 ELSE 0 END) AS active_sessions_24h,
         SUM(CASE WHEN COALESCE(is_banned, 0) = 1 THEN 1 ELSE 0 END) AS banned_guests,
         COALESCE(SUM(rl_strikes), 0) AS total_strikes,
         SUM(CASE WHEN COALESCE(rl_strikes, 0) > 0 THEN 1 ELSE 0 END) AS guests_with_strikes
       FROM discord_access`,
    )
      .bind(now)
      .first<{
        total_guests: number;
        active_sessions_24h: number;
        banned_guests: number;
        total_strikes: number;
        guests_with_strikes: number;
      }>()
      .catch(() => ({
        total_guests: 0,
        active_sessions_24h: 0,
        banned_guests: 0,
        total_strikes: 0,
        guests_with_strikes: 0,
      })),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN locked_until > ? THEN 1 ELSE 0 END) AS locked_ips,
         COALESCE(SUM(fail_count), 0) AS active_window_fails
       FROM login_rate_limits`,
    )
      .bind(now)
      .first<{ locked_ips: number; active_window_fails: number }>()
      .catch(() => ({ locked_ips: 0, active_window_fails: 0 })),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM reading_progress WHERE completed = 1) AS owner_completed,
         (SELECT COUNT(*) FROM reading_progress) AS owner_started,
         (SELECT COUNT(*) FROM guest_reading_progress WHERE completed = 1) AS guest_completed,
         (SELECT COUNT(*) FROM guest_reading_progress) AS guest_started`,
    )
      .first<{
        owner_completed: number;
        owner_started: number;
        guest_completed: number;
        guest_started: number;
      }>()
      .catch(() => ({
        owner_completed: 0,
        owner_started: 0,
        guest_completed: 0,
        guest_started: 0,
      })),
    env.DB.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN day_key >= ? THEN reader_scope END) AS readers_7d,
         COUNT(DISTINCT CASE WHEN day_key >= ? THEN reader_scope END) AS readers_30d,
         COUNT(DISTINCT CASE WHEN day_key >= ? AND role = 'guest' THEN reader_scope END) AS guest_readers_7d,
         COUNT(DISTINCT CASE WHEN day_key >= ? AND role = 'guest' THEN reader_scope END) AS guest_readers_30d
       FROM usage_daily_readers
       WHERE day_key >= ?`,
    )
      .bind(day7Key, day30Key, day7Key, day30Key, day30Key)
      .first<{
        readers_7d: number;
        readers_30d: number;
        guest_readers_7d: number;
        guest_readers_30d: number;
      }>()
      .catch(() => ({
        readers_7d: 0,
        readers_30d: 0,
        guest_readers_7d: 0,
        guest_readers_30d: 0,
      })),
    env.DB.prepare(
      `SELECT day_key, owner_logins, guest_logins, discord_keys_issued, login_failures,
              guest_chapter_reads, owner_progress_updates, guest_searches, rate_limit_hits
       FROM usage_daily_stats
       WHERE day_key >= ?
       ORDER BY day_key ASC`,
    )
      .bind(firstDayKey)
      .all<DailyStatRow>()
      .catch(() => ({ results: [] as DailyStatRow[] })),
    env.DB.prepare(
      `SELECT day_key,
              COUNT(DISTINCT reader_scope) AS unique_readers,
              COUNT(DISTINCT CASE WHEN role = 'guest' THEN reader_scope END) AS guest_readers
       FROM usage_daily_readers
       WHERE day_key >= ?
       GROUP BY day_key`,
    )
      .bind(firstDayKey)
      .all<DailyReaderAggRow>()
      .catch(() => ({ results: [] as DailyReaderAggRow[] })),
    env.DB.prepare(
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
             WHEN COALESCE(p.total_chapters, 0) > 0 THEN MIN(100, MAX(0, ((p.chapter_index + p.scroll_ratio) * 100.0) / p.total_chapters))
             ELSE MIN(100, MAX(0, p.scroll_ratio * 100.0))
           END
         )) AS avg_percent,
         MAX(p.updated_at) AS last_read_at
       FROM (
         SELECT book_id, chapter_index, total_chapters, scroll_ratio, completed, updated_at, 0 AS is_guest
         FROM reading_progress
         UNION ALL
         SELECT book_id, chapter_index, total_chapters, scroll_ratio, completed, updated_at, 1 AS is_guest
         FROM guest_reading_progress
       ) p
       INNER JOIN books b ON b.id = p.book_id
       LEFT JOIN book_guest_packs gp ON gp.book_id = b.id
       GROUP BY b.id
       ORDER BY readers_window DESC, readers_total DESC, completed_total DESC, last_read_at DESC
       LIMIT 12`,
    )
      .bind(windowCutoffMs)
      .all<TopBookRow>()
      .catch(() => ({ results: [] as TopBookRow[] })),
    env.DB.prepare(
      `SELECT
         b.shelf,
         COUNT(DISTINCT b.id) AS book_count,
         COUNT(DISTINCT p.reader_key) AS active_readers,
         SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) AS completed_reads,
         MAX(p.updated_at) AS last_read_at
       FROM books b
       LEFT JOIN (
         SELECT book_id, 'owner' AS reader_key, completed, updated_at FROM reading_progress
         UNION ALL
         SELECT book_id, 'guest:' || discord_user_id AS reader_key, completed, updated_at FROM guest_reading_progress
       ) p ON p.book_id = b.id
       GROUP BY LOWER(TRIM(b.shelf))
       HAVING active_readers > 0
       ORDER BY active_readers DESC, completed_reads DESC, last_read_at DESC
       LIMIT 10`,
    )
      .all<TopShelfRow>()
      .catch(() => ({ results: [] as TopShelfRow[] })),
    env.DB.prepare(
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
       GROUP BY d.discord_user_id
       ORDER BY COALESCE(gp.last_read_at, d.updated_at) DESC
       LIMIT 60`,
    )
      .all<GuestActivityRow>()
      .catch(() => ({ results: [] as GuestActivityRow[] })),
  ]);

  const statsByDay = new Map<string, DailyStatRow>();
  for (const row of dailyStatsRes.results || []) statsByDay.set(row.day_key, row);

  const readersByDay = new Map<string, DailyReaderAggRow>();
  for (const row of dailyReadersRes.results || []) readersByDay.set(row.day_key, row);

  let windowGuestChapterReads = 0;
  let windowOwnerProgressUpdates = 0;
  let windowGuestLogins = 0;
  let windowOwnerLogins = 0;
  let windowDiscordKeys = 0;
  let windowGuestSearches = 0;
  let windowLoginFailures = 0;
  let windowRateLimitHits = 0;

  const dailySeries = dayKeys.map((dayKey) => {
    const s = statsByDay.get(dayKey);
    const r = readersByDay.get(dayKey);
    const item = {
      dayKey,
      uniqueReaders: Number(r?.unique_readers ?? 0),
      guestReaders: Number(r?.guest_readers ?? 0),
      ownerLogins: Number(s?.owner_logins ?? 0),
      guestLogins: Number(s?.guest_logins ?? 0),
      discordKeysIssued: Number(s?.discord_keys_issued ?? 0),
      loginFailures: Number(s?.login_failures ?? 0),
      guestChapterReads: Number(s?.guest_chapter_reads ?? 0),
      ownerProgressUpdates: Number(s?.owner_progress_updates ?? 0),
      guestSearches: Number(s?.guest_searches ?? 0),
      rateLimitHits: Number(s?.rate_limit_hits ?? 0),
    };
    windowGuestChapterReads += item.guestChapterReads;
    windowOwnerProgressUpdates += item.ownerProgressUpdates;
    windowGuestLogins += item.guestLogins;
    windowOwnerLogins += item.ownerLogins;
    windowDiscordKeys += item.discordKeysIssued;
    windowGuestSearches += item.guestSearches;
    windowLoginFailures += item.loginFailures;
    windowRateLimitHits += item.rateLimitHits;
    return item;
  });

  const fileBytes = Number(booksSummary?.file_bytes ?? 0);
  const coverBytes = Number(booksSummary?.cover_bytes ?? 0);
  const packBytes = Number(packsSummary?.pack_bytes ?? 0);
  const usedBytes = fileBytes + coverBytes + packBytes;
  const limitBytes = getLimitBytes(env);

  return {
    generatedAt: now,
    timezone: 'UTC+7',
    days,
    overview: {
      totalBooks: Number(booksSummary?.total_books ?? 0),
      totalShelves: Number(booksSummary?.total_shelves ?? 0),
      epubCount: Number(booksSummary?.epub_count ?? 0),
      docxCount: Number(booksSummary?.docx_count ?? 0),
      guestReadyBooks: Number(packsSummary?.pack_count ?? 0),
      restrictedShelves: Number(shelfSummary?.restricted_shelves ?? 0),
      favoriteShelves: Number(shelfSummary?.favorite_shelves ?? 0),
      taggedShelves: Number(shelfSummary?.tagged_shelves ?? 0),
      totalGuests: Number(discordSummary?.total_guests ?? 0),
      activeGuestSessions24h: Number(discordSummary?.active_sessions_24h ?? 0),
      bannedGuests: Number(discordSummary?.banned_guests ?? 0),
      uniqueReaders7d: Number(uniqueReadersRow?.readers_7d ?? 0),
      uniqueReaders30d: Number(uniqueReadersRow?.readers_30d ?? 0),
      guestReaders7d: Number(uniqueReadersRow?.guest_readers_7d ?? 0),
      guestReaders30d: Number(uniqueReadersRow?.guest_readers_30d ?? 0),
      ownerCompletedBooks: Number(engagementSummary?.owner_completed ?? 0),
      ownerStartedBooks: Number(engagementSummary?.owner_started ?? 0),
      guestCompletedBooks: Number(engagementSummary?.guest_completed ?? 0),
      guestStartedBooks: Number(engagementSummary?.guest_started ?? 0),
      totalBookmarks: Number(bookmarksSummary?.total_bookmarks ?? 0),
      ownerBookmarks: Number(bookmarksSummary?.owner_bookmarks ?? 0),
      guestBookmarks: Number(bookmarksSummary?.guest_bookmarks ?? 0),
      windowTotals: {
        guestChapterReads: windowGuestChapterReads,
        ownerProgressUpdates: windowOwnerProgressUpdates,
        guestLogins: windowGuestLogins,
        ownerLogins: windowOwnerLogins,
        discordKeysIssued: windowDiscordKeys,
        guestSearches: windowGuestSearches,
        loginFailures: windowLoginFailures,
        rateLimitHits: windowRateLimitHits,
      },
    },
    storage: {
      usedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      fileBytes,
      coverBytes,
      packBytes,
    },
    security: {
      totalStrikes: Number(discordSummary?.total_strikes ?? 0),
      guestsWithStrikes: Number(discordSummary?.guests_with_strikes ?? 0),
      bannedGuests: Number(discordSummary?.banned_guests ?? 0),
      activeLockedIps: Number(loginLockSummary?.locked_ips ?? 0),
      recentLoginFailures: windowLoginFailures,
      recentRateLimitHits: windowRateLimitHits,
    },
    dailySeries,
    topBooks: (topBooksRes.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      shelf: row.shelf,
      fileType: row.file_type,
      hasGuestPack: row.has_guest_pack === 1,
      readersTotal: Number(row.readers_total ?? 0),
      guestReaders: Number(row.guest_readers ?? 0),
      readersInWindow: Number(row.readers_window ?? 0),
      completedTotal: Number(row.completed_total ?? 0),
      avgPercent: Math.max(0, Math.min(100, Number(row.avg_percent ?? 0))),
      lastReadAt: Number(row.last_read_at ?? 0),
    })),
    topShelves: (topShelvesRes.results || []).map((row) => ({
      shelf: row.shelf,
      bookCount: Number(row.book_count ?? 0),
      activeReaders: Number(row.active_readers ?? 0),
      completedReads: Number(row.completed_reads ?? 0),
      lastReadAt: row.last_read_at ? Number(row.last_read_at) : null,
    })),
    guestActivity: (guestActivityRes.results || []).map((row) => ({
      discordUserId: row.discord_user_id,
      discordUsername: row.discord_username,
      tagTail: row.discord_user_id.slice(-4).padStart(4, '0'),
      sessionActive: Boolean(
        row.session_expires_at && row.session_expires_at > now && row.is_banned !== 1,
      ),
      sessionExpiresAt: row.session_expires_at,
      strikes: Number(row.rl_strikes ?? 0),
      isBanned: row.is_banned === 1,
      banReason: row.ban_reason ?? null,
      startedBooks: Number(row.started_books ?? 0),
      completedBooks: Number(row.completed_books ?? 0),
      bookmarkCount: Number(row.bookmark_count ?? 0),
      lastReadAt: row.last_read_at ? Number(row.last_read_at) : null,
      lastBookTitle: row.last_book_title ?? null,
      lastBookShelf: row.last_book_shelf ?? null,
      lastChapterTitle: row.last_chapter_title ?? null,
      lastChapterIndex:
        row.last_chapter_index !== null && row.last_chapter_index !== undefined
          ? Number(row.last_chapter_index)
          : null,
      updatedAt: Number(row.updated_at ?? 0),
    })),
  };
}
