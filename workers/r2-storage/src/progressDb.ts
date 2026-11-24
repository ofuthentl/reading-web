import { type AuthContext, HttpError } from './auth';
import { type Env, isValidId } from './booksDb';
import { assertGuestBookAccess } from './shelfAccessDb';
import { MAX_READING_DELTA_SEC } from './usageRecorder';

const FIRST_BOOK_SAVE_MAX_SEC = 180;

export interface ProgressRow {
  book_id: string;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  total_chapters: number | null;
  scroll_ratio: number;
  scroll_top: number;
  completed: number;
  reading_seconds?: number;
  reread_count?: number;
  updated_at: number;
}

const ensuredProgressDbs = new WeakSet<D1Database>();
const ensuredReadingSecDbs = new WeakSet<D1Database>();

async function ensureProgressExtraColumns(
  db: D1Database,
  table: 'reading_progress' | 'guest_reading_progress',
): Promise<void> {
  const cols = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const names = new Set((cols.results || []).map((c) => c.name));
  if (!names.has('reading_seconds')) {
    try {
      await db
        .prepare(`ALTER TABLE ${table} ADD COLUMN reading_seconds INTEGER NOT NULL DEFAULT 0`)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('duplicate column')) throw err;
    }
  }
  if (!names.has('reread_count')) {
    try {
      await db
        .prepare(`ALTER TABLE ${table} ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0`)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('duplicate column')) throw err;
    }
  }
}

export async function ensureGuestProgressTable(env: Env): Promise<void> {
  if (!ensuredProgressDbs.has(env.DB)) {
    await env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS guest_reading_progress (
           discord_user_id TEXT NOT NULL,
           book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
           chapter_id TEXT NOT NULL,
           chapter_index INTEGER NOT NULL DEFAULT 0,
           chapter_title TEXT,
           total_chapters INTEGER,
           scroll_ratio REAL NOT NULL DEFAULT 0,
           scroll_top REAL NOT NULL DEFAULT 0,
           completed INTEGER NOT NULL DEFAULT 0,
           reading_seconds INTEGER NOT NULL DEFAULT 0,
           reread_count INTEGER NOT NULL DEFAULT 0,
           updated_at INTEGER NOT NULL,
           PRIMARY KEY (discord_user_id, book_id)
         )`,
      ),
      env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated
         ON guest_reading_progress(discord_user_id, updated_at DESC)`,
      ),
      env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_guest_progress_updated_at
         ON guest_reading_progress(updated_at DESC)`,
      ),
      env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_guest_progress_book_id
         ON guest_reading_progress(book_id)`,
      ),
    ]);
    ensuredProgressDbs.add(env.DB);
  }
  await ensureProgressReadingTimeColumns(env);
}

export async function ensureProgressReadingTimeColumns(env: Env): Promise<void> {
  if (ensuredReadingSecDbs.has(env.DB)) return;
  await ensureProgressExtraColumns(env.DB, 'reading_progress');
  if (ensuredProgressDbs.has(env.DB)) {
    await ensureProgressExtraColumns(env.DB, 'guest_reading_progress');
    ensuredReadingSecDbs.add(env.DB);
    return;
  }
  const guestTbl = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guest_reading_progress'",
  ).first<{ name: string }>();
  if (guestTbl) {
    await ensureProgressExtraColumns(env.DB, 'guest_reading_progress');
    ensuredReadingSecDbs.add(env.DB);
  }
}

