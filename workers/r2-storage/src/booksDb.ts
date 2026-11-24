import { type AuthContext, type AuthEnv, HttpError } from './auth';
import {
  ensureCatalogEnhancementsTables,
  loadCatalogEnhancementsSnapshot,
} from './catalogEnhancementsDb';
import { loadAllShelfRatingsMap } from './communityDb';
import { buildDeleteTargetCommentsStatements } from './communityReactionsDb';
import {
  type ProgressRow,
  deleteReadingProgress,
  ensureGuestProgressTable,
  ensureProgressReadingTimeColumns,
  upsertReadingProgress,
} from './progressDb';
import { loadShelfAccessSnapshot, toShelfAccessKey } from './shelfAccessDb';
import {
  bulkUpdateBooksShelf,
  cleanupOrphanShelves,
  clearStaleShelfCoverForBook,
  renameShelfCaseInsensitive,
  upsertShelfCover,
  upsertShelfFavorite,
} from './shelfMutationsDb';
import {
  DELETE_EMPTY_SHELF_PREFS_SQL,
  ensureShelfTagsSchema,
  parseShelfAltTitlesJson,
  parseShelfTagsJson,
} from './shelfTagsDb';
import { computeWeeklyPopularBookIds } from './weeklyPopular';

export {
  type ProgressRow,
  bulkUpdateBooksShelf,
  clearStaleShelfCoverForBook,
  deleteReadingProgress,
  renameShelfCaseInsensitive,
  upsertReadingProgress,
  upsertShelfCover,
  upsertShelfFavorite,
};

export interface Env extends AuthEnv {
  APP_ORIGINS: string;
  PUBLIC_APP_URL?: string;
  STORAGE_LIMIT_BYTES?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_RELEASE_CHANNEL_ID?: string;
  DISCORD_RELEASE_WEBHOOK_URL?: string;
  DISCORD_KEY_CHANNEL_ID?: string;
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
  file_type: 'epub' | 'docx';
  file_size: number;
  cover_size: number;
  created_at: string;
}

export interface ShelfPrefRow {
  shelf_key: string;
  cover_book_id: string | null;
  is_favorite: number;
  tags_json?: string | null;
  alt_titles_json?: string | null;
  updated_at: number;
}

export const DEFAULT_HARD_LIMIT_BYTES = 9 * 1024 * 1024 * 1024; // 9.0 GiB safety cap under 10 GB Free Tier
export const MAX_SINGLE_FILE_BYTES = 350 * 1024 * 1024; // 350 MiB
export const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_SHELF_NAME_LENGTH = 120;
export const MAX_TEXT_FIELD_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const BULK_D1_CHUNK_SIZE = 50;
const R2_DELETE_CHUNK_SIZE = 500;

export const ACCEPTED_FILE_TYPES = new Set(['epub', 'docx']);
export const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
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

