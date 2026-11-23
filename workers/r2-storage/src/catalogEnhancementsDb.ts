import { type AuthContext, HttpError, requireOwner } from './auth';
import { type BookRow, MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import {
  type CollectionRow,
  type CollectionShelfRow,
  type CustomCollectionDto,
  buildVisibleCollections,
  createCollection,
  deleteCollection,
  updateCollection,
} from './collectionsDb';
import {
  assertGuestBookAccess,
  loadShelfAccessSnapshot,
  toShelfAccessKey,
} from './shelfAccessDb';
import { upsertShelfAltTitles } from './shelfTagsDb';

export type { CustomCollectionDto };

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
      `CREATE TABLE IF NOT EXISTS user_plan_to_read_books (
         user_scope TEXT NOT NULL,
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (user_scope, book_id)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_plan_to_read_books_user
       ON user_plan_to_read_books(user_scope, created_at DESC)`,
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
  planToReadBooks: string[];
  collections: CustomCollectionDto[];
}> {
  await ensureCatalogEnhancementsTables(db);
  const scope = resolveCatalogUserScope(auth);

  const [ptrRes, ptrBooksRes, colsRes, colShelvesRes] = await Promise.all([
    db
      .prepare(
        'SELECT shelf_key FROM user_plan_to_read WHERE user_scope = ? ORDER BY created_at DESC',
      )
      .bind(scope)
      .all<{ shelf_key: string }>(),
    db
      .prepare(
        'SELECT book_id FROM user_plan_to_read_books WHERE user_scope = ? ORDER BY created_at DESC',
      )
      .bind(scope)
      .all<{ book_id: string }>(),
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
  const bookShelfKeyById = new Map<string, string>();
  for (const b of rawBooks) {
    const sk = toShelfAccessKey(b.shelf);
    existingShelfKeys.add(sk);
    if (b.id) bookShelfKeyById.set(b.id, sk);
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

  const planToReadBooks: string[] = [];
  for (const row of ptrBooksRes.results || []) {
    const bookId = row.book_id;
    if (!bookId) continue;
    const sk = bookShelfKeyById.get(bookId);
    if (!sk) continue;
    if (
      isGuest &&
      isShelfLockedForGuest(sk, accessSnapshot.restrictedKeys, accessSnapshot.allowedRestrictedKeys)
    ) {
      continue;
    }
    planToReadBooks.push(bookId);
  }

  const collections = buildVisibleCollections(
    colsRes.results || [],
    colShelvesRes.results || [],
    auth,
    existingShelfKeys,
    accessSnapshot.restrictedKeys,
    accessSnapshot.allowedRestrictedKeys,
  );

  return { planToReadShelves, planToReadBooks, collections };
}

export async function upsertUserPlanToRead(
  db: D1Database,
  auth: AuthContext,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    shelfName?: unknown;
    bookId?: unknown;
    planToRead?: unknown;
  } | null;

  if (typeof body?.planToRead !== 'boolean') {
    throw new HttpError('Trạng thái Để dành đọc sau không hợp lệ.', 400);
  }

  await ensureCatalogEnhancementsTables(db);
  const scope = resolveCatalogUserScope(auth);

  if (typeof body.bookId === 'string' && body.bookId.trim()) {
    const bookId = body.bookId.trim();
    if (!isValidId(bookId)) {
      throw new HttpError('ID tập sách không hợp lệ.', 400);
    }
    if (body.planToRead) {
      const existingBook = await db
        .prepare('SELECT id FROM books WHERE id = ?')
        .bind(bookId)
        .first<{ id: string }>();
      if (!existingBook) throw new HttpError('Không tìm thấy tập sách.', 404);
      await assertGuestBookAccess(db, auth, bookId);
      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO user_plan_to_read_books (user_scope, book_id, created_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_scope, book_id) DO UPDATE SET
             created_at = excluded.created_at`,
        )
        .bind(scope, bookId, now)
        .run();
    } else {
      await db
        .prepare('DELETE FROM user_plan_to_read_books WHERE user_scope = ? AND book_id = ?')
        .bind(scope, bookId)
        .run();
    }
    return { ok: true, bookId, planToRead: body.planToRead };
  }

  const shelfName =
    typeof body?.shelfName === 'string' ? body.shelfName.normalize('NFC').trim() : '';
  if (!shelfName || shelfName.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError('Tên bộ truyện không hợp lệ.', 400);
  }

  const shelfKey = shelfName.toLocaleLowerCase('vi');

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

async function listCollectionsRoute(db: D1Database, auth: AuthContext) {
  const [booksRes, accessSnapshot] = await Promise.all([
    db.prepare('SELECT id, shelf FROM books').all<Pick<BookRow, 'id' | 'shelf'>>(),
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
