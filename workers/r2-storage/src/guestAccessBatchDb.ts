import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';
import {
  ensureBookChapterAccessTables,
  toCanonicalChapterKey,
} from './bookChapterAccessDb';
import { ensureShelfAccessTables, toShelfAccessKey } from './shelfAccessDb';

const MAX_LEGACY_PACK_MEDIA_CACHE = 32;

// Bộ nhớ đệm LRU theo isolate cho các gói guest-pack cũ chưa có trường `media.ch` (bất biến theo `packKey`)
const legacyPackMediaMapCache = new Map<string, Map<number, string[]>>();

export interface GuestBookBatchResult {
  fileKey: string | null;
  packKey: string;
  manifestJson: string;
  lockedChapterKeys: Set<string>;
}

/**
 * Gom toàn bộ kiểm tra phân quyền 3 tầng (sách → kệ → chương) + đọc `file_key` + `book_guest_packs`
 * vào ĐÚNG 1 lượt `db.batch(...)` duy nhất thay vì 5–6 truy vấn D1 tuần tự (QĐ-3A).
 */
export async function loadGuestBookAccessAndPackBatch(
  db: D1Database,
  auth: AuthContext,
  bookId: string,
): Promise<GuestBookBatchResult> {
  if (auth.role === 'owner') {
    await ensureDiscordAccessTable(db);
    const [bookRes, packRes] = await db.batch([
      db.prepare('SELECT shelf, file_key FROM books WHERE id = ?').bind(bookId),
      db
        .prepare('SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?')
        .bind(bookId),
    ]);
    const bookRow = (bookRes.results?.[0] as { shelf: string; file_key: string } | undefined) ?? null;
    const packRow =
      (packRes.results?.[0] as { pack_key: string; manifest_json: string } | undefined) ?? null;
    if (!packRow) {
      throw new HttpError(
        'Sách này chưa bật gói đọc chế độ khách. Hãy nhờ chủ thư viện bấm đồng bộ bảo mật cho sách này.',
        404,
      );
    }
    return {
      fileKey: bookRow?.file_key ?? null,
      packKey: packRow.pack_key,
      manifestJson: packRow.manifest_json,
      lockedChapterKeys: new Set<string>(),
    };
  }

  await Promise.all([
    ensureDiscordAccessTable(db),
    ensureShelfAccessTables(db),
    ensureBookChapterAccessTables(db),
  ]);

  const [
    bookRes,
    bookRuleRes,
    bookGrantRes,
    shelfRulesRes,
    shelfGrantsRes,
    chapterRulesRes,
    chapterGrantsRes,
    packRes,
  ] = await db.batch([
    db.prepare('SELECT shelf, file_key FROM books WHERE id = ?').bind(bookId),
    db.prepare('SELECT access_mode FROM book_access_rules WHERE book_id = ?').bind(bookId),
    db
      .prepare('SELECT 1 AS ok FROM book_guest_grants WHERE book_id = ? AND discord_user_id = ?')
      .bind(bookId, auth.userId),
    db.prepare("SELECT shelf_key FROM shelf_access_rules WHERE access_mode = 'restricted'"),
    db
      .prepare('SELECT shelf_key FROM shelf_guest_grants WHERE discord_user_id = ?')
      .bind(auth.userId),
    db
      .prepare(
        "SELECT chapter_key FROM chapter_access_rules WHERE book_id = ? AND access_mode = 'restricted'",
      )
      .bind(bookId),
    db
      .prepare(
        'SELECT chapter_key FROM chapter_guest_grants WHERE book_id = ? AND discord_user_id = ?',
      )
      .bind(bookId, auth.userId),
    db
      .prepare('SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?')
      .bind(bookId),
  ]);

  const bookRow = (bookRes.results?.[0] as { shelf: string; file_key: string } | undefined) ?? null;
  const bookRule =
    (bookRuleRes.results?.[0] as { access_mode: 'public' | 'restricted' } | undefined) ?? null;
  const bookGrant = (bookGrantRes.results?.[0] as { ok: number } | undefined) ?? null;

  if (bookRow) {
    if (bookRule?.access_mode === 'restricted') {
      if (!bookGrant) {
        throw new HttpError(
          '🔒 Tập sách này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
          403,
        );
      }
    } else if (bookRule?.access_mode !== 'public') {
      const shelfKey = toShelfAccessKey(bookRow.shelf);
      const restrictedShelves = new Set<string>();
      for (const row of (shelfRulesRes.results || []) as Array<{ shelf_key: string }>) {
        if (row.shelf_key) restrictedShelves.add(toShelfAccessKey(row.shelf_key));
      }
      if (restrictedShelves.has(shelfKey)) {
        const allowedShelves = new Set<string>();
        for (const row of (shelfGrantsRes.results || []) as Array<{ shelf_key: string }>) {
          if (row.shelf_key) allowedShelves.add(toShelfAccessKey(row.shelf_key));
        }
        if (!allowedShelves.has(shelfKey)) {
          throw new HttpError(
            '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
            403,
          );
        }
      }
    }
  }

  const packRow =
    (packRes.results?.[0] as { pack_key: string; manifest_json: string } | undefined) ?? null;
  if (!packRow) {
    throw new HttpError(
      'Sách này chưa bật gói đọc chế độ khách. Hãy nhờ chủ thư viện bấm đồng bộ bảo mật cho sách này.',
      404,
    );
  }

  const lockedChapterKeys = new Set<string>();
  for (const row of (chapterRulesRes.results || []) as Array<{ chapter_key: string }>) {
    const key = toCanonicalChapterKey(row.chapter_key);
    if (key) lockedChapterKeys.add(key);
  }
  if (lockedChapterKeys.size > 0) {
    for (const row of (chapterGrantsRes.results || []) as Array<{ chapter_key: string }>) {
      const key = toCanonicalChapterKey(row.chapter_key);
      if (key) lockedChapterKeys.delete(key);
    }
  }

  return {
    fileKey: bookRow?.file_key ?? null,
    packKey: packRow.pack_key,
    manifestJson: packRow.manifest_json,
    lockedChapterKeys,
  };
}

