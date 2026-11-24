import { type AuthContext, HttpError } from './auth';
import { type Env, isValidId } from './booksDb';
import {
  assertGuestBookAccess,
  loadShelfAccessSnapshot,
  toShelfAccessKey,
} from './shelfAccessDb';

export type HighlightColor = 'amber' | 'emerald' | 'sky' | 'rose';

export const VALID_HIGHLIGHT_COLORS = new Set<HighlightColor>([
  'amber',
  'emerald',
  'sky',
  'rose',
]);

export const MAX_HIGHLIGHTS_PER_BOOK = 100;
const MAX_QUOTE_TEXT_LENGTH = 600;
const MAX_NOTE_LENGTH = 400;
const MAX_CHAPTER_TITLE_LENGTH = 200;
const MAX_LOCATOR_JSON_LENGTH = 400;

interface HighlightRow {
  id: string;
  user_scope: string;
  book_id: string;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  quote_text: string;
  note: string | null;
  color: string;
  locator_json: string | null;
  created_at: number;
}

interface HighlightWithBookRow extends HighlightRow {
  book_title: string;
  book_author: string;
  book_shelf: string;
  book_cover_key: string | null;
  book_cover_color: string;
}

const ensuredHighlightsDbs = new WeakSet<D1Database>();

export async function ensureHighlightsTable(db: D1Database): Promise<void> {
  if (ensuredHighlightsDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS book_highlights (
         id TEXT PRIMARY KEY,
         user_scope TEXT NOT NULL,
         book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
         chapter_id TEXT NOT NULL,
         chapter_index INTEGER NOT NULL DEFAULT 0,
         chapter_title TEXT,
         quote_text TEXT NOT NULL,
         note TEXT,
         color TEXT NOT NULL DEFAULT 'amber',
         locator_json TEXT,
         created_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_highlights_user_book
       ON book_highlights(user_scope, book_id, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_highlights_user_created
       ON book_highlights(user_scope, created_at DESC)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_highlights_book_id
       ON book_highlights(book_id)`,
    ),
  ]);
  ensuredHighlightsDbs.add(db);
}

function resolveUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

function generateHighlightId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `hl_${Date.now().toString(36)}_${rand}`;
}

function normalizeColor(raw: unknown): HighlightColor {
  if (typeof raw === 'string' && VALID_HIGHLIGHT_COLORS.has(raw as HighlightColor)) {
    return raw as HighlightColor;
  }
  return 'amber';
}

function parseLocatorSafe(rawJson: string | null): Record<string, unknown> | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function serializeLocatorSafe(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const clean: Record<string, number> = {};
  for (const key of ['blockIndex', 'startOffset', 'endOffset']) {
    const val = candidate[key];
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      clean[key] = Math.floor(val);
    }
  }
  if (typeof candidate.scrollRatio === 'number' && Number.isFinite(candidate.scrollRatio)) {
    clean.scrollRatio = Math.min(1, Math.max(0, Math.round(candidate.scrollRatio * 1000) / 1000));
  }
  if (Object.keys(clean).length === 0) return null;
  const str = JSON.stringify(clean);
  return str.length <= MAX_LOCATOR_JSON_LENGTH ? str : null;
}

function mapHighlightRow(row: HighlightRow) {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    chapterIndex: row.chapter_index,
    ...(row.chapter_title ? { chapterTitle: row.chapter_title } : {}),
    quoteText: row.quote_text,
    note: row.note ?? null,
    color: normalizeColor(row.color),
    locator: parseLocatorSafe(row.locator_json),
    createdAt: row.created_at,
  };
}

export async function listHighlights(
  env: Env,
  auth: AuthContext,
  bookId: string | null,
) {
  await ensureHighlightsTable(env.DB);
  const scope = resolveUserScope(auth);

  if (bookId && bookId.trim()) {
    const trimmedBookId = bookId.trim();
    if (!isValidId(trimmedBookId)) throw new HttpError('ID sách không hợp lệ.', 400);
    await assertGuestBookAccess(env.DB, auth, trimmedBookId);

    const rows = await env.DB.prepare(
      `SELECT * FROM book_highlights
       WHERE user_scope = ? AND book_id = ?
       ORDER BY chapter_index ASC, created_at ASC`,
    )
      .bind(scope, trimmedBookId)
      .all<HighlightRow>();

    return {
      highlights: (rows.results || []).map(mapHighlightRow),
    };
  }

  // Trả toàn bộ Kho trích dẫn của người dùng gom theo sách/bộ (bảo toàn D-030 với kệ restricted)
  const rows = await env.DB.prepare(
    `SELECT h.*, b.title AS book_title, b.author AS book_author, b.shelf AS book_shelf,
            b.cover_key AS book_cover_key, b.cover_color AS book_cover_color
     FROM book_highlights h
     INNER JOIN books b ON b.id = h.book_id
     WHERE h.user_scope = ?
     ORDER BY h.created_at DESC
     LIMIT 500`,
  )
    .bind(scope)
    .all<HighlightWithBookRow>();

  let list = rows.results || [];
  if (auth.role === 'guest' && list.length > 0) {
    const access = await loadShelfAccessSnapshot(env.DB, auth);
    if (access.restrictedKeys.size > 0) {
      list = list.filter((row) => {
        const shelfKey = toShelfAccessKey(row.book_shelf);
        return !access.restrictedKeys.has(shelfKey) || access.allowedRestrictedKeys.has(shelfKey);
      });
    }
  }

  return {
    highlights: list.map((row) => ({
      ...mapHighlightRow(row),
      bookTitle: row.book_title,
      bookAuthor: row.book_author,
      shelf: row.book_shelf,
      coverKey: row.book_cover_key,
      coverColor: row.book_cover_color,
    })),
  };
}

export async function createHighlight(
  env: Env,
  auth: AuthContext,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    bookId?: unknown;
    chapterId?: unknown;
    chapterIndex?: unknown;
    chapterTitle?: unknown;
    quoteText?: unknown;
    note?: unknown;
    color?: unknown;
    locator?: unknown;
  } | null;

  if (!body || typeof body.bookId !== 'string' || !isValidId(body.bookId.trim())) {
    throw new HttpError('ID sách không hợp lệ.', 400);
  }
  if (typeof body.chapterId !== 'string' || !body.chapterId.trim()) {
    throw new HttpError('Thiếu thông tin chương cần lưu trích dẫn.', 400);
  }
  if (typeof body.quoteText !== 'string' || !body.quoteText.trim()) {
    throw new HttpError('Nội dung trích dẫn không được để trống.', 400);
  }

  const bookId = body.bookId.trim();
  const existingBook = await env.DB.prepare('SELECT id FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string }>();
  if (!existingBook) throw new HttpError('Không tìm thấy sách.', 404);

  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureHighlightsTable(env.DB);
  const scope = resolveUserScope(auth);

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM book_highlights WHERE user_scope = ? AND book_id = ?',
  )
    .bind(scope, bookId)
    .first<{ cnt: number }>();
  if (Number(countRow?.cnt ?? 0) >= MAX_HIGHLIGHTS_PER_BOOK) {
    throw new HttpError(
      `Mỗi cuốn sách lưu tối đa ${MAX_HIGHLIGHTS_PER_BOOK} trích dẫn. Hãy xoá bớt trích dẫn cũ.`,
      400,
    );
  }

  const id = generateHighlightId();
  const createdAt = Date.now();
  const chapterId = body.chapterId.trim().slice(0, 120);
  const chapterIndex = Math.max(0, Math.floor(Number(body.chapterIndex ?? 0) || 0));
  const chapterTitle =
    typeof body.chapterTitle === 'string' && body.chapterTitle.trim()
      ? body.chapterTitle.trim().slice(0, MAX_CHAPTER_TITLE_LENGTH)
      : null;
  const quoteText = body.quoteText
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
    .slice(0, MAX_QUOTE_TEXT_LENGTH);
  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().normalize('NFC').slice(0, MAX_NOTE_LENGTH)
      : null;
  const color = normalizeColor(body.color);
  const locatorJson = serializeLocatorSafe(body.locator);

  await env.DB.prepare(
    `INSERT INTO book_highlights
       (id, user_scope, book_id, chapter_id, chapter_index, chapter_title, quote_text, note, color, locator_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      scope,
      bookId,
      chapterId,
      chapterIndex,
      chapterTitle,
      quoteText,
      note,
      color,
      locatorJson,
      createdAt,
    )
    .run();

  return {
    highlight: {
      id,
      bookId,
      chapterId,
      chapterIndex,
      ...(chapterTitle ? { chapterTitle } : {}),
      quoteText,
      note,
      color,
      locator: parseLocatorSafe(locatorJson),
      createdAt,
    },
  };
}

export async function updateHighlight(
  env: Env,
  auth: AuthContext,
  highlightId: string,
  rawBody: unknown,
) {
  if (!isValidId(highlightId)) throw new HttpError('ID trích dẫn không hợp lệ.', 400);
  await ensureHighlightsTable(env.DB);
  const scope = resolveUserScope(auth);

  const existing = await env.DB.prepare(
    'SELECT * FROM book_highlights WHERE id = ? AND user_scope = ?',
  )
    .bind(highlightId, scope)
    .first<HighlightRow>();
  if (!existing) throw new HttpError('Không tìm thấy trích dẫn cần cập nhật.', 404);

  await assertGuestBookAccess(env.DB, auth, existing.book_id);

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as {
    color?: unknown;
    note?: unknown;
  };
  const nextColor = body.color !== undefined ? normalizeColor(body.color) : normalizeColor(existing.color);
  const nextNote =
    body.note === undefined
      ? existing.note
      : typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().normalize('NFC').slice(0, MAX_NOTE_LENGTH)
        : null;

  await env.DB.prepare(
    'UPDATE book_highlights SET color = ?, note = ? WHERE id = ? AND user_scope = ?',
  )
    .bind(nextColor, nextNote, highlightId, scope)
    .run();

  return {
    highlight: {
      ...mapHighlightRow(existing),
      color: nextColor,
      note: nextNote,
    },
  };
}

export async function deleteHighlight(
  env: Env,
  auth: AuthContext,
  highlightId: string,
) {
  if (!isValidId(highlightId)) throw new HttpError('ID trích dẫn không hợp lệ.', 400);
  await ensureHighlightsTable(env.DB);
  const scope = resolveUserScope(auth);

  await env.DB.prepare('DELETE FROM book_highlights WHERE id = ? AND user_scope = ?')
    .bind(highlightId, scope)
    .run();

  return { ok: true, deletedId: highlightId };
}