export async function listBooksAndProgress(env: Env, auth: AuthContext) {
  await Promise.all([
    ensureShelfTagsSchema(env.DB).catch(() => undefined),
    ensureCatalogEnhancementsTables(env.DB).catch(() => undefined),
    auth.role === 'owner'
      ? ensureProgressReadingTimeColumns(env).catch(() => undefined)
      : ensureGuestProgressTable(env).catch(() => undefined),
  ]);

  const progressQuery =
    auth.role === 'owner'
      ? env.DB.prepare('SELECT * FROM reading_progress').all<ProgressRow>()
      : env.DB.prepare(
          `SELECT book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, reading_seconds, updated_at
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
      env.DB.prepare(
        'SELECT shelf_key, cover_book_id, is_favorite, tags_json, alt_titles_json FROM shelf_prefs',
      )
        .all<
          Pick<
            ShelfPrefRow,
            'shelf_key' | 'cover_book_id' | 'is_favorite' | 'tags_json' | 'alt_titles_json'
          >
        >()
        .catch(() => ({
          results: [] as Array<
            Pick<
              ShelfPrefRow,
              'shelf_key' | 'cover_book_id' | 'is_favorite' | 'tags_json' | 'alt_titles_json'
            >
          >,
        })),
      env.DB.prepare('SELECT book_id FROM book_guest_packs')
        .all<{ book_id: string }>()
        .catch(() => ({ results: [] as Array<{ book_id: string }> })),
      auth.role === 'guest'
        ? loadShelfAccessSnapshot(env.DB, auth).catch(() => {
            throw new HttpError(
              'Không thể xác minh phân quyền kệ sách. Vui lòng thử lại sau giây lát.',
              503,
            );
          })
        : loadShelfAccessSnapshot(env.DB, auth).catch(() => ({
            restrictedKeys: new Set<string>(),
            allowedRestrictedKeys: new Set<string>(),
            ownerShelfAccess: {},
          })),
      // Chỉ truy vấn thống kê dung lượng R2 cho Owner; Guest không hiển thị thanh dung lượng (L-5)
      auth.role === 'owner' ? getStorageStats(env) : Promise.resolve(null),
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
      ...(typeof row.reading_seconds === 'number' && row.reading_seconds > 0
        ? { readingSeconds: row.reading_seconds }
        : {}),
      updatedAt: row.updated_at,
    };
  }

  const isGuest = auth.role === 'guest';
  const shelfCovers: Record<string, string> = {};
  const favoriteShelves: string[] = [];
  const shelfTags: Record<string, string[]> = {};
  const shelfAltTitles: Record<string, string[]> = {};
  for (const row of shelfPrefsRes.results || []) {
    if (!row.shelf_key) continue;
    const shelfKey = toShelfAccessKey(row.shelf_key);
    if (row.cover_book_id) shelfCovers[shelfKey] = row.cover_book_id;
    if (row.is_favorite === 1) favoriteShelves.push(shelfKey);
    const parsedTags = parseShelfTagsJson(row.tags_json);
    if (parsedTags.length > 0) shelfTags[shelfKey] = parsedTags;
    const isGuestLockedShelf =
      isGuest &&
      accessSnapshot.restrictedKeys.has(shelfKey) &&
      !accessSnapshot.allowedRestrictedKeys.has(shelfKey);
    if (!isGuestLockedShelf) {
      const parsedAlt = parseShelfAltTitlesJson(row.alt_titles_json);
      if (parsedAlt.length > 0) shelfAltTitles[shelfKey] = parsedAlt;
    }
  }

  const guestReadyIds = new Set((guestPacksRes.results || []).map((r) => r.book_id));
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
      guest_ready: guestReadyIds.has(book.id),
      ...(isGuestLocked ? { guest_locked: true } : {}),
    };
  });
  const [weeklyPopular, catalogSnapshot, shelfRatings] = await Promise.all([
    computeWeeklyPopularBookIds(env.DB, rawBooks, 10),
    loadCatalogEnhancementsSnapshot(env.DB, auth, accessSnapshot, rawBooks).catch(() => ({
      planToReadShelves: [] as string[],
      planToReadBooks: [] as string[],
      collections: [],
    })),
    loadAllShelfRatingsMap(env.DB).catch(() => ({})),
  ]);

  const effectiveStorage = storage ?? {
    usedBytes: 0,
    limitBytes: getLimitBytes(env),
    remainingBytes: 0,
    bookCount: rawBooks.length,
  };

  return {
    books: sanitizedBooks,
    progress: progressMap,
    weeklyPopular,
    shelfCovers,
    favoriteShelves,
    shelfTags,
    shelfAltTitles,
    shelfRatings,
    planToReadShelves: catalogSnapshot.planToReadShelves,
    planToReadBooks: catalogSnapshot.planToReadBooks,
    collections: catalogSnapshot.collections,
    ...(auth.role === 'owner' ? { shelfAccess: accessSnapshot.ownerShelfAccess } : {}),
    storage: effectiveStorage,
    session: {
      role: auth.role,
      expiresAt: auth.expiresAt,
      ...(auth.watermarkLabel ? { watermarkLabel: auth.watermarkLabel } : {}),
    },
  };
}

async function deleteR2KeysInChunks(bucket: R2Bucket, keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const chunk of chunkArray(uniqueKeys, R2_DELETE_CHUNK_SIZE)) {
    await bucket.delete(chunk);
  }
}

export async function deleteSingleBook(env: Env, bookId: string) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);

  const existing = await env.DB.prepare('SELECT file_key, cover_key, shelf FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ file_key: string; cover_key: string | null; shelf: string }>();
  if (!existing) throw new HttpError('Không tìm thấy sách.', 404);

  const packRow = await env.DB.prepare('SELECT pack_key FROM book_guest_packs WHERE book_id = ?')
    .bind(bookId)
    .first<{ pack_key: string }>()
    .catch(() => null);

  await ensureShelfTagsSchema(env.DB).catch(() => undefined);

  // Xoá bản ghi D1 trước rồi mới dọn đối tượng R2 để tránh sách trỏ vào file đã mất nếu DB lỗi (vá M-4)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reading_progress WHERE book_id = ?').bind(bookId),
    env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId),
  ]);
  await env.DB.batch([
    env.DB.prepare('UPDATE shelf_prefs SET cover_book_id = NULL WHERE cover_book_id = ?').bind(bookId),
    env.DB.prepare(DELETE_EMPTY_SHELF_PREFS_SQL),
  ]).catch(() => undefined);
  await Promise.all([
    env.DB.prepare('DELETE FROM book_guest_packs WHERE book_id = ?').bind(bookId).run().catch(() => undefined),
    env.DB.prepare('DELETE FROM guest_reading_progress WHERE book_id = ?').bind(bookId).run().catch(() => undefined),
    env.DB.prepare('DELETE FROM book_bookmarks WHERE book_id = ?').bind(bookId).run().catch(() => undefined),
    env.DB.prepare('DELETE FROM book_highlights WHERE book_id = ?').bind(bookId).run().catch(() => undefined),
    env.DB.prepare('DELETE FROM user_plan_to_read_books WHERE book_id = ?').bind(bookId).run().catch(() => undefined),
    env.DB.prepare("DELETE FROM library_ratings WHERE target_type = 'book' AND target_key = ?").bind(bookId).run().catch(() => undefined),
    env.DB.batch(buildDeleteTargetCommentsStatements(env.DB, 'book', [bookId])).catch(() => undefined),
  ]);
  await cleanupOrphanShelves(env.DB, [toShelfAccessKey(existing.shelf)]);

  const keysToDelete = [
    existing.file_key,
    existing.cover_key,
    packRow?.pack_key,
    `guest-packs/${bookId}.pack`,
  ].filter((k): k is string => Boolean(k));
  await deleteR2KeysInChunks(env.BOOKS_BUCKET, keysToDelete);

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
  const affectedShelfKeys = new Set<string>();

  for (const chunk of idChunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    const [rows, packRows] = await Promise.all([
      env.DB.prepare(`SELECT id, file_key, cover_key, shelf FROM books WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .all<{ id: string; file_key: string; cover_key: string | null; shelf: string }>(),
      env.DB.prepare(`SELECT pack_key FROM book_guest_packs WHERE book_id IN (${placeholders})`)
        .bind(...chunk)
        .all<{ pack_key: string }>()
        .catch(() => ({ results: [] as Array<{ pack_key: string }> })),
    ]);
    for (const row of rows.results || []) {
      if (row.file_key) keysToDelete.push(row.file_key);
      if (row.cover_key) keysToDelete.push(row.cover_key);
      keysToDelete.push(`guest-packs/${row.id}.pack`);
      affectedShelfKeys.add(toShelfAccessKey(row.shelf));
    }
    for (const p of packRows.results || []) {
      if (p.pack_key) keysToDelete.push(p.pack_key);
    }
  }

  await ensureShelfTagsSchema(env.DB).catch(() => undefined);

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
      env.DB.prepare(DELETE_EMPTY_SHELF_PREFS_SQL),
    ]).catch(() => undefined);
    await Promise.all([
      env.DB.prepare(`DELETE FROM guest_reading_progress WHERE book_id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.prepare(`DELETE FROM book_guest_packs WHERE book_id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.prepare(`DELETE FROM book_bookmarks WHERE book_id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.prepare(`DELETE FROM book_highlights WHERE book_id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.prepare(`DELETE FROM user_plan_to_read_books WHERE book_id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.prepare(`DELETE FROM library_ratings WHERE target_type = 'book' AND target_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      env.DB.batch(buildDeleteTargetCommentsStatements(env.DB, 'book', chunk)).catch(() => undefined),
    ]);
  }

  if (affectedShelfKeys.size > 0) {
    await cleanupOrphanShelves(env.DB, Array.from(affectedShelfKeys));
  }

  await deleteR2KeysInChunks(env.BOOKS_BUCKET, keysToDelete);

  const storage = await getStorageStats(env);
  return { deletedIds: ids, storage };
}