export async function upsertReadingProgress(
  env: Env,
  auth: AuthContext,
  bookId: string,
  body: {
    chapterId?: unknown;
    chapterIndex?: unknown;
    chapterTitle?: unknown;
    totalChapters?: unknown;
    scrollRatio?: unknown;
    scrollTop?: unknown;
    completed?: unknown;
    updatedAt?: unknown;
    readingDeltaSec?: unknown;
    rereadCount?: unknown;
  } | null,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (typeof body?.chapterId !== 'string' || !body.chapterId.trim()) {
    throw new HttpError('Thiếu thông tin chương đang đọc.', 400);
  }
  const chapterId = body.chapterId.trim().slice(0, 120);

  const existingBook = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (!existingBook) throw new HttpError('Không tìm thấy sách.', 404);

  if (auth.role !== 'owner') {
    await assertGuestBookAccess(env.DB, auth, bookId);
  }

  // Luôn dùng đồng hồ máy chủ để tránh client bơm mốc thời gian tương lai làm sai lệch bảng xếp hạng tuần (vá M-1)
  const updatedAt = Date.now();
  const rawChapterIndex = Number(body.chapterIndex ?? 0);
  const chapterIndex =
    Number.isFinite(rawChapterIndex) && rawChapterIndex >= 0
      ? Math.min(100_000, Math.floor(rawChapterIndex))
      : 0;
  const rawScrollRatio = Number(body.scrollRatio ?? 0);
  const scrollRatio = Number.isFinite(rawScrollRatio)
    ? Math.min(1, Math.max(0, rawScrollRatio))
    : 0;
  const rawScrollTop = Number(body.scrollTop ?? 0);
  const scrollTop = Number.isFinite(rawScrollTop)
    ? Math.min(10_000_000, Math.max(0, rawScrollTop))
    : 0;
  const completed = body.completed === true ? 1 : 0;
  const chapterTitle =
    typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
      ? body.chapterTitle.trim().slice(0, 200)
      : null;
  const rawTotalChapters = Number(body.totalChapters ?? 0);
  const totalChapters =
    Number.isFinite(rawTotalChapters) && rawTotalChapters > 0
      ? Math.min(100_000, Math.floor(rawTotalChapters))
      : null;

  const rawReadingDelta = Number(body.readingDeltaSec ?? 0);
  const requestedDelta =
    Number.isFinite(rawReadingDelta) && rawReadingDelta > 0
      ? Math.min(MAX_READING_DELTA_SEC, Math.floor(rawReadingDelta))
      : 0;

  const rawRereadCount = Number(body.rereadCount ?? 0);
  const incomingRereadCount =
    Number.isFinite(rawRereadCount) && rawRereadCount > 0
      ? Math.min(999, Math.floor(rawRereadCount))
      : 0;

  let readingDeltaAccepted = 0;
  const firstSaveCapped = Math.min(requestedDelta, FIRST_BOOK_SAVE_MAX_SEC);

  if (auth.role === 'owner') {
    await ensureProgressReadingTimeColumns(env);
    // Kẹp reading_seconds nguyên tử trực tiếp trong SQL theo đồng hồ thực (bỏ +3s/+999ms) và đo chính xác chênh lệch qua db.batch
    const upsertStmt = env.DB.prepare(
      `INSERT INTO reading_progress (book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, reading_seconds, reread_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         chapter_index = excluded.chapter_index,
         chapter_title = COALESCE(excluded.chapter_title, reading_progress.chapter_title),
         total_chapters = COALESCE(excluded.total_chapters, reading_progress.total_chapters),
         scroll_ratio = excluded.scroll_ratio,
         scroll_top = excluded.scroll_top,
         completed = excluded.completed,
         reading_seconds = COALESCE(reading_progress.reading_seconds, 0) + CASE
           WHEN ? <= 0 THEN 0
           WHEN reading_progress.updated_at > 0 THEN MIN(?, MIN(?, MAX(0, CAST((excluded.updated_at - reading_progress.updated_at) / 1000 AS INTEGER))))
           ELSE ?
         END,
         reread_count = MAX(COALESCE(reading_progress.reread_count, 0), excluded.reread_count),
         updated_at = MAX(reading_progress.updated_at, excluded.updated_at)
       RETURNING reading_seconds`,
    ).bind(
      bookId,
      chapterId,
      chapterIndex,
      chapterTitle,
      totalChapters,
      scrollRatio,
      scrollTop,
      completed,
      firstSaveCapped,
      incomingRereadCount,
      updatedAt,
      requestedDelta,
      requestedDelta,
      MAX_READING_DELTA_SEC,
      firstSaveCapped,
    );

    if (requestedDelta > 0) {
      const [beforeRes, afterRes] = await env.DB.batch<{ reading_seconds: number }>([
        env.DB.prepare('SELECT reading_seconds FROM reading_progress WHERE book_id = ?').bind(bookId),
        upsertStmt,
      ]);
      const beforeSec = Number(beforeRes.results?.[0]?.reading_seconds ?? 0);
      const afterSec = Number(afterRes.results?.[0]?.reading_seconds ?? beforeSec);
      readingDeltaAccepted = Math.max(0, Math.min(requestedDelta, afterSec - beforeSec));
    } else {
      await upsertStmt.run();
      readingDeltaAccepted = 0;
    }
  } else {
    await ensureGuestProgressTable(env);
    const upsertStmt = env.DB.prepare(
      `INSERT INTO guest_reading_progress (discord_user_id, book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, reading_seconds, reread_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_user_id, book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         chapter_index = excluded.chapter_index,
         chapter_title = COALESCE(excluded.chapter_title, guest_reading_progress.chapter_title),
         total_chapters = COALESCE(excluded.total_chapters, guest_reading_progress.total_chapters),
         scroll_ratio = excluded.scroll_ratio,
         scroll_top = excluded.scroll_top,
         completed = excluded.completed,
         reading_seconds = COALESCE(guest_reading_progress.reading_seconds, 0) + CASE
           WHEN ? <= 0 THEN 0
           WHEN guest_reading_progress.updated_at > 0 THEN MIN(?, MIN(?, MAX(0, CAST((excluded.updated_at - guest_reading_progress.updated_at) / 1000 AS INTEGER))))
           ELSE ?
         END,
         reread_count = MAX(COALESCE(guest_reading_progress.reread_count, 0), excluded.reread_count),
         updated_at = MAX(guest_reading_progress.updated_at, excluded.updated_at)
       RETURNING reading_seconds`,
    ).bind(
      auth.userId,
      bookId,
      chapterId,
      chapterIndex,
      chapterTitle,
      totalChapters,
      scrollRatio,
      scrollTop,
      completed,
      firstSaveCapped,
      incomingRereadCount,
      updatedAt,
      requestedDelta,
      requestedDelta,
      MAX_READING_DELTA_SEC,
      firstSaveCapped,
    );

    if (requestedDelta > 0) {
      const [beforeRes, afterRes] = await env.DB.batch<{ reading_seconds: number }>([
        env.DB.prepare(
          'SELECT reading_seconds FROM guest_reading_progress WHERE discord_user_id = ? AND book_id = ?',
        ).bind(auth.userId, bookId),
        upsertStmt,
      ]);
      const beforeSec = Number(beforeRes.results?.[0]?.reading_seconds ?? 0);
      const afterSec = Number(afterRes.results?.[0]?.reading_seconds ?? beforeSec);
      readingDeltaAccepted = Math.max(0, Math.min(requestedDelta, afterSec - beforeSec));
    } else {
      await upsertStmt.run();
      readingDeltaAccepted = 0;
    }
  }

  return { ok: true, updatedAt, readingDeltaAccepted };
}

export async function deleteReadingProgress(env: Env, auth: AuthContext, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (auth.role === 'owner') {
    await env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId).run();
  } else {
    // Cho phép khách tự xoá tiến độ cũ của chính mình kể cả khi bộ truyện sau này bị khoá giới hạn (L-5)
    await ensureGuestProgressTable(env);
    await env.DB.prepare(
      'DELETE FROM guest_reading_progress WHERE discord_user_id = ? AND book_id = ?',
    )
      .bind(auth.userId, bookId)
      .run();
  }
  return { ok: true };
}
