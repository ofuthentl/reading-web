import { type AuthContext, HttpError, requireOwner } from './auth';
import { type BookRow, MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import { loadShelfAccessSnapshot, toShelfAccessKey } from './shelfAccessDb';
import { upsertShelfAltTitles } from './shelfTagsDb';

export interface CustomCollectionDto {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  shelfKeys: string[];
  createdAt: number;
  updatedAt: number;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface CollectionShelfRow {
  collection_id: string;
  shelf_key: string;
  sort_order: number;
}

const MAX_COLLECTION_NAME_LENGTH = 80;
const MAX_COLLECTION_DESC_LENGTH = 300;
const MAX_COLLECTIONS_COUNT = 60;
const MAX_SHELVES_PER_COLLECTION = 200;
const MULTI_INSERT_SHELVES_PER_STMT = 25; // 25 * 3 = 75 bind params (< 100 limit of D1)

const ensuredCatalogDbs = new WeakSet<D1Database>();

export async function ensureCatalogEnhancementsTables(db: D1Database): Promise<void> {
  if (ensuredCatalogDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user_plan_to_read (
         user_scope TEXT NOT NULL,
         shelf_key TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (user_scope, shelf_key)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_plan_to_read_user
       ON user_plan_to_read(user_scope, created_at DESC)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS custom_collections (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         description TEXT,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS collection_shelves (
         collection_id TEXT NOT NULL REFERENCES custom_collections(id) ON DELETE CASCADE,
         shelf_key TEXT NOT NULL,
         sort_order INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (collection_id, shelf_key)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_collection_shelves_shelf
       ON collection_shelves(shelf_key)`,
    ),
  ]);
  ensuredCatalogDbs.add(db);
}

export function resolveCatalogUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

function generateCollectionId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `col_${Date.now().toString(36)}_${rand}`;
}

function sanitizeShelfKeysList(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) {
    throw new HttpError('Danh sách kệ trong bộ sưu tập không hợp lệ.', 400);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const trimmed = item.normalize('NFC').trim();
    if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) continue;
    const key = trimmed.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= MAX_SHELVES_PER_COLLECTION) break;
  }
  return result;
}

function isShelfLockedForGuest(
  shelfKey: string,
  restrictedKeys: ReadonlySet<string>,
  allowedRestrictedKeys: ReadonlySet<string>,
): boolean {
  return restrictedKeys.has(shelfKey) && !allowedRestrictedKeys.has(shelfKey);
}

export async function loadCatalogEnhancementsSnapshot(
  db: D1Database,
  auth: AuthContext,
  accessSnapshot: {
    restrictedKeys: Set<string>;
    allowedRestrictedKeys: Set<string>;
  },
  rawBooks: readonly BookRow[],
): Promise<{
  planToReadShelves: string[];
  collections: CustomCollectionDto[];
}> {
  await ensureCatalogEnhancementsTables(db);
  const scope = resolveCatalogUserScope(auth);

  const [ptrRes, colsRes, colShelvesRes] = await Promise.all([
    db
      .prepare(
        'SELECT shelf_key FROM user_plan_to_read WHERE user_scope = ? ORDER BY created_at DESC',
      )
      .bind(scope)
      .all<{ shelf_key: string }>(),
    db
      .prepare('SELECT * FROM custom_collections ORDER BY sort_order ASC, created_at ASC')
      .all<CollectionRow>(),
    db
      .prepare(
        'SELECT collection_id, shelf_key, sort_order FROM collection_shelves ORDER BY sort_order ASC',
      )
      .all<CollectionShelfRow>(),
  ]);

  const existingShelfKeys = new Set<string>();
  for (const b of rawBooks) {
    existingShelfKeys.add(toShelfAccessKey(b.shelf));
  }

  const isGuest = auth.role === 'guest';
  const planToReadShelves: string[] = [];
  for (const row of ptrRes.results || []) {
    const key = row.shelf_key;
    if (!key) continue;
    if (
      isGuest &&
      isShelfLockedForGuest(key, accessSnapshot.restrictedKeys, accessSnapshot.allowedRestrictedKeys)
    ) {
      continue;
    }
    planToReadShelves.push(key);
  }

  const shelvesByCol = new Map<string, string[]>();
  for (const row of colShelvesRes.results || []) {
    if (!row.collection_id || !row.shelf_key) continue;
    const arr = shelvesByCol.get(row.collection_id) || [];
    arr.push(row.shelf_key);
    shelvesByCol.set(row.collection_id, arr);
  }

  const collections: CustomCollectionDto[] = [];
  for (const col of colsRes.results || []) {
    const rawKeys = shelvesByCol.get(col.id) || [];
    const visibleKeys = isGuest
      ? rawKeys.filter(
          (key) =>
            existingShelfKeys.has(key) &&
            !isShelfLockedForGuest(
              key,
              accessSnapshot.restrictedKeys,
              accessSnapshot.allowedRestrictedKeys,
            ),
        )
      : rawKeys;

    // Với Guest: tự lọc bỏ bộ sưu tập trống hoặc chỉ chứa kệ restricted không có quyền đọc (D-030)
    if (isGuest && visibleKeys.length === 0) continue;

    collections.push({
      id: col.id,
      name: col.name,
      description: col.description ?? null,
      sortOrder: Number(col.sort_order ?? 0),
      shelfKeys: visibleKeys,
      createdAt: Number(col.created_at ?? 0),
      updatedAt: Number(col.updated_at ?? 0),
    });
  }

  return { planToReadShelves, collections };
}

export async function upsertUserPlanToRead(
  db: D1Database,
  auth: AuthContext,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    shelfName?: unknown;
    planToRead?: unknown;
  } | null;

  const shelfName =
    typeof body?.shelfName === 'string' ? body.shelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên bộ truyện không hợp lệ.', 400);
  }
  if (typeof body?.planToRead !== 'boolean') {
    throw new HttpError('Trạng thái Để dành đọc sau không hợp lệ.', 400);
  }

  await ensureCatalogEnhancementsTables(db);
  const shelfKey = shelfName.toLocaleLowerCase('vi');
  const scope = resolveCatalogUserScope(auth);

  if (body.planToRead) {
    if (auth.role === 'guest') {
      const access = await loadShelfAccessSnapshot(db, auth);
      if (isShelfLockedForGuest(shelfKey, access.restrictedKeys, access.allowedRestrictedKeys)) {
        throw new HttpError(
          '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
          403,
        );
      }
    }

    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO user_plan_to_read (user_scope, shelf_key, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_scope, shelf_key) DO UPDATE SET
           created_at = excluded.created_at`,
      )
      .bind(scope, shelfKey, now)
      .run();
  } else {
    await db
      .prepare('DELETE FROM user_plan_to_read WHERE user_scope = ? AND shelf_key = ?')
      .bind(scope, shelfKey)
      .run();
  }

  return { ok: true, shelfKey, planToRead: body.planToRead };
}

export async function listCollectionsRoute(db: D1Database, auth: AuthContext) {
  const [booksRes, accessSnapshot] = await Promise.all([
    db.prepare('SELECT shelf FROM books').all<Pick<BookRow, 'shelf'>>(),
    loadShelfAccessSnapshot(db, auth).catch(() => ({
      restrictedKeys: new Set<string>(),
      allowedRestrictedKeys: new Set<string>(),
      ownerShelfAccess: {},
    })),
  ]);
  const snapshot = await loadCatalogEnhancementsSnapshot(
    db,
    auth,
    accessSnapshot,
    (booksRes.results || []) as BookRow[],
  );
  return { collections: snapshot.collections };
}

function buildInsertCollectionShelvesStatements(
  db: D1Database,
  collectionId: string,
  shelfKeys: readonly string[],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < shelfKeys.length; i += MULTI_INSERT_SHELVES_PER_STMT) {
    const chunk = shelfKeys.slice(i, i + MULTI_INSERT_SHELVES_PER_STMT);
    const valuesSql = chunk.map(() => '(?, ?, ?)').join(', ');
    const params: unknown[] = [];
    chunk.forEach((key, offset) => {
      params.push(collectionId, key, i + offset);
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO collection_shelves (collection_id, shelf_key, sort_order)
           VALUES ${valuesSql}`,
        )
        .bind(...params),
    );
  }
  return statements;
}

export async function createCollection(db: D1Database, rawBody: unknown) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    name?: unknown;
    description?: unknown;
    sortOrder?: unknown;
    shelfKeys?: unknown;
  } | null;

  const name = typeof body?.name === 'string' ? body.name.normalize('NFC').trim() : '';
  if (!name || name.length > MAX_COLLECTION_NAME_LENGTH) {
    throw new HttpError(`Tên bộ sưu tập không hợp lệ (tối đa ${MAX_COLLECTION_NAME_LENGTH} ký tự).`, 400);
  }
  const description =
    typeof body?.description === 'string' && body.description.trim()
      ? body.description.normalize('NFC').trim().slice(0, MAX_COLLECTION_DESC_LENGTH)
      : null;
  const sortOrder =
    typeof body?.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : 0;
  const shelfKeys = body?.shelfKeys !== undefined ? sanitizeShelfKeysList(body.shelfKeys) : [];

  await ensureCatalogEnhancementsTables(db);
  const countRow = await db
    .prepare('SELECT COUNT(*) AS cnt FROM custom_collections')
    .first<{ cnt: number }>();
  if (Number(countRow?.cnt ?? 0) >= MAX_COLLECTIONS_COUNT) {
    throw new HttpError(`Tối đa ${MAX_COLLECTIONS_COUNT} bộ sưu tập. Hãy xoá bớt mục cũ.`, 400);
  }

  const id = generateCollectionId();
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO custom_collections (id, name, description, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, name, description, sortOrder, now, now),
    ...buildInsertCollectionShelvesStatements(db, id, shelfKeys),
  ];
  await db.batch(statements);

  return {
    collection: {
      id,
      name,
      description,
      sortOrder,
      shelfKeys,
      createdAt: now,
      updatedAt: now,
    } satisfies CustomCollectionDto,
  };
}

export async function updateCollection(
  db: D1Database,
  collectionId: string,
  rawBody: unknown,
) {
  if (!isValidId(collectionId)) throw new HttpError('ID bộ sưu tập không hợp lệ.', 400);
  await ensureCatalogEnhancementsTables(db);

  const existing = await db
    .prepare('SELECT * FROM custom_collections WHERE id = ?')
    .bind(collectionId)
    .first<CollectionRow>();
  if (!existing) throw new HttpError('Không tìm thấy bộ sưu tập.', 404);

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as {
    name?: unknown;
    description?: unknown;
    sortOrder?: unknown;
    shelfKeys?: unknown;
  };

  const nextName =
    body.name !== undefined
      ? typeof body.name === 'string'
        ? body.name.normalize('NFC').trim()
        : ''
      : existing.name;
  if (!nextName || nextName.length > MAX_COLLECTION_NAME_LENGTH) {
    throw new HttpError(`Tên bộ sưu tập không hợp lệ (tối đa ${MAX_COLLECTION_NAME_LENGTH} ký tự).`, 400);
  }

  const nextDescription =
    body.description === undefined
      ? existing.description
      : typeof body.description === 'string' && body.description.trim()
        ? body.description.normalize('NFC').trim().slice(0, MAX_COLLECTION_DESC_LENGTH)
        : null;

  const nextSortOrder =
    typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : Number(existing.sort_order ?? 0);

  let nextShelfKeys: string[];
  if (body.shelfKeys !== undefined) {
    nextShelfKeys = sanitizeShelfKeysList(body.shelfKeys);
  } else {
    const rows = await db
      .prepare('SELECT shelf_key FROM collection_shelves WHERE collection_id = ? ORDER BY sort_order ASC')
      .bind(collectionId)
      .all<{ shelf_key: string }>();
    nextShelfKeys = (rows.results || []).map((r) => r.shelf_key);
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE custom_collections
         SET name = ?, description = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(nextName, nextDescription, nextSortOrder, now, collectionId),
  ];

  if (body.shelfKeys !== undefined) {
    statements.push(
      db.prepare('DELETE FROM collection_shelves WHERE collection_id = ?').bind(collectionId),
      ...buildInsertCollectionShelvesStatements(db, collectionId, nextShelfKeys),
    );
  }

  await db.batch(statements);

  return {
    collection: {
      id: collectionId,
      name: nextName,
      description: nextDescription,
      sortOrder: nextSortOrder,
      shelfKeys: nextShelfKeys,
      createdAt: Number(existing.created_at ?? now),
      updatedAt: now,
    } satisfies CustomCollectionDto,
  };
}

export async function deleteCollection(db: D1Database, collectionId: string) {
  if (!isValidId(collectionId)) throw new HttpError('ID bộ sưu tập không hợp lệ.', 400);
  await ensureCatalogEnhancementsTables(db);
  await db.batch([
    db.prepare('DELETE FROM collection_shelves WHERE collection_id = ?').bind(collectionId),
    db.prepare('DELETE FROM custom_collections WHERE id = ?').bind(collectionId),
  ]);
  return { ok: true, deletedId: collectionId };
}

export async function mergeCatalogRelationsOnShelfRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  if (!oldKey || !newKey || oldKey === newKey) return;
  await ensureCatalogEnhancementsTables(db);
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO user_plan_to_read (user_scope, shelf_key, created_at)
         SELECT user_scope, ?, created_at FROM user_plan_to_read WHERE shelf_key = ?`,
      )
      .bind(newKey, oldKey),
    db.prepare('DELETE FROM user_plan_to_read WHERE shelf_key = ?').bind(oldKey),
    db
      .prepare(
        `INSERT OR IGNORE INTO collection_shelves (collection_id, shelf_key, sort_order)
         SELECT collection_id, ?, sort_order FROM collection_shelves WHERE shelf_key = ?`,
      )
      .bind(newKey, oldKey),
    db.prepare('DELETE FROM collection_shelves WHERE shelf_key = ?').bind(oldKey),
  ]);
}

export async function tryHandleCatalogRoutes(
  request: Request,
  normalizedPath: string,
  db: D1Database,
  auth: AuthContext,
  origin: string | null,
  jsonResponse: (body: unknown, status: number, origin: string | null) => Response,
): Promise<Response | null> {
  if (normalizedPath === '/api/shelves/alt-titles' && request.method === 'PUT') {
    requireOwner(auth);
    const body = (await request.json().catch(() => null)) as {
      shelfName?: unknown;
      altTitles?: unknown;
    } | null;
    const res = await upsertShelfAltTitles(db, body?.shelfName, body?.altTitles);
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/plan-to-read' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const res = await upsertUserPlanToRead(db, auth, body);
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/collections' && request.method === 'GET') {
    const res = await listCollectionsRoute(db, auth);
    return jsonResponse(res, 200, origin);
  }

  if (normalizedPath === '/api/collections' && request.method === 'POST') {
    requireOwner(auth);
    const body = await request.json().catch(() => null);
    const res = await createCollection(db, body);
    return jsonResponse(res, 201, origin);
  }

  const collectionItemMatch = normalizedPath.match(/^\/api\/collections\/([^/]+)$/);
  if (collectionItemMatch && (request.method === 'PUT' || request.method === 'PATCH')) {
    requireOwner(auth);
    const body = await request.json().catch(() => null);
    const res = await updateCollection(db, collectionItemMatch[1], body);
    return jsonResponse(res, 200, origin);
  }

  if (collectionItemMatch && request.method === 'DELETE') {
    requireOwner(auth);
    const res = await deleteCollection(db, collectionItemMatch[1]);
    return jsonResponse(res, 200, origin);
  }

  return null;
}
