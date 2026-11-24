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
const MULTI_INSERT_ROWS_PER_STMT = 20; // 20 * 4 = 80 params (dưới ngưỡng 100 bind params của D1)
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
  return (shelfName || 'Kho chưa phân loại').normalize('NFC').trim().toLocaleLowerCase('vi');
}

export async function shelfExistsInBooks(db: D1Database, shelfKey: string): Promise<boolean> {
  const normalizedTarget = toShelfAccessKey(shelfKey);
  const rows = await db.prepare('SELECT DISTINCT shelf FROM books').all<{ shelf: string }>();
  return (rows.results || []).some(
    (row) => typeof row.shelf === 'string' && toShelfAccessKey(row.shelf) === normalizedTarget,
  );
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
    if (row.shelf_key) restrictedKeys.add(toShelfAccessKey(row.shelf_key));
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
      const normKey = toShelfAccessKey(row.shelf_key);
      countMap.set(normKey, (countMap.get(normKey) ?? 0) + Number(row.cnt ?? 0));
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
      const normKey = toShelfAccessKey(row.shelf_key);
      if (restrictedKeys.has(normKey)) {
        allowedRestrictedKeys.add(normKey);
      }
    }
  }

  return { restrictedKeys, allowedRestrictedKeys, ownerShelfAccess };
}

async function collectMatchingRawAccessKeys(
  db: D1Database,
  normalizedKey: string,
): Promise<{ ruleKeys: string[]; grantKeys: string[] }> {
  const [ruleRows, grantRows] = await Promise.all([
    db.prepare('SELECT shelf_key FROM shelf_access_rules').all<{ shelf_key: string }>(),
    db.prepare('SELECT DISTINCT shelf_key FROM shelf_guest_grants').all<{ shelf_key: string }>(),
  ]);
  const ruleKeys = Array.from(
    new Set(
      (ruleRows.results || [])
        .map((r) => r.shelf_key)
        .filter((k) => typeof k === 'string' && toShelfAccessKey(k) === normalizedKey),
    ),
  );
  const grantKeys = Array.from(
    new Set(
      (grantRows.results || [])
        .map((r) => r.shelf_key)
        .filter((k) => typeof k === 'string' && toShelfAccessKey(k) === normalizedKey),
    ),
  );
  return { ruleKeys, grantKeys };
}

