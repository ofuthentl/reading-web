import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';

export type ShelfAccessMode = 'public' | 'restricted';

export interface ShelfAccessSummary {
  mode: 'restricted';
  allowedCount: number;
}

export interface ShelfAccessGrantUser {
  discordUserId: string;
  label: string | null;
  discordUsername?: string | null;
  createdAt: number;
}

export interface ShelfAccessRuleDetail {
  shelfKey: string;
  mode: 'restricted';
  updatedAt: number;
  allowedUsers: ShelfAccessGrantUser[];
}

const MAX_SHELF_KEY_LEN = 120;
const MAX_GRANTED_LABEL_LEN = 80;
const MAX_GRANTS_PER_SHELF = 500;
const D1_BATCH_CHUNK = 40;
const DISCORD_SNOWFLAKE_RE = /^\d{5,32}$/;

const ensuredAccessDbs = new WeakSet<D1Database>();

export async function ensureShelfAccessTables(db: D1Database): Promise<void> {
  if (ensuredAccessDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shelf_access_rules (
         shelf_key TEXT PRIMARY KEY,
         access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'restricted')),
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shelf_guest_grants (
         shelf_key TEXT NOT NULL,
         discord_user_id TEXT NOT NULL,
         granted_label TEXT,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (shelf_key, discord_user_id)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_shelf_grants_user
       ON shelf_guest_grants(discord_user_id)`,
    ),
  ]);
  ensuredAccessDbs.add(db);
}

export function toShelfAccessKey(shelfName: string | null | undefined): string {
  return (shelfName || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi');
}

export async function loadShelfAccessSnapshot(
  db: D1Database,
  auth: AuthContext,
): Promise<{
  restrictedKeys: Set<string>;
  allowedRestrictedKeys: Set<string>;
  ownerShelfAccess: Record<string, ShelfAccessSummary>;
}> {
  await ensureShelfAccessTables(db);
  const rulesRes = await db
    .prepare("SELECT shelf_key FROM shelf_access_rules WHERE access_mode = 'restricted'")
    .all<{ shelf_key: string }>();

  const restrictedKeys = new Set<string>();
  for (const row of rulesRes.results || []) {
    if (row.shelf_key) restrictedKeys.add(row.shelf_key);
  }

  const allowedRestrictedKeys = new Set<string>();
  const ownerShelfAccess: Record<string, ShelfAccessSummary> = {};

  if (restrictedKeys.size === 0) {
    return { restrictedKeys, allowedRestrictedKeys, ownerShelfAccess };
  }

  if (auth.role === 'owner') {
    const countsRes = await db
      .prepare('SELECT shelf_key, COUNT(*) AS cnt FROM shelf_guest_grants GROUP BY shelf_key')
      .all<{ shelf_key: string; cnt: number }>();
    const countMap = new Map<string, number>();
    for (const row of countsRes.results || []) {
      countMap.set(row.shelf_key, Number(row.cnt ?? 0));
    }
    for (const key of restrictedKeys) {
      ownerShelfAccess[key] = {
        mode: 'restricted',
        allowedCount: countMap.get(key) ?? 0,
      };
    }
  } else {
    const userGrantsRes = await db
      .prepare('SELECT shelf_key FROM shelf_guest_grants WHERE discord_user_id = ?')
      .bind(auth.userId)
      .all<{ shelf_key: string }>();
    for (const row of userGrantsRes.results || []) {
      if (restrictedKeys.has(row.shelf_key)) {
        allowedRestrictedKeys.add(row.shelf_key);
      }
    }
  }

  return { restrictedKeys, allowedRestrictedKeys, ownerShelfAccess };
}

export async function assertGuestBookAccess(
  db: D1Database,
  auth: AuthContext,
  bookId: string,
): Promise<void> {
  if (auth.role === 'owner') return;

  await ensureShelfAccessTables(db);
  const bookRow = await db
    .prepare('SELECT shelf FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ shelf: string }>();
  if (!bookRow) return;

  const shelfKey = toShelfAccessKey(bookRow.shelf);
  const ruleRow = await db
    .prepare('SELECT access_mode FROM shelf_access_rules WHERE shelf_key = ?')
    .bind(shelfKey)
    .first<{ access_mode: string }>();

  if (ruleRow?.access_mode !== 'restricted') return;

  const grantRow = await db
    .prepare('SELECT 1 AS ok FROM shelf_guest_grants WHERE shelf_key = ? AND discord_user_id = ?')
    .bind(shelfKey, auth.userId)
    .first<{ ok: number }>();

  if (!grantRow) {
    throw new HttpError(
      '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
      403,
    );
  }
}

export async function getAdminShelfAccessOverview(
  db: D1Database,
): Promise<{ rules: ShelfAccessRuleDetail[] }> {
  await ensureDiscordAccessTable(db);
  await ensureShelfAccessTables(db);

  const [rulesRes, grantsRes] = await Promise.all([
    db
      .prepare(
        "SELECT shelf_key, updated_at FROM shelf_access_rules WHERE access_mode = 'restricted' ORDER BY updated_at DESC",
      )
      .all<{ shelf_key: string; updated_at: number }>(),
    db
      .prepare(
        `SELECT g.shelf_key, g.discord_user_id, g.granted_label, g.created_at, da.discord_username
         FROM shelf_guest_grants g
         LEFT JOIN discord_access da ON da.discord_user_id = g.discord_user_id
         ORDER BY g.created_at ASC`,
      )
      .all<{
        shelf_key: string;
        discord_user_id: string;
        granted_label: string | null;
        created_at: number;
        discord_username: string | null;
      }>(),
  ]);

  const grantsByShelf = new Map<string, ShelfAccessGrantUser[]>();
  for (const row of grantsRes.results || []) {
    const list = grantsByShelf.get(row.shelf_key) || [];
    list.push({
      discordUserId: row.discord_user_id,
      label: row.granted_label ?? null,
      discordUsername: row.discord_username ?? null,
      createdAt: row.created_at,
    });
    grantsByShelf.set(row.shelf_key, list);
  }

  const rules: ShelfAccessRuleDetail[] = (rulesRes.results || []).map((rule) => ({
    shelfKey: rule.shelf_key,
    mode: 'restricted',
    updatedAt: rule.updated_at,
    allowedUsers: grantsByShelf.get(rule.shelf_key) || [],
  }));

  return { rules };
}

export async function putAdminShelfAccessConfig(db: D1Database, rawBody: unknown) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    shelfName?: unknown;
    mode?: unknown;
    allowedUsers?: unknown;
  } | null;

  const shelfName = typeof body?.shelfName === 'string' ? body.shelfName.trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_KEY_LEN) {
    throw new HttpError('Tên bộ sách không hợp lệ.', 400);
  }

  const mode = body?.mode;
  if (mode !== 'public' && mode !== 'restricted') {
    throw new HttpError('Chế độ phân quyền không hợp lệ.', 400);
  }

  const shelfKey = toShelfAccessKey(shelfName);
  await ensureShelfAccessTables(db);

  if (mode === 'public') {
    await db.batch([
      db.prepare('DELETE FROM shelf_guest_grants WHERE shelf_key = ?').bind(shelfKey),
      db.prepare('DELETE FROM shelf_access_rules WHERE shelf_key = ?').bind(shelfKey),
    ]);
    return {
      ok: true,
      shelfKey,
      summary: null as ShelfAccessSummary | null,
      allowedUsers: [] as ShelfAccessGrantUser[],
    };
  }

  const rawList = Array.isArray(body?.allowedUsers) ? body.allowedUsers : [];
  if (rawList.length > MAX_GRANTS_PER_SHELF) {
    throw new HttpError(`Tối đa ${MAX_GRANTS_PER_SHELF} thành viên cho mỗi bộ.`, 400);
  }

  const now = Date.now();
  const seen = new Set<string>();
  const deduped: ShelfAccessGrantUser[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { discordUserId?: unknown; label?: unknown };
    const uid = typeof candidate.discordUserId === 'string' ? candidate.discordUserId.trim() : '';
    if (!DISCORD_SNOWFLAKE_RE.test(uid)) {
      throw new HttpError(`Discord User ID "${uid || '(trống)'}" không hợp lệ (cần dãy số ID Discord).`, 400);
    }
    if (seen.has(uid)) continue;
    seen.add(uid);
    const label =
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim().slice(0, MAX_GRANTED_LABEL_LEN)
        : null;
    deduped.push({
      discordUserId: uid,
      label,
      createdAt: now,
    });
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at)
         VALUES (?, 'restricted', ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           access_mode = 'restricted',
           updated_at = excluded.updated_at`,
      )
      .bind(shelfKey, now),
    db.prepare('DELETE FROM shelf_guest_grants WHERE shelf_key = ?').bind(shelfKey),
  ]);

  for (let i = 0; i < deduped.length; i += D1_BATCH_CHUNK) {
    const chunk = deduped.slice(i, i + D1_BATCH_CHUNK);
    await db.batch(
      chunk.map((u) =>
        db
          .prepare(
            `INSERT INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(shelfKey, u.discordUserId, u.label, u.createdAt),
      ),
    );
  }

  return {
    ok: true,
    shelfKey,
    summary: {
      mode: 'restricted' as const,
      allowedCount: deduped.length,
    },
    allowedUsers: deduped,
  };
}

export async function mergeShelfAccessOnRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  if (!oldKey || !newKey || oldKey === newKey) return;
  await ensureShelfAccessTables(db);

  const existing = await db
    .prepare('SELECT shelf_key, access_mode FROM shelf_access_rules WHERE shelf_key IN (?, ?)')
    .bind(oldKey, newKey)
    .all<{ shelf_key: string; access_mode: string }>();

  const rows = existing.results || [];
  const anyRestricted = rows.some((r) => r.access_mode === 'restricted');

  if (!anyRestricted) {
    await db.batch([
      db.prepare('DELETE FROM shelf_guest_grants WHERE shelf_key = ?').bind(oldKey),
      db.prepare('DELETE FROM shelf_access_rules WHERE shelf_key = ?').bind(oldKey),
    ]);
    return;
  }

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at)
         VALUES (?, 'restricted', ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           access_mode = 'restricted',
           updated_at = excluded.updated_at`,
      )
      .bind(newKey, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at)
         SELECT ?, discord_user_id, granted_label, created_at
         FROM shelf_guest_grants
         WHERE shelf_key = ?`,
      )
      .bind(newKey, oldKey),
    db.prepare('DELETE FROM shelf_guest_grants WHERE shelf_key = ?').bind(oldKey),
    db.prepare('DELETE FROM shelf_access_rules WHERE shelf_key = ?').bind(oldKey),
  ]);
}
