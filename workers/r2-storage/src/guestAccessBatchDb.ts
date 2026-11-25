import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';
import {
  ensureBookChapterAccessTables,
  toCanonicalChapterKey,
} from './bookChapterAccessDb';
import { ensureShelfAccessTables, toShelfAccessKey } from './shelfAccessDb';

const MAX_LEGACY_PACK_MEDIA_CACHE = 32;
const MAX_LEGACY_SCAN_CHAPTERS = 250;
const MAX_LEGACY_SCAN_DECOMPRESSED_CHARS = 3_500_000;

// Bộ nhớ đệm LRU + single-flight theo isolate cho gói guest-pack cũ chưa có trường `media.ch`
// Khoá cache gắn kèm tập chương khoá thực tế để chỉ giải nén chương đang mở và không lệch quyền giữa 2 khách
const legacyPackUnlockedMediaCache = new Map<string, Set<number>>();
const inFlightLegacyPackMap = new Map<string, Promise<Set<number>>>();

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
    if (!bookRow) {
      throw new HttpError('Không tìm thấy sách.', 404);
    }
    const packRow =
      (packRes.results?.[0] as { pack_key: string; manifest_json: string } | undefined) ?? null;
    if (!packRow) {
      throw new HttpError(
        'Sách này chưa bật gói đọc chế độ khách. Hãy nhờ chủ thư viện bấm đồng bộ bảo mật cho sách này.',
        404,
      );
    }
    return {
      fileKey: bookRow.file_key ?? null,
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
  if (!bookRow) {
    throw new HttpError('Không tìm thấy sách.', 404);
  }
  const bookRule =
    (bookRuleRes.results?.[0] as { access_mode: 'public' | 'restricted' } | undefined) ?? null;
  const bookGrant = (bookGrantRes.results?.[0] as { ok: number } | undefined) ?? null;

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
    fileKey: bookRow.file_key ?? null,
    packKey: packRow.pack_key,
    manifestJson: packRow.manifest_json,
    lockedChapterKeys,
  };
}

async function buildLegacyUnlockedMediaSet(
  bucket: R2Bucket,
  packKey: string,
  cacheKey: string,
  chapters: readonly { id: string; offset: number; length: number }[],
  lockedChapterKeys: ReadonlySet<string>,
): Promise<Set<number>> {
  const packObj = await bucket.get(packKey);
  if (!packObj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);
  const packBytes = new Uint8Array(await packObj.arrayBuffer());

  const unlockedMedia = new Set<number>();
  let scannedChapters = 0;
  let scannedChars = 0;

  for (const chMeta of chapters) {
    const canonicalKey = toCanonicalChapterKey(chMeta.id);
    // Bỏ qua giải nén các chương đang khoá để tiết kiệm CPU Free Tier
    if (canonicalKey && lockedChapterKeys.has(canonicalKey)) continue;
    if (scannedChapters >= MAX_LEGACY_SCAN_CHAPTERS) break;
    if (
      chMeta.offset < 0 ||
      chMeta.length <= 0 ||
      chMeta.offset + chMeta.length > packBytes.byteLength
    ) {
      continue;
    }

    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    scannedChapters += 1;
    scannedChars += jsonStr.length;

    // Đường nhanh: chỉ JSON.parse các chương thực sự có khối ảnh minh hoạ
    if (jsonStr.includes('"mediaIndex"')) {
      const parsed = JSON.parse(jsonStr) as {
        blocks?: Array<{ kind?: string; mediaIndex?: number }>;
      };
      for (const block of parsed.blocks || []) {
        if (block.kind === 'img' && typeof block.mediaIndex === 'number') {
          unlockedMedia.add(block.mediaIndex);
        }
      }
    }

    if (scannedChars >= MAX_LEGACY_SCAN_DECOMPRESSED_CHARS) break;
  }

  if (legacyPackUnlockedMediaCache.size >= MAX_LEGACY_PACK_MEDIA_CACHE) {
    const oldestKey = legacyPackUnlockedMediaCache.keys().next().value;
    if (oldestKey !== undefined) legacyPackUnlockedMediaCache.delete(oldestKey);
  }
  legacyPackUnlockedMediaCache.set(cacheKey, unlockedMedia);
  return unlockedMedia;
}

async function getOrBuildLegacyUnlockedMediaSet(
  bucket: R2Bucket,
  packKey: string,
  chapters: readonly { id: string; offset: number; length: number }[],
  lockedChapterKeys: ReadonlySet<string>,
  effectiveLockedKeys: readonly string[],
): Promise<Set<number>> {
  const cacheKey = `${packKey}\0${effectiveLockedKeys.join('\0')}`;
  const cached = legacyPackUnlockedMediaCache.get(cacheKey);
  if (cached) {
    // Làm mới vị trí LRU
    legacyPackUnlockedMediaCache.delete(cacheKey);
    legacyPackUnlockedMediaCache.set(cacheKey, cached);
    return cached;
  }

  const inFlight = inFlightLegacyPackMap.get(cacheKey);
  if (inFlight) return inFlight;

  const task = buildLegacyUnlockedMediaSet(
    bucket,
    packKey,
    cacheKey,
    chapters,
    lockedChapterKeys,
  ).finally(() => {
    inFlightLegacyPackMap.delete(cacheKey);
  });
  inFlightLegacyPackMap.set(cacheKey, task);
  return task;
}

/**
 * Kiểm tra quyền truy cập ảnh minh hoạ trong sách có chương bị khoá (QĐ-3A):
 * - Gói mới có `media.ch`: kiểm tra tức thì O(1), 0 lượt đọc R2.
 * - Gói cũ chưa có `media.ch`: single-flight + LRU theo `(packKey, lockedKeys)`, chỉ giải nén chương mở trong ngưỡng an toàn.
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
  const effectiveLockedSet = new Set<string>();
  let hasAnyUnlockedChapter = false;
  for (const ch of chapters) {
    const canonical = toCanonicalChapterKey(ch.id);
    if (canonical && lockedChapterKeys.has(canonical)) {
      effectiveLockedSet.add(canonical);
    } else {
      hasAnyUnlockedChapter = true;
    }
  }
  if (effectiveLockedSet.size === 0) return;

  if (Array.isArray(mediaChapterKeys) && mediaChapterKeys.length > 0) {
    const isUnlocked = mediaChapterKeys.some(
      (k) => !lockedChapterKeys.has(toCanonicalChapterKey(k)),
    );
    if (isUnlocked) return;
    throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
  }

  if (!hasAnyUnlockedChapter) {
    throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
  }

  const effectiveLockedKeys = Array.from(effectiveLockedSet).sort();
  const unlockedMedia = await getOrBuildLegacyUnlockedMediaSet(
    bucket,
    packKey,
    chapters,
    lockedChapterKeys,
    effectiveLockedKeys,
  );
  if (unlockedMedia.has(mediaIndex)) {
    return;
  }

  throw new HttpError('🔒 Ảnh minh hoạ này thuộc chương bị khoá.', 403);
}
