import { HttpError } from './auth';
import {
  BULK_D1_CHUNK_SIZE,
  type Env,
  MAX_SHELF_NAME_LENGTH,
  type ShelfPrefRow,
  isValidId,
} from './booksDb';
import { mergeCatalogRelationsOnShelfRename } from './catalogEnhancementsDb';
import { mergeCommunityRelationsOnShelfRename } from './communityDb';
import {
  cleanupOldShelfAccessAfterRename,
  prepareShelfAccessForRename,
  toShelfAccessKey,
} from './shelfAccessDb';
import {
  DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL,
  DELETE_EMPTY_SHELF_PREFS_SQL,
  ensureShelfTagsSchema,
  mergeShelfAltTitlesJson,
  mergeShelfTagsJson,
} from './shelfTagsDb';

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function cleanupOrphanShelves(
  db: D1Database,
  candidateShelfKeys: ReadonlyArray<string>,
): Promise<void> {
  const uniqueCandidates = Array.from(
    new Set(candidateShelfKeys.map((k) => toShelfAccessKey(k)).filter(Boolean)),
  );
  if (uniqueCandidates.length === 0) return;

  const activeRows = await db.prepare('SELECT DISTINCT shelf FROM books').all<{ shelf: string }>();
  const activeKeys = new Set(
    (activeRows.results || [])
      .map((r) => (typeof r.shelf === 'string' ? toShelfAccessKey(r.shelf) : ''))
      .filter(Boolean),
  );
  const orphanKeys = uniqueCandidates.filter((key) => !activeKeys.has(key));
  if (orphanKeys.length === 0) return;

  // QĐ-4 (4A): Dọn sạch dữ liệu cấp kệ khi kệ không còn tập sách nào trong kho
  for (const chunk of chunkItems(orphanKeys, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await Promise.all([
      db.prepare(`DELETE FROM shelf_prefs WHERE shelf_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM shelf_access_rules WHERE shelf_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM shelf_guest_grants WHERE shelf_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM user_plan_to_read WHERE shelf_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM collection_shelves WHERE shelf_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM library_ratings WHERE target_type = 'shelf' AND target_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
      db.prepare(`DELETE FROM library_comments WHERE target_type = 'shelf' AND target_key IN (${placeholders})`).bind(...chunk).run().catch(() => undefined),
    ]);
  }
}

export async function clearStaleShelfCoverForBook(
  db: D1Database,
  bookId: string,
  newShelfKey: string,
): Promise<void> {
  await ensureShelfTagsSchema(db).catch(() => undefined);
  await db
    .batch([
      db
        .prepare(
          'UPDATE shelf_prefs SET cover_book_id = NULL WHERE cover_book_id = ? AND shelf_key != ?',
        )
        .bind(bookId, newShelfKey),
      db.prepare(DELETE_EMPTY_SHELF_PREFS_SQL),
    ])
    .catch(() => undefined);
}

export async function bulkUpdateBooksShelf(env: Env, rawIds: unknown, rawShelf: unknown) {
  const ids = Array.isArray(rawIds)
    ? Array.from(
        new Set(rawIds.filter((id): id is string => typeof id === 'string' && isValidId(id))),
      )
    : [];
  if (ids.length === 0) throw new HttpError('Danh sách sách cần chuyển kệ trống.', 400);

  const shelf = typeof rawShelf === 'string' ? rawShelf.normalize('NFC').trim() : '';
  if (!shelf || shelf.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`, 400);
  }

  const targetShelfKey = toShelfAccessKey(shelf);
  const oldShelfKeys: string[] = [];
  for (const chunk of chunkItems(ids, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const prevRows = await env.DB.prepare(
      `SELECT DISTINCT shelf FROM books WHERE id IN (${placeholders})`,
    )
      .bind(...chunk)
      .all<{ shelf: string }>();
    for (const r of prevRows.results || []) {
      const k = toShelfAccessKey(r.shelf);
      if (k !== targetShelfKey) oldShelfKeys.push(k);
    }
  }

  const statements: D1PreparedStatement[] = [];
  for (const chunk of chunkItems(ids, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    statements.push(
      env.DB.prepare(`UPDATE books SET shelf = ? WHERE id IN (${placeholders})`).bind(
        shelf,
        ...chunk,
      ),
    );
  }
  await env.DB.batch(statements);

  await ensureShelfTagsSchema(env.DB).catch(() => undefined);
  for (const chunk of chunkItems(ids, BULK_D1_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE shelf_prefs SET cover_book_id = NULL WHERE cover_book_id IN (${placeholders}) AND shelf_key != ?`,
      ).bind(...chunk, targetShelfKey),
      env.DB.prepare(DELETE_EMPTY_SHELF_PREFS_SQL),
    ]).catch(() => undefined);
  }

  if (oldShelfKeys.length > 0) {
    await cleanupOrphanShelves(env.DB, oldShelfKeys);
  }

  return { updatedIds: ids, shelf };
}

export async function renameShelfCaseInsensitive(
  env: Env,
  rawOldName: unknown,
  rawNewName: unknown,
) {
  const oldName = typeof rawOldName === 'string' ? rawOldName.normalize('NFC').trim() : '';
  const newName = typeof rawNewName === 'string' ? rawNewName.normalize('NFC').trim() : '';
  if (!oldName || !newName || newName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }

  const targetKey = toShelfAccessKey(oldName);
  const newKey = toShelfAccessKey(newName);

  // Pha 1 (vá H-5): sao chép rule giới hạn & grants sang tên mới TRƯỚC khi đổi tên sách
  if (targetKey !== newKey) {
    await prepareShelfAccessForRename(env.DB, targetKey, newKey);
  }

  // Đồng nhất hoa/thường cả kệ cũ lẫn các biến thể hoa/thường sẵn có của kệ đích khi gộp kệ
  const rows = await env.DB.prepare('SELECT DISTINCT shelf FROM books').all<{ shelf: string }>();
  const matchedShelves = (rows.results || [])
    .map((r) => r.shelf)
    .filter((s) => {
      if (typeof s !== 'string') return false;
      const key = toShelfAccessKey(s);
      return key === targetKey || (key === newKey && s !== newName);
    });

  if (matchedShelves.length === 0) {
    await env.DB.prepare('UPDATE books SET shelf = ? WHERE shelf = ?').bind(newName, oldName).run();
  } else {
    const statements: D1PreparedStatement[] = [];
    for (const chunk of chunkItems(matchedShelves, BULK_D1_CHUNK_SIZE)) {
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
    await ensureShelfTagsSchema(env.DB);
    const existingRows = await env.DB.prepare(
      'SELECT shelf_key, cover_book_id, is_favorite, tags_json, alt_titles_json FROM shelf_prefs WHERE shelf_key IN (?, ?)',
    )
      .bind(targetKey, newKey)
      .all<
        Pick<
          ShelfPrefRow,
          'shelf_key' | 'cover_book_id' | 'is_favorite' | 'tags_json' | 'alt_titles_json'
        >
      >();
    const list = existingRows.results || [];
    const src = list.find((r) => toShelfAccessKey(r.shelf_key) === targetKey);
    if (src) {
      const dest = list.find((r) => toShelfAccessKey(r.shelf_key) === newKey);
      const mergedCover = dest?.cover_book_id || src.cover_book_id || null;
      const mergedFav = dest?.is_favorite === 1 || src.is_favorite === 1 ? 1 : 0;
      const mergedTags = mergeShelfTagsJson(src.tags_json, dest?.tags_json);
      const mergedAltTitles = mergeShelfAltTitlesJson(src.alt_titles_json, dest?.alt_titles_json);
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, tags_json, alt_titles_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(shelf_key) DO UPDATE SET
             cover_book_id = excluded.cover_book_id,
             is_favorite = excluded.is_favorite,
             tags_json = excluded.tags_json,
             alt_titles_json = excluded.alt_titles_json,
             updated_at = excluded.updated_at`,
        ).bind(newKey, mergedCover, mergedFav, mergedTags, mergedAltTitles, Date.now()),
        env.DB.prepare('DELETE FROM shelf_prefs WHERE shelf_key = ?').bind(src.shelf_key),
      ]);
    }

    await mergeCatalogRelationsOnShelfRename(env.DB, targetKey, newKey);
    await mergeCommunityRelationsOnShelfRename(env.DB, targetKey, newKey);

    // Pha 2 (vá H-5): chỉ xoá rule/grants cũ sau khi toàn bộ sách đã đổi sang tên mới
    await cleanupOldShelfAccessAfterRename(env.DB, targetKey, newKey);
  }

  return { ok: true };
}

export async function upsertShelfCover(env: Env, rawShelfName: unknown, rawBookId: unknown) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  const shelfKey = toShelfAccessKey(shelfName);
  const nextBookId = rawBookId === null || rawBookId === '' ? null : rawBookId;
  if (nextBookId !== null) {
    if (typeof nextBookId !== 'string' || !isValidId(nextBookId)) {
      throw new HttpError('ID sách làm ảnh bìa không hợp lệ.', 400);
    }
    const bookRow = await env.DB.prepare('SELECT id, shelf FROM books WHERE id = ?')
      .bind(nextBookId)
      .first<{ id: string; shelf: string }>();
    if (!bookRow) {
      throw new HttpError('Không tìm thấy tập sách được chọn làm ảnh bìa.', 404);
    }
    if (toShelfAccessKey(bookRow.shelf) !== shelfKey) {
      throw new HttpError('Tập sách được chọn không thuộc kệ sách này.', 400);
    }
  }

  await ensureShelfTagsSchema(env.DB);
  const updatedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(shelf_key) DO UPDATE SET
         cover_book_id = excluded.cover_book_id,
         updated_at = excluded.updated_at`,
    ).bind(shelfKey, nextBookId, updatedAt),
    env.DB.prepare(DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, bookId: nextBookId, updatedAt };
}

export async function upsertShelfFavorite(env: Env, rawShelfName: unknown, rawFavorite: unknown) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  if (typeof rawFavorite !== 'boolean') {
    throw new HttpError('Trạng thái yêu thích không hợp lệ.', 400);
  }
  const shelfKey = toShelfAccessKey(shelfName);
  const isFav = rawFavorite ? 1 : 0;

  await ensureShelfTagsSchema(env.DB);
  const updatedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, updated_at)
       VALUES (?, NULL, ?, ?)
       ON CONFLICT(shelf_key) DO UPDATE SET
         is_favorite = excluded.is_favorite,
         updated_at = excluded.updated_at`,
    ).bind(shelfKey, isFav, updatedAt),
    env.DB.prepare(DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, favorite: rawFavorite, updatedAt };
}
