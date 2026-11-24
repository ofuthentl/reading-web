import { HttpError, ensureDiscordAccessTable } from './auth';
import {
  type AdminBookAccessDetail,
  type AdminBookChapterAccessItem,
  type BookAccessMode,
  type OwnerBookAccessSummary,
  ensureBookChapterAccessTables,
  toCanonicalChapterKey,
} from './bookChapterAccessDb';
import {
  type ShelfAccessGrantUser,
  ensureShelfAccessTables,
  toShelfAccessKey,
} from './shelfAccessDb';

const BOOK_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const DISCORD_SNOWFLAKE_RE = /^\d{5,32}$/;
const MAX_GRANTED_LABEL_LEN = 80;
const MAX_GRANTS_PER_TARGET = 500;
const MAX_LOCKED_CHAPTERS_PER_BOOK = 2000;
const MAX_CHAPTER_KEY_LEN = 120;
const BOOK_GRANTS_ROWS_PER_STMT = 20; // 20 * 4 = 80 <= 80 params
const CHAPTER_RULES_ROWS_PER_STMT = 25; // 25 * 3 = 75 <= 80 params
const CHAPTER_GRANTS_ROWS_PER_STMT = 15; // 15 * 5 = 75 <= 80 params

function stripSegmentSuffix(title: string): string {
  return title.replace(/\s*\(1\/\d+\)\s*$/, '').trim() || title.trim();
}

function sanitizeGrantUsersList(rawList: unknown, now: number): ShelfAccessGrantUser[] {
  const arr = Array.isArray(rawList) ? rawList : [];
  if (arr.length > MAX_GRANTS_PER_TARGET) {
    throw new HttpError(`Tối đa ${MAX_GRANTS_PER_TARGET} thành viên cho mỗi mục phân quyền.`, 400);
  }
  const seen = new Set<string>();
  const deduped: ShelfAccessGrantUser[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { discordUserId?: unknown; label?: unknown };
    const uid = typeof candidate.discordUserId === 'string' ? candidate.discordUserId.trim() : '';
    if (!DISCORD_SNOWFLAKE_RE.test(uid)) {
      throw new HttpError(
        `Discord User ID "${uid || '(trống)'}" không hợp lệ (cần dãy số ID Discord).`,
        400,
      );
    }
    if (seen.has(uid)) continue;
    seen.add(uid);
    const label =
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim().slice(0, MAX_GRANTED_LABEL_LEN)
        : null;
    deduped.push({ discordUserId: uid, label, createdAt: now });
  }
  return deduped;
}

