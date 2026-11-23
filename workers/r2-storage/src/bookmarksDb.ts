import { type AuthContext, HttpError } from './auth';
import { type Env, isValidId } from './booksDb';
import { assertGuestBookAccess } from './shelfAccessDb';

export const MAX_BOOKMARKS_PER_BOOK = 30;
const MAX_BOOKMARK_LABEL_LENGTH = 160;
const MAX_BOOKMARK_NOTE_LENGTH = 300;
const MAX_CHAPTER_TITLE_LENGTH = 200;

interface BookmarkRow {
  id: string;
  user_scope: string;
  book_id: string;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  scroll_ratio: number;
  label: string;
  note: string | null;
  created_at: number;
}

const ensuredBookmarksDbs = new WeakSet<D1Database>();

export async function ensureBookmarksTable(db: D1Database): Promise<void> {
  if (ensuredBookmarksDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS book_bookmarks (
         id TEXT PRIMARY KEY,
         user_scope TEXT NOT NULL,
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         chapter_id TEXT NOT NULL,
         chapter_index INTEGER NOT NULL DEFAULT 0,
         chapter_title TEXT,
         scroll_ratio REAL NOT NULL DEFAULT 0,
         label TEXT NOT NULL,
         note TEXT,
         created_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book
       ON book_bookmarks(user_scope, book_id, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id
       ON book_bookmarks(book_id)`,
    ),
  ]);
  ensuredBookmarksDbs.add(db);
}

function resolveUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

function generateBookmarkId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `bm_${Date.now().toString(36)}_${rand}`;
}

function mapBookmarkRow(row: BookmarkRow) {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    chapterIndex: row.chapter_index,
    ...(row.chapter_title ? { chapterTitle: row.chapter_title } : {}),
    scrollRatio: row.scroll_ratio,
    label: row.label,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

export async function listBookBookmarks(env: Env, auth: AuthContext, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureBookmarksTable(env.DB);
  const scope = resolveUserScope(auth);

  const rows = await env.DB.prepare(
    `SELECT * FROM book_bookmarks
     WHERE user_scope = ? AND book_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(scope, bookId)
    .all<BookmarkRow>();

  return {
    bookmarks: (rows.results || []).map(mapBookmarkRow),
  };
}

export async function createBookBookmark(
  env: Env,
  auth: AuthContext,
  bookId: string,
  rawBody: unknown,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    chapterId?: unknown;
    chapterIndex?: unknown;
    chapterTitle?: unknown;
    scrollRatio?: unknown;
    label?: unknown;
    note?: unknown;
  } | null;

  if (!body || typeof body.chapterId !== 'string' || !body.chapterId.trim()) {
    throw new HttpError('Thiếu thông tin chương cần đánh dấu.', 400);
  }

  const existingBook = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (!existingBook) throw new HttpError('Không tìm thấy sách.', 404);

  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureBookmarksTable(env.DB);
  const scope = resolveUserScope(auth);

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM book_bookmarks WHERE user_scope = ? AND book_id = ?',
  )
    .bind(scope, bookId)
    .first<{ cnt: number }>();
  if (Number(countRow?.cnt ?? 0) >= MAX_BOOKMARKS_PER_BOOK) {
    throw new HttpError(
      `Mỗi cuốn sách lưu tối đa ${MAX_BOOKMARKS_PER_BOOK} dấu trang. Hãy xoá bớt dấu trang cũ.`,
      400,
    );
  }

  const chapterIndex = Math.max(0, Math.floor(Number(body.chapterIndex ?? 0) || 0));
  const rawRatio = Number(body.scrollRatio ?? 0);
  const scrollRatio = Number.isFinite(rawRatio) ? Math.min(1, Math.max(0, rawRatio)) : 0;
  const chapterTitle =
    typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
      ? body.chapterTitle.trim().slice(0, MAX_CHAPTER_TITLE_LENGTH)
      : null;
  const defaultLabel = `${chapterTitle || `Phần ${chapterIndex + 1}`} · ${Math.round(scrollRatio * 100)}%`;
  const label =
    typeof body.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, MAX_BOOKMARK_LABEL_LENGTH)
      : defaultLabel.slice(0, MAX_BOOKMARK_LABEL_LENGTH);
  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, MAX_BOOKMARK_NOTE_LENGTH)
      : null;

  const id = generateBookmarkId();
  const createdAt = Date.now();
  const chapterId = body.chapterId.trim().slice(0, 120);

  await env.DB.prepare(
    `INSERT INTO book_bookmarks
       (id, user_scope, book_id, chapter_id, chapter_index, chapter_title, scroll_ratio, label, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, scope, bookId, chapterId, chapterIndex, chapterTitle, scrollRatio, label, note, createdAt)
    .run();

  return {
    bookmark: {
      id,
      bookId,
      chapterId,
      chapterIndex,
      ...(chapterTitle ? { chapterTitle } : {}),
      scrollRatio,
      label,
      note,
      createdAt,
    },
  };
}

export async function deleteBookBookmark(
  env: Env,
  auth: AuthContext,
  bookId: string,
  bookmarkId: string,
) {
  if (!isValidId(bookId) || !isValidId(bookmarkId)) {
    throw new HttpError('ID dấu trang không hợp lệ.', 400);
  }
  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureBookmarksTable(env.DB);
  const scope = resolveUserScope(auth);

  await env.DB.prepare(
    'DELETE FROM book_bookmarks WHERE id = ? AND user_scope = ? AND book_id = ?',
  )
    .bind(bookmarkId, scope, bookId)
    .run();

  return { ok: true, deletedId: bookmarkId };
}
