import { type AuthContext, HttpError } from './auth';
import { type Env, isValidId } from './booksDb';

export interface ProgressRow {
  book_id: string;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  total_chapters: number | null;
  scroll_ratio: number;
  scroll_top: number;
  completed: number;
  updated_at: number;
}

export async function ensureGuestProgressTable(env: Env): Promise<void> {
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
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (discord_user_id, book_id)
       )`,
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated
       ON guest_reading_progress(discord_user_id, updated_at DESC)`,
    ),
  ]);
}

export async function upsertReadingProgress(
  env: Env,
  auth: AuthContext,
  bookId: string,
  body: {
    chapterId?: string;
    chapterIndex?: number;
    chapterTitle?: string;
    totalChapters?: number;
    scrollRatio?: number;
    scrollTop?: number;
    completed?: boolean;
    updatedAt?: number;
  } | null,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (!body?.chapterId) throw new HttpError('Thiếu thông tin chương đang đọc.', 400);

  const existingBook = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (!existingBook) throw new HttpError('Không tìm thấy sách.', 404);

  const updatedAt = typeof body.updatedAt === 'number' ? body.updatedAt : Date.now();
  const chapterTitle =
    typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
      ? body.chapterTitle.trim().slice(0, 200)
      : null;
  const totalChapters =
    typeof body.totalChapters === 'number' &&
    Number.isFinite(body.totalChapters) &&
    body.totalChapters > 0
      ? Math.floor(body.totalChapters)
      : null;

  if (auth.role === 'owner') {
    await env.DB.prepare(
      `INSERT INTO reading_progress (book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         chapter_index = excluded.chapter_index,
         chapter_title = COALESCE(excluded.chapter_title, reading_progress.chapter_title),
         total_chapters = COALESCE(excluded.total_chapters, reading_progress.total_chapters),
         scroll_ratio = excluded.scroll_ratio,
         scroll_top = excluded.scroll_top,
         completed = excluded.completed,
         updated_at = excluded.updated_at`,
    )
      .bind(
        bookId,
        body.chapterId,
        Number(body.chapterIndex ?? 0),
        chapterTitle,
        totalChapters,
        Number(body.scrollRatio ?? 0),
        Number(body.scrollTop ?? 0),
        body.completed ? 1 : 0,
        updatedAt,
      )
      .run();
  } else {
    await ensureGuestProgressTable(env);
    await env.DB.prepare(
      `INSERT INTO guest_reading_progress (discord_user_id, book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_user_id, book_id) DO UPDATE SET
         chapter_id = excluded.chapter_id,
         chapter_index = excluded.chapter_index,
         chapter_title = COALESCE(excluded.chapter_title, guest_reading_progress.chapter_title),
         total_chapters = COALESCE(excluded.total_chapters, guest_reading_progress.total_chapters),
         scroll_ratio = excluded.scroll_ratio,
         scroll_top = excluded.scroll_top,
         completed = excluded.completed,
         updated_at = excluded.updated_at`,
    )
      .bind(
        auth.userId,
        bookId,
        body.chapterId,
        Number(body.chapterIndex ?? 0),
        chapterTitle,
        totalChapters,
        Number(body.scrollRatio ?? 0),
        Number(body.scrollTop ?? 0),
        body.completed ? 1 : 0,
        updatedAt,
      )
      .run();
  }

  return { ok: true, updatedAt };
}

export async function deleteReadingProgress(env: Env, auth: AuthContext, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (auth.role === 'owner') {
    await env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId).run();
  } else {
    await env.DB.prepare(
      'DELETE FROM guest_reading_progress WHERE discord_user_id = ? AND book_id = ?',
    )
      .bind(auth.userId, bookId)
      .run()
      .catch(() => undefined);
  }
  return { ok: true };
}
