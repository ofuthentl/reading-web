import {
  type BackupGrantUser,
  OWNER_BACKUP_APP_ID,
  OWNER_BACKUP_SCHEMA_VERSION,
  type OwnerBackupPayload,
} from './backupSchema';
import { ensureBookChapterAccessTables, toCanonicalChapterKey } from './bookChapterAccessDb';
import { ensureBookmarksTable } from './bookmarksDb';
import type { Env } from './booksDb';
import { ensureCatalogEnhancementsTables } from './catalogEnhancementsDb';
import { ensureHighlightsTable, type HighlightColor, VALID_HIGHLIGHT_COLORS } from './highlightsDb';
import { ensureProgressReadingTimeColumns, type ProgressRow } from './progressDb';
import { ensureShelfAccessTables, toShelfAccessKey } from './shelfAccessDb';
import { ensureShelfRelationsTable } from './shelfRelationsDb';
import { ensureShelfTagsSchema, parseShelfAltTitlesJson, parseShelfTagsJson } from './shelfTagsDb';

export async function ensureAllBackupTables(env: Env): Promise<void> {
  await Promise.all([
    ensureProgressReadingTimeColumns(env).catch(() => undefined),
    ensureBookmarksTable(env.DB).catch(() => undefined),
    ensureHighlightsTable(env.DB).catch(() => undefined),
    ensureShelfTagsSchema(env.DB).catch(() => undefined),
    ensureShelfRelationsTable(env.DB).catch(() => undefined),
    ensureCatalogEnhancementsTables(env.DB).catch(() => undefined),
    ensureShelfAccessTables(env.DB).catch(() => undefined),
    ensureBookChapterAccessTables(env.DB).catch(() => undefined),
  ]);
}