export async function getAdminBookAccessDetail(
  db: D1Database,
  bookId: string,
): Promise<AdminBookAccessDetail> {
  if (!BOOK_ID_RE.test(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const book = await db
    .prepare('SELECT id, title, shelf FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string; title: string; shelf: string }>();
  if (!book) throw new HttpError('Không tìm thấy sách.', 404);

  await Promise.all([
    ensureDiscordAccessTable(db),
    ensureShelfAccessTables(db),
    ensureBookChapterAccessTables(db),
  ]);

  const shelfKey = toShelfAccessKey(book.shelf);
  const [shelfRulesRes, bookRuleRow, bookGrantsRes, chRulesRes, chGrantsRes, packRow] =
    await Promise.all([
      db
        .prepare("SELECT shelf_key FROM shelf_access_rules WHERE access_mode = 'restricted'")
        .all<{ shelf_key: string }>(),
      db
        .prepare('SELECT access_mode FROM book_access_rules WHERE book_id = ?')
        .bind(bookId)
        .first<{ access_mode: 'public' | 'restricted' }>(),
      db
        .prepare(
          `SELECT g.discord_user_id, g.granted_label, g.created_at, da.discord_username
           FROM book_guest_grants g
           LEFT JOIN discord_access da ON da.discord_user_id = g.discord_user_id
           WHERE g.book_id = ?
           ORDER BY g.created_at ASC`,
        )
        .bind(bookId)
        .all<{
          discord_user_id: string;
          granted_label: string | null;
          created_at: number;
          discord_username: string | null;
        }>(),
      db
        .prepare('SELECT chapter_key FROM chapter_access_rules WHERE book_id = ?')
        .bind(bookId)
        .all<{ chapter_key: string }>(),
      db
        .prepare(
          `SELECT g.chapter_key, g.discord_user_id, g.granted_label, g.created_at, da.discord_username
           FROM chapter_guest_grants g
           LEFT JOIN discord_access da ON da.discord_user_id = g.discord_user_id
           WHERE g.book_id = ?
           ORDER BY g.created_at ASC`,
        )
        .bind(bookId)
        .all<{
          chapter_key: string;
          discord_user_id: string;
          granted_label: string | null;
          created_at: number;
          discord_username: string | null;
        }>(),
      db
        .prepare('SELECT manifest_json FROM book_guest_packs WHERE book_id = ?')
        .bind(bookId)
        .first<{ manifest_json: string }>(),
    ]);

  const shelfRestricted = (shelfRulesRes.results || []).some(
    (r) => typeof r.shelf_key === 'string' && toShelfAccessKey(r.shelf_key) === shelfKey,
  );
  const mode: BookAccessMode = bookRuleRow?.access_mode ?? 'inherit';
  const bookAllowedUsers: ShelfAccessGrantUser[] = (bookGrantsRes.results || []).map((r) => ({
    discordUserId: r.discord_user_id,
    label: r.granted_label ?? null,
    discordUsername: r.discord_username ?? null,
    createdAt: r.created_at,
  }));

  const lockedChapterSet = new Set<string>();
  for (const r of chRulesRes.results || []) {
    const k = toCanonicalChapterKey(r.chapter_key);
    if (k) lockedChapterSet.add(k);
  }

  const chGrantsMap = new Map<string, ShelfAccessGrantUser[]>();
  for (const r of chGrantsRes.results || []) {
    const k = toCanonicalChapterKey(r.chapter_key);
    if (!k) continue;
    const list = chGrantsMap.get(k) || [];
    if (!list.some((u) => u.discordUserId === r.discord_user_id)) {
      list.push({
        discordUserId: r.discord_user_id,
        label: r.granted_label ?? null,
        discordUsername: r.discord_username ?? null,
        createdAt: r.created_at,
      });
    }
    chGrantsMap.set(k, list);
  }

  const chapters: AdminBookChapterAccessItem[] = [];
  const seenKeys = new Map<string, number>();

  if (packRow?.manifest_json) {
    try {
      const manifest = JSON.parse(packRow.manifest_json) as {
        chapters?: Array<{ id: string; title: string }>;
      };
      for (const ch of manifest.chapters || []) {
        const key = toCanonicalChapterKey(ch.id);
        if (!key) continue;
        const existingIdx = seenKeys.get(key);
        if (existingIdx !== undefined) {
          chapters[existingIdx].partCount += 1;
        } else {
          const idx = chapters.length;
          seenKeys.set(key, idx);
          chapters.push({
            chapterKey: key,
            title: stripSegmentSuffix(ch.title || `Chương ${idx + 1}`),
            chapterNumber: idx + 1,
            partCount: 1,
            locked: lockedChapterSet.has(key),
            allowedUsers: chGrantsMap.get(key) ?? [],
          });
        }
      }
    } catch {
      // Ignore malformed manifest fallback
    }
  }

  for (const lockedKey of lockedChapterSet) {
    if (!seenKeys.has(lockedKey)) {
      const idx = chapters.length;
      seenKeys.set(lockedKey, idx);
      chapters.push({
        chapterKey: lockedKey,
        title: `Chương (${lockedKey})`,
        chapterNumber: idx + 1,
        partCount: 1,
        locked: true,
        allowedUsers: chGrantsMap.get(lockedKey) ?? [],
      });
    }
  }

  return {
    bookId: book.id,
    bookTitle: book.title,
    shelfName: book.shelf,
    shelfKey,
    shelfRestricted,
    hasGuestPack: Boolean(packRow?.manifest_json),
    bookRule: {
      mode,
      allowedUsers: mode === 'restricted' ? bookAllowedUsers : [],
    },
    chapters,
  };
}

export async function putAdminBookAccessConfig(
  db: D1Database,
  bookId: string,
  rawBody: unknown,
) {
  if (!BOOK_ID_RE.test(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const book = await db
    .prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (!book) throw new HttpError('Không tìm thấy sách.', 404);

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    mode?: unknown;
    allowedUsers?: unknown;
    chapters?: unknown;
  } | null;

  const mode = body?.mode;
  if (mode !== 'inherit' && mode !== 'public' && mode !== 'restricted') {
    throw new HttpError('Chế độ phân quyền tập sách không hợp lệ.', 400);
  }

  await ensureBookChapterAccessTables(db);
  const now = Date.now();
  const bookUsers = mode === 'restricted' ? sanitizeGrantUsersList(body?.allowedUsers, now) : [];

  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM book_guest_grants WHERE book_id = ?').bind(bookId),
  ];

  if (mode === 'inherit') {
    statements.push(db.prepare('DELETE FROM book_access_rules WHERE book_id = ?').bind(bookId));
  } else {
    statements.push(
      db
        .prepare(
          `INSERT INTO book_access_rules (book_id, access_mode, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(book_id) DO UPDATE SET
             access_mode = excluded.access_mode,
             updated_at = excluded.updated_at`,
        )
        .bind(bookId, mode, now),
    );
  }

  for (let i = 0; i < bookUsers.length; i += BOOK_GRANTS_ROWS_PER_STMT) {
    const chunk = bookUsers.slice(i, i + BOOK_GRANTS_ROWS_PER_STMT);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const u of chunk) params.push(bookId, u.discordUserId, u.label, u.createdAt);
    statements.push(
      db
        .prepare(
          `INSERT INTO book_guest_grants (book_id, discord_user_id, granted_label, created_at)
           VALUES ${valuesSql}`,
        )
        .bind(...params),
    );
  }

  if (body?.chapters !== undefined) {
    if (!Array.isArray(body.chapters)) {
      throw new HttpError('Danh sách khoá chương không hợp lệ.', 400);
    }
    if (body.chapters.length > MAX_LOCKED_CHAPTERS_PER_BOOK) {
      throw new HttpError(`Tối đa ${MAX_LOCKED_CHAPTERS_PER_BOOK} chương khoá mỗi tập.`, 400);
    }

    const seenChapterKeys = new Set<string>();
    const lockedChapters: Array<{ chapterKey: string; users: ShelfAccessGrantUser[] }> = [];

    for (const rawCh of body.chapters) {
      if (!rawCh || typeof rawCh !== 'object') continue;
      const item = rawCh as { chapterKey?: unknown; locked?: unknown; allowedUsers?: unknown };
      if (item.locked === false) continue;
      const key =
        typeof item.chapterKey === 'string' ? toCanonicalChapterKey(item.chapterKey) : '';
      if (!key || key.length > MAX_CHAPTER_KEY_LEN) {
        throw new HttpError('Mã chương cần khoá không hợp lệ.', 400);
      }
      if (seenChapterKeys.has(key)) continue;
      seenChapterKeys.add(key);
      lockedChapters.push({
        chapterKey: key,
        users: sanitizeGrantUsersList(item.allowedUsers, now),
      });
    }

    statements.push(
      db.prepare('DELETE FROM chapter_guest_grants WHERE book_id = ?').bind(bookId),
      db.prepare('DELETE FROM chapter_access_rules WHERE book_id = ?').bind(bookId),
    );

    for (let i = 0; i < lockedChapters.length; i += CHAPTER_RULES_ROWS_PER_STMT) {
      const chunk = lockedChapters.slice(i, i + CHAPTER_RULES_ROWS_PER_STMT);
      const valuesSql = chunk.map(() => `(?, ?, 'restricted', ?)`).join(', ');
      const params: unknown[] = [];
      for (const c of chunk) params.push(bookId, c.chapterKey, now);
      statements.push(
        db
          .prepare(
            `INSERT INTO chapter_access_rules (book_id, chapter_key, access_mode, updated_at)
             VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }

    const flatChapterGrants: Array<{
      chapterKey: string;
      discordUserId: string;
      label: string | null;
      createdAt: number;
    }> = [];
    for (const c of lockedChapters) {
      for (const u of c.users) {
        flatChapterGrants.push({
          chapterKey: c.chapterKey,
          discordUserId: u.discordUserId,
          label: u.label,
          createdAt: u.createdAt,
        });
      }
    }

    for (let i = 0; i < flatChapterGrants.length; i += CHAPTER_GRANTS_ROWS_PER_STMT) {
      const chunk = flatChapterGrants.slice(i, i + CHAPTER_GRANTS_ROWS_PER_STMT);
      const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const g of chunk) {
        params.push(bookId, g.chapterKey, g.discordUserId, g.label, g.createdAt);
      }
      statements.push(
        db
          .prepare(
            `INSERT INTO chapter_guest_grants (book_id, chapter_key, discord_user_id, granted_label, created_at)
             VALUES ${valuesSql}`,
          )
          .bind(...params),
      );
    }
  }

  await db.batch(statements);
  const detail = await getAdminBookAccessDetail(db, bookId);
  const lockedChapterCount = detail.chapters.filter((c) => c.locked).length;
  const summary: OwnerBookAccessSummary | null =
    detail.bookRule.mode !== 'inherit' || lockedChapterCount > 0
      ? {
          mode: detail.bookRule.mode,
          allowedCount:
            detail.bookRule.mode === 'restricted' ? detail.bookRule.allowedUsers.length : 0,
          lockedChapterCount,
        }
      : null;

  return {
    ok: true,
    summary,
    ...detail,
  };
}

export async function cleanupBookAccessRecords(
  db: D1Database,
  bookIds: readonly string[],
): Promise<void> {
  if (bookIds.length === 0) return;
  const placeholders = bookIds.map(() => '?').join(', ');
  await Promise.all([
    db.prepare(`DELETE FROM book_guest_grants WHERE book_id IN (${placeholders})`).bind(...bookIds).run().catch(() => undefined),
    db.prepare(`DELETE FROM book_access_rules WHERE book_id IN (${placeholders})`).bind(...bookIds).run().catch(() => undefined),
    db.prepare(`DELETE FROM chapter_guest_grants WHERE book_id IN (${placeholders})`).bind(...bookIds).run().catch(() => undefined),
    db.prepare(`DELETE FROM chapter_access_rules WHERE book_id IN (${placeholders})`).bind(...bookIds).run().catch(() => undefined),
  ]);
}
