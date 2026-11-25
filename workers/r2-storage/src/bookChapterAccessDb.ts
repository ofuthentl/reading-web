import { type AuthContext, HttpError } from './auth';
import {
  type ShelfAccessGrantUser,
  ensureShelfAccessTables,
  loadShelfAccessSnapshot,
  toShelfAccessKey,
} from './shelfAccessDb';

export type BookAccessMode = 'inherit' | 'public' | 'restricted';

export interface OwnerBookAccessSummary {
  mode: BookAccessMode;
  allowedCount: number;
  lockedChapterCount: number;
}

export interface BookAccessSnapshot {
  publicOverrideBookIds: Set<string>;
  restrictedBookIds: Set<string>;
  allowedRestrictedBookIds: Set<string>;
  ownerBookAccess: Record<string, OwnerBookAccessSummary>;
}

export interface AdminBookChapterAccessItem {
  chapterKey: string;
  title: string;
  chapterNumber: number;
  partCount: number;
  locked: boolean;
  allowedUsers: ShelfAccessGrantUser[];
}

export interface AdminBookAccessDetail {
  bookId: string;
  bookTitle: string;
  shelfName: string;
  shelfKey: string;
  shelfRestricted: boolean;
  hasGuestPack: boolean;
  bookRule: {
    mode: BookAccessMode;
    allowedUsers: ShelfAccessGrantUser[];
  };
  chapters: AdminBookChapterAccessItem[];
}

const ensuredBookAccessDbs = new WeakSet<D1Database>();

export function toCanonicalChapterKey(chapterId: string | null | undefined): string {
  return (chapterId || '').normalize('NFC').trim().replace(/-p\d+$/i, '');
}