export async function exportOwnerBackup(env: Env): Promise<OwnerBackupPayload> {
  await ensureAllBackupTables(env);
  const [
    progressRes,
    bookmarksRes,
    highlightsRes,
    shelfPrefsRes,
    relationsRes,
    ptrShelvesRes,
    ptrBooksRes,
    collectionsRes,
    colShelvesRes,
    shelfAccessRes,
    shelfGrantsRes,
    bookAccessRes,
    bookGrantsRes,
    chapterAccessRes,
    chapterGrantsRes,
  ] = await Promise.all([
    env.DB.prepare('SELECT * FROM reading_progress ORDER BY updated_at DESC').all<ProgressRow>(),
    env.DB.prepare(
      "SELECT * FROM book_bookmarks WHERE user_scope = 'owner' ORDER BY created_at DESC",
    ).all<{
      id: string;
      book_id: string;
      chapter_id: string;
      chapter_index: number;
      chapter_title: string | null;
      scroll_ratio: number;
      label: string;
      note: string | null;
      created_at: number;
    }>(),
    env.DB.prepare(
      "SELECT * FROM book_highlights WHERE user_scope = 'owner' ORDER BY created_at DESC",
    ).all<{
      id: string;
      book_id: string;
      chapter_id: string;
      chapter_index: number;
      chapter_title: string | null;
      quote_text: string;
      note: string | null;
      color: string;
      locator_json: string | null;
      created_at: number;
    }>(),
    env.DB.prepare('SELECT * FROM shelf_prefs ORDER BY shelf_key ASC').all<{
      shelf_key: string;
      cover_book_id: string | null;
      is_favorite: number;
      tags_json: string | null;
      alt_titles_json: string | null;
      updated_at: number;
    }>(),
    env.DB.prepare('SELECT * FROM shelf_relations ORDER BY created_at ASC').all<{
      source_shelf_key: string;
      target_shelf_key: string;
      relation_type: 'sequel' | 'spinoff' | 'same_universe';
      created_at: number;
    }>(),
    env.DB.prepare(
      "SELECT shelf_key, created_at FROM user_plan_to_read WHERE user_scope = 'owner' ORDER BY created_at DESC",
    ).all<{ shelf_key: string; created_at: number }>(),
    env.DB.prepare(
      "SELECT book_id, created_at FROM user_plan_to_read_books WHERE user_scope = 'owner' ORDER BY created_at DESC",
    ).all<{ book_id: string; created_at: number }>(),
    env.DB.prepare('SELECT * FROM custom_collections ORDER BY sort_order ASC, created_at ASC').all<{
      id: string;
      name: string;
      description: string | null;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }>(),
    env.DB.prepare(
      'SELECT collection_id, shelf_key FROM collection_shelves ORDER BY sort_order ASC',
    ).all<{ collection_id: string; shelf_key: string }>(),
    env.DB.prepare('SELECT shelf_key, access_mode, updated_at FROM shelf_access_rules').all<{
      shelf_key: string;
      access_mode: 'public' | 'restricted';
      updated_at: number;
    }>(),
    env.DB.prepare(
      'SELECT shelf_key, discord_user_id, granted_label, created_at FROM shelf_guest_grants ORDER BY created_at ASC',
    ).all<{
      shelf_key: string;
      discord_user_id: string;
      granted_label: string | null;
      created_at: number;
    }>(),
    env.DB.prepare('SELECT book_id, access_mode, updated_at FROM book_access_rules').all<{
      book_id: string;
      access_mode: 'public' | 'restricted';
      updated_at: number;
    }>(),
    env.DB.prepare(
      'SELECT book_id, discord_user_id, granted_label, created_at FROM book_guest_grants ORDER BY created_at ASC',
    ).all<{
      book_id: string;
      discord_user_id: string;
      granted_label: string | null;
      created_at: number;
    }>(),
    env.DB.prepare('SELECT book_id, chapter_key, updated_at FROM chapter_access_rules').all<{
      book_id: string;
      chapter_key: string;
      updated_at: number;
    }>(),
    env.DB.prepare(
      'SELECT book_id, chapter_key, discord_user_id, granted_label, created_at FROM chapter_guest_grants ORDER BY created_at ASC',
    ).all<{
      book_id: string;
      chapter_key: string;
      discord_user_id: string;
      granted_label: string | null;
      created_at: number;
    }>(),
  ]);

  const colShelvesMap = new Map<string, string[]>();
  for (const row of colShelvesRes.results || []) {
    const arr = colShelvesMap.get(row.collection_id) ?? [];
    arr.push(toShelfAccessKey(row.shelf_key));
    colShelvesMap.set(row.collection_id, arr);
  }

  const shelfGrantsMap = new Map<string, BackupGrantUser[]>();
  for (const row of shelfGrantsRes.results || []) {
    const k = toShelfAccessKey(row.shelf_key);
    const arr = shelfGrantsMap.get(k) ?? [];
    arr.push({
      discordUserId: row.discord_user_id,
      label: row.granted_label ?? null,
      createdAt: Number(row.created_at ?? 0),
    });
    shelfGrantsMap.set(k, arr);
  }

  const bookGrantsMap = new Map<string, BackupGrantUser[]>();
  for (const row of bookGrantsRes.results || []) {
    const arr = bookGrantsMap.get(row.book_id) ?? [];
    arr.push({
      discordUserId: row.discord_user_id,
      label: row.granted_label ?? null,
      createdAt: Number(row.created_at ?? 0),
    });
    bookGrantsMap.set(row.book_id, arr);
  }

  const chGrantsMap = new Map<string, BackupGrantUser[]>();
  for (const row of chapterGrantsRes.results || []) {
    const pairKey = `${row.book_id}\0${toCanonicalChapterKey(row.chapter_key)}`;
    const arr = chGrantsMap.get(pairKey) ?? [];
    arr.push({
      discordUserId: row.discord_user_id,
      label: row.granted_label ?? null,
      createdAt: Number(row.created_at ?? 0),
    });
    chGrantsMap.set(pairKey, arr);
  }

  return {
    app: OWNER_BACKUP_APP_ID,
    schemaVersion: OWNER_BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      progress: (progressRes.results || []).map((row) => ({
        bookId: row.book_id,
        chapterId: row.chapter_id,
        chapterIndex: Number(row.chapter_index ?? 0),
        chapterTitle: row.chapter_title ?? null,
        totalChapters:
          typeof row.total_chapters === 'number' && row.total_chapters > 0
            ? row.total_chapters
            : null,
        scrollRatio: Number(row.scroll_ratio ?? 0),
        scrollTop: Number(row.scroll_top ?? 0),
        completed: row.completed === 1,
        bookPercent:
          typeof row.book_percent === 'number' && Number.isFinite(row.book_percent)
            ? row.book_percent
            : null,
        readingSeconds: Number(row.reading_seconds ?? 0),
        rereadCount: Number(row.reread_count ?? 0),
        updatedAt: Number(row.updated_at ?? 0),
      })),
      bookmarks: (bookmarksRes.results || []).map((row) => ({
        id: row.id,
        bookId: row.book_id,
        chapterId: row.chapter_id,
        chapterIndex: Number(row.chapter_index ?? 0),
        chapterTitle: row.chapter_title ?? null,
        scrollRatio: Number(row.scroll_ratio ?? 0),
        label: row.label,
        note: row.note ?? null,
        createdAt: Number(row.created_at ?? 0),
      })),
      highlights: (highlightsRes.results || []).map((row) => ({
        id: row.id,
        bookId: row.book_id,
        chapterId: row.chapter_id,
        chapterIndex: Number(row.chapter_index ?? 0),
        chapterTitle: row.chapter_title ?? null,
        quoteText: row.quote_text,
        note: row.note ?? null,
        color: VALID_HIGHLIGHT_COLORS.has(row.color as HighlightColor)
          ? (row.color as HighlightColor)
          : 'amber',
        locatorJson: row.locator_json ?? null,
        createdAt: Number(row.created_at ?? 0),
      })),
      shelfPrefs: (shelfPrefsRes.results || []).map((row) => ({
        shelfKey: toShelfAccessKey(row.shelf_key),
        coverBookId: row.cover_book_id ?? null,
        isFavorite: row.is_favorite === 1,
        tags: parseShelfTagsJson(row.tags_json),
        altTitles: parseShelfAltTitlesJson(row.alt_titles_json),
        updatedAt: Number(row.updated_at ?? 0),
      })),
      shelfRelations: (relationsRes.results || []).map((row) => ({
        sourceShelfKey: toShelfAccessKey(row.source_shelf_key),
        targetShelfKey: toShelfAccessKey(row.target_shelf_key),
        relationType: row.relation_type,
        createdAt: Number(row.created_at ?? 0),
      })),
      planToRead: {
        shelves: (ptrShelvesRes.results || []).map((row) => ({
          shelfKey: toShelfAccessKey(row.shelf_key),
          createdAt: Number(row.created_at ?? 0),
        })),
        books: (ptrBooksRes.results || []).map((row) => ({
          bookId: row.book_id,
          createdAt: Number(row.created_at ?? 0),
        })),
      },
      collections: (collectionsRes.results || []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        sortOrder: Number(row.sort_order ?? 0),
        shelfKeys: colShelvesMap.get(row.id) ?? [],
        createdAt: Number(row.created_at ?? 0),
        updatedAt: Number(row.updated_at ?? 0),
      })),
      accessRules: {
        shelves: (shelfAccessRes.results || []).map((row) => {
          const shelfKey = toShelfAccessKey(row.shelf_key);
          return {
            shelfKey,
            mode: row.access_mode,
            updatedAt: Number(row.updated_at ?? 0),
            grants: row.access_mode === 'restricted' ? (shelfGrantsMap.get(shelfKey) ?? []) : [],
          };
        }),
        books: (bookAccessRes.results || []).map((row) => ({
          bookId: row.book_id,
          mode: row.access_mode,
          updatedAt: Number(row.updated_at ?? 0),
          grants: row.access_mode === 'restricted' ? (bookGrantsMap.get(row.book_id) ?? []) : [],
        })),
        chapters: (chapterAccessRes.results || []).map((row) => {
          const chapterKey = toCanonicalChapterKey(row.chapter_key);
          return {
            bookId: row.book_id,
            chapterKey,
            updatedAt: Number(row.updated_at ?? 0),
            grants: chGrantsMap.get(`${row.book_id}\0${chapterKey}`) ?? [],
          };
        }),
      },
    },
  };
}
