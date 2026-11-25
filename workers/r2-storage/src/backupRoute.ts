import { HttpError } from './auth';
import { ensureAllBackupTables, exportOwnerBackup } from './backupExport';
import {
  MAX_BACKUP_JSON_BYTES,
  type OwnerBackupImportMode,
  validateOwnerBackupPayload,
} from './backupSchema';
import type { Env } from './booksDb';

export { exportOwnerBackup };

const D1_BATCH_STMT_CHUNK = 40;

async function executeStatementsInBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  for (let i = 0; i < statements.length; i += D1_BATCH_STMT_CHUNK) {
    const chunk = statements.slice(i, i + D1_BATCH_STMT_CHUNK);
    if (chunk.length > 0) await db.batch(chunk);
  }
}

export async function importOwnerBackupData(
  env: Env,
  rawBackup: unknown,
  mode: OwnerBackupImportMode = 'merge',
) {
  const backup = validateOwnerBackupPayload(rawBackup);
  await ensureAllBackupTables(env);

  const booksRows = await env.DB.prepare('SELECT id FROM books').all<{ id: string }>();
  const existingBookIds = new Set((booksRows.results || []).map((r) => r.id));

  let skippedMissingBooks = 0;
  const keepExistingBook = <T extends { bookId: string }>(items: readonly T[]): T[] =>
    items.filter((item) => {
      if (existingBookIds.has(item.bookId)) return true;
      skippedMissingBooks += 1;
      return false;
    });

  const validProgress = keepExistingBook(backup.data.progress);
  const validBookmarks = keepExistingBook(backup.data.bookmarks);
  const validHighlights = keepExistingBook(backup.data.highlights);
  const validPtrBooks = keepExistingBook(backup.data.planToRead.books);
  const validBookAccess = keepExistingBook(backup.data.accessRules.books);
  const validChapterAccess = keepExistingBook(backup.data.accessRules.chapters);

  const db = env.DB;
  const statements: D1PreparedStatement[] = [];

  if (mode === 'replace') {
    statements.push(
      db.prepare('DELETE FROM reading_progress'),
      db.prepare("DELETE FROM book_bookmarks WHERE user_scope = 'owner'"),
      db.prepare("DELETE FROM book_highlights WHERE user_scope = 'owner'"),
      db.prepare('DELETE FROM shelf_prefs'),
      db.prepare('DELETE FROM shelf_relations'),
      db.prepare("DELETE FROM user_plan_to_read WHERE user_scope = 'owner'"),
      db.prepare("DELETE FROM user_plan_to_read_books WHERE user_scope = 'owner'"),
      db.prepare('DELETE FROM collection_shelves'),
      db.prepare('DELETE FROM custom_collections'),
      db.prepare('DELETE FROM shelf_guest_grants'),
      db.prepare('DELETE FROM shelf_access_rules'),
      db.prepare('DELETE FROM book_guest_grants'),
      db.prepare('DELETE FROM book_access_rules'),
      db.prepare('DELETE FROM chapter_guest_grants'),
      db.prepare('DELETE FROM chapter_access_rules'),
    );
  }

  // Progress (12 params/row -> 7 rows = 84 params < 100)
  for (let i = 0; i < validProgress.length; i += 7) {
    const chunk = validProgress.slice(i, i + 7);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const p of chunk) {
      params.push(
        p.bookId,
        p.chapterId,
        p.chapterIndex,
        p.chapterTitle,
        p.totalChapters,
        p.scrollRatio,
        p.scrollTop,
        p.completed ? 1 : 0,
        p.bookPercent,
        p.readingSeconds,
        p.rereadCount,
        p.updatedAt,
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO reading_progress
             (book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, book_percent, reading_seconds, reread_count, updated_at)
           VALUES ${valuesSql}
           ON CONFLICT(book_id) DO UPDATE SET
             chapter_id = excluded.chapter_id, chapter_index = excluded.chapter_index,
             chapter_title = excluded.chapter_title, total_chapters = excluded.total_chapters,
             scroll_ratio = excluded.scroll_ratio, scroll_top = excluded.scroll_top,
             completed = excluded.completed, book_percent = excluded.book_percent,
             reading_seconds = excluded.reading_seconds, reread_count = excluded.reread_count,
             updated_at = excluded.updated_at`,
        )
        .bind(...params),
    );
  }

  // Bookmarks (9 params + literal 'owner' -> 8 rows = 72 params)
  for (let i = 0; i < validBookmarks.length; i += 8) {
    const chunk = validBookmarks.slice(i, i + 8);
    const valuesSql = chunk.map(() => "(?, 'owner', ?, ?, ?, ?, ?, ?, ?, ?)").join(', ');
    const params: unknown[] = [];
    for (const b of chunk) {
      params.push(
        b.id,
        b.bookId,
        b.chapterId,
        b.chapterIndex,
        b.chapterTitle,
        b.scrollRatio,
        b.label,
        b.note,
        b.createdAt,
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO book_bookmarks
             (id, user_scope, book_id, chapter_id, chapter_index, chapter_title, scroll_ratio, label, note, created_at)
           VALUES ${valuesSql}
           ON CONFLICT(id) DO UPDATE SET
             chapter_id = excluded.chapter_id, chapter_index = excluded.chapter_index,
             chapter_title = excluded.chapter_title, scroll_ratio = excluded.scroll_ratio,
             label = excluded.label, note = excluded.note, created_at = excluded.created_at
           WHERE book_bookmarks.user_scope = 'owner'`,
        )
        .bind(...params),
    );
  }

  // Highlights (10 params + literal 'owner' -> 8 rows = 80 params)
  for (let i = 0; i < validHighlights.length; i += 8) {
    const chunk = validHighlights.slice(i, i + 8);
    const valuesSql = chunk.map(() => "(?, 'owner', ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(', ');
    const params: unknown[] = [];
    for (const h of chunk) {
      params.push(
        h.id,
        h.bookId,
        h.chapterId,
        h.chapterIndex,
        h.chapterTitle,
        h.quoteText,
        h.note,
        h.color,
        h.locatorJson,
        h.createdAt,
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO book_highlights
             (id, user_scope, book_id, chapter_id, chapter_index, chapter_title, quote_text, note, color, locator_json, created_at)
           VALUES ${valuesSql}
           ON CONFLICT(id) DO UPDATE SET
             chapter_id = excluded.chapter_id, chapter_index = excluded.chapter_index,
             chapter_title = excluded.chapter_title, quote_text = excluded.quote_text,
             note = excluded.note, color = excluded.color, locator_json = excluded.locator_json
           WHERE book_highlights.user_scope = 'owner'`,
        )
        .bind(...params),
    );
  }

  // Shelf Prefs (6 params/row -> 14 rows = 84 params)
  for (let i = 0; i < backup.data.shelfPrefs.length; i += 14) {
    const chunk = backup.data.shelfPrefs.slice(i, i + 14);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const pref of chunk) {
      const safeCoverId =
        pref.coverBookId && existingBookIds.has(pref.coverBookId) ? pref.coverBookId : null;
      params.push(
        pref.shelfKey,
        safeCoverId,
        pref.isFavorite ? 1 : 0,
        pref.tags.length > 0 ? JSON.stringify(pref.tags) : null,
        pref.altTitles.length > 0 ? JSON.stringify(pref.altTitles) : null,
        pref.updatedAt,
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, tags_json, alt_titles_json, updated_at)
           VALUES ${valuesSql}
           ON CONFLICT(shelf_key) DO UPDATE SET
             cover_book_id = excluded.cover_book_id, is_favorite = excluded.is_favorite,
             tags_json = excluded.tags_json, alt_titles_json = excluded.alt_titles_json,
             updated_at = excluded.updated_at`,
        )
        .bind(...params),
    );
  }

  // Shelf Relations (4 params/row -> 20 rows = 80 params)
  for (let i = 0; i < backup.data.shelfRelations.length; i += 20) {
    const chunk = backup.data.shelfRelations.slice(i, i + 20);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const rel of chunk) {
      params.push(rel.sourceShelfKey, rel.targetShelfKey, rel.relationType, rel.createdAt);
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO shelf_relations (source_shelf_key, target_shelf_key, relation_type, created_at)
           VALUES ${valuesSql}
           ON CONFLICT(source_shelf_key, target_shelf_key) DO UPDATE SET
             relation_type = excluded.relation_type, created_at = excluded.created_at`,
        )
        .bind(...params),
    );
  }

  // Plan to Read (2 params + 'owner' -> 30 rows = 60 params)
  for (let i = 0; i < backup.data.planToRead.shelves.length; i += 30) {
    const chunk = backup.data.planToRead.shelves.slice(i, i + 30);
    const valuesSql = chunk.map(() => "('owner', ?, ?)").join(', ');
    const params: unknown[] = [];
    for (const item of chunk) params.push(item.shelfKey, item.createdAt);
    statements.push(
      db
        .prepare(
          `INSERT INTO user_plan_to_read (user_scope, shelf_key, created_at)
           VALUES ${valuesSql}
           ON CONFLICT(user_scope, shelf_key) DO UPDATE SET created_at = excluded.created_at`,
        )
        .bind(...params),
    );
  }
  for (let i = 0; i < validPtrBooks.length; i += 30) {
    const chunk = validPtrBooks.slice(i, i + 30);
    const valuesSql = chunk.map(() => "('owner', ?, ?)").join(', ');
    const params: unknown[] = [];
    for (const item of chunk) params.push(item.bookId, item.createdAt);
    statements.push(
      db
        .prepare(
          `INSERT INTO user_plan_to_read_books (user_scope, book_id, created_at)
           VALUES ${valuesSql}
           ON CONFLICT(user_scope, book_id) DO UPDATE SET created_at = excluded.created_at`,
        )
        .bind(...params),
    );
  }

  // Collections + collection_shelves
  for (const col of backup.data.collections) {
    statements.push(
      db
        .prepare(
          `INSERT INTO custom_collections (id, name, description, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, description = excluded.description,
             sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        )
        .bind(col.id, col.name, col.description, col.sortOrder, col.createdAt, col.updatedAt),
    );
    if (mode === 'merge') {
      statements.push(
        db.prepare('DELETE FROM collection_shelves WHERE collection_id = ?').bind(col.id),
      );
    }
    for (let i = 0; i < col.shelfKeys.length; i += 25) {
      const chunk = col.shelfKeys.slice(i, i + 25);
      const valuesSql = chunk.map(() => '(?, ?, ?)').join(', ');
      const params: unknown[] = [];
      chunk.forEach((key, offset) => params.push(col.id, key, i + offset));
      statements.push(
        db
          .prepare(
            `INSERT INTO collection_shelves (collection_id, shelf_key, sort_order) VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }
  }

  // Access Rules (Shelf, Book, Chapter)
  for (const rule of backup.data.accessRules.shelves) {
    if (mode === 'merge') {
      statements.push(
        db.prepare('DELETE FROM shelf_guest_grants WHERE shelf_key = ?').bind(rule.shelfKey),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(shelf_key) DO UPDATE SET
             access_mode = excluded.access_mode, updated_at = excluded.updated_at`,
        )
        .bind(rule.shelfKey, rule.mode, rule.updatedAt),
    );
    for (let i = 0; i < rule.grants.length; i += 20) {
      const chunk = rule.grants.slice(i, i + 20);
      const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const g of chunk) params.push(rule.shelfKey, g.discordUserId, g.label, g.createdAt);
      statements.push(
        db
          .prepare(
            `INSERT INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at) VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }
  }

  for (const rule of validBookAccess) {
    if (mode === 'merge') {
      statements.push(
        db.prepare('DELETE FROM book_guest_grants WHERE book_id = ?').bind(rule.bookId),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO book_access_rules (book_id, access_mode, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(book_id) DO UPDATE SET
             access_mode = excluded.access_mode, updated_at = excluded.updated_at`,
        )
        .bind(rule.bookId, rule.mode, rule.updatedAt),
    );
    for (let i = 0; i < rule.grants.length; i += 20) {
      const chunk = rule.grants.slice(i, i + 20);
      const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const g of chunk) params.push(rule.bookId, g.discordUserId, g.label, g.createdAt);
      statements.push(
        db
          .prepare(
            `INSERT INTO book_guest_grants (book_id, discord_user_id, granted_label, created_at) VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }
  }

  for (const rule of validChapterAccess) {
    if (mode === 'merge') {
      statements.push(
        db
          .prepare('DELETE FROM chapter_guest_grants WHERE book_id = ? AND chapter_key = ?')
          .bind(rule.bookId, rule.chapterKey),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO chapter_access_rules (book_id, chapter_key, access_mode, updated_at)
           VALUES (?, ?, 'restricted', ?)
           ON CONFLICT(book_id, chapter_key) DO UPDATE SET updated_at = excluded.updated_at`,
        )
        .bind(rule.bookId, rule.chapterKey, rule.updatedAt),
    );
    for (let i = 0; i < rule.grants.length; i += 15) {
      const chunk = rule.grants.slice(i, i + 15);
      const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const g of chunk) {
        params.push(rule.bookId, rule.chapterKey, g.discordUserId, g.label, g.createdAt);
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO chapter_guest_grants (book_id, chapter_key, discord_user_id, granted_label, created_at) VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }
  }

  await executeStatementsInBatches(db, statements);

  return {
    ok: true,
    mode,
    skippedMissingBooks,
    restored: {
      progress: validProgress.length,
      bookmarks: validBookmarks.length,
      highlights: validHighlights.length,
      shelfPrefs: backup.data.shelfPrefs.length,
      shelfRelations: backup.data.shelfRelations.length,
      planToReadShelves: backup.data.planToRead.shelves.length,
      planToReadBooks: validPtrBooks.length,
      collections: backup.data.collections.length,
      shelfAccessRules: backup.data.accessRules.shelves.length,
      bookAccessRules: validBookAccess.length,
      chapterAccessRules: validChapterAccess.length,
    },
  };
}

export async function handleImportOwnerBackupRequest(env: Env, request: Request) {
  const declaredLen = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BACKUP_JSON_BYTES) {
    throw new HttpError('Tệp sao lưu JSON vượt giới hạn tối đa 5 MB.', 413);
  }
  const rawText = await request.text();
  if (
    rawText.length === 0 ||
    new TextEncoder().encode(rawText).byteLength > MAX_BACKUP_JSON_BYTES
  ) {
    throw new HttpError('Kích thước tệp sao lưu JSON không hợp lệ (tối đa 5 MB).', 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new HttpError('Không thể giải mã nội dung JSON của bản sao lưu.', 400);
  }

  const envelope =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { mode?: unknown; backup?: unknown })
      : null;
  const mode: OwnerBackupImportMode = envelope?.mode === 'replace' ? 'replace' : 'merge';
  const payload = envelope?.backup !== undefined ? envelope.backup : parsed;
  return importOwnerBackupData(env, payload, mode);
}
