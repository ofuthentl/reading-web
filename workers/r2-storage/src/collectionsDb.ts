import { type AuthContext, HttpError } from './auth';
import { MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import { ensureCatalogEnhancementsTables } from './catalogEnhancementsDb';

export interface CustomCollectionDto {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  shelfKeys: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CollectionShelfRow {
  collection_id: string;
  shelf_key: string;
  sort_order: number;
}

const MAX_COLLECTION_NAME_LENGTH = 80;
const MAX_COLLECTION_DESC_LENGTH = 300;
const MAX_COLLECTIONS_COUNT = 60;
const MAX_SHELVES_PER_COLLECTION = 200;
const MULTI_INSERT_SHELVES_PER_STMT = 25; // 25 * 3 = 75 bind params (< 100 limit of D1)

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

export function buildVisibleCollections(
  colsRows: readonly CollectionRow[],
  colShelvesRows: readonly CollectionShelfRow[],
  auth: AuthContext,
  existingShelfKeys: ReadonlySet<string>,
  restrictedKeys: ReadonlySet<string>,
  allowedRestrictedKeys: ReadonlySet<string>,
): CustomCollectionDto[] {
  const isGuest = auth.role === 'guest';
  const shelvesByCol = new Map<string, string[]>();
  for (const row of colShelvesRows) {
    if (!row.collection_id || !row.shelf_key) continue;
    const arr = shelvesByCol.get(row.collection_id) || [];
    arr.push(row.shelf_key);
    shelvesByCol.set(row.collection_id, arr);
  }

  const collections: CustomCollectionDto[] = [];
  for (const col of colsRows) {
    const rawKeys = shelvesByCol.get(col.id) || [];
    const visibleKeys = isGuest
      ? rawKeys.filter(
          (key) =>
            existingShelfKeys.has(key) &&
            !(restrictedKeys.has(key) && !allowedRestrictedKeys.has(key)),
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
  return collections;
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
    throw new HttpError(
      `Tên bộ sưu tập không hợp lệ (tối đa ${MAX_COLLECTION_NAME_LENGTH} ký tự).`,
      400,
    );
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
    throw new HttpError(
      `Tên bộ sưu tập không hợp lệ (tối đa ${MAX_COLLECTION_NAME_LENGTH} ký tự).`,
      400,
    );
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
      .prepare(
        'SELECT shelf_key FROM collection_shelves WHERE collection_id = ? ORDER BY sort_order ASC',
      )
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
