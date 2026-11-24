import { type AuthContext, HttpError, ensureDiscordAccessTable } from './auth';
import { type Env, isValidId } from './booksDb';
import type { WatermarkBlock } from './forensicWatermark';
import type { GuestBookManifest } from './guestPack';
import { consumeGuestRateToken } from './rateLimitDb';
import { assertGuestBookAccess } from './shelfAccessDb';

const MAX_SCAN_CHAPTERS = 400;
const MAX_SCAN_DECOMPRESSED_CHARS = 5_000_000;
const MAX_ILLUSTRATION_ITEMS = 500;
const GALLERY_INDEX_BUCKET_COST = 0.25;

interface StoredGalleryChapter {
  title?: string;
  blocks?: WatermarkBlock[];
}

export interface GuestBookIllustrationItem {
  mediaIndex: number;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  alt: string | null;
}

/**
 * Quét chỉ mục ảnh minh hoạ trực tiếp từ gói `guest-packs/<bookId>.pack` sẵn có (D-036 Mục 2):
 * Hoạt động ngay với toàn bộ 263 cuốn sách cũ mà không cần đóng gói lại (`0` re-pack).
 */
export async function getGuestBookIllustrations(
  env: Env,
  auth: AuthContext,
  bookId: string,
): Promise<{ bookId: string; illustrations: GuestBookIllustrationItem[]; truncated?: boolean }> {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  await assertGuestBookAccess(env.DB, auth, bookId);
  await ensureDiscordAccessTable(env.DB);

  const row = await env.DB.prepare(
    'SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?',
  )
    .bind(bookId)
    .first<{ pack_key: string; manifest_json: string }>();

  if (!row) {
    throw new HttpError('Sách này chưa có gói bảo mật chế độ khách.', 404);
  }

  const manifest = JSON.parse(row.manifest_json) as GuestBookManifest;
  if (!Array.isArray(manifest.media) || manifest.media.length === 0) {
    return { bookId, illustrations: [] };
  }

  if (auth.role === 'guest') {
    await consumeGuestRateToken(env.DB, auth.userId, {
      cost: GALLERY_INDEX_BUCKET_COST,
      trackStrikes: true,
      tooFastMessage: (waitSec) =>
        `Bạn đang mở danh sách minh hoạ quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
    });
  }

  const obj = await env.BOOKS_BUCKET.get(row.pack_key);
  if (!obj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);

  const packBytes = new Uint8Array(await obj.arrayBuffer());
  const illustrations: GuestBookIllustrationItem[] = [];
  const seenMedia = new Set<number>();

  const scanLimit = Math.min(manifest.chapters.length, MAX_SCAN_CHAPTERS);
  let scannedChars = 0;
  let truncated = manifest.chapters.length > MAX_SCAN_CHAPTERS;

  for (let i = 0; i < scanLimit; i += 1) {
    const chMeta = manifest.chapters[i];
    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    scannedChars += jsonStr.length;

    const parsed = JSON.parse(jsonStr) as StoredGalleryChapter;
    for (const block of parsed.blocks || []) {
      if (block.kind !== 'img') continue;
      if (
        typeof block.mediaIndex !== 'number' ||
        block.mediaIndex < 0 ||
        block.mediaIndex >= manifest.media.length
      ) {
        continue;
      }
      if (seenMedia.has(block.mediaIndex)) continue;
      seenMedia.add(block.mediaIndex);

      illustrations.push({
        mediaIndex: block.mediaIndex,
        chapterIndex: i,
        chapterNumber: i + 1,
        chapterTitle: chMeta.title,
        alt: typeof block.alt === 'string' && block.alt.trim() ? block.alt.trim().slice(0, 140) : null,
      });

      if (illustrations.length >= MAX_ILLUSTRATION_ITEMS) {
        truncated = true;
        break;
      }
    }

    if (illustrations.length >= MAX_ILLUSTRATION_ITEMS) break;
    if (scannedChars >= MAX_SCAN_DECOMPRESSED_CHARS && i + 1 < manifest.chapters.length) {
      truncated = true;
      break;
    }
  }

  return {
    bookId,
    illustrations,
    ...(truncated ? { truncated: true } : {}),
  };
}