async function getOrBuildLegacyPackMediaMap(
  bucket: R2Bucket,
  packKey: string,
  chapters: readonly { id: string; offset: number; length: number }[],
): Promise<Map<number, string[]>> {
  const cached = legacyPackMediaMapCache.get(packKey);
  if (cached) {
    // Làm mới vị trí LRU
    legacyPackMediaMapCache.delete(packKey);
    legacyPackMediaMapCache.set(packKey, cached);
    return cached;
  }

  const packObj = await bucket.get(packKey);
  if (!packObj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);
  const packBytes = new Uint8Array(await packObj.arrayBuffer());

  const mediaToChapters = new Map<number, Set<string>>();
  for (const chMeta of chapters) {
    const canonicalKey = toCanonicalChapterKey(chMeta.id);
    if (!canonicalKey) continue;
    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    const parsed = JSON.parse(jsonStr) as { blocks?: Array<{ kind?: string; mediaIndex?: number }> };
    for (const block of parsed.blocks || []) {
      if (block.kind === 'img' && typeof block.mediaIndex === 'number') {
        let set = mediaToChapters.get(block.mediaIndex);
        if (!set) {
          set = new Set<string>();
          mediaToChapters.set(block.mediaIndex, set);
        }
        set.add(canonicalKey);
      }
    }
  }

  const normalizedMap = new Map<number, string[]>();
  for (const [idx, keySet] of mediaToChapters.entries()) {
    normalizedMap.set(idx, Array.from(keySet));
  }

  if (legacyPackMediaMapCache.size >= MAX_LEGACY_PACK_MEDIA_CACHE) {
    const oldestKey = legacyPackMediaMapCache.keys().next().value;
    if (oldestKey !== undefined) legacyPackMediaMapCache.delete(oldestKey);
  }
  legacyPackMediaMapCache.set(packKey, normalizedMap);
  return normalizedMap;
}

/**
 * Kiểm tra quyền truy cập ảnh minh hoạ trong sách có chương bị khoá (QĐ-3A):
 * - Gói mới có `media.ch`: kiểm tra tức thì O(1), 0 lượt đọc R2.
 * - Gói cũ chưa có `media.ch`: quét 1 lần duy nhất và lưu cache LRU theo `packKey` bất biến.
 */
export async function assertGuestMediaInUnlockedChaptersFast(
  bucket: R2Bucket,
  packKey: string,
  chapters: readonly { id: string; offset: number; length: number }[],
  mediaIndex: number,
  mediaChapterKeys: readonly string[] | undefined,
  lockedChapterKeys: ReadonlySet<string>,
): Promise<void> {
  if (lockedChapterKeys.size === 0) return;
  const hasAnyLockedInManifest = chapters.some((ch) =>
    lockedChapterKeys.has(toCanonicalChapterKey(ch.id)),
  );
  if (!hasAnyLockedInManifest) return;

  if (Array.isArray(mediaChapterKeys) && mediaChapterKeys.length > 0) {
    const isUnlocked = mediaChapterKeys.some(
      (k) => !lockedChapterKeys.has(toCanonicalChapterKey(k)),
    );
    if (isUnlocked) return;
    throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
  }

  const hasAnyUnlockedChapter = chapters.some(
    (ch) => !lockedChapterKeys.has(toCanonicalChapterKey(ch.id)),
  );
  if (!hasAnyUnlockedChapter) {
    throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
  }

  const mediaMap = await getOrBuildLegacyPackMediaMap(bucket, packKey, chapters);
  const mappedChapters = mediaMap.get(mediaIndex);
  if (mappedChapters && mappedChapters.some((k) => !lockedChapterKeys.has(k))) {
    return;
  }

  throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
}
