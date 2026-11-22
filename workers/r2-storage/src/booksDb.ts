import { type AuthContext, type AuthEnv, HttpError } from './auth';
import { type ProgressRow, deleteReadingProgress, upsertReadingProgress } from './progressDb';
import {
  loadShelfAccessSnapshot,
  mergeShelfAccessOnRename,
  toShelfAccessKey,
} from './shelfAccessDb';
import { computeWeeklyPopularBookIds } from './weeklyPopular';

export { type ProgressRow, deleteReadingProgress, upsertReadingProgress };

export interface Env extends AuthEnv {
  APP_ORIGINS: string;
  PUBLIC_APP_URL?: string;
  STORAGE_LIMIT_BYTES?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_BOT_TOKEN?: string;
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

export interface ShelfPrefRow {
  shelf_key: string;
  cover_book_id: string | null;
  is_favorite: number;
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
  const [booksRow, packRow] = await Promise.all([
    env.DB.prepare(
      'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
    ).first<{ used_bytes: number; book_count: number }>(),
    env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs')
      .first<{ pack_bytes: number }>()
      .catch(() => ({ pack_bytes: 0 })),
  ]);
  const usedBytes = Number(booksRow?.used_bytes ?? 0) + Number(packRow?.pack_bytes ?? 0);
  const bookCount = Number(booksRow?.book_count ?? 0);
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

async function ensureShelfPrefsTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS shelf_prefs (
       shelf_key TEXT PRIMARY KEY,
       cover_book_id TEXT,
       is_favorite INTEGER NOT NULL DEFAULT 0,
       updated_at INTEGER NOT NULL
     )`,
  ).run();
}

export async function listBooksAndProgress(env: Env, auth: AuthContext) {
  const progressQuery =
    auth.role === 'owner'
      ? env.DB.prepare('SELECT * FROM reading_progress').all<ProgressRow>()
      : env.DB.prepare(
          `SELECT book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, updated_at
           FROM guest_reading_progress
           WHERE discord_user_id = ?`,
        )
          .bind(auth.userId)
          .all<ProgressRow>()
          .catch(() => ({ results: [] as ProgressRow[] }));

  const [booksRes, progressRes, shelfPrefsRes, guestPacksRes, accessSnapshot, storage] =
    await Promise.all([
      env.DB.prepare('SELECT * FROM books ORDER BY created_at DESC').all<BookRow>(),
      progressQuery,
      env.DB.prepare('SELECT shelf_key, cover_book_id, is_favorite FROM shelf_prefs')
        .all<Pick<ShelfPrefRow, 'shelf_key' | 'cover_book_id' | 'is_favorite'>>()
        .catch(() => ({
          results: [] as Array<Pick<ShelfPrefRow, 'shelf_key' | 'cover_book_id' | 'is_favorite'>>,
        })),
      env.DB.prepare('SELECT book_id FROM book_guest_packs')
        .all<{ book_id: string }>()
        .catch(() => ({ results: [] as Array<{ book_id: string }> })),
      loadShelfAccessSnapshot(env.DB, auth).catch(() => ({
        restrictedKeys: new Set<string>(),
        allowedRestrictedKeys: new Set<string>(),
        ownerShelfAccess: {},
      })),
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

  const shelfCovers: Record<string, string> = {};
  const favoriteShelves: string[] = [];
  for (const row of shelfPrefsRes.results || []) {
    if (!row.shelf_key) continue;
    if (row.cover_book_id) shelfCovers[row.shelf_key] = row.cover_book_id;
    if (row.is_favorite === 1) favoriteShelves.push(row.shelf_key);
  }

  const guestReadyIds = new Set((guestPacksRes.results || []).map((r) => r.book_id));
  const isGuest = auth.role === 'guest';
  const rawBooks = booksRes.results || [];
  const sanitizedBooks = rawBooks.map((book) => {
    const shelfKey = toShelfAccessKey(book.shelf);
    const isGuestLocked =
      isGuest &&
      accessSnapshot.restrictedKeys.has(shelfKey) &&
      !accessSnapshot.allowedRestrictedKeys.has(shelfKey);
    return {
      ...book,
      file_key: isGuest ? '' : book.file_key,
      guest_ready: book.file_type === 'pdf' ? false : guestReadyIds.has(book.id),
      ...(isGuestLocked ? { guest_locked: true } : {}),
    };
  });
  const weeklyPopular = await computeWeeklyPopularBookIds(env.DB, rawBooks, 10);

  return {
    books: sanitizedBooks,
    progress: progressMap,
    weeklyPopular,
    shelfCovers,
    favoriteShelves,
    ...(auth.role === 'owner' ? { shelfAccess: accessSnapshot.ownerShelfAccess } : {}),
    storage,
    session: {
      role: auth.role,
      expiresAt: auth.expiresAt,
      ...(auth.watermarkLabel ? { watermarkLabel: auth.watermarkLabel } : {}),
    },
  };
}

export async function deleteSingleBook(env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const existing = await env.DB.prepare('SELECT file_key, cover_key FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ file_key: string; cover_key: string | null }>();
  if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

  const keysToDelete = [
    existing.file_key,
    existing.cover_key,
    `guest-packs/${bookId}.pack`,
  ].filter((k): k is string => Boolean(k));
  if (keysToDelete.length > 0) {
    await env.BOOKS_BUCKET.delete(keysToDelete);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId),
    env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId),
  ]);
  await env.DB.prepare('DELETE FROM book_guest_packs WHERE book_id = ?')
    .bind(bookId)
    .run()
    .catch(() => undefined);
  await env.DB.batch([
    env.DB.prepare('UPDATE shelf_prefs SET cover_book_id = NULL WHERE cover_book_id = ?').bind(bookId),
    env.DB.prepare('DELETE FROM shelf_prefs WHERE cover_book_id IS NULL AND is_favorite = 0'),
  ]).catch(() => undefined);
  await env.DB.prepare('DELETE FROM guest_reading_progress WHERE book_id = ?')
    .bind(bookId)
    .run()
    .catch(() => undefined);
  await env.DB.prepare('DELETE FROM book_bookmarks WHERE book_id = ?')
    .bind(bookId)
    .run()
    .catch(() => undefined);

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
      keysToDelete.push(`guest-packs/${row.id}.pack`);
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
  for (const chunk of idChunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE shelf_prefs SET cover_book_id = NULL WHERE cover_book_id IN (${placeholders})`,
      ).bind(...chunk),
      env.DB.prepare('DELETE FROM shelf_prefs WHERE cover_book_id IS NULL AND is_favorite = 0'),
    ]).catch(() => undefined);
    await env.DB.prepare(`DELETE FROM guest_reading_progress WHERE book_id IN (${placeholders})`)
      .bind(...chunk)
      .run()
      .catch(() => undefined);
    await env.DB.prepare(`DELETE FROM book_guest_packs WHERE book_id IN (${placeholders})`)
      .bind(...chunk)
      .run()
      .catch(() => undefined);
    await env.DB.prepare(`DELETE FROM book_bookmarks WHERE book_id IN (${placeholders})`)
      .bind(...chunk)
      .run()
      .catch(() => undefined);
  }

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
  const newKey = newName.toLocaleLowerCase('vi');
  const rows = await env.DB.prepare('SELECT DISTINCT shelf FROM books').all<{ shelf: string }>();
  const matchedShelves = (rows.results || [])
    .map((r) => r.shelf)
    .filter((s) => typeof s === 'string' && s.trim().toLocaleLowerCase('vi') === targetKey);

  if (matchedShelves.length === 0) {
    await env.DB.prepare('UPDATE books SET shelf = ? WHERE shelf = ?').bind(newName, oldName).run();
  } else {
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
  }

  if (targetKey !== newKey) {
    await (async () => {
      const existingRows = await env.DB.prepare(
        'SELECT shelf_key, cover_book_id, is_favorite FROM shelf_prefs WHERE shelf_key IN (?, ?)',
      )
        .bind(targetKey, newKey)
        .all<Pick<ShelfPrefRow, 'shelf_key' | 'cover_book_id' | 'is_favorite'>>();
      const list = existingRows.results || [];
      const src = list.find((r) => r.shelf_key === targetKey);
      if (!src) return;
      const dest = list.find((r) => r.shelf_key === newKey);
      const mergedCover = dest?.cover_book_id || src.cover_book_id || null;
      const mergedFav = dest?.is_favorite === 1 || src.is_favorite === 1 ? 1 : 0;
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(shelf_key) DO UPDATE SET
             cover_book_id = excluded.cover_book_id,
             is_favorite = excluded.is_favorite,
             updated_at = excluded.updated_at`,
        ).bind(newKey, mergedCover, mergedFav, Date.now()),
        env.DB.prepare('DELETE FROM shelf_prefs WHERE shelf_key = ?').bind(targetKey),
      ]);
    })().catch(() => undefined);

    await mergeShelfAccessOnRename(env.DB, targetKey, newKey).catch(() => undefined);
  }

  return { ok: true };
}

export async function upsertShelfCover(env: Env, rawShelfName: unknown, rawBookId: unknown) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  const shelfKey = shelfName.toLocaleLowerCase('vi');
  const nextBookId = rawBookId === null || rawBookId === '' ? null : rawBookId;
  if (nextBookId !== null && (typeof nextBookId !== 'string' || !isValidId(nextBookId))) {
    throw new HttpError('ID sách làm ảnh bìa không hợp lệ.', 400);
  }

  await ensureShelfPrefsTable(env);
  const updatedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(shelf_key) DO UPDATE SET
         cover_book_id = excluded.cover_book_id,
         updated_at = excluded.updated_at`,
    ).bind(shelfKey, nextBookId, updatedAt),
    env.DB.prepare(
      'DELETE FROM shelf_prefs WHERE shelf_key = ? AND cover_book_id IS NULL AND is_favorite = 0',
    ).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, bookId: nextBookId, updatedAt };
}

export async function upsertShelfFavorite(env: Env, rawShelfName: unknown, rawFavorite: unknown) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  if (typeof rawFavorite !== 'boolean') {
    throw new HttpError('Trạng thái yêu thích không hợp lệ.', 400);
  }
  const shelfKey = shelfName.toLocaleLowerCase('vi');
  const isFav = rawFavorite ? 1 : 0;

  await ensureShelfPrefsTable(env);
  const updatedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)
       VALUES (?, NULL, ?, ?)
       ON CONFLICT(shelf_key) DO UPDATE SET
         is_favorite = excluded.is_favorite,
         updated_at = excluded.updated_at`,
    ).bind(shelfKey, isFav, updatedAt),
    env.DB.prepare(
      'DELETE FROM shelf_prefs WHERE shelf_key = ? AND cover_book_id IS NULL AND is_favorite = 0',
    ).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, favorite: rawFavorite, updatedAt };
}
