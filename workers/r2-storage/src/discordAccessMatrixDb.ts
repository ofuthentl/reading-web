import { HttpError, ensureDiscordAccessTable } from './auth';
import { ensureBookChapterAccessTables } from './bookChapterAccessDb';
import { ensureDiscordPresetsTables } from './discordPresetsDb';
import { ensureShelfAccessTables, toShelfAccessKey } from './shelfAccessDb';

const DISCORD_USER_ID_RE = /^\d{5,32}$/;

export interface GuestAccessMatrixShelfItem {
  shelfKey: string;
  shelfName: string;
  accessMode: 'public' | 'restricted';
  grantedAt: number;
}

export interface GuestAccessMatrixBookItem {
  bookId: string;
  bookTitle: string;
  shelfName: string;
  accessMode: 'public' | 'restricted' | 'inherit';
  grantedAt: number;
}

export interface GuestAccessMatrixChapterItem {
  bookId: string;
  bookTitle: string;
  shelfName: string;
  chapterKey: string;
  grantedAt: number;
}

export interface GuestAccessMatrixPresetItem {
  presetId: string;
  presetName: string;
}

export interface DiscordGuestAccessMatrixDto {
  discordUserId: string;
  discordUsername: string | null;
  isBanned: boolean;
  strikes: number;
  sessionExpiresAt: number | null;
  shelves: GuestAccessMatrixShelfItem[];
  books: GuestAccessMatrixBookItem[];
  chapters: GuestAccessMatrixChapterItem[];
  presets: GuestAccessMatrixPresetItem[];
  totalGrants: number;
}

export interface RevokeGuestAllAccessResult {
  ok: true;
  discordUserId: string;
  removedShelves: number;
  removedBooks: number;
  removedChapters: number;
  removedPresets: number;
  sessionClosed: boolean;
}

function assertValidDiscordUserId(rawUserId: string): string {
  const clean = rawUserId.trim();
  if (!DISCORD_USER_ID_RE.test(clean)) {
    throw new HttpError('Discord User ID không hợp lệ.', 400);
  }
  return clean;
}

export async function getDiscordGuestAccessMatrix(
  db: D1Database,
  rawUserId: string,
): Promise<DiscordGuestAccessMatrixDto> {
  const userId = assertValidDiscordUserId(rawUserId);
  await Promise.all([
    ensureDiscordAccessTable(db),
    ensureShelfAccessTables(db),
    ensureBookChapterAccessTables(db),
    ensureDiscordPresetsTables(db),
  ]);

  const [guestRes, shelfGrantsRes, distinctShelvesRes, bookGrantsRes, chapterGrantsRes, presetsRes] =
    await db.batch([
      db
        .prepare(
          `SELECT discord_username, is_banned, rl_strikes, session_expires_at
           FROM discord_access
           WHERE discord_user_id = ?`,
        )
        .bind(userId),
      db
        .prepare(
          `SELECT g.shelf_key, g.created_at, COALESCE(r.access_mode, 'public') AS access_mode
           FROM shelf_guest_grants g
           LEFT JOIN shelf_access_rules r ON r.shelf_key = g.shelf_key
           WHERE g.discord_user_id = ?
           ORDER BY g.shelf_key ASC`,
        )
        .bind(userId),
      db.prepare('SELECT DISTINCT shelf FROM books'),
      db
        .prepare(
          `SELECT g.book_id, g.created_at, b.title, b.shelf, r.access_mode
           FROM book_guest_grants g
           LEFT JOIN books b ON b.id = g.book_id
           LEFT JOIN book_access_rules r ON r.book_id = g.book_id
           WHERE g.discord_user_id = ?
           ORDER BY b.shelf ASC, b.title ASC`,
        )
        .bind(userId),
      db
        .prepare(
          `SELECT g.book_id, g.chapter_key, g.created_at, b.title, b.shelf
           FROM chapter_guest_grants g
           LEFT JOIN books b ON b.id = g.book_id
           WHERE g.discord_user_id = ?
           ORDER BY b.title ASC, g.chapter_key ASC`,
        )
        .bind(userId),
      db
        .prepare(
          `SELECT p.id AS preset_id, p.name AS preset_name
           FROM discord_access_preset_members m
           INNER JOIN discord_access_presets p ON p.id = m.preset_id
           WHERE m.discord_user_id = ?
           ORDER BY LOWER(p.name) ASC`,
        )
        .bind(userId),
    ]);

  const guestRow = (guestRes.results?.[0] ?? null) as {
    discord_username: string;
    is_banned: number | null;
    rl_strikes: number | null;
    session_expires_at: number | null;
  } | null;

  const shelfDisplayByKey = new Map<string, string>();
  for (const row of (distinctShelvesRes.results || []) as Array<{ shelf: string | null }>) {
    if (!row.shelf) continue;
    const key = toShelfAccessKey(row.shelf);
    if (key && !shelfDisplayByKey.has(key)) {
      shelfDisplayByKey.set(key, row.shelf);
    }
  }

  const shelves: GuestAccessMatrixShelfItem[] = (
    (shelfGrantsRes.results || []) as Array<{
      shelf_key: string;
      created_at: number;
      access_mode: string | null;
    }>
  ).map((row) => ({
    shelfKey: row.shelf_key,
    shelfName: shelfDisplayByKey.get(row.shelf_key) || row.shelf_key,
    accessMode: row.access_mode === 'restricted' ? 'restricted' : 'public',
    grantedAt: Number(row.created_at) || 0,
  }));

  const books: GuestAccessMatrixBookItem[] = (
    (bookGrantsRes.results || []) as Array<{
      book_id: string;
      created_at: number;
      title: string | null;
      shelf: string | null;
      access_mode: string | null;
    }>
  ).map((row) => ({
    bookId: row.book_id,
    bookTitle: row.title || row.book_id,
    shelfName: row.shelf || 'Kho chưa phân loại',
    accessMode:
      row.access_mode === 'restricted'
        ? 'restricted'
        : row.access_mode === 'public'
          ? 'public'
          : 'inherit',
    grantedAt: Number(row.created_at) || 0,
  }));

  const chapters: GuestAccessMatrixChapterItem[] = (
    (chapterGrantsRes.results || []) as Array<{
      book_id: string;
      chapter_key: string;
      created_at: number;
      title: string | null;
      shelf: string | null;
    }>
  ).map((row) => ({
    bookId: row.book_id,
    bookTitle: row.title || row.book_id,
    shelfName: row.shelf || 'Kho chưa phân loại',
    chapterKey: row.chapter_key,
    grantedAt: Number(row.created_at) || 0,
  }));

  const presets: GuestAccessMatrixPresetItem[] = (
    (presetsRes.results || []) as Array<{
      preset_id: string;
      preset_name: string;
    }>
  ).map((row) => ({
    presetId: row.preset_id,
    presetName: row.preset_name,
  }));

  return {
    discordUserId: userId,
    discordUsername: guestRow?.discord_username ?? null,
    isBanned: guestRow?.is_banned === 1,
    strikes: Number(guestRow?.rl_strikes) || 0,
    sessionExpiresAt:
      typeof guestRow?.session_expires_at === 'number' ? guestRow.session_expires_at : null,
    shelves,
    books,
    chapters,
    presets,
    totalGrants: shelves.length + books.length + chapters.length,
  };
}

