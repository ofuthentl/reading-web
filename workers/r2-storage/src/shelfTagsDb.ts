import { HttpError } from './auth';

export const MAX_SHELF_TAGS = 20;
export const MAX_SHELF_TAG_LENGTH = 40;
const MAX_SHELF_NAME_LENGTH = 120;

const verifiedTagsSchemaDbs = new WeakSet<D1Database>();

/**
 * Đảm bảo bảng `shelf_prefs` tồn tại và đã có cột `tags_json` (D-032).
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
         updated_at INTEGER NOT NULL
       )`,
    )
    .run();

  const cols = await db.prepare('PRAGMA table_info(shelf_prefs)').all<{ name: string }>();
  const hasTagsCol = (cols.results || []).some((col) => col.name === 'tags_json');
  if (!hasTagsCol) {
    try {
      await db.prepare('ALTER TABLE shelf_prefs ADD COLUMN tags_json TEXT').run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('duplicate column')) throw err;
    }
  }

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

export async function upsertShelfTags(
  db: D1Database,
  rawShelfName: unknown,
  rawTags: unknown,
) {
  const shelfName = typeof rawShelfName === 'string' ? rawShelfName.trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên kệ sách không hợp lệ.', 400);
  }
  const tags = normalizeShelfTags(rawTags);
  const shelfKey = shelfName.toLocaleLowerCase('vi');
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
    db
      .prepare(
        'DELETE FROM shelf_prefs WHERE shelf_key = ? AND cover_book_id IS NULL AND is_favorite = 0 AND tags_json IS NULL',
      )
      .bind(shelfKey),
  ]);

  return { ok: true, shelfKey, tags, updatedAt };
}
