import { type AuthEnv, HttpError } from './auth';

export interface Env extends AuthEnv {
  APP_ORIGINS: string;
  STORAGE_LIMIT_BYTES?: string;
  BOOKS_BUCKET: R2Bucket;
  DB: D1Database;
}

export interface BookRow {
  id: string;
  title: string;
  author: string;
  shelf: string;
  description: string | null;
  cover_color: string;
  cover_key: string | null;
  file_key: string;
  file_type: 'epub' | 'pdf' | 'docx';
  file_size: number;
  cover_size: number;
  created_at: string;
}

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

export const DEFAULT_HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GiB safety cap under 10 GB Free Tier
export const MAX_SINGLE_FILE_BYTES = 350 * 1024 * 1024; // 350 MiB
export const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_SHELF_NAME_LENGTH = 120;
export const MAX_TEXT_FIELD_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const BULK_D1_CHUNK_SIZE = 50;

export const ACCEPTED_FILE_TYPES = new Set(['epub', 'pdf', 'docx']);
export const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function getLimitBytes(env: Env): number {
  const parsed = Number(env.STORAGE_LIMIT_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HARD_LIMIT_BYTES;
}

export function safeDecodeHeader(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value).trim() || fallback;
  } catch {
    return value.trim() || fallback;
  }
}

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(id);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function getStorageStats(env: Env) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
  ).first<{ used_bytes: number; book_count: number }>();
  const usedBytes = Number(row?.used_bytes ?? 0);
  const bookCount = Number(row?.book_count ?? 0);
  const limitBytes = getLimitBytes(env);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    bookCount,
  };
}

export function assertQuota(usedBytes: number, incomingBytes: number, limitBytes: number) {
  if (usedBytes + incomingBytes > limitBytes) {
    const usedGb = (usedBytes / 1024 ** 3).toFixed(2);
    const limitGb = (limitBytes / 1024 ** 3).toFixed(1);
    throw new HttpError(
      `Đã chạm giới hạn an toàn Free Tier (${usedGb} / ${limitGb} GB). Hãy xóa bớt sách cũ trước khi tải thêm để luôn giữ chi phí $0.`,
      413,
    );
  }
}

export async function listBooksAndProgress(env: Env) {
  const [booksRes, progressRes, storage] = await Promise.all([
    env.DB.prepare('SELECT * FROM books ORDER BY created_at DESC').all<BookRow>(),
    env.DB.prepare('SELECT * FROM reading_progress').all<ProgressRow>(),
    getStorageStats(env),
  ]);

  const progressMap: Record<
    string,
    {
      chapterId: string;
      chapterIndex: number;
      chapterTitle?: string;
      totalChapters?: number;
      scrollRatio: number;
      scrollTop: number;
      completed: boolean;
      updatedAt: number;
    }
  > = {};

  for (const row of progressRes.results || []) {
    progressMap[row.book_id] = {
      chapterId: row.chapter_id,
      chapterIndex: row.chapter_index,
      ...(row.chapter_title ? { chapterTitle: row.chapter_title } : {}),
      ...(typeof row.total_chapters === 'number' && row.total_chapters > 0
        ? { totalChapters: row.total_chapters }
        : {}),
      scrollRatio: row.scroll_ratio,
      scrollTop: row.scroll_top,
      completed: row.completed === 1,
      updatedAt: row.updated_at,
    };
  }

  return { books: booksRes.results || [], progress: progressMap, storage };
}

export async function deleteSingleBook(env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const existing = await env.DB.prepare('SELECT file_key, cover_key FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ file_key: string; cover_key: string | null }>();
  if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

  const keysToDelete = [existing.file_key, existing.cover_key].filter((k): k is string => Boolean(k));
  if (keysToDelete.length > 0) {
    await env.BOOKS_BUCKET.delete(keysToDelete);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId),
    env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId),
  ]);

  const storage = await getStorageStats(env);
  return { deletedId: bookId, storage };
}

export async function bulkDeleteBooks(env: Env, rawIds: unknown) {
  const ids = Array.isArray(rawIds)
    ? Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && isValidId(id))))
    : [];
  if (ids.length === 0) throw new HttpError('Danh sách sách cần xóa trống.', 400);

  const idChunks = chunkArray(ids, BULK_D1_CHUNK_SIZE);
  const keysToDelete: string[] = [];

  for (const chunk of idChunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT id, file_key, cover_key FROM books WHERE id IN (${placeholders})`,
    )
      .bind(...chunk)
      .all<{ id: string; file_key: string; cover_key: string | null }>();
    for (const row of rows.results || []) {
      if (row.file_key) keysToDelete.push(row.file_key);
      if (row.cover_key) keysToDelete.push(row.cover_key);
    }
  }

  if (keysToDelete.length > 0) {
    await env.BOOKS_BUCKET.delete(keysToDelete);
  }

  const deleteStatements: D1PreparedStatement[] = [];
  for (const chunk of idChunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    deleteStatements.push(
      env.DB.prepare(`DELETE FROM reading_progress WHERE book_id IN (${placeholders})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM books WHERE id IN (${placeholders})`).bind(...chunk),
    );
  }
  await env.DB.batch(deleteStatements);

  const storage = await getStorageStats(env);
  return { deletedIds: ids, storage };
}

export async function bulkUpdateBooksShelf(env: Env, rawIds: unknown, rawShelf: unknown) {
  const ids = Array.isArray(rawIds)
    ? Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && isValidId(id))))
    : [];
  if (ids.length === 0) throw new HttpError('Danh sách sách cần chuyển kệ trống.', 400);

  const shelf = typeof rawShelf === 'string' ? rawShelf.trim() : '';
  if (!shelf || shelf.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`, 400);
  }

  const statements: D1PreparedStatement[] = [];
  for (const chunk of chunkArray(ids, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push(
      env.DB.prepare(`UPDATE books SET shelf = ? WHERE id IN (${placeholders})`).bind(shelf, ...chunk),
    );
  }
  await env.DB.batch(statements);

  return { updatedIds: ids, shelf };
}

export async function renameShelfCaseInsensitive(env: Env, rawOldName: unknown, rawNewName: unknown) {
  const oldName = typeof rawOldName === 'string' ? rawOldName.trim() : '';
  const newName = typeof rawNewName === 'string' ? rawNewName.trim() : '';
  if (!oldName || !newName || newName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }

  const targetKey = oldName.toLocaleLowerCase('vi');
  const rows = await env.DB.prepare('SELECT DISTINCT shelf FROM books').all<{ shelf: string }>();
  const matchedShelves = (rows.results || [])
    .map((r) => r.shelf)
    .filter((s) => typeof s === 'string' && s.trim().toLocaleLowerCase('vi') === targetKey);

  if (matchedShelves.length === 0) {
    await env.DB.prepare('UPDATE books SET shelf = ? WHERE shelf = ?').bind(newName, oldName).run();
    return { ok: true };
  }

  const statements: D1PreparedStatement[] = [];
  for (const chunk of chunkArray(matchedShelves, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push(
      env.DB.prepare(`UPDATE books SET shelf = ? WHERE shelf IN (${placeholders})`).bind(
        newName,
        ...chunk,
      ),
    );
  }
  await env.DB.batch(statements);
  return { ok: true };
}

export async function upsertReadingProgress(
  env: Env,
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

  return { ok: true, updatedAt };
}
