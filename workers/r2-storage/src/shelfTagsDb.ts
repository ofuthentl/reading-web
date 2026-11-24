import { HttpError } from './auth';
import { toShelfAccessKey } from './shelfAccessDb';

export const MAX_SHELF_TAGS = 20;
export const MAX_SHELF_TAG_LENGTH = 40;
export const MAX_SHELF_ALT_TITLES = 15;
export const MAX_SHELF_ALT_TITLE_LENGTH = 180;
const MAX_SHELF_NAME_LENGTH = 120;

export const DELETE_EMPTY_SHELF_PREFS_SQL =
  'DELETE FROM shelf_prefs WHERE cover_book_id IS NULL AND is_favorite = 0 AND tags_json IS NULL AND alt_titles_json IS NULL';

export const DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL =
  'DELETE FROM shelf_prefs WHERE shelf_key = ? AND cover_book_id IS NULL AND is_favorite = 0 AND tags_json IS NULL AND alt_titles_json IS NULL';

const verifiedTagsSchemaDbs = new WeakSet<D1Database>();

async function addShelfPrefsColumnIfMissing(
  db: D1Database,
  existingCols: Set<string>,
  columnName: string,
): Promise<void> {
  if (existingCols.has(columnName)) return;
  try {
    await db.prepare(`ALTER TABLE shelf_prefs ADD COLUMN ${columnName} TEXT`).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('duplicate column')) throw err;
  }
}

/**
 * Đảm bảo bảng `shelf_prefs` tồn tại và đã có cột `tags_json` + `alt_titles_json` (D-032 / D-036).
 * Cache theo instance `D1Database` bằng `WeakSet` để không chạy `PRAGMA` lặp lại.
 */
export async function ensureShelfTagsSchema(db: D1Database): Promise<void> {
  if (verifiedTagsSchemaDbs.has(db)) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS shelf_prefs (
         shelf_key TEXT PRIMARY KEY,
         cover_book_id TEXT,
         is_favorite INTEGER NOT NULL DEFAULT 0,
         tags_json TEXT,
         alt_titles_json TEXT,
         updated_at INTEGER NOT NULL
       )`,
    )
    .run();

  const cols = await db.prepare('PRAGMA table_info(shelf_prefs)').all<{ name: string }>();
  const existingCols = new Set((cols.results || []).map((col) => col.name));
  await addShelfPrefsColumnIfMissing(db, existingCols, 'tags_json');
  await addShelfPrefsColumnIfMissing(db, existingCols, 'alt_titles_json');

  verifiedTagsSchemaDbs.add(db);
}

export function normalizeTagKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function normalizeShelfTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    throw new HttpError('Danh sách thể loại không hợp lệ.', 400);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of rawTags) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim().replace(/\s+/g, ' ').slice(0, MAX_SHELF_TAG_LENGTH).trim();
    if (!cleaned) continue;
    const key = normalizeTagKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= MAX_SHELF_TAGS) break;
  }
  return result;
}

export function parseShelfTagsJson(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const cleaned = item.trim().replace(/\s+/g, ' ').slice(0, MAX_SHELF_TAG_LENGTH).trim();
      if (!cleaned) continue;
      const key = normalizeTagKey(cleaned);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
      if (result.length >= MAX_SHELF_TAGS) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function mergeShelfTagsJson(
  srcJson: string | null | undefined,
  destJson: string | null | undefined,
): string | null {
  const destTags = parseShelfTagsJson(destJson);
  const srcTags = parseShelfTagsJson(srcJson);
  if (destTags.length === 0 && srcTags.length === 0) return null;

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...destTags, ...srcTags]) {
    const key = normalizeTagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
    if (merged.length >= MAX_SHELF_TAGS) break;
  }
  return merged.length > 0 ? JSON.stringify(merged) : null;
}

export function normalizeShelfAltTitles(rawAltTitles: unknown): string[] {
  if (!Array.isArray(rawAltTitles)) {
    throw new HttpError('Danh sách tên gọi khác không hợp lệ.', 400);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of rawAltTitles) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, MAX_SHELF_ALT_TITLE_LENGTH)
      .trim();
    if (!cleaned) continue;
    const key = normalizeTagKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= MAX_SHELF_ALT_TITLES) break;
  }
  return result;
}

export function parseShelfAltTitlesJson(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const cleaned = item
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_SHELF_ALT_TITLE_LENGTH)
        .trim();
      if (!cleaned) continue;
      const key = normalizeTagKey(cleaned);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
      if (result.length >= MAX_SHELF_ALT_TITLES) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function mergeShelfAltTitlesJson(
  srcJson: string | null | undefined,
  destJson: string | null | undefined,
): string | null {
  const destAlt = parseShelfAltTitlesJson(destJson);
  const srcAlt = parseShelfAltTitlesJson(srcJson);
  if (destAlt.length === 0 && srcAlt.length === 0) return null;

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const title of [...destAlt, ...srcAlt]) {
    const key = normalizeTagKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(title);
    if (merged.length >= MAX_SHELF_ALT_TITLES) break;
  }
  return merged.length > 0 ? JSON.stringify(merged) : null;
}

export async function upsertShelfTags(
  db: D1Database,
  rawShelfName: unknown,
  rawTags: unknown,
) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  const tags = normalizeShelfTags(rawTags);
  const shelfKey = toShelfAccessKey(shelfName);
  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

  await ensureShelfTagsSchema(db);
  const updatedAt = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, tags_json, updated_at)
         VALUES (?, NULL, 0, ?, ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           tags_json = excluded.tags_json,
           updated_at = excluded.updated_at`,
      )
      .bind(shelfKey, tagsJson, updatedAt),
    db.prepare(DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, tags, updatedAt };
}

export async function upsertShelfAltTitles(
  db: D1Database,
  rawShelfName: unknown,
  rawAltTitles: unknown,
) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  const altTitles = normalizeShelfAltTitles(rawAltTitles);
  const shelfKey = toShelfAccessKey(shelfName);
  const altTitlesJson = altTitles.length > 0 ? JSON.stringify(altTitles) : null;

  await ensureShelfTagsSchema(db);
  const updatedAt = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, alt_titles_json, updated_at)
         VALUES (?, NULL, 0, ?, ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           alt_titles_json = excluded.alt_titles_json,
           updated_at = excluded.updated_at`,
      )
      .bind(shelfKey, altTitlesJson, updatedAt),
    db.prepare(DELETE_EMPTY_SHELF_PREFS_BY_KEY_SQL).bind(shelfKey),
  ]);

  return { ok: true, shelfKey, altTitles, updatedAt };
}
