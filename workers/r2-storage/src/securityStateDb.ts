export const OWNER_MIN_IAT_CACHE_TTL_MS = 15_000;

interface CachedMinIatEntry {
  minIat: number;
  fetchedAt: number;
}

const ensuredSecurityStateDbs = new WeakSet<D1Database>();
const minIatCacheByDb = new WeakMap<D1Database, CachedMinIatEntry>();

export async function ensureSecurityStateTable(db: D1Database): Promise<void> {
  if (ensuredSecurityStateDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS app_security_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         owner_min_iat INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL DEFAULT 0
       )`,
    ),
    db.prepare(
      'INSERT OR IGNORE INTO app_security_state (id, owner_min_iat, updated_at) VALUES (1, 0, 0)',
    ),
  ]);
  ensuredSecurityStateDbs.add(db);
}

export function clearOwnerMinIatCache(db?: D1Database): void {
  if (db) {
    minIatCacheByDb.delete(db);
  }
}

export async function getOwnerMinIat(db: D1Database, nowMs = Date.now()): Promise<number> {
  const cached = minIatCacheByDb.get(db);
  if (cached && nowMs - cached.fetchedAt < OWNER_MIN_IAT_CACHE_TTL_MS) {
    return cached.minIat;
  }

  await ensureSecurityStateTable(db);
  const row = await db
    .prepare('SELECT owner_min_iat FROM app_security_state WHERE id = 1')
    .first<{ owner_min_iat: number | null }>();
  const minIat =
    typeof row?.owner_min_iat === 'number' && Number.isFinite(row.owner_min_iat)
      ? Math.max(0, Math.floor(row.owner_min_iat))
      : 0;

  minIatCacheByDb.set(db, { minIat, fetchedAt: nowMs });
  return minIat;
}

/**
 * Đẩy mốc `owner_min_iat` tăng nghiêm ngặt lên sau thời điểm hiện tại (`nowMs + 1`)
 * để mọi token Admin đã cấp trước đó (`iat < owner_min_iat`) đều bị từ chối `401` ngay lập tức,
 * đồng thời cập nhật nóng cache của isolate hiện tại.
 */
export async function revokeOwnerSessionsBefore(
  db: D1Database,
  nowMs = Date.now(),
): Promise<number> {
  await ensureSecurityStateTable(db);
  const existing = await db
    .prepare('SELECT owner_min_iat FROM app_security_state WHERE id = 1')
    .first<{ owner_min_iat: number | null }>();
  const prevMinIat =
    typeof existing?.owner_min_iat === 'number' && Number.isFinite(existing.owner_min_iat)
      ? Math.max(0, Math.floor(existing.owner_min_iat))
      : 0;
  const nextMinIat = Math.max(Math.floor(nowMs) + 1, prevMinIat + 1);

  await db
    .prepare(
      `INSERT INTO app_security_state (id, owner_min_iat, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         owner_min_iat = MAX(owner_min_iat, excluded.owner_min_iat),
         updated_at = excluded.updated_at`,
    )
    .bind(nextMinIat, Math.floor(nowMs))
    .run();

  minIatCacheByDb.set(db, { minIat: nextMinIat, fetchedAt: Math.floor(nowMs) });
  return nextMinIat;
}