export async function ensureBookChapterAccessTables(db: D1Database): Promise<void> {
  if (ensuredBookAccessDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS book_access_rules (
         book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
         access_mode TEXT NOT NULL CHECK (access_mode IN ('public', 'restricted')),
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS book_guest_grants (
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         discord_user_id TEXT NOT NULL,
         granted_label TEXT,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (book_id, discord_user_id)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_book_grants_user
       ON book_guest_grants(discord_user_id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS chapter_access_rules (
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         chapter_key TEXT NOT NULL,
         access_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (access_mode = 'restricted'),
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (book_id, chapter_key)
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS chapter_guest_grants (
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         chapter_key TEXT NOT NULL,
         discord_user_id TEXT NOT NULL,
         granted_label TEXT,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (book_id, chapter_key, discord_user_id)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_chapter_grants_user
       ON chapter_guest_grants(discord_user_id)`,
    ),
  ]);
  ensuredBookAccessDbs.add(db);
}

export async function loadBookAccessSnapshot(
  db: D1Database,
  auth: AuthContext,
): Promise<BookAccessSnapshot> {
  await ensureBookChapterAccessTables(db);
  const rulesRes = await db
    .prepare('SELECT book_id, access_mode FROM book_access_rules')
    .all<{ book_id: string; access_mode: 'public' | 'restricted' }>();

  const publicOverrideBookIds = new Set<string>();
  const restrictedBookIds = new Set<string>();
  for (const row of rulesRes.results || []) {
    if (!row.book_id) continue;
    if (row.access_mode === 'public') publicOverrideBookIds.add(row.book_id);
    else if (row.access_mode === 'restricted') restrictedBookIds.add(row.book_id);
  }

  const allowedRestrictedBookIds = new Set<string>();
  const ownerBookAccess: Record<string, OwnerBookAccessSummary> = {};

  if (auth.role === 'owner') {
    const [grantCountsRes, chapterCountsRes] = await Promise.all([
      restrictedBookIds.size > 0
        ? db
            .prepare('SELECT book_id, COUNT(*) AS cnt FROM book_guest_grants GROUP BY book_id')
            .all<{ book_id: string; cnt: number }>()
        : Promise.resolve({ results: [] as Array<{ book_id: string; cnt: number }> }),
      db
        .prepare('SELECT book_id, COUNT(*) AS cnt FROM chapter_access_rules GROUP BY book_id')
        .all<{ book_id: string; cnt: number }>(),
    ]);

    const grantCountMap = new Map<string, number>();
    for (const row of grantCountsRes.results || []) {
      grantCountMap.set(row.book_id, Number(row.cnt ?? 0));
    }

    const chapterCountMap = new Map<string, number>();
    for (const row of chapterCountsRes.results || []) {
      const cnt = Number(row.cnt ?? 0);
      if (cnt > 0) chapterCountMap.set(row.book_id, cnt);
    }

    const touchedIds = new Set<string>([
      ...publicOverrideBookIds,
      ...restrictedBookIds,
      ...chapterCountMap.keys(),
    ]);

    for (const id of touchedIds) {
      const mode: BookAccessMode = publicOverrideBookIds.has(id)
        ? 'public'
        : restrictedBookIds.has(id)
          ? 'restricted'
          : 'inherit';
      ownerBookAccess[id] = {
        mode,
        allowedCount: mode === 'restricted' ? (grantCountMap.get(id) ?? 0) : 0,
        lockedChapterCount: chapterCountMap.get(id) ?? 0,
      };
    }
  } else if (restrictedBookIds.size > 0) {
    const grantsRes = await db
      .prepare('SELECT book_id FROM book_guest_grants WHERE discord_user_id = ?')
      .bind(auth.userId)
      .all<{ book_id: string }>();
    for (const row of grantsRes.results || []) {
      if (restrictedBookIds.has(row.book_id)) {
        allowedRestrictedBookIds.add(row.book_id);
      }
    }
  }

  return {
    publicOverrideBookIds,
    restrictedBookIds,
    allowedRestrictedBookIds,
    ownerBookAccess,
  };
}

export function resolveGuestBookLocked(
  bookId: string,
  shelfKey: string,
  shelfAccess: {
    restrictedKeys: ReadonlySet<string>;
    allowedRestrictedKeys: ReadonlySet<string>;
  },
  bookAccess: {
    publicOverrideBookIds: ReadonlySet<string>;
    restrictedBookIds: ReadonlySet<string>;
    allowedRestrictedBookIds: ReadonlySet<string>;
  },
): boolean {
  if (bookAccess.publicOverrideBookIds.has(bookId)) return false;
  if (bookAccess.restrictedBookIds.has(bookId)) {
    return !bookAccess.allowedRestrictedBookIds.has(bookId);
  }
  return (
    shelfAccess.restrictedKeys.has(shelfKey) &&
    !shelfAccess.allowedRestrictedKeys.has(shelfKey)
  );
}

export function computeGuestLockedShelfKeys(
  rawBooks: readonly { id: string; shelf: string }[],
  shelfAccess: {
    restrictedKeys: ReadonlySet<string>;
    allowedRestrictedKeys: ReadonlySet<string>;
  },
  bookAccess: {
    publicOverrideBookIds: ReadonlySet<string>;
    restrictedBookIds: ReadonlySet<string>;
    allowedRestrictedBookIds: ReadonlySet<string>;
  },
): Set<string> {
  const stats = new Map<string, { total: number; locked: number }>();
  for (const book of rawBooks) {
    const sk = toShelfAccessKey(book.shelf);
    const locked = resolveGuestBookLocked(book.id, sk, shelfAccess, bookAccess);
    const cur = stats.get(sk) ?? { total: 0, locked: 0 };
    cur.total += 1;
    if (locked) cur.locked += 1;
    stats.set(sk, cur);
  }

  const lockedShelves = new Set<string>();
  for (const [sk, entry] of stats.entries()) {
    if (entry.total > 0 && entry.locked === entry.total) {
      lockedShelves.add(sk);
    }
  }
  for (const sk of shelfAccess.restrictedKeys) {
    if (!stats.has(sk) && !shelfAccess.allowedRestrictedKeys.has(sk)) {
      lockedShelves.add(sk);
    }
  }
  return lockedShelves;
}

export async function assertGuestBookEffectiveAccess(
  db: D1Database,
  auth: AuthContext,
  bookId: string,
): Promise<void> {
  if (auth.role === 'owner') return;
  await ensureShelfAccessTables(db);
  await ensureBookChapterAccessTables(db);

  const bookRow = await db
    .prepare('SELECT shelf FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ shelf: string }>();
  if (!bookRow) {
    throw new HttpError('Không tìm thấy sách.', 404);
  }

  const bookRule = await db
    .prepare('SELECT access_mode FROM book_access_rules WHERE book_id = ?')
    .bind(bookId)
    .first<{ access_mode: 'public' | 'restricted' }>();

  if (bookRule?.access_mode === 'public') return;

  if (bookRule?.access_mode === 'restricted') {
    const granted = await db
      .prepare('SELECT 1 AS ok FROM book_guest_grants WHERE book_id = ? AND discord_user_id = ?')
      .bind(bookId, auth.userId)
      .first<{ ok: number }>();
    if (!granted) {
      throw new HttpError(
        '🔒 Tập sách này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
        403,
      );
    }
    return;
  }

  const shelfKey = toShelfAccessKey(bookRow.shelf);
  const shelfAccess = await loadShelfAccessSnapshot(db, auth);
  if (
    shelfAccess.restrictedKeys.has(shelfKey) &&
    !shelfAccess.allowedRestrictedKeys.has(shelfKey)
  ) {
    throw new HttpError(
      '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
      403,
    );
  }
}

export async function assertGuestShelfEffectiveAccess(
  db: D1Database,
  auth: AuthContext,
  rawShelfName: string,
): Promise<void> {
  if (auth.role === 'owner') return;
  const shelfKey = toShelfAccessKey(rawShelfName);
  const [booksRes, shelfAccess, bookAccess] = await Promise.all([
    db.prepare('SELECT id, shelf FROM books').all<{ id: string; shelf: string }>(),
    loadShelfAccessSnapshot(db, auth),
    loadBookAccessSnapshot(db, auth),
  ]);
  const shelfBooks = (booksRes.results || []).filter(
    (b) => typeof b.shelf === 'string' && toShelfAccessKey(b.shelf) === shelfKey,
  );
  if (shelfBooks.length > 0) {
    const anyOpen = shelfBooks.some(
      (b) => !resolveGuestBookLocked(b.id, shelfKey, shelfAccess, bookAccess),
    );
    if (!anyOpen) {
      throw new HttpError(
        '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
        403,
      );
    }
    return;
  }
  if (
    shelfAccess.restrictedKeys.has(shelfKey) &&
    !shelfAccess.allowedRestrictedKeys.has(shelfKey)
  ) {
    throw new HttpError(
      '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
      403,
    );
  }
}

export async function loadGuestLockedChapterKeysForBook(
  db: D1Database,
  auth: AuthContext,
  bookId: string,
): Promise<Set<string>> {
  if (auth.role === 'owner') return new Set<string>();
  await ensureBookChapterAccessTables(db);

  const rulesRes = await db
    .prepare(
      "SELECT chapter_key FROM chapter_access_rules WHERE book_id = ? AND access_mode = 'restricted'",
    )
    .bind(bookId)
    .all<{ chapter_key: string }>();

  const lockedKeys = new Set<string>();
  for (const row of rulesRes.results || []) {
    const key = toCanonicalChapterKey(row.chapter_key);
    if (key) lockedKeys.add(key);
  }
  if (lockedKeys.size === 0) return lockedKeys;

  const grantsRes = await db
    .prepare(
      'SELECT chapter_key FROM chapter_guest_grants WHERE book_id = ? AND discord_user_id = ?',
    )
    .bind(bookId, auth.userId)
    .all<{ chapter_key: string }>();

  for (const row of grantsRes.results || []) {
    const key = toCanonicalChapterKey(row.chapter_key);
    if (key) lockedKeys.delete(key);
  }
  return lockedKeys;
}

export async function assertGuestChapterAccess(
  db: D1Database,
  auth: AuthContext,
  bookId: string,
  chapterId: string,
): Promise<void> {
  if (auth.role === 'owner') return;
  const canonicalKey = toCanonicalChapterKey(chapterId);
  if (!canonicalKey) return;
  const lockedKeys = await loadGuestLockedChapterKeysForBook(db, auth, bookId);
  if (lockedKeys.has(canonicalKey)) {
    throw new HttpError(
      '🔒 Chương này chỉ mở cho thành viên Discord được chỉ định.',
      403,
    );
  }
}
