import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';
import { type Env, isValidId } from './booksDb';
import type { WatermarkBlock, WatermarkInlineSpan } from './forensicWatermark';
import type { GuestBookManifest } from './guestPack';
import { consumeGuestRateToken } from './rateLimitDb';
import { assertGuestBookAccess } from './shelfAccessDb';

const MAX_SEARCH_QUERY_LEN = 80;
const MAX_MATCHED_CHAPTERS = 40;
const MAX_SCAN_CHAPTERS = 250;
const MAX_SCAN_DECOMPRESSED_CHARS = 3_500_000;
const SEARCH_BUCKET_COST = 0.5;

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
  const query = (rawQuery || '').trim().normalize('NFC').slice(0, MAX_SEARCH_QUERY_LEN);
  if (query.length < 2) {
    throw new HttpError('Từ khoá tìm kiếm cần tối thiểu 2 ký tự.', 400);
  }

  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureDiscordAccessTable(env.DB);

  // Kiểm tra sự tồn tại của gói dữ liệu TRƯỚC khi trừ quota tìm kiếm (vá H-2)
  const row = await env.DB.prepare(
    'SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?',
  )
    .bind(bookId)
    .first<{ pack_key: string; manifest_json: string }>();
  if (!row) {
    throw new HttpError('Sách này chưa có gói dữ liệu tìm kiếm cho chế độ khách.', 404);
  }

  if (auth.role === 'guest') {
    await consumeGuestRateToken(env.DB, auth.userId, {
      cost: SEARCH_BUCKET_COST,
      trackStrikes: false,
      tooFastMessage: (waitSec) =>
        `Bạn đang tìm kiếm liên tục quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
    });
  }

  const manifest = JSON.parse(row.manifest_json) as GuestBookManifest;
  const obj = await env.BOOKS_BUCKET.get(row.pack_key);
  if (!obj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);

  const packBytes = new Uint8Array(await obj.arrayBuffer());
  const needleLower = query.toLowerCase();
  const queryHasDiacritics = stripVietnameseDiacritics(needleLower) !== needleLower;
  const needleAscii = stripVietnameseDiacritics(needleLower);

  const matches: Array<{
    chapterIndex: number;
    chapterNumber: number;
    chapterTitle: string;
    matchCount: number;
  }> = [];

  const scanLimit = Math.min(manifest.chapters.length, MAX_SCAN_CHAPTERS);
  let scannedChars = 0;
  let truncated = manifest.chapters.length > MAX_SCAN_CHAPTERS;

  for (let i = 0; i < scanLimit; i += 1) {
    const chMeta = manifest.chapters[i];
    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    scannedChars += jsonStr.length;

    const parsed = JSON.parse(jsonStr) as StoredSearchChapter;
    const plainLower = extractChapterPlainText(parsed).normalize('NFC').toLowerCase();

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

    if (scannedChars >= MAX_SCAN_DECOMPRESSED_CHARS && i + 1 < manifest.chapters.length) {
      truncated = true;
      break;
    }
  }

  return { bookId, query, matches, ...(truncated ? { truncated: true } : {}) };
}
