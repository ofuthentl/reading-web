import { HttpError, ensureDiscordAccessTable } from './auth';
import { type Env, getLimitBytes } from './booksDb';
import { ensureBookmarksTable } from './bookmarksDb';
import { ensureGuestProgressTable, ensureProgressReadingTimeColumns } from './progressDb';
import { ensureShelfAccessTables } from './shelfAccessDb';
import { ensureShelfTagsSchema } from './shelfTagsDb';
import {
  type DailyReaderAggRow,
  type DailyStatRow,
  queryGuestActivityRows,
  queryGuestBookHistoryRows,
  queryTopBooksAndShelves,
} from './usageQueries';
import {
  DAY_MS,
  buildDayKeys,
  ensureUsageTables,
  recordUsageEvent,
  scheduleUsageEvent,
  toVietnamDayKey,
} from './usageRecorder';

export { ensureUsageTables, recordUsageEvent, scheduleUsageEvent, toVietnamDayKey };

const READER_RETENTION_DAYS = 400;

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
    ensureProgressReadingTimeColumns(env).catch(() => undefined),
    ensureBookmarksTable(env.DB).catch(() => undefined),
    ensureShelfAccessTables(env.DB).catch(() => undefined),
    ensureShelfTagsSchema(env.DB).catch(() => undefined),
  ]);

  // Dọn nhẹ dữ liệu reader cũ quá 400 ngày chỉ khi Admin mở /usage (bảo toàn lịch nhiệt 90 ngày & Wrapped năm)
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
    readingWindowRow,
    dailyStatsRes,
    dailyReadersRes,
    [topBooksRes, topShelvesRes, totalUniqueShelves],
    guestActivityRes,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_books,
         SUM(CASE WHEN file_type = 'epub' THEN 1 ELSE 0 END) AS epub_count,
         SUM(CASE WHEN file_type = 'docx' THEN 1 ELSE 0 END) AS docx_count,
         COALESCE(SUM(file_size), 0) AS file_bytes,
         COALESCE(SUM(cover_size), 0) AS cover_bytes
       FROM books`,
    ).first<{
      total_books: number;
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
         (SELECT COALESCE(SUM(reading_seconds), 0) FROM reading_progress) AS owner_reading_total,
         (SELECT COUNT(*) FROM guest_reading_progress WHERE completed = 1) AS guest_completed,
         (SELECT COUNT(*) FROM guest_reading_progress) AS guest_started,
         (SELECT COALESCE(SUM(reading_seconds), 0) FROM guest_reading_progress) AS guest_reading_total`,
    )
      .first<{
        owner_completed: number;
        owner_started: number;
        owner_reading_total: number;
        guest_completed: number;
        guest_started: number;
        guest_reading_total: number;
      }>()
      .catch(() => ({
        owner_completed: 0,
        owner_started: 0,
        owner_reading_total: 0,
        guest_completed: 0,
        guest_started: 0,
        guest_reading_total: 0,
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
      `SELECT
         COALESCE(SUM(CASE WHEN day_key >= ? THEN owner_reading_seconds + guest_reading_seconds ELSE 0 END), 0) AS reading_7d,
         COALESCE(SUM(owner_reading_seconds + guest_reading_seconds), 0) AS reading_30d,
         COALESCE(SUM(owner_reading_seconds), 0) AS owner_reading_30d,
         COALESCE(SUM(guest_reading_seconds), 0) AS guest_reading_30d
       FROM usage_daily_stats
       WHERE day_key >= ?`,
    )
      .bind(day7Key, day30Key)
      .first<{
        reading_7d: number;
        reading_30d: number;
        owner_reading_30d: number;
        guest_reading_30d: number;
      }>()
      .catch(() => ({
        reading_7d: 0,
        reading_30d: 0,
        owner_reading_30d: 0,
        guest_reading_30d: 0,
      })),
    env.DB.prepare(
      `SELECT day_key, owner_logins, guest_logins, discord_keys_issued, login_failures,
              guest_chapter_reads, owner_progress_updates, guest_searches, rate_limit_hits,
              owner_reading_seconds, guest_reading_seconds
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
    queryTopBooksAndShelves(env.DB, windowCutoffMs),
    queryGuestActivityRows(env.DB, day7Key, day30Key),
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
  let windowOwnerReadingSeconds = 0;
  let windowGuestReadingSeconds = 0;

  const dailySeries = dayKeys.map((dayKey) => {
    const s = statsByDay.get(dayKey);
    const r = readersByDay.get(dayKey);
    const ownerReadingSeconds = Math.max(0, Number(s?.owner_reading_seconds ?? 0));
    const guestReadingSeconds = Math.max(0, Number(s?.guest_reading_seconds ?? 0));
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
      ownerReadingSeconds,
      guestReadingSeconds,
      totalReadingSeconds: ownerReadingSeconds + guestReadingSeconds,
    };
    windowGuestChapterReads += item.guestChapterReads;
    windowOwnerProgressUpdates += item.ownerProgressUpdates;
    windowGuestLogins += item.guestLogins;
    windowOwnerLogins += item.ownerLogins;
    windowDiscordKeys += item.discordKeysIssued;
    windowGuestSearches += item.guestSearches;
    windowLoginFailures += item.loginFailures;
    windowRateLimitHits += item.rateLimitHits;
    windowOwnerReadingSeconds += ownerReadingSeconds;
    windowGuestReadingSeconds += guestReadingSeconds;
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
      totalShelves: totalUniqueShelves,
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
      readingSeconds7d: Number(readingWindowRow?.reading_7d ?? 0),
      readingSeconds30d: Number(readingWindowRow?.reading_30d ?? 0),
      ownerReadingSeconds30d: Number(readingWindowRow?.owner_reading_30d ?? 0),
      guestReadingSeconds30d: Number(readingWindowRow?.guest_reading_30d ?? 0),
      ownerReadingSecondsTotal: Math.max(
        Number(engagementSummary?.owner_reading_total ?? 0),
        Number(readingWindowRow?.owner_reading_30d ?? 0),
      ),
      guestReadingSecondsTotal: Math.max(
        Number(engagementSummary?.guest_reading_total ?? 0),
        Number(readingWindowRow?.guest_reading_30d ?? 0),
      ),
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
        ownerReadingSeconds: windowOwnerReadingSeconds,
        guestReadingSeconds: windowGuestReadingSeconds,
        totalReadingSeconds: windowOwnerReadingSeconds + windowGuestReadingSeconds,
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
      readingSecondsTotal: Math.max(0, Number(row.reading_seconds_total ?? 0)),
      lastReadAt: Number(row.last_read_at ?? 0),
    })),
    topShelves: (topShelvesRes.results || []).map((row) => ({
      shelf: row.shelf,
      bookCount: Number(row.book_count ?? 0),
      activeReaders: Number(row.active_readers ?? 0),
      completedReads: Number(row.completed_reads ?? 0),
      readingSecondsTotal: Math.max(0, Number(row.reading_seconds_total ?? 0)),
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
      readingSecondsTotal: Math.max(
        Number(row.reading_seconds_total ?? 0),
        Number(row.reading_seconds_90d ?? 0),
      ),
      readingSeconds7d: Math.max(0, Number(row.reading_seconds_7d ?? 0)),
      readingSeconds30d: Math.max(0, Number(row.reading_seconds_30d ?? 0)),
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

export async function getAdminGuestUsageDetail(env: Env, rawDiscordUserId: string) {
  let discordUserId = '';
  try {
    discordUserId = decodeURIComponent(rawDiscordUserId || '').trim();
  } catch {
    discordUserId = (rawDiscordUserId || '').trim();
  }
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(discordUserId)) {
    throw new HttpError('Discord User ID không hợp lệ.', 400);
  }

  await Promise.all([
    ensureDiscordAccessTable(env.DB).catch(() => undefined),
    ensureGuestProgressTable(env).catch(() => undefined),
    ensureBookmarksTable(env.DB).catch(() => undefined),
    ensureUsageTables(env.DB).catch(() => undefined),
  ]);

  const now = Date.now();
  const day7Key = toVietnamDayKey(now - 6 * DAY_MS);
  const day30Key = toVietnamDayKey(now - 29 * DAY_MS);
  const readerScope = `guest:${discordUserId}`;

  const [memberRow, dailySumRow, booksRes] = await Promise.all([
    env.DB.prepare(
      'SELECT discord_user_id, discord_username FROM discord_access WHERE discord_user_id = ?',
    )
      .bind(discordUserId)
      .first<{ discord_user_id: string; discord_username: string }>()
      .catch(() => null),
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN day_key >= ? THEN reading_seconds ELSE 0 END), 0) AS reading_7d,
         COALESCE(SUM(CASE WHEN day_key >= ? THEN reading_seconds ELSE 0 END), 0) AS reading_30d,
         COALESCE(SUM(reading_seconds), 0) AS reading_90d
       FROM usage_daily_readers
       WHERE reader_scope = ?`,
    )
      .bind(day7Key, day30Key, readerScope)
      .first<{ reading_7d: number; reading_30d: number; reading_90d: number }>()
      .catch(() => ({ reading_7d: 0, reading_30d: 0, reading_90d: 0 })),
    queryGuestBookHistoryRows(env.DB, discordUserId),
  ]);

  if (!memberRow && (booksRes.results || []).length === 0) {
    throw new HttpError('Không tìm thấy thành viên Discord này.', 404);
  }

  let booksReadingSecondsSum = 0;
  const books = (booksRes.results || []).map((row) => {
    const completed = row.completed === 1;
    const totalChapters =
      typeof row.total_chapters === 'number' && row.total_chapters > 0 ? row.total_chapters : null;
    const rawPercent = completed
      ? 100
      : typeof row.book_percent === 'number' && Number.isFinite(row.book_percent)
        ? row.book_percent
        : totalChapters
          ? ((Math.max(0, row.chapter_index) + Math.min(1, Math.max(0, row.scroll_ratio))) * 100) /
            totalChapters
          : Math.min(1, Math.max(0, row.scroll_ratio)) * 100;
    const percent = Math.max(0, Math.min(100, Math.round(rawPercent)));
    const readingSeconds = Math.max(0, Number(row.reading_seconds ?? 0));
    booksReadingSecondsSum += readingSeconds;

    return {
      bookId: row.book_id,
      title: row.title,
      author: row.author,
      shelf: row.shelf,
      fileType: row.file_type,
      chapterIndex: Math.max(0, Number(row.chapter_index ?? 0)),
      chapterTitle: row.chapter_title ?? null,
      totalChapters,
      percent,
      completed,
      readingSeconds,
      bookmarkCount: Math.max(0, Number(row.bookmark_count ?? 0)),
      lastReadAt: Number(row.updated_at ?? 0),
    };
  });

  return {
    generatedAt: now,
    discordUserId,
    discordUsername: memberRow?.discord_username ?? `Guest ${discordUserId.slice(-4)}`,
    tagTail: discordUserId.slice(-4).padStart(4, '0'),
    readingSeconds7d: Math.max(0, Number(dailySumRow?.reading_7d ?? 0)),
    readingSeconds30d: Math.max(0, Number(dailySumRow?.reading_30d ?? 0)),
    readingSecondsTotal: Math.max(
      booksReadingSecondsSum,
      Math.max(0, Number(dailySumRow?.reading_90d ?? 0)),
    ),
    books,
  };
}