export async function revokeAllDiscordGuestAccess(
  db: D1Database,
  rawUserId: string,
  rawBody?: unknown,
): Promise<RevokeGuestAllAccessResult> {
  const userId = assertValidDiscordUserId(rawUserId);
  const body =
    rawBody && typeof rawBody === 'object'
      ? (rawBody as { includePresets?: unknown; closeSession?: unknown })
      : null;
  const includePresets = body?.includePresets === true;
  const closeSession = body?.closeSession === true;

  await Promise.all([
    ensureDiscordAccessTable(db),
    ensureShelfAccessTables(db),
    ensureBookChapterAccessTables(db),
    ensureDiscordPresetsTables(db),
  ]);

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM shelf_guest_grants WHERE discord_user_id = ?').bind(userId),
    db.prepare('DELETE FROM book_guest_grants WHERE discord_user_id = ?').bind(userId),
    db.prepare('DELETE FROM chapter_guest_grants WHERE discord_user_id = ?').bind(userId),
  ];
  if (includePresets) {
    stmts.push(
      db.prepare('DELETE FROM discord_access_preset_members WHERE discord_user_id = ?').bind(userId),
    );
  }
  if (closeSession) {
    stmts.push(
      db
        .prepare(
          `UPDATE discord_access
           SET active_session_id = NULL, session_expires_at = NULL, updated_at = ?
           WHERE discord_user_id = ?`,
        )
        .bind(now, userId),
    );
  }

  const results = await db.batch(stmts);
  const removedShelves = Number(results[0]?.meta?.changes ?? 0);
  const removedBooks = Number(results[1]?.meta?.changes ?? 0);
  const removedChapters = Number(results[2]?.meta?.changes ?? 0);
  let idx = 3;
  let removedPresets = 0;
  if (includePresets) {
    removedPresets = Number(results[idx]?.meta?.changes ?? 0);
    idx += 1;
  }
  let sessionClosed = false;
  if (closeSession) {
    sessionClosed = Number(results[idx]?.meta?.changes ?? 0) > 0;
  }

  return {
    ok: true,
    discordUserId: userId,
    removedShelves,
    removedBooks,
    removedChapters,
    removedPresets,
    sessionClosed,
  };
}
