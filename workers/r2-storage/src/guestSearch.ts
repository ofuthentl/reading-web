import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';
import { type Env, isValidId } from './booksDb';
import type { WatermarkBlock, WatermarkInlineSpan } from './forensicWatermark';
import type { GuestBookManifest } from './guestPack';
import { assertGuestBookAccess } from './shelfAccessDb';

const MAX_SEARCH_QUERY_LEN = 80;
const MAX_MATCHED_CHAPTERS = 40;
const SEARCH_BUCKET_COST = 0.5;
const BUCKET_CAPACITY = 10;
const BUCKET_REFILL_PER_MS = 1 / 6000;

interface StoredSearchChapter {
  title: string;
  blocks: WatermarkBlock[];
}

function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd');
}

function spansToPlainText(spans: WatermarkInlineSpan[] | undefined): string {
  if (!spans || spans.length === 0) return '';
  let out = '';
  for (const s of spans) {
    if (s.t) out += s.t;
  }
  return out;
}

function extractChapterPlainText(data: StoredSearchChapter): string {
  const parts: string[] = [];
  if (data.title) parts.push(data.title);
  for (const block of data.blocks || []) {
    if (block.kind === 'h' || block.kind === 'p' || block.kind === 'quote') {
      parts.push(spansToPlainText(block.spans));
    } else if (block.kind === 'list') {
      for (const item of block.items || []) {
        parts.push(spansToPlainText(item));
      }
    }
  }
  return parts.join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle || haystack.length < needle.length) return 0;
  let count = 0;
  let idx = 0;
  while (idx <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count += 1;
    idx = found + needle.length;
  }
  return count;
}

async function consumeGuestSearchQuota(db: D1Database, discordUserId: string): Promise<void> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT rl_tokens, rl_updated_at FROM discord_access WHERE discord_user_id = ?')
    .bind(discordUserId)
    .first<{ rl_tokens: number | null; rl_updated_at: number | null }>();

  const prevTokens =
    typeof row?.rl_tokens === 'number' && Number.isFinite(row.rl_tokens)
      ? row.rl_tokens
      : BUCKET_CAPACITY;
  const prevAt =
    typeof row?.rl_updated_at === 'number' && row.rl_updated_at > 0 ? row.rl_updated_at : now;
  const refilled = Math.min(BUCKET_CAPACITY, prevTokens + Math.max(0, now - prevAt) * BUCKET_REFILL_PER_MS);

  if (refilled < SEARCH_BUCKET_COST) {
    throw new HttpError('Bạn đang tìm kiếm liên tục quá nhanh. Vui lòng đợi vài giây rồi thử lại.', 429);
  }

  await db
    .prepare('UPDATE discord_access SET rl_tokens = ?, rl_updated_at = ? WHERE discord_user_id = ?')
    .bind(refilled - SEARCH_BUCKET_COST, now, discordUserId)
    .run();
}

/**
 * Tìm chương chứa từ khoá cho chế độ Guest (D-028 & D-029):
 * Đọc gói nén nội bộ trên R2 và CHỈ trả về chỉ số chương + số lần khớp (0 đoạn trích văn bản thô).
 */
export async function searchGuestBookChapters(
  env: Env,
  auth: AuthContext,
  bookId: string,
  rawQuery: string | null,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const query = (rawQuery || '').trim().slice(0, MAX_SEARCH_QUERY_LEN);
  if (query.length < 2) {
    throw new HttpError('Từ khoá tìm kiếm cần tối thiểu 2 ký tự.', 400);
  }

  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureDiscordAccessTable(env.DB);
  if (auth.role === 'guest') {
    await consumeGuestSearchQuota(env.DB, auth.userId);
  }

  const row = await env.DB.prepare(
    'SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?',
  )
    .bind(bookId)
    .first<{ pack_key: string; manifest_json: string }>();
  if (!row) {
    throw new HttpError('Sách này chưa có gói dữ liệu tìm kiếm cho chế độ khách.', 404);
  }

  const manifest = JSON.parse(row.manifest_json) as GuestBookManifest;
  const obj = await env.BOOKS_BUCKET.get(row.pack_key);
  if (!obj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);

  const packBytes = new Uint8Array(await obj.arrayBuffer());
  const needleLower = query.toLocaleLowerCase('vi');
  const queryHasDiacritics = stripVietnameseDiacritics(needleLower) !== needleLower;
  const needleAscii = stripVietnameseDiacritics(needleLower);

  const matches: Array<{
    chapterIndex: number;
    chapterNumber: number;
    chapterTitle: string;
    matchCount: number;
  }> = [];

  for (let i = 0; i < manifest.chapters.length; i += 1) {
    const chMeta = manifest.chapters[i];
    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    const parsed = JSON.parse(jsonStr) as StoredSearchChapter;
    const plainLower = extractChapterPlainText(parsed).toLocaleLowerCase('vi');

    let count = countOccurrences(plainLower, needleLower);
    if (count === 0 && !queryHasDiacritics && needleAscii.length >= 2) {
      count = countOccurrences(stripVietnameseDiacritics(plainLower), needleAscii);
    }

    if (count > 0) {
      matches.push({
        chapterIndex: i,
        chapterNumber: i + 1,
        chapterTitle: chMeta.title,
        matchCount: count,
      });
      if (matches.length >= MAX_MATCHED_CHAPTERS) break;
    }
  }

  return { bookId, query, matches };
}