export async function assertGuestShelfAccess(
  db: D1Database,
  auth: AuthContext,
  rawShelfName: string,
): Promise<void> {
  if (auth.role === 'owner') return;

  await ensureShelfAccessTables(db);
  const shelfKey = toShelfAccessKey(rawShelfName);
  const restrictedRows = await db
    .prepare("SELECT shelf_key FROM shelf_access_rules WHERE access_mode = 'restricted'")
    .all<{ shelf_key: string }>();

  const matchedRuleKeys = (restrictedRows.results || [])
    .map((r) => r.shelf_key)
    .filter((k) => typeof k === 'string' && toShelfAccessKey(k) === shelfKey);

  if (matchedRuleKeys.length === 0) return;

  const userGrants = await db
    .prepare('SELECT shelf_key FROM shelf_guest_grants WHERE discord_user_id = ?')
    .bind(auth.userId)
    .all<{ shelf_key: string }>();
  const isGranted = (userGrants.results || []).some(
    (g) => typeof g.shelf_key === 'string' && toShelfAccessKey(g.shelf_key) === shelfKey,
  );

  if (!isGranted) {
    throw new HttpError(
      '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
      403,
    );
  }
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

  await assertGuestShelfAccess(db, auth, bookRow.shelf);
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

  const grantsByShelf = new Map<string, Map<string, ShelfAccessGrantUser>>();
  for (const row of grantsRes.results || []) {
    const normKey = toShelfAccessKey(row.shelf_key);
    let userMap = grantsByShelf.get(normKey);
    if (!userMap) {
      userMap = new Map<string, ShelfAccessGrantUser>();
      grantsByShelf.set(normKey, userMap);
    }
    const existing = userMap.get(row.discord_user_id);
    if (!existing) {
      userMap.set(row.discord_user_id, {
        discordUserId: row.discord_user_id,
        label: row.granted_label ?? null,
        discordUsername: row.discord_username ?? null,
        createdAt: row.created_at,
      });
    } else if (!existing.label && row.granted_label) {
      existing.label = row.granted_label;
    }
  }

  const mergedRules = new Map<string, number>();
  for (const rule of rulesRes.results || []) {
    const normKey = toShelfAccessKey(rule.shelf_key);
    const prevUpdated = mergedRules.get(normKey) ?? 0;
    mergedRules.set(normKey, Math.max(prevUpdated, Number(rule.updated_at ?? 0)));
  }

  const rules: ShelfAccessRuleDetail[] = Array.from(mergedRules.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([normKey, updatedAt]) => ({
      shelfKey: normKey,
      mode: 'restricted',
      updatedAt,
      allowedUsers: Array.from(grantsByShelf.get(normKey)?.values() || []),
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
  const { ruleKeys, grantKeys } = await collectMatchingRawAccessKeys(db, shelfKey);
  const allRuleKeysToClear = Array.from(new Set([shelfKey, ...ruleKeys]));
  const allGrantKeysToClear = Array.from(new Set([shelfKey, ...grantKeys]));

  if (mode === 'public') {
    const gPlaceholders = allGrantKeysToClear.map(() => '?').join(', ');
    const rPlaceholders = allRuleKeysToClear.map(() => '?').join(', ');
    await db.batch([
      db.prepare(`DELETE FROM shelf_guest_grants WHERE shelf_key IN (${gPlaceholders})`).bind(...allGrantKeysToClear),
      db.prepare(`DELETE FROM shelf_access_rules WHERE shelf_key IN (${rPlaceholders})`).bind(...allRuleKeysToClear),
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

  // Gom toàn bộ UPSERT rule NFC chuẩn + xoá biến thể NFD cũ + DELETE grants cũ + INSERT grants mới vào 1 batch duy nhất
  const legacyRuleKeys = allRuleKeysToClear.filter((k) => k !== shelfKey);
  const gPlaceholders = allGrantKeysToClear.map(() => '?').join(', ');
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at)
         VALUES (?, 'restricted', ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           access_mode = 'restricted',
           updated_at = excluded.updated_at`,
      )
      .bind(shelfKey, now),
    db.prepare(`DELETE FROM shelf_guest_grants WHERE shelf_key IN (${gPlaceholders})`).bind(...allGrantKeysToClear),
  ];
  if (legacyRuleKeys.length > 0) {
    const legacyPlaceholders = legacyRuleKeys.map(() => '?').join(', ');
    statements.push(
      db.prepare(`DELETE FROM shelf_access_rules WHERE shelf_key IN (${legacyPlaceholders})`).bind(...legacyRuleKeys),
    );
  }

  for (let i = 0; i < deduped.length; i += MULTI_INSERT_ROWS_PER_STMT) {
    const chunk = deduped.slice(i, i + MULTI_INSERT_ROWS_PER_STMT);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const u of chunk) {
      params.push(shelfKey, u.discordUserId, u.label, u.createdAt);
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at)
           VALUES ${valuesSql}`,
        )
        .bind(...params),
    );
  }

  await db.batch(statements);

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

/**
 * Pha 1 khi đổi tên kệ (vá H-5): sao chép rule `restricted` và danh sách grants sang `newKey`
 * TRƯỚC khi `UPDATE books SET shelf = newName` để không bao giờ lộ cửa sổ công khai.
 */
export async function prepareShelfAccessForRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const normOld = toShelfAccessKey(oldKey);
  const normNew = toShelfAccessKey(newKey);
  if (!normOld || !normNew || normOld === normNew) return;
  await ensureShelfAccessTables(db);

  const [oldMatches, newMatches] = await Promise.all([
    collectMatchingRawAccessKeys(db, normOld),
    collectMatchingRawAccessKeys(db, normNew),
  ]);
  const checkRuleKeys = Array.from(new Set([normOld, normNew, ...oldMatches.ruleKeys, ...newMatches.ruleKeys]));
  const placeholders = checkRuleKeys.map(() => '?').join(', ');
  const existing = await db
    .prepare(`SELECT shelf_key, access_mode FROM shelf_access_rules WHERE shelf_key IN (${placeholders})`)
    .bind(...checkRuleKeys)
    .all<{ shelf_key: string; access_mode: string }>();

  const anyRestricted = (existing.results || []).some((r) => r.access_mode === 'restricted');
  if (!anyRestricted) return;

  const now = Date.now();
  const srcGrantKeys = Array.from(new Set([normOld, ...oldMatches.grantKeys]));
  const srcPlaceholders = srcGrantKeys.map(() => '?').join(', ');
  await db.batch([
    db
      .prepare(
        `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at)
         VALUES (?, 'restricted', ?)
         ON CONFLICT(shelf_key) DO UPDATE SET
           access_mode = 'restricted',
           updated_at = excluded.updated_at`,
      )
      .bind(normNew, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at)
         SELECT ?, discord_user_id, granted_label, created_at
         FROM shelf_guest_grants
         WHERE shelf_key IN (${srcPlaceholders})`,
      )
      .bind(normNew, ...srcGrantKeys),
  ]);
}

/**
 * Pha 2 khi đổi tên kệ (vá H-5): chỉ xoá rule & grants của `oldKey` (gồm cả biến thể NFD cũ) SAU khi toàn bộ sách đã đổi sang tên mới.
 */
export async function cleanupOldShelfAccessAfterRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const normOld = toShelfAccessKey(oldKey);
  const normNew = toShelfAccessKey(newKey);
  if (!normOld || !normNew || normOld === normNew) return;
  await ensureShelfAccessTables(db);
  const { ruleKeys, grantKeys } = await collectMatchingRawAccessKeys(db, normOld);
  const delRuleKeys = Array.from(new Set([normOld, ...ruleKeys]));
  const delGrantKeys = Array.from(new Set([normOld, ...grantKeys]));
  const gPlaceholders = delGrantKeys.map(() => '?').join(', ');
  const rPlaceholders = delRuleKeys.map(() => '?').join(', ');
  await db.batch([
    db.prepare(`DELETE FROM shelf_guest_grants WHERE shelf_key IN (${gPlaceholders})`).bind(...delGrantKeys),
    db.prepare(`DELETE FROM shelf_access_rules WHERE shelf_key IN (${rPlaceholders})`).bind(...delRuleKeys),
  ]);
}
